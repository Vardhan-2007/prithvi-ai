import { useStore, type RightTab } from "../../app/store";
import { useT } from "../../shared/utils/i18n";
import { OverviewTab } from "./OverviewTab";
import { ZoneTab } from "./ZoneTab";
import { PriorityTab } from "./PriorityTab";
import { RoutesTab } from "./RoutesTab";
import { AssistantTab } from "../assistant/AssistantTab";
import { DataTab } from "../provenance/DataTab";

const TABS: { id: RightTab; k: string }[] = [
  { id: "overview", k: "tab.overview" }, { id: "zone", k: "tab.zone" }, { id: "priority", k: "tab.priority" },
  { id: "routes", k: "tab.routes" }, { id: "assistant", k: "tab.assistant" }, { id: "data", k: "tab.data" },
];

export function RightPanel() {
  const t = useT();
  const tab = useStore((s) => s.tab); const setTab = useStore((s) => s.setTab);
  return (
    <aside className="panel right">
      <div className="tabs" role="tablist">
        {TABS.map((x) => <button key={x.id} role="tab" aria-selected={tab === x.id} className={tab === x.id ? "on" : ""} onClick={() => setTab(x.id)}>{t(x.k)}</button>)}
      </div>
      <div className="tab-body">
        {tab === "overview" && <OverviewTab />}
        {tab === "zone" && <ZoneTab />}
        {tab === "priority" && <PriorityTab />}
        {tab === "routes" && <RoutesTab />}
        {tab === "assistant" && <AssistantTab />}
        {tab === "data" && <DataTab />}
      </div>
    </aside>
  );
}
