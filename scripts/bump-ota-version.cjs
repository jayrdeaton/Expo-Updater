#!/usr/bin/env node
const { bumpOtaVersion } = require('./lib/bumpOtaVersion.cjs')

bumpOtaVersion(process.argv[2] ?? 'src/constants/release.ts')
