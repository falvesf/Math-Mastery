import React, { useEffect, useRef, useState } from 'react';
import { SkinViewer, IdleAnimation, WalkingAnimation, RunningAnimation, HitAnimation } from 'skinview3d';
// @ts-ignore - Three do skinview3d (0.156): a arena da PoC usa a MESMA versão dos bonecos.
import * as THREE from 'skinview3d/node_modules/three';
// @ts-ignore
import { OrbitControls } from 'skinview3d/node_modules/three/examples/jsm/controls/OrbitControls.js';
import { generateMinecraftSkinUrl } from '../lib/SkinGenerator';
import { applyForgeGlowToModel, type AvatarConfig, type EquippedItem } from './AvatarCharacter';

const SKIN_URL = null as any;

const ACTION_BTNS: { id: string; label: string }[] = [
  { id: 'idle', label: 'Parado' },
  { id: 'walk', label: 'Andando' },
  { id: 'run', label: 'Correndo' },
  { id: 'hurt', label: 'Dano' },
];

export default function ArenaAvatarPoC({ config, equippedItems = [] }: { config?: AvatarConfig | null; equippedItems?: EquippedItem[] }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState('Inicializando…');
  const playerRef = useRef<any>(null);
  const animRef = useRef<any>(null);
  const clockRef = useRef<any>(null);
  const glintOnRef = useRef(false);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let disposed = false;
    let raf = 0;

    // ---- Cena Three 0.156 (mesma versão dos bonecos) ----
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#7ec0ee');

    const camera = new THREE.PerspectiveCamera(50, mount.clientWidth / mount.clientHeight, 0.1, 1000);
    camera.position.set(0, 14, 42);
    camera.lookAt(0, 10, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.9));
    const dir = new THREE.DirectionalLight(0xffffff, 0.9);
    dir.position.set(10, 20, 15);
    scene.add(dir);

    // Chão simples (pedra) só para ambientar a PoC.
    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(50, 2, 30),
      new THREE.MeshStandardMaterial({ color: 0x6b6b6b })
    );
    floor.position.y = -1;
    scene.add(floor);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 10, 0);
    controls.enableDamping = true;
    controls.update();

    const clock = new THREE.Clock();
    clockRef.current = clock;

    // ---- Boneco skinview3d (0.156) ----
    const viewer = new SkinViewer({ width: 150, height: 250, renderPaused: true });
    viewer.loadSkin(
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
    ).catch(() => {});

    (async () => {
      try {
        const skinUrl = config?.customSkinUrl || await generateMinecraftSkinUrl(config || ({} as any));
        await viewer.loadSkin(skinUrl, { model: config?.gender === 'female' ? 'slim' : 'default' });
        if (disposed) return;
      } catch (e) {
        console.warn('[PoC] falha ao carregar skin:', e);
      }
      if (disposed) return;

      const player = viewer.playerObject as any;
      player.position.set(0, 8, 0);

      // Reaproveita o MESMO efeito de brilho/película de forja do AvatarCharacter.
      if (equippedItems?.length) {
        equippedItems.forEach((item) => {
          if (!item.gameModelUrl) return;
          try { applyForgeGlowToModel(player, item.forgeLevel || 0); } catch { /* noop */ }
        });
      }

      scene.add(player);
      playerRef.current = player;

      const anims: Record<string, any> = {
        idle: new IdleAnimation(),
        walk: new WalkingAnimation(),
        run: new RunningAnimation(),
        hurt: new HitAnimation(),
      };
      animRef.current = anims.idle;
      setStatus('✅ boneco skinview3d (0.156) desenhado dentro da cena 0.156');
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
  }, []);

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', zIndex: 999999, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '0.6rem 1rem', background: '#111', color: '#fff', fontSize: '0.85rem', display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <strong>PoC: Arena Three 0.156 + boneco skinview3d nativo</strong>
        <span style={{ color: '#7dd3fc' }}>{status}</span>
        {ACTION_BTNS.map(a => (
          <button key={a.id} onClick={() => { animRef.current = (playerRef.current && ({
            idle: new IdleAnimation(), walk: new WalkingAnimation(), run: new RunningAnimation(), hurt: new HitAnimation(),
          } as any)[a.id]); }} style={{ padding: '0.25rem 0.6rem', cursor: 'pointer' }}>{a.label}</button>
        ))}
        <button onClick={() => location.reload()} style={{ padding: '0.25rem 0.6rem', cursor: 'pointer' }}>Recarregar</button>
      </div>
      <div ref={mountRef} style={{ flex: 1, position: 'relative' }} />
    </div>
  );
}
