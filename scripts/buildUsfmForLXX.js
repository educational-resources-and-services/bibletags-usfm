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

let extraStrongsNumber = 60000

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
    const lemmasWithoutStrongs = {}

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
        let strongsStr = /^G/.test(newStrongs) ? `strong="${newStrongs}" ` : ``

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

            "Θαιμάν": "Θαιμαν",  // G60308 Θαιμαν (27 occurences) + Θαιμάν (2 occurences)
            "Ῥαγουήλ": "Ραγουηλ",  // G60310 Ραγουηλ (40 occurences) + Ῥαγουήλ (20 occurences) + Ραγουήλ (2 occurences)
            "Ραγουήλ": "Ραγουηλ",  // G60310 Ραγουηλ (40 occurences) + Ῥαγουήλ (20 occurences) + Ραγουήλ (2 occurences)
            "αβιρα": "Αβιρα",  // G60317 Αβιρα (only in 1025004) + αβιρα (only in 16001001)
            "καῒἐμός": "καῗἐμός",  // G60354 καῗἐμός (7 occurences) + καῒἐμός (only in 76005010)
            "ἀτέκνόω": "ἀτεκνόω",  // G60359 ἀτεκνόω (19 occurences) + ἀτέκνόω (2 occurences)
            "μαελεθ": "Μαελεθ",  // G60361 Μαελεθ (only in 1028009) + μαελεθ (2 occurences)
            "ἐνυπνιάζω": "ἐνὑπνιάζω",  // G60362 ἐνὑπνιάζω (13 occurences) + ἐνυπνιάζω (3 occurences)
            "κλιμάξ": "κλίμαξ",  // G60363 κλίμαξ (3 occurences) + κλιμάξ (only in 16003015) + κλῖμαξ (only in 73005030)
            "κλῖμαξ": "κλίμαξ",  // G60363 κλίμαξ (3 occurences) + κλιμάξ (only in 16003015) + κλῖμαξ (only in 73005030)
            "Βουνός": "βουνός",  // G10150 βουνός (93 occurences) + Βουνός (4 occurences)
            "ισραηλ": "Ἰσραήλ",  // G24740 Ἰσραήλ (2956 occurences) + ισραηλ (only in 80017022)
            "χαβραθα": "Χαβραθα",  // G60424 Χαβραθα (only in 1035016) + χαβραθα (only in 1048007)
            "βενιαμιν": "Βενιαμίν",  // G09580 Βενιαμίν (226 occurences) + βενιαμιν (only in 13007006)
            "ιαμιν": "Ιαμιν",  // G60459 Ιαμιν (9 occurences) + ιαμιν (only in 12025014)
            "Ισμαηλῖτης": "Ισμαηλίτης",  // G60498 Ισμαηλίτης (8 occurences) + Ισμαηλῖτης (only in 19082007)
            "χηρεύσις": "χήρευσις",  // G60512 χήρευσις (4 occurences) + χηρεύσις (2 occurences)
            "φαρες": "Φάρες",  // G53290 Φάρες (20 occurences) + φαρες (4 occurences)
            "ἀμητός": "ἄμητος",  // G60581 ἄμητος (2 occurences) + ἀμητός (21 occurences)
            "Γέσεμ": "Γεσεμ",  // G60583 Γεσεμ (9 occurences) + Γέσεμ (only in 70001009)
            "μαχιρ": "Μαχιρ",  // G60617 Μαχιρ (26 occurences) + μαχιρ (only in 11005027)
            "Ἀσιηλ": "Ασιηλ",  // G60629 Ασιηλ (6 occurences) + Ἀσιηλ (only in 71001001)
            "Ραμεσσή": "Ραμεσση",  // G60634 Ραμεσση (6 occurences) + Ραμεσσή (only in 70001009)
            "στρωμνη": "στρωμνή",  // G60644 στρωμνή (10 occurences) + στρωμνη (only in 19131003)
            "κατοίκος": "κάτοικος",  // G60668 κάτοικος (3 occurences) + κατοίκος (5 occurences)
            "Σορος": "σορός",  // G46730 σορός (2 occurences) + Σορος (only in 13007016)
            "σκύλευω": "σκυλεύω",  // G60695 σκυλεύω (29 occurences) + σκύλευω (only in 73011061)
            "συντάξις": "σύνταξις",  // G60705 σύνταξις (12 occurences) + συντάξις (2 occurences)
            "Χαλαζα": "χάλαζα",  // G54640 χάλαζα (37 occurences) + Χαλαζα (only in 16011005)
            "ὄλυρα": "ὀλύρα",  // G60750 ὀλύρα (only in 2009032) + ὄλυρα (only in 26004009)
            "θεραπαίνα": "θεράπαινα",  // G60757 θεράπαινα (3 occurences) + θεραπαίνα (4 occurences)
            "Μάγδωλος": "Μαγδώλος",  // G60780 Μαγδώλος (only in 2014002) + Μάγδωλος (4 occurences)
            // "ἐνδοξάζω": "ἐνδοξάζομαι",  // G17400 ἐνδοξάζομαι (8 occurences) + ἐνδοξάζω (3 occurences)
            "μολιβός": "μόλιβος",  // G60792 μόλιβος (9 occurences) + μολιβός (3 occurences)
            "Γομορ": "γομορ",  // G60802 γομορ (13 occurences) + Γομορ (only in 2016022)
            "μαν": "Μαν",  // G60805 Μαν (only in 2016031) + μαν (4 occurences)
            "Πέτρα": "πέτρα",  // G40730 πέτρα (100 occurences) + Πέτρα (only in 23042011)
            "πρωῗθεν": "πρωίθεν",  // G60815 πρωίθεν (9 occurences) + πρωῗθεν (only in 11018026)
            "πεντηκοντάρχος": "πεντηκόνταρχος",  // G60818 πεντηκόνταρχος (11 occurences) + πεντηκοντάρχος (2 occurences)
            "Ανω": "ἄνω",  // G05070 ἄνω (39 occurences) + Ανω (4 occurences)
            "Ἐλεύθερος": "ἐλεύθερος",  // G16580 ἐλεύθερος (28 occurences) + Ἐλεύθερος (2 occurences)
            "ῥόα": "ῥοά",  // G60957 ῥοά (20 occurences) + ῥόα (4 occurences)
            "ῥοῗσκος": "ῥοίσκος",  // G60958 ῥοίσκος (6 occurences) + ῥοῗσκος (3 occurences)
            "χρῖσις": "χρίσις",  // G60972 χρίσις (8 occurences) + χρῖσις (7 occurences)
            "Αφαιρεμα": "ἀφαίρεμα",  // G60977 ἀφαίρεμα (39 occurences) + Αφαιρεμα (only in 73011034)
            "Λίβανος": "λίβανος",  // G30300 λίβανος (23 occurences) + Λίβανος (71 occurences) + Λιβάνος (10 occurences)
            "Λιβάνος": "λίβανος",  // G30300 λίβανος (23 occurences) + Λίβανος (71 occurences) + Λιβάνος (10 occurences)
            "ἐμπλοκίον": "ἐμπλόκιον",  // G61032 ἐμπλόκιον (4 occurences) + ἐμπλοκίον (3 occurences)
            "χωνεύσις": "χώνευσις",  // G61061 χώνευσις (only in 2039004) + χωνεύσις (only in 14004003)
            "Χριστός": "χριστός",  // G55470 χριστός (50 occurences) + Χριστός (2 occurences)
            "ἐκχύσις": "ἔκχυσις",  // G61085 ἔκχυσις (2 occurences) + ἐκχύσις (only in 11018028)
            "οἰφί": "οιφι",  // G61093 οιφι (10 occurences) + οἰφί (only in 8002017)
            "ἴβις": "ἶβις",  // G61133 ἶβις (only in 3011017) + ἴβις (only in 23034011)
            "σταθμίον": "στάθμιον",  // G61236 στάθμιον (12 occurences) + σταθμίον (4 occurences)
            "Θεμα": "θέμα",  // G61264 θέμα (8 occurences) + Θεμα (only in 15002053)
            // "σιδήρεος": "σιδηροῦς",  // G46030 σιδηροῦς (49 occurences) + σιδήρεος (only in 19002009)
            "ζηλώσις": "ζήλωσις",  // G61333 ζήλωσις (3 occurences) + ζηλώσις (only in 4005030)
            // "ἑλκύω": "ἕλκω",  // G16700 ἕλκω (44 occurences) + ἑλκύω (only in 5021003)
            "χύτρα": "χύτρᾳ",  // G61358 χύτρᾳ (only in 4011008) + χύτρα (6 occurences)
            "ασηρωθ": "Ασηρωθ",  // G61369 Ασηρωθ (6 occurences) + ασηρωθ (only in 5002023)
            "Αἰθιόπις": "Αἰθιοπίς",  // G61370 Αἰθιοπίς (only in 4012001) + Αἰθιόπις (only in 4012001)
            // "κατακληροδοτέω": "κατακληρονομέω",  // G26240 κατακληρονομέω (62 occurences) + κατακληροδοτέω (2 occurences)
            "Ασμα": "ᾆσμα",  // G61438 ᾆσμα (15 occurences) + Ασμα (only in 13012003)
            "ἐκἀκριβαζομαι": "ἐκἀκριβάζομαι",  // G61466 ἐκἀκριβάζομαι (2 occurences) + ἐκἀκριβαζομαι (only in 18028003)
            "Κιτιαίοι": "Κιτιαῖοι",  // G61480 Κιτιαῖοι (only in 4024024) + Κιτιαίοι (only in 23023001)
            "Ζαραι": "Ζαραῒ",  // G61499 Ζαραῒ (5 occurences) + Ζαραι (only in 13006026)
            "αριηλ": "Αριηλ",  // G61520 Αριηλ (7 occurences) + αριηλ (4 occurences)
            "μάλα": "Μαλα",  // G61541 Μαλα (2 occurences) + μάλα (11 occurences)
            "Δῆλος": "δῆλος",  // G12120 δῆλος (8 occurences) + Δῆλος (only in 73015023)
            "χλίδων": "χλιδῶν",  // G61593 χλιδῶν (3 occurences) + χλίδων (2 occurences) + χλιδών (only in 23003020)
            "χλιδών": "χλιδῶν",  // G61593 χλιδῶν (3 occurences) + χλίδων (2 occurences) + χλιδών (only in 23003020)
            "γαι": "Γαι",  // G61637 Γαι (38 occurences) + γαι (3 occurences)
            "αὐλών": "Αυλων",  // G61678 Αυλων (only in 5001001) + αὐλών (12 occurences)
            "Αραβα": "Ἀραβά",  // G61680 Ἀραβά (12 occurences) + Αραβα (only in 24052007)
            "Μωαβῖτης": "Μωαβίτης",  // G61689 Μωαβίτης (7 occurences) + Μωαβῖτης (only in 5002029)
            "ὑποκάτωθέν": "ὑποκάτωθεν",  // G61732 ὑποκάτωθεν (27 occurences) + ὑποκάτωθέν (only in 77004016)
            "τραγελάφος": "τραγέλαφος",  // G61751 τραγέλαφος (only in 5014005) + τραγελάφος (only in 18039001)
            "Λευείτης": "λευείτης",  // G61759 λευείτης (only in 5014029) + Λευείτης (127 occurences)
            "Δευτερονόμιον": "δευτερονόμιον",  // G61767 δευτερονόμιον (2 occurences) + Δευτερονόμιον (only in 77002001)
            "Ιδουμαίος": "Ιδουμαῖος",  // G61801 Ιδουμαῖος (12 occurences) + Ιδουμαίος (3 occurences)
            "Αμαρια": "ἁμαρία",  // G61806 ἁμαρία (only in 5023022) + Αμαρια (11 occurences)
            "ἐνεχύρον": "ἐνέχυρον",  // G61810 ἐνέχυρον (3 occurences) + ἐνεχύρον (only in 5024012)
            "ἐγκατάλειμμα": "ἐγκαταλείμμα",  // G61819 ἐγκαταλείμμα (only in 5028005) + ἐγκατάλειμμα (5 occurences)
            "Γαλγαλα": "Γάλγαλα",  // G61890 Γάλγαλα (27 occurences) + Γαλγαλα (5 occurences)
            "ἐξομολογήσις": "ἐξομολόγησις",  // G61908 ἐξομολόγησις (24 occurences) + ἐξομολογήσις (2 occurences)
            "δαβιρ": "Δαβιρ",  // G61931 Δαβιρ (16 occurences) + δαβιρ (13 occurences)
            "Γαλααδίτις": "Γαλααδῖτις",  // G61990 Γαλααδῖτις (14 occurences) + Γαλααδίτις (5 occurences)
            "Βασανίτις": "Βασανῖτις",  // G61991 Βασανῖτις (10 occurences) + Βασανίτις (3 occurences)
            "νασιβ": "Νασιβ",  // G62090 Νασιβ (5 occurences) + νασιβ (only in 11016033)
            "Γάζαρα": "Γαζαρα",  // G62149 Γαζαρα (10 occurences) + Γάζαρα (only in 73013043)
            "Καρμήλος": "Κάρμηλος",  // G62262 Κάρμηλος (18 occurences) + Καρμήλος (5 occurences)
            "τυρός": "Τύρος",  // G51840 Τύρος (41 occurences) + τυρός (only in 18010010)
            "Ἴοππης": "Ιόππης",  // G62311 Ιόππης (only in 6019046) + Ἴοππης (only in 69005053)
            "σαλαμιν": "Σαλαμιν",  // G62314 Σαλαμιν (only in 6019050) + σαλαμιν (only in 6022029)
            "Φορος": "φόρος",  // G54110 φόρος (43 occurences) + Φορος (9 occurences)
            "Σίκιμα": "Σικιμα",  // G62351 Σικιμα (49 occurences) + Σίκιμα (only in 79050026)
            "χεττιιν": "Χεττιιν",  // G62365 Χεττιιν (3 occurences) + χεττιιν (only in 12023007)
            "σφύρα": "σφῦρα",  // G62411 σφῦρα (7 occurences) + σφύρα (2 occurences)
            "τερέμινθος": "τερεμίνθος",  // G62434 τερεμίνθος (2 occurences) + τερέμινθος (only in 79024016)
            "Ἅρες": "Αρες",  // G62467 Αρες (2 occurences) + Ἅρες (only in 69005010)
            "ἐκουδενόω": "ἐκοὐδενόω",  // G62490 ἐκοὐδενόω (30 occurences) + ἐκουδενόω (2 occurences)
            "Ἕρμων": "Ερμων",  // G62494 Ερμων (3 occurences) + Ἕρμων (9 occurences)
            "Σιαγών": "σιαγών",  // G46000 σιαγών (29 occurences) + Σιαγών (only in 68015014)
            "χαλκείος": "χάλκειος",  // G62540 χάλκειος (6 occurences) + χαλκείος (only in 14035013)
            "ἐξιχνίαζω": "ἐξιχνιάζω",  // G62549 ἐξιχνιάζω (7 occurences) + ἐξιχνίαζω (only in 18010006)
            "Διακοπή": "διακοπή",  // G62571 διακοπή (10 occurences) + Διακοπή (only in 13013011)
            "Μωαβίτις": "Μωαβῖτις",  // G62578 Μωαβῖτις (16 occurences) + Μωαβίτις (4 occurences)
            "Νεβελ": "νεβελ",  // G62612 νεβελ (2 occurences) + Νεβελ (only in 10016001)
            "βαμα": "Βαμα",  // G62659 Βαμα (9 occurences) + βαμα (only in 14001013)
            "οἴωνισμα": "οἰώνισμα",  // G62718 οἰώνισμα (2 occurences) + οἴωνισμα (only in 24034009)
            "Ζιφαίος": "Ζιφαῖος",  // G62771 Ζιφαῖος (3 occurences) + Ζιφαίος (only in 19053002)
            "Ἰεζραηλῖτις": "Ιεζραηλῖτις",  // G62803 Ιεζραηλῖτις (6 occurences) + Ἰεζραηλῖτις (only in 10003002)
            "Γεδδουρ": "γεδδουρ",  // G62815 γεδδουρ (5 occurences) + Γεδδουρ (only in 69005030)
            "Βαανά": "Βαανα",  // G62874 Βαανα (13 occurences) + Βαανά (only in 69005008)
            "χερουβιν": "Χερουβιν",  // G62902 Χερουβιν (only in 10006002) + χερουβιν (26 occurences)
            "μίσος": "μῖσος",  // G62956 μῖσος (10 occurences) + μίσος (2 occurences)
            "χερεθθι": "Χερεθθι",  // G62978 Χερεθθι (3 occurences) + χερεθθι (3 occurences)
            "φελεθθι": "Φελεθθι",  // G62979 Φελεθθι (3 occurences) + φελεθθι (3 occurences)
            "Αμεσσαι": "Αμεσσαῒ",  // G62998 Αμεσσαῒ (12 occurences) + Αμεσσαι (only in 16011013)
            "σαφφωθ": "Σαφφωθ",  // G63005 Σαφφωθ (only in 10017029) + σαφφωθ (only in 24052019)
            // "εἰδώ": "εἶδον",  // G14920 εἶδον (8 occurences) + εἰδώ (only in 16010029)
            "Σουσά": "Σουσα",  // G63025 Σουσα (2 occurences) + Σουσά (13 occurences) + Σοῦσα (2 occurences)
            "Σοῦσα": "Σουσα",  // G63025 Σουσα (2 occurences) + Σουσά (13 occurences) + Σοῦσα (2 occurences)
            "ἐξηλίαζω": "ἐξηλιάζω",  // G63027 ἐξηλιάζω (2 occurences) + ἐξηλίαζω (only in 10021009)
            "Αῒα": "Αια",  // G63028 Αια (7 occurences) + Αῒα (only in 16010027)
            "θεμελίον": "θεμέλιον",  // G63051 θεμέλιον (44 occurences) + θεμελίον (only in 70016015)
            "μονοζώνος": "μονόζωνος",  // G63060 μονόζωνος (9 occurences) + μονοζώνος (only in 18029025)
            "Σαμαῒ": "Σαμαι",  // G63079 Σαμαι (4 occurences) + Σαμαῒ (only in 13008021)
            "Αδωνιας": "Αδωνίας",  // G63128 Αδωνίας (22 occurences) + Αδωνιας (only in 14017008)
            "ἔπαλξις": "ἐπάλξις",  // G63139 ἐπάλξις (3 occurences) + ἔπαλξις (4 occurences)
            "Εδραι": "Εδραῒ",  // G63154 Εδραῒ (2 occurences) + Εδραι (only in 67015021)
            "Σχεδία": "σχεδία",  // G63205 σχεδία (5 occurences) + Σχεδία (only in 75004011)
            "χυτρόκαυλος": "χυτροκαύλος",  // G63235 χυτροκαύλος (2 occurences) + χυτρόκαυλος (2 occurences)
            "χωνευτήριον": "χωνευτηρίον",  // G63254 χωνευτηρίον (2 occurences) + χωνευτήριον (3 occurences)
            "Αμμανῖτις": "Αμμανίτις",  // G63272 Αμμανίτις (2 occurences) + Αμμανῖτις (3 occurences)
            "Σαμαίας": "Σαμαιας",  // G63293 Σαμαιας (25 occurences) + Σαμαίας (only in 69008043)
            "συσκίος": "σύσκιος",  // G63303 σύσκιος (2 occurences) + συσκίος (only in 26006013)
            "αιν": "Αιν",  // G63314 Αιν (4 occurences) + αιν (2 occurences)
            "συνάψις": "σύναψις",  // G63325 σύναψις (only in 11016020) + συνάψις (only in 12010034)
            "Σεδεκίας": "Σεδεκιας",  // G63379 Σεδεκιας (48 occurences) + Σεδεκίας (2 occurences)
            "Μωσά": "Μωσα",  // G63398 Μωσα (only in 12003004) + Μωσά (only in 13002046)
            "παραθέσις": "παράθεσις",  // G63420 παράθεσις (7 occurences) + παραθέσις (only in 73006053)
            "εἰσὁδιάζω": "εἰσοδιάζω",  // G63458 εἰσοδιάζω (only in 12012005) + εἰσὁδιάζω (only in 14034014)
            "Ἀζαρίας": "Αζαριας",  // G63482 Αζαριας (66 occurences) + Ἀζαρίας (5 occurences)
            "Μῆδοι": "Μήδοι",  // G63512 Μήδοι (2 occurences) + Μῆδοι (5 occurences)
            "Σενναχηρίμ": "Σενναχηριμ",  // G63527 Σενναχηριμ (21 occurences) + Σενναχηρίμ (only in 74015022)
            "Ῥαψάκης": "Ραψακης",  // G63529 Ραψακης (15 occurences) + Ῥαψάκης (only in 79048018)
            // "ἐξουδενόω": "ἐξουδενέω",  // G18470 ἐξουδενέω (10 occurences) + ἐξουδενόω (7 occurences)
            "Ναβουχοδονοσόρ": "Ναβουχοδονοσορ",  // G63595 Ναβουχοδονοσορ (128 occurences) + Ναβουχοδονοσόρ (only in 71014015)
            "Σαραίας": "Σαραιας",  // G63607 Σαραιας (11 occurences) + Σαραίας (only in 69005005)
            "Σοφονιας": "Σοφονίας",  // G63608 Σοφονίας (3 occurences) + Σοφονιας (5 occurences)
            "Ιεζονιας": "Ιεζονίας",  // G63613 Ιεζονίας (only in 12025023) + Ιεζονιας (4 occurences)
            "εφραθ": "Εφραθ",  // G63660 Εφραθ (only in 13002019) + εφραθ (only in 13004021)
            "Σαλουμ": "Σαλούμ",  // G63686 Σαλούμ (3 occurences) + Σαλουμ (6 occurences)
            "ῥάγμα": "Ραγμα",  // G63781 Ραγμα (2 occurences) + ῥάγμα (only in 30006011)
            "γεδωρ": "Γεδωρ",  // G63784 Γεδωρ (5 occurences) + γεδωρ (only in 13012008)
            "Σαραιά": "Σαραια",  // G63806 Σαραια (9 occurences) + Σαραιά (only in 69008001)
            "Σαμαρία": "Σαμαρια",  // G64273 Σαμαρια (4 occurences) + Σαμαρία (6 occurences)
            "Ἐδνά": "Εδνα",  // G64284 Εδνα (8 occurences) + Ἐδνά (4 occurences) + Ἑδνά (only in 71007015) + Εδνά (only in 71010014)
            "Ἑδνά": "Εδνα",  // G64284 Εδνα (8 occurences) + Ἐδνά (4 occurences) + Ἑδνά (only in 71007015) + Εδνά (only in 71010014)
            "Εδνά": "Εδνα",  // G64284 Εδνα (8 occurences) + Ἐδνά (4 occurences) + Ἑδνά (only in 71007015) + Εδνά (only in 71010014)
            "Ἐπιφανής": "ἐπιφανής",  // G20160 ἐπιφανής (14 occurences) + Ἐπιφανής (7 occurences)
            "ἡνία": "Ηνια",  // G64404 Ηνια (only in 13025009) + ἡνία (2 occurences)
            "Ῥαφαήλ": "Ραφαηλ",  // G64421 Ραφαηλ (16 occurences) + Ῥαφαήλ (8 occurences)
            "κατόρθωσις": "Κατόρθωσις",  // G64499 Κατόρθωσις (only in 14003017) + κατόρθωσις (2 occurences)
            "ισανα": "Ισανα",  // G64538 Ισανα (2 occurences) + ισανα (only in 16012039)
            "Ἀμαρίας": "Αμαριας",  // G64553 Αμαριας (3 occurences) + Ἀμαρίας (only in 69008002)
            "Φασεκ": "φασεκ",  // G64603 φασεκ (7 occurences) + Φασεκ (only in 16003006)
            "τριετῆς": "τριετής",  // G64611 τριετής (3 occurences) + τριετῆς (only in 74014001)
            "τετράπεδος": "τετραπέδος",  // G64622 τετραπέδος (only in 14034011) + τετράπεδος (only in 24052004)
            "κατεναντιόν": "κατεναντίον",  // G64627 κατεναντίον (3 occurences) + κατεναντιόν (only in 19043016)
            "Περσής": "Πέρσης",  // G64637 Πέρσης (65 occurences) + Περσής (3 occurences)
            "Μαρδοχαῖος": "Μαρδοχαιος",  // G64646 Μαρδοχαιος (2 occurences) + Μαρδοχαῖος (58 occurences)
            "Αδίν": "Αδιν",  // G64659 Αδιν (2 occurences) + Αδίν (2 occurences)
            "Δαρείος": "Δαρεῖος",  // G64744 Δαρεῖος (53 occurences) + Δαρείος (4 occurences)
            "Βαβυλωνίος": "Βαβυλώνιος",  // G64757 Βαβυλώνιος (4 occurences) + Βαβυλωνίος (5 occurences)
            "Ἁγγαῖος": "Αγγαιος",  // G64765 Αγγαιος (11 occurences) + Ἁγγαῖος (only in 69007003)
            "Ἔσδρας": "Εσδρας",  // G64783 Εσδρας (37 occurences) + Ἔσδρας (2 occurences)
            "Ἐλναθάν": "Ελναθαν",  // G64812 Ελναθαν (4 occurences) + Ἐλναθάν (only in 69008043)
            "κάμπη": "καμπή",  // G64944 καμπή (2 occurences) + κάμπη (3 occurences)
            "Αμμανείτης": "ἀμμανείτης",  // G64955 ἀμμανείτης (only in 16003035) + Αμμανείτης (only in 16004001)
            "σαβι": "Σαβι",  // G64985 Σαβι (only in 16007045) + σαβι (3 occurences)
            "δόρκων": "Δορκων",  // G65008 Δορκων (only in 16007058) + δόρκων (only in 22002017)
            "συνέτιζω": "συνετίζω",  // G65021 συνετίζω (10 occurences) + συνέτιζω (5 occurences)
            "ὑπερηφανεύομαι": "ὑπερἠφανεύομαι",  // G65028 ὑπερἠφανεύομαι (2 occurences) + ὑπερηφανεύομαι (2 occurences)
            "Βηβαί": "Βηβαι",  // G65046 Βηβαι (4 occurences) + Βηβαί (only in 69005013)
            "Σεμεῒας": "Σεμειας",  // G65109 Σεμειας (only in 16012042) + Σεμεῒας (2 occurences) + Σεμείας (only in 71005014)
            "Σεμείας": "Σεμειας",  // G65109 Σεμειας (only in 16012042) + Σεμεῒας (2 occurences) + Σεμείας (only in 71005014)
            "Ινδική": "Ἰνδική",  // G65127 Ἰνδική (7 occurences) + Ινδική (only in 27003001)
            "Μουχαῖος": "Μουχαιος",  // G65150 Μουχαιος (only in 17001033) + Μουχαῖος (only in 17001038)
            // "στρωννύω": "στρώννυμι",  // G47660 στρώννυμι (4 occurences) + στρωννύω (4 occurences)
            "ἐκλύσις": "ἔκλυσις",  // G65208 ἔκλυσις (5 occurences) + ἐκλύσις (only in 23021003)
            "Εὐεργέτης": "εὐεργέτης",  // G21100 εὐεργέτης (6 occurences) + Εὐεργέτης (only in 79000027)
            "Πτολεμαίος": "Πτολεμαῖος",  // G65254 Πτολεμαῖος (30 occurences) + Πτολεμαίος (only in 76004022)
            "Αυσίτις": "Αυσῖτις",  // G65258 Αυσῖτις (only in 18001001) + Αυσίτις (2 occurences)
            "Αταρ": "ἀτάρ",  // G65307 ἀτάρ (2 occurences) + Αταρ (only in 69005028)
            "Ἕσπερος": "ἕσπερος",  // G65326 ἕσπερος (only in 18009009) + Ἕσπερος (only in 18038032)
            "ἀσίδα": "ασιδα",  // G65493 ασιδα (only in 18039013) + ἀσίδα (only in 24008007)
            "ἱκετήριος": "ἱκετηρίος",  // G65504 ἱκετηρίος (only in 18040027) + ἱκετήριος (only in 74009018)
            "κασία": "Κασία",  // G65521 Κασία (only in 18042014) + κασία (2 occurences)
            "ψαλῶ": "ψάλω",  // G65598 ψάλω (11 occurences) + ψαλῶ (only in 19145002)
            "ἱκέτης": "ἱκετής",  // G65643 ἱκετής (only in 19073023) + ἱκέτης (3 occurences)
            "καταπραύνω": "καταπραῧνω",  // G65667 καταπραῧνω (3 occurences) + καταπραύνω (only in 74013026)
            "πυργόβαρις": "πυργοβάρις",  // G65754 πυργοβάρις (only in 19121007) + πυργόβαρις (only in 80008020)
            "σχοίνος": "σχοῖνος",  // G65763 σχοῖνος (3 occurences) + σχοίνος (2 occurences)
            "Ῥώμη": "ῥώμη",  // G45160 ῥώμη (3 occurences) + Ῥώμη (12 occurences)
            "ὑβριστός": "ὕβριστος",  // G65824 ὕβριστος (only in 20006021) + ὑβριστός (only in 79008011)
            "ἐναντιόομαι": "ἐνἀντιόομαι",  // G65919 ἐνἀντιόομαι (3 occurences) + ἐναντιόομαι (only in 69008051)
            "καταράω": "καταῥάω",  // G65975 καταῥάω (only in 20027014) + καταράω (only in 80003010)
            "Κύπρος": "κύπρος",  // G29540 κύπρος (2 occurences) + Κύπρος (2 occurences)
            "σωρηκ": "σωρήκ",  // G66116 σωρήκ (only in 23005002) + σωρηκ (only in 77010003)
            "ἐχίνος": "ἐχῖνος",  // G66149 ἐχῖνος (4 occurences) + ἐχίνος (only in 23014023)
            "πλάνησις": "πλανήσις",  // G66176 πλανήσις (only in 23019014) + πλάνησις (10 occurences)
            "ἔριθος": "ἐρίθος",  // G66224 ἐρίθος (only in 23038012) + ἔριθος (only in 77011012)
            // "ὑποστρωννύω": "ὑποστρώννυμι",  // G52910 ὑποστρώννυμι (3 occurences) + ὑποστρωννύω (2 occurences)
            "ὑείος": "ὕειος",  // G66288 ὕειος (8 occurences) + ὑείος (only in 76006015)
            "ἔμπαιγμα": "ἐμπαίγμα",  // G66289 ἐμπαίγμα (only in 23066004) + ἔμπαιγμα (only in 78017007)
            "Ταφνάς": "Ταφνας",  // G66296 Ταφνας (6 occurences) + Ταφνάς (only in 70001009)
            "πολυάνδριον": "πολυανδρῖον",  // G66300 πολυανδρῖον (only in 24002023) + πολυάνδριον (10 occurences)
            "κάλαθος": "καλάθος",  // G66373 καλάθος (only in 24024001) + κάλαθος (2 occurences)
            "σμῖλαξ": "σμίλαξ",  // G66378 σμίλαξ (only in 24026014) + σμῖλαξ (only in 34001010)
            "ἑλληνικός": "Ἑλληνικός",  // G16730 Ἑλληνικός (7 occurences) + ἑλληνικός (only in 74006009)
            "ἰταβύριον": "Ἰταβύριον",  // G66381 Ἰταβύριον (only in 24026018) + ἰταβύριον (only in 28005001)
            "συμμικτός": "σύμμικτος",  // G66392 σύμμικτος (3 occurences) + συμμικτός (11 occurences) + σύμμικτός (only in 34003017)
            "σύμμικτός": "σύμμικτος",  // G66392 σύμμικτος (3 occurences) + συμμικτός (11 occurences) + σύμμικτός (only in 34003017)
            "ναζιραίος": "ναζιραῖος",  // G66525 ναζιραῖος (4 occurences) + ναζιραίος (only in 73003049)
            "ἐκτάσις": "ἔκτασις",  // G66579 ἔκτασις (only in 26017003) + ἐκτάσις (only in 68016014)
            "ἐλέφας": "ἔλεφας",  // G66630 ἔλεφας (only in 26027006) + ἐλέφας (12 occurences)
            "θεῒμ": "θείμ",  // G66661 θείμ (2 occurences) + θεῒμ (only in 26040016)
            "ῥοίζος": "ῥοῖζος",  // G66684 ῥοῖζος (3 occurences) + ῥοίζος (only in 84001036)
            "εἰδώλιον": "εἰδωλῖον",  // G66698 εἰδωλῖον (only in 27001002) + εἰδώλιον (3 occurences)
            "ἐπιτείνω": "ἐπιτεινώ",  // G66748 ἐπιτεινώ (only in 27007006) + ἐπιτείνω (6 occurences)
            "Ἐλυμαῗς": "Ἐλυμαίς",  // G66752 Ἐλυμαίς (2 occurences) + Ἐλυμαῗς (only in 73006001)
            "Ἰωσείας": "Ιωσείας",  // G66887 Ιωσείας (only in 38006010) + Ἰωσείας (2 occurences)
            "τετράμηνον": "τετράμηνος",  // G50720 τετράμηνος (only in 68019002) + τετράμηνον (only in 68020047)
            "ἐνἀντιόω": "ἐναντιόω",  // G67143 ἐναντιόω (only in 69001025) + ἐνἀντιόω (3 occurences)
            "Ιερουσολημ": "Ἰερουσολημ",  // G67149 Ἰερουσολημ (only in 69001047) + Ιερουσολημ (2 occurences)
            "Ραούμος": "Ραουμος",  // G67155 Ραουμος (3 occurences) + Ραούμος (only in 69002019)
            "Σαμσαίος": "Σαμσαῖος",  // G67157 Σαμσαῖος (3 occurences) + Σαμσαίος (only in 69002019)
            "Ζαραιας": "Ζαραίας",  // G67178 Ζαραίας (2 occurences) + Ζαραιας (only in 69008034)
            "Ωλαμος": "Ὤλαμος",  // G67185 Ὤλαμος (only in 69005012) + Ωλαμος (only in 69009030)
            "Ελεαζαρος": "Ἐλεάζαρος",  // G67344 Ἐλεάζαρος (only in 69008043) + Ελεαζαρος (21 occurences) + Ελεάζαρος (2 occurences)
            "Ελεάζαρος": "Ἐλεάζαρος",  // G67344 Ἐλεάζαρος (only in 69008043) + Ελεαζαρος (21 occurences) + Ελεάζαρος (2 occurences)
            "Ιωριβος": "Ἰώριβος",  // G67347 Ἰώριβος (only in 69008043) + Ιωριβος (only in 69009019)
            "Ελιασιβος": "Ἐλιάσιβος",  // G67368 Ἐλιάσιβος (only in 69009001) + Ελιασιβος (2 occurences)
            "Ιωναθας": "Ἰωνάθας",  // G67370 Ἰωνάθας (only in 69009014) + Ιωναθας (2 occurences)
            "Αζαηλος": "Ἀζάηλος",  // G67371 Ἀζάηλος (only in 69009014) + Αζαηλος (only in 69009034)
            "Ιώσηπος": "Ιωσηπος",  // G67449 Ιωσηπος (4 occurences) + Ιώσηπος (only in 74010019)
            "Ανανιηλ": "Ἁνανιηλ",  // G67547 Ἁνανιηλ (only in 71001001) + Ανανιηλ (2 occurences)
            "Αδουηλ": "Ἀδουηλ",  // G67548 Ἀδουηλ (only in 71001001) + Αδουηλ (only in 72001001)
            "Γαβαήλ": "Γαβαηλ",  // G67549 Γαβαηλ (4 occurences) + Γαβαήλ (3 occurences)
            "Ενεμεσσαρος": "Ἐνεμέσσαρος",  // G67550 Ἐνεμέσσαρος (4 occurences) + Ενεμεσσαρος (3 occurences)
            "Θισβη": "Θίσβη",  // G67551 Θίσβη (only in 71001002) + Θισβη (only in 72001002)
            "Γαβαήλος": "Γαβάηλος",  // G67557 Γαβάηλος (8 occurences) + Γαβαήλος (only in 72004020)
            "Ἀχιάχαρος": "Αχιαχαρος",  // G67562 Αχιαχαρος (4 occurences) + Ἀχιάχαρος (5 occurences)
            "Αναηλ": "Ἁναηλ",  // G67563 Ἁναηλ (only in 71001021) + Αναηλ (only in 72001021)
            "ἐξάδελφός": "ἐξάδελφος",  // G67567 ἐξάδελφος (3 occurences) + ἐξάδελφός (only in 72001022)
            "Ασμοδαῖος": "Ἀσμοδαῖος",  // G67576 Ἀσμοδαῖος (2 occurences) + Ασμοδαῖος (only in 72003008) + Ασμοδαιος (only in 72003017)
            "Ασμοδαιος": "Ἀσμοδαῖος",  // G67576 Ἀσμοδαῖος (2 occurences) + Ασμοδαῖος (only in 72003008) + Ασμοδαιος (only in 72003017)
            "ἀντίοχος": "Ἀντίοχος",  // G67652 Ἀντίοχος (62 occurences) + ἀντίοχος (only in 73015025)
            "Απολλώνιος": "Ἀπολλώνιος",  // G67675 Ἀπολλώνιος (18 occurences) + Απολλώνιος (only in 73010079)
            "πτοή": "πτόη",  // G67680 πτόη (only in 73003025) + πτοή (only in 75006017)
            "Ιάμνεια": "Ιαμνεία",  // G67690 Ιαμνεία (3 occurences) + Ιάμνεια (3 occurences)
            "Σέλευκος": "Σελεύκος",  // G67728 Σελεύκος (only in 73007001) + Σέλευκος (9 occurences)
            "εὐμενής": "Εὐμενής",  // G67740 Εὐμενής (only in 73008008) + εὐμενής (2 occurences)
            "συμμάχος": "σύμμαχος",  // G67744 σύμμαχος (10 occurences) + συμμάχος (2 occurences) + συμμαχός (only in 73008028)
            "συμμαχός": "σύμμαχος",  // G67744 σύμμαχος (10 occurences) + συμμάχος (2 occurences) + συμμαχός (only in 73008028)
            "σῷος": "σῶος",  // G67903 σῶος (4 occurences) + σῷος (2 occurences)
            "φιλομήτωρ": "Φιλομήτωρ",  // G67952 Φιλομήτωρ (3 occurences) + φιλομήτωρ (only in 76015010)
            "Γενναίος": "γενναῖος",  // G68050 γενναῖος (12 occurences) + Γενναίος (only in 74012002)
            "Ιοππίτης": "Ἰοππίτης",  // G68176 Ἰοππίτης (only in 74012003) + Ιοππίτης (only in 74012007)
            "ἐπικρατεία": "ἐπικράτεια",  // G68544 ἐπικράτεια (3 occurences) + ἐπικρατεία (only in 76006032)
            "Ὀνείας": "Ονειας",  // G68583 Ονειας (2 occurences) + Ὀνείας (only in 79050001)
            "συμπάθεια": "συμπαθεία",  // G68628 συμπαθεία (only in 76006013) + συμπάθεια (6 occurences)
            "προἀσπίζω": "προασπίζω",  // G68635 προασπίζω (only in 76006021) + προἀσπίζω (2 occurences)
            "παθοκρατεία": "παθοκράτεια",  // G68744 παθοκράτεια (only in 76013005) + παθοκρατεία (only in 76013016)

            "Θεός": "θεός",  // G23160 θεός (4008 occurences) + Θεός (only in 9028013)
            "Ανα": "ἀνά",  // G03030 ἀνά (375 occurences) + Ανα (12 occurences)
            "Ἀνατολή": "ἀνατολή",  // G03950 ἀνατολή (192 occurences) + Ἀνατολή (2 occurences)
            "Ως": "ὡς",  // G56130 ὡς (2055 occurences) + Ως (3 occurences)
            // "Χερούβ": "χερουβιμ",  // G55020 χερουβιμ (14 occurences) + Χερούβ (only in 10022011)
            "ψαλτήρίον": "ψαλτήριον",  // G60037 ψαλτήριον (24 occurences) + ψαλτήρίον (only in 78019018)
            "καταγαίος": "κατάγαιος",  // G60052 κατάγαιος (only in 1006016) + καταγαίος (only in 80008010)
            "θαρσις": "Θαρσις",  // G60078 Θαρσις (19 occurences) + θαρσις (4 occurences)
            "Αράδιος": "Ἀράδιος",  // G60116 Ἀράδιος (only in 1010018) + Αράδιος (2 occurences)
            "αιλαμ": "Αιλαμ",  // G60123 Αιλαμ (26 occurences) + αιλαμ (41 occurences)
            "Φερεζαίος": "Φερεζαῖος",  // G60160 Φερεζαῖος (28 occurences) + Φερεζαίος (only in 5003005)
            "Βασιλεύς": "βασιλεύς",  // G09350 βασιλεύς (3442 occurences) + Βασιλεύς (only in 14018031)
            "Φρέαρ": "φρέαρ",  // G54210 φρέαρ (56 occurences) + Φρέαρ (3 occurences)
            "ἀντιπροσώπος": "ἀντιπρόσωπος",  // G60205 ἀντιπρόσωπος (4 occurences) + ἀντιπροσώπος (2 occurences)
            "Ηλιος": "ἥλιος",  // G22460 ἥλιος (214 occurences) + Ηλιος (only in 70008001)
            "Εἰρήνη": "εἰρήνη",  // G15150 εἰρήνη (294 occurences) + Εἰρήνη (only in 12004026)
            "Ναῒ": "ναί",  // G34830 ναί (7 occurences) + Ναῒ (only in 7001031)
            "Αρα": "ἀρά",  // G06850 ἀρά (32 occurences) + Αρα (2 occurences)
            // "Μαδιαν": "Μαδιάμ",  // G30990 Μαδιάμ (88 occurences) + Μαδιαν (8 occurences)
            
            // G31370 Μαριάμ (15 occurences) + Μαρια (only in 77009001)
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
        const accentlessLemma = normalizeSearchStr({ str: normalizedLemma })
        if(!strongsStr) {
          if(!lemmasWithoutStrongs[accentlessLemma]) {
            // lookup strongs before and after, and make a new entry
            const [
              [[ existingDefinition ]],
              // [[ previousDefinition ]],
              // [[ nextDefinition ]],
            ] = await Promise.all([
              connection.query(`SELECT * FROM definitions WHERE nakedLex="${accentlessLemma}" LIMIT 1`),
              // connection.query(`SELECT id, nakedLex FROM definitions WHERE nakedLex<"${accentlessLemma}" ORDER BY nakedLex DESC LIMIT 1`),
              // connection.query(`SELECT id, nakedLex FROM definitions WHERE nakedLex>"${accentlessLemma}" ORDER BY nakedLex LIMIT 1`),
            ])
            if(existingDefinition) {
              // console.log(`Found existing strongs for lemma missing on in old table: ${existingDefinition.id} // ${lxxWord.lemma} (${accentlessLemma}) // ${JSON.stringify(existingDefinition)}`)
              lemmasWithoutStrongs[accentlessLemma] = existingDefinition.id
            } else {
              lemmasWithoutStrongs[accentlessLemma] = `G${extraStrongsNumber++}`
              // const beforeAndAfter = [
              //   {
              //     strongsInt: parseInt(previousDefinition.id.slice(1), 10),
              //     nakedLex: previousDefinition.nakedLex,
              //   },
              //   {
              //     strongsInt: parseInt(nextDefinition.id.slice(1), 10),
              //     nakedLex: nextDefinition.nakedLex,
              //   },
              // ]
              // Object.keys(lemmasWithoutStrongs).forEach(lemma => {
              //   const strongsInt = parseInt(lemmasWithoutStrongs[lemma].slice(1), 10)
              //   if(strongsInt > beforeAndAfter[0].strongsInt && strongsInt < beforeAndAfter[1].strongsInt) {
              //     beforeAndAfter[lemma < accentlessLemma ? 0 : 1] = {
              //       strongsInt,
              //       nakedLex: lemma,
              //     }
              //   }
              // })
              // const strongsIdToAdd = `G${`000${parseInt((beforeAndAfter[0].strongsInt + beforeAndAfter[1].strongsInt) / 2, 10)}`.slice(-5)}`
              // if(strongsIdToAdd === previousDefinition.id || strongsIdToAdd === nextDefinition.id) {
              //   console.log(`\n*** WARNING ***\nNo numeric room left: ${JSON.stringify(beforeAndAfter)}\n`)
              //   lemmasWithoutStrongs[accentlessLemma] = `G${extraStrongsNumber++}`
              // } else {
              //   lemmasWithoutStrongs[accentlessLemma] = strongsIdToAdd
              // }
            }
          }
          strongsStr = `strong="${lemmasWithoutStrongs[accentlessLemma]}" `
        }

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
    console.log(`Missing strongs: ${extraStrongsNumber - 60000} strongs numbers created.`)
    console.log(``)

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