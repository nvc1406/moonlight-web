import { BackendClient } from '../api/BackendClient.js';
import { escapeHtml as esc } from '../util/escapeHtml.js';
import { chooseProfile, groupFor, rememberedProfile, rememberProfile } from './profiles.js';
import { TouchGamepad } from './TouchGamepad.js';
import { ProfileEditor, loadTouchStyles } from './ProfileEditor.js';
import { VoiceChat } from './VoiceChat.js';

/** Per-device selection; owner-authored game/profile updates arrive by revision polling. */
export class TouchControls {
    constructor(view, options = {}) {
        this.view = view;
        this.options = options;
        this.mode = options.controllerOnly ? 'gamepad' : 'stream';
        this.enabled = options.touchSource ?? this.mode === 'gamepad';
        this.audio = options.gameAudio ?? this.mode === 'stream';
        this.mic = false;
        this.listening = true;
        this.closed = false;
        this.info = null;
        this.profile = null;
        this.audioTouched = options.gameAudio !== undefined;
    }
    async start() {
        loadTouchStyles();
        this.bar = document.createElement('div');
        this.bar.className = 'touch-toolbar';
        for (const type of [
            'touchstart',
            'touchmove',
            'touchend',
            'touchcancel',
            'pointerdown',
            'pointerup',
            'mousedown',
            'mouseup',
            'click',
        ]) {
            this.bar.addEventListener(type, (event) => event.stopPropagation());
        }
        this.view._rootEl.append(this.bar);
        await this.refresh();
        if (this.closed) return;
        if (this.info.capabilities.voice) {
            this.voice = new VoiceChat(
                (message) => this.status(message),
                this.view.webrtc._dynamicIceServers || undefined,
            );
            this.voice.start().catch((error) => this.status(`Voice: ${error.message}`));
        }
        this.timer = setInterval(
            () => this.refresh().catch((error) => this.status(error.message)),
            1500,
        );
    }
    status(message) {
        const el = this.bar?.querySelector('.touch-status');
        if (el) el.textContent = message;
    }
    async refresh() {
        if (this.closed) return;
        if (this.refreshing) return this.refreshing;
        this.refreshing = this.readSession();
        try {
            await this.refreshing;
        } finally {
            this.refreshing = null;
        }
    }
    async readSession() {
        const info = await BackendClient.get('/api/share/player/touch/session');
        if (this.closed) return;
        if (!info.capabilities.gamepadMode) {
            this.destroy();
            return;
        }
        const previous = this.info;
        this.info = info;
        // Poll permissions even when no profile revision changed.
        let permissionChanged = false;
        if (this.view._playerMode && this.view._shareToken) {
            const player = await BackendClient.playerInfo(this.view._shareToken);
            if (this.closed) return;
            const allowed = player.permissions?.gamepad === true;
            permissionChanged = allowed !== this.view._gamepadAllowed;
            this.view._gamepadAllowed = allowed;
            if (!allowed) {
                this.enabled = false;
                this.pad?.destroy();
                this.pad = null;
                this.view._gamepadManager?.setPaused(true);
            }
        }
        const changed =
            !previous ||
            previous.revision !== info.revision ||
            previous.game.host !== info.game.host ||
            previous.game.appId !== info.game.appId;
        if (changed) {
            const preferred = !previous
                ? this.options.touchProfileId || rememberedProfile(info.game, this.mode)
                : previous.game.appId === info.game.appId
                  ? this.profile?.id
                  : rememberedProfile(info.game, this.mode);
            this.profile = chooseProfile(info.game, this.mode, preferred);
            rememberProfile(info.game, this.mode, this.profile.id);
            if (!this.audioTouched) this.audio = this.profile.audio;
            this.applyPad();
            this.render();
            this.applyAudio();
        } else if (permissionChanged) {
            if (this.view._gamepadAllowed) this.view._gamepadManager?.setPaused(false);
            this.render();
        }
    }
    applyAudio() {
        this.view.webrtc.send({ type: 'gameaudio', enabled: this.audio });
    }
    applyPad() {
        this.pad?.destroy();
        this.pad = null;
        const allowed = !this.view._playerMode || this.view._gamepadAllowed;
        if (this.enabled && allowed) {
            this.view._gamepadManager?.stop();
            this.pad = new TouchGamepad(
                this.view.canvasArea || this.view._rootEl,
                this.profile,
                (msg) => this.view.webrtc.send(msg),
            );
            this.pad.connect();
        } else if (allowed && !this.view._quitting) this.view._gamepadManager?.start();
    }
    render() {
        const allowed = !this.view._playerMode || this.view._gamepadAllowed;
        const group = groupFor(this.info.game, this.mode);
        this.bar.classList.toggle('is-open', !!this.menuOpen);
        this.bar.innerHTML = `<button data-action="menu">${this.menuOpen ? 'Close controls' : 'Controls'}</button>${allowed ? `<button data-action="touch">${this.enabled ? 'Hide gamepad' : 'Touch gamepad'}</button><select data-profile aria-label="Touch profile">${(group.profiles.length ? group.profiles : [this.profile]).map((p) => `<option value="${esc(p.id)}" ${p.id === this.profile.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>` : ''}
            <button data-action="audio">Game audio: ${this.audio ? 'On' : 'Off'}</button><button data-action="voice">Voice: ${this.listening ? 'On' : 'Off'}</button><button data-action="mic">Mic: ${this.mic ? 'On' : 'Off'}</button><button data-action="retry">Retry voice</button>
            ${this.options.onModeChange && this.info.capabilities.gamepadMode && allowed ? `<button data-action="mode">${this.mode === 'stream' ? 'Gamepad only' : 'Video + gamepad'}</button>` : ''}
            ${this.info.owner ? '<button data-action="editor">Profiles</button><button data-action="game">Select game</button>' : ''}<span class="touch-status">${esc(this.info.game.name)} · ${this.mode}</span>`;
        this.bar.querySelector('[data-profile]')?.addEventListener('change', (event) => {
            this.profile = chooseProfile(
                this.info.game,
                this.mode,
                /** @type {HTMLSelectElement} */ (event.target).value,
            );
            rememberProfile(this.info.game, this.mode, this.profile.id);
            this.applyPad();
            if (!this.audioTouched) {
                this.audio = this.profile.audio;
                this.applyAudio();
            }
            this.render();
        });
        this.bar
            .querySelectorAll('[data-action]')
            .forEach((button) =>
                button.addEventListener('click', () =>
                    this.action(/** @type {HTMLElement} */ (button).dataset.action).catch((error) =>
                        this.status(error.message),
                    ),
                ),
            );
    }
    async action(action) {
        if (action === 'menu') {
            this.menuOpen = !this.menuOpen;
            this.pad?.release();
        }
        if (action === 'touch') {
            this.enabled = !this.enabled;
            this.applyPad();
        }
        if (action === 'audio') {
            this.audioTouched = true;
            this.audio = !this.audio;
            this.applyAudio();
        }
        if (action === 'voice') {
            this.listening = !this.listening;
            this.voice?.setListening(this.listening);
        }
        if (action === 'mic') {
            if (this.micBusy) return;
            const desired = !this.mic;
            this.micBusy = true;
            try {
                await this.voice.setMic(desired);
                if (this.closed) return;
                this.mic = desired;
            } finally {
                this.micBusy = false;
                if (!this.voice?.stream) this.mic = false;
                if (!this.closed) this.render();
            }
        }
        if (action === 'retry') {
            this.voice?.destroy();
            this.mic = false;
            this.voice = new VoiceChat(
                (message) => this.status(message),
                this.view.webrtc._dynamicIceServers || undefined,
            );
            this.voice.setListening(this.listening);
            await this.voice.start();
        }
        if (action === 'editor') {
            this.pad?.release();
            await ProfileEditor.open();
        }
        if (action === 'game') {
            const doc = await BackendClient.get('/api/touch/profiles');
            const games = doc.games.filter((g) => g.host === this.info.game.host);
            const select = document.createElement('select');
            select.setAttribute('aria-label', 'Session game');
            select.innerHTML = `<option value="">Select game…</option>${games.map((g) => `<option value="${g.appId}">${esc(g.name)}</option>`).join('')}`;
            this.bar.append(select);
            select.addEventListener('change', async () => {
                if (select.value === '') return;
                try {
                    await BackendClient.post('/api/share/player/touch/session', {
                        appId: Number(select.value),
                    });
                    await this.refresh();
                } catch (error) {
                    this.status(error.message);
                }
            });
            return;
        }
        if (action === 'mode') {
            if (this.modeChanging) return;
            this.modeChanging = true;
            this.pad?.release();
            try {
                await this.options.onModeChange(this.mode === 'stream' ? 'gamepad' : 'stream');
            } finally {
                this.modeChanging = false;
            }
            return;
        }
        this.render();
    }
    destroy() {
        this.closed = true;
        clearInterval(this.timer);
        this.pad?.destroy();
        this.voice?.destroy();
        this.bar?.remove();
    }
}
