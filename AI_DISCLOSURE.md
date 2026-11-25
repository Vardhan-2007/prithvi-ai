# AI-tool disclosure

HackWithAditya allows coding assistants and AI APIs when they are disclosed, and accepts only code the team can explain.
This file says plainly what was used and how.

## Tools used

| Tool | Used for |
|---|---|
| **Claude (Anthropic), as a coding assistant** | Drafting and reviewing code, tests and documentation; researching data sources (Open-Meteo, Copernicus, OSM) and news reports of past waterlogging; checking the deployed site in a browser. Commits with this help carry a `Co-Authored-By: Claude` line, so they are visible in the history. |
| **No AI inside the product's results** | The flood solver, risk index, routing, sure/maybe brackets and money plan are ordinary deterministic code (formulas in `docs/methodology.md`). The in-app **assistant is not an LLM**: it is keyword (BM25) retrieval over the project's own documents with citations, and it refuses off-topic questions (`ai-engine/rag`). |

## What the team did

- Chose the problem, the area (central Kakinada) and the users; decided what to build and in what order.
- Ran, read and reviewed every change on their own machines before committing; ran the full test suite (`make test`) before every push.
- Found the real-world reports used for validation, judged which ones fall inside the pilot, and ran the replays.
- Owns the honest reporting of what does not work (0 validation hits so far; `docs/validation.md`).

## How we make sure we can explain it

- `docs/viva-prep.md`: the questions we expect, with short answers and the file each answer comes from. Every member practises it.
- Every formula is in `docs/methodology.md`; every data layer's source and limits are in the app (*Data & limits*).
- Two independent implementations (TypeScript in the browser, Python on the server) are checked against each other by tests, so a wrong line in either one fails the build.

## External code and data

Only open-source libraries from npm and PyPI (listed in `frontend/package.json` and `backend/requirements.txt`) and
open data with attribution (`NOTICE.md`, *Data & limits*). No code copied from other projects.
