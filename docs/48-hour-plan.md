# What we will build in the 48 hours (18–20 Dec 2026)

The prototype works end to end. Its main weakness is measured, not guessed: replaying three real storm days gives
**0 hits** against reported waterlogging. The event work goes straight at that, then turns the result into something a
municipal office can use. Every item is small, has a test that proves it, and has a fallback if it does not work.

Rules we follow: everyone on site, a commit to the shared repository at least every 3 hours, AI use disclosed.

## Goals, in priority order

| # | Enhancement | Done when | Fallback |
|---|---|---|---|
| 1 | **Finer ground (30 m GLO-30) and mapped drains** (code already written: `make upgrade-check`) | the replay table is in `docs/validation.md`, kept or rejected on the numbers | record "did not help" with the numbers. That is still a result |
| 2 | **Burst rain for replays**: replace day-smoothed model rain with hourly peaks scaled to IMD station totals for the replayed days | replay hits re-measured; method in `docs/methodology.md` | keep model rain, show both |
| 3 | **Calibrate on one storm, test on another**: tune 2 parameters (drain capacity, open-ground runoff) on 2 Nov, check on 28 Jun | hits on the *test* day reported, not only the training day | report the sensitivity table |
| 4 | **Ward view**: group zones by municipal ward / locality, ward-level brief | brief selectable per ward | street-name grouping (already in app) |
| 5 | **Alert hand-off**: officer brief as an SMS / WhatsApp-length message and a JSON endpoint `/api/v1/areas/{id}/brief` | endpoint tested; message ≤ 600 characters | copy-as-text (already in app) |
| 6 | **Field survey round** (if the organisers allow going out, or with locals at the venue): mark 10 known waterlogging spots | 10 field reports in the validation file | use the 19 news reports |

## Timeline

| Hours | Work | Owner |
|---|---|---|
| 0–3 | Run `make upgrade-check`; read the table; decide keep or reject; commit | `[TEAM: name]` |
| 3–9 | Goal 2 (burst rain): fetch station totals, scale the hourly series, re-run replays, tests | `[TEAM: name]` |
| 9–18 | Goal 3 (calibrate / test split), update `docs/validation.md` | `[TEAM: name]` |
| 18–30 | Goal 4 (ward view) and Goal 5 (brief endpoint + short message), tests, Telugu review | `[TEAM: names]` |
| 30–40 | Goal 6 if possible; polish; fix anything the mentors flag | everyone |
| 40–46 | Final run of `make test`, deploy, re-record the demo, update README and CHANGELOG | everyone |
| 46–48 | Rehearse the demo and viva (`docs/viva-prep.md`) | everyone |

## Why this is feasible in 48 hours

- Goal 1's code and tests exist; it is a run and a decision.
- Goals 2–3 change inputs and two parameters, not the solver; the replay check that measures them already exists.
- Goals 4–5 reuse the brief and zone names already in the app.
- Nothing needs new hardware, paid services or outside help.
