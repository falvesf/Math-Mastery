import { SkinViewer, IdleAnimation } from 'skinview3d';
import { GLTFLoader } from 'skinview3d/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import { generateMinecraftSkinUrl } from './SkinGenerator';
import type { EquippedItem } from '../components/AvatarCharacter';

let globalViewer: SkinViewer | null = null;
let queue: { config: any, equippedItems: EquippedItem[], resolve: (url: string) => void }[] = [];
let isProcessing = false;

async function processQueue() {
  if (isProcessing || queue.length === 0) return;
  isProcessing = true;

  const task = queue.shift();
  if (!task) {
    isProcessing = false;
    return;
  }

  try {
    if (!globalViewer) {
      const canvas = document.createElement('canvas');
      globalViewer = new SkinViewer({
        canvas,
        width: 150,
        height: 250,
        skin: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=" // dummy
      });
      // Set up camera for full body shot
      globalViewer.camera.position.set(0, 15, 60);
      globalViewer.camera.lookAt(0, 15, 0);
      globalViewer.animation = new IdleAnimation();
      if (globalViewer.renderer) {
        globalViewer.renderer.setClearColor(0x000000, 0);
      }
    }

    // 1. Generate skin
    const skinUrl = task.config.customSkinUrl || await generateMinecraftSkinUrl(task.config);
    
    await Promise.race([
      globalViewer.loadSkin(skinUrl),
      new Promise((_, rej) => setTimeout(() => rej(new Error('Skin load timeout')), 10000))
    ]);

    // 2. Clear old items (remove children of playerObject parts that are our items)
    const player = globalViewer.playerObject;
    const partsToClean = [player.skin.head, player.skin.rightArm, player.skin.leftArm, player.skin.body];
    partsToClean.forEach(part => {
      const itemsToRemove = part.children.filter(c => c.userData?.isItem);
      itemsToRemove.forEach(i => part.remove(i));
    });

    // 3. Load equipped items
    if (task.equippedItems && task.equippedItems.length > 0) {
      const loader = new GLTFLoader();
      const loadPromises = task.equippedItems.map(item => {
        return new Promise<void>((res) => {
          if (!item.gameModelUrl || item.gameModelUrl.trim() === '') {
            res();
            return;
          }
          let safeUrl = item.gameModelUrl.replace(/\\/g, '/');
          if (!safeUrl.startsWith('http') && !safeUrl.startsWith('/')) {
            if (!safeUrl.startsWith('models/')) safeUrl = `models/${safeUrl}`;
            safeUrl = `/${safeUrl}`;
          } else if (safeUrl.startsWith('/') && !safeUrl.startsWith('/models/')) {
            safeUrl = `/models${safeUrl}`;
          }
          if (safeUrl.startsWith('/')) {
            safeUrl = import.meta.env.BASE_URL + safeUrl.substring(1);
          }
          loader.load(safeUrl, (gltf) => {
            const model = gltf.scene;
            model.userData.isItem = true;
            
            if (item.avatarPart === 'rightHand' || item.avatarPart === 'leftHand' || item.avatarPart === 'hand') {
              const isDefense = item.itemCategory === 'defense';
              const isLeftHanded = task.config?.handedness === 'left';
              const dominantArm = isLeftHanded ? player.skin.leftArm : player.skin.rightArm;
              const nonDominantArm = isLeftHanded ? player.skin.rightArm : player.skin.leftArm;
              
              const targetArm = isDefense ? nonDominantArm : dominantArm;
              
              if (isDefense) {
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
            } else if (item.avatarPart === 'head') {
              const head = player.skin.head;
              model.scale.set(16, 16, 16);
              model.position.set(0, 0, 0);
              model.rotation.set(0, Math.PI, 0);
              head.add(model);
            }
            res();
          }, undefined, () => res());
        });
      });
      await Promise.all(loadPromises);
    }

    // Force a manual render frame instead of relying on the browser's requestAnimationFrame
    if (globalViewer.renderer && globalViewer.scene && globalViewer.camera) {
      globalViewer.renderer.render(globalViewer.scene, globalViewer.camera);
    }
    
    // Give a tiny delay just in case textures need a tick
    await new Promise(r => setTimeout(r, 50));

    // Snapshot
    const dataUrl = globalViewer.canvas.toDataURL('image/png');
    task.resolve(dataUrl);

  } catch (err) {
    console.error("Failed to generate avatar print:", err);
    // resolve with empty transparent pixel
    task.resolve("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=");
  } finally {
    isProcessing = false;
    processQueue();
  }
}

export function getAvatarPrint(config: any, equippedItems: EquippedItem[] = []): Promise<string> {
  return new Promise((resolve) => {
    queue.push({ config, equippedItems, resolve });
    processQueue();
  });
}
