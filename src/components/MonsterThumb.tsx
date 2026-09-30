import { useEffect, useState } from 'react';
// @ts-ignore - Three do skinview3d (mesma instância usada pelos avatares)
import * as THREE from 'skinview3d/node_modules/three';
// @ts-ignore
import { GLTFLoader } from 'skinview3d/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import { PlayerObject } from 'skinview3d';
import { applyEnvironment, tuneMaterialsForEnv, applyTextureAnisotropy } from '../lib/studioEnv';

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
  // Recria se o contexto foi perdido.
  try {
    if (_renderer && _renderer.getContext && _renderer.getContext().isContextLost && _renderer.getContext().isContextLost()) {
      try { _renderer.dispose(); } catch { /* noop */ }
      _renderer = null;
    }
  } catch { _renderer = null; }
  if (_renderer) return;
  _renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
  _renderer.setPixelRatio(1);
  _renderer.setSize(SIZE, SIZE);
  _renderer.setClearColor(0x000000, 0);
  _scene = new THREE.Scene();
  _camera = new THREE.PerspectiveCamera(32, 1, 0.1, 1000);
  // Environment de estúdio (sem tone mapping, para manter o visual dos ícones):
  // metais refletem como no Sketchfab. Persiste mesmo após _scene.clear().
  applyEnvironment(THREE, _renderer, _scene, { intensity: 0.9, toneMapping: false });
}

function addLights(scene: any) {
  scene.add(new THREE.AmbientLight(0xffffff, 1.15));
  const d = new THREE.DirectionalLight(0xffffff, 1.7); d.position.set(2, 4, 3); scene.add(d);
  const d2 = new THREE.DirectionalLight(0xffffff, 0.6); d2.position.set(-3, 2, -2); scene.add(d2);
}

function renderObject(obj: any, rotYdeg = 0, zoom = 1, isGlb = false): string {
  // Direção: GLBs costumam vir "de costas" → base Math.PI (igual ao editor do jogo)
  // + a rotação extra configurada no monstro (customRotY).
  obj.rotation.y = (isGlb ? Math.PI : 0) + (Number(rotYdeg) || 0) * (Math.PI / 180);
  const box0 = new THREE.Box3().setFromObject(obj);
  const size0 = new THREE.Vector3(); box0.getSize(size0);
  const center0 = new THREE.Vector3(); box0.getCenter(center0);
  // Enquadra pelo MAIOR lado (evita estourar o quadrado em modelos largos, ex.: aranha).
  const maxDim = Math.max(0.001, size0.x, size0.y, size0.z);
  const s = 1.45 / maxDim;
  obj.scale.setScalar(s);
  obj.position.set(-center0.x * s, -box0.min.y * s, -center0.z * s);
  const holder = new THREE.Group(); holder.add(obj);
  _scene.clear(); addLights(_scene); _scene.add(holder);
  tuneMaterialsForEnv(holder, 0.9);
  _camera.aspect = 1; _camera.updateProjectionMatrix();
  const h = size0.y * s;
  const z = Math.max(0.5, Math.min(1.6, Number(zoom) || 1)); // customZoom → aproxima/afasta
  _camera.position.set(0, h * 0.55, (maxDim > 0.001 ? 3.4 : 3.4) / z);
  _camera.lookAt(0, h * 0.5, 0);
  _renderer.render(_scene, _camera);
  try { return _renderer.domElement.toDataURL('image/png'); } catch (e) { console.warn('[MonsterThumb] toDataURL falhou (canvas tainted?):', e); return ''; }
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
      const loader = new GLTFLoader();
      if ((loader as any).setCrossOrigin) (loader as any).setCrossOrigin('anonymous');
      const gltf: any = await loader.loadAsync(opts.modelUrl);
      const model = gltf.scene;
      // Skin associada ao monstro (se for IMAGEM): aplica em TODOS os materiais.
      if (opts.skinUrl) {
        try {
          const tl = new THREE.TextureLoader();
          if (tl.setCrossOrigin) tl.setCrossOrigin('anonymous');
          const tex: any = await new Promise((res, rej) => tl.load(opts.skinUrl as string, res, undefined, rej));
          if (tex) {
            tex.flipY = false;
            try { tex.colorSpace = (THREE as any).SRGBColorSpace; } catch { /* noop */ }
            tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter;
            model.traverse((ch: any) => {
              if (!ch.isMesh || !ch.material) return;
              const mats = Array.isArray(ch.material) ? ch.material : [ch.material];
              mats.forEach((m: any) => { if (m) { m.map = tex; m.transparent = false; m.alphaTest = 0.5; m.needsUpdate = true; } });
            });
          }
        } catch { /* mantém a textura do glb */ }
      }
      applyTextureAnisotropy(model, _renderer);
      return renderObject(model, opts.rotY, opts.zoom, true);
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
      if (tex) { tex.colorSpace = (THREE as any).SRGBColorSpace; tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; po.skin.map = tex; }
      return renderObject(po, opts.rotY, opts.zoom, false);
    } catch { /* cai para o bloco genérico */ }
  }
  // 3) sem modelo/skin → boneco bloco genérico
  return renderObject(blockFallback(), opts.rotY, opts.zoom, false);
}

// Retorna SEMPRE uma promise (a em andamento ou uma nova). Assim quem monta 2x (StrictMode)
// recebe o resultado, em vez de "perder" o callback.
function getOrBuild(key: string, opts: any): Promise<string> {
  const cached = thumbCache.get(key);
  if (cached !== undefined) return Promise.resolve(cached);
  const existing = inflight.get(key);
  if (existing) return existing;
  const p = buildThumb(opts)
    .then((url) => { if (url) thumbCache.set(key, url); return url; })
    .catch((e) => { console.warn('[MonsterThumb] falha ao gerar miniatura:', e); return ''; })
    .finally(() => { inflight.delete(key); }); // libera p/ tentar de novo se falhou
  inflight.set(key, p);
  return p;
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
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const cached = thumbCache.get(thumbKey);
    if (cached !== undefined) { setUrl(cached); return; }
    setUrl(null); setErr(null);
    getOrBuild(thumbKey, { modelUrl, skinUrl, slim, rotY, zoom })
      .then((u) => { if (!alive) return; if (u) setUrl(u); else setErr('render vazio'); })
      .catch((e) => { if (alive) setErr(String((e && (e as any).message) || e)); });
    return () => { alive = false; };
  }, [thumbKey, modelUrl, skinUrl, slim, rotY, zoom]);
  return (
    <div style={{ width: size, height: size, flexShrink: 0, borderRadius: 8, background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative' }}>
      {url ? (
        <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
      ) : (fallbackIcon || null)}
      {!url && err && (
        <div title={err} style={{ position: 'absolute', bottom: 0, left: 0, right: 0, fontSize: '0.5rem', color: '#f87171', background: 'rgba(0,0,0,0.6)', padding: '1px 2px', textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{err}</div>
      )}
    </div>
  );
}
