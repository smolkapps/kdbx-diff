// Compare tab component
const Compare = {
    init() {
        document.getElementById('uploadBtn').addEventListener('click', () => this.handleUpload());
        document.getElementById('compareBtn').addEventListener('click', () => this.handleCompare());
        document.getElementById('downloadDb1Btn').addEventListener('click', () => this.handleDownload('db1'));
        document.getElementById('downloadDb2Btn').addEventListener('click', () => this.handleDownload('db2'));
    },

    async handleUpload() {
        const db1 = document.getElementById('db1').files[0];
        const db2 = document.getElementById('db2').files[0];
        if (!db1 && !db2) return App.setStatus('Select at least one database file.', 'error');

        const pw1 = document.getElementById('passwordDb1').value;
        const kf1 = document.getElementById('keyFile1').files[0];
        const pw2 = document.getElementById('passwordDb2').value;
        const kf2 = document.getElementById('keyFile2').files[0];

        if (db1 && !pw1 && !kf1) return App.setStatus('Database 1 requires a password or key file.', 'error');
        if (db2 && !pw2 && !kf2) return App.setStatus('Database 2 requires a password or key file.', 'error');

        App.setStatus('Uploading databases...', 'info');

        const formData = new FormData();
        if (db1) formData.append('db1', db1);
        if (db2) formData.append('db2', db2);
        if (pw1) formData.append('passwordDb1', pw1);
        if (pw2) formData.append('passwordDb2', pw2);
        if (kf1) formData.append('keyFile1', kf1);
        if (kf2) formData.append('keyFile2', kf2);

        try {
            const result = await Api.upload(formData);
            App.state.uploaded = true;

            let msg = 'Databases loaded.';
            if (result.databases.db1) {
                msg += ` DB1: ${result.databases.db1.entryCount} entries.`;
            }
            if (result.databases.db2) {
                msg += ` DB2: ${result.databases.db2.entryCount} entries.`;
            }
            App.setStatus(msg, 'success');
            App.enableTabs();

            document.getElementById('compareBtn').disabled = false;
            document.getElementById('downloadSection').style.display = 'flex';
        } catch (err) {
            App.setStatus('Upload failed: ' + err.message, 'error');
        }
    },

    async handleCompare() {
        App.setStatus('Comparing databases...', 'info');
        document.getElementById('compareResults').innerHTML = '';

        try {
            const result = await Api.compare();
            App.state.compared = true;
            App.state.diffResults = result;
            this.renderResults(result);
            App.setStatus('Comparison complete.', 'success');
        } catch (err) {
            App.setStatus('Compare failed: ' + err.message, 'error');
        }
    },

    renderResults(result) {
        const container = document.getElementById('compareResults');
        container.innerHTML = '';

        // Summary cards
        const summary = document.createElement('div');
        summary.className = 'summary-cards';
        summary.innerHTML = `
            <div class="card"><span class="card-number">${result.summary.onlyInDb1}</span><span class="card-label">Only in DB1</span></div>
            <div class="card"><span class="card-number">${result.summary.onlyInDb2}</span><span class="card-label">Only in DB2</span></div>
            <div class="card card-modified"><span class="card-number">${result.summary.modified}</span><span class="card-label">Modified</span></div>
            <div class="card card-identical"><span class="card-number">${result.summary.identical}</span><span class="card-label">Identical</span></div>
        `;
        container.appendChild(summary);

        // Collapsible sections
        if (result.onlyInDb1.length > 0) {
            container.appendChild(this.createSection(
                `Only in DB1 (${result.onlyInDb1.length})`,
                createEntryTable(result.onlyInDb1, { onRowClick: this.showDetail })
            ));
        }
        if (result.onlyInDb2.length > 0) {
            container.appendChild(this.createSection(
                `Only in DB2 (${result.onlyInDb2.length})`,
                createEntryTable(result.onlyInDb2, { onRowClick: this.showDetail })
            ));
        }
        if (result.modified.length > 0) {
            container.appendChild(this.createSection(
                `Modified (${result.modified.length})`,
                this.createModifiedTable(result.modified)
            ));
        }
    },

    createSection(title, content) {
        const section = document.createElement('div');
        section.className = 'collapsible-section';

        const header = document.createElement('div');
        header.className = 'section-header';
        header.textContent = title;
        header.addEventListener('click', () => {
            section.classList.toggle('collapsed');
        });

        const body = document.createElement('div');
        body.className = 'section-body';
        body.appendChild(content);

        section.appendChild(header);
        section.appendChild(body);
        return section;
    },

    createModifiedTable(modifiedEntries) {
        const wrapper = document.createElement('div');

        for (const mod of modifiedEntries) {
            const row = document.createElement('div');
            row.className = 'modified-entry';

            const title = mod.db1Entry.fields.Title || '(untitled)';
            const header = document.createElement('div');
            header.className = 'modified-entry-header';
            header.innerHTML = `<strong>${this.escapeHtml(title)}</strong>`;
            if (mod.timeDiff) {
                header.innerHTML += ` <span class="newer-badge">Newer in ${mod.timeDiff.newerIn.toUpperCase()}</span>`;
            }
            row.appendChild(header);

            if (mod.fieldDiffs.length > 0) {
                const diffTable = document.createElement('table');
                diffTable.className = 'diff-table';
                diffTable.innerHTML = '<thead><tr><th>Field</th><th>DB1</th><th>DB2</th></tr></thead>';
                const tbody = document.createElement('tbody');
                for (const d of mod.fieldDiffs) {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `<td>${this.escapeHtml(d.field)}</td><td>${this.escapeHtml(d.field === 'Password' ? '********' : d.db1Value)}</td><td>${this.escapeHtml(d.field === 'Password' ? '********' : d.db2Value)}</td>`;
                    tbody.appendChild(tr);
                }
                diffTable.appendChild(tbody);
                row.appendChild(diffTable);
            }

            wrapper.appendChild(row);
        }

        return wrapper;
    },

    showDetail(entry) {
        const modal = document.getElementById('detailModal');
        const body = document.getElementById('detailBody');

        const fields = entry.fields || {};
        let html = '<table class="detail-table">';
        for (const [key, val] of Object.entries(fields)) {
            const display = key === 'Password' ? '********' : (val || '');
            html += `<tr><td><strong>${Compare.escapeHtml(key)}</strong></td><td>${Compare.escapeHtml(display)}</td></tr>`;
        }
        if (entry.groupPath) {
            html += `<tr><td><strong>Group</strong></td><td>${Compare.escapeHtml(entry.groupPath)}</td></tr>`;
        }
        if (entry.times?.lastModTime) {
            html += `<tr><td><strong>Last Modified</strong></td><td>${new Date(entry.times.lastModTime).toLocaleString()}</td></tr>`;
        }
        html += '</table>';
        body.innerHTML = html;
        modal.style.display = 'flex';
    },

    async handleDownload(slot) {
        try {
            App.setStatus(`Downloading ${slot}...`, 'info');
            const blob = await Api.download(slot);
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${slot}.kdbx`;
            a.click();
            URL.revokeObjectURL(url);
            App.setStatus('Download started.', 'success');
        } catch (err) {
            App.setStatus('Download failed: ' + err.message, 'error');
        }
    },

    escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
};
