// PCM16 mono 24 kHz capture. The AudioContext runs at 24 kHz so the browser resamples the mic for us.
const WORKLET = `
class PcmCapture extends AudioWorkletProcessor {
  constructor() { super(); this.buf = new Int16Array(2400); this.n = 0; }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    for (let i = 0; i < ch.length; i++) {
      const s = Math.max(-1, Math.min(1, ch[i]));
      this.buf[this.n++] = s < 0 ? s * 0x8000 : s * 0x7fff;
      if (this.n === this.buf.length) {
        this.port.postMessage(this.buf.buffer.slice(0));
        this.n = 0;
      }
    }
    return true;
  }
}
registerProcessor("pcm-capture", PcmCapture);
`;

export interface Mic {
  stop: () => void;
  level: () => number;
}

export async function startMic(onChunk: (buf: ArrayBuffer) => void): Promise<Mic> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
  });
  const ctx = new AudioContext({ sampleRate: 24000 });
  const url = URL.createObjectURL(new Blob([WORKLET], { type: "application/javascript" }));
  await ctx.audioWorklet.addModule(url);
  const src = ctx.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(ctx, "pcm-capture");
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  node.port.onmessage = (e) => onChunk(e.data as ArrayBuffer);
  src.connect(node);
  src.connect(analyser);
  const data = new Uint8Array(analyser.fftSize);

  return {
    stop() {
      node.port.onmessage = null;
      stream.getTracks().forEach((t) => t.stop());
      ctx.close();
    },
    level() {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (const v of data) sum += ((v - 128) / 128) ** 2;
      return Math.sqrt(sum / data.length);
    },
  };
}
