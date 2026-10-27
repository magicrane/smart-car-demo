import { useEffect, useRef, useState, type FormEvent, type RefObject } from "react";
import { executeUtterance, type UtteranceSource } from "../commands/executeUtterance";
import { createSpeechService, isSpeechRecognitionSupported, type SpeechService } from "../speech/speechService";
import { voiceStage, type VoiceOutcome, type VoicePhase } from "../speech/voiceStage";

const HEARING_LEVEL = 0.08;
const SIGNAL_BARS = 32;

function SoundMeter({
  phase,
  levelRef,
  tickRef,
  onHearing,
}: {
  phase: VoicePhase;
  levelRef: RefObject<number>;
  tickRef: RefObject<number>;
  onHearing: (hearing: boolean) => void;
}) {
  const active = phase === "loading" || phase === "listening";
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hearing, setHearing] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) {
      return;
    }

    const history = new Array<number>(SIGNAL_BARS).fill(0);
    let lastTick = -1;
    let heardUntil = 0;
    let frame = 0;
    let running = true;

    function draw() {
      if (!running || !canvas || !context) {
        return;
      }
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (width === 0 || height === 0) {
        frame = requestAnimationFrame(draw);
        return;
      }
      const ratio = window.devicePixelRatio || 1;
      const pixelWidth = Math.floor(width * ratio);
      const pixelHeight = Math.floor(height * ratio);
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, height);

      const tick = tickRef.current ?? 0;
      if (active && tick !== lastTick) {
        lastTick = tick;
        const level = levelRef.current ?? 0;
        history.push(level);
        history.shift();
        if (level >= HEARING_LEVEL) {
          heardUntil = performance.now() + 600;
        }
        const nowHearing = performance.now() < heardUntil;
        setHearing((current) => (current === nowHearing ? current : nowHearing));
        onHearing(nowHearing);
      }

      const gap = 3;
      const barWidth = Math.max(2, (width - gap * (SIGNAL_BARS - 1)) / SIGNAL_BARS);
      for (let index = 0; index < SIGNAL_BARS; index += 1) {
        const x = index * (barWidth + gap);
        const value = active ? (history[index] ?? 0) : 0;
        const barHeight = Math.max(3, value * (height - 4));
        context.fillStyle = "rgba(158, 186, 214, 0.16)";
        context.fillRect(x, 2, barWidth, height - 4);
        context.fillStyle = !active ? "#4d6378" : value >= HEARING_LEVEL ? "#8dffb0" : "#9fd4ff";
        context.fillRect(x, height - 2 - barHeight, barWidth, barHeight);
      }
      if (active) {
        frame = requestAnimationFrame(draw);
      }
    }

    frame = requestAnimationFrame(draw);
    return () => {
      running = false;
      cancelAnimationFrame(frame);
      setHearing(false);
      onHearing(false);
    };
  }, [active, levelRef, onHearing, tickRef]);

  const label = !active
    ? "未在聆听"
    : hearing
      ? "正在收到声音"
      : phase === "loading"
        ? "正在打开麦克风"
        : "麦克风已打开，还没有收到声音";

  return (
    <div className="voice__meter">
      <span className="voice__meter-label">声音信号</span>
      <canvas ref={canvasRef} className="voice__meter-canvas" />
      <span
        className={
          active
            ? hearing
              ? "voice__meter-state voice__meter-state--live"
              : "voice__meter-state voice__meter-state--wait"
            : "voice__meter-state"
        }
        role="status"
      >
        {label}
      </span>
    </div>
  );
}

export function VoiceControlPanel() {
  const serviceRef = useRef<SpeechService | null>(null);
  const levelRef = useRef(0);
  const levelTickRef = useRef(0);
  const [supported, setSupported] = useState(isSpeechRecognitionSupported);
  const [phase, setPhase] = useState<VoicePhase>("idle");
  const [hearing, setHearing] = useState(false);
  const [recognizing, setRecognizing] = useState(false);
  const [outcome, setOutcome] = useState<VoiceOutcome>("none");
  const [draft, setDraft] = useState("");
  const [transcript, setTranscript] = useState("无");
  const [parseSummary, setParseSummary] = useState("无");
  const [executionStatus, setExecutionStatus] = useState("未执行");
  const [errorMessage, setErrorMessage] = useState("无");

  useEffect(() => {
    const service = createSpeechService({
      onStatus(status) {
        if (status === "listening") {
          setPhase("listening");
        } else if (status === "loading") {
          setPhase("loading");
          setOutcome("none");
          setRecognizing(false);
        } else if (status === "error") {
          setPhase("error");
          setOutcome("error");
          setRecognizing(false);
        } else {
          setPhase("idle");
          setRecognizing(false);
        }
        if (status === "unsupported") {
          setSupported(false);
        }
      },
      onTranscript(text, interim) {
        setTranscript(text || "无");
        if (interim) {
          setRecognizing(true);
          setParseSummary("识别中");
          setExecutionStatus("未执行");
          setErrorMessage("无");
          return;
        }
        setRecognizing(false);
        showOutcome(text, "voice");
      },
      onError(message) {
        setErrorMessage(message);
        setExecutionStatus("未执行");
        setParseSummary("未解析");
      },
      onAudioLevel(level) {
        levelRef.current = level;
        levelTickRef.current += 1;
      },
    });
    serviceRef.current = service;
    setSupported(service.isSupported());
    return () => service.stop();
  }, []);

  function showOutcome(text: string, source: UtteranceSource) {
    const outcome = executeUtterance(text, source);
    setTranscript(outcome.transcript || "无");
    if (!outcome.parse.ok) {
      setOutcome("error");
      setParseSummary(outcome.parse.message);
      setExecutionStatus("未执行");
      setErrorMessage(outcome.parse.message);
      return;
    }

    setParseSummary(outcome.parse.summary);
    if (!outcome.execution?.ok) {
      setOutcome("error");
      setExecutionStatus(outcome.execution?.message ?? "未执行");
      setErrorMessage(outcome.execution?.message ?? "指令没有执行");
      return;
    }

    setOutcome("success");
    setExecutionStatus(outcome.execution.message);
    setErrorMessage("无");
  }

  function submitText(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    showOutcome(draft, "text");
  }

  const stage = voiceStage({ phase, hearing, recognizing, outcome });
  const hint = phase === "error" && errorMessage !== "无" ? `${errorMessage} 文本指令仍然可用。` : stage.hint;

  return (
    <section className="voice" aria-label="语音控车">
      <div className="voice__header">
        <h2>语音控车</h2>
        <span className={`voice__stage voice__stage--${stage.tone}`} role="status">{stage.label}</span>
        <button
          type="button"
          disabled={!supported}
          onClick={() => (phase === "loading" || phase === "listening" ? serviceRef.current?.stop() : serviceRef.current?.start())}
        >
          {phase === "listening" ? "停止聆听" : phase === "loading" ? "取消准备" : "开始聆听"}
        </button>
      </div>
      <SoundMeter phase={phase} levelRef={levelRef} tickRef={levelTickRef} onHearing={setHearing} />
      <p className={stage.tone === "error" ? "voice__support voice__error" : "voice__support"}>
        {supported ? hint : "当前浏览器不支持语音识别，请使用下面的文本指令。"}
      </p>
      <form className="voice__form" onSubmit={submitText}>
        <label>
          文本指令
          <input
            value={draft}
            placeholder="例如：打开左前车窗"
            onChange={(event) => setDraft(event.target.value)}
          />
        </label>
        <button type="submit">执行</button>
      </form>
      <dl className="voice__result">
        <div>
          <dt>识别文本</dt>
          <dd>{transcript}</dd>
        </div>
        <div>
          <dt>解析结果</dt>
          <dd>{parseSummary}</dd>
        </div>
        <div>
          <dt>执行状态</dt>
          <dd>{executionStatus}</dd>
        </div>
        <div>
          <dt>错误信息</dt>
          <dd className={errorMessage !== "无" ? "voice__error" : undefined}>{errorMessage}</dd>
        </div>
      </dl>
    </section>
  );
}
