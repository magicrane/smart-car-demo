import { WINDOW_LABELS, type VehicleCommand, type WindowId } from "../vehicle/types";

const WINDOW_PHRASES: Array<[string, WindowId]> = [
  ["主驾驶", "front_left"],
  ["驾驶员", "front_left"],
  ["驾驶座", "front_left"],
  ["副驾驶", "front_right"],
  ["左前", "front_left"],
  ["右前", "front_right"],
  ["左后", "rear_left"],
  ["右后", "rear_right"],
  ["主驾", "front_left"],
  ["副驾", "front_right"],
  ["司机", "front_left"],
];

const ALL_PHRASES = ["所有", "全部", "四个"];
const AMBIGUOUS_POSITIONS = ["左边", "右边", "左侧", "右侧", "前排", "后排", "前面", "后面"];
const PERCENT_VERBS = ["设置为", "设为", "调到", "调成", "开成", "开到"];

export type ParsedCommand =
  | { ok: true; command: VehicleCommand; summary: string }
  | { ok: false; code: "empty" | "unknown" | "ambiguous" | "invalid_percent"; message: string };

export function parseCommand(input: string): ParsedCommand {
  const text = normalizeCommandText(input);
  if (!text) {
    return fail("empty", "没有识别到指令");
  }

  if (/天窗|车门|空调|车灯|后备箱|引擎盖/.test(text)) {
    return fail("unknown", "当前只能控制四扇侧窗");
  }

  if (/开大|开小|关小|开一点|关一点|开一些|高一点|低一点/.test(text)) {
    return fail("ambiguous", "请直接说打开、关闭或具体百分比");
  }

  const target = findTarget(text);
  if (target.kind === "ambiguous") {
    return fail("ambiguous", target.message);
  }

  const percent = findPercent(text);
  if (percent.kind === "invalid") {
    return fail("invalid_percent", percent.message);
  }
  if (percent.kind === "ambiguous") {
    return fail("ambiguous", percent.message);
  }
  if (percent.kind === "missing") {
    return fail("ambiguous", "请说明要设置的百分比");
  }

  const wantsStop = /停止|停下|暂停/.test(text);
  if (wantsStop && percent.kind === "value") {
    return fail("ambiguous", "停止和设置百分比不能同时使用");
  }

  const action = findAction(text, percent.kind === "value");
  if (!action) {
    return fail("unknown", "无法理解这条指令");
  }

  if (action === "set") {
    if (percent.kind !== "value") {
      return fail("ambiguous", "请说明要设置的百分比");
    }
    if (!target.value) {
      return fail("ambiguous", "请说明要调整哪一扇车窗");
    }
    return ok(
      { type: "set", target: target.value, openness: percent.value },
      `${targetLabel(target.value)}设置为 ${percent.value}%`,
    );
  }

  if (!target.value) {
    return fail("ambiguous", "请说明要操作哪一扇车窗");
  }

  const verb = action === "open" ? "打开" : action === "close" ? "关闭" : "停止";
  return ok({ type: action, target: target.value }, `${verb}${targetLabel(target.value)}`);
}

export function normalizeCommandText(input: string): string {
  return input
    .trim()
    .replace(/[０-９]/g, (digit) => String.fromCharCode(digit.charCodeAt(0) - 0xfee0))
    .replace(/[\s,，。.!！？?、；;：:“”"‘’'（）()【】[\]·~～]/g, "")
    .replace(/请|帮我|麻烦你|麻烦|一下|的|把|将|都/g, "");
}

function ok(command: VehicleCommand, summary: string): ParsedCommand {
  return { ok: true, command, summary };
}

function fail(code: Extract<ParsedCommand, { ok: false }>["code"], message: string): ParsedCommand {
  return { ok: false, code, message };
}

function findTarget(text: string): { kind: "value"; value: WindowId | "all" | null } | { kind: "ambiguous"; message: string } {
  const matchedIds = new Set<WindowId>();
  for (const [phrase, windowId] of WINDOW_PHRASES) {
    if (text.includes(phrase)) {
      matchedIds.add(windowId);
    }
  }

  const mentionsAll = ALL_PHRASES.some((phrase) => text.includes(phrase));
  if (mentionsAll && matchedIds.size > 0) {
    return { kind: "ambiguous", message: "不要同时指定某一扇和全部车窗" };
  }
  if (matchedIds.size > 1) {
    return { kind: "ambiguous", message: "一次只能控制一扇或全部车窗" };
  }
  if (mentionsAll) {
    return { kind: "value", value: "all" };
  }
  if (matchedIds.size === 1) {
    return { kind: "value", value: [...matchedIds][0] };
  }
  if (AMBIGUOUS_POSITIONS.some((phrase) => text.includes(phrase))) {
    return { kind: "ambiguous", message: "请说清楚是左前、右前、左后还是右后" };
  }
  return { kind: "value", value: null };
}

function findPercent(
  text: string,
): { kind: "none" | "missing" } | { kind: "value"; value: number } | { kind: "invalid" | "ambiguous"; message: string } {
  const values: number[] = [];
  if (/一半|半开/.test(text)) {
    values.push(50);
  }
  if (/百分之百|百分百/.test(text)) {
    values.push(100);
  }

  const spoken = text.match(/百分之(\d{1,3})/);
  if (spoken) {
    values.push(Number(spoken[1]));
  }

  const signed = text.match(/(-?\d{1,3})[%％]/);
  if (signed) {
    values.push(Number(signed[1]));
  }

  for (const verb of PERCENT_VERBS) {
    const index = text.indexOf(verb);
    if (index === -1) {
      continue;
    }
    const tail = text.slice(index + verb.length);
    const number = tail.match(/^-?\d{1,3}/);
    if (number) {
      values.push(Number(number[0]));
    }
  }

  const unique = [...new Set(values)];
  if (unique.length > 1) {
    return { kind: "ambiguous", message: "百分比有两种理解，请只说一个数字" };
  }
  if (unique.length === 1) {
    const value = unique[0];
    if (!Number.isInteger(value) || value < 0 || value > 100) {
      return { kind: "invalid", message: "百分比需要在 0 到 100 之间" };
    }
    return { kind: "value", value };
  }
  if (PERCENT_VERBS.some((verb) => text.includes(verb))) {
    return { kind: "missing" };
  }
  return { kind: "none" };
}

function findAction(text: string, hasPercent: boolean): "open" | "close" | "stop" | "set" | null {
  if (hasPercent) {
    return "set";
  }
  if (/停止|停下|暂停/.test(text)) {
    return "stop";
  }
  if (/关闭|关上|关窗|车窗关/.test(text) || text.startsWith("关")) {
    return "close";
  }
  if (/打开|开窗|车窗开/.test(text) || text.startsWith("开")) {
    return "open";
  }
  return null;
}

function targetLabel(target: WindowId | "all"): string {
  if (target === "all") {
    return "全部车窗";
  }
  return WINDOW_LABELS[target];
}
