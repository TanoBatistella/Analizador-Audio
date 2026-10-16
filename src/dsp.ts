import { fft } from "./fft";
import { detectKey, detectTempo, type Tonal, type Tempo } from "./tonal";
export interface Analysis {
  duration: number; sampleRate: number; channels: number;
  peakDb: number; truePeakDb: number; rmsDb: number; crestDb: number; dc: number;
  correlation: number | null; clips: number; midSideDb: number | null;
  timeline: number[]; 
  nativeRate?: number | null;
  plr: number; tonal: Tonal | null; tempo: Tempo | null;
  spectrogram: { data: Float32Array; cols: number; rows: number };
  vector: Float32Array | null; 
  lufsI: number; lufsMomMax: number; lufsShortMax: number; lra: number;
  wave: Float32Array; 
  spectrum: { f: number; db: number }[];
  bands: { name: string; range: string; db: number }[];
}

export interface Input { sampleRate: number; length: number; duration: number; numberOfChannels: number; chs: Float32Array[]; }
const tick = () => new Promise<void>((r) => setTimeout(r));
const toDb = (x: number) => (x > 1e-12 ? 20 * Math.log10(x) : -Infinity);
const lufs = (e: number) => (e > 0 ? -0.691 + 10 * Math.log10(e) : -Infinity);

function biquad(x: Float32Array, b: number[], a: number[]) {
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = x[i];
    const o = b[0] * v + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2;
    x2 = x1; x1 = v; y2 = y1; y1 = o; y[i] = o;
  }
  return y;
}

function kWeight(x: Float32Array, fs: number) {
  let f0 = 1681.974450955533, G = 3.999843853973347, Q = 0.7071752369554196;
  let K = Math.tan((Math.PI * f0) / fs);
  const Vh = Math.pow(10, G / 20), Vb = Math.pow(Vh, 0.4996667741545416);
  let a0 = 1 + K / Q + K * K;
  const b1 = [(Vh + (Vb * K) / Q + K * K) / a0, (2 * (K * K - Vh)) / a0, (Vh - (Vb * K) / Q + K * K) / a0];
  const a1 = [1, (2 * (K * K - 1)) / a0, (1 - K / Q + K * K) / a0];
  f0 = 38.13547087602444; Q = 0.5003270373238773;
  K = Math.tan((Math.PI * f0) / fs);
  a0 = 1 + K / Q + K * K;
  const a2 = [1, (2 * (K * K - 1)) / a0, (1 - K / Q + K * K) / a0];
  return biquad(biquad(x, b1, a1), [1, -2, 1], a2);
}

function gate(es: number[], rel: number) {
  const a = es.filter((e) => lufs(e) > -70);
  if (!a.length) return { mean: 0, sel: [] as number[] };
  const m = a.reduce((s, v) => s + v, 0) / a.length;
  const sel = a.filter((e) => lufs(e) > lufs(m) + rel);
  return { mean: sel.length ? sel.reduce((s, v) => s + v, 0) / sel.length : 0, sel };
}

const TP = [1, 2, 3].map((p) =>
  Array.from({ length: 12 }, (_, j) => {
    const d = j - 5 - p / 4;
    const s = d === 0 ? 1 : Math.sin(Math.PI * d) / (Math.PI * d);
    return s * (0.5 + 0.5 * Math.cos((Math.PI * d) / 6.5));
  })
);
function truePeak(x: Float32Array) {
  let tp = 0;
  for (let i = 0; i < x.length; i++) tp = Math.max(tp, Math.abs(x[i]));
  for (let i = 5; i < x.length - 6; i++) {
    for (let p = 0; p < 3; p++) {
      const h = TP[p]; let s = 0;
      for (let j = 0; j < 12; j++) s += h[j] * x[i - 5 + j];
      const v = Math.abs(s); if (v > tp) tp = v;
    }
  }
  return tp;
}

function spectrumOf(chs: Float32Array[], fs: number) {
  const N = 4096, n = chs[0].length, half = N / 2;
  const win = new Float64Array(N); let S = 0;
  for (let i = 0; i < N; i++) { win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N); S += win[i]; }
  const hop = Math.max(N / 2, Math.floor((n - N) / 800));
  const pow = new Float64Array(half); let frames = 0;
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let s = 0; s + N <= n; s += hop) {
    for (let i = 0; i < N; i++) {
      let v = 0; for (const c of chs) v += c[s + i];
      re[i] = (v / chs.length) * win[i]; im[i] = 0;
    }
    fft(re, im);
    for (let k = 0; k < half; k++) pow[k] += re[k] * re[k] + im[k] * im[k];
    frames++;
  }
  const k2 = 4 / (S * S), bin = fs / N;
  const P = (k: number) => (pow[Math.min(half - 1, Math.max(1, k))] / Math.max(1, frames)) * k2;
  const spectrum: { f: number; db: number }[] = [];
  const fMax = Math.min(20000, fs / 2 - 1);
  for (let i = 0; i < 240; i++) {
    const f = 20 * Math.pow(fMax / 20, i / 239);
    const lo = Math.round((f * 0.9439) / bin), hi = Math.round((f * 1.0595) / bin);
    let sum = 0, c = 0;
    for (let k = lo; k <= Math.max(lo, hi); k++) { sum += P(k); c++; }
    spectrum.push({ f, db: 10 * Math.log10(sum / c + 1e-14) });
  }
  const edges = [20, 60, 150, 400, 1000, 2500, 6000, 12000, 20000];
  const names = ["Sub", "Graves", "Low-mid", "Medios", "Upper-mid", "Presencia", "Brillo", "Aire"];
  const bands = names.map((name, b) => {
    let e = 0;
    for (let k = Math.ceil(edges[b] / bin); k < Math.min(half, Math.ceil(edges[b + 1] / bin)); k++) e += P(k);
    return { name, range: `${edges[b]}–${edges[b + 1]} Hz`, db: 10 * Math.log10(e + 1e-14) };
  });
  return { spectrum, bands };
}

function spectrogramOf(chs: Float32Array[], fs: number) {
  const N = 4096, cols = 320, rows = 110, n = chs[0].length;
  const win = new Float64Array(N); let S = 0;
  for (let i = 0; i < N; i++) { win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N); S += win[i]; }
  const re = new Float64Array(N), im = new Float64Array(N), data = new Float32Array(cols * rows);
  const bin = fs / N, fMax = Math.min(20000, fs / 2 - 1), k2 = 4 / (S * S);
  for (let c = 0; c < cols; c++) {
    const s = Math.floor((c * Math.max(0, n - N)) / (cols - 1));
    for (let i = 0; i < N; i++) {
      let v = 0; if (s + i < n) for (const ch of chs) v += ch[s + i];
      re[i] = (v / chs.length) * win[i]; im[i] = 0;
    }
    fft(re, im);
    for (let r = 0; r < rows; r++) {
      const f = 20 * Math.pow(fMax / 20, r / (rows - 1));
      const lo = Math.max(1, Math.round((f * 0.966) / bin)), hi = Math.max(lo, Math.round((f * 1.035) / bin));
      let p = 0; for (let k = lo; k <= hi; k++) p += re[k] * re[k] + im[k] * im[k];
      data[c * rows + r] = 10 * Math.log10((p / (hi - lo + 1)) * k2 + 1e-14);
    }
  }
  return { data, cols, rows };
}

function vectorOf(l: Float32Array, r: Float32Array) {
  const bursts = 40, len = 100, out = new Float32Array(bursts * len * 2);
  for (let b = 0; b < bursts; b++) {
    const s = Math.floor((b * Math.max(0, l.length - len)) / (bursts - 1));
    for (let i = 0; i < len; i++) {
      const a = l[s + i] ?? 0, c = r[s + i] ?? 0, o = (b * len + i) * 2;
      out[o] = (a - c) * Math.SQRT1_2; out[o + 1] = (a + c) * Math.SQRT1_2;
    }
  }
  return out;
}

export async function analyze(buf: Input, onProgress: (msg: string) => void): Promise<Analysis> {
  const fs = buf.sampleRate, n = buf.length;
  const chs = buf.chs;
  const wt = (i: number) => (chs.length >= 6 ? [1, 1, 1, 0, 1.41, 1.41][i] ?? 1 : chs.length >= 3 ? (i < 3 ? 1 : 1.41) : 1);

  onProgress("Midiendo niveles…");
  await tick();
  let peak = 0, sq = 0, sum = 0, ll = 0, rr = 0, lr = 0, clips = 0, mm = 0, ss = 0;
  for (const c of chs) for (let i = 0; i < n; i++) { const v = c[i]; const a = Math.abs(v); if (a > peak) peak = a; if (a >= 0.9999) clips++; sq += v * v; sum += v; }
  if (chs.length >= 2) for (let i = 0; i < n; i++) { ll += chs[0][i] ** 2; rr += chs[1][i] ** 2; lr += chs[0][i] * chs[1][i]; const m = (chs[0][i] + chs[1][i]) / 2, d = (chs[0][i] - chs[1][i]) / 2; mm += m * m; ss += d * d; }
  const rms = Math.sqrt(sq / (n * chs.length));

  onProgress("Calculando true peak (4x)…");
  await tick();
  let tp = 0;
  for (const c of chs) { tp = Math.max(tp, truePeak(c)); await tick(); }

  onProgress("Calculando LUFS (EBU R128)…");
  await tick();
  const segLen = Math.round(0.1 * fs), segs = new Float64Array(Math.floor(n / segLen));
  for (let ci = 0; ci < chs.length; ci++) {
    const w = wt(ci); if (!w) continue;
    const y = kWeight(chs[ci], fs);
    for (let i = 0; i < segs.length * segLen; i++) segs[Math.floor(i / segLen)] += w * y[i] * y[i];
    await tick();
  }
  const mom: number[] = [], short: number[] = [];
  for (let k = 0; k + 4 <= segs.length; k++) mom.push((segs[k] + segs[k + 1] + segs[k + 2] + segs[k + 3]) / (4 * segLen));
  for (let k = 0; k + 30 <= segs.length; k += 10) {
    let s = 0; for (let j = 0; j < 30; j++) s += segs[k + j];
    short.push(s / (30 * segLen));
  }
  const stride = Math.max(1, Math.ceil(mom.length / 600)), timeline: number[] = [];
  for (let k = 0; k < mom.length; k += stride) { const w = mom.slice(k, k + stride); timeline.push(lufs(w.reduce((a, b) => a + b, 0) / w.length)); }
  const lufsI = lufs(gate(mom, -10).mean);
  const lv = gate(short, -20).sel.map(lufs).sort((a, b) => a - b);
  const lra = lv.length > 1 ? lv[Math.floor(0.95 * (lv.length - 1))] - lv[Math.floor(0.1 * (lv.length - 1))] : 0;

  onProgress("Calculando espectro…");
  await tick();
  const { spectrum, bands } = spectrumOf(chs, fs);
  onProgress("Detectando tonalidad y BPM…");
  await tick();
  const tonal = detectKey(chs, fs), tempo = detectTempo(chs, fs);
  onProgress("Calculando espectrograma y vectorscopio…");
  await tick();
  const spectrogram = spectrogramOf(chs, fs);
  const vector = chs.length >= 2 ? vectorOf(chs[0], chs[1]) : null;

  const cols = 1200, wave = new Float32Array(cols * 2), step = n / cols;
  for (let x = 0; x < cols; x++) {
    let mn = 0, mx = 0;
    const a = Math.floor(x * step), b = Math.max(a + 1, Math.floor((x + 1) * step));
    for (const c of chs) for (let i = a; i < b; i++) { if (c[i] < mn) mn = c[i]; if (c[i] > mx) mx = c[i]; }
    wave[x * 2] = mn; wave[x * 2 + 1] = mx;
  }

  return {
    duration: buf.duration, sampleRate: fs, channels: buf.numberOfChannels,
    peakDb: toDb(peak), truePeakDb: toDb(tp), rmsDb: toDb(rms), crestDb: toDb(peak) - toDb(rms),
    dc: sum / (n * chs.length),
    correlation: chs.length >= 2 ? lr / Math.sqrt(ll * rr || 1) : null,
    lufsI, lufsMomMax: lufs(Math.max(0, ...mom)), lufsShortMax: lufs(Math.max(0, ...short)), lra,
    clips, midSideDb: chs.length >= 2 ? 10 * Math.log10((ss + 1e-20) / (mm + 1e-20)) : null, timeline,
    wave, spectrum, bands, spectrogram, vector, plr: toDb(tp) - lufsI, tonal, tempo,
  };
}
