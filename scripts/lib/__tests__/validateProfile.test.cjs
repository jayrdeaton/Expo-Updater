/** @jest-environment node */
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { validateProfile } = require('../validateProfile.cjs')

describe('validateProfile', () => {
  let tmpDir
  let errorSpy

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'validate-profile-'))
    jest.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`EXIT:${code}`)
    })
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
    jest.restoreAllMocks()
  })

  function writeEasJson(profiles) {
    fs.writeFileSync(path.join(tmpDir, 'eas.json'), JSON.stringify({ build: profiles }))
  }

  it('passes silently when the profile exists', () => {
    writeEasJson({ development: {}, preview: {}, production: {} })
    expect(() => validateProfile('preview', tmpDir)).not.toThrow()
  })

  it('exits and lists the real valid profiles when the given one does not exist', () => {
    writeEasJson({ development: {}, preview: {}, production: {} })
    expect(() => validateProfile('staging', tmpDir)).toThrow('EXIT:1')
    expect(errorSpy).toHaveBeenCalledWith('"staging" is not a build profile in eas.json.')
    expect(errorSpy).toHaveBeenCalledWith('Valid profiles: development, preview, production')
  })

  it('exits clearly when eas.json is missing entirely, instead of crashing on ENOENT', () => {
    expect(() => validateProfile('development', tmpDir)).toThrow('EXIT:1')
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('No eas.json found at'))
  })

  it('reports "(none defined)" when eas.json has no build profiles at all', () => {
    fs.writeFileSync(path.join(tmpDir, 'eas.json'), JSON.stringify({}))
    expect(() => validateProfile('development', tmpDir)).toThrow('EXIT:1')
    expect(errorSpy).toHaveBeenCalledWith('Valid profiles: (none defined)')
  })
})
