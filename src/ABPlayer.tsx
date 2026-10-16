import { useEffect, useRef, useState } from "react";

export function ABPlayer({ mixUrl, refUrl, mixLufs, refLufs, mixName, refName }: { mixUrl: string; refUrl: string; mixLufs: number; refLufs: number; mixName: string; refName: string }) {
  const A = useRef<HTMLAudioElement>(null), B = useRef<HTMLAudioElement>(null);
  const [side, setSide] = useState<"A" | "B">("A"), [match, setMatch] = useState(true), [playing, setPlaying] = useState(false), [pos, setPos] = useState(0), [dur, setDur] = useState(0);
  const diff = refLufs - mixLufs, ok = Number.isFinite(diff);
  const gA = match && ok ? Math.min(1, 10 ** (diff / 20)) : 1, gB = match && ok ? Math.min(1, 10 ** (-diff / 20)) : 1;
  useEffect(() => { if (A.current) A.current.volume = gA; if (B.current) B.current.volume = gB; }, [gA, gB]);
  useEffect(() => () => { A.current?.pause(); B.current?.pause(); }, []);
  const act = () => (side === "A" ? A : B).current, oth = () => (side === "A" ? B : A).current;
  const toggle = () => { const c = act(); if (!c) return; if (c.paused) { c.play(); setPlaying(true); } else { c.pause(); setPlaying(false); } };
  const swap = (s: "A" | "B") => { if (s === side) return; const c = act(), o = oth(); if (!c || !o) return; o.currentTime = c.currentTime; if (!c.paused) o.play(); c.pause(); setSide(s); };
  const seek = (v: number) => { if (A.current) A.current.currentTime = v; if (B.current) B.current.currentTime = v; setPos(v); };
  const common = (s: "A" | "B") => ({ preload: "auto" as const, onLoadedMetadata: (e: React.SyntheticEvent<HTMLAudioElement>) => setDur(e.currentTarget.duration), onTimeUpdate: (e: React.SyntheticEvent<HTMLAudioElement>) => s === side && setPos(e.currentTarget.currentTime), onEnded: () => setPlaying(false) });
  return (
    <div className="ab">
      <audio ref={A} src={mixUrl} {...common("A")} /><audio ref={B} src={refUrl} {...common("B")} />
      <div className="abrow">
        <button onClick={toggle}>{playing ? "Pausa" : "Reproducir"}</button>
        <span className="seg" role="group" aria-label="Fuente">
          <button className={side === "A" ? "on" : ""} aria-pressed={side === "A"} onClick={() => swap("A")}>A · Tu mezcla</button>
          <button className={side === "B" ? "on" : ""} aria-pressed={side === "B"} onClick={() => swap("B")}>B · Referencia</button>
        </span>
        <label className="toggle"><input type="checkbox" checked={match} onChange={(e) => setMatch(e.target.checked)} />Igualar loudness</label>
      </div>
      <input type="range" aria-label="Posición" min={0} max={dur || 1} step={0.1} value={pos} onChange={(e) => seek(+e.target.value)} />
      <small className="note">{side === "A" ? mixName : refName}{match && ok ? ` · la más fuerte se baja ${Math.abs(diff).toFixed(1)} dB para comparar a igual volumen percibido` : ""}</small>
    </div>
  );
}
