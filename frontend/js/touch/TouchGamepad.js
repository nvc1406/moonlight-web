import { clone, stickVector } from './profiles.js';

export const FLAGS = {
    Up: 1,
    Down: 2,
    Left: 4,
    Right: 8,
    Start: 16,
    Back: 32,
    L3: 64,
    R3: 128,
    LB: 256,
    RB: 512,
    A: 4096,
    B: 8192,
    X: 16384,
    Y: 32768,
};

/** One touch source occupies local controller zero; server applies the seat offset. */
export class TouchGamepad {
    /** @param {HTMLElement} container @param {any} profile @param {(state: any) => void} send @param {{edit?: boolean, onSelect?: (control: any) => void, onChange?: (profile: any) => void}} options */
    constructor(
        container,
        profile,
        send,
        { edit = false, onSelect = () => {}, onChange = () => {} } = {},
    ) {
        this.container = container;
        this.profile = clone(profile);
        this.send = send;
        this.edit = edit;
        this.onSelect = onSelect;
        this.onChange = onChange;
        this.pointers = new Map();
        this.connected = false;
        this.root = document.createElement('div');
        this.root.className = `touch-gamepad${edit ? ' touch-edit' : ''}`;
        for (const type of [
            'touchstart',
            'touchmove',
            'touchend',
            'touchcancel',
            'mousedown',
            'mouseup',
            'pointerdown',
            'pointermove',
            'pointerup',
            'click',
            'contextmenu',
        ]) {
            this.root.addEventListener(
                type,
                (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                },
                { passive: false },
            );
        }
        container.append(this.root);
        this.onBlur = () => this.release();
        this.onVisibility = () => {
            if (document.hidden) this.release();
        };
        this.onResize = () => {
            this.release();
            this.render();
        };
        window.addEventListener('blur', this.onBlur);
        document.addEventListener('visibilitychange', this.onVisibility);
        this.resizeObserver =
            typeof ResizeObserver === 'function' ? new ResizeObserver(this.onResize) : null;
        this.resizeObserver?.observe(this.root);
        this.render();
    }
    orientation() {
        return this.root.clientWidth >= this.root.clientHeight ? 'landscape' : 'portrait';
    }
    connect() {
        if (this.edit || this.connected) return;
        this.connected = true;
        this.send({ type: 'gamepadconnect', index: 0, mask: 1, ctype: 1, rumble: false });
        this.emit();
        this.heartbeat = setInterval(() => this.emit(), 100);
    }
    state() {
        const state = { buttons: 0, lt: 0, rt: 0, lx: 0, ly: 0, rx: 0, ry: 0 };
        for (const p of this.pointers.values()) {
            const out = p.control.output;
            if (FLAGS[out]) state.buttons |= FLAGS[out];
            else if (out === 'LT') state.lt = 255;
            else if (out === 'RT') state.rt = 255;
            else if (out === 'leftStick' || out === 'rightStick') {
                const prefix = out === 'leftStick' ? 'l' : 'r';
                state[`${prefix}x`] = Math.round(p.vector[0] * 32767);
                state[`${prefix}y`] = Math.round(p.vector[1] * 32767);
            }
        }
        return state;
    }
    emit() {
        if (this.connected) this.send({ type: 'gamepad', index: 0, mask: 1, ...this.state() });
    }
    release() {
        this.pointers.clear();
        this.root.querySelectorAll('.pressed').forEach((e) => e.classList.remove('pressed'));
        this.root.querySelectorAll('.touch-stick-cap').forEach((e) => {
            /** @type {HTMLElement} */ (e).style.transform = '';
        });
        this.emit();
    }
    disconnect() {
        this.release();
        clearInterval(this.heartbeat);
        if (this.connected) this.send({ type: 'gamepaddisconnect', index: 0, mask: 0 });
        this.connected = false;
    }
    setProfile(profile) {
        this.release();
        this.profile = clone(profile);
        this.render();
    }
    render() {
        const orientation = this.orientation();
        this.root.replaceChildren();
        this.root.style.opacity = String(this.edit ? 1 : this.profile.opacity);
        for (const control of this.profile.layouts[orientation]) {
            if (control.hidden && !this.edit) continue;
            const stick = control.output.endsWith('Stick');
            const button = document.createElement('button');
            button.type = 'button';
            button.className = `touch-control${stick ? ' touch-stick' : ''}${control.hidden ? ' touch-hidden' : ''}`;
            button.setAttribute('aria-label', control.label);
            button.textContent = control.label;
            button.style.left = `${control.x * 100}%`;
            button.style.top = `${control.y * 100}%`;
            button.style.width = `${control.size * 100}cqw`;
            const bounds = this.root.getBoundingClientRect();
            if (bounds.width > 0 && bounds.height > 0) {
                const diameter = Math.min(control.size * bounds.width, bounds.height * 0.95);
                button.style.width = `${diameter}px`;
                button.style.left = `${Math.max(diameter / 2, Math.min(bounds.width - diameter / 2, control.x * bounds.width))}px`;
                button.style.top = `${Math.max(diameter / 2, Math.min(bounds.height - diameter / 2, control.y * bounds.height))}px`;
            }
            if (stick) {
                const cap = document.createElement('span');
                cap.className = 'touch-stick-cap';
                button.append(cap);
            }
            const finish = (e) => {
                e.stopPropagation();
                this.pointers.delete(e.pointerId);
                button.classList.remove('pressed');
                const cap = button.querySelector('.touch-stick-cap');
                if (cap) /** @type {HTMLElement} */ (cap).style.transform = '';
                this.emit();
            };
            button.addEventListener('pointerdown', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (Array.from(this.pointers.values()).some((p) => p.control.id === control.id))
                    return;
                button.setPointerCapture?.(e.pointerId);
                this.onSelect(control);
                const rect = button.getBoundingClientRect();
                const cx = rect.left + rect.width / 2;
                const cy = rect.top + rect.height / 2;
                const radius = rect.width / 2;
                const vector =
                    stick && !this.edit
                        ? stickVector(
                              e.clientX - cx,
                              e.clientY - cy,
                              radius,
                              this.profile.deadzone,
                              this.profile.sensitivity,
                          )
                        : [0, 0];
                this.pointers.set(e.pointerId, { control, vector, cx, cy, radius });
                const cap = /** @type {HTMLElement} */ (button.querySelector('.touch-stick-cap'));
                if (cap)
                    cap.style.transform = `translate(${vector[0] * radius * 0.5}px, ${-vector[1] * radius * 0.5}px)`;
                button.classList.add('pressed');
                this.emit();
            });
            button.addEventListener('pointermove', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const p = this.pointers.get(e.pointerId);
                if (!p) return;
                if (this.edit) {
                    const rect = this.root.getBoundingClientRect();
                    const halfX = Math.min(0.5, p.radius / Math.max(1, rect.width));
                    const halfY = Math.min(0.5, p.radius / Math.max(1, rect.height));
                    control.x = Math.max(
                        halfX,
                        Math.min(1 - halfX, (e.clientX - rect.left) / Math.max(1, rect.width)),
                    );
                    control.y = Math.max(
                        halfY,
                        Math.min(1 - halfY, (e.clientY - rect.top) / Math.max(1, rect.height)),
                    );
                    button.style.left = `${control.x * 100}%`;
                    button.style.top = `${control.y * 100}%`;
                    this.onChange(this.profile);
                } else if (stick) {
                    p.vector = stickVector(
                        e.clientX - p.cx,
                        e.clientY - p.cy,
                        p.radius,
                        this.profile.deadzone,
                        this.profile.sensitivity,
                    );
                    const cap = /** @type {HTMLElement} */ (
                        button.querySelector('.touch-stick-cap')
                    );
                    cap.style.transform = `translate(${p.vector[0] * p.radius * 0.5}px, ${-p.vector[1] * p.radius * 0.5}px)`;
                    this.emit();
                }
            });
            for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'])
                button.addEventListener(type, finish);
            button.addEventListener('contextmenu', (e) => e.preventDefault());
            button.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
            });
            this.root.append(button);
        }
    }
    destroy() {
        this.disconnect();
        this.resizeObserver?.disconnect();
        window.removeEventListener('blur', this.onBlur);
        document.removeEventListener('visibilitychange', this.onVisibility);
        this.root.remove();
    }
}
