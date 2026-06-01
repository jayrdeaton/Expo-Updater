#!/usr/bin/env node
/* eslint-disable no-console */
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const filePath = process.argv[2] ?? 'src/constants/release.ts'
const configPath = path.resolve(process.cwd(), filePath)

if (!fs.existsSync(configPath)) {
  console.error(`File not found: ${configPath}`)
  process.exit(1)
}

try {
  const status = execSync('git status --porcelain').toString().trim()
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
  execSync(`git add ${configPath}`)
  execSync(`git commit -m "otaVersion ${current} -> ${next}"`)
} catch (err) {
  console.error('Auto-commit failed:', err.message)
}

console.log(`otaVersion bumped: ${current} -> ${next}`)
