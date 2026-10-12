import { describe, expect, it } from "vitest";
import { baseName } from "./format";
import { cx } from "./cx";

describe("baseName", () => {
  it("keeps only the last segment of a Windows path", () => {
    expect(baseName("C:\\RVC Clone\\assets\\weights\\kikiV1.pth")).toBe("kikiV1.pth");
  });

  it("keeps only the last segment of a POSIX path", () => {
    expect(baseName("/home/me/assets/indices/voice.index")).toBe("voice.index");
  });

  it("leaves a bare name alone", () => {
    expect(baseName("kikiV1.pth")).toBe("kikiV1.pth");
  });

  it("handles trailing separators and empty strings", () => {
    expect(baseName("a/b/")).toBe("");
    expect(baseName("")).toBe("");
  });
});

describe("cx", () => {
  it("joins the truthy values in order", () => {
    expect(cx("a", "b")).toBe("a b");
  });

  it("drops falsy values", () => {
    expect(cx("a", false, undefined, null, "b")).toBe("a b");
  });

  it("returns an empty string when nothing survives", () => {
    expect(cx(false, undefined)).toBe("");
    expect(cx()).toBe("");
  });
});
