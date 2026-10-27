import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { syncDisplayedProgress } from "../vehicle/controller";
import { getVehicleState } from "../vehicle/store";
import { WINDOW_IDS, type WindowId } from "../vehicle/types";
import { getFrameDisplayed, setFrameDisplayed, stepOpenness } from "../vehicle/windowMotion";

const COMMIT_INTERVAL_MS = 100;

export function useSideWindowMotion(apply: (displayed: Record<WindowId, number>) => void): void {
  const applyRef = useRef(apply);
  applyRef.current = apply;
  const lastCommitRef = useRef(0);

  useFrame((_, delta) => {
    const vehicle = getVehicleState();
    const displayed = {} as Record<WindowId, number>;
    let moved = false;
    const boundedDelta = Math.min(Math.max(delta, 0), 0.05);

    for (const windowId of WINDOW_IDS) {
      const previous = getFrameDisplayed(windowId) ?? vehicle.windows[windowId].displayed;
      const next = stepOpenness(previous, vehicle.windows[windowId].openness, boundedDelta);
      if (Math.abs(next - previous) > 0.001) {
        moved = true;
      }
      setFrameDisplayed(windowId, next);
      displayed[windowId] = next;
    }

    applyRef.current(displayed);

    const now = performance.now();
    const arrived = WINDOW_IDS.every(
      (windowId) => Math.abs(displayed[windowId] - vehicle.windows[windowId].openness) <= 0.5,
    );
    if (moved && (arrived || now - lastCommitRef.current >= COMMIT_INTERVAL_MS)) {
      syncDisplayedProgress(displayed);
      lastCommitRef.current = now;
    }
  });
}
