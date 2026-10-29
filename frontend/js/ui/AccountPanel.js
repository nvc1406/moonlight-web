import { BackendClient } from '../api/BackendClient.js';
import { escapeHtml } from '../util/escapeHtml.js';
import { t } from '../i18n/i18n.js';
import { Toast } from './Toast.js';

export async function mountAccounts(root) {
    try {
        const result = await BackendClient.get('/api/admin/accounts');
        if (!root.isConnected) return;
        root.innerHTML = `
            <h3 class="settings-section-title">${t('accounts.title')}</h3>
            <p class="setting-desc">${t('accounts.hint')}</p>
            <form data-create-account class="settings-field">
                <label>${t('accounts.name')}
                    <input name="name" class="login-input" maxlength="64" required autocomplete="off">
                </label>
                <button class="btn btn-primary">${t('accounts.create')}</button>
            </form>
            <div data-account-list>${Object.entries(result.accounts || {})
                .map(
                    ([id, name]) => `<div class="settings-field">
                    <strong>${escapeHtml(name)}</strong>
                    <button class="btn btn-secondary" data-action="revoke" data-id="${escapeHtml(id)}">${t('accounts.revoke')}</button>
                    <button class="btn btn-secondary" data-action="delete" data-id="${escapeHtml(id)}">${t('accounts.delete')}</button>
                </div>`,
                )
                .join('')}</div>`;
        const mutate = async (body, button) => {
            button.disabled = true;
            try {
                await BackendClient.post('/api/admin/accounts', body);
                await mountAccounts(root);
            } catch (error) {
                Toast.error(error.message);
                button.disabled = false;
            }
        };
        root.querySelector('form').addEventListener('submit', (event) => {
            event.preventDefault();
            const input = root.querySelector('input');
            if (input.value.trim())
                void mutate(
                    { action: 'create', name: input.value.trim() },
                    root.querySelector('button'),
                );
        });
        root.querySelectorAll('[data-action]').forEach((button) => {
            button.addEventListener('click', () => {
                void mutate({ action: button.dataset.action, id: button.dataset.id }, button);
            });
        });
    } catch (error) {
        root.textContent = error.message;
    }
}
