const numChars = `0123456789`
const lowerCaseChars = `abcdefghijklmnopqrstuvwxyz`
const upperCaseChars = lowerCaseChars.toUpperCase()
const alphaChar = numChars + lowerCaseChars + upperCaseChars

const bookNames = [
  "",
  "GEN",
  "EXO",
  "LEV",
  "NUM",
  "DEU",
  "JOS",
  "JDG",
  "RUT",
  "1SA",
  "2SA",
  "1KI",
  "2KI",
  "1CH",
  "2CH",
  "EZR",
  "NEH",
  "EST",
  "JOB",
  "PSA",
  "PRO",
  "ECC",
  "SNG",
  "ISA",
  "JER",
  "LAM",
  "EZK",
  "DAN",
  "HOS",
  "JOL",
  "AMO",
  "OBA",
  "JON",
  "MIC",
  "NAM",
  "HAB",
  "ZEP",
  "HAG",
  "ZEC",
  "MAL",
  "MAT",
  "MRK",
  "LUK",
  "JHN",
  "ACT",
  "ROM",
  "1CO",
  "2CO",
  "GAL",
  "EPH",
  "PHP",
  "COL",
  "1TH",
  "2TH",
  "1TI",
  "2TI",
  "TIT",
  "PHM",
  "HEB",
  "JAS",
  "1PE",
  "2PE",
  "1JN",
  "2JN",
  "3JN",
  "JUD",
  "REV",
]

const strongLemmaMap = {}
const lemmaStrongMap = {}

const normalizeGreek = str => {
  const mappings = {
    "α": /[ἀἁἂἃἄἅἆἇάὰάᾀᾁᾂᾃᾄᾅᾆᾇᾰᾱᾲᾳᾴᾶᾷ]/g,
    "Α": /[ἈἉἊἋἌἍἎἏΆᾈᾉᾊᾋᾌᾍᾎᾏᾸᾹᾺΆᾼ]/g,
    "ε": /[ἐἑἒἓἔἕέὲέ]/g,
    "Ε": /[ἘἙἚἛἜἝῈΈΈ]/g,
    "η": /[ἠἡἢἣἤἥἦἧὴήᾐᾑᾒᾓᾔᾕᾖᾗῂῃῄῆῇή]/g,
    "Η": /[ἨἩἪἫἬἭἮἯᾘᾙᾚᾛᾜᾝᾞᾟῊΉῌΉ]/g,
    "ι": /[ἰἱἲἳἴἵἶἷὶίῐῑῒΐῖῗΐίϊΐί]/g,
    "Ι": /[ἸἹἺἻἼἽἾἿῚΊῘῙΊΪ]/g,
    "ο": /[ὀὁὂὃὄὅὸόό]/g,
    "Ο": /[ὈὉὊὋὌὍῸΌΌ]/g,
    "υ": /[ὐὑὒὓὔὕὖὗὺύῠῡῢΰῦῧΰύϋ]/g,
    "Υ": /[ὙὛὝὟῨῩῪΎΎΫ]/g,
    "ω": /[ὠὡὢὣὤὥὦὧὼώᾠᾡᾢᾣᾤᾥᾦᾧῲῳῴῶῷώ]/g,
    "Ω": /[ὨὩὪὫὬὭὮὯᾨᾩᾪᾫᾬᾭᾮᾯῺΏῼΏ]/g,
    "ρ": /[ῤῥ]/g,
    "Ρ": /[Ῥ]/g,
    "": /[῞ʹ͵΄᾽᾿῍῎῏῝῞῟῭΅`΅´῾῀῁]/g,
  }

  Object.keys(mappings).forEach(char => {
    str = str.replace(mappings[char], char)
  })

  str = str.toLowerCase()
  str = str.replace(/[,.·()’ʼ•:;?⋄–!⸁—⸅;⸄]/g, '')

  // get rid of irrelevant CNTR annotations (see /cntr/transcriptions/#README.txt)
  str = str.replace(/[\\|\/][0-9]*/g, '')
  str = str.replace(/[&*_+\-"'`]/g, '')
  str = str.replace(/  +/g, ' ').trim()

  // swap out supplied words with … (see /cntr/transcriptions/#README.txt)
  str = str.replace(/[~+][^\s]+/g, "…").replace(/…(?: …)+/g, "…")

  return str
}

const stripHebrewVowelsEtc = str => (
  str
    .replace(/[\u05B0-\u05BC\u05C1\u05C2\u05C4]/g,'')  // vowels
    .replace(/[\u0591-\u05AF\u05A5\u05BD\u05BF\u05C5\u05C7]/g,'')  // cantilation
    .replace(/\u200D/g,'')  // invalid character
)

const utils = {

  normalizeGreek,

  stripHebrewVowelsEtc,

  overNormalizeGreek: w => {

    w = w.replace(/[\[\]⟦⟧〚〛]/g, '')

    // Ideally, meaningless spelling difference of a single word would also get normalized here so that they do not receive different id's.
    // However, there is not a safe way to distinguish between a meaningless and meaningful difference at this point.
    // Types of meaningless spelling differences:
      // movable ν
        // However, there are some instances where a difference of only a final ν is NOT due to a movable nu.
      // final α replaced with ’ (e.g., ἀλλʼ for ἀλλά)
      // spelling of proper names like δαυιδ vs δαυειδ

    return w
  },

  getRandomId: () => {
    const getChar = () => alphaChar[parseInt(Math.random() * alphaChar.length, 10)]
    return getChar() + getChar() + getChar()
  },

  getWordKey: ({ wordUsfm, loc, wordNum, version }) => {
    const [ x0, w ] = wordUsfm.match(/\\\+?w (.*?)\|/) || []
    const [ x1, lemma ] = wordUsfm.match(/lemma="([^"]*)"/) || []
    const [ x2, strong ] = wordUsfm.match(/strong="([^"]*)"/) || []
    const [ x3, morph ] = wordUsfm.match(/x-morph="([^"]*)"/) || []

    const wordKey = [
      normalizeGreek(w),
      lemma,
      strong,
      morph,
      loc,
      wordNum,
      version,
    ].join(' ')

    return wordKey
  },

  getVariantWordKey: ({ w, loc, occurrenceInVariants, lemma, strong, morph }) => {
    const wordKey = [
      w,
      loc,
      lemma,
      strong,
      morph,
      occurrenceInVariants,
    ].join(' ')

    return wordKey
  },

  getUsfmByLoc: usfm => {
    const usfmPieces = usfm.split(/(\\[cv] [0-9]+)/g)

    const usfmByLoc = {}
    const book = `0${bookNames.indexOf((usfm.match(/\\id ([A-Z1-3]{3})/) || [])[1])}`.slice(-2)
    let chapter
    let loc = '0'  // loc of `0` for content prior to verse 1

    usfmPieces.forEach((piece, idx) => {
      if(/^\\c [0-9]+$/.test(piece)) {
        chapter = `00${piece.match(/^\\c ([0-9]+)$/)[1]}`.slice(-3)
      } else if(/\\v [0-9]+/.test(piece)) {
        const verse = `00${piece.match(/^\\v ([0-9]+)$/)[1]}`.slice(-3)
        loc = `${book}${chapter}${verse}`
        if(usfmByLoc[loc]) {
          console.log(usfmByLoc[loc])
          console.log(usfmPieces.slice(Math.max(0, idx - 20), idx + 20))
          throw `Hit same verse twice: ${loc}`
        }
      }
      usfmByLoc[loc] = (usfmByLoc[loc] || ``) + piece
    })

    return usfmByLoc
  },

  getReading: ({ readingRaw, lastWordNum }) => {

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
    if(reading === `1-${lastWordNum}`) {
      reading = ``
    }

    return reading
  },

  addToStrongLemmaMap: (usfm, loc) => {
    const [ x1, lemma ] = usfm.match(/lemma="([^"]*)"/) || []
    let [ x2, strong ] = usfm.match(/strong="([^"]*)"/) || []

    if(!strong || !lemma) return
    strong = strong.split(':').pop()

    if(!strongLemmaMap[strong]) {
      strongLemmaMap[strong] = []
    }
    const idx1 = strongLemmaMap[strong].findIndex(({ l }) => l === lemma)
    if(idx1 === -1) {
      strongLemmaMap[strong].push({ l: lemma, locs: [ loc ] })
    } else {
      strongLemmaMap[strong][idx1].locs.push(loc)

    }

    const getStrongish = s => parseInt(s.slice(1).replace(/[a-z]$/, ''), 10)
    const strongish = getStrongish(strong)

    if(!lemmaStrongMap[lemma]) {
      lemmaStrongMap[lemma] = []
    }
    const idx2 = lemmaStrongMap[lemma].findIndex(({ s }) => Math.abs(strongish - getStrongish(s)) <= 60)
    if(idx2 === -1) {
      lemmaStrongMap[lemma].push({ s: strong, locs: [ loc ] })
    } else {
      lemmaStrongMap[lemma][idx2].locs.push(loc)
    }
  },

  logPossibleStrongLemmaIssues: () => {

    console.log(``)
    console.log(`Instances of strongs numbers with multiple lemmas:`)
    for(let strong in strongLemmaMap) {
      if(strongLemmaMap[strong].length > 1) {
        console.log(`${strong} ${strongLemmaMap[strong].map(({ l, locs }) => `${l} (${locs.length === 1 ? `only in ${locs[0]}` : `${locs.length} occurences`})`).join(' + ')}`)
      }
    }

    console.log(``)
    console.log(`Instances of lemmas with multiple, significantly different strongs numbers:`)
    for(let lemma in lemmaStrongMap) {
      if(lemmaStrongMap[lemma].length > 1) {
        console.log(`${lemma} ${lemmaStrongMap[lemma].map(({ s, locs }) => `${s} (${locs.length === 1 ? `only in ${locs[0]}` : `${locs.length} occurences`})`).join(' + ')}`)
      }
    }

  },

}
  
module.exports = utils
