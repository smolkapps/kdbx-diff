// CSV Import tab component
const CsvImport = {
    init() {
        document.getElementById('csvImportBtn').addEventListener('click', () => this.handleImport());
    },

    async handleImport() {
        const fileInput = document.getElementById('csvFile');
        const file = fileInput.files[0];
        if (!file) {
            return App.setStatus('Select a CSV file to import.', 'error');
        }

        if (!file.name.toLowerCase().endsWith('.csv')) {
            return App.setStatus('Only .csv files are accepted.', 'error');
        }

        App.setStatus('Importing CSV file...', 'info');

        const formData = new FormData();
        formData.append('csvFile', file);

        try {
            const result = await Api.csvImport(formData);
            App.state.uploaded = true;
            App.enableTabs();
            document.getElementById('downloadSection').style.display = 'flex';
            document.getElementById('compareBtn').disabled = false;

            // If db1 (main database) is loaded, auto-compare and show import UI
            if (result.hasDb1) {
                this.renderImportView(result);
            } else {
                this.renderStandaloneView(result);
            }
        } catch (err) {
            App.setStatus('CSV import failed: ' + err.message, 'error');
        }
    },

    // DB1 is loaded — compare and let user import entries
    async renderImportView(result) {
        const container = document.getElementById('csvImportResults');
        container.textContent = '';

        App.setStatus(`CSV loaded as DB2 (${result.entryCount} entries, ${result.format} format). Comparing with your database...`, 'info');

        try {
            const diff = await Api.compare();
            App.state.compared = true;
            App.state.diffResults = diff;

            // Summary
            const summary = document.createElement('div');
            summary.className = 'csv-import-result';

            const heading = document.createElement('div');
            heading.className = 'csv-format-detected';
            heading.textContent = result.entryCount + ' entries from ' + result.format.charAt(0).toUpperCase() + result.format.slice(1) + ' export';
            summary.appendChild(heading);

            const stats = document.createElement('div');
            stats.className = 'csv-slot-info';
            const newCount = diff.onlyInDb2.length;
            const existingCount = diff.summary.identical + diff.summary.modified;
            stats.textContent = newCount + ' new entries, ' + existingCount + ' already in your database';
            summary.appendChild(stats);

            container.appendChild(summary);

            // Show new entries with checkboxes for selective import
            if (newCount > 0) {
                const sectionLabel = document.createElement('h3');
                sectionLabel.textContent = 'New entries to import (' + newCount + ')';
                sectionLabel.style.marginTop = '16px';
                container.appendChild(sectionLabel);

                const table = createEntryTable(diff.onlyInDb2, { checkboxes: true, id: 'csv-import-select-table' });
                container.appendChild(table);

                const btnRow = document.createElement('div');
                btnRow.className = 'button-row';
                btnRow.style.marginTop = '12px';

                const importAllBtn = document.createElement('button');
                importAllBtn.textContent = 'Import All ' + newCount + ' New';
                importAllBtn.addEventListener('click', () => this._doImport('skip-existing'));
                btnRow.appendChild(importAllBtn);

                const importSelBtn = document.createElement('button');
                importSelBtn.className = 'btn-secondary';
                importSelBtn.textContent = 'Import Selected';
                importSelBtn.addEventListener('click', () => this._doImportSelected());
                btnRow.appendChild(importSelBtn);

                const dlBtn = document.createElement('button');
                dlBtn.className = 'btn-secondary';
                dlBtn.textContent = 'Download DB1';
                dlBtn.addEventListener('click', () => Transfer.downloadDb('db1'));
                btnRow.appendChild(dlBtn);

                container.appendChild(btnRow);
            } else {
                const noNew = document.createElement('p');
                noNew.className = 'placeholder';
                noNew.textContent = 'All entries from the CSV are already in your database.';
                container.appendChild(noNew);

                const btnRow = document.createElement('div');
                btnRow.className = 'button-row';
                btnRow.style.marginTop = '12px';
                const dlBtn = document.createElement('button');
                dlBtn.className = 'btn-secondary';
                dlBtn.textContent = 'Download CSV as KDBX';
                dlBtn.addEventListener('click', () => Transfer.downloadDb('db2'));
                btnRow.appendChild(dlBtn);
                container.appendChild(btnRow);
            }

            App.setStatus('Comparison complete. ' + newCount + ' new entries found in CSV.', 'success');
        } catch (err) {
            App.setStatus('Compare failed: ' + err.message, 'error');
        }
    },

    // No DB1 loaded — standalone CSV conversion
    renderStandaloneView(result) {
        const container = document.getElementById('csvImportResults');
        container.textContent = '';

        const card = document.createElement('div');
        card.className = 'csv-import-result';

        const formatLabel = document.createElement('div');
        formatLabel.className = 'csv-format-detected';
        const formatText = document.createElement('span');
        formatText.textContent = 'Detected: ';
        const formatBadge = document.createElement('strong');
        formatBadge.textContent = result.format.charAt(0).toUpperCase() + result.format.slice(1) + ' format';
        formatLabel.appendChild(formatText);
        formatLabel.appendChild(formatBadge);
        card.appendChild(formatLabel);

        const countLabel = document.createElement('div');
        countLabel.className = 'csv-entry-count';
        countLabel.textContent = result.entryCount + ' entries imported';
        card.appendChild(countLabel);

        // Download button
        const btnRow = document.createElement('div');
        btnRow.className = 'button-row';
        btnRow.style.marginTop = '12px';

        const dlBtn = document.createElement('button');
        dlBtn.textContent = 'Download as KDBX';
        dlBtn.addEventListener('click', () => Transfer.downloadDb(result.slot));
        btnRow.appendChild(dlBtn);
        card.appendChild(btnRow);

        const hint = document.createElement('p');
        hint.className = 'csv-hint';
        hint.textContent = 'Password for the downloaded database is "csv-import". To import entries into an existing database, load it on the Compare tab first, then come back here.';
        card.appendChild(hint);

        container.appendChild(card);

        App.setStatus(
            'CSV imported: ' + result.entryCount + ' entries from ' + result.format + ' format. Download it or load a main database first to compare and import.',
            'success'
        );
    },

    async _doImport(mode) {
        App.setStatus('Importing entries into your database...', 'info');
        try {
            const result = await Api.importEntries(mode);
            App.setStatus('Import complete: ' + result.imported + ' entries added to DB1.', 'success');
        } catch (err) {
            App.setStatus('Import failed: ' + err.message, 'error');
        }
    },

    async _doImportSelected() {
        const table = document.getElementById('csv-import-select-table');
        if (!table) return App.setStatus('No entries loaded.', 'error');

        const uuids = getCheckedUuids(table);
        if (uuids.length === 0) return App.setStatus('No entries selected.', 'error');

        App.setStatus('Importing ' + uuids.length + ' selected entries...', 'info');
        try {
            const result = await Api.importEntries('selected', uuids);
            App.setStatus('Import complete: ' + result.imported + ' entries added to DB1.', 'success');
        } catch (err) {
            App.setStatus('Import failed: ' + err.message, 'error');
        }
    }
};
