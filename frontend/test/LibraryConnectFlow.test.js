// @vitest-environment-options {"url": "https://client.example/"}
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
vi.mock('../js/ui/HostListView.js', () => ({
    HostListView: class {
        start = vi.fn();
        clearLaunching = vi.fn();
    },
}));
import { MoonlightApp } from '../js/app.js';
import { ConnectDialog } from '../js/touch/ConnectDialog.js';
import { Toast } from '../js/ui/Toast.js';

describe('library cards recover from connection options', () => {
    let saved;
    beforeEach(() => {
        saved = {
            state: MoonlightApp.state,
            hostListView: MoonlightApp.hostListView,
            _connectDialogOpen: MoonlightApp._connectDialogOpen,
            _launchTouchChoice: MoonlightApp._launchTouchChoice,
        };
        MoonlightApp.state = 'host_list';
        MoonlightApp._connectDialogOpen = false;
        vi.spyOn(MoonlightApp, 'transition').mockImplementation(() => {});
        vi.spyOn(MoonlightApp, '_updateNavHighlight').mockImplementation(() => {});
        vi.spyOn(MoonlightApp, '_mountHostsBanners').mockImplementation(() => {});
        vi.spyOn(MoonlightApp, '_isHostMachine').mockReturnValue(false);
        vi.spyOn(MoonlightApp, 'launchApp').mockImplementation(async () => {
            MoonlightApp.state = 'streaming';
        });
        vi.spyOn(Toast, 'error').mockImplementation(() => {});
        MoonlightApp._renderHosts(document.createElement('main'));
    });
    afterEach(() => {
        vi.restoreAllMocks();
        Object.assign(MoonlightApp, saved);
    });
    const click = () => MoonlightApp.hostListView.onLaunchApp({ uuid: 'pc' }, { id: 42 });
    it('restores the card and polling after a profile request fails', async () => {
        vi.spyOn(ConnectDialog, 'open').mockRejectedValue(new Error('Profile unavailable'));
        await click();
        expect(MoonlightApp.launchApp).not.toHaveBeenCalled();
        expect(MoonlightApp.hostListView.clearLaunching).toHaveBeenCalledWith({ failed: true });
        expect(MoonlightApp.hostListView.start).toHaveBeenCalledTimes(2);
        expect(MoonlightApp._connectDialogOpen).toBe(false);
    });
    it('restores the card after cancel so another app can be selected', async () => {
        vi.spyOn(ConnectDialog, 'open').mockResolvedValue(null);
        await click();
        expect(MoonlightApp.launchApp).not.toHaveBeenCalled();
        expect(MoonlightApp.hostListView.clearLaunching).toHaveBeenCalledWith({ failed: false });
        expect(Toast.error).not.toHaveBeenCalled();
    });
    it('keeps polling paused after a successful connection', async () => {
        vi.spyOn(ConnectDialog, 'open').mockResolvedValue({ settings: { mode: 'gamepad' } });
        await click();
        expect(MoonlightApp.launchApp).toHaveBeenCalledTimes(1);
        expect(MoonlightApp.hostListView.clearLaunching).not.toHaveBeenCalled();
        expect(MoonlightApp.hostListView.start).toHaveBeenCalledTimes(1);
    });
});
