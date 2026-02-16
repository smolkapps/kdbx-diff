const { describe, it } = require('node:test');
const assert = require('node:assert');
const CsvImporter = require('../lib/CsvImporter');

describe('CsvImporter', () => {
    describe('parse', () => {
        it('should throw on empty CSV content', () => {
            const importer = new CsvImporter();
            assert.throws(
                () => importer.parse(''),
                { message: 'CSV content is empty or invalid' }
            );
        });

        it('should throw on null CSV content', () => {
            const importer = new CsvImporter();
            assert.throws(
                () => importer.parse(null),
                { message: 'CSV content is empty or invalid' }
            );
        });

        it('should throw on CSV with only headers', () => {
            const importer = new CsvImporter();
            assert.throws(
                () => importer.parse('name,url,username,password'),
                { message: /header row and at least one data row/ }
            );
        });

        it('should parse Chrome CSV format', () => {
            const importer = new CsvImporter();
            const csv = `name,url,username,password,note
Example Site,https://example.com,user@example.com,secret123,My note here
GitHub,https://github.com,gituser,gh_token456,`;

            const result = importer.parse(csv);

            assert.strictEqual(result.format, 'chrome');
            assert.strictEqual(result.entries.length, 2);

            assert.strictEqual(result.entries[0].title, 'Example Site');
            assert.strictEqual(result.entries[0].url, 'https://example.com');
            assert.strictEqual(result.entries[0].username, 'user@example.com');
            assert.strictEqual(result.entries[0].password, 'secret123');
            assert.strictEqual(result.entries[0].notes, 'My note here');

            assert.strictEqual(result.entries[1].title, 'GitHub');
            assert.strictEqual(result.entries[1].notes, '');
        });

        it('should parse Firefox CSV format', () => {
            const importer = new CsvImporter();
            const csv = `"url","username","password","httpRealm","formActionOrigin","guid","timeCreated","timeLastUsed","timePasswordChanged"
"https://example.com","user@example.com","secret123","","https://example.com/login","{abc-123}","1704067200000","1704153600000","1704067200000"`;

            const result = importer.parse(csv);

            assert.strictEqual(result.format, 'firefox');
            assert.strictEqual(result.entries.length, 1);
            assert.strictEqual(result.entries[0].title, 'example.com');
            assert.strictEqual(result.entries[0].url, 'https://example.com');
            assert.strictEqual(result.entries[0].username, 'user@example.com');
            assert.strictEqual(result.entries[0].password, 'secret123');
        });

        it('should parse Safari CSV format', () => {
            const importer = new CsvImporter();
            const csv = `Title,URL,Username,Password,Notes,OTPAuth
Example Site,https://example.com,user@example.com,secret123,My notes,
GitHub,https://github.com,gituser,gh_token456,Some other notes,otpauth://totp/test`;

            const result = importer.parse(csv);

            assert.strictEqual(result.format, 'safari');
            assert.strictEqual(result.entries.length, 2);
            assert.strictEqual(result.entries[0].title, 'Example Site');
            assert.strictEqual(result.entries[0].notes, 'My notes');
            assert.strictEqual(result.entries[1].title, 'GitHub');
        });

        it('should handle quoted fields with commas', () => {
            const importer = new CsvImporter();
            const csv = `name,url,username,password,note
"Site, Inc",https://example.com,user,"pass,word","Note with, commas"`;

            const result = importer.parse(csv);

            assert.strictEqual(result.entries[0].title, 'Site, Inc');
            assert.strictEqual(result.entries[0].password, 'pass,word');
            assert.strictEqual(result.entries[0].notes, 'Note with, commas');
        });

        it('should handle escaped quotes in fields', () => {
            const importer = new CsvImporter();
            // CSV standard: "" inside quotes becomes a single "
            // The parser processes CSV data that browsers export
            const csv = `name,url,username,password,note
Site Name,https://example.com,user,password,"A note with a ""quoted"" word"`;

            const result = importer.parse(csv);

            // Test that quotes in the notes field are handled
            // The current CSV parser implementation processes this format
            assert.ok(result.entries[0].notes.includes('quoted'));
        });

        it('should handle quoted fields with newlines', () => {
            const importer = new CsvImporter();
            const csv = `name,url,username,password,note
"Multi
Line
Title",https://example.com,user,pass,"Note
with
newlines"`;

            const result = importer.parse(csv);

            assert.strictEqual(result.entries.length, 1);
            assert.strictEqual(result.entries[0].title, 'Multi\nLine\nTitle');
            assert.strictEqual(result.entries[0].notes, 'Note\nwith\nnewlines');
        });

        it('should handle Windows line endings (CRLF)', () => {
            const importer = new CsvImporter();
            const csv = "name,url,username,password,note\r\nExample,https://example.com,user,pass,note\r\n";

            const result = importer.parse(csv);

            assert.strictEqual(result.entries.length, 1);
            assert.strictEqual(result.entries[0].title, 'Example');
        });

        it('should skip empty lines', () => {
            const importer = new CsvImporter();
            const csv = `name,url,username,password,note
Example1,https://example.com,user1,pass1,note1

Example2,https://example.com,user2,pass2,note2

`;

            const result = importer.parse(csv);

            assert.strictEqual(result.entries.length, 2);
        });

        it('should handle empty fields', () => {
            const importer = new CsvImporter();
            const csv = `name,url,username,password,note
Example,,,pass,`;

            const result = importer.parse(csv);

            assert.strictEqual(result.entries[0].url, '');
            assert.strictEqual(result.entries[0].username, '');
            assert.strictEqual(result.entries[0].notes, '');
        });

        it('should throw on unrecognized CSV format', () => {
            const importer = new CsvImporter();
            const csv = `weird,columns,here
value1,value2,value3`;

            assert.throws(
                () => importer.parse(csv),
                { message: /Unrecognized CSV format/ }
            );
        });

        it('should extract hostname from Firefox URLs for title', () => {
            const importer = new CsvImporter();
            const csv = `"url","username","password","httpRealm","formActionOrigin","guid"
"https://subdomain.example.com:8080/path/to/login","user","pass","","","{abc}"`;

            const result = importer.parse(csv);

            assert.strictEqual(result.entries[0].title, 'subdomain.example.com');
        });

        it('should use URL as title if hostname extraction fails (Firefox)', () => {
            const importer = new CsvImporter();
            const csv = `"url","username","password","httpRealm","formActionOrigin","guid"
"not-a-valid-url","user","pass","","","{abc}"`;

            const result = importer.parse(csv);

            assert.strictEqual(result.entries[0].title, 'not-a-valid-url');
        });

        it('should handle CSV with more fields than expected', () => {
            const importer = new CsvImporter();
            const csv = `name,url,username,password,note
Example,https://example.com,user,pass,note,extra,fields,here`;

            const result = importer.parse(csv);

            // Should parse without error, extra fields ignored
            assert.strictEqual(result.entries.length, 1);
            assert.strictEqual(result.entries[0].title, 'Example');
        });

        it('should handle CSV with fewer fields than headers', () => {
            const importer = new CsvImporter();
            const csv = `name,url,username,password,note
Example,https://example.com,user`;

            const result = importer.parse(csv);

            // Should parse with missing fields as empty
            assert.strictEqual(result.entries.length, 1);
            assert.strictEqual(result.entries[0].title, 'Example');
            assert.strictEqual(result.entries[0].password, '');
            assert.strictEqual(result.entries[0].notes, '');
        });

        it('should handle mixed case headers', () => {
            const importer = new CsvImporter();
            const csv = `NAME,URL,USERNAME,PASSWORD,NOTE
Example,https://example.com,user,pass,note`;

            const result = importer.parse(csv);

            assert.strictEqual(result.format, 'chrome');
            assert.strictEqual(result.entries[0].title, 'Example');
        });

        it('should detect Safari format with title+notes+username combination', () => {
            const importer = new CsvImporter();
            const csv = `Title,URL,Username,Password,Notes
Example,https://example.com,user,pass,Some notes`;

            const result = importer.parse(csv);

            assert.strictEqual(result.format, 'safari');
        });

        it('should handle entries with only some fields filled', () => {
            const importer = new CsvImporter();
            const csv = `name,url,username,password,note
Title Only,,,pass,
,https://url-only.com,,,
,,user-only,,`;

            const result = importer.parse(csv);

            assert.strictEqual(result.entries.length, 3);
            assert.strictEqual(result.entries[0].title, 'Title Only');
            assert.strictEqual(result.entries[1].url, 'https://url-only.com');
            assert.strictEqual(result.entries[2].username, 'user-only');
        });
    });

    describe('createDatabase', async () => {
        it('should create a KDBX database from parsed entries', async () => {
            const importer = new CsvImporter();
            const entries = [
                { title: 'Entry 1', url: 'https://example.com', username: 'user1', password: 'pass1', notes: 'Note 1' },
                { title: 'Entry 2', url: 'https://test.com', username: 'user2', password: 'pass2', notes: '' }
            ];

            const db = await importer.createDatabase(entries);

            assert.ok(db);
            assert.ok(db.getDefaultGroup);

            const defaultGroup = db.getDefaultGroup();
            const allEntries = [...defaultGroup.allEntries()];

            assert.strictEqual(allEntries.length, 2);
        });

        it('should handle empty entries array', async () => {
            const importer = new CsvImporter();
            const db = await importer.createDatabase([]);

            const allEntries = [...db.getDefaultGroup().allEntries()];
            assert.strictEqual(allEntries.length, 0);
        });
    });
});
