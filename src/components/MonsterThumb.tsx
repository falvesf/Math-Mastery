import { useEffect, useState } from 'react';
// @ts-ignore - Three do skinview3d (mesma instância usada pelos avatares)
import * as THREE from 'skinview3d/node_modules/three';
// @ts-ignore
import { GLTFLoader } from 'skinview3d/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import { PlayerObject } from 'skinview3d';

/**
 * Miniatura 3D do monstro usando UM ÚNICO contexto WebGL compartilhado.
 * Renderiza o .glb (ou o avatar em bloco, com a skin) e converte em imagem (dataURL),
 * com cache. Assim a galeria pode mostrar muitos monstros sem estourar os contextos WebGL.
 */

const SIZE = 128;
let _renderer: any = null;
let _scene: any = null;
let _camera: any = null;
const thumbCache = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();

function ensureRenderer() {
  if (_renderer) return;
  _renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true, powerPreference: 'low-power' });
  _renderer.setPixelRatio(1);
  _renderer.setSize(SIZE, SIZE);
  _renderer.setClearColor(0x000000, 0);
  _scene = new THREE.Scene();
  _camera = new THREE.PerspectiveCamera(32, 1, 0.1, 1000);
}

function addLights(scene: any) {
  scene.add(new THREE.AmbientLight(0xffffff, 1.15));
  const d = new THREE.DirectionalLight(0xffffff, 1.7); d.position.set(2, 4, 3); scene.add(d);
  const d2 = new THREE.DirectionalLight(0xffffff, 0.6); d2.position.set(-3, 2, -2); scene.add(d2);
}

function renderObject(obj: any, rotYdeg = 0, zoom = 1): string {
  // Direção (virado para frente/trás) definida no cadastro do monstro.
  obj.rotation.y += (Number(rotYdeg) || 0) * (Math.PI / 180);
  const box = new THREE.Box3().setFromObject(obj);
  const h = Math.max(0.001, box.max.y - box.min.y);
  const s = 1.6 / h;
  obj.scale.setScalar(s);
  obj.position.y = -box.min.y * s;
  const holder = new THREE.Group(); holder.add(obj);
  _scene.clear(); addLights(_scene); _scene.add(holder);
  _camera.aspect = 1; _camera.updateProjectionMatrix();
  // Escala do monstro (customZoom): aproxima/afasta a câmera suavemente.
  const z = Math.max(0.5, Math.min(1.8, Number(zoom) || 1));
  _camera.position.set(0, 1.05, 3.6 / z); _camera.lookAt(0, 0.9, 0);
  _renderer.render(_scene, _camera);
  try { return _renderer.domElement.toDataURL('image/png'); } catch { return ''; }
}

// Avatar BLOCO genérico (quando não há .glb nem skin): boneco minecraft simples.
function blockFallback() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x9aa1ab, roughness: 0.9 });
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), mat); head.position.y = 1.25; g.add(head);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.75, 0.25), mat); body.position.y = 0.62; g.add(body);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.75, 0.25), mat); armL.position.set(-0.38, 0.62, 0); g.add(armL);
  const armR = armL.clone(); armR.position.x = 0.38; g.add(armR);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.75, 0.25), mat); legL.position.set(-0.13, -0.38, 0); g.add(legL);
  const legR = legL.clone(); legR.position.x = 0.13; g.add(legR);
  return g;
}

async function buildThumb(opts: { modelUrl?: string; skinUrl?: string; slim?: boolean; rotY?: number; zoom?: number }): Promise<string> {
  ensureRenderer();
  // 1) .glb → modelo 3D real
  if (opts.modelUrl) {
    try {
      const gltf: any = await new GLTFLoader().loadAsync(opts.modelUrl);
      const model = gltf.scene;
      // Skin associada ao monstro: aplica SÓ em materiais SEM textura própria
      // (senão apagaria a skin embutida do .glb).
      if (opts.skinUrl) {
        try {
          const tl = new THREE.TextureLoader();
          if (tl.setCrossOrigin) tl.setCrossOrigin('anonymous');
          const tex: any = await new Promise((res, rej) => tl.load(opts.skinUrl as string, res, undefined, rej));
          if (tex) {
            tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter;
            model.traverse((ch: any) => {
              if (!ch.isMesh || !ch.material) return;
              const mats = Array.isArray(ch.material) ? ch.material : [ch.material];
              mats.forEach((m: any) => { if (m && !m.map) { m.map = tex; m.needsUpdate = true; } });
            });
          }
        } catch { /* mantém a textura do glb */ }
      }
      return renderObject(model, opts.rotY, opts.zoom);
    } catch { /* cai para skin/bloco */ }
  }
  // 2) skin (avatar bloco) → PlayerObject com a skin
  if (opts.skinUrl) {
    try {
      const po: any = new PlayerObject();
      po.skin.modelType = opts.slim ? 'slim' : 'default';
      const tl = new THREE.TextureLoader();
      if (tl.setCrossOrigin) tl.setCrossOrigin('anonymous');
      const tex: any = await new Promise((res, rej) => tl.load(opts.skinUrl as string, res, undefined, rej));
      if (tex) { tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; po.skin.map = tex; }
      return renderObject(po, opts.rotY, opts.zoom);
    } catch { /* cai para o bloco genérico */ }
  }
  // 3) sem modelo/skin → boneco bloco genérico
  return renderObject(blockFallback(), opts.rotY, opts.zoom);
}

function getOrBuild(key: string, opts: any, onReady: (u: string) => void): string | null {
  const cached = thumbCache.get(key);
  if (cached !== undefined) return cached;
  if (!inflight.has(key)) {
    const p = buildThumb(opts)
      .then((url) => { thumbCache.set(key, url); onReady(url); return url; })
      .catch(() => { thumbCache.set(key, ''); onReady(''); return ''; });
    inflight.set(key, p);
  }
  return null;
}

interface MonsterThumbProps {
  thumbKey: string;
  modelUrl?: string;
  skinUrl?: string;
  slim?: boolean;
  rotY?: number;
  zoom?: number;
  size?: number;
  fallbackIcon?: any;
}

export default function MonsterThumb({ thumbKey, modelUrl, skinUrl, slim, rotY, zoom, size = 56, fallbackIcon }: MonsterThumbProps) {
  const [url, setUrl] = useState<string | null>(thumbCache.has(thumbKey) ? thumbCache.get(thumbKey)! : null);
  useEffect(() => {
    let alive = true;
    const cached = thumbCache.get(thumbKey);
    if (cached !== undefined) { setUrl(cached); return; }
    setUrl(null);
    getOrBuild(thumbKey, { modelUrl, skinUrl, slim, rotY, zoom }, (u) => { if (alive) setUrl(u); });
    return () => { alive = false; };
  }, [thumbKey, modelUrl, skinUrl, slim, rotY, zoom]);
  return (
    <div style={{ width: size, height: size, flexShrink: 0, borderRadius: 8, background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      {url ? <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : (fallbackIcon || null)}
    </div>
  );
}
