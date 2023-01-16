const fs = require('fs').promises
const mysql = require('mysql2/promise')
const zlib = require('zlib')
const { getUsfmBibleBookAbbr, getBibleBookName, normalizeSearchStr } = require('@bibletags/bibletags-ui-helper')
const { i18n, i18nNumber } = require("inline-i18n")
const { passOverI18n, passOverI18nNumber } = require("@bibletags/bibletags-ui-helper")
const { addToStrongLemmaMap, logPossibleStrongLemmaIssues, getStrongs } = require('./utils')

passOverI18n(i18n)
passOverI18nNumber(i18nNumber)

const outputUsfmDir = './usfm/lxx'

const apochaphaBookInfo = [
  {
    abbr: "JO2",
    name: "Joshua (Codex Alexandrinus)",
    num: "06",
  },
  {
    abbr: "JD2",
    name: "Judges (Codex Alexandrinus)",
    num: "07",
  },
  {
    abbr: "1ES",
    name: "1 Esdras (Greek)",  // The 9 chapter book of Greek Ezra in the LXX, called ‘2 Esdras’ in Russian Bibles, and called ‘3 Esdras’ in the Vulgate
    num: "82",
  },
  {
    abbr: "JDT",
    name: "Judith",
    num: "69",
  },
  {
    abbr: "TOB",
    name: "Tobit",
    num: "68",
  },
  {
    abbr: "TO2",
    name: "Tobit (Codex Sinaiticus)",
    num: "68",
  },
  {
    abbr: "1MA",
    name: "1 Maccabees",
    num: "78",
  },
  {
    abbr: "2MA",
    name: "2 Maccabees",
    num: "79",
  },
  {
    abbr: "3MA",
    name: "3 Maccabees",
    num: "80",
  },
  {
    abbr: "4MA",
    name: "4 Maccabees",
    num: "81",
  },
  {
    abbr: "ODA",
    name: "Odae/Odes",
    num: "86",
  },
  {
    abbr: "WIS",
    name: "Wisdom of Solomon",
    num: "72",
  },
  {
    abbr: "SIR",
    name: "Sirach",
    num: "72",
  },
  {
    abbr: "PSS",
    name: "Psalms of Solomon",
    num: "87",
  },
  {
    abbr: "BAR",
    name: "Baruch",
    num: "73",
  },
  {
    abbr: "LJE",
    name: "Letter of Jeremiah",
    num: "74",
  },
  {
    abbr: "BEL",
    name: "Bel and the Dragon",  // sometimes included as part of Daniel
    num: "77",
  },
  {
    abbr: "BE2",
    name: "Bel and the Dragon (Theodotion)",  // sometimes included as part of Daniel
    num: "77",
  },
  {
    abbr: "DA2",
    name: "Daniel (Theodotion)",
    num: "27",
  },
  {
    abbr: "SUS",
    name: "Susanna",  // sometimes included as part of Daniel
    num: "76",
  },
  {
    abbr: "SUS",
    name: "Susanna (Theodotion)",  // sometimes included as part of Daniel
    num: "76",
  },
]

const getBookAbbr = bookId => (
  getUsfmBibleBookAbbr(bookId)
  || (apochaphaBookInfo[bookId-67] || {}).abbr
  || bookId
)

const getBookName = bookId => (
  (bookId === 6 && "Joshua (Codex Vaticanus)")
  || (bookId === 7 && "Judges (Codex Vaticanus)")
  || getBibleBookName(bookId)
  || (apochaphaBookInfo[bookId-67] || {}).name
  || bookId
)

const getBookNum = bookId => (
  (apochaphaBookInfo[bookId-67] || {}).num
  || `0${bookId}`.slice(-2)
)

;(async () => {

  try {

    const connection = await mysql.createConnection({
      host: "localhost",
      database: "BibleTags",
      user: "root",
      password: "",
      multipleStatements: true,
    })

    console.log(`\nSTARTING...\n`)

    const lemmaByOldStrongs = {}
    {
      const [ thayers ] = await connection.query(`SELECT id, word FROM thayers`)
      for(let idx=0; idx<thayers.length - 1; idx++) {
        lemmaByOldStrongs[thayers[idx].id] = thayers[idx].word
      }
    }

    const [ lxxWords ] = await connection.query(`SELECT loc, CONCAT(pos,person,tense,voice,mood,sentcase,number,gender,degree) AS morph, word, lemma, strongs FROM lxx_words ORDER BY loc, wordnum`)
    const [ lxxVerses ] = await connection.query(`SELECT * FROM lxx ORDER BY loc`)
    let outputUsfm = ``
    const mismatchedLemmas = {}

    let lxxWordsIdx = 0
    for(let idx=0; idx<lxxVerses.length - 1; idx++) {
      const { loc, book, chapter, verse, content, parsing } = lxxVerses[idx]
    
      const parsingArray = JSON.parse(zlib.inflateSync(Buffer.from(parsing.replace(/^᯹/, ''), 'base64')).toString('binary'))
      const contentPieces = content.normalize('NFC').split(' ')

      if(parsingArray.length !== contentPieces.length) throw `Parsing array not same length as number of words in ${loc}: ${content} ${parsingArray.length}`

      if(!outputUsfm) {
        const bookAbbr = getBookAbbr(book)
        const bookName = getBookName(book)
        outputUsfm += `\\id ${bookAbbr} lxx\n\\usfm 3.0\n\\ide UTF-8\n\\h ${bookName}\n\\mt ${bookName}`

      }

      outputUsfm += `\n`

      if(
        book !== (lxxVerses[idx-1] || {}).book
        || chapter !== (lxxVerses[idx-1] || {}).chapter
      ) {
        outputUsfm += `\n\\c ${chapter}\n`
      }

      outputUsfm += `\\p\n\\v ${verse}\n`

      for(let idx2=0; idx2<contentPieces.length; idx2++) {
        const [ strongs, oldMorph ] = parsingArray[idx2]
        const lxxWord = lxxWords[lxxWordsIdx++]

        const morphItems = [
          oldMorph.slice(0,2).replace('RA','EA').replace('RI','RT').replace('X-','T,').replace('-',','),  // morphPos + second letter of type
          oldMorph[5].replace('D','M'),  // mood
          oldMorph[3].replace('X','E').replace('Y','L'),  // aspect
          oldMorph[4],  // voice
          oldMorph[2],  // person
          oldMorph[6],  // case
          oldMorph[8],  // gender
          oldMorph[7],  // number
          oldMorph[9],  // attribute
        ].map(str => str.replace('-', '') || ',')
        const morph = `Gr,${morphItems.join('')}`

        const newStrongs = getStrongs(strongs)
        const strongsStr = /^G/.test(newStrongs) ? `strong="${newStrongs}" ` : ``

        let normalizedLemma = lxxWord.lemma || lemmaByOldStrongs[strongs]

        normalizedLemma = (
          {
            "ὅ": "ὁ",  // G35880 ὁ (88435 occurences) + ὅ (2 occurences)
            "ἐκείνος": "ἐκεῖνος",  // G15650 ἐκεῖνος (740 occurences) + ἐκείνος (only in 12024010)
            "ἔγω": "ἐγώ",  // G14730 ἐγώ (12602 occurences) + ἔγω (only in 9015001)
            "υἵος": "υἱός",  // G52070 υἱός (5200 occurences) + υἵος (2 occurences)
            "θυγατήρ": "θυγάτηρ",  // G23640 θυγάτηρ (639 occurences) + θυγατήρ (3 occurences)
            "καταβιβάζω": "καταβιβαζω",  // G26010 καταβιβαζω (225 occurences) + καταβιβάζω (11 occurences)
            "ἐπιτιθήμι": "ἐπιτίθημι",  // G20070 ἐπιτίθημι (266 occurences) + ἐπιτιθήμι (only in 70004010)
            "χραω": "χράω",  // G55310 χράω (35 occurences) + χραω (2 occurences)
            "σῴζω": "σώζω",  // G49820 σώζω (364 occurences) + σῴζω (26 occurences)
            "Δαμάσκος": "Δαμασκός",  // G11540 Δαμασκός (41 occurences) + Δαμάσκος (6 occurences)
            "καθῆμαι": "κάθημαι",  // G25210 κάθημαι (12 occurences) + καθῆμαι (only in 5003029)
            "χιλίας": "χιλιάς",  // G55050 χιλιάς (264 occurences) + χιλίας (79 occurences)
            "Ἰουδά": "Ἰουδα",  // G24480 Ἰουδα (458 occurences) + Ἰουδά (243 occurences)
            "κατώ": "κάτω",  // G27360 κάτω (26 occurences) + κατώ (only in 1035008)
            "χρησίμος": "χρήσιμος",  // G55390 χρήσιμος (14 occurences) + χρησίμος (only in 79000005)
            "Μανασσῆς": "Μανασσής",  // G31280 Μανασσής (155 occurences) + Μανασσῆς (12 occurences)
            "κατάλειμμα": "καταλειμμα",  // G26400 καταλειμμα (13 occurences) + κατάλειμμα (7 occurences)
            "θνῄσκω": "θνήσκω",  // G23480 θνήσκω (95 occurences) + θνῄσκω (6 occurences)
            "χαλάζα": "χάλαζα",  // G54640 χάλαζα (36 occurences) + χαλάζα (only in 18038022)
            "στρατία": "στρατιά",  // G47560 στρατιά (34 occurences) + στρατία (8 occurences)
            "σαββάτον": "σάββατον",  // G45210 σάββατον (127 occurences) + σαββάτον (2 occurences)
            "ψευδῆς": "ψευδής",  // G55710 ψευδής (115 occurences) + ψευδῆς (only in 24014014)
            "ταλάντον": "τάλαντον",  // G50070 τάλαντον (67 occurences) + ταλάντον (6 occurences)
            "σφράγις": "σφραγίς",  // G49730 σφραγίς (27 occurences) + σφράγις (only in 2036021)
            "ὀικτειρω": "οἰκτείρω",  // G36270 οἰκτείρω (37 occurences) + ὀικτειρω (2 occurences)
            "ἔνεδρα": "ἐνέδρα",  // G17470 ἐνέδρα (3 occurences) + ἔνεδρα (only in 18025003)
            "καταβάσις": "κατάβασις",  // G26000 κατάβασις (11 occurences) + καταβάσις (6 occurences)
            "κραταίοω": "κραταιόω",  // G29010 κραταιόω (58 occurences) + κραταίοω (5 occurences)
            "θυρέος": "θυρεός",  // G23750 θυρεός (21 occurences) + θυρέος (2 occurences)
            "σιαγῶν": "σιαγών",  // G46000 σιαγών (28 occurences) + σιαγῶν (only in 23050006)
            "ἠχος": "ἦχος",  // G22790 ἦχος (19 occurences) + ἠχος (3 occurences)
            "περικεφαλαῖα": "περικεφαλαία",  // G40300 περικεφαλαία (9 occurences) + περικεφαλαῖα (only in 73006035)
            "θύρωρος": "θυρωρός",  // G23770 θυρωρός (9 occurences) + θύρωρος (only in 69009025)
            "ἐλεφαντίνος": "ἐλεφάντινος",  // G16610 ἐλεφάντινος (9 occurences) + ἐλεφαντίνος (only in 30006004)
            "ἀχρείοω": "ἀχρειόω",  // G08890 ἀχρειόω (4 occurences) + ἀχρείοω (only in 27006022)
            "ἐνδύσις": "ἔνδυσις",  // G17450 ἔνδυσις (only in 17005002) + ἐνδύσις (only in 18041005)
            "παρακλήσις": "παράκλησις",  // G38740 παράκλησις (15 occurences) + παρακλήσις (only in 23066011)
            "κατανύξις": "κατάνυξις",  // G26590 κατάνυξις (only in 19059005) + κατανύξις (only in 23029010)
            "ὑποποδίον": "ὑποπόδιον",  // G52860 ὑποπόδιον (3 occurences) + ὑποποδίον (only in 25002001)
            "ὀλιγοψύχος": "ὀλιγόψυχος",  // G36420 ὀλιγόψυχος (5 occurences) + ὀλιγοψύχος (only in 23057015)
            "πυρώσις": "πύρωσις",  // G44510 πύρωσις (only in 20027022) + πυρώσις (only in 30004009)
            "ψευδοπροφητής": "ψευδοπροφήτης",  // G55780 ψευδοπροφήτης (9 occurences) + ψευδοπροφητής (only in 24034009)
            "ἐπιεικεία": "ἐπιείκεια",  // G19320 ἐπιείκεια (8 occurences) + ἐπιεικεία (3 occurences)
            "Φιλίππος": "Φίλιππος",  // G53760 Φίλιππος (10 occurences) + Φιλίππος (only in 73006002)
            "Τιμοθέος": "Τιμόθεος",  // G50950 Τιμόθεος (17 occurences) + Τιμοθέος (only in 73005034)
            "Ἀνδρονίκος": "Ἀνδρόνικος",  // G04080 Ἀνδρόνικος (4 occurences) + Ἀνδρονίκος (only in 74004038)
            "Ζεῦς": "Ζεύς",  // G22030 Ζεύς (2 occurences) + Ζεῦς (only in 74011021)
            // G17400 ἐνδοξάζομαι (8 occurences) + ἐνδοξάζω (3 occurences)
            // G46030 σιδηροῦς (49 occurences) + σιδήρεος (only in 19002009)
            // G16700 ἕλκω (44 occurences) + ἑλκύω (only in 5021003)
            // G26240 κατακληρονομέω (62 occurences) + κατακληροδοτέω (2 occurences)
            // G18470 ἐξουδενέω (10 occurences) + ἐξουδενόω (7 occurences)
            // G47660 στρώννυμι (4 occurences) + στρωννύω (4 occurences)
            // G52910 ὑποστρώννυμι (3 occurences) + ὑποστρωννύω (2 occurences)
            // G50720 τετράμηνος (only in 68019002) + τετράμηνον (only in 68020047)
            // G55040 χθές (20 occurences) + ἐχθές (15 occurences)
          }[normalizedLemma] || normalizedLemma
        ).normalize('NFC')

        const lemmaStr = `lemma="${normalizedLemma}" `

        if(lxxWord.morph !== oldMorph) throw `Mismatched morph: ${loc} // ${contentPieces[idx2]} // ${lxxWord.morph} // ${oldMorph}`
        // if(lemmaByOldStrongs[strongs] && lemmaByOldStrongs[strongs] !== lxxWord.lemma) {
        if(lemmaByOldStrongs[strongs] && normalizeSearchStr({ str: lemmaByOldStrongs[strongs] }) !== normalizeSearchStr({ str: lxxWord.lemma })) {
          mismatchedLemmas[`${strongs}: ${lxxWord.lemma} (${normalizeSearchStr({ str: lxxWord.lemma })}) [USED] // ${lemmaByOldStrongs[strongs]} (${normalizeSearchStr({ str: lemmaByOldStrongs[strongs] })})`] = true
        }
        if(lxxWord.strongs && lxxWord.strongs !== strongs) throw `Mismatched strongs: ${loc} // ${contentPieces[idx2]} // ${lxxWord.strongs} // ${strongs}`

        const wordLine = `\\w ${contentPieces[idx2]}|${lemmaStr}${strongsStr}x-morph="${morph}"\\w*\n`

        addToStrongLemmaMap(wordLine, loc)
        outputUsfm += wordLine
      }

      if(book !== (lxxVerses[idx+1] || {}).book) {
        const bookAbbr = getBookAbbr(book)
        console.log(`Write ${bookAbbr}...`)
        await fs.writeFile(`${outputUsfmDir}/${getBookNum(book)}-${bookAbbr || book}.usfm`, outputUsfm)
        outputUsfm = ``
      }

    }

    console.log(``)
    console.log(`Mismatched lemmas:`)
    console.log(Object.keys(mismatchedLemmas).sort().join(`\n`))
    console.log(``)

    logPossibleStrongLemmaIssues()

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

  }

  process.exit()

})()