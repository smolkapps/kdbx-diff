// Transfer tab component
const Transfer = {
    init() {
        document.getElementById('transferBtn').addEventListener('click', () => this.handleTransfer());
    },

    render() {
        const container = document.getElementById('transferContent');
        container.innerHTML = '';

        const diff = App.state.diffResults;
        if (!diff) {
            container.innerHTML = '<p class="placeholder">Run a comparison first on the Compare tab.</p>';
            return;
        }

        if (diff.onlyInDb1.length === 0 && diff.onlyInDb2.length === 0 && diff.modified.length === 0) {
            container.innerHTML = '<p class="placeholder">Databases are identical. Nothing to transfer.</p>';
            return;
        }

        // Only in DB1 → copy to DB2
        if (diff.onlyInDb1.length > 0) {
            const section = document.createElement('div');
            section.className = 'transfer-section';
            section.innerHTML = `<h3>Only in DB1 — copy to DB2 (${diff.onlyInDb1.length})</h3>`;
            const table = createEntryTable(diff.onlyInDb1, { checkboxes: true, id: 'transfer-db1' });
            section.appendChild(table);
            container.appendChild(section);
        }

        // Only in DB2 → copy to DB1
        if (diff.onlyInDb2.length > 0) {
            const section = document.createElement('div');
            section.className = 'transfer-section';
            section.innerHTML = `<h3>Only in DB2 — copy to DB1 (${diff.onlyInDb2.length})</h3>`;
            const table = createEntryTable(diff.onlyInDb2, { checkboxes: true, id: 'transfer-db2' });
            section.appendChild(table);
            container.appendChild(section);
        }

        // Modified → choose which version
        if (diff.modified.length > 0) {
            const section = document.createElement('div');
            section.className = 'transfer-section';
            section.innerHTML = `<h3>Modified — overwrite with selected version (${diff.modified.length})</h3>`;

            for (const mod of diff.modified) {
                const row = document.createElement('div');
                row.className = 'modified-transfer-row';
                const title = mod.db1Entry.fields.Title || '(untitled)';
                const newer = mod.timeDiff ? mod.timeDiff.newerIn : 'unknown';

                row.innerHTML = `
                    <label>
                        <input type="checkbox" class="transfer-modified-cb" data-uuid="${mod.db1Entry.uuid}" data-direction="">
                        <strong>${this._esc(title)}</strong>
                    </label>
                    <select class="transfer-direction" data-uuid="${mod.db1Entry.uuid}">
                        <option value="toDb2" ${newer === 'db1' ? 'selected' : ''}>DB1 → DB2</option>
                        <option value="toDb1" ${newer === 'db2' ? 'selected' : ''}>DB2 → DB1</option>
                    </select>
                    ${mod.timeDiff ? `<span class="newer-badge">Newer in ${newer.toUpperCase()}</span>` : ''}
                `;
                section.appendChild(row);
            }
            container.appendChild(section);
        }

        const btnRow = document.createElement('div');
        btnRow.className = 'button-row';
        btnRow.innerHTML = `
            <button id="transferBtn">Transfer Selected</button>
            <button class="btn-secondary" onclick="Transfer.downloadDb('db1')">Download DB1</button>
            <button class="btn-secondary" onclick="Transfer.downloadDb('db2')">Download DB2</button>
        `;
        container.appendChild(btnRow);

        document.getElementById('transferBtn').addEventListener('click', () => this.handleTransfer());
    },

    async handleTransfer() {
        const transfers = [];

        // Collect "only in DB1" selections → copy to DB2
        const db1Table = document.getElementById('transfer-db1');
        if (db1Table) {
            for (const uuid of getCheckedUuids(db1Table)) {
                transfers.push({ uuid, action: 'copy', direction: 'toDb2' });
            }
        }

        // Collect "only in DB2" selections → copy to DB1
        const db2Table = document.getElementById('transfer-db2');
        if (db2Table) {
            for (const uuid of getCheckedUuids(db2Table)) {
                transfers.push({ uuid, action: 'copy', direction: 'toDb1' });
            }
        }

        // Collect modified selections
        document.querySelectorAll('.transfer-modified-cb:checked').forEach(cb => {
            const uuid = cb.dataset.uuid;
            const select = document.querySelector(`.transfer-direction[data-uuid="${uuid}"]`);
            transfers.push({ uuid, action: 'overwrite', direction: select.value });
        });

        if (transfers.length === 0) {
            return App.setStatus('No entries selected for transfer.', 'error');
        }

        App.setStatus('Transferring entries...', 'info');
        try {
            const result = await Api.transfer(transfers);
            App.setStatus(
                `Transfer complete: ${result.copiedToDb1} copied to DB1, ${result.copiedToDb2} copied to DB2, ${result.overwritten} overwritten.`,
                'success'
            );
        } catch (err) {
            App.setStatus('Transfer failed: ' + err.message, 'error');
        }
    },

    async downloadDb(slot) {
        try {
            const blob = await Api.download(slot);
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${slot}.kdbx`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (err) {
            App.setStatus('Download failed: ' + err.message, 'error');
        }
    },

    _esc(str) {
        const d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
    }
};
