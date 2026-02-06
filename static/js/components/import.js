// Import tab component
const Import = {
    sourceEntries: null,

    init() {
        document.getElementById('importNewBtn').addEventListener('click', () => this.handleImport('skip-existing'));
        document.getElementById('importAllBtn').addEventListener('click', () => this.handleImport('all'));
        document.getElementById('importSelectedBtn').addEventListener('click', () => this.handleImportSelected());
        document.getElementById('showSelectBtn').addEventListener('click', () => this.showSelectionTable());
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
