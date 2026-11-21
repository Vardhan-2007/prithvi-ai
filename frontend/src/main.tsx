import { createRoot } from "react-dom/client";
import "maplibre-gl/dist/maplibre-gl.css";
import "./styles/app.css";
import { App } from "./App";
import { useStore } from "./store";

if (import.meta.env.DEV) (window as unknown as { __prithvi: typeof useStore }).__prithvi = useStore; // dev-only debugging handle

createRoot(document.getElementById("root")!).render(<App />);
