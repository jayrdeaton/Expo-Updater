/* eslint-disable no-console */
const { execSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

function bumpOtaVersion(filePath, cwd = process.cwd()) {
  const configPath = path.resolve(cwd, filePath)

  if (!fs.existsSync(configPath)) {
    console.error(`File not found: ${configPath}`)
    process.exit(1)
  }

  try {
    const status = execSync('git status --porcelain', { cwd }).toString().trim()
    if (status) {
      console.error('Git working directory is not clean. Please commit or stash your changes first.')
      process.exit(1)
    }
  } catch (err) {
    console.error('Failed to check git status:', err.message)
    process.exit(1)
  }

  const source = fs.readFileSync(configPath, 'utf8')
  const match = source.match(/(otaVersion:\s*)(\d+)/)

  if (!match) {
    console.error(`Could not find otaVersion in ${filePath}`)
    process.exit(1)
  }

  const current = Number.parseInt(match[2], 10)
  const next = current + 1
  const updated = source.replace(/(otaVersion:\s*)(\d+)/, `$1${next}`)

  fs.writeFileSync(configPath, updated)

  try {
    execSync(`git add ${configPath}`, { cwd })
    execSync(`git commit -m "otaVersion ${current} -> ${next}"`, { cwd })
  } catch (err) {
    console.error('Auto-commit failed:', err.message)
  }

  console.log(`otaVersion bumped: ${current} -> ${next}`)
  return { current, next }
}

module.exports = { bumpOtaVersion }
