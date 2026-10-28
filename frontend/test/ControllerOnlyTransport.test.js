import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WebRtcDataChannel } from '../js/api/WebRtcDataChannel.js';

describe('controller-only WebRTC transport', () => {
    beforeEach(() => localStorage.clear());
    const transport = (controllerOnly) => ({
        controllerOnly,
        dataChannels: {},
        _setupDataChannel: vi.fn(),
        pc: {
            createDataChannel: vi.fn(() => ({ readyState: 'open' })),
        },
    });
    it('opens input without creating a video data channel', () => {
        const t = transport(true);
        WebRtcDataChannel.prototype._createDataChannels.call(t);
        const labels = t.pc.createDataChannel.mock.calls.map((call) => call[0]);
        expect(labels).toContain('input');
        expect(labels).not.toContain('video');
        expect(WebRtcDataChannel.prototype._allDcOpen.call(t)).toBe(true);
    });
    it('keeps video required for the existing streaming mode', () => {
        const t = transport(false);
        WebRtcDataChannel.prototype._createDataChannels.call(t);
        expect(t.pc.createDataChannel.mock.calls.map((call) => call[0])).toContain('video');
        expect(WebRtcDataChannel.prototype._allDcOpen.call(t)).toBe(true);
        t.dataChannels.video.readyState = 'connecting';
        expect(WebRtcDataChannel.prototype._allDcOpen.call(t)).toBe(false);
    });
});
