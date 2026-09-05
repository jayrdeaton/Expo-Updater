/* eslint-disable no-console */
const fs = require('node:fs')
const path = require('node:path')

function validateProfile(profile, cwd = process.cwd()) {
  const easJsonPath = path.join(cwd, 'eas.json')

  if (!fs.existsSync(easJsonPath)) {
    console.error(`No eas.json found at ${easJsonPath}`)
    process.exit(1)
  }

  const easJson = JSON.parse(fs.readFileSync(easJsonPath, 'utf8'))
  const validProfiles = Object.keys(easJson.build ?? {})

  if (!validProfiles.includes(profile)) {
    console.error(`"${profile}" is not a build profile in eas.json.`)
    console.error(`Valid profiles: ${validProfiles.join(', ') || '(none defined)'}`)
    process.exit(1)
  }
}

module.exports = { validateProfile }
