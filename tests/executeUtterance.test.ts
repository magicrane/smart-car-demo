import { beforeEach, describe, expect, it } from "vitest";
import { executeUtterance } from "../src/commands/executeUtterance";
import { resetVehicleForTests } from "../src/vehicle/controller";
import { getVehicleState } from "../src/vehicle/store";

beforeEach(() => {
  resetVehicleForTests();
});

describe("指令执行", () => {
  it("有效指令调用现有车辆控制器", () => {
    const outcome = executeUtterance("打开左前车窗", "text");

    expect(outcome.execution).toMatchObject({ ok: true });
    expect(getVehicleState().windows.front_left.openness).toBe(100);
    expect(getVehicleState().windows.front_right.openness).toBe(0);
    expect(getVehicleState().logs[0]).toMatchObject({ source: "text", level: "info" });
  });

  it("语音和文本使用同一个状态", () => {
    executeUtterance("打开所有车窗", "voice");
    executeUtterance("关闭右后车窗", "text");

    expect(getVehicleState().windows.rear_right.openness).toBe(0);
    expect(getVehicleState().windows.front_left.openness).toBe(100);
    expect(getVehicleState().logs.map((entry) => entry.source)).toEqual(["text", "voice"]);
  });

  it.each(["", "打开车窗", "打开左边车窗", "播放音乐", "左前车窗开到150%"])(
    "「%s」不改变车辆状态",
    (input) => {
      const before = structuredClone(getVehicleState());
      const outcome = executeUtterance(input, "voice");

      expect(outcome.execution).toBeNull();
      expect(getVehicleState()).toEqual(before);
    },
  );
});
