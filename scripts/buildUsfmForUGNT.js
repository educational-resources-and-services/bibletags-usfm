const fs = require('fs').promises
const { normalizeGreek } = require('./utils')

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

      try {
        const oldOutputUsfm = await fs.readFile(`${outputUsfmDir}/${path.split('/').pop()}`, { encoding: `utf8` })

        // TODO

      } catch(e) {}

      // load and slice up source usfm
      const sourceUsfm = await fs.readFile(path, { encoding: `utf8` })
      const usfmPieces = sourceUsfm.split(/(\\[cv] [0-9]+)/g)
      
      const usfmByLoc = {}
      const book = parseInt(path.match(/\/([0-9]{2})-\w{3}.usfm$/)[1], 10) - 1
      let chapter
      let loc = '0'  // loc of `0` for content prior to verse 1

      usfmPieces.forEach(piece => {
        if(/^\\c [0-9]+$/.test(piece)) {
          chapter = `00${piece.match(/^\\c ([0-9]+)$/)[1]}`.slice(-3)
        } else if(/\\v [0-9]+/.test(piece)) {
          const verse = `00${piece.match(/^\\v ([0-9]+)$/)[1]}`.slice(-3)
          loc = `${book}${chapter}${verse}`
        }
        usfmByLoc[loc] = (usfmByLoc[loc] || ``) + piece
      })

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
        // const criticalOrAncient = /\/0G[^\/]*\.txt$/.test(path) ? `critical` : `ancient`
        const apparatusJson = {
          words: [],
          critical: [],
          ancient: [],
        }
        dataByLoc[loc] = apparatusJson
      }

      let outputUsfm = ``

      Object.keys(usfmByLoc).sort().forEach(loc => {

        // insert apparatus tags into USFM
        let verseUsfmPieces = usfmByLoc[loc].split(/(\\w\*.*?\n)/g)
        if(verseUsfmPieces.length > 1) {
          verseUsfmPieces[verseUsfmPieces.length - 2] += `\\zApparatusJson ${JSON.stringify(dataByLoc[loc])}\\zApparatusJson*\n`
        }

        // add x-id attribute into USFM, updating id dictionary and outputting issues when relevant
        verseUsfmPieces = verseUsfmPieces.map(piece => {
          const id = `${loc.slice(0, 2)}${`???`}`
          return piece.replace(/\\w\*/, ` x-id="${id}"\\w*`)
        })

        outputUsfm += verseUsfmPieces.join('')
      })

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

  }

  process.exit()

})()