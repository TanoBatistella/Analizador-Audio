import { analyze, Analysis, Input } from "./dsp";
import { detectKey, detectTempo, type Tonal, type Tempo } from "./tonal";
import AnalysisWorker from "./worker?worker&inline";

function sniffRate(b: ArrayBuffer): number | null {
  const u = new Uint8Array(b), v = new DataView(b);
  const s = (o: number, n: number) => String.fromCharCode(...u.slice(o, o + n));
  if (u.length < 64) return null;
  if (s(0, 4) === "RIFF" && s(8, 4) === "WAVE") return v.getUint32(24, true);
  if (s(0, 4) === "fLaC") return v.getUint32(18) >>> 12;
  if (s(0, 4) === "OggS") {
    const head = s(0, 400);
    if (head.includes("OpusHead")) return 48000;
    const i = head.indexOf("\x01vorbis");
    return i >= 0 ? v.getUint32(i + 12, true) : null;
  }
  let o = 0;
  if (s(0, 3) === "ID3") o = 10 + ((u[6] << 21) | (u[7] << 14) | (u[8] << 7) | u[9]);
  for (let i = o; i < Math.min(u.length - 4, o + 8192); i++) {
    if (u[i] === 0xff && (u[i + 1] & 0xe0) === 0xe0) {
      const ver = (u[i + 1] >> 3) & 3, idx = (u[i + 2] >> 2) & 3;
      const row = ver === 3 ? 0 : ver === 2 ? 1 : ver === 0 ? 2 : -1;
      if (row >= 0 && idx < 3) return [[44100, 48000, 32000], [22050, 24000, 16000], [11025, 12000, 8000]][row][idx];
    }
  }
  return null;
}

function viaWorker<T>(msg: object, onProgress: (m: string) => void) {
  return new Promise<T>((res, rej) => {
    const w = new AnalysisWorker();
    w.onmessage = (e) => {
      const d = e.data;
      if (d.type === "progress") return onProgress(d.m);
      w.terminate();
      d.type === "done" ? res(d.r) : rej(new Error(d.m));
    };
    w.onerror = (e) => { w.terminate(); rej(e); };
    w.postMessage(msg);
  });
}

async function decode(file: File, onProgress: (m: string) => void) {
  const raw = await file.arrayBuffer();
  const native = sniffRate(raw);
  onProgress("decodificando…");
  let ctx: AudioContext;
  try { ctx = native ? new AudioContext({ sampleRate: native }) : new AudioContext(); } catch { ctx = new AudioContext(); }
  const buf = await ctx.decodeAudioData(raw);
  ctx.close();
  const input: Input = {
    sampleRate: buf.sampleRate, length: buf.length, duration: buf.duration, numberOfChannels: buf.numberOfChannels,
    chs: Array.from({ length: Math.min(6, buf.numberOfChannels) }, (_, i) => buf.getChannelData(i)),
  };
  return { input, native };
}

export async function runAnalysis(file: File, onProgress: (m: string) => void): Promise<Analysis> {
  const { input, native } = await decode(file, onProgress);
  let a: Analysis;
  try { a = await viaWorker<Analysis>(input, onProgress); } catch { onProgress("analizando…"); a = await analyze(input, onProgress); }
  return { ...a, nativeRate: native };
}

export type TonalResult = { duration: number; tonal: Tonal | null; tempo: Tempo | null };
export async function runTonal(file: File, onProgress: (m: string) => void): Promise<TonalResult> {
  const { input } = await decode(file, onProgress);
  onProgress("detectando key y BPM…");
  try { return await viaWorker<TonalResult>({ mode: "tonal", ...input }, onProgress); }
  catch { return { duration: input.duration, tonal: detectKey(input.chs, input.sampleRate), tempo: detectTempo(input.chs, input.sampleRate) }; }
}
