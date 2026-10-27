import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ThreeEvent } from "@react-three/fiber";
import { BoxGeometry, DoubleSide, EdgesGeometry, type Group } from "three";
import { applyCommand } from "../vehicle/controller";
import { useVehicleState } from "../vehicle/useVehicleState";
import { windowObjectName, type WindowId } from "../vehicle/types";
import { useSideWindowMotion } from "./useSideWindowMotion";

const DRAG_THRESHOLD_PX = 6;
const GLASS_TRAVEL_RATIO = 0.9;

const SIDE_WINDOWS: Array<{
  id: WindowId;
  position: [number, number, number];
  size: [number, number, number];
}> = [
  { id: "front_left", position: [-0.82, 1.04, 0.38], size: [0.045, 0.4, 0.7] },
  { id: "front_right", position: [0.82, 1.04, 0.38], size: [0.045, 0.4, 0.7] },
  { id: "rear_left", position: [-0.82, 1.04, -0.56], size: [0.045, 0.4, 0.62] },
  { id: "rear_right", position: [0.82, 1.04, -0.56], size: [0.045, 0.4, 0.62] },
];

type VehicleModelProps = {
  onHoverWindow: (windowId: WindowId | null) => void;
};

function usePointerClick(onClick: () => void) {
  const startRef = useRef<{ x: number; y: number } | null>(null);

  const onPointerDown = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    startRef.current = {
      x: event.nativeEvent.clientX,
      y: event.nativeEvent.clientY,
    };
  };

  const onPointerUp = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    const start = startRef.current;
    startRef.current = null;
    if (!start) {
      return;
    }

    const dx = event.nativeEvent.clientX - start.x;
    const dy = event.nativeEvent.clientY - start.y;
    if (dx * dx + dy * dy > DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) {
      return;
    }

    onClick();
  };

  return { onPointerDown, onPointerUp };
}

function Wheel({ position }: { position: [number, number, number] }) {
  const hubOffset = position[0] > 0 ? 0.07 : -0.07;

  return (
    <group position={position} name="wheel">
      <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.32, 0.32, 0.22, 28]} />
        <meshStandardMaterial color="#1b1d21" roughness={0.9} metalness={0.05} />
      </mesh>
      <mesh rotation={[0, 0, Math.PI / 2]} position={[hubOffset, 0, 0]}>
        <cylinderGeometry args={[0.16, 0.16, 0.23, 20]} />
        <meshStandardMaterial color="#d7dee8" roughness={0.35} metalness={0.65} />
      </mesh>
    </group>
  );
}

function SideWindow({
  id,
  position,
  size,
  onGlassRef,
  onHover,
}: {
  id: WindowId;
  position: [number, number, number];
  size: [number, number, number];
  onGlassRef: (windowId: WindowId, group: Group | null) => void;
  onHover: (windowId: WindowId | null) => void;
}) {
  const pointer = usePointerClick(() => {
    applyCommand({ type: "toggle", target: id }, "pointer");
  });
  const objectName = windowObjectName(id);
  const [hovered, setHovered] = useState(false);
  const moving = useVehicleState().windows[id].motion !== "idle";
  const highlighted = hovered || moving;
  const frame = useMemo(() => {
    const box = new BoxGeometry(size[0] + 0.01, size[1] + 0.02, size[2] + 0.02);
    const edges = new EdgesGeometry(box);
    box.dispose();
    return edges;
  }, [size]);
  useEffect(() => () => frame.dispose(), [frame]);
  const setGlassRef = useCallback(
    (group: Group | null) => {
      onGlassRef(id, group);
    },
    [id, onGlassRef],
  );
  const inward = id.endsWith("left") ? 0.03 : -0.03;

  useEffect(() => {
    return () => {
      document.body.style.cursor = "";
    };
  }, []);

  return (
    <group name={objectName} position={position} userData={{ windowId: id }}>
      <lineSegments geometry={frame} raycast={() => null}>
        <lineBasicMaterial color={moving ? "#8dffb0" : highlighted ? "#f4fbff" : "#8ec8ff"} />
      </lineSegments>
      <mesh position={[inward, 0, 0]} raycast={() => null}>
        <boxGeometry args={[0.02, size[1] * 0.92, size[2] * 0.86]} />
        <meshStandardMaterial color="#121920" roughness={0.85} />
      </mesh>
      <group ref={setGlassRef}>
        <mesh name={`${objectName}_glass`} userData={{ windowId: id }} raycast={() => null}>
          <boxGeometry args={size} />
          <meshStandardMaterial
            color={highlighted ? "#e7f6ff" : "#c5e7ff"}
            emissive={highlighted ? "#2f8fff" : "#000000"}
            emissiveIntensity={highlighted ? 0.55 : 0}
            transparent
            opacity={0.72}
            roughness={0.08}
            metalness={0.05}
          />
        </mesh>
      </group>
      <mesh
        name={`${objectName}_hit`}
        userData={{ windowId: id }}
        onPointerOver={(event) => {
          event.stopPropagation();
          setHovered(true);
          onHover(id);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={(event) => {
          event.stopPropagation();
          setHovered(false);
          onHover(null);
          document.body.style.cursor = "";
        }}
        {...pointer}
      >
        <boxGeometry args={[0.26, size[1] + 0.08, size[2] + 0.04]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}

function FixedGlass({
  name,
  position,
  rotation,
  size,
}: {
  name: string;
  position: [number, number, number];
  rotation: [number, number, number];
  size: [number, number];
}) {
  return (
    <mesh name={name} position={position} rotation={rotation} raycast={() => null} userData={{ part: name }}>
      <planeGeometry args={size} />
      <meshStandardMaterial
        color="#c5e7ff"
        transparent
        opacity={0.34}
        roughness={0.05}
        metalness={0.05}
        side={DoubleSide}
      />
    </mesh>
  );
}

export function VehicleModel({ onHoverWindow }: VehicleModelProps) {
  const glassGroups = useRef(new Map<WindowId, Group>());
  const onGlassRef = useCallback((windowId: WindowId, group: Group | null) => {
    if (group) {
      glassGroups.current.set(windowId, group);
      return;
    }
    glassGroups.current.delete(windowId);
  }, []);

  useSideWindowMotion((displayed) => {
    for (const layout of SIDE_WINDOWS) {
      const glass = glassGroups.current.get(layout.id);
      if (glass) {
        glass.position.y = -(displayed[layout.id] / 100) * layout.size[1] * GLASS_TRAVEL_RATIO;
      }
    }
  });

  return (
    <group name="vehicle">
      <mesh name="body" position={[0, 0.52, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.76, 0.5, 4.2]} />
        <meshStandardMaterial color="#d5dde7" roughness={0.42} metalness={0.38} />
      </mesh>
      <mesh name="cabin" position={[0, 1.02, -0.08]} castShadow receiveShadow raycast={() => null}>
        <boxGeometry args={[1.56, 0.62, 2.02]} />
        <meshStandardMaterial color="#c9d3de" roughness={0.4} metalness={0.32} />
      </mesh>
      <mesh name="roof" position={[0, 1.36, -0.08]} castShadow receiveShadow raycast={() => null}>
        <boxGeometry args={[1.6, 0.07, 1.86]} />
        <meshStandardMaterial color="#b7c3cf" roughness={0.38} metalness={0.4} />
      </mesh>

      <Wheel position={[-0.86, 0.32, 1.32]} />
      <Wheel position={[0.86, 0.32, 1.32]} />
      <Wheel position={[-0.86, 0.32, -1.34]} />
      <Wheel position={[0.86, 0.32, -1.34]} />

      <FixedGlass name="windshield" position={[0, 1.08, 0.98]} rotation={[-0.38, 0, 0]} size={[1.38, 0.58]} />
      <FixedGlass name="rear_glass" position={[0, 1.08, -1.14]} rotation={[0.42, 0, 0]} size={[1.34, 0.52]} />

      <mesh position={[0.58, 0.58, 2.12]} raycast={() => null}>
        <boxGeometry args={[0.32, 0.1, 0.04]} />
        <meshStandardMaterial color="#fff4d4" emissive="#ffe7a8" emissiveIntensity={1.4} />
      </mesh>
      <mesh position={[-0.58, 0.58, 2.12]} raycast={() => null}>
        <boxGeometry args={[0.32, 0.1, 0.04]} />
        <meshStandardMaterial color="#fff4d4" emissive="#ffe7a8" emissiveIntensity={1.4} />
      </mesh>
      <mesh position={[0.62, 0.58, -2.12]} raycast={() => null}>
        <boxGeometry args={[0.28, 0.08, 0.04]} />
        <meshStandardMaterial color="#ffb1b1" emissive="#ff4d4d" emissiveIntensity={0.8} />
      </mesh>
      <mesh position={[-0.62, 0.58, -2.12]} raycast={() => null}>
        <boxGeometry args={[0.28, 0.08, 0.04]} />
        <meshStandardMaterial color="#ffb1b1" emissive="#ff4d4d" emissiveIntensity={0.8} />
      </mesh>

      {SIDE_WINDOWS.map((window) => (
        <SideWindow
          key={window.id}
          id={window.id}
          position={window.position}
          size={window.size}
          onGlassRef={onGlassRef}
          onHover={onHoverWindow}
        />
      ))}
    </group>
  );
}
