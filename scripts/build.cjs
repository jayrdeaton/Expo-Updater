#!/usr/bin/env node
/* eslint-disable no-console */
const { execSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { runVerify } = require('./lib/runVerify.cjs')
const { validateProfile } = require('./lib/validateProfile.cjs')

const profile = process.argv[2]
if (!profile) {
  console.error('Usage: rific-updater-build <profile>')
  console.error("  'development' builds locally and relocates the artifact to ~/Downloads/Builds/")
  console.error('  every other profile builds in the cloud (eas build --profile <profile>)')
  process.exit(1)
}

const cwd = process.cwd()
validateProfile(profile, cwd)

const local = profile === 'development'

function run(cmd) {
  console.log(`$ ${cmd}`)
  execSync(cmd, { stdio: 'inherit', cwd })
}

runVerify(cwd)

if (!local) {
  run(`eas build --profile ${profile}`)
  process.exit(0)
}

const { expo } = JSON.parse(fs.readFileSync(path.join(cwd, 'app.json'), 'utf8'))
const projectName = expo.name

run('expo prebuild --clean')
run(`eas build --profile ${profile} --local`)

const artifactPattern = /^build-(\d+)\.(ipa|apk|aab|tar\.gz)$/
const candidates = fs
  .readdirSync(cwd)
  .map((name) => ({ name, match: name.match(artifactPattern) }))
  .filter(({ match }) => match)
  .map(({ name, match }) => ({ name, epoch: Number(match[1]), ext: match[2] }))

if (candidates.length === 0) {
  console.error('Could not find a build-<timestamp> artifact produced by eas build --local.')
  process.exit(1)
}

const artifact = candidates.reduce((a, b) => (b.epoch > a.epoch ? b : a))

const buildsDir = path.join(os.homedir(), 'Downloads', 'Builds')
fs.mkdirSync(buildsDir, { recursive: true })

function formatTimestamp(date) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`
}
const destPath = path.join(buildsDir, `${projectName}-${formatTimestamp(new Date(artifact.epoch))}.${artifact.ext}`)

fs.copyFileSync(path.join(cwd, artifact.name), destPath)
fs.unlinkSync(path.join(cwd, artifact.name))

console.log(`Build saved to ${destPath}`)
