import { t } from '../i18n/i18n.js';
import { BackendClient } from '../api/BackendClient.js';
import { escapeHtml as esc } from '../util/escapeHtml.js';
import { loadTouchStyles } from './ProfileEditor.js';
import { chooseProfile, groupFor, rememberedProfile, rememberProfile } from './profiles.js';

/** Library launches choose their own controls before creating a transport. */
export class ConnectDialog {
    static async open(host, app) {
        if (host.backendType !== 'native') return {};
        const caps = await BackendClient.get(
            `/api/touch/capabilities?host=${encodeURIComponent(host.uuid)}`,
        );
        if (!caps.gamepadMode) return {};
        const game = await BackendClient.get(
            `/api/touch/game?host=${encodeURIComponent(host.uuid)}&appId=${encodeURIComponent(app.id)}`,
        );
        loadTouchStyles();
        const dialog = document.createElement('dialog');
        dialog.className = 'touch-connect';
        dialog.setAttribute('aria-labelledby', 'touch-connect-title');
        dialog.innerHTML = `<form method="dialog"><h2 id="touch-connect-title">${t('touch.connect')} · ${esc(app.name)}</h2>
            <label>${t('touch.mode')} <select name="mode" aria-label="${t('touch.mode')}"><option value="stream">${t('touch.stream')}</option><option value="gamepad">${t('touch.gamepadOnly')}</option></select></label>
            <label>${t('touch.input')} <select name="source" aria-label="${t('touch.input')}"><option value="physical">${t('touch.physical')}</option><option value="touch">${t('touch.onScreen')}</option></select></label>
            <label>${t('touch.profile')} <select name="profile" aria-label="${t('touch.profile')}"></select></label>
            <label class="touch-connect-audio"><input name="audio" type="checkbox">${t('touch.gameAudio')}</label>
            <p>${t('touch.gamepadHint')}</p>
            <footer><button value="cancel">${t('common.cancel')}</button><button value="connect">${t('touch.connect')}</button></footer></form>`;
        const mode = /** @type {HTMLSelectElement} */ (dialog.querySelector('[name=mode]'));
        const source = /** @type {HTMLSelectElement} */ (dialog.querySelector('[name=source]'));
        const profile = /** @type {HTMLSelectElement} */ (dialog.querySelector('[name=profile]'));
        const audio = /** @type {HTMLInputElement} */ (dialog.querySelector('[name=audio]'));
        if (navigator.maxTouchPoints > 0) source.value = 'touch';
        const refresh = () => {
            const selected = chooseProfile(game, mode.value, rememberedProfile(game, mode.value));
            const profiles = groupFor(game, mode.value).profiles;
            profile.innerHTML = (profiles.length ? profiles : [selected])
                .map(
                    (p) =>
                        `<option value="${esc(p.id)}" ${p.id === selected.id ? 'selected' : ''}>${esc(p.name)}</option>`,
                )
                .join('');
            audio.checked = selected.audio;
            if (mode.value === 'gamepad') source.value = 'touch';
        };
        mode.addEventListener('change', refresh);
        profile.addEventListener('change', () => {
            audio.checked = chooseProfile(game, mode.value, profile.value).audio;
        });
        refresh();
        document.body.append(dialog);
        return new Promise((resolve) => {
            dialog.addEventListener(
                'close',
                () => {
                    const choice =
                        dialog.returnValue === 'connect'
                            ? {
                                  settings: {
                                      mode: mode.value,
                                      profile_id: profile.value,
                                      audio: audio.checked,
                                      touch_source: source.value === 'touch',
                                  },
                              }
                            : null;
                    if (choice) rememberProfile(game, mode.value, profile.value);
                    dialog.remove();
                    resolve(choice);
                },
                { once: true },
            );
            dialog.showModal();
        });
    }
}
