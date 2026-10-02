// Entry point: mounts the React tree into #root in the Vite index.html.
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

createRoot(document.getElementById("root")!).render(<App />);
