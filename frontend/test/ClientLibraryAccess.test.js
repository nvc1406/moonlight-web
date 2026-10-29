import { describe, it, expect, afterEach } from 'vitest';
import { HostListView } from '../js/ui/HostListView.js';
import { BackendClient } from '../js/api/BackendClient.js';

afterEach(() => {
    BackendClient.isAdmin = false;
});
describe('client library controls', () => {
    it('explains missing app access without offering host installation or management', () => {
        BackendClient.isAdmin = false;
        const root = document.createElement('div');
        const view = new HostListView(root);
        view.renderShell();
        view.renderList();
        expect(root.querySelector('#btn-manual')).toBeNull();
        expect(root.querySelector('.hosts-empty-cta')).toBeNull();
        expect(root.querySelector('.hosts-empty').textContent).toContain('access.empty');
        view.destroy();
    });
    it('keeps resume available but hides the host app quit button', () => {
        BackendClient.isAdmin = false;
        const view = new HostListView(document.createElement('div'));
        const html = view.renderApp({ id: 42, displayName: 'Allowed game' }, [], 42);
        expect(html).toContain('app-card--running');
        expect(html).not.toContain('app-card-quit');
        view.destroy();
    });
});
