import { SkinViewer, IdleAnimation } from 'skinview3d';
// @ts-ignore
import { GLTFLoader } from 'skinview3d/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
// @ts-ignore - O exporter DEVE ser do MESMO Three que o skinview3d usa (0.156),
// senão as classes/atributos do objeto não batem com as esperadas pelo exporter.
import { GLTFExporter } from 'skinview3d/node_modules/three/examples/jsm/exporters/GLTFExporter.js';
import { generateMinecraftSkinUrl } from './SkinGenerator';
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

  // 3. Carrega itens equipados (mesma lógica do AvatarPrintQueue)
  if (equippedItems && equippedItems.length > 0) {
    const loader = new GLTFLoader();
    const isLeftHanded = config?.handedness === 'left';
    const gender = config?.gender;
    const inv = isLeftHanded ? -1 : 1;

    await Promise.all(equippedItems.map((item) => new Promise<void>((res) => {
      if (!item.gameModelUrl || item.gameModelUrl.trim() === '') return res();
      loader.load(resolveItemUrl(item.gameModelUrl), (gltf: any) => {
        const model = gltf.scene;
        model.userData.isItem = true;
        model.traverse((child: any) => { if (child.isMesh) child.frustumCulled = false; });

        const isDefense = item.itemCategory === 'defense' || item.avatarPart === 'leftHand';
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
        } else if (item.avatarPart === 'body' || item.avatarPart === 'back' || item.avatarPart === 'accessory') {
          const body = player.skin.body;
          if (transform) {
            model.scale.set(transform.scale ?? 16, transform.scale ?? 16, (transform.scale ?? 16) * (transform.thickness ?? 1));
            model.position.set(transform.posX, transform.posY, transform.posZ);
            model.rotation.set(transform.rotX, transform.rotY, transform.rotZ);
            model.position.y = transform.posY;
            model.translateY(transform.slide);
          } else {
            model.scale.set(16, 16, 16);
            model.position.set(0, 0, 0);
          }
          body.add(model);
        }
        res();
      }, undefined, () => res());
    })));
  }

  // 4. Exporta o playerObject para .glb binário
  //    Um frame para garantir matrizes/texturas atualizadas.
  player.updateMatrixWorld(true);

  const exporter = new GLTFExporter();
  const result = await new Promise<ArrayBuffer>((resolve, reject) => {
    exporter.parse(
      player,
      (res: any) => {
        if (res instanceof ArrayBuffer) resolve(res);
        else resolve(new TextEncoder().encode(JSON.stringify(res)).buffer);
      },
      (err: any) => reject(err),
      { binary: true, embedImages: true, includeCustomExtensions: false }
    );
  });

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
