const PREFIX = '/client-test';

export function isClientTestMode() {
    return location.pathname === PREFIX || location.pathname.startsWith(PREFIX + '/');
}

/** Keep API and signaling requests in the server's isolated client namespace. */
export function clientTestUrl(value) {
    const url = new URL(value, location.href);
    const sameHost = url.host === location.host;
    if (
        isClientTestMode() &&
        sameHost &&
        (url.pathname.startsWith('/api/') || /^\/ws(?:\d+)?(?:\/|$)/.test(url.pathname))
    ) {
        url.pathname = PREFIX + url.pathname;
    }
    return url.href;
}

export function installClientTestMode() {
    if (!isClientTestMode()) return;
    const originalFetch = window.fetch.bind(window);
    window.fetch = (input, options) => {
        const value = input instanceof Request ? input.url : String(input);
        const target = clientTestUrl(value);
        return originalFetch(
            input instanceof Request ? new Request(target, input) : target,
            options,
        );
    };
    // The existing router uses root-relative paths. Keep Back, refresh and
    // overlays inside this tab's namespace without a browser-wide mode flag.
    for (const method of ['pushState', 'replaceState']) {
        const original = history[method].bind(history);
        history[method] = (state, unused, value) => {
            if (value != null) {
                const url = new URL(value, location.href);
                if (url.origin === location.origin && !url.pathname.startsWith(PREFIX + '/')) {
                    url.pathname = PREFIX + (url.pathname === PREFIX ? '/' : url.pathname);
                    value = url.href;
                }
            }
            return original(state, unused, value);
        };
    }
}

installClientTestMode();
