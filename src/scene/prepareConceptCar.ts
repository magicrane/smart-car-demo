import {
  Box3,
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  EdgesGeometry,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
  type Material,
  type Object3D,
} from "three";
import { isWindowId, windowObjectName, type WindowId } from "../vehicle/types";

export const CONCEPT_MODEL_URL = "/vehicles/CarConcept.glb";

/**
 * 车头在 +Z。这份模型把左侧零件放在 +X，并命名为 L：
 * WheelFrontL、BodyDoorL 都在 +X，WheelFrontR、BodyDoorR 在 -X。
 */
export const DOOR_WINDOW_BINDINGS: ReadonlyArray<{ nodeName: string; windowId: WindowId }> = [
  { nodeName: "BodyDoorLWindow", windowId: "front_left" },
  { nodeName: "BodyDoorRWindow", windowId: "front_right" },
];

export const REAR_SIDE_WINDOW_NODE = "BodyWindowsRearSides";

const GLASS_TRAVEL_RATIO = 0.92;

export type SideWindowRig = {
  id: WindowId;
  mesh: Mesh;
  axis: "x" | "y" | "z";
  sign: number;
  closed: number;
  travel: number;
  edge: LineBasicMaterial;
};

export function splitGeometryBySign(
  geometry: BufferGeometry,
  axis: "x" | "y" | "z",
): { negative: BufferGeometry; positive: BufferGeometry } {
  const source = geometry.getIndex() ? geometry.toNonIndexed() : geometry;
  const position = source.getAttribute("position");
  const axisIndex = axis === "x" ? 0 : axis === "y" ? 1 : 2;
  const negative: number[] = [];
  const positive: number[] = [];

  for (let vertex = 0; vertex + 2 < position.count; vertex += 3) {
    let sum = 0;
    for (let corner = 0; corner < 3; corner += 1) {
      sum += position.getComponent(vertex + corner, axisIndex);
    }
    (sum >= 0 ? positive : negative).push(vertex, vertex + 1, vertex + 2);
  }

  return {
    negative: sliceGeometry(source, negative),
    positive: sliceGeometry(source, positive),
  };
}

export function windowIdFromObject(object: Object3D | null): WindowId | null {
  let current: Object3D | null = object;
  while (current) {
    if (isWindowId(current.userData.windowId)) {
      return current.userData.windowId;
    }
    current = current.parent;
  }
  return null;
}

export function ensureShowroom(root: Object3D): SideWindowRig[] {
  const existing = root.userData.showroomRigs;
  if (Array.isArray(existing)) {
    return existing as SideWindowRig[];
  }

  const sharedGlass = tuneAuthoredMaterials(root);
  const rigs = [
    ...DOOR_WINDOW_BINDINGS.map((binding) => bindDoorWindow(root, binding.nodeName, binding.windowId, sharedGlass)),
    ...splitRearSideWindows(root, sharedGlass),
  ];
  seatOnGround(root);
  root.userData.showroomRigs = rigs;
  return rigs;
}

function tuneAuthoredMaterials(root: Object3D): MeshPhysicalMaterial {
  let glass: MeshPhysicalMaterial | null = null;

  root.traverse((object) => {
    const mesh = object as Mesh;
    if (!mesh.isMesh) {
      return;
    }

    const source = singleMaterial(mesh.material);
    if (source.name === "Glass") {
      glass ??= createShowroomGlass(source);
      mesh.material = glass;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
    } else if (source.name.startsWith("Paint") && isStandard(source)) {
      tunePaint(source);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    } else {
      const interior = mesh.name.startsWith("Interior");
      mesh.castShadow = !interior;
      mesh.receiveShadow = !interior;
      if (interior) {
        mesh.layers.enable(1);
      }
    }

    if (mesh.name === "BodyWindshield" || mesh.name === "BodyRearwindow") {
      mesh.raycast = () => undefined;
    }
  });

  if (!glass) {
    throw new Error("车辆模型缺少玻璃材质");
  }
  return glass;
}

function bindDoorWindow(root: Object3D, nodeName: string, windowId: WindowId, sharedGlass: MeshPhysicalMaterial): SideWindowRig {
  const mesh = requireMesh(root, nodeName);
  mesh.material = sharedGlass.clone();
  return finishWindowMesh(mesh, windowId);
}

function splitRearSideWindows(root: Object3D, sharedGlass: MeshPhysicalMaterial): SideWindowRig[] {
  const source = requireMesh(root, REAR_SIDE_WINDOW_NODE);
  const parts = splitGeometryBySign(source.geometry, "x");
  if (parts.negative.getAttribute("position").count === 0 || parts.positive.getAttribute("position").count === 0) {
    throw new Error("后侧窗无法分成左右两扇");
  }

  const parent = source.parent;
  if (!parent) {
    throw new Error("后侧窗没有父节点");
  }

  const negativeX = placeSplitMesh(source, parts.negative, sharedGlass);
  const positiveX = placeSplitMesh(source, parts.positive, sharedGlass);
  parent.add(negativeX, positiveX);
  source.visible = false;
  source.raycast = () => undefined;

  return [finishWindowMesh(positiveX, "rear_left"), finishWindowMesh(negativeX, "rear_right")];
}

function placeSplitMesh(source: Mesh, geometry: BufferGeometry, sharedGlass: MeshPhysicalMaterial): Mesh {
  const mesh = new Mesh(geometry, sharedGlass.clone());
  mesh.position.copy(source.position);
  mesh.quaternion.copy(source.quaternion);
  mesh.scale.copy(source.scale);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}

function finishWindowMesh(mesh: Mesh, windowId: WindowId): SideWindowRig {
  mesh.name = windowObjectName(windowId);
  mesh.userData.windowId = windowId;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.renderOrder = 2;

  const motion = measureDownwardMotion(mesh);
  const edgeMaterial = new LineBasicMaterial({ color: "#8ec8ff" });
  edgeMaterial.toneMapped = false;
  edgeMaterial.polygonOffset = true;
  edgeMaterial.polygonOffsetFactor = -2;
  edgeMaterial.polygonOffsetUnits = -2;
  const edges = new EdgesGeometry(mesh.geometry, 28);
  const outline = new LineSegments(edges, edgeMaterial);
  outline.name = `${mesh.name}_edge`;
  outline.raycast = () => undefined;
  outline.renderOrder = 3;
  mesh.add(outline);

  return {
    id: windowId,
    mesh,
    axis: motion.axis,
    sign: motion.sign,
    closed: mesh.position[motion.axis],
    travel: motion.travel,
    edge: edgeMaterial,
  };
}

function measureDownwardMotion(mesh: Mesh): { axis: "x" | "y" | "z"; sign: number; travel: number } {
  mesh.updateWorldMatrix(true, false);
  const bounds = new Box3().setFromObject(mesh);
  const height = Math.max(bounds.max.y - bounds.min.y, 0.04);
  const quaternion = mesh.getWorldQuaternion(new Quaternion());
  const axes = [
    { axis: "x" as const, vector: new Vector3(1, 0, 0).applyQuaternion(quaternion) },
    { axis: "y" as const, vector: new Vector3(0, 1, 0).applyQuaternion(quaternion) },
    { axis: "z" as const, vector: new Vector3(0, 0, 1).applyQuaternion(quaternion) },
  ];
  const upward = axes.reduce((best, item) => (item.vector.y > best.vector.y ? item : best));
  return { axis: upward.axis, sign: -1, travel: height * GLASS_TRAVEL_RATIO };
}

function seatOnGround(root: Object3D): void {
  root.updateWorldMatrix(true, true);
  const bounds = new Box3().setFromObject(root);
  const center = bounds.getCenter(new Vector3());
  root.position.x -= center.x;
  root.position.z -= center.z;
  root.position.y -= bounds.min.y;
}

function createShowroomGlass(source: Material): MeshPhysicalMaterial {
  const glass = source instanceof MeshPhysicalMaterial ? source : new MeshPhysicalMaterial();
  glass.name = "Glass";
  glass.color.set("#d7dee6");
  glass.metalness = 0;
  glass.roughness = 0.03;
  glass.transmission = 1;
  glass.thickness = 0.12;
  glass.ior = 1.5;
  glass.attenuationColor.set("#4a5562");
  glass.attenuationDistance = 1.4;
  glass.transparent = true;
  glass.opacity = 1;
  glass.depthWrite = true;
  glass.envMapIntensity = 0.85;
  glass.side = DoubleSide;
  glass.clearcoat = 0;
  return glass;
}

const LIGHT_BLUE_BODY = "#8fd0ea";
const LIGHT_BLUE_TRIM = "#243848";

function tunePaint(material: MeshStandardMaterial): void {
  material.metalness = 0.05;
  material.roughness = Math.min(Math.max(material.roughness, 0.28), 0.42);
  material.envMapIntensity = 1.05;
  if (material.normalMap) {
    material.normalScale.set(0.1, 0.1);
  }
  if (material.name.startsWith("Paint 1")) {
    material.color.set(LIGHT_BLUE_BODY);
  } else if (material.name.startsWith("Paint 2")) {
    material.color.set(LIGHT_BLUE_TRIM);
  }
  if (material instanceof MeshPhysicalMaterial) {
    material.clearcoat = material.name.includes("2") ? 0.4 : 1;
    material.clearcoatRoughness = 0.2;
  }
}

function requireMesh(root: Object3D, name: string): Mesh {
  const object = root.getObjectByName(name);
  if (!object || !(object as Mesh).isMesh) {
    throw new Error(`车辆模型缺少可分离的网格 ${name}`);
  }
  return object as Mesh;
}

function singleMaterial(material: Material | Material[]): Material {
  return Array.isArray(material) ? material[0] : material;
}

function isStandard(material: Material): material is MeshStandardMaterial {
  return (material as MeshStandardMaterial).isMeshStandardMaterial === true;
}

function sliceGeometry(source: BufferGeometry, vertices: number[]): BufferGeometry {
  const geometry = new BufferGeometry();
  for (const name of Object.keys(source.attributes)) {
    const attribute = source.getAttribute(name);
    const itemSize = attribute.itemSize;
    const array = new Float32Array(vertices.length * itemSize);
    for (let index = 0; index < vertices.length; index += 1) {
      for (let component = 0; component < itemSize; component += 1) {
        array[index * itemSize + component] = attribute.getComponent(vertices[index], component);
      }
    }
    geometry.setAttribute(name, new BufferAttribute(array, itemSize, attribute.normalized));
  }
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
