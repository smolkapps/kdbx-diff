// Transfer tab component
const Transfer = {
    init() {
        // transferBtn is dynamically created in render(), event listener bound there
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
            const h3 = document.createElement('h3');
            h3.textContent = `Only in DB1 — copy to DB2 (${diff.onlyInDb1.length})`;
            section.appendChild(h3);
            const table = createEntryTable(diff.onlyInDb1, { checkboxes: true, id: 'transfer-db1' });
            section.appendChild(table);
            container.appendChild(section);
        }

        // Only in DB2 → copy to DB1
        if (diff.onlyInDb2.length > 0) {
            const section = document.createElement('div');
            section.className = 'transfer-section';
            const h3 = document.createElement('h3');
            h3.textContent = `Only in DB2 — copy to DB1 (${diff.onlyInDb2.length})`;
            section.appendChild(h3);
            const table = createEntryTable(diff.onlyInDb2, { checkboxes: true, id: 'transfer-db2' });
            section.appendChild(table);
            container.appendChild(section);
        }

        // Modified — choose which version
        if (diff.modified.length > 0) {
            const section = document.createElement('div');
            section.className = 'transfer-section';
            const h3 = document.createElement('h3');
            h3.textContent = `Modified — overwrite with selected version (${diff.modified.length})`;
            section.appendChild(h3);

            for (const mod of diff.modified) {
                const row = document.createElement('div');
                row.className = 'modified-transfer-row';
                const title = mod.db1Entry.fields.Title || '(untitled)';
                const newer = mod.timeDiff ? mod.timeDiff.newerIn : 'unknown';

                const label = document.createElement('label');
                const cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.className = 'transfer-modified-cb';
                cb.dataset.uuid = mod.db1Entry.uuid;
                cb.dataset.direction = '';
                label.appendChild(cb);
                const strong = document.createElement('strong');
                strong.textContent = title;
                label.appendChild(strong);
                row.appendChild(label);

                const select = document.createElement('select');
                select.className = 'transfer-direction';
                select.dataset.uuid = mod.db1Entry.uuid;
                const opt1 = document.createElement('option');
                opt1.value = 'toDb2';
                opt1.textContent = 'DB1 → DB2';
                if (newer === 'db1') opt1.selected = true;
                select.appendChild(opt1);
                const opt2 = document.createElement('option');
                opt2.value = 'toDb1';
                opt2.textContent = 'DB2 → DB1';
                if (newer === 'db2') opt2.selected = true;
                select.appendChild(opt2);
                row.appendChild(select);

                if (mod.timeDiff) {
                    const badge = document.createElement('span');
                    badge.className = 'newer-badge';
                    badge.textContent = `Newer in ${newer.toUpperCase()}`;
                    row.appendChild(badge);
                }

                section.appendChild(row);
            }
            container.appendChild(section);
        }

        const btnRow = document.createElement('div');
        btnRow.className = 'button-row';

        const transferBtn = document.createElement('button');
        transferBtn.id = 'transferBtn';
        transferBtn.textContent = 'Transfer Selected';
        btnRow.appendChild(transferBtn);

        const dlBtn1 = document.createElement('button');
        dlBtn1.className = 'btn-secondary';
        dlBtn1.textContent = 'Download DB1';
        dlBtn1.addEventListener('click', () => Transfer.downloadDb('db1'));
        btnRow.appendChild(dlBtn1);

        const dlBtn2 = document.createElement('button');
        dlBtn2.className = 'btn-secondary';
        dlBtn2.textContent = 'Download DB2';
        dlBtn2.addEventListener('click', () => Transfer.downloadDb('db2'));
        btnRow.appendChild(dlBtn2);

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

        // Collect modified selections — use Array.find instead of querySelector with interpolated UUID
        const allCbs = [...document.querySelectorAll('.transfer-modified-cb:checked')];
        const allSelects = [...document.querySelectorAll('.transfer-direction')];
        for (const cb of allCbs) {
            const uuid = cb.dataset.uuid;
            const select = allSelects.find(el => el.dataset.uuid === uuid);
            transfers.push({ uuid, action: 'overwrite', direction: select ? select.value : 'toDb2' });
        }

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
    }
};
