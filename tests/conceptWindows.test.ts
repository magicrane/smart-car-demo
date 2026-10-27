import { BufferAttribute, BufferGeometry } from "three";
import { describe, expect, it } from "vitest";
import { DOOR_WINDOW_BINDINGS, splitGeometryBySign } from "../src/scene/prepareConceptCar";

describe("概念车侧窗", () => {
  it("按模型的 L/R 命名对应左前和右前", () => {
    expect(DOOR_WINDOW_BINDINGS).toEqual([
      { nodeName: "BodyDoorLWindow", windowId: "front_left" },
      { nodeName: "BodyDoorRWindow", windowId: "front_right" },
    ]);
  });

  it("按局部坐标的正负把连在一起的侧窗拆成两扇", () => {
    const geometry = new BufferGeometry();
    geometry.setAttribute(
      "position",
      new BufferAttribute(
        new Float32Array([
          -2, 0, 0, -1, 1, 0, -1, 0, 0,
          1, 0, 0, 2, 1, 0, 2, 0, 0,
        ]),
        3,
      ),
    );

    const parts = splitGeometryBySign(geometry, "x");

    expect(parts.negative.getAttribute("position").count).toBe(3);
    expect(parts.positive.getAttribute("position").count).toBe(3);
    expect(parts.negative.getAttribute("position").getX(0)).toBeLessThan(0);
    expect(parts.positive.getAttribute("position").getX(0)).toBeGreaterThan(0);
  });
});