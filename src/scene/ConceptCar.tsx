import { useGLTF } from "@react-three/drei";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import { MeshPhysicalMaterial, PointLight } from "three";
import { applyCommand } from "../vehicle/controller";
import { getVehicleState } from "../vehicle/store";
import type { WindowId } from "../vehicle/types";
import {
  CONCEPT_MODEL_URL,
  ensureShowroom,
  windowIdFromObject,
  type SideWindowRig,
} from "./prepareConceptCar";
import { useSideWindowMotion } from "./useSideWindowMotion";

const DRAG_THRESHOLD_PX = 6;

type ConceptCarProps = {
  onHoverWindow: (windowId: WindowId | null) => void;
  onReady: () => void;
};

useGLTF.preload(CONCEPT_MODEL_URL);

export function ConceptCar({ onHoverWindow, onReady }: ConceptCarProps) {
  const { scene } = useGLTF(CONCEPT_MODEL_URL);
  const rigs = useMemo(() => ensureShowroom(scene), [scene]);
  const rigsRef = useRef<SideWindowRig[]>(rigs);
  rigsRef.current = rigs;
  const hoverRef = useRef<WindowId | null>(null);
  const pointerRef = useRef<{ x: number; y: number; windowId: WindowId } | null>(null);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const cabinLightRef = useRef<PointLight>(null);

  useLayoutEffect(() => {
    cabinLightRef.current?.layers.set(1);
  }, []);

  useEffect(() => {
    onReadyRef.current();
    return () => {
      document.body.style.cursor = "";
    };
  }, [scene]);

  useSideWindowMotion((displayed) => {
    const vehicle = getVehicleState();
    const hovered = hoverRef.current;
    for (const rig of rigsRef.current) {
      rig.mesh.position[rig.axis] = rig.closed + rig.sign * rig.travel * (displayed[rig.id] / 100);
      const moving = vehicle.windows[rig.id].motion !== "idle";
      const active = hovered === rig.id || moving;
      rig.edge.color.set(moving ? "#8dffb0" : active ? "#f4fbff" : "#8ec8ff");
      const material = rig.mesh.material;
      if (material instanceof MeshPhysicalMaterial) {
        material.emissive.set(active ? "#2d6f9c" : "#000000");
        material.emissiveIntensity = active ? 0.28 : 0;
      }
    }
  });

  const setHover = (windowId: WindowId | null) => {
    hoverRef.current = windowId;
    onHoverWindow(windowId);
    document.body.style.cursor = windowId ? "pointer" : "";
  };

  return (
    <>
    <pointLight
      ref={cabinLightRef}
      position={[0, 0.68, 0.05]}
      intensity={8}
      distance={2.4}
      decay={2}
      color="#f7f4ee"
    />
    <primitive
      object={scene}
      onPointerDown={(event: ThreeEvent<PointerEvent>) => {
        const windowId = windowIdFromObject(event.object);
        if (!windowId) {
          return;
        }
        event.stopPropagation();
        pointerRef.current = {
          x: event.nativeEvent.clientX,
          y: event.nativeEvent.clientY,
          windowId,
        };
      }}
      onPointerUp={(event: ThreeEvent<PointerEvent>) => {
        const start = pointerRef.current;
        pointerRef.current = null;
        if (!start) {
          return;
        }
        event.stopPropagation();
        const dx = event.nativeEvent.clientX - start.x;
        const dy = event.nativeEvent.clientY - start.y;
        if (dx * dx + dy * dy > DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) {
          return;
        }
        applyCommand({ type: "toggle", target: start.windowId }, "pointer");
      }}
      onPointerOver={(event: ThreeEvent<PointerEvent>) => {
        const windowId = windowIdFromObject(event.object);
        if (!windowId) {
          return;
        }
        event.stopPropagation();
        setHover(windowId);
      }}
      onPointerOut={(event: ThreeEvent<PointerEvent>) => {
        if (!windowIdFromObject(event.object)) {
          return;
        }
        event.stopPropagation();
        setHover(null);
      }}
    />
    </>
  );
}
