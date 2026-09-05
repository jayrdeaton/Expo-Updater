/** @jest-environment node */
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

jest.mock('node:child_process')
const { execSync } = require('node:child_process')

const { runVerify } = require('../runVerify.cjs')

describe('runVerify', () => {
  let tmpDir
  let warnSpy

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'run-verify-'))
    execSync.mockReset()
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
    jest.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
    jest.restoreAllMocks()
  })

  function writePackageJson(scripts) {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ scripts }))
  }

  it('runs only "npm run verify" when it exists, even if lint/test/typecheck also exist', () => {
    writePackageJson({ verify: 'x', lint: 'x', test: 'x', typecheck: 'x' })
    runVerify(tmpDir)
    expect(execSync).toHaveBeenCalledTimes(1)
    expect(execSync).toHaveBeenCalledWith('npm run verify', { stdio: 'inherit', cwd: tmpDir })
  })

  it('falls back to lint, test, typecheck in that order when verify is missing', () => {
    writePackageJson({ lint: 'x', test: 'x', typecheck: 'x' })
    runVerify(tmpDir)
    expect(execSync).toHaveBeenNthCalledWith(1, 'npm run lint', { stdio: 'inherit', cwd: tmpDir })
    expect(execSync).toHaveBeenNthCalledWith(2, 'npm run test', { stdio: 'inherit', cwd: tmpDir })
    expect(execSync).toHaveBeenNthCalledWith(3, 'npm run typecheck', { stdio: 'inherit', cwd: tmpDir })
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('no "verify" script found'))
  })

  it('warns and skips an individually-missing fallback script rather than failing', () => {
    writePackageJson({ lint: 'x', test: 'x' })
    runVerify(tmpDir)
    expect(execSync).toHaveBeenCalledTimes(2)
    expect(execSync).not.toHaveBeenCalledWith('npm run typecheck', expect.anything())
    expect(warnSpy).toHaveBeenCalledWith('Warning: no "typecheck" script found, skipping.')
  })

  it('runs nothing and just warns when no relevant script exists at all', () => {
    writePackageJson({})
    runVerify(tmpDir)
    expect(execSync).not.toHaveBeenCalled()
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('no "verify" script found'))
    expect(warnSpy).toHaveBeenCalledWith('Warning: no "lint" script found, skipping.')
    expect(warnSpy).toHaveBeenCalledWith('Warning: no "test" script found, skipping.')
    expect(warnSpy).toHaveBeenCalledWith('Warning: no "typecheck" script found, skipping.')
  })
})
