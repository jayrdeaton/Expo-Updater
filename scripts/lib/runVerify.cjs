/* eslint-disable no-console */
const { execSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

function runVerify(cwd = process.cwd()) {
  const pkg = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'))
  const scripts = pkg.scripts ?? {}

  if (scripts.verify) {
    console.log('$ npm run verify')
    execSync('npm run verify', { stdio: 'inherit', cwd })
    return
  }

  console.warn('Warning: no "verify" script found, falling back to lint/test/typecheck individually.')

  for (const name of ['lint', 'test', 'typecheck']) {
    if (!scripts[name]) {
      console.warn(`Warning: no "${name}" script found, skipping.`)
      continue
    }
    console.log(`$ npm run ${name}`)
    execSync(`npm run ${name}`, { stdio: 'inherit', cwd })
  }
}

module.exports = { runVerify }
