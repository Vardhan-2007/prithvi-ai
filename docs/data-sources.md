# Data sources (see data/metadata/layers.yaml for the generated provenance table)

| Layer | Source | Terms | Status |
|---|---|---|---|
| Buildings, roads, facilities, water | OpenStreetMap contributors via Overpass (https://www.openstreetmap.org/) | ODbL 1.0, attribution required | observed (completeness varies) |
| Terrain | Copernicus GLO-90 DEM via the Open-Meteo elevation API (https://dataspace.copernicus.eu/) | Copernicus DEM licence, attribution | derived (90 m surface model) |
| Drain inlets | Team assumption — farthest-point sampling along roads | n/a | **proxy** |
| Rainfall | User-defined; NASA GPM IMERG (https://gpm.nasa.gov/data/imerg) is the future calibration candidate | n/a | simulated |

Real warnings and forecasts: IMD https://mausam.imd.gov.in/ · NDMA https://ndma.gov.in/ · CWC https://cwc.gov.in/ · ISRO Bhuvan https://bhuvan.nrsc.gov.in/

Pilot choice: a 1.6 × 1.7 km block of central Kakinada (the project pack's example area). It was chosen because DEM, OSM roads, buildings and 23 mapped facilities (14 health) exist and download in minutes — not because it is familiar. OSM building coverage is thin (472 footprints), which the UI states.
