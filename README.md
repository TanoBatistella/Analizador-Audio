# Analizador de audio

Página web 100 % estática (React + TypeScript + Vite). **No hay backend**: todo se analiza en el navegador
del usuario, el audio nunca se sube a ningún servidor. Por eso se publica gratis y no tiene costos de servidor.

Mide LUFS (EBU R128), true peak, RMS, clipping, espectro, espectrograma, vectorscopio, tonalidad (key, Camelot,
escala, acordes) y BPM, y compara contra una pista de referencia (con escucha A/B a igual loudness).

## Cómo arrancarlo en tu computadora

Opción A, sin instalar nada: abrí `analizador-audio.html` (o `dist/index.html`) con doble clic.
No abras el `index.html` de la raíz del proyecto: es código fuente.

Opción B, para modificarlo:

1. Instalá Node.js (versión LTS) desde https://nodejs.org
2. Abrí una terminal en esta carpeta (en Windows: escribí `cmd` en la barra de direcciones del Explorador).
3. `npm install` (solo la primera vez)
4. `npm run dev` y abrí http://localhost:5173
5. `npm run build` genera `dist/index.html`, un único archivo listo para publicar.
6. `npm test` verifica los cálculos con señales de valor conocido.

## Cómo publicarlo gratis

Lo que se publica es la carpeta `dist` (o su único `index.html`).

- Netlify Drop (lo más fácil, sin cuenta de Git): ejecutá `npm run build`, entrá a https://app.netlify.com/drop
  y arrastrá la carpeta `dist`. Te da una URL pública al instante.
- GitHub Pages: subí el proyecto a un repositorio de GitHub (rama `main`) y en Settings > Pages elegí
  "GitHub Actions". El archivo `.github/workflows/deploy.yml` publica solo en cada cambio.
- Cloudflare Pages o Vercel: conectá el repositorio, comando de build `npm run build`, carpeta de salida `dist`.

## Notas de precisión

- Se lee la frecuencia de muestreo original (WAV, FLAC, OGG, MP3) para que el navegador no remuestree.
- Multicanal (hasta 6): pesos BS.1770 (surround +1,5 dB, LFE excluido).
- El BPM se decide por ajuste de grilla de compás de 4 tiempos; asume 4/4.
- Si dos tonalidades son relativas (mismas notas, por ejemplo E♭ menor y F♯ mayor) se muestran ambas.
- Para certificar un master, contrastá con un medidor de referencia (por ejemplo Youlean).
