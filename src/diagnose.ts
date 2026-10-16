import type { Analysis } from "./dsp";
export type Tip = { ok: boolean; text: string };
export function diagnose(a: Analysis): Tip[] {
  const o: Tip[] = [], add = (ok: boolean, text: string) => o.push({ ok, text });
  const f = (x: number) => x.toFixed(1).replace("-", "−");
  a.clips > 0 ? add(false, `Hay ${a.clips} muestras en clip (0 dBFS). Bajá el nivel antes del limitador o revisá si hay distorsión.`) : add(true, "No hay clipping digital.");
  a.truePeakDb > -1 ? add(false, `El true peak (${f(a.truePeakDb)} dBTP) supera −1 dBTP: puede distorsionar al convertir a MP3/AAC. Dejá entre −1 y −1,5 dBTP de margen.`) : add(true, `True peak con margen (${f(a.truePeakDb)} dBTP).`);
  if (a.lufsI > -9) add(false, `Loudness muy alto (${f(a.lufsI)} LUFS). Las plataformas lo van a bajar unos ${f(-14 - a.lufsI)} dB y perdés dinámica sin ganar volumen.`);
  else if (a.lufsI < -20) add(false, `Loudness bajo (${f(a.lufsI)} LUFS): va a sonar flojo al lado de otros temas.`);
  else add(true, `Loudness en un rango habitual para streaming (${f(a.lufsI)} LUFS).`);
  if (a.plr < 8) add(false, `PLR de ${f(a.plr)} dB: mezcla muy limitada. Un PLR de 9 a 14 dB suele conservar más pegada.`);
  if (a.lra < 3) add(false, `Rango de loudness muy bajo (${f(a.lra)} LU): poca variación entre secciones.`);
  if (a.correlation !== null) {
    if (a.correlation < 0) add(false, `Correlación L/R negativa (${a.correlation.toFixed(2)}): hay problemas de fase y puede desaparecer contenido en mono.`);
    else if (a.correlation < 0.3) add(false, `Correlación L/R baja (${a.correlation.toFixed(2)}): revisá la compatibilidad en mono.`);
    else add(true, "Compatibilidad en mono correcta.");
  }
  if (Math.abs(a.dc) > 0.005) add(false, "Hay offset DC: aplicá un filtro pasa-altos muy bajo (~20 Hz).");
  if (a.tonal && a.tonal.confidence < 0.35) add(false, "La tonalidad detectada es dudosa (poco contenido armónico o key ambigua). Confirmala de oído.");
  return o;
}
