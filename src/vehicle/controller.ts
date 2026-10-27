import { getVehicleState, resetVehicleState, setVehicleState } from "./store";
import {
  DISPLAY_EPSILON,
  readDisplayed,
  resetFrameDisplayed,
  setFrameDisplayed,
} from "./windowMotion";
import {
  WINDOW_IDS,
  WINDOW_LABELS,
  isWindowId,
  type CommandSource,
  type ControlResult,
  type LogEntry,
  type VehicleCommand,
  type VehicleState,
  type WindowId,
  type WindowMotion,
} from "./types";

const LOG_LIMIT = 50;
const COALESCE_MS = 400;

let logCounter = 0;

export function resetVehicleForTests(): void {
  logCounter = 0;
  resetFrameDisplayed();
  resetVehicleState();
}

export function applyCommand(command: VehicleCommand, source: CommandSource): ControlResult {
  switch (command.type) {
    case "open":
      return setOpenness(command.target, 100, source, "open");
    case "close":
      return setOpenness(command.target, 0, source, "close");
    case "set":
      return setOpenness(command.target, command.openness, source, "set");
    case "stop":
      return stopWindows(command.target, source);
    case "toggle":
      return toggleWindow(command.target, source);
    default:
      return reject("invalid_command", "无法识别的操作", source);
  }
}

export const vehicleController = {
  applyCommand,
};

export function syncDisplayedProgress(values: Partial<Record<WindowId, number>>): void {
  const current = getVehicleState();
  let changed = false;
  const windows = { ...current.windows };

  for (const windowId of WINDOW_IDS) {
    const raw = values[windowId];
    if (typeof raw !== "number" || !Number.isFinite(raw)) {
      continue;
    }

    const windowState = windows[windowId];
    const reached = Math.abs(raw - windowState.openness) <= DISPLAY_EPSILON;
    const displayed = reached ? windowState.openness : Math.round(raw);
    const motion: WindowMotion = reached ? "idle" : windowState.motion;
    if (displayed !== windowState.displayed || motion !== windowState.motion) {
      windows[windowId] = { ...windowState, displayed, motion };
      changed = true;
    }
  }

  if (changed) {
    setVehicleState({ ...current, windows });
  }
}

function setOpenness(
  target: VehicleCommand["target"],
  rawOpenness: number,
  source: CommandSource,
  kind: "open" | "close" | "set",
): ControlResult {
  const windowIds = resolveTargets(target);
  if (!windowIds) {
    return reject("invalid_window", `无法识别车窗「${String(target)}」`, source);
  }

  const openness = kind === "set" ? parseOpenness(rawOpenness) : rawOpenness;
  if (openness === null) {
    return reject("invalid_openness", "开度必须是有限数字", source);
  }

  const current = getVehicleState();
  const windows = { ...current.windows };
  let changed = false;

  for (const windowId of windowIds) {
    const windowState = windows[windowId];
    const shown = readDisplayed(windowId, windowState.displayed);
    const motion = motionToward(shown, openness);
    if (windowState.openness === openness && windowState.motion === motion) {
      continue;
    }

    windows[windowId] = { ...windowState, openness, motion };
    changed = true;
  }

  const message = describeOpenness(windowIds, openness, kind, changed);
  commit(current, windows, {
    source,
    level: "info",
    message,
    coalesceKey: kind === "set" ? `${source}:set:${target}` : undefined,
  });

  return { ok: true, message };
}

function stopWindows(target: VehicleCommand["target"], source: CommandSource): ControlResult {
  const windowIds = resolveTargets(target);
  if (!windowIds) {
    return reject("invalid_window", `无法识别车窗「${String(target)}」`, source);
  }

  const current = getVehicleState();
  const windows = { ...current.windows };
  const stopped: number[] = [];

  for (const windowId of windowIds) {
    const windowState = windows[windowId];
    const percent = normalizeOpenness(readDisplayed(windowId, windowState.displayed));
    windows[windowId] = { openness: percent, displayed: percent, motion: "idle" };
    setFrameDisplayed(windowId, percent);
    stopped.push(percent);
  }

  const message =
    windowIds.length === WINDOW_IDS.length
      ? "全部车窗已停止"
      : `${WINDOW_LABELS[windowIds[0]]}已停止在 ${stopped[0]}%`;

  commit(current, windows, { source, level: "info", message });
  return { ok: true, message };
}

function toggleWindow(target: VehicleCommand["target"], source: CommandSource): ControlResult {
  const windowIds = resolveTargets(target);
  if (!windowIds) {
    return reject("invalid_window", `无法识别车窗「${String(target)}」`, source);
  }

  if (windowIds.length !== 1) {
    return reject("invalid_command", "切换操作需要指定一扇车窗", source);
  }

  const windowState = getVehicleState().windows[windowIds[0]];
  if (windowState.openness === 0) {
    return setOpenness(windowIds[0], 100, source, "open");
  }

  return setOpenness(windowIds[0], 0, source, "close");
}

function commit(
  current: VehicleState,
  windows: VehicleState["windows"],
  entry: { source: CommandSource; level: LogEntry["level"]; message: string; coalesceKey?: string },
): void {
  const at = Date.now();
  const logs = pushLog(current.logs, { ...entry, at });
  setVehicleState({
    windows,
    logs,
    notice: { level: entry.level, message: entry.message },
  });
}

function reject(
  code: Extract<ControlResult, { ok: false }>["code"],
  message: string,
  source: CommandSource,
): ControlResult {
  const current = getVehicleState();
  const logs = pushLog(current.logs, { source, level: "error", message, at: Date.now() });
  setVehicleState({
    ...current,
    logs,
    notice: { level: "error", message },
  });
  return { ok: false, code, message };
}

function pushLog(
  logs: LogEntry[],
  entry: { source: CommandSource; level: LogEntry["level"]; message: string; at: number; coalesceKey?: string },
): LogEntry[] {
  const latest = logs[0];
  const nextPrefix = opennessPrefix(entry.message);
  if (
    latest &&
    entry.coalesceKey &&
    latest.source === entry.source &&
    latest.level === "info" &&
    entry.level === "info" &&
    nextPrefix !== null &&
    nextPrefix === opennessPrefix(latest.message) &&
    Math.abs(entry.at - latest.at) <= COALESCE_MS
  ) {
    const [head, ...rest] = logs;
    return [{ ...head, at: entry.at, message: entry.message }, ...rest];
  }

  logCounter += 1;
  const next: LogEntry = {
    id: `log-${logCounter}`,
    at: entry.at,
    source: entry.source,
    level: entry.level,
    message: entry.message,
  };
  return [next, ...logs].slice(0, LOG_LIMIT);
}

function opennessPrefix(message: string): string | null {
  const marker = "开度调整为";
  const index = message.indexOf(marker);
  if (index === -1) {
    return null;
  }
  return message.slice(0, index);
}

function describeOpenness(
  windowIds: WindowId[],
  openness: number,
  kind: "open" | "close" | "set",
  changed: boolean,
): string {
  if (windowIds.length === WINDOW_IDS.length) {
    if (kind === "open") {
      return changed ? "打开全部车窗" : "全部车窗已经完全打开";
    }
    if (kind === "close") {
      return changed ? "关闭全部车窗" : "全部车窗已经完全关闭";
    }
    return `全部车窗开度调整为 ${openness}%`;
  }

  const label = WINDOW_LABELS[windowIds[0]];
  if (kind === "open") {
    return changed ? `打开${label}` : `${label}已经完全打开`;
  }
  if (kind === "close") {
    return changed ? `关闭${label}` : `${label}已经完全关闭`;
  }
  return `${label}开度调整为 ${openness}%`;
}

function motionToward(shown: number, target: number): WindowMotion {
  if (Math.abs(target - shown) <= DISPLAY_EPSILON) {
    return "idle";
  }
  return target > shown ? "opening" : "closing";
}

function resolveTargets(target: string): WindowId[] | null {
  if (target === "all") {
    return [...WINDOW_IDS];
  }
  if (isWindowId(target)) {
    return [target];
  }
  return null;
}

function parseOpenness(value: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return normalizeOpenness(value);
}

function normalizeOpenness(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}
