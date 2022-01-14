const fs = require('fs').promises
const { normalizeGreek, getWordKey, getRandomId, getUsfmByLoc } = require('./utils')

const transcriptionsDir = './cntr/transcriptions'
const outputUsfmDir = './usfm/ugnt'

;(async () => {

  try {

    const [
      ugntDir,
      addedTranscriptionsDir,
    ] = process.argv.slice(2)

    if(!ugntDir) throw `Missing ugntDir parameter.`

    console.log(`\nSTARTING...\n`)

    const ugntPaths = (await fs.readdir(ugntDir)).filter(file => file.match(/^[0-9]{2}-\w{3}\.usfm$/)).map(file => `${ugntDir}/${file}`)

    if(ugntPaths.length !== 27) throw `Invalid ugntDir parameter.`

    const transcriptionPaths = (await fs.readdir(transcriptionsDir)).filter(path => path.match(/^[0-9]G.*\.txt$/)).map(file => `${transcriptionsDir}/${file}`)
    const addedTranscriptionPaths = addedTranscriptionsDir ? (await fs.readdir(transcriptionsDir)).map(file => `${transcriptionsDir}/${file}`) : []
    const allTranscriptionPaths = [ ...transcriptionPaths, ...addedTranscriptionPaths ]

    const dataByLoc = {}

    // load transcriptions words array into JSON obj keyed to loc
    for(let path of allTranscriptionPaths) {

      const transcriptions = await fs.readFile(path, { encoding: `utf8` })
      const lines = transcriptions.split(/\n/g)

      lines.forEach(line => {
        const [ x, loc, content ] = line.match(/^(.*?) (.*)$/) || []
        if(!x) {
          if(line) console.log(`Bad line: ${line}`)
          return
        }
        const words = normalizeGreek(content).split(" ")
        const source = path.match(/\/([0-9]G[^\/]*)\.txt$/)[1]
        dataByLoc[loc] = {
          wordsBySource: {
            ...((dataByLoc[loc] || {}).wordsBySource || {}),
            [source]: words,
          },
        }
      })

    }

    // for each USFM file (i.e. book of the Bible)
    for(let path of ugntPaths) {

      // build id dictionary from existing file in outputUsfmDir to ensure continuity of id's
      const idDictionary = {}
      const idTakenMap = {}
      let isUpdateOfExistingFiles = false

      try {
        const oldOutputUsfm = await fs.readFile(`${outputUsfmDir}/${path.split('/').pop()}`, { encoding: `utf8` })
        const oldUsfmByLoc = getUsfmByLoc(oldOutputUsfm)

        for(let loc in oldUsfmByLoc) {
          let wordNum = 1
          ;(oldUsfmByLoc[loc].match(/\\w .*?\\w\*/g) || []).forEach(wordUsfm => {
            const [ x, id ] = wordUsfm.match(/x-id="([^"]*)"/) || []
            if(id) {
              const wordKey = getWordKey({ wordUsfm, loc, wordNum, version: `UGNT` })
              wordNum++
              idDictionary[wordKey] = id
              isUpdateOfExistingFiles = true
            }
          })
        }

        Object.values(idDictionary).forEach(id => {
          idTakenMap[id] = true
        })

      } catch(e) {
        if(!/^ENOENT: no such file or directory/.test(e.message)) throw e
      }

      // load and slice up source usfm
      const sourceUsfm = await fs.readFile(path, { encoding: `utf8` })
      const usfmByLoc = getUsfmByLoc(sourceUsfm)

      // add ugnt words array to dataByLoc
      for(let loc in usfmByLoc) {

        const words = (usfmByLoc[loc].match(/\\w .*?\\w\*/g) || []).map(w => normalizeGreek(w.match(/\\w ([^|\\]*)/)[1]))
        if(words.length === 0 && loc !== '0') throw `Invalid verse in source USFM: ${loc} // ${usfmByLoc[loc]}`

        dataByLoc[loc] = {
          wordsBySource: {
            ...((dataByLoc[loc] || {}).wordsBySource || {}),
            UGNT: words,
          },
        }
      }

      // build apparatus data verse-by-verse
      for(let loc in dataByLoc) {
        if(!usfmByLoc[loc]) continue
        // const criticalOrAncient = /\/0G[^\/]*\.txt$/.test(path) ? `critical` : `ancient`
        let variantWords = []
        const ugntWords = dataByLoc[loc].wordsBySource.UGNT || []
        for(let version in dataByLoc[loc].wordsBySource) {
          if(version === 'UGNT') continue

          const wordsInThisVersion = dataByLoc[loc].wordsBySource[version]
          variantWords.push(...wordsInThisVersion.filter(word => !ugntWords.includes(word)))
        }

        variantWords = [ ...new Set(variantWords) ]

        const apparatusJson = {
          words: variantWords,
          critical: [],
          ancient: [],
        }
        dataByLoc[loc] = apparatusJson
      }

      let outputUsfm = ``

      Object.keys(usfmByLoc).sort().forEach(loc => {

        // insert apparatus tags into USFM
        let verseUsfmPieces = usfmByLoc[loc].split(/(\\w .*?\\w\*.*?\n)/g)
        if(verseUsfmPieces.length > 1) {
          verseUsfmPieces[verseUsfmPieces.length - 2] += `\\zApparatusJson ${JSON.stringify(dataByLoc[loc])}\\zApparatusJson*\n`
        }

        // add x-id attribute into USFM, updating id dictionary and outputting issues when relevant
        let wordNum = 1
        verseUsfmPieces = verseUsfmPieces.map(piece => {

          const [ wordUsfm ] = piece.match(/\\w .*?\\w\*/) || []

          if(wordUsfm) {

            const wordKey = getWordKey({ wordUsfm, loc, wordNum, version: `UGNT` })
            wordNum++

            let id = idDictionary[wordKey]

            if(!id) {
              while(!id || idTakenMap[id]) {
                id = `${loc.slice(0, 2)}${getRandomId()}`
              }
              idTakenMap[id] = true
              idDictionary[wordKey] = id
              if(isUpdateOfExistingFiles) {
                console.log(`New id created: ${id} => ${wordKey}`)
              }
            }

            piece = piece.replace(/\\w\*/, ` x-id="${id}"\\w*`)
          }

          return piece
        })

        outputUsfm += verseUsfmPieces.join('')
      })

      // double-check that id's are unique
      const idValues = Object.values(idDictionary)
      if(idValues.length !== [ ...new Set(idValues) ].length) throw `Multiple words have the same id!`

      // write the file
      const outputFilename = path.split('/').pop()
      console.log(`Writing ${outputFilename}...`)
      await fs.writeFile(`${outputUsfmDir}/${outputFilename}`, outputUsfm)

    }
        
    console.log(`\nCOMPLETED.\n`)

  } catch(err) {

    console.log(``)
    console.log(`***********************`)
    console.log(``)
    console.log(`ERROR: ${err.message || err}`)
    console.log(``)
    console.log(`***********************`)
    console.log(``)
    console.log(`Syntax: \`npm run build-usfm-for-ugnt [ugntDir] [addedTranscriptionsDir]\`\n`)
    console.log(`Example #1: \`npm run build-usfm-for-ugnt ../el-x-koine_ugnt\``)
    console.log(`Example #2: \`npm run build-usfm-for-ugnt ../el-x-koine_ugnt ../other/transcriptions\``)
    console.log(``)
    console.log(`Note #1: \`ugntDir\` should point to your local clone of the unfoldingword.org/uhb repo.`)
    console.log(`Note #2: \`addedTranscriptionsDir\` (if included) should contain TXT files like those in /cntr/transcriptions.`)
    console.log(``)

    if(typeof err !== 'string') throw err

  }

  process.exit()

})()