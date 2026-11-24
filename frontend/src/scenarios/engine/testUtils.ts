// Test-only helper: loads the real pilot dataset from disk (the app fetches it over HTTP instead).
import { readFileSync } from "node:fs";
import type { Dataset } from "./types";

export function loadTestDataset(): Dataset {
  return JSON.parse(readFileSync(new URL("../../../public/data/pilot_kakinada_01.json", import.meta.url), "utf8")) as Dataset;
}
