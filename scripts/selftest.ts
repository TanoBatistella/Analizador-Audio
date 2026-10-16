import { analyze } from "../src/dsp";
const fs = 48000, n = fs * 10;
const sine = (A: number) => Float32Array.from({ length: n }, (_, i) => A * Math.sin((2 * Math.PI * 997 * i) / fs));
const mk = (chs: Float32Array[]) => ({ sampleRate: fs, length: n, duration: n / fs, numberOfChannels: chs.length, chs });
const A = Math.pow(10, -26 / 20);
const cases: [string, ReturnType<typeof mk>, number, number][] = [
  ["mono 0 dBFS", mk([sine(1)]), -3.01, 0],
  ["estéreo −26 dBFS", mk([sine(A), sine(A)]), -26.0, -26.0],
];
let ok = true;
for (const [name, input, lufs, peak] of cases) {
  const r = await analyze(input, () => {});
  const pass = Math.abs(r.lufsI - lufs) < 0.15 && Math.abs(r.peakDb - peak) < 0.1 && Math.abs(r.truePeakDb - peak) < 0.3;
  ok &&= pass;
  console.log(`${pass ? "OK " : "FALLA"} ${name}: LUFS ${r.lufsI.toFixed(2)} (esperado ${lufs}) · pico ${r.peakDb.toFixed(2)} · TP ${r.truePeakDb.toFixed(2)} · RMS ${r.rmsDb.toFixed(2)}`);
}
import { detectKey, detectTempo } from "../src/tonal";
const sr = 44100;
const chord = (fr: number[], sec: number) => Float32Array.from({ length: sr * sec }, (_, i) => fr.reduce((s, f) => s + [1, .5, .33].reduce((q, a, h) => q + a * Math.sin((2 * Math.PI * f * (h + 1) * i) / sr), 0), 0) * 0.08 * Math.exp(-((i % (sr * 2)) / sr) * 0.3));
const cat = (xs: Float32Array[]) => { const o = new Float32Array(xs.reduce((a, x) => a + x.length, 0)); let p = 0; for (const x of xs) { o.set(x, p); p += x.length; } return o; };
const prog = (ch: number[][]) => cat(Array.from({ length: 4 }, () => cat(ch.map((c) => chord(c, 2)))));
const sum = (...xs: Float32Array[]) => { const o = new Float32Array(xs[0].length); for (const x of xs) for (let i = 0; i < o.length; i++) o[i] += x[i]; return o; };
const beat = (bpm: number, sec = 60, jit = 0.006) => {
  const o = new Float32Array(sr * sec), spb = 60 / bpm;
  const add = (t: number, f: (i: number) => number, len: number) => { const s = Math.round(t * sr); for (let i = 0; i < len && s + i < o.length; i++) o[s + i] += f(i); };
  for (let k = 0; k * spb < sec - 1; k++) {
    const t = k * spb, j = () => (Math.random() - 0.5) * 2 * jit;
    if (k % 4 === 0 || k % 4 === 2) add(t + j(), (i) => Math.sin((2 * Math.PI * (55 + 60 * Math.exp(-i / 900)) * i) / sr) * Math.exp(-i / 3500) * 0.8, 8000);
    if (k % 4 === 1 || k % 4 === 3) add(t + j(), (i) => (Math.random() - 0.5) * Math.exp(-i / 2500) * 0.5, 6000);
    for (const h of [0, 0.5]) add(t + h * spb + j(), (i) => (Math.random() - 0.5) * Math.exp(-i / 500) * 0.25, 2000);
  }
  return o;
};
const drums = beat(100, 32);
const keys: [string, Float32Array, string][] = [
  ["C mayor", prog([[130.81, 164.81, 196], [174.61, 220, 261.63], [196, 246.94, 293.66], [130.81, 164.81, 196]]), "C mayor"],
  ["A menor", prog([[110, 130.81, 164.81], [146.83, 174.61, 220], [164.81, 196, 246.94], [110, 130.81, 164.81]]), "A menor"],
  ["C mayor + bajo + batería", sum(prog([[130.81, 164.81, 196], [174.61, 220, 261.63], [196, 246.94, 293.66], [130.81, 164.81, 196]]), prog([[65.41], [87.31], [98], [65.41]]), drums), "C mayor"],
  ["A menor + bajo + batería", sum(prog([[110, 130.81, 164.81], [146.83, 174.61, 220], [164.81, 196, 246.94], [110, 130.81, 164.81]]), prog([[55], [73.42], [82.41], [55]]), drums), "A menor"],
  ["F♯ menor + batería", sum(prog([[92.5, 110, 138.59], [123.47, 146.83, 185], [110, 138.59, 164.81], [92.5, 110, 138.59]]), prog([[46.25], [61.74], [55], [46.25]]), drums), "F♯ menor"],
];
for (const [n, x, want] of keys) { const t = detectKey([x], sr)!; const p = t.name === want; ok &&= p; console.log(`${p ? "OK " : "FALLA"} key ${n}: ${t.name} (${t.camelot}) conf ${t.confidence.toFixed(2)} acuerdo ${t.agreement.toFixed(2)} bajo ${t.bass}`); }
const mod = cat([prog([[130.81, 164.81, 196], [174.61, 220, 261.63], [196, 246.94, 293.66], [130.81, 164.81, 196]]).slice(0, sr * 16), prog([[185, 233.08, 277.18], [246.94, 311.13, 370], [277.18, 349.23, 415.3], [185, 233.08, 277.18]]).slice(0, sr * 16)]);
const tm = detectKey([mod], sr)!; { const p = tm.agreement <= 0.75; ok &&= p; console.log(`${p ? "OK " : "FALLA"} modulación detectada: acuerdo ${tm.agreement.toFixed(2)} (${tm.segments.join(" ")})`); }
type Pat = { k: number[]; s: number[]; h: number[] };
const groove = (bpm: number, sec: number, p: Pat, swing = 0) => {
  const o = new Float32Array(sr * sec), step = 60 / bpm / 4;
  const add = (t: number, f: (i: number) => number, len: number) => { const s = Math.round(t * sr); for (let i = 0; i < len && s + i < o.length; i++) o[s + i] += f(i); };
  for (let bar = 0; (bar * 16) * step < sec - 1; bar++) for (let st = 0; st < 16; st++) {
    const t = (bar * 16 + st) * step + (st % 2 ? swing * step : 0) + (Math.random() - 0.5) * 0.008;
    if (p.k.includes(st)) add(t, (i) => Math.sin((2 * Math.PI * (50 + 70 * Math.exp(-i / 900)) * i) / sr) * Math.exp(-i / 4500) * 0.9, 9000);
    if (p.s.includes(st)) add(t, (i) => ((Math.random() - 0.5) * 0.6 + Math.sin((2 * Math.PI * 190 * i) / sr) * 0.4) * Math.exp(-i / 2500), 7000);
    if (p.h.includes(st)) add(t, (i) => (Math.random() - 0.5) * Math.exp(-i / 450) * 0.3, 2000);
  }
  return o;
};
const grooves: [string, number, Pat, number][] = [
  ["trap 142", 142, { k: [0, 7, 10], s: [8], h: [0, 2, 4, 6, 8, 10, 12, 13, 14, 15] }, 0],
  ["dembow 95 (riesgo 3:2 = 142)", 95, { k: [0, 4, 8, 12], s: [3, 6, 11, 14], h: [2, 6, 10, 14] }, 0],
  ["house 124", 124, { k: [0, 4, 8, 12], s: [4, 12], h: [2, 6, 10, 14] }, 0],
  ["boom bap 90 con swing", 90, { k: [0, 5, 10], s: [4, 12], h: [0, 2, 4, 6, 8, 10, 12, 14] }, 0.15],
  ["drill 144", 144, { k: [0, 3, 10], s: [8], h: [0, 2, 4, 6, 8, 10, 12, 14] }, 0],
];
for (const [n, b, p, sw] of grooves) {
  const t = detectTempo([groove(b, 60, p, sw)], sr)!; const ok2 = Math.abs(t.bpm - b) < 0.5; ok &&= ok2;
  console.log(`${ok2 ? "OK " : "FALLA"} groove ${n}: ${t.bpm} conf ${t.confidence.toFixed(2)} estab ${t.stability.toFixed(2)} otras lecturas ${t.alts.join("/") || "—"}`);
}
for (const b of [87.5, 95.5, 128, 140]) {
  const t = detectTempo([beat(b)], sr)!; const p = Math.abs(t.bpm - b) < 0.3; ok &&= p;
  console.log(`${p ? "OK " : "FALLA"} BPM ${b}: ${t.bpm} conf ${t.confidence.toFixed(2)} estab ${t.stability.toFixed(2)} 1er pulso ${(t.firstBeat * 1000).toFixed(0)} ms (esperado ≈ 0 o múltiplo de ${(60000 / b).toFixed(0)}) compás ${t.barIndex} variable ${t.variable}`);
}
process.exit(ok ? 0 : 1);
