const fs = require('fs').promises
const { stripGreekAccents } = require('./utils')

const transcriptionsDir = './cntr/transcriptions'
const outputUsfmDir = './usfm'

;(async () => {

  try {

    const [
      ugntDir,
      addedTranscriptionsDir,
    ] = process.argv.slice(2)

    if(!ugntDir) throw `Missing ugntDir parameter.`

    console.log(`\nSTARTING...\n`)

    const ugntPaths = (await fs.readdir(ugntDir)).filter(file => file.match(/^[0-9]{2}-\w{3}\.usfm$/)).map(file => `${ugntDir}/${file}`)

    if(ugntPaths.length !== 27) throw `Invalid ugntDir parameter.`

    const transcriptionPaths = (await fs.readdir(transcriptionsDir)).filter(path => path.match(/^[0-9]G.*\.txt$/)).map(file => `${transcriptionsDir}/${file}`)
    const addedTranscriptionPaths = addedTranscriptionsDir ? (await fs.readdir(transcriptionsDir)).map(file => `${transcriptionsDir}/${file}`) : []
    const allTranscriptionPaths = [ ...transcriptionPaths, ...addedTranscriptionPaths ]

    const dataByLoc = {}

    // load transcriptions words array into JSON obj keyed to loc
    for(let path of allTranscriptionPaths) {

      const transcriptions = await fs.readFile(path, { encoding: `utf8` })
      const lines = transcriptions.split(/\n/g)

      lines.forEach(line => {
        const [ x, loc, content ] = line.match(/^(.*?) (.*)$/) || []
        if(!x) {
          if(line) console.log(`Bad line: ${line}`)
          return
        }
        const words = stripGreekAccents(content).toLowerCase().replace(/[,.·]/g, '').split(" ")
        const source = path.match(/\/([0-9]G[^\/]*)\.txt$/)[1]
        dataByLoc[loc] = {
          wordsBySource: {
            ...((dataByLoc[loc] || {}).wordsBySource || {}),
            [source]: words,
          },
        }
      })

    }

    // for each USFM file (i.e. book of the Bible)
      // build id dictionary from existing files in outputUsfmDir
      // add ugnt words array in same manner
      // build apparatus data verse-by-verse
        // const criticalOrAncient = /\/0G[^\/]*\.txt$/.test(path) ? `critical` : `ancient`
      // insert apparatus tags into USFM
      // add x-id attribute into USFM, updating id dictionary and outputting issues when relevant
      // write the file
        
    console.log(`\nCOMPLETED.\n`)

  } catch(err) {

    console.log(``)
    console.log(`***********************`)
    console.log(``)
    console.log(`ERROR: ${err.message || err}`)
    console.log(``)
    console.log(`***********************`)
    console.log(``)
    console.log(`Syntax: \`npm run build-usfm-for-ugnt [ugntDir] [addedTranscriptionsDir]\`\n`)
    console.log(`Example #1: \`npm run build-usfm-for-ugnt ../ugnt\``)
    console.log(`Example #2: \`npm run build-usfm-for-ugnt ../ugnt ../other/transcriptions\``)
    console.log(``)
    console.log(`Note #1: \`ugntDir\` should point to your local clone of the unfoldingword.org/uhb repo.`)
    console.log(`Note #2: \`addedTranscriptionsDir\` (if included) should contain TXT files like those in /cntr/transcriptions.`)
    console.log(``)

  }

  process.exit()

})()