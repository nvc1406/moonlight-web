import { BackendClient } from '../api/BackendClient.js';
import { escapeHtml as esc } from '../util/escapeHtml.js';
import { t } from '../i18n/i18n.js';

/** Select a program on the host, including when administration happens on another PC. */
export class HostProgramPicker {
    static open(onSelect) {
        const root = document.createElement('dialog');
        root.className = 'host-program-picker';
        root.setAttribute('aria-label', t('admin.hostAppBrowse'));
        root.innerHTML = `<header><h3>${t('admin.hostAppBrowse')}</h3><button class="btn btn-secondary" data-close>${t('common.close')}</button></header>
            <form><input class="settings-input" data-path aria-label="${esc(t('admin.hostAppFolder'))}" placeholder="${esc(t('admin.hostAppFolder'))}"><button class="btn btn-secondary">${t('admin.hostAppOpenFolder')}</button></form>
            <nav><button class="btn btn-secondary" data-roots>${t('admin.hostAppLocations')}</button><button class="btn btn-secondary" data-parent>${t('admin.hostAppParent')}</button></nav>
            <input class="settings-input" data-filter aria-label="${esc(t('admin.hostAppFilter'))}" placeholder="${esc(t('admin.hostAppFilter'))}">
            <p data-error role="status"></p><div class="host-program-entries"></div>`;
        document.body.append(root);
        root.showModal();
        const close = () => root.close();
        root.addEventListener('close', () => root.remove());
        root.querySelector('[data-close]').addEventListener('click', close);
        const input = /** @type {HTMLInputElement} */ (root.querySelector('[data-path]'));
        const filter = /** @type {HTMLInputElement} */ (root.querySelector('[data-filter]'));
        const list = root.querySelector('.host-program-entries');
        const error = root.querySelector('[data-error]');
        let parent = '';
        let entries = [];
        let generation = 0;
        let selecting = false;
        const render = () => {
            list.replaceChildren();
            for (const entry of entries.filter((e) =>
                e.name.toLowerCase().includes(filter.value.toLowerCase()),
            )) {
                const button = document.createElement('button');
                button.className = 'btn btn-secondary host-program-entry';
                button.textContent = `${entry.directory ? '📁' : '▶'} ${entry.name}`;
                button.title = entry.path;
                button.addEventListener('click', async () => {
                    if (selecting) return;
                    if (entry.directory) {
                        await load(entry.path);
                        return;
                    }
                    selecting = true;
                    button.disabled = true;
                    try {
                        const program = await BackendClient.post('/api/host-apps/inspect', {
                            path: entry.path,
                        });
                        if (!root.isConnected) return;
                        onSelect(program);
                        close();
                    } catch (err) {
                        error.textContent = err.message;
                    } finally {
                        selecting = false;
                        button.disabled = false;
                    }
                });
                list.append(button);
            }
            if (!list.childElementCount) list.textContent = t('admin.hostAppFolderEmpty');
        };
        const load = async (path) => {
            const request = ++generation;
            error.textContent = t('common.loading');
            list.replaceChildren();
            try {
                const data = await BackendClient.post('/api/host-apps/browse', { path });
                if (request !== generation || !root.isConnected) return;
                parent = data.parent;
                input.value = data.path;
                entries = data.entries;
                filter.value = '';
                render();
                error.textContent = '';
            } catch (err) {
                if (request === generation) error.textContent = err.message;
            }
        };
        root.querySelector('form').addEventListener('submit', (event) => {
            event.preventDefault();
            void load(input.value.trim());
        });
        root.querySelector('[data-roots]').addEventListener('click', () => void load(''));
        root.querySelector('[data-parent]').addEventListener('click', () => void load(parent));
        filter.addEventListener('input', render);
        void load('');
        return root;
    }
}
