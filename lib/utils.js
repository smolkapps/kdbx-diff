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

module.exports = { getFieldAsString, nodeBufferToArrayBuffer, serializeEntry, getEntryGroupPath };
