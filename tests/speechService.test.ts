import { describe, expect, it, vi } from "vitest";
import {
  createSpeechService,
  prepareOnDeviceSpeech,
  type BrowserSpeechRecognition,
  type SpeechRecognitionResultEvent,
} from "../src/speech/speechService";

class FakeRecognition implements BrowserSpeechRecognition {
  lang = "";
  continuous = true;
  interimResults = false;
  processLocally = false;
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  started = false;

  start() {
    this.started = true;
  }

  stop() {
    this.onend?.();
  }
}

function result(transcript: string, isFinal: boolean): SpeechRecognitionResultEvent {
  return {
    resultIndex: 0,
    results: [
      {
        isFinal,
        length: 1,
        0: { transcript },
      },
    ],
  };
}

describe("语音识别服务", () => {
  it("不支持时不会开始识别", () => {
    const onError = vi.fn();
    const onTranscript = vi.fn();
    const service = createSpeechService(
      { onStatus: vi.fn(), onTranscript, onError },
      () => null,
    );

    expect(service.isSupported()).toBe(false);
    service.start();
    expect(onTranscript).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith("当前浏览器不支持语音识别，请使用文本指令");
  });

  it("只把最终文本交给调用方，中间结果单独标记", () => {
    const recognition = new FakeRecognition();
    const onTranscript = vi.fn();
    const service = createSpeechService(
      { onStatus: vi.fn(), onTranscript, onError: vi.fn() },
      () => recognition,
    );

    service.start();
    recognition.onresult?.(result("打开左", false));
    recognition.onresult?.(result("打开左前车窗", true));

    expect(recognition.lang).toBe("zh-CN");
    expect(recognition.interimResults).toBe(true);
    expect(onTranscript).toHaveBeenNthCalledWith(1, "打开左", true);
    expect(onTranscript).toHaveBeenNthCalledWith(2, "打开左前车窗", false);
  });

  it("优先在本机识别，不把声音发到在线服务", async () => {
    const recognition = new FakeRecognition();
    const onTranscript = vi.fn();
    const service = createSpeechService(
      { onStatus: vi.fn(), onTranscript, onError: vi.fn() },
      () => recognition,
      () => Promise.resolve({ mode: "local" }),
    );

    service.start();
    expect(recognition.started).toBe(false);
    await Promise.resolve();

    expect(recognition.processLocally).toBe(true);
    expect(recognition.started).toBe(true);
    expect(onTranscript).not.toHaveBeenCalled();
  });

  it("取消准备后不会开始识别", async () => {
    const recognition = new FakeRecognition();
    let resolvePlan: (plan: { mode: "local" }) => void = () => undefined;
    const service = createSpeechService(
      { onStatus: vi.fn(), onTranscript: vi.fn(), onError: vi.fn() },
      () => recognition,
      () => new Promise((resolve) => {
        resolvePlan = resolve;
      }),
    );

    service.start();
    service.stop();
    resolvePlan({ mode: "local" });
    await Promise.resolve();

    expect(recognition.started).toBe(false);
  });

  it("在线服务连不上时不产生可执行文本", () => {
    const recognition = new FakeRecognition();
    const onTranscript = vi.fn();
    const onError = vi.fn();
    const service = createSpeechService(
      { onStatus: vi.fn(), onTranscript, onError },
      () => recognition,
    );

    service.start();
    recognition.onerror?.({ error: "network" });

    expect(onTranscript).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith("浏览器的在线语音服务连不上，请使用文本指令");
  });

  it("识别失败时不产生可执行文本", () => {
    const recognition = new FakeRecognition();
    const onTranscript = vi.fn();
    const onError = vi.fn();
    const service = createSpeechService(
      { onStatus: vi.fn(), onTranscript, onError },
      () => recognition,
    );

    service.start();
    recognition.onerror?.({ error: "no-speech" });

    expect(onTranscript).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith("没有听到语音");
  });
});

describe("本机语音包", () => {
  it("已安装时直接在本机识别", async () => {
    await expect(prepareOnDeviceSpeech({
      available: vi.fn().mockResolvedValue("available"),
    })).resolves.toEqual({ mode: "local" });
  });

  it("缺少浏览器语音包时改用已下载的本机模型", async () => {
    const install = vi.fn().mockResolvedValue(false);
    await expect(prepareOnDeviceSpeech({
      available: vi.fn().mockResolvedValue("downloadable"),
      install,
    })).resolves.toEqual({ mode: "bundled" });
    expect(install).toHaveBeenCalledWith({
      langs: ["zh-CN"],
      processLocally: true,
      quality: "command",
    });
  });

  it("浏览器没有本机识别接口时才退回在线服务", async () => {
    await expect(prepareOnDeviceSpeech({})).resolves.toEqual({ mode: "cloud" });
  });

  it("浏览器不能本机识别时使用已下载模型，不连接在线服务", async () => {
    const recognition = new FakeRecognition();
    const onTranscript = vi.fn();
    const onError = vi.fn();
    const engine = { start: vi.fn().mockResolvedValue(undefined), stop: vi.fn() };
    const plan = await prepareOnDeviceSpeech({
      available: vi.fn().mockResolvedValue("unavailable"),
    });
    const service = createSpeechService(
      { onStatus: vi.fn(), onTranscript, onError },
      () => recognition,
      () => plan,
      () => engine,
    );

    service.start();
    await Promise.resolve();

    expect(plan.mode).toBe("bundled");
    expect(recognition.started).toBe(false);
    expect(engine.start).toHaveBeenCalledOnce();
    expect(onTranscript).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });
});
