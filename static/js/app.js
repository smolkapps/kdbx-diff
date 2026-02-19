// Main controller — tab switching, state management, status messages
const App = {
    state: {
        uploaded: false,
        compared: false,
        diffResults: null
    },

    init() {
        // Tab switching
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => this.switchTab(btn.dataset.tab));
        });

        // Modal close
        document.getElementById('detailModal').addEventListener('click', (e) => {
            if (e.target.id === 'detailModal' || e.target.classList.contains('modal-close')) {
                document.getElementById('detailModal').style.display = 'none';
            }
        });

        // Reconnect button
        document.getElementById('reconnectBtn').addEventListener('click', () => this.handleReconnect());

        // Initialize components
        Compare.init();
        Transfer.init();
        Duplicates.init();
        Import.init();
        CsvImport.init();
        Search.init();
    },

    handleReconnect() {
        this.setStatus('Reconnecting...', 'info');
        // Clear current session
        Api.sessionToken = null;
        this.state.uploaded = false;
        this.state.compared = false;
        this.state.diffResults = null;

        // Clear staged files
        Compare._staged = { db1: null, db2: null };
        ['stagedDb1', 'stagedDb2', 'stagedKey1', 'stagedKey2'].forEach(id => {
            const el = document.getElementById(id);
            el.style.display = 'none';
            el.textContent = '';
        });

        // Disable tabs
        document.querySelectorAll('.tab-btn[data-requires-upload]').forEach(btn => {
            btn.disabled = true;
        });

        // Switch to Compare tab
        this.switchTab('tab-compare');

        // Hide reconnect button
        document.getElementById('reconnectBtn').style.display = 'none';

        this.setStatus('Session cleared. Please re-upload your databases.', 'info');
    },

    showReconnectButton() {
        document.getElementById('reconnectBtn').style.display = 'block';
    },

    switchTab(tabId) {
        // Deactivate all tabs
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));

        // Activate selected
        document.querySelector(`.tab-btn[data-tab="${tabId}"]`).classList.add('active');
        document.getElementById(tabId).classList.add('active');

        // Render transfer tab content when switching to it
        if (tabId === 'tab-transfer' && this.state.diffResults) {
            Transfer.render();
        }
    },

    enableTabs() {
        document.querySelectorAll('.tab-btn[data-requires-upload]').forEach(btn => {
            btn.disabled = false;
        });
    },

    setStatus(msg, type = 'info') {
        const el = document.getElementById('status');
        el.textContent = msg;
        el.className = 'status status-' + type;
    }
};

document.addEventListener('DOMContentLoaded', () => App.init());
