import { useStore, type MainView } from "./store";
import { useT } from "../shared/utils/i18n";

export function Header() {
  const t = useT();
  const view = useStore((s) => s.view); const setView = useStore((s) => s.setView);
  const lang = useStore((s) => s.lang); const setLang = useStore((s) => s.setLang);
  const api = useStore((s) => s.apiOnline);
  const views: { id: MainView; k: string }[] = [{ id: "3d", k: "view.3d" }, { id: "map", k: "view.map" }, { id: "compare", k: "view.compare" }];
  return (
    <header className="header">
      <div className="brand">
        <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden><circle cx="16" cy="16" r="14" fill="#0b1220" stroke="#3b82f6" strokeWidth="2" /><path d="M6 19c4-5 6 3 10-2s6 3 10-2" fill="none" stroke="#38bdf8" strokeWidth="2.5" /></svg>
        <div><b>PRITHVI AI</b><span>{t("app.subtitle")}</span></div>
      </div>
      <nav className="views">{views.map((v) => <button key={v.id} className={view === v.id ? "on" : ""} onClick={() => setView(v.id)}>{t(v.k)}</button>)}</nav>
      <div className="header-right">
        <span className="pill warn" title={t("disclaimer")}>{t("pill.notForecast")}</span>
        <span className={"pill " + (api ? "ok" : "")} title={t("api.hint")}>{api ? t("api.online") : t("api.local")}</span>
        <div className="seg lang">
          <button className={lang === "en" ? "on" : ""} onClick={() => setLang("en")}>EN</button>
          <button className={lang === "te" ? "on" : ""} onClick={() => setLang("te")}>తె</button>
        </div>
      </div>
    </header>
  );
}
