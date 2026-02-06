# KDBX Diff Analyzer — Full Implementation Plan

## Step 0: Commit CLAUDE.md
- `git add CLAUDE.md && git commit`

## Step 1: Foundation (lib/ utilities)

Create `lib/` directory with these files:

### `lib/argon2-adapter.js`
Wraps the `argon2` npm module to match the signature expected by `kdbxweb.CryptoEngine.setArgon2Impl()`:
`(password, salt, memory, iterations, length, parallelism, type, version) => Promise<ArrayBuffer>`

The argon2 npm module has a different API (`hash(plain, options)`), so this adapter maps between the two. Falls back gracefully if argon2 isn't installed.

### `lib/utils.js`
- `getFieldAsString(entry, fieldName)` — safely reads from `entry.fields` Map, uses `getText()` for ProtectedValue (not `toString()` which returns base64)
- `nodeBufferToArrayBuffer(buf)` — converts Node Buffer to ArrayBuffer for kdbxweb
- `serializeEntry(entry, options)` — converts KdbxEntry to plain JSON-safe object (masks passwords by default)
- `getEntryGroupPath(entry)` — walks `parentGroup` chain to build "Group/Subgroup" path

### `lib/KdbxService.js`
Central wrapper for all kdbxweb operations. Fixes every bug in the current code:
- Configures argon2 via `CryptoEngine.setArgon2Impl()` (not `kdbxweb.argon2 =`)
- `createCredentials(password, keyFileBuffer)` — creates KdbxCredentials and **awaits `credentials.ready`**
- `loadDatabase(fileBuffer, password, keyFileBuffer)` — converts Buffer→ArrayBuffer, loads via `Kdbx.load()`
- `saveDatabase(db)` — calls `db.save()`, returns ArrayBuffer
- `getAllEntries(db)` — uses `db.getDefaultGroup().allEntries()` generator (not the non-existent `db.getEntries()`)
- `findEntryByUuid(db, uuid)` — iterates entries using `uuid.equals()` (not the non-existent `db.findEntryByUuid()`)
- Filters out recycle bin entries using `db.meta.recycleBinUuid`

### `lib/SessionStore.js`
In-memory store keyed by session token (crypto.randomUUID). Each session holds:
```
{ id, createdAt, lastAccessed, databases: { db1: {db, credentials, filename}, db2: ... } }
```
30-minute inactivity expiry with cleanup interval. Methods: `createSession()`, `getSession(token)`, `setDatabase(token, slot, data)`, `destroySession(token)`.

## Step 2: Diff Engine

### `lib/DiffEngine.js`
**Bidirectional** comparison (fixes the current one-directional bug):

1. Build a `Map<uuid.id, KdbxEntry>` index of db2 entries for O(1) UUID lookup
2. Iterate db1 entries → find match in db2 by UUID first, then Title+UserName fallback
   - No match → `onlyInDb1`
   - Match found → compare ALL fields (both Maps), timestamps → `modified` or `identical`
   - Mark matched db2 entries as "seen"
3. Iterate db2 entries NOT seen → `onlyInDb2`

Field comparison uses `getFieldAsString()` (handles ProtectedValue correctly). Compares all fields in both entry Maps (not just 5 hardcoded ones), plus `times.lastModTime`.

Returns: `{ onlyInDb1[], onlyInDb2[], modified[], identical[], summary: {counts} }`

## Step 3: Server Rewrite

### `server.js` — complete rewrite
Express server with session-based architecture. All API endpoints return JSON except binary download.

**Endpoints:**

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/upload` | Upload 1-2 KDBX files + credentials, create session, return entry/group counts |
| POST | `/api/compare` | Run bidirectional diff, return structured results |
| POST | `/api/transfer` | Transfer selected entries between db1↔db2 |
| GET | `/api/download/:slot` | Download db1 or db2 as binary KDBX stream |
| POST | `/api/duplicates` | Find duplicate entries in db1 by username+URL |
| POST | `/api/duplicates/remove` | Remove selected duplicate entries |
| POST | `/api/import` | Import entries from db2 into db1 |
| DELETE | `/api/session` | Destroy session |

Session token passed via `X-Session-Token` header. `requireSession` middleware validates it.

Download endpoint sends binary with `Content-Type: application/octet-stream` (no more broken JSON serialization of ArrayBuffers).

## Step 4: Frontend Rewrite — Compare Tab

### `static/index.html` — tabbed SPA
Four tabs: **Compare** | **Transfer** | **Duplicates** | **Import**
Transfer/Duplicates/Import tabs activate only after databases are loaded.

### `static/js/api.js` — centralized API client
Manages session token, wraps all fetch calls, handles errors uniformly.

### `static/js/app.js` — main controller
Tab switching, state management (`uploaded`, `compared`, `diffResults`), status messages.

### `static/js/components/entry-table.js` — reusable sortable table with optional checkboxes
Used across all tabs. Columns: Title, Username, URL, Group, Last Modified. Click row for detail view.

### `static/js/components/compare.js`
- Upload form (two files + credentials)
- After comparison: summary cards + three collapsible sections (Only in DB1, Only in DB2, Modified)
- Modified entries show which fields changed and which DB has the newer version
- Download buttons for both databases

### `static/style.css` — full redesign for tabbed layout, tables, cards, modals

## Step 5: Transfer Feature

### `lib/TransferEngine.js`
- `transferEntries(sourceDb, targetDb, sourceFile, transfers[])`
- For entries only in one DB: uses `targetDb.importEntry(entry, targetDefaultGroup, sourceDb)` to copy
- For modified entries with "overwrite" action: finds target entry, calls `targetEntry.copyFrom(sourceEntry)`

### `static/js/components/transfer.js`
- Shows diff results with checkboxes per entry
- Sections: "Only in DB1" (→ copy to DB2), "Only in DB2" (→ copy to DB1), "Modified" (choose which version to keep)
- Select all/deselect all per section
- "Transfer Selected" button, then download buttons

## Step 6: Duplicate Finder

### `lib/DuplicateFinder.js`
- `findDuplicates(db, criteria)` — groups entries by lowercase(username)+"|"+lowercase(url), returns groups with count > 1
- `removeEntries(db, uuids[])` — finds each entry by UUID, calls `db.remove(entry)`
- Skips recycle bin entries

### `static/js/components/duplicates.js`
- Works on DB1 only (single file)
- Criteria dropdown (Username+URL, Title+Username)
- Results as expandable groups, newest entry pre-selected as "KEEP", others as "REMOVE"
- "Remove Selected" button, then download cleaned database

## Step 7: Import Feature (separate, as requested)

### `lib/ImportEngine.js`
- `importEntries(sourceDb, targetDb, sourceFile, mode, selectedUuids?)`
- Mode `"skip-existing"`: runs DiffEngine to find entries only in source, imports those
- Mode `"selected"`: imports only entries in selectedUuids list
- Mode `"all"`: imports everything (duplicates get new UUIDs)
- Uses `targetDb.importEntry()` for each

### `static/js/components/import.js`
- Three mode buttons: "Import New Only" / "Select & Import" / "Import All"
- For "Select & Import": shows entry table with checkboxes
- For entries that already exist: option to ask user per-entry or auto-skip
- Download updated DB1 after import

## Step 8: Cleanup
- Delete old `KdbxDiffAnalyzer.js` and `example.js`
- Update `package.json` (main entry, any new deps if needed — likely just `uuid` for session tokens, or use `crypto.randomUUID()`)
- Update `CLAUDE.md` with new architecture and commands

---

## Files Modified/Created

| Action | File |
|--------|------|
| CREATE | `lib/argon2-adapter.js` |
| CREATE | `lib/utils.js` |
| CREATE | `lib/KdbxService.js` |
| CREATE | `lib/SessionStore.js` |
| CREATE | `lib/DiffEngine.js` |
| CREATE | `lib/TransferEngine.js` |
| CREATE | `lib/DuplicateFinder.js` |
| CREATE | `lib/ImportEngine.js` |
| REWRITE | `server.js` |
| REWRITE | `static/index.html` |
| REWRITE | `static/style.css` |
| CREATE | `static/js/api.js` |
| CREATE | `static/js/app.js` |
| CREATE | `static/js/components/compare.js` |
| CREATE | `static/js/components/entry-table.js` |
| CREATE | `static/js/components/transfer.js` |
| CREATE | `static/js/components/duplicates.js` |
| CREATE | `static/js/components/import.js` |
| DELETE | `KdbxDiffAnalyzer.js` |
| DELETE | `example.js` |
| MODIFY | `package.json` |
| MODIFY | `CLAUDE.md` |

## Verification

After each phase, test by:
1. `npm start` — server starts without errors
2. **Compare**: Upload two KDBX files (the included `test-unencrypted.kdbx` can serve as one), verify diff results show entries in both directions
3. **Transfer**: Select entries, transfer, download both files, re-upload and compare to verify the transfer worked
4. **Duplicates**: Upload a single file with known duplicates, verify grouping, remove some, download and verify
5. **Import**: Upload two files, import entries, download and verify entry counts

---

## Progress Tracking

- [x] Step 0: Commit CLAUDE.md
- [x] Step 1: Foundation (lib/ utilities)
- [x] Step 2: Diff Engine
- [x] Step 3: Server Rewrite
- [x] Step 4: Frontend Rewrite — Compare Tab
- [x] Step 5: Transfer Feature
- [x] Step 6: Duplicate Finder
- [x] Step 7: Import Feature
- [x] Step 8: Cleanup
