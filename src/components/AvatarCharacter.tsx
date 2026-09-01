import React, { useEffect, useRef, useState, useMemo } from 'react';
import { SkinViewer, IdleAnimation, WalkingAnimation, RunningAnimation, FunctionAnimation } from 'skinview3d';
import { GLTFLoader } from 'skinview3d/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
// Importando THREE diretamente de dentro da dependência do skinview3d para evitar mismatch
import * as THREE from 'skinview3d/node_modules/three';
import { generateMinecraftSkinUrl } from '../lib/SkinGenerator';
import { ATTRIBUTE_LABELS, type ItemAdd, type ItemCategory, type AttributeType } from '../lib/gacha';
import { generateVoxelItemFromImage, updateVoxelCurve, setVoxelThickness } from '../lib/VoxelItemGenerator';
import { Eye, EyeOff, PackageX } from 'lucide-react';

export interface AvatarConfig {
  gender?: 'male' | 'female';
  skinColor?: string;
  hairColor?: string;
  eyeColor?: string;
  hairStyle?: string;
  mouthStyle?: string;
  lipstickColor?: string;
  eyeStyle?: string;
  shirtColor?: string;
  pantsColor?: string;
  clothingStyle?: 'dress' | 'pants-shirt' | 't-shirt' | 'tank-top' | 'skirt' | 'crop-top' | 'overalls' | 'suit';
  shoeStyle?: 'sneakers' | 'boots' | 'flats' | 'heels' | 'sandals';
  shoeColor?: string;
  hairAccessory?: 'none' | 'flower' | 'bow' | 'headband' | 'glasses'; // Mantido para retrocompatibilidade
  hairAccessories?: string[]; // Suporta múltiplos acessórios
  hairTieColor?: string; // Cor do laço das marias-chiquinhas
  accessoryColor?: string; // Mantido para retrocompatibilidade
  accessoryColors?: string[]; // Suporta cores múltiplas
  glasses?: 'none' | 'classic' | 'thin' | 'round' | 'sunglasses';
  glassesColor?: string;
  facialHair?: 'none' | 'beard' | 'mustache' | 'goatee';
  facialHairColor?: string;
  handedness?: 'right' | 'left';
  animationState?: 'idle' | 'walk' | 'run' | 'attack' | 'raise-hand';
  customSkinUrl?: string;
  customModelUrl?: string;
  /** Escala/zoom do modelo 3D customizado (1 = padrão auto-enquadrado) */
  customZoom?: number;
  ponytailLength?: number;
  ponytailThickness?: number;
  ponytailAngle?: number;
  firstEditAt?: number;
  genderUnlockUntil?: number;
  savedPreSkinConfig?: Partial<AvatarConfig>;
  savedOppositeGenderConfig?: Partial<AvatarConfig>;
  hiddenSlots?: string[];
  /** Poses customizadas que substituem as ações base, por ação */
  actionPoses?: Partial<Record<'idle' | 'walk' | 'run' | 'attack', CharacterPose>>;
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
  extractMeshName?: string;
  gameModelUrl?: string;
  modelTextureUrl?: string;
  minecraftHeadValue?: string;
  modelTransforms?: ModelTransformsConfig;
  rarity?: string;
  backColor?: string;
  customAnimation?: ItemAnimation;
  /** Sprite animado (atlas) ao redor do item — efeito de brilho/encanto */
  spriteAnimation?: SpriteAnimation;
  gameEffect?: string;
  hpCooldownReductionMinutes?: number;
}

export interface BoneTransform {
  rx: number; ry: number; rz: number;
}

export interface CharacterPose {
  head?: BoneTransform;
  body?: BoneTransform;
  leftArm?: BoneTransform;
  rightArm?: BoneTransform;
  leftLeg?: BoneTransform;
  rightLeg?: BoneTransform;
  /** Rotação do CORPO TODO (yaw, em radianos) — usado para "girar" o boneco */
  yaw?: number;
}

export interface ItemAnimation {
  frames: CharacterPose[];
  loop: boolean;
  duration?: number;
}

/** Sprite animado (atlas) ao redor do item — exibe uma célula por vez, ciclando (efeito de brilho/encanto) */
export interface SpriteAnimation {
  url: string;
  cols: number;
  rows: number;
  fps: number;
  scale?: number;
  offsetX?: number;
  offsetY?: number;
  /** Profundidade (Z) — aproxima/afasta a sprite do item (ex.: braços esticados para frente) */
  offsetZ?: number;
  opacity?: number;
  /** Cor do fundo a ignorar (chroma key). Vazio = sem máscara. Ex.: '#000000' para fundo preto */
  maskColor?: string;
  /** Tolerância da máscara (0-1) — quão próximo da cor é considerado fundo */
  maskTolerance?: number;
  /** Forma de recorte (clip) da sprite. 'none' = retângulo completo */
  maskShape?: 'none' | 'circle' | 'square' | 'triangle' | 'diamond' | 'ring';
  /** Silhueta personalizada (imagem) usada como recorte — ex.: o formato do item */
  maskUrl?: string;
}

export interface ModelTransform {
  posX: number;
  posY: number;
  posZ: number;
  rotX: number;
  rotY: number;
  rotZ: number;
  slide: number;
  scale?: number;
  thickness?: number;
  curveX?: number;
  curveY?: number;
}

export interface ModelTransformsConfig {
  common?: ModelTransform;
  battle?: ModelTransform;
  common_left?: ModelTransform;
  battle_left?: ModelTransform;
  common_female?: ModelTransform;
  battle_female?: ModelTransform;
  common_left_female?: ModelTransform;
  battle_left_female?: ModelTransform;
}

// Mapeia a "Parte do Avatar" do item para a parte correspondente no esqueleto do skin.
function getMinecraftSkinPart(skin: any, avatarPart?: string): any {
  if (!skin) return null;
  const map: Record<string, string> = {
    head: 'head',
    shoulders: 'body', torso: 'body', chest: 'body', body: 'body',
    leftArm: 'leftArm', left_arm: 'leftArm', arm: 'leftArm',
    rightArm: 'rightArm', right_arm: 'rightArm',
    leftLeg: 'leftLeg', leg: 'leftLeg', legs: 'leftLeg',
    rightLeg: 'rightLeg', feet: 'leftLeg',
  };
  return skin[map[avatarPart || 'head']] || skin.head;
}

// Escala/dimensões e altura padrão do cubo da textura Minecraft por parte do corpo.
function getMinecraftPartBase(avatarPart?: string): { scale: [number, number, number]; y: number } {
  switch (avatarPart) {
    case 'shoulders': case 'torso': case 'chest': case 'body':
      return { scale: [8.6, 12, 4.4], y: 6 };
    case 'leftArm': case 'rightArm': case 'arm':
      return { scale: [4.4, 12, 4.4], y: 6 };
    case 'leftLeg': case 'rightLeg': case 'leg': case 'feet':
      return { scale: [4.4, 12, 4.4], y: 6 };
    default: // head
      return { scale: [9.2, 9.2, 9.2], y: 4 };
  }
}

// Resolve o transform correto de um item considerando gênero, mão dominante e estado de batalha.
// As variantes femininas (corpo slim) têm prioridade quando o personagem é feminino, com fallback para a comum.
// Chave de transform de um item conforme mão dominante + gênero + estado de batalha.
// Cada combinação tem configuração INDEPENDENTE (direita não afeta esquerda):
//   male/direita: common | battle      female/direita: common_female | battle_female
//   male/esquerda: common_left | battle_left  female/esquerda: common_left_female | battle_left_female
export function getModelTransformKey(
  gender: 'male' | 'female' | undefined,
  handedness: string | undefined,
  isBattle: boolean
): string {
  const isLeft = handedness === 'left';
  const base = isBattle ? 'battle' : 'common';
  const side = isLeft ? '_left' : '';
  const g = gender === 'female' ? '_female' : '';
  return `${base}${side}${g}`;
}

export function resolveModelTransform(
  item: { modelTransforms?: ModelTransformsConfig },
  gender: 'male' | 'female' | undefined,
  handedness: string | undefined,
  isBattle: boolean
): ModelTransform | undefined {
  const mt = item.modelTransforms;
  if (!mt) return undefined;
  const isLeft = handedness === 'left';

  if (gender === 'female') {
    if (isLeft && isBattle && mt.battle_left_female) return mt.battle_left_female;
    if (isLeft && !isBattle && mt.common_left_female) return mt.common_left_female;
    if (!isLeft && isBattle && mt.battle_female) return mt.battle_female;
    if (!isLeft && !isBattle && mt.common_female) return mt.common_female;
    if (isLeft && isBattle && mt.battle_left) return mt.battle_left;
    if (isLeft && !isBattle && mt.common_left) return mt.common_left;
    if (isBattle && mt.battle) return mt.battle;
    // Fallback priorizando chaves femininas e depois qualquer uma (evita aplicar
    // transform masculino "voando" quando só existe uma configuração parcial)
    return mt.common || mt.common_female || mt.common_left_female || mt.battle_female || mt.common_left || mt.battle || mt.battle_left_female || mt.battle_left;
  }

  if (isLeft && isBattle && mt.battle_left) return mt.battle_left;
  if (isLeft && !isBattle && mt.common_left) return mt.common_left;
  if (isBattle && mt.battle) return mt.battle;
  // Fallback priorizando chaves masculinas/neutras (common) e depois qualquer uma
  return mt.common || mt.common_left || mt.battle || mt.battle_left || mt.common_female || mt.common_left_female || mt.battle_female || mt.battle_left_female;
}

// Itens 2.5D (voxel de imagem): a espessura é ASSADA nas camadas empilhadas (quase coladas).
// Então aqui NÃO multiplicamos o Z pela espessura (isso espalharia as camadas e criaria vãos);
// apenas re-empilhamos com a nova espessura quando ela mudar. Itens GLB: escala Z normal.
function applyItemScale(model: THREE.Object3D, s: number, thickness: number) {
  if (model.userData.is25D) {
    model.scale.set(s, s, s);
    const target = 0.12 * (thickness || 1);
    if (Math.abs((model.userData.voxelThickness || 0.12) - target) > 0.001) {
      setVoxelThickness(model as THREE.Group, target);
    }
  } else {
    model.scale.set(s, s, s * (thickness || 1));
  }
}

const getPlaceholderIcon = (slotId: string, sizeStr: string, isLeftHanded: boolean = false) => {
  const color = "rgba(255, 255, 255, 0.4)";
  const opacity = 1;
  const props = { width: sizeStr, height: sizeStr, viewBox: "0 0 24 24", fill: "none", stroke: color, strokeWidth: "2", strokeLinecap: "round" as const, strokeLinejoin: "round" as const, style: { opacity } };
  
  const getSwordSvg = () => <svg {...props}><polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"></polyline><line x1="13" y1="19" x2="19" y2="13"></line><line x1="16" y1="16" x2="20" y2="20"></line><line x1="19" y1="21" x2="21" y2="19"></line></svg>;
  const getShieldSvg = () => <svg {...props}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>;

  switch(slotId) {
    case 'head':
      // Helmet
      return <svg {...props}><path d="M12 2a9 9 0 0 0-9 9v4h18v-4a9 9 0 0 0-9-9z"></path><path d="M3 15v3a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3"></path><path d="M12 15v5"></path></svg>;
    case 'face':
      // Glasses
      return <svg {...props}><circle cx="6" cy="15" r="4"></circle><circle cx="18" cy="15" r="4"></circle><path d="M14 15a2 2 0 0 0-4 0"></path><path d="M2.5 13 5 7c.7-1.3 1.4-2 3-2"></path><path d="M21.5 13 19 7c-.7-1.3-1.5-2-3-2"></path></svg>;
    case 'accessory':
      // Necklace (Gem)
      return <svg {...props}><path d="M6 3h12l4 6-10 13L2 9Z"></path><path d="M11 3 8 9l4 13 4-13-3-6"></path></svg>;
    case 'hand1':
      // hand1 is Right side of screen
      return isLeftHanded ? getSwordSvg() : getShieldSvg();
    case 'hand2':
      // hand2 is Left side of screen
      return isLeftHanded ? getShieldSvg() : getSwordSvg();
    case 'body':
      // Armor / Shirt
      return <svg {...props}><path d="M20.38 3.46 16 2a8 8 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z"></path></svg>;
    case 'legs':
      // Pants (Trunks/Legs)
      return <svg {...props}><path d="M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4l-3-7-3 7H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"></path></svg>;
    case 'feet':
      // Boots
      return <svg {...props}><path d="M4 16h16v3a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-3z"></path><path d="M8 10v11"></path><path d="M16 10v11"></path><path d="M20 16v-5a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v5"></path></svg>;
    default:
      return null;
  }
};

export interface AvatarCharacterProps {
  config: AvatarConfig | null;
  equippedItems?: EquippedItem[];
  size?: number;
  interactive?: boolean;
  animation?: 'none' | 'idle' | 'walk' | 'run' | 'attack' | 'attack-fatal' | 'attack-fatal-slow' | 'hurt' | 'exhausted' | 'cheer' | 'raise-hand' | 'death-evaporate' | 'death-fall' | 'death-explode' | 'death-slice' | 'victory-easy' | 'victory-mid' | 'victory-hard';
  expression?: 'normal' | 'serious' | 'sad' | 'happy' | 'smile';
  role?: 'player' | 'monster';
  showSlots?: boolean;
  hurt?: boolean;
  onAvatarClick?: () => void;
  onSlotClick?: (item: EquippedItem) => void;
  onToggleSlotVisibility?: (slotId: string) => void;
  debugItemTransform?: ModelTransform | null;
  debugItemId?: string | null;
  debugPose?: CharacterPose;
  debugAnimationFrames?: CharacterPose[];
  debugPreviewAnim?: boolean;
  /** Poses customizadas que substituem as ações base (idle/walk/run/attack) */
  actionPoses?: Partial<Record<'idle' | 'walk' | 'run' | 'attack', CharacterPose>>;
  /** Quando true, o personagem fica de frente para a câmera nas animações de ataque (ex.: edição e rankings) */
  faceCamera?: boolean;
  /** Duração em segundos de cada frame no preview de animação (padrão 0.5s) */
  debugAnimationDuration?: number;
  /** Controle manual dos olhos: fecha o olho indicado (ou os dois) e desativa a piscada automática */
  closedEyes?: 'none' | 'left' | 'right' | 'both';
  /** Ignora a configuração de slots ocultos (hiddenSlots) — exibe todos os itens equipados (usado na Central 3D) */
  ignoreHiddenSlots?: boolean;
  /** Esconde os modelos 3D de cabelo/acessórios gerados a partir do config (ex.: ao visualizar uma skin completa) */
  hideConfigAddons?: boolean;
}

import CustomModelViewer from './CustomModelViewer';

const AvatarCharacter = React.memo(function AvatarCharacter({ config, equippedItems = [], size = 300, interactive = true, animation = 'idle', expression = 'normal', role = 'player', showSlots = false, hurt = false, onAvatarClick, onSlotClick, onToggleSlotVisibility, debugItemTransform, debugItemId, debugPose, debugAnimationFrames, debugPreviewAnim, actionPoses, faceCamera, debugAnimationDuration, closedEyes = 'none', ignoreHiddenSlots = false, hideConfigAddons }: AvatarCharacterProps) {
  // Tolerância a config nulo (ex.: usuário sem avatar configurado) para não quebrar o render.
  // useMemo garante uma referência ESTÁVEL (senão efeitos com [config] entrariam em loop).
  const configMemo = useMemo(() => config || ({} as any), [config]);
  config = configMemo as AvatarCharacterProps['config'];
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewerRef = useRef<SkinViewer | null>(null);
  const [hoveredSlot, setHoveredSlot] = useState<string | null>(null);
  const [activeMenuSlot, setActiveMenuSlot] = useState<string | null>(null);
  const [modelsLoadedCount, setModelsLoadedCount] = useState(0);

  useEffect(() => {
    const handleClickOutside = () => setActiveMenuSlot(null);
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const customHairRef = useRef<THREE.Group | null>(null);

  const [zoomLevel, setZoomLevel] = useState(0.9);

  useEffect(() => {
    if (viewerRef.current) {
        viewerRef.current.zoom = zoomLevel;
    }
  }, [zoomLevel]);

  // Efeito de flash vermelho quando toma dano
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !viewer.playerObject) return;

    const skin = viewer.playerObject.skin;
    if (!skin) return;

    // Aplicar flash vermelho
    const applyRedFlash = () => {
      skin.traverse((child: any) => {
        if (child.isMesh && child.material) {
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          materials.forEach((mat: any) => {
            if (mat.color) {
              // Salvar cor original no próprio material
              if (!mat._originalColor) {
                mat._originalColor = mat.color.clone();
              }
              mat.color.set(0xff4444);
              mat.needsUpdate = true;
            }
          });
        }
      });
    };

    // Restaurar cores originais
    const restoreColors = () => {
      skin.traverse((child: any) => {
        if (child.isMesh && child.material) {
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          materials.forEach((mat: any) => {
            if (mat._originalColor) {
              mat.color.copy(mat._originalColor);
              mat.needsUpdate = true;
            } else if (mat.color) {
              mat.color.set(0xffffff);
              mat.needsUpdate = true;
            }
          });
        }
      });
    };

    if (hurt) {
      applyRedFlash();
      const timer = setTimeout(restoreColors, 200);
      return () => clearTimeout(timer);
    }
  }, [hurt]);

  // States to hold generated skin URLs
  const [skinUrls, setSkinUrls] = useState<{
    normal: { base: string; blink: string };
    serious: { base: string; blink: string };
    sad: { base: string; blink: string };
    happy: { base: string; blink: string };
    smile: { base: string; blink: string };
  } | null>(null);

  const bgItems = equippedItems.filter(i => i.avatarPart === 'background');

  // 1. Initialize and dispose viewer
  useEffect(() => {
    if (!canvasRef.current || size <= 0) return;
    
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
  
      viewer.controls.enableZoom = false; // Desabilitado para evitar scroll indesejado, usando apenas o slider
      viewer.controls.enableRotate = interactive;
      viewer.controls.enablePan = interactive;
      
      viewerRef.current = viewer;
      
      if (viewer.renderer) {
          viewer.renderer.setClearColor(0x000000, 0);
          viewer.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Garante nitidez máxima em telas Retina/High-DPI
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
          viewerRef.current.controls.enableZoom = false; // Desabilitado
          viewerRef.current.controls.enableRotate = interactive;
          viewerRef.current.controls.enablePan = interactive;
      }
  }, [size, interactive]);

  // 3. Attach 3D items to the avatar based on equippedItems
  const equippedItemsJson = JSON.stringify(equippedItems);
  const debugTransformJson = JSON.stringify(debugItemTransform);
  const loadedModelsRef = useRef<{itemId?: string, avatarPart: string, model: THREE.Object3D, item: EquippedItem}[]>([]);
  // Cacheia o centro do item (no frame local) por itemId — estável entre recriações da sprite
  const itemCentersRef = useRef<Record<string, THREE.Vector3>>({});

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !viewer.playerObject) return;
    
    let isCancelled = false;
    // Armazena os modelos carregados para poder removê-los depois
    const loadedModels: { parent: THREE.Object3D, model: THREE.Object3D }[] = [];
    const loader = new GLTFLoader();

    // Gera a máscara de forma (alpha) proporcional à célula do atlas
    const buildShapeMask = (shape: string, aspect: number): THREE.Texture | null => {
      const W = 256;
      const H = Math.max(16, Math.round(256 * aspect));
      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#ffffff';
      const cx = W / 2;
      const cy = H / 2;
      const r = Math.min(W, H) / 2 * 0.95;
      switch (shape) {
        case 'circle':
          ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill(); break;
        case 'square':
          ctx.fillRect(cx - r, cy - r, r * 2, r * 2); break;
        case 'triangle':
          ctx.beginPath(); ctx.moveTo(cx, cy - r); ctx.lineTo(cx - r, cy + r); ctx.lineTo(cx + r, cy + r); ctx.closePath(); ctx.fill(); break;
        case 'diamond':
          ctx.beginPath(); ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy); ctx.lineTo(cx, cy + r); ctx.lineTo(cx - r, cy); ctx.closePath(); ctx.fill(); break;
        case 'ring':
          ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
          ctx.globalCompositeOperation = 'destination-out';
          ctx.beginPath(); ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2); ctx.fill();
          break;
        default:
          return null;
      }
      const tex = new THREE.CanvasTexture(canvas);
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      return tex;
    };

    // Carrega uma silhueta personalizada (imagem) como recorte
    const loadShapeFromUrl = (url: string) => new Promise<THREE.Texture | null>((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          if (!ctx) return resolve(null);
          ctx.drawImage(img, 0, 0);
          const tex = new THREE.CanvasTexture(canvas);
          tex.magFilter = THREE.NearestFilter;
          tex.minFilter = THREE.NearestFilter;
          resolve(tex);
        } catch (e) { resolve(null); }
      };
      img.onerror = () => resolve(null);
      img.src = url;
    });
    const applyColorMask = (tex: THREE.Texture, color: string, tolerance: number): THREE.Texture => {
      const img = (tex as any).image;
      if (!img || !img.width || !img.height) return tex;
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return tex;
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        const r = parseInt(color.slice(1, 3), 16) || 0;
        const g = parseInt(color.slice(3, 5), 16) || 0;
        const b = parseInt(color.slice(5, 7), 16) || 0;
        const tol = Math.max(0, Math.min(1, tolerance)) * 255;
        for (let i = 0; i < data.length; i += 4) {
          if (Math.abs(data[i] - r) <= tol && Math.abs(data[i + 1] - g) <= tol && Math.abs(data[i + 2] - b) <= tol) {
            data[i + 3] = 0;
          }
        }
        ctx.putImageData(imageData, 0, 0);
        const masked = new THREE.CanvasTexture(canvas);
        masked.colorSpace = tex.colorSpace;
        return masked;
      } catch (e) {
        console.error('Erro ao aplicar máscara de cor na sprite:', e);
        return tex;
      }
    };

    // Centro do modelo do item no frame local (para a sprite nascer "no item")
    const getItemCenter = (model: THREE.Object3D): THREE.Vector3 => {
      try {
        model.updateWorldMatrix(true, true);
        const box = new THREE.Box3().setFromObject(model);
        if (box.isEmpty()) return new THREE.Vector3(0, 0, 0);
        const inv = new THREE.Matrix4().copy(model.matrixWorld).invert();
        box.applyMatrix4(inv);
        const c = box.getCenter(new THREE.Vector3());
        if (!isFinite(c.x) || !isFinite(c.y) || !isFinite(c.z)) return new THREE.Vector3(0, 0, 0);
        return c;
      } catch (e) {
        return new THREE.Vector3(0, 0, 0);
      }
    };

    // Cria a sprite animada como FILHA do modelo do item: ela segue exatamente o item
    // (posição, rotação, escala) e os deslocamentos são relativos à geometria do item.
    const spawnSprite = (itemModel: THREE.Object3D, item: EquippedItem) => {
      const sa = item.spriteAnimation;
      if (!sa || !sa.url) return;
      const cols = Math.max(1, sa.cols || 1);
      const rows = Math.max(1, sa.rows || 1);
      const fps = Math.max(1, sa.fps || 6);
      const s = sa.scale || 8;
      // Compensa a escala do modelo pai para manter tamanho/posição visuais consistentes
      const inv = itemModel.scale.x || 1;
      new THREE.TextureLoader().load(sa.url, (rawTex) => {
        if (isCancelled) return;
        // Clona a textura para cada sprite (evita conflito de offset/repeat entre sprites)
        const baseTex = rawTex.clone();
        // Aplica máscara de fundo (chroma key) se configurada
        const tex = (sa.maskColor && sa.maskColor.trim() !== '')
          ? applyColorMask(baseTex, sa.maskColor.trim(), sa.maskTolerance ?? 0.15)
          : baseTex;
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(1 / cols, 1 / rows);
        tex.magFilter = THREE.NearestFilter;
        tex.minFilter = THREE.NearestFilter;

        // Cria a sprite (a forma de recorte é aplicada via alphaMap)
        const makeSprite = (alpha: THREE.Texture | null) => {
          if (isCancelled) return;
          const matParams: THREE.SpriteMaterialParameters = {
            map: tex,
            transparent: true,
            depthWrite: false,
            opacity: sa.opacity ?? 0.85,
            blending: THREE.AdditiveBlending,
          };
          if (alpha) matParams.alphaMap = alpha;
          const mat = new THREE.SpriteMaterial(matParams);
          const sprite = new THREE.Sprite(mat);
          // Proporção da célula para a escala ficar fiel ao recorte
          sprite.scale.set((s * (rows / cols)) / inv, s / inv, 1);
          // Nasce no CENTRO do item (bounding box) — valor cacheado por item para
          // não variar entre recriações da sprite ao mexer nos sliders
          const itemKey = item.itemId || item.docId || item.itemTitle || 'item';
          let center = itemCentersRef.current[itemKey];
          if (!center) {
            center = getItemCenter(itemModel);
            itemCentersRef.current[itemKey] = center.clone();
          }
          sprite.position.set(
            center.x + (sa.offsetX || 0) / inv,
            center.y + (sa.offsetY || 0) / inv,
            center.z + (sa.offsetZ || 0) / inv
          );
          itemModel.add(sprite);
          loadedModels.push({ parent: itemModel, model: sprite });
          loadedModelsRef.current.push({ itemId: item.itemId || item.docId, avatarPart: item.avatarPart, model: sprite, item });

          const total = cols * rows;
          if (total > 1) {
            // Animação baseada no tempo (roda no onBeforeRender do material): não depende
            // de intervalos, então nunca "para" ao mexer nos sliders ou recriar a sprite.
            mat.onBeforeRender = () => {
              const f = Math.floor((performance.now() / 1000) * fps) % total;
              const col = f % cols;
              const row = Math.floor(f / cols) % rows;
              tex.offset.set(col * (1 / cols), 1 - (row + 1) * (1 / rows));
            };
          } else {
            tex.offset.set(0, 1 - (1 / rows));
          }
        };

        // Recorte: silhueta personalizada > forma pré-definida > nenhum
        if (sa.maskUrl && sa.maskUrl.trim() !== '') {
          loadShapeFromUrl(sa.maskUrl.trim()).then(alpha => { if (!isCancelled) makeSprite(alpha); });
        } else if (sa.maskShape && sa.maskShape !== 'none') {
          makeSprite(buildShapeMask(sa.maskShape, rows / cols));
        } else {
          makeSprite(null);
        }
      }, undefined, (err) => {
        console.error(`Erro ao carregar sprite do item ${item.itemTitle}:`, err);
      });
    };
    
    const handItemsLocal = equippedItems.filter(i => i.avatarPart === 'rightHand' || i.avatarPart === 'leftHand' || i.avatarPart === 'hand');
    let rightScreenHandLocal = null;
    let leftScreenHandLocal = null;
    if (config?.handedness === 'left') {
      rightScreenHandLocal = handItemsLocal[0];
      leftScreenHandLocal = handItemsLocal[1];
    } else {
      leftScreenHandLocal = handItemsLocal[0];
      rightScreenHandLocal = handItemsLocal[1];
    }

    equippedItems.forEach(item => {
      let slotId = item.avatarPart as string;
      if (item.avatarPart === 'two_handed') slotId = 'hand2';
      else if (item.avatarPart === 'hand' || item.avatarPart === 'rightHand' || item.avatarPart === 'leftHand') {
         if (item === rightScreenHandLocal) slotId = 'hand1';
         else if (item === leftScreenHandLocal) slotId = 'hand2';
      }
      if (!ignoreHiddenSlots && config?.hiddenSlots?.includes(slotId)) return;

      if (item.gameModelUrl && item.gameModelUrl.trim() !== '') {
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
        
        const finalUrl = safeUrl.startsWith('http') ? safeUrl : encodeURI(safeUrl);
        console.log(`Carregando modelo 3D para o item ${item.itemTitle}:`, finalUrl);
        
        const processLoadedModel = (model: THREE.Object3D, splitDir?: 'left' | 'right' | 'body_part', isGltf: boolean = false) => {
            // Malhas escaladas/rotacionadas anexadas a "bones" (braços/pernas) podem ter a
            // bounding sphere mal calculada → o frustum culling "corta"/faz piscar a arma
            // em certas posições (ex.: pós-fatality). Desabilitamos o culling dessas malhas.
            model.traverse(child => {
              if ((child as THREE.Mesh).isMesh) {
                (child as THREE.Mesh).frustumCulled = false;
              }
            });
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
                  applyItemScale(model, debugItemTransform.scale ?? 10, debugItemTransform.thickness ?? 1);
                  model.position.set(debugItemTransform.posX * inv, debugItemTransform.posY, debugItemTransform.posZ);
                  model.rotation.set(debugItemTransform.rotX, debugItemTransform.rotY * inv, debugItemTransform.rotZ * inv);
                  model.translateY(debugItemTransform.slide);
                  appliedTransform = true;
                } else if (item.modelTransforms) {
                  const isBattle = animation === 'attack' || animation === 'attack-fatal' || animation === 'attack-fatal-slow';
                  const transform = resolveModelTransform(item, config.gender, config.handedness, isBattle)
                    || item.modelTransforms.common
                    || (Object.values(item.modelTransforms)[0] as any);
                  if (transform) {
                    applyItemScale(model, transform.scale ?? 10, transform.thickness ?? 1);
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
              // Sprite acompanha o item (filha do modelo)
              spawnSprite(model, item);
            } else if (item.avatarPart === 'head') {
              const head = viewer.playerObject.skin.head;
              // Os itens do Blockbench para Minecraft geralmente vêm na escala de 1 unidade = 16 pixels.
              // A cabeça tem 8x8x8 pixels. Multiplicando a escala por 16, os tamanhos batem perfeitamente.
              model.scale.set(16, 16, 16);
              
              let appliedTransform = false;
              const itemId = item.itemId || item.docId;
              if (debugItemTransform && debugItemId === itemId) {
                applyItemScale(model, debugItemTransform.scale ?? 16, debugItemTransform.thickness ?? 1);
                model.position.set(debugItemTransform.posX, debugItemTransform.posY, debugItemTransform.posZ);
                model.rotation.set(debugItemTransform.rotX, debugItemTransform.rotY, debugItemTransform.rotZ);
                model.translateY(debugItemTransform.slide);
                appliedTransform = true;
              } else if (item.modelTransforms && Object.keys(item.modelTransforms).length > 0) {
                const t = resolveModelTransform(item, config.gender, config.handedness, false) || item.modelTransforms.common || (Object.values(item.modelTransforms)[0] as any);
                applyItemScale(model, t.scale ?? 16, t.thickness ?? 1);
                model.position.set(t.posX, t.posY, t.posZ);
                model.rotation.set(t.rotX, t.rotY, t.rotZ);
                model.translateY(t.slide);
                appliedTransform = true;
              }
              
              if (!appliedTransform) {
                model.position.set(0, 0, 0);
                model.rotation.set(0, Math.PI, 0); // Girar 180 graus (frente para trás)
              }
              head.add(model);
              loadedModels.push({ parent: head, model });
              loadedModelsRef.current.push({ itemId: item.itemId || item.docId, avatarPart: item.avatarPart, model, item });
              spawnSprite(model, item);
            } else if (item.avatarPart === 'body' || item.avatarPart === 'legs' || item.avatarPart === 'feet') {
              let targetGroup = viewer.playerObject.skin.body;
              let finalModelToAdd = model;

              if (splitDir === 'left') {
                 targetGroup = viewer.playerObject.skin.leftLeg;
                 if (isGltf) {
                   const wrapper = new THREE.Group();
                   wrapper.position.set(2, 4, 0); // Cancela o offset do pivot da perna esquerda
                   wrapper.add(model);
                   finalModelToAdd = wrapper;
                 }
              } else if (splitDir === 'right') {
                 targetGroup = viewer.playerObject.skin.rightLeg;
                 if (isGltf) {
                   const wrapper = new THREE.Group();
                   wrapper.position.set(-2, 4, 0); // Cancela o offset do pivot da perna direita
                   wrapper.add(model);
                   finalModelToAdd = wrapper;
                 }
              }

              model.scale.set(16, 16, 16);
              // O grupo "body" no skinview3d tem seu eixo deslocado. Precisamos descer o modelo em -6 para alinhar com o peitoral.
              let appliedTransform = false;
              const itemId = item.itemId || item.docId;
              if (debugItemTransform && debugItemId === itemId) {
                applyItemScale(model, debugItemTransform.scale ?? 16, debugItemTransform.thickness ?? 1);
                model.position.set(debugItemTransform.posX, debugItemTransform.posY, debugItemTransform.posZ);
                model.rotation.set(debugItemTransform.rotX, debugItemTransform.rotY, debugItemTransform.rotZ);
                model.translateY(debugItemTransform.slide);
                appliedTransform = true;
              } else if (item.modelTransforms && Object.keys(item.modelTransforms).length > 0) {
                const t = resolveModelTransform(item, config.gender, config.handedness, false) || item.modelTransforms.common || (Object.values(item.modelTransforms)[0] as any);
                applyItemScale(model, t.scale ?? 16, t.thickness ?? 1);
                model.position.set(t.posX, t.posY, t.posZ);
                model.rotation.set(t.rotX, t.rotY, t.rotZ);
                model.translateY(t.slide);
                appliedTransform = true;
              }
              
              if (!appliedTransform) {
                let yOffset = -6;
                if (item.avatarPart === 'legs') yOffset = -15;
                if (item.avatarPart === 'feet') yOffset = -22;
                
                let xOffset = 0;
                if (!isGltf) {
                  if (splitDir === 'left') {
                     xOffset = 0; // The mesh is centered locally, leftLeg is at -2 globally, so xOffset 0 puts it at -2 globally!
                     yOffset += 12; // Compensate for the leg's local pivot
                  } else if (splitDir === 'right') {
                     xOffset = 0;
                     yOffset += 12;
                  }
                }

                model.position.set(xOffset, yOffset, 0);
                model.rotation.set(0, 0, 0); // Mantém a rotação original (0 graus)
              }
              targetGroup.add(finalModelToAdd);
              if (debugItemId === itemId) {
                const helper = new THREE.BoxHelper(finalModelToAdd, 0xff0000);
                targetGroup.add(helper);
              }
              loadedModels.push({ parent: targetGroup, model: finalModelToAdd });
              loadedModelsRef.current.push({ itemId: item.itemId || item.docId, avatarPart: item.avatarPart, model, item });
              spawnSprite(model, item);
            }
            if (!isCancelled) {
              setModelsLoadedCount(prev => prev + 1);
            }
        };

        // Extrai apenas o caminho da URL para ignorar parâmetros de query (ex: ?alt=media&token=...)
        const getExtension = (urlPath: string) => {
          try {
            return new URL(urlPath, window.location.origin).pathname.toLowerCase();
          } catch {
            return urlPath.toLowerCase().split('?')[0];
          }
        };

        if (getExtension(finalUrl).endsWith('.png')) {
           let curveX = 0;
           let curveY = 0;
           let genThickness = 0.12;
           if (debugItemTransform && debugItemId === (item.itemId || item.docId)) {
             curveX = debugItemTransform.curveX || 0;
             curveY = debugItemTransform.curveY || 0;
             genThickness = 0.12 * (debugItemTransform.thickness ?? 1);
           } else if (item.modelTransforms && Object.keys(item.modelTransforms).length > 0) {
             const curveT = resolveModelTransform(item, config.gender, config.handedness, false) || item.modelTransforms.common || (Object.values(item.modelTransforms)[0] as any);
             curveX = curveT.curveX || 0;
             curveY = curveT.curveY || 0;
             genThickness = 0.12 * (curveT.thickness ?? 1);
           }

            const normalizedAvatarPart = item.avatarPart ? String(item.avatarPart).toLowerCase().trim() : '';
            if (normalizedAvatarPart === 'legs' || normalizedAvatarPart === 'feet') {
             Promise.all([
               generateVoxelItemFromImage(finalUrl, item.backColor, curveX, curveY, 'left', genThickness),
               generateVoxelItemFromImage(finalUrl, item.backColor, curveX, curveY, 'right', genThickness)
             ]).then(([leftModel, rightModel]) => {
                if (isCancelled) return;
                processLoadedModel(leftModel, 'left');
                processLoadedModel(rightModel, 'right');
             }).catch(err => console.error(err));
           } else {
             generateVoxelItemFromImage(finalUrl, item.backColor, curveX, curveY, undefined, genThickness)
               .then(model => {
                  if (isCancelled) return;
                  console.log(`Voxel gerado com sucesso a partir da imagem ${finalUrl}`);
                  processLoadedModel(model);
               })
               .catch(err => console.error(err));
           }
        } else {
           loader.load(
             finalUrl, 
             (gltf) => {
               if (isCancelled) return;
               console.log(`Modelo ${finalUrl} carregado com sucesso!`);
               const model = gltf.scene;
                
                if (item.extractMeshName) {
                  let targetNode: THREE.Object3D | null = null;
                  model.traverse((node) => {
                    if (node.name === item.extractMeshName) {
                      targetNode = node;
                    }
                  });
                  
                  if (targetNode) {
                    // Hide everything first
                    model.traverse((node) => {
                      if ((node as THREE.Mesh).isMesh || (node as THREE.Group).isGroup) {
                        node.visible = false;
                      }
                    });
                    
                    // Show only target and its descendants
                    targetNode.visible = true;
                    targetNode.traverse((child) => {
                      child.visible = true;
                    });
                    
                    // Also need to ensure parents are visible so it isn't hidden by a parent group!
                    let current = targetNode.parent;
                    while (current && current.type !== 'Scene') {
                      current.visible = true;
                      current = current.parent;
                    }
                  } else {
                    console.warn(`Mesh extraída '${item.extractMeshName}' não encontrada no item ${item.itemTitle}.`);
                  }
                }
   
               if (item.modelTextureUrl) {
                 const proxyUrl = `https://wsrv.nl/?url=${encodeURIComponent(item.modelTextureUrl)}`;
                 const texLoader = new THREE.TextureLoader();
                 texLoader.setCrossOrigin('anonymous');
                 
                 const loadTex = (url: string, fallbackUrl?: string) => {
                   texLoader.load(
                     url,
                     (texture) => {
                       texture.flipY = false;
                       texture.colorSpace = THREE.SRGBColorSpace;
                       texture.magFilter = THREE.NearestFilter;
                       texture.minFilter = THREE.NearestFilter;
                       model.traverse((child) => {
                         if ((child as THREE.Mesh).isMesh) {
                           const mesh = child as THREE.Mesh;
                           if (mesh.material) {
                             const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
                             materials.forEach(mat => {
                               const stdMat = mat as THREE.MeshStandardMaterial;
                               stdMat.map = texture;
                               stdMat.color = new THREE.Color(0xffffff);
                               stdMat.transparent = true;
                               stdMat.alphaTest = 0.5;
                               stdMat.needsUpdate = true;
                             });
                           }
                         }
                       });
                     },
                     undefined,
                     (err) => {
                       console.error(`Erro ao carregar texture do modelo via proxy ${url}:`, err);
                       if (fallbackUrl) {
                         loadTex(fallbackUrl);
                       }
                     }
                   );
                 };
                 const fallbackUrl = `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(item.modelTextureUrl)}`;
                 loadTex(proxyUrl, fallbackUrl);
                }
                
                const normalizedPart = item.avatarPart ? String(item.avatarPart).toLowerCase().trim() : '';
                if (normalizedPart === 'legs' || normalizedPart === 'feet') {
                   const cloneLeft = model.clone();
                   const cloneRight = model.clone();
                   const cloneBody = model.clone();

                   const isLeft = (n: any) => {
                      let name = n.name.toLowerCase();
                      let p = n.parent;
                      while(p && p.type !== 'Scene') { name += ' ' + p.name.toLowerCase(); p = p.parent; }
                      return name.includes('left') && (name.includes('leg') || name.includes('boot') || name.includes('foot') || name.includes('greva') || name.includes('calca'));
                   };
                   const isRight = (n: any) => {
                      let name = n.name.toLowerCase();
                      let p = n.parent;
                      while(p && p.type !== 'Scene') { name += ' ' + p.name.toLowerCase(); p = p.parent; }
                      return name.includes('right') && (name.includes('leg') || name.includes('boot') || name.includes('foot') || name.includes('greva') || name.includes('calca'));
                   };

                   cloneLeft.traverse((node) => { if ((node as any).isMesh && !isLeft(node)) node.visible = false; });
                   cloneRight.traverse((node) => { if ((node as any).isMesh && !isRight(node)) node.visible = false; });
                   cloneBody.traverse((node) => { if ((node as any).isMesh && (isLeft(node) || isRight(node))) node.visible = false; });

                   // Como o modelo GLB é invertido e rotacionado em 180 graus (Math.PI) no processLoadedModel,
                   // cloneLeft (boot_left) vai para o lado esquerdo da tela (-X), que é o leftLeg do skinview3d.
                   processLoadedModel(cloneLeft, 'left', true); 
                   processLoadedModel(cloneRight, 'right', true);
                   processLoadedModel(cloneBody, 'body_part', true);
                } else {
                   processLoadedModel(model, undefined, true);
                }
             },
             undefined,
             (error) => {
               console.error(`Falha ao carregar o modelo 3D (${finalUrl}):`, error);
             }
           );
        }
      } else if (item.minecraftHeadValue && item.minecraftHeadValue.trim() !== '' && item.avatarPart !== 'rightHand' && item.avatarPart !== 'leftHand' && item.avatarPart !== 'two_handed') {
        let textureUrl = item.minecraftHeadValue.trim();
        // Decode Base64 from Mojang format if it doesn't look like an HTTP URL
        if (!textureUrl.startsWith('http')) {
          try {
            const decoded = JSON.parse(atob(textureUrl));
            if (decoded.textures && decoded.textures.SKIN && decoded.textures.SKIN.url) {
              textureUrl = decoded.textures.SKIN.url;
            }
          } catch (e) {
            console.error(`Erro ao decodificar Base64 de cabeça Minecraft: ${textureUrl}`);
            return; // Skip if invalid
          }
        }
        
        // Pass through CORS proxy to ensure we can load textures from textures.minecraft.net
        // Using mc-heads.net for native mojang textures as it has no CORS issues and is lightning fast
        let proxyUrl = textureUrl;
        if (textureUrl.includes('textures.minecraft.net/texture/')) {
          const hash = textureUrl.substring(textureUrl.lastIndexOf('/') + 1);
          proxyUrl = `https://mc-heads.net/skin/${hash}`;
        } else {
          proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(textureUrl)}`;
        }
        
        const loader = new THREE.TextureLoader();
        loader.setCrossOrigin('anonymous'); // CRITICAL for WebGL to accept the cross-origin image
        
        const loadTexture = (url: string, fallbackUrl?: string) => {
          loader.load(
            url, 
            (texture) => {
              if (isCancelled) return;
              texture.magFilter = THREE.NearestFilter;
              texture.minFilter = THREE.NearestFilter;
          texture.colorSpace = THREE.SRGBColorSpace; // Optional but recommended for colors
          
          // Minecraft head texture maps (64x64)
          // We need to map 6 faces of the head.
          // Faces: Right, Left, Top, Bottom, Front, Back
          // BoxGeometry standard order is Right(0), Left(1), Top(2), Bottom(3), Front(4), Back(5).
          const materials = [
            // Right (Minecraft right side of head is [0, 8] to [8, 16])
            new THREE.MeshBasicMaterial({ map: texture, transparent: true }),
            // Left (Minecraft left side is [16, 8] to [24, 16])
            new THREE.MeshBasicMaterial({ map: texture, transparent: true }),
            // Top (Minecraft top is [8, 0] to [16, 8])
            new THREE.MeshBasicMaterial({ map: texture, transparent: true }),
            // Bottom (Minecraft bottom is [16, 0] to [24, 8])
            new THREE.MeshBasicMaterial({ map: texture, transparent: true }),
            // Front (Minecraft front is [8, 8] to [16, 16])
            new THREE.MeshBasicMaterial({ map: texture, transparent: true }),
            // Back (Minecraft back is [24, 8] to [32, 16])
            new THREE.MeshBasicMaterial({ map: texture, transparent: true }),
          ];
          
          // Manually define UVs for a 1x1x1 Box
          const geometry = new THREE.BoxGeometry(1, 1, 1);
          const uvAttribute = geometry.attributes.uv;
          const uvs = uvAttribute.array as Float32Array;
          
          const setUV = (faceIndex: number, tx: number, ty: number, tw: number, th: number) => {
             const x0 = tx / 64;
             const x1 = (tx + tw) / 64;
             // Three.js Y is bottom-up, Minecraft is top-down (0 is top)
             const y1 = 1.0 - (ty / 64);
             const y0 = 1.0 - ((ty + th) / 64);
             
             // Each face has 4 vertices, 2 values each (U, V)
             const offset = faceIndex * 8;
             uvs[offset + 0] = x0; uvs[offset + 1] = y1;
             uvs[offset + 2] = x1; uvs[offset + 3] = y1;
             uvs[offset + 4] = x0; uvs[offset + 5] = y0;
             uvs[offset + 6] = x1; uvs[offset + 7] = y0;
          };
          
          setUV(0, 0, 8, 8, 8);    // Right (left side in image)
          setUV(1, 16, 8, 8, 8);   // Left (right side in image)
          setUV(2, 8, 0, 8, 8);    // Top
          setUV(3, 16, 0, 8, 8);   // Bottom
          setUV(4, 8, 8, 8, 8);    // Front
          setUV(5, 24, 8, 8, 8);   // Back
          
          uvAttribute.needsUpdate = true;
          
          const mesh = new THREE.Mesh(geometry, materials);
          // Aplica a textura Minecraft na parte do corpo selecionada (exceto armas),
          // com dimensões/posição padrão por parte.
          const skin = viewer.playerObject.skin;
          const parent = getMinecraftSkinPart(skin, item.avatarPart);
          const partBase = getMinecraftPartBase(item.avatarPart);
          if (!parent) return;
          mesh.scale.set(partBase.scale[0], partBase.scale[1], partBase.scale[2]);

          let appliedTransform = false;
          const itemId = item.itemId || item.docId;
          if (debugItemTransform && debugItemId === itemId) {
            mesh.position.set(debugItemTransform.posX, debugItemTransform.posY, debugItemTransform.posZ);
            mesh.rotation.set(debugItemTransform.rotX, debugItemTransform.rotY, debugItemTransform.rotZ);
            mesh.translateY(debugItemTransform.slide);
            appliedTransform = true;
          } else if (item.modelTransforms && Object.keys(item.modelTransforms).length > 0) {
            const t = resolveModelTransform(item, config.gender, config.handedness, false) || item.modelTransforms.common || (Object.values(item.modelTransforms)[0] as any);
            mesh.position.set(t.posX, t.posY, t.posZ);
            mesh.rotation.set(t.rotX, t.rotY, t.rotZ);
            mesh.translateY(t.slide);
            appliedTransform = true;
          }
          
          if (!appliedTransform) {
            mesh.position.set(0, partBase.y, 0);
          }
          
          parent.add(mesh);
          loadedModels.push({ parent, model: mesh });
          loadedModelsRef.current.push({ itemId: item.itemId || item.docId, avatarPart: item.avatarPart, model: mesh, item });
            },
            undefined,
            (err) => {
              console.error(`Erro ao carregar textura via proxy ${url}:`, err);
              if (fallbackUrl) {
                console.log(`Tentando URL de fallback: ${fallbackUrl}`);
                loadTexture(fallbackUrl);
              }
            }
          );
        };
        
        const fallbackProxyUrl = textureUrl.includes('textures.minecraft.net') ? 
            `https://mineskin.eu/skin/${textureUrl.substring(textureUrl.lastIndexOf('/') + 1)}` : 
            `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(textureUrl)}`;
        loadTexture(proxyUrl, fallbackProxyUrl);
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
  }, [equippedItemsJson, config?.handedness, config?.hiddenSlots?.join(','), ignoreHiddenSlots]);

  // 3c. Enquadramento do personagem no canvas.
  // - Sem armas: canvas retrato normal, câmera no fit padrão.
  // - Com armas (espada/escudo): alarga o canvas (mantém o boneco do mesmo tamanho) para as
  //   armas não cortarem nas bordas ao girar.
  // - Overrides do Arena Debug (🧍 Render) leem do localStorage e se aplicam a TODOS os
  //   AvatarCharacter (batalha, loja, editor) e reagem ao evento 'arena-char-render' ao vivo.
  const applyCharacterFraming = (ovConfig?: any) => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    let ov: Record<string, number> = { charCanvasW: 1, charCanvasH: 1, charZoom: 0.9, charFit: 60 };
    if (ovConfig) {
      ov = {
        charCanvasW: typeof ovConfig.charCanvasW === 'number' ? ovConfig.charCanvasW : ov.charCanvasW,
        charCanvasH: typeof ovConfig.charCanvasH === 'number' ? ovConfig.charCanvasH : ov.charCanvasH,
        charZoom: typeof ovConfig.charZoom === 'number' ? ovConfig.charZoom : ov.charZoom,
        charFit: typeof ovConfig.charFit === 'number' ? ovConfig.charFit : ov.charFit,
      };
    } else {
      try {
        const deviceKey = window.innerWidth < 768 ? 'mobile' : 'desktop';
        const saved = localStorage.getItem(`arenaDebugConfig_${deviceKey}`);
        if (saved) {
          const parsed = JSON.parse(saved);
          ov = {
            charCanvasW: typeof parsed.charCanvasW === 'number' ? parsed.charCanvasW : 1,
            charCanvasH: typeof parsed.charCanvasH === 'number' ? parsed.charCanvasH : 1,
            charZoom: typeof parsed.charZoom === 'number' ? parsed.charZoom : 0.9,
            charFit: typeof parsed.charFit === 'number' ? parsed.charFit : 60,
          };
        }
      } catch (e) { /* ignora */ }
    }

    const weapons = (equippedItems || []).filter(i =>
      ['rightHand', 'leftHand', 'hand', 'two_handed'].includes((i.avatarPart || '') as string)
    );
    const maxWeaponScale = Math.max(0, ...weapons.map(i =>
      (i.modelTransforms?.common?.scale) || (i.modelTransforms?.battle?.scale) || 10
    ));
    const mult = weapons.length > 0 ? (maxWeaponScale > 14 ? 1.7 : 1.5) : 1;
    const cw = Math.max(0.3, ov.charCanvasW);
    const ch = Math.max(0.3, ov.charCanvasH);
    const zoom = Math.max(0.1, ov.charZoom);
    const fit = Math.max(20, ov.charFit);

    viewer.width = Math.round(size * mult * cw);
    viewer.height = Math.round(size * 1.8 * ch);
    const camZ = fit / zoom;
    viewer.camera.position.set(0, 10, camZ);
    viewer.camera.lookAt(0, 0, 0);
    viewer.controls.target.set(0, 0, 0);
    viewer.controls.update();
  };
  const applyCharacterFramingRef = useRef(applyCharacterFraming);
  applyCharacterFramingRef.current = applyCharacterFraming;

  useEffect(() => {
    applyCharacterFramingRef.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equippedItemsJson, size]);

  // Aplica ao vivo quando o Arena Debug altera o render do personagem
  useEffect(() => {
    const handler = (e: Event) => applyCharacterFramingRef.current((e as CustomEvent).detail);
    window.addEventListener('arena-char-render', handler);
    return () => window.removeEventListener('arena-char-render', handler);
  }, []);

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
          applyItemScale(model, debugItemTransform.scale ?? 10, debugItemTransform.thickness ?? 1);
          model.position.set(debugItemTransform.posX * inv, debugItemTransform.posY, debugItemTransform.posZ);
          model.rotation.set(debugItemTransform.rotX, debugItemTransform.rotY * inv, debugItemTransform.rotZ * inv);
          // Reset position Y, then translate
          model.position.y = debugItemTransform.posY;
          model.translateY(debugItemTransform.slide);
          if (model.userData.is25D) {
            updateVoxelCurve(model as THREE.Group, debugItemTransform.curveX || 0, debugItemTransform.curveY || 0);
          }
          appliedTransform = true;
        } else if (item.modelTransforms) {
          const isBattle = animation === 'attack' || animation === 'attack-fatal' || animation === 'attack-fatal-slow';

          const transform = resolveModelTransform(item, config.gender, config.handedness, isBattle)
            || item.modelTransforms.common
            || (Object.values(item.modelTransforms)[0] as any);

          if (transform) {
            applyItemScale(model, transform.scale ?? 10, transform.thickness ?? 1);
            model.position.set(transform.posX * inv, transform.posY, transform.posZ);
            model.rotation.set(transform.rotX, transform.rotY * inv, transform.rotZ * inv);
            model.position.y = transform.posY;
            model.translateY(transform.slide);
            if (model.userData.is25D) {
              updateVoxelCurve(model as THREE.Group, transform.curveX || 0, transform.curveY || 0);
            }
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
      } else if (avatarPart === 'head') {
        let appliedTransform = false;
        const isTargetDebugItem = debugItemId === itemId;
        const defaultHeadScale = item.minecraftHeadValue ? 9.2 : 16;
        if (debugItemTransform && isTargetDebugItem) {
          applyItemScale(model, debugItemTransform.scale ?? defaultHeadScale, debugItemTransform.thickness ?? 1);
          model.position.set(debugItemTransform.posX, debugItemTransform.posY, debugItemTransform.posZ);
          model.rotation.set(debugItemTransform.rotX, debugItemTransform.rotY, debugItemTransform.rotZ);
          // For head, we might want to respect the slide, similar to hands
          model.position.y = debugItemTransform.posY;
          model.translateY(debugItemTransform.slide);
          if (model.userData.is25D) {
            updateVoxelCurve(model as THREE.Group, debugItemTransform.curveX || 0, debugItemTransform.curveY || 0);
          }
          appliedTransform = true;
        } else if (item.modelTransforms && Object.keys(item.modelTransforms).length > 0) {
          const t = resolveModelTransform(item, config.gender, config.handedness, false) || item.modelTransforms.common || (Object.values(item.modelTransforms)[0] as any);
          applyItemScale(model, t.scale ?? defaultHeadScale, t.thickness ?? 1);
          model.position.set(t.posX, t.posY, t.posZ);
          model.rotation.set(t.rotX, t.rotY, t.rotZ);
          model.position.y = t.posY;
          model.translateY(t.slide);
          if (model.userData.is25D) {
            updateVoxelCurve(model as THREE.Group, t.curveX || 0, t.curveY || 0);
          }
          appliedTransform = true;
        }
        
        if (!appliedTransform) {
          if (item.minecraftHeadValue) {
            model.position.set(0, 4, 0); // Minecraft texture boxes sit at Y=4
          } else {
            model.position.set(0, 0, 0); // GLB heads sit at Y=0
            model.rotation.set(0, Math.PI, 0); // GLB heads need 180 flip
          }
        }
      } else if (avatarPart === 'body') {
        let appliedTransform = false;
        const isTargetDebugItem = debugItemId === itemId;
        if (debugItemTransform && isTargetDebugItem) {
          applyItemScale(model, debugItemTransform.scale ?? 16, debugItemTransform.thickness ?? 1);
          model.position.set(debugItemTransform.posX, debugItemTransform.posY, debugItemTransform.posZ);
          model.rotation.set(debugItemTransform.rotX, debugItemTransform.rotY, debugItemTransform.rotZ);
          model.position.y = debugItemTransform.posY;
          model.translateY(debugItemTransform.slide);
          if (model.userData.is25D) {
            updateVoxelCurve(model as THREE.Group, debugItemTransform.curveX || 0, debugItemTransform.curveY || 0);
          }
          appliedTransform = true;
        } else if (item.modelTransforms && Object.keys(item.modelTransforms).length > 0) {
          const t = resolveModelTransform(item, config.gender, config.handedness, false) || item.modelTransforms.common || (Object.values(item.modelTransforms)[0] as any);
          model.position.set(t.posX, t.posY, t.posZ);
          model.rotation.set(t.rotX, t.rotY, t.rotZ);
          model.position.y = t.posY;
          model.translateY(t.slide);
          if (model.userData.is25D) {
            updateVoxelCurve(model as THREE.Group, t.curveX || 0, t.curveY || 0);
          }
          appliedTransform = true;
        }
        
        if (!appliedTransform) {
          model.position.set(0, -6, 0);
          model.rotation.set(0, Math.PI, 0); // Girar 180 graus (frente para trás)
        }
      } else if (avatarPart === 'legs' || avatarPart === 'feet') {
        const isTargetDebugItem = debugItemId === itemId;
        if (debugItemTransform && isTargetDebugItem) {
          applyItemScale(model, debugItemTransform.scale ?? 16, debugItemTransform.thickness ?? 1);
          model.position.set(debugItemTransform.posX, debugItemTransform.posY, debugItemTransform.posZ);
          
          let baseRotY = 0; // O modelo GLB exportado pelo Blockbench já está virado para a frente (0 graus)
          model.rotation.set(debugItemTransform.rotX, debugItemTransform.rotY + baseRotY, debugItemTransform.rotZ);
          model.translateY(debugItemTransform.slide);
          if (model.userData.is25D) {
            updateVoxelCurve(model as THREE.Group, debugItemTransform.curveX || 0, debugItemTransform.curveY || 0);
          }
        } else if (item.modelTransforms && Object.keys(item.modelTransforms).length > 0) {
          const t = resolveModelTransform(item, config.gender, config.handedness, false) || item.modelTransforms.common || (Object.values(item.modelTransforms)[0] as any);
          applyItemScale(model, t.scale ?? 16, t.thickness ?? 1);
          model.position.set(t.posX, t.posY, t.posZ);
          
          let baseRotY = 0; // O modelo GLB exportado pelo Blockbench já está virado para a frente (0 graus)
          model.rotation.set(t.rotX, t.rotY + baseRotY, t.rotZ);
          model.translateY(t.slide);
          if (model.userData.is25D) {
            updateVoxelCurve(model as THREE.Group, t.curveX || 0, t.curveY || 0);
          }
        }
      }
    });
  }, [debugTransformJson, debugItemId, animation, config?.handedness, modelsLoadedCount, equippedItemsJson, config?.hiddenSlots?.join(','), ignoreHiddenSlots]);

  // 3c. Add 3D Head Addons (Ponytail, Bow, etc)
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !viewer.playerObject) return;

    // Ao visualizar uma skin completa (hideConfigAddons), não gerar cabelo/acessórios 3D do config
    if (hideConfigAddons) return;

    if (customHairRef.current) {
      viewer.playerObject.skin.head.remove(customHairRef.current);
      customHairRef.current = null;
    }

    const hasHelmet = equippedItems.some(i => i.avatarPart === 'head' && (ignoreHiddenSlots || !config?.hiddenSlots?.includes('head')));
    if (hasHelmet) return;

    const addonsGroup = new THREE.Group();
    let hasAddons = false;

    if (config?.hairStyle === 'ponytail') {
      const hairColor = config.hairColor || '#4a3000';
      const hairMaterial = new THREE.MeshBasicMaterial({ color: hairColor });
      
      const tieColor = config.hairTieColor || config.shirtColor || '#d63074';
      const tieMaterial = new THREE.MeshBasicMaterial({ color: tieColor });

      const length = config?.ponytailLength ?? 7;
      const thickness = config?.ponytailThickness ?? 3.5;
      const angle = (config?.ponytailAngle ?? 15) * (Math.PI / 180);

      // Cabelo
      const tailGeo = new THREE.BoxGeometry(thickness, length, thickness - 1);
      const tailMesh = new THREE.Mesh(tailGeo, hairMaterial);
      
      // Ajuste para ficar preso atrás da cabeça e cair nas costas
      tailMesh.position.set(0, - (length / 2), -5.25); 
      tailMesh.rotation.x = angle;

      // Laço
      const tieGeo = new THREE.BoxGeometry(thickness + 1, 1.5, thickness);
      const tieMesh = new THREE.Mesh(tieGeo, tieMaterial);
      tieMesh.position.set(0, 0, -4.5);
      tieMesh.rotation.x = angle;

      addonsGroup.add(tailMesh);
      addonsGroup.add(tieMesh);
      hasAddons = true;
    }

    if (config?.hairStyle === 'spiky') {
      const hairColor = config.hairColor || '#4a3000';
      const hairMaterial = new THREE.MeshBasicMaterial({ color: hairColor });
      
      const createSpike = (x: number, y: number, z: number, rotX: number, rotZ: number, scale = 1) => {
          // ConeGeometry com 4 lados forma uma pirâmide perfeita (Minecraft style)
          const spikeGeo = new THREE.ConeGeometry(1.6 * scale, 3.5 * scale, 4);
          const spikeMesh = new THREE.Mesh(spikeGeo, hairMaterial);
          spikeMesh.position.set(x, y, z);
          // Math.PI / 4 no eixo Y alinha a base quadrada da pirâmide com a grade da cabeça
          spikeMesh.rotation.set(rotX, Math.PI / 4, rotZ); 
          return spikeMesh;
      };

      // O topo da cabeça é Y=8. Como o centro da pirâmide fica no meio da altura,
      // um Y=8.5 afunda a base da pirâmide no topo da cabeça, evitando buracos.

      // Espinho Central (maior, apontando reto)
      addonsGroup.add(createSpike(0, 9.2, 0, 0, 0, 1.3));
      
      // Espinhos Frontais (inclinados para frente -> rotX negativo)
      addonsGroup.add(createSpike(-2, 8.5, 2.5, -0.4, 0.3, 0.9));
      addonsGroup.add(createSpike(2, 8.5, 2.5, -0.4, -0.3, 1.0));
      addonsGroup.add(createSpike(0, 8.5, 3.5, -0.6, 0, 0.8)); // Franja espetada
      
      // Espinhos Traseiros (inclinados para trás -> rotX positivo)
      addonsGroup.add(createSpike(-2.5, 8.5, -2.5, 0.4, 0.3, 0.8));
      addonsGroup.add(createSpike(2.5, 8.5, -2.5, 0.4, -0.3, 0.9));
      addonsGroup.add(createSpike(0, 8.3, -3.5, 0.6, 0, 0.7));
      
      // Espinhos Laterais (inclinados para os lados -> rotZ)
      addonsGroup.add(createSpike(-3.5, 8.3, 0, 0, 0.6, 0.8));
      addonsGroup.add(createSpike(3.5, 8.3, 0, 0, -0.6, 0.8));
      
      hasAddons = true;
    }
    
    if (config?.hairStyle === 'long') {
      const hairColor = config.hairColor || '#4a3000';
      const hairMaterial = new THREE.MeshBasicMaterial({ color: hairColor });
      
      // Cabelo volumoso caindo nas costas
      const backGeo = new THREE.BoxGeometry(8.5, 12, 1.5);
      const backMesh = new THREE.Mesh(backGeo, hairMaterial);
      // Fica pendurado atrás da cabeça (Z=-4.2), descendo até as costas (Y=-2)
      backMesh.position.set(0, -2, -4.2); 
      backMesh.rotation.x = 0.08; // Leve inclinação para trás para evitar clipar nas costas do corpo
      addonsGroup.add(backMesh);
      
      // Mecha caindo no ombro esquerdo (perspectiva do personagem)
      const leftFrontGeo = new THREE.BoxGeometry(2.5, 12, 1.5);
      const leftFrontMesh = new THREE.Mesh(leftFrontGeo, hairMaterial);
      leftFrontMesh.position.set(-4.5, -2, 1);
      leftFrontMesh.rotation.x = -0.05; // Leve inclinação para frente
      leftFrontMesh.rotation.z = 0.08;  // Leve inclinação para fora (longe do pescoço)
      addonsGroup.add(leftFrontMesh);
      
      // Mecha caindo no ombro direito (perspectiva do personagem)
      const rightFrontGeo = new THREE.BoxGeometry(2.5, 12, 1.5);
      const rightFrontMesh = new THREE.Mesh(rightFrontGeo, hairMaterial);
      rightFrontMesh.position.set(4.5, -2, 1);
      rightFrontMesh.rotation.x = -0.05;
      rightFrontMesh.rotation.z = -0.08;
      addonsGroup.add(rightFrontMesh);
      
      hasAddons = true;
    }

    const accsToRender = config?.hairAccessories || [config?.hairAccessory || 'none'];
    const fallbackColor = config?.accessoryColor || '#ff0000';
    
    accsToRender.forEach((acc, index) => {
        if (acc === 'bow') {
            const accColor = config?.accessoryColors?.[index] || fallbackColor;
            const bowMaterial = new THREE.MeshBasicMaterial({ color: accColor });
            
            const loopGeo = new THREE.BoxGeometry(1.6, 1.6, 0.4);
            const knotGeo = new THREE.BoxGeometry(0.8, 0.8, 0.6);
            
            const leftLoop = new THREE.Mesh(loopGeo, bowMaterial);
            leftLoop.position.set(-1, 0, 0);
            leftLoop.rotation.z = Math.PI / 8;
            
            const rightLoop = new THREE.Mesh(loopGeo, bowMaterial);
            rightLoop.position.set(1, 0, 0);
            rightLoop.rotation.z = -Math.PI / 8;
            
            const knot = new THREE.Mesh(knotGeo, bowMaterial);
            knot.position.set(0, 0, 0.1);
            
            const bowGroup = new THREE.Group();
            bowGroup.add(leftLoop);
            bowGroup.add(rightLoop);
            bowGroup.add(knot);
            
            // Posição no topo da cabeça à direita (perspectiva do personagem)
            // A camada "chapéu" (cabelo) vai até ~Y=8.5, X=-4.5 e Z=4.5
            bowGroup.position.set(-3.5, 8.4, 4.6);
            bowGroup.rotation.x = -Math.PI / 10;
            bowGroup.rotation.y = -Math.PI / 8;
            bowGroup.rotation.z = Math.PI / 12;

            addonsGroup.add(bowGroup);
            hasAddons = true;
        } else if (acc === 'flower') {
            const accColor = config?.accessoryColors?.[index] || fallbackColor;
            const flowerGroup = new THREE.Group();
            
            const petalMat = new THREE.MeshBasicMaterial({ color: accColor });
            const centerMat = new THREE.MeshBasicMaterial({ color: '#f1c40f' });
            
            const petalGeo = new THREE.BoxGeometry(2, 2, 0.4);
            const centerGeo = new THREE.BoxGeometry(1, 1, 0.6);
            
            const petals = new THREE.Mesh(petalGeo, petalMat);
            const center = new THREE.Mesh(centerGeo, centerMat);
            center.position.set(0, 0, 0.1);
            
            flowerGroup.add(petals);
            flowerGroup.add(center);
            
            flowerGroup.position.set(-3.5, 8.4, 4.6);
            flowerGroup.rotation.x = -Math.PI / 10;
            flowerGroup.rotation.y = -Math.PI / 8;
            flowerGroup.rotation.z = Math.PI / 12;

            addonsGroup.add(flowerGroup);
            hasAddons = true;
        } else if (acc === 'headband') {
            const accColor = config?.accessoryColors?.[index] || fallbackColor;
            const headbandGroup = new THREE.Group();
            
            const mat = new THREE.MeshBasicMaterial({ color: accColor });
            
            // A cabeça e camada de cabelo chegam até ~Y=8.5 e X/Z=±4.5
            const topGeo = new THREE.BoxGeometry(9.4, 0.4, 1.5);
            const sideGeo = new THREE.BoxGeometry(0.4, 5, 1.5);
            
            const top = new THREE.Mesh(topGeo, mat);
            top.position.set(0, 8.7, 1);
            
            const leftSide = new THREE.Mesh(sideGeo, mat);
            leftSide.position.set(-4.5, 6.4, 1);
            
            const rightSide = new THREE.Mesh(sideGeo, mat);
            rightSide.position.set(4.5, 6.4, 1);
            
            headbandGroup.add(top);
            headbandGroup.add(leftSide);
            headbandGroup.add(rightSide);
            
            addonsGroup.add(headbandGroup);
            hasAddons = true;
        }
    });

    if (hasAddons) {
      viewer.playerObject.skin.head.add(addonsGroup);
      customHairRef.current = addonsGroup;
    }
  }, [config?.hairStyle, config?.hairColor, config?.hairTieColor, config?.shirtColor, config?.ponytailLength, config?.ponytailThickness, config?.ponytailAngle, config?.hairAccessories, config?.hairAccessory, config?.accessoryColor, config?.accessoryColors, equippedItemsJson, config?.hiddenSlots?.join(','), hideConfigAddons, ignoreHiddenSlots]);

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
                    sad: { base: finalUrl, blink: finalUrl },
                    happy: { base: finalUrl, blink: finalUrl },
                    smile: { base: finalUrl, blink: finalUrl }
                });
            } else {
                const eyeMode = closedEyes !== 'none' ? closedEyes : undefined;
                const normalUrl = await generateMinecraftSkinUrl(config, false, eyeMode);
                const normalBlinkUrl = await generateMinecraftSkinUrl(config, true, eyeMode);

                const happyConfig = { ...config, mouthStyle: 'smile' as any };
                const happyUrl = await generateMinecraftSkinUrl(happyConfig, false, eyeMode);
                const happyBlinkUrl = await generateMinecraftSkinUrl(happyConfig, true, eyeMode);
                
                const seriousConfig = { ...config, mouthStyle: 'neutral' as any };
                const seriousUrl = await generateMinecraftSkinUrl(seriousConfig, false, eyeMode);
                const seriousBlinkUrl = await generateMinecraftSkinUrl(seriousConfig, true, eyeMode);

                const sadConfig = { ...config, mouthStyle: 'sad' as any };
                const sadUrl = await generateMinecraftSkinUrl(sadConfig, false, eyeMode);
                const sadBlinkUrl = await generateMinecraftSkinUrl(sadConfig, true, eyeMode);
                
                if (isMounted) {
                    setSkinUrls({ 
                        normal: { base: normalUrl, blink: normalBlinkUrl },
                        happy: { base: happyUrl, blink: happyBlinkUrl },
                        smile: { base: happyUrl, blink: happyBlinkUrl },
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, closedEyes]);

  // Handle Skin Application & Blinking
  useEffect(() => {
      if (!viewerRef.current || !skinUrls) return;
      let isMounted = true;
      let blinkInterval: any;
      let blinkTimeout: any;
      // Com olhos controlados manualmente, desativa a piscada automática
      const closedOverride = closedEyes !== 'none';

      const applySkins = async () => {
          const modelType = config.gender === 'female' ? 'slim' : 'default';

          const forceNearestFilter = () => {
              if (viewerRef.current?.playerObject) {
                  viewerRef.current.playerObject.traverse((child) => {
                      if ((child as THREE.Mesh).isMesh) {
                          const mesh = child as THREE.Mesh;
                          if (mesh.material) {
                              const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
                              mats.forEach((m: any) => {
                                  if (m.map) {
                                      m.map.magFilter = THREE.NearestFilter;
                                      m.map.minFilter = THREE.NearestFilter;
                                      m.map.needsUpdate = true;
                                  }
                              });
                          }
                      }
                  });
              }
          };

          if (animation === 'hurt') {
              await viewerRef.current!.loadSkin(skinUrls.sad.blink, { model: modelType });
              forceNearestFilter();
          } else {
              const activeUrls = skinUrls[expression] || skinUrls.normal;
              await viewerRef.current!.loadSkin(activeUrls.base, { model: modelType });
              forceNearestFilter();
              
              if (!isMounted) return;
              
              if (!closedOverride) {
                blinkInterval = setInterval(() => {
                    if (!viewerRef.current || !isMounted) return;
                    if (activeUrls.blink === activeUrls.base) return; 
                    viewerRef.current.loadSkin(activeUrls.blink, { model: modelType }).then(forceNearestFilter).catch(() => {});
                    
                    blinkTimeout = setTimeout(() => {
                        if (viewerRef.current && isMounted) {
                            viewerRef.current.loadSkin(activeUrls.base, { model: modelType }).then(forceNearestFilter).catch(() => {});
                        }
                    }, 150);
                }, 3500 + Math.random() * 2000);
              }
          }
      };

      applySkins().catch(() => {});

      return () => {
          isMounted = false;
          if (blinkInterval) clearInterval(blinkInterval);
          if (blinkTimeout) clearTimeout(blinkTimeout);
      };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skinUrls, animation === 'hurt', expression, equippedItemsJson, closedEyes]);

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

    const applyPose = (player: any, pose: CharacterPose) => {
        if (pose.head) { player.skin.head.rotation.x = pose.head.rx; player.skin.head.rotation.y = pose.head.ry; player.skin.head.rotation.z = pose.head.rz; }
        if (pose.body) { player.skin.body.rotation.x = pose.body.rx; player.skin.body.rotation.y = pose.body.ry; player.skin.body.rotation.z = pose.body.rz; }
        if (pose.leftArm) { player.skin.leftArm.rotation.x = pose.leftArm.rx; player.skin.leftArm.rotation.y = pose.leftArm.ry; player.skin.leftArm.rotation.z = pose.leftArm.rz; }
        if (pose.rightArm) { player.skin.rightArm.rotation.x = pose.rightArm.rx; player.skin.rightArm.rotation.y = pose.rightArm.ry; player.skin.rightArm.rotation.z = pose.rightArm.rz; }
        if (pose.leftLeg) { player.skin.leftLeg.rotation.x = pose.leftLeg.rx; player.skin.leftLeg.rotation.y = pose.leftLeg.ry; player.skin.leftLeg.rotation.z = pose.leftLeg.rz; }
        if (pose.rightLeg) { player.skin.rightLeg.rotation.x = pose.rightLeg.rx; player.skin.rightLeg.rotation.y = pose.rightLeg.ry; player.skin.rightLeg.rotation.z = pose.rightLeg.rz; }
        if (typeof pose.yaw === 'number') { player.rotation.y = pose.yaw; }
    };

    const applyInterpolatedPose = (player: any, frames: CharacterPose[], time: number, durationPerFrame: number = 0.5) => {
        if (frames.length === 1) {
            applyPose(player, frames[0]);
            return;
        }
        
        const frameDuration = durationPerFrame;
        const totalDuration = frames.length * frameDuration;
        const loopedTime = time % totalDuration;
        const currentFrameIdx = Math.floor(loopedTime / frameDuration);
        const nextFrameIdx = (currentFrameIdx + 1) % frames.length;
        const progress = (loopedTime % frameDuration) / frameDuration;
        
        const f1 = frames[currentFrameIdx];
        const f2 = frames[nextFrameIdx];
        
        const lerp = (v1: number = 0, v2: number = 0, t: number) => v1 + (v2 - v1) * t;
        const lerpBone = (b1?: BoneTransform, b2?: BoneTransform) => ({
            rx: lerp(b1?.rx, b2?.rx, progress),
            ry: lerp(b1?.ry, b2?.ry, progress),
            rz: lerp(b1?.rz, b2?.rz, progress),
        });

        const interpolatedPose: CharacterPose = {
            head: lerpBone(f1.head, f2.head),
            body: lerpBone(f1.body, f2.body),
            leftArm: lerpBone(f1.leftArm, f2.leftArm),
            rightArm: lerpBone(f1.rightArm, f2.rightArm),
            leftLeg: lerpBone(f1.leftLeg, f2.leftLeg),
            rightLeg: lerpBone(f1.rightLeg, f2.rightLeg),
            yaw: lerp(f1.yaw, f2.yaw, progress),
        };
        applyPose(player, interpolatedPose);
    };

    // Itens com animação própria, classificados por uso em batalha:
    //   - arma de ataque: itemCategory 'attack' OU avatarPart de mão (hand/two_handed/rightHand/leftHand)
    //   - escudo de defesa: itemCategory 'defense'
    const isAttackAnim = animation === 'attack' || animation === 'attack-fatal' || animation === 'attack-fatal-slow';
    const isHurtAnim = animation === 'hurt' || animation === 'exhausted';
    const isAttackItem = (i: EquippedItem) =>
      !!i.customAnimation && i.customAnimation.frames.length > 0 &&
      (i.itemCategory === 'attack' ||
        (i.itemCategory !== 'defense' && (i.avatarPart === 'hand' || i.avatarPart === 'two_handed' || i.avatarPart === 'rightHand' || i.avatarPart === 'leftHand')));
    const isDefenseItem = (i: EquippedItem) =>
      !!i.customAnimation && i.customAnimation.frames.length > 0 &&
      i.itemCategory === 'defense';

    // Animação do item relevante para a ação atual (arma no ataque; escudo no dano)
    const battleItemAnim =
      isAttackAnim ? equippedItems.find(isAttackItem)?.customAnimation :
      isHurtAnim ? equippedItems.find(isDefenseItem)?.customAnimation :
      undefined;
    const hasCustomBattleAnim = !!battleItemAnim;

    if (debugAnimationFrames && debugAnimationFrames.length > 0 && debugPreviewAnim) {
      viewerRef.current.animation = new FunctionAnimation((player: any, time: number) => {
          applyInterpolatedPose(player, debugAnimationFrames, time, debugAnimationDuration ?? 0.5);
          // Sobrescreve os membros tocados pelo usuário (sliders), mantendo a
          // animação base nos demais membros — permite "combinar" a ação com
          // braços/pernas/cabeça/tronco ajustados ao vivo.
          if (debugPose && Object.keys(debugPose).length > 0) {
            applyPose(player, debugPose);
          }
      });
      return;
    } else if (debugPose && Object.keys(debugPose).length > 0) {
      viewerRef.current.animation = new FunctionAnimation((player: any) => {
          applyPose(player, debugPose);
      });
      return;
    } else if (debugAnimationFrames && debugAnimationFrames.length > 0) {
      // Modo edição (sem preview): mostra o primeiro frame estático
      viewerRef.current.animation = new FunctionAnimation((player: any) => {
          applyPose(player, debugAnimationFrames[0]);
      });
      return;
    } else if (hasCustomBattleAnim && battleItemAnim) {
      // Animação atrelada ao item (arma no ataque / escudo no dano) tem prioridade
      viewerRef.current.animation = new FunctionAnimation((player: any, time: number) => {
        if (faceCamera && isAttackAnim) {
          player.rotation.y = 0;
        }
        applyInterpolatedPose(player, battleItemAnim.frames, time);
      });
      return;
    }

    // Poses customizadas que substituem as ações base (Parado/Andando/Correndo/Luta)
    // Aplicam quando NÃO existe animação de item relevante para a ação atual.
    const actionKey = animation?.startsWith('attack') ? 'attack' : animation as 'idle' | 'walk' | 'run' | 'attack';
    const customActionPose = actionPoses && actionKey ? actionPoses[actionKey] : undefined;
    if (customActionPose && Object.keys(customActionPose).length > 0) {
      viewerRef.current.animation = new FunctionAnimation((player: any) => {
        if (faceCamera && actionKey === 'attack') {
          player.rotation.y = 0;
        }
        applyPose(player, customActionPose);
      });
      return;
    }

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
    } else if (animation?.startsWith('victory-')) {
      viewerRef.current.animation = new FunctionAnimation((player: any, time: number) => {
        const targetRotation = role === 'player' ? Math.PI / 2 : -Math.PI / 2;
        let currentBodyRot = targetRotation;
        let headRotY = 0;
        let headRotX = 0;
        
        const isDeathFall = animation.includes('death-fall');

        if (isDeathFall) {
            // Morte: Queda Lenta (Cai como uma árvore)
            // Jogador vira rápido para a câmera e olha para o chão aos seus pés
            if (time < 0.5) {
                currentBodyRot = targetRotation * (1.0 - (time / 0.5)); // Giro rápido
                headRotX = (time / 0.5) * 1.0; // Abaixa rápido
            } else if (time < 3.5) {
                currentBodyRot = 0; // Encarando a tela
                headRotX = 1.0; // Olhando para os pés
            } else if (time < 4.5) {
                currentBodyRot = 0;
                headRotX = 1.0 * (1 - ((time - 3.5) / 1.0)); // Levanta a cabeça
            } else {
                currentBodyRot = 0;
                headRotX = 0;
            }
            headRotY = 0;
        } else {
            // Outras mortes (Evaporar, Explodir, Cortar ao meio)
            // Monstro morre na frente. Jogador continua virado para o lado.
            if (time < 3.5) {
                currentBodyRot = targetRotation;
                headRotY = 0; // Cabeça reta (na direção do monstro)
                headRotX = Math.sin(time * 3) * 0.05; // Apenas um movimento sutil de respiração com a cabeça
            } else if (time < 4.5) {
                // Entre 3.5 e 4.5s, dá o pivô para a câmera
                const pivotProgress = (time - 3.5) / 1.0;
                currentBodyRot = targetRotation * (1 - pivotProgress);
                headRotY = 0; 
                headRotX = 0; // Mantém a cabeça reta enquanto gira

                // Passinhos
                player.skin.leftLeg.rotation.x = Math.sin(pivotProgress * Math.PI * 4) * 0.3;
                player.skin.rightLeg.rotation.x = -Math.sin(pivotProgress * Math.PI * 4) * 0.3;
                player.position.y = Math.sin(pivotProgress * Math.PI * 4) * 2;
            } else {
                currentBodyRot = 0;
                headRotY = 0;
                headRotX = 0;
            }
        }

        player.rotation.y = currentBodyRot;
        player.skin.head.rotation.y = headRotY;
        player.skin.head.rotation.x = headRotX;
        player.skin.head.rotation.z = 0;

        // Fase de Apreensão (Idle dramático) nos primeiros 4.5s
        if (time < 4.5) {
          if (time < 3.5) {
              player.position.y = Math.sin(time * 3) * 1; // Respiração normal antes do pivô
              player.skin.leftLeg.rotation.x = 0;
              player.skin.rightLeg.rotation.x = 0;
          }
          player.skin.leftArm.rotation.x = Math.sin(time * 3) * 0.1;
          player.skin.rightArm.rotation.x = -Math.sin(time * 3) * 0.1;
          player.skin.leftArm.rotation.z = 0;
          player.skin.rightArm.rotation.z = 0;
          player.skin.leftLeg.rotation.z = -0.1;
          player.skin.rightLeg.rotation.z = 0.1;
          return;
        }

        const cheerTime = time - 4.5;

        if (animation.startsWith('victory-easy')) {
          // Vitória Fácil: Cruza os braços confiante e acena com a cabeça
          player.skin.leftArm.rotation.x = -Math.PI / 2.5;
          player.skin.leftArm.rotation.z = 0.5;
          player.skin.rightArm.rotation.x = -Math.PI / 2.5;
          player.skin.rightArm.rotation.z = -0.5;
          player.skin.head.rotation.x = Math.sin(cheerTime * 2) * 0.1 + 0.1;
          player.position.y = Math.sin(time * 3) * 1;
        } else if (animation.startsWith('victory-mid')) {
          // Vitória Média: Pulos vibrantes
          player.position.y = Math.abs(Math.sin(cheerTime * 8)) * 8;
          player.skin.leftArm.rotation.x = Math.PI;
          player.skin.rightArm.rotation.x = Math.PI;
          player.skin.leftArm.rotation.z = 0.2 + Math.sin(cheerTime * 15) * 0.2;
          player.skin.rightArm.rotation.z = -0.2 - Math.sin(cheerTime * 15) * 0.2;
          player.skin.leftLeg.rotation.x = -0.2;
          player.skin.rightLeg.rotation.x = 0.2;
          player.skin.head.rotation.x = -0.2;
        } else if (animation.startsWith('victory-hard')) {
          // Vitória Difícil: Arfando muito, levanta a mão com esforço
          player.position.y = Math.sin(cheerTime * 6) * 2;
          player.skin.head.rotation.x = 0.3 + Math.sin(cheerTime * 6) * 0.1;
          
          if (cheerTime > 1.0) {
            // Levanta a mão direita meio fraca
            const lift = Math.min(1, (cheerTime - 1.0) * 2);
            player.skin.rightArm.rotation.x = Math.PI * 0.8 * lift;
            player.skin.rightArm.rotation.z = -0.2 * lift;
          } else {
            player.skin.rightArm.rotation.x = 0.2;
            player.skin.rightArm.rotation.z = 0;
          }
          player.skin.leftArm.rotation.x = 0.2;
          player.skin.leftArm.rotation.z = 0.1;
          player.skin.leftLeg.rotation.x = 0;
          player.skin.rightLeg.rotation.x = 0;
        }
      });
    } else if (animation === 'raise-hand') {
      viewerRef.current.animation = new FunctionAnimation((player: any, time: number) => {
        const isLeftHanded = config?.handedness === 'left';
        const raisedArm = isLeftHanded ? player.skin.leftArm : player.skin.rightArm;
        const otherArm = isLeftHanded ? player.skin.rightArm : player.skin.leftArm;
        
        // Braço dominante levanta (exibindo a mão)
        raisedArm.rotation.x = -Math.PI / 1.2;
        raisedArm.rotation.z = isLeftHanded ? 0.2 : -0.2;
        
        // Braço secundário fica normal
        otherArm.rotation.x = 0;
        otherArm.rotation.z = 0;
        
        // Leve movimento de respiração
        player.position.y = Math.sin(time * 3) * 1;
      });
    } else if (animation?.startsWith('attack')) {
      viewerRef.current.animation = new FunctionAnimation((player: any, time: number) => {
        // Encarar o oponente (de lado na batalha; de frente na edição/ranking quando faceCamera)
        player.rotation.y = faceCamera ? 0 : targetRotation;
        // Manter a cabeça reta (evita que fique torta de animações anteriores)
        player.skin.head.rotation.x = 0;
        player.skin.head.rotation.y = 0;
        player.skin.head.rotation.z = 0;
        
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
            // Movimento de ataque com braço da arma e pequeno avanço
            let swingValue = 0;
            let lungeValue = 0;

            if (animation === 'attack-fatal-slow') {
                const strikeTime = time - 1.125;
                const progress = Math.min(strikeTime / 0.6, 1.0); // O golpe de descer a espada leva 0.6s
                const easeOut = Math.sin(progress * Math.PI / 2); // Começa rápido e termina devagar (câmera lenta)
                
                // Interpola de -Math.PI/1.5 (braço erguido) até Math.PI/3 (espada cravada embaixo)
                swingValue = -Math.PI / 1.5 + (easeOut * (Math.PI / 1.5 + Math.PI / 3));
                lungeValue = easeOut * 3; // Corpo avança e segura a pose
            } else {
                const swingSpeed = 15;
                const startTime = animation === 'attack-fatal' ? 0.225 : 0.48;
                swingValue = Math.sin((time - startTime) * swingSpeed) * 2;
                lungeValue = Math.sin((time - startTime) * 10) * 2;
            }

            attackArm.rotation.x = swingValue;
            if (hasTwoHanded) {
                nonAttackArm.rotation.x = swingValue;
                // Mantém o grip (ângulo da pose de duas mãos) durante o golpe
                attackArm.rotation.y = (isLeftHanded ? Math.PI / 6 : -Math.PI / 6);
                attackArm.rotation.z = (isLeftHanded ? Math.PI / 12 : -Math.PI / 12);
                nonAttackArm.rotation.y = (isLeftHanded ? -Math.PI / 3 : Math.PI / 3);
                nonAttackArm.rotation.z = (isLeftHanded ? -Math.PI / 8 : Math.PI / 8);
            }
            player.position.z = lungeValue;
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
        
        const fall = Math.min(time * 1.5, Math.PI / 2); // Mais lento (antes era 3)
        player.rotation.x = -fall;
        player.position.y = -fall * 10;
        player.position.z = -fall * 5;
        player.skin.leftArm.rotation.z = fall * 0.5;
        player.skin.rightArm.rotation.z = -fall * 0.5;
      });
    } else if (animation === 'death-explode') {
      viewerRef.current.animation = new FunctionAnimation((player: any, time: number) => {
        const scatter = Math.min(time * 3, 30); // Mais lento (antes era 8)
        player.skin.head.position.y = 8 + scatter * 1.5;
        player.skin.head.rotation.y = time * 2; // Mais lento
        
        player.skin.leftArm.position.x = -6 - scatter;
        player.skin.leftArm.position.y = 4 + scatter * 0.5;
        player.skin.leftArm.rotation.z = time * -4;

        player.skin.rightArm.position.x = 6 + scatter;
        player.skin.rightArm.position.y = 4 + scatter * 0.5;
        player.skin.rightArm.rotation.z = time * 4;

        player.skin.leftLeg.position.x = -2 - scatter * 0.5;
        player.skin.leftLeg.position.y = -4 - scatter;
        player.skin.leftLeg.rotation.x = time * -2;

        player.skin.rightLeg.position.x = 2 + scatter * 0.5;
        player.skin.rightLeg.position.y = -4 - scatter;
        player.skin.rightLeg.rotation.x = time * 2;

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
  }, [animation, config?.handedness, equippedItemsJson, JSON.stringify(debugPose), JSON.stringify(debugAnimationFrames), debugPreviewAnim, debugAnimationDuration]);
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

  const isLeftHanded = config?.handedness === 'left';
  const ALL_SLOTS = [
    { id: 'head', label: 'Elmo / Cabeça', pos: { top: '-12%', left: '50%', transform: 'translateX(-50%)' } },
    { id: 'face', label: 'Rosto / Óculos', pos: { top: '5%', right: '-35%' } },
    { id: 'accessory', label: 'Acessório', pos: { top: '5%', left: '-35%' } },
    { id: 'hand1', label: isLeftHanded ? 'Arma Principal (Mão Esquerda)' : 'Secundária / Escudo (Mão Esquerda)', pos: { top: '40%', right: '-50%', transform: 'translateY(-50%)' } },
    { id: 'hand2', label: isLeftHanded ? 'Secundária / Escudo (Mão Direita)' : 'Arma Principal (Mão Direita)', pos: { top: '40%', left: '-50%', transform: 'translateY(-50%)' } },
    { id: 'body', label: 'Armadura / Corpo', pos: { bottom: '20%', right: '-40%' } },
    { id: 'legs', label: 'Calças / Pernas', pos: { bottom: '20%', left: '-40%' } },
    { id: 'feet', label: 'Botas / Pés', pos: { bottom: '-5%', left: '50%', transform: 'translateX(-50%)' } },
  ];

  const getRarityStyle = (rarity?: string) => {
    const baseInset = 'inset 4px 4px 8px rgba(0,0,0,0.5), inset -2px -2px 4px rgba(255,255,255,0.1), 0 2px 4px rgba(0,0,0,0.1)';
    switch(rarity) {
      case 'common': return { border: '3px solid #9ca3af', boxShadow: `${baseInset}, 0 0 10px rgba(156, 163, 175, 0.4), inset 0 0 15px rgba(156, 163, 175, 0.2)` };
      case 'uncommon': return { border: '3px solid #10b981', boxShadow: `${baseInset}, 0 0 12px rgba(16, 185, 129, 0.5), inset 0 0 15px rgba(16, 185, 129, 0.3)` };
      case 'rare': return { border: '3px solid #3b82f6', boxShadow: `${baseInset}, 0 0 15px rgba(59, 130, 246, 0.6), inset 0 0 20px rgba(59, 130, 246, 0.4)` };
      case 'epic': return { border: '4px solid #8b5cf6', boxShadow: `${baseInset}, 0 0 20px rgba(139, 92, 246, 0.7), inset 0 0 25px rgba(139, 92, 246, 0.5)` };
      case 'legendary': return { border: '4px solid #f59e0b', boxShadow: `${baseInset}, 0 0 25px rgba(245, 158, 11, 0.9), inset 0 0 30px rgba(245, 158, 11, 0.7)` };
      default: return { border: '2px solid var(--border-glass)', boxShadow: baseInset };
    }
  };

if (config?.customModelUrl) {
  return <CustomModelViewer modelUrl={config.customModelUrl} textureUrl={config.customSkinUrl} animation={animation as any} size={size} role={role} interactive={interactive} zoom={config.customZoom} />;
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
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 1,
          outline: 'none',
          pointerEvents: 'auto',
          cursor: onAvatarClick ? 'pointer' : 'default'
        }} 
      />
      
      {/* Slider de Zoom Preciso */}
      {interactive && (
        <div style={{
          position: 'absolute',
          bottom: '10px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 200,
          background: 'rgba(30, 41, 59, 0.8)',
          padding: '6px 12px',
          borderRadius: '20px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          backdropFilter: 'blur(4px)',
          border: '1px solid rgba(255,255,255,0.1)'
        }}>
          <span style={{ fontSize: '14px' }}>🔍</span>
          <input 
            type="range" 
            min="0.3" 
            max="2.5" 
            step="0.05" 
            value={zoomLevel} 
            onChange={(e) => setZoomLevel(parseFloat(e.target.value))}
            style={{ width: '100px', accentColor: 'var(--accent-primary)', cursor: 'pointer' }}
            title="Ajustar Zoom"
          />
        </div>
      )}

      {/* Slots de Equipamento Externos */}
      {showSlots && ALL_SLOTS.map(slot => {
        const item = getEquippedForSlot(slot.id);
        const slotSize = slot.id === 'pet' ? size * 0.80 : size * 0.40;
        return (
          <div 
            key={slot.id} 
            onMouseEnter={() => setHoveredSlot(slot.id)}
            onMouseLeave={() => setHoveredSlot(null)}
            onClick={(e) => {
              e.stopPropagation();
              if (item) {
                if (window.matchMedia("(hover: none)").matches && hoveredSlot !== slot.id) {
                  setHoveredSlot(slot.id);
                } else {
                  setActiveMenuSlot(activeMenuSlot === slot.id ? null : slot.id);
                }
              } else {
                let category = 'Outros';
                if (['hand1'].includes(slot.id)) category = 'Ataque';
                if (['hand2', 'head', 'body', 'legs', 'feet'].includes(slot.id)) category = 'Defesa';
                sessionStorage.setItem('pendingCategory', category);
                window.dispatchEvent(new CustomEvent('select-inventory-tab', { detail: { category } }));
              }
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
            }}
            onDrop={(e) => {
              e.preventDefault();
              const itemId = e.dataTransfer.getData('text/plain');
              if (itemId) {
                window.dispatchEvent(new CustomEvent('equip-item', { detail: { itemId, targetSlot: slot.id } }));
              }
            }}
            style={{
              position: 'absolute',
              ...slot.pos,
              width: slotSize,
              height: slotSize,
              borderRadius: '50%',
              background: 'var(--bg-panel)',
              border: item ? getRarityStyle(item.rarity).border : '2px solid var(--border-glass)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: hoveredSlot === slot.id ? 100 : 10,
              boxShadow: item ? getRarityStyle(item.rarity).boxShadow : '0 2px 8px rgba(0,0,0,0.1)',
              overflow: 'visible',
              cursor: item && onSlotClick ? 'pointer' : 'default',
              backdropFilter: 'blur(6px)'
          }}>
            {/* Passive Hidden Indicator */}
            {!ignoreHiddenSlots && item && config?.hiddenSlots?.includes(slot.id) && (
              <div 
                title="Este item está oculto"
                style={{
                  position: 'absolute', top: -5, right: -5, background: 'var(--bg-card)', 
                  borderRadius: '50%', padding: '4px', zIndex: 110, 
                  border: '1px solid var(--border-glass)', display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}
              >
                <EyeOff size={14} color="#ef4444" />
              </div>
            )}

            {/* Submenu de Opções */}
            {activeMenuSlot === slot.id && item && (
              <div style={{
                position: 'absolute',
                top: '50%',
                left: '110%',
                transform: 'translateY(-50%)',
                background: 'var(--bg-card)',
                border: '1px solid var(--border-glass)',
                borderRadius: '8px',
                padding: '0.5rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
                zIndex: 200,
                boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                minWidth: '120px'
              }}>
                <button 
                  onClick={(e) => { e.stopPropagation(); setActiveMenuSlot(null); if(onSlotClick) onSlotClick(item); }}
                  style={{ background: 'var(--bg-dark)', border: 'none', color: 'var(--text-primary)', padding: '0.5rem', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                  className="hover-brightness"
                >
                  <PackageX size={16} color="var(--accent-red)" />
                  <span style={{ fontSize: '0.85rem' }}>Desequipar</span>
                </button>
                <button 
                  onClick={(e) => { e.stopPropagation(); setActiveMenuSlot(null); onToggleSlotVisibility?.(slot.id); }}
                  style={{ background: 'var(--bg-dark)', border: 'none', color: 'var(--text-primary)', padding: '0.5rem', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                  className="hover-brightness"
                >
                  {config?.hiddenSlots?.includes(slot.id) ? <Eye size={16} color="#10b981" /> : <EyeOff size={16} color="#ef4444" />}
                  <span style={{ fontSize: '0.85rem' }}>{config?.hiddenSlots?.includes(slot.id) ? "Mostrar" : "Ocultar"}</span>
                </button>
              </div>
            )}
            {/* Imagem do Item centralizada e cortada (hidden) num circulo interior para não quebrar a borda visivel caso coloquemos o tooltip por fora */}
            <div style={{ width: '100%', height: '100%', borderRadius: '50%', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: item ? '12%' : '0' }}>
                {item ? (
                  <img src={item.imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.6))' }} />
                ) : (
                  <div style={{ opacity: 1 }}>{getPlaceholderIcon(slot.id, '50%', isLeftHanded)}</div>
                )}
            </div>
            
            {/* Tooltip Estilo RPG */}
            {hoveredSlot === slot.id && (() => {
               const isBottomSlot = 'bottom' in slot.pos;
               return (
                 <div style={{
                   position: 'absolute',
                   ...(isBottomSlot
                     ? { bottom: '110%', top: 'auto' }
                     : { top: '110%', bottom: 'auto' }),
                   left: '50%',
                   transform: 'translateX(-50%) translateZ(30px)',
                   background: 'var(--bg-card)',
                   border: '1px solid var(--border-glass)',
                   borderRadius: '8px',
                   padding: '1rem',
                   width: 'max-content',
                   minWidth: '200px',
                   zIndex: 50,
                   boxShadow: '0 4px 20px rgba(0,0,0,0.8)',
                   WebkitFontSmoothing: 'antialiased',
                   pointerEvents: 'none',
                   color: 'var(--text-primary)',
                   textAlign: 'left'
                 }}>
                   {item ? (
                     <>
                       <h4 style={{ margin: '0 0 0.5rem 0', color: 'var(--gold-primary)' }}>{item.itemTitle || 'Item Desconhecido'}</h4>
                       
                       {item.baseAttributeType && item.baseAttributeType !== 'none' && ATTRIBUTE_LABELS[item.baseAttributeType] && (
                         <div style={{ marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--text-primary)' }}>
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
               );
             })()
            }
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
