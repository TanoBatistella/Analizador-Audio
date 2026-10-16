import type { Tonal } from "./tonal";
const MAJ = [0, 2, 4, 5, 7, 9, 11], MIN = [0, 2, 3, 5, 7, 8, 10];
const vlq = (n: number) => { const b = [n & 127]; while ((n >>= 7)) b.unshift((n & 127) | 128); return b; };
const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];

export function makeMidi(t: Tonal, bpm: number, kind: "scale" | "chords") {
  const PPQ = 480, iv = t.minor ? MIN : MAJ, root = 60 + t.pc, iv2 = [...iv, ...iv.map((x) => x + 12)];
  const ev: { tick: number; b: number[] }[] = [];
  const note = (tick: number, len: number, ns: number[]) => ns.forEach((k) => { ev.push({ tick, b: [0x90, k, 96] }); ev.push({ tick: tick + len - 5, b: [0x80, k, 0] }); });
  if (kind === "scale") [...iv, 12].forEach((x, i) => note(i * PPQ, PPQ, [root + x]));
  else iv.forEach((_, i) => note(i * PPQ * 4, PPQ * 4, [iv2[i], iv2[i + 2], iv2[i + 4]].map((x) => root + x)));
  ev.sort((a, b) => a.tick - b.tick);
  const mpq = Math.round(60e6 / bpm), tr: number[] = [0, 0xff, 0x51, 3, (mpq >> 16) & 255, (mpq >> 8) & 255, mpq & 255];
  let last = 0; for (const e of ev) { tr.push(...vlq(e.tick - last), ...e.b); last = e.tick; }
  tr.push(0, 0xff, 0x2f, 0);
  const head = [0x4d, 0x54, 0x68, 0x64, ...u32(6), 0, 0, 0, 1, PPQ >> 8, PPQ & 255];
  return new Blob([new Uint8Array([...head, 0x4d, 0x54, 0x72, 0x6b, ...u32(tr.length), ...tr])], { type: "audio/midi" });
}
