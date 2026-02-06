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

                const label = document.createElement('label');

                const cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.className = 'dup-remove-cb';
                cb.value = entry.uuid;
                if (!isKeep) cb.checked = true;
                label.appendChild(cb);

                const titleSpan = document.createElement('span');
                titleSpan.className = 'dup-entry-title';
                titleSpan.textContent = entry.fields.Title || '(untitled)';
                label.appendChild(titleSpan);

                const userSpan = document.createElement('span');
                userSpan.className = 'dup-entry-user';
                userSpan.textContent = entry.fields.UserName || '';
                label.appendChild(userSpan);

                const modSpan = document.createElement('span');
                modSpan.className = 'dup-entry-mod';
                modSpan.textContent = entry.times?.lastModTime ? new Date(entry.times.lastModTime).toLocaleDateString() : '';
                label.appendChild(modSpan);

                const badge = document.createElement('span');
                badge.className = isKeep ? 'keep-badge' : 'remove-badge';
                badge.textContent = isKeep ? 'KEEP' : 'REMOVE';
                label.appendChild(badge);

                row.appendChild(label);
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
    }
};
