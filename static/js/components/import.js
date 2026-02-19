// Import tab component
const Import = {
    sourceEntries: null,

    init() {
        document.getElementById('importNewBtn').addEventListener('click', () => this.handleImport('skip-existing'));
        document.getElementById('importAllBtn').addEventListener('click', () => this.handleImport('all'));
        document.getElementById('importSelectedBtn').addEventListener('click', () => this.handleImportSelected());
        document.getElementById('showSelectBtn').addEventListener('click', () => this.showSelectionTable());

        // Extract split button
        document.getElementById('extractBtn').addEventListener('click', () => this.handleExtract('clipboard'));
        const arrow = document.getElementById('extractDropdownBtn');
        const menu = document.getElementById('extractMenu');
        arrow.addEventListener('click', (e) => {
            e.stopPropagation();
            menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
        });
        menu.addEventListener('click', (e) => {
            const action = e.target.dataset.action;
            if (action) {
                menu.style.display = 'none';
                this.handleExtract(action);
            }
        });
        document.addEventListener('click', () => { menu.style.display = 'none'; });
    },

    async showSelectionTable() {
        App.setStatus('Loading source entries for selection...', 'info');
        try {
            // Compare to get the full picture
            const diff = App.state.diffResults || await Api.compare();
            App.state.diffResults = diff;

            const container = document.getElementById('importSelectArea');
            container.innerHTML = '';

            // Show all db2 entries for selection
            const allEntries = [
                ...diff.onlyInDb2,
                ...diff.modified.map(m => m.db2Entry)
            ];

            if (allEntries.length === 0) {
                container.innerHTML = '<p class="placeholder">No entries available to import from DB2.</p>';
                return;
            }

            const table = createEntryTable(allEntries, { checkboxes: true, id: 'import-select-table' });
            container.appendChild(table);

            document.getElementById('importSelectedBtn').disabled = false;
            App.setStatus(`${allEntries.length} entries available for import.`, 'success');
        } catch (err) {
            App.setStatus('Failed to load entries: ' + err.message, 'error');
        }
    },

    async handleImport(mode) {
        App.setStatus(`Importing entries (${mode})...`, 'info');
        try {
            const result = await Api.importEntries(mode);
            App.setStatus(`Import complete: ${result.imported} entries imported into DB1.`, 'success');
        } catch (err) {
            App.setStatus('Import failed: ' + err.message, 'error');
        }
    },

    async handleExtract(action) {
        App.setStatus('Extracting titles and URLs...', 'info');
        try {
            const data = await Api.entries();
            const allEntries = [...data.db1Entries, ...data.db2Entries];

            const rows = allEntries.map(e => ({
                title: e.Title || '',
                url: e.URL || ''
            })).filter(r => r.title || r.url);

            if (rows.length === 0) {
                App.setStatus('No entries with titles or URLs found.', 'error');
                return;
            }

            const dbLabel = data.db1Entries.length && data.db2Entries.length ? 'DB1+DB2' :
                data.db1Entries.length ? 'DB1' : 'DB2';

            if (action === 'clipboard') {
                const text = rows.map(r => r.title + '\t' + r.url).join('\n');
                await navigator.clipboard.writeText(text);
                App.setStatus(`Copied ${rows.length} entries from ${dbLabel} to clipboard.`, 'success');
            } else if (action === 'csv') {
                const lines = ['Title,URL', ...rows.map(r =>
                    '"' + r.title.replace(/"/g, '""') + '","' + r.url.replace(/"/g, '""') + '"'
                )];
                const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'titles-urls.csv';
                a.click();
                URL.revokeObjectURL(url);
                App.setStatus(`Downloaded CSV with ${rows.length} entries from ${dbLabel}.`, 'success');
            } else if (action === 'display') {
                this._displayExtracted(rows);
                App.setStatus(`Showing ${rows.length} entries from ${dbLabel}.`, 'success');
            }
        } catch (err) {
            App.setStatus('Extract failed: ' + err.message, 'error');
        }
    },

    _displayExtracted(rows) {
        const area = document.getElementById('extractDisplayArea');
        area.innerHTML = '';
        const table = document.createElement('table');
        table.className = 'entry-table';
        table.innerHTML = '<thead><tr><th>Title</th><th>URL</th></tr></thead>';
        const tbody = document.createElement('tbody');
        for (const r of rows) {
            const tr = document.createElement('tr');
            const td1 = document.createElement('td');
            td1.textContent = r.title;
            const td2 = document.createElement('td');
            td2.textContent = r.url;
            tr.appendChild(td1);
            tr.appendChild(td2);
            tbody.appendChild(tr);
        }
        table.appendChild(tbody);
        area.appendChild(table);
    },

    async handleImportSelected() {
        const table = document.getElementById('import-select-table');
        if (!table) return App.setStatus('No entries loaded for selection.', 'error');

        const uuids = getCheckedUuids(table);
        if (uuids.length === 0) return App.setStatus('No entries selected.', 'error');

        App.setStatus(`Importing ${uuids.length} selected entries...`, 'info');
        try {
            const result = await Api.importEntries('selected', uuids);
            App.setStatus(`Import complete: ${result.imported} entries imported into DB1.`, 'success');
        } catch (err) {
            App.setStatus('Import failed: ' + err.message, 'error');
        }
    }
};
