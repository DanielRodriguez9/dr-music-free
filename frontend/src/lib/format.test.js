import { describe, expect, it } from "vitest";
import { greeting } from "./format";

const at = (h, m) => new Date(2026, 10, 15, h, m);

describe("saludo según la hora local", () => {
  it("cambia en los límites pedidos", () => {
    expect(greeting(at(4, 59))).toBe("Buenas noches");
    expect(greeting(at(5, 0))).toBe("Buenos días");
    expect(greeting(at(11, 59))).toBe("Buenos días");
    expect(greeting(at(12, 0))).toBe("Buenas tardes");
    expect(greeting(at(18, 29))).toBe("Buenas tardes");
    expect(greeting(at(18, 30))).toBe("Buenas noches");
    expect(greeting(at(19, 17))).toBe("Buenas noches");
    expect(greeting(at(0, 0))).toBe("Buenas noches");
  });

  it("incluye el nombre si hay uno", () => {
    expect(greeting(at(19, 17), "Daniel")).toBe("Buenas noches, Daniel");
    expect(greeting(at(9, 0), "  ")).toBe("Buenos días");
  });
});
