const kdbxweb = require('kdbxweb');

function getFieldAsString(entry, fieldName) {
    const val = entry.fields.get(fieldName);
    if (val == null) return '';
    if (val instanceof kdbxweb.ProtectedValue) return val.getText();
    return String(val);
}

function nodeBufferToArrayBuffer(buf) {
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

function getBinarySize(binaryValue) {
    if (!binaryValue) return 0;
    // kdbxweb binary values can be ProtectedValue, ArrayBuffer, or have a .value property
    if (binaryValue.value) {
        const inner = binaryValue.value;
        if (inner instanceof ArrayBuffer) return inner.byteLength;
        if (inner instanceof Uint8Array) return inner.byteLength;
        if (inner && typeof inner.byteLength === 'number') return inner.byteLength;
    }
    if (binaryValue instanceof ArrayBuffer) return binaryValue.byteLength;
    if (binaryValue instanceof Uint8Array) return binaryValue.byteLength;
    if (typeof binaryValue.byteLength === 'number') return binaryValue.byteLength;
    return 0;
}

function serializeEntry(entry, { maskPasswords = true } = {}) {
    const obj = {
        uuid: entry.uuid.toString(),
        fields: {},
        times: {
            creationTime: entry.times.creationTime,
            lastModTime: entry.times.lastModTime,
            lastAccessTime: entry.times.lastAccessTime
        },
        groupPath: getEntryGroupPath(entry)
    };

    for (const [key, val] of entry.fields) {
        if (maskPasswords && key === 'Password') {
            obj.fields[key] = val ? '********' : '';
        } else if (val instanceof kdbxweb.ProtectedValue) {
            obj.fields[key] = val.getText();
        } else {
            obj.fields[key] = val != null ? String(val) : '';
        }
    }

    // Serialize binary attachments
    const binaries = [];
    if (entry.binaries) {
        for (const [name, binaryRef] of entry.binaries) {
            binaries.push({
                name,
                size: getBinarySize(binaryRef)
            });
        }
    }
    obj.binaries = binaries;

    // Serialize history count
    obj.historyCount = Array.isArray(entry.history) ? entry.history.length : 0;

    return obj;
}

function getEntryGroupPath(entry) {
    const parts = [];
    let group = entry.parentGroup;
    while (group) {
        if (group.name) parts.unshift(group.name);
        group = group.parentGroup;
    }
    return parts.join('/');
}

/**
 * Get the group path as an array of group names (excluding root).
 * Useful for recreating group hierarchy in another database.
 * @param {KdbxEntry} entry
 * @returns {string[]} Array of group names from root to entry's parent group
 */
function getEntryGroupNames(entry) {
    const parts = [];
    let group = entry.parentGroup;
    while (group) {
        if (group.name) parts.unshift(group.name);
        group = group.parentGroup;
    }
    return parts;
}

/**
 * Ensure a group path exists in the database, creating missing groups as needed.
 * @param {Kdbx} db - the target database
 * @param {string[]} groupNames - array of group names from root to target group
 * @returns {KdbxGroup} the deepest group in the path
 */
function ensureGroupPath(db, groupNames) {
    let current = db.getDefaultGroup();

    // Skip the root group name if it matches the default group
    let startIdx = 0;
    if (groupNames.length > 0 && current.name === groupNames[0]) {
        startIdx = 1;
    }

    for (let i = startIdx; i < groupNames.length; i++) {
        const name = groupNames[i];
        // Look for existing child group with this name
        let child = null;
        if (current.groups) {
            for (const g of current.groups) {
                if (g.name === name) {
                    child = g;
                    break;
                }
            }
        }

        if (!child) {
            // Create the missing group
            child = db.createGroup(current, name);
        }

        current = child;
    }

    return current;
}

module.exports = { getFieldAsString, nodeBufferToArrayBuffer, serializeEntry, getEntryGroupPath, getEntryGroupNames, ensureGroupPath, getBinarySize };
