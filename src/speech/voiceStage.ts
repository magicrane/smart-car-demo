export type VoicePhase = "idle" | "loading" | "listening" | "error";
export type VoiceOutcome = "none" | "success" | "error";
export type VoiceTone = "idle" | "progress" | "live" | "success" | "error";

export type VoiceStage = {
  label: string;
  tone: VoiceTone;
  hint: string;
};

export function voiceStage(input: {
  phase: VoicePhase;
  hearing: boolean;
  recognizing: boolean;
  outcome: VoiceOutcome;
}): VoiceStage {
  if (input.phase === "loading") {
    return {
      label: "准备中",
      tone: "progress",
      hint: "正在加载本机中文语音模型，第一次会稍久。此时可以直接输入文本指令。",
    };
  }

  if (input.phase === "listening" && (input.hearing || input.recognizing)) {
    return {
      label: "识别中",
      tone: "live",
      hint: "正在识别，请把指令说完整。",
    };
  }

  if (input.phase === "error" || input.outcome === "error") {
    return {
      label: "失败",
      tone: "error",
      hint: "语音没有执行。请改用下面的文本指令，例如：打开左前车窗。",
    };
  }

  if (input.phase === "listening") {
    return {
      label: "聆听中",
      tone: "live",
      hint: "请说：打开左前车窗，或关闭所有车窗。",
    };
  }

  if (input.outcome === "success") {
    return {
      label: "成功",
      tone: "success",
      hint: "指令已执行。可以继续输入下一条，或再次开始聆听。",
    };
  }

  return {
    label: "未开始",
    tone: "idle",
    hint: "点「开始聆听」会加载本机语音模型。如果加载失败，直接在下面输入指令。",
  };
}
