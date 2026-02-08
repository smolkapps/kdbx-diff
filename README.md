# KDBX Diff Analyzer

Compare, transfer, deduplicate, and import entries between KeePass (`.kdbx`) database files.

## Features

- **Compare** two `.kdbx` files side-by-side with full bidirectional diff (entries only in db1, only in db2, modified, identical)
- **Transfer** selected entries between databases with group structure preserved
- **Deduplicate** entries within a database (match by username+URL or title+username)
- **Import** entries in bulk with three modes: skip existing, select specific, or import all
- **CSV Import** from Chrome, Firefox, and Safari password exports
- **Attachment & history comparison** for detailed entry-level diffs

All operations run locally. No data leaves your machine.

## Quick Start

### npm

```bash
npm install -g kdbx-diff-analyzer
kdbx-diff
```

### npx (no install)

```bash
npx kdbx-diff-analyzer
```

### Docker

```bash
docker build -t kdbx-diff .
docker run -p 3000:3000 kdbx-diff
```

### From source

```bash
git clone https://github.com/smolkapps/kdbx-diff.git
cd kdbx-diff
npm install
npm start
```

Then open `http://localhost:3000` in your browser.

## Usage

1. Upload two `.kdbx` files with their passwords (and optional key files)
2. Use the **Compare** tab to see what's different
3. Use **Transfer** to copy entries from one database to the other
4. Use **Duplicates** to find and remove duplicate entries
5. Use **Import** for bulk import or CSV password import
6. Download the modified database when done

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Preferred port (falls back to 3001-3009 if occupied) |

## Tech Stack

- **Node.js** + **Express** backend with session-based API
- **kdbxweb** for KeePass file operations
- **Vanilla JS** frontend (no build step)
- **argon2** (optional) for faster key derivation

## License

MIT
