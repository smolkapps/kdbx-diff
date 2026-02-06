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
        container.innerHTML = '';

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

        const hint = document.createElement('p');
        hint.className = 'csv-hint';
        hint.textContent = 'You can now use the Compare, Transfer, and Import tabs to work with this database.';
        card.appendChild(hint);

        container.appendChild(card);
    }
};
