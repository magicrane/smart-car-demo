export const WINDOW_IDS = [
  "front_left",
  "front_right",
  "rear_left",
  "rear_right",
] as const;

export type WindowId = (typeof WINDOW_IDS)[number];

export const WINDOW_LABELS: Record<WindowId, string> = {
  front_left: "左前车窗",
  front_right: "右前车窗",
  rear_left: "左后车窗",
  rear_right: "右后车窗",
};

export const MOTION_LABELS = {
  idle: "已停止",
  opening: "打开中",
  closing: "关闭中",
} as const;

export type WindowMotion = keyof typeof MOTION_LABELS;

export type WindowState = {
  /** 目标开度。0 为关闭，100 为完全打开。 */
  openness: number;
  /** 动画已经走到的开度。 */
  displayed: number;
  motion: WindowMotion;
};

export type CommandSource = "pointer" | "panel" | "voice" | "text";

export type VehicleCommand =
  | { type: "open" | "close" | "stop" | "toggle"; target: WindowId | "all" }
  | { type: "set"; target: WindowId | "all"; openness: number };

export type ControlResult =
  | { ok: true; message: string }
  | { ok: false; code: "invalid_window" | "invalid_openness" | "invalid_command"; message: string };

export type LogEntry = {
  id: string;
  at: number;
  source: CommandSource;
  level: "info" | "error";
  message: string;
};

export type VehicleNotice = {
  level: "info" | "error";
  message: string;
};

export type VehicleState = {
  windows: Record<WindowId, WindowState>;
  logs: LogEntry[];
  notice: VehicleNotice | null;
};

export function windowObjectName(windowId: WindowId): string {
  return `window_${windowId}`;
}

export function isWindowId(value: unknown): value is WindowId {
  return typeof value === "string" && (WINDOW_IDS as readonly string[]).includes(value);
}
