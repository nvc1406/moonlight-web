import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ProfileEditor } from '../js/touch/ProfileEditor.js';
import { BackendClient } from '../js/api/BackendClient.js';
import { clone } from '../js/touch/profiles.js';

describe('owner profile editor', () => {
    let editor, saved;
    beforeEach(() => {
        saved = { version: 1, revision: 0, games: [] };
        vi.spyOn(BackendClient, 'get').mockImplementation(async () => clone(saved));
        vi.spyOn(BackendClient, 'getHosts').mockResolvedValue({
            hosts: [{ uuid: 'pc', name: 'PC' }],
        });
        vi.spyOn(BackendClient, 'getAppList').mockResolvedValue({
            apps: [{ id: 42, name: 'Game' }],
        });
        vi.spyOn(BackendClient, 'post').mockImplementation(async (_, doc) => {
            saved = { ...clone(doc), revision: saved.revision + 1 };
            return clone(saved);
        });
    });
    afterEach(async () => {
        if (editor) await editor.action('close');
        vi.restoreAllMocks();
        document.body.replaceChildren();
    });
    it('opens the profile of the app clicked in administration', async () => {
        BackendClient.getAppList.mockResolvedValue({
            apps: [
                { id: 1, name: 'First' },
                { id: 42, name: 'Chosen' },
            ],
        });
        editor = await ProfileEditor.open({ host: 'pc', appId: 42 });
        expect(editor.game().appId).toBe(42);
        expect(editor.root.querySelector('[data-field="game"]').value).toBe('1');
    });
    it('opens an offline app in the clicked mode instead of another game', async () => {
        editor = await ProfileEditor.open({
            host: 'offline',
            appId: 99,
            mode: 'gamepad',
            name: 'Offline game',
        });
        expect(editor.game().appId).toBe(99);
        expect(editor.game().host).toBe('offline');
        expect(editor.mode).toBe('gamepad');
    });
    it('creates independent profiles in each mode and saves a versioned document', async () => {
        editor = await ProfileEditor.open();
        await editor.action('new');
        const videoId = editor.profile.id;
        editor.profile.layouts.landscape[0].x = 0.3;
        editor.pad.profile.layouts.landscape[0].x = 0.3;
        await editor.action('cross');
        const padId = editor.profile.id;
        expect(padId).not.toBe(videoId);
        expect(editor.mode).toBe('gamepad');
        editor.pad.profile.layouts.landscape[0].x = 0.8;
        await editor.action('save');
        expect(saved.games[0].modes.stream.defaultProfileId).toBe(videoId);
        expect(saved.games[0].modes.gamepad.defaultProfileId).toBe(padId);
        expect(saved.games[0].modes.stream.profiles[0].layouts.landscape[0].x).toBe(0.3);
        expect(saved.games[0].modes.gamepad.profiles[0].layouts.landscape[0].x).toBe(0.8);
    });
    it('requires a replacement when deleting the default and falls back to built-in after deleting the last profile', async () => {
        editor = await ProfileEditor.open();
        await editor.action('new');
        const first = editor.profile.id;
        await editor.action('copy');
        const second = editor.profile.id;
        editor.profileId = first;
        editor.render();
        await editor.action('delete');
        expect(editor.game().modes.stream.profiles).toHaveLength(2);
        expect(editor.root.querySelector('[data-replacement]').value).toBe(second);
        editor.root.querySelector('[data-delete-confirm]').click();
        expect(editor.game().modes.stream.defaultProfileId).toBe(second);
        await editor.action('delete');
        expect(editor.game().modes.stream.profiles).toEqual([]);
        expect(editor.game().modes.stream.defaultProfileId).toBe('');
    });
    it('keeps drafts off the server until saved, and reload discards the draft', async () => {
        editor = await ProfileEditor.open();
        await editor.action('new');
        expect(BackendClient.post).not.toHaveBeenCalled();
        await editor.action('reload');
        expect(editor.game().modes.stream.profiles).toHaveLength(0);
    });
    it('updates the selected button label and mapping in the preview and saved profile', async () => {
        editor = await ProfileEditor.open();
        await editor.action('new');
        const button = editor.root.querySelector('[aria-label="A"]');
        const down = new Event('pointerdown', { bubbles: true, cancelable: true });
        Object.assign(down, { pointerId: 1, clientX: 0, clientY: 0 });
        button.dispatchEvent(down);
        const label = editor.root.querySelector('[data-prop="label"]');
        label.value = 'Jump';
        label.dispatchEvent(new Event('change'));
        expect(editor.root.querySelector('[aria-label="Jump"]')).not.toBeNull();
        const output = editor.root.querySelector('[data-prop="output"]');
        output.value = 'LB';
        output.dispatchEvent(new Event('change'));
        await editor.action('save');
        const profile = saved.games[0].modes.stream.profiles[0];
        expect(profile.layouts.landscape.find((c) => c.id === 'A')).toMatchObject({
            label: 'Jump',
            output: 'LB',
        });
    });
});
