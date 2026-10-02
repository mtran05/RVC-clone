import { HashRouter, Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { SessionProvider, useSession } from "./lib/session";
import LivePage from "./pages/LivePage";
import SavedPage from "./pages/SavedPage";
import SfxPage from "./pages/SfxPage";
import "./styles.css";

// Rail of the three pages. Uses hash routes so it works from file:// in Electron.
function Rail() {
  const location = useLocation();
  const current = location.pathname;
  return (
    <nav className="rail" aria-label="Pages">
      <p className="brand">
        <img src="./logo.svg" width="36" height="36" alt="Overtone" />
      </p>
      <Link className="rail-link" to="/live" aria-current={current === "/live" ? "page" : undefined}>
        Live
      </Link>
      <Link className="rail-link" to="/saved" aria-current={current === "/saved" ? "page" : undefined}>
        Saved
      </Link>
      <Link className="rail-link" to="/sfx" aria-current={current === "/sfx" ? "page" : undefined}>
        SFX
      </Link>
    </nav>
  );
}

// The shared grid: rail, header, and the routed page. Living routes render their
// own grid children (stage, rack, tape); the shell CSS hides those when the URL
// is not /live. The body classes drive the lamp and live glow in the base CSS.
function Shell() {
  const { status } = useSession();
  const location = useLocation();
  const page = location.pathname.replace("/", "") || "live";

  useEffect(() => {
    document.body.classList.toggle("live", status === "Live");
    document.body.classList.toggle("stopped", status === "Stopped");
  }, [status]);

  return (
    <div className="desk" data-page={page}>
      <Rail />
      <header className="mast">
        <h1>Overtone</h1>
        <p id="status" aria-live="polite">
          {status}
        </p>
      </header>
      <Routes>
        <Route path="/live" element={<LivePage />} />
        <Route path="/saved" element={<SavedPage />} />
        <Route path="/sfx" element={<SfxPage />} />
        <Route path="*" element={<Navigate to="/live" replace />} />
      </Routes>
    </div>
  );
}

// SessionProvider holds the live process state so it survives page switches.
export default function App() {
  return (
    <SessionProvider>
      <HashRouter>
        <Shell />
      </HashRouter>
    </SessionProvider>
  );
}
