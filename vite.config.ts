import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";
// Un único index.html autocontenido: funciona con doble clic (file://) o en cualquier hosting.
export default defineConfig({ base: "./", plugins: [react(), viteSingleFile()] });
