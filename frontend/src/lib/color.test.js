import { describe, expect, it } from "vitest";
import { accentVars, pickAccent, usableAccent } from "./color";

/** Imagen falsa (RGBA) con `n` píxeles de cada color. */
function pixels(...groups) {
  const out = [];
  for (const [n, [r, g, b, a = 255]] of groups) for (let i = 0; i < n; i++) out.push(r, g, b, a);
  return new Uint8ClampedArray(out);
}

describe("pickAccent", () => {
  it("elige el color vivo que más pesa, aunque haya mucho negro", () => {
    const c = pickAccent(pixels([600, [5, 5, 5]], [300, [220, 40, 60]], [50, [40, 200, 60]]));
    expect(c.r).toBeGreaterThan(200);
    expect(c.g).toBeLessThan(60);
  });
  it("una imagen gris no cambia el acento", () => {
    expect(pickAccent(pixels([500, [120, 120, 120]], [500, [10, 10, 10]]))).toBe(null);
    expect(pickAccent(new Uint8ClampedArray())).toBe(null);
  });
  it("ignora los píxeles transparentes", () => {
    expect(pickAccent(pixels([500, [220, 40, 60, 0]], [500, [120, 120, 120]]))).toBe(null);
  });
});

describe("usableAccent / accentVars", () => {
  it("un color muy oscuro se aclara para que se lea sobre el tema oscuro", () => {
    const c = usableAccent({ r: 60, g: 8, b: 12 });
    expect(Math.max(c.r, c.g, c.b)).toBeGreaterThan(180);
  });
  it("genera todas las variables", () => {
    const v = accentVars({ r: 10, g: 20, b: 30 });
    expect(v["--accent"]).toBe("rgb(10, 20, 30)");
    expect(v["--accent-rgb"]).toBe("10, 20, 30");
    expect(Object.keys(v)).toEqual(["--accent", "--accent-hover", "--accent-ink", "--accent-rgb", "--accent-soft"]);
  });
});
