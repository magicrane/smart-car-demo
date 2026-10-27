import type { LogEntry } from "../vehicle/types";

const SOURCE_LABELS: Record<LogEntry["source"], string> = {
  pointer: "点击",
  panel: "面板",
  voice: "语音",
  text: "文本",
};

type LogPanelProps = {
  logs: LogEntry[];
};

export function LogPanel({ logs }: LogPanelProps) {
  return (
    <section className="log-panel" aria-label="操作日志">
      <h2>操作日志</h2>
      {logs.length === 0 ? (
        <p className="log-panel__empty">暂无操作记录</p>
      ) : (
        <ol className="log-panel__list">
          {logs.map((entry) => (
            <li key={entry.id} className={entry.level === "error" ? "log-panel__item log-panel__item--error" : "log-panel__item"}>
              <time dateTime={new Date(entry.at).toISOString()}>{formatTime(entry.at)}</time>
              <span>{SOURCE_LABELS[entry.source]}</span>
              <span>{entry.message}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function formatTime(at: number): string {
  const date = new Date(at);
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}
