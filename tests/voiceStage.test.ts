import { describe, expect, it } from "vitest";
import { voiceStage } from "../src/speech/voiceStage";

describe("语音状态", () => {
  const base = { phase: "idle" as const, hearing: false, recognizing: false, outcome: "none" as const };

  it("首次使用说明模型会加载，并提示文本可以兜底", () => {
    expect(voiceStage(base)).toMatchObject({
      label: "未开始",
      hint: expect.stringContaining("加载失败"),
    });
  });

  it("准备、聆听和识别中是不同状态", () => {
    expect(voiceStage({ ...base, phase: "loading" }).label).toBe("准备中");
    expect(voiceStage({ ...base, phase: "listening" }).label).toBe("聆听中");
    expect(voiceStage({ ...base, phase: "listening", hearing: true }).label).toBe("识别中");
    expect(voiceStage({ ...base, phase: "listening", recognizing: true }).label).toBe("识别中");
  });

  it("成功和失败会留下来，失败时提示改用文本", () => {
    expect(voiceStage({ ...base, outcome: "success" })).toMatchObject({ label: "成功", tone: "success" });
    expect(voiceStage({ ...base, phase: "error" }).hint).toContain("文本指令");
    expect(voiceStage({ ...base, outcome: "error" }).label).toBe("失败");
  });
});
