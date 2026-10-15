# TODO

## Remove the CLI bins

Added 2026-10-15. Build and OTA-update tooling moved to Jay's own CLI, `jrd ship` (`@jayrdeaton/scripts`, `~/Developer/Scripts`): `jrd ship build <profile>`, `jrd ship update <profile>`, `jrd ship bump-ota`. Machine-specific build config (such as pointing local builds of SDK 57 apps at Xcode 26 so they run on iOS 27) belongs there, not in a published library every app pins a version of. Each app's own `build`/`update` npm scripts become plain `eas build`/`eas update`. After this, the package is just the OTA update hook its description says it is.

**Wait until no app uses them.** Solitaire switched first (commit 257a063). This lists any app still on them:

```sh
grep -l -E 'rific-updater-build|rific-updater-update|rific-bump-ota' ~/Developer/*/package.json
```

Then, in one release:

1. Delete `scripts/` (`build.cjs`, `update.cjs`, `bump-ota-version.cjs`, `lib/` and its tests).
2. In `package.json`, drop the `bin` block and `scripts` from `files`.
3. In `jest.config.cjs`, drop `<rootDir>/scripts` from `roots` and the `.test.cjs` pattern from `testMatch` (keep the comment only if something else still needs them).
4. In `README.md`, delete "OTA version constant" (it documents `rific-bump-ota`) and "Build & update scripts" with its "Verify-gating lives in the CLI" subsection, and point readers to plain `eas build`/`eas update`.
5. In `.claude/CLAUDE.md`, delete "Verify script", "Bump script", "Build script" and "Update script", and drop the bins from Commands/Architecture.
6. Release it as the next minor (`npm run release:minor`). Removing bins is a breaking change, and on 0.x a minor is the breaking bump, so apps on `^0.6.0` won't pick it up until their range is raised.
