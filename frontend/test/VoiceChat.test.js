import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { VoiceChat } from '../js/touch/VoiceChat.js';
import { BackendClient } from '../js/api/BackendClient.js';

describe('voice capture is explicit and independent of gamepad', () => {
    let voice, stop, getUserMedia;
    beforeEach(() => {
        stop = vi.fn();
        getUserMedia = vi
            .fn()
            .mockResolvedValue({ getTracks: () => [{ stop }], getAudioTracks: () => [] });
        Object.defineProperty(navigator, 'mediaDevices', {
            configurable: true,
            value: { getUserMedia },
        });
        vi.spyOn(BackendClient, 'post').mockResolvedValue({ peer: 'me', peers: [], messages: [] });
        voice = new VoiceChat();
    });
    afterEach(() => {
        voice.destroy();
        vi.restoreAllMocks();
    });
    it('joins without asking for microphone permission', async () => {
        await voice.start();
        expect(getUserMedia).not.toHaveBeenCalled();
        expect(voice.stream).toBeNull();
    });
    it('stops capture when muted and on leaving', async () => {
        await voice.setMic(true);
        expect(getUserMedia).toHaveBeenCalledOnce();
        await voice.setMic(false);
        expect(stop).toHaveBeenCalledOnce();
        expect(voice.stream).toBeNull();
        await voice.setMic(true);
        voice.destroy();
        expect(stop).toHaveBeenCalledTimes(2);
    });
    it('survives permission denial without starting capture', async () => {
        getUserMedia.mockRejectedValue(new Error('Permission denied'));
        await expect(voice.setMic(true)).rejects.toThrow('Permission denied');
        expect(voice.stream).toBeNull();
    });
    it('discards a permission response arriving after mute', async () => {
        let resolve;
        getUserMedia.mockReturnValue(
            new Promise((r) => {
                resolve = r;
            }),
        );
        const enable = voice.setMic(true);
        await voice.setMic(false);
        resolve({ getTracks: () => [{ stop }] });
        await enable;
        expect(stop).toHaveBeenCalledOnce();
        expect(voice.stream).toBeNull();
    });
    it('discards a permission response arriving after destruction', async () => {
        let resolve;
        getUserMedia.mockReturnValue(
            new Promise((r) => {
                resolve = r;
            }),
        );
        const enable = voice.setMic(true);
        voice.destroy();
        resolve({ getTracks: () => [{ stop }] });
        await enable;
        expect(stop).toHaveBeenCalledOnce();
    });
    it('does not request permission once its voice membership has ended', async () => {
        voice.destroy();
        await expect(voice.setMic(true)).rejects.toThrow('disconnected');
        expect(getUserMedia).not.toHaveBeenCalled();
    });
});

describe('voice mesh signaling', () => {
    let voice;
    beforeEach(() => {
        class Peer {
            signalingState = 'stable';
            localDescription = null;
            remoteDescription = null;
            sender = { replaceTrack: vi.fn().mockResolvedValue() };
            addTransceiver = vi.fn(() => ({ sender: this.sender }));
            addIceCandidate = vi.fn().mockResolvedValue();
            close = vi.fn();
            async setRemoteDescription(description) {
                this.remoteDescription = description;
                this.signalingState = 'have-remote-offer';
            }
            async setLocalDescription() {
                const description = {
                    type: this.signalingState === 'have-remote-offer' ? 'answer' : 'offer',
                    sdp: 'test',
                };
                this.localDescription = { ...description, toJSON: () => description };
                this.signalingState = 'stable';
            }
        }
        vi.stubGlobal('RTCPeerConnection', Peer);
        voice = new VoiceChat();
        voice.id = 'b';
        voice.signal = vi.fn();
        vi.spyOn(BackendClient, 'post').mockResolvedValue({});
    });
    afterEach(() => {
        voice.destroy();
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });
    it('buffers early ICE and answers an audio offer once the remote description is installed', async () => {
        const candidate = { candidate: 'candidate:test' };
        await voice.receive('a', { candidate });
        const peer = voice.peers.get('a');
        expect(peer.pc.addIceCandidate).not.toHaveBeenCalled();
        await voice.receive('a', { description: { type: 'offer', sdp: 'test' } });
        expect(peer.pc.addTransceiver).toHaveBeenCalledWith('audio', { direction: 'sendrecv' });
        expect(peer.pc.addIceCandidate).toHaveBeenCalledWith(candidate);
        expect(voice.signal).toHaveBeenCalledWith('a', {
            description: { type: 'answer', sdp: 'test' },
        });
    });
    it('ignores a colliding offer on the impolite peer instead of corrupting negotiation', async () => {
        voice.id = 'a';
        const peer = voice.ensurePeer('b');
        peer.makingOffer = true;
        await voice.receive('b', { description: { type: 'offer', sdp: 'collision' } });
        expect(peer.pc.remoteDescription).toBeNull();
        expect(voice.signal).not.toHaveBeenCalled();
    });
});
