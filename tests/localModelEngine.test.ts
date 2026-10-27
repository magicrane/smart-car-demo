import { describe, expect, it } from "vitest";
import { audioLevel, cleanRecognizedText } from "../src/speech/localModelEngine";

describe("本机识别文本", () => {
  it("去掉中文结果里的空格", () => {
    expect(cleanRecognizedText("打 开 左 前 车 窗")).toBe("打开左前车窗");
    expect(cleanRecognizedText("   ")).toBe("");
  });

  it("把麦克风采样换成 0 到 1 的音量", () => {
    expect(audioLevel([])).toBe(0);
    expect(audioLevel([0, 0, 0, 0])).toBe(0);
    const quiet = audioLevel([0.02, -0.02, 0.01, -0.01]);
    const speech = audioLevel([0.2, -0.18, 0.22, -0.16]);
    expect(quiet).toBeGreaterThan(0);
    expect(speech).toBeGreaterThan(quiet);
    expect(audioLevel([1, -1, 1, -1])).toBe(1);
  });
});
