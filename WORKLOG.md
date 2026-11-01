# Reconciliation worklog

## 2026-11-01

Goal: keep completed KDBX Diff Analyzer work on canonical main and synchronize the existing default branch without changing release settings or publishing a package.

- Confirmed the GitHub repository is public, unarchived, and defaults to `feature/full-rewrite`; `main` contains the later application and npm packaging history.
- Verified public npm `@smolkapps/kdbx-diff` 1.0.1 records gitHead `be1a813ed72e3d3f8494b8ba9821acb153ee40d9`, an ancestor of pre-merge main `2e4298408d2c4b337dc2da48aa26a66b1c35bf90`. No release tags exist.
- Verified prior project-specific user direction: merge completed worktrees back to main; search both databases; reveal protected values only upon request; CSV imports create DB2, compare against DB1, allow selection, then download the result.
- Reviewed the existing default branch's unique commit `b54b415c5ccddf0f8124e62ee1a8beed1c041276`: it only removes CLAUDE.md and ignores it. Merge preserves this cleanup and main's newer `.memory/` and `.claude/` exclusions. Application, package and test bytes remain identical to pre-merge main.
- Attachment/history, CSV import and group-structure feature tips are ancestors of main. Rewritten backup histories are patch-equivalent. The old duplicate-criteria fix already exists in main. These do not require replaying old source snapshots.
- Preserved both original checkouts unchanged. The archived copy's distinct untracked root-group import behavior changes an existing test's policy without verified user direction; held as unfinished. Its sample databases, agent state and AppleDouble metadata are also held. A partial stash's completed protected-field/search-order changes already exist; its remaining field-diff edit would restore plaintext password diffs, so it remains held.
- Full provenance, source hashes, tip/file dispositions, validation logs and exact remote receipt are retained in the separate main-branch reconciliation audit.

Verification:

- All 265 existing Node tests pass (69 suites; zero failures, skips, cancellations or todos), run serially with the locked dependency tree. Lifecycle scripts and the project signing hook were disabled; only the locked Argon2 prebuilt binary was fetched, with source compilation disabled.
- Syntax checks pass for 33 JavaScript files. Package preview contains 28 expected files and excludes databases, tests and agent state. Targeted credential/payload scan and Git object validation pass.
- Fresh task-owned Camoufox contexts at 1365×900 and 390×844 exercised visible controls: open disposable DB1; CSV becomes DB2; compare; select one new entry; import into DB1; download; search both databases; reveal and hide passwords. Both downloads reopen with exactly the original and selected entries. The unselected entry stays absent and the input fixture remains unchanged.
- No browser console/page errors or failed/HTTP-error requests occurred. Inspected CSV and masked-detail captures at both sizes. Existing horizontal overflow on the narrow viewport remains; this merge changes no UI code. Responsive browser checks do not establish physical mobile compatibility.

No personal vault was decrypted. No npm publish, release, deployment, branch-setting change or service change is part of this merge.
