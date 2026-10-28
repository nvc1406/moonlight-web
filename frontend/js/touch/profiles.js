export const MODES = ['stream', 'gamepad'];
export const OUTPUTS = [
    'leftStick',
    'rightStick',
    'Up',
    'Down',
    'Left',
    'Right',
    'A',
    'B',
    'X',
    'Y',
    'LB',
    'RB',
    'LT',
    'RT',
    'L3',
    'R3',
    'Start',
    'Back',
];
export const clone = (value) => JSON.parse(JSON.stringify(value));

export function builtin(mode = 'stream') {
    /** @type {[string, string, number, number, number][]} */
    const positions = [
        ['leftStick', 'L', 0.15, 0.68, 0.2],
        ['rightStick', 'R', 0.63, 0.73, 0.18],
        ['A', 'A', 0.87, 0.75, 0.1],
        ['B', 'B', 0.94, 0.58, 0.1],
        ['X', 'X', 0.8, 0.58, 0.1],
        ['Y', 'Y', 0.87, 0.41, 0.1],
        ['Up', '↑', 0.36, 0.49, 0.075],
        ['Down', '↓', 0.36, 0.76, 0.075],
        ['Left', '←', 0.3, 0.625, 0.075],
        ['Right', '→', 0.42, 0.625, 0.075],
        ['LB', 'LB', 0.12, 0.17, 0.1],
        ['LT', 'LT', 0.25, 0.17, 0.1],
        ['RB', 'RB', 0.88, 0.17, 0.1],
        ['RT', 'RT', 0.75, 0.17, 0.1],
        ['L3', 'L3', 0.44, 0.44, 0.075],
        ['R3', 'R3', 0.56, 0.44, 0.075],
        ['Back', 'Back', 0.44, 0.27, 0.08],
        ['Start', 'Start', 0.56, 0.27, 0.08],
    ];
    const controls = positions.map(([output, label, x, y, size]) => ({
        id: output,
        output,
        label,
        x,
        y,
        size,
        hidden: false,
    }));
    return {
        id: 'builtin',
        name: 'Xbox',
        audio: mode === 'stream',
        deadzone: 0.12,
        sensitivity: 1,
        opacity: mode === 'stream' ? 0.6 : 1,
        layouts: {
            landscape: controls,
            portrait: controls.map((c) => {
                const positions = {
                    leftStick: [0.22, 0.65, 0.3],
                    rightStick: [0.73, 0.65, 0.3],
                    Up: [0.22, 0.78, 0.12],
                    Down: [0.22, 0.92, 0.12],
                    Left: [0.1, 0.85, 0.12],
                    Right: [0.34, 0.85, 0.12],
                    Y: [0.78, 0.78, 0.12],
                    A: [0.78, 0.92, 0.12],
                    X: [0.66, 0.85, 0.12],
                    B: [0.9, 0.85, 0.12],
                    LB: [0.12, 0.35, 0.16],
                    LT: [0.36, 0.35, 0.16],
                    RT: [0.64, 0.35, 0.16],
                    RB: [0.88, 0.35, 0.16],
                    Back: [0.36, 0.47, 0.14],
                    Start: [0.64, 0.47, 0.14],
                    L3: [0.4, 0.57, 0.12],
                    R3: [0.6, 0.57, 0.12],
                };
                const [x, y, size] = positions[c.id];
                return { ...c, x, y, size };
            }),
        },
    };
}

export function groupFor(game, mode) {
    return game?.modes?.[mode] || { defaultProfileId: '', profiles: [] };
}
export function chooseProfile(game, mode, preferred = '') {
    const group = groupFor(game, mode);
    return clone(
        group.profiles.find((p) => p.id === preferred) ||
            group.profiles.find((p) => p.id === group.defaultProfileId) ||
            group.profiles[0] ||
            builtin(mode),
    );
}
const preferenceKey = (game, mode) => `mw-touch:${game.host}:${game.appId}:${mode}`;
export function rememberedProfile(game, mode) {
    try {
        return localStorage.getItem(preferenceKey(game, mode)) || '';
    } catch {
        return '';
    }
}
export function rememberProfile(game, mode, id) {
    try {
        localStorage.setItem(preferenceKey(game, mode), id);
    } catch {
        /* page-only when storage is unavailable */
    }
}

export function stickVector(dx, dy, radius, deadzone, sensitivity) {
    const length = Math.hypot(dx, dy);
    const normalized = Math.min(1, length / Math.max(1, radius));
    const magnitude =
        normalized <= deadzone
            ? 0
            : Math.min(1, ((normalized - deadzone) / (1 - deadzone)) * sensitivity);
    return length ? [(dx / length) * magnitude, (-dy / length) * magnitude] : [0, 0];
}
