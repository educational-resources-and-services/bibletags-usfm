# Bible Tags

## About

*Original language Bible study for everyone, in every language.*

Vision: That every Christian might have free access to the Bible tagged to the original Hebrew, Aramaic and Greek with parsing and lexical information—all in their own language.

For more information on this project, see the [Bible Tags website](https://bibletags.org).

## Repos

* [bibletags-data](https://github.com/educational-resources-and-services/bibletags-data) **(Contains general information on project design and contributing.)**
* [bibletags-react-native-app](https://github.com/educational-resources-and-services/bibletags-react-native-app)
* [bibletags-ui-helper](https://github.com/educational-resources-and-services/bibletags-ui-helper)
* [bibletags-versification](https://github.com/educational-resources-and-services/bibletags-versification)
* [bibletags-usfm](https://github.com/educational-resources-and-services/bibletags-usfm)
* [bibletags-widget](https://github.com/educational-resources-and-services/bibletags-widget)
* [bibletags-widget-script](https://github.com/educational-resources-and-services/bibletags-widget-script)

## Bugs

* See [here](https://github.com/educational-resources-and-services/bibletags-data/issues).
* Please first check if your bug report / feature request already exists before submitting a new issue.
* For bug reports, please provide a clear description of the problem and step-by-step explanation of how to reproduce it.

# bibletags-usfm

This repo includes the usfm files used in [bibletags-data](https://github.com/educational-resources-and-services/bibletags-data) and [bibletags-react-native-app](https://github.com/educational-resources-and-services/bibletags-react-native-app).

These USFM 3.0 files are derived from [unfoldingword.org/uhb](https://unfoldingword.org/uhb) and [unfoldingword.org/ugnt](https://unfoldingword.org/ugnt).

The following changes have been made via the import scripts:

#### 1. Variant information has been added to the end of all relevant verses using the custom `\zApparatusJson` tag.

  - UHB
    - usfm footnotes with Qere and Ketiv readings have been replaced with the same info in `\zApparatusJson` tags, with `K` and `Q` listed as the source.
    - usfm footnotes indicating "some manuscripts read" (or the like) are have also been replaced with the same info in `\zApparatusJson` tags, with `M` listed as the source.
    - usfm footnotes indicating a BHS reading have also been replaced with the same info in `\zApparatusJson` tags, with `BHS` listed as the source.
    - When a verse does not have Qere and Ketiv readings but does have a `M` or `BHS` reading, the `\zApparatusJson` compares this reading with a source of `WLC`.
  - UGNT
    - For critical texts, punctuation, accents, breathing marks, and capitalization are ignored, since these things are not present in the originals and thus do not represent a different reading or the ancient manuscripts.
    - Refer to CNTR's [README](/cntr/transcriptions/%23README.txt) for information regarding the following special characters used to represent the reading quality of manuscripts: `%^=${}xab`.

##### Expanded and annotated `\zApparatusJson` example from Joshua 9:7

```json
{
  "words": [
    {
      "w": "וַיֹּ֥אמֶר",
      "id": "06zXI",
      "lemma": "אָמַר",
      "strong": "c:H05590",
      "morph": "He,C:Vqw3ms"
    },
    {
      "w": "אכרות",
      "id": "06iwU",
      "lemma": "כָּרַת",
      "strong": "H37720",
      "morph": "He,Vqi1cs"
    }
  ],
  "ancient": [],
  "critical": [
    "Q:+1,2-13",
    "K:1-10,+2,12-13"
  ]
}
```

##### Expanded and annotated `\zApparatusJson` example from Matthew 1:1

```json
{
  "words": [
    // Any time a plus character proceeds a single word or word range below, it means these words come from this `words` array.
    // Without the plus character, the word or word range comes from the UGNT.
    {
      "id": "40HX3",
      "w": "δαυιδ"
    },
    {
      "id": "404KI",
      "w": "δαβιδ"
    },
    "βιβλοσ",
    "γενεσεωσ",
    "=ιυ",
    "=χυ",
    "=υυ",
    "…",  // Ellipsis are used in place of supplied words.
    "=δαδ",
    "δα%υ^ε^ι%δ",
    "δαυετ",
    "γενεσενσ",
    "αβρα^α^μ^"
  ],
  "critical": [
    "WH",  // No colon indicates this text's reading matches the UGNT.
    "RP,KJTR,NA,SBL:1-5,+1,7-8",  // These text read the same as the UGNT for words 1-5 and 7-8. The sixth word is replaced with δαυιδ from the `words` array above.
    "ST:1-5,+2,7-8"  // The ST also has an alternate reading with the sixth word, but uses δαβιδ.
  ],
  "ancient": [
    "𝔓1:+3-7,+1,+8,8",
    "01:+3-6,5,+9,5,8",
    "03:+3-6,5-6,5,8",
    "032:+3-6,5,+10,5,8",
    "61617:+3-4,3-5,+11,5,8",
    "64853:+3,+12,+5-7,+9,+7,+13"
  ]
}
```

#### 2. A unique `x-id` has been added to each word in the UHB and UGNT and each variant word represented in a critical text.

  - UHB
    - All Ketiv/Qere variants are given a unique `x-id`, even if they possess the same lemma, strong, and morph values.
  - UGNT
    - Where the difference in a variant is merely the addition of brackets (to indicate uncertaintly), the `x-id` of that variant matches its counterpart in the UGNT.

#### 3. (UHB only) Alternative versification (indicated by `\va` and `\ca` tags) has been made the standard versification (using `\v` and `\c` tags).

#### 4. (UHB only) Strongs numbers have been converted to five-digit notation to match the UGNT.

- Eg. `H1254a` is now `H12541`
- Where no letter was present, `0` has been appended. The letter `a` has been replaced with `1`, `b` with `2`, etc.

#### 5. (UHB only) The `יָלַךְ`/`H32120` lemma/strongs combo has been changed to `הָלַךְ`/`H19800` as modern scholars no longer recognize a distinct `יָלַךְ` lemma.

#### 6. (UHB only) Words with multi-word lemmas have been combined together.

- Eg. Before and after (from Genesis 21:14)

```
BEFORE
\w בְּאֵ֥ר|lemma="בְּאֵר שֶׁבַע" strong="H08840" x-morph="He,Np"\w*
\w שָֽׁבַע|lemma="בְּאֵר שֶׁבַע" strong="H08840" x-morph="He,Np"\w*׃

AFTER
\w בְּאֵ֥ר שָֽׁבַע|lemma="בְּאֵר שֶׁבַע" strong="H08840" x-morph="He,Np" x-id="01fFu"\w*׃
```

#### 7. (UHB only) Added a `\p` after each verse-ending פ (petucha).

#### 8. (UHB only) The lemma and strongs for `אֲרָם` when a part of the place name `פַּדָּן אֲרָם` have been changed to `אֲרָם` and `#H07580` respectively.

- This modification was preferred to combining this word together with `פַּדָּן` as a multi-word lemma, since `פַּדָּן` sometimes takes a directional ה suffix.
