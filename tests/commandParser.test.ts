import { describe, expect, it } from "vitest";
import { parseCommand } from "../src/commands/commandParser";

describe("正常指令", () => {
  it.each([
    ["打开左前车窗", { type: "open", target: "front_left" }],
    ["关闭右后车窗", { type: "close", target: "rear_right" }],
    ["打开所有车窗", { type: "open", target: "all" }],
    ["关闭全部车窗", { type: "close", target: "all" }],
    ["左前车窗开到50%", { type: "set", target: "front_left", openness: 50 }],
    ["把左前车窗开到一半", { type: "set", target: "front_left", openness: 50 }],
    ["将右前车窗调到30%", { type: "set", target: "front_right", openness: 30 }],
  ] as const)("解析「%s」", (input, command) => {
    const result = parseCommand(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.command).toEqual(command);
    }
  });
});

describe("不同说法", () => {
  it.each([
    ["请打开主驾车窗", { type: "open", target: "front_left" }],
    ["帮我把副驾车窗关上", { type: "close", target: "front_right" }],
    ["打开左前的车窗", { type: "open", target: "front_left" }],
    ["四个车窗都打开", { type: "open", target: "all" }],
    ["右后车窗关闭", { type: "close", target: "rear_right" }],
    ["左前车窗设为80", { type: "set", target: "front_left", openness: 80 }],
    ["打开左前车窗到20%", { type: "set", target: "front_left", openness: 20 }],
    ["停止左前车窗", { type: "stop", target: "front_left" }],
    ["全部车窗停下", { type: "stop", target: "all" }],
    ["  打开　左前车窗。 ", { type: "open", target: "front_left" }],
  ] as const)("解析「%s」", (input, command) => {
    const result = parseCommand(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.command).toEqual(command);
    }
  });
});

describe("未知指令", () => {
  it.each(["播放音乐", "今天天气怎么样", "打开天窗", "打开车门"])("不执行「%s」", (input) => {
    const result = parseCommand(input);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("unknown");
    }
  });
});

describe("歧义和空文本", () => {
  it.each([
    ["", "empty"],
    ["   ", "empty"],
    ["打开车窗", "ambiguous"],
    ["打开左边车窗", "ambiguous"],
    ["打开前排车窗", "ambiguous"],
    ["车窗开大一点", "ambiguous"],
    ["左前车窗开大一点", "ambiguous"],
    ["开到50%", "ambiguous"],
    ["打开左前和右前车窗", "ambiguous"],
    ["打开全部左前车窗", "ambiguous"],
    ["左前车窗开到", "ambiguous"],
  ] as const)("「%s」返回 %s", (input, code) => {
    const result = parseCommand(input);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe(code);
    }
  });

  it("超出范围的百分比不会生成指令", () => {
    const result = parseCommand("左前车窗开到150%");
    expect(result).toMatchObject({
      ok: false,
      code: "invalid_percent",
    });
  });
});
