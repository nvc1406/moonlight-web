import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ConnectDialog } from '../js/touch/ConnectDialog.js';
import { BackendClient } from '../js/api/BackendClient.js';
import { builtin, rememberedProfile } from '../js/touch/profiles.js';

describe('library connection options', () => {
    const host = { uuid: 'pc', backendType: 'native' };
    const app = { id: 42, name: 'Game' };
    const game = {
        host: 'pc',
        appId: 42,
        modes: {
            stream: { profiles: [{ ...builtin(), id: 'video' }], defaultProfileId: 'video' },
            gamepad: { profiles: [{ ...builtin('gamepad'), id: 'pad' }], defaultProfileId: 'pad' },
        },
    };
    beforeEach(() => {
        localStorage.clear();
        HTMLDialogElement.prototype.showModal = vi.fn();
        vi.spyOn(BackendClient, 'get').mockImplementation(async (path) =>
            path.includes('capabilities') ? { gamepadMode: true } : game,
        );
    });
    afterEach(() => {
        document.body.replaceChildren();
        vi.restoreAllMocks();
    });
    const open = async () => {
        const result = ConnectDialog.open(host, app);
        await vi.waitFor(() => expect(document.querySelector('dialog')).not.toBeNull());
        return { result, dialog: document.querySelector('dialog') };
    };
    const close = (dialog, value) => {
        dialog.returnValue = value;
        dialog.dispatchEvent(new Event('close'));
    };
    it('selects the target mode profile/audio before connecting and remembers it', async () => {
        const { result, dialog } = await open();
        expect(dialog.querySelector('[name=profile]').value).toBe('video');
        expect(BackendClient.get).toHaveBeenCalledWith('/api/touch/game?host=pc&appId=42');
        expect(BackendClient.get).not.toHaveBeenCalledWith('/api/touch/profiles');
        expect(dialog.querySelector('[name=audio]').checked).toBe(true);
        const mode = dialog.querySelector('[name=mode]');
        mode.value = 'gamepad';
        mode.dispatchEvent(new Event('change'));
        expect(dialog.querySelector('[name=profile]').value).toBe('pad');
        expect(dialog.querySelector('[name=audio]').checked).toBe(false);
        close(dialog, 'connect');
        expect(await result).toEqual({
            settings: { mode: 'gamepad', profile_id: 'pad', audio: false, touch_source: true },
        });
        expect(rememberedProfile(game, 'gamepad')).toBe('pad');
        expect(document.querySelector('dialog')).toBeNull();
    });
    it('cancels without starting a session', async () => {
        const { result, dialog } = await open();
        close(dialog, 'cancel');
        expect(await result).toBeNull();
    });
    it('preserves existing launch behavior on unsupported hosts', async () => {
        expect(await ConnectDialog.open({ backendType: 'sunshine' }, app)).toEqual({});
        expect(BackendClient.get).not.toHaveBeenCalled();
        BackendClient.get.mockResolvedValue({ gamepadMode: false });
        expect(await ConnectDialog.open(host, app)).toEqual({});
        expect(document.querySelector('dialog')).toBeNull();
    });
});
