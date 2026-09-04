import { useEffect, useRef, useState } from 'react';
import { X, Save, Play, Square, Plus, Undo2, Trash2, RotateCw, Download, Upload, Settings2 } from 'lucide-react';
import AvatarCharacter, { type CharacterPose, type AvatarConfig, type EquippedItem, type ModelTransform, type SpriteAnimation, getModelTransformKey } from './AvatarCharacter';
import { fetchSavedActions, saveSavedActions, fetchSavedPoses, saveSavedPoses, type SavedAction, type SavedPose } from '../lib/savedPoses';
import { supabase } from '../lib/supabase';
import { useTenant } from '../contexts/TenantContext';
import DirectUploadButton from './DirectUploadButton';

type PartKey = 'head' | 'body' | 'rightArm' | 'leftArm' | 'rightLeg' | 'leftLeg';
const MAX_FRAMES = 100;

// Posição (aproximada) de cada slider perto do membro correspondente,
// mais perto do boneco e fora da caixa de controles (direita).
// O slider do CORPO fica abaixo dos pés (mais deslocado) para não atrapalhar.
const SLIDER_POS: Record<PartKey, { top?: string; left: string; bottom?: string }> = {
  head: { top: '7%', left: '50%' },
  body: { left: '50%', bottom: '1.5%' },
  rightArm: { top: '26%', left: '62%' },
  leftArm: { top: '26%', left: '38%' },
  rightLeg: { top: '58%', left: '60%' },
  leftLeg: { top: '58%', left: '40%' },
};

// Sinais de direção por parte (corrigem espelhamento/inversão).
// v: vertical (rx, cima/baixo); h: horizontal (ry, esquerda/direita);
// t: lateral (rz — abre/fecha braços, afasta/aproxima pernas).
const SIGNS: Record<PartKey, { v: number; h: number; t: number }> = {
  head: { v: -1, h: 1, t: 1 },
  body: { v: -1, h: 1, t: 1 },
  rightArm: { v: 1, h: 1, t: 1 },
  leftArm: { v: 1, h: -1, t: -1 },
  rightLeg: { v: 1, h: 1, t: 1 },
  leftLeg: { v: 1, h: -1, t: -1 },
};

const PART_LABELS: Record<PartKey, string> = {
  head: 'Cabeça',
  body: 'Corpo',
  rightArm: 'Braço D',
  leftArm: 'Braço E',
  rightLeg: 'Perna D',
  leftLeg: 'Perna E',
};

const NEUTRAL: CharacterPose = {
  head: { rx: 0, ry: 0, rz: 0 },
  body: { rx: 0, ry: 0, rz: 0 },
  leftArm: { rx: 0, ry: 0, rz: 0 },
  rightArm: { rx: 0, ry: 0, rz: 0 },
  leftLeg: { rx: 0, ry: 0, rz: 0 },
  rightLeg: { rx: 0, ry: 0, rz: 0 },
  yaw: 0,
};

const clone = (p: CharacterPose): CharacterPose => JSON.parse(JSON.stringify(p));

const PRESETS: { name: string; frames: CharacterPose[] }[] = [
  { name: 'Idle', frames: [clone(NEUTRAL)] },
  {
    name: 'Pular',
    frames: [
      { ...clone(NEUTRAL), leftLeg: { rx: 0.6, ry: 0, rz: 0 }, rightLeg: { rx: 0.6, ry: 0, rz: 0 }, body: { rx: 0.15, ry: 0, rz: 0 } },
      { ...clone(NEUTRAL), leftLeg: { rx: -0.7, ry: 0, rz: 0 }, rightLeg: { rx: -0.7, ry: 0, rz: 0 }, leftArm: { rx: 1.4, ry: 0, rz: 0 }, rightArm: { rx: 1.4, ry: 0, rz: 0 } },
      { ...clone(NEUTRAL), leftLeg: { rx: 0.5, ry: 0, rz: 0 }, rightLeg: { rx: 0.5, ry: 0, rz: 0 } },
    ],
  },
  {
    name: 'Correr',
    frames: [
      { ...clone(NEUTRAL), leftLeg: { rx: -0.8, ry: 0, rz: 0 }, rightLeg: { rx: 0.8, ry: 0, rz: 0 }, leftArm: { rx: 0.8, ry: 0, rz: 0 }, rightArm: { rx: -0.8, ry: 0, rz: 0 }, body: { rx: 0.2, ry: 0, rz: 0 } },
      { ...clone(NEUTRAL) },
      { ...clone(NEUTRAL), leftLeg: { rx: 0.8, ry: 0, rz: 0 }, rightLeg: { rx: -0.8, ry: 0, rz: 0 }, leftArm: { rx: -0.8, ry: 0, rz: 0 }, rightArm: { rx: 0.8, ry: 0, rz: 0 }, body: { rx: 0.2, ry: 0, rz: 0 } },
      { ...clone(NEUTRAL) },
    ],
  },
  {
    name: 'Girar',
    frames: [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2, 2 * Math.PI].map(y => ({ ...clone(NEUTRAL), yaw: y })),
  },
  {
    name: 'Vencer',
    frames: [
      { ...clone(NEUTRAL), leftArm: { rx: -2.4, ry: 0, rz: 0.3 }, rightArm: { rx: -2.4, ry: 0, rz: -0.3 }, body: { rx: -0.1, ry: 0, rz: 0 } },
      { ...clone(NEUTRAL), leftArm: { rx: -2.4, ry: 0, rz: 0.3 }, rightArm: { rx: -2.4, ry: 0, rz: -0.3 }, leftLeg: { rx: -0.3, ry: 0, rz: 0 }, rightLeg: { rx: 0.3, ry: 0, rz: 0 } },
    ],
  },
  {
    name: 'Cansado',
    frames: [
      { ...clone(NEUTRAL), body: { rx: 0.5, ry: 0, rz: 0 }, leftArm: { rx: 0.6, ry: 0, rz: 0.2 }, rightArm: { rx: 0.6, ry: 0, rz: -0.2 }, head: { rx: 0.3, ry: 0, rz: 0 } },
    ],
  },
  {
    name: 'Onda',
    frames: [0, 0.4, 0, -0.4].map(rz => ({ ...clone(NEUTRAL), rightArm: { rx: -2.2, ry: 0, rz }, body: { rx: -0.1, ry: 0, rz: 0 } })),
  },
];

interface PoseStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  userData: { uid: string; avatarConfig?: AvatarConfig };
}

export default function PoseStudioModal({ isOpen, onClose, userData }: PoseStudioModalProps) {
  const { tenantId } = useTenant();
  const [pose, setPose] = useState<CharacterPose>(clone(NEUTRAL));
  const [frames, setFrames] = useState<CharacterPose[]>([]);
  const [currentFrame, setCurrentFrame] = useState(-1);
  const [previewAnim, setPreviewAnim] = useState(false);
  const [frameDuration, setFrameDuration] = useState(0.5);
  const [actionName, setActionName] = useState('');
  const [savedActions, setSavedActions] = useState<SavedAction[]>([]);
  const [status, setStatus] = useState('');
  const [invertV, setInvertV] = useState(false);
  const [invertH, setInvertH] = useState(false);
  const [swapLR, setSwapLR] = useState(false);
  const [dirtyParts, setDirtyParts] = useState<Set<PartKey>>(new Set());
  const [yawDirty, setYawDirty] = useState(false);
  // Olhos: fechar esquerdo/direito de forma independente ou conjunta
  const [closeLeftEye, setCloseLeftEye] = useState(false);
  const [closeRightEye, setCloseRightEye] = useState(false);
  // Abas: consumíveis (simular uso nas mãos) vs equipáveis (vincular ação ao item)
  const [activeTab, setActiveTab] = useState<'consumables' | 'equippables'>('consumables');
  // Itens consumíveis segurados nas mãos para simular uso na animação
  const [handItems, setHandItems] = useState<(EquippedItem | null)[]>([null, null]); // [0]=mão direita, [1]=mão esquerda
  const [consumables, setConsumables] = useState<EquippedItem[]>([]);
  const [equippables, setEquippables] = useState<EquippedItem[]>([]);
  const [weaponItem, setWeaponItem] = useState<EquippedItem | null>(null);
  const [dropTarget, setDropTarget] = useState<number | null>(null);
  // Ajuste do item selecionado (mover/rotacionar/escalar + sprite animado)
  const [selectedItem, setSelectedItem] = useState<{ kind: 'hand' | 'weapon'; index: number } | null>(null);
  const [itemTransform, setItemTransform] = useState<ModelTransform>({ posX: 0, posY: 0, posZ: 0, rotX: 0, rotY: 0, rotZ: 0, slide: 0, scale: 10, thickness: 1, curveX: 0, curveY: 0 });
  const [itemSpriteAnim, setItemSpriteAnim] = useState<SpriteAnimation | null>(null);
  // Poses estáticas salvas da escola (Salvar Poses / Poses Salvas)
  const [savedPoses, setSavedPoses] = useState<SavedPose[]>([]);
  const [newPoseName, setNewPoseName] = useState('');
  const [userActionPoses, setUserActionPoses] = useState<Record<string, CharacterPose> | null>(null);
  const dragRef = useRef<{ startX: number; startYaw: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const draggedPalette = useRef<EquippedItem | null>(null);

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  useEffect(() => {
    if (!isOpen) return;
    setPose(clone(NEUTRAL));
    setFrames([]);
    setCurrentFrame(-1);
    setPreviewAnim(false);
    setFrameDuration(0.5);
    setActionName('');
    setStatus('');
    setCloseLeftEye(false);
    setCloseRightEye(false);
    setHandItems([null, null]);
    setWeaponItem(null);
    setDropTarget(null);
    setSelectedItem(null);
    setItemSpriteAnim(null);
    setNewPoseName('');
    fetchSavedActions(tenantId).then(setSavedActions).catch(() => {});
    fetchSavedPoses(tenantId).then(setSavedPoses).catch(() => {});
    // Ações equipadas no personagem (para marcar ✓ nos botões de equipar pose)
    if (userData?.uid) {
      Promise.resolve(supabase.from('users').select('avatar_config').eq('id', userData.uid).single())
        .then(({ data }) => {
          const cfg = (data?.avatar_config as any) || userData.avatarConfig || {};
          setUserActionPoses(cfg.actionPoses || null);
        })
        .catch(() => setUserActionPoses(null));
    } else {
      setUserActionPoses(null);
    }
    // Carrega itens com modelo 3D para as duas abas:
    //  - Consumíveis: segurar nas mãos (simular uso)
    //  - Equipáveis: criar a cena com o item na mão e vincular a ação a ele
    if (userData?.uid) {
      const loadItems = async () => {
        const cons: EquippedItem[] = [];
        const equips: EquippedItem[] = [];
        const seen = new Set<string>();
        // Catálogo da loja é a fonte de verdade dos detalhes do item
        const storeById: Record<string, { type?: string; data?: any }> = {};
        try {
          const { data: storeAll } = await supabase.from('store_items').select('*').eq('active', true);
          (storeAll || []).forEach((s: any) => { storeById[s.id] = { type: s.type, data: s.data || {} }; });
        } catch (e) { /* ignore */ }

        const isPngUrl = (u?: string) => {
          try { return !!u && new URL(u, window.location.origin).pathname.toLowerCase().endsWith('.png'); }
          catch { return !!u && u.toLowerCase().endsWith('.png'); }
        };

        // Tipo: prefere data.itemType (inventário), depois coluna item_type, depois catálogo,
        // depois heurística pelo slot/categoria.
        const classifyType = (dd: any, colType: string | undefined, mapType: string | undefined): string => {
          const t = dd?.itemType || dd?.type || colType || mapType;
          if (t === 'consumable') return 'consumable';
          if (t) return t;
          const part = dd?.avatarPart;
          const cat = dd?.itemCategory;
          if (['hand', 'two_handed', 'rightHand', 'leftHand'].includes(part) || ['attack', 'defense'].includes(cat)) return 'equippable';
          return 'equippable';
        };

        const buildItem = (keyId: string, docId: string | undefined, dd: any, type: string) => {
          if (!dd) return;
          // Modelo 3D (GLB) ou imagem PNG (virada voxel pela AvatarCharacter)
          const modelUrl = dd.gameModelUrl || (isPngUrl(dd.itemImageUrl) ? dd.itemImageUrl : '') || (isPngUrl(dd.imageUrl) ? dd.imageUrl : '');
          if (!modelUrl) return;
          const key = keyId || (dd.itemTitle || dd.title) || 'item';
          if (seen.has(key)) return;
          seen.add(key);
          const item: EquippedItem = {
            docId,
            itemId: keyId || undefined,
            imageUrl: dd.itemImageUrl || dd.imageUrl || '',
            // Preserva o local do corpo definido no item (cabeça/corpo/perna/pé/mão...)
            avatarPart: (dd.avatarPart && dd.avatarPart !== 'background' ? dd.avatarPart : 'hand') as any,
            itemTitle: dd.itemTitle || dd.title || 'Item',
            itemCategory: dd.itemCategory || 'none',
            gameModelUrl: modelUrl,
            modelTextureUrl: dd.modelTextureUrl || '',
            minecraftHeadValue: dd.minecraftHeadValue || '',
            modelTransforms: dd.modelTransforms || null,
            customAnimation: dd.customAnimation || null,
          };
          if (type === 'consumable') cons.push(item);
          else equips.push(item);
        };

        try {
          const { data: mine } = await supabase.from('user_items').select('*').eq('student_id', userData.uid);
          (mine || []).forEach((d: any) => {
            const storeRef = storeById[d.item_id];
            // Itens de baú podem vir sem o campo data — usa o catálogo como fallback
            const dd = d.data || storeRef?.data || {};
            const type = classifyType(dd, d.item_type || storeRef?.type, undefined);
            buildItem(d.item_id || d.id, d.id, dd, type);
          });
        } catch (e) { /* ignore */ }
        (Object.values(storeById) as { type?: string; data?: any }[]).forEach(({ type, data: dd }) => {
          if (!dd) return;
          buildItem(undefined, undefined, { ...dd, itemTitle: dd.title, itemImageUrl: dd.imageUrl }, classifyType(dd, type, undefined));
        });
        setConsumables(cons);
        setEquippables(equips);
      };
      loadItems();
    } else {
      setConsumables([]);
      setEquippables([]);
    }
  }, [isOpen, tenantId, userData?.uid]);

  if (!isOpen) return null;

  const setBone = (part: PartKey, axis: 'rx' | 'ry' | 'rz', value: number) => {
    setPose(prev => {
      const next = { ...prev, [part]: { ...(prev[part] || { rx: 0, ry: 0, rz: 0 }), [axis]: value } };
      if (currentFrame >= 0) {
        setFrames(fs => fs.map((f, i) => i === currentFrame ? clone(next) : f));
      }
      return next;
    });
    // Marca o membro como "ajustado" — só ele será sobrescrito durante a animação
    setDirtyParts(prev => new Set(prev).add(part));
  };

  const setYaw = (yaw: number) => {
    setPose(prev => {
      const next = { ...prev, yaw };
      if (currentFrame >= 0) {
        setFrames(fs => fs.map((f, i) => i === currentFrame ? clone(next) : f));
      }
      return next;
    });
    setYawDirty(true);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    dragRef.current = { startX: e.clientX, startYaw: pose.yaw || 0 };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    setYaw(dragRef.current.startYaw + (e.clientX - dragRef.current.startX) / 200);
  };
  const onPointerUp = () => { dragRef.current = null; };

  const closedEyes: 'none' | 'left' | 'right' | 'both' =
    closeLeftEye && closeRightEye ? 'both' :
    closeLeftEye ? 'left' :
    closeRightEye ? 'right' : 'none';

  // Itens simulados nas mãos (avatarPart 'hand' é distribuído entre os dois braços)
  const simulatedEquipped = handItems.filter((x): x is EquippedItem => !!x);

  // Item selecionado para ajuste (transform + sprite)
  const selectedEquippedItem: EquippedItem | null = selectedItem
    ? (selectedItem.kind === 'weapon' ? weaponItem : (handItems[selectedItem.index] ?? null))
    : null;

  const getDefaultForPart = (part: string): ModelTransform => {
    const scale = ['hand', 'two_handed', 'rightHand', 'leftHand'].includes(part) ? 10 : 16;
    return { posX: 0, posY: 0, posZ: 0, rotX: 0, rotY: 0, rotZ: 0, slide: 0, scale, thickness: 1, curveX: 0, curveY: 0 };
  };

  const openAdjust = (item: EquippedItem, kind: 'hand' | 'weapon', index: number) => {
    const base = item.modelTransforms?.common || Object.values(item.modelTransforms || {})[0];
    setItemTransform(base ? { ...getDefaultForPart(item.avatarPart), ...base } : getDefaultForPart(item.avatarPart));
    setItemSpriteAnim(item.spriteAnimation ? { cols: 1, rows: 1, fps: 8, scale: 10, offsetY: 0, offsetX: 0, offsetZ: 0, opacity: 0.85, maskColor: '', maskTolerance: 0.15, maskShape: 'none', maskUrl: '', ...item.spriteAnimation } : null);
    setSelectedItem({ kind, index });
  };

  // Aplica o sprite animado no item selecionado (para preview)
  const attachSprite = (it: EquippedItem): EquippedItem => {
    const isSel = selectedEquippedItem && (it.itemId === selectedEquippedItem.itemId || it.docId === selectedEquippedItem.docId);
    if (isSel && itemSpriteAnim) return { ...it, spriteAnimation: itemSpriteAnim };
    return it;
  };

  // Na aba equipáveis, a cena é montada com a arma na mão (substitui os consumíveis)
  const sceneEquipped = (activeTab === 'equippables' && weaponItem ? [weaponItem] : simulatedEquipped).map(attachSprite);
  // O item selecionado recebe o transform ajustado via debugItemTransform
  const debugItemId = selectedEquippedItem ? (selectedEquippedItem.itemId || selectedEquippedItem.docId) : undefined;
  const debugItemTransform = selectedEquippedItem ? itemTransform : null;

  const equipHand = (hand: number, item: EquippedItem) => {
    setHandItems(prev => {
      const next = [...prev] as (EquippedItem | null)[];
      const other = 1 - hand;
      if (next[other] && (next[other].itemId === item.itemId || next[other].docId === item.docId)) next[other] = null;
      next[hand] = { ...item, avatarPart: 'hand' as any };
      return next;
    });
    setStatus(`"${item.itemTitle}" na ${hand === 0 ? 'mão direita' : 'mão esquerda'}.`);
    openAdjust(item, 'hand', hand);
  };

  const removeHand = (hand: number) => {
    setHandItems(prev => { const next = [...prev]; next[hand] = null; return next; });
    setSelectedItem(prev => (prev && prev.kind === 'hand' && prev.index === hand) ? null : prev);
  };

  const selectWeapon = (item: EquippedItem) => {
    setWeaponItem(item);
    setStatus(`"${item.itemTitle}" equipado no boneco para criar a cena.`);
    openAdjust(item, 'weapon', 0);
  };

  const clearWeapon = () => {
    setWeaponItem(null);
    setSelectedItem(prev => (prev && prev.kind === 'weapon') ? null : prev);
  };

  const ACTION_LABEL: Record<'idle' | 'walk' | 'run' | 'attack', string> = {
    idle: 'Parado', walk: 'Andando', run: 'Correndo', attack: 'Lutando',
  };

  // @ts-ignore
  const loadSavedPoses = async () => {
    const poses = await fetchSavedPoses(tenantId);
    setSavedPoses(poses);
  };

  const handleSavePose = async () => {
    const name = newPoseName.trim();
    if (!name) { setStatus('Digite um nome para a pose.'); return; }
    const poseToSave: SavedPose = { id: `pose_${Date.now()}`, name, pose: clone(pose), updatedAt: Date.now() };
    const updated = [...savedPoses, poseToSave];
    const ok = await saveSavedPoses(tenantId, updated, savedActions);
    if (ok) { setSavedPoses(updated); setNewPoseName(''); setStatus(`Pose "${name}" salva!`); }
    else setStatus('Não foi possível salvar a pose.');
  };

  const handleDeletePose = async (poseId: string) => {
    const updated = savedPoses.filter(p => p.id !== poseId);
    const ok = await saveSavedPoses(tenantId, updated, savedActions);
    if (ok) { setSavedPoses(updated); setStatus('Pose removida.'); }
    else setStatus('Não foi possível remover a pose.');
  };

  // Carregar uma pose salva no editor (como cena de 1 frame)
  const handleLoadPose = (sp: SavedPose) => {
    setPose(clone(sp.pose));
    setFrames([clone(sp.pose)]);
    setCurrentFrame(0);
    setPreviewAnim(false);
    setDirtyParts(new Set());
    setYawDirty(false);
    setStatus(`Pose "${sp.name}" carregada.`);
  };

  // Equipar/remover a pose numa ação base do personagem (Parado/Andando/Correndo/Lutando)
  const handleEquipPoseAction = async (sp: SavedPose, action: 'idle' | 'walk' | 'run' | 'attack') => {
    if (!userData?.uid) { setStatus('Usuário não identificado.'); return; }
    try {
      const { data } = await supabase.from('users').select('avatar_config').eq('id', userData.uid).single();
      const cfg: any = (data?.avatar_config as any) || userData.avatarConfig || {};
      const actionPoses: Record<string, CharacterPose> = { ...(cfg.actionPoses || {}) };
      if (actionPoses[action]) delete actionPoses[action];
      else actionPoses[action] = JSON.parse(JSON.stringify(sp.pose));
      const newConfig = { ...cfg, actionPoses };
      await supabase.from('users').update({ avatar_config: newConfig }).eq('id', userData.uid);
      setUserActionPoses(actionPoses);
      setStatus(actionPoses[action]
        ? `Pose "${sp.name}" equipada na ação "${ACTION_LABEL[action]}".`
        : `Ação "${ACTION_LABEL[action]}" voltou para a animação padrão.`);
    } catch (e) {
      console.error(e);
      setStatus('Erro ao equipar a pose na ação.');
    }
  };

  const saveItemAdjust = async () => {
    const item = selectedEquippedItem;
    if (!item) { setStatus('Selecione um item para salvar o ajuste.'); return; }
    if (!item.itemId) { setStatus('Item sem id de catálogo — não é possível salvar.'); return; }
    try {
      // A Central 3D edita a pose (idle). Chave específica da combinação
      // atual (mão dominante + gênero), sem sobrescrever a chave da outra mão.
      const transformKey = getModelTransformKey(avatarConfig.gender, avatarConfig.handedness, false);
      const { data: storeSnap } = await supabase.from('store_items').select('data').eq('id', item.itemId).single();
      if (storeSnap) {
        const data = (storeSnap.data as any) || {};
        const modelTransforms = { ...(data.modelTransforms || {}), [transformKey]: { ...itemTransform } };
        const newData = { ...data, modelTransforms, spriteAnimation: itemSpriteAnim || data.spriteAnimation || null };
        await supabase.from('store_items').update({ data: newData }).eq('id', item.itemId);
        const { data: copies } = await supabase.from('user_items').select('id, data').eq('item_id', item.itemId);
        if (copies) {
          for (const c of copies) {
            const cd = (c.data as any) || {};
            await supabase.from('user_items').update({
              data: { ...cd, modelTransforms: { ...(cd.modelTransforms || {}), [transformKey]: { ...itemTransform } }, spriteAnimation: itemSpriteAnim || cd.spriteAnimation || null },
            }).eq('id', c.id);
          }
        }
        setStatus(`Ajuste (posição/tamanho/rotação/sprite) salvo no item "${item.itemTitle}".`);
      } else {
        setStatus('Item não encontrado no catálogo da loja.');
      }
    } catch (e) {
      console.error(e);
      setStatus('Erro ao salvar o ajuste do item.');
    }
  };

  const handleDrop = (hand: number) => (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDropTarget(null);
    if (draggedPalette.current) {
      if (activeTab === 'consumables') equipHand(hand, draggedPalette.current);
      else selectWeapon(draggedPalette.current);
      draggedPalette.current = null;
    }
  };

  const handleStageDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDropTarget(null);
    const item = draggedPalette.current;
    if (!item) return;
    if (activeTab === 'consumables') {
      const empty = handItems.findIndex(x => !x);
      equipHand(empty >= 0 ? empty : 0, item);
    } else {
      selectWeapon(item);
    }
    draggedPalette.current = null;
  };

  // Associa a cena (frames) criada ao item equipável: qualquer personagem
  // que equipar o item fará exatamente essa ação/animação.
  const associateToItem = async () => {
    if (!weaponItem) { setStatus('Selecione um item equipável primeiro.'); return; }
    if (!weaponItem.itemId) { setStatus('Item inválido (sem id de catálogo).'); return; }
    if (frames.length === 0) { setStatus('Crie pelo menos um frame da cena antes de associar.'); return; }
    const framesToSave = frames.map(clone);
    const customAnimation = { frames: framesToSave, loop: true, duration: 1000, durationPerFrame: frameDuration };
    try {
      const { data: storeSnap } = await supabase.from('store_items').select('data').eq('id', weaponItem.itemId).single();
      if (storeSnap) {
        const newData = { ...(storeSnap.data as any), customAnimation };
        await supabase.from('store_items').update({ data: newData }).eq('id', weaponItem.itemId);
      }
      const { data: userCopies } = await supabase.from('user_items').select('id, data').eq('item_id', weaponItem.itemId);
      if (userCopies) {
        for (const c of userCopies) {
          await supabase.from('user_items').update({ data: { ...(c.data as any), customAnimation } }).eq('id', c.id);
        }
      }
      setStatus(`Cena (${framesToSave.length} frame(s)) vinculada ao item "${weaponItem.itemTitle}". Todo personagem que equipá-lo fará essa ação ao atacar.`);
    } catch (e) {
      console.error(e);
      setStatus('Erro ao associar a cena ao item.');
    }
  };

  // Preview: reinicia o slider no começo ao executar
  const togglePreview = () => {
    if (frames.length === 0) return;
    if (previewAnim) {
      setPreviewAnim(false);
    } else {
      setPreviewAnim(true);
      setCurrentFrame(0);
      setPose(clone(frames[0]));
      setDirtyParts(new Set());
      setYawDirty(false);
    }
  };

  const applyPreset = (preset: { name: string; frames: CharacterPose[] }) => {
    setFrames(preset.frames.map(clone));
    setPose(clone(preset.frames[0]));
    setCurrentFrame(0);
    setPreviewAnim(true);
    setActionName(preset.name);
    setDirtyParts(new Set());
    setYawDirty(false);
  };

  // Timeline: selecionar um frame para ver/editar a cena salva nele
  const selectFrame = (idx: number) => {
    if (frames.length === 0) return;
    const i = Math.max(0, Math.min(idx, frames.length - 1));
    setCurrentFrame(i);
    setPose(clone(frames[i]));
    setPreviewAnim(false);
    setDirtyParts(new Set());
    setYawDirty(false);
  };

  const addFrame = () => {
    if (frames.length >= MAX_FRAMES) {
      setStatus(`Limite máximo de ${MAX_FRAMES} frames atingido.`);
      return;
    }
    const next = [...frames, clone(pose)];
    setFrames(next);
    setCurrentFrame(next.length - 1);
    setPreviewAnim(false);
  };

  const undoFrame = () => {
    setFrames(prev => {
      const next = prev.slice(0, -1);
      setCurrentFrame(next.length - 1);
      return next;
    });
  };

  const clearFrames = () => { setFrames([]); setCurrentFrame(-1); setPreviewAnim(false); setDirtyParts(new Set()); setYawDirty(false); };

  const handleSave = async () => {
    const name = actionName.trim();
    if (!name) { setStatus('Dê um nome para a ação.'); return; }
    const framesToSave = frames.length > 0 ? frames : [clone(pose)];
    const updated: SavedAction[] = [
      ...savedActions.filter(a => a.name !== name),
      { id: `action_${Date.now()}`, name, frames: framesToSave, loop: true, durationPerFrame: frameDuration, updatedAt: Date.now() },
    ];
    const ok = await saveSavedActions(tenantId, updated);
    if (ok) {
      setSavedActions(updated);
      setStatus(`Ação "${name}" salva (${framesToSave.length} frame(s)).`);
    } else {
      setStatus('Erro ao salvar a ação.');
    }
  };

  const loadAction = (a: SavedAction) => {
    setFrames(a.frames.map(clone));
    setPose(clone(a.frames[0]));
    setCurrentFrame(a.frames.length - 1);
    setFrameDuration(a.durationPerFrame || 0.5);
    setPreviewAnim(false);
    setActionName(a.name);
    setStatus(`Carregada: ${a.name}`);
    setDirtyParts(new Set());
    setYawDirty(false);
  };

  const deleteAction = async (name: string) => {
    const updated = savedActions.filter(a => a.name !== name);
    const ok = await saveSavedActions(tenantId, updated);
    if (ok) setSavedActions(updated);
  };

  // Exportar para .json
  const exportJson = () => {
    const data = {
      name: actionName || 'acao',
      frames,
      durationPerFrame: frameDuration,
      loop: true,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(actionName || 'acao').replace(/\s+/g, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setStatus('Animação exportada em .json.');
  };

  // Importar .json (com validação)
  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const json = JSON.parse(reader.result as string);
        const raw = Array.isArray(json.frames) ? json.frames.slice(0, MAX_FRAMES) : [];
        if (raw.length === 0) { setStatus('JSON inválido: sem frames.'); return; }
        const clean: CharacterPose[] = raw.map((f: any) => {
          const c: CharacterPose = {};
          if (f && typeof f === 'object') {
            (['head', 'body', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'] as PartKey[]).forEach(k => {
              const b = f[k];
              if (b && typeof b === 'object' && typeof b.rx === 'number' && typeof b.ry === 'number' && typeof b.rz === 'number') {
                c[k] = { rx: b.rx, ry: b.ry, rz: b.rz };
              }
            });
            if (typeof f.yaw === 'number') c.yaw = f.yaw;
          }
          return c;
        }).filter(f => Object.keys(f).length > 0);
        if (clean.length === 0) { setStatus('JSON inválido: frames vazios.'); return; }
        setFrames(clean);
        setPose(clone(clean[0]));
        setCurrentFrame(clean.length - 1);
        if (typeof json.durationPerFrame === 'number' && json.durationPerFrame > 0) {
          setFrameDuration(Math.min(3, Math.max(0.1, json.durationPerFrame)));
        }
        if (typeof json.name === 'string') setActionName(json.name);
        setPreviewAnim(false);
        setStatus(`Animação importada: ${clean.length} frame(s).`);
      } catch (err) {
        setStatus('Erro ao importar o JSON.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const avatarConfig: AvatarConfig = userData.avatarConfig || {
    gender: 'male', skinColor: '#ffcc99', hairColor: '#4a3000', eyeColor: '#000000',
    hairStyle: 'short', mouthStyle: 'smile', facialHair: 'none', handedness: 'right',
  } as AvatarConfig;

  // Durante o preview, só os membros ajustados (dirty) são sobrescritos sobre a animação
  const overridePose: CharacterPose = {};
  dirtyParts.forEach(p => { const b = pose[p]; if (b) overridePose[p] = { ...b }; });
  if (yawDirty && typeof pose.yaw === 'number') overridePose.yaw = pose.yaw;

  const sliderGroup = (part: PartKey) => {
    // Se "inverter lados" está ativo, o slider do lado esquerdo controla o lado direito e vice-versa
    const eff: PartKey = !swapLR ? part
      : part === 'leftArm' ? 'rightArm'
      : part === 'rightArm' ? 'leftArm'
      : part === 'leftLeg' ? 'rightLeg'
      : part === 'rightLeg' ? 'leftLeg'
      : part;
    const s = SIGNS[eff];
    const vSign = s.v * (invertV ? -1 : 1);
    const hSign = s.h * (invertH ? -1 : 1);
    const tSign = s.t * (invertH ? -1 : 1);
    const vVal = (pose[eff]?.rx ?? 0) * vSign;
    const hVal = (pose[eff]?.ry ?? 0) * hSign;
    const tVal = (pose[eff]?.rz ?? 0) * tSign;
    const pos = SLIDER_POS[part];
    return (
      <div
        key={part}
        style={{
          position: 'absolute',
          top: pos.top,
          bottom: pos.bottom,
          left: pos.left,
          transform: 'translate(-50%, -50%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '0.18rem',
          background: 'rgba(0,0,0,0.6)',
          border: '1px solid rgba(245,158,11,0.4)',
          borderRadius: '8px',
          padding: '0.3rem 0.4rem',
          zIndex: 10,
          pointerEvents: 'auto',
        }}
      >
        <span style={{ fontSize: '0.6rem', color: '#f59e0b', fontWeight: 'bold', textTransform: 'uppercase' }}>{PART_LABELS[eff]}</span>
        <div style={{ height: '60px', display: 'flex', alignItems: 'center' }}>
          <input
            type="range"
            min={-Math.PI} max={Math.PI} step={0.01}
            value={vVal}
            onChange={(e) => setBone(eff, 'rx', parseFloat(e.target.value) * vSign)}
            style={{ transform: 'rotate(-90deg)', width: '60px', accentColor: '#f59e0b', margin: 0 }}
            title={`${PART_LABELS[eff]}: cima/baixo`}
          />
        </div>
        <input
          type="range"
          min={-Math.PI} max={Math.PI} step={0.01}
          value={hVal}
          onChange={(e) => setBone(eff, 'ry', parseFloat(e.target.value) * hSign)}
          style={{ width: '60px', accentColor: '#f59e0b', margin: 0 }}
          title={`${PART_LABELS[eff]}: esquerda/direita`}
        />
        <input
          type="range"
          min={-Math.PI} max={Math.PI} step={0.01}
          value={tVal}
          onChange={(e) => setBone(eff, 'rz', parseFloat(e.target.value) * tSign)}
          style={{ width: '60px', accentColor: '#8b5cf6', margin: 0 }}
          title={eff === 'rightArm' || eff === 'leftArm' ? `${PART_LABELS[eff]}: abrir/fechar braço (lateral)` : eff === 'rightLeg' || eff === 'leftLeg' ? `${PART_LABELS[eff]}: afastar/aproximar perna (lateral)` : `${PART_LABELS[eff]}: inclinar (lateral)`}
        />
        <span style={{ fontSize: '0.52rem', color: '#fbbf24', fontFamily: 'monospace' }}>
          {(pose[eff]?.rx ?? 0).toFixed(1)} / {(pose[eff]?.ry ?? 0).toFixed(1)} / {(pose[eff]?.rz ?? 0).toFixed(1)}
        </span>
      </div>
    );
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.93)', zIndex: 999999, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 1.25rem', background: 'var(--bg-panel)', borderBottom: '1px solid var(--border-glass)', flexShrink: 0 }}>
        <h2 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--gold-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          🎬 Central 3D — Estúdio de Poses
        </h2>
        <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer' }}>
          <X size={26} />
        </button>
      </div>

      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {/* Personagem CENTRALIZADO na tela */}
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onDragOver={(e) => { e.preventDefault(); setDropTarget(handItems.findIndex(x => !x) >= 0 ? handItems.findIndex(x => !x) : 0); }}
          onDragLeave={() => setDropTarget(null)}
          onDrop={handleStageDrop}
          style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'none', cursor: 'grab', outline: dropTarget !== null ? '3px dashed rgba(16,185,129,0.7)' : 'none', outlineOffset: '-8px' }}
          title="Arraste para girar o boneco · solte um item aqui para segurar na mão"
        >
          <AvatarCharacter
            config={avatarConfig}
            equippedItems={sceneEquipped}
            size={Math.min(300, isMobile ? 210 : 300)}
            interactive={false}
            animation="idle"
            ignoreHiddenSlots
            debugItemId={debugItemId}
            debugItemTransform={debugItemTransform}
            debugPose={previewAnim && frames.length > 0 ? overridePose : pose}
            debugAnimationFrames={previewAnim && frames.length > 0 ? frames : undefined}
            debugPreviewAnim={previewAnim && frames.length > 0}
            debugAnimationDuration={frameDuration}
            closedEyes={closedEyes}
            faceCamera
          />
          <div style={{ position: 'absolute', top: '0.5rem', left: '0.5rem', background: 'rgba(0,0,0,0.55)', padding: '0.25rem 0.6rem', borderRadius: '8px', fontSize: '0.7rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.35rem', pointerEvents: 'none' }}>
            <RotateCw size={12} /> Arraste para girar · {previewAnim && frames.length > 0 ? `▶ ${frames.length} frame(s)` : currentFrame >= 0 ? `Editando Frame ${currentFrame + 1}/${frames.length}` : 'Pose atual'}
          </div>

          {/* Áreas de soltar: consumíveis → nas mãos; equipáveis → arma única */}
          {activeTab === 'consumables' && [0, 1].map(hand => (
            <div
              key={hand}
              onPointerDown={(e) => e.stopPropagation()}
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDropTarget(hand); }}
              onDragLeave={() => setDropTarget(null)}
              onDrop={handleDrop(hand)}
              onClick={(e) => { e.stopPropagation(); if (handItems[hand]) removeHand(hand); }}
              title={handItems[hand] ? `Clique para remover "${handItems[hand].itemTitle}"` : `Solte aqui para segurar na ${hand === 0 ? 'mão direita' : 'mão esquerda'}`}
              style={{
                position: 'absolute',
                top: '46%',
                left: hand === 0 ? '66%' : '34%',
                transform: 'translate(-50%, -50%)',
                width: '88px',
                height: '46px',
                borderRadius: '10px',
                border: '2px dashed ' + (dropTarget === hand ? 'rgba(16,185,129,1)' : 'rgba(255,255,255,0.25)'),
                background: dropTarget === hand ? 'rgba(16,185,129,0.25)' : 'rgba(0,0,0,0.35)',
                color: 'var(--text-primary)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.15rem',
                fontSize: '0.62rem',
                textAlign: 'center',
                cursor: handItems[hand] ? 'pointer' : 'default',
                padding: '0.25rem',
                zIndex: 10,
                boxSizing: 'border-box',
              }}
            >
              <span style={{ color: dropTarget === hand ? '#34d399' : 'rgba(255,255,255,0.5)', fontWeight: 'bold' }}>
                {hand === 0 ? '🖐 Mão D' : '🖐 Mão E'}
              </span>
              {handItems[hand] ? (
                <span style={{ fontSize: '0.6rem', lineHeight: 1.1, wordBreak: 'break-word' }}>{handItems[hand].itemTitle} (remover ✕)</span>
              ) : (
                <span style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.4)' }}>solte aqui</span>
              )}
            </div>
          ))}
        </div>

        {/* Sliders flutuantes perto de cada membro (corpo embaixo dos pés) */}
        {(Object.keys(SLIDER_POS) as PartKey[]).map(sliderGroup)}

        {/* Painel de controles ao redor (direita no desktop, base no mobile) */}
        <div
          style={{
            position: 'absolute',
            ...(isMobile
              ? { left: 0, right: 0, bottom: 0, maxHeight: '42%' }
              : { top: 0, right: 0, bottom: 0, width: '300px' }),
            overflow: 'hidden',
            background: 'rgba(12,16,24,0.92)',
            borderLeft: isMobile ? 'none' : '1px solid var(--border-glass)',
            borderTop: isMobile ? '1px solid var(--border-glass)' : 'none',
            padding: '0.9rem',
            zIndex: 20,
            display: 'flex',
            flexDirection: 'column',
            gap: '0.6rem',
          }}
        >
          {/* Parte de CIMA (rolável): inversões, olhos, itens, ajuste e ações */}
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.9rem', paddingRight: '2px' }}>
          {/* Inversões de eixo / lados */}
          <div style={{ border: '1px solid rgba(59,130,246,0.25)', borderRadius: '8px', padding: '0.7rem' }}>
            <div style={{ fontSize: '0.82rem', color: '#60a5fa', fontWeight: 'bold', marginBottom: '0.35rem' }}>↔️ Inversões</div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem', color: 'var(--text-primary)', marginBottom: '0.3rem', cursor: 'pointer' }}>
              <input type="checkbox" checked={invertV} onChange={(e) => setInvertV(e.target.checked)} style={{ width: '16px', height: '16px', accentColor: '#f59e0b' }} />
              Inverter eixo vertical (cima/baixo)
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem', color: 'var(--text-primary)', marginBottom: '0.3rem', cursor: 'pointer' }}>
              <input type="checkbox" checked={invertH} onChange={(e) => setInvertH(e.target.checked)} style={{ width: '16px', height: '16px', accentColor: '#f59e0b' }} />
              Inverter eixo horizontal (esquerda/direita)
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem', color: 'var(--text-primary)', cursor: 'pointer' }}>
              <input type="checkbox" checked={swapLR} onChange={(e) => setSwapLR(e.target.checked)} style={{ width: '16px', height: '16px', accentColor: '#8b5cf6' }} />
              Inverter lados (esquerdo ↔ direito)
            </label>
          </div>

          {/* Controle dos olhos (fechar junto ou separado) */}
          <div style={{ border: '1px solid rgba(236,72,153,0.3)', borderRadius: '8px', padding: '0.7rem' }}>
            <div style={{ fontSize: '0.82rem', color: '#f472b6', fontWeight: 'bold', marginBottom: '0.35rem' }}>👁 Olhos</div>
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              <button onClick={() => setCloseLeftEye(v => !v)} style={{ flex: 1, padding: '0.4rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.78rem', border: '1px solid', background: closeLeftEye ? '#be185d' : 'transparent', borderColor: closeLeftEye ? '#be185d' : 'rgba(236,72,153,0.5)', color: closeLeftEye ? '#fff' : '#f472b6' }}>
                {closeLeftEye ? '✕' : '◉'} Olho E
              </button>
              <button onClick={() => setCloseRightEye(v => !v)} style={{ flex: 1, padding: '0.4rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.78rem', border: '1px solid', background: closeRightEye ? '#be185d' : 'transparent', borderColor: closeRightEye ? '#be185d' : 'rgba(236,72,153,0.5)', color: closeRightEye ? '#fff' : '#f472b6' }}>
                {closeRightEye ? '✕' : '◉'} Olho D
              </button>
            </div>
            <div style={{ marginTop: '0.35rem', fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
              {closedEyes === 'both' ? 'Ambos fechados.' : closedEyes === 'left' ? 'Esquerdo fechado.' : closedEyes === 'right' ? 'Direito fechado.' : 'Olhos abertos (piscar automático).'}
            </div>
          </div>

          {/* Itens: abas Consumíveis (mãos) / Equipáveis (ação vinculada ao item) */}
          <div style={{ border: '1px solid rgba(16,185,129,0.3)', borderRadius: '8px', padding: '0.7rem' }}>
            <div style={{ display: 'flex', gap: '0.3rem', marginBottom: '0.5rem' }}>
              <button onClick={() => setActiveTab('consumables')} style={{ flex: 1, padding: '0.35rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 'bold', border: '1px solid', background: activeTab === 'consumables' ? '#10b981' : 'transparent', borderColor: '#10b981', color: activeTab === 'consumables' ? '#fff' : '#34d399' }}>
                🧪 Consumíveis
              </button>
              <button onClick={() => setActiveTab('equippables')} style={{ flex: 1, padding: '0.35rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 'bold', border: '1px solid', background: activeTab === 'equippables' ? '#f59e0b' : 'transparent', borderColor: '#f59e0b', color: activeTab === 'equippables' ? '#000' : '#fbbf24' }}>
                ⚔️ Equipáveis
              </button>
            </div>

            {activeTab === 'consumables' ? (
              <>
                <div style={{ fontSize: '0.82rem', color: '#34d399', fontWeight: 'bold', marginBottom: '0.35rem' }}>🧤 Itens Consumíveis nas Mãos (simular uso)</div>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  {[0, 1].map(hand => (
                    <div key={hand} onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDropTarget(hand); }} onDragLeave={() => setDropTarget(null)} onDrop={handleDrop(hand)} style={{ flex: 1, minWidth: 0, border: '1px dashed ' + (dropTarget === hand ? '#10b981' : 'rgba(16,185,129,0.4)'), background: dropTarget === hand ? 'rgba(16,185,129,0.15)' : 'rgba(0,0,0,0.25)', borderRadius: '8px', padding: '0.4rem', textAlign: 'center' }}>
                      <div style={{ fontSize: '0.66rem', color: '#a7f3d0', fontWeight: 'bold', marginBottom: '0.2rem' }}>{hand === 0 ? '🖐 Mão Direita' : '🖐 Mão Esquerda'}</div>
                      {handItems[hand] ? (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem' }}>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-primary)', wordBreak: 'break-word' }}>{handItems[hand].itemTitle}</span>
                          <button onClick={() => openAdjust(handItems[hand]!, 'hand', hand)} style={{ background: 'transparent', border: 'none', color: '#f59e0b', cursor: 'pointer', padding: 0 }} title="Ajustar item (mover/tamanho/rotação/sprite)">
                            <Settings2 size={13} />
                          </button>
                          <button onClick={() => removeHand(hand)} style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 0 }} title="Remover">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      ) : (
                        <div style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.4)' }}>vazia · solte aqui</div>
                      )}
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: '0.5rem', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Seus consumíveis + consumíveis da loja com modelo 3D (arraste até a mão/boneco ou clique):</div>
                {consumables.length === 0 ? (
                  <div style={{ marginTop: '0.3rem', fontSize: '0.68rem', color: 'rgba(255,255,255,0.4)' }}>Nenhum consumível com modelo 3D encontrado.</div>
                ) : (
                  <div style={{ marginTop: '0.35rem', display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                    {consumables.map(item => (
                      <button
                        key={item.docId || item.itemId}
                        draggable
                        onDragStart={(e) => { draggedPalette.current = item; e.dataTransfer.setData('text/plain', item.itemTitle || ''); e.dataTransfer.effectAllowed = 'copy'; }}
                        onDragEnd={() => { draggedPalette.current = null; setDropTarget(null); }}
                        onClick={() => { const empty = handItems.findIndex(x => !x); equipHand(empty >= 0 ? empty : 0, item); }}
                        title="Arraste para a mão ou clique para equipar"
                        style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.25rem 0.5rem', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.4)', borderRadius: '20px', cursor: 'grab', fontSize: '0.7rem', color: 'var(--text-primary)', maxWidth: '100%' }}
                      >
                        {item.imageUrl ? <img src={item.imageUrl} alt="" style={{ width: 18, height: 18, objectFit: 'contain' }} draggable={false} /> : <span>📦</span>}
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.itemTitle}</span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <>
                <div style={{ fontSize: '0.82rem', color: '#fbbf24', fontWeight: 'bold', marginBottom: '0.35rem' }}>⚔️ Criar ação para um item equipável</div>

                {equippables.length === 0 ? (
                  <div style={{ marginTop: '0.3rem', fontSize: '0.68rem', color: 'rgba(255,255,255,0.4)' }}>Nenhum item equipável com modelo 3D encontrado.</div>
                ) : (
                  <>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>Seus equipáveis + equipáveis da loja com modelo 3D (clique ou arraste até o boneco para equipar):</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                      {equippables.map(item => (
                        <button
                          key={item.itemId || item.docId}
                          draggable
                          onDragStart={(e) => { draggedPalette.current = item; e.dataTransfer.setData('text/plain', item.itemTitle || ''); e.dataTransfer.effectAllowed = 'copy'; }}
                          onDragEnd={() => { draggedPalette.current = null; setDropTarget(null); }}
                          onClick={() => selectWeapon(item)}
                          title="Arraste até o boneco ou clique para equipar"
                          style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.25rem 0.5rem', background: (weaponItem?.itemId === item.itemId || weaponItem?.docId === item.docId) ? 'rgba(245,158,11,0.3)' : 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.4)', borderRadius: '20px', cursor: 'grab', fontSize: '0.7rem', color: 'var(--text-primary)', maxWidth: '100%' }}
                        >
                          {item.imageUrl ? <img src={item.imageUrl} alt="" style={{ width: 18, height: 18, objectFit: 'contain' }} draggable={false} /> : <span>⚔️</span>}
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.itemTitle}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}

                {weaponItem && (
                  <div style={{ marginTop: '0.45rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.4rem', background: 'rgba(245,158,11,0.1)', borderRadius: '8px', padding: '0.4rem 0.5rem' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      Equipado no boneco: <b>{weaponItem.itemTitle}</b>
                    </div>
                    <div style={{ display: 'flex', gap: '0.3rem', flexShrink: 0 }}>
                      <button onClick={() => openAdjust(weaponItem, 'weapon', 0)} style={{ background: 'transparent', border: 'none', color: '#f59e0b', cursor: 'pointer', padding: 0 }} title="Ajustar item (mover/tamanho/rotação/sprite)">
                        <Settings2 size={14} />
                      </button>
                      <button onClick={clearWeapon} style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 0 }} title="Remover arma">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                )}

                <button
                  onClick={associateToItem}
                  disabled={!weaponItem || frames.length === 0}
                  style={{ marginTop: '0.45rem', width: '100%', padding: '0.45rem', background: '#f59e0b', color: '#000', border: 'none', borderRadius: '6px', cursor: (!weaponItem || frames.length === 0) ? 'not-allowed' : 'pointer', fontWeight: 'bold', fontSize: '0.78rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}
                >
                  🎬 Associar cena ao item
                </button>
                <div style={{ marginTop: '0.35rem', fontSize: '0.66rem', color: 'rgba(255,255,255,0.5)', lineHeight: 1.35 }}>
                  Monte a cena com a arma na mão (frames) e clique em "Associar". Todo personagem que <b>equipar esse item</b> fará exatamente essa ação/animação ao atacar (ou ao levar dano, se for de defesa).
                </div>
              </>
            )}
          </div>

          {/* Ajuste do item selecionado (mover/tamanho/rotação + sprite animado) */}
          {selectedEquippedItem && (
            <div style={{ border: '1px solid rgba(245,158,11,0.4)', borderRadius: '8px', padding: '0.7rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                <div style={{ fontSize: '0.82rem', color: '#fbbf24', fontWeight: 'bold', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>🎛️ Ajustar: {selectedEquippedItem.itemTitle}</div>
                <button onClick={() => setSelectedItem(null)} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '0.1rem', flexShrink: 0 }} title="Fechar ajuste"><X size={14} /></button>
              </div>

              {/* Posição / rotação / escala */}
              {[
                { label: 'Pos X', key: 'posX' as const, min: -30, max: 30, step: 0.5 },
                { label: 'Pos Y', key: 'posY' as const, min: -30, max: 10, step: 0.5 },
                { label: 'Pos Z', key: 'posZ' as const, min: -30, max: 30, step: 0.5 },
                { label: 'Rot X', key: 'rotX' as const, min: -Math.PI, max: Math.PI, step: 0.05 },
                { label: 'Rot Y', key: 'rotY' as const, min: -Math.PI, max: Math.PI, step: 0.05 },
                { label: 'Rot Z', key: 'rotZ' as const, min: -Math.PI, max: Math.PI, step: 0.05 },
                { label: 'Slide', key: 'slide' as const, min: -40, max: 20, step: 1 },
                { label: 'Scale', key: 'scale' as const, min: 0.1, max: 100, step: 0.1 },
                { label: 'Thick', key: 'thickness' as const, min: 0.1, max: 10, step: 0.1 },
                { label: 'Curve X', key: 'curveX' as const, min: -10, max: 10, step: 0.01 },
                { label: 'Curve Y', key: 'curveY' as const, min: -10, max: 10, step: 0.01 },
              ].map(({ label, key, min, max, step }) => (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
                  <span style={{ width: '48px', color: '#f59e0b', fontFamily: 'monospace', fontWeight: 'bold', fontSize: '0.72rem' }}>{label}</span>
                  <input type="range" min={min} max={max} step={step} value={itemTransform[key] ?? 0} onChange={(e) => setItemTransform(prev => ({ ...prev, [key]: parseFloat(e.target.value) }))} style={{ flex: 1, accentColor: '#f59e0b' }} />
                  <span style={{ width: '55px', textAlign: 'right', color: '#fbbf24', fontFamily: 'monospace', fontSize: '0.7rem', fontWeight: 'bold' }}>{(itemTransform[key] ?? 0).toFixed(2)}</span>
                </div>
              ))}
              <button onClick={() => setItemTransform(getDefaultForPart(selectedEquippedItem.avatarPart))} style={{ marginTop: '0.3rem', width: '100%', padding: '0.3rem', background: 'transparent', color: '#ef4444', border: '1px solid #ef4444', borderRadius: '6px', cursor: 'pointer', fontSize: '0.72rem' }}>↺ Resetar posição/tamanho</button>

              {/* Sprite animado ao redor do item */}
              <div style={{ marginTop: '0.6rem', borderTop: '1px solid rgba(255,255,255,0.12)', paddingTop: '0.5rem' }}>
                <div style={{ fontSize: '0.78rem', color: '#a78bfa', fontWeight: 'bold', marginBottom: '0.3rem' }}>✨ Sprite animado (brilho/encanto)</div>
                {itemSpriteAnim ? (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.3rem' }}>
                      <img src={itemSpriteAnim.url} alt="sprite" style={{ width: 46, height: 46, objectFit: 'contain', border: '1px solid rgba(167,139,250,0.4)', borderRadius: '6px', background: 'rgba(0,0,0,0.4)' }} />
                      <div style={{ fontSize: '0.66rem', color: 'var(--text-secondary)', lineHeight: 1.3 }}>Atlas cortado em células (cols × rows) exibidas em sequência.</div>
                    </div>
                    {[
                      { label: 'Colunas', key: 'cols' as const, min: 1, max: 16, step: 1, integer: true },
                      { label: 'Linhas', key: 'rows' as const, min: 1, max: 16, step: 1, integer: true },
                      { label: 'Veloc. fps', key: 'fps' as const, min: 1, max: 30, step: 1, integer: true },
                      { label: 'Tamanho', key: 'scale' as const, min: 1, max: 40, step: 0.5 },
                      { label: 'Altura Y', key: 'offsetY' as const, min: -30, max: 30, step: 0.5 },
                      { label: 'Lado X', key: 'offsetX' as const, min: -30, max: 30, step: 0.5 },
                      { label: 'Profund. Z', key: 'offsetZ' as const, min: -30, max: 30, step: 0.5 },
                      { label: 'Opacidade', key: 'opacity' as const, min: 0.1, max: 1, step: 0.05 },
                    ].map(({ label, key, min, max, step, integer }) => (
                      <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
                        <span style={{ width: '76px', color: '#a78bfa', fontFamily: 'monospace', fontWeight: 'bold', fontSize: '0.7rem' }}>{label}</span>
                        <input type="range" min={min} max={max} step={step} value={itemSpriteAnim[key] ?? (integer ? 1 : 0.8)} onChange={(e) => setItemSpriteAnim(prev => ({ ...(prev as SpriteAnimation), [key]: parseFloat(e.target.value) }))} style={{ flex: 1, accentColor: '#8b5cf6' }} />
                        <span style={{ width: '44px', textAlign: 'right', color: '#c4b5fd', fontFamily: 'monospace', fontSize: '0.7rem', fontWeight: 'bold' }}>{(itemSpriteAnim[key] ?? (integer ? 1 : 0.8)).toFixed(integer ? 0 : 2)}</span>
                      </div>
                    ))}

                    {/* Forma de recorte (clip) da sprite */}
                    <div style={{ marginTop: '0.3rem', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '0.4rem' }}>
                      <div style={{ fontSize: '0.7rem', color: '#a78bfa', fontWeight: 'bold', marginBottom: '0.25rem' }}>✂️ Forma de recorte</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                        {([['none', 'Retângulo'], ['circle', 'Círculo'], ['square', 'Quadrado'], ['triangle', 'Triângulo'], ['diamond', 'Losango'], ['ring', 'Anel']] as const).map(([val, label]) => (
                          <button key={val} onClick={() => setItemSpriteAnim(prev => ({ ...(prev as SpriteAnimation), maskShape: val, maskUrl: '' }))} style={{ padding: '0.25rem 0.5rem', borderRadius: '16px', cursor: 'pointer', fontSize: '0.66rem', border: '1px solid', background: itemSpriteAnim.maskShape === val && !itemSpriteAnim.maskUrl ? '#8b5cf6' : 'transparent', borderColor: '#8b5cf6', color: itemSpriteAnim.maskShape === val && !itemSpriteAnim.maskUrl ? '#fff' : '#a78bfa' }}>
                            {label}
                          </button>
                        ))}
                      </div>
                      <div style={{ marginTop: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', flexShrink: 0 }}>Silhueta:</span>
                        <div style={{ flex: 1 }}>
                          <DirectUploadButton
                            folder="uploads"
                            accept="image/*"
                            onUploadComplete={(url) => setItemSpriteAnim(prev => ({ ...(prev as SpriteAnimation), maskUrl: url }))}
                            buttonStyle={{ width: '100%', height: '34px', padding: '0 0.5rem', background: 'rgba(139,92,246,0.12)', color: '#a78bfa', border: '1px dashed #8b5cf6', borderRadius: '6px', cursor: 'pointer' }}
                          />
                        </div>
                      </div>
                      {itemSpriteAnim.maskUrl && (
                        <div style={{ marginTop: '0.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.4rem' }}>
                          <span style={{ fontSize: '0.66rem', color: '#a78bfa', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Silhueta personalizada aplicada</span>
                          <button onClick={() => setItemSpriteAnim(prev => ({ ...(prev as SpriteAnimation), maskUrl: '' }))} style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 0 }} title="Remover silhueta"><Trash2 size={12} /></button>
                        </div>
                      )}
                      <div style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.45)', marginTop: '0.2rem', lineHeight: 1.3 }}>
                        Recorte a sprite em uma forma (círculo, quadrado, triângulo, losango, anel) — ou suba a silhueta do próprio item para ela aparecer exatamente no formato dele.
                      </div>
                    </div>

                    {/* Máscara de cor (ignorar fundo, ex.: preto) */}
                    <div style={{ marginTop: '0.3rem', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '0.4rem' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.72rem', color: 'var(--text-primary)', cursor: 'pointer' }}>
                        <input type="checkbox" checked={!!itemSpriteAnim.maskColor} onChange={(e) => setItemSpriteAnim(prev => ({ ...(prev as SpriteAnimation), maskColor: e.target.checked ? (prev?.maskColor || '#000000') : '', maskTolerance: prev?.maskTolerance ?? 0.15 }))} style={{ width: '15px', height: '15px', accentColor: '#8b5cf6' }} />
                        🎯 Remover fundo (chroma key)
                      </label>
                      {itemSpriteAnim.maskColor && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.3rem' }}>
                          <input type="color" value={itemSpriteAnim.maskColor} onChange={(e) => setItemSpriteAnim(prev => ({ ...(prev as SpriteAnimation), maskColor: e.target.value }))} style={{ width: 34, height: 26, border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }} />
                          <input type="range" min={0} max={1} step={0.01} value={itemSpriteAnim.maskTolerance ?? 0.15} onChange={(e) => setItemSpriteAnim(prev => ({ ...(prev as SpriteAnimation), maskTolerance: parseFloat(e.target.value) }))} style={{ flex: 1, accentColor: '#8b5cf6' }} />
                          <span style={{ width: '44px', textAlign: 'right', color: '#c4b5fd', fontFamily: 'monospace', fontSize: '0.7rem', fontWeight: 'bold' }}>{(itemSpriteAnim.maskTolerance ?? 0.15).toFixed(2)}</span>
                        </div>
                      )}
                      <div style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.45)', marginTop: '0.2rem', lineHeight: 1.3 }}>
                        Ex.: fundo preto → deixe a cor <b>#000000</b> e aumente a tolerância até o fundo sumir; só o que for diferente do fundo é renderizado.
                      </div>
                    </div>
                    <button onClick={() => setItemSpriteAnim(null)} style={{ marginTop: '0.3rem', width: '100%', padding: '0.3rem', background: 'transparent', color: '#ef4444', border: '1px solid #ef4444', borderRadius: '6px', cursor: 'pointer', fontSize: '0.72rem' }}>Remover sprite</button>
                  </>
                ) : (
                  <DirectUploadButton
                    folder="uploads"
                    accept="image/*"
                    onUploadComplete={(url) => setItemSpriteAnim({ url, cols: 4, rows: 1, fps: 8, scale: 10, offsetY: 0, offsetX: 0, offsetZ: 0, opacity: 0.85, maskColor: '', maskTolerance: 0.15, maskShape: 'none', maskUrl: '' })}
                    buttonStyle={{ width: '100%', padding: '0.4rem', background: 'rgba(139,92,246,0.15)', color: '#a78bfa', border: '1px dashed #8b5cf6', borderRadius: '6px', cursor: 'pointer', fontSize: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem' }}
                  />
                )}
                <div style={{ marginTop: '0.35rem', fontSize: '0.64rem', color: 'rgba(255,255,255,0.45)', lineHeight: 1.35 }}>
                  Suba uma imagem (atlas) com várias partes (ex.: estrelas coloridas). Ela é cortada em células e cada célula é exibida uma por vez em sequência — dando a impressão de brilho/encanto ao redor do item.
                </div>
              </div>

              <button onClick={saveItemAdjust} style={{ marginTop: '0.6rem', width: '100%', padding: '0.45rem', background: '#f59e0b', color: '#000', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.78rem' }}>
                💾 Salvar ajuste no item
              </button>
            </div>
          )}

          {/* Ações pré-definidas (executam na hora) */}
          <div>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontWeight: 'bold', marginBottom: '0.35rem' }}>Ações (clicar executa a animação):</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
              {PRESETS.map(p => (
                <button key={p.name} onClick={() => applyPreset(p)} style={{ padding: '0.35rem 0.7rem', background: previewAnim && actionName === p.name ? 'rgba(139,92,246,0.35)' : 'rgba(245,158,11,0.15)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.4)', borderRadius: '20px', cursor: 'pointer', fontSize: '0.78rem' }}>
                  {p.name}
                </button>
              ))}
            </div>
            {previewAnim && (
              <button onClick={() => setPreviewAnim(false)} style={{ marginTop: '0.4rem', padding: '0.3rem 0.7rem', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <Square size={12} /> Parar animação
              </button>
            )}
          </div>
          </div>

          {/* Parte de BAIXO FIXA: a partir da janela "Adicionar Frame" */}
          <div style={{ flexShrink: 0, maxHeight: '62%', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.9rem', borderTop: '1px solid var(--border-glass)', paddingTop: '0.6rem' }}>
          {/* Captura de frames */}
          <div style={{ border: '1px solid rgba(139,92,246,0.3)', borderRadius: '8px', padding: '0.7rem' }}>
            <div style={{ fontSize: '0.82rem', color: '#c4b5fd', fontWeight: 'bold', marginBottom: '0.35rem' }}>🎞️ Animação (Frames: {frames.length}/{MAX_FRAMES})</div>

            {/* Timeline: cada frame novo cresce o slider; volte para ver/editar a cena */}
            {frames.length > 0 && (
              <div style={{ marginBottom: '0.4rem' }}>
                <input
                  type="range"
                  min={0} max={frames.length - 1} step={1}
                  value={currentFrame >= 0 ? currentFrame : frames.length - 1}
                  onChange={(e) => selectFrame(parseInt(e.target.value))}
                  style={{ width: '100%', accentColor: '#8b5cf6', margin: 0 }}
                  title="Percorrer frames (clique para voltar e editar a cena)"
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.62rem', color: 'var(--text-secondary)' }}>
                  <span>Frame 1</span>
                  <span>{currentFrame >= 0 ? `Editando frame ${currentFrame + 1}` : '—'}</span>
                  <span>Frame {frames.length}</span>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
              <button onClick={addFrame} style={{ flex: 1, padding: '0.35rem', background: '#10b981', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.78rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem' }}>
                <Plus size={13} /> Adicionar Frame
              </button>
              <button onClick={undoFrame} disabled={frames.length === 0} style={{ padding: '0.3rem 0.5rem', background: 'transparent', color: '#eab308', border: '1px solid #eab308', borderRadius: '6px', cursor: 'pointer', fontSize: '0.78rem', display: 'flex', alignItems: 'center' }} title="Desfazer último frame">
                <Undo2 size={13} />
              </button>
              <button onClick={clearFrames} disabled={frames.length === 0} style={{ padding: '0.3rem 0.5rem', background: 'transparent', color: '#ef4444', border: '1px solid #ef4444', borderRadius: '6px', cursor: 'pointer', fontSize: '0.78rem', display: 'flex', alignItems: 'center' }} title="Limpar frames">
                <Trash2 size={13} />
              </button>
              <button onClick={togglePreview} disabled={frames.length === 0} style={{ padding: '0.3rem 0.6rem', background: previewAnim ? '#8b5cf6' : 'transparent', color: previewAnim ? '#fff' : '#a78bfa', border: '1px solid #8b5cf6', borderRadius: '6px', cursor: 'pointer', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                {previewAnim ? <Square size={12} /> : <Play size={12} />} Preview
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.4rem' }}>
              <span style={{ color: '#a78bfa', fontSize: '0.72rem', whiteSpace: 'nowrap' }}>Tempo/frame</span>
              <input type="range" min={0.1} max={3} step={0.1} value={frameDuration} onChange={(e) => setFrameDuration(parseFloat(e.target.value))} style={{ flex: 1, accentColor: '#8b5cf6' }} />
              <span style={{ color: '#c4b5fd', fontFamily: 'monospace', fontSize: '0.72rem' }}>{frameDuration.toFixed(1)}s</span>
            </div>

            {/* Exportar / Importar .json */}
            <div style={{ display: 'flex', gap: '0.3rem', marginTop: '0.4rem' }}>
              <button onClick={exportJson} disabled={frames.length === 0} style={{ flex: 1, padding: '0.3rem', background: 'rgba(16,185,129,0.15)', color: '#34d399', border: '1px solid rgba(16,185,129,0.4)', borderRadius: '6px', cursor: frames.length === 0 ? 'not-allowed' : 'pointer', fontSize: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem' }}>
                <Download size={13} /> Exportar .json
              </button>
              <button onClick={() => fileRef.current?.click()} style={{ flex: 1, padding: '0.3rem', background: 'rgba(59,130,246,0.15)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.4)', borderRadius: '6px', cursor: 'pointer', fontSize: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem' }}>
                <Upload size={13} /> Importar .json
              </button>
              <input ref={fileRef} type="file" accept="application/json,.json" style={{ display: 'none' }} onChange={handleImportFile} />
            </div>
          </div>

          {/* Salvar / carregar */}
          <div style={{ border: '1px solid rgba(59,130,246,0.3)', borderRadius: '8px', padding: '0.7rem' }}>
            <div style={{ fontSize: '0.82rem', color: '#60a5fa', fontWeight: 'bold', marginBottom: '0.35rem' }}>💾 Salvar Ação</div>
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              <input
                type="text"
                value={actionName}
                onChange={(e) => setActionName(e.target.value)}
                placeholder="Nome da ação"
                style={{ flex: 1, padding: '0.4rem 0.6rem', borderRadius: '6px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: '0.82rem' }}
              />
              <button onClick={handleSave} style={{ padding: '0.4rem 0.8rem', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem', fontWeight: 'bold', fontSize: '0.8rem' }}>
                <Save size={13} /> Salvar
              </button>
            </div>
            {status && <div style={{ marginTop: '0.35rem', fontSize: '0.75rem', color: 'var(--gold-primary)' }}>{status}</div>}

            {savedActions.length > 0 && (
              <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Ações salvas:</div>
                {savedActions.map(a => (
                  <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'rgba(255,255,255,0.03)', borderRadius: '6px', padding: '0.3rem 0.5rem' }}>
                    <button onClick={() => loadAction(a)} style={{ flex: 1, textAlign: 'left', background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '0.8rem' }}>
                      {a.name} <span style={{ color: 'var(--text-secondary)', fontSize: '0.68rem' }}>({a.frames.length} frame(s))</span>
                    </button>
                    <button onClick={() => deleteAction(a.name)} style={{ background: 'transparent', border: 'none', color: 'var(--accent-red)', cursor: 'pointer', padding: '0.2rem' }} title="Excluir">
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Poses Salvas da Escola (Salvar Pose / Poses Salvas) */}
          <div style={{ border: '1px solid rgba(139,92,246,0.3)', borderRadius: '8px', padding: '0.7rem' }}>
            <div style={{ fontSize: '0.82rem', color: '#a78bfa', fontWeight: 'bold', marginBottom: '0.35rem' }}>📚 Poses Salvas da Escola</div>
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              <input
                type="text"
                value={newPoseName}
                onChange={(e) => setNewPoseName(e.target.value)}
                placeholder="Nome da pose (ex: Ataque Espada)"
                style={{ flex: 1, padding: '0.4rem 0.6rem', borderRadius: '6px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: '0.8rem' }}
              />
              <button onClick={handleSavePose} style={{ padding: '0.4rem 0.8rem', background: '#10b981', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem', fontWeight: 'bold', fontSize: '0.78rem' }}>
                💾 Salvar Pose
              </button>
            </div>
            <div style={{ marginTop: '0.3rem', fontSize: '0.62rem', color: 'rgba(255,255,255,0.45)' }}>
              Salva a pose ATUAL (1 frame) por escola. Depois carregue para editar ou equipe numa ação base do personagem.
            </div>
            {savedPoses.length > 0 && (
              <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                {savedPoses.map(sp => (
                  <div key={sp.id} style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.25)', borderRadius: '8px', padding: '0.4rem 0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.4rem' }}>
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sp.name}</span>
                      <div style={{ display: 'flex', gap: '0.3rem', flexShrink: 0 }}>
                        <button onClick={() => handleLoadPose(sp)} style={{ padding: '0.2rem 0.5rem', background: 'rgba(59,130,246,0.2)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.4)', borderRadius: '5px', cursor: 'pointer', fontSize: '0.68rem', fontWeight: 'bold' }}>Carregar</button>
                        <button onClick={() => handleDeletePose(sp.id)} style={{ padding: '0.2rem 0.5rem', background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.4)', borderRadius: '5px', cursor: 'pointer', fontSize: '0.68rem' }} title="Excluir pose"><Trash2 size={12} /></button>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.25rem', marginTop: '0.35rem', flexWrap: 'wrap' }}>
                      {(['idle', 'walk', 'run', 'attack'] as const).map(action => {
                        const equipped = !!userActionPoses?.[action];
                        return (
                          <button
                            key={action}
                            onClick={() => handleEquipPoseAction(sp, action)}
                            style={{ padding: '0.2rem 0.5rem', background: equipped ? 'rgba(16,185,129,0.25)' : 'transparent', color: equipped ? '#10b981' : 'var(--text-secondary)', border: equipped ? '1px solid rgba(16,185,129,0.5)' : '1px solid var(--border-glass)', borderRadius: '5px', cursor: 'pointer', fontSize: '0.66rem', fontWeight: 'bold' }}
                            title={equipped ? `Remover pose da ação ${ACTION_LABEL[action]}` : `Equipar nesta ação (${ACTION_LABEL[action]})`}
                          >
                            {ACTION_LABEL[action]}{equipped ? ' ✓' : ''}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          </div>
        </div>
      </div>
    </div>
  );
}