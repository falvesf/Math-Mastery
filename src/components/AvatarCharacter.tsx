import React, { useEffect, useRef, useState } from 'react';
import { SkinViewer, IdleAnimation, WalkingAnimation, RunningAnimation, FunctionAnimation } from 'skinview3d';
import { GLTFLoader } from 'skinview3d/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
// Removemos import * as THREE from 'three' para evitar instanciar a versão errada.
import { generateMinecraftSkinUrl } from '../lib/SkinGenerator';
import { ATTRIBUTE_LABELS, type ItemAdd, type ItemCategory, type AttributeType } from '../lib/gacha';

export interface AvatarConfig {
  gender?: 'male' | 'female';
  skinColor?: string;
  hairColor?: string;
  eyeColor?: string;
  hairStyle?: string;
  mouthStyle?: string;
  eyeStyle?: string;
  shirtColor?: string;
  pantsColor?: string;
  clothingStyle?: 'dress' | 'pants-shirt' | 't-shirt' | 'tank-top';
  facialHair?: 'none' | 'beard' | 'mustache' | 'goatee';
  handedness?: 'right' | 'left';
  animationState?: 'idle' | 'walk' | 'run' | 'attack';
  customSkinUrl?: string;
  customModelUrl?: string;
}

export interface EquippedItem {
  docId?: string;
  itemId?: string;
  imageUrl: string;
  modelUrl?: string;
  avatarPart: 'head' | 'face' | 'body' | 'legs' | 'feet' | 'hand' | 'two_handed' | 'rightHand' | 'leftHand' | 'accessory' | 'back' | 'background' | 'pet';
  itemTitle?: string;
  itemCategory?: ItemCategory;
  baseAttributeType?: AttributeType;
  baseAttributeValue?: number;
  adds?: ItemAdd[];
  gameModelUrl?: string;
  modelTransforms?: ModelTransformsConfig;
  rarity?: string;
}

export interface ModelTransform {
  posX: number;
  posY: number;
  posZ: number;
  rotX: number;
  rotY: number;
  rotZ: number;
  slide: number;
}

export interface ModelTransformsConfig {
  common?: ModelTransform;
  battle?: ModelTransform;
  common_left?: ModelTransform;
  battle_left?: ModelTransform;
}

export interface AvatarCharacterProps {
  config: AvatarConfig | null;
  equippedItems?: EquippedItem[];
  size?: number;
  interactive?: boolean;
  animation?: 'none' | 'idle' | 'walk' | 'run' | 'attack' | 'attack-fatal' | 'attack-fatal-slow' | 'hurt' | 'exhausted' | 'cheer' | 'death-evaporate' | 'death-fall' | 'death-explode' | 'death-slice';
  expression?: 'normal' | 'serious' | 'sad';
  role?: 'player' | 'monster';
  showSlots?: boolean;
  onAvatarClick?: () => void;
  onSlotClick?: (item: EquippedItem) => void;
  debugItemTransform?: ModelTransform | null;
  debugItemId?: string | null;
}

import CustomModelViewer from './CustomModelViewer';

const AvatarCharacter = React.memo(function AvatarCharacter({ config, equippedItems = [], size = 300, interactive = true, animation = 'idle', expression = 'normal', role = 'player', showSlots = false, onAvatarClick, onSlotClick, debugItemTransform, debugItemId }: AvatarCharacterProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewerRef = useRef<SkinViewer | null>(null);
  const [hoveredSlot, setHoveredSlot] = useState<string | null>(null);
  const [modelsLoadedCount, setModelsLoadedCount] = useState(0);

  // States to hold generated skin URLs
  const [skinUrls, setSkinUrls] = useState<{
    normal: { base: string; blink: string };
    serious: { base: string; blink: string };
    sad: { base: string; blink: string };
  } | null>(null);

  const bgItems = equippedItems.filter(i => i.avatarPart === 'background');

  // 1. Initialize and dispose viewer
  useEffect(() => {
    if (!canvasRef.current) return;
    
    let viewer: SkinViewer;
    try {
      viewer = new SkinViewer({
          canvas: canvasRef.current,
          width: size,
          height: size * 1.8,
          // Fallback para evitar erro de inicialização sem skin
          skin: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
      });
      viewer.animation = new IdleAnimation();
  
      viewer.controls.enableZoom = interactive;
      viewer.controls.enableRotate = interactive;
      viewer.controls.enablePan = interactive;
      
      viewerRef.current = viewer;
      
      if (viewer.renderer) {
          viewer.renderer.setClearColor(0x000000, 0);
      }
      
      viewer.camera.position.set(0, 10, 60);
    } catch (e) {
      console.error("Erro ao inicializar SkinViewer:", e);
      return;
    }

    return () => {
        if (viewerRef.current) {
            viewerRef.current.dispose();
            viewerRef.current = null;
        }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2. Update size and interactivity when they change
  useEffect(() => {
      if (viewerRef.current) {
          viewerRef.current.width = size;
          viewerRef.current.height = size * 1.8;
          viewerRef.current.controls.enableZoom = interactive;
          viewerRef.current.controls.enableRotate = interactive;
          viewerRef.current.controls.enablePan = interactive;
      }
  }, [size, interactive]);

  // 3. Attach 3D items to the avatar based on equippedItems
  const equippedItemsJson = JSON.stringify(equippedItems);
  const debugTransformJson = JSON.stringify(debugItemTransform);
  const loadedModelsRef = useRef<{itemId?: string, avatarPart: string, model: THREE.Object3D, item: EquippedItem}[]>([]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !viewer.playerObject) return;
    
    let isCancelled = false;
    // Armazena os modelos carregados para poder removê-los depois
    const loadedModels: { parent: THREE.Object3D, model: THREE.Object3D }[] = [];
    const loader = new GLTFLoader();
    
    equippedItems.forEach(item => {
      if (item.gameModelUrl && item.gameModelUrl.trim() !== '') {
        let safeUrl = item.gameModelUrl.replace(/\\/g, '/');
        if (!safeUrl.startsWith('http') && !safeUrl.startsWith('/')) {
          if (!safeUrl.startsWith('models/')) safeUrl = `models/${safeUrl}`;
          safeUrl = `/${safeUrl}`;
        } else if (safeUrl.startsWith('/') && !safeUrl.startsWith('/models/')) {
          safeUrl = `/models${safeUrl}`;
        }
        console.log(`Carregando modelo 3D para o item ${item.itemTitle}:`, safeUrl);
        
        loader.load(
          safeUrl, 
          (gltf) => {
            if (isCancelled) return;
            console.log(`Modelo ${safeUrl} carregado com sucesso!`);
            const model = gltf.scene;
            
            if (item.avatarPart === 'rightHand' || item.avatarPart === 'leftHand' || item.avatarPart === 'hand' || item.avatarPart === 'two_handed') {
              const isDefense = item.itemCategory === 'defense';
              const isLeftHanded = config?.handedness === 'left';
              const dominantArm = isLeftHanded ? viewer.playerObject.skin.leftArm : viewer.playerObject.skin.rightArm;
              const nonDominantArm = isLeftHanded ? viewer.playerObject.skin.rightArm : viewer.playerObject.skin.leftArm;
              
              const targetArm = isDefense ? nonDominantArm : dominantArm;
              
              if (item.avatarPart === 'two_handed' || item.avatarPart === 'hand' || item.avatarPart === 'rightHand' || item.avatarPart === 'leftHand') {
                model.scale.set(10, 10, 10);
                let appliedTransform = false;
                
                const itemId = item.itemId || item.docId;
                const isTargetDebugItem = debugItemId === itemId;
                
                const inv = isLeftHanded ? -1 : 1;
                
                if (debugItemTransform && isTargetDebugItem) {
                  model.position.set(debugItemTransform.posX * inv, debugItemTransform.posY, debugItemTransform.posZ);
                  model.rotation.set(debugItemTransform.rotX, debugItemTransform.rotY * inv, debugItemTransform.rotZ * inv);
                  model.translateY(debugItemTransform.slide);
                  appliedTransform = true;
                } else if (item.modelTransforms) {
                  const isBattle = animation === 'attack' || animation === 'attack-fatal' || animation === 'attack-fatal-slow';
                  let transform = isLeftHanded && isBattle && item.modelTransforms.battle_left ? item.modelTransforms.battle_left 
                                : isLeftHanded && !isBattle && item.modelTransforms.common_left ? item.modelTransforms.common_left 
                                : isBattle && item.modelTransforms.battle ? item.modelTransforms.battle 
                                : item.modelTransforms.common;
                  if (transform) {
                    model.position.set(transform.posX * inv, transform.posY, transform.posZ);
                    model.rotation.set(transform.rotX, transform.rotY * inv, transform.rotZ * inv);
                    model.translateY(transform.slide);
                    appliedTransform = true;
                  }
                }
                
                if (!appliedTransform) {
                  if (isDefense) {
                    const isRightArm = targetArm === viewer.playerObject.skin.rightArm;
                    model.position.set(isRightArm ? -3.5 : 3.5, -6, 0); 
                    model.rotation.set(0, isRightArm ? Math.PI / 2 : -Math.PI / 2, 0); 
                  } else if (item.avatarPart === 'two_handed') {
                    model.position.set(0, -11, 0); 
                    model.rotation.set(Math.PI / 2.2, 0, isLeftHanded ? Math.PI / 20 : -Math.PI / 20);
                    model.translateY(-18);
                  } else {
                    model.position.set(0, -12, 0); 
                    model.rotation.set(Math.PI / 2, 0, 0);
                  }
                }
              }
              
              targetArm.add(model);
              loadedModels.push({ parent: targetArm, model });
              loadedModelsRef.current.push({ itemId: item.itemId || item.docId, avatarPart: item.avatarPart, model, item });
            } else if (item.avatarPart === 'head') {
              const head = viewer.playerObject.skin.head;
              // Os itens do Blockbench para Minecraft geralmente vêm na escala de 1 unidade = 16 pixels.
              // A cabeça tem 8x8x8 pixels. Multiplicando a escala por 16, os tamanhos batem perfeitamente.
              model.scale.set(16, 16, 16);
              model.position.set(0, 0, 0);
              model.rotation.set(0, Math.PI, 0); // Girar 180 graus (frente para trás)
              head.add(model);
              loadedModels.push({ parent: head, model });
              loadedModelsRef.current.push({ itemId: item.itemId || item.docId, avatarPart: item.avatarPart, model, item });
            } else if (item.avatarPart === 'body') {
              const body = viewer.playerObject.skin.body;
              model.scale.set(16, 16, 16);
              // O grupo "body" no skinview3d tem seu eixo deslocado. Precisamos descer o modelo em -6 para alinhar com o peitoral.
              model.position.set(0, -6, 0);
              model.rotation.set(0, Math.PI, 0); // Girar 180 graus (frente para trás)
              body.add(model);
              loadedModels.push({ parent: body, model });
              loadedModelsRef.current.push({ itemId: item.itemId || item.docId, avatarPart: item.avatarPart, model, item });
            }
            if (!isCancelled) {
              setModelsLoadedCount(prev => prev + 1);
            }
          },
          undefined,
          (error) => {
            console.error(`Falha ao carregar o modelo 3D (${safeUrl}):`, error);
          }
        );
      }
    });
    
    return () => {
      isCancelled = true;
      loadedModels.forEach(({ parent, model }) => {
        parent.remove(model);
      });
      loadedModelsRef.current = [];
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equippedItemsJson, config?.handedness]);

  // 3b. Apply transformations dynamically to avoid reloading models (flicker)
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !viewer.playerObject) return;
    
    // Use the latest parsed equippedItems array to ensure we have the most up-to-date transforms
    let parsedItems = [];
    try {
      parsedItems = JSON.parse(equippedItemsJson);
    } catch(e) {}
    
    loadedModelsRef.current.forEach(({ model, avatarPart, itemId, item: cachedItem }) => {
      // Find the latest item data in case it was updated in the DB
      const item = parsedItems.find((i: any) => (i.itemId || i.docId) === itemId) || cachedItem;
      
      if (avatarPart === 'two_handed' || avatarPart === 'hand' || avatarPart === 'rightHand' || avatarPart === 'leftHand') {
        const isDefense = item.itemCategory === 'defense';
        const isLeftHanded = config?.handedness === 'left';
        const dominantArm = isLeftHanded ? viewer.playerObject.skin.leftArm : viewer.playerObject.skin.rightArm;
        const nonDominantArm = isLeftHanded ? viewer.playerObject.skin.rightArm : viewer.playerObject.skin.leftArm;
        const targetArm = isDefense ? nonDominantArm : dominantArm;
        
        let appliedTransform = false;
        
        // Only apply debug transform to the specifically selected item
        const isTargetDebugItem = debugItemId === itemId;

        const inv = isLeftHanded ? -1 : 1;

        if (debugItemTransform && isTargetDebugItem) {
          model.position.set(debugItemTransform.posX * inv, debugItemTransform.posY, debugItemTransform.posZ);
          model.rotation.set(debugItemTransform.rotX, debugItemTransform.rotY * inv, debugItemTransform.rotZ * inv);
          // Reset position Y, then translate
          model.position.y = debugItemTransform.posY;
          model.translateY(debugItemTransform.slide);
          appliedTransform = true;
        } else if (item.modelTransforms) {
          const isBattle = animation === 'attack' || animation === 'attack-fatal' || animation === 'attack-fatal-slow';
          
          let transform = null;
          if (isLeftHanded) {
             if (isBattle && item.modelTransforms.battle_left) transform = item.modelTransforms.battle_left;
             else if (isBattle && item.modelTransforms.battle) transform = item.modelTransforms.battle;
             else if (item.modelTransforms.common_left) transform = item.modelTransforms.common_left;
             else transform = item.modelTransforms.common;
          } else {
             if (isBattle && item.modelTransforms.battle) transform = item.modelTransforms.battle;
             else transform = item.modelTransforms.common;
          }
          
          if (transform) {
            model.position.set(transform.posX * inv, transform.posY, transform.posZ);
            model.rotation.set(transform.rotX, transform.rotY * inv, transform.rotZ * inv);
            model.position.y = transform.posY;
            model.translateY(transform.slide);
            appliedTransform = true;
          }
        }
        
        if (!appliedTransform) {
          if (isDefense) {
            const isRightArm = targetArm === viewer.playerObject.skin.rightArm;
            model.position.set(isRightArm ? -3.5 : 3.5, -6, 0); 
            model.rotation.set(0, isRightArm ? Math.PI / 2 : -Math.PI / 2, 0); 
          } else if (avatarPart === 'two_handed') {
            model.position.set(0, -11, 0); 
            model.rotation.set(Math.PI / 2.2, 0, isLeftHanded ? Math.PI / 20 : -Math.PI / 20);
            model.translateY(-18);
          } else {
            model.position.set(0, -12, 0); 
            model.rotation.set(Math.PI / 2, 0, 0);
          }
        }
      }
    });
  }, [debugTransformJson, debugItemId, animation, config?.handedness, modelsLoadedCount, equippedItemsJson]);

  // 4. Generate skins when config changes
  useEffect(() => {
    let isMounted = true;

    const generateSkins = async () => {
        if (!config) return;
        try {
            if (config.customSkinUrl) {
                const finalUrl = (config.customSkinUrl.startsWith('http') || config.customSkinUrl.startsWith('data:')) 
                    ? config.customSkinUrl 
                    : `https://${config.customSkinUrl}`;
                setSkinUrls({ 
                    normal: { base: finalUrl, blink: finalUrl },
                    serious: { base: finalUrl, blink: finalUrl },
                    sad: { base: finalUrl, blink: finalUrl }
                });
            } else {
                const normalUrl = await generateMinecraftSkinUrl(config, false);
                const normalBlinkUrl = await generateMinecraftSkinUrl(config, true);
                
                const seriousConfig = { ...config, mouthStyle: 'neutral' as any };
                const seriousUrl = await generateMinecraftSkinUrl(seriousConfig, false);
                const seriousBlinkUrl = await generateMinecraftSkinUrl(seriousConfig, true);

                const sadConfig = { ...config, mouthStyle: 'sad' as any };
                const sadUrl = await generateMinecraftSkinUrl(sadConfig, false);
                const sadBlinkUrl = await generateMinecraftSkinUrl(sadConfig, true);
                
                if (isMounted) {
                    setSkinUrls({ 
                        normal: { base: normalUrl, blink: normalBlinkUrl },
                        serious: { base: seriousUrl, blink: seriousBlinkUrl },
                        sad: { base: sadUrl, blink: sadBlinkUrl }
                    });
                }
            }
        } catch (e) {
            console.error("Error generating 3D skins", e);
        }
    };

    generateSkins();

    return () => {
        isMounted = false;
    };
  }, [config]);

  // Handle Skin Application & Blinking
  useEffect(() => {
      if (!viewerRef.current || !skinUrls) return;
      let isMounted = true;
      let blinkInterval: any;
      let blinkTimeout: any;

      const applySkins = async () => {
          if (animation === 'hurt') {
              await viewerRef.current!.loadSkin(skinUrls.sad.blink);
          } else {
              const activeUrls = skinUrls[expression] || skinUrls.normal;
              await viewerRef.current!.loadSkin(activeUrls.base);
              
              if (!isMounted) return;
              
              blinkInterval = setInterval(() => {
                  if (!viewerRef.current || !isMounted) return;
                  if (activeUrls.blink === activeUrls.base) return; 
                  viewerRef.current.loadSkin(activeUrls.blink);
                  
                  blinkTimeout = setTimeout(() => {
                      if (viewerRef.current && isMounted) {
                          viewerRef.current.loadSkin(activeUrls.base);
                      }
                  }, 150);
              }, 3500 + Math.random() * 2000);
          }
      };

      applySkins();

      return () => {
          isMounted = false;
          if (blinkInterval) clearInterval(blinkInterval);
          if (blinkTimeout) clearTimeout(blinkTimeout);
      };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skinUrls, animation, expression, equippedItemsJson]);

  useEffect(() => {
    if (!viewerRef.current) return;
    const player = viewerRef.current.playerObject;

    // Função para resetar posições e rotações alteradas por mortes/ataques
    const resetBones = () => {
      if (!player || !player.skin) return;
      player.position.set(0, 0, 0);
      player.rotation.set(0, 0, 0);
      player.skin.head.position.set(0, 8, 0);
      player.skin.head.rotation.set(0, 0, 0);
      player.skin.body.position.set(0, 0, 0);
      player.skin.body.rotation.set(0, 0, 0);
      
      // Approximate reset
      player.skin.leftArm.position.set(-6, 4, 0);
      player.skin.leftArm.rotation.set(0, 0, 0);
      player.skin.rightArm.position.set(6, 4, 0);
      player.skin.rightArm.rotation.set(0, 0, 0);
      player.skin.leftLeg.position.set(-2, -4, 0);
      player.skin.leftLeg.rotation.set(0, 0, 0);
      player.skin.rightLeg.position.set(2, -4, 0);
      player.skin.rightLeg.rotation.set(0, 0, 0);
    };

    resetBones();

    const targetRotation = role === 'player' ? Math.PI / 2 : -Math.PI / 2;
    const hasTwoHanded = equippedItems.some(i => i.avatarPart === 'two_handed');

    const applyTwoHandedPose = (player: any, time: number) => {
      const safeTime = (typeof time === 'number' && !isNaN(time)) ? time : 0;
      const isLeftHanded = config?.handedness === 'left';
      const dominantArm = isLeftHanded ? player.skin.leftArm : player.skin.rightArm;
      const nonDominantArm = isLeftHanded ? player.skin.rightArm : player.skin.leftArm;
      
      // Ambas as mãos esticadas para frente para segurar a lança com as duas mãos!
      // Mão dominante (Segurando a base/meio da lança)
      dominantArm.rotation.x = -Math.PI / 2.2 + Math.sin(safeTime) * 0.02; 
      dominantArm.rotation.y = (isLeftHanded ? Math.PI / 6 : -Math.PI / 6) + Math.cos(safeTime * 0.5) * 0.02;
      dominantArm.rotation.z = (isLeftHanded ? Math.PI / 12 : -Math.PI / 12);
      
      // Mão não dominante (Segurando mais na ponta, guiando a lança)
      nonDominantArm.rotation.x = -Math.PI / 2.4 + Math.sin(safeTime) * 0.02;
      nonDominantArm.rotation.y = (isLeftHanded ? -Math.PI / 3 : Math.PI / 3) + Math.cos(safeTime * 0.5) * 0.02;
      nonDominantArm.rotation.z = (isLeftHanded ? -Math.PI / 8 : Math.PI / 8);
    };

    if (animation === 'none') {
      viewerRef.current.animation = null;
    } else if (animation === 'idle') {
      const idle = new IdleAnimation();
      viewerRef.current.animation = new FunctionAnimation((player: any, progress: number, delta: number) => {
        idle.update(player, (typeof delta === 'number' && !isNaN(delta)) ? delta : 0.016);
        if (hasTwoHanded) {
          applyTwoHandedPose(player, progress);
        }
      });
    } else if (animation === 'walk') {
      const walk = new WalkingAnimation();
      if (hasTwoHanded) {
        viewerRef.current.animation = new FunctionAnimation((player: any, progress: number, delta: number) => {
          walk.update(player, (typeof delta === 'number' && !isNaN(delta)) ? delta : 0.016);
          applyTwoHandedPose(player, progress);
        });
      } else {
        viewerRef.current.animation = walk;
      }
    } else if (animation === 'run') {
      const run = new RunningAnimation();
      viewerRef.current.animation = new FunctionAnimation((player: any, progress: number, delta: number) => {
        run.update(player, (typeof delta === 'number' && !isNaN(delta)) ? delta : 0.016);
        if (hasTwoHanded) {
          applyTwoHandedPose(player, progress);
        }
      });
    } else if (animation === 'cheer') {
      viewerRef.current.animation = new FunctionAnimation((player: any, time: number) => {
        player.position.y = Math.abs(Math.sin(time * 5)) * 6;
        player.skin.leftArm.rotation.x = Math.PI;
        player.skin.rightArm.rotation.x = Math.PI;
        player.skin.leftArm.rotation.z = 0.2 + Math.sin(time * 10) * 0.1;
        player.skin.rightArm.rotation.z = -0.2 - Math.sin(time * 10) * 0.1;
        player.skin.head.rotation.x = -0.2;
        player.skin.leftLeg.rotation.x = 0;
        player.skin.rightLeg.rotation.x = 0;
        player.skin.leftLeg.rotation.z = -0.1;
        player.skin.rightLeg.rotation.z = 0.1;
      });
    } else if (animation?.startsWith('attack')) {
      viewerRef.current.animation = new FunctionAnimation((player: any, time: number) => {
        // Encarar o oponente
        player.rotation.y = targetRotation;
        
        let shouldSwing = true;
        if (animation === 'attack-fatal-slow') {
            shouldSwing = time > 1.125; // 45% of 2.5s
        } else if (animation === 'attack-fatal') {
            shouldSwing = time > 0.225; // 45% of 0.5s
        } else if (animation === 'attack') {
            shouldSwing = time > 0.48; // 40% of 1.2s
        }

        const isLeftHanded = config?.handedness === 'left';
        const attackArm = isLeftHanded ? player.skin.leftArm : player.skin.rightArm;
        const nonAttackArm = isLeftHanded ? player.skin.rightArm : player.skin.leftArm;

        if (shouldSwing) {
            // Movimento rápido de ataque com braço da arma e pequeno avanço
            const swingValue = Math.sin((time - (animation === 'attack-fatal-slow' ? 1.125 : 0)) * 15) * 2;
            attackArm.rotation.x = swingValue;
            if (hasTwoHanded) {
                nonAttackArm.rotation.x = swingValue;
                // Mantém o grip (ângulo da pose de duas mãos) durante o golpe
                attackArm.rotation.y = (isLeftHanded ? Math.PI / 6 : -Math.PI / 6);
                attackArm.rotation.z = (isLeftHanded ? Math.PI / 12 : -Math.PI / 12);
                nonAttackArm.rotation.y = (isLeftHanded ? -Math.PI / 3 : Math.PI / 3);
                nonAttackArm.rotation.z = (isLeftHanded ? -Math.PI / 8 : Math.PI / 8);
            }
            player.position.z = Math.sin((time - (animation === 'attack-fatal-slow' ? 1.125 : 0)) * 10) * 2;
        } else {
            // Apenas preparando o golpe (braço erguido) enquanto teleporta
            attackArm.rotation.x = -Math.PI / 1.5;
            if (hasTwoHanded) {
                nonAttackArm.rotation.x = -Math.PI / 1.5;
                // Mantém o grip na preparação
                attackArm.rotation.y = (isLeftHanded ? Math.PI / 6 : -Math.PI / 6);
                attackArm.rotation.z = (isLeftHanded ? Math.PI / 12 : -Math.PI / 12);
                nonAttackArm.rotation.y = (isLeftHanded ? -Math.PI / 3 : Math.PI / 3);
                nonAttackArm.rotation.z = (isLeftHanded ? -Math.PI / 8 : Math.PI / 8);
            }
            player.position.z = 0;
        }
      });
    } else if (animation === 'hurt' || animation === 'exhausted') {
      viewerRef.current.animation = new FunctionAnimation((player: any, time: number) => {
        if (animation === 'hurt') player.rotation.y = targetRotation; // Encarar o oponente quando machucado
        
        // Jogado para trás, braços abertos
        player.skin.head.rotation.x = -0.5;
        player.skin.leftArm.rotation.x = -Math.PI / 4;
        player.skin.rightArm.rotation.x = -Math.PI / 4;
        player.skin.leftArm.rotation.z = 0.5;
        player.skin.rightArm.rotation.z = -0.5;
        player.position.z = Math.abs(Math.sin(time * 10)) * -3;
      });
    } else if (animation === 'death-fall') {
      viewerRef.current.animation = new FunctionAnimation((player: any, time: number) => {
        player.rotation.y = targetRotation; // Cair de lado
        
        const fall = Math.min(time * 3, Math.PI / 2);
        player.rotation.x = -fall;
        player.position.y = -fall * 10;
        player.position.z = -fall * 5;
        player.skin.leftArm.rotation.z = fall * 0.5;
        player.skin.rightArm.rotation.z = -fall * 0.5;
      });
    } else if (animation === 'death-explode') {
      viewerRef.current.animation = new FunctionAnimation((player: any, time: number) => {
        const scatter = Math.min(time * 8, 30);
        player.skin.head.position.y = 8 + scatter * 1.5;
        player.skin.head.rotation.y = time * 5;
        
        player.skin.leftArm.position.x = -6 - scatter;
        player.skin.leftArm.position.y = 4 + scatter * 0.5;
        player.skin.leftArm.rotation.z = time * -10;

        player.skin.rightArm.position.x = 6 + scatter;
        player.skin.rightArm.position.y = 4 + scatter * 0.5;
        player.skin.rightArm.rotation.z = time * 10;

        player.skin.leftLeg.position.x = -2 - scatter * 0.5;
        player.skin.leftLeg.position.y = -4 - scatter;
        player.skin.leftLeg.rotation.x = time * -5;

        player.skin.rightLeg.position.x = 2 + scatter * 0.5;
        player.skin.rightLeg.position.y = -4 - scatter;
        player.skin.rightLeg.rotation.x = time * 5;

        player.skin.body.position.z = -scatter;
        player.skin.body.rotation.x = time * 3;
      });
    } else {
      const idle = new IdleAnimation();
      viewerRef.current.animation = new FunctionAnimation((player: any, progress: number, delta: number) => {
        idle.update(player, (typeof delta === 'number' && !isNaN(delta)) ? delta : 0.016);
        if (hasTwoHanded) {
          applyTwoHandedPose(player, progress);
        }
      });
    }
  }, [animation, config?.handedness, equippedItemsJson]);

  const handItems = equippedItems.filter(i => i.avatarPart === 'rightHand' || i.avatarPart === 'leftHand' || i.avatarPart === 'hand');
  const twoHandedItem = equippedItems.find(i => i.avatarPart === 'two_handed');
  let leftScreenHandItem = null; // Character's right hand
  let rightScreenHandItem = null; // Character's left hand

  if (config?.handedness === 'left') {
    rightScreenHandItem = handItems[0];
    leftScreenHandItem = handItems[1];
  } else {
    leftScreenHandItem = handItems[0];
    rightScreenHandItem = handItems[1];
  }

  const getEquippedForSlot = (slotId: string) => {
    if (slotId === 'hand1') return twoHandedItem ? null : rightScreenHandItem;
    if (slotId === 'hand2') return twoHandedItem || leftScreenHandItem;
    return equippedItems.find(i => i.avatarPart === slotId);
  };

  const ALL_SLOTS = [
    { id: 'head', label: 'Elmo / Cabeça', pos: { top: '-15%', left: '50%', transform: 'translateX(-50%)' } },
    { id: 'face', label: 'Rosto / Óculos', pos: { top: '5%', right: '-35%' } },
    { id: 'accessory', label: 'Acessório', pos: { top: '5%', left: '-35%' } },
    { id: 'hand1', label: 'Mão (Esquerda do Personagem)', pos: { top: '40%', right: '-50%', transform: 'translateY(-50%)' } },
    { id: 'hand2', label: 'Mão (Direita do Personagem)', pos: { top: '40%', left: '-50%', transform: 'translateY(-50%)' } },
    { id: 'body', label: 'Armadura / Corpo', pos: { bottom: '20%', right: '-40%' } },
    { id: 'legs', label: 'Calças / Pernas', pos: { bottom: '20%', left: '-40%' } },
    { id: 'feet', label: 'Botas / Pés', pos: { bottom: '-5%', left: '50%', transform: 'translateX(-50%)' } },
    { id: 'pet', label: 'Mascote', pos: { bottom: '5%', left: '-70%' } },
  ];

  const getRarityStyle = (rarity?: string) => {
    switch (rarity) {
      case 'uncommon': return { border: '2px solid #10b981', boxShadow: '0 0 10px rgba(16, 185, 129, 0.4)' };
      case 'rare': return { border: '3px solid #3b82f6', boxShadow: '0 0 15px rgba(59, 130, 246, 0.5)' };
      case 'epic': return { border: '4px solid #8b5cf6', boxShadow: '0 0 20px rgba(139, 92, 246, 0.6)' };
      case 'legendary': return { border: '5px solid #f59e0b', boxShadow: '0 0 25px rgba(245, 158, 11, 0.7)' };
      default: return { border: '2px solid rgba(255,255,255,0.2)', boxShadow: 'none' };
    }
  };

  if (config?.customModelUrl) {
    return <CustomModelViewer modelUrl={config.customModelUrl} textureUrl={config.customSkinUrl} animation={animation as any} size={size} role={role} />;
  }

  return (
    <div style={{
      position: 'relative',
      width: size,
      height: size * 1.8,
      display: 'inline-block',
    }}>
      
      {/* Background Items */}
      {bgItems.map((item, idx) => (
        <img 
          key={`bg-${idx}`}
          src={item.imageUrl}
          alt="Background"
          style={{
            position: 'absolute',
            top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '150%', height: '150%',
            objectFit: 'contain',
            zIndex: 0,
            pointerEvents: 'none'
          }}
        />
      ))}

      {/* 3D Canvas */}
      <canvas 
        ref={canvasRef} 
        onClick={() => onAvatarClick && onAvatarClick()}
        style={{ 
          display: 'block', 
          position: 'relative',
          zIndex: 1,
          outline: 'none',
          pointerEvents: 'auto',
          cursor: onAvatarClick ? 'pointer' : 'default'
        }} 
      />
      {/* Slots de Equipamento Externos */}
      {showSlots && ALL_SLOTS.map(slot => {
        const item = getEquippedForSlot(slot.id);
        const slotSize = size * 0.40; // 40% da largura do canvas
        return (
          <div 
            key={slot.id} 
            onMouseEnter={() => setHoveredSlot(slot.id)}
            onMouseLeave={() => setHoveredSlot(null)}
            onClick={(e) => {
              if (item && onSlotClick) {
                e.stopPropagation();
                onSlotClick(item);
              }
            }}
            style={{
              position: 'absolute',
              ...slot.pos,
              width: slotSize,
              height: slotSize,
              borderRadius: '50%',
              background: item ? 'var(--bg-dark)' : 'rgba(255,255,255,0.03)',
              border: item ? getRarityStyle(item.rarity).border : '1px dashed rgba(255,255,255,0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: hoveredSlot === slot.id ? 100 : 10,
              boxShadow: item ? getRarityStyle(item.rarity).boxShadow : 'none',
              overflow: 'visible',
              cursor: item && onSlotClick ? 'pointer' : 'default'
          }}>
            {/* Imagem do Item centralizada e cortada (hidden) num circulo interior para não quebrar a borda visivel caso coloquemos o tooltip por fora */}
            <div style={{ width: '100%', height: '100%', borderRadius: '50%', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {item && <img src={item.imageUrl} alt="" style={{ width: '80%', height: '80%', objectFit: 'contain' }} />}
            </div>
            
            {/* Tooltip Estilo RPG */}
            {hoveredSlot === slot.id && (
               <div style={{
                 position: 'absolute',
                 top: '110%',
                 left: '50%',
                 transform: 'translateX(-50%)',
                 background: 'rgba(15, 23, 42, 0.95)',
                 border: '1px solid var(--border-glass)',
                 borderRadius: '8px',
                 padding: '1rem',
                 width: 'max-content',
                 minWidth: '200px',
                 zIndex: 50,
                 boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
                 backdropFilter: 'blur(10px)',
                 pointerEvents: 'none',
                 color: 'white',
                 textAlign: 'left'
               }}>
                 {item ? (
                   <>
                     <h4 style={{ margin: '0 0 0.5rem 0', color: 'var(--gold-primary)' }}>{item.itemTitle || 'Item Desconhecido'}</h4>
                     
                     {item.baseAttributeType && item.baseAttributeType !== 'none' && ATTRIBUTE_LABELS[item.baseAttributeType] && (
                       <div style={{ marginBottom: '0.5rem', fontSize: '0.9rem', color: 'white' }}>
                         {ATTRIBUTE_LABELS[item.baseAttributeType].icon} {ATTRIBUTE_LABELS[item.baseAttributeType].label}: +{item.baseAttributeValue}{['xp','coins','vitality','fortitude','persuasion'].includes(item.baseAttributeType) ? '%' : ''}
                       </div>
                     )}
                     
                     {item.adds && item.adds.length > 0 && (
                       <div style={{ fontSize: '0.9rem' }}>
                         <strong style={{ color: '#D8B4FE' }}>✨ Atributos Adicionais:</strong>
                         <ul style={{ margin: '0.25rem 0 0 0', paddingLeft: '1.2rem' }}>
                           {item.adds.map((add: ItemAdd, i: number) => {
                             const lbl = ATTRIBUTE_LABELS[add.type];
                             if (!lbl) return null;
                             return (
                               <li key={i} style={{ color: lbl.color, marginBottom: '0.25rem' }}>
                                 {lbl.icon} {lbl.label}: +{add.value}%
                               </li>
                             );
                           })}
                         </ul>
                       </div>
                     )}
                   </>
                 ) : (
                   <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                     {slot.label}<br/>
                     <span style={{ fontSize: '0.8rem', opacity: 0.7 }}>Nenhum item equipado</span>
                   </p>
                 )}
               </div>
            )}
          </div>
        );
      })}
    </div>
  );
});

export function AvatarFace2D({ config, size }: { config: AvatarConfig, size: number }) {
    const [faceUrl, setFaceUrl] = useState('');
    
    useEffect(() => {
        let isMounted = true;
        const generate = async () => {
            const skinUrl = config.customSkinUrl || await generateMinecraftSkinUrl(config, false);
            if (!isMounted) return;
            const img = new Image();
            img.onload = () => {
                if (!isMounted) return;
                const canvas = document.createElement('canvas');
                canvas.width = 8;
                canvas.height = 8;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.drawImage(img, 8, 8, 8, 8, 0, 0, 8, 8);
                    ctx.drawImage(img, 40, 8, 8, 8, 0, 0, 8, 8);
                    setFaceUrl(canvas.toDataURL('image/png'));
                }
            };
            img.src = skinUrl.startsWith('http') && !skinUrl.startsWith('data:') ? `https://${skinUrl}` : skinUrl;
        };
        generate();
        return () => { isMounted = false; };
    }, [config]);
    
    if (!faceUrl) return <div style={{ width: size, height: size, background: 'transparent' }} />;
    return <img src={faceUrl} style={{ width: size, height: size, imageRendering: 'pixelated', objectFit: 'cover' }} alt="Face" />;
}

export default AvatarCharacter;
