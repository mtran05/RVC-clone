// @vitest-environment jsdom

// A render smoke test. It cannot judge how the window looks, but it does prove
// that every CSS module import resolves, every context is wired, and each page
// mounts — the failures a pure-logic test suite would miss.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import App from "./App";

afterEach(cleanup);

beforeEach(() => {
  window.location.hash = "";
});

// jsdom has no window.rvc, which is exactly the "running in a browser" preview
// case, so no test needs to stub the Electron bridge.
describe("the app", () => {
  it("mounts the shell with the live page", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "Overtone" })).toBeTruthy();
    expect(screen.getByText("Preview")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Go live" })).toBeTruthy();
  });

  it("names every page in the rail", () => {
    render(<App />);
    const rail = screen.getByRole("navigation", { name: "Pages" });
    expect(within(rail).getByRole("link", { name: "Live" })).toBeTruthy();
    expect(within(rail).getByRole("link", { name: "Saved" })).toBeTruthy();
    expect(within(rail).getByRole("link", { name: "SFX" })).toBeTruthy();
  });

  it("puts a scannable label on every pitch control", () => {
    render(<App />);
    // The dial, both pitch bounds, and the tracker all come from the spec.
    expect(screen.getByLabelText("Pitch scale")).toBeTruthy();
    expect(screen.getByLabelText("Pitch in semitones")).toBeTruthy();
    expect(screen.getByRole("radiogroup", { name: "Pitch tracker" })).toBeTruthy();
  });

  it("opens the settings sheet and lists every tunable", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "More settings" }));

    const dialog = screen.getByRole("dialog", { name: "More settings" });
    for (const label of [
      "Block (seconds)",
      "Crossfade (seconds)",
      "Context (seconds)",
      "Lowest pitch (Hz)",
      "Highest pitch (Hz)",
      "Index neighbors",
      "Mic gain",
      "Speaker gain",
      "Sample rate",
      "Mic channels",
      "Speaker channels",
      "Latency",
      "Host API",
    ]) {
      expect(within(dialog).getByText(label), `missing "${label}"`).toBeTruthy();
    }
    expect(within(dialog).getByLabelText("Don't clip")).toBeTruthy();
    expect(within(dialog).getByLabelText("WASAPI exclusive")).toBeTruthy();
    expect(within(dialog).getByLabelText("WASAPI resample")).toBeTruthy();
  });

  it("closes the settings sheet on Escape", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "More settings" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("toggles a help popup", () => {
    render(<App />);
    const help = screen.getByRole("button", { name: "About Model" });
    expect(screen.queryByRole("tooltip")).toBeNull();
    fireEvent.click(help);
    expect(screen.getByRole("tooltip")).toBeTruthy();
    fireEvent.click(help);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("moves the pitch with the dial and lights it", () => {
    const { container } = render(<App />);
    const dial = screen.getByLabelText("Pitch scale") as HTMLInputElement;
    expect(dial.getAttribute("data-shift")).toBeNull();

    fireEvent.change(dial, { target: { value: "7" } });
    expect(dial.value).toBe("7");
    expect(dial.getAttribute("data-shift")).toBe("true");
    // The readout mirrors the slider.
    expect((screen.getByLabelText("Pitch in semitones") as HTMLInputElement).value).toBe("7");
    expect(container.querySelector("output")).toBeTruthy();
  });

  it("shows a help popup beside its own label", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "About Formant" }));
    expect(screen.getByRole("tooltip").textContent).toContain("brighter or darker");
  });

  it("walks between the placeholder pages", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("link", { name: "Saved" }));
    expect(screen.getByText("Coming soon.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Go live" })).toBeNull();

    fireEvent.click(screen.getByRole("link", { name: "SFX" }));
    expect(screen.getByRole("region", { name: "SFX" })).toBeTruthy();
  });
});
