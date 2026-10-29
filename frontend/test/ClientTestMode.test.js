import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

describe('client test tab', () => {
    let push;
    let replace;
    let originalFetch;
    beforeEach(() => {
        vi.resetModules();
        push = history.pushState;
        replace = history.replaceState;
        originalFetch = window.fetch;
        history.replaceState(null, '', '/');
    });
    afterEach(() => {
        history.pushState = push;
        history.replaceState = replace;
        window.fetch = originalFetch;
        history.replaceState(null, '', '/');
    });

    it('leaves ordinary admin tabs alone', async () => {
        const fetch = vi.fn();
        window.fetch = fetch;
        const mode = await import('../js/util/clientTestMode.js');
        expect(mode.isClientTestMode()).toBe(false);
        expect(window.fetch).toBe(fetch);
        expect(history.replaceState).toBe(replace);
    });

    it('isolates API requests, request bodies, signaling and navigation', async () => {
        history.replaceState(null, '', '/client-test/');
        const fetch = vi.fn().mockResolvedValue({ ok: true });
        window.fetch = fetch;
        const mode = await import('../js/util/clientTestMode.js');
        expect(mode.isClientTestMode()).toBe(true);
        await window.fetch('/api/auth/status', { cache: 'no-store' });
        expect(fetch).toHaveBeenLastCalledWith(location.origin + '/client-test/api/auth/status', {
            cache: 'no-store',
        });
        await window.fetch(
            new Request(location.origin + '/api/auth/validate', {
                method: 'POST',
                body: '{"pin":"123456"}',
            }),
        );
        const request = fetch.mock.lastCall[0];
        expect(request.url).toBe(location.origin + '/client-test/api/auth/validate');
        expect(request.method).toBe('POST');
        expect(await request.text()).toBe('{"pin":"123456"}');
        expect(mode.clientTestUrl('wss://' + location.host + '/ws2')).toBe(
            'wss://' + location.host + '/client-test/ws2',
        );
        expect(mode.clientTestUrl('/js/app.js')).toBe(location.origin + '/js/app.js');
        expect(mode.clientTestUrl('https://example.org/api/status')).toBe(
            'https://example.org/api/status',
        );
        history.replaceState({ view: 'hosts' }, '', '/');
        expect(location.pathname).toBe('/client-test/');
        history.pushState({}, '', '/settings');
        expect(location.pathname).toBe('/client-test/settings');
        expect(mode.isClientTestMode()).toBe(true);
    });
});
