import { BackendClient } from '../api/BackendClient.js';
import { escapeHtml } from '../util/escapeHtml.js';
import { t } from '../i18n/i18n.js';
import { Toast } from './Toast.js';
import { mountAccounts } from './AccountPanel.js';

/** Admin-owned, persistent app permissions. App IDs are scoped to their host. */
export async function mountClientAccess(root) {
    root.textContent = t('access.loading');
    try {
        const [status, policy, data] = await Promise.all([
            BackendClient.getAuthStatus(),
            BackendClient.get('/api/admin/client-apps'),
            BackendClient.getHosts(),
        ]);
        const hosts = await Promise.all(
            (data.hosts || []).map(async (host) => {
                try {
                    const list = await BackendClient.getAppList(host.uuid);
                    return { ...host, apps: list.apps || [] };
                } catch {
                    return { ...host, apps: [], unavailable: true };
                }
            }),
        );
        if (!root.isConnected) return;
        root.innerHTML = `
            <h3 class="settings-section-title">${t('access.title')}</h3>
            <p class="setting-desc">${t('access.description')}</p>
            <p><a class="btn btn-secondary" href="/client-test/" target="_blank" rel="noopener">${t('access.testClient')}</a></p>
            <div class="settings-field">
                <label>${t('access.adminPin')}</label>
                <div class="pin-display-area">
                    <span class="pin-display" data-admin-pin>${escapeHtml(status.admin_pin || '------')}</span>
                    <button class="btn btn-secondary" data-generate>${t('common.generate')}</button>
                    <button class="btn btn-secondary" data-clear>${t('common.clear')}</button>
                </div>
                <p class="setting-desc">${t('access.pinHint')}</p>
            </div>
            ${hosts
                .map(
                    (host, index) => `
                <fieldset class="settings-field"><legend>${escapeHtml(host.name || host.uuid)}</legend>
                    ${host.unavailable ? `<p>${t('access.unavailable')}</p>` : ''}
                    ${host.apps
                        .map(
                            (app) => `
                        <label class="settings-checkbox-label">
                            <input type="checkbox" data-host-index="${index}" value="${Number(app.id)}"
                                ${(policy.apps?.[host.uuid] || []).includes(app.id) ? 'checked' : ''}>
                            <span>${escapeHtml(app.name || String(app.id))}</span>
                        </label>`,
                        )
                        .join('')}
                </fieldset>`,
                )
                .join('')}
            <button class="btn btn-primary" data-save>${t('access.save')}</button>
            <section data-accounts></section>`;
        await mountAccounts(root.querySelector('[data-accounts]'));
        const run = (selector, action) => {
            root.querySelector(selector).addEventListener('click', async (event) => {
                const button = event.currentTarget;
                button.disabled = true;
                try {
                    await action();
                } catch (error) {
                    Toast.error(error.message);
                } finally {
                    button.disabled = false;
                }
            });
        };
        run('[data-generate]', async () => {
            const result = await BackendClient.post('/api/admin/pin/admin/generate');
            root.querySelector('[data-admin-pin]').textContent = result.pin;
        });
        run('[data-clear]', async () => {
            await BackendClient.post('/api/admin/pin/admin/clear');
            root.querySelector('[data-admin-pin]').textContent = '------';
        });
        run('[data-save]', async () => {
            const apps = { ...(policy.apps || {}) };
            hosts.forEach((host, index) => {
                if (host.unavailable) return;
                apps[host.uuid] = [
                    ...root.querySelectorAll(`input[data-host-index="${index}"]:checked`),
                ].map((input) => Number(input.value));
            });
            await BackendClient.post('/api/admin/client-apps', { apps });
            policy.apps = apps;
            Toast.success(t('access.saved'));
        });
    } catch (error) {
        root.textContent = error.message;
    }
}
