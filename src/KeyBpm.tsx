import { useState } from "react";
import type { Tempo, Tonal } from "./tonal";
import { makeMidi } from "./midi";

export type Beat = { id: number; name: string; duration: number; tonal: Tonal | null; tempo: Tempo | null };
const MAJ = [0, 2, 4, 5, 7, 9, 11], MIN = [0, 2, 3, 5, 7, 8, 10];
const lvl = (v: number) => (v >= 0.7 ? "alta" : v >= 0.4 ? "media" : "baja");

function Wheel({ active, compat }: { active: string; compat: string[] }) {
  const P = (r: number, a: number) => `${(100 + r * Math.sin(a)).toFixed(1)},${(100 - r * Math.cos(a)).toFixed(1)}`;
  const arc = (r1: number, r2: number, a0: number, a1: number) => `M${P(r2, a0)}A${r2},${r2} 0 0 1 ${P(r2, a1)}L${P(r1, a1)}A${r1},${r1} 0 0 0 ${P(r1, a0)}Z`;
  return (
    <svg className="wheel" viewBox="0 0 200 200" role="img" aria-label={`Rueda Camelot, tonalidad ${active}`}>
      {Array.from({ length: 12 }, (_, i) => i + 1).flatMap((n) => ["B", "A"].map((L) => {
        const id = `${n}${L}`, [r1, r2] = L === "B" ? [64, 96] : [34, 62], c = (n * 30 * Math.PI) / 180, m = (r1 + r2) / 2;
        const cls = id === active ? "on" : compat.includes(id) ? "cp" : "";
        return (
          <g key={id}>
            <path d={arc(r1, r2, c - 0.2618, c + 0.2618)} className={"w " + cls} />
            <text x={100 + m * Math.sin(c)} y={100 - m * Math.cos(c) + 3} className={"wt " + cls}>{id}</text>
          </g>
        );
      }))}
    </svg>
  );
}

function Keys({ t }: { t: Tonal }) {
  const set = new Set((t.minor ? MIN : MAJ).map((i) => (t.pc + i) % 12));
  const cls = (pc: number) => (pc === t.pc ? "root" : set.has(pc) ? "in" : "");
  return (
    <svg className="piano" viewBox="0 0 196 70" role="img" aria-label={`Notas de la escala: ${t.scale.join(" ")}`}>
      {[0, 2, 4, 5, 7, 9, 11].map((pc, i) => <rect key={pc} x={i * 28 + 1} y="0" width="26" height="68" rx="2" className={"wk " + cls(pc)} />)}
      {[[1, 0], [3, 1], [6, 3], [8, 4], [10, 5]].map(([pc, i]) => <rect key={pc} x={i * 28 + 19} y="0" width="18" height="42" rx="2" className={"bk " + cls(pc)} />)}
    </svg>
  );
}

const Meter = ({ v }: { v: number }) => <span className="meter" role="img" aria-label={`${Math.round(v * 100)}%`}><i style={{ width: v * 100 + "%" }} /></span>;

export function KeyBpmPanel({ b }: { b: Beat }) {
  const t = b.tonal, p = b.tempo, [copied, setCopied] = useState(false);
  const title = [p && `${Math.round(p.bpm)} BPM`, t && t.short].filter(Boolean).join(" · ");
  const dl = (kind: "scale" | "chords") => {
    if (!t) return;
    const l = document.createElement("a"); l.href = URL.createObjectURL(makeMidi(t, p?.bpm ?? 120, kind));
    l.download = `${t.short}-${kind === "scale" ? "escala" : "acordes"}.mid`; l.click();
  };
  return (
    <section>
      <div className="row"><div><h2>Key & BPM</h2><span className="mut">{b.name}</span></div>
        {title && <button onClick={() => navigator.clipboard.writeText(title).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); })}>{copied ? "¡Copiado!" : `Copiar “${title}”`}</button>}
      </div>
      <div className="kb">
        <div className="kbcard"><span className="lbl">Tonalidad</span><b>{t ? t.name : "—"}</b>
          <small>{t ? `${t.es} · ${t.short}` : "No hay suficiente contenido armónico"}</small>
          {t && <small className={t.ambiguous ? "alt" : ""}>{t.ambiguous ? `También se lee como ${t.relative.name} (${t.relative.camelot})` : `Relativa: ${t.relative.name} (${t.relative.camelot})`}, mismas notas</small>}
        </div>
        <div className="kbcard"><span className="lbl">Camelot</span><b>{t ? t.camelot : "—"}</b><small>{t?.ambiguous ? `o ${t.relative.camelot} si se lee como ${t.relative.name}` : "para mezclar armónicamente"}</small></div>
        <div className="kbcard"><span className="lbl">BPM</span><b>{p ? Math.round(p.bpm) : "—"}</b><small>{p ? `exacto ${p.bpm.toFixed(2)}` : "No se detectó un pulso claro"}</small></div>
      </div>
      <p className="conf">
        {t && <><span>Confianza de la tonalidad: {lvl(t.confidence)}</span><Meter v={t.confidence} /></>}
        {p && <><span>del tempo: {lvl(p.confidence)}</span><Meter v={p.confidence} /></>}
      </p>
      {p?.variable && <p className="err">Tempo variable: el BPM es un promedio y la cuadrícula puede desfasarse.</p>}
      {t && (
        <div className="kbdetail">
          <div className="wheelbox"><Wheel active={t.camelot} compat={t.compatible.map((c) => c.camelot)} /><small className="note">Camelot: en naranja tu key, en verde las que combinan.</small></div>
          <div>
            <h3>Escala · {t.name}</h3>
            <Keys t={t} />
            <p className="notes">{t.scale.map((n, i) => <span key={n + i} className={i === 0 ? "n0" : ""}>{n}</span>)}</p>
            <h3>Acordes de la tonalidad</h3>
            <p className="chords">{t.chords.map((c) => <span key={c.num}><small>{c.num}</small>{c.name}</span>)}</p>
            <p><button onClick={() => dl("scale")}>Escala (.mid)</button> <button onClick={() => dl("chords")}>Acordes (.mid)</button></p>
            <h3>Combina con</h3>
            <p className="mut">{t.compatible.map((c) => `${c.name} (${c.camelot})`).join(" · ")}</p>
          </div>
        </div>
      )}
    </section>
  );
}

export function BeatsTable({ beats, sel, onSel, onRemove, onClear }: { beats: Beat[]; sel: Beat | null; onSel: (id: number) => void; onRemove: (id: number) => void; onClear: () => void }) {
  const csv = () => {
    const q = (x: string | number) => `"${String(x).replace(/"/g, '""')}"`;
    const rows = beats.map((b) => [b.name, b.tonal?.name ?? "", b.tonal?.camelot ?? "", b.tempo?.bpm ?? "", Math.round(b.duration)].map(q).join(","));
    const blob = new Blob(["\ufeff" + ["Archivo,Tonalidad,Camelot,BPM,Duración (s)", ...rows].join("\n")], { type: "text/csv" });
    const l = document.createElement("a"); l.href = URL.createObjectURL(blob); l.download = "beats-key-bpm.csv"; l.click();
  };
  const mixable = (b: Beat) => {
    if (!sel || b.id === sel.id || !sel.tonal || !b.tonal || !sel.tempo || !b.tempo) return null;
    const keyOk = b.tonal.camelot === sel.tonal.camelot || sel.tonal.compatible.some((c) => c.camelot === b.tonal!.camelot);
    const r = b.tempo.bpm / sel.tempo.bpm, pct = ([r, r * 2, r / 2].sort((x, y) => Math.abs(x - 1) - Math.abs(y - 1))[0] - 1) * 100;
    return { keyOk, pct, ok: keyOk && Math.abs(pct) <= 6 };
  };
  return (
    <section>
      <div className="row"><h2>Tus beats ({beats.length})</h2><span><button onClick={csv}>Exportar CSV</button> <button onClick={onClear}>Vaciar lista</button></span></div>
      <table className="beats">
        <thead><tr><th>Archivo</th><th>Tonalidad</th><th>Camelot</th><th>BPM</th><th>Contra el seleccionado</th><th></th></tr></thead>
        <tbody>
          {beats.map((b) => {
            const m = mixable(b);
            return (
              <tr key={b.id} className={b.id === sel?.id ? "sel" : ""} onClick={() => onSel(b.id)}>
                <td><button className="link" onClick={() => onSel(b.id)}>{b.name}</button></td>
                <td>{b.tonal?.name ?? "—"}</td><td>{b.tonal?.camelot ?? "—"}</td><td>{b.tempo ? b.tempo.bpm.toFixed(1) : "—"}</td>
                <td>{m ? <>{m.keyOk ? "key ✓" : "key ✗"} · {m.pct > 0 ? "+" : ""}{m.pct.toFixed(1)} % {m.ok && <b className="mixok">mezclan</b>}</> : "—"}</td>
                <td><button className="link" aria-label={`Quitar ${b.name}`} onClick={(e) => { e.stopPropagation(); onRemove(b.id); }}>✕</button></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <small className="note">“Mezclan”: tonalidades compatibles en la rueda Camelot y BPM a menos de 6 % de diferencia (el rango típico de pitch de un DJ).</small>
    </section>
  );
}
