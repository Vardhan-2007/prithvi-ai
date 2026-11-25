# Planning aids: ground and sea, sure or maybe, officer brief, what money buys, field reports

Ground and sea. Two optional scenario inputs. Wet ground: the share of rain that runs off open ground rises from 0.55 when dry to 0.90 when saturated. High sea: the town's drains empty into tidal channels, so when the sea at the coast (tide plus storm surge) is above 0.5 m every drain loses capacity, down to 30 percent of normal at 2.0 m and above. Live mode and Replay fill both from Open-Meteo (soil moisture and the tide model); the tide model has no storm surge, so a surge is added by hand. These effects are assumed, not calibrated.

Sure or maybe. A zone is "sure" when it is flagged Higher or Highest even in a low case (less rain: the forecast's low member, or 70 percent of the rain; and half the drain blockage). It is "maybe" when it is flagged only in a high case (the forecast's high member or 130 percent of the rain, and 20 points more blockage). These are assumed brackets, not probabilities.

Officer brief. A printable one-page list of the top six zones to inspect, in English or Telugu: nearest street, coordinates, sure or maybe, which blocked drains to clear first, where a pump helps, and which nearby facilities to check road access to. It is a planning aid, not an evacuation order or an official warning.

What money buys. A cheapest-first plan that adds, step by step, the action that removes the most risk per rupee: clearing one blocked drain or putting out the temporary pumps. Costs are editable placeholders, not quotes, and the plan uses the quick index, so it ranks options and does not guarantee outcomes.

Field reports. Waterlogging seen on the ground can be logged with date, place and depth. Reports stay on the device, count in the Replay check for their day, and can be downloaded for the team to review. Do not enter residents' names or phone numbers.

Finer terrain. An optional upgrade replaces the 90 m terrain with Copernicus GLO-30 (30 m) and cuts drains mapped in OpenStreetMap into it. It is kept only if the replay check shows it helps.

Zone names. Zones are named after the nearest street mapped in OpenStreetMap within 150 m of their centre, or a nearby named facility; otherwise the zone id is shown. Several zones can share a street name, so the id is shown underneath.

How to share a scenario: press "Copy link to this scenario" and send the link. The link stores the whole scenario in the link (rain or hourly storm, duration, blockage, individual drains, pumps, ground wetness, sea level). Opening the link shows the same scenario. Nothing is uploaded to a server.

What the forecast alert means: when the real rain forecast is switched on, a coloured alert line says how many areas need action for sure and how many maybe in the forecast window, or that nothing is flagged even in the high case.

Guided demo. The "1-minute demo" button in the header walks through the main features in seven steps and resets the scenario at the end.

