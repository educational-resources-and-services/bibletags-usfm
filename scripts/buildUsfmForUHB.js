const fs = require('fs').promises
const { getWordKey, getVariantWordKey, getRandomId, getUsfmByLoc, getReading, addToStrongLemmaMap, logPossibleStrongLemmaIssues } = require('./utils')
const manualReadingCorrectionsByLoc = require('./manualReadingCorrectionsByLoc')

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
      let sourceUsfm = await fs.readFile(path, { encoding: `utf8` })

      // change the versification to be original
      sourceUsfm = sourceUsfm.replace(/\\v 69\n\\va 68\\va\*\n/g, '')  // Ezra 7:68 does not exist in Hebrew
      sourceUsfm = sourceUsfm.replace("The best Hebrew manuscripts do not include this verse.", "The best Hebrew manuscripts do not include the previous portions of this verse.")
      sourceUsfm = sourceUsfm.replace(/\n\\v 6\n\\w אָשִׁ֥ירָה/g, '\\w אָשִׁ֥ירָה')  // Ps 13:6 in Hebrew contains two verses in KJV
      sourceUsfm = sourceUsfm.replace(/\\c 64\n\\p\n\\v 1\n\\va 63:19b\\va\*/g, '\\p')  // Is 63:19 in Hebrew split across two verses in KJV
      sourceUsfm = sourceUsfm.replace(/\\c 4\n\\p\n\\v 1\n\\va 3:19\\va\*/g, '\\p\n\\v 1\n\\va 3:19\\va*')  // Mal has 4 chapters in KJV, 3 in Hebrew

      sourceUsfm = sourceUsfm.replace(/(?:\\v [0-9]+|\\d)\n\\va (?:[0-9]+:)?([0-9]+)\\va\*/g, '\\v $1')
      ;(sourceUsfm.match(/\\ca [0-9]+\\ca\*/g) || []).forEach(ca => {
        const ch = ca.match(/\\ca ([0-9]+)\\ca\*/)[1]
        sourceUsfm = sourceUsfm.replace(`\\c ${ch}\n`, ``)
        sourceUsfm = sourceUsfm.replace(`\\ca ${ch}\\ca*`, `\\c ${ch}`)
      })
      sourceUsfm = sourceUsfm
        .split(/(\\c [0-9]+)/g)
        .map(piece => {
          ;(piece.match(/\\va (?:[0-9]+:)?[0-9]+\\va\*/g) || []).forEach(va => {
            const vs = va.match(/\\va ((?:[0-9]+:)?[0-9]+)\\va\*/)[1]
            piece = piece.replace(`\\v ${vs.split(':').pop()}\n`, ``)
            piece = piece.replace(`\\va ${vs}\\va*`, `\\v ${vs.split(':').pop()}`)
          })
          return piece
        })
        .join("")

      if(/\\ca/.test(sourceUsfm)) throw `Still has \\ca tag: ${(sourceUsfm.replace(/\n/g, '\\n').match(/.{10}\\ca.{10}/) || {})[0]}`
      if(/\\va/.test(sourceUsfm)) throw `Still has \\va tag: ${(sourceUsfm.replace(/\n/g, '\\n').match(/.{10}\\va.{10}/) || {})[0]}`

      // put paragraphs after verse-ending פ where needed
      sourceUsfm = sourceUsfm.replace(/׃פ\n\n\\v/g, '׃פ\n\n\\p\n\\v')

      // modify certain lemmas
      sourceUsfm = sourceUsfm.replace(/\\w (אֲרָ֑ם|אֲרָ֔ם|אֲרָֽם|)\|lemma="פַּדָּן" strong="H6307"/g, '\\w $1|lemma="אֲרָם" strong="H0758"')
      sourceUsfm = sourceUsfm.replace(/lemma="(?:יָלַךְ|הָלַךְ)" strong="([^"]*?:)?H3212"/g, 'lemma="הָלַךְ" strong="$1H1980"')
      if(/יָלַךְ/.test(sourceUsfm)) throw `Still has יָלַךְ: ${(sourceUsfm.replace(/\n/g, '\\n').match(/.{10}יָלַךְ.{20}/) || {})[0]}`
      if(/H3212/.test(sourceUsfm)) throw `Still has H3212: ${(sourceUsfm.replace(/\n/g, '\\n').match(/.{30}H3212.{10}/) || {})[0]}`

      // convert strongs to five-digit
      sourceUsfm = sourceUsfm.replace(/strong="([^"]*?:)?(H[0-9]{4})([a-f])?"/g, (x, prefix=``, coreStrongsNum, letter) => `strong="${prefix}${coreStrongsNum}${`abcdef`.indexOf(letter)+1}"`)
      if(/H[0-9]{4}"/.test(sourceUsfm)) throw `Still has four-digit strongs: ${(sourceUsfm.replace(/\n/g, '\\n').match(/.{10}H[0-9]{4}".{10}/) || {})[0]}`

      // modify some pecular lines in prep for next step
      sourceUsfm = sourceUsfm.replace(/(\\w [^|]+\|lemma="רָמֹת גִּלעָד" strong="[^"]+" x-morph="[^"]+"\\w\*[ \n־׀]+\\w [^|]+\|lemma=")גִּלְעָד(" strong="(?:[^"]*?:)?)[^"]+(" x-morph="[^"]+"\\w\*)/g, `$1רָמֹת גִּלעָד$2H74330$3`)
      sourceUsfm = sourceUsfm.replace(/\\w יונים\|lemma="יוֹנָה" strong="H31230"/g, `\\w יונים|lemma="חֲרֵי־יוֹנִים" strong="H2755"`)
      sourceUsfm = sourceUsfm.replace(/נֵרְגַּל שַׁרְאֶצֶר/g, `נֵרְגַּל שַׁרְ־אֶצֶר`)
      sourceUsfm = sourceUsfm.replace(
        `\\w וְ⁠יִשְׁבִּ֨י|lemma="יִשְׁבּוֹ בְּנֹב" strong="c:H34300" x-morph="He,C:Np"\\w*\n\\f + \\ft K \\+w ו⁠ישבו|lemma="יִשְׁבּוֹ בְּנֹב" strong="c:H34300" x-morph="He,C:Np"\\+w*\\f*\n\\w בְּנֹ֜ב|lemma="יִשְׁבּוֹ בְּנֹב" strong="H34300" x-morph="He,Np"\\w*`,
        `\\w וְ⁠יִשְׁבִּ֨י|lemma="יִשְׁבּוֹ בְּנֹב" strong="c:H34300" x-morph="He,C:Np"\\w*\n\\w בְּנֹ֜ב|lemma="יִשְׁבּוֹ בְּנֹב" strong="H34300" x-morph="He,Np"\\w*\n\\f + \\ft K \\+w ו⁠ישבו בְּנֹ֜ב|lemma="יִשְׁבּוֹ בְּנֹב" strong="c:H34300" x-morph="He,C:Np"\\+w*\\f*`,
      )
      sourceUsfm = sourceUsfm.replace(  // I have submitted a pull request to unfoldingWord such that this might not be needed in the future
        `\\f + \\ft K \\+w ל⁠ם רבה|lemma="רַב" strong="H72270" x-morph="He,R:Sp3mp:Aafsc"\\+w*\\f*`,
        `\\f + \\ft K \\+w ל⁠ם|lemma="" strong="l" x-morph="He,R:Sp3mp"\\+w* \\+w רבה|lemma="רַב" strong="H72270" x-morph="He,Aafsc"\\+w*\\f*`,
      )
      sourceUsfm = sourceUsfm.replace(
        `\\f + \\ft K \\+w ו⁠יעברו|lemma="עָבַר" strong="c:H56741" x-morph="He,C:Vqw3mp"\\+w* \\+w אֶת|lemma="אֵת" strong="H08540" x-morph="He,R"\\+w*־\\+w הַ⁠מֶּ֔לֶךְ|lemma="מֶלֶךְ" strong="d:H44280" x-morph="He,Td:Ncmsa"\\+w*\\f*`,
        `\\f + \\ft K \\+w ו⁠יעברו|lemma="עָבַר" strong="c:H56741" x-morph="He,C:Vqw3mp"\\+w* \\+w אֶת|lemma="אֵת" strong="H08540" x-morph="He,R"\\+w*\\f*`,
      )
      sourceUsfm = sourceUsfm.replace(
        `\\f + \\ft K \\+w בֶן|lemma="בֵּן" strong="H11211" x-morph="He,Ncmsc"\\+w*־\\+w בני⁠מן|lemma="בִּנְיָמִין" strong="H11440" x-morph="He,Ncmpc:R"\\+w*־\\+w בְּנֵי|lemma="בֵּן" strong="H11211" x-morph="He,Ncmpc"\\+w*־\\+w פֶ֖רֶץ|lemma="פֶּרֶץ" strong="H65570" x-morph="He,Np"\\+w*\\f*`,
        `\\f + \\ft K \\+w בני⁠מן|lemma="בִּנְיָמִין" strong="H11440" x-morph="He,Ncmpc:R"\\+w*\\f*`,
      )
      sourceUsfm = sourceUsfm.replace(
        `\\f + \\ft Or perhaps \\+w וְ⁠לֹ֥א|lemma="לֹא" strong="c:H38080" x-morph="He,C:Tn"\\+w* \\+w יָמִרוּ|lemma="מוּר" strong="H41710" x-morph="He,Vhi3mp"\\+w* \\+w וְ⁠לֹ֥א|lemma="לֹא" strong="c:H38080" x-morph="He,C:Tn"\\+w* \\+w יעבִירוּ|lemma="עָבַר" strong="H56741" x-morph="He,Vhi3mp"\\+w*\\f*`,
        `\\f + \\ft Or perhaps \\+w יָמִרוּ|lemma="מוּר" strong="H41710" x-morph="He,Vhi3mp"\\+w* \\+w יעבִירוּ|lemma="עָבַר" strong="H56741" x-morph="He,Vhi3mp"\\+w*\\f*`,
      )

      // group words together for multi-word lemmas
      const firstWordRegexStr = `\\\\w ([^|]+)\\|lemma="([^" ־]+[ ־][^"]+)" strong="([^"]+)" x-morph="([^"]+)"\\\\w\\*`
      const otherWordRegexStr = `(?:[ \\n־׀]+${firstWordRegexStr})+`
      const regex = new RegExp(firstWordRegexStr + otherWordRegexStr, `g`)
      const singleWordRegex = new RegExp(firstWordRegexStr)
      const allGroupedWordMorphs = {}
      sourceUsfm = sourceUsfm.replace(regex, match => {

        const matchPieces = match.split(/(\\w [^|]+\|lemma="[^"]+" strong="[^"]+" x-morph="[^"]+"\\w\*)/g)
        const newUsfmWordPieces = []

        let x1, words, lemma, strong, morph, commonStrong, unifiedMorph, hasNp, lastMorph, morphPrefixes, morphSuffixes

        const addNewUsfmWord = () => {
          if(
            words.replace(/ ׀ /g, ' ').match(/[ ־]/g).length !== lemma.match(/[ ־]/g).length
            && lemma !== `בֵּית בַּעַל מְעוֹן`  // this lemma appears once in the text as בֵּית מְעוֹן
          ) throw `Number of words in multi-word lemma doesn't match that of the text: ${match}`

          if(/,Ng[mf][sp]a$/.test(lastMorph)) {
            if(hasNp && lemma !== `עַשְׁתְּרֹת קַרְנַיִם`) throw `Unexpected combo of Np with Ng: ${match}`
            unifiedMorph = lastMorph
          } else if([ `קַו־קַו`, `פְּקַח־קוֹחַ`, `יְפֵה־פִיָּה` ].includes(lemma)) {
            unifiedMorph = lastMorph
          }

          if(morphSuffixes.length > 1) throw `Unexpected multiple suffixes when grouping multi-word lemmas: ${match}`

          const [ lang, mainWordMorph ] = unifiedMorph.split(',')
          const finalMorph = `${lang},${[ ...new Set(morphPrefixes), mainWordMorph, ...morphSuffixes ].join(':')}`
          allGroupedWordMorphs[finalMorph] = true

          newUsfmWordPieces.push(`\\w ${words}|lemma="${lemma}" strong="${strong}" x-morph="${finalMorph}"\\w*`)

          if((words.match(/\u2060/g) || []).length !== (finalMorph.match(/:/g) || []).length) {
            throw `While grouping multi-word lemmas, morph parts do not equal word parts: \n<<<<${match}\n>>>> ${newUsfmWordPieces.join('')}`
          }

          if(finalMorph.split(/[,:]/g).length !== [ ...new Set(finalMorph.split(/[,:]/g)) ].length) {
            throw `While grouping multi-word lemmas, made invalid morph (wrong number of colons): \n<<<<${match}\n>>>> ${newUsfmWordPieces.join('')}`
          }

          if((finalMorph.match(/^(?:He|Ar),.*[NA]/g) || []).length !== 1) {
            throw `While grouping multi-word lemmas, made invalid morph: \n<<<<${match}\n>>>> ${newUsfmWordPieces.join('')}`
          }
        }

        let connectorPiece = ``
        for(let mPieceIdx=0; mPieceIdx<matchPieces.length; mPieceIdx++) {

          if(!singleWordRegex.test(matchPieces[mPieceIdx])) {
            if(connectorPiece) throw `Unexpected connector piece before word in grouping multi-word lemmas: ${match}`
            connectorPiece = matchPieces[mPieceIdx]
            continue
          }

          const [ x2, w, thisLemma, thisStrong, thisMorph ] = matchPieces[mPieceIdx].match(singleWordRegex)

          if(thisLemma !== lemma || thisStrong === `c:H48070`) {  // H48070 appears twice in a row

            if(lemma) {

              addNewUsfmWord()
              if(!connectorPiece) throw `Connector piece missing in multi-word lemma grouping: ${match}`
              newUsfmWordPieces.push(connectorPiece)
              connectorPiece = ``

            } else if(connectorPiece) {
              throw `Unexpected connector piece missing in multi-word lemma grouping: ${match}`
            }

            [ x1, words, lemma, strong, morph ] = matchPieces[mPieceIdx].match(singleWordRegex)
            hasNp = /Np/.test(morph)
            commonStrong = strong.split(':').pop()
            unifiedMorph = morph.replace(/[^,]+$/, 'Np')

            morphPrefixes = []
            morphSuffixes = []

          } else {

            if(thisStrong.split(':').pop().slice(0,5) !== commonStrong.slice(0,5)) throw `Unexpected divergent strongs when grouping words: ${match}`
            hasNp = hasNp || /Np/.test(thisMorph)
            words += connectorPiece.replace(/\n/g, ' ') + w
            connectorPiece = ``

          }

          morphPrefixes.push(...(thisMorph.replace(/:S[^:]+$/, '').replace(/^(?:He|Ar),((?:[^:]+:)*)(?:[^:]+)$/, '$1').match(/[^:]+/g) || []))
          morphSuffixes.push(...(thisMorph.match(/S[^:,]+$/g) || []))
          lastMorph = thisMorph.replace(/:S[^:]+$/, '').replace(/^(He|Ar),(?:[^:]+:)*([^:]+)$/, '$1,$2')

        }

        addNewUsfmWord()

        return newUsfmWordPieces.join('')
      })
      const ungroupedLemmaRegex = /\\w [^| ־]+\|lemma="[^" ־]+[ ־][^"]+"/g
      if(ungroupedLemmaRegex.test(sourceUsfm)) {
        const match = sourceUsfm.match(ungroupedLemmaRegex)[0]
        const matchIdx = sourceUsfm.search(ungroupedLemmaRegex)
        if(
          match !== `\\w הַֽ⁠חִירֹ֔ת|lemma="פִּי הַחִירֹת"`  // In this instance, the פי is missing in the text, though is a part of the lemma
          && match !== `\\w קִרְיַ֔ת|lemma="קִרְיַת יְעָרִים"`  // In this instance, יְעָרִים is taken from the LXX
          && match !== `\\w אִיכָב֣וֹד|lemma="אִי־כָבוֹד"`
          && match !== `\\w וְיִשְׁבִּ֨י|lemma="יִשְׁבּוֹ בְּנֹב"`  // lemma relates to the ketiv reading
          && match !== `\\w חרי⁠הם|lemma="חֲרֵי־יוֹנִים"`
          && match !== `\\w ל⁠בנימיני|lemma="בֶּן־יְמִינִי"`
        ) throw `Still has ungrouped multi-word lemma: ${match}\n\n${sourceUsfm.slice(matchIdx - 30, matchIdx + 230)}\n`
      }
      // console.log('allGroupedWordMorphs', Object.keys(allGroupedWordMorphs))
      
      // get usfm by loc
      const usfmByLoc = getUsfmByLoc(sourceUsfm)

      // confirm that versification is continguous
      let lastChapter = 0
      let lastVerse = 0
      const sortedLocs = Object.keys(usfmByLoc).sort()
      sortedLocs.forEach((loc, idx) => {
        if(loc === '0') return
        const [ book, chapter, verse ] = loc.match(/([0-9]{2})([0-9]{3})([0-9]{3})/).slice(1).map(n => parseInt(n, 10))
        if(chapter === lastChapter) {
          if(verse !== lastVerse + 1) throw `Noncontinguous verses: ${loc} // ${sortedLocs.slice(Math.max(0, idx - 5), idx + 5).join("\n")}`
        } else {
          if(chapter !== lastChapter + 1) throw `Noncontinguous chapters: ${loc} // ${sortedLocs.slice(Math.max(0, idx - 5), idx + 5).join("\n")}`
          if(verse !== 1) throw `Chapter starts with verse other than 1: ${loc} // ${sortedLocs.slice(Math.max(0, idx - 5), idx + 5).join("\n")}`
        }
        lastChapter = chapter
        lastVerse = verse
      })

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

        const checkWordJoiners = ({ w, morph }) => {
          if(/\//.test(w)) throw `Unexpected slash in footnote word: ${w}`
          if((w.match(/\u2060/g) || []).length !== (morph.match(/:/g) || []).length) {
            const err = `morph parts do not equal word parts (designated by word joiners): ${w} // ${morph} // ${loc}`
            // console.log(err)
            throw err
          }
        }

        let verseUsfmPieces = usfmByLoc[loc].split(/(\\w .*?\\w\*|\\f .*?\\f\*\n?)/g)

        // add x-id attribute into USFM, updating id dictionary and outputting issues when relevant
        let wordNum = 0
        const words = []
        verseUsfmPieces = verseUsfmPieces.map(piece => {

          const [ wordUsfm ] = piece.match(/\\w .*?\\w\*/) || []
          const [ footnoteUsfm ] = piece.match(/\\f .*?\\f\*/) || []
          let [ wordsFootnoteUsfm, qOrK, someManuscripts, someManuscripts2, isBHSReading ] = piece.match(/\\f \+ \\ft ([QK])?(.*?)? ?\\\+w .*?\\\+w\*( some manuscripts read| \\ft \(some Hebrew manuscripts\)| \(see above\))?( \\ft \(BHS\))?\\f\*\n?/) || []

          // discount any where we are not actually dealing with a reading variant
          if([ "or perhaps Niphal" ].includes(someManuscripts)) {
            wordsFootnoteUsfm = null
          }

          const source = qOrK || (isBHSReading && "BHS") || ((someManuscripts || someManuscripts2) && "M")

          if(wordsFootnoteUsfm && source) {

            const wordsUsfm = wordsFootnoteUsfm.match(/\\\+w .*?\\\+w/g)
            wordsUsfm.forEach((wordFootnoteUsfm, idx) => {

              const thisWordNum = wordNum - (wordsUsfm.length - idx - 1)

              let [ x0, w ] = wordFootnoteUsfm.match(/\\\+w (.*?)\|/) || []
              const [ x1, lemma ] = wordFootnoteUsfm.match(/lemma="([^"]*)"/) || []
              const [ x2, strong ] = wordFootnoteUsfm.match(/strong="([^"]*)"/) || []
              const [ x3, morph ] = wordFootnoteUsfm.match(/x-morph="([^"]*)"/) || []

              if((w.replace(/ ׀ /g, ' ').match(/[ ־]/g) || []).length !== (lemma.match(/[ ־]/g) || []).length) {
                if(lemma === `כְּפַר הָֽעַמֹּנָה`) {
                  w = `כְּפַר ${w}`
                } else if(lemma === `חֲרֵי־יוֹנִים`) {
                  // nothing to do
                } else {
                  throw `Number of words in multi-word lemma doesn't match that of the text (apparatus): ${lemma} // ${w} // ${loc}`
                }
              }

              const id = getId({
                loc,
                wordUsfm: wordFootnoteUsfm,
                wordNum: thisWordNum,
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
                  altReadingsForM: [],
                  altReadingsForBHS: [],
                  ancient: [],
                }
              }

              if(dataByLoc[loc][`altReadingsFor${source}`].some(altReading => altReading.wordNum === thisWordNum)) throw `Two word footnotes in a row: ${loc}`

              dataByLoc[loc].words.push({
                w,
                id,
                lemma,
                strong,
                morph,
              })

              dataByLoc[loc][`altReadingsFor${source}`].push({ wordNum: thisWordNum, altWordNum: dataByLoc[loc].words.length })

              checkWordJoiners({ w, morph })
              addToStrongLemmaMap(wordFootnoteUsfm, loc)

            })

            piece = ``

          } else if(wordUsfm) {

            wordNum++
            const id = getId({ wordUsfm, loc, wordNum, version: `UHB` })
            let w = wordUsfm.match(/\\w (.*?)\|/)[1]
            const [ x, morph ] = wordUsfm.match(/x-morph="([^"]*)"/) || []
            words.push(w)

            if(/\//.test(w)) {
              console.log(`** Replaced slash with word joiner: ${loc} // ${w}`)
              piece = piece.replace(w, w.replace(/\//g, '\u2060'))  // should have word joiner, not slash
              w = w.replace(/\//g, '\u2060')
            }

            checkWordJoiners({ w, morph })
            addToStrongLemmaMap(wordUsfm, loc)

            piece = piece.replace(/(\\w\*)/, ` x-id="${id}"$1`)

          } else if(footnoteUsfm) {

            console.log(`** Non-word footnote: ${footnoteUsfm}`)

            let [ x1, w ] = footnoteUsfm.match(/\\w (.*?)\|/) || []
            const [ x2, morph ] = footnoteUsfm.match(/x-morph="([^"]*)"/) || []
            w && morph && checkWordJoiners({ w, morph })
            addToStrongLemmaMap(footnoteUsfm, loc)

          }

          return piece
        })

        if(dataByLoc[loc]) {
          dataByLoc[loc].critical = []
          const hasQOrK = dataByLoc[loc][`altReadingsForQ`].length + dataByLoc[loc][`altReadingsForK`].length > 0
          const sources = [ 'Q', 'K', 'M', 'BHS' ]
          sources.forEach(source => {

            if([ 'M', 'BHS' ].includes(source) && dataByLoc[loc][`altReadingsFor${source}`].length === 0) return
            if([ 'Q', 'K' ].includes(source) && !hasQOrK) return

            const readingRaw = Array(wordNum).fill().map((x, idx) => {
              const { altWordNum } = dataByLoc[loc][`altReadingsFor${source}`].find(altReading => altReading.wordNum === idx+1) || {}
              return altWordNum ? `+${altWordNum}` : `${idx+1}`
            })
            const reading = getReading({ readingRaw, lastWordNum: wordNum })
            dataByLoc[loc].critical.push(reading ? `${source}:${reading}` : source)
          })
          if(!hasQOrK) {
            dataByLoc[loc].critical.push(`WLC:1-${wordNum}`)
          }
          sources.forEach(source => {
            delete dataByLoc[loc][`altReadingsFor${source}`]
          })

          if(manualReadingCorrectionsByLoc[loc]) {
            if(JSON.stringify(dataByLoc[loc].critical) !== JSON.stringify(manualReadingCorrectionsByLoc[loc].computed)) {
              console.log(JSON.stringify(manualReadingCorrectionsByLoc[loc].computed))
              console.log(JSON.stringify(dataByLoc[loc].critical))
              console.log(verseUsfmPieces.join(''))
              throw `Expected computed value not found on manual reading correction loc: ${loc}`
            }
            dataByLoc[loc].critical = manualReadingCorrectionsByLoc[loc].corrected
          }
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

    // logPossibleStrongLemmaIssues()

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
    console.log(`Example #1: \`npm run build-usfm-for-uhb ../../hbo_uhb\``)
    console.log(``)
    console.log(`Note #1: \`uhbDir\` should point to your local clone of the unfoldingword.org/uhb repo.`)
    console.log(``)

    if(typeof err !== 'string') throw err

  }

  process.exit()

})()