import { it, expect, vi, afterEach } from 'vitest';
import { mountAccounts } from '../js/ui/AccountPanel.js';
import { BackendClient } from '../js/api/BackendClient.js';

afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
});

it('creates named accounts, escapes names and revokes devices by account ID', async () => {
    document.body.innerHTML = '<section id="accounts"></section>';
    vi.spyOn(BackendClient, 'get').mockResolvedValue({ accounts: { alice: '<Alice>' } });
    const post = vi.spyOn(BackendClient, 'post').mockResolvedValue({});
    const root = document.getElementById('accounts');
    await mountAccounts(root);
    expect(root.querySelector('strong').textContent).toBe('<Alice>');
    expect(root.querySelector('alice')).toBeNull();
    root.querySelector('input').value = ' Bob ';
    root.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true }));
    await vi.waitFor(() =>
        expect(post).toHaveBeenCalledWith('/api/admin/accounts', { action: 'create', name: 'Bob' }),
    );
    await vi.waitFor(() => expect(root.querySelector('input').value).toBe(''));
    root.querySelector('[data-action="revoke"]').click();
    await vi.waitFor(() =>
        expect(post).toHaveBeenCalledWith('/api/admin/accounts', { action: 'revoke', id: 'alice' }),
    );
    await vi.waitFor(() =>
        expect(root.querySelector('[data-action="revoke"]').disabled).toBe(false),
    );
    root.querySelector('[data-action="delete"]').click();
    await vi.waitFor(() =>
        expect(post).toHaveBeenCalledWith('/api/admin/accounts', { action: 'delete', id: 'alice' }),
    );
});
