import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // Set VITE_BASE=/repo-name/ when hosting under a sub-path (e.g. GitHub Pages project sites); default "/" for Vercel, Netlify, Cloudflare.
  base: process.env.VITE_BASE ?? "/",
  plugins: [react()],
  worker: { format: "es" },
  build: {
    rollupOptions: {
      output: {
        // Large third-party libraries get their own files: they change rarely, so browsers keep them cached across
        // deploys, and the map library is only fetched when the 2D map is opened (see App.tsx).
        manualChunks: { three: ["three"], maplibre: ["maplibre-gl"], react: ["react", "react-dom", "zustand"] },
      },
    },
    // maplibre-gl (about 0.8 MB) and three.js (about 0.5 MB) are large on their own, so the default 500 kB warning
    // would always fire. 900 keeps the warning meaningful: it triggers if our own code or a new big library lands in
    // one chunk. (This used to be 1800, which hid that everything shipped as a single 1.6 MB file.)
    chunkSizeWarningLimit: 900,
  },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
