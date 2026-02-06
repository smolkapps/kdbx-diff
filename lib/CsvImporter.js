const kdbxweb = require('kdbxweb');
require('./argon2-adapter');

class CsvImporter {
    /**
     * Auto-detect CSV format and parse entries.
     * @param {string} csvContent - Raw CSV file content
     * @returns {{ format: string, entries: Array<{title, url, username, password, notes}> }}
     */
    parse(csvContent) {
        if (!csvContent || typeof csvContent !== 'string') {
            throw new Error('CSV content is empty or invalid');
        }

        const lines = this._splitLines(csvContent.trim());
        if (lines.length < 2) {
            throw new Error('CSV file must have a header row and at least one data row');
        }

        const headerLine = lines[0];
        const format = this._detectFormat(headerLine);
        const headers = this._parseCsvLine(headerLine);
        const entries = [];

        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            const values = this._parseCsvLine(line);
            const entry = this._mapEntry(format, headers, values);
            if (entry) entries.push(entry);
        }

        return { format, entries };
    }

    /**
     * Create a KDBX database from parsed entries.
     * @param {Array<{title, url, username, password, notes}>} entries
     * @returns {Promise<Kdbx>}
     */
    async createDatabase(entries) {
        const credentials = new kdbxweb.KdbxCredentials(
            kdbxweb.ProtectedValue.fromString('csv-import')
        );
        await credentials.ready;

        const db = kdbxweb.Kdbx.create(credentials, 'CSV Import');
        const defaultGroup = db.getDefaultGroup();

        for (const entry of entries) {
            const kdbxEntry = db.createEntry(defaultGroup);
            kdbxEntry.fields.set('Title', entry.title || '');
            kdbxEntry.fields.set('URL', entry.url || '');
            kdbxEntry.fields.set('UserName', entry.username || '');
            kdbxEntry.fields.set('Password', kdbxweb.ProtectedValue.fromString(entry.password || ''));
            kdbxEntry.fields.set('Notes', entry.notes || '');
        }

        return db;
    }

    /**
     * Detect CSV format from header row.
     * @param {string} headerLine
     * @returns {string} 'chrome' | 'firefox' | 'safari'
     */
    _detectFormat(headerLine) {
        const lower = headerLine.toLowerCase();

        // Firefox: "url","username","password","httpRealm","formActionOrigin","guid",...
        if (lower.includes('httprealm') || lower.includes('formactionorigin') || lower.includes('guid')) {
            return 'firefox';
        }

        // Safari: Title,URL,Username,Password,Notes,OTPAuth
        if (lower.includes('otpauth') || (lower.includes('title') && lower.includes('notes') && lower.includes('username'))) {
            return 'safari';
        }

        // Chrome: name,url,username,password,note
        if (lower.includes('name') && lower.includes('url') && lower.includes('username')) {
            return 'chrome';
        }

        throw new Error('Unrecognized CSV format. Supported formats: Chrome, Firefox, Safari');
    }

    /**
     * Map a CSV row to a normalized entry object based on detected format.
     */
    _mapEntry(format, headers, values) {
        const row = {};
        for (let i = 0; i < headers.length && i < values.length; i++) {
            row[headers[i].toLowerCase().trim()] = values[i];
        }

        switch (format) {
            case 'chrome':
                return {
                    title: row['name'] || '',
                    url: row['url'] || '',
                    username: row['username'] || '',
                    password: row['password'] || '',
                    notes: row['note'] || ''
                };

            case 'firefox': {
                const url = row['url'] || '';
                let title = '';
                try {
                    title = new URL(url).hostname;
                } catch {
                    title = url;
                }
                return {
                    title,
                    url,
                    username: row['username'] || '',
                    password: row['password'] || '',
                    notes: ''
                };
            }

            case 'safari':
                return {
                    title: row['title'] || '',
                    url: row['url'] || '',
                    username: row['username'] || '',
                    password: row['password'] || '',
                    notes: row['notes'] || ''
                };

            default:
                return null;
        }
    }

    /**
     * Split CSV content into lines, respecting quoted fields that contain newlines.
     */
    _splitLines(text) {
        const lines = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < text.length; i++) {
            const ch = text[i];

            if (ch === '"') {
                if (inQuotes && i + 1 < text.length && text[i + 1] === '"') {
                    current += '"';
                    i++; // skip escaped quote
                } else {
                    inQuotes = !inQuotes;
                    current += ch;
                }
            } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
                if (ch === '\r' && i + 1 < text.length && text[i + 1] === '\n') {
                    i++; // skip \r\n
                }
                lines.push(current);
                current = '';
            } else {
                current += ch;
            }
        }

        if (current) lines.push(current);
        return lines;
    }

    /**
     * Parse a single CSV line into an array of field values.
     * Handles quoted fields with commas and escaped quotes.
     */
    _parseCsvLine(line) {
        const fields = [];
        let current = '';
        let inQuotes = false;
        let i = 0;

        while (i < line.length) {
            const ch = line[i];

            if (inQuotes) {
                if (ch === '"') {
                    if (i + 1 < line.length && line[i + 1] === '"') {
                        current += '"';
                        i += 2;
                    } else {
                        inQuotes = false;
                        i++;
                    }
                } else {
                    current += ch;
                    i++;
                }
            } else {
                if (ch === '"') {
                    inQuotes = true;
                    i++;
                } else if (ch === ',') {
                    fields.push(current);
                    current = '';
                    i++;
                } else {
                    current += ch;
                    i++;
                }
            }
        }

        fields.push(current);
        return fields;
    }
}

module.exports = CsvImporter;
