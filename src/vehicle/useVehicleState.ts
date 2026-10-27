import { useSyncExternalStore } from "react";
import { getVehicleState, subscribeVehicle } from "./store";

export function useVehicleState() {
  return useSyncExternalStore(subscribeVehicle, getVehicleState, getVehicleState);
}
