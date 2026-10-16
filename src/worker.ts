import { analyze } from "./dsp";
import { detectKey, detectTempo } from "./tonal";
self.onmessage = async (e: MessageEvent) => {
  try {
    const d = e.data;
    if (d.mode === "tonal") self.postMessage({ type: "done", r: { duration: d.duration, tonal: detectKey(d.chs, d.sampleRate), tempo: detectTempo(d.chs, d.sampleRate) } });
    else self.postMessage({ type: "done", r: await analyze(d, (m) => self.postMessage({ type: "progress", m })) });
  } catch (err) { self.postMessage({ type: "error", m: String(err) }); }
};
