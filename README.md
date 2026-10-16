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
