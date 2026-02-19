// Compare tab component
const Compare = {
    _staged: { db1: null, db2: null },

    init() {
        document.getElementById('uploadBtn').addEventListener('click', () => this.handleUpload());
        document.getElementById('compareBtn').addEventListener('click', () => this.handleCompare());
        document.getElementById('downloadDb1Btn').addEventListener('click', () => this.handleDownload('db1'));
        document.getElementById('downloadDb2Btn').addEventListener('click', () => this.handleDownload('db2'));

        // File input listeners for auto-keyfile and staged clearing
        document.getElementById('db1').addEventListener('change', (e) => this._onDbFileChange('db1', e));
        document.getElementById('db2').addEventListener('change', (e) => this._onDbFileChange('db2', e));
        document.getElementById('keyFile1').addEventListener('change', () => this.clearStagedKey('db1'));
        document.getElementById('keyFile2').addEventListener('change', () => this.clearStagedKey('db2'));

        // Initialize history
        DbHistory.init().then(() => this.renderHistory());
    },

    async _onDbFileChange(slot, e) {
        const file = e.target.files[0];
        this.clearStaged(slot);
        if (!file) return;

        // Auto-keyfile: look up history by filename
        const record = await DbHistory.get(file.name);
        if (record && record.keyFilename && record.keyBlob) {
            const num = slot === 'db1' ? '1' : '2';
            this._staged[slot] = this._staged[slot] || {};
            this._staged[slot].keyFilename = record.keyFilename;
            this._staged[slot].keyBlob = record.keyBlob;
            const indicator = document.getElementById('stagedKey' + num);
            indicator.textContent = record.keyFilename + ' (from history)';
            indicator.style.display = 'inline-block';
        }
    },

    clearStaged(slot) {
        this._staged[slot] = null;
        const num = slot === 'db1' ? '1' : '2';
        const dbInd = document.getElementById('stagedDb' + num);
        dbInd.style.display = 'none';
        dbInd.textContent = '';
        this.clearStagedKey(slot);
    },

    clearStagedKey(slot) {
        const num = slot === 'db1' ? '1' : '2';
        const keyInd = document.getElementById('stagedKey' + num);
        keyInd.style.display = 'none';
        keyInd.textContent = '';
        if (this._staged[slot]) {
            this._staged[slot].keyFilename = null;
            this._staged[slot].keyBlob = null;
        }
    },

    async stageFromHistory(slot, dbFilename) {
        const record = await DbHistory.get(dbFilename);
        if (!record) return;

        const num = slot === 'db1' ? '1' : '2';
        this._staged[slot] = {
            dbFilename: record.dbFilename,
            dbBlob: record.dbBlob,
            keyFilename: record.keyFilename,
            keyBlob: record.keyBlob
        };

        // Clear file inputs for this slot
        document.getElementById(slot).value = '';
        document.getElementById('keyFile' + num).value = '';

        // Show db indicator with relative date
        const dbInd = document.getElementById('stagedDb' + num);
        dbInd.textContent = record.dbFilename + ' — saved ' + this._relativeDate(record.lastUsed);
        dbInd.style.display = 'inline-block';

        // Show key indicator if present
        const keyInd = document.getElementById('stagedKey' + num);
        if (record.keyFilename) {
            keyInd.textContent = record.keyFilename + ' (from history)';
            keyInd.style.display = 'inline-block';
        } else {
            keyInd.style.display = 'none';
            keyInd.textContent = '';
        }
    },

    async handleUpload() {
        // Resolve effective files for each slot
        const db1Input = document.getElementById('db1').files[0];
        const db2Input = document.getElementById('db2').files[0];
        const kf1Input = document.getElementById('keyFile1').files[0];
        const kf2Input = document.getElementById('keyFile2').files[0];

        // .kdbx: file input wins, then staged
        const db1File = db1Input || (this._staged.db1?.dbBlob
            ? new File([this._staged.db1.dbBlob], this._staged.db1.dbFilename, { type: 'application/octet-stream' })
            : null);
        const db2File = db2Input || (this._staged.db2?.dbBlob
            ? new File([this._staged.db2.dbBlob], this._staged.db2.dbFilename, { type: 'application/octet-stream' })
            : null);

        // keyfile: manual pick wins, then auto-staged from history
        const kf1File = kf1Input || (this._staged.db1?.keyBlob
            ? new File([this._staged.db1.keyBlob], this._staged.db1.keyFilename, { type: 'application/octet-stream' })
            : null);
        const kf2File = kf2Input || (this._staged.db2?.keyBlob
            ? new File([this._staged.db2.keyBlob], this._staged.db2.keyFilename, { type: 'application/octet-stream' })
            : null);

        if (!db1File && !db2File) return App.setStatus('Select at least one database file.', 'error');

        const pw1 = document.getElementById('passwordDb1').value;
        const pw2 = document.getElementById('passwordDb2').value;

        if (db1File && !pw1 && !kf1File) return App.setStatus('Database 1 requires a password or key file.', 'error');
        if (db2File && !pw2 && !kf2File) return App.setStatus('Database 2 requires a password or key file.', 'error');

        App.setStatus('Loading databases...', 'info');

        const formData = new FormData();
        if (db1File) formData.append('db1', db1File);
        if (db2File) formData.append('db2', db2File);
        if (pw1) formData.append('passwordDb1', pw1);
        if (pw2) formData.append('passwordDb2', pw2);
        if (kf1File) formData.append('keyFile1', kf1File);
        if (kf2File) formData.append('keyFile2', kf2File);

        try {
            const result = await Api.upload(formData);
            App.state.uploaded = true;

            let msg = 'Databases loaded:';
            if (result.databases.db1) {
                msg += ` DB1: ${result.databases.db1.entryCount} entries.`;
            }
            if (result.databases.db2) {
                msg += ` DB2: ${result.databases.db2.entryCount} entries.`;
            }
            App.setStatus(msg, 'success');
            App.enableTabs();

            document.getElementById('compareBtn').disabled = false;
            document.getElementById('downloadSection').style.display = 'flex';

            // Auto-compare when both databases are loaded
            if (result.databases.db1 && result.databases.db2) {
                await this.handleCompare();
            }

            // Save to history after successful upload
            await this._saveToHistory(db1File, db1Input, kf1File, kf1Input);
            await this._saveToHistory(db2File, db2Input, kf2File, kf2Input);
            this.renderHistory();
        } catch (err) {
            App.setStatus('Failed to load: ' + err.message, 'error');
        }
    },

    async _saveToHistory(dbFile, dbInput, kfFile, kfInput) {
        if (!dbFile) return;
        try {
            // Get ArrayBuffer for the db file
            let dbBlob;
            if (dbInput) {
                dbBlob = await dbInput.arrayBuffer();
            } else if (this._staged.db1?.dbFilename === dbFile.name) {
                dbBlob = this._staged.db1.dbBlob;
            } else if (this._staged.db2?.dbFilename === dbFile.name) {
                dbBlob = this._staged.db2.dbBlob;
            } else {
                dbBlob = await dbFile.arrayBuffer();
            }

            // Get ArrayBuffer for the key file
            let keyFilename = null;
            let keyBlob = null;
            if (kfFile) {
                keyFilename = kfFile.name;
                if (kfInput) {
                    keyBlob = await kfInput.arrayBuffer();
                } else if (this._staged.db1?.keyFilename === kfFile.name) {
                    keyBlob = this._staged.db1.keyBlob;
                } else if (this._staged.db2?.keyFilename === kfFile.name) {
                    keyBlob = this._staged.db2.keyBlob;
                } else {
                    keyBlob = await kfFile.arrayBuffer();
                }
            }

            await DbHistory.save({
                dbFilename: dbFile.name,
                dbBlob,
                keyFilename,
                keyBlob
            });
        } catch { /* silent */ }
    },

    async renderHistory() {
        const entries = await DbHistory.getAll();
        const section = document.getElementById('dbHistorySection');
        const list = document.getElementById('dbHistoryList');

        if (!entries.length) {
            section.style.display = 'none';
            return;
        }

        section.style.display = 'block';
        list.innerHTML = '';

        for (const entry of entries) {
            const row = document.createElement('div');
            row.className = 'db-history-entry';

            const nameSpan = document.createElement('span');
            nameSpan.className = 'db-history-name';
            nameSpan.textContent = entry.dbFilename;
            if (entry.keyFilename) {
                const keyTag = document.createElement('span');
                keyTag.className = 'db-history-key-tag';
                keyTag.textContent = ' + ' + entry.keyFilename;
                nameSpan.appendChild(keyTag);
            }

            const dateSpan = document.createElement('span');
            dateSpan.className = 'db-history-date';
            dateSpan.textContent = this._relativeDate(entry.lastUsed);

            const actions = document.createElement('span');
            actions.className = 'db-history-actions';

            const btn1 = document.createElement('button');
            btn1.className = 'db-history-btn btn-secondary';
            btn1.textContent = 'DB1';
            btn1.addEventListener('click', () => this.stageFromHistory('db1', entry.dbFilename));

            const btn2 = document.createElement('button');
            btn2.className = 'db-history-btn btn-secondary';
            btn2.textContent = 'DB2';
            btn2.addEventListener('click', () => this.stageFromHistory('db2', entry.dbFilename));

            const removeBtn = document.createElement('button');
            removeBtn.className = 'db-history-remove';
            removeBtn.textContent = '\u00d7';
            removeBtn.title = 'Remove from history';
            removeBtn.addEventListener('click', () => this._removeHistory(entry.dbFilename));

            actions.appendChild(btn1);
            actions.appendChild(btn2);
            actions.appendChild(removeBtn);

            row.appendChild(nameSpan);
            row.appendChild(dateSpan);
            row.appendChild(actions);
            list.appendChild(row);
        }
    },

    async _removeHistory(dbFilename) {
        // Clear staging if it matches
        if (this._staged.db1?.dbFilename === dbFilename) this.clearStaged('db1');
        if (this._staged.db2?.dbFilename === dbFilename) this.clearStaged('db2');
        await DbHistory.remove(dbFilename);
        this.renderHistory();
    },

    _relativeDate(ts) {
        const diff = Date.now() - ts;
        const seconds = Math.floor(diff / 1000);
        if (seconds < 60) return 'just now';
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return minutes + 'm ago';
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return hours + 'h ago';
        const days = Math.floor(hours / 24);
        if (days < 30) return days + 'd ago';
        const months = Math.floor(days / 30);
        return months + 'mo ago';
    },

    async handleCompare() {
        if (!App.state.uploaded) {
            return App.setStatus('Open databases first, then compare.', 'error');
        }
        App.setStatus('Comparing databases...', 'info');
        document.getElementById('compareResults').innerHTML = '';

        try {
            const result = await Api.compare();
            App.state.compared = true;
            App.state.diffResults = result;
            this.renderResults(result);
            App.setStatus('Comparison complete.', 'success');
        } catch (err) {
            App.setStatus('Compare failed: ' + err.message, 'error');
        }
    },

    renderResults(result) {
        const container = document.getElementById('compareResults');
        container.innerHTML = '';

        // Summary cards
        const summary = document.createElement('div');
        summary.className = 'summary-cards';
        summary.innerHTML = `
            <div class="card"><span class="card-number">${result.summary.onlyInDb1}</span><span class="card-label">Only in DB1</span></div>
            <div class="card"><span class="card-number">${result.summary.onlyInDb2}</span><span class="card-label">Only in DB2</span></div>
            <div class="card card-modified"><span class="card-number">${result.summary.modified}</span><span class="card-label">Modified</span></div>
            <div class="card card-identical"><span class="card-number">${result.summary.identical}</span><span class="card-label">Identical</span></div>
        `;
        container.appendChild(summary);

        // Collapsible sections
        if (result.onlyInDb1.length > 0) {
            container.appendChild(this.createSection(
                `Only in DB1 (${result.onlyInDb1.length})`,
                createEntryTable(result.onlyInDb1, { onRowClick: this.showDetail })
            ));
        }
        if (result.onlyInDb2.length > 0) {
            container.appendChild(this.createSection(
                `Only in DB2 (${result.onlyInDb2.length})`,
                createEntryTable(result.onlyInDb2, { onRowClick: this.showDetail })
            ));
        }
        if (result.modified.length > 0) {
            container.appendChild(this.createSection(
                `Modified (${result.modified.length})`,
                this.createModifiedTable(result.modified)
            ));
        }
    },

    createSection(title, content) {
        const section = document.createElement('div');
        section.className = 'collapsible-section';

        const header = document.createElement('div');
        header.className = 'section-header';
        header.textContent = title;
        header.addEventListener('click', () => {
            section.classList.toggle('collapsed');
        });

        const body = document.createElement('div');
        body.className = 'section-body';
        body.appendChild(content);

        section.appendChild(header);
        section.appendChild(body);
        return section;
    },

    createModifiedTable(modifiedEntries) {
        const wrapper = document.createElement('div');

        for (const mod of modifiedEntries) {
            const row = document.createElement('div');
            row.className = 'modified-entry';

            const title = mod.db1Entry.fields.Title || '(untitled)';
            const header = document.createElement('div');
            header.className = 'modified-entry-header';
            header.innerHTML = `<strong>${this.escapeHtml(title)}</strong>`;
            if (mod.timeDiff) {
                header.innerHTML += ` <span class="newer-badge">Newer in ${mod.timeDiff.newerIn.toUpperCase()}</span>`;
            }
            row.appendChild(header);

            if (mod.fieldDiffs.length > 0) {
                const diffTable = document.createElement('table');
                diffTable.className = 'diff-table';
                diffTable.innerHTML = '<thead><tr><th>Field</th><th>DB1</th><th>DB2</th></tr></thead>';
                const tbody = document.createElement('tbody');
                for (const d of mod.fieldDiffs) {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `<td>${this.escapeHtml(d.field)}</td><td>${this.escapeHtml(d.field === 'Password' ? '********' : d.db1Value)}</td><td>${this.escapeHtml(d.field === 'Password' ? '********' : d.db2Value)}</td>`;
                    tbody.appendChild(tr);
                }
                diffTable.appendChild(tbody);
                row.appendChild(diffTable);
            }

            // Show attachment/binary diffs
            if (mod.binaryDiffs && mod.binaryDiffs.length > 0) {
                const binSection = document.createElement('div');
                binSection.className = 'binary-diffs';
                const binTitle = document.createElement('div');
                binTitle.className = 'binary-diffs-title';
                binTitle.textContent = 'Attachment changes:';
                binSection.appendChild(binTitle);

                for (const bd of mod.binaryDiffs) {
                    const binRow = document.createElement('div');
                    binRow.className = 'binary-diff-item';
                    const statusClass = 'binary-' + bd.status;
                    const sizeInfo = this._formatBinarySize(bd.db1Size, bd.db2Size, bd.status);

                    const nameSpan = document.createElement('span');
                    nameSpan.className = statusClass;
                    nameSpan.textContent = bd.name;
                    binRow.appendChild(nameSpan);

                    const statusSpan = document.createElement('span');
                    statusSpan.className = 'binary-status-badge ' + statusClass;
                    statusSpan.textContent = bd.status.toUpperCase() + (sizeInfo ? ' ' + sizeInfo : '');
                    binRow.appendChild(statusSpan);

                    binSection.appendChild(binRow);
                }
                row.appendChild(binSection);
            }

            // Show history count diff
            if (mod.historyDiff) {
                const histDiv = document.createElement('div');
                histDiv.className = 'history-diff';
                histDiv.textContent = 'DB1 has ' + mod.historyDiff.db1Count + ' history entries, DB2 has ' + mod.historyDiff.db2Count;
                row.appendChild(histDiv);
            }

            wrapper.appendChild(row);
        }

        return wrapper;
    },

    showDetail(entry) {
        const modal = document.getElementById('detailModal');
        const body = document.getElementById('detailBody');

        const fields = entry.fields || {};
        let html = '<table class="detail-table">';
        for (const [key, val] of Object.entries(fields)) {
            const display = key === 'Password' ? '********' : (val || '');
            html += `<tr><td><strong>${Compare.escapeHtml(key)}</strong></td><td>${Compare.escapeHtml(display)}</td></tr>`;
        }
        if (entry.groupPath) {
            html += `<tr><td><strong>Group</strong></td><td>${Compare.escapeHtml(entry.groupPath)}</td></tr>`;
        }
        if (entry.times?.lastModTime) {
            html += `<tr><td><strong>Last Modified</strong></td><td>${new Date(entry.times.lastModTime).toLocaleString()}</td></tr>`;
        }
        html += '</table>';
        body.innerHTML = html;
        modal.style.display = 'flex';
    },

    async handleDownload(slot) {
        try {
            App.setStatus(`Downloading ${slot}...`, 'info');
            const blob = await Api.download(slot);
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${slot}.kdbx`;
            a.click();
            URL.revokeObjectURL(url);
            App.setStatus('Download started.', 'success');
        } catch (err) {
            App.setStatus('Download failed: ' + err.message, 'error');
        }
    },

    _formatBinarySize(db1Size, db2Size, status) {
        const fmt = (bytes) => {
            if (bytes === 0) return '0 B';
            if (bytes < 1024) return bytes + ' B';
            if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
            return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
        };
        if (status === 'added') return '(' + fmt(db2Size) + ')';
        if (status === 'removed') return '(' + fmt(db1Size) + ')';
        if (status === 'modified') return '(' + fmt(db1Size) + ' -> ' + fmt(db2Size) + ')';
        return '';
    },

    escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
};
