// Reusable sortable table with optional checkboxes
function createEntryTable(entries, { checkboxes = false, onRowClick = null, id = '' } = {}) {
    const table = document.createElement('table');
    table.className = 'entry-table';
    if (id) table.id = id;

    // Header
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    const columns = ['Title', 'UserName', 'URL', 'Group', 'Last Modified'];

    if (checkboxes) {
        const thCheck = document.createElement('th');
        const selectAll = document.createElement('input');
        selectAll.type = 'checkbox';
        selectAll.addEventListener('change', () => {
            table.querySelectorAll('tbody input[type="checkbox"]').forEach(cb => {
                cb.checked = selectAll.checked;
            });
        });
        thCheck.appendChild(selectAll);
        headerRow.appendChild(thCheck);
    }

    for (const col of columns) {
        const th = document.createElement('th');
        th.textContent = col;
        th.dataset.column = col;
        th.style.cursor = 'pointer';
        th.addEventListener('click', () => sortTable(table, col, checkboxes));
        headerRow.appendChild(th);
    }
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // Body
    const tbody = document.createElement('tbody');
    for (const entry of entries) {
        const tr = document.createElement('tr');
        tr.dataset.uuid = entry.uuid || '';

        if (checkboxes) {
            const tdCheck = document.createElement('td');
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.value = entry.uuid || '';
            tdCheck.appendChild(cb);
            tr.appendChild(tdCheck);
        }

        const fields = entry.fields || {};
        const lastMod = entry.times?.lastModTime
            ? new Date(entry.times.lastModTime).toLocaleDateString()
            : '';

        for (const val of [
            fields.Title || '',
            fields.UserName || '',
            fields.URL || '',
            entry.groupPath || '',
            lastMod
        ]) {
            const td = document.createElement('td');
            td.textContent = val;
            tr.appendChild(td);
        }

        if (onRowClick) {
            tr.style.cursor = 'pointer';
            tr.addEventListener('click', (e) => {
                if (e.target.tagName === 'INPUT') return;
                onRowClick(entry);
            });
        }

        tbody.appendChild(tr);
    }
    table.appendChild(tbody);

    return table;
}

function sortTable(table, column, hasCheckboxes) {
    const tbody = table.querySelector('tbody');
    const rows = [...tbody.querySelectorAll('tr')];
    const colMap = { Title: 0, UserName: 1, URL: 2, Group: 3, 'Last Modified': 4 };
    const colIdx = colMap[column] + (hasCheckboxes ? 1 : 0);
    const th = table.querySelector(`th[data-column="${column}"]`);
    const asc = th.dataset.sortDir !== 'asc';
    th.dataset.sortDir = asc ? 'asc' : 'desc';

    rows.sort((a, b) => {
        const va = a.children[colIdx]?.textContent || '';
        const vb = b.children[colIdx]?.textContent || '';
        return asc ? va.localeCompare(vb) : vb.localeCompare(va);
    });

    for (const row of rows) tbody.appendChild(row);
}

function getCheckedUuids(table) {
    return [...table.querySelectorAll('tbody input[type="checkbox"]:checked')]
        .map(cb => cb.value)
        .filter(Boolean);
}
