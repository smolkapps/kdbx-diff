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
            this.renderResult(result);
            App.state.uploaded = true;
            App.enableTabs();

            // Enable Compare tab download section since a database is now loaded
            document.getElementById('downloadSection').style.display = 'flex';
            document.getElementById('compareBtn').disabled = false;
            App.setStatus(
                `CSV imported: ${result.entryCount} entries from ${result.format} format, stored as ${result.slot}.`,
                'success'
            );
        } catch (err) {
            App.setStatus('CSV import failed: ' + err.message, 'error');
        }
    },

    renderResult(result) {
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

        const slotLabel = document.createElement('div');
        slotLabel.className = 'csv-slot-info';
        slotLabel.textContent = 'Stored as ' + result.slot.toUpperCase() + ' (' + result.filename + ')';
        card.appendChild(slotLabel);

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
        hint.textContent = 'Password for the downloaded database is "csv-import". You can also use the Compare, Duplicates, and Search tabs.';
        card.appendChild(hint);

        container.appendChild(card);
    }
};
