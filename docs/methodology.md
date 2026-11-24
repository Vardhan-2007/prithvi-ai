# Methodology (what is real, what is assumed)

PRITHVI AI is an experimental planning and visualisation prototype. Everything below is deterministic and reproducible;
nothing is trained, and **no accuracy figure is claimed** because no ground-truth flood extents were used.

## 1. Risk index (per 100 m zone)

`RiskIndex = 100 × (0.30·T + 0.25·R + 0.25·D + 0.20·E)` — an *index* (relative ranking), not a probability or a depth.

| Factor | Definition (all clipped to 0–1) | Status |
|---|---|---|
| **T** terrain | `0.65·norm(−mean elevation) + 0.35·norm(mean of 8 neighbours − own mean)` — low and/or below its surroundings. Uses the *unfilled* smoothed DEM. | derived |
| **R** rainfall | `0.5·min(1, total_mm/250) + 0.5·min(1, (total_mm/duration_h)/100)` — user-defined scenario, uniform in space | simulated |
| **D** drainage vulnerability | `0.6·(1 − C) + 0.4·imperv`, where `C = min(1, Σ_open w / w_ref)`, `w = exp(−d/90 m)` over proxy inlets within 250 m (plus pumps) | proxy |
| **E** exposure | `0.5·norm(building area) + 0.3·norm(road length) + 0.2·min(1, (health + emergency + ½·shelter)/2)` | derived |

* Weights are provisional design assumptions, not calibrated coefficients.
* Display bands: Lower < 35 ≤ Moderate < 48 ≤ Higher < 60 ≤ Highest *relative* index. Thresholds are display choices.
* **Baseline** = 30 mm over 6 h with every proxy inlet open (same weights, same data — only scenario inputs differ).
* Blocking `x %` of inlets blocks the first `round(x·N)` entries of a fixed seeded permutation, so results repeat exactly.
  Individual inlets can be forced `blocked` / `cleared` (click in 3D or 2D).
* Mitigation "pumps": 6 pumps at the top-priority zones (≥150 m apart) chosen from the *no-pump* result, each acting as an extra inlet in D
  and as a 0.15 m³/s sink in the solver.
* Missing data are never silently zero: zones without mapped assets get E = 0 *and* the UI shows the counts that produced it.

### Explainability
`contributions = 100·w·factor` and sum exactly to the index (tested). The Zone tab shows factors vs baseline, plus sentences generated from the numbers (EN/Telugu).

### Priority ranking
`priority = index × (0.6 + 0.4·E) + 4·min(2, #mapped critical facilities)`. A planning aid, not a dispatch order.

## 2. 3D water simulation (illustrative)

Virtual-pipe shallow-water model (Mei, Decaudin & Hu 2007) on a 128 × 133 grid of 12.5 m cells, Δt = 2 s, mass-conserving.

* **Rain** — symmetric triangular hyetograph: it rises to its peak at the **midpoint** of the duration and falls to zero at the end, integrating to the chosen total (peak rate = 2 × total ÷ duration). Runoff coefficient 0.9 (roofs, roads) / 0.55 (other) — *assumed*. Rain on a building cell is delivered to the nearest open cell.
* **Terrain** — Copernicus GLO-90 (≈90 m, a *surface* model) smoothed, bilinearly resampled, then priority-flood depression-filled toward the lowest edge so spurious pits do not trap water. (Pockets that building footprints wall in on three sides can still trap water on the 12.5 m grid; see *Recession* below.) Road cells are lowered 0.15 m (assumed kerb channel). Building footprints are impassable.
* **Sinks** — proxy inlets (0.25 m³/s each, ramping up over the first 3 cm of depth), optional pumps, and a downstream outfall on the lowest edge modelled as a broad-crested weir over an assumed 0.30 m tail-water bund.
* **Recession** — once the rain has stopped, standing water recedes exponentially with a 1 h time constant (`RECESSION_TAU_H`). It stands for what the grid cannot resolve: water leaking out of pockets walled in by building footprints through gaps and gutters, infiltration, evaporation and informal pumping. Without it those pockets would hold water for ever (measured: about 2.5 ha and 15 k m³ still standing three hours after the rain ended). The loss is counted as drained volume, so mass still balances. It acts only after the rain stops, so peak depths and peak flooded areas are unchanged. **Assumed, not calibrated.**
* **Not modelled** — sub-surface drainage networks, culverts, tides/storm surge, infiltration dynamics, antecedent moisture, river flooding.

`frontend/src/maps/twin3d/sim/floodSolver.ts` (browser, Web Worker) and `backend/simulation` (NumPy) implement the same equations; tests check mass conservation (< 1e-6 relative error) and the two agree on peak flooded cells/depth.

## 3. Road-network analysis
Graph from OSM `highway` ways. A segment is removed when the peak simulated depth along it (so far) exceeds a user threshold (default 0.25 m, *assumption*). Shortest path (Dijkstra) between two mapped facilities, dry vs scenario. **Not** a certified safe route.

## 4. Assistant
Extractive BM25 retrieval over `ai-engine/rag/corpus/*.md`. Answers are built from retrieved sentences with citations or the assistant abstains (score / coverage thresholds). Retrieved text is data; no generative model follows instructions in it. The corpus is a **demo corpus** of team-written summaries — replace/extend it with extracts of official documents you have the right to use.

## 5. Validation path (not done in this prototype)
Pick a documented historical event, hold it out, compare simulated extent with observed extent (IoU / precision / recall), and report uncertainty. Until then: repeatability, monotonicity, mass-balance and parity tests only.

## Drain blockage likelihood (indicative)
The model cannot predict which real drains will block: there is no drain inventory, inspection or blockage history for the pilot, and the 56 inlets are proxy points. The **Drains** tab therefore gives a transparent, *assumed* ranking: `S = 0.40·low-lying + 0.30·built-up + 0.30·spacing` (each factor min–max scaled over the 56 inlets), plus the **impact** of a blockage at each drain (re-score the scenario with that drain blocked vs cleared). Both are relative rankings, not probabilities, and are not validated against real blockages. See `frontend/src/scenarios/engine/drains.ts`. To predict real blockages you would need the municipal drain map, cleaning and inspection records and past flood complaints.
