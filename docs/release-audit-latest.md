# Resume Skill Arena Release Audit

## Executive Summary

**NOT READY for a GitHub public release.** The local implementation passed its available static, unit, type, build, privacy, and initial browser checks. The release is blocked because the complete two-round browser matrix did not complete, real Provider evidence was not obtained, the local checkout has no Git metadata, and the local fixes have not been pushed to the public repository.

The audit also found and repaired two release-process issues: the browser matrix did not reuse an installed Chrome/Edge browser, and GitHub Skill import had no bounded network timeout. A unified `verify:release:full` command and CI-safe workflow were added locally.

## Tested Commit

- Local tested commit: **UNAVAILABLE** — the supplied working directory has no `.git` directory.
- Project memory records public `main` as `34e20a6`; this was not independently resolved from the current local checkout.
- Public repository: https://github.com/Yang-lab1/resume-skill-arena
- Local fixes in this audit are not yet present on the public `main` page.

## Environment

- OS: Windows (verified locally)
- Node: bundled Node `24.19.0`; project requires Node `>=20`
- Browser: Google Chrome at `C:/Program Files/Google/Chrome/Application/chrome.exe`
- Browser automation: Codex in-app Browser smoke plus repository Playwright matrix
- Provider: real Provider not run in this audit; synthetic local matrix used `RESUME_STUDIO_SKIP_PROVIDERS=1`
- Runtime check: PASS (`ok:true`, Chrome found, local child process available)

## Test Gates

| Gate | Result | Evidence / reason |
|---|---|---|
| G0 Repository hygiene | BLOCKED | Local checkout has no `.git`; public repository is separate from local working tree. |
| G1 Clean install | BLOCKED | Host PATH has no `npm`; an isolated clone did not obtain a working tree. Existing dependencies were restored from local generated packages for audit only. |
| G2 Runtime compatibility | PASS | `check-runtime.mjs` returned Node 24.19.0, Chrome and `cmd.exe`. |
| G3 Build / TypeScript | PASS | Typecheck and root build passed after fixes. |
| G4 Unit tests | PASS | Vitest: 27 files, 87 tests passed. |
| G5 Backend/API tests | PASS | Included in the 87-test Vitest result; API health returned `ok:true`, `demoData:false`. |
| G6 Browser E2E | FAIL | Matrix reached the first check, then GitHub Skill import timed out in the current network environment. |
| G7 Resume ingestion | BLOCKED | Full matrix did not reach the resume-format closure. |
| G8 Job ingestion | PASS | Matrix `job-inputs-all-modes` passed in 12–14 seconds. |
| G9 Skill import | FAIL | Local folder/file/ZIP path began, but GitHub import could not reach the public test repository. |
| G10 Multi-Skill isolation | BLOCKED | Requires completed Provider/comparison closure. |
| G11 Real Provider execution | BLOCKED | No credential/quota-backed run was executed in this audit. |
| G12 ChangeSet validation | PASS | Existing adversarial and schema tests passed. |
| G13 Comparison UI | BLOCKED | Initial UI smoke passed; full comparison closure not reached. |
| G14 User decisions | BLOCKED | Full matrix did not reach adopt/edit/keep closure. |
| G15 Final composition | PASS | Existing composition E2E test passed; browser closure not re-established. |
| G16 State integrity | PASS | Existing run-store, decision-store and composition tests passed. |
| G17 Failure recovery | KNOWN_LIMITATION | Existing fault tests pass; full browser refresh/restart matrix not completed. |
| G18 Privacy | PASS | Privacy scan passed; no user paths, clipboard files, phone numbers, email or runtime data found. |
| G19 Security | PASS | Existing traversal/path and archive limits passed; static review found no P0/P1 issue. |
| G20 Accessibility/basic UX | PASS | Browser smoke verified keyboard focus and Enter navigation into the workbench. |
| G21 Cross-platform compatibility | KNOWN_LIMITATION | Windows verified; macOS/Linux statically reviewed only. |
| G22 Documentation accuracy | FAIL | Local README was repaired to reference the unified entry; public GitHub README still shows the older two-command flow. |
| G23 Clean reinstall | BLOCKED | npm unavailable in the host and clean clone did not complete. |
| G24 Full regression | BLOCKED | Two complete passing rounds were not obtained. |

## Bugs Found

### RSA-001 — P2 — Browser matrix required an unavailable bundled Chromium

- Reproduction: run `node ui/scripts/full-feature-matrix-2.mjs` in an environment where `check-runtime` finds system Chrome but Playwright browsers are not downloaded.
- Root cause: the matrix called `chromium.launch({ headless: true })` without using the browser path already accepted by `check-runtime.mjs`.
- Fix: matrix now honors `RESUME_STUDIO_BROWSER` and detects installed Chrome/Edge paths.
- Regression: repaired matrix reached its first full job-input check successfully.
- Status: fixed locally; not pushed to GitHub.

### RSA-002 — P2 — GitHub Skill import had unbounded network waits

- Reproduction: start a GitHub Skill import while `codeload.github.com` is unavailable; the browser waited 120 seconds before reporting failure.
- Root cause: `importGithubSkill` used `fetch` without an abort timeout.
- Fix: each `main`/`master` fetch now has a 15-second `AbortController` timeout.
- Regression: new timeout test passed; GitHub import test suite is 4/4 passed with no unhandled errors.
- Status: fixed locally; not pushed to GitHub.

### RSA-003 — P2 — Release command did not include the browser matrix

- Reproduction: run the documented `npm run verify:release`; it completed automated checks without running the browser matrix.
- Root cause: `package.json` defined `verify:release` only as static/unit/build/UI checks, while README separately required a hidden second command.
- Fix: added local `verify:release:full` orchestration and updated local README instructions.
- Regression: static inspection confirms the new entry runs base gates, runtime check, local API/UI startup and the matrix.
- Status: fixed locally; unified command itself remains unexecuted because npm is absent from this host.

## Automated Tests

- PASS: privacy scan.
- PASS: root Vitest — 27 files / 87 tests.
- PASS: TypeScript typecheck.
- PASS: root build.
- PASS: UI build.
- PASS: UI Node tests — 11/11.
- BLOCKED: `npm audit` — npm CLI is not available in the host; no vulnerability claim is made from this audit.
- BLOCKED: clean `npm ci` reinstall — same host limitation.

## Browser Matrix

- In-app Browser smoke: PASS. App loaded, title/content rendered, keyboard focus entered the workbench, no console errors.
- Matrix attempt 1: FAIL at browser launch because Playwright bundled Chromium was absent. This produced RSA-001.
- Matrix attempt 2: first check PASS; GitHub Skill import failed after the previous unbounded 120-second wait because the environment could not reach the test repository.
- Matrix attempt 3: not counted as a complete round; no complete round passed.
- Round 1: NOT PASSED.
- Round 2: NOT RUN to completion.

## Provider Evidence

- Mock/deterministic tests: schema gates, provider registry/orchestration, composition, run/decision storage, and CLI E2E tests.
- Real Provider evidence: none in this audit.
- The repository's existing reports mention prior real Provider runs, but those historical artifacts were not treated as current release evidence.

## Security / Privacy

- No P0/P1 issue found by the completed local checks.
- Archive path traversal, file count, archive size, unpacked size, and staging/rename protections are covered by existing tests and static review.
- Normal local flow uses localhost endpoints; GitHub import and real Provider execution are the documented outbound-network exceptions.
- Public release must still be re-audited after pushing the local fixes and after a clean install.

## Compatibility

| Platform | Result |
|---|---|
| Windows | VERIFIED for runtime check, API health, UI smoke, builds and tests |
| macOS | UNVERIFIED_PLATFORM; statically reviewed path/launcher branches |
| Linux | UNVERIFIED_PLATFORM; statically reviewed path/launcher branches |

## Known Limitations

- Final selected resume is not yet exported with original DOCX/PDF layout.
- DOCX browser preview is not Microsoft Word print rendering.
- Complex OCR and exact source location can fail and should remain visibly reported.
- Real Provider execution depends on an authenticated Codex environment and available quota.
- GitHub import requires network access and a public repository containing exactly one Skill manifest.

## Release Recommendation

**NOT READY.** Before publishing, push the local RSA-001/RSA-002/RSA-003 fixes and CI workflow, then run `npm ci`, `npm --prefix ui ci`, `npm run verify:release:full` twice from fresh browser contexts and fresh runtime data. The final evidence must include two complete `PASSED` matrix rounds and at least one current real Provider run.

## Findings Summary

- Total bugs found: **3**
- P0: **0**
- P1: **0**
- P2: **3**
- P3: **0**
- Fixed locally: **3**
- Remaining unresolved release blockers: **clean install evidence, two complete browser rounds, current real Provider evidence, Git metadata/public push, and npm audit**
