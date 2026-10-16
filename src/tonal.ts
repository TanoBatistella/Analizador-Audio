import { fft } from "./fft";

export interface Tonal {
  pc: number; minor: boolean; name: string; short: string; es: string; camelot: string; confidence: number;
  alts: { name: string; camelot: string; score: number }[];
  chroma: number[]; tuningCents: number; scale: string[];
  chords: { num: string; name: string }[]; compatible: { camelot: string; name: string }[];
  agreement: number; segments: string[]; bass: string; ambiguous: string | null; relative: { name: string; camelot: string };
}
export interface Tempo {
  bpm: number; confidence: number; alts: number[];
  firstBeat: number; barIndex: number; stability: number; variable: boolean;
}

const MAJ_N = ["C", "D♭", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];
const MIN_N = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "G♯", "A", "B♭", "B"];
const FLAT = ["C", "D♭", "D", "E♭", "E", "F", "G♭", "G", "A♭", "A", "B♭", "B"];
const SHARP = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
const SOL: Record<string, string> = { C: "Do", D: "Re", E: "Mi", F: "Fa", G: "Sol", A: "La", B: "Si" };
const MAJ = [0, 2, 4, 5, 7, 9, 11], MIN = [0, 2, 3, 5, 7, 8, 10];
const MAJ_Q = ["", "m", "m", "", "", "m", "dim"], MIN_Q = ["m", "dim", "", "m", "m", "", ""];
const MAJ_R = ["I", "ii", "iii", "IV", "V", "vi", "vii°"], MIN_R = ["i", "ii°", "III", "iv", "v", "VI", "VII"];
const PROF = [
  [[6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88], [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]],
  [[5, 2, 3.5, 2, 4.5, 4, 2, 4.5, 2, 3.5, 1.5, 4], [5, 2, 3.5, 4.5, 2, 4, 2, 4.5, 3.5, 2, 1.5, 4]],
  [[17.7661, 0.145624, 14.9265, 0.160186, 19.8049, 11.3587, 0.291248, 22.062, 0.145624, 8.15494, 0.232998, 18.6691], [18.2648, 0.737619, 14.0502, 16.8608, 0.702494, 14.4362, 0.702494, 18.6161, 4.56621, 1.93186, 7.37619, 1.75623]],
  [[0.238, 0.006, 0.111, 0.006, 0.137, 0.094, 0.016, 0.214, 0.009, 0.08, 0.008, 0.081], [0.22, 0.006, 0.104, 0.123, 0.019, 0.103, 0.012, 0.214, 0.062, 0.022, 0.061, 0.052]],
];

const rootName = (pc: number, minor: boolean) => (minor ? MIN_N : MAJ_N)[pc];
const modeEs = (m: boolean) => (m ? "menor" : "mayor");
const camelotOf = (pc: number, minor: boolean) => `${((7 * (minor ? (pc + 3) % 12 : pc) + 7) % 12) + 1}${minor ? "A" : "B"}`;
const nameOf = (pc: number, minor: boolean) => `${rootName(pc, minor)} ${modeEs(minor)}`;
const useFlat = (pc: number, minor: boolean) => (minor ? [2, 7, 0, 5, 10, 3] : [5, 10, 3, 8, 1]).includes(pc);
const BY: Record<string, { pc: number; minor: boolean }> = {};
for (const minor of [false, true]) for (let pc = 0; pc < 12; pc++) BY[camelotOf(pc, minor)] = { pc, minor };
export const keyLabel = nameOf;

export function describeKey(pc: number, minor: boolean) {
  const names = useFlat(pc, minor) ? FLAT : SHARP;
  const scale = (minor ? MIN : MAJ).map((i) => names[(pc + i) % 12]);
  const num = parseInt(camelotOf(pc, minor)), L = minor ? "A" : "B";
  const comp = [`${num}${minor ? "B" : "A"}`, `${((num + 10) % 12) + 1}${L}`, `${(num % 12) + 1}${L}`];
  const root = rootName(pc, minor);
  return {
    pc, minor, name: nameOf(pc, minor), short: root + (minor ? "m" : ""), es: SOL[root[0]] + root.slice(1) + " " + modeEs(minor),
    camelot: camelotOf(pc, minor), scale,
    chords: scale.map((r, i) => ({ num: (minor ? MIN_R : MAJ_R)[i], name: r + (minor ? MIN_Q : MAJ_Q)[i] })),
    compatible: comp.map((c) => ({ camelot: c, name: nameOf(BY[c].pc, BY[c].minor) })),
    relative: minor ? { name: nameOf((pc + 3) % 12, false), camelot: camelotOf((pc + 3) % 12, false) } : { name: nameOf((pc + 9) % 12, true), camelot: camelotOf((pc + 9) % 12, true) },
  };
}
function pearson(a: number[], b: number[]) {
  const ma = a.reduce((x, y) => x + y, 0) / 12, mb = b.reduce((x, y) => x + y, 0) / 12;
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < 12; i++) { sab += (a[i] - ma) * (b[i] - mb); saa += (a[i] - ma) ** 2; sbb += (b[i] - mb) ** 2; }
  return sab / Math.sqrt(saa * sbb || 1);
}
const hann = (N: number) => Float64Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const rot = (p: number[], t: number) => Array.from({ length: 12 }, (_, i) => p[(i - t + 12) % 12]);
const parab = (a: number, b: number, c: number) => { const den = a - 2 * b + c; return den ? clamp((0.5 * (a - c)) / den, -0.5, 0.5) : 0; };

function bassChroma(chs: Float32Array[], fs: number, d: number) {
  const N = 16384, n = chs[0].length, nc = Math.min(2, chs.length), out = Array(12).fill(0);
  if (n < N * 2) return out;
  const hop = Math.max(N / 2, Math.floor((n - N) / 300)), win = hann(N);
  const re = new Float64Array(N), im = new Float64Array(N);
  const lo = Math.ceil((35 * N) / fs), hi = Math.floor((260 * N) / fs), mg = new Float64Array(hi + 2);
  for (let s = 0; s + N <= n; s += hop) {
    for (let i = 0; i < N; i++) { let x = 0; for (let c = 0; c < nc; c++) x += chs[c][s + i]; re[i] = (x / nc) * win[i]; im[i] = 0; }
    fft(re, im);
    let mx = 0;
    for (let j = lo - 1; j <= hi + 1; j++) { mg[j] = Math.hypot(re[j], im[j]); if (mg[j] > mx) mx = mg[j]; }
    if (mx < 1) continue;
    for (let j = lo; j <= hi; j++) if (mg[j] > mg[j - 1] && mg[j] >= mg[j + 1] && mg[j] > 0.15 * mx) {
      const p = 69 + 12 * Math.log2((((j + parab(mg[j - 1], mg[j], mg[j + 1])) * fs) / N) / 440) - d / 3;
      out[((Math.round(p) % 12) + 12) % 12] += mg[j] / mx;
    }
  }
  const m = Math.max(...out) || 1;
  return out.map((x) => x / m);
}

export function detectKey(chs: Float32Array[], fs: number): Tonal | null {
  const N = 4096, n = chs[0].length, nc = Math.min(2, chs.length), S = 6;
  if (n < N * 8) return null;
  const hop = Math.max(N, Math.floor((n - N) / 2400)), F = Math.floor((n - N) / hop) + 1;
  const kLo = Math.max(3, Math.ceil((60 * N) / fs)), kHi = Math.min(N / 2 - 3, Math.floor((2500 * N) / fs)), B = kHi - kLo + 3;
  const win = hann(N), re = new Float64Array(N), im = new Float64Array(N), M = new Float32Array(F * B);
  for (let f = 0; f < F; f++) {
    const s = f * hop;
    for (let i = 0; i < N; i++) { let x = 0; for (let c = 0; c < nc; c++) x += chs[c][s + i]; re[i] = (x / nc) * win[i]; im[i] = 0; }
    fft(re, im);
    for (let j = 0; j < B; j++) M[f * B + j] = Math.hypot(re[kLo - 1 + j], im[kLo - 1 + j]);
  }
  const H = new Float32Array(F * B), w7 = new Array<number>(7);
  for (let f = 0; f < F; f++) for (let j = 0; j < B; j++) {
    for (let q = -3; q <= 3; q++) w7[q + 3] = M[clamp(f + q, 0, F - 1) * B + j];
    w7.sort((a, b) => a - b); H[f * B + j] = w7[3];
  }
  const vs = Array.from({ length: S }, () => new Float64Array(36));
  for (let f = 0; f < F; f++) {
    let mx = 0; for (let j = 0; j < B; j++) if (H[f * B + j] > mx) mx = H[f * B + j];
    if (mx < 0.5) continue;
    const v = vs[Math.min(S - 1, Math.floor((f * S) / F))];
    for (let j = 1; j < B - 1; j++) {
      const b = H[f * B + j], a = H[f * B + j - 1], c = H[f * B + j + 1];
      if (b > a && b >= c && b > 0.05 * mx) {
        const pos = Math.round((69 + 12 * Math.log2((((kLo - 1 + j + parab(a, b, c)) * fs) / N) / 440)) * 3);
        v[((pos % 36) + 36) % 36] += Math.log1p(b * 0.05);
      }
    }
  }
  const tot = new Float64Array(36); for (const v of vs) for (let i = 0; i < 36; i++) tot[i] += v[i];
  if (!tot.some((x) => x > 0)) return null;
  const en = (d: number) => { let e = 0; for (let s = 0; s < 12; s++) e += tot[(3 * s + d + 36) % 36]; return e; };
  let d = 0; for (const c of [-1, 1]) if (en(c) > en(d) * 1.1) d = c;
  const fold = (v: Float64Array) => {
    const c = Array.from({ length: 12 }, (_, s) => v[(3 * s + d + 35) % 36] + v[(3 * s + d + 36) % 36] + v[(3 * s + d + 37) % 36]);
    const m = Math.max(...c) || 1; return c.map((x) => x / m);
  };
  const chroma = fold(tot), bass = bassChroma(chs, fs, d);
  const score = (c: number[], pc: number, minor: boolean) => {
    const corr = PROF.reduce((a, p) => a + pearson(c, rot(p[minor ? 1 : 0], pc)), 0) / PROF.length;
    const sc = minor ? MIN : MAJ; let t = 0, ins = 0;
    c.forEach((x, i) => { t += x; if (sc.includes((i - pc + 12) % 12)) ins += x; });
    const triad = (c[pc] + c[(pc + (minor ? 3 : 4)) % 12] + c[(pc + 7) % 12]) / 3;
    return 0.5 * corr + 0.2 * clamp((ins / (t || 1) - 0.583) / 0.417) + 0.15 * triad + 0.15 * bass[pc];
  };
  const rank = (c: number[]) => {
    const all: { pc: number; minor: boolean; score: number }[] = [];
    for (const minor of [false, true]) for (let pc = 0; pc < 12; pc++) all.push({ pc, minor, score: score(c, pc, minor) });
    return all.sort((a, b) => b.score - a.score);
  };
  const all = rank(chroma), [best, second] = all, { pc, minor } = best;
  const segKeys = vs.filter((v) => v.some((x) => x > 0)).map((v) => rank(fold(v))[0]);
  const agreement = segKeys.length ? segKeys.filter((k) => k.pc === pc && k.minor === minor).length / segKeys.length : 0;
  const nm = useFlat(pc, minor) ? FLAT : SHARP, bassPc = bass.indexOf(Math.max(...bass));
  const rel = all.find((k) => k.minor !== minor && camelotOf(k.pc, k.minor).slice(0, -1) === camelotOf(pc, minor).slice(0, -1))!;
  return {
    ...describeKey(pc, minor),
    confidence: clamp((best.score - second.score) / 0.1) * 0.35 + clamp((best.score - 0.35) / 0.4) * 0.25 + agreement * 0.4,
    alts: all.slice(1, 4).map((k) => ({ name: nameOf(k.pc, k.minor), camelot: camelotOf(k.pc, k.minor), score: k.score })),
    chroma, tuningCents: Math.round(d * 33.3), agreement,
    segments: segKeys.map((k) => rootName(k.pc, k.minor) + (k.minor ? "m" : "")),
    bass: bass.some((x) => x > 0) ? nm[bassPc] : "—",
    ambiguous: best.score - rel.score < 0.1 ? nameOf(rel.pc, rel.minor) : null,
  };
}

const LAT = -0.005;

export function detectTempo(chs: Float32Array[], fs: number): Tempo | null {
  const n = chs[0].length, win = Math.min(n, Math.floor(180 * fs)), a0 = Math.floor((n - win) / 2);
  const N = 1024, hop = 256, frames = Math.floor((win - N) / hop), nc = Math.min(2, chs.length);
  if (frames < 1000) return null;
  const w = hann(N), re = new Float64Array(N), im = new Float64Array(N), prev = new Float64Array(N / 2);
  const ed = [30, 150, 2500, 10000].map((f) => Math.min(N / 2 - 1, Math.max(1, Math.round((f * N) / fs))));
  const raw = [0, 1, 2].map(() => new Float64Array(frames));
  for (let f = 0; f < frames; f++) {
    const s = a0 + f * hop;
    for (let i = 0; i < N; i++) { let x = 0; for (let c = 0; c < nc; c++) x += chs[c][s + i]; re[i] = (x / nc) * w[i]; im[i] = 0; }
    fft(re, im);
    for (let b = 0; b < 3; b++) {
      let fl = 0;
      for (let k = ed[b]; k < ed[b + 1]; k++) { const m = Math.log1p(10 * Math.hypot(re[k], im[k])); fl += Math.max(0, m - prev[k]); prev[k] = m; }
      raw[b][f] = fl;
    }
  }
  const fps = fs / hop, half = Math.round(fps * 0.25);
  const prep = (x: Float64Array) => {
    const P = new Float64Array(frames + 1), e = new Float64Array(frames); let ss = 0;
    for (let i = 0; i < frames; i++) P[i + 1] = P[i] + x[i];
    for (let i = 0; i < frames; i++) { const lo = Math.max(0, i - half), hi = Math.min(frames, i + half + 1); e[i] = Math.max(0, x[i] - (P[hi] - P[lo]) / (hi - lo)); ss += e[i] * e[i]; }
    const r = Math.sqrt(ss / frames) || 1; for (let i = 0; i < frames; i++) e[i] /= r;
    return e;
  };
  const eb = raw.map(prep), env = new Float64Array(frames);
  for (let i = 0; i < frames; i++) env[i] = eb[0][i] + eb[1][i] + eb[2][i];

  const bufS = new Float64Array(2048), bufC = new Int32Array(2048);
  const fold = (x: Float64Array, s: number, e: number, per: number, beats: number) => {
    const nb = Math.min(2048, Math.max(8, Math.round(per * beats))), step = nb / (per * beats), len = e - s;
    bufS.fill(0, 0, nb); bufC.fill(0, 0, nb);
    let tot = 0, tot2 = 0;
    for (let i = s; i < e; i++) { const v = x[i]; tot += v; tot2 += v * v; const q = Math.floor(((i - s) * step) % nb); bufS[q] += v; bufC[q]++; }
    const m = tot / len, sst = tot2 - len * m * m; let ssb = -len * m * m;
    for (let q = 0; q < nb; q++) if (bufC[q]) ssb += (bufS[q] * bufS[q]) / bufC[q];
    const r2 = sst > 1e-9 ? clamp(ssb / sst) : 0;
    return { adj: 1 - ((1 - r2) * (len - 1)) / Math.max(1, len - nb), nb, m };
  };

  const GB = 48, coll = new Float64Array(GB);
  const gridFit = (nb: number, m: number) => {
    coll.fill(0); let tot = 0;
    for (let q = 0; q < nb; q++) if (bufC[q]) {
      const e = bufS[q] / bufC[q] - m;
      if (e > 0) { coll[Math.floor(((((q + 0.5) / nb) * 4) % 1) * GB)] += e; tot += e; }
    }
    if (tot <= 0) return 0;
    let best = 0;
    for (let p = 0; p < GB; p++) { let on = 0; for (let g = 0; g < 4; g++) for (let d = -2; d <= 2; d++) on += coll[(p + 12 * g + d + GB) % GB]; if (on > best) best = on; }
    return best / tot;
  };
  const profile = (x: Float64Array, per: number, beats: number) => {
    const { nb } = fold(x, 0, frames, per, beats);
    return Float64Array.from({ length: nb }, (_, q) => (bufC[q] ? bufS[q] / bufC[q] : 0));
  };
  const pe = new Float64Array(frames + 1);
  for (let i = 0; i < frames; i++) pe[i + 1] = pe[i] + env[i];
  const W1 = Math.min(frames, Math.round(60 * fps));
  let s1 = 0; for (let s = 0; s + W1 <= frames; s += Math.round(fps)) if (pe[s + W1] - pe[s] > pe[s1 + W1] - pe[s1]) s1 = s;
  const prior = (b: number) => Math.exp(-0.5 * (Math.log2(b / 110) / 0.9) ** 2);
  const sb: number[] = [], sv: number[] = [];
  for (let b = 60; b <= 200; b *= 1.00014) {
    const f = fold(env, s1, s1 + W1, (fps * 60) / b, 4), g = clamp((gridFit(f.nb, f.m) - 0.42) / 0.5);
    sb.push(b); sv.push(Math.max(0, f.adj) * prior(b) * (0.35 + 0.65 * g));
  }
  const R = 143, peaks: { b: number; v: number }[] = [];
  for (let i = 0; i < sv.length; i++) {
    let ok = sv[i] > 0;
    for (let j = Math.max(0, i - R); ok && j <= Math.min(sv.length - 1, i + R); j++) if (sv[j] > sv[i] || (sv[j] === sv[i] && j < i)) ok = false;
    if (ok) peaks.push({ b: sb[i], v: sv[i] });
  }
  peaks.sort((a, b) => b.v - a.v);
  if (!peaks.length) return null;
  const best = peaks[0]; let final = best.b, fa = -1;
  for (let b = best.b * 0.9975; b <= best.b * 1.0025; b += best.b * 2e-5) { const a = fold(env, 0, frames, (fps * 60) / b, 4).adj; if (a > fa) { fa = a; final = b; } }
  const per = (fps * 60) / final;
  const wl = Math.round(30 * fps), wh = Math.round(15 * fps), wa: number[] = [];
  let maxE = 0; for (let s = 0; s + wl <= frames; s += wh) maxE = Math.max(maxE, pe[s + wl] - pe[s]);
  for (let s = 0; s + wl <= frames; s += wh) if (pe[s + wl] - pe[s] > 0.2 * maxE) wa.push(fold(env, s, s + wl, per, 4).adj);
  const wAdj = wa.length ? wa.reduce((a, b) => a + b, 0) / wa.length : fa;
  const stability = wAdj > 0.02 ? clamp(fa / wAdj) : 0.5;
  const lm = Float64Array.from(env, (v, i) => v - eb[2][i]), pb = profile(lm, per, 1);
  let ph = 0, pv = -1;
  for (let q = 0; q < pb.length; q++) { const v = pb[q] + 0.5 * (pb[(q + 1) % pb.length] + pb[(q - 1 + pb.length) % pb.length]); if (v > pv) { pv = v; ph = q; } }
  const phF = ((ph + 0.5) / pb.length) * per, pl = profile(eb[0], per, 4);
  let jb = 0, jv = -1;
  for (let j = 0; j < 4; j++) {
    const c = Math.floor((((phF + j * per) % (4 * per)) / (4 * per)) * pl.length); let v = 0;
    for (let q = -2; q <= 2; q++) v += pl[(c + q + pl.length) % pl.length];
    if (v > jv) { jv = v; jb = j; }
  }
  const beatS = 60 / final, barS = 4 * beatS, tAbs = (a0 + (phF + jb * per) * hop + N / 2) / fs - LAT, tMod = ((tAbs % barS) + barS) % barS;
  const barIndex = Math.floor(tMod / beatS), r2 = (x: number) => Math.round(x * 100) / 100;
  const rival = peaks.slice(1).find((p) => ![0.5, 2].some((r) => Math.abs(p.b / (final * r) - 1) < 0.03)); 
  return {
    bpm: r2(final), alts: peaks.slice(1).filter((p) => p.v >= 0.7 * best.v && Math.abs(p.b / final - 1) > 0.03).slice(0, 3).map((p) => Math.round(p.b * 10) / 10),
    confidence: clamp(0.45 * clamp(fa / 0.15) + 0.25 * stability + 0.3 * clamp((rival ? 1 - rival.v / best.v : 1) / 0.4)),
    firstBeat: tMod - barIndex * beatS, barIndex, stability, variable: wAdj > 0.12 && stability < 0.5,
  };
}
