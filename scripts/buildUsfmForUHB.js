const fs = require('fs').promises
const { getWordKey, getVariantWordKey, getRandomId, getUsfmByLoc, getReading } = require('./utils')

const outputUsfmDir = './usfm/uhb'

;(async () => {

  try {

    const [
      uhbDir,
    ] = process.argv.slice(2)

    if(!uhbDir) throw `Missing uhbDir parameter.`

    console.log(``)
    console.log(`STARTING...`)
    console.log(``)

    const uhbPaths = (await fs.readdir(uhbDir)).filter(file => file.match(/^[0-9]{2}-\w{3}\.usfm$/)).map(file => `${uhbDir}/${file}`)

    if(uhbPaths.length !== 39) throw `Invalid uhbDir parameter.`

    const dataByLoc = {}

    // for each USFM file (i.e. book of the Bible)
    for(let path of uhbPaths) {

      // build id dictionary from existing file in outputUsfmDir to ensure continuity of id's
      const idDictionary = {}
      const idTakenMap = {}
      let isUpdateOfExistingFiles = false

      try {
        const oldOutputUsfm = await fs.readFile(`${outputUsfmDir}/${path.split('/').pop()}`, { encoding: `utf8` })
        const oldUsfmByLoc = getUsfmByLoc(oldOutputUsfm)

        for(let loc in oldUsfmByLoc) {
          let wordNum = 1
          const idsInThisVerse = []
          ;(oldUsfmByLoc[loc].match(/\\w .*?\\w\*/g) || []).forEach(wordUsfm => {
            const [ x, id ] = wordUsfm.match(/x-id="([^"]*)"/) || []
            if(id) {
              const wordKey = getWordKey({ wordUsfm, loc, wordNum, version: `UHB` })
              wordNum++
              if(!idsInThisVerse.includes(id)) {
                idDictionary[wordKey] = id
                idsInThisVerse.push(id)
              }
              isUpdateOfExistingFiles = true
            }
          })
          const apparatusJson = JSON.parse((oldUsfmByLoc[loc].match(/\\zApparatusJson (.*?)\\zApparatusJson\*/) || [])[1] || "null")
          if(apparatusJson) {
            apparatusJson.words.forEach(({ w, id, lemma, strong, morph }, idx) => {
              if(id) {
                const wordKey = getVariantWordKey({
                  w,
                  loc,
                  lemma,
                  strong,
                  morph,
                  occurrenceInVariants: apparatusJson.words.slice(0, idx).filter(variantWord => variantWord.w === w).length + 1,
                })
                wordNum++
                if(!idsInThisVerse.includes(id)) {
                  idDictionary[wordKey] = id
                  idsInThisVerse.push(id)
                }
                isUpdateOfExistingFiles = true
              }
            })
          }
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

      const getId = params => {
        const wordKey = getWordKey(params)
        const variantWordKey = params.w ? getVariantWordKey(params) : null

        let id = idDictionary[wordKey] || idDictionary[variantWordKey]

        if(!id) {
          while(!id || idTakenMap[id]) {
            id = `${params.loc.slice(0, 2)}${getRandomId()}`
          }
          idTakenMap[id] = true
          idDictionary[wordKey] = id
          if(isUpdateOfExistingFiles) {
            console.log(`New id created: ${id} => ${wordKey}`)
          }
        }

        return id
      }

      for(let loc in usfmByLoc) {

        let verseUsfmPieces = usfmByLoc[loc].split(/(\\w .*?\\w\*|\\f .*?\\f\*\n?)/g)
        const wordObjs = []

        // add x-id attribute into USFM, updating id dictionary and outputting issues when relevant
        let wordNum = 0
        verseUsfmPieces = verseUsfmPieces.map(piece => {

          const [ wordUsfm ] = piece.match(/\\w .*?\\w\*/) || []
          const [ footnoteUsfm ] = piece.match(/\\f .*?\\f\*/) || []
          const [ wordFootnoteUsfm, qOrK ] = piece.match(/\\f \+ \\ft ([QK]) \\\+w .*?\\\+w\*\\f\*\n?/) || []
          
          if(wordFootnoteUsfm) {

            const [ x0, w ] = wordFootnoteUsfm.match(/\\\+w (.*?)\|/) || []
            const [ x1, lemma ] = wordFootnoteUsfm.match(/lemma="([^"]*)"/) || []
            const [ x2, strong ] = wordFootnoteUsfm.match(/strong="([^"]*)"/) || []
            const [ x3, morph ] = wordFootnoteUsfm.match(/x-morph="([^"]*)"/) || []
            const id = getId({
              loc,
              wordUsfm: wordFootnoteUsfm,
              wordNum,
              version: `UHB`,
              w,
              lemma,
              strong,
              morph,
              occurrenceInVariants: ((dataByLoc[loc] || {}).words || []).filter(variantWord => variantWord.w === w).length + 1,
            })

            if(!dataByLoc[loc]) {
              dataByLoc[loc] = {
                words: [],
                altReadingsForQ: [],
                altReadingsForK: [],
                ancient: [],
              }
            }

            if(dataByLoc[loc][`altReadingsFor${qOrK}`].some(altReading => altReading.wordNum === wordNum)) throw `Two word footnotes in a row: ${loc}`

            dataByLoc[loc].words.push({
              w,
              id,
              lemma,
              strong,
              morph,
            })

            dataByLoc[loc][`altReadingsFor${qOrK}`].push({ wordNum, altWordNum: dataByLoc[loc].words.length })

            piece = ``

          } else if(wordUsfm) {

            wordNum++
            const id = getId({ wordUsfm, loc, wordNum, version: `UHB` })

            piece = piece.replace(/(\\w\*)/, ` x-id="${id}"$1`)

          } else if(footnoteUsfm) {

            console.log(`** Non-word footnote: ${footnoteUsfm}`)

          }

          return piece
        })

        if(dataByLoc[loc]) {
          dataByLoc[loc].critical = []
          ;[ 'Q', 'K' ].forEach(qOrK => {
            const readingRaw = Array(wordNum).fill().map((x, idx) => {
              const { altWordNum } = dataByLoc[loc][`altReadingsFor${qOrK}`].find(altReading => altReading.wordNum === idx+1) || {}
              return altWordNum ? `+${altWordNum}` : `${idx+1}`
            })
            const reading = getReading({ readingRaw, lastWordNum: wordNum })
            dataByLoc[loc].critical.push(reading ? `${qOrK}:${reading}` : qOrK)
            delete dataByLoc[loc][`altReadingsFor${qOrK}`]
          })
        }
  
        usfmByLoc[loc] = verseUsfmPieces.join('')

      }

      // double-check that id's are unique
      const idValues = Object.values(idDictionary)
      if(idValues.length !== [ ...new Set(idValues) ].length) throw `Multiple words have the same id!`

      let outputUsfm = ``

      Object.keys(usfmByLoc).sort().forEach(loc => {

        // insert apparatus tags into USFM
        let verseUsfmPieces = usfmByLoc[loc].split(/(\\w .*?\\w\*.*?\n)/g)
        if(verseUsfmPieces.length > 1 && dataByLoc[loc]) {
          verseUsfmPieces[verseUsfmPieces.length - 2] += `\\zApparatusJson ${JSON.stringify(dataByLoc[loc])}\\zApparatusJson*\n`
        }

        outputUsfm += verseUsfmPieces.join('')
      })

      // write the file
      const outputFilename = path.split('/').pop()
      console.log(`Writing ${outputFilename}...`)
      await fs.writeFile(`${outputUsfmDir}/${outputFilename}`, outputUsfm)

    }
        
    console.log(``)
    console.log(`COMPLETED.`)
    console.log(``)

  } catch(err) {

    console.log(``)
    console.log(`***********************`)
    console.log(``)
    console.log(`ERROR: ${err.message || err}`)
    console.log(``)
    console.log(`***********************`)
    console.log(``)
    console.log(`Syntax: \`npm run build-usfm-for-uhb [uhbDir]\`\n`)
    console.log(`Example #1: \`npm run build-usfm-for-uhb ../hbo_uhb\``)
    console.log(``)
    console.log(`Note #1: \`uhbDir\` should point to your local clone of the unfoldingword.org/uhb repo.`)
    console.log(``)

    if(typeof err !== 'string') throw err

  }

  process.exit()

})()


// check 06009007, Ez 45:14
// multiple words per footnote
  // \f + \ft Or perhaps \+w כל|lemma="כֹּל" strong="H3605" x-morph="He,Ncmsc" x-id="12Evk"\+w*־\+w נביא|lemma="נָבִיא" strong="H5030" x-morph="He,Ncmsa"\+w* \+w וכל|lemma="כֹּל" strong="c:H3605" x-morph="He,C:Ncmsc"\+w*־\+w חזה|lemma="חֹזֶה" strong="H2374" x-morph="He,Ncmsa"\+w*\f*

// example of "Or perhaps" and the like
  // \f + \ft Or perhaps \+w וַתָּבֹא|lemma="בּוֹא" strong="c:H0935" x-morph="He,C:Vqw3fs" x-id="08Ua4"\+w*\f*
  // \f + \ft \+w ו⁠תתגעש|lemma="גָּעַשׁ" strong="c:H1607" x-morph="He,C:Vtw3fs" x-id="10YfK"\+w* some manuscripts read\f*
  // \f + \ft Some manuscripts read \+w ו⁠יבאו|lemma="בּוֹא" strong="c:H0935" x-morph="He,C:Vqw3mp" x-id="114RS"\+w*\f*
  // \f + \ft or perhaps \+w אִתּוֹ|lemma="אֵת" strong="H0854" x-morph="He,R:Sp3ms" x-id="12KMd"\+w* \ft (some Hebrew manuscripts)\f*
  // \f + \ft Or perhaps \+w אֶחָ֗ד|lemma="אֶחָד" strong="H0259" x-morph="He,Acmsa" x-id="13lVO"\+w* (see above)\f*
  // \f + \ft or perhaps Niphal \+w הֲ⁠נִשְׁמַ֗ע|lemma="שָׁמַע" strong="i:H8085" x-morph="He,Ti:VNp3ms" x-id="166gR"\+w*\f*
  // \f + \ft or perhaps \fqa \+w לֹה|lemma="לֹא" strong="H3808" x-morph="He,Tn" x-id="18VPu"\+w* \ft (BHS)\f*
