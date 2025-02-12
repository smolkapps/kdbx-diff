const express = require('express');
const multer = require('multer');
const KdbxDiffAnalyzer = require('./KdbxDiffAnalyzer');
const fs = require('node:fs/promises');
const path = require('path');

const app = express();
const port = 3000;

// Set up multer for file uploads.  Store in memory
const storage = multer.memoryStorage()
const upload = multer({ storage: storage });

// Serve static files from the 'static' directory
app.use(express.static('static'));

// Handle the comparison request
app.post('/compare', upload.fields([{ name: 'db1' }, { name: 'db2' }]), async (req, res) => {
    try {
        const db1Buffer = req.files['db1'][0].buffer;
        const db2Buffer = req.files['db2'][0].buffer;
        const passwordDb1 = req.body.passwordDb1;
        const passwordDb2 = req.body.passwordDb2;
        const outputPath = req.body.outputPath;

        const analyzer = new KdbxDiffAnalyzer();
        const diffBuffer =  await analyzer.compareDatabases(
            db1Buffer,
            db2Buffer,
            passwordDb1,
            passwordDb2
        );

        res.setHeader('Content-Disposition', `attachment; filename="${outputPath}"`);
        res.setHeader('Content-Type', 'application/octet-stream');
        res.send(Buffer.from(diffBuffer));

    } catch (error) {
        console.error('Error comparing databases:', error);
        res.status(500).send({ message: 'Error comparing databases: ' + error.message });
    }
});

app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
});