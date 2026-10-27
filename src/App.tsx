import { useState } from "react";
import { ControlPanel } from "./panels/ControlPanel";
import { VoiceControlPanel } from "./panels/VoiceControlPanel";
import { CarScene } from "./scene/CarScene";
import { WINDOW_LABELS, type WindowId } from "./vehicle/types";

export default function App() {
  const [resetToken, setResetToken] = useState(0);
  const [hoveredWindowId, setHoveredWindowId] = useState<WindowId | null>(null);
  const [vehicleModel, setVehicleModel] = useState<"showroom" | "fallback">("showroom");

  return (
    <div className="app">
      <div className="viewport" role="application" aria-label="三维车辆场景" tabIndex={0}>
        <CarScene
          resetToken={resetToken}
          onHoverWindow={setHoveredWindowId}
          onModelMode={setVehicleModel}
        />
      </div>
      <aside className="hud">
        <h1>3D 智能汽车</h1>
        <p className="hud__hint">拖动旋转，滚轮缩放。四扇侧窗有亮边，单击即可开关。</p>
        <p className="hud__meta">车头朝前，左前为主驾侧。玻璃向下移动表示打开。</p>
        <p className="hud__meta">
          {vehicleModel === "fallback"
            ? "高质量模型未能加载，当前显示简化车身。"
            : "模型：Khronos Car Concept，CC BY 4.0。Eric Chadwick / Darmstadt Graphics Group GmbH，2024。"}
        </p>
        <p className="status">
          {hoveredWindowId ? (
            <>
              单击<strong>{WINDOW_LABELS[hoveredWindowId]}</strong>可开关
            </>
          ) : (
            "把鼠标移到亮边侧窗上"
          )}
        </p>
        <button type="button" onClick={() => setResetToken((token) => token + 1)}>
          复位视角
        </button>
      </aside>
      <ControlPanel activeWindowId={hoveredWindowId} />
      <VoiceControlPanel />
    </div>
  );
}
