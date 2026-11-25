# Finer terrain and mapped drains (upgrade, measured before it is kept)

The replay check (`docs/validation.md`) found 0 hits on every reported day, with the same few low zones flagged 558–1,540 m
from the reported streets. The main suspected cause is the terrain: 441 GLO-90 height points (~90 m) cannot show the low
spots of individual streets. This upgrade swaps in finer terrain and cuts the drains mapped in OpenStreetMap into it,
then runs the same replay on the old and the new dataset, so the team keeps the change only if it measurably helps.

## What it does

`gis-engine/processing/upgrade_pilot.py`

| Step | Detail |
|---|---|
| Terrain | Copernicus **GLO-30** (1 arc-second, ~30 m) instead of GLO-90. Read straight from the public AWS bucket (`copernicus-dem-30m`), only the tiles the pilot needs, with HTTP range requests (`gis-engine/terrain/cog.py`, standard library + NumPy). 56 × 56 samples, one light smoothing pass (GLO-90 used two), same resampling and depression filling as before. |
| Drains | `waterway=drain/ditch/canal/stream/river` ways near the pilot from OSM (Overpass). Open ones are cut into the 12.5 m terrain as channels before depression filling (assumed depths: drain/ditch 0.5 m, stream 0.8 m, canal 1.2 m, river 1.5 m). Covered ones (`tunnel=*`, `covered=yes`) are shown only. They appear as cyan lines on the 2D map (dashed when covered) and as a `mapped_drains` layer in *Data & limits*. |
| Kept as is | Buildings, roads, facilities, the 56 proxy inlets (only their ground level is updated), zone layout. |
| Check | Every day with reports inside the pilot is replayed with that day's actual rain (Open-Meteo archive) and 25 % blockage, on the current and the candidate dataset, with the reference (NumPy) solver and the Replay tab's scoring (150 m rule). Output: `data/validation/upgrade_check.json` and a table in the terminal. |

## How to run it

```bash
make upgrade-check
```

That changes nothing in the repository. It prints, per day, hits on the current dataset and on the candidate. If the candidate is
better (or equal, and the 3D view still looks right), keep it:

```bash
make upgrade-apply
make test
```

`make upgrade-apply` writes the new dataset (and its frontend copy) and then runs `make derived`, which rebuilds the baseline
water and the parity references from it. Then record the numbers in `docs/validation.md` (Results table).

If the candidate is worse, do not apply it, and record that too: it is a useful result.

## Limits

* GLO-30 is still a **surface** model: roofs and trees are in it. FABDEM (a bare-earth version of GLO-30) would be better
  for a town core, but it is distributed as large zip archives, not tiles that can be read in parts.
* OSM drain mapping in Kakinada is incomplete, and channel depth, width and connections are assumptions.
* The check has 3 days and at most 4 reports per day: a change from 0 to 1 hit is a signal, not proof.
