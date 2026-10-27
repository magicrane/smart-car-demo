import type { WindowId } from "./types";

export const OPENNESS_PER_SECOND = 80;
export const DISPLAY_EPSILON = 0.5;

const frameDisplayed = new Map<WindowId, number>();

export function setFrameDisplayed(windowId: WindowId, value: number): void {
  frameDisplayed.set(windowId, value);
}

export function getFrameDisplayed(windowId: WindowId): number | undefined {
  return frameDisplayed.get(windowId);
}

export function readDisplayed(windowId: WindowId, fallback: number): number {
  return frameDisplayed.get(windowId) ?? fallback;
}

export function resetFrameDisplayed(): void {
  frameDisplayed.clear();
}

export function stepOpenness(current: number, target: number, deltaSeconds: number): number {
  if (!Number.isFinite(current) || !Number.isFinite(target) || !Number.isFinite(deltaSeconds)) {
    return Number.isFinite(current) ? current : 0;
  }

  const step = OPENNESS_PER_SECOND * Math.max(deltaSeconds, 0);
  const difference = target - current;
  if (Math.abs(difference) <= step) {
    return target;
  }

  return current + Math.sign(difference) * step;
}
