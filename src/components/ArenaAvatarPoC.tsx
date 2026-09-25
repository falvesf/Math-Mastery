import React, { useEffect, useRef, useState } from 'react';
import { SkinViewer, IdleAnimation, WalkingAnimation, RunningAnimation, HitAnimation, PlayerAnimation } from 'skinview3d';
// @ts-ignore - Three do skinview3d (0.156): a arena completa usa a MESMA versão dos bonecos.
import * as THREE from 'skinview3d/node_modules/three';
// @ts-ignore
import { OrbitControls } from 'skinview3d/node_modules/three/examples/jsm/controls/OrbitControls.js';
// @ts-ignore
import { GLTFLoader } from 'skinview3d/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import { generateMinecraftSkinUrl } from '../lib/SkinGenerator';
import { generateVoxelItemFromImage } from '../lib/VoxelItemGenerator';
import { applyForgeGlowToModel, applyForgeGlint, resolveModelTransform, type AvatarConfig, type EquippedItem } from './AvatarCharacter';
import { useAuth } from '../contexts/AuthContext';
import { fetchEquippedItems } from '../lib/equippedItems';
import MapExplorerPoC from './MapExplorerPoC';

const UNIFIED_ENTITY_HEIGHT = 1.9;

function computeWorldBox(obj: any): any {
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3();
  obj.traverse((child: any) => {
    const geo = child?.geometry;
    if (child.isMesh && geo) {
      if (!geo.boundingBox) geo.computeBoundingBox();
      if (geo.boundingBox) box.union(geo.boundingBox.clone().applyMatrix4(child.matrixWorld));
    }
  });
  return box;
}
function fitEntityToGround(obj: any, targetHeight: number) {
  const box = computeWorldBox(obj);
  if (box.isEmpty()) return;
  const h = box.max.y - box.min.y;
  if (h <= 0) return;
  obj.scale.setScalar(targetHeight / h);
  const box2 = computeWorldBox(obj);
  obj.position.y -= box2.min.y;
}

// Animação de ataque (braço direito) — igual à do exportador.
function makeAttack(): PlayerAnimation {
  return new (class extends PlayerAnimation {
    animate(player: any) {
      const t = this.progress;
      const swing = Math.sin(Math.min(1, t) * Math.PI);
      const ra = player.skin.rightArm; const la = player.skin.leftArm;
      if (ra) { ra.rotation.x = -Math.PI / 2 * swing; ra.rotation.z = 0; }
      if (la) { la.rotation.x = Math.PI * 0.15 * swing; la.rotation.z = Math.PI * 0.02; }
    }
  })();
}
function makeVictory(): PlayerAnimation {
  return new (class extends PlayerAnimation {
    animate(player: any) {
      const t = this.progress;
      const la = player.skin.leftArm; const ra = player.skin.rightArm;
      if (la) { la.rotation.x = -Math.PI * 0.9; la.rotation.z = 0.25; }
      if (ra) { ra.rotation.x = -Math.PI * 0.9; ra.rotation.z = -0.25; }
      if (player.skin.body) player.skin.body.rotation.x = Math.sin(t * Math.PI * 2) * 0.06;
    }
  })();
}

const ACTIONS: { id: string; label: string }[] = [
  { id: 'idle', label: 'Parado' },
  { id: 'walk', label: 'Andando' },
  { id: 'run', label: 'Correndo' },
  { id: 'attack', label: 'Atacar' },
  { id: 'victory', label: 'Vitória' },
  { id: 'hurt', label: 'Dano' },
];

export default function ArenaAvatarPoC({ config: configProp, equippedItems: itemsProp }: { config?: AvatarConfig | null; equippedItems?: EquippedItem[] }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState('Inicializando…');
  const playerRef = useRef<any>(null);
  const animRef = useRef<any>(null);
  const [current, setCurrent] = useState('idle');
  const [ready, setReady] = useState(false);
  const [explorerMode, setExplorerMode] = useState(false);
  const [config, setConfig] = useState<AvatarConfig | null>(configProp || null);
  const [equippedItems, setEquippedItems] = useState<EquippedItem[]>(itemsProp || []);
  const { userData } = useAuth();

  // Busca os dados reais do usuário quando não vieram por props (rota /poc-arena).
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!configProp && userData?.avatarConfig) setConfig(userData.avatarConfig);
      if (!itemsProp && userData?.uid) {
        try {
          const snap = await fetchEquippedItems(userData.uid);
          const eq: EquippedItem[] = [];
          (snap || []).forEach((d: any) => {
            const data = d.data;
            if (data && data.avatarPart && (data.itemImageUrl || data.minecraftHeadValue || data.gameModelUrl)) {
              eq.push({
                docId: d.id, itemId: d.item_id, imageUrl: data.itemImageUrl,
                avatarPart: data.avatarPart, itemTitle: data.itemTitle, itemCategory: data.itemCategory,
                forgeLevel: data.forgeLevel || 0, forgeConfig: data.forgeConfig || null,
                gameModelUrl: data.gameModelUrl, modelTextureUrl: data.modelTextureUrl,
                minecraftHeadValue: data.minecraftHeadValue, modelTransforms: data.modelTransforms,
                backColor: data.backColor || '', customAnimation: data.customAnimation, rarity: data.rarity,
              } as any);
            }
          });
          if (alive) setEquippedItems(eq);
        } catch (e) { console.warn('[PoC] fetch itens:', e); }
      }
      if (alive) setReady(true);
    })();
    return () => { alive = false; };
  }, [userData?.uid]);

  useEffect(() => {
    if (!ready) return;
    const mount = mountRef.current;
    if (!mount) return;
    let disposed = false;
    let raf = 0;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#7ec0ee');
    scene.add(new THREE.AmbientLight(0xffffff, 0.95));
    const dir = new THREE.DirectionalLight(0xffffff, 0.85);
    dir.position.set(8, 18, 12);
    scene.add(dir);

    const camera = new THREE.PerspectiveCamera(50, mount.clientWidth / mount.clientHeight, 0.1, 1000);
    camera.position.set(0, 13, 34);
    camera.lookAt(0, 8, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 8, 0);
    controls.enableDamping = true;
    controls.update();

    // ---- Chão em BLOCOS de pedra (grade) ----
    const blockGeo = new THREE.BoxGeometry(2, 2, 2);
    const blockMat = new THREE.MeshStandardMaterial({ color: 0x8a8a8a });
    const floorGroup = new THREE.Group();
    const cols = 22, rows = 13;
    for (let ix = 0; ix < cols; ix++) {
      for (let iz = 0; iz < rows; iz++) {
        const b = new THREE.Mesh(blockGeo, blockMat);
        b.position.set((ix - cols / 2) * 2 + 1, 0, (iz - rows / 2) * 2 + 1);
        floorGroup.add(b);
      }
    }
    scene.add(floorGroup);

    const clock = new THREE.Clock();

    // ---- Jogador: skinview3d 0.156 nativo ----
    const viewer = new SkinViewer({ width: 150, height: 250, renderPaused: true });
    viewer.loadSkin(
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
    ).catch(() => {});

    const loader = new GLTFLoader();

    (async () => {
      try {
        const skinUrl = config?.customSkinUrl || await generateMinecraftSkinUrl(config || ({} as any));
        await viewer.loadSkin(skinUrl, { model: config?.gender === 'female' ? 'slim' : 'default' });
        if (disposed) return;
      } catch (e) { console.warn('[PoC] skin:', e); }
      if (disposed) return;

      const player = viewer.playerObject as any;
      // Encosta no chão e encara a câmera (+z). skinview3d nasce virado p/ +z.
      fitEntityToGround(player, UNIFIED_ENTITY_HEIGHT);
      const pg = new THREE.Group();
      pg.add(player);
      pg.position.set(-4, 1.0, 0);
      pg.rotation.y = Math.PI;
      scene.add(pg);
      playerRef.current = player;

      // ---- Anexa TODOS os itens equipados (mesma lógica do AvatarCharacter/exportador) ----
      const isLeftHanded = config?.handedness === 'left';
      const inv = isLeftHanded ? -1 : 1;
      const IMG_EXT_RE = /\.(png|gif|jpe?g|webp|avif)$/i;

      const attach = (model: any, item: EquippedItem) => {
        model.traverse((c: any) => { if (c.isMesh) c.frustumCulled = false; });
        try { applyForgeGlowToModel(model, item.forgeLevel || 0); } catch { /* noop */ }
        try {
          const _tier = (item.forgeLevel || 0) >= 9 ? 3 : (item.forgeLevel || 0) >= 8 ? 2 : (item.forgeLevel || 0) >= 7 ? 1 : 0;
          const _isWeaponSlot = ['hand', 'two_handed', 'pickaxe', 'rightHand', 'leftHand'].includes(String(item.avatarPart));
          if (_tier > 0 && (['head', 'body', 'legs', 'feet', 'hand', 'two_handed', 'pickaxe', 'rightHand', 'leftHand'].includes(String(item.avatarPart)))) {
            const _style = (_isWeaponSlot && item.itemCategory !== 'defense') ? 'circles' : 'reflect';
            model.traverse((c: any) => {
              if (!c.isMesh) return;
              const mats = Array.isArray(c.material) ? c.material : [c.material];
              mats.forEach((mm: any) => applyForgeGlint(mm, _tier, _style as any));
            });
          }
        } catch { /* noop */ }

        const transform = resolveModelTransform(item, config?.gender, config?.handedness, false) || (item as any).modelTransforms?.common;
        const p = String(item.avatarPart);
        if (['rightHand', 'leftHand', 'hand', 'two_handed', 'pickaxe'].includes(p)) {
          const isDefense = item.itemCategory === 'defense';
          const dominantArm = isLeftHanded ? player.skin.leftArm : player.skin.rightArm;
          const nonDominantArm = isLeftHanded ? player.skin.rightArm : player.skin.leftArm;
          const targetArm = isDefense ? nonDominantArm : dominantArm;
          if (transform) {
            model.scale.set(transform.scale ?? 10, transform.scale ?? 10, (transform.scale ?? 10) * (transform.thickness ?? 1));
            model.position.set(transform.posX * inv, transform.posY, transform.posZ);
            model.rotation.set(transform.rotX, transform.rotY * inv, transform.rotZ * inv);
            model.translateY(transform.slide);
          } else if (p === 'two_handed' || p === 'pickaxe') {
            model.scale.set(10, 10, 10);
            model.position.set(0, -11, 0);
            model.rotation.set(Math.PI / 2.2, 0, isLeftHanded ? Math.PI / 20 : -Math.PI / 20);
            model.translateY(-18);
          } else {
            model.scale.set(10, 10, 10);
            model.position.set(0, -12, 0);
            model.rotation.set(Math.PI / 2, 0, 0);
          }
          targetArm.add(model);
        } else if (p === 'head' || p === 'face') {
          const s = item.minecraftHeadValue ? 9.2 : 16;
          model.scale.set(transform?.scale ?? s, transform?.scale ?? s, (transform?.scale ?? s) * (transform?.thickness ?? 1));
          if (transform) { model.position.set(transform.posX, transform.posY, transform.posZ); model.rotation.set(transform.rotX, transform.rotY, transform.rotZ); model.translateY(transform.slide); }
          else { model.position.set(0, 0, 0); model.rotation.set(0, Math.PI, 0); }
          player.skin.head.add(model);
        } else if (p === 'legs' || p === 'feet') {
          model.scale.set(transform?.scale ?? 16, transform?.scale ?? 16, (transform?.scale ?? 16) * (transform?.thickness ?? 1));
          if (transform) { model.position.set(transform.posX ?? 0, transform.posY ?? 0, transform.posZ ?? 0); model.rotation.set(transform.rotX, transform.rotY, transform.rotZ); model.translateY(transform.slide ?? 0); }
          else model.position.set(0, p === 'feet' ? -22 : -15, 0);
          player.skin.body.add(model);
        } else {
          model.scale.set(transform?.scale ?? 16, transform?.scale ?? 16, (transform?.scale ?? 16) * (transform?.thickness ?? 1));
          if (transform) { model.position.set(transform.posX, transform.posY, transform.posZ); model.rotation.set(transform.rotX, transform.rotY, transform.rotZ); model.translateY(transform.slide); }
          else model.position.set(0, -6, 0);
          player.skin.body.add(model);
        }
        console.log('[PoC] item anexado:', p, item.itemTitle);
      };

      for (const item of equippedItems) {
        if (!item.gameModelUrl) continue;
        const raw = item.gameModelUrl;
        try {
          if (IMG_EXT_RE.test(raw.split('?')[0])) {
            const transform = resolveModelTransform(item, config?.gender, config?.handedness, false) || (item as any).modelTransforms?.common;
            const m = await generateVoxelItemFromImage(raw, item.backColor, transform?.curveX || 0, transform?.curveY || 0, undefined, 0.12 * (transform?.thickness ?? 1));
            attach(m, item);
          } else {
            await new Promise<void>((res) => {
              loader.load(raw, (gltf: any) => { attach(gltf.scene, item); res(); }, undefined, () => res());
            });
          }
        } catch (e) { console.warn('[PoC] item:', item.itemTitle, e); }
      }

      // ---- Monstro GLB ----
      loader.load('/models/monster/enderman.glb', (gltf: any) => {
        if (disposed) return;
        const root = gltf.scene;
        fitEntityToGround(root, UNIFIED_ENTITY_HEIGHT);
        const mg = new THREE.Group();
        mg.add(root);
        mg.position.set(4, 1.0, 0);
        mg.rotation.y = Math.PI;
        scene.add(mg);
      }, undefined, (e: any) => console.warn('[PoC] monstro:', e));

      setStatus(`✅ arena 0.156: chão + jogador skinview3d + ${equippedItems.length} itens + monstro GLB`);
    })();

    const loop = () => {
      if (disposed) return;
      const dt = clock.getDelta();
      const player = playerRef.current;
      if (player && animRef.current) {
        try { animRef.current.update(player, dt); } catch { /* noop */ }
      }
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      try { renderer.dispose(); } catch { /* noop */ }
      try { viewer.dispose(); } catch { /* noop */ }
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, [ready]);

  const setAnim = (id: string) => {
    setCurrent(id);
    animRef.current = ({
      idle: () => new IdleAnimation(),
      walk: () => new WalkingAnimation(),
      run: () => new RunningAnimation(),
      hurt: () => new HitAnimation(),
      attack: () => makeAttack(),
      victory: () => makeVictory(),
    } as any)[id]?.();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', zIndex: 999999, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '0.6rem 1rem', background: '#111', color: '#fff', fontSize: '0.85rem', display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <strong>PoC: Arena 3D / Mapa Explorável</strong>
        <button onClick={() => setExplorerMode(m => !m)} style={{ padding: '0.25rem 0.6rem', cursor: 'pointer', background: explorerMode ? '#2563eb' : '#333', color: '#fff', border: '1px solid #555', borderRadius: 4 }}>
          {explorerMode ? '🗺️ Mapa (modo explorador)' : '🗺️ Ir para o Mapa Explorável (fases antes do chefe)'}
        </button>
        {!explorerMode && (
          <>
            <span style={{ color: '#7dd3fc' }}>{status}</span>
            {ACTIONS.map(a => (
              <button key={a.id} onClick={() => setAnim(a.id)} style={{ padding: '0.25rem 0.6rem', cursor: 'pointer', background: current === a.id ? '#2563eb' : '#333', color: '#fff', border: '1px solid #555', borderRadius: 4 }}>{a.label}</button>
            ))}
            <button onClick={() => location.reload()} style={{ padding: '0.25rem 0.6rem', cursor: 'pointer' }}>Recarregar</button>
          </>
        )}
      </div>
      {explorerMode ? (
        <MapExplorerPoC onExit={() => setExplorerMode(false)} />
      ) : (
        <div ref={mountRef} style={{ flex: 1, position: 'relative' }} />
      )}
    </div>
  );
}
