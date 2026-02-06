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

module.exports = { getFieldAsString, nodeBufferToArrayBuffer, serializeEntry, getEntryGroupPath, getBinarySize };
