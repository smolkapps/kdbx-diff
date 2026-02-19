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

        // Always show DB1 left, DB2 right regardless of which was clicked
        const db1Entry = source === 'db1' ? sourceEntry : counterpart;
        const db2Entry = source === 'db1' ? counterpart : sourceEntry;
        // Column index (1=left data col, 2=right data col) that is the selected/source
        const selectedCol = source === 'db1' ? 1 : 2;

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
        let unmaskedDetail = null; // cached after first fetch
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

        // Summary of differing fields
        if (counterpart) {
            const differingFields = [];

            // Check all fields
            const allKeys = new Set();
            if (sourceEntry.fields) {
                for (const k of Object.keys(sourceEntry.fields)) allKeys.add(k);
            }
            if (counterpart.fields) {
                for (const k of Object.keys(counterpart.fields)) allKeys.add(k);
            }
            for (const key of allKeys) {
                const val1 = (sourceEntry.fields || {})[key] || '';
                const val2 = (counterpart.fields || {})[key] || '';
                if (val1 !== val2) differingFields.push(key);
            }

            // Check group path
            const grpVal1 = sourceEntry.groupPath || '';
            const grpVal2 = counterpart.groupPath || '';
            if (grpVal1 !== grpVal2) differingFields.push('Group');

            // Check last modified
            const mod1 = sourceEntry.times?.lastModTime || '';
            const mod2 = counterpart.times?.lastModTime || '';
            if (mod1 !== mod2) differingFields.push('Last Modified');

            if (differingFields.length > 0) {
                const diffSummary = document.createElement('p');
                diffSummary.style.cssText = 'font-size: 12px; color: #1565c0; font-weight: 500; margin-bottom: 8px;';
                diffSummary.textContent = 'Fields that differ: ' + differingFields.join(', ');
                body.appendChild(diffSummary);
            }
        }

        // Build side-by-side table — always DB1 left, DB2 right
        const table = document.createElement('table');
        table.className = 'detail-side-by-side';

        const thead = document.createElement('thead');
        const headRow = document.createElement('tr');
        const headers = ['Field', 'DB1', 'DB2'];
        for (let i = 0; i < headers.length; i++) {
            const th = document.createElement('th');
            th.textContent = headers[i];
            if (i === selectedCol) th.classList.add('selected-db-column');
            headRow.appendChild(th);
        }
        thead.appendChild(headRow);
        table.appendChild(thead);

        const tbody = document.createElement('tbody');
        const protectedCells = []; // track protected-field cells for show/hide toggle

        // Collect all field keys
        const allKeys = new Set();
        if (sourceEntry.fields) {
            for (const k of Object.keys(sourceEntry.fields)) allKeys.add(k);
        }
        if (counterpart && counterpart.fields) {
            for (const k of Object.keys(counterpart.fields)) allKeys.add(k);
        }

        // Determine which fields are protected (from either entry)
        const protectedFields = new Set([
            ...(sourceEntry.protectedFields || []),
            ...((counterpart && counterpart.protectedFields) || [])
        ]);

        for (const key of allKeys) {
            const srcVal = (sourceEntry.fields || {})[key] || '';
            const cptVal = counterpart ? ((counterpart.fields || {})[key] || '') : '';
            // Always: left = DB1, right = DB2
            const [leftVal, rightVal] = source === 'db1'
                ? [srcVal, cptVal]
                : [cptVal, srcVal];
            const isProtected = protectedFields.has(key);

            const tr = document.createElement('tr');
            if (counterpart && srcVal !== cptVal) {
                tr.className = 'detail-diff-row';
            }

            const tdField = document.createElement('td');
            tdField.textContent = key;
            tdField.style.fontWeight = '600';
            tr.appendChild(tdField);

            const tdLeft = document.createElement('td');
            tdLeft.textContent = isProtected ? '********' : leftVal;
            if (selectedCol === 1) tdLeft.classList.add('selected-db-column');
            tr.appendChild(tdLeft);

            const tdRight = document.createElement('td');
            tdRight.textContent = counterpart ? (isProtected ? '********' : rightVal) : '\u2014';
            if (selectedCol === 2) tdRight.classList.add('selected-db-column');
            tr.appendChild(tdRight);

            if (isProtected) {
                protectedCells.push({ key, tdLeft, tdRight, hasCounterpart: !!counterpart });
            }

            tbody.appendChild(tr);
        }

        // Show/hide password toggle — fetches unmasked values on demand
        showPwBtn.addEventListener('click', async () => {
            if (!passwordsVisible) {
                showPwBtn.disabled = true;
                showPwBtn.textContent = 'Loading...';
                try {
                    if (!unmaskedDetail) {
                        unmaskedDetail = await Api.searchDetail(
                            sourceEntry.uuid, source, { showPasswords: true }
                        );
                    }
                    passwordsVisible = true;
                    showPwBtn.textContent = 'Hide Passwords';
                    const unmSrc = unmaskedDetail.sourceEntry?.fields || {};
                    const unmCpt = unmaskedDetail.counterpart?.fields || {};
                    for (const pc of protectedCells) {
                        const srcPv = unmSrc[pc.key] || '';
                        const cptPv = unmCpt[pc.key] || '';
                        const [leftPv, rightPv] = source === 'db1'
                            ? [srcPv, cptPv]
                            : [cptPv, srcPv];
                        pc.tdLeft.textContent = leftPv;
                        pc.tdRight.textContent = pc.hasCounterpart ? rightPv : '\u2014';
                    }
                } catch (err) {
                    showPwBtn.textContent = 'Show Passwords';
                    App.setStatus('Failed to load passwords: ' + err.message, 'error');
                } finally {
                    showPwBtn.disabled = false;
                }
            } else {
                passwordsVisible = false;
                showPwBtn.textContent = 'Show Passwords';
                for (const pc of protectedCells) {
                    pc.tdLeft.textContent = '********';
                    pc.tdRight.textContent = pc.hasCounterpart ? '********' : '\u2014';
                }
            }
        });

        // Group path row
        const grpTr = document.createElement('tr');
        const grpSrc = sourceEntry.groupPath || '';
        const grpCpt = counterpart ? (counterpart.groupPath || '') : '';
        const [grpLeft, grpRight] = source === 'db1' ? [grpSrc, grpCpt] : [grpCpt, grpSrc];
        if (counterpart && grpSrc !== grpCpt) grpTr.className = 'detail-diff-row';

        const grpTd1 = document.createElement('td');
        grpTd1.textContent = 'Group';
        grpTd1.style.fontWeight = '600';
        grpTr.appendChild(grpTd1);

        const grpTd2 = document.createElement('td');
        grpTd2.textContent = grpLeft;
        if (selectedCol === 1) grpTd2.classList.add('selected-db-column');
        grpTr.appendChild(grpTd2);

        const grpTd3 = document.createElement('td');
        grpTd3.textContent = counterpart ? grpRight : '\u2014';
        if (selectedCol === 2) grpTd3.classList.add('selected-db-column');
        grpTr.appendChild(grpTd3);

        tbody.appendChild(grpTr);

        // Last modified row
        const modTr = document.createElement('tr');
        const modSrc = sourceEntry.times?.lastModTime ? new Date(sourceEntry.times.lastModTime).toLocaleString() : '';
        const modCpt = counterpart && counterpart.times?.lastModTime ? new Date(counterpart.times.lastModTime).toLocaleString() : '';
        const [modLeft, modRight] = source === 'db1' ? [modSrc, modCpt] : [modCpt, modSrc];
        if (counterpart && modSrc !== modCpt) modTr.className = 'detail-diff-row';

        const modTd1 = document.createElement('td');
        modTd1.textContent = 'Last Modified';
        modTd1.style.fontWeight = '600';
        modTr.appendChild(modTd1);

        const modTd2 = document.createElement('td');
        modTd2.textContent = modLeft;
        if (selectedCol === 1) modTd2.classList.add('selected-db-column');
        modTr.appendChild(modTd2);

        const modTd3 = document.createElement('td');
        modTd3.textContent = counterpart ? modRight : '\u2014';
        if (selectedCol === 2) modTd3.classList.add('selected-db-column');
        modTr.appendChild(modTd3);

        // Bold the newer date — db1Entry is always left (modTd2), db2Entry is always right (modTd3)
        if (counterpart && db1Entry?.times?.lastModTime && db2Entry?.times?.lastModTime) {
            const date1 = new Date(db1Entry.times.lastModTime);
            const date2 = new Date(db2Entry.times.lastModTime);
            if (date1 > date2) {
                modTd2.style.fontWeight = 'bold';
            } else if (date2 > date1) {
                modTd3.style.fontWeight = 'bold';
            }
        } else if (db1Entry?.times?.lastModTime && !db2Entry?.times?.lastModTime) {
            modTd2.style.fontWeight = 'bold';
        } else if (db2Entry?.times?.lastModTime && !db1Entry?.times?.lastModTime) {
            modTd3.style.fontWeight = 'bold';
        }

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
