import { ContactShadows, useProgress } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { Component, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { ACESFilmicToneMapping, PMREMGenerator, type Mesh, type MeshStandardMaterial, type Object3D } from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import type { WindowId } from "../vehicle/types";
import { INITIAL_CAMERA_POSITION_TUPLE } from "./cameraPose";
import { CameraControls } from "./CameraControls";
import { ConceptCar } from "./ConceptCar";
import { VehicleModel } from "./VehicleModel";

type CarSceneProps = {
  resetToken: number;
  onHoverWindow: (windowId: WindowId | null) => void;
  onModelMode: (mode: "showroom" | "fallback") => void;
};

type SceneMode = "loading" | "showroom" | "fallback";

export function CarScene({ resetToken, onHoverWindow, onModelMode }: CarSceneProps) {
  const [mode, setMode] = useState<SceneMode>("loading");
  const [failure, setFailure] = useState<string | null>(null);
  const { active, progress } = useProgress();
  const onModelModeRef = useRef(onModelMode);
  onModelModeRef.current = onModelMode;

  useEffect(() => {
    if (mode !== "loading") {
      onModelModeRef.current(mode);
    }
  }, [mode]);

  return (
    <>
      {mode === "fallback" && failure ? (
        <div className="scene-banner" role="alert">
          高质量模型没有载入（{failure}）。已改用简化车身，四扇侧窗仍可控制。
        </div>
      ) : null}
      {mode === "loading" && active ? (
        <div className="scene-banner scene-banner--loading">正在加载车辆模型 {Math.round(progress)}%</div>
      ) : null}
      <Canvas
        shadows="percentage"
        dpr={[1, 2]}
        camera={{ position: INITIAL_CAMERA_POSITION_TUPLE, fov: 40, near: 0.08, far: 80 }}
        gl={{ antialias: true, alpha: false, toneMapping: ACESFilmicToneMapping, toneMappingExposure: 1.05 }}
      >
        <color attach="background" args={["#12171d"]} />
        <StudioEnvironment />
        <hemisphereLight args={["#f4f7fb", "#2a3038", 0.42]} />
        <ambientLight intensity={0.06} />
        <directionalLight
          castShadow
          color="#fff4ea"
          position={[4.2, 7.2, 5.4]}
          intensity={2.35}
          shadow-mapSize={[2048, 2048]}
          shadow-camera-near={0.5}
          shadow-camera-far={24}
          shadow-camera-left={-6}
          shadow-camera-right={6}
          shadow-camera-top={6}
          shadow-camera-bottom={-6}
          shadow-bias={-0.00025}
        />
        <directionalLight color="#d7e6ff" position={[-5.5, 2.4, 2.2]} intensity={0.55} />
        <directionalLight color="#ffffff" position={[0.6, 3.2, -6.5]} intensity={0.72} />
        {mode === "fallback" ? (
          <VehicleModel onHoverWindow={onHoverWindow} />
        ) : (
          <ModelErrorBoundary
            onError={(message) => {
              setFailure(message);
              setMode("fallback");
            }}
            fallback={null}
          >
            <Suspense fallback={null}>
              <ConceptCar onHoverWindow={onHoverWindow} onReady={() => setMode("showroom")} />
            </Suspense>
          </ModelErrorBoundary>
        )}
        <mesh rotation-x={-Math.PI / 2} position={[0, 0, 0]} receiveShadow>
          <circleGeometry args={[18, 80]} />
          <meshStandardMaterial color="#14181e" roughness={0.62} metalness={0.08} />
        </mesh>
        <ContactShadows position={[0, 0.012, 0]} opacity={0.55} scale={12} blur={2.4} far={3.4} />
        <CameraControls resetToken={resetToken} />
      </Canvas>
    </>
  );
}

function StudioEnvironment() {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);

  useEffect(() => {
    const pmrem = new PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const texture = pmrem.fromScene(room, 0.04).texture;
    scene.environment = texture;
    scene.environmentIntensity = 0.92;
    return () => {
      scene.environment = null;
      texture.dispose();
      pmrem.dispose();
      disposeObject(room);
    };
  }, [gl, scene]);

  return null;
}

function disposeObject(root: Object3D) {
  root.traverse((object) => {
    const mesh = object as Mesh;
    mesh.geometry?.dispose();
    const material = mesh.material as MeshStandardMaterial | MeshStandardMaterial[] | undefined;
    if (Array.isArray(material)) {
      material.forEach((entry) => entry.dispose());
    } else {
      material?.dispose();
    }
  });
}

type ModelErrorBoundaryProps = {
  children: ReactNode;
  fallback: ReactNode;
  onError: (message: string) => void;
};

type ModelErrorBoundaryState = {
  failed: boolean;
};

class ModelErrorBoundary extends Component<ModelErrorBoundaryProps, ModelErrorBoundaryState> {
  state: ModelErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): ModelErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    this.props.onError(error.message || "车辆模型加载失败");
  }

  render() {
    if (this.state.failed) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}
