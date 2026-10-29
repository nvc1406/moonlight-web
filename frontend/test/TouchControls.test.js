import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
vi.mock('../js/touch/VoiceChat.js', () => ({
    VoiceChat: class {
        start = vi.fn().mockResolvedValue();
        destroy = vi.fn();
        setMic = vi.fn().mockResolvedValue();
        setListening = vi.fn();
    },
}));
import { TouchControls } from '../js/touch/TouchControls.js';
import { BackendClient } from '../js/api/BackendClient.js';
import { builtin, clone, rememberedProfile } from '../js/touch/profiles.js';

describe('per-device touch controls in a shared game session', () => {
    let controls, view, info, allowed;
    beforeEach(() => {
        vi.useFakeTimers();
        localStorage.clear();
        allowed = true;
        document.body.innerHTML = '<main><div class="canvas"></div></main>';
        const game = {
            host: 'pc',
            appId: 42,
            name: 'Game',
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
        };
        info = {
            game,
            revision: 1,
            owner: false,
            capabilities: { gamepadMode: true, voice: true },
        };
        vi.spyOn(BackendClient, 'get').mockImplementation(async () => clone(info));
        vi.spyOn(BackendClient, 'playerInfo').mockImplementation(async () => ({
            permissions: { gamepad: allowed },
        }));
        view = {
            _rootEl: document.querySelector('main'),
            canvasArea: document.querySelector('.canvas'),
            _playerMode: true,
            _shareToken: 'token',
            _gamepadAllowed: true,
            _gamepadManager: { start: vi.fn(), stop: vi.fn(), setPaused: vi.fn() },
            webrtc: { send: vi.fn() },
        };
    });
    afterEach(() => {
        controls?.destroy();
        vi.restoreAllMocks();
        vi.useRealTimers();
    });
    it('supports video plus audio plus touch controls on the same surface', async () => {
        controls = new TouchControls(view, { touchSource: true });
        await controls.start();
        expect(view.canvasArea.querySelector('.touch-gamepad')).not.toBeNull();
        expect(view.canvasArea.querySelector('.touch-toolbar')).toBe(controls.bar);
        expect(view.webrtc.send).toHaveBeenCalledWith({ type: 'gameaudio', enabled: true });
        expect(view._gamepadManager.stop).toHaveBeenCalled();
        expect(controls.voice.setMic).not.toHaveBeenCalled();
    });
    it('starts controller-only mode on its own profile with game audio disabled', async () => {
        controls = new TouchControls(view, { controllerOnly: true });
        await controls.start();
        expect(controls.profile.id).toBe('pad');
        expect(view.webrtc.send).toHaveBeenCalledWith({ type: 'gameaudio', enabled: false });
        expect(rememberedProfile(info.game, 'gamepad')).toBe('pad');
    });
    it('preserves an explicit physical input selection', async () => {
        controls = new TouchControls(view, { controllerOnly: true, touchSource: false });
        await controls.start();
        expect(view.canvasArea.querySelector('.touch-gamepad')).toBeNull();
        expect(view._gamepadManager.start).toHaveBeenCalled();
    });
    it('removes controls on permission revocation without needing a profile revision change', async () => {
        controls = new TouchControls(view, { touchSource: true });
        await controls.start();
        allowed = false;
        await controls.refresh();
        expect(view.canvasArea.querySelector('.touch-gamepad')).toBeNull();
        expect(view.webrtc.send).toHaveBeenCalledWith({
            type: 'gamepaddisconnect',
            index: 0,
            mask: 0,
        });
        expect(controls.bar.querySelector('[data-profile]')).toBeNull();
    });
    it('falls back safely after the active profile is deleted and takes the new mode default', async () => {
        controls = new TouchControls(view, { touchSource: true });
        await controls.start();
        info.game.modes.stream = {
            defaultProfileId: 'replacement',
            profiles: [{ ...builtin(), id: 'replacement' }],
        };
        ++info.revision;
        await controls.refresh();
        expect(controls.profile.id).toBe('replacement');
    });
    it('releases the active source before requesting a mode switch', async () => {
        const change = vi.fn().mockResolvedValue();
        controls = new TouchControls(view, { touchSource: true, onModeChange: change });
        await controls.start();
        await controls.action('mode');
        expect(change).toHaveBeenCalledWith('gamepad');
        expect(view.webrtc.send.mock.calls.at(-1)[0]).toMatchObject({
            type: 'gamepad',
            buttons: 0,
        });
    });
});
