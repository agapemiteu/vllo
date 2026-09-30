// Gapless PCM16 24 kHz playback queue. flush() silences the agent instantly on barge-in.
export class Player {
  // Some browsers refuse a 24 kHz context; a native-rate one still plays 24 kHz buffers (the browser resamples).
  private ctx = (() => {
    try {
      return new AudioContext({ sampleRate: 24000 });
    } catch {
      return new AudioContext();
    }
  })();
  private analyser = this.ctx.createAnalyser();
  private nextTime = 0;
  private sources = new Set<AudioBufferSourceNode>();
  private data: Uint8Array<ArrayBuffer>;

  constructor() {
    this.analyser.fftSize = 512;
    this.analyser.connect(this.ctx.destination);
    this.data = new Uint8Array(this.analyser.fftSize);
  }

  resume() {
    return this.ctx.resume();
  }

  enqueue(buf: ArrayBuffer) {
    // A truncated chunk (odd byte count) would throw; drop the stray byte.
    const pcm = new Int16Array(buf.byteLength % 2 ? buf.slice(0, buf.byteLength - 1) : buf);
    if (!pcm.length) return;
    const audio = this.ctx.createBuffer(1, pcm.length, 24000);
    const ch = audio.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) ch[i] = pcm[i] / 0x8000;
    const src = this.ctx.createBufferSource();
    src.buffer = audio;
    src.connect(this.analyser);
    const now = this.ctx.currentTime;
    if (this.nextTime < now + 0.02) this.nextTime = now + 0.04;
    src.start(this.nextTime);
    this.nextTime += audio.duration;
    this.sources.add(src);
    src.onended = () => this.sources.delete(src);
  }

  flush() {
    for (const s of this.sources) {
      try { s.stop(); } catch { /* already stopped */ }
    }
    this.sources.clear();
    this.nextTime = 0;
  }

  get playing() {
    return this.sources.size > 0;
  }

  level() {
    this.analyser.getByteTimeDomainData(this.data);
    let sum = 0;
    for (const v of this.data) sum += ((v - 128) / 128) ** 2;
    return Math.sqrt(sum / this.data.length);
  }

  close() {
    this.flush();
    this.ctx.close().catch(() => {});
  }
}
