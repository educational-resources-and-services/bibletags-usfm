const utils = {

  stripGreekAccents: str => {
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

    return str
  },

  stripHebrewVowelsEtc: str => (
    str
      .replace(/[\u05B0-\u05BC\u05C1\u05C2\u05C4]/g,'')  // vowels
      .replace(/[\u0591-\u05AF\u05A5\u05BD\u05BF\u05C5\u05C7]/g,'')  // cantilation
      .replace(/\u200D/g,'')  // invalid character
  ),

}
  
module.exports = utils
