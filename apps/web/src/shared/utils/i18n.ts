import { useStore } from "../../app/store";
import { STRINGS } from "./strings";

export type Lang = "en" | "te";

export function tr(lang: Lang, key: string, params?: Record<string, string | number>): string {
  const entry = STRINGS[key];
  let s = entry ? (entry[lang] ?? entry.en) : key;
  if (params) for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

export function useT() {
  const lang = useStore((s) => s.lang);
  return (key: string, params?: Record<string, string | number>) => tr(lang, key, params);
}
