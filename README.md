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

* See [here](https://github.com/educational-resources-and-services/bibletags-ui-data/issues).
* Please first check if your bug report / feature request already exists before submitting a new issue.
* For bug reports, please provide a clear description of the problem and step-by-step explanation of how to reproduce it.

# bibletags-usfm

This repo includes the usfm files used in [bibletags-data](https://github.com/educational-resources-and-services/bibletags-data) and [bibletags-react-native-app](https://github.com/educational-resources-and-services/bibletags-react-native-app).

These USFM 3.0 files are derived from [unfoldingword.org/uhb](https://unfoldingword.org/uhb) and [unfoldingword.org/ugnt](https://unfoldingword.org/ugnt).

The following changes have been made via the import scripts:

* A unique `x-id` has been added to each word.
* Variant information has been added to the end of all relevant verses using the custom `\zApparatusJson` tag.

### Expanded `\zApparatusJson` example

```json
  {
    "words": [
      {
        "w": "=ιυ",
        "id": "?????"
      },
      {
        "w": "=χυ",
        "id": "?????"
      },
      {
        "w": "=υυ",
        "id": "?????"
      },
      {
        "w": "δαυιδ",
        "id": "?????"
      },
      {
        "w": "δαυετ",
        "id": "?????"
      },
      {
        "w": "=δαδ",
        "id": "?????"
      },
      {
        "w": "=υυ",
        "id": "?????"
      }
    ],
    "critical": [
      "NA,SBL,RP,ST,TR:1-5,+4,7-8",
    ],
    "ancient": [
      "𝔓1:1-2,+1-4,7-8",
      "61617:1-5,+5,7-8",
      "64853:1-2,+1-3,+6-7,8",
      "01:1-2,+1-2,5,+6,7-8",
      "03,032:1-2,+1-2,6-8",
    ]
  }
```