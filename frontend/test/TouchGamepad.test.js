import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TouchGamepad, FLAGS } from '../js/touch/TouchGamepad.js';
import { builtin } from '../js/touch/profiles.js';

function pointer(element, type, pointerId, x = 0, y = 0) {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.assign(event, { pointerId, clientX: x, clientY: y });
    element.dispatchEvent(event);
}
describe('touch gamepad output and lifecycle', () => {
    let pad, sent, container;
    beforeEach(() => {
        vi.useFakeTimers();
        sent = [];
        container = document.createElement('div');
        document.body.append(container);
        pad = new TouchGamepad(container, builtin(), (state) => sent.push(state));
        pad.connect();
    });
    afterEach(() => {
        pad.destroy();
        container.remove();
        vi.useRealTimers();
    });
    const control = (container, label) => container.querySelector(`[aria-label="${label}"]`);
    it('connects one Xbox source and sends a neutral state', () => {
        expect(sent[0]).toMatchObject({ type: 'gamepadconnect', index: 0, mask: 1, ctype: 1 });
        expect(sent.at(-1)).toMatchObject({ type: 'gamepad', buttons: 0, lx: 0 });
    });
    it('holds joystick and multiple buttons independently and stops bubbling input', () => {
        const bubble = vi.fn();
        container.addEventListener('pointerdown', bubble);
        const stick = control(container, 'L');
        vi.spyOn(stick, 'getBoundingClientRect').mockReturnValue({
            left: 0,
            top: 0,
            width: 100,
            height: 100,
        });
        pointer(stick, 'pointerdown', 1, 50, 50);
        pointer(stick, 'pointermove', 1, 100, 50);
        pointer(control(container, 'A'), 'pointerdown', 2);
        pointer(control(container, 'B'), 'pointerdown', 3);
        expect(sent.at(-1)).toMatchObject({ lx: 32767, buttons: FLAGS.A | FLAGS.B });
        pointer(control(container, 'A'), 'pointerup', 2);
        expect(sent.at(-1)).toMatchObject({ lx: 32767, buttons: FLAGS.B });
        expect(bubble).not.toHaveBeenCalled();
    });
    it('maps custom outputs and releases only the canceled finger', () => {
        const p = builtin();
        p.layouts.landscape.find((c) => c.id === 'A').output = 'RT';
        pad.setProfile(p);
        pointer(control(container, 'A'), 'pointerdown', 1);
        pointer(control(container, 'B'), 'pointerdown', 2);
        expect(sent.at(-1)).toMatchObject({ rt: 255, buttons: FLAGS.B });
        pointer(control(container, 'A'), 'pointercancel', 1);
        expect(sent.at(-1)).toMatchObject({ rt: 0, buttons: FLAGS.B });
    });
    it('repeats held state for the host watchdog', () => {
        pointer(control(container, 'A'), 'pointerdown', 1);
        const count = sent.length;
        vi.advanceTimersByTime(300);
        expect(sent.length).toBe(count + 3);
        expect(sent.at(-1).buttons).toBe(FLAGS.A);
    });
    it('applies direction on the initial joystick press and blocks native touch propagation', () => {
        const stick = control(container, 'L');
        vi.spyOn(stick, 'getBoundingClientRect').mockReturnValue({
            left: 0,
            top: 0,
            width: 100,
            height: 100,
        });
        pointer(stick, 'pointerdown', 1, 100, 50);
        expect(sent.at(-1).lx).toBe(32767);
        const listener = vi.fn();
        container.addEventListener('touchstart', listener);
        const event = new Event('touchstart', { bubbles: true, cancelable: true });
        stick.dispatchEvent(event);
        expect(event.defaultPrevented).toBe(true);
        expect(listener).not.toHaveBeenCalled();
    });
    it('neutralizes on focus loss and profile replacement', () => {
        pointer(control(container, 'A'), 'pointerdown', 1);
        window.dispatchEvent(new Event('blur'));
        expect(sent.at(-1).buttons).toBe(0);
        pointer(control(container, 'B'), 'pointerdown', 2);
        pad.setProfile(builtin('gamepad'));
        expect(sent.at(-1).buttons).toBe(0);
    });
    it('omits hidden controls and never connects in editor mode', () => {
        pad.destroy();
        const profile = builtin();
        profile.layouts.landscape[0].hidden = true;
        pad = new TouchGamepad(container, profile, (s) => sent.push(s));
        expect(control(container, 'L')).toBeNull();
        pad.destroy();
        sent.length = 0;
        pad = new TouchGamepad(container, profile, (s) => sent.push(s), { edit: true });
        pad.connect();
        expect(control(container, 'L')).not.toBeNull();
        expect(sent).toEqual([]);
    });
    it('neutralizes before disconnect and stops heartbeat after destruction', () => {
        pointer(control(container, 'A'), 'pointerdown', 1);
        pad.destroy();
        expect(sent.at(-2)).toMatchObject({ type: 'gamepad', buttons: 0 });
        expect(sent.at(-1)).toMatchObject({ type: 'gamepaddisconnect', mask: 0 });
        const count = sent.length;
        vi.advanceTimersByTime(500);
        expect(sent).toHaveLength(count);
    });
});
