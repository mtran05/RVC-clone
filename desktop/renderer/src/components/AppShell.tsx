import { Navigate, Route, Routes } from "react-router-dom";
import Rail from "./Rail";
import LivePage from "../pages/LivePage";
import PresetsPage from "../pages/PresetsPage";
import SfxPage from "../pages/SfxPage";
import { useSession } from "../lib/session";
import styles from "./AppShell.module.css";

// The window frame: the page rail, the title and status lamp, and whichever
// page the hash route names. Only the current page is mounted, so no page has to
// hide itself with CSS.
//
// Hash routes are used because the packaged app is loaded from file://.
export default function AppShell() {
  const { status, statusLabel } = useSession();

  return (
    <div className={styles.desk} data-status={status.toLowerCase()}>
      <Rail />
      <header className={styles.mast}>
        <h1>Overtone</h1>
        <p id="status" className={styles.status} aria-live="polite">
          {statusLabel}
        </p>
      </header>
      <main className={styles.content}>
        <Routes>
          <Route path="/live" element={<LivePage />} />
          <Route path="/presets" element={<PresetsPage />} />
          <Route path="/sfx" element={<SfxPage />} />
          <Route path="*" element={<Navigate to="/live" replace />} />
        </Routes>
      </main>
    </div>
  );
}
