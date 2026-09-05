/** @jest-environment node */
const { execSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { bumpOtaVersion } = require('../bumpOtaVersion.cjs')

describe('bumpOtaVersion', () => {
  let tmpDir
  let errorSpy

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bump-ota-'))
    execSync('git init -q', { cwd: tmpDir })
    execSync('git config user.email test@example.com', { cwd: tmpDir })
    execSync('git config user.name Test', { cwd: tmpDir })
    jest.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`EXIT:${code}`)
    })
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    jest.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
    jest.restoreAllMocks()
  })

  function writeReleaseFile(otaVersion) {
    fs.writeFileSync(path.join(tmpDir, 'release.ts'), `export const release = {\n  otaVersion: ${otaVersion}\n}\n`)
  }

  function commitAll(message) {
    execSync('git add -A', { cwd: tmpDir })
    execSync(`git commit -q -m "${message}"`, { cwd: tmpDir })
  }

  it('bumps the version, writes the file, and auto-commits', () => {
    writeReleaseFile(5)
    commitAll('baseline')

    const result = bumpOtaVersion('release.ts', tmpDir)

    expect(result).toEqual({ current: 5, next: 6 })
    expect(fs.readFileSync(path.join(tmpDir, 'release.ts'), 'utf8')).toContain('otaVersion: 6')
    const log = execSync('git log --oneline', { cwd: tmpDir }).toString()
    expect(log).toContain('otaVersion 5 -> 6')
  })

  it('refuses to run on a dirty git tree, and leaves the file untouched', () => {
    writeReleaseFile(5)
    commitAll('baseline')
    fs.writeFileSync(path.join(tmpDir, 'untracked.txt'), 'dirty')

    expect(() => bumpOtaVersion('release.ts', tmpDir)).toThrow('EXIT:1')
    expect(errorSpy).toHaveBeenCalledWith('Git working directory is not clean. Please commit or stash your changes first.')
    expect(fs.readFileSync(path.join(tmpDir, 'release.ts'), 'utf8')).toContain('otaVersion: 5')
  })

  it('errors clearly when the target file does not exist', () => {
    fs.writeFileSync(path.join(tmpDir, 'other.txt'), 'x')
    commitAll('baseline, no release file')

    expect(() => bumpOtaVersion('release.ts', tmpDir)).toThrow('EXIT:1')
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('File not found'))
  })

  it('errors clearly when otaVersion is not present in the file', () => {
    fs.writeFileSync(path.join(tmpDir, 'release.ts'), 'export const release = {}\n')
    commitAll('baseline, no otaVersion field')

    expect(() => bumpOtaVersion('release.ts', tmpDir)).toThrow('EXIT:1')
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Could not find otaVersion'))
  })
})
