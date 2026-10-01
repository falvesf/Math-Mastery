import { useEffect, useRef } from 'react';
// @ts-ignore - Three do skinview3d (mesma instância usada pelos avatares/monstros)
import * as THREE from 'skinview3d/node_modules/three';
// @ts-ignore
import { GLTFLoader } from 'skinview3d/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import { PlayerObject } from 'skinview3d';
import { applyTextureAnisotropy } from '../lib/studioEnv';

export interface RanchPetView {
  id: string;
  name: string;
  modelUrl?: string;
  skinUrl?: string;
  slim?: boolean;
  state: 'ranch' | 'equipped' | 'ran_away' | 'dead';
  angry?: boolean;
  sad?: boolean;
  selected?: boolean;
}

interface Ranch3DProps {
  pets: RanchPetView[];
  waterLevel: number; // 0..100
  hasFood?: boolean;
  hasWater?: boolean;
  hasHay?: boolean;
  onSelectPet?: (id: string) => void;
  height?: number;
}

/**
 * Rancho 3D: cercado + cochos (com nível de água) + palha + os pets domesticados.
 * Renderiza o .glb (com skin) ou o avatar em bloco de cada pet.
 */
export default function Ranch3D({ pets, waterLevel, hasFood = true, hasWater = true, hasHay = true, onSelectPet, height = 380 }: Ranch3DProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const petsKey = JSON.stringify(pets);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let disposed = false;
    const width = mount.clientWidth || 700;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#8ecbff');
    scene.fog = new THREE.Fog(new THREE.Color('#cfe8ff'), 22, 60);
    scene.add(new THREE.AmbientLight(0xffffff, 0.85));
    const sun = new THREE.DirectionalLight(0xffffff, 1.5); sun.position.set(6, 12, 5); sun.castShadow = true; scene.add(sun);

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 300);

    // Chão (areia/terra do rancho)
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ color: 0xd9b877, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
    const grass = new THREE.Mesh(new THREE.RingGeometry(15, 40, 40), new THREE.MeshStandardMaterial({ color: 0x6ab04c, roughness: 1 }));
    grass.rotation.x = -Math.PI / 2; grass.position.y = 0.01; scene.add(grass);

    // Cercado (branco) — 14x14
    const fenceMat = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.8 });
    const addFence = (cx: number, cz: number, lenX: number, lenZ: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(lenX, 0.9, lenZ), fenceMat);
      m.position.set(cx, 0.6, cz); m.castShadow = true; scene.add(m);
    };
    const R = 7;
    addFence(0, -R, 2 * R, 0.16); addFence(0, R, 2 * R, 0.16);
    addFence(-R, 0, 0.16, 2 * R); addFence(R, 0, 0.16, 2 * R);

    // Cocho de comida + palha
    if (hasFood) { const t = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.4, 0.9), new THREE.MeshStandardMaterial({ color: 0x8a5a2b, roughness: 0.9 })); t.position.set(-3, 0.25, -5); t.castShadow = true; scene.add(t); }
    if (hasHay) { const h = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.7, 1.8), new THREE.MeshStandardMaterial({ color: 0xd9c14a, roughness: 1 })); h.position.set(4.5, 0.35, 4.5); h.castShadow = true; scene.add(h); }

    // Bebedouro com NÍVEL DE ÁGUA (baixa em 3D)
    let waterMesh: THREE.Mesh | null = null;
    if (hasWater) {
      const troughMat = new THREE.MeshStandardMaterial({ color: 0x6b6b70, roughness: 0.8 });
      const trough = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.5, 1.0), troughMat); trough.position.set(3, 0.25, -5); trough.castShadow = true; scene.add(trough);
      const wl = Math.max(0, Math.min(100, waterLevel)) / 100;
      const hgt = Math.max(0.02, 0.42 * wl);
      waterMesh = new THREE.Mesh(new THREE.BoxGeometry(1.86, hgt, 0.86), new THREE.MeshStandardMaterial({ color: 0x2b6cff, transparent: true, opacity: 0.7, emissive: 0x123a80, emissiveIntensity: 0.25 }));
      waterMesh.position.set(3, 0.04 + hgt / 2, -5); scene.add(waterMesh);
    }

    // Pets (glb/skin) no cercado
    const petGroups: { g: THREE.Group; base: THREE.Group; vx: number; vz: number; t: number; angry: boolean; sad: boolean; dead: boolean; legPhase: number; legs?: any }[] = [];
    const loader = new GLTFLoader();
    const placeAt = () => ({ x: (Math.random() - 0.5) * 10, z: (Math.random() - 0.5) * 10 });

    (async () => {
      let idx = 0;
      for (const p of pets) {
        if (disposed) return;
        const g = new THREE.Group(); const base = new THREE.Group();
        const pos = idx === 0 ? { x: 0, z: 0 } : placeAt(); idx++;
        g.position.set(pos.x, 0, pos.z); g.add(base); scene.add(g);
        let legsObj: any = null;
        try {
          if (p.modelUrl) {
            const gltf: any = await loader.loadAsync(p.modelUrl);
            const model = gltf.scene;
            applyTextureAnisotropy(model, renderer);
            if (p.skinUrl) {
              try {
                const tl = new THREE.TextureLoader(); if (tl.setCrossOrigin) tl.setCrossOrigin('anonymous');
                const tex: any = await new Promise((res, rej) => tl.load(p.skinUrl as string, res, undefined, rej));
                if (tex) { tex.flipY = false; try { tex.colorSpace = (THREE as any).SRGBColorSpace; } catch { /* noop */ } tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; model.traverse((ch: any) => { if (ch.isMesh && ch.material) { const ms = Array.isArray(ch.material) ? ch.material : [ch.material]; ms.forEach((m: any) => { m.map = tex; m.needsUpdate = true; }); } }); }
              } catch { /* mantém */ }
            }
            const box = new THREE.Box3().setFromObject(model); const size = new THREE.Vector3(); box.getSize(size); const c = new THREE.Vector3(); box.getCenter(c);
            const md = Math.max(0.001, size.x, size.y, size.z); const s = 1.7 / md;
            model.scale.setScalar(s); model.position.set(-c.x * s, -box.min.y * s, -c.z * s); model.traverse((ch: any) => { if (ch.isMesh) ch.castShadow = true; });
            base.add(model);
          } else if (p.skinUrl) {
            const po: any = new PlayerObject(); po.skin.modelType = p.slim ? 'slim' : 'default';
            const tl = new THREE.TextureLoader(); if (tl.setCrossOrigin) tl.setCrossOrigin('anonymous');
            const tex: any = await new Promise((res, rej) => tl.load(p.skinUrl as string, res, undefined, rej));
            if (tex) { tex.colorSpace = (THREE as any).SRGBColorSpace; tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; po.skin.map = tex; }
            const box = new THREE.Box3().setFromObject(po); const size = new THREE.Vector3(); box.getSize(size); const h = Math.max(0.001, size.y); const s = 1.7 / h;
            po.scale.setScalar(s); po.traverse((ch: any) => { if (ch.isMesh) ch.castShadow = true; });
            base.add(po); legsObj = po;
          } else {
            const mat = new THREE.MeshStandardMaterial({ color: 0x9aa1ab, roughness: 0.9 });
            const g2 = new THREE.Group();
            const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), mat); head.position.y = 1.25; g2.add(head);
            const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.75, 0.25), mat); body.position.y = 0.62; g2.add(body);
            base.add(g2);
          }
        } catch { /* mantém vazio */ }
        // Estado: morto cai de lado; triste/irritado altera cor/velocidade.
        if (p.state === 'dead') { base.rotation.z = Math.PI / 2; base.position.y = 0.5; base.traverse((ch: any) => { if (ch.isMesh && ch.material) { const ms = Array.isArray(ch.material) ? ch.material : [ch.material]; ms.forEach((m: any) => { m.color = new THREE.Color(0x777777); }); } }); }
        else if (p.angry) { base.traverse((ch: any) => { if (ch.isMesh && ch.material) { const ms = Array.isArray(ch.material) ? ch.material : [ch.material]; ms.forEach((m: any) => { if (!m._orig) m._orig = (m.color || new THREE.Color(0xffffff)).clone(); m.color = new THREE.Color(0xff5555); }); } }); }
        if (p.selected) { const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.15, 28), new THREE.MeshBasicMaterial({ color: 0xffd34d, transparent: true, opacity: 0.85, side: THREE.DoubleSide })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; g.add(ring); }
        petGroups.push({ g, base, vx: (Math.random() - 0.5) * 0.6, vz: (Math.random() - 0.5) * 0.6, t: 1 + Math.random() * 2, angry: !!p.angry, sad: !!p.sad, dead: p.state === 'dead', legPhase: 0, legs: legsObj });
      }
    })();

    // Clique: seleciona o pet mais próximo.
    const raycaster = new THREE.Raycaster(); const ndc = new THREE.Vector2(); let downAt = 0;
    const onDown = (e: MouseEvent) => { downAt = Date.now(); ndc.x = (e.offsetX / renderer.domElement.clientWidth) * 2 - 1; ndc.y = -(e.offsetY / renderer.domElement.clientHeight) * 2 + 1; };
    const onUp = (e: MouseEvent) => {
      if (Date.now() - downAt > 350) return;
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObjects(petGroups.map(pg => pg.g), true);
      if (hits.length) { let o: any = hits[0].object; while (o && !petGroups.some(pg => pg.g === o)) o = o.parent; const pg = petGroups.find(x => x.g === o); if (pg && onSelectPet) { const i = petGroups.indexOf(pg); if (pets[i]) onSelectPet(pets[i].id); } }
    };
    renderer.domElement.addEventListener('mousedown', onDown);
    renderer.domElement.addEventListener('mouseup', onUp);

    // Câmera orbitando devagar em volta do cercado.
    let t = 0; let raf = 0;
    const loop = () => {
      t += 0.008;
      const rad = 13;
      camera.position.set(Math.sin(t) * rad, 7.5, Math.cos(t) * rad);
      camera.lookAt(0, 1.0, 0);
      for (const pg of petGroups) {
        if (pg.dead) continue;
        pg.t -= 0.016;
        if (pg.t <= 0) { pg.t = 1.5 + Math.random() * 3; pg.vx = (Math.random() - 0.5) * (pg.sad ? 0.25 : 0.7); pg.vz = (Math.random() - 0.5) * (pg.sad ? 0.25 : 0.7); }
        pg.g.position.x += pg.vx * 0.016; pg.g.position.z += pg.vz * 0.016;
        if (pg.g.position.x > 6) { pg.g.position.x = 6; pg.vx *= -1; } if (pg.g.position.x < -6) { pg.g.position.x = -6; pg.vx *= -1; }
        if (pg.g.position.z > 6) { pg.g.position.z = 6; pg.vz *= -1; } if (pg.g.position.z < -6) { pg.g.position.z = -6; pg.vz *= -1; }
        if (Math.abs(pg.vx) + Math.abs(pg.vz) > 0.05) { pg.g.rotation.y = Math.atan2(pg.vx, pg.vz); }
        // Pernas (avatar bloco) balançando
        if (pg.legs) {
          const moving = Math.abs(pg.vx) + Math.abs(pg.vz) > 0.05;
          if (moving) { pg.legPhase += 0.016 * 8; const a = Math.sin(pg.legPhase) * 0.7; pg.legs.skin.leftLeg.rotation.x = a; pg.legs.skin.rightLeg.rotation.x = -a; pg.legs.skin.leftArm.rotation.x = -a * 0.85; pg.legs.skin.rightArm.rotation.x = a * 0.85; }
          else if (pg.legPhase) { pg.legPhase = 0; try { pg.legs.skin.resetJoints(); } catch { /* noop */ } }
        }
      }
      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    const onResize = () => { const w = mount.clientWidth || width; camera.aspect = w / height; camera.updateProjectionMatrix(); renderer.setSize(w, height); };
    window.addEventListener('resize', onResize);

    return () => {
      disposed = true;
      window.removeEventListener('resize', onResize);
      renderer.domElement.removeEventListener('mousedown', onDown);
      renderer.domElement.removeEventListener('mouseup', onUp);
      cancelAnimationFrame(raf);
      try { renderer.dispose(); } catch { /* noop */ }
      try { mount.removeChild(renderer.domElement); } catch { /* noop */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [petsKey, waterLevel, hasFood, hasWater, hasHay, height]);

  return <div ref={mountRef} style={{ width: '100%', height, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border-glass)' }} />;
}
