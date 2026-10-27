import type { VehicleState, WindowState } from "./types";

const listeners = new Set<() => void>();

function closedWindow(): WindowState {
  return { openness: 0, displayed: 0, motion: "idle" };
}

export function createInitialVehicleState(): VehicleState {
  return {
    windows: {
      front_left: closedWindow(),
      front_right: closedWindow(),
      rear_left: closedWindow(),
      rear_right: closedWindow(),
    },
    logs: [],
    notice: null,
  };
}

let state = createInitialVehicleState();

export function getVehicleState(): VehicleState {
  return state;
}

export function setVehicleState(next: VehicleState): void {
  state = next;
  listeners.forEach((listener) => listener());
}

export function resetVehicleState(): void {
  state = createInitialVehicleState();
  listeners.forEach((listener) => listener());
}

export function subscribeVehicle(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
