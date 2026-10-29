import { describe, it, expect, vi, afterEach } from 'vitest';
import { mountClientAccess } from '../js/ui/ClientAccessPanel.js';
import { BackendClient } from '../js/api/BackendClient.js';
import { Toast } from '../js/ui/Toast.js';

afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
});
describe('admin client app permissions', () => {
    it('saves host-scoped selections while preserving unavailable host permissions', async () => {
        document.body.innerHTML = '<div id="panel"></div>';
        vi.spyOn(BackendClient, 'getAuthStatus').mockResolvedValue({ role: 'admin' });
        vi.spyOn(BackendClient, 'get').mockResolvedValue({ apps: { offline: [99] } });
        vi.spyOn(BackendClient, 'getHosts').mockResolvedValue({
            hosts: [{ uuid: 'online', name: '<safe>' }, { uuid: 'offline' }],
        });
        vi.spyOn(BackendClient, 'getAppList').mockImplementation(async (id) => {
            if (id === 'offline') throw new Error('offline');
            return {
                apps: [
                    { id: 42, name: 'Game' },
                    { id: 43, name: 'Desktop' },
                ],
            };
        });
        const save = vi.spyOn(BackendClient, 'post').mockResolvedValue({ status: 'ok' });
        vi.spyOn(Toast, 'success').mockImplementation(() => {});
        const root = document.getElementById('panel');
        await mountClientAccess(root);
        expect(root.querySelectorAll('input:checked')).toHaveLength(0);
        expect(root.textContent).toContain('<safe>');
        root.querySelector('input[value="42"]').checked = true;
        root.querySelector('[data-save]').click();
        await vi.waitFor(() =>
            expect(save).toHaveBeenCalledWith('/api/admin/client-apps', {
                apps: { online: [42], offline: [99] },
            }),
        );
    });
});
