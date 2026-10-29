import { t } from '../i18n/i18n.js';
import { BackendClient } from '../api/BackendClient.js';
import { defaultIceServers } from '../api/IceServers.js';

/** Four-seat audio mesh; the host relays authenticated signaling only. */
export class VoiceChat {
    /** @param {(message: string) => void} onStatus @param {RTCIceServer[]} iceServers */
    constructor(onStatus = () => {}, iceServers = defaultIceServers()) {
        this.onStatus = onStatus;
        this.iceServers = iceServers;
        this.peers = new Map();
        this.stream = null;
        this.listening = true;
        this.closed = false;
        this.pending = Promise.resolve();
        this.generation = 0;
    }
    async start() {
        await this.exchange({});
        this.schedule();
    }
    schedule() {
        if (this.closed) return;
        this.timer = setTimeout(async () => {
            try {
                await this.exchange({});
            } catch (error) {
                this.onStatus(`Voice: ${error.message}`);
                if (error.statusCode === 403) this.destroy();
            }
            this.schedule();
        }, 700);
    }
    exchange(payload) {
        const run = async () => {
            if (this.closed) return;
            const result = await BackendClient.post('/api/share/player/touch/voice', {
                ...payload,
                peer: this.id || '',
            });
            if (this.closed) return;
            this.id = result.peer;
            const available = new Set(result.peers);
            for (const [id, peer] of this.peers)
                if (!available.has(id)) {
                    peer.pc.close();
                    peer.audio.remove();
                    this.peers.delete(id);
                }
            for (const id of result.peers) this.ensurePeer(id);
            for (const message of result.messages) await this.receive(message.from, message.signal);
        };
        const next = this.pending.then(run);
        this.pending = next.catch(() => {});
        return next;
    }
    signal(to, signal) {
        this.exchange({ to, signal }).catch((error) => this.onStatus(`Voice: ${error.message}`));
    }
    ensurePeer(id) {
        if (this.peers.has(id)) return this.peers.get(id);
        const pc = new RTCPeerConnection({ iceServers: this.iceServers });
        const audio = document.createElement('audio');
        audio.autoplay = true;
        audio.muted = !this.listening;
        document.body.append(audio);
        const peer = {
            pc,
            audio,
            makingOffer: false,
            ignoreOffer: false,
            polite: this.id > id,
            candidates: [],
            sender: null,
        };
        this.peers.set(id, peer);
        peer.sender = pc.addTransceiver('audio', { direction: 'sendrecv' }).sender;
        if (this.stream) peer.sender.replaceTrack(this.stream.getAudioTracks()[0]);
        pc.onicecandidate = (event) => {
            if (event.candidate) this.signal(id, { candidate: event.candidate.toJSON() });
        };
        pc.ontrack = (event) => {
            audio.srcObject = new MediaStream([event.track]);
            audio.play().catch(() => this.onStatus(t('touch.enablePlayback')));
        };
        pc.onconnectionstatechange = () => this.onStatus(`Voice: ${pc.connectionState}`);
        pc.onnegotiationneeded = async () => {
            try {
                peer.makingOffer = true;
                await pc.setLocalDescription();
                this.signal(id, { description: pc.localDescription.toJSON() });
            } catch (error) {
                this.onStatus(`Voice: ${error.message}`);
            } finally {
                peer.makingOffer = false;
            }
        };
        return peer;
    }
    async receive(id, signal) {
        const peer = this.ensurePeer(id);
        const pc = peer.pc;
        try {
            if (signal.description) {
                const collision =
                    signal.description.type === 'offer' &&
                    (peer.makingOffer || pc.signalingState !== 'stable');
                peer.ignoreOffer = !peer.polite && collision;
                if (peer.ignoreOffer) return;
                await pc.setRemoteDescription(signal.description);
                for (const candidate of peer.candidates.splice(0))
                    await pc.addIceCandidate(candidate);
                if (signal.description.type === 'offer') {
                    await pc.setLocalDescription();
                    this.signal(id, { description: pc.localDescription.toJSON() });
                }
            } else if (signal.candidate && !peer.ignoreOffer) {
                if (pc.remoteDescription) await pc.addIceCandidate(signal.candidate);
                else peer.candidates.push(signal.candidate);
            }
        } catch (error) {
            this.onStatus(`Voice: ${error.message}`);
        }
    }
    async setMic(enabled) {
        if (this.closed) throw new Error(t('touch.voiceDisconnected'));
        const generation = ++this.generation;
        if (!enabled) {
            this.stream?.getTracks().forEach((track) => track.stop());
            this.stream = null;
            await Promise.all([...this.peers.values()].map((p) => p.sender.replaceTrack(null)));
            return;
        }
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
            video: false,
        });
        if (this.closed || generation !== this.generation) {
            stream.getTracks().forEach((t) => t.stop());
            return;
        }
        this.stream?.getTracks().forEach((t) => t.stop());
        this.stream = stream;
        try {
            await Promise.all(
                [...this.peers.values()].map((p) =>
                    p.sender.replaceTrack(stream.getAudioTracks()[0]),
                ),
            );
        } catch (error) {
            stream.getTracks().forEach((track) => track.stop());
            this.stream = null;
            await Promise.allSettled(
                [...this.peers.values()].map((p) => p.sender.replaceTrack(null)),
            );
            throw error;
        }
    }
    setListening(enabled) {
        this.listening = enabled;
        for (const peer of this.peers.values()) {
            peer.audio.muted = !enabled;
            if (enabled) peer.audio.play().catch(() => {});
        }
    }
    destroy() {
        this.closed = true;
        ++this.generation;
        clearTimeout(this.timer);
        this.stream?.getTracks().forEach((t) => t.stop());
        this.stream = null;
        for (const peer of this.peers.values()) {
            peer.pc.close();
            peer.audio.srcObject = null;
            peer.audio.remove();
        }
        this.peers.clear();
        if (this.id)
            BackendClient.post('/api/share/player/touch/voice', {
                peer: this.id,
                leave: true,
            }).catch(() => {});
    }
}
