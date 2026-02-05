# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

KDBX Diff Analyzer is a Node.js web application that compares two KeePass (.kdbx) database files and produces a new KDBX database containing only the differences. The output database organizes results into "Missing Entries" (in db1 but not db2) and "Modified Entries" (present in both but changed, grouped by modification date).

## Commands

- **Install dependencies:** `npm install`
- **Start the server:** `npm start` (runs `node server.js` on port 3000)

There are no test or lint scripts configured.

## Architecture

The app has three layers:

1. **`KdbxDiffAnalyzer.js`** — Core library class. Handles KDBX file loading via `kdbxweb`, credential creation (password and/or key file), entry matching (by UUID first, then by Title+UserName fallback), field-by-field comparison (standard + custom fields), and diff database generation.

2. **`server.js`** — Express server with a single `POST /compare` endpoint. Uses `multer` (memory storage) for multipart file uploads (db1, db2, keyFile1, keyFile2) plus password fields. Returns JSON with `diffBuffer` (the generated KDBX) and `diffString` (human-readable diff text). Serves the frontend from `static/`.

3. **`static/`** — Vanilla HTML/CSS/JS frontend. `index.html` has the form, `script.js` handles file uploads via FormData to `/compare`, displays diff text, and provides a download link for the generated KDBX file.

## Key Dependencies

- **kdbxweb** — KeePass database reading/writing/crypto
- **argon2** (optional) — Better key derivation; falls back gracefully if not installed
- **express** + **multer** — HTTP server and file upload handling

## Known Limitations

- Entry matching falls back to Title+UserName when UUIDs don't match
- No attachment or history comparison
- Group structure from original databases is not preserved in the diff output
- `example.js` is fully commented out (was a CLI interface before the web UI)
