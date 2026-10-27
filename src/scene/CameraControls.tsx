import { OrbitControls } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import type { Vector3 } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { INITIAL_CAMERA_POSITION, INITIAL_CAMERA_TARGET } from "./cameraPose";

type CameraControlsProps = {
  resetToken: number;
};

function restoreInitialView(controls: OrbitControlsImpl, camera: { position: Vector3 }) {
  const damping = controls.enableDamping;
  controls.enableDamping = false;
  camera.position.copy(INITIAL_CAMERA_POSITION);
  controls.target.copy(INITIAL_CAMERA_TARGET);
  controls.update();
  controls.enableDamping = damping;
}

export function CameraControls({ resetToken }: CameraControlsProps) {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const { camera } = useThree();

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) {
      return;
    }

    controls.target.copy(INITIAL_CAMERA_TARGET);
    controls.update();
  }, [camera]);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls || resetToken === 0) {
      return;
    }

    restoreInitialView(controls, camera);
  }, [camera, resetToken]);

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      enablePan={false}
      minDistance={2.4}
      maxDistance={14}
      minPolarAngle={0.2}
      maxPolarAngle={Math.PI / 2 - 0.08}
    />
  );
}
