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

        // Initialize components
        Compare.init();
    },

    switchTab(tabId) {
        // Deactivate all tabs
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));

        // Activate selected
        document.querySelector(`.tab-btn[data-tab="${tabId}"]`).classList.add('active');
        document.getElementById(tabId).classList.add('active');
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
