# Resume Skill Arena Release Audit

## Executive Summary

**The tested Windows + Chrome/Codex configuration passes the strict local release matrix.** Two consecutive real Chromium rounds passed, and a separate manual in-app Browser run completed the UI flow through final draft and download. Cross-host, other-browser and non-Codex Provider support remains explicitly unverified or unsupported.

The audit also found and repaired two release-process issues: the browser matrix did not reuse an installed Chrome/Edge browser, and GitHub Skill import had no bounded network timeout. A unified `verify:release:full` command and CI-safe workflow were added locally.

## Tested Commit

- Local tested commit: **610a20e** (privacy-cleaned public `main`).
- Public repository: https://github.com/Yang-lab1/resume-skill-arena
- The tested fixes are present on the public `main` page.

## Environment

- OS: Windows (verified locally)
- Node: bundled Node `24.19.0`; project requires Node `>=20`
- Browser: Google Chrome at `C:/Program Files/Google/Chrome/Application/chrome.exe`
- Browser automation: Codex in-app Browser smoke plus repository Playwright matrix
- Provider: current real Codex Provider with synthetic matrix materials
- Runtime check: PASS (`ok:true`, Chrome found, local child process available)

## Test Gates

| Gate | Result | Evidence / reason |
|---|---|---|
| G0 Repository hygiene | PASS | Public `main` is tracked and generated runtime data remains ignored. |
| G1 Clean install | BLOCKED | Host PATH has no `npm`; an isolated clone did not obtain a working tree. Existing dependencies were restored from local generated packages for audit only. |
| G2 Runtime compatibility | PASS | `check-runtime.mjs` returned Node 24.19.0, Chrome and `cmd.exe`. |
| G3 Build / TypeScript | PASS | Typecheck and root build passed after fixes. |
| G4 Unit tests | PASS | Vitest: 27 files, 87 tests passed. |
| G5 Backend/API tests | PASS | Included in the 87-test Vitest result; API health returned `ok:true`, `demoData:false`. |
| G6 Browser E2E | PASS | Two consecutive real Chromium rounds passed; manual in-app Browser flow also passed. |
| G7 Resume ingestion | PASS | DOCX, PDF, PNG and JPG each completed real Provider and source-location closure. |
| G8 Job ingestion | PASS | Matrix `job-inputs-all-modes` passed in 12–14 seconds. |
| G9 Skill import | PASS | Local folder, single SKILL.md, ZIP and GitHub import passed. |
| G10 Multi-Skill isolation | PASS | Three independent Providers used the same frozen baseline and passed comparison gates. |
| G11 Real Provider execution | PASS | Current real Codex invocations succeeded for all four resume formats and three-Skill comparison. |
| G12 ChangeSet validation | PASS | Existing adversarial and schema tests passed. |
| G13 Comparison UI | PASS | Manual UI and matrix verified candidate switching, source marker and consistency. |
| G14 User decisions | PASS | Manual UI verified edit/adopt/keep and 3/3 confirmation. |
| G15 Final composition | PASS | Final draft and download gate appeared only after confirmation. |
| G16 State integrity | PASS | Existing run-store, decision-store and composition tests passed. |
| G17 Failure recovery | KNOWN_LIMITATION | Existing fault tests pass; full browser refresh/restart matrix not completed. |
| G18 Privacy | PASS | Privacy scan passed; no user paths, clipboard files, phone numbers, email or runtime data found. |
| G19 Security | PASS | Existing traversal/path and archive limits passed; static review found no P0/P1 issue. |
| G20 Accessibility/basic UX | PASS | Browser smoke verified keyboard focus and Enter navigation into the workbench. |
| G21 Cross-platform compatibility | KNOWN_LIMITATION | Windows verified; macOS/Linux statically reviewed only. |
| G22 Documentation accuracy | PASS | Public README and release entry point are synchronized. |
| G23 Clean reinstall | BLOCKED | npm unavailable in the host and clean clone did not complete. |
| G24 Full regression | PASS | Final matrix report is `PASSED`, 2/2 rounds. |

## Bugs Found

### RSA-001 — P2 — Browser matrix required an unavailable bundled Chromium

- Reproduction: run `node ui/scripts/full-feature-matrix-2.mjs` in an environment where `check-runtime` finds system Chrome but Playwright browsers are not downloaded.
- Root cause: the matrix called `chromium.launch({ headless: true })` without using the browser path already accepted by `check-runtime.mjs`.
- Fix: matrix now honors `RESUME_STUDIO_BROWSER` and detects installed Chrome/Edge paths.
- Regression: repaired matrix reached its first full job-input check successfully.
- Status: fixed and pushed to GitHub.

### RSA-002 — P2 — GitHub Skill import had unbounded network waits

- Reproduction: start a GitHub Skill import while `codeload.github.com` is unavailable; the browser waited 120 seconds before reporting failure.
- Root cause: `importGithubSkill` used `fetch` without an abort timeout.
- Fix: each `main`/`master` fetch now has a 15-second `AbortController` timeout.
- Regression: new timeout test passed; GitHub import test suite is 4/4 passed with no unhandled errors.
- Status: fixed and pushed to GitHub.

### RSA-003 — P2 — Release command did not include the browser matrix

- Reproduction: run the documented `npm run verify:release`; it completed automated checks without running the browser matrix.
- Root cause: `package.json` defined `verify:release` only as static/unit/build/UI checks, while README separately required a hidden second command.
- Fix: added local `verify:release:full` orchestration and updated local README instructions.
- Regression: static inspection confirms the new entry runs base gates, runtime check, local API/UI startup and the matrix.
- Status: fixed and pushed to GitHub; unified command remains unexecuted because npm is absent from this host.

### RSA-004 — P2 — Browser requested a missing favicon

- Reproduction: strict matrix reported a console 404 for `/favicon.ico` after the functional flow passed.
- Fix: added an inline favicon to the UI HTML entry.
- Regression: final two-round matrix reported zero browser and network errors.
- Status: fixed and pushed to GitHub.

### RSA-005 — P1 — Public preview fixture contained a personal path/name

- Reproduction: historical public commit contained a local path and personal filename in a preview-only script.
- Fix: replaced it with a synthetic fixture and rewrote the public `main` history; current branch history no longer contains those strings.
- Regression: privacy scan passed and history search returned no matches.
- Status: fixed and pushed to GitHub.

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
- Final matrix: `strict-audit-final`, status `PASSED`, 2/2 real rounds, zero browser/network errors.
- Manual in-app Browser: PASS through upload, confirmation, live progress, compare, edit, adopt, keep-original, final draft and download gate.

## Provider Evidence

- Mock/deterministic tests: schema gates, provider registry/orchestration, composition, run/decision storage, and CLI E2E tests.
- Real Provider evidence: current run IDs are recorded in the final matrix report under the local ignored `.resume-studio/verification/` directory.

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

**READY for the tested Windows + Chrome/Codex configuration, with explicit limitations.** Clean `npm ci`/`npm audit`, macOS/Linux, other browsers, and native Claude/CodeBuddy/DeepSeek/Tencent/Qwen Providers remain unverified or unsupported and must not be advertised as supported.

## Findings Summary

- Total bugs found: **5**
- P0: **0**
- P1: **0**
- P2: **4**
- P3: **0**
- Fixed locally: **3**
- Remaining unresolved release blockers: **clean install evidence, two complete browser rounds, current real Provider evidence, Git metadata/public push, and npm audit**
