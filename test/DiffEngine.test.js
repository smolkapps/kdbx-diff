const { describe, it } = require('node:test');
const assert = require('node:assert');
const DiffEngine = require('../lib/DiffEngine');
const kdbxweb = require('kdbxweb');

// Mock entry factory
function createMockEntry(uuid, title, username, password, modTime, options = {}) {
    return {
        uuid: {
            id: uuid,
            toString: () => uuid,
            equals: (other) => other.id === uuid
        },
        fields: new Map([
            ['Title', title],
            ['UserName', username],
            ['Password', password ? kdbxweb.ProtectedValue.fromString(password) : null],
            ['URL', options.url || ''],
            ['Notes', options.notes || '']
        ]),
        times: {
            creationTime: options.creationTime || new Date('2024-01-01'),
            lastModTime: modTime,
            lastAccessTime: options.lastAccessTime || new Date()
        },
        parentGroup: options.parentGroup || null,
        binaries: options.binaries || new Map(),
        history: options.history || []
    };
}

// Mock database
function createMockDb(entries) {
    return {
        meta: {
            recycleBinUuid: null
        },
        getDefaultGroup: () => ({
            *allEntries() {
                for (const entry of entries) {
                    yield entry;
                }
            }
        })
    };
}

describe('DiffEngine', () => {
    describe('compare', () => {
        it('should identify entries only in db1', () => {
            const engine = new DiffEngine();
            const entry1 = createMockEntry('uuid-1', 'Entry 1', 'user1', 'pass1', new Date());
            const entry2 = createMockEntry('uuid-2', 'Entry 2', 'user2', 'pass2', new Date());
            const entry3 = createMockEntry('uuid-3', 'Entry 3', 'user3', 'pass3', new Date());

            const db1 = createMockDb([entry1, entry2, entry3]);
            const db2 = createMockDb([entry2]); // Only entry2 is in both

            const result = engine.compare(db1, db2);

            assert.strictEqual(result.onlyInDb1.length, 2);
            assert.strictEqual(result.onlyInDb2.length, 0);
            assert.strictEqual(result.summary.onlyInDb1, 2);

            const onlyInDb1Uuids = result.onlyInDb1.map(e => e.uuid);
            assert.ok(onlyInDb1Uuids.includes('uuid-1'));
            assert.ok(onlyInDb1Uuids.includes('uuid-3'));
        });

        it('should identify entries only in db2', () => {
            const engine = new DiffEngine();
            const entry1 = createMockEntry('uuid-1', 'Entry 1', 'user1', 'pass1', new Date());
            const entry2 = createMockEntry('uuid-2', 'Entry 2', 'user2', 'pass2', new Date());

            const db1 = createMockDb([entry1]);
            const db2 = createMockDb([entry1, entry2]);

            const result = engine.compare(db1, db2);

            assert.strictEqual(result.onlyInDb1.length, 0);
            assert.strictEqual(result.onlyInDb2.length, 1);
            assert.strictEqual(result.onlyInDb2[0].uuid, 'uuid-2');
        });

        it('should identify identical entries', () => {
            const engine = new DiffEngine();
            const modTime = new Date('2024-01-15T10:00:00Z');

            const entry1a = createMockEntry('uuid-1', 'Same Entry', 'user@example.com', 'password', modTime);
            const entry1b = createMockEntry('uuid-1', 'Same Entry', 'user@example.com', 'password', modTime);

            const db1 = createMockDb([entry1a]);
            const db2 = createMockDb([entry1b]);

            const result = engine.compare(db1, db2);

            assert.strictEqual(result.identical.length, 1);
            assert.strictEqual(result.identical[0].uuid, 'uuid-1');
            assert.strictEqual(result.modified.length, 0);
        });

        it('should detect field differences', () => {
            const engine = new DiffEngine();
            const modTime = new Date('2024-01-15');

            const entry1 = createMockEntry('uuid-1', 'Entry 1', 'user1', 'pass1', modTime);
            const entry2 = createMockEntry('uuid-1', 'Entry 1 Modified', 'user1', 'pass1', modTime);

            const db1 = createMockDb([entry1]);
            const db2 = createMockDb([entry2]);

            const result = engine.compare(db1, db2);

            assert.strictEqual(result.modified.length, 1);
            const mod = result.modified[0];
            assert.strictEqual(mod.fieldDiffs.length, 1);
            assert.strictEqual(mod.fieldDiffs[0].field, 'Title');
            assert.strictEqual(mod.fieldDiffs[0].db1Value, 'Entry 1');
            assert.strictEqual(mod.fieldDiffs[0].db2Value, 'Entry 1 Modified');
        });

        it('should detect password differences without exposing values', () => {
            const engine = new DiffEngine();
            const modTime = new Date('2024-01-15');

            const entry1 = createMockEntry('uuid-1', 'Entry', 'user', 'oldpass', modTime);
            const entry2 = createMockEntry('uuid-1', 'Entry', 'user', 'newpass', modTime);

            const db1 = createMockDb([entry1]);
            const db2 = createMockDb([entry2]);

            const result = engine.compare(db1, db2);

            assert.strictEqual(result.modified.length, 1);
            const mod = result.modified[0];
            assert.strictEqual(mod.fieldDiffs.length, 1);
            assert.strictEqual(mod.fieldDiffs[0].field, 'Password');
            assert.strictEqual(mod.fieldDiffs[0].db1Value, '********');
            assert.strictEqual(mod.fieldDiffs[0].db2Value, '********');
            assert.strictEqual(mod.fieldDiffs[0].passwordsDiffer, true);
        });

        it('should detect timestamp differences', () => {
            const engine = new DiffEngine();
            const time1 = new Date('2024-01-15T10:00:00Z');
            const time2 = new Date('2024-01-20T15:00:00Z');

            const entry1 = createMockEntry('uuid-1', 'Entry', 'user', 'pass', time1);
            const entry2 = createMockEntry('uuid-1', 'Entry', 'user', 'pass', time2);

            const db1 = createMockDb([entry1]);
            const db2 = createMockDb([entry2]);

            const result = engine.compare(db1, db2);

            assert.strictEqual(result.modified.length, 1);
            const mod = result.modified[0];
            assert.ok(mod.timeDiff);
            assert.strictEqual(mod.timeDiff.newerIn, 'db2');
        });

        it('should detect binary attachment differences', () => {
            const engine = new DiffEngine();
            const modTime = new Date('2024-01-15');

            const binaries1 = new Map([
                ['file.txt', { value: new ArrayBuffer(100) }]
            ]);
            const binaries2 = new Map([
                ['file.txt', { value: new ArrayBuffer(200) }]
            ]);

            const entry1 = createMockEntry('uuid-1', 'Entry', 'user', 'pass', modTime, { binaries: binaries1 });
            const entry2 = createMockEntry('uuid-1', 'Entry', 'user', 'pass', modTime, { binaries: binaries2 });

            const db1 = createMockDb([entry1]);
            const db2 = createMockDb([entry2]);

            const result = engine.compare(db1, db2);

            assert.strictEqual(result.modified.length, 1);
            const mod = result.modified[0];
            assert.ok(mod.binaryDiffs);
            assert.strictEqual(mod.binaryDiffs.length, 1);
            assert.strictEqual(mod.binaryDiffs[0].status, 'modified');
            assert.strictEqual(mod.binaryDiffs[0].db1Size, 100);
            assert.strictEqual(mod.binaryDiffs[0].db2Size, 200);
        });

        it('should detect added/removed binaries', () => {
            const engine = new DiffEngine();
            const modTime = new Date('2024-01-15');

            const binaries1 = new Map([
                ['old-file.txt', { value: new ArrayBuffer(100) }]
            ]);
            const binaries2 = new Map([
                ['new-file.txt', { value: new ArrayBuffer(200) }]
            ]);

            const entry1 = createMockEntry('uuid-1', 'Entry', 'user', 'pass', modTime, { binaries: binaries1 });
            const entry2 = createMockEntry('uuid-1', 'Entry', 'user', 'pass', modTime, { binaries: binaries2 });

            const db1 = createMockDb([entry1]);
            const db2 = createMockDb([entry2]);

            const result = engine.compare(db1, db2);

            assert.strictEqual(result.modified.length, 1);
            const mod = result.modified[0];
            assert.strictEqual(mod.binaryDiffs.length, 2);

            const removed = mod.binaryDiffs.find(d => d.status === 'removed');
            const added = mod.binaryDiffs.find(d => d.status === 'added');

            assert.ok(removed);
            assert.strictEqual(removed.name, 'old-file.txt');
            assert.ok(added);
            assert.strictEqual(added.name, 'new-file.txt');
        });

        it('should detect history count differences', () => {
            const engine = new DiffEngine();
            const modTime = new Date('2024-01-15');

            const history1 = [{}, {}]; // 2 history entries
            const history2 = [{}, {}, {}]; // 3 history entries

            const entry1 = createMockEntry('uuid-1', 'Entry', 'user', 'pass', modTime, { history: history1 });
            const entry2 = createMockEntry('uuid-1', 'Entry', 'user', 'pass', modTime, { history: history2 });

            const db1 = createMockDb([entry1]);
            const db2 = createMockDb([entry2]);

            const result = engine.compare(db1, db2);

            assert.strictEqual(result.modified.length, 1);
            const mod = result.modified[0];
            assert.ok(mod.historyDiff);
            assert.strictEqual(mod.historyDiff.db1Count, 2);
            assert.strictEqual(mod.historyDiff.db2Count, 3);
        });

        it('should use Title+UserName fallback when UUIDs differ', () => {
            const engine = new DiffEngine();
            const modTime = new Date('2024-01-15');

            // Different UUIDs but same Title+UserName
            const entry1 = createMockEntry('uuid-old', 'My Entry', 'user@example.com', 'pass', modTime);
            const entry2 = createMockEntry('uuid-new', 'My Entry', 'user@example.com', 'pass', modTime);

            const db1 = createMockDb([entry1]);
            const db2 = createMockDb([entry2]);

            const result = engine.compare(db1, db2);

            // Should match via fallback
            assert.strictEqual(result.identical.length, 1);
            assert.strictEqual(result.identical[0].matchedByFallback, true);
        });

        it('should generate correct summary statistics', () => {
            const engine = new DiffEngine();
            const modTime = new Date('2024-01-15');

            const e1 = createMockEntry('uuid-1', 'Only in DB1', 'user1', 'pass1', modTime);
            const e2 = createMockEntry('uuid-2', 'Identical', 'user2', 'pass2', modTime);
            const e2b = createMockEntry('uuid-2', 'Identical', 'user2', 'pass2', modTime);
            const e3 = createMockEntry('uuid-3', 'Modified', 'user3', 'pass3', modTime);
            const e3b = createMockEntry('uuid-3', 'Modified Updated', 'user3', 'pass3', modTime);
            const e4 = createMockEntry('uuid-4', 'Only in DB2', 'user4', 'pass4', modTime);

            const db1 = createMockDb([e1, e2, e3]);
            const db2 = createMockDb([e2b, e3b, e4]);

            const result = engine.compare(db1, db2);

            assert.strictEqual(result.summary.totalDb1, 3);
            assert.strictEqual(result.summary.totalDb2, 3);
            assert.strictEqual(result.summary.onlyInDb1, 1);
            assert.strictEqual(result.summary.onlyInDb2, 1);
            assert.strictEqual(result.summary.identical, 1);
            assert.strictEqual(result.summary.modified, 1);
        });

        it('should handle empty databases', () => {
            const engine = new DiffEngine();
            const db1 = createMockDb([]);
            const db2 = createMockDb([]);

            const result = engine.compare(db1, db2);

            assert.strictEqual(result.onlyInDb1.length, 0);
            assert.strictEqual(result.onlyInDb2.length, 0);
            assert.strictEqual(result.identical.length, 0);
            assert.strictEqual(result.modified.length, 0);
            assert.strictEqual(result.summary.totalDb1, 0);
            assert.strictEqual(result.summary.totalDb2, 0);
        });

        it('should handle entries with missing fields', () => {
            const engine = new DiffEngine();
            const modTime = new Date('2024-01-15');

            const entry1 = createMockEntry('uuid-1', '', '', null, modTime);
            const entry2 = createMockEntry('uuid-1', '', '', null, modTime);

            const db1 = createMockDb([entry1]);
            const db2 = createMockDb([entry2]);

            const result = engine.compare(db1, db2);

            assert.strictEqual(result.identical.length, 1);
        });
    });
});
