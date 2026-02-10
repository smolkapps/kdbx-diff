#!/usr/bin/env node
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const KdbxService = require('./lib/KdbxService');
const DiffEngine = require('./lib/DiffEngine');
const TransferEngine = require('./lib/TransferEngine');
const DuplicateFinder = require('./lib/DuplicateFinder');
const ImportEngine = require('./lib/ImportEngine');
const CsvImporter = require('./lib/CsvImporter');
const SessionStore = require('./lib/SessionStore');

const app = express();
const PREFERRED_PORT = parseInt(process.env.PORT, 10) || 3000;
const sessions = new SessionStore();
const kdbxService = new KdbxService();

// --- Security: UUID validation regex ---
const UUID_REGEX = /^(?:[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}|[A-Za-z0-9+/]{22}==)$/;

function isValidUuid(str) {
    return typeof str === 'string' && UUID_REGEX.test(str);
}

// --- Security: safe error responses (no internal details leaked) ---
function safeError(res, status, error, userMessage) {
    console.error(userMessage + ':', error);
    res.status(status).json({ error: userMessage });
}

// --- Security: filename sanitization for Content-Disposition ---
function sanitizeFilename(name) {
    if (!name) return 'database.kdbx';
    // Strip path separators and control characters
    let safe = name.replace(/[/\\<>:"|?*\x00-\x1f]/g, '_');
    // Enforce .kdbx extension
    if (!safe.toLowerCase().endsWith('.kdbx')) {
        safe += '.kdbx';
    }
    // Limit length
    if (safe.length > 200) safe = safe.slice(0, 200);
    return safe;
}

// --- Security: in-memory rate limiter (no new dependency) ---
const rateLimiter = {
    _requests: new Map(),
    _windowMs: 60 * 1000, // 1 minute
    _maxRequests: 30,

    check(ip) {
        const now = Date.now();
        const entry = this._requests.get(ip);
        if (!entry || now - entry.windowStart > this._windowMs) {
            this._requests.set(ip, { windowStart: now, count: 1 });
            return true;
        }
        entry.count++;
        return entry.count <= this._maxRequests;
    },

    // Periodic cleanup of stale entries
    cleanup() {
        const now = Date.now();
        for (const [ip, entry] of this._requests) {
            if (now - entry.windowStart > this._windowMs) {
                this._requests.delete(ip);
            }
        }
    }
};
const rateLimitCleanup = setInterval(() => rateLimiter.cleanup(), 60 * 1000);
rateLimitCleanup.unref();

// --- Security: allowed duplicate criteria ---
const ALLOWED_CRITERIA = ['username+url', 'title+username'];

// --- Multer with file size limits and file filter ---
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024, // 10 MB
        files: 4
    },
    fileFilter(req, file, cb) {
        // No filename-based filtering — file extensions are meaningless for
        // content validation. kdbxweb will reject non-KDBX data at parse time,
        // and the CSV parser will reject non-CSV data. Only field names matter.
        const validFields = ['db1', 'db2', 'keyFile1', 'keyFile2', 'csvFile'];
        if (!validFields.includes(file.fieldname)) {
            return cb(new Error('Unexpected file field'));
        }
        cb(null, true);
    }
});

app.use(express.json());

// --- Security: rate limiting middleware ---
app.use((req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress;
    if (!rateLimiter.check(ip)) {
        return res.status(429).json({ error: 'Too many requests. Please try again later.' });
    }
    next();
});

// --- Security: security headers middleware ---
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'");
    next();
});

// --- Security: CSRF origin check for non-GET requests ---
app.use((req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
        return next();
    }
    const origin = req.headers['origin'];
    if (origin) {
        try {
            const url = new URL(origin);
            if (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
                return res.status(403).json({ error: 'Cross-origin requests are not allowed' });
            }
        } catch {
            return res.status(403).json({ error: 'Invalid origin header' });
        }
    }
    next();
});

app.use(express.static('static'));

// Middleware: require valid session token
function requireSession(req, res, next) {
    const token = req.headers['x-session-token'];
    if (!token) {
        console.warn(`Auth failure: missing token — ${req.method} ${req.path} from ${req.ip}`);
        return res.status(401).json({ error: 'Missing X-Session-Token header' });
    }
    const session = sessions.getSession(token);
    if (!session) {
        console.warn(`Auth failure: invalid/expired token — ${req.method} ${req.path} from ${req.ip}`);
        return res.status(401).json({ error: 'Invalid or expired session' });
    }
    req.session = session;
    next();
}

// POST /api/upload — upload 1-2 KDBX files + credentials, create/reuse session
app.post('/api/upload', upload.fields([
    { name: 'db1', maxCount: 1 },
    { name: 'db2', maxCount: 1 },
    { name: 'keyFile1', maxCount: 1 },
    { name: 'keyFile2', maxCount: 1 }
]), async (req, res) => {
    try {
        const token = req.headers['x-session-token'];
        let session;
        let sessionToken;

        if (token && sessions.getSession(token)) {
            session = sessions.getSession(token);
            sessionToken = token;
        } else {
            sessionToken = sessions.createSession();
            session = sessions.getSession(sessionToken);
        }

        const result = { sessionToken, databases: {} };

        if (!req.files || Object.keys(req.files).length === 0) {
            return res.status(400).json({ error: 'No database files provided' });
        }

        // Load db1 if provided
        if (req.files['db1']) {
            const buf = req.files['db1'][0].buffer;
            const password = req.body.passwordDb1 ?? null;
            const keyFile = req.files['keyFile1']?.[0]?.buffer || null;

            if (password == null && !keyFile) {
                return res.status(400).json({ error: 'Database 1 requires a password or key file' });
            }

            const db = await kdbxService.loadDatabase(buf, password, keyFile);
            const entries = kdbxService.getAllEntries(db);
            const filename = sanitizeFilename(req.files['db1'][0].originalname);

            sessions.setDatabase(sessionToken, 'db1', {
                db,
                filename
            });

            result.databases.db1 = {
                filename,
                entryCount: entries.length,
                groupCount: [...db.getDefaultGroup().allGroups()].length
            };
        }

        // Load db2 if provided
        if (req.files['db2']) {
            const buf = req.files['db2'][0].buffer;
            const password = req.body.passwordDb2 ?? null;
            const keyFile = req.files['keyFile2']?.[0]?.buffer || null;

            if (password == null && !keyFile) {
                return res.status(400).json({ error: 'Database 2 requires a password or key file' });
            }

            const db = await kdbxService.loadDatabase(buf, password, keyFile);
            const entries = kdbxService.getAllEntries(db);
            const filename = sanitizeFilename(req.files['db2'][0].originalname);

            sessions.setDatabase(sessionToken, 'db2', {
                db,
                filename
            });

            result.databases.db2 = {
                filename,
                entryCount: entries.length,
                groupCount: [...db.getDefaultGroup().allGroups()].length
            };
        }

        res.json(result);
    } catch (error) {
        safeError(res, 500, error, 'Failed to upload and process database files');
    }
});

// Handle multer errors (file size, file type)
app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: 'File size exceeds the 10 MB limit' });
        }
        return res.status(400).json({ error: 'File upload error' });
    }
    if (err.message && err.message.includes('Unexpected file field')) {
        return res.status(400).json({ error: err.message });
    }
    next(err);
});

// POST /api/compare — run bidirectional diff
app.post('/api/compare', requireSession, async (req, res) => {
    try {
        const { db1, db2 } = req.session.databases;
        if (!db1 || !db2) {
            return res.status(400).json({ error: 'Both databases must be uploaded before comparing' });
        }

        const engine = new DiffEngine();
        const result = engine.compare(db1.db, db2.db);
        res.json(result);
    } catch (error) {
        safeError(res, 500, error, 'Comparison failed');
    }
});

// GET /api/download/:slot — download db1 or db2 as binary KDBX
app.get('/api/download/:slot', requireSession, async (req, res) => {
    try {
        const slot = req.params.slot;
        if (slot !== 'db1' && slot !== 'db2') {
            return res.status(400).json({ error: 'Slot must be db1 or db2' });
        }

        const dbData = req.session.databases[slot];
        if (!dbData) {
            return res.status(404).json({ error: `No database in slot ${slot}` });
        }

        const arrayBuffer = await kdbxService.saveDatabase(dbData.db);
        const buffer = Buffer.from(arrayBuffer);

        const filename = sanitizeFilename(dbData.filename || slot + '.kdbx');
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(buffer);
    } catch (error) {
        safeError(res, 500, error, 'Failed to download database');
    }
});

// POST /api/transfer — transfer selected entries between databases
app.post('/api/transfer', requireSession, async (req, res) => {
    try {
        const { db1, db2 } = req.session.databases;
        if (!db1 || !db2) {
            return res.status(400).json({ error: 'Both databases must be uploaded' });
        }
        const { transfers } = req.body;
        if (!Array.isArray(transfers) || transfers.length === 0) {
            return res.status(400).json({ error: 'No transfers specified' });
        }

        // Validate UUIDs in transfer list
        for (const t of transfers) {
            if (!isValidUuid(t.uuid)) {
                return res.status(400).json({ error: 'Invalid UUID in transfer list' });
            }
        }

        const engine = new TransferEngine();
        const result = engine.transfer(db1.db, db2.db, transfers);
        res.json(result);
    } catch (error) {
        safeError(res, 500, error, 'Transfer failed');
    }
});

// POST /api/duplicates — find duplicate entries in db1
app.post('/api/duplicates', requireSession, async (req, res) => {
    try {
        const { db1 } = req.session.databases;
        if (!db1) {
            return res.status(400).json({ error: 'Database 1 must be uploaded' });
        }
        const criteria = req.body.criteria || 'username+url';
        if (!ALLOWED_CRITERIA.includes(criteria)) {
            return res.status(400).json({ error: 'Criteria must be one of: ' + ALLOWED_CRITERIA.join(', ') });
        }
        const finder = new DuplicateFinder();
        const result = finder.findDuplicates(db1.db, criteria);
        res.json(result);
    } catch (error) {
        safeError(res, 500, error, 'Duplicate scan failed');
    }
});

// POST /api/duplicates/remove — remove selected duplicate entries from db1
app.post('/api/duplicates/remove', requireSession, async (req, res) => {
    try {
        const { db1 } = req.session.databases;
        if (!db1) {
            return res.status(400).json({ error: 'Database 1 must be uploaded' });
        }
        const { uuids } = req.body;
        if (!Array.isArray(uuids) || uuids.length === 0) {
            return res.status(400).json({ error: 'No UUIDs specified' });
        }

        // Validate all UUIDs
        for (const uuid of uuids) {
            if (!isValidUuid(uuid)) {
                return res.status(400).json({ error: 'Invalid UUID in removal list' });
            }
        }

        const finder = new DuplicateFinder();
        const result = finder.removeEntries(db1.db, uuids);
        res.json(result);
    } catch (error) {
        safeError(res, 500, error, 'Failed to remove duplicates');
    }
});

// POST /api/import — import entries from db2 into db1
app.post('/api/import', requireSession, async (req, res) => {
    try {
        const { db1, db2 } = req.session.databases;
        if (!db1 || !db2) {
            return res.status(400).json({ error: 'Both databases must be uploaded' });
        }
        const { mode, selectedUuids } = req.body;
        if (!['skip-existing', 'selected', 'all'].includes(mode)) {
            return res.status(400).json({ error: 'Mode must be skip-existing, selected, or all' });
        }

        // Validate UUIDs when mode is 'selected'
        if (mode === 'selected' && Array.isArray(selectedUuids)) {
            for (const uuid of selectedUuids) {
                if (!isValidUuid(uuid)) {
                    return res.status(400).json({ error: 'Invalid UUID in import selection' });
                }
            }
        }

        const engine = new ImportEngine();
        const result = engine.importEntries(db2.db, db1.db, mode, selectedUuids);
        res.json(result);
    } catch (error) {
        safeError(res, 500, error, 'Import failed');
    }
});

// POST /api/csv-import — import CSV file from browser password exports
app.post('/api/csv-import', upload.single('csvFile'), async (req, res) => {
    try {
        const token = req.headers['x-session-token'];
        let session;
        let sessionToken;

        if (token && sessions.getSession(token)) {
            session = sessions.getSession(token);
            sessionToken = token;
        } else {
            sessionToken = sessions.createSession();
            session = sessions.getSession(sessionToken);
        }

        if (!req.file) {
            return res.status(400).json({ error: 'No CSV file provided' });
        }

        const csvContent = req.file.buffer.toString('utf-8');
        const importer = new CsvImporter();
        const { format, entries } = importer.parse(csvContent);

        if (entries.length === 0) {
            return res.status(400).json({ error: 'CSV file contains no entries' });
        }

        const db = await importer.createDatabase(entries);
        const allEntries = kdbxService.getAllEntries(db);

        // Store as db2 if db1 exists, otherwise as db1
        const slot = session.databases.db1 ? 'db2' : 'db1';
        const filename = sanitizeFilename(req.file.originalname.replace(/\.csv$/i, '.kdbx'));

        sessions.setDatabase(sessionToken, slot, {
            db,
            filename
        });

        res.json({
            sessionToken,
            format,
            entryCount: allEntries.length,
            slot,
            filename
        });
    } catch (error) {
        safeError(res, 500, error, 'CSV import failed');
    }
});

// DELETE /api/session — destroy session
app.delete('/api/session', requireSession, (req, res) => {
    sessions.destroySession(req.session.id);
    res.json({ ok: true });
});

// --- Security: graceful shutdown ---
let server;

function startServer(port) {
    return new Promise((resolve, reject) => {
        const s = app.listen(port, () => resolve(s));
        s.on('error', reject);
    });
}

(async () => {
    for (let port = PREFERRED_PORT; port < PREFERRED_PORT + 10; port++) {
        try {
            server = await startServer(port);
            console.log(`Server listening at http://localhost:${port}`);
            return;
        } catch (err) {
            if (err.code === 'EADDRINUSE') {
                console.warn(`Port ${port} in use, trying next...`);
                continue;
            }
            throw err;
        }
    }
    console.error(`Could not find an open port in range ${PREFERRED_PORT}-${PREFERRED_PORT + 9}`);
    process.exit(1);
})();

function gracefulShutdown(signal) {
    console.log(`\n${signal} received — shutting down gracefully`);
    sessions.destroy();
    if (server) server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
    // Force exit after 5 seconds if server hasn't closed
    setTimeout(() => process.exit(1), 5000).unref();
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
