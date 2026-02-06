// Duplicates tab component
const Duplicates = {
    init() {
        document.getElementById('findDuplicatesBtn').addEventListener('click', () => this.handleFind());
        document.getElementById('removeDuplicatesBtn').addEventListener('click', () => this.handleRemove());
    },

    async handleFind() {
        const criteria = document.getElementById('dupCriteria').value;
        App.setStatus('Scanning for duplicates...', 'info');

        try {
            const result = await Api.duplicates();
            this.renderResults(result);
            App.setStatus(
                `Found ${result.summary.totalGroups} duplicate groups (${result.summary.totalDuplicates} extra entries).`,
                'success'
            );
        } catch (err) {
            App.setStatus('Duplicate scan failed: ' + err.message, 'error');
        }
    },

    renderResults(result) {
        const container = document.getElementById('dupResults');
        container.innerHTML = '';

        if (result.groups.length === 0) {
            container.innerHTML = '<p class="placeholder">No duplicates found.</p>';
            return;
        }

        for (const group of result.groups) {
            const section = document.createElement('div');
            section.className = 'dup-group';

            const header = document.createElement('div');
            header.className = 'dup-group-header';
            header.textContent = `${group.entries.length} entries — ${group.key}`;
            header.addEventListener('click', () => section.classList.toggle('collapsed'));
            section.appendChild(header);

            const body = document.createElement('div');
            body.className = 'dup-group-body';

            for (const entry of group.entries) {
                const row = document.createElement('div');
                row.className = 'dup-entry';
                const isKeep = entry.suggested === 'keep';

                row.innerHTML = `
                    <label>
                        <input type="checkbox" class="dup-remove-cb" value="${entry.uuid}" ${isKeep ? '' : 'checked'}>
                        <span class="dup-entry-title">${this._esc(entry.fields.Title || '(untitled)')}</span>
                        <span class="dup-entry-user">${this._esc(entry.fields.UserName || '')}</span>
                        <span class="dup-entry-mod">${entry.times?.lastModTime ? new Date(entry.times.lastModTime).toLocaleDateString() : ''}</span>
                        ${isKeep ? '<span class="keep-badge">KEEP</span>' : '<span class="remove-badge">REMOVE</span>'}
                    </label>
                `;
                body.appendChild(row);
            }

            section.appendChild(body);
            container.appendChild(section);
        }

        document.getElementById('removeDuplicatesBtn').disabled = false;
    },

    async handleRemove() {
        const uuids = [...document.querySelectorAll('.dup-remove-cb:checked')]
            .map(cb => cb.value);

        if (uuids.length === 0) {
            return App.setStatus('No entries selected for removal.', 'error');
        }

        App.setStatus(`Removing ${uuids.length} duplicate entries...`, 'info');
        try {
            const result = await Api.removeDuplicates(uuids);
            App.setStatus(`Removed ${result.removed} entries. Download the cleaned database.`, 'success');
        } catch (err) {
            App.setStatus('Removal failed: ' + err.message, 'error');
        }
    },

    _esc(str) {
        const d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
    }
};
