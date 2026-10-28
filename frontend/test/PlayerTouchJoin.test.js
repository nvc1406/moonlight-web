import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
vi.mock('../js/api/BackendClient.js', () => ({
    BackendClient: { playerInfo: vi.fn(), playerPin: vi.fn() },
}));
vi.mock('../js/i18n/i18n.js', () => ({ t: (key) => key }));
import { PlayerJoinView } from '../js/ui/PlayerJoinView.js';
import { BackendClient } from '../js/api/BackendClient.js';
import { builtin } from '../js/touch/profiles.js';

describe('player chooses mode and touch profile before joining', () => {
    let view, container, onJoin;
    beforeEach(() => {
        vi.useFakeTimers();
        localStorage.clear();
        document.body.innerHTML = '<div id="player"></div>';
        container = document.getElementById('player');
        onJoin = vi.fn().mockResolvedValue();
        view = new PlayerJoinView(container, 'token', onJoin);
        Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [] });
    });
    afterEach(() => {
        view._stopPadWatch();
        vi.useRealTimers();
    });
    const info = (permissions) => ({
        needs_pin: false,
        machine_name: 'PC',
        state: 'idle',
        access_level: permissions.gamepad ? 'gamer' : 'viewer',
        permissions,
        touch: {
            capabilities: { gamepadMode: true },
            game: {
                host: 'pc',
                appId: 42,
                modes: {
                    stream: {
                        defaultProfileId: 'video',
                        profiles: [{ ...builtin('stream'), id: 'video' }],
                    },
                    gamepad: {
                        defaultProfileId: 'pad',
                        profiles: [{ ...builtin('gamepad'), id: 'pad' }],
                    },
                },
            },
        },
    });
    it('joins gamepad-only without requiring a physical controller or video codec detection', async () => {
        BackendClient.playerInfo.mockResolvedValue(info({ gamepad: true }));
        await view.refresh();
        const mode = container.querySelector('[data-touch-mode]');
        mode.value = 'gamepad';
        mode.dispatchEvent(new Event('change'));
        expect(container.querySelector('[data-touch-profile]').value).toBe('pad');
        expect(container.querySelector('[data-touch-audio]').checked).toBe(false);
        container.querySelector('.player-join-btn').click();
        await vi.waitFor(() => expect(onJoin).toHaveBeenCalled());
        expect(onJoin.mock.calls[0][0]).toMatchObject({
            mode: 'gamepad',
            touchSource: true,
            profileId: 'pad',
            audio: false,
        });
    });
    it('does not offer gamepad controls to a viewer', async () => {
        BackendClient.playerInfo.mockResolvedValue(info({ gamepad: false }));
        await view.refresh();
        expect(container.querySelector('[data-touch-mode]')).toBeNull();
    });
});
