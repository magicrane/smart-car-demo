import { applyCommand } from "../vehicle/controller";
import { MOTION_LABELS, WINDOW_IDS, WINDOW_LABELS, type WindowId } from "../vehicle/types";
import { useVehicleState } from "../vehicle/useVehicleState";
import { LogPanel } from "./LogPanel";

export function ControlPanel({ activeWindowId }: { activeWindowId: WindowId | null }) {
  const vehicle = useVehicleState();

  return (
    <aside className="panel">
      <h2>车窗控制</h2>
      <p className={vehicle.notice?.level === "error" ? "notice notice--error" : "notice"} role={vehicle.notice?.level === "error" ? "alert" : "status"}>
        {vehicle.notice?.message ?? "单击车窗，或使用下面的按钮和滑块。"}
      </p>
      <div className="button-row">
        <button type="button" onClick={() => applyCommand({ type: "open", target: "all" }, "panel")}>
          全部打开
        </button>
        <button type="button" onClick={() => applyCommand({ type: "close", target: "all" }, "panel")}>
          全部关闭
        </button>
        <button type="button" onClick={() => applyCommand({ type: "stop", target: "all" }, "panel")}>
          全部停止
        </button>
      </div>
      {WINDOW_IDS.map((windowId) => (
        <WindowCard key={windowId} windowId={windowId} active={activeWindowId === windowId} />
      ))}
      <LogPanel logs={vehicle.logs} />
    </aside>
  );
}

function WindowCard({ windowId, active }: { windowId: WindowId; active: boolean }) {
  const windowState = useVehicleState().windows[windowId];
  const label = WINDOW_LABELS[windowId];

  return (
    <section className={active ? "window-card window-card--active" : "window-card"} data-window-id={windowId}>
      <h3>
        {label}
        <span>{MOTION_LABELS[windowState.motion]}</span>
      </h3>
      <p className="window-card__progress">
        目标 {Math.round(windowState.openness)}% · 当前 {Math.round(windowState.displayed)}%
      </p>
      <div className="button-row">
        <button type="button" onClick={() => applyCommand({ type: "open", target: windowId }, "panel")}>
          打开
        </button>
        <button type="button" onClick={() => applyCommand({ type: "close", target: windowId }, "panel")}>
          关闭
        </button>
        <button type="button" onClick={() => applyCommand({ type: "stop", target: windowId }, "panel")}>
          停止
        </button>
      </div>
      <label className="window-card__slider">
        <span>开度</span>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={Math.round(windowState.openness)}
          aria-label={`${label}开度`}
          onChange={(event) =>
            applyCommand(
              { type: "set", target: windowId, openness: Number(event.target.value) },
              "panel",
            )
          }
        />
      </label>
    </section>
  );
}
