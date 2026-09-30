// PCM16 mono 24 kHz capture. Prefers a 24 kHz AudioContext (the browser resamples the mic);
// browsers that refuse that rate get a native-rate context and the worklet resamples instead.
const WORKLET = `
class PcmCapture extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.step = (options.processorOptions && options.processorOptions.step) || 1;
    this.pos = 0;
    this.buf = new Int16Array(2400);
    this.n = 0;
  }
  push(s) {
    s = Math.max(-1, Math.min(1, s));
    this.buf[this.n++] = s < 0 ? s * 0x8000 : s * 0x7fff;
    if (this.n === this.buf.length) {
      this.port.postMessage(this.buf.buffer.slice(0));
      this.n = 0;
    }
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    if (this.step === 1) {
      for (let i = 0; i < ch.length; i++) this.push(ch[i]);
    } else {
      while (this.pos < ch.length) {
        this.push(ch[Math.floor(this.pos)]);
        this.pos += this.step;
      }
      this.pos -= ch.length;
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

/** Human-readable reason a microphone could not be opened. */
export function micError(e: any): string {
  switch (e?.name) {
    case "NotAllowedError":
    case "SecurityError":
      return "Microphone access is blocked. Allow the microphone for this site (the icon in the address bar), then tap Check in again.";
    case "NotFoundError":
    case "OverconstrainedError":
      return "No microphone was found. Plug in a headset or use a phone, then tap Check in again.";
    case "NotReadableError":
    case "AbortError":
      return "The microphone is being used by another app. Close it, then tap Check in again.";
    default:
      return e?.message ? `The microphone couldn't start: ${e.message}` : "The microphone couldn't start. Try again, or open this link in Chrome or Safari.";
  }
}

export const micSupported = () => typeof navigator.mediaDevices?.getUserMedia === "function" && "AudioWorkletNode" in window;

export async function startMic(onChunk: (buf: ArrayBuffer) => void): Promise<Mic> {
  if (!micSupported()) throw Object.assign(new Error("This browser can't use the microphone here. Open the link in Chrome or Safari."), { name: "Unsupported" });
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
  });
  let ctx: AudioContext;
  try {
    ctx = new AudioContext({ sampleRate: 24000 });
  } catch {
    ctx = new AudioContext();
  }
  try {
    await ctx.resume();
    const url = URL.createObjectURL(new Blob([WORKLET], { type: "application/javascript" }));
    await ctx.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);
    const src = ctx.createMediaStreamSource(stream);
    const node = new AudioWorkletNode(ctx, "pcm-capture", { processorOptions: { step: ctx.sampleRate / 24000 } });
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
        ctx.close().catch(() => {});
      },
      level() {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (const v of data) sum += ((v - 128) / 128) ** 2;
        return Math.sqrt(sum / data.length);
      },
    };
  } catch (e) {
    stream.getTracks().forEach((t) => t.stop());
    ctx.close().catch(() => {});
    throw e;
  }
}
