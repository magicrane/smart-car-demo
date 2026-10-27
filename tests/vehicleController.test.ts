import { beforeEach, describe, expect, it } from "vitest";
import { applyCommand, resetVehicleForTests, syncDisplayedProgress } from "../src/vehicle/controller";
import { getVehicleState } from "../src/vehicle/store";
import type { VehicleCommand, WindowId } from "../src/vehicle/types";
import { OPENNESS_PER_SECOND, setFrameDisplayed, stepOpenness } from "../src/vehicle/windowMotion";

beforeEach(() => {
  resetVehicleForTests();
});

describe("车辆状态", () => {
  it("初始时四扇车窗都关闭", () => {
    for (const windowId of ["front_left", "front_right", "rear_left", "rear_right"] as const) {
      expect(getVehicleState().windows[windowId]).toEqual({
        openness: 0,
        displayed: 0,
        motion: "idle",
      });
    }
  });

  it("打开一扇车窗时不影响其他车窗", () => {
    const result = applyCommand({ type: "open", target: "front_left" }, "panel");

    expect(result).toEqual({ ok: true, message: "打开左前车窗" });
    expect(getVehicleState().windows.front_left).toMatchObject({ openness: 100, motion: "opening" });
    expect(getVehicleState().windows.front_right.openness).toBe(0);
    expect(getVehicleState().windows.rear_left.openness).toBe(0);
    expect(getVehicleState().windows.rear_right.openness).toBe(0);
  });

  it("点击和面板操作写入同一份状态", () => {
    applyCommand({ type: "open", target: "rear_right" }, "pointer");
    applyCommand({ type: "close", target: "rear_right" }, "panel");

    expect(getVehicleState().windows.rear_right.openness).toBe(0);
    expect(getVehicleState().logs.map((entry) => entry.source)).toEqual(["panel", "pointer"]);
  });

  it("目标开度为 0 时切换为打开，否则切换为关闭", () => {
    applyCommand({ type: "toggle", target: "front_right" }, "pointer");
    expect(getVehicleState().windows.front_right.openness).toBe(100);

    applyCommand({ type: "set", target: "front_right", openness: 40 }, "panel");
    applyCommand({ type: "toggle", target: "front_right" }, "pointer");
    expect(getVehicleState().windows.front_right.openness).toBe(0);
  });

  it("把开度限制在 0 到 100", () => {
    applyCommand({ type: "set", target: "front_left", openness: 150 }, "panel");
    expect(getVehicleState().windows.front_left.openness).toBe(100);

    applyCommand({ type: "set", target: "front_left", openness: -20 }, "panel");
    expect(getVehicleState().windows.front_left.openness).toBe(0);
  });

  it("拒绝不是有限数字的开度，并且不改状态", () => {
    applyCommand({ type: "open", target: "front_left" }, "panel");
    const before = structuredClone(getVehicleState().windows);

    const result = applyCommand(
      { type: "set", target: "front_left", openness: Number.NaN },
      "panel",
    );

    expect(result).toMatchObject({ ok: false, code: "invalid_openness" });
    expect(getVehicleState().windows).toEqual(before);
    expect(getVehicleState().logs[0]).toMatchObject({ level: "error" });
  });

  it("拒绝非法车窗编号，并且不改任何车窗", () => {
    const before = structuredClone(getVehicleState().windows);
    const result = applyCommand(
      { type: "open", target: "sunroof" as WindowId },
      "panel",
    );

    expect(result).toEqual({
      ok: false,
      code: "invalid_window",
      message: "无法识别车窗「sunroof」",
    });
    expect(getVehicleState().windows).toEqual(before);
    expect(getVehicleState().logs).toHaveLength(1);
    expect(getVehicleState().logs[0].level).toBe("error");
  });

  it("停止时提交当前动画开度", () => {
    applyCommand({ type: "open", target: "front_left" }, "panel");
    setFrameDisplayed("front_left", 42.4);

    const result = applyCommand({ type: "stop", target: "front_left" }, "panel");

    expect(result).toEqual({ ok: true, message: "左前车窗已停止在 42%" });
    expect(getVehicleState().windows.front_left).toEqual({
      openness: 42,
      displayed: 42,
      motion: "idle",
    });
  });

  it("可以同时打开、关闭和停止全部车窗", () => {
    applyCommand({ type: "open", target: "all" }, "panel");
    for (const windowId of ["front_left", "front_right", "rear_left", "rear_right"] as const) {
      expect(getVehicleState().windows[windowId].openness).toBe(100);
    }

    setFrameDisplayed("front_left", 10);
    setFrameDisplayed("front_right", 20);
    setFrameDisplayed("rear_left", 30);
    setFrameDisplayed("rear_right", 40);
    applyCommand({ type: "stop", target: "all" }, "panel");

    expect(getVehicleState().windows.front_left.openness).toBe(10);
    expect(getVehicleState().windows.front_right.openness).toBe(20);
    expect(getVehicleState().windows.rear_left.openness).toBe(30);
    expect(getVehicleState().windows.rear_right.openness).toBe(40);

    applyCommand({ type: "close", target: "all" }, "panel");
    expect(getVehicleState().windows.rear_right.openness).toBe(0);
    expect(getVehicleState().logs[0].message).toBe("关闭全部车窗");
  });

  it("进度同步会更新当前开度，到位后变为停止", () => {
    applyCommand({ type: "open", target: "rear_left" }, "panel");
    syncDisplayedProgress({ rear_left: 35 });

    expect(getVehicleState().windows.rear_left).toMatchObject({
      openness: 100,
      displayed: 35,
      motion: "opening",
    });

    syncDisplayedProgress({ rear_left: 100 });
    expect(getVehicleState().windows.rear_left).toMatchObject({
      displayed: 100,
      motion: "idle",
    });
  });

  it("连续拖动滑块只保留最新一条开度日志", () => {
    applyCommand({ type: "set", target: "front_left", openness: 20 }, "panel");
    applyCommand({ type: "set", target: "front_left", openness: 80 }, "panel");

    const setLogs = getVehicleState().logs.filter((entry) => entry.message.includes("开度调整为"));
    expect(setLogs).toHaveLength(1);
    expect(setLogs[0].message).toBe("左前车窗开度调整为 80%");
  });

  it("操作日志最多保留 50 条", () => {
    for (let index = 0; index < 60; index += 1) {
      const type = index % 2 === 0 ? "open" : "close";
      applyCommand({ type, target: "front_left" }, "panel");
    }

    expect(getVehicleState().logs).toHaveLength(50);
  });

  it("开度按每秒 80 前进，并且不会越过目标", () => {
    expect(stepOpenness(0, 100, 0.5)).toBe(OPENNESS_PER_SECOND * 0.5);
    expect(stepOpenness(90, 100, 0.5)).toBe(100);
    expect(stepOpenness(100, 0, 0.25)).toBe(80);
  });

  it("拒绝一次切换全部车窗", () => {
    const result = applyCommand({ type: "toggle", target: "all" } as VehicleCommand, "panel");

    expect(result).toMatchObject({ ok: false, code: "invalid_command" });
    expect(getVehicleState().windows.front_left.openness).toBe(0);
  });
});
