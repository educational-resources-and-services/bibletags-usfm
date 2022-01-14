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

const utils = {

  normalizeGreek: str => {
    const mappings = {
      "α": /[ἀἁἂἃἄἅἆἇάὰάᾀᾁᾂᾃᾄᾅᾆᾇᾰᾱᾲᾳᾴᾶᾷ]/g,
      "Α": /[ἈἉἊἋἌἍἎἏΆᾈᾉᾊᾋᾌᾍᾎᾏᾸᾹᾺΆᾼ]/g,
      "ε": /[ἐἑἒἓἔἕέὲέ]/g,
      "Ε": /[ἘἙἚἛἜἝῈΈΈ]/g,
      "η": /[ἠἡἢἣἤἥἦἧὴήᾐᾑᾒᾓᾔᾕᾖᾗῂῃῄῆῇή]/g,
      "Η": /[ἨἩἪἫἬἭἮἯᾘᾙᾚᾛᾜᾝᾞᾟῊΉῌΉ]/g,
      "ι": /[ἰἱἲἳἴἵἶἷὶίῐῑῒΐῖῗΐίϊ]/g,
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
    str = str.replace(/[,.·]/g, '')

    return str
  },

  stripHebrewVowelsEtc: str => (
    str
      .replace(/[\u05B0-\u05BC\u05C1\u05C2\u05C4]/g,'')  // vowels
      .replace(/[\u0591-\u05AF\u05A5\u05BD\u05BF\u05C5\u05C7]/g,'')  // cantilation
      .replace(/\u200D/g,'')  // invalid character
  ),

  getRandomId: () => {
    const getChar = () => alphaChar[parseInt(Math.random() * alphaChar.length, 10)]
    return getChar() + getChar() + getChar()
  },

  getWordKey: ({ wordUsfm, loc, wordNum, version }) => {
    const [ x1, lemma ] = wordUsfm.match(/lemma="([^"]*)"/) || []
    const [ x2, strong ] = wordUsfm.match(/strong="([^"]*)"/) || []
    const [ x3, morph ] = wordUsfm.match(/x-morph="([^"]*)"/) || []

    const wordKey = [
      lemma,
      strong,
      morph,
      loc,
      wordNum,
      version,
    ].join(' ')

    return wordKey
  },

  getUsfmByLoc: usfm => {
    const usfmPieces = usfm.split(/(\\[cv] [0-9]+)/g)

    const usfmByLoc = {}
    const book = `0${bookNames.indexOf((usfm.match(/\\id ([A-Z1-3]{3})/) || [])[1])}`.slice(-2)
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

    return usfmByLoc
  },

}
  
module.exports = utils
