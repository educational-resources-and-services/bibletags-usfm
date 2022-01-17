const fs = require('fs').promises
const { normalizeGreek, getWordKey, getVariantWordKey, getRandomId, getUsfmByLoc, overNormalizeGreek } = require('./utils')

const transcriptionsDir = './cntr/transcriptions'
const outputUsfmDir = './usfm/ugnt'

;(async () => {

  try {

    const [
      ugntDir,
      addedTranscriptionsDir,
    ] = process.argv.slice(2)

    if(!ugntDir) throw `Missing ugntDir parameter.`

    console.log(``)
    console.log(`STARTING...`)
    console.log(``)

    const ugntPaths = (await fs.readdir(ugntDir)).filter(file => file.match(/^[0-9]{2}-\w{3}\.usfm$/)).map(file => `${ugntDir}/${file}`)

    if(ugntPaths.length !== 27) throw `Invalid ugntDir parameter.`

    const getPaths = async dir => dir ? (await fs.readdir(dir)).filter(file => file.match(/^[0-9]G.*\.txt$/)).map(file => `${dir}/${file}`) : []

    const allTranscriptionPaths = [
      ...await getPaths(transcriptionsDir),
      ...await getPaths(addedTranscriptionsDir),
    ]

    allTranscriptionPaths.sort((p1, p2) => p1.split('/').pop() > p2.split('/').pop() ? 1 : -1)

    const dataByLoc = {}
    // const movableNuPairs = []

    // load transcriptions words array into JSON obj keyed to loc
    for(let path of allTranscriptionPaths) {

      const transcriptions = await fs.readFile(path, { encoding: `utf8` })
      const lines = transcriptions.split(/\n/g)

      lines.forEach(line => {
        const numOccurrencesByForm = {}
        const [ x, loc, content ] = line.match(/^(.*?) (.*)$/) || []
        if(!x) {
          if(line) console.log(`Bad line: ${line}`)
          return
        }
        const words = normalizeGreek(content).split(" ")
        if(words.length === 1 && !words[0]) words.pop()
        const source = path.match(/\/([0-9]G[^\/]*)\.txt$/)[1]
        const wordObjs = words.map(w => {
          numOccurrencesByForm[overNormalizeGreek(w)] = numOccurrencesByForm[overNormalizeGreek(w)] || 0
          return {
            w,
            occurrenceInVerse: ++numOccurrencesByForm[overNormalizeGreek(w)],
            getTotalHitsInVerse: () => numOccurrencesByForm[overNormalizeGreek(w)],
          }
        })
        wordObjs.forEach(wordObj => {
          wordObj.totalHitsInVerse = wordObj.getTotalHitsInVerse()
          delete wordObj.getTotalHitsInVerse
        })
        dataByLoc[loc] = {
          wordObjsBySource: {
            ...((dataByLoc[loc] || {}).wordObjsBySource || {}),
            [source]: wordObjs,
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
          const idsInThisVerse = []
          ;(oldUsfmByLoc[loc].match(/\\w .*?\\w\*/g) || []).forEach(wordUsfm => {
            const [ x, id ] = wordUsfm.match(/x-id="([^"]*)"/) || []
            if(id) {
              const wordKey = getWordKey({ wordUsfm, loc, wordNum, version: `UGNT` })
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
            apparatusJson.words.forEach(({ w, id }, idx) => {
              if(id) {
                const wordKey = getVariantWordKey({
                  w,
                  loc,
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
        const wordKey = (params.w ? getVariantWordKey : getWordKey)(params)

        let id = idDictionary[wordKey]

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

        let verseUsfmPieces = usfmByLoc[loc].split(/(\\w .*?\\w\*)/g)
        const wordObjs = []

        // add x-id attribute into USFM, updating id dictionary and outputting issues when relevant
        let wordNum = 1
        const numOccurrencesByForm = {}
        verseUsfmPieces = verseUsfmPieces.map(piece => {

          const [ wordUsfm ] = piece.match(/\\w .*?\\w\*/) || []

          if(wordUsfm) {

            const id = getId({ wordUsfm, loc, wordNum, version: `UGNT` })
            wordNum++

            piece = piece.replace(/\\w\*/, ` x-id="${id}"\\w*`)

            const w = normalizeGreek(wordUsfm.match(/\\w ([^|\\]*)/)[1])
            numOccurrencesByForm[overNormalizeGreek(w)] = numOccurrencesByForm[overNormalizeGreek(w)] || 0
            wordObjs.push({
              id,
              w,
              occurrenceInVerse: ++numOccurrencesByForm[overNormalizeGreek(w)],
              getTotalHitsInVerse: () => numOccurrencesByForm[overNormalizeGreek(w)],
            })

          }

          return piece
        })

        usfmByLoc[loc] = verseUsfmPieces.join('')

        wordObjs.forEach(wordObj => {
          wordObj.totalHitsInVerse = wordObj.getTotalHitsInVerse()
          delete wordObj.getTotalHitsInVerse
        })

        // add ugnt wordObjs array to dataByLoc
        dataByLoc[loc] = {
          wordObjsBySource: {
            ...((dataByLoc[loc] || {}).wordObjsBySource || {}),
            UGNT: wordObjs,
          },
        }

      }

      // double-check that id's are unique
      const idValues = Object.values(idDictionary)
      if(idValues.length !== [ ...new Set(idValues) ].length) throw `Multiple words have the same id!`

      // build apparatus data verse-by-verse
      for(let loc in dataByLoc) {
        if(!usfmByLoc[loc]) continue

        let variantWords = []
        const criticalVersionsByReading = {}
        const ancientVersionsByReading = {}

        const ugntWordObjs = dataByLoc[loc].wordObjsBySource.UGNT || []
        for(let source in dataByLoc[loc].wordObjsBySource) {
          if(source === 'UGNT') continue

          const isCriticalText = /^0G/.test(source)

          const wordObjsInThisVersion = dataByLoc[loc].wordObjsBySource[source]

          const readingRaw = []
          wordObjsInThisVersion.forEach((wordObj, wordIdx) => {
            const { w, occurrenceInVerse, totalHitsInVerse } = wordObj

            const getWordIndex = words => {

              const thisVersionToWordsIdxMaps = {}
              let inexactId

              const index = words.findIndex((wordObj2, wordIdx2) => {

                const isInexactMatch = (w1, w2) => {
                  const isMatch = overNormalizeGreek(w1) === overNormalizeGreek(w2)

                  // if(w1 !== w2 && isMatch) {
                  //   if(w1.replace(/ν$/, '') === w2.replace(/ν$/, '')) {
                  //     const pair = [ w1, w2 ].sort().join(',')
                  //     if(!movableNuPairs.includes(pair)) {
                  //       movableNuPairs.push(pair)
                  //     }
                  //   }
                  // }

                  return isMatch
                }

                if(isCriticalText && /[^α-ω\[\]⟦⟧〚〛$]/.test(wordObj2.w + w)) throw `Unexpected character: ${wordObj2.w} ${w}`

                if(isInexactMatch(wordObj2.w, w)) {
                  if(isCriticalText) {
                    if(
                      wordObj2.occurrenceInVerse === occurrenceInVerse
                      && wordObj2.totalHitsInVerse === totalHitsInVerse
                    ) {
                      // critical matches w + occurrenceInVerse && totalHitsInVerse
                      // this takes care of transposed words and phrases
                      if(wordObj2.w !== w) {
                        inexactId = wordObj2.id
                      }
                      return true

                    } else if(wordObj2.totalHitsInVerse !== totalHitsInVerse) {

                      // extra in one source
                        // if totalHitsInVerse is off, still match Math.min(ugntWordObj.totalHitsInVerse, totalHitsInVerse), using those closest to one another in word num
                        // TODO: create exceptions var for when this assumption proves wrong
                        // TODO: have these manually checked, if possible, since it will be tough to spot where there is an issue in the app
                      
                      const overNormalizeW = overNormalizeGreek(w)

                      if(!thisVersionToWordsIdxMaps[overNormalizeW]) {

                        const numToMatch = Math.min(wordObj2.totalHitsInVerse, totalHitsInVerse)
                        const wordArrayWithMoreHits = wordObj2.totalHitsInVerse > totalHitsInVerse ? wordObjsInThisVersion : words
                        const wordArrayWithFewerHits = wordObj2.totalHitsInVerse < totalHitsInVerse ? wordObjsInThisVersion : words
    
                        const wordsProximityInfo = wordArrayWithMoreHits.map((wObj, wIdx) => {
                          const info = { numWordsAwayToClosest: Infinity }
    
                          if(isInexactMatch(wObj.w, w)) {

                            wordArrayWithFewerHits.some((wObj2, wIdx2) => {
                              if(isInexactMatch(wObj2.w, w)) {
                                info.numWordsAwayToClosest = Math.abs(wIdx - wIdx2)
                                info.thisVersionIdx = wordObj2.totalHitsInVerse > totalHitsInVerse ? wIdx : wIdx2
                                info.wordsIdx = wordObj2.totalHitsInVerse < totalHitsInVerse ? wIdx : wIdx2
                              }
    
                              if(info && wIdx2 >= wIdx + info.numWordsAwayToClosest - 1) return true  // any beyond this will be further away
                            })
    
                          }
    
                          return info
                        })
    
                        thisVersionToWordsIdxMaps[overNormalizeW] = {}
                        wordsProximityInfo.sort((a, b) => a.numWordsAwayToClosest > b.numWordsAwayToClosest ? 1 : -1).slice(0, numToMatch).forEach(({ thisVersionIdx, wordsIdx }) => {
                          thisVersionToWordsIdxMaps[overNormalizeW][thisVersionIdx] = wordsIdx
                        })

                      }

                      if(thisVersionToWordsIdxMaps[overNormalizeW][wordIdx] === wordIdx2) {
                        if(wordObj2.w !== w) {
                          inexactId = wordObj2.id
                        }
                        return true
                      }
                      return false
                    }

                  } else if(wordObj2.w === w) {
                    // ancient matches w
                    return true
                  }
                }
                
              })

              return [
                inexactId ? -1 : index,
                inexactId,
              ]
            }

            const [ ugntWordIndex, ugntInexactId ] = getWordIndex(ugntWordObjs)
            if(ugntWordIndex !== -1) {
              readingRaw.push(`${ugntWordIndex+1}`)
            } else {
              let [ variantIndex, variantInexactId ] = getWordIndex(variantWords)
              if(variantIndex === -1) {
                if(isCriticalText) {
                  wordObj.id = (
                    ugntInexactId
                    || variantInexactId
                    || getId({
                      w,
                      loc,
                      occurrenceInVariants: variantWords.filter(variantWord => variantWord.w === w).length + 1,
                    })
                  )


                  // TODO: HERE!
                    // add in id
                    // same id
                      // elision (e.g., ἀλλʼ for ἀλλά)
                      // movable ν
                      // spelling (δαυιδ vs δαυειδ)
                    // different ids, but not significant
                      // interchange between first aorist and second aorist verb endings
                      // crasis (e.g., κἀγώ for καὶ ἐγώ)
                    // add notes to README
                }
                variantWords.push(wordObj)
                variantIndex = variantWords.length - 1
              }
              readingRaw.push(`+${variantIndex+1}`)
            }
          })

          const ranges = []
          readingRaw.forEach(wordNum => {
            const lastRange = ranges[ranges.length - 1] || ``
            const lastWordIsVariant = /^\+/.test(lastRange)
            const lastWordInt = parseInt(lastRange.split('-').pop().replace("+", ""), 10)
            const wordIsVariant = /^\+/.test(wordNum)
            const wordInt = parseInt(wordNum.replace("+", ""), 10)

            if(wordIsVariant === lastWordIsVariant && wordInt === lastWordInt+1) {
              ranges[ranges.length - 1] = lastRange.replace(/(?:-.*)?$/, `-${wordInt}`)
            } else {
              ranges.push(wordNum)
            }
          })
          let reading = ranges.join(',')
          if(reading === `1-${ugntWordObjs.length}`) {
            reading = ``
          }

          if(isCriticalText) {  // critical text
            const version = source.substring(3)
            criticalVersionsByReading[reading] = criticalVersionsByReading[reading] || []
            criticalVersionsByReading[reading].push(version)
          } else {  // ancient text
            let version
            if(/^1G0/.test(source)) {
              version = `O${parseInt(source.substring(4), 10)}`
            } else if(/^1G1/.test(source)) {
              version = `𝔓${parseInt(source.substring(4), 10)}`
            } else if(/^1G2/.test(source)) {
              version = `0${parseInt(source.substring(4), 10)}`
            } else if(/^2G/.test(source)) {
              version = `${parseInt(source.substring(3), 10)}`
            } else {
              throw `Unknown version: ${source}`
            }
            ancientVersionsByReading[reading] = ancientVersionsByReading[reading] || []
            ancientVersionsByReading[reading].push(version)
          }

        }

        variantWords = variantWords.map(({ id, w }) => {
          if(id) {
            return { id, w }
          }
          return w
        })

        if(variantWords.length !== [ ...new Set(variantWords) ].length) throw `Duplicate variant word for manuscripts: ${JSON.stringify(variantWords)}`

        const getVersionRangesString = versionsByReading => (
          Object.keys(versionsByReading)
            .map(reading => (
              [ versionsByReading[reading].join(','), reading ]
                .filter(Boolean)
                .join(`:`)
            ))
        )

        const apparatusJson = {
          words: variantWords,
          critical: getVersionRangesString(criticalVersionsByReading),
          ancient: getVersionRangesString(ancientVersionsByReading),
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

        outputUsfm += verseUsfmPieces.join('')
      })

      // write the file
      const outputFilename = path.split('/').pop()
      console.log(`Writing ${outputFilename}...`)
      await fs.writeFile(`${outputUsfmDir}/${outputFilename}`, outputUsfm)

    }
        
    // console.log(``)
    // console.log(`==============`)
    // console.log(`Movable ν pairs`)
    // console.log(`==============`)
    // console.log(movableNuPairs.join("\n"))

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