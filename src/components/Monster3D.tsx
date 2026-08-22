import { useEffect, useRef } from 'react';
import * as THREE from 'three';

interface Monster3DProps {
  size?: number;
  state: 'idle' | 'attack' | 'hit' | 'defeated' | 'fatal';
  flashRed?: boolean;
}

interface Part {
  mesh: THREE.Mesh;
  baseColor: THREE.Color;
  bone: 'head' | 'body' | 'leftArm' | 'rightArm' | 'leftLeg' | 'rightLeg';
  dir: THREE.Vector3; // direção de dispersão no fatality
  basePos: THREE.Vector3;
  baseRot: THREE.Euler;
}

// Paleta de monstro (verde/roxo/azul/ciano) — NÃO vermelho (vermelho só no flash)
const PART_COLORS = [
  0x4ade80, 0x86efac, 0x6d28d9, 0xa78bfa,
  0x0ea5e9, 0x38bdf8, 0x10b981, 0x34d399,
];

/**
 * Monstro LENDÁRIO procedural (THREE puro, estilo voxel), virado para a CÂMERA
 * e com animações por estado. Em 'fatal', as partes EXPLODEM (fatality).
 */
export default function Monster3D({ size = 180, state = 'idle', flashRed = false }: Monster3DProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const partsRef = useRef<Part[]>([]);
  const groupRef = useRef<THREE.Group | null>(null);
  const rafRef = useRef<number>(0);
  const startRef = useRef<number>(0);
  const stateStartRef = useRef<number>(0);

  // Criação do monstro procedural
  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setSize(size, size);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(0, 7, 22);
    camera.lookAt(0, 6, 0);
    cameraRef.current = camera;

    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const dir = new THREE.DirectionalLight(0xffffff, 1.0);
    dir.position.set(6, 12, 10);
    scene.add(dir);
    const rim = new THREE.DirectionalLight(0xff8844, 0.4);
    rim.position.set(-8, 2, -6);
    scene.add(rim);

    const group = new THREE.Group();
    group.rotation.y = 0; // FRENTE natural: +z (para a câmera em z>0)
    scene.add(group);
    groupRef.current = group;

    const colorPick = () => PART_COLORS[Math.floor(Math.random() * PART_COLORS.length)];

    const addBox = (
      bone: Part['bone'],
      w: number, h: number, d: number,
      x: number, y: number, z: number,
      color: number
    ) => {
      const geo = new THREE.BoxGeometry(w, h, d);
      const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.05 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      // A frente do boneco fica em +z (para a câmera)
      partsRef.current.push({
        mesh,
        baseColor: new THREE.Color(color),
        bone,
        dir: new THREE.Vector3(x * 0.6, 0.5, z * 0.6).normalize().multiplyScalar(2),
        basePos: new THREE.Vector3(x, y, z),
        baseRot: mesh.rotation.clone(),
      });
      group.add(mesh);
    };

    addBox('body', 8, 9, 4, 0, 6, 0, colorPick());
    addBox('head', 7, 7, 7, 0, 14, 0, colorPick());
    addBox('leftArm', 3, 8, 3, -5.5, 8, 0, colorPick());
    addBox('rightArm', 3, 8, 3, 5.5, 8, 0, colorPick());
    addBox('leftLeg', 3, 6, 3, -2.5, 2, 0, colorPick());
    addBox('rightLeg', 3, 6, 3, 2.5, 2, 0, colorPick());

    // Olhos (na frente, +z)
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0xffdd00, emissive: 0xcc8800 });
    const eyeGeo = new THREE.BoxGeometry(0.8, 0.8, 0.2);
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
    eyeL.position.set(-1.6, 15, 3.5);
    const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
    eyeR.position.set(1.6, 15, 3.5);
    group.add(eyeL); group.add(eyeR);

    // Boca
    const mouthMat = new THREE.MeshStandardMaterial({ color: 0x7c2d12, emissive: 0x450a0a });
    const mouthGeo = new THREE.BoxGeometry(3, 1, 0.2);
    const mouth = new THREE.Mesh(mouthGeo, mouthMat);
    mouth.position.set(0, 12.4, 3.5);
    group.add(mouth);

    // Chifres
    const hornMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.5 });
    const hornGeo = new THREE.BoxGeometry(1.2, 3, 1.2);
    const hornL = new THREE.Mesh(hornGeo, hornMat);
    hornL.position.set(-2.8, 18, 0);
    hornL.rotation.z = 0.4;
    const hornR = new THREE.Mesh(hornGeo, hornMat);
    hornR.position.set(2.8, 18, 0);
    hornR.rotation.z = -0.4;
    group.add(hornL); group.add(hornR);

    startRef.current = performance.now();
    stateStartRef.current = performance.now();

    return () => {
      cancelAnimationFrame(rafRef.current);
      renderer.dispose();
      scene.traverse((obj) => {
        if ((obj as THREE.Mesh).geometry) (obj as THREE.Mesh).geometry.dispose();
      });
      rendererRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
      groupRef.current = null;
      partsRef.current = [];
    };
  }, [size]);

  // FLASH VERMELHO
  useEffect(() => {
    if (!flashRed) return;
    const parts = partsRef.current;
    if (parts.length === 0) return;
    const originals = parts.map(p => p.baseColor.clone());
    parts.forEach(p => {
      (p.mesh.material as THREE.MeshStandardMaterial).color.set(0xff2222);
      (p.mesh.material as THREE.MeshStandardMaterial).emissive.set(0x880000);
    });
    const t = setTimeout(() => {
      parts.forEach((p, i) => {
        (p.mesh.material as THREE.MeshStandardMaterial).color.copy(originals[i]);
        (p.mesh.material as THREE.MeshStandardMaterial).emissive.set(0x000000);
      });
    }, 1000);
    return () => clearTimeout(t);
  }, [flashRed]);

  // Loop de animação por estado
  useEffect(() => {
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const group = groupRef.current;
    if (!renderer || !scene || !camera || !group) return;

    const findBone = (name: Part['bone']) => partsRef.current.filter(p => p.bone === name);

    const step = (time: number) => {
      const elapsed = (time - startRef.current) / 1000;
      const stateElapsed = (time - stateStartRef.current) / 1000;

      // Reset de transformações base (exceto em fatal/defeated: partes ficam onde estão)
      if (state !== 'fatal' && state !== 'defeated') {
        partsRef.current.forEach(p => {
          p.mesh.position.copy(p.basePos);
          p.mesh.rotation.copy(p.baseRot);
        });
      }
      group.rotation.set(0, 0, 0);
      group.position.set(0, 0, 0);

      if (state === 'fatal') {
        // FATALITY: partes explodem para fora e caem
        const t = stateElapsed;
        partsRef.current.forEach(p => {
          p.mesh.position.x += p.dir.x * t * 4;
          p.mesh.position.y += p.dir.y * t * 3 + t * t * 2;
          p.mesh.position.z += p.dir.z * t * 4;
          p.mesh.rotation.x += t * 6;
          p.mesh.rotation.y += t * 5;
          p.mesh.rotation.z += t * 4;
        });
        group.rotation.z = Math.min(t * 0.5, 0.3);
      } else if (state === 'defeated') {
        const fall = Math.min(stateElapsed * 0.9, Math.PI / 2);
        group.rotation.z = -fall;
        group.position.y = -fall * 4;
        group.position.x = fall * 3;
      } else if (state === 'attack') {
        // Avança em profundidade (Z) na direção do herói, sem virar de lado
        const lunge = Math.sin(Math.min(stateElapsed * 1.6, Math.PI)) * 2;
        group.position.z = lunge;
        // Leve giro do corpo para "encarar" o herói (esquerda)
        group.rotation.y = 0.5;
        findBone('leftArm').forEach(p => p.mesh.rotation.x = -Math.PI / 1.4 + Math.sin(stateElapsed * 12) * 0.4);
        findBone('rightArm').forEach(p => p.mesh.rotation.x = -Math.PI / 1.4 - Math.sin(stateElapsed * 12) * 0.4);
        findBone('head').forEach(p => p.mesh.rotation.x = -0.2);
        group.position.y = Math.abs(Math.sin(stateElapsed * 3)) * 0.3;
      } else if (state === 'hit') {
        // Recua em profundidade e treme, encarando o herói
        const recoil = Math.sin(Math.min(stateElapsed * 3, Math.PI)) * -2;
        group.position.z = recoil;
        group.rotation.y = 0.5;
        group.position.y = Math.sin(stateElapsed * 30) * 0.3;
        findBone('leftArm').forEach(p => p.mesh.rotation.x = -Math.PI / 2 + Math.sin(stateElapsed * 20) * 0.3);
        findBone('rightArm').forEach(p => p.mesh.rotation.x = -Math.PI / 2 - Math.sin(stateElapsed * 20) * 0.3);
        findBone('head').forEach(p => p.mesh.rotation.x = -0.4);
      } else {
        // idle: balança ameaçador, encarando o herói
        group.rotation.y = 0.4;
        findBone('head').forEach(p => p.mesh.rotation.y = Math.sin(elapsed * 3) * 0.15);
        findBone('leftArm').forEach(p => p.mesh.rotation.x = -Math.PI / 3 + Math.sin(elapsed * 4) * 0.25);
        findBone('rightArm').forEach(p => p.mesh.rotation.x = -Math.PI / 3 - Math.sin(elapsed * 4) * 0.25);
        findBone('leftLeg').forEach(p => p.mesh.rotation.x = Math.sin(elapsed * 3) * 0.15);
        findBone('rightLeg').forEach(p => p.mesh.rotation.x = -Math.sin(elapsed * 3) * 0.15);
        group.position.y = Math.abs(Math.sin(elapsed * 2)) * 0.3;
      }

      renderer.render(scene, camera);
      rafRef.current = requestAnimationFrame(step);
    };
    stateStartRef.current = performance.now();
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [state]);

  return <canvas ref={canvasRef} style={{ width: size, height: size }} />;
}