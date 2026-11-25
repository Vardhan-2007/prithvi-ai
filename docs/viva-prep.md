# Viva preparation (10-minute ownership check)

Each answer is short enough to say in 20 seconds. The file named after each answer is where to show it. Every member
should be able to answer every question in the first two sections.

## 1. The project in one minute

**What is it?** A digital twin of 1.6 × 1.7 km of central Kakinada. You set or load a storm, and it shows how water
spreads and which streets need attention first, with a printable brief for officers. It also checks itself against
real waterlogging reports.

**Who is it for?** Municipal engineers, sanitation supervisors and ward officers: drain clearing, pump placement and
inspection before a storm.

**What is new about it?** (1) Live ensemble forecast → flood run → "sure / maybe" priority list in one place. (2) The
tide and wet ground included for a coastal town. (3) It measures itself (Replay) and says honestly where it misses.

## 2. How it works

| Question | Answer | Show |
|---|---|---|
| Where does the map come from? | OpenStreetMap: 472 buildings, 250 roads, 23 facilities. Copernicus GLO-90 terrain, resampled to a 12.5 m grid (128 × 133 cells). | `gis-engine/processing/build_pilot_dataset.py`, *Data & limits* tab |
| What are the drains? | 56 **proxy** inlets placed along roads at low points. There is no public drain map, so we say proxy everywhere. | `gis-engine/processing/osm.py` `place_inlets` |
| How does the water move? | A "virtual pipe" shallow-water method. Each cell has a water depth, and water flows to the 4 neighbours according to the difference in water surface height. Time step 2 s. Rain is added as roof/road runoff (90 %) or open ground (55 %). Each open inlet removes up to 0.25 m³/s, and water leaves over the low edge like over a weir. | `frontend/src/maps/twin3d/sim/floodSolver.ts` |
| Why two solvers? | The browser one (TypeScript) is for the 3D view; the Python one (NumPy) is for the API. A test runs both on the same storm and they must agree within 1 %. | `backend/tests/test_solver_parity.py` |
| How is risk scored? | Before the flood run: 0.30 terrain + 0.25 rain + 0.25 drainage + 0.20 exposure. After the run: 0.20 terrain + 0.15 drainage + 0.20 exposure + 0.45 simulated water. Bands: Moderate ≥ 35, Higher ≥ 48, Highest ≥ 60. | `frontend/src/scenarios/engine/risk.ts`, `docs/methodology.md` |
| Why does rain drop out of the final score? | Rain is the same over the whole pilot, so it cannot rank one zone above another. It enters through the simulated water instead. | `risk.ts` `WEIGHTS_FINAL` |
| Where does live rain come from? | Open-Meteo, ECMWF ensemble: 51 forecast members. We take the members at the 10th, 50th and 90th percentile of total rain as low, likely and high. | `frontend/src/scenarios/engine/forecast.ts` |
| What are "sure" and "maybe"? | We score a low case (less rain, half the blockage) and a high case (more rain, +20 points blockage). Sure = flagged even in the low case. Maybe = flagged only in the high case. | `frontend/src/scenarios/engine/brief.ts` |
| Tide and wet ground? | Wet ground raises open-ground runoff from 0.55 to 0.90. If the sea is more than 0.5 m above normal, drain capacity falls, down to 30 % at 2 m. Both are assumptions. The tide is measured above its 31-day average because the data's zero is offset by about 0.67 m. | `floodSolver.ts` `perviousRunoff`, `drainFactor`; `conditions.ts` |
| What money buys? | Greedy plan: at each step, add the action (clear one drain, or the pumps) that removes the most risk per rupee. Costs are editable placeholders. | `frontend/src/scenarios/engine/budget.ts` |
| Is the assistant ChatGPT? | No. It is BM25 keyword search over our own documents, with citations. It refuses if fewer than half the question's words match, and it refuses personal-safety questions. | `ai-engine/rag/` |
| How do you test? | `make test`: 123 Python + 126 browser tests, including the parity tests, mass balance (water in = water stored + drained + out), and API validation. | `Makefile` |

## 3. Hard questions (answer honestly)

**Does it work? Is it accurate?** It is not calibrated. We replayed three storm days with the rain that fell and got
**0 of 4** reports matched; the flagged zones were 558–1,540 m from the reported streets. We know the likely main cause
(90 m terrain cannot see street-level low spots), and the first event task tests a 30 m version. We would rather show
the measurement than claim accuracy. (`docs/validation.md`)

**Why should a municipality trust it then?** As a planning aid that is transparent: every number has a stated source and
assumption, it never claims to be a forecast, and it gets better as field reports come in, which the app records.

**Why not use a professional model (HEC-RAS, SWMM)?** They need a drainage survey, calibration data and specialists.
This runs in a browser with open data and is meant for a ward office. With a survey, the same app could load better inputs.

**What did AI do?** A coding assistant (Claude) helped write and review code, tests and docs, disclosed in
`AI_DISCLOSURE.md` and in the commit messages. We chose and reviewed everything, ran the tests, and can explain every
part: that is what this sheet is for.

**What happens if the API is down?** The app runs fully in the browser; the API only adds the server engine and the
assistant through it. The header shows "Local engine".

**What would you do with more time?** `docs/48-hour-plan.md`: 30 m terrain, burst rain for replays, calibrate on one
storm and test on another, a ward view, and an SMS-length brief.

## 4. Who explains what

| Part | Member |
|---|---|
| Problem, users, demo | `[TEAM: name]` |
| Data pipeline and terrain | `[TEAM: name]` |
| Flood solver and risk index | `[TEAM: name]` |
| Live mode, replay and validation | `[TEAM: name]` |
| Frontend (brief, money, field reports) and assistant | `[TEAM: name]` |
