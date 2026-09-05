#!/usr/bin/env node
/* eslint-disable no-console */
const { execFileSync, execSync } = require('node:child_process')

const { bumpOtaVersion } = require('./lib/bumpOtaVersion.cjs')
const { runVerify } = require('./lib/runVerify.cjs')
const { validateProfile } = require('./lib/validateProfile.cjs')

const profile = process.argv[2]
if (!profile) {
  console.error('Usage: rific-updater-update <profile> [releaseFile]')
  console.error("  'development' publishes interactively")
  console.error('  every other profile publishes with --non-interactive')
  process.exit(1)
}
const releaseFile = process.argv[3] ?? 'src/constants/release.ts'
const nonInteractive = profile !== 'development'
const cwd = process.cwd()
validateProfile(profile, cwd)

runVerify(cwd)

// Captured before bumpOtaVersion's own auto-commit, so this is the app's real
// last commit — not the "otaVersion N -> N+1" commit bumpOtaVersion is about to make.
const message = execSync('git log -1 --pretty=%B', { cwd }).toString().trim()

bumpOtaVersion(releaseFile, cwd)

const args = ['update', '--branch', profile, '--environment', profile, '--message', message]
if (nonInteractive) args.push('--non-interactive')

const display = args.map((arg) => (/[\s"]/.test(arg) ? JSON.stringify(arg) : arg)).join(' ')
console.log(`$ eas ${display}`)
execFileSync('eas', args, { stdio: 'inherit', cwd })
