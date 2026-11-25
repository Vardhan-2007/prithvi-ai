# Demo video script (4:30, limit is 5:00)

Record at 1080p, browser full screen, at https://prithvi-ai-psi.vercel.app. Before recording: open the site once so
the API wakes up ("API online"), then reload. Speak slowly; every line below is the voice-over.

| Time | On screen | Say |
|---|---|---|
| 0:00 | The 3D twin | "Kakinada waterlogs in almost every heavy rain: Main Road, Temple Street, whole colonies, three times this year. Before each storm, the municipality must decide which drains to clear and where to send pumps and people. PRITHVI AI is a digital twin of central Kakinada built for that decision." |
| 0:25 | Rotate the 3D view; open *Data & limits* briefly | "It is built from open data: OpenStreetMap buildings and roads, Copernicus terrain, and 56 drain points. Every layer shows its source and limits." |
| 0:45 | Tick **Live mode** | "This is the real ECMWF ensemble forecast: 51 versions of the next 24 hours, shown as low, likely and high rain. It also loads today's ground wetness and tide." |
| 1:10 | Click preset **Very heavy**; press play | "Now a heavier storm. The shallow-water model runs in the browser: water collects in low streets hour by hour." |
| 1:35 | Move the **Sea above normal** slider to 1.5 m | "Kakinada is coastal: when the tide is high, drains cannot empty. Watch more zones turn red." |
| 1:55 | **Priority** tab | "Zones are ranked by risk and by who is affected, named after the nearest street. 'Sure' means the zone is flagged even with less rain and fewer blocked drains; 'maybe' only in the worse case." |
| 2:20 | **Officer brief** → switch to Telugu → close | "One click gives a printable brief, in Telugu or English: where to go, which drains to clear first, where a pump helps. It can be copied for WhatsApp." |
| 2:50 | **Drains** tab → scroll to *What money buys* → move the slider | "And what money buys: the cheapest actions first, and how many risky zones each rupee removes." |
| 3:15 | **Replay** tab → 3 Nov 2026 → run the rain that fell | "Most tools stop here. We check ourselves. This replays Cyclone Murasu's day with the rain that actually fell and compares with news reports." |
| 3:40 | The 0 of 4 result | "Today it misses: the flagged zones are half a kilometre or more away. We show that openly. The likely cause is the 90-metre terrain, and the 30-metre upgrade is ready to test in the hackathon. Officers can also log field reports here, and the check counts them." |
| 4:05 | **Copy link to this scenario**; open the **Assistant**, ask "What does sure mean?" | "Any scenario can be shared as a link, and the assistant answers only from our documents, with sources." |
| 4:20 | Back to the 3D view | "PRITHVI AI: from the forecast to a street-level plan, honest about what it knows. Thank you." |

Fallback if Live mode or the API is slow: skip 0:45 and say "Live mode loads the forecast; here is a preset storm".
