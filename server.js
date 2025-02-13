const express = require('express');
const multer = require('multer');
const KdbxDiffAnalyzer = require('./KdbxDiffAnalyzer');
const fs = require('node:fs/promises');
const path = require('path');

const app = express();
const port = 3000;

const storage = multer.memoryStorage()
const upload = multer({ storage: storage });

app.use(express.static('static'));

app.post('/compare', upload.fields([
    { name: 'db1' },
    { name: 'db2' },
    { name: 'keyFile1' },
    { name: 'keyFile2' }
]), async (req, res) => {
    try {
        const db1Buffer = req.files['db1'][0].buffer;
        const db2Buffer = req.files['db2'][0].buffer;
        const keyFile1Buffer = req.files['keyFile1']?.[0]?.buffer;
        const keyFile2Buffer = req.files['keyFile2']?.[0]?.buffer;
        const passwordDb1 = req.body.passwordDb1 || null;
        const passwordDb2 = req.body.passwordDb2 || null;
        const outputPath = req.body.outputPath;

        if (!passwordDb1 && !keyFile1Buffer) {
            throw new Error('Database 1 requires either a password or key file');
        }
        if (!passwordDb2 && !keyFile2Buffer) {
            throw new Error('Database 2 requires either a password or key file');
        }

        const analyzer = new KdbxDiffAnalyzer();
        const { diffBuffer, diffString } = await analyzer.compareDatabases(
            db1Buffer,
            db2Buffer,
            passwordDb1,
            passwordDb2,
            keyFile1Buffer,
            keyFile2Buffer
        );

        res.setHeader('Content-Type', 'application/json'); // Set content type to JSON
        res.send({ diffBuffer: Buffer.from(diffBuffer), diffString }); // Send both as JSON
    } catch (error) {
        console.error('Error comparing databases:', error);
        res.status(500).send({ message: 'Error comparing databases: ' + error.message });
    }
});

app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
});