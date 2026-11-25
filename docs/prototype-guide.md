# PRITHVI AI — prototype guide (every control, value and calculation)

This is the pin-to-pin reference: what every element on screen does, the exact numbers behind it, and how the simulation and the risk index are computed.
Values below were read from the code (`frontend/src/…`, `ai-engine/…`, `gis-engine/…`) — file names are given so you can point to the source in a viva.

> Reminder (also shown in the app): outputs are **indicative scenario indices and uncalibrated scenario water depths**. They are not forecasts, probabilities, flood-depth estimates, evacuation instructions or "safe routes".

---

## 0. The prototype in numbers

| Item | Value |
|---|---|
| Pilot area | central Kakinada, 1600 m × 1662 m (bbox 82.232–82.247 °E, 16.944–16.959 °N) |
| Simulation grid | 128 × 133 cells of 12.5 m (≈ 17 000 cells) |
| Analysis zones | 272 zones of 100 m (16 × 17) |
| Buildings / road segments / facilities / water bodies | 472 / 250 / 23 / 4 (OpenStreetMap) |
| Facilities | 14 health (hospitals, clinics), 2 emergency (fire, police), 7 shelter candidates (school, town hall, places of worship) |
| Terrain | Copernicus GLO-90 (~90 m), 21 × 21 samples → smoothed → 12.5 m grid; range 1.63–8.75 m |
| Drain inlets | 56 **proxy** points (no real drainage data) |
| Tests | 73 Python + 69 web = 142 |

---

## 1. Screen layout

```
┌ Header: brand · [3D Digital Twin | 2D Map | Compare] · [Simulated · not a forecast] [API online/Local engine] [EN | తె] ┐
│ Left panel          │  Stage (3D twin / 2D map / Compare)                 │ Right panel (7 tabs)                  │
│ Scenario controls   │  HUD: title, clock, compass pad, legends            │ Overview · Zone · Priority · Drains · │
│ Layers              │  Timeline: status sentence + play/scrub/speed       │ Routes · Assistant · Data & limits    │
└ Bottom banner: "experimental planning and visualisation prototype… not official forecasts…" ┘
```

* **Header pills.** *Simulated · not a forecast* is always on. *API online* (green) appears when the FastAPI backend answers `/health` within 1.5 s; otherwise *Local engine* — the whole app still works.
* **EN / తె** switches every label, explanation and legend between English and Telugu (Telugu is a first draft needing human review). Assistant answers stay in English source wording.

---

## 2. Left panel — Scenario controls (`scenarios/ScenarioPanel.tsx`, `store.ts`)

| Control | Range / values | Default | What it does |
|---|---|---|---|
| **Presets** (4 chips) | *Light rain* 40 mm/6 h/0 % · *Heavy + 25 % blocked* 100 mm/6 h/25 % · *Very heavy* 180 mm/6 h/40 % · *Extreme burst* 300 mm/4 h/60 % | *Heavy + 25 %* (loaded at start) | Sets rainfall, duration, blockage, clears manual inlet overrides and **restarts the simulation immediately** |
| **Rainfall (total)** | 10–350 mm, step 5 | 100 | Total depth of the storm. Shows implied average intensity (mm ÷ h) — "user-defined, not a forecast" |
| **Duration** | 1–24 h, step 1 | 6 | Length of the rain |
| **Drainage blockage** | 0–100 %, step 5 | 25 | Share of the 56 proxy inlets treated as unavailable. Shows "n of 56 proxy inlets unavailable" |
| **Mitigation: temporary pumps** | checkbox | off | Adds 6 pumps at the top-priority zones (≥ 150 m apart, chosen from the no-pump result) |
| **Run simulation** | button | — | Restarts the solver from t = 0 with the current settings |
| **Reset** | button | — | Back to the loaded default (100 mm / 6 h / 25 %, no overrides, no pumps) |
| **Clear all blockages** | button (appears when blockage > 0 or manual overrides exist) | — | Sets blockage 0 % and removes manual overrides |

Slider behaviour: the **risk index updates instantly** while you drag; the **3D simulation restarts 450 ms after you stop** (debounce).

**Blockage is deterministic.** "x %" blocks the first `round(x · 56)` inlets of one fixed pseudo-random order (seeded `mulberry32(20261121)`), so 25 % always blocks the same 14 inlets and 50 % blocks those 14 plus 14 more. **Manual override:** click an inlet in 3D (or a dot in 2D) to flip it; the override is stored only if it differs from what the slider would give, and it wins over the slider.

**Baseline** (used for every "vs baseline" number): 30 mm over 6 h, all inlets open, no pumps.

### Layers (same panel)
| Control | Effect |
|---|---|
| Heat-map: **No heat-map / Risk index / Δ vs baseline** | Colours the terrain by the zone index (teal→yellow→orange→red) or by change from baseline (red = up, teal = down) |
| **Flood water** | Shows/hides the water surface |
| **Show peak depth** | Water shows the *peak depth so far* instead of the depth right now |
| **Buildings**, **Roads** | Visibility |
| **Drain inlets (proxy)** | Cyan = open, red = blocked, green = manually cleared |
| **Trees (decor, not data)** | ≤ 900 decorative trees on open ground — there is no tree dataset |
| **Critical facilities** | Pins: red = health, amber = emergency, green = shelter candidate, grey = other |
| **Pumps** | Yellow spinning markers |
| **Rain** | Rain streaks (3200 lines; opacity and speed follow the current rain rate) |

---

## 3. The 3D digital twin (`maps/twin3d/`)

### What you see
* **Terrain** with relief exaggerated **×3** (stated on screen). **Buildings and water depth are true size.**
* **Buildings:** OSM footprints extruded to the OSM height (`height` or `building:levels × 3.2 m`) — otherwise a *proxy* of 2–4 storeys (deterministic per OSM id, ×3.2 m). Textured facades with windows (about a quarter lit), varied roofs, sun shadows.
* **Roads:** asphalt with lane lines (dashed centre line on primary/secondary/tertiary), pavements; roads get darker/glossier as rain continues (wet look).
* **Water:** shaded surface whose colour encodes depth, with flow-aligned ripples, rain rings and shore foam. Legend: *0 → 0.4 → 0.8 → 1.2+ m* (cyan-blue → deep blue → purple → red). Water below 4 mm is not drawn.
* **Colour feedback on assets** (refreshed ~5×/s): a building turns **amber at ≥ 0.15 m** and **red at ≥ 0.5 m** of water in the 3 × 3 cells around it; a road section turns **amber at ≥ 0.10 m** and **red at ≥ the Routes threshold** (default 0.25 m).
* **Depth pins:** up to 3 labels ("0.7 m") on the deepest cells above 0.3 m, ≥ 160 m apart, refreshed ~2×/s.
* **Selection box** around the clicked zone; **tooltips** on hover (zone: index/band/Δ; facility: name/type; inlet: open/blocked).

### Camera & compass (`shared nav pad` = `components/NavPad.tsx`)
| Action | 3D | 2D map |
|---|---|---|
| Rotate | left-drag · **⟲ ⟳** (18° per click, hold to repeat) · `Q`/`E` · `←`/`→` | right/Ctrl-drag · **⟲ ⟳** (18°) |
| Tilt | `↑`/`↓` · **▲ ▼** (≈ 6.9° per click; range ≈ top-down to near-horizon) | right-drag up/down · **▲ ▼** (10° per click, max 70°) |
| Pan | right/Shift-drag · `W A S D` | left-drag |
| Zoom | scroll · **＋ －** (×0.78 / ×1.28 per click) | scroll · **＋ －** (±0.5 zoom level) |
| Fly to a point | **double-click** the ground (moves there, halves the distance, min 260 m) | — |
| Compass | the dial rotates with the view and the label shows the heading (e.g. "345° N"); **click it or press `N`** to face north | same |
| **⊞** top-down north-up · **⌂** reset | also `T` / `0` | same |
| Top-bar chips | *Perspective*, *Top view*, *Auto-orbit* (slow spin) | — |

Limits: distance 50–3600 m; the focus point is clamped to the model so you cannot lose the city. Moves are eased (170–700 ms) and consecutive clicks accumulate.

### Clicking
* Click **ground / zone** → opens the **Zone** tab for that 100 m zone.
* Click a **facility pin** → opens the Zone tab of the zone it sits in.
* Click an **inlet** → blocks/clears it and restarts the simulation.

---

## 4. Timeline and live statistics (`dashboard/timeline/Timeline.tsx`, `twin3d/sim/liveStats.ts`)

* **Clock** (HUD) shows `T+hh:mm` simulated time. Total length = **rain duration + 3 h** of drainage after the rain stops.
* **Play / pause** (red button). At the end, pressing play restarts from 0. **Scrub** by clicking/dragging the rain-hyetograph graph (red bars = already played, grey = computed, dark = not computed yet).
* **Speed:** 2.5, 5, **10 (default)**, 20, 40 simulated minutes per real second.
* **"n % computed":** the solver streams snapshots from a Web Worker while you watch; you cannot scrub past what is computed (a full run takes a few seconds).

**Status sentence** (above the timeline): one plain sentence about what is happening at the playhead, in English or Telugu, e.g. *"The rain is easing (77 mm/h). About 27.3 ha is under water, up to 0.9 m deep. Mapped facilities reached: 3."* It moves through six phases: *dry → rain building → rain at its peak (within ±5 % of the duration around the midpoint) → rain easing → rain stopped, water draining away → almost dry again* (`dashboard/timeline/status.ts`, tested). The earlier row of eight number boxes was removed as clutter; the flooded area, deepest water and buildings reached remain in the Overview tab (3D simulation now), and the numbers are still defined by `liveStats.ts`:

* **Flooded area** = cells with depth ≥ 0.15 m × 156.25 m² · **Deepest water** = deepest cell · **Buildings reached** = buildings with ≥ 0.15 m within the 3 × 3 cells around their centroid · **Facilities reached** = facilities with ≥ 0.15 m in the 3 × 3 cells around them.

---|---|
| **Water ≥ 0.15 m** (ha) | cells with depth ≥ 0.15 m × 156.25 m² |
| **Max scenario depth** (m) | deepest cell |
| **Buildings reached** | buildings with ≥ 0.15 m within the 3 × 3 cells around their centroid |
| **Roads ≥ 0.25 m** (km) | length of road-graph edges whose depth ≥ the Routes threshold (label follows the threshold) |
| **Facilities reached** | facilities with ≥ 0.15 m in the 3 × 3 cells around them |
| **Rain now** (mm/h) | current hyetograph rate |
| **Rain so far** (mm) | cumulative rain |
| **Drained** (k m³) | cumulative volume removed by inlets + pumps, plus the post-rain recession (outfall volume is shown in the Overview) |

---

## 5. Right panel

### 5.1 Overview
1. **Scenario advisory** (red card, "simulated — not an official warning"): scenario name, rainfall/duration, blockage (+ manual overrides, + pumps), **Mean index**, **Δ vs baseline**, **zones moved up a band**; two stacked bars of band counts (baseline vs scenario) and legend.
2. **Exposure overlay:** zones in the *Higher/Highest* bands are "flagged". Shows flagged zones, **road length in flagged zones** (a segment counts if its midpoint is in a flagged zone) and **mapped facilities in flagged zones** (list of up to 6). It is an overlay of mapped assets on indicative zones — **not** "they are flooded".
3. **3D simulation now:** flooded ha, max depth, buildings reached, and **water balance** *stored / drained / outfall* (m³, mass-conserving).
4. **Scenario library:** 16 pre-computed cells = 4 rainfalls (40/6, 100/6, 180/6, 300/4 mm/h) × 4 blockages (0/25/50/75 %). Each shows the mean index and the number of Higher+ zones; colour = cool (< 35) / warm (35–48) / hot (≥ 48). Click a cell to simulate it.
5. **Export CSV / JSON:** per-zone index, baseline, delta, four factors, open/total inlets, assets, plus scenario settings and the disclaimer.

### 5.2 Zone
For the clicked zone: band pill, **risk index (0–100)** and Δ vs baseline; four factor bars (marker = baseline value) with *factor → weighted points*; the points **sum exactly to the index**. **"Why this score"** — 5 sentences generated from the numbers (terrain level, rainfall, open inlets/capacity, assets, delta). **Simulated water in this zone** (current/peak max depth — uncalibrated). **Zone inputs:** mean elevation, impervious share, buildings, road metres, facilities (health · emergency · shelter).

### 5.3 Priority
Top 12 zones by **`priority = index × (0.6 + 0.4·E) + 4 × min(2, facilities in zone)`**, each with rank, main driver (largest weighted contribution *excluding* the uniform rainfall term), facilities, road metres and index. Click to inspect. A planning aid — not an evacuation or dispatch instruction.

### 5.4 Drains (`scenarios/engine/drains.ts`, `dashboard/risk/DrainsTab.tsx`)
**Which drains are most likely to block, and which matter most if they do.** An **indicative ranking, not a prediction**: there is no drain inventory, inspection or blockage record for the pilot, so the 56 proxy inlets are ranked from terrain and surroundings with **assumed** weights:

`susceptibility S = 0.40 × low-lying + 0.30 × built-up + 0.30 × spacing` (each factor min–max scaled over the 56 inlets)

* **Low-lying** = `0.6 × (−ground elevation) + 0.4 × (surrounding mean − own elevation)`, surroundings within 60 m: silt, water and litter collect in low spots.
* **Built-up** = share of building + road cells within 75 m: heavy runoff and litter load.
* **Spacing** = mean distance to the 3 nearest other drains: a drain far from its neighbours serves a larger area.
* **Impact if blocked** = re-score the scenario with that drain blocked vs cleared: the largest rise in a block's index, which block, and how many more blocks become Higher/Highest.
* **Inspect first** = `S × (mean-index rise ÷ largest rise)`.

The tab lists the top 12 by *Most likely to block* or *Inspect first* (levels: higher ≥ 0.5, medium 0.3–0.5, lower < 0.3), shows each drain's factor bars, lets you mark/clear it, and has **"Assume the k likeliest drains block"**, which replaces the random blockage pattern with these drains and re-runs the simulation. While the tab is open the drains are coloured on the 3D and 2D maps (orange = higher, amber = medium, cyan = lower, red = blocked); selecting a drain flies the camera to it. Not validated against real blockages; use it to decide where to inspect first.

### 5.5 Routes
Pick **From** and **To** facilities and a **"segment unusable above"** depth (0.10–0.60 m, step 0.05, default 0.25 m). The app builds a graph from OSM road nodes, removes edges whose **peak depth so far** (sampled every 5 m) ≥ threshold, and runs **Dijkstra**. Shows dry-network distance, scenario distance, extra distance (%), network km above threshold, and a verdict (no change / longer / **cut**). The path is drawn in 3D (green = scenario path, yellow = dry path when cut). Default pair: the farthest-apart *connected* health → emergency/shelter pair (Mahaveer Hospital → a place of worship, 2.38 km). It updates as the simulation advances. **Not a certified safe route.**

### 5.6 Assistant (`ai-engine/rag`, `dashboard/assistant`)
* 8 team-written documents → 26 paragraph chunks (index method, drainage meaning, simulation limits, data sources, official sources, general flood preparedness, facilities/road exposure, priority ranking).
* Retrieval: **BM25** (k₁ = 1.5, b = 0.75) over stemmed tokens. It answers only if the best chunk has **score ≥ 1.6 and ≥ 50 % of the query's content words**; otherwise it **abstains** and points to IMD/NDMA/CWC. **Personal-safety questions** ("should I evacuate?", "will my house flood?", "am I safe?") are never answered from a document fragment: they get a fixed pointer to IMD, NDMA and the district administration. The Python and browser copies use the same rule.
* The answer = the first 3 sentences of the top 2 chunks, each tagged **[1] [2]** with a citation list. If your question contains *this/current/now/selected*, the live scenario summary is appended.
* No generative model — it cannot invent advice. Goes via FastAPI when online (4 s timeout), otherwise the same logic runs in the browser. 5 suggested questions.

### 5.7 Data & limits
Six limitation bullets, then every layer as an expandable card — **source, retrieved date, licence, resolution, processing, known limitations**, with a status tag: **observed** (OSM buildings/roads/facilities/water) · **derived** (terrain, risk zones) · **proxy** (drain inlets) · **simulated** (rainfall). Then the method in one screen and the AI-tool disclosure.

---

## 6. 2D Map and Compare

**2D Map (MapLibre):** OSM tiles (dimmed) + 100 m zones coloured by *Baseline / Scenario / Δ change*, extruded buildings (visible when tilted), roads, facilities, inlets (cyan/red; click to toggle), and **peak flood cells ≥ 0.15 m** (checkbox). Zoom 12.5–19.5, tilt ≤ 70°, scale bar, same compass pad. Click a zone → Zone tab.

**Compare:** three canvases — Baseline, Scenario, Change (scenario − baseline) — plus a table (mean index, band counts, road km and facilities in flagged zones). Click a zone in any panel to select it everywhere.

---

## 7. How the simulation works (`maps/twin3d/sim/floodSolver.ts`, mirrored in `backend/simulation/virtual_pipe.py`)

A **virtual-pipe shallow-water model** (after Mei, Decaudin & Hu 2007) on the 12.5 m grid, advanced in **2 s steps**, with a snapshot every **120 s**.

**Inputs prepared once**
1. **Ground** = conditioned DEM; **road cells lowered 0.15 m** (assumed kerb channel); **building cells are walls** (water cannot enter).
2. **Rain weights:** runoff coefficient **0.9** for building + road cells, **0.55** elsewhere (assumed). Rain falling on a building is delivered to the **nearest non-building cell**.
3. **Hyetograph:** symmetric triangle, **peak at the midpoint (50 %) of the duration**, peak rate = 2 × total ÷ duration (mm/h); it integrates exactly to the chosen total.
4. **Outfall:** the domain edge with the **lowest mean ground level** is the downstream boundary.

**Each 2-second step**
1. **Rain:** add `rate × Δt × weight` to each cell's depth.
2. **Inlets:** each *open* inlet removes `min(depth × area, 0.25 m³/s × min(1, depth/0.03 m) × Δt)`; blocked inlets do nothing. **Pumps** remove up to **0.15 m³/s** while water is present.
3. **Outfall:** edge cells spill water above a **0.30 m** crest: `0.5 × width × (h − 0.30)^1.5 × Δt` (broad-crested weir).
4. **Flux (virtual pipes):** every cell exchanges water with its 4 neighbours; each pipe's flow grows with the water-surface height difference (`g·pipeArea/Δx`), with **0.93 damping**; flows are scaled so a cell never gives away more water than it holds; flow into building cells is zero.
5. **Depth update:** `h += Δt × (inflow − outflow) ÷ area`, never below 0. Peak depth per cell is tracked.

**Recession (after the rain stops):** standing water recedes exponentially with a **1 h time constant** (counted as drained volume, so mass still balances). It stands for unresolved gaps and gutters, infiltration and evaporation, and is an **assumption**. It acts only after the rain stops, so peak depths and areas are unaffected. Without it, pockets walled in by buildings held water for ever (≈ 2.5 ha left 3 h after the rain).

**Output** = depth grid per snapshot → 3D water, stats, maps, routes. **Mass is conserved**: rain = stored + drained + outfall (tests: error < 2 % in the browser test, < 10⁻⁶ for the NumPy reference; measured ~10⁻¹⁴). Results are deterministic.

**Worked example — 200 mm in 4 h, 50 % blocked:** the rain rises to **100 mm/h at T+2:00** (the midpoint) and falls to zero at T+4:00. At T+2:00 the solver shows 22.6 ha ≥ 0.15 m with a maximum depth of 0.70 m; the flooded area peaks at **24.0 ha at T+2:14** (deepest 0.74 m), is 11.5 ha when the rain stops (T+4:00), 0.44 ha at T+6:00 and 0.02 ha at T+7:00 — the water goes back.

**Honest limits:** uncalibrated; coarse (~90 m) surface-model terrain; proxy drains; no sub-surface pipe network, culverts, tides, river flooding, infiltration dynamics or antecedent moisture. Use it to **compare scenarios**, not to read real depths.

---

## 8. How the risk index works (`scenarios/engine/risk.ts`, `ai-engine/risk_scoring/engine.py`)

`RiskIndex = 100 × (0.30·T + 0.25·R + 0.25·D + 0.20·E)` per 100 m zone; every factor is clipped to 0–1. Weights are **provisional design assumptions**, not calibrated.

| Factor | Formula | Notes |
|---|---|---|
| **T** terrain | `0.65·norm(−mean elevation) + 0.35·norm(neighbour-mean − own mean)` | low and/or below surroundings; min–max over the pilot area; uses the *unfilled* smoothed DEM |
| **R** rainfall | `0.5·min(1, mm/250) + 0.5·min(1, (mm/h)/100)` | same for every zone (a user input) |
| **D** drainage | `0.6·(1 − C) + 0.4·impervious share` | `C = min(1, Σ open-inlet weights ÷ w_ref)`, weight `exp(−d/90 m)` for inlets within 250 m of the zone centre (+ pumps); `w_ref` = 90th percentile of all-open capacity |
| **E** exposure | `0.5·norm(building area) + 0.3·norm(road length) + 0.2·min(1, (health + emergency + ½·shelter)/2)` | mapped assets only |

**Bands:** Lower < 35 ≤ Moderate < 48 ≤ Higher < 60 ≤ Highest *relative* index (display choices, not hazard thresholds).

Properties enforced by tests: weights sum to 1; index 0–100; same input → same output; breakdown sums to the index; more rain never lowers the index; more blockage never lowers D; pumps never raise the index; **TypeScript and Python give identical results** (parity fixture).

Examples (measured): baseline mean 25.6; 100 mm/6 h/25 % → 32.9 (+7.3); 200 mm/4 h/50 % → 44.3 (+18.7).

---

## 9. How the data was built (`gis-engine/`)

1. **OSM** (Overpass): buildings, roads, amenities, water → local metres from the south-west corner.
2. **DEM:** 21 × 21 Copernicus GLO-90 samples via Open-Meteo → two 3 × 3 smoothing passes → bilinear resample to 12.5 m → **priority-flood depression filling** toward the lowest edge so water has a path out (raised 13.3 % of cells, up to 2 m).
3. **Rasterise** buildings and roads into masks.
4. **Proxy inlets:** farthest-point sampling along drivable roads (56 points, ≥ 60 m apart) — evenly spread, **no terrain bias**, no claim they match real drains.
5. **Zones:** per 100 m zone → mean elevation, T, impervious share, E, counts, inlet influence weights.
6. **Provenance:** every layer gets source, licence, resolution, processing, status, limitations (`data/processed/layers.yaml`).

---

## 10. Backend (optional) — 11 routes (`backend/`)

`GET /health` · `GET /api/v1/areas` · `/areas/{id}/layers` · `/baseline` · `/facilities` · `POST /api/v1/scenarios` (`simulate:true` also runs the NumPy solver, ≤ 12 h) · `GET /scenarios/{id}` · `/geojson` · `/compare` · `GET /zones/{zone_id}/explanation` · `POST /assistant/query`. Inputs validated (rain 1–600 mm, duration 0.25–72 h, blockage 0–1); every response carries `data_status` and assumptions. No authentication — local/demo use.

---

## 11. Keyboard shortcuts (3D view focused)

`Q` `E` / `←` `→` rotate · `↑` `↓` tilt · `W` `A` `S` `D` move · `+` `-` zoom · `N` face north · `T` top-down · `0` reset view.

---

## 12. Likely questions (short answers)

* **Is it a flood forecast?** No. Rainfall is a user scenario; outputs are indicative.
* **Where did drain data come from?** There is none — proxy points; blockage is a sensitivity assumption.
* **How accurate is it?** Unknown and not claimed: no ground-truth flood extents were used. We test repeatability, monotonicity, mass conservation and TypeScript↔Python agreement.
* **Why these weights?** Provisional design choices; documented and testable; calibration is the roadmap.
* **What is genuinely implemented vs assumed?** Implemented: data pipeline, index, solver, UI, API, assistant. Assumed: weights, runoff coefficients, inlet locations/capacity, road lowering, outfall.
* **How would you validate it?** Hold out a documented historical event, compare simulated vs observed extent (IoU/precision/recall), report uncertainty.
