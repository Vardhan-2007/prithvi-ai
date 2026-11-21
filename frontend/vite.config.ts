import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // Set VITE_BASE=/repo-name/ when hosting under a sub-path (e.g. GitHub Pages project sites); default "/" for Vercel, Netlify, Cloudflare.
  base: process.env.VITE_BASE ?? "/",
  plugins: [react()],
  worker: { format: "es" },
  build: { chunkSizeWarningLimit: 1800 },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
