import { createLocalModelEngine, type OfflineSpeechEngine, type OfflineSpeechEvents } from "./localModelEngine";

export type SpeechListenStatus = "unsupported" | "idle" | "loading" | "listening" | "error";

export type SpeechRecognitionResultEvent = {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
};

type SpeechRecognitionResultLike = ArrayLike<{ transcript: string }> & {
  isFinal: boolean;
};

export type BrowserSpeechRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  processLocally?: boolean;
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

export type SpeechAvailability = "available" | "downloading" | "downloadable" | "unavailable";

export type OnDeviceSpeechOptions = {
  langs: string[];
  processLocally: boolean;
  quality: "command";
};

export type SpeechRecognitionConstructor = {
  new (): BrowserSpeechRecognition;
  available?: (options: OnDeviceSpeechOptions) => Promise<SpeechAvailability>;
  install?: (options: OnDeviceSpeechOptions) => Promise<boolean>;
};

export type LocalSpeechPlan =
  | { mode: "local" | "cloud" | "bundled" }
  | { mode: "failed"; message: string };

const ON_DEVICE_OPTIONS: OnDeviceSpeechOptions = {
  langs: ["zh-CN"],
  processLocally: true,
  quality: "command",
};

type SpeechHandlers = {
  onStatus: (status: SpeechListenStatus) => void;
  onTranscript: (text: string, interim: boolean) => void;
  onError: (message: string) => void;
  onAudioLevel?: (level: number) => void;
};

export type SpeechService = {
  isSupported: () => boolean;
  start: () => void;
  stop: () => void;
};

export function createSpeechService(
  handlers: SpeechHandlers,
  recognitionFactory: () => BrowserSpeechRecognition | null = defaultRecognitionFactory,
  prepareSpeech: () => LocalSpeechPlan | Promise<LocalSpeechPlan> = defaultPrepareSpeech,
  createBundledEngine: (events: OfflineSpeechEvents) => OfflineSpeechEngine = createLocalModelEngine,
): SpeechService {
  let recognition: BrowserSpeechRecognition | null = null;
  let stopBundled: (() => void) | null = null;
  let session = 0;

  function openBundled(current: number, audio: AudioContext | null) {
    const engine = createBundledEngine({
      onPartial(text) {
        if (current !== session) {
          return;
        }
        handlers.onTranscript(text, true);
      },
      onFinal(text) {
        if (current !== session) {
          return;
        }
        handlers.onTranscript(text, false);
      },
      onLevel(level) {
        if (current !== session) {
          return;
        }
        handlers.onAudioLevel?.(level);
      },
    });
    stopBundled = () => engine.stop();
    handlers.onStatus("loading");
    void engine.start(audio ?? undefined).then(
      () => {
        if (current !== session) {
          engine.stop();
          return;
        }
        handlers.onStatus("listening");
      },
      (error: unknown) => {
        if (current !== session) {
          return;
        }
        handlers.onError(error instanceof Error ? error.message : "无法开始本机语音识别，请使用文本指令");
        handlers.onStatus("error");
      },
    );
  }

  function openRecognition(plan: LocalSpeechPlan, current: number, audio: AudioContext | null) {
    if (current !== session) {
      void audio?.close();
      return;
    }
    if (plan.mode === "bundled") {
      openBundled(current, audio);
      return;
    }
    void audio?.close();
    if (plan.mode === "failed") {
      handlers.onError(plan.message);
      handlers.onStatus("error");
      return;
    }

    const next = recognitionFactory();
    if (!next) {
      handlers.onError("当前浏览器不支持语音识别，请使用文本指令");
      handlers.onStatus("unsupported");
      return;
    }

    recognition = next;
    recognition.lang = "zh-CN";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.processLocally = plan.mode === "local";
    recognition.onresult = (event) => {
      if (current !== session) {
        return;
      }
      const transcript = readTranscript(event);
      if (transcript.sawFinal) {
        handlers.onTranscript(transcript.finalText, false);
        return;
      }
      if (transcript.interimText) {
        handlers.onTranscript(transcript.interimText, true);
      }
    };
    recognition.onerror = (event) => {
      if (event.error === "aborted" || current !== session) {
        return;
      }
      handlers.onError(speechErrorMessage(event.error));
      handlers.onStatus("error");
    };
    recognition.onend = () => {
      if (current !== session) {
        return;
      }
      handlers.onStatus("idle");
    };

    try {
      recognition.start();
      handlers.onStatus("listening");
    } catch {
      handlers.onError("无法开始语音识别，请使用文本指令");
      handlers.onStatus("error");
    }
  }

  return {
    isSupported() {
      return recognitionFactory() !== null;
    },
    start() {
      const current = ++session;
      recognition?.stop();
      stopBundled?.();
      stopBundled = null;
      const audio = createListeningContext();
      const prepared = prepareSpeech();
      if (isPromise(prepared)) {
        handlers.onStatus("loading");
        void prepared.then(
          (plan) => openRecognition(plan, current, audio),
          () => {
            void audio?.close();
            if (current !== session) {
              return;
            }
            handlers.onError("无法准备本机语音识别，请使用文本指令");
            handlers.onStatus("error");
          },
        );
        return;
      }
      openRecognition(prepared, current, audio);
    },
    stop() {
      session += 1;
      recognition?.stop();
      stopBundled?.();
      stopBundled = null;
      handlers.onAudioLevel?.(0);
      handlers.onStatus("idle");
    },
  };
}

export async function prepareOnDeviceSpeech(
  recognition: Pick<SpeechRecognitionConstructor, "available" | "install"> | null | undefined,
): Promise<LocalSpeechPlan> {
  if (!recognition?.available) {
    return { mode: "cloud" };
  }

  let status: SpeechAvailability;
  try {
    status = await recognition.available(ON_DEVICE_OPTIONS);
  } catch {
    return { mode: "bundled" };
  }

  if (status === "available") {
    return { mode: "local" };
  }
  if (status === "downloadable" || status === "downloading") {
    if (!recognition.install) {
      return { mode: "bundled" };
    }
    try {
      const installed = await recognition.install(ON_DEVICE_OPTIONS);
      return installed ? { mode: "local" } : { mode: "bundled" };
    } catch {
      return { mode: "bundled" };
    }
  }
  return { mode: "bundled" };
}

export function isSpeechRecognitionSupported(): boolean {
  return defaultRecognitionFactory() !== null;
}

export function speechErrorMessage(error: string): string {
  switch (error) {
    case "not-allowed":
    case "service-not-allowed":
      return "没有获得麦克风权限，请使用文本指令";
    case "no-speech":
      return "没有听到语音";
    case "network":
      return "浏览器的在线语音服务连不上，请使用文本指令";
    case "language-not-supported":
      return "本机还没有可用的中文语音包，请使用文本指令";
    case "audio-capture":
      return "没有检测到麦克风，请使用文本指令";
    default:
      return "语音识别失败，请使用文本指令";
  }
}

function readTranscript(event: SpeechRecognitionResultEvent): {
  sawFinal: boolean;
  finalText: string;
  interimText: string;
} {
  let sawFinal = false;
  let finalText = "";
  let interimText = "";
  for (let index = event.resultIndex; index < event.results.length; index += 1) {
    const result = event.results[index];
    const text = result[0]?.transcript ?? "";
    if (result.isFinal) {
      sawFinal = true;
      finalText += text;
    } else {
      interimText += text;
    }
  }
  return { sawFinal, finalText: finalText.trim(), interimText: interimText.trim() };
}

function defaultPrepareSpeech(): LocalSpeechPlan | Promise<LocalSpeechPlan> {
  const recognition = recognitionConstructor();
  if (!recognition?.available) {
    return { mode: "cloud" };
  }
  return prepareOnDeviceSpeech(recognition);
}

function defaultRecognitionFactory(): BrowserSpeechRecognition | null {
  const Recognition = recognitionConstructor();
  return Recognition ? new Recognition() : null;
}

function recognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") {
    return null;
  }

  const host = window as Window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  const standard = host.SpeechRecognition;
  const webkit = host.webkitSpeechRecognition;
  if (standard?.available) {
    return standard;
  }
  if (webkit?.available) {
    return webkit;
  }
  return standard ?? webkit ?? null;
}

function createListeningContext(): AudioContext | null {
  const Context = globalThis.AudioContext;
  if (!Context) {
    return null;
  }
  const context = new Context();
  void context.resume();
  return context;
}

function isPromise<T>(value: T | Promise<T>): value is Promise<T> {
  return typeof (value as Promise<T>)?.then === "function";
}
