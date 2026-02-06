# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

KDBX Diff Analyzer is a Node.js web application for comparing, transferring, deduplicating, and importing entries between KeePass (.kdbx) database files. It provides a tabbed SPA frontend backed by a session-based Express API.

## Commands

- **Install dependencies:** `npm install`
- **Start the server:** `npm start` (runs `node server.js` on port 3000)

There are no test or lint scripts configured.

## Architecture

### Backend (`lib/`)

- **`lib/argon2-adapter.js`** — Wraps argon2 npm module for kdbxweb's `CryptoEngine.setArgon2Impl()`. Auto-configures on import.
- **`lib/utils.js`** — `getFieldAsString()` (ProtectedValue-safe), `nodeBufferToArrayBuffer()`, `serializeEntry()`, `getEntryGroupPath()`
- **`lib/KdbxService.js`** — Central kdbxweb wrapper. Handles credentials (with `credentials.ready` await), database loading (Buffer→ArrayBuffer), saving, entry iteration via `getDefaultGroup().allEntries()` generator, UUID lookup, recycle bin filtering.
- **`lib/SessionStore.js`** — In-memory sessions keyed by `crypto.randomUUID()`, 30-min expiry with auto-cleanup.
- **`lib/DiffEngine.js`** — Bidirectional comparison: O(1) UUID index + Title+UserName fallback. Returns `onlyInDb1`, `onlyInDb2`, `modified`, `identical` with summary counts.
- **`lib/TransferEngine.js`** — Copy or overwrite entries between two databases using `db.importEntry()` and `entry.copyFrom()`.
- **`lib/DuplicateFinder.js`** — Groups entries by username+url or title+username, finds duplicates, removes selected entries via `db.remove()`.
- **`lib/ImportEngine.js`** — Import entries from source→target in three modes: skip-existing, selected, or all.

### Server (`server.js`)

Express server with session-based architecture. Session token via `X-Session-Token` header.

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/upload` | Upload 1-2 KDBX files + credentials, create session |
| POST | `/api/compare` | Run bidirectional diff |
| POST | `/api/transfer` | Transfer selected entries between databases |
| GET | `/api/download/:slot` | Download db1 or db2 as binary KDBX |
| POST | `/api/duplicates` | Find duplicate entries in db1 |
| POST | `/api/duplicates/remove` | Remove selected duplicates from db1 |
| POST | `/api/import` | Import entries from db2 into db1 |
| DELETE | `/api/session` | Destroy session |

### Frontend (`static/`)

Tabbed SPA: **Compare** | **Transfer** | **Duplicates** | **Import**

- **`static/js/api.js`** — Centralized API client, manages session token
- **`static/js/app.js`** — Tab switching, state management, status messages
- **`static/js/components/entry-table.js`** — Reusable sortable table with optional checkboxes
- **`static/js/components/compare.js`** — Upload form, comparison results with summary cards and collapsible sections
- **`static/js/components/transfer.js`** — Transfer entries with direction selection
- **`static/js/components/duplicates.js`** — Duplicate finder with keep/remove suggestions
- **`static/js/components/import.js`** — Three import modes with selection table

## Key Dependencies

- **kdbxweb** — KeePass database reading/writing/crypto
- **argon2** (optional) — Better key derivation; falls back gracefully if not installed
- **express** + **multer** — HTTP server and file upload handling

## Git Workflow

- **Always commit after completing any changes** — never leave work uncommitted when moving to the next task
- **Push to remote** whenever appropriate, or whenever more than 5 commits have accumulated since the last push
- **Force push**: only use `--force-with-lease` and only when absolutely certain it's needed. Prefer normal push in all other cases
- **Commit style**: conventional commits (`feat:`, `fix:`, `chore:`, etc.) with concise messages

## Security

The following hardening measures have been applied:

### Critical
- **Error sanitization**: All catch blocks use `safeError()` helper that logs server-side and returns generic messages to clients (no stack traces or internal paths leaked)
- **Filename injection prevention**: `sanitizeFilename()` strips path separators, control characters, and enforces `.kdbx` extension on download endpoints

### High
- **XSS prevention**: `transfer.js` and `duplicates.js` use DOM APIs (`createElement`, `textContent`, `dataset`) instead of `innerHTML` with interpolated UUIDs. CSS selector injection fixed by using `Array.find()` instead of string interpolation in `querySelector`
- **CSRF protection**: Origin header validation middleware rejects non-localhost origins on state-changing requests. `X-Session-Token` custom header provides additional implicit CSRF defense
- **Upload limits**: Multer configured with 10 MB file size limit, max 4 files, and file extension validation (`.kdbx` for databases, `.key/.keyx/.keyfile/.xml` for key files)
- **Timing-safe sessions**: `SessionStore.getSession()` uses `crypto.timingSafeEqual()` to prevent timing attacks on session token lookup

### Medium
- **Rate limiting**: In-memory rate limiter (30 req/min/IP) with periodic cleanup, no external dependency
- **Security headers**: CSP, X-Content-Type-Options, X-Frame-Options, Referrer-Policy set on all responses
- **UUID validation**: All endpoints that accept UUIDs validate format before processing
- **Credentials removed from sessions**: Database credentials are no longer stored in session objects (kdbxweb associates them at load time)
- **Criteria validation**: Duplicate finder allowlists `username+url` and `title+username` criteria values
- **Fallback match logging**: `DiffEngine` logs when Title+UserName fallback matching is used and flags results with `matchedByFallback`

### Low
- **Graceful shutdown**: `SessionStore.destroy()` method cleans up timers; server hooks SIGINT/SIGTERM for clean exit
- **Frontend error handling**: `Api._handle()` wraps `res.json()` in try-catch for non-JSON responses
- **Auth failure logging**: `requireSession` middleware logs IP, method, and path on authentication failures

### Audit Tool
Use the `security-auditor` agent (`~/.claude/agents/security-auditor.md`) for future OWASP-based audits of this or any project.

## Known Limitations

- Entry matching falls back to Title+UserName when UUIDs don't match across databases
- No attachment or history comparison
- Group structure from original databases is not preserved in transfers/imports
