// Search tab component — search entries across both databases with side-by-side detail view
const Search = {
    reviewedUuids: new Set(),

    init() {
        document.getElementById('searchBtn').addEventListener('click', () => this.handleSearch());
        document.getElementById('searchInput').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.handleSearch();
        });
    },

    async handleSearch() {
        const query = document.getElementById('searchInput').value.trim();
        if (!query) return App.setStatus('Enter a search query.', 'error');

        App.setStatus('Searching...', 'info');
        const container = document.getElementById('searchResults');
        container.textContent = '';

        try {
            const result = await Api.search(query);
            this.renderResults(result, container);
            App.setStatus(
                `Found ${result.summary.totalCount} entries (${result.summary.db1Count} in DB1, ${result.summary.db2Count} in DB2).`,
                'success'
            );
        } catch (err) {
            App.setStatus('Search failed: ' + err.message, 'error');
        }
    },

    renderResults(result, container) {
        if (result.summary.totalCount === 0) {
            const p = document.createElement('p');
            p.className = 'placeholder';
            p.textContent = 'No entries found matching your query.';
            container.appendChild(p);
            return;
        }

        // Summary cards
        const summary = document.createElement('div');
        summary.className = 'summary-cards';

        const card1 = document.createElement('div');
        card1.className = 'card';
        const num1 = document.createElement('span');
        num1.className = 'card-number';
        num1.textContent = result.summary.db1Count;
        const label1 = document.createElement('span');
        label1.className = 'card-label';
        label1.textContent = 'DB1 Matches';
        card1.appendChild(num1);
        card1.appendChild(label1);

        const card2 = document.createElement('div');
        card2.className = 'card';
        const num2 = document.createElement('span');
        num2.className = 'card-number';
        num2.textContent = result.summary.db2Count;
        const label2 = document.createElement('span');
        label2.className = 'card-label';
        label2.textContent = 'DB2 Matches';
        card2.appendChild(num2);
        card2.appendChild(label2);

        summary.appendChild(card1);
        summary.appendChild(card2);
        container.appendChild(summary);

        // DB1 results
        if (result.db1Results.length > 0) {
            const table = createEntryTable(result.db1Results, {
                onRowClick: (entry) => this.showDetail(entry, 'db1')
            });
            this._applyReviewedState(table);
            container.appendChild(
                Compare.createSection(`DB1 Results (${result.db1Results.length})`, table)
            );
        }

        // DB2 results
        if (result.db2Results.length > 0) {
            const table = createEntryTable(result.db2Results, {
                onRowClick: (entry) => this.showDetail(entry, 'db2')
            });
            this._applyReviewedState(table);
            container.appendChild(
                Compare.createSection(`DB2 Results (${result.db2Results.length})`, table)
            );
        }
    },

    async showDetail(entry, source) {
        const modal = document.getElementById('detailModal');
        const body = document.getElementById('detailBody');
        body.textContent = '';

        // Show loading
        const loading = document.createElement('p');
        loading.textContent = 'Loading detail...';
        body.appendChild(loading);
        modal.style.display = 'flex';

        try {
            const detail = await Api.searchDetail(entry.uuid, source);
            body.textContent = '';
            this._renderDetailContent(body, detail, source, entry.uuid);
        } catch (err) {
            body.textContent = '';
            const errP = document.createElement('p');
            errP.textContent = 'Failed to load detail: ' + err.message;
            errP.style.color = '#c62828';
            body.appendChild(errP);
        }
    },

    _renderDetailContent(body, detail, source, uuid) {
        const { sourceEntry, counterpart, matchMethod } = detail;
        const otherDb = source === 'db1' ? 'DB2' : 'DB1';
        const sourceDb = source === 'db1' ? 'DB1' : 'DB2';

        if (!sourceEntry) {
            const p = document.createElement('p');
            p.textContent = 'Entry not found.';
            body.appendChild(p);
            return;
        }

        // Header row with title + show passwords toggle
        const headerRow = document.createElement('div');
        headerRow.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;';

        const h4 = document.createElement('h4');
        h4.textContent = 'Side-by-Side Comparison';
        headerRow.appendChild(h4);

        const showPwBtn = document.createElement('button');
        showPwBtn.className = 'btn-secondary';
        showPwBtn.textContent = 'Show Passwords';
        showPwBtn.style.cssText = 'padding: 4px 12px; font-size: 12px;';
        let passwordsVisible = false;
        headerRow.appendChild(showPwBtn);

        body.appendChild(headerRow);

        if (!counterpart) {
            const note = document.createElement('p');
            note.className = 'search-only-note';
            note.textContent = 'This entry exists only in ' + sourceDb + '. No matching entry found in ' + otherDb + '.';
            body.appendChild(note);
        } else if (matchMethod === 'title+username') {
            const note = document.createElement('p');
            note.style.cssText = 'font-size: 12px; color: #e65100; margin-bottom: 8px;';
            note.textContent = 'Matched by Title + UserName (UUIDs differ).';
            body.appendChild(note);
        }

        // Build side-by-side table
        const table = document.createElement('table');
        table.className = 'detail-side-by-side';

        const thead = document.createElement('thead');
        const headRow = document.createElement('tr');
        for (const text of ['Field', sourceDb, otherDb]) {
            const th = document.createElement('th');
            th.textContent = text;
            headRow.appendChild(th);
        }
        thead.appendChild(headRow);
        table.appendChild(thead);

        const tbody = document.createElement('tbody');
        const passwordCells = []; // track password cells for show/hide toggle

        // Collect all field keys
        const allKeys = new Set();
        if (sourceEntry.fields) {
            for (const k of Object.keys(sourceEntry.fields)) allKeys.add(k);
        }
        if (counterpart && counterpart.fields) {
            for (const k of Object.keys(counterpart.fields)) allKeys.add(k);
        }

        for (const key of allKeys) {
            const val1 = (sourceEntry.fields || {})[key] || '';
            const val2 = counterpart ? ((counterpart.fields || {})[key] || '') : '';
            const isPassword = key === 'Password';

            const tr = document.createElement('tr');
            if (counterpart && val1 !== val2) {
                tr.className = 'detail-diff-row';
            }

            const tdField = document.createElement('td');
            tdField.textContent = key;
            tdField.style.fontWeight = '600';
            tr.appendChild(tdField);

            const tdSource = document.createElement('td');
            tdSource.textContent = isPassword ? '********' : val1;
            tr.appendChild(tdSource);

            const tdOther = document.createElement('td');
            tdOther.textContent = counterpart ? (isPassword ? '********' : val2) : '\u2014';
            tr.appendChild(tdOther);

            if (isPassword) {
                passwordCells.push({ tdSource, tdOther, val1, val2, hasCounterpart: !!counterpart });
            }

            tbody.appendChild(tr);
        }

        // Show/hide password toggle
        showPwBtn.addEventListener('click', () => {
            passwordsVisible = !passwordsVisible;
            showPwBtn.textContent = passwordsVisible ? 'Hide Passwords' : 'Show Passwords';
            for (const pc of passwordCells) {
                pc.tdSource.textContent = passwordsVisible ? pc.val1 : '********';
                pc.tdOther.textContent = pc.hasCounterpart
                    ? (passwordsVisible ? pc.val2 : '********')
                    : '\u2014';
            }
        });

        // Group path row
        const grpTr = document.createElement('tr');
        const grpVal1 = sourceEntry.groupPath || '';
        const grpVal2 = counterpart ? (counterpart.groupPath || '') : '';
        if (counterpart && grpVal1 !== grpVal2) grpTr.className = 'detail-diff-row';

        const grpTd1 = document.createElement('td');
        grpTd1.textContent = 'Group';
        grpTd1.style.fontWeight = '600';
        grpTr.appendChild(grpTd1);

        const grpTd2 = document.createElement('td');
        grpTd2.textContent = grpVal1;
        grpTr.appendChild(grpTd2);

        const grpTd3 = document.createElement('td');
        grpTd3.textContent = counterpart ? grpVal2 : '\u2014';
        grpTr.appendChild(grpTd3);

        tbody.appendChild(grpTr);

        // Last modified row
        const modTr = document.createElement('tr');
        const mod1 = sourceEntry.times?.lastModTime ? new Date(sourceEntry.times.lastModTime).toLocaleString() : '';
        const mod2 = counterpart && counterpart.times?.lastModTime ? new Date(counterpart.times.lastModTime).toLocaleString() : '';
        if (counterpart && mod1 !== mod2) modTr.className = 'detail-diff-row';

        const modTd1 = document.createElement('td');
        modTd1.textContent = 'Last Modified';
        modTd1.style.fontWeight = '600';
        modTr.appendChild(modTd1);

        const modTd2 = document.createElement('td');
        modTd2.textContent = mod1;
        modTr.appendChild(modTd2);

        const modTd3 = document.createElement('td');
        modTd3.textContent = counterpart ? mod2 : '\u2014';
        modTr.appendChild(modTd3);

        tbody.appendChild(modTr);

        table.appendChild(tbody);
        body.appendChild(table);

        // Footer with reviewed checkbox
        const footer = document.createElement('div');
        footer.className = 'detail-footer';

        const label = document.createElement('label');
        label.className = 'reviewed-label';

        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = this.reviewedUuids.has(uuid);
        cb.addEventListener('change', () => {
            if (cb.checked) {
                this.reviewedUuids.add(uuid);
            } else {
                this.reviewedUuids.delete(uuid);
            }
            this._updateRowReviewed(uuid, cb.checked);
        });

        const span = document.createElement('span');
        span.textContent = 'Mark as reviewed';

        label.appendChild(cb);
        label.appendChild(span);
        footer.appendChild(label);
        body.appendChild(footer);
    },

    _updateRowReviewed(uuid, reviewed) {
        const container = document.getElementById('searchResults');
        const rows = container.querySelectorAll('tr[data-uuid]');
        for (const row of rows) {
            if (row.dataset.uuid === uuid) {
                if (reviewed) {
                    row.classList.add('search-reviewed');
                } else {
                    row.classList.remove('search-reviewed');
                }
            }
        }
    },

    _applyReviewedState(table) {
        const rows = table.querySelectorAll('tr[data-uuid]');
        for (const row of rows) {
            if (this.reviewedUuids.has(row.dataset.uuid)) {
                row.classList.add('search-reviewed');
            }
        }
    }
};
