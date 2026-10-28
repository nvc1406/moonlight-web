import { BackendClient } from '../api/BackendClient.js';
import { escapeHtml as esc } from '../util/escapeHtml.js';
import { builtin, clone, MODES, OUTPUTS, groupFor } from './profiles.js';
import { TouchGamepad } from './TouchGamepad.js';

export function loadTouchStyles() {
    if (document.getElementById('touch-gamepad-css')) return;
    const link = document.createElement('link');
    link.id = 'touch-gamepad-css';
    link.rel = 'stylesheet';
    link.href = '/css/touch-gamepad.css';
    document.head.append(link);
}

export class ProfileEditor {
    static async open() {
        const editor = new ProfileEditor();
        await editor.load();
        return editor;
    }
    async load() {
        loadTouchStyles();
        this.doc = await BackendClient.get('/api/touch/profiles');
        const result = await BackendClient.getHosts();
        const hosts = Array.isArray(result) ? result : result.hosts || [];
        this.apps = [];
        for (const host of hosts.filter((h) => !h.backendType || h.backendType === 'native')) {
            try {
                const data = await BackendClient.getAppList(host.uuid);
                for (const app of Array.isArray(data) ? data : data.apps || [])
                    this.apps.push({
                        host: host.uuid,
                        appId: app.id,
                        name: `${host.name} / ${app.name}`,
                    });
            } catch {
                /* offline host; saved game profiles are still editable */
            }
        }
        for (const game of this.doc.games)
            if (!this.apps.some((a) => a.host === game.host && a.appId === game.appId))
                this.apps.push({ host: game.host, appId: game.appId, name: game.name });
        this.gameIndex = 0;
        this.mode = 'stream';
        this.profileId = '';
        this.orientation = 'landscape';
        this.test = false;
        this.root = document.createElement('section');
        this.root.className = 'touch-editor';
        this.root.setAttribute('role', 'dialog');
        this.root.setAttribute('aria-label', 'Game → Mode → Profile');
        document.body.append(this.root);
        this.render();
    }
    game() {
        const app = this.apps[this.gameIndex];
        if (!app) return null;
        let game = this.doc.games.find((g) => g.host === app.host && g.appId === app.appId);
        if (!game) {
            game = {
                ...app,
                modes: Object.fromEntries(
                    MODES.map((mode) => [mode, { defaultProfileId: '', profiles: [] }]),
                ),
            };
            this.doc.games.push(game);
        }
        return game;
    }
    commitPad() {
        if (this.pad && this.profile) Object.assign(this.profile, clone(this.pad.profile));
        this.pad?.destroy();
        this.pad = null;
    }
    render() {
        this.commitPad();
        const game = this.game();
        const group = game ? groupFor(game, this.mode) : { profiles: [], defaultProfileId: '' };
        this.profile =
            group.profiles.find((p) => p.id === this.profileId) ||
            group.profiles.find((p) => p.id === group.defaultProfileId) ||
            group.profiles[0] ||
            null;
        this.profileId = this.profile?.id || '';
        const p = this.profile;
        this.root.innerHTML = `<header><strong>Game → Mode → Profile</strong><button data-action="close">Close</button><button data-action="save">Save to host</button><button data-action="reload">Reload saved</button></header>
            <div><select data-field="game" aria-label="Game">${this.apps.map((a, i) => `<option value="${i}" ${i === this.gameIndex ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select>
            <select data-field="mode" aria-label="Mode">${MODES.map((m) => `<option ${m === this.mode ? 'selected' : ''} value="${m}">${m === 'stream' ? 'Video + audio + gamepad' : 'Gamepad only'}</option>`).join('')}</select>
            <select data-field="profile" aria-label="Profile">${group.profiles.length ? '' : '<option value="">Xbox built-in</option>'}${group.profiles.map((pr) => `<option value="${esc(pr.id)}" ${pr.id === this.profileId ? 'selected' : ''}>${esc(pr.name)}${pr.id === group.defaultProfileId ? ' ★' : ''}</option>`).join('')}</select></div>
            <div><button data-action="new" ${game ? '' : 'disabled'}>New</button><button data-action="copy" ${game ? '' : 'disabled'}>Duplicate</button><button data-action="cross" ${game ? '' : 'disabled'}>Copy to other mode</button><button data-action="default" ${p ? '' : 'disabled'}>Set default</button><button data-action="delete" ${p ? '' : 'disabled'}>Delete</button></div>
            ${
                p
                    ? `<div class="touch-editor-fields"><label>Name <input data-setting="name" maxlength="80" value="${esc(p.name)}"></label>
            ${[
                ['deadzone', 0, 0.9, 0.01],
                ['sensitivity', 0.1, 3, 0.1],
                ['opacity', 0.05, 1, 0.05],
            ]
                .map(
                    ([key, min, max, step]) =>
                        `<label>${key} <input data-setting="${key}" type="number" min="${min}" max="${max}" step="${step}" value="${p[key]}"></label>`,
                )
                .join('')}
            <label><input data-setting="audio" type="checkbox" ${p.audio ? 'checked' : ''}>Game audio by default</label></div>`
                    : ''
            }
            <button data-action="orientation">${this.orientation}</button><button data-action="test">${this.test ? 'Edit layout' : 'Test controls'}</button><button data-action="reset" ${p ? '' : 'disabled'}>Reset layout</button>
            <div class="touch-editor-preview ${this.orientation === 'portrait' ? 'portrait' : ''}"></div><div class="touch-editor-fields" data-control></div><p role="status">Draft — save to apply to devices.</p>`;
        this.root.querySelectorAll('[data-action]').forEach((b) =>
            b.addEventListener('click', () =>
                this.action(/** @type {HTMLElement} */ (b).dataset.action).catch((e) => {
                    this.render();
                    this.status(e.message);
                }),
            ),
        );
        this.root.querySelectorAll('[data-field]').forEach((select) =>
            select.addEventListener('change', () => {
                const field = /** @type {HTMLElement} */ (select).dataset.field;
                const value = /** @type {HTMLSelectElement} */ (select).value;
                this.commitPad();
                if (field === 'game') {
                    this.gameIndex = Number(value);
                    this.profileId = '';
                }
                if (field === 'mode') {
                    this.mode = value;
                    this.profileId = '';
                }
                if (field === 'profile') this.profileId = value;
                this.render();
            }),
        );
        this.root.querySelectorAll('[data-setting]').forEach((input) =>
            input.addEventListener('change', () => {
                const el = /** @type {HTMLInputElement} */ (input);
                const key = el.dataset.setting;
                p[key] =
                    key === 'audio'
                        ? el.checked
                        : key === 'name'
                          ? el.value.trim()
                          : Number(el.value);
                if (this.pad) this.pad.profile[key] = p[key];
                this.render();
            }),
        );
        this.pad = new TouchGamepad(
            this.root.querySelector('.touch-editor-preview'),
            p || builtin(this.mode),
            (state) => this.status(JSON.stringify(state)),
            {
                edit: !this.test,
                onSelect: (c) => this.selectControl(c),
                onChange: (profile) => {
                    if (p) Object.assign(p, clone(profile));
                },
            },
        );
        this.pad.orientation = () => this.orientation;
        this.pad.render();
        if (this.test) this.pad.connect();
    }
    status(message) {
        this.root.querySelector('[role=status]').textContent = message;
    }
    selectControl(control) {
        if (!this.profile || this.test) return;
        const root = this.root.querySelector('[data-control]');
        root.innerHTML = `<strong>${esc(control.id)}</strong><label>Label <input data-prop="label" maxlength="32" value="${esc(control.label)}"></label><label>Output <select data-prop="output">${OUTPUTS.map((o) => `<option ${o === control.output ? 'selected' : ''}>${o}</option>`).join('')}</select></label><label>Size <input data-prop="size" type="number" min="0.025" max="0.5" step="0.01" value="${control.size}"></label><label><input data-prop="hidden" type="checkbox" ${control.hidden ? 'checked' : ''}>Hidden</label>`;
        root.querySelectorAll('[data-prop]').forEach((input) => {
            const update = () => {
                const el = /** @type {HTMLInputElement} */ (input);
                const prop = el.dataset.prop;
                control[prop] =
                    prop === 'hidden'
                        ? el.checked
                        : prop === 'size'
                          ? Math.max(0.025, Math.min(0.5, Number(el.value)))
                          : el.value;
                Object.assign(this.profile, clone(this.pad.profile));
                this.pad.release();
                this.pad.render();
            };
            input.addEventListener('input', update);
            input.addEventListener('change', update);
        });
    }
    async action(action) {
        this.commitPad();
        const game = this.game();
        const group = game && groupFor(game, this.mode);
        if (action === 'close') {
            this.root.remove();
            return;
        }
        if (action === 'save') {
            this.doc = await BackendClient.post('/api/touch/profiles', this.doc);
            this.render();
            this.status('Saved');
            return;
        }
        if (action === 'reload') {
            this.doc = await BackendClient.get('/api/touch/profiles');
        }
        if (['new', 'copy', 'cross'].includes(action) && group) {
            const mode =
                action === 'cross' ? (this.mode === 'stream' ? 'gamepad' : 'stream') : this.mode;
            const target = groupFor(game, mode);
            const source = action === 'new' ? builtin(mode) : this.profile || builtin(this.mode);
            const profile = {
                ...clone(source),
                id: crypto.randomUUID(),
                name: `${source.name} copy`,
            };
            target.profiles.push(profile);
            if (!target.defaultProfileId) target.defaultProfileId = profile.id;
            this.mode = mode;
            this.profileId = profile.id;
        }
        if (action === 'default' && this.profile) group.defaultProfileId = this.profile.id;
        if (action === 'delete' && this.profile) {
            const remaining = group.profiles.filter((p) => p.id !== this.profile.id);
            if (group.defaultProfileId === this.profile.id && remaining.length) {
                this.render();
                const field = this.root.querySelector('[data-control]');
                field.innerHTML = `<label>Replacement default <select data-replacement>${remaining.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</select></label><button data-delete-confirm>Delete and replace</button>`;
                field.querySelector('[data-delete-confirm]').addEventListener('click', () => {
                    this.commitPad();
                    group.defaultProfileId = /** @type {HTMLSelectElement} */ (
                        field.querySelector('[data-replacement]')
                    ).value;
                    group.profiles = remaining;
                    this.profileId = '';
                    this.render();
                });
                return;
            } else if (!remaining.length) group.defaultProfileId = '';
            group.profiles = remaining;
            this.profileId = '';
        }
        if (action === 'orientation')
            this.orientation = this.orientation === 'landscape' ? 'portrait' : 'landscape';
        if (action === 'test') this.test = !this.test;
        if (action === 'reset' && this.profile) this.profile.layouts = builtin(this.mode).layouts;
        this.render();
    }
}
