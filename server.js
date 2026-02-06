const express = require('express');
const multer = require('multer');
const KdbxService = require('./lib/KdbxService');
const DiffEngine = require('./lib/DiffEngine');
const TransferEngine = require('./lib/TransferEngine');
const DuplicateFinder = require('./lib/DuplicateFinder');
const ImportEngine = require('./lib/ImportEngine');
const SessionStore = require('./lib/SessionStore');

const app = express();
const port = 3000;
const upload = multer({ storage: multer.memoryStorage() });
const sessions = new SessionStore();
const kdbxService = new KdbxService();

app.use(express.json());
app.use(express.static('static'));

// Middleware: require valid session token
function requireSession(req, res, next) {
    const token = req.headers['x-session-token'];
    if (!token) return res.status(401).json({ error: 'Missing X-Session-Token header' });
    const session = sessions.getSession(token);
    if (!session) return res.status(401).json({ error: 'Invalid or expired session' });
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

        // Load db1 if provided
        if (req.files['db1']) {
            const buf = req.files['db1'][0].buffer;
            const password = req.body.passwordDb1 ?? null;
            const keyFile = req.files['keyFile1']?.[0]?.buffer || null;

            if (password == null && !keyFile) {
                return res.status(400).json({ error: 'Database 1 requires a password or key file' });
            }

            const db = await kdbxService.loadDatabase(buf, password, keyFile);
            const credentials = await kdbxService.createCredentials(password, keyFile);
            const entries = kdbxService.getAllEntries(db);

            sessions.setDatabase(sessionToken, 'db1', {
                db,
                credentials,
                filename: req.files['db1'][0].originalname
            });

            result.databases.db1 = {
                filename: req.files['db1'][0].originalname,
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
            const credentials = await kdbxService.createCredentials(password, keyFile);
            const entries = kdbxService.getAllEntries(db);

            sessions.setDatabase(sessionToken, 'db2', {
                db,
                credentials,
                filename: req.files['db2'][0].originalname
            });

            result.databases.db2 = {
                filename: req.files['db2'][0].originalname,
                entryCount: entries.length,
                groupCount: [...db.getDefaultGroup().allGroups()].length
            };
        }

        res.json(result);
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: error.message });
    }
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
        console.error('Compare error:', error);
        res.status(500).json({ error: error.message });
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

        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${dbData.filename || slot + '.kdbx'}"`);
        res.send(buffer);
    } catch (error) {
        console.error('Download error:', error);
        res.status(500).json({ error: error.message });
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

        const engine = new TransferEngine();
        const result = engine.transfer(db1.db, db2.db, transfers);
        res.json(result);
    } catch (error) {
        console.error('Transfer error:', error);
        res.status(500).json({ error: error.message });
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
        const finder = new DuplicateFinder();
        const result = finder.findDuplicates(db1.db, criteria);
        res.json(result);
    } catch (error) {
        console.error('Duplicates error:', error);
        res.status(500).json({ error: error.message });
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

        const finder = new DuplicateFinder();
        const result = finder.removeEntries(db1.db, uuids);
        res.json(result);
    } catch (error) {
        console.error('Remove duplicates error:', error);
        res.status(500).json({ error: error.message });
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

        const engine = new ImportEngine();
        const result = engine.importEntries(db2.db, db1.db, mode, selectedUuids);
        res.json(result);
    } catch (error) {
        console.error('Import error:', error);
        res.status(500).json({ error: error.message });
    }
});

// DELETE /api/session — destroy session
app.delete('/api/session', requireSession, (req, res) => {
    sessions.destroySession(req.session.id);
    res.json({ ok: true });
});

app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
});
