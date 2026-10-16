import { useEffect, useMemo, useRef, useState } from "react";
import type { Analysis } from "./dsp";
import { runAnalysis, runTonal } from "./engine";
import { BeatsTable, KeyBpmPanel, type Beat } from "./KeyBpm";
import { diagnose } from "./diagnose";
import { ABPlayer } from "./ABPlayer";
import type { Tempo } from "./tonal";

const gridOf = (t: Tempo | null) => (t && t.bpm > 0 ? { first: t.firstBeat, period: 60 / t.bpm, db: t.barIndex } : null);

type Track = { name: string; a: Analysis };
type Kind = "mix" | "ref";
const f1 = (x: number, u = "") => (Number.isFinite(x) ? x.toFixed(1) + u : "−∞");
const sgn = (x: number, u = "") => (Number.isFinite(x) ? (x > 0 ? "+" : "") + x.toFixed(1) + u : "—");
const time = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const TARGETS = [["Spotify", -14], ["YouTube", -14], ["Apple Music", -16], ["Club / master fuerte", -9]] as const;

function Stat({ label, value, hint, warn }: { label: string; value: string; hint?: string; warn?: boolean }) {
  return (
    <div className={"stat" + (warn ? " warn" : "")}>
      <span className="lbl">{label}</span><b>{value}</b>{hint && <small>{hint}</small>}
    </div>
  );
}
const Group = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <><h3>{title}</h3><div className="grid">{children}</div></>
);

function DropZone({ title, name, busy, onFiles, multiple, hint }: { title: string; name?: string; busy: string; onFiles: (f: File[]) => void; multiple?: boolean; hint?: string }) {
  return (
    <label className={"drop" + (busy ? " busy" : "")} onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); const f = [...e.dataTransfer.files]; if (f.length) onFiles(multiple ? f : f.slice(0, 1)); }}>
      <input type="file" multiple={multiple} accept="audio/*,.flac,.wav,.mp3,.ogg,.aac,.m4a" hidden
        onChange={(e) => { const f = [...(e.target.files ?? [])]; e.target.value = ""; if (f.length) onFiles(f); }} />
      <b>{title}</b>
      <span>{busy || name || hint || "Arrastrá un archivo o hacé clic para elegirlo"}</span>
    </label>
  );
}

function Waveform({ a, progress, onSeek, grid }: { a: Analysis; progress: number; onSeek: (p: number) => void; grid: { first: number; period: number; db: number } | null }) {
  const d = useMemo(() => {
    let s = "";
    for (let x = 0; x < a.wave.length / 2; x++) {
      const y1 = 50 - a.wave[x * 2 + 1] * 48, y2 = 50 - a.wave[x * 2] * 48;
      s += `M${x},${y1.toFixed(1)}V${Math.max(y2, y1 + 0.4).toFixed(1)}`;
    }
    return s;
  }, [a]);
  const g = useMemo(() => {
    if (!grid) return "";
    let s = "";
    for (let t = grid.first, k = 0; t < a.duration; t += grid.period, k++) s += `M${((t / a.duration) * 1200).toFixed(1)},${(((k - grid.db) % 4) + 4) % 4 ? 88 : 70}V100`;
    return s;
  }, [grid, a.duration]);
  return (
    <div className="wave" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); onSeek((e.clientX - r.left) / r.width); }}>
      <svg viewBox="0 0 1200 100" preserveAspectRatio="none" aria-label="Forma de onda">
        <path d={d} stroke="currentColor" strokeWidth="1" fill="none" />
        {g && <path d={g} className="beatgrid" />}
      </svg>
      <i style={{ left: progress * 100 + "%" }} />
    </div>
  );
}

function Loudness({ a }: { a: Analysis }) {
  const pts = a.timeline, X = (i: number) => (i / Math.max(1, pts.length - 1)) * 1000;
  const Y = (v: number) => 200 - ((Math.min(0, Math.max(-60, Number.isFinite(v) ? v : -60)) + 60) / 60) * 200;
  const line = pts.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join("");
  return (
    <svg className="spec" viewBox="0 0 1000 220" role="img" aria-label="Loudness en el tiempo">
      {[-6, -12, -23, -36, -48].map((v) => <g key={v}><line x1="0" x2="1000" y1={Y(v)} y2={Y(v)} className="grid" /><text x="4" y={Y(v) - 3}>{v}</text></g>)}
      <line x1="0" x2="1000" y1={Y(a.lufsI)} y2={Y(a.lufsI)} className="ref" />
      <path d={line} className="line" />
    </svg>
  );
}

function Spectrum({ a, r, off }: { a: Analysis; r?: Analysis; off: number }) {
  const top = Math.max(...a.spectrum.map((p) => p.db), ...(r ? r.spectrum.map((p) => p.db + off) : [-200])) + 3, bottom = top - 80;
  const X = (f: number) => (Math.log10(f / 20) / 3) * 1000;
  const Y = (db: number) => 300 - ((Math.max(db, bottom) - bottom) / (top - bottom)) * 300;
  const path = (s: Analysis["spectrum"], o: number) => s.map((p, i) => `${i ? "L" : "M"}${X(p.f).toFixed(1)},${Y(p.db + o).toFixed(1)}`).join("");
  return (
    <svg className="spec" viewBox="0 0 1000 320" role="img" aria-label="Espectro de frecuencias">
      {[0, 20, 40, 60].map((o) => <line key={o} x1="0" x2="1000" y1={Y(top - 3 - o)} y2={Y(top - 3 - o)} className="grid" />)}
      {[50, 100, 200, 500, 1000, 2000, 5000, 10000].map((f) => (
        <g key={f}><line x1={X(f)} x2={X(f)} y1="0" y2="300" className="grid" /><text x={X(f) + 3} y="316">{f >= 1000 ? f / 1000 + "k" : f}</text></g>
      ))}
      <path d={`${path(a.spectrum, 0)}L1000,300L0,300Z`} className="fill" />
      <path d={path(a.spectrum, 0)} className="line" />
      {r && <path d={path(r.spectrum, off)} className="line refc" />}
    </svg>
  );
}

function Spectrogram({ a }: { a: Analysis }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const { data, cols, rows } = a.spectrogram, c = ref.current!;
    c.width = cols; c.height = rows;
    const ctx = c.getContext("2d")!, img = ctx.createImageData(cols, rows);
    let mx = -Infinity; for (const v of data) if (v > mx) mx = v;
    const cl = (x: number) => Math.min(1, Math.max(0, x));
    for (let x = 0; x < cols; x++) for (let y = 0; y < rows; y++) {
      const t = cl((data[x * rows + y] - (mx - 80)) / 80), o = ((rows - 1 - y) * cols + x) * 4;
      img.data[o] = 10 + 245 * cl((t - 0.45) * 2); img.data[o + 1] = 18 + 237 * cl((t - 0.2) * 1.4);
      img.data[o + 2] = 26 + 170 * Math.sin(Math.PI * cl(t * 1.15)) * (1 - 0.7 * cl((t - 0.75) * 4)); img.data[o + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }, [a]);
  return (
    <div className="spgm">
      <canvas ref={ref} aria-label="Espectrograma" />
      {[100, 1000, 10000].map((f) => <span key={f} style={{ bottom: (Math.log10(f / 20) / 3) * 100 + "%" }}>{f >= 1000 ? f / 1000 + "k" : f}</span>)}
    </div>
  );
}

function Vectorscope({ v }: { v: Float32Array }) {
  const d = useMemo(() => {
    let m = 1e-6; for (const x of v) m = Math.max(m, Math.abs(x));
    const k = 92 / m; let s = "";
    for (let i = 0; i < v.length; i += 2) s += `M${(100 + v[i] * k).toFixed(1)},${(100 - v[i + 1] * k).toFixed(1)}h.1`;
    return s;
  }, [v]);
  return (
    <svg className="vec" viewBox="0 0 200 206" role="img" aria-label="Vectorscopio estéreo">
      <circle cx="100" cy="100" r="92" className="grid" />
      <path d="M100 8V192M8 100H192M35 35L165 165M35 165L165 35" className="grid" />
      <text x="96" y="6">M</text><text x="14" y="30">L</text><text x="180" y="30">R</text>
      <path d={d} className="dots" />
    </svg>
  );
}

export default function App() {
  const [mix, setMix] = useState<Track | null>(null);
  const [ref, setRef] = useState<Track | null>(null);
  const [busy, setBusy] = useState({ mix: "", ref: "", beat: "" });
  const [err, setErr] = useState("");
  const [url, setUrl] = useState("");
  const [prog, setProg] = useState(0);
  const [norm, setNorm] = useState(true);
  const [beats, setBeats] = useState<Beat[]>(() => { try { return JSON.parse(localStorage.getItem("aa.beats.v3") ?? "[]"); } catch { return []; } });
  const [selId, setSelId] = useState(-1);
  const [showGrid, setShowGrid] = useState(false);
  const [refUrl, setRefUrl] = useState("");
  const [click, setClick] = useState(false);
  const audio = useRef<HTMLAudioElement>(null);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  useEffect(() => () => { if (refUrl) URL.revokeObjectURL(refUrl); }, [refUrl]);
  useEffect(() => { try { localStorage.setItem("aa.beats.v3", JSON.stringify(beats)); } catch { /* sin almacenamiento */ } }, [beats]);

  async function load(kind: Kind, file: File) {
    setErr("");
    const set = (m: string) => setBusy((b) => ({ ...b, [kind]: m }));
    if (file.size > 250 * 1024 * 1024) { setErr("El archivo supera los 250 MB. Probá con una versión comprimida (MP3 o FLAC)."); return; }
    set("Leyendo archivo…");
    try {
      const a = await runAnalysis(file, set);
      if (kind === "mix") { setUrl(URL.createObjectURL(file)); setProg(0); setClick(false); setMix({ name: file.name, a }); }
      else { setRefUrl(URL.createObjectURL(file)); setRef({ name: file.name, a }); }
    } catch { setErr("No pude leer ese archivo. Probá con WAV, MP3, FLAC, OGG o AAC."); }
    finally { set(""); }
  }

  async function loadBeats(files: File[]) {
    setErr("");
    for (let i = 0; i < files.length; i++) {
      const f = files[i], pre = files.length > 1 ? `(${i + 1}/${files.length}) ` : "";
      const set = (m: string) => setBusy((b) => ({ ...b, beat: `${pre}${f.name}: ${m}` }));
      set("leyendo…");
      try {
        const r = await runTonal(f, set), id = Date.now() + i;
        setBeats((bs) => [...bs, { id, name: f.name, ...r }]); setSelId(id);
      } catch { setErr(`No pude leer ${f.name}. Probá con WAV, MP3, FLAC, OGG o AAC.`); }
    }
    setBusy((b) => ({ ...b, beat: "" }));
  }

  const a = mix?.a, r = ref?.a;
  const mT = a?.tonal ?? null, mTe = a?.tempo ?? null;
  const beatSrc: Beat | null = beats.find((b) => b.id === selId) ?? beats[beats.length - 1] ?? (mix ? { id: -1, name: mix.name, duration: mix.a.duration, tonal: mT, tempo: mTe } : null);

  useEffect(() => {
    const g = click ? gridOf(mTe) : null;
    if (!g) return;
    const ctx = new AudioContext(); ctx.resume();
    let lastK = -Infinity, lastT = -1;
    const id = setInterval(() => {
      const el = audio.current;
      if (!el || el.paused) { lastT = -1; return; }
      const t = el.currentTime;
      if (lastT < 0 || Math.abs(t - lastT) > 0.4) lastK = Math.ceil((t - g.first) / g.period) - 1;
      lastT = t;
      for (let k = lastK + 1; g.first + k * g.period <= t + 0.12; k++) {
        lastK = k; const bt = g.first + k * g.period; if (bt < t - 0.02) continue;
        const o = ctx.createOscillator(), v = ctx.createGain(), when = ctx.currentTime + (bt - t);
        o.frequency.value = (((k - g.db) % 4) + 4) % 4 === 0 ? 1800 : 1100;
        v.gain.setValueAtTime(0.35, when); v.gain.exponentialRampToValueAtTime(0.001, when + 0.05);
        o.connect(v).connect(ctx.destination); o.start(when); o.stop(when + 0.06);
      }
    }, 30);
    return () => { clearInterval(id); ctx.close(); };
  }, [click, mTe?.bpm, mTe?.firstBeat, mTe?.barIndex]);
  const off = norm && a && r && Number.isFinite(a.lufsI - r.lufsI) ? a.lufsI - r.lufsI : 0;
  const rateHint = a && (a.nativeRate == null ? "frecuencia original desconocida" : a.nativeRate !== a.sampleRate ? `original ${a.nativeRate / 1000} kHz, remuestreado` : "sin remuestreo");

  return (
    <main>
      <header>
      <h1>Analizador de Audio Online Gratis</h1>
      <p>
        Analizá tus canciones y evaluá tus mezclas con herramientas de audio
        directamente desde tu navegador. Medí loudness, picos, RMS, clipping,
        espectro, tonalidad y BPM sin subir tus archivos a ningún servidor.
      </p>
      </header>

      <section className="seo-info">
  <h2>¿Qué es un analizador de audio online?</h2>
  <p>
    Es una herramienta para estudiar las características técnicas de una
    canción o mezcla. Este analizador de audio gratuito permite revisar
    niveles, sonoridad, frecuencias y otros parámetros útiles para productores
    musicales antes de exportar un tema.
  </p>

  <h2>¿Qué podés analizar?</h2>
  <p>
    Medí LUFS integrados, rango de sonoridad, true peak, RMS y clipping.
    Visualizá la forma de onda, el espectro de frecuencias, el espectrograma
    y el vectorscopio estéreo para conocer mejor el comportamiento de tu audio.
  </p>

  <h2>Detectá tonalidad y BPM</h2>
  <p>
    Obtené estimaciones automáticas de tonalidad, escala y tempo de tus beats.
    También podés comparar tu mezcla con una pista de referencia para evaluar
    diferencias de loudness, niveles y balance de frecuencias.
  </p>

  <p>
    El análisis se realiza en tu navegador y tus archivos de audio no se
    suben a un servidor.
  </p>
</section>
      
      <div className="trio">
        <DropZone title="Tu mezcla" name={mix?.name} busy={busy.mix} onFiles={(f) => load("mix", f[0])} hint="Análisis completo: loudness, picos, espectro" />
        <DropZone title="Key & BPM" name={beats.length ? `${beats.length} beat${beats.length > 1 ? "s" : ""} analizados` : undefined} busy={busy.beat} multiple onFiles={loadBeats} hint="Soltá uno o varios beats: tonalidad, escala y BPM" />
        <DropZone title="Referencia (opcional)" name={ref?.name} busy={busy.ref} onFiles={(f) => load("ref", f[0])} hint="Para comparar espectro y niveles" />
      </div>
      {err && <p className="err" role="alert">{err}</p>}
      {beatSrc && <KeyBpmPanel b={beatSrc} />}
      {beats.length > 0 && <BeatsTable sel={beatSrc} beats={beats} onSel={setSelId} onRemove={(id) => setBeats((bs) => bs.filter((b) => b.id !== id))} onClear={() => setBeats([])} />}

      {a && mix && (
        <>
          <section>
            <div className="row">
              <div><h2>Forma de onda</h2><span className="mut">{mix.name}</span></div>
              <div className="big"><b>{f1(a.lufsI)}</b><span>LUFS integrado</span></div>
            </div>
            <Waveform a={a} grid={showGrid ? gridOf(mTe) : null} progress={prog} onSeek={(p) => { if (audio.current) audio.current.currentTime = p * a.duration; }} />
            {mTe && (
              <div className="tools">
                <label className="toggle"><input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} />Mostrar pulsos</label>
                <label className="toggle"><input type="checkbox" checked={click} onChange={(e) => setClick(e.target.checked)} />Click sobre el audio</label>
              </div>
            )}
            <audio ref={audio} src={url} controls onTimeUpdate={(e) => setProg(e.currentTarget.currentTime / a.duration)} />
          </section>

          <section>
            <div className="row"><h2>Medidas</h2></div>
            <Group title="Loudness (EBU R128)">
              <Stat label="LUFS integrado" value={f1(a.lufsI, " LUFS")} hint="con gating" />
              <Stat label="Rango (LRA)" value={f1(a.lra, " LU")} />
              <Stat label="Short-term máx." value={f1(a.lufsShortMax, " LUFS")} hint="ventana de 3 s" />
              <Stat label="Momentary máx." value={f1(a.lufsMomMax, " LUFS")} hint="ventana de 400 ms" />
            </Group>
            <Group title="Niveles">
              <Stat label="True peak" value={f1(a.truePeakDb, " dBTP")} warn={a.truePeakDb > -1} hint={a.truePeakDb > -1 ? "Por encima de −1 dBTP" : "Margen suficiente"} />
              <Stat label="Pico (muestra)" value={f1(a.peakDb, " dBFS")} warn={a.peakDb >= -0.01} />
              <Stat label="RMS" value={f1(a.rmsDb, " dBFS")} />
              <Stat label="PLR" value={f1(a.plr, " dB")} hint="true peak − LUFS integrado" />
              <Stat label="Crest factor" value={f1(a.crestDb, " dB")} hint="pico − RMS" />
              <Stat label="Muestras en clip" value={String(a.clips)} warn={a.clips > 0} hint={a.clips > 0 ? "Hay saturación digital" : "Sin clipping"} />
              <Stat label="Offset DC" value={a.dc.toExponential(1)} />
            </Group>
            <Group title="Tonalidad y tempo">
              <Stat label="Tonalidad" value={mT ? mT.short : "—"} hint={mT ? `${mT.name} · Camelot ${mT.camelot}` : undefined} />
              <Stat label="BPM" value={mTe ? String(Math.round(mTe.bpm)) : "—"} hint={mTe ? `exacto ${mTe.bpm.toFixed(2)}` : undefined} />
            </Group>
            <Group title="Estéreo y archivo">
              <Stat label="Correlación L/R" value={a.correlation === null ? "—" : a.correlation.toFixed(2)} hint="+1 mono · 0 ancho · negativo: fase" />
              <Stat label="Mid / Side" value={a.midSideDb === null ? "—" : f1(a.midSideDb, " dB")} hint="más negativo = más centrado" />
              <Stat label="Duración" value={time(a.duration)} />
              <Stat label="Formato" value={`${a.sampleRate / 1000} kHz`} hint={`${a.channels === 1 ? "mono" : a.channels + " canales"} · ${rateHint}`} warn={a.nativeRate != null && a.nativeRate !== a.sampleRate} />
            </Group>
          </section>

          <section>
            <h2>Diagnóstico automático</h2>
            <ul className="tips">{diagnose(a).map((t, i) => <li key={i} className={t.ok ? "ok" : "bad"}><b>{t.ok ? "OK" : "Ojo"}</b>{t.text}</li>)}</ul>
          </section>

          <section>
            <h2>Loudness en el tiempo</h2>
            <Loudness a={a} />
            <small className="note">Momentary (400 ms). La línea punteada marca el LUFS integrado.</small>
          </section>

          <section>
            <div className="row">
              <h2>Espectro de frecuencias</h2>
              {r && <label className="toggle"><input type="checkbox" checked={norm} onChange={(e) => setNorm(e.target.checked)} />Igualar loudness de la referencia ({sgn(a.lufsI - r.lufsI, " dB")})</label>}
            </div>
            {r && <p className="legend"><i className="k1" />Tu mezcla <i className="k2" />Referencia</p>}
            <Spectrum a={a} r={r} off={off} />
            <div className="bands">
              {a.bands.map((b) => <div key={b.name}><b>{f1(b.db)}</b><span>{b.name}</span><small>{b.range}</small></div>)}
            </div>
          </section>

          {r && ref && refUrl && url && (
            <section>
              <h2>Escucha A/B con loudness igualado</h2>
              <ABPlayer mixUrl={url} refUrl={refUrl} mixLufs={a.lufsI} refLufs={r.lufsI} mixName={mix.name} refName={ref.name} />
            </section>
          )}

          {r && ref && (
            <section>
              <h2>Mezcla contra referencia</h2>
              <table>
                <thead><tr><th></th><th>Mezcla</th><th>Referencia</th><th>Diferencia</th></tr></thead>
                <tbody>
                  {([["LUFS integrado", a.lufsI, r.lufsI], ["True peak (dBTP)", a.truePeakDb, r.truePeakDb], ["Rango LRA (LU)", a.lra, r.lra], ["Crest factor (dB)", a.crestDb, r.crestDb]] as [string, number, number][]).map(([n, x, y]) => (
                    <tr key={n}><td>{n}</td><td>{f1(x)}</td><td>{f1(y)}</td><td>{sgn(x - y)}</td></tr>
                  ))}
                  {mT && r.tonal && <tr><td>Tonalidad</td><td>{mT.name} ({mT.camelot})</td><td>{r.tonal.name} ({r.tonal.camelot})</td><td>{mT.camelot === r.tonal.camelot ? "misma" : "distinta"}</td></tr>}
                  {mTe && r.tempo && <tr><td>BPM</td><td>{mTe.bpm.toFixed(1)}</td><td>{r.tempo.bpm.toFixed(1)}</td><td>{sgn(mTe.bpm - r.tempo.bpm)}</td></tr>}
                  {a.bands.map((b, i) => {
                    const dif = b.db - (r.bands[i].db + off);
                    return <tr key={b.name}><td>{b.name} <small>{b.range}</small></td><td>{f1(b.db)}</td><td>{f1(r.bands[i].db + off)}</td><td className={Math.abs(dif) > 3 ? "hot" : ""}>{sgn(dif)}</td></tr>;
                  })}
                </tbody>
              </table>
              <small className="note">Bandas en dB. Una diferencia de más de 3 dB queda resaltada: tu mezcla tiene más (+) o menos (−) energía que la referencia en esa zona.</small>
            </section>
          )}

          <div className="two">
            <section><h2>Espectrograma</h2><Spectrogram a={a} /><small className="note">Frecuencia (Hz, escala log) contra tiempo.</small></section>
            {a.vector && <section><h2>Vectorscopio</h2><Vectorscope v={a.vector} /><small className="note">Vertical: mid. Horizontal: side.</small></section>}
          </div>

          <section>
            <h2>Comparación con plataformas</h2>
            <table>
              <tbody>
                {TARGETS.map(([n, t]) => {
                  const diff = t - a.lufsI;
                  return <tr key={n}><td>{n}</td><td>{t} LUFS</td><td>{Number.isFinite(diff) ? sgn(diff, " dB de ganancia para llegar") : "—"}</td></tr>;
                })}
              </tbody>
            </table>
          </section>
        </>
      )}
      <footer>Key y BPM son estimaciones automáticas. Mediciones hechas sobre el audio decodificado por el navegador, a la frecuencia original del archivo cuando se puede leer. Para certificar un master, contrastá con un medidor de referencia como Youlean.</footer>
    </main>
  );
}
