import { HashRouter } from "react-router-dom";
import AppShell from "./components/AppShell";
import { SessionProvider } from "./lib/session";

// SessionProvider holds the live process state so it survives page switches.
export default function App() {
  return (
    <SessionProvider>
      <HashRouter>
        <AppShell />
      </HashRouter>
    </SessionProvider>
  );
}
