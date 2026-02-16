const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
    getFieldAsString,
    nodeBufferToArrayBuffer,
    getBinarySize,
    serializeEntry,
    getEntryGroupPath,
    getEntryGroupNames,
    ensureGroupPath
} = require('../lib/utils');

// Mock kdbxweb ProtectedValue - must match the kdbxweb API check
const kdbxweb = require('kdbxweb');
class MockProtectedValue {
    constructor(text) {
        this._text = text;
    }
    getText() {
        return this._text;
    }
}

// Make sure our mock is recognized as a ProtectedValue
function createProtectedValue(text) {
    // Use actual kdbxweb ProtectedValue for proper handling
    return kdbxweb.ProtectedValue.fromString(text);
}

describe('utils', () => {
    describe('getFieldAsString', () => {
        it('should return empty string for null value', () => {
            const entry = { fields: new Map([['Title', null]]) };
            assert.strictEqual(getFieldAsString(entry, 'Title'), '');
        });

        it('should return empty string for undefined value', () => {
            const entry = { fields: new Map() };
            assert.strictEqual(getFieldAsString(entry, 'NonExistent'), '');
        });

        it('should extract text from ProtectedValue', () => {
            const entry = {
                fields: new Map([['Password', createProtectedValue('secret123')]])
            };
            assert.strictEqual(getFieldAsString(entry, 'Password'), 'secret123');
        });

        it('should convert regular string values', () => {
            const entry = { fields: new Map([['Title', 'My Entry']]) };
            assert.strictEqual(getFieldAsString(entry, 'Title'), 'My Entry');
        });

        it('should convert number values to strings', () => {
            const entry = { fields: new Map([['CustomField', 42]]) };
            assert.strictEqual(getFieldAsString(entry, 'CustomField'), '42');
        });
    });

    describe('nodeBufferToArrayBuffer', () => {
        it('should convert Node Buffer to ArrayBuffer', () => {
            const buf = Buffer.from([1, 2, 3, 4, 5]);
            const arrayBuf = nodeBufferToArrayBuffer(buf);

            assert.ok(arrayBuf instanceof ArrayBuffer);
            assert.strictEqual(arrayBuf.byteLength, 5);

            const view = new Uint8Array(arrayBuf);
            assert.deepStrictEqual([...view], [1, 2, 3, 4, 5]);
        });

        it('should handle empty buffer', () => {
            const buf = Buffer.from([]);
            const arrayBuf = nodeBufferToArrayBuffer(buf);

            assert.ok(arrayBuf instanceof ArrayBuffer);
            assert.strictEqual(arrayBuf.byteLength, 0);
        });

        it('should handle buffer slice correctly', () => {
            const original = Buffer.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
            const slice = original.slice(2, 6); // [2, 3, 4, 5]
            const arrayBuf = nodeBufferToArrayBuffer(slice);

            assert.strictEqual(arrayBuf.byteLength, 4);
            const view = new Uint8Array(arrayBuf);
            assert.deepStrictEqual([...view], [2, 3, 4, 5]);
        });
    });

    describe('getBinarySize', () => {
        it('should return 0 for null/undefined', () => {
            assert.strictEqual(getBinarySize(null), 0);
            assert.strictEqual(getBinarySize(undefined), 0);
        });

        it('should return size of ArrayBuffer', () => {
            const buf = new ArrayBuffer(42);
            assert.strictEqual(getBinarySize(buf), 42);
        });

        it('should return size of Uint8Array', () => {
            const arr = new Uint8Array(100);
            assert.strictEqual(getBinarySize(arr), 100);
        });

        it('should return size of wrapped ArrayBuffer (kdbxweb binary)', () => {
            const binary = { value: new ArrayBuffer(256) };
            assert.strictEqual(getBinarySize(binary), 256);
        });

        it('should return size of wrapped Uint8Array', () => {
            const binary = { value: new Uint8Array(512) };
            assert.strictEqual(getBinarySize(binary), 512);
        });

        it('should handle object with byteLength property', () => {
            const obj = { byteLength: 1024 };
            assert.strictEqual(getBinarySize(obj), 1024);
        });

        it('should return 0 for object without size info', () => {
            assert.strictEqual(getBinarySize({}), 0);
            assert.strictEqual(getBinarySize({ value: {} }), 0);
        });
    });

    describe('serializeEntry', () => {
        it('should serialize basic entry fields', () => {
            const entry = {
                uuid: {
                    toString: () => 'abc-123',
                    id: 'abc-123'
                },
                fields: new Map([
                    ['Title', 'Test Entry'],
                    ['UserName', 'user@example.com'],
                    ['URL', 'https://example.com']
                ]),
                times: {
                    creationTime: new Date('2024-01-01'),
                    lastModTime: new Date('2024-01-15'),
                    lastAccessTime: new Date('2024-02-01')
                },
                parentGroup: null,
                binaries: new Map(),
                history: []
            };

            const result = serializeEntry(entry);
            assert.strictEqual(result.uuid, 'abc-123');
            assert.strictEqual(result.fields.Title, 'Test Entry');
            assert.strictEqual(result.fields.UserName, 'user@example.com');
            assert.strictEqual(result.fields.URL, 'https://example.com');
            assert.strictEqual(result.historyCount, 0);
            assert.deepStrictEqual(result.binaries, []);
        });

        it('should mask passwords by default', () => {
            const entry = {
                uuid: { toString: () => 'abc-123', id: 'abc-123' },
                fields: new Map([
                    ['Title', 'Test'],
                    ['Password', createProtectedValue('secret123')]
                ]),
                times: { creationTime: new Date(), lastModTime: new Date(), lastAccessTime: new Date() },
                parentGroup: null,
                binaries: new Map(),
                history: []
            };

            const result = serializeEntry(entry);
            assert.strictEqual(result.fields.Password, '********');
        });

        it('should mask empty passwords', () => {
            const entry = {
                uuid: { toString: () => 'abc-123', id: 'abc-123' },
                fields: new Map([['Password', null]]),
                times: { creationTime: new Date(), lastModTime: new Date(), lastAccessTime: new Date() },
                parentGroup: null,
                binaries: new Map(),
                history: []
            };

            const result = serializeEntry(entry, { maskPasswords: true });
            assert.strictEqual(result.fields.Password, '');
        });

        it('should expose passwords when maskPasswords=false', () => {
            const entry = {
                uuid: { toString: () => 'abc-123', id: 'abc-123' },
                fields: new Map([['Password', createProtectedValue('secret123')]]),
                times: { creationTime: new Date(), lastModTime: new Date(), lastAccessTime: new Date() },
                parentGroup: null,
                binaries: new Map(),
                history: []
            };

            const result = serializeEntry(entry, { maskPasswords: false });
            assert.strictEqual(result.fields.Password, 'secret123');
        });

        it('should serialize binaries metadata', () => {
            const entry = {
                uuid: { toString: () => 'abc-123', id: 'abc-123' },
                fields: new Map(),
                times: { creationTime: new Date(), lastModTime: new Date(), lastAccessTime: new Date() },
                parentGroup: null,
                binaries: new Map([
                    ['file1.txt', { value: new ArrayBuffer(100) }],
                    ['image.png', new ArrayBuffer(2048)]
                ]),
                history: []
            };

            const result = serializeEntry(entry);
            assert.strictEqual(result.binaries.length, 2);
            assert.deepStrictEqual(result.binaries[0], { name: 'file1.txt', size: 100 });
            assert.deepStrictEqual(result.binaries[1], { name: 'image.png', size: 2048 });
        });

        it('should serialize history count', () => {
            const entry = {
                uuid: { toString: () => 'abc-123', id: 'abc-123' },
                fields: new Map(),
                times: { creationTime: new Date(), lastModTime: new Date(), lastAccessTime: new Date() },
                parentGroup: null,
                binaries: new Map(),
                history: [{}, {}, {}] // 3 history entries
            };

            const result = serializeEntry(entry);
            assert.strictEqual(result.historyCount, 3);
        });

        it('should include group path', () => {
            const rootGroup = { name: 'Root', parentGroup: null };
            const parentGroup = { name: 'Work', parentGroup: rootGroup };

            const entry = {
                uuid: { toString: () => 'abc-123', id: 'abc-123' },
                fields: new Map(),
                times: { creationTime: new Date(), lastModTime: new Date(), lastAccessTime: new Date() },
                parentGroup,
                binaries: new Map(),
                history: []
            };

            const result = serializeEntry(entry);
            assert.strictEqual(result.groupPath, 'Root/Work');
        });
    });

    describe('getEntryGroupPath', () => {
        it('should return empty string for entry with no parent', () => {
            const entry = { parentGroup: null };
            assert.strictEqual(getEntryGroupPath(entry), '');
        });

        it('should return single group name', () => {
            const group = { name: 'Personal', parentGroup: null };
            const entry = { parentGroup: group };
            assert.strictEqual(getEntryGroupPath(entry), 'Personal');
        });

        it('should return nested group path', () => {
            const root = { name: 'Root', parentGroup: null };
            const work = { name: 'Work', parentGroup: root };
            const projects = { name: 'Projects', parentGroup: work };
            const entry = { parentGroup: projects };

            assert.strictEqual(getEntryGroupPath(entry), 'Root/Work/Projects');
        });

        it('should skip groups without names', () => {
            const root = { name: null, parentGroup: null };
            const named = { name: 'Personal', parentGroup: root };
            const entry = { parentGroup: named };

            assert.strictEqual(getEntryGroupPath(entry), 'Personal');
        });
    });

    describe('getEntryGroupNames', () => {
        it('should return empty array for entry with no parent', () => {
            const entry = { parentGroup: null };
            assert.deepStrictEqual(getEntryGroupNames(entry), []);
        });

        it('should return array of group names', () => {
            const root = { name: 'Root', parentGroup: null };
            const work = { name: 'Work', parentGroup: root };
            const projects = { name: 'Projects', parentGroup: work };
            const entry = { parentGroup: projects };

            assert.deepStrictEqual(getEntryGroupNames(entry), ['Root', 'Work', 'Projects']);
        });

        it('should skip null/undefined group names', () => {
            const root = { name: undefined, parentGroup: null };
            const named = { name: 'Personal', parentGroup: root };
            const entry = { parentGroup: named };

            assert.deepStrictEqual(getEntryGroupNames(entry), ['Personal']);
        });
    });

    describe('ensureGroupPath', () => {
        it('should return default group for empty path', () => {
            const mockDb = {
                _defaultGroup: { name: 'Root', groups: [] },
                getDefaultGroup() { return this._defaultGroup; },
                createGroup: () => { throw new Error('Should not create group'); }
            };

            const result = ensureGroupPath(mockDb, []);
            assert.strictEqual(result, mockDb._defaultGroup);
        });

        it('should return existing group if it already exists', () => {
            const existingGroup = { name: 'Work', groups: [] };
            const mockDb = {
                _defaultGroup: {
                    name: 'Root',
                    groups: [existingGroup]
                },
                getDefaultGroup() { return this._defaultGroup; }
            };

            const result = ensureGroupPath(mockDb, ['Work']);
            assert.strictEqual(result, existingGroup);
        });

        it('should create missing groups', () => {
            const createdGroups = [];
            const mockDb = {
                _defaultGroup: { name: 'Root', groups: [] },
                getDefaultGroup() { return this._defaultGroup; },
                createGroup(parent, name) {
                    const newGroup = { name, groups: [] };
                    parent.groups.push(newGroup);
                    createdGroups.push({ parent, name, group: newGroup });
                    return newGroup;
                }
            };

            const result = ensureGroupPath(mockDb, ['Work', 'Projects']);

            assert.strictEqual(createdGroups.length, 2);
            assert.strictEqual(createdGroups[0].name, 'Work');
            assert.strictEqual(createdGroups[1].name, 'Projects');
            assert.strictEqual(result.name, 'Projects');
        });

        it('should skip root group name if it matches default group', () => {
            const createdGroups = [];
            const mockDb = {
                _defaultGroup: { name: 'Database', groups: [] },
                getDefaultGroup() { return this._defaultGroup; },
                createGroup(parent, name) {
                    const newGroup = { name, groups: [] };
                    parent.groups.push(newGroup);
                    createdGroups.push({ parent, name, group: newGroup });
                    return newGroup;
                }
            };

            ensureGroupPath(mockDb, ['Database', 'Work']);

            // Should only create 'Work', not 'Database'
            assert.strictEqual(createdGroups.length, 1);
            assert.strictEqual(createdGroups[0].name, 'Work');
        });

        it('should handle mixed existing and new groups', () => {
            const workGroup = { name: 'Work', groups: [] };
            const createdGroups = [];

            const mockDb = {
                _defaultGroup: {
                    name: 'Root',
                    groups: [workGroup]
                },
                getDefaultGroup() { return this._defaultGroup; },
                createGroup(parent, name) {
                    const newGroup = { name, groups: [] };
                    parent.groups.push(newGroup);
                    createdGroups.push({ parent, name, group: newGroup });
                    return newGroup;
                }
            };

            const result = ensureGroupPath(mockDb, ['Work', 'Projects', 'Client A']);

            // Should create 'Projects' and 'Client A' under 'Work'
            assert.strictEqual(createdGroups.length, 2);
            assert.strictEqual(createdGroups[0].name, 'Projects');
            assert.strictEqual(createdGroups[0].parent, workGroup);
            assert.strictEqual(createdGroups[1].name, 'Client A');
            assert.strictEqual(result.name, 'Client A');
        });
    });
});
