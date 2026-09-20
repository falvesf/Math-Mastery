import { SkinViewer, IdleAnimation, WalkingAnimation, RunningAnimation, HitAnimation, PlayerAnimation } from 'skinview3d';
// @ts-ignore - Three do skinview3d (0.156): precisa ser o MESMO usado pelos objetos.
import * as THREE_SKIN from 'skinview3d/node_modules/three/build/three.module.js';
// @ts-ignore
import { GLTFLoader } from 'skinview3d/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
// @ts-ignore - O exporter DEVE ser do MESMO Three que o skinview3d usa (0.156),
// senão as classes/atributos do objeto não batem com as esperadas pelo exporter.
import { GLTFExporter } from 'skinview3d/node_modules/three/examples/jsm/exporters/GLTFExporter.js';
import { generateMinecraftSkinUrl } from './SkinGenerator';
import { generateVoxelItemFromImage } from './VoxelItemGenerator';
import { type EquippedItem, resolveModelTransform } from '../components/AvatarCharacter';

// Reaproveita o mesmo padrão do AvatarPrintQueue: um viewer off-screen global,
// fila sequencial (o SkinViewer não é thread-safe e cada export reusa o contexto).
let globalViewer: SkinViewer | null = null;

function getViewer(): SkinViewer {
  if (globalViewer) return globalViewer;
  const canvas = document.createElement('canvas');
  globalViewer = new SkinViewer({ canvas, width: 150, height: 250 });
  globalViewer.camera.position.set(0, 15, 60);
  globalViewer.camera.lookAt(0, 15, 0);
  globalViewer.animation = new IdleAnimation();
  if (globalViewer.renderer) globalViewer.renderer.setClearColor(0x000000, 0);
  // Skin dummy (evita IndexSizeError se a skin real falhar na inferência do modelo).
  globalViewer.loadSkin("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=").catch(() => {});
  return globalViewer;
}

function preloadSkinImage(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (!url) return resolve(false);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth || 1;
        c.height = img.naturalHeight || 1;
        const ctx = c.getContext('2d');
        if (!ctx) return resolve(false);
        ctx.drawImage(img, 0, 0);
        ctx.getImageData(0, 0, 1, 1); // lança se a canvas estiver "tainted"
        resolve(true);
      } catch {
        resolve(false);
      }
    };
    img.onerror = () => resolve(false);
    img.src = url;
  });
}

function resolveItemUrl(raw: string): string {
  let safeUrl = raw.replace(/\\/g, '/');
  if (!safeUrl.startsWith('http') && !safeUrl.startsWith('/')) {
    if (!safeUrl.startsWith('models/')) safeUrl = `models/${safeUrl}`;
    safeUrl = `/${safeUrl}`;
  } else if (safeUrl.startsWith('/') && !safeUrl.startsWith('/models/')) {
    safeUrl = `/models${safeUrl}`;
  }
  if (safeUrl.startsWith('/')) safeUrl = import.meta.env.BASE_URL + safeUrl.substring(1);
  return safeUrl;
}

// Ossos do avatar que as animações procedurais do skinview3d movem.
const ANIM_BONES = ['head', 'body', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'];

/**
 * Amostra uma animação procedural do skinview3d (Idle/Walk/Run/Hit/custom) quadro a
 * quadro e devolve tracks de quaternion para cada osso, prontas para virar um
 * AnimationClip dentro do GLB (a arena toca via AnimationMixer, como no monstro).
 */
function bakeClipFromAnimation(
  player: any,
  name: string,
  duration: number,
  fps: number,
  makeAnim: () => PlayerAnimation
): any {
  const THREE = THREE_SKIN as any;
  const times: number[] = [];
  // Guarda amostras por osso: [x,y,z,w] a cada frame.
  const samples: Record<string, number[]> = {};
  ANIM_BONES.forEach((b) => { samples[b] = []; });

  // Reset de pose antes de começar.
  ANIM_BONES.forEach((b) => {
    const node = player.skin?.[b];
    if (node) { node.rotation.set(0, 0, 0); node.updateMatrix(); }
  });

  const anim = makeAnim();
  const frames = Math.max(2, Math.round(duration * fps));
  for (let f = 0; f <= frames; f++) {
    const t = (f / frames) * duration;
    try {
      (anim as any).progress = t;
      (anim as any).animate?.(player);
    } catch { /* noop */ }
    times.push(t);
    ANIM_BONES.forEach((b) => {
      const node = player.skin?.[b];
      if (!node) return;
      node.updateMatrix();
      const q = node.quaternion;
      samples[b].push(q.x, q.y, q.z, q.w);
    });
  }

  const tracks: any[] = [];
  ANIM_BONES.forEach((b) => {
    if (!player.skin?.[b]) return;
    tracks.push(new THREE.QuaternionKeyframeTrack(`${b}.quaternion`, times.slice(), samples[b]));
  });

  // Reset final.
  ANIM_BONES.forEach((b) => {
    const node = player.skin?.[b];
    if (node) { node.rotation.set(0, 0, 0); node.updateMatrix(); }
  });

  return new THREE.AnimationClip(name, duration, tracks);
}

function makeAttackAnimation(): PlayerAnimation {
  // Ataque: levanta o braço direito e dá um golpe rápido para frente.
  return new (class extends PlayerAnimation {
    animate(player: any) {
      const t = this.progress;
      const swing = Math.sin(t * Math.PI);
      const arm = player.skin.rightArm;
      const arm2 = player.skin.leftArm;
      if (arm) { arm.rotation.x = -Math.PI / 2 * swing; arm.rotation.z = 0; }
      if (arm2) { arm2.rotation.x = Math.PI * 0.15 * swing; arm2.rotation.z = Math.PI * 0.02; }
      if (player.skin.body) player.skin.body.rotation.y = Math.sin(t * Math.PI * 2) * 0.1;
    }
  })();
}

function bakeAnimationClips(player: any): any[] {
  const clips: any[] = [];
  const add = (name: string, dur: number, fps: number, make: () => PlayerAnimation) => {
    try { clips.push(bakeClipFromAnimation(player, name, dur, fps, make)); }
    catch (e) { console.warn('[EXPORT3D] falha ao assar clip', name, e); }
  };
  add('idle', 4, 20, () => new IdleAnimation());
  add('walk', 1, 20, () => new WalkingAnimation());
  add('run', 0.8, 20, () => new RunningAnimation());
  add('attack', 0.5, 20, () => makeAttackAnimation());
  add('hurt', 0.5, 20, () => new HitAnimation());
  return clips;
}

/**
 * Reconstrói off-screen o avatar completo (skin + addons gerados + itens equipados
 * presos aos ossos) e exporta para um .glb binário.
 *
 * @returns Blob do arquivo .glb
 */
export async function exportAvatarToGlb(config: any, equippedItems: EquippedItem[] = []): Promise<Blob> {
  const viewer = getViewer();
  const player = viewer.playerObject as any;

  // 1. Skin (custom ou gerada)
  const skinUrl = config?.customSkinUrl || await generateMinecraftSkinUrl(config);
  const skinOk = await preloadSkinImage(skinUrl);
  if (skinOk) {
    try {
      const model = config?.gender === 'female' ? 'slim' : 'default';
      await Promise.race([
        viewer.loadSkin(skinUrl, { model, ears: 'load-only' }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('Skin load timeout')), 10000))
      ]);
    } catch (e) {
      console.error('Erro ao carregar skin para export .glb:', e);
    }
  }

  // 2. Limpa itens antigos (de exports anteriores)
  const partsToClean = [player.skin.head, player.skin.rightArm, player.skin.leftArm, player.skin.body, player.skin.leftLeg, player.skin.rightLeg];
  partsToClean.forEach((part: any) => {
    if (!part) return;
    part.children.filter((c: any) => c.userData?.isItem).forEach((i: any) => part.remove(i));
  });

  // 3. Carrega itens equipados (mesma lógica do AvatarPrintQueue / AvatarCharacter).
  //    Suporta os DOIS formatos: GLB (.glb/.gltf) e imagem 2.5D/voxel (.png/etc.),
  //    esta última via generateVoxelItemFromImage (que já usa o Three do skinview3d).
  if (equippedItems && equippedItems.length > 0) {
    const loader = new GLTFLoader();
    const isLeftHanded = config?.handedness === 'left';
    const gender = config?.gender;
    const inv = isLeftHanded ? -1 : 1;

    console.log('[EXPORT3D] itens equipados:', equippedItems.map(i => ({ part: i.avatarPart, title: i.itemTitle, model: i.gameModelUrl })));

    const IMG_EXT_RE = /\.(png|gif|jpe?g|webp|avif)$/i;
    const getExt = (u: string) => (u.split('?')[0].split('#')[0].split('.').pop() || '').toLowerCase();

    const attachModel = (model: any, item: EquippedItem) => {
      model.userData.isItem = true;
      model.traverse((child: any) => { if (child.isMesh) child.frustumCulled = false; });

      const isDefense = item.itemCategory === 'defense';
      const dominantArm = isLeftHanded ? player.skin.leftArm : player.skin.rightArm;
      const nonDominantArm = isLeftHanded ? player.skin.rightArm : player.skin.leftArm;
      const targetArm = isDefense ? nonDominantArm : dominantArm;
      const transform = resolveModelTransform(item, gender, config?.handedness, false) || item.modelTransforms?.common;

      if (item.avatarPart === 'rightHand' || item.avatarPart === 'leftHand' || item.avatarPart === 'hand' || item.avatarPart === 'two_handed') {
        if (transform) {
          model.scale.set(transform.scale ?? 10, transform.scale ?? 10, (transform.scale ?? 10) * (transform.thickness ?? 1));
          model.position.set(transform.posX * inv, transform.posY, transform.posZ);
          model.rotation.set(transform.rotX, transform.rotY * inv, transform.rotZ * inv);
          model.position.y = transform.posY;
          model.translateY(transform.slide);
        } else if (isDefense) {
          const isRightArm = targetArm === player.skin.rightArm;
          model.scale.set(10, 10, 10);
          model.position.set(isRightArm ? -3.5 : 3.5, -6, 0);
          model.rotation.set(0, isRightArm ? Math.PI / 2 : -Math.PI / 2, 0);
        } else {
          model.scale.set(10, 10, 10);
          model.position.set(0, -12, 0);
          model.rotation.set(Math.PI / 2, 0, 0);
        }
        targetArm.add(model);
      } else if (item.avatarPart === 'head' || item.avatarPart === 'face') {
        const head = player.skin.head;
        const defaultHeadScale = item.minecraftHeadValue ? 9.2 : 16;
        if (transform) {
          model.scale.set(transform.scale ?? defaultHeadScale, transform.scale ?? defaultHeadScale, (transform.scale ?? defaultHeadScale) * (transform.thickness ?? 1));
          model.position.set(transform.posX, transform.posY, transform.posZ);
          model.rotation.set(transform.rotX, transform.rotY, transform.rotZ);
          model.position.y = transform.posY;
          model.translateY(transform.slide);
        } else {
          model.scale.set(defaultHeadScale, defaultHeadScale, defaultHeadScale);
          model.position.set(0, 0, 0);
          model.rotation.set(0, Math.PI, 0);
        }
        head.add(model);
      } else if (item.avatarPart === 'legs' || item.avatarPart === 'feet') {
        const body = player.skin.body;
        if (transform) {
          model.scale.set(transform.scale ?? 16, transform.scale ?? 16, (transform.scale ?? 16) * (transform.thickness ?? 1));
          model.position.set(transform.posX ?? 0, transform.posY ?? 0, transform.posZ ?? 0);
          model.rotation.set(transform.rotX, transform.rotY, transform.rotZ);
          model.translateY(transform.slide ?? 0);
        } else {
          model.scale.set(16, 16, 16);
          model.position.set(0, item.avatarPart === 'feet' ? -22 : -15, 0);
        }
        body.add(model);
      } else if (item.avatarPart === 'body' || item.avatarPart === 'back' || item.avatarPart === 'accessory' || item.avatarPart === 'pet') {
        const body = player.skin.body;
        if (transform) {
          model.scale.set(transform.scale ?? 16, transform.scale ?? 16, (transform.scale ?? 16) * (transform.thickness ?? 1));
          model.position.set(transform.posX, transform.posY, transform.posZ);
          model.rotation.set(transform.rotX, transform.rotY, transform.rotZ);
          model.position.y = transform.posY;
          model.translateY(transform.slide);
        } else {
          model.scale.set(16, 16, 16);
          model.position.set(0, -6, 0);
        }
        body.add(model);
      }
      console.log('[EXPORT3D] item anexado:', item.avatarPart, item.itemTitle);
    };

    await Promise.all(equippedItems.map((item) => new Promise<void>((res) => {
      if (!item.gameModelUrl || item.gameModelUrl.trim() === '') {
        console.warn('[EXPORT3D] item SEM gameModelUrl (ignorado no GLB):', item.avatarPart, item.itemTitle);
        return res();
      }
      const rawUrl = item.gameModelUrl;
      const finalUrl = resolveItemUrl(rawUrl);

      // Item 2.5D (imagem) → gera voxel compatível com o Three do skinview3d.
      if (IMG_EXT_RE.test('.' + getExt(finalUrl))) {
        const transform = resolveModelTransform(item, gender, config?.handedness, false) || item.modelTransforms?.common;
        const curveX = transform?.curveX || 0;
        const curveY = transform?.curveY || 0;
        const genThickness = 0.12 * (transform?.thickness ?? 1);
        const part = String(item.avatarPart || '').toLowerCase().trim();
        const gen = (part === 'legs' || part === 'feet')
          ? Promise.all([
              generateVoxelItemFromImage(finalUrl, item.backColor, curveX, curveY, 'left', genThickness),
              generateVoxelItemFromImage(finalUrl, item.backColor, curveX, curveY, 'right', genThickness),
            ]).then(([l, r]) => { attachModel(l, item); attachModel(r, item); })
          : generateVoxelItemFromImage(finalUrl, item.backColor, curveX, curveY, undefined, genThickness)
              .then((m) => { attachModel(m, item); });
        gen.then(() => res()).catch((e: any) => { console.warn('[EXPORT3D] falha ao gerar voxel do item:', item.itemTitle, e); res(); });
        return;
      }

      // Item GLB
      loader.load(finalUrl, (gltf: any) => {
        attachModel(gltf.scene, item);
        res();
      }, undefined, (err: any) => { console.warn('[EXPORT3D] falha ao carregar item GLB:', item.itemTitle, err); res(); });
    })));
  }

  // 4. Garante que TODAS as malhas da skin tenham a textura aplicada (alguns materiais
  //    "biased" das pernas/braços podem ficar sem map após o loadSkin).
  let meshCount = 0;
  let texturedCount = 0;
  player.traverse((child: any) => {
    if (child.isMesh) {
      meshCount++;
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.forEach((m: any) => { if (m && m.map) texturedCount++; });
    }
  });
  console.log('[EXPORT3D] player meshes:', meshCount, 'with texture:', texturedCount);

  // 4b. Normaliza os materiais para a arena:
  //   - Texturas da skin são sRGB (senão o boneco fica com cor "lavada"/diferente no Three 0.185).
  //   - roughness/metalness fixos para casar com o visual "voxel" opaco (sem reflexo metálico).
  player.traverse((child: any) => {
    if (!child.isMesh) return;
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    mats.forEach((m: any) => {
      if (!m) return;
      if (m.map && 'colorSpace' in m.map) m.map.colorSpace = (THREE_SKIN as any).SRGBColorSpace || m.map.colorSpace;
      if ('metalness' in m) m.metalness = 0;
      if ('roughness' in m) m.roughness = 1;
      m.needsUpdate = true;
    });
  });

  // 5. Exporta o playerObject para .glb binário dentro de um Group rotacionado.
  //    skinview3d nasce virado para +z (para a câmera); a arena espera modelos
  //    virados para -z (padrão Blockbench) e aplica +Math.PI no repouso. Então
  //    rotacionamos +Math.PI aqui para o boneco ficar de FRENTE na arena.
  player.updateMatrixWorld(true);
  const GroupCtor: any = (THREE_SKIN as any).Group;
  const root: any = GroupCtor ? new GroupCtor() : player;
  if (root !== player) {
    root.add(player);
    root.rotation.y = Math.PI;
    root.updateMatrixWorld(true);
  }

  // 5b. Assa as animações procedurais do skinview3d em AnimationClips reais.
  const clips = bakeAnimationClips(player);
  console.log('[EXPORT3D] clipes gerados:', clips.map(c => `${c.name}(${c.tracks.length})`).join(', '));

  const exporter = new GLTFExporter();  const exportTarget = root;
  const result = await new Promise<ArrayBuffer>((resolve, reject) => {
    exporter.parse(
      exportTarget,
      (res: any) => {
        if (res instanceof ArrayBuffer) resolve(res);
        else resolve(new TextEncoder().encode(JSON.stringify(res)).buffer);
      },
      (err: any) => reject(err),
      { binary: true, embedImages: true, includeCustomExtensions: false, animations: clips }
    );
  });

  // Restaura o player para não corromper o viewer global (usado em exports futuros).
  try { if (exportTarget !== player) exportTarget.remove(player); } catch { /* noop */ }

  return new Blob([result], { type: 'model/gltf-binary' });
}

/**
 * Exporta e devolve uma URL de objeto (blob:) pronta para consumo imediato
 * (ex.: carregar no Three sem passar por upload).
 */
export async function exportAvatarToGlbUrl(config: any, equippedItems: EquippedItem[] = []): Promise<string> {
  const blob = await exportAvatarToGlb(config, equippedItems);
  return URL.createObjectURL(blob);
}
