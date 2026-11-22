# Deployment guide

PRITHVI AI is a **static web app** (the 3D twin runs entirely in the browser, with the pilot dataset shipped in `frontend/public/data/`) plus an **optional** FastAPI backend. You can deploy just the static site and the product works in full; add the backend only if you want the *API online* badge and server-side assistant answers.

```
Visitor's browser ── loads ──► static site (Vercel / Netlify / Cloudflare / GitHub Pages)
        └── optional ── calls ──► FastAPI backend (Render / Fly / Railway / any Python host)
```

Verified locally: a production build served under a sub-path loads the dataset, starts the simulation, makes **no** request to `localhost`, and shows the *Local engine* badge when no API is configured.

---

## Option A — Vercel (recommended, ~2 minutes)

1. Sign in at vercel.com with GitHub → **Add New → Project** → import `prithvi-ai`.
2. **Root Directory:** `frontend`. Framework preset is detected as *Vite* (build `npm run build`, output `dist`).
3. Leave environment variables empty → **Deploy**.

Every push to `main` redeploys automatically; pull requests get preview URLs. `frontend/vercel.json` already sets cache headers.

**Netlify:** *Add new site → Import from Git* → base directory `frontend`, build command `npm run build`, publish directory `frontend/dist`.
**Cloudflare Pages:** root directory `frontend`, build command `npm run build`, output directory `dist`.
(`frontend/public/_headers` covers both.)

## Option B — GitHub Pages (free, no extra account)

1. Repo → **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. **Actions** tab → **Deploy to GitHub Pages (manual)** → **Run workflow**.
3. Your site is at `https://<user>.github.io/<repo>/`.

The workflow builds with `VITE_BASE=/<repo>/` so assets resolve under the sub-path. It is manual on purpose (it would fail on pushes before Pages is enabled); change `on:` to `push` in `.github/workflows/pages.yml` once you want automatic deploys.

---

## Optional — the FastAPI backend (Render, via Docker)

The repo ships a `Dockerfile` (built from the repository root, because the API reads `data/processed/` and imports `ai-engine/`) and a `render.yaml` Blueprint.

1. Render → **New → Blueprint** → pick the `prithvi-ai` repo → **Apply**. (Or **New → Web Service → Docker**, leaving *Root Directory* empty.)
2. When asked for `PRITHVI_CORS_ORIGINS`, enter your site's exact origin, e.g. `https://prithvi-ai.vercel.app` (no trailing slash; comma-separate several).
3. Wait for the deploy, then open `https://<your-api>.onrender.com/health` → `{"status":"ok",…}`. Interactive docs are at `/docs`.
4. In your **frontend host's** settings add `VITE_API_URL=https://<your-api>.onrender.com` and **redeploy** (it is baked in at build time).
5. Open the site: the header should say **API online**, and assistant answers end with "via FastAPI".

Run the same image locally: `docker build -t prithvi-api .` then `docker run -p 8000:8000 -e PRITHVI_CORS_ORIGINS=http://localhost:5173 prithvi-api`.

What was checked: the API runs from exactly the files the image contains (`backend/`, `ai-engine/`, `data/processed/`); CORS answers only the configured origin; a production frontend built with `VITE_API_URL` shows *API online* and answers the assistant through the API; `simulate: true` takes ~8 s and a second concurrent request gets `429` instead of piling up. **Not checked:** the Docker image build itself and the Render deploy (run them once and check `/health`).

Notes:
* Free tiers sleep when idle; the first request can take ~30–60 s. The site keeps working meanwhile (it falls back to the in-browser engine).
* The API has **no authentication**. It only computes scenarios from public data. `simulate: true` is single-flight (one solver run at a time); add real rate limiting before exposing it widely.
* Scenarios are held in memory (last 200) and are lost on restart. The container runs a single worker for that reason.

---

## Before you share the link

- [ ] Open the live URL in a fresh browser window: the 3D view loads, the timeline plays, the header says *Local engine* (or *API online* if you added the backend).
- [ ] Check the console is free of errors (map tile requests are expected to be the only external calls).
- [ ] **Map tiles:** the 2D map uses `tile.openstreetmap.org`, which is fine for a prototype but not for heavy public traffic ([tile usage policy](https://operations.osmfoundation.org/policies/tiles/)). For a busy site, switch to a tile provider with an API key and keep the © OpenStreetMap contributors attribution.
- [ ] The "Simulated · not a forecast" pill and bottom banner are visible; keep them.
- [ ] **Phones/tablets:** the layout collapses on small screens but has only been tested at desktop sizes, and software-rendered WebGL can be slow. Check on the devices your audience will use.
- [ ] Add the live URL to the repo's **About → Website** field and to the README.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Blank page, 404 for `/assets/...` | Hosting under a sub-path without `VITE_BASE=/<path>/` at build time |
| "This view could not start" | The browser has WebGL disabled or unavailable |
| Header never shows *API online* | `VITE_API_URL` not set at build time, wrong URL, or the origin missing from `PRITHVI_CORS_ORIGINS` |
| Backend crashes at start | Build from the repo root (the `Dockerfile` copies `backend/`, `ai-engine/`, `data/processed/`); read the Render logs |
| CI red on a pull request | Run `make test` locally — CI runs the same checks |
