import { describe, it, expect, beforeEach } from 'vitest';
import {
    builtin,
    chooseProfile,
    clone,
    rememberProfile,
    rememberedProfile,
    stickVector,
} from '../js/touch/profiles.js';

describe('game / mode / touch profiles', () => {
    beforeEach(() => localStorage.clear());
    const game = () => ({
        host: 'pc',
        appId: 42,
        modes: {
            stream: {
                defaultProfileId: 'video',
                profiles: [
                    { ...builtin('stream'), id: 'video' },
                    { ...builtin('stream'), id: 'alternate' },
                ],
            },
            gamepad: { defaultProfileId: 'pad', profiles: [{ ...builtin('gamepad'), id: 'pad' }] },
        },
    });
    it('keeps each mode default and audio choice independent', () => {
        expect(chooseProfile(game(), 'stream').id).toBe('video');
        expect(chooseProfile(game(), 'gamepad').id).toBe('pad');
        expect(chooseProfile(game(), 'stream').audio).toBe(true);
        expect(chooseProfile(game(), 'gamepad').audio).toBe(false);
    });
    it('falls back when the preferred profile was deleted or belongs to another mode', () => {
        expect(chooseProfile(game(), 'stream', 'deleted').id).toBe('video');
        expect(chooseProfile(game(), 'gamepad', 'video').id).toBe('pad');
    });
    it('provides built-in layouts without any configured game', () => {
        const p = chooseProfile({}, 'gamepad');
        expect(p.id).toBe('builtin');
        expect(p.layouts.landscape).toHaveLength(18);
        expect(p.layouts.portrait).toHaveLength(18);
    });
    it('returns independent copies for device selections and cross-mode duplication', () => {
        const g = game();
        const p = chooseProfile(g, 'stream');
        const copy = clone(p);
        copy.layouts.landscape[0].x = 0.9;
        expect(p.layouts.landscape[0].x).toBe(0.15);
        p.layouts.landscape[0].x = 0.8;
        expect(g.modes.stream.profiles[0].layouts.landscape[0].x).toBe(0.15);
    });
    it('remembers per host, game and mode without cross-device shared state', () => {
        const g = game();
        rememberProfile(g, 'stream', 'alternate');
        expect(rememberedProfile(g, 'stream')).toBe('alternate');
        expect(rememberedProfile(g, 'gamepad')).toBe('');
        expect(rememberedProfile({ ...g, host: 'other' }, 'stream')).toBe('');
        expect(rememberedProfile({ ...g, appId: 43 }, 'stream')).toBe('');
    });
    it('applies radial deadzone, saturation, sensitivity and upward-positive coordinates', () => {
        expect(stickVector(5, 0, 100, 0.12, 1)).toEqual([0, -0]);
        expect(stickVector(200, 0, 100, 0.12, 1)[0]).toBe(1);
        expect(stickVector(0, -100, 100, 0.12, 1)[1]).toBe(1);
        expect(Math.hypot(...stickVector(100, 100, 100, 0.12, 1))).toBeCloseTo(1);
        expect(stickVector(50, 0, 100, 0, 0.5)[0]).toBe(0.25);
    });
});
