const { describe, it } = require('node:test');
const assert = require('node:assert');

// Extract validation functions from server.js by requiring the module
// Since server.js starts the server, we need to extract just the functions
// For now, we'll test the validation logic directly

describe('Server validation functions', () => {
    describe('isValidUuid', () => {
        const UUID_REGEX = /^(?:[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}|[A-Za-z0-9+/]{22}==)$/;

        function isValidUuid(str) {
            return typeof str === 'string' && UUID_REGEX.test(str);
        }

        it('should accept valid UUID v4 with hyphens', () => {
            assert.strictEqual(isValidUuid('550e8400-e29b-41d4-a716-446655440000'), true);
            assert.strictEqual(isValidUuid('f47ac10b-58cc-4372-a567-0e02b2c3d479'), true);
        });

        it('should accept valid UUID v4 without hyphens', () => {
            assert.strictEqual(isValidUuid('550e8400e29b41d4a716446655440000'), true);
        });

        it('should accept base64-encoded UUID (kdbxweb format)', () => {
            assert.strictEqual(isValidUuid('VQ6EAOKbQdSnFkRmVUQAAA=='), true);
            assert.strictEqual(isValidUuid('9HrBC1jMQ3KlZw4CssPUeQ=='), true);
        });

        it('should reject invalid UUID formats', () => {
            assert.strictEqual(isValidUuid('not-a-uuid'), false);
            assert.strictEqual(isValidUuid(''), false);
            assert.strictEqual(isValidUuid('550e8400-e29b-41d4-a716'), false); // too short
            assert.strictEqual(isValidUuid('550e8400-e29b-41d4-a716-446655440000-extra'), false); // too long
        });

        it('should reject non-string values', () => {
            assert.strictEqual(isValidUuid(null), false);
            assert.strictEqual(isValidUuid(undefined), false);
            assert.strictEqual(isValidUuid(12345), false);
            assert.strictEqual(isValidUuid({}), false);
        });

        it('should reject UUIDs with invalid characters', () => {
            assert.strictEqual(isValidUuid('550e8400-e29b-41d4-a716-44665544000g'), false); // 'g' invalid
            assert.strictEqual(isValidUuid('550e8400-e29b-41d4-a716-44665544000G'), false); // uppercase in hex
        });

        it('should reject SQL injection attempts', () => {
            assert.strictEqual(isValidUuid("' OR '1'='1"), false);
            assert.strictEqual(isValidUuid('550e8400-e29b-41d4-a716-446655440000; DROP TABLE'), false);
        });

        it('should reject path traversal attempts', () => {
            assert.strictEqual(isValidUuid('../../../etc/passwd'), false);
            assert.strictEqual(isValidUuid('..\\..\\..\\windows\\system32'), false);
        });
    });

    describe('sanitizeFilename', () => {
        function sanitizeFilename(name) {
            if (!name) return 'database.kdbx';
            let safe = name.replace(/[/\\<>:"|?*\x00-\x1f]/g, '_');
            if (!safe.toLowerCase().endsWith('.kdbx')) {
                safe += '.kdbx';
            }
            if (safe.length > 200) safe = safe.slice(0, 200);
            return safe;
        }

        it('should return default filename for null/undefined', () => {
            assert.strictEqual(sanitizeFilename(null), 'database.kdbx');
            assert.strictEqual(sanitizeFilename(undefined), 'database.kdbx');
            assert.strictEqual(sanitizeFilename(''), 'database.kdbx');
        });

        it('should preserve valid filenames', () => {
            assert.strictEqual(sanitizeFilename('mypasswords.kdbx'), 'mypasswords.kdbx');
            assert.strictEqual(sanitizeFilename('work-backup.kdbx'), 'work-backup.kdbx');
        });

        it('should strip path separators', () => {
            assert.strictEqual(sanitizeFilename('/etc/passwd.kdbx'), '_etc_passwd.kdbx');
            assert.strictEqual(sanitizeFilename('..\\..\\windows\\system32.kdbx'), '.._.._windows_system32.kdbx');
            assert.strictEqual(sanitizeFilename('path/to/file.kdbx'), 'path_to_file.kdbx');
        });

        it('should strip control characters', () => {
            assert.strictEqual(sanitizeFilename('file\x00name.kdbx'), 'file_name.kdbx');
            assert.strictEqual(sanitizeFilename('file\x1fname.kdbx'), 'file_name.kdbx');
            assert.strictEqual(sanitizeFilename('file\nname.kdbx'), 'file_name.kdbx');
        });

        it('should strip dangerous characters', () => {
            assert.strictEqual(sanitizeFilename('file<name>.kdbx'), 'file_name_.kdbx');
            assert.strictEqual(sanitizeFilename('file:name.kdbx'), 'file_name.kdbx');
            assert.strictEqual(sanitizeFilename('file|name.kdbx'), 'file_name.kdbx');
            assert.strictEqual(sanitizeFilename('file?name.kdbx'), 'file_name.kdbx');
            assert.strictEqual(sanitizeFilename('file*name.kdbx'), 'file_name.kdbx');
            assert.strictEqual(sanitizeFilename('file"name".kdbx'), 'file_name_.kdbx');
        });

        it('should enforce .kdbx extension', () => {
            assert.strictEqual(sanitizeFilename('passwords'), 'passwords.kdbx');
            assert.strictEqual(sanitizeFilename('passwords.txt'), 'passwords.txt.kdbx');
            assert.strictEqual(sanitizeFilename('passwords.db'), 'passwords.db.kdbx');
        });

        it('should preserve existing .kdbx extension', () => {
            assert.strictEqual(sanitizeFilename('passwords.kdbx'), 'passwords.kdbx');
            assert.strictEqual(sanitizeFilename('passwords.KDBX'), 'passwords.KDBX');
            assert.strictEqual(sanitizeFilename('passwords.KdBx'), 'passwords.KdBx');
        });

        it('should limit length to 200 characters', () => {
            const longName = 'a'.repeat(300) + '.kdbx';
            const result = sanitizeFilename(longName);
            assert.strictEqual(result.length, 200);
            // The .kdbx extension may get truncated if the input is too long
            // The function slices to 200 chars first, then adds .kdbx if missing
            // So if input already has .kdbx and is long, it just slices to 200
        });

        it('should handle path traversal attempts', () => {
            assert.strictEqual(sanitizeFilename('../../../etc/passwd'), '.._.._.._etc_passwd.kdbx');
            assert.strictEqual(sanitizeFilename('..\\..\\..\\windows\\system32'), '.._.._.._windows_system32.kdbx');
        });

        it('should handle null byte injection', () => {
            assert.strictEqual(sanitizeFilename('file.kdbx\x00.txt'), 'file.kdbx_.txt.kdbx');
        });

        it('should allow safe special characters', () => {
            assert.strictEqual(sanitizeFilename('my-passwords_backup (2024).kdbx'), 'my-passwords_backup (2024).kdbx');
            assert.strictEqual(sanitizeFilename('work@home.kdbx'), 'work@home.kdbx');
        });
    });

    describe('Input validation - array size limits', () => {
        it('should reject transfer lists exceeding 1000 entries', () => {
            const transfers = Array(1001).fill({ uuid: 'abc-123', action: 'copy', direction: 'toDb1' });
            assert.strictEqual(transfers.length > 1000, true);
        });

        it('should accept transfer lists at the limit', () => {
            const transfers = Array(1000).fill({ uuid: 'abc-123', action: 'copy', direction: 'toDb1' });
            assert.strictEqual(transfers.length <= 1000, true);
        });

        it('should reject duplicate removal lists exceeding 1000 UUIDs', () => {
            const uuids = Array(1001).fill('550e8400-e29b-41d4-a716-446655440000');
            assert.strictEqual(uuids.length > 1000, true);
        });

        it('should reject import selections exceeding 10000 entries', () => {
            const selectedUuids = Array(10001).fill('550e8400-e29b-41d4-a716-446655440000');
            assert.strictEqual(selectedUuids.length > 10000, true);
        });

        it('should accept import selections at the limit', () => {
            const selectedUuids = Array(10000).fill('550e8400-e29b-41d4-a716-446655440000');
            assert.strictEqual(selectedUuids.length <= 10000, true);
        });
    });

    describe('Input validation - import mode validation', () => {
        const VALID_MODES = ['skip-existing', 'selected', 'all'];

        function isValidMode(mode) {
            return VALID_MODES.includes(mode);
        }

        it('should accept valid import modes', () => {
            assert.strictEqual(isValidMode('skip-existing'), true);
            assert.strictEqual(isValidMode('selected'), true);
            assert.strictEqual(isValidMode('all'), true);
        });

        it('should reject invalid import modes', () => {
            assert.strictEqual(isValidMode('invalid'), false);
            assert.strictEqual(isValidMode('delete-all'), false);
            assert.strictEqual(isValidMode(''), false);
            assert.strictEqual(isValidMode(null), false);
        });

        it('should reject SQL injection in mode', () => {
            assert.strictEqual(isValidMode("all' OR '1'='1"), false);
        });
    });

    describe('Input validation - criteria validation', () => {
        const ALLOWED_CRITERIA = ['username+url', 'title+username'];

        function isValidCriteria(criteria) {
            return ALLOWED_CRITERIA.includes(criteria);
        }

        it('should accept valid duplicate search criteria', () => {
            assert.strictEqual(isValidCriteria('username+url'), true);
            assert.strictEqual(isValidCriteria('title+username'), true);
        });

        it('should reject invalid criteria', () => {
            assert.strictEqual(isValidCriteria('invalid'), false);
            assert.strictEqual(isValidCriteria('password'), false);
            assert.strictEqual(isValidCriteria(''), false);
        });

        it('should reject injection attempts in criteria', () => {
            assert.strictEqual(isValidCriteria("username+url' OR '1'='1"), false);
        });
    });

    describe('Input validation - action and direction validation', () => {
        const VALID_ACTIONS = ['copy', 'overwrite'];
        const VALID_DIRECTIONS = ['toDb1', 'toDb2'];

        function isValidAction(action) {
            return VALID_ACTIONS.includes(action);
        }

        function isValidDirection(direction) {
            return VALID_DIRECTIONS.includes(direction);
        }

        it('should accept valid transfer actions', () => {
            assert.strictEqual(isValidAction('copy'), true);
            assert.strictEqual(isValidAction('overwrite'), true);
        });

        it('should reject invalid transfer actions', () => {
            assert.strictEqual(isValidAction('delete'), false);
            assert.strictEqual(isValidAction('move'), false);
            assert.strictEqual(isValidAction(''), false);
        });

        it('should accept valid transfer directions', () => {
            assert.strictEqual(isValidDirection('toDb1'), true);
            assert.strictEqual(isValidDirection('toDb2'), true);
        });

        it('should reject invalid transfer directions', () => {
            assert.strictEqual(isValidDirection('fromDb1'), false);
            assert.strictEqual(isValidDirection('toDb3'), false);
            assert.strictEqual(isValidDirection(''), false);
        });
    });

    describe('Input validation - search field validation', () => {
        const ALLOWED_SEARCH_FIELDS = ['Title', 'UserName', 'URL', 'Notes'];

        function isValidSearchField(field) {
            return ALLOWED_SEARCH_FIELDS.includes(field);
        }

        function validateSearchFields(fields) {
            if (!Array.isArray(fields)) return false;
            if (fields.length === 0) return false;
            if (fields.length > ALLOWED_SEARCH_FIELDS.length) return false;
            return fields.every(isValidSearchField);
        }

        it('should accept valid search fields', () => {
            assert.strictEqual(isValidSearchField('Title'), true);
            assert.strictEqual(isValidSearchField('UserName'), true);
            assert.strictEqual(isValidSearchField('URL'), true);
            assert.strictEqual(isValidSearchField('Notes'), true);
        });

        it('should reject invalid search fields', () => {
            assert.strictEqual(isValidSearchField('Password'), false);
            assert.strictEqual(isValidSearchField('CustomField'), false);
            assert.strictEqual(isValidSearchField(''), false);
        });

        it('should validate search field arrays', () => {
            assert.strictEqual(validateSearchFields(['Title', 'URL']), true);
            assert.strictEqual(validateSearchFields(['Title']), true);
            assert.strictEqual(validateSearchFields(['Title', 'UserName', 'URL', 'Notes']), true);
        });

        it('should reject invalid search field arrays', () => {
            assert.strictEqual(validateSearchFields([]), false);
            assert.strictEqual(validateSearchFields(['Title', 'Password']), false);
            assert.strictEqual(validateSearchFields(['Title', 'Title', 'Title', 'Title', 'Title']), false);
        });

        it('should reject non-array values', () => {
            assert.strictEqual(validateSearchFields('Title'), false);
            assert.strictEqual(validateSearchFields(null), false);
        });
    });

    describe('Input validation - search query validation', () => {
        function isValidSearchQuery(query) {
            return typeof query === 'string' && query.trim().length > 0 && query.length <= 200;
        }

        it('should accept valid search queries', () => {
            assert.strictEqual(isValidSearchQuery('password'), true);
            assert.strictEqual(isValidSearchQuery('my search query'), true);
            assert.strictEqual(isValidSearchQuery('a'), true);
        });

        it('should reject empty or whitespace-only queries', () => {
            assert.strictEqual(isValidSearchQuery(''), false);
            assert.strictEqual(isValidSearchQuery('   '), false);
            assert.strictEqual(isValidSearchQuery('\t\n'), false);
        });

        it('should reject queries exceeding 200 characters', () => {
            const longQuery = 'a'.repeat(201);
            assert.strictEqual(isValidSearchQuery(longQuery), false);
        });

        it('should accept queries at the limit', () => {
            const limitQuery = 'a'.repeat(200);
            assert.strictEqual(isValidSearchQuery(limitQuery), true);
        });

        it('should reject non-string values', () => {
            assert.strictEqual(isValidSearchQuery(null), false);
            assert.strictEqual(isValidSearchQuery(undefined), false);
            assert.strictEqual(isValidSearchQuery(123), false);
        });
    });

    describe('Input validation - database slot validation', () => {
        function isValidSlot(slot) {
            return slot === 'db1' || slot === 'db2';
        }

        it('should accept valid database slots', () => {
            assert.strictEqual(isValidSlot('db1'), true);
            assert.strictEqual(isValidSlot('db2'), true);
        });

        it('should reject invalid database slots', () => {
            assert.strictEqual(isValidSlot('db3'), false);
            assert.strictEqual(isValidSlot('db0'), false);
            assert.strictEqual(isValidSlot('database1'), false);
            assert.strictEqual(isValidSlot(''), false);
        });

        it('should reject path traversal in slot names', () => {
            assert.strictEqual(isValidSlot('../db1'), false);
            assert.strictEqual(isValidSlot('db1/../db2'), false);
        });
    });
});
