import type { Model } from "vosk-browser";

const MODEL_PATH = "/models/vosk-model-small-cn-0.22.tar.gz";

export type OfflineSpeechEvents = {
  onPartial: (text: string) => void;
  onFinal: (text: string) => void;
  onLevel?: (level: number) => void;
};

export type OfflineSpeechEngine = {
  start: (audio?: AudioContext) => Promise<void>;
  stop: () => void;
};

let modelPromise: Promise<Model> | null = null;

export function createLocalModelEngine(events: OfflineSpeechEvents): OfflineSpeechEngine {
  let stopped = false;
  let cleanup = () => {};

  return {
    async start(audio?: AudioContext) {
      const context = audio && audio.state !== "closed" ? audio : new AudioContext();
      let stream: MediaStream | null = null;
      let recognizer: InstanceType<Model["KaldiRecognizer"]> | null = null;
      let timer = 0;
      let closed = false;
      const nodes: Array<{ disconnect: () => void }> = [];

      const closeAll = () => {
        if (closed) {
          return;
        }
        closed = true;
        window.clearInterval(timer);
        recognizer?.remove();
        for (const node of nodes) {
          try {
            node.disconnect();
          } catch {
            // The node is already disconnected.
          }
        }
        if (stream) {
          stopStream(stream);
        }
        void context.close();
        events.onLevel?.(0);
      };
      cleanup = closeAll;

      try {
        await context.resume();
        stream = await requestMicrophone();
        if (stopped) {
          closeAll();
          return;
        }

        const source = context.createMediaStreamSource(stream);
        const analyser = context.createAnalyser();
        analyser.fftSize = 2048;
        analyser.smoothingTimeConstant = 0.2;
        const keepAlive = context.createGain();
        keepAlive.gain.value = 0.0001;
        source.connect(analyser);
        analyser.connect(keepAlive);
        keepAlive.connect(context.destination);
        nodes.push(source, analyser, keepAlive);

        const samples = new Float32Array(analyser.fftSize);
        timer = window.setInterval(() => {
          if (context.state === "suspended") {
            void context.resume();
          }
          analyser.getFloatTimeDomainData(samples);
          events.onLevel?.(audioLevel(samples));
          if (!recognizer) {
            return;
          }
          try {
            recognizer.acceptWaveformFloat(samples.slice(), context.sampleRate);
          } catch {
            // Listening has already stopped.
          }
        }, 50);

        const model = await loadModel();
        if (stopped) {
          closeAll();
          return;
        }
        recognizer = new model.KaldiRecognizer(context.sampleRate);
        recognizer.on("partialresult", (message) => {
          if (message.event !== "partialresult") {
            return;
          }
          const text = cleanRecognizedText(message.result.partial);
          if (text) {
            events.onPartial(text);
          }
        });
        recognizer.on("result", (message) => {
          if (message.event !== "result") {
            return;
          }
          const text = cleanRecognizedText(message.result.text);
          if (text) {
            events.onFinal(text);
          }
        });
      } catch (error) {
        closeAll();
        throw error;
      }
    },
    stop() {
      stopped = true;
      cleanup();
      cleanup = () => undefined;
    },
  };
}

export function cleanRecognizedText(text: string): string {
  return text.replace(/\s+/g, "").trim();
}

export function audioLevel(samples: ArrayLike<number>): number {
  if (samples.length === 0) {
    return 0;
  }
  let sum = 0;
  let peak = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const value = samples[index] ?? 0;
    const abs = value < 0 ? -value : value;
    if (abs > peak) {
      peak = abs;
    }
    sum += value * value;
  }
  const rms = Math.sqrt(sum / samples.length);
  return Math.min(1, Math.max(rms * 14, peak * 3));
}

async function loadModel(): Promise<Model> {
  if (!modelPromise) {
    modelPromise = loadVosk()
      .then((vosk) => vosk.createModel(new URL(MODEL_PATH, window.location.origin).toString()))
      .catch((error: unknown) => {
        modelPromise = null;
        const message = error instanceof Error && error.message
          ? error.message
          : "本机语音模型加载失败，请使用文本指令";
        throw new Error(message);
      });
  }
  return modelPromise;
}

async function loadVosk(): Promise<{ createModel: (modelUrl: string) => Promise<Model> }> {
  const host = window as Window & {
    Vosk?: { createModel: (modelUrl: string) => Promise<Model> };
  };
  if (!host.Vosk?.createModel) {
    await import("vosk-browser");
  }
  if (!host.Vosk?.createModel) {
    throw new Error("本机语音模型加载失败，请使用文本指令");
  }
  return host.Vosk;
}

async function requestMicrophone(): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: true,
      },
      video: false,
    });
  } catch {
    throw new Error("没有获得麦克风权限，请使用文本指令");
  }
}

function stopStream(stream: MediaStream) {
  for (const track of stream.getTracks()) {
    track.stop();
  }
}
