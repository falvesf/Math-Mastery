import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase';
import { Plus, Edit2, Trash2, Star, Search, List, Grid, LayoutGrid, ArrowDownAZ, ArrowUpZA, LayoutList, Columns, Package, RefreshCcw, X, Hammer } from 'lucide-react';
import { forgeStrengthFraction, forgeAttributeValue, nextForgeCost, DEFAULT_FORGE_SUCCESS } from '../lib/forge';
import ImageGalleryModal from './ImageGalleryModal';
import DirectUploadButton from './DirectUploadButton';
import GachaConfigModal from './GachaConfigModal';
import ItemBankModal from './ItemBankModal';
import GlbMeshExtractorModal from './GlbMeshExtractorModal';
import SkinBuffIcon from '../components/SkinBuffIcon';
import ItemIcon from './ItemIcon';
import ItemTooltip from './ItemTooltip';
import AvatarCharacter from './AvatarCharacter';
import MinecraftPartPreview from './MinecraftPartPreview';
import AudioBankPicker from './AudioBankPicker';
import { playSound } from '../lib/audioBank';
import { useDialog } from '../contexts/DialogContext';
import { useTenant } from '../contexts/TenantContext';
import { usePermissions } from '../lib/permissions';
import { fetchEconomyType } from '../lib/economy';
import { invalidateEquippedItems } from '../lib/equippedItems';
import { RANKS, resolveMinRankName } from '../lib/ranks';
import type { RankDef } from '../lib/ranks';
import { type ItemCategory, type AttributeType, type GachaConfig, type ItemAdd } from '../lib/gacha';
import { type ModelTransformsConfig, type ModelTransform } from './AvatarCharacter';
import { DAMAGE_EFFECTS } from '../lib/damageEffects';
import { v4 as uuidv4 } from 'uuid';

export type GameEffectType = 'none' | 'remove_wrong' | 'add_time' | 'extra_life' | 'restore_hp' | 'heal_1_hp' | 'reduce_hp_cooldown' | 'add_attribute' | 'remove_attribute' | 'reroll_attributes' | 'gift_wrap' | 'unlock_skin' | 'unlock_gender' | 'rename_character' | 'bazar_sale_permit';
export type ItemRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'mestre' | 'legendary';

export interface StoreItem {
  id: string;
  _isGlobal?: boolean;
  _tenantId?: string | null;
  title: string;
  description: string;
  imageUrl?: string;
  cost: number;
  type: 'consumable' | 'equippable';
  gameEffect?: GameEffectType;
  hpCooldownReductionMinutes?: number;
  buffDurationHours?: number;
  usableInQuest?: boolean;
  minRankRequired: number | string; // Nome da patente (legado: índice numérico)
  active: boolean;
  gameModelUrl?: string; // URL para modelo 3D (ex: .glb)
  modelTextureUrl?: string; // URL da skin (textura) aplicada ao modelo .glb
  minecraftHeadValue?: string; // Base64 ou URL da textura do capacete Minecraft
  gameImage2dUrl?: string; // Imagem em lona completa (ex: 512x512) para o paper doll 2D
  avatarPart?: 'head' | 'face' | 'body' | 'legs' | 'feet' | 'hand' | 'two_handed' | 'accessory' | 'background' | 'pet';
  itemCategory?: ItemCategory;
  baseAttributeType?: AttributeType;
  baseAttributeValue?: number;
  rarity?: ItemRarity;
  minSalePrice?: number; // Preço mínimo que jogadores podem usar para revender no bazar
  modelTransforms?: ModelTransformsConfig;
  gachaConfig?: GachaConfig;
  fixedAttributes?: ItemAdd[];
  adds?: ItemAdd[];
  useGlobalGacha?: boolean;
  unlockedSkinId?: string;
  buffDurationDays?: number;
  backColor?: string;
  importedFromId?: string;
  extractMeshName?: string;
  damageEffect?: string; // Efeito especial de dano em batalha (burn, freeze, impact, electric, poison, none)
  battleSoundUrl?: string;
isForgeable?: boolean;
  forgeConfig?: any;
  isTransmutable?: boolean;
  isTransmuted?: boolean; // Item obtido SOMENTE por transmutação (não aparece na loja)
  transmuteConfig?: any;
}

const getRarityLabel = (rarity?: string) => {
  switch (rarity) {
    case 'legendary': return 'Lendário';
    case 'mestre': return 'Mestre';
    case 'epic': return 'Épico';
    case 'rare': return 'Raro';
    case 'uncommon': return 'Incomum';
    case 'common':
    default: return 'Comum';
  }
};

export default function AdminStoreManager({ pixabayKey }: { pixabayKey: string }) {
  const { showAlert, showConfirm } = useDialog();
  const { tenantId, isSuperAdmin } = useTenant();
  const { can: canItems } = usePermissions();
  const [items, setItems] = useState<StoreItem[]>([]);
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [loading, setLoading] = useState(true);
  const [tenantRanks, setTenantRanks] = useState<RankDef[]>([]);
  const [economyType, setEconomyType] = useState<'xp' | 'coins'>('coins');
  const [globalGachaConfig, setGlobalGachaConfig] = useState<GachaConfig | null>(null);
  const [presetSkins, setPresetSkins] = useState<{id: string, name: string, url: string, type?: string}[]>([]);
  
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  // true = veio do "Importar e Personalizar" do banco: salva SÓ a cópia local
  const [isImportCustomize, setIsImportCustomize] = useState(false);
  const [battleSoundPickerOpen, setBattleSoundPickerOpen] = useState(false);
  const [formData, setFormData] = useState<Partial<StoreItem>>({
    title: '', description: '', cost: 100, type: 'consumable', gameEffect: 'none', usableInQuest: false, minRankRequired: 0, active: true, imageUrl: '', rarity: 'common'
  });
  
  const [showGallery, setShowGallery] = useState<'image' | 'model' | null>(null);
  const [showTransformModal, setShowTransformModal] = useState(false);
  const [showMinecraftPreview, setShowMinecraftPreview] = useState(false);
  const [showExtractorModal, setShowExtractorModal] = useState(false);
  const [showGachaModal, setShowGachaModal] = useState(false);
  const [showItemBank, setShowItemBank] = useState(false);
  // Modal de seleção das opções para "Sincronizar do Banco"
  const [showSyncOptions, setShowSyncOptions] = useState(false);
  const [syncSelection, setSyncSelection] = useState<Record<string, boolean>>({});
  const [transformActiveTab, setTransformActiveTab] = useState<'common' | 'battle'>('common');

  // Item montado para PREVIEW 3D no personagem (config de posição e visualização da textura)
  const previewEquippedItems = useMemo(() => {
    const f = formData;
    const has3d = !!(f.gameModelUrl || f.modelTextureUrl || f.minecraftHeadValue);
    if (!has3d) return [] as any[];
    return [{
      itemId: f.title || 'item',
      docId: `preview_${f.title || 'item'}`,
      itemTitle: f.title || 'Item',
      imageUrl: f.imageUrl || '',
      avatarPart: (f.avatarPart || 'head') as any,
      itemCategory: 'attack',
      baseAttributeType: 'attack',
      baseAttributeValue: 0,
      gameModelUrl: f.gameModelUrl || '',
      modelTextureUrl: f.modelTextureUrl || '',
      minecraftHeadValue: f.minecraftHeadValue || '',
      modelTransforms: f.modelTransforms || undefined,
      adds: [],
    }] as any[];
  }, [formData]);
  
  const [layoutMode, setLayoutMode] = useState<'list' | 'grid-2' | 'grid-3' | 'small-icons' | 'large-icons'>(
    () => (localStorage.getItem('storeLayoutMode') as any) || 'list'
  );
  const [sortBy, setSortBy] = useState<'name' | 'rarity' | 'type'>(
    () => (localStorage.getItem('storeSortBy') as any) || 'name'
  );
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>(
    () => (localStorage.getItem('storeSortOrder') as any) || 'asc'
  );

  useEffect(() => {
    localStorage.setItem('storeLayoutMode', layoutMode);
    localStorage.setItem('storeSortBy', sortBy);
    localStorage.setItem('storeSortOrder', sortOrder);
  }, [layoutMode, sortBy, sortOrder]);

  useEffect(() => {
    fetchData();
  }, []);

  // Patente Mínima Exigida: usa SOMENTE as patentes LOCAIS do tenant atual
  // (nunca a global/de outros tenants). Sincroniza também o RANKS do jogo.
  const loadTenantRanks = async (tid?: string) => {
    try {
      let q = supabase.from('custom_ranks').select('*');
      if (tid) {
        q = q.eq('tenant_id', tid).eq('is_global', false);
      } else {
        q = q.eq('tenant_id', '00000000-0000-0000-0000-000000000001').eq('is_global', false);
      }
      const { data } = await q;
      const list: RankDef[] = (data || []).map(d => ({
        id: d.id,
        name: d.name,
        minXp: d.minXp,
        color: d.color,
        imageUrl: d.imageUrl,
        audioUrl: d.audioUrl,
        variants: d.variants,
        rankUpChestItems: d.rankUpChestItems,
        rankUpChestModelId: d.rankUpChestModelId,
        hideFromHistory: d.hide_from_history ?? d.hideFromHistory ?? (d.minXp === 0),
      })).sort((a, b) => a.minXp - b.minXp);
      setTenantRanks(list);
      RANKS.length = 0;
      RANKS.push(...list);
    } catch (e) {
      console.error('Erro ao carregar patentes do tenant:', e);
    }
  };

  useEffect(() => {
    loadTenantRanks(tenantId);
    /* eslint-disable-next-line */
  }, [tenantId]);

  const fetchData = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      // Fetch Economy Type (por escola)
      const econType = await fetchEconomyType(tenantId);
      setEconomyType(econType);

      // Fetch SOMENTE os itens locais da escola (os globais ficam no Banco de Itens)
      let itemsQuery = supabase.from('store_items').select('*');
      if (tenantId) {
        itemsQuery = itemsQuery.eq('tenant_id', tenantId);
      } else {
        // Sem tenant definido: não listar itens órfãos de outras escolas (evita o "limbo")
        itemsQuery = itemsQuery.eq('tenant_id', '00000000-0000-0000-0000-000000000001');
      }
      const { data: snap, error: snapErr } = await itemsQuery;
      if (snapErr) console.error('Erro ao buscar itens da loja:', snapErr);
      const loaded: StoreItem[] = [];
      (snap || []).forEach(row => loaded.push({ id: row.id, _isGlobal: row.is_global ?? false, _tenantId: row.tenant_id ?? null, ...row.data } as StoreItem));
      setItems(loaded);
    
    try {
      const { data: gachaSnap } = await supabase.from('system_collections').select('*').eq('collection_name', 'settings').eq('doc_id', 'gacha').single();
      if (gachaSnap) {
        setGlobalGachaConfig(gachaSnap.data as GachaConfig);
      }
    } catch (e) { console.error(e); }
    
    try {
      let skinsQuery = supabase.from('preset_skins').select('*');
      if (tenantId) {
        skinsQuery = skinsQuery.or(`is_global.eq.true,tenant_id.eq.${tenantId}`);
      }
      const { data: skinsSnap } = await skinsQuery;
      const loadedSkins: {id: string, name: string, url: string, type?: string, baseModelId?: string, genderTarget?: string}[] = [];
      (skinsSnap || []).forEach(row => {
        loadedSkins.push({
          id: row.id,
          name: row.name,
          url: row.url,
          type: row.type,
          baseModelId: row.baseModelId,
          genderTarget: row.genderTarget
        });
      });
      setPresetSkins(loadedSkins);
    } catch (e) { console.error(e); }
    } catch (err) {
      console.error('Erro em fetchData:', err);
    } finally {
      setLoading(false);
    }
  };

  // ---- Sincronização inteligente (diff) entre catálogo da escola e Banco de Itens ----
  // Chaves voláteis/identidade que não devem ser copiadas entre itens.
  const SYNC_EXCLUDE = new Set(['id', 'importedFromId', '_isGlobal', '_tenantId', '_rawId', 'extractMeshName']);

  // Opções sincronizáveis ao puxar do Banco para o tenant. Cada grupo cobre um
  // conjunto de chaves do `data` do item. Desmarcar um grupo preserva o valor
  // definido no tenant para aquelas chaves.
  const SYNC_GROUPS: { key: string; label: string; hint: string; keys: string[] }[] = [
    { key: 'image', label: 'Ícone / Imagem', hint: 'imageUrl', keys: ['imageUrl'] },
    { key: 'title', label: 'Nome do item', hint: 'title', keys: ['title'] },
    { key: 'description', label: 'Descrição', hint: 'description', keys: ['description'] },
    { key: 'price', label: 'Preço', hint: 'cost', keys: ['cost'] },
    { key: 'effect', label: 'Efeito do item (uso em missão, buffs, cooldown)', hint: 'gameEffect, usableInQuest, buffs', keys: ['gameEffect', 'usableInQuest', 'hpCooldownReductionMinutes', 'buffDurationHours', 'buffDurationDays', 'unlockedSkinId'] },
    { key: 'stats', label: 'Atributos / Poder (ataque, defesa, dano)', hint: 'fixedAttributes, baseAttribute, damageEffect', keys: ['baseAttributeType', 'baseAttributeValue', 'fixedAttributes', 'itemCategory', 'damageEffect'] },
    { key: 'rank', label: 'Patente mínima exigida', hint: 'minRankRequired', keys: ['minRankRequired'] },
    { key: 'model', label: 'Modelo 2D/3D', hint: 'gameModelUrl, textura, cabeça Minecraft, paper doll 2D', keys: ['gameModelUrl', 'modelTextureUrl', 'minecraftHeadValue', 'gameImage2dUrl', 'backColor'] },
    { key: 'transforms', label: 'Transformação 3D (Debug 3D)', hint: 'modelTransforms', keys: ['modelTransforms'] },
    { key: 'rarity', label: 'Raridade', hint: 'rarity', keys: ['rarity'] },
    { key: 'gacha', label: 'Configuração de Gacha', hint: 'gachaConfig', keys: ['gachaConfig', 'useGlobalGacha'] },
    { key: 'slot', label: 'Parte do corpo (slot)', hint: 'avatarPart', keys: ['avatarPart'] },
    { key: 'active', label: 'Disponível na loja', hint: 'active', keys: ['active'] },
    { key: 'sale', label: 'Bazar (preço mínimo de revenda)', hint: 'minSalePrice', keys: ['minSalePrice'] },
  ];

  const deepEqualSync = (a: any, b: any): boolean => {
    if (a === b) return true;
    if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    return ka.every(k => deepEqualSync(a[k], b[k]));
  };

  // Mescla "source" em "target" aplicando APENAS o que for diferente (comparação
  // profunda). Nunca remove chaves que o source não possui. Retorna o objeto
  // resultante e se houve mudança. `allowedKeys` limita a sincronização às
  // chaves marcadas no modal de opções.
  const mergeDeepChanged = (target: any, source: any, allowedKeys?: Set<string>): { result: any; changed: boolean } => {
    if (source === null || source === undefined) return { result: target, changed: false };
    if (typeof source !== 'object' || Array.isArray(source)) {
      const changed = !deepEqualSync(target, source);
      return { result: changed ? JSON.parse(JSON.stringify(source)) : target, changed };
    }
    if (target && typeof target === 'object' && !Array.isArray(target)) {
      const result: any = { ...target };
      let changed = false;
      for (const k of Object.keys(source)) {
        if (SYNC_EXCLUDE.has(k)) continue;
        if (allowedKeys && !allowedKeys.has(k)) continue;
        const sVal = source[k];
        if (sVal === null || sVal === undefined) {
          if (result[k] !== undefined && result[k] !== null) {
            result[k] = null;
            changed = true;
          }
          continue;
        }
        // Objetos (modelTransforms, gachaConfig etc.): sincronização AUTORITATIVA —
        // se o objeto difere, substitui pelo do source (não mescla sub-chaves, para não
        // deixar configurações antigas/misturadas que causam diferenças de funcionamento).
        if (typeof sVal === 'object' && !Array.isArray(sVal)) {
          if (!deepEqualSync(result[k], sVal)) {
            result[k] = JSON.parse(JSON.stringify(sVal));
            changed = true;
          }
          continue;
        }
        const { result: r, changed: c } = mergeDeepChanged(result[k], sVal);
        if (c) {
          result[k] = r;
          changed = true;
        }
      }
      return { result, changed };
    }
    const changed = !deepEqualSync(target, source);
    return { result: changed ? JSON.parse(JSON.stringify(source)) : target, changed };
  };

  // Espelha os campos do data nas colunas da tabela store_items.
  const deriveStoreColumns = (data: any) => ({
    name: data.title || '',
    description: data.description || '',
    type: data.type || 'consumable',
    price: typeof data.cost === 'number' ? data.cost : Number(data.cost || 0),
    image_url: data.imageUrl || data.image_url || '',
    active: data.active ?? true,
    rarity: data.rarity || 'common',
    avatar_part: data.avatarPart || null
  });

  // Encontra o item local que corresponde a um item do Banco:
  // 1) vínculo EXATO por importedFromId (mesmo que o nome/efeito tenha sido alterado no tenant);
  // 2) fallback por nome + tipo + efeito.
  const findLocalMatch = (localRows: any[], bankData: any, bankId: string) => {
    const norm = (s?: string) => (s || '').trim().toLowerCase();
    const byLink = (localRows || []).find(l => {
      const ld = l.data || {};
      return ld.importedFromId && ld.importedFromId === bankId;
    });
    if (byLink) return byLink;
    return (localRows || []).find(l => {
      const ld = l.data || {};
      return norm(ld.title) === norm(bankData.title)
        && (ld.type || '') === (bankData.type || '')
        && (ld.gameEffect || 'none') === (bankData.gameEffect || 'none');
    });
  };

  // Superadmin: sincroniza o catálogo DESTA escola com o Banco de Itens (global).
  // Compara item por item (nome/tipo/efeito) e aplica APENAS os ajustes que
  // realmente diferem: ícone, nome, atributos, custo, transformação 3D (Debug 3D)
  // etc. Não cria cópia e não sobrescreve itens iguais.
  const syncCatalogToBank = async () => {
    if (!isSuperAdmin) return;
    const confirmed = await showConfirm(
      'Sincronizar o catálogo DESTA escola com o Banco de Itens?\n\nTodos os ajustes feitos nesta escola (ícone, nome, atributos, custo, transformação 3D do Debug 3D etc.) serão comparados e aplicados ao Banco de Itens — apenas nos itens que realmente mudaram. Nenhum item é criado.'
    );
    if (!confirmed) return;
    if (!tenantId) { showAlert('Selecione uma escola para sincronizar.'); return; }
    setLoading(true);
    try {
      const { data: localRows } = await supabase.from('store_items').select('*').eq('tenant_id', tenantId);
      const { data: bankRows } = await supabase.from('store_items').select('*').eq('is_global', true);

      // @ts-ignore
      const norm = (s?: string) => (s || '').trim().toLowerCase();
      let matched = 0, updated = 0, unchanged = 0;

      for (const bank of (bankRows || [])) {
        const bankData = bank.data || {};
        const local = findLocalMatch(localRows, bankData, bank.id);
        if (!local) continue;
        matched++;
        const localData = local.data || {};
        const { result, changed } = mergeDeepChanged(bankData, localData);
        if (!changed) { unchanged++; continue; }
        const columns = deriveStoreColumns(result);
        const { error } = await supabase.from('store_items').update({ data: result, ...columns }).eq('id', bank.id);
        if (!error) updated++; else console.error('Erro ao sincronizar item do banco:', error);
      }
      showAlert(`Sincronização com o Banco concluída: ${updated} item(ns) atualizado(s), ${unchanged} já estavam iguais (de ${matched} correspondências por nome/tipo/efeito).`);
    } catch (e) {
      console.error(e);
      showAlert('Erro ao sincronizar: ' + ((e as any)?.message || 'erro desconhecido'));
    } finally {
      setLoading(false);
    }
  };

  // Superadmin: abre o modal de seleção das opções que serão sincronizadas do
  // Banco de Itens para o catálogo DESTA escola. Cada opção marcada é comparada
  // e aplicada; as desmarcadas preservam o valor já definido no tenant.
  const syncCatalogFromBank = async () => {
    if (!isSuperAdmin) return;
    if (!tenantId) { showAlert('Selecione a escola que será atualizada.'); return; }
    const init: Record<string, boolean> = {};
    SYNC_GROUPS.forEach(g => { init[g.key] = true; });
    setSyncSelection(init);
    setShowSyncOptions(true);
  };

  // Executa a sincronização do Banco para a escola atual, respeitando a seleção.
  const runSyncFromBank = async (selection: Record<string, boolean>) => {
    const allowedKeys = new Set<string>();
    SYNC_GROUPS.forEach(g => {
      if (selection[g.key]) g.keys.forEach(k => allowedKeys.add(k));
    });
    if (allowedKeys.size === 0) {
      showAlert('Nenhuma opção selecionada — nada será sincronizado.');
      return;
    }
    setShowSyncOptions(false);
    setLoading(true);
    try {
      const { data: localRows } = await supabase.from('store_items').select('*').eq('tenant_id', tenantId);
      const { data: bankRows } = await supabase.from('store_items').select('*').eq('is_global', true);

      // @ts-ignore
      const norm = (s?: string) => (s || '').trim().toLowerCase();
      let matched = 0, updated = 0, unchanged = 0;

      for (const bank of (bankRows || [])) {
        const bankData = bank.data || {};
        const local = findLocalMatch(localRows, bankData, bank.id);
        if (!local) continue;
        matched++;
        const localData = local.data || {};
        const { result, changed } = mergeDeepChanged(localData, bankData, allowedKeys);
        if (!changed) { unchanged++; continue; }
        const columns = deriveStoreColumns(result);
        const { error } = await supabase.from('store_items').update({ data: result, ...columns }).eq('id', local.id);
        if (error) { console.error('Erro ao atualizar item local:', error); continue; }
        updated++;

        // Cascateia a nova configuração (principalmente modelTransforms do Debug 3D)
        // para os inventários dos jogadores desta escola que já possuem o item.
        const { data: userItems } = await supabase.from('user_items').select('id, data').eq('item_id', local.id);
        if (userItems) {
          for (const ui of userItems) {
            const uiData = ui.data || {};
            const { result: uiResult, changed: uiChanged } = mergeDeepChanged(uiData, result, allowedKeys);
            if (uiChanged) {
              await supabase.from('user_items').update({ data: uiResult }).eq('id', ui.id);
            }
          }
        }
      }
      showAlert(`Atualização a partir do Banco concluída: ${updated} item(ns) desta escola atualizado(s), ${unchanged} já estavam iguais (de ${matched} correspondências por nome/tipo/efeito).`);
    } catch (e) {
      console.error(e);
      showAlert('Erro ao sincronizar: ' + ((e as any)?.message || 'erro desconhecido'));
    } finally {
      setLoading(false);
    }
  };

  const handleImportFromBank = async (item: any, copyMode: 'direct' | 'customize') => {
    const newItem: Partial<StoreItem> = {
      title: item.title || 'Sem nome',
      description: item.description || '',
      cost: item.cost || 100,
      type: item.type || 'consumable',
      imageUrl: item.imageUrl || '',
      gameModelUrl: item.gameModelUrl || '',
      modelTextureUrl: item.modelTextureUrl || '',
      minecraftHeadValue: item.minecraftHeadValue || '',
      rarity: item.rarity || 'common',
      active: true,
      minRankRequired: item.minRankRequired || '',
      usableInQuest: !!item.usableInQuest,
      gameEffect: item.gameEffect || 'none',
      unlockedSkinId: item.unlockedSkinId || '',
      buffDurationDays: item.buffDurationDays,
      avatarPart: item.avatarPart,
      itemCategory: item.itemCategory,
      damageEffect: item.damageEffect || 'none',
      baseAttributeType: item.baseAttributeType,
      baseAttributeValue: item.baseAttributeValue,
      fixedAttributes: item.fixedAttributes,
      backColor: item.backColor,
      extractMeshName: item.extractMeshName,
      // Campos que estavam sendo perdidos na cópia (Debug 3D e outros):
      modelTransforms: item.modelTransforms || null,
      hpCooldownReductionMinutes: item.hpCooldownReductionMinutes,
      buffDurationHours: item.buffDurationHours,
      gameImage2dUrl: item.gameImage2dUrl || '',
      minSalePrice: item.minSalePrice || 0,
      gachaConfig: item.gachaConfig || null,
      useGlobalGacha: item.useGlobalGacha ?? true,
    };

    if (copyMode === 'direct') {
      // Importar direto - salvar no banco (cópia LOCAL, sem duplicar)
      const itemData = {
        ...newItem,
        cost: Number(newItem.cost),
        minRankRequired: 0,
        minSalePrice: 0,
        importedFromId: item._rawId || null,
      };

      // DEDUP: se esta escola já importou este item, não duplicar
      const already = (items || []).find((i: any) =>
        (i as any).importedFromId && (i as any).importedFromId === item._rawId
      );
      if (already) {
        await showAlert('Item já importado', `"${item.title}" já existe na loja desta escola. Para evitar duplicatas, ele não foi importado de novo.`);
        return;
      }

      await supabase.from('store_items').insert({
        name: itemData.title,
        description: itemData.description,
        type: itemData.type,
        price: itemData.cost,
        image_url: itemData.imageUrl,
        active: itemData.active,
        rarity: itemData.rarity,
        data: itemData,
        tenant_id: tenantId || null,
        is_global: false
      });

      await showAlert('Sucesso', `Item "${item.title}" importado com sucesso!`);
      fetchData(false);
    } else {
      // Importar e personalizar - abrir editor (cópia local, NÃO cria global)
      setIsImportCustomize(true);
      setFormData({ ...newItem, importedFromId: item._rawId || null });
      setEditingId(null);
      setIsEditing(true);
    }
  };

  // Importar vários itens do banco de itens de uma vez (cópia direta)
  const handleImportMultipleFromBank = async (items: any[]) => {
    if (items.length === 0) return;
    let imported = 0;
    let errors = 0;
    let skipped = 0;
    for (const item of items) {
      try {
        // DEDUP: pular itens já importados por esta escola
        const already = (items || []).find((i: any) =>
          (i as any).importedFromId && (i as any).importedFromId === item._rawId
        );
        if (already) {
          skipped++;
          continue;
        }
        const itemData = {
          title: item.title || 'Sem nome',
          description: item.description || '',
          cost: Number(item.cost) || 100,
          type: item.type || 'consumable',
          imageUrl: item.imageUrl || '',
          gameModelUrl: item.gameModelUrl || '',
          modelTextureUrl: item.modelTextureUrl || '',
          minecraftHeadValue: item.minecraftHeadValue || '',
          rarity: item.rarity || 'common',
          active: true,
          minRankRequired: item.minRankRequired || '',
          usableInQuest: !!item.usableInQuest,
          gameEffect: item.gameEffect || 'none',
          unlockedSkinId: item.unlockedSkinId || '',
          buffDurationDays: item.buffDurationDays,
          avatarPart: item.avatarPart,
          itemCategory: item.itemCategory,
          damageEffect: item.damageEffect || 'none',
          baseAttributeType: item.baseAttributeType,
          baseAttributeValue: item.baseAttributeValue,
          fixedAttributes: item.fixedAttributes,
          backColor: item.backColor,
          extractMeshName: item.extractMeshName,
          modelTransforms: item.modelTransforms || null,
          hpCooldownReductionMinutes: item.hpCooldownReductionMinutes,
          buffDurationHours: item.buffDurationHours,
          gameImage2dUrl: item.gameImage2dUrl || '',
          gachaConfig: item.gachaConfig || null,
          useGlobalGacha: item.useGlobalGacha ?? true,
          minSalePrice: 0,
          importedFromId: item._rawId || null,
        };
        const { error } = await supabase.from('store_items').insert({
          name: itemData.title,
          description: itemData.description,
          type: itemData.type,
          price: itemData.cost,
          image_url: itemData.imageUrl,
          active: itemData.active,
          rarity: itemData.rarity,
          data: itemData,
          tenant_id: tenantId || null,
          is_global: false
        });
        if (error) {
          console.error('Erro ao importar item:', item.title, error);
          errors++;
        } else {
          imported++;
        }
      } catch (e) {
        console.error('Erro ao importar item:', item.title, e);
        errors++;
      }
    }
    await showAlert('Importação concluída', `${imported} item(ns) importado(s) com sucesso.${skipped > 0 ? ` ${skipped} já estavam importados e foram ignorados.` : ''}${errors > 0 ? ` ${errors} falharam.` : ''}`);
    fetchData(false);
  };

  const handleSaveItem = async () => {
    if (!formData.title || !formData.cost) return;

    // Permissões: editar exige 'update', criar exige 'create'
    if (editingId && !canItems('items', 'update')) {
      await showAlert('Sem permissão', 'Sua função não permite editar itens.');
      return;
    }
    if (!editingId && !canItems('items', 'create')) {
      await showAlert('Sem permissão', 'Sua função não permite criar itens.');
      return;
    }

    // Itens globais (sem tenant) só podem ser editados pelo superadmin
    if (editingId) {
      const editingItem = items.find(i => i.id === editingId);
      if (editingItem?._isGlobal && !editingItem?._tenantId && !isSuperAdmin) {
        await showAlert('Item global (somente leitura)', 'Itens globais pertencem ao banco de itens e só podem ser editados pelo superadmin. Use "Importar da Loja" para criar uma cópia local para a sua escola.');
        return;
      }
    }

    const itemData = {
      ...formData,
      cost: Number(formData.cost),
      minRankRequired: String(formData.minRankRequired || ''),
      minSalePrice: formData.minSalePrice ? Number(formData.minSalePrice) : 0,
    };

    if (editingId) {
      await supabase.from('store_items').update({
        name: itemData.title, description: itemData.description, type: itemData.type,
        price: itemData.cost, image_url: itemData.imageUrl, active: itemData.active,
        rarity: itemData.rarity, avatar_part: itemData.avatarPart, data: itemData
      }).eq('id', editingId);

      // Cascade update retroativo para itens já no inventário dos alunos.
      // Propaga para TODAS as cópias relacionadas (não só o item editado):
      //  - o próprio item (compra direta);
      //  - a origem global (se for uma cópia importada);
      //  - todas as cópias locais que vieram da MESMA origem global (outros tenants).
      // Assim, itens comprados ANTES de adicionar imagens 2D/3D ficam funcionais
      // após a edição, sem precisar comprar de novo.
      let cascadeIds = new Set<string>([editingId]);
      try {
        const { data: editingRow } = await supabase.from('store_items').select('data').eq('id', editingId).maybeSingle();
        const importedFromId = (editingRow?.data as any)?.importedFromId;
        const sourceId = importedFromId || editingId;
        const { data: related } = await supabase.from('store_items').select('id')
          .eq('is_global', false)
          .filter('data->>importedFromId', 'eq', sourceId);
        if (sourceId !== editingId) cascadeIds.add(sourceId);
        (related || []).forEach(r => cascadeIds.add(r.id));
      } catch (e) {
        console.error('Erro ao calcular itens relacionados para cascade:', e);
      }

      const { data: snapUserItems } = await supabase.from('user_items').select('*').in('item_id', Array.from(cascadeIds));
      const updatePromises: Promise<any>[] = [];
      (snapUserItems || []).forEach(row => {
        const currentData = row.data as any;
        const newData = { ...currentData,
          itemCategory: itemData.itemCategory || 'none',
          damageEffect: itemData.damageEffect || 'none',
          baseAttributeType: itemData.baseAttributeType || 'none',
          baseAttributeValue: itemData.baseAttributeValue || 0,
          itemTitle: itemData.title,
          itemImageUrl: itemData.imageUrl || '',
          imageUrl: itemData.imageUrl || '',
          gameImage2dUrl: itemData.gameImage2dUrl || '',
          itemType: itemData.type || 'consumable',
          gameEffect: itemData.gameEffect || 'none',
          gameModelUrl: itemData.gameModelUrl || '',
          modelTextureUrl: itemData.modelTextureUrl || '',
          minecraftHeadValue: itemData.minecraftHeadValue || '',
          avatarPart: itemData.avatarPart || null,
          usableInQuest: itemData.usableInQuest || false,
          modelTransforms: itemData.modelTransforms || null,
          gachaConfig: itemData.gachaConfig || null,
          fixedAttributes: itemData.fixedAttributes || null,
          useGlobalGacha: itemData.useGlobalGacha ?? true,
          unlockedSkinId: itemData.unlockedSkinId || '',
          buffDurationDays: itemData.buffDurationDays || 7,
          hpCooldownReductionMinutes: itemData.hpCooldownReductionMinutes || null,
          buffDurationHours: itemData.buffDurationHours || null,
          backColor: itemData.backColor || '',
          extractMeshName: itemData.extractMeshName || null,
          isForgeable: true,
          forgeConfig: itemData.forgeConfig || null,
          isTransmutable: itemData.isTransmutable || false,
          transmuteConfig: itemData.transmuteConfig || null
        };
        updatePromises.push(supabase.from('user_items').update({ data: newData }).eq('id', row.id) as any);
      });
      await Promise.all(updatePromises);
      // Invalida o cache de itens equipados de TODOS os alunos afetados (para o
      // boneco refletir a nova configuração sem recarregar a página).
      const affectedStudents = new Set<string>();
      (snapUserItems || []).forEach((row: any) => { if (row.student_id) affectedStudents.add(row.student_id); });
      affectedStudents.forEach(uid => invalidateEquippedItems(uid));
      
    } else {
      // Cópia local (da escola) — editável pelo admin local
      await supabase.from('store_items').insert({
        name: itemData.title, description: itemData.description, type: itemData.type,
        price: itemData.cost, image_url: itemData.imageUrl, active: itemData.active,
        rarity: itemData.rarity, avatar_part: itemData.avatarPart, data: itemData,
        tenant_id: tenantId || null,
        is_global: false
      });
      // Só a CRIAÇÃO MANUAL cria também a cópia-base GLOBAL (banco de itens).
      // Importações (importadoFromId presente) NÃO geram global.
      if (!itemData.importedFromId && !isImportCustomize) {
        await supabase.from('store_items').insert({
          id: uuidv4(),
          name: itemData.title, description: itemData.description, type: itemData.type,
          price: itemData.cost, image_url: itemData.imageUrl, active: itemData.active,
          rarity: itemData.rarity, avatar_part: itemData.avatarPart, data: itemData,
          tenant_id: null,
          is_global: true
        });
      }
    }

    setIsEditing(false);
    setEditingId(null);
    setIsImportCustomize(false);
    setFormData({ title: '', description: '', cost: 100, type: 'consumable', gameEffect: 'none', minRankRequired: 0, active: true, imageUrl: '' });
    fetchData(false);
  };

  const handleDeleteItem = async (id: string) => {
    if (!canItems('items', 'delete')) {
      await showAlert('Sem permissão', 'Sua função não permite excluir itens.');
      return;
    }
    const target = items.find(i => i.id === id);
    if (target?._isGlobal && !target?._tenantId && !isSuperAdmin) {
      await showAlert('Item global (somente leitura)', 'Itens globais só podem ser excluídos pelo superadmin.');
      return;
    }
    const confirmed = await showConfirm('Tem certeza que deseja apagar este item?');
    if (confirmed) {
      await supabase.from('store_items').delete().eq('id', id);
      fetchData(false);
    }
  };

  const openEdit = (item: StoreItem) => {
    setFormData({ ...item, minRankRequired: resolveMinRankName(item.minRankRequired) });
    setEditingId(item.id);
    setIsEditing(true);
  };

  // Superadmin edita um item GLOBAL do banco (abre o mesmo editor; salvar atualiza o global)
  const openEditGlobal = (item: any) => {
    setFormData({ ...item, id: item._rawId, _isGlobal: true, minRankRequired: resolveMinRankName(item.minRankRequired) } as StoreItem);
    setEditingId(item._rawId);
    setIsEditing(true);
  };

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Carregando Loja...</div>;

  return (
    <div style={{ animation: 'fadeIn 0.3s ease-out' }}>
      
      {showGallery && createPortal(
        <ImageGalleryModal 
          apiKey={pixabayKey}
          onClose={() => setShowGallery(null)}
          onSelectImage={(url) => {
            if (showGallery === 'model') {
              setFormData({ ...formData, gameModelUrl: url });
            } else {
              setFormData({ ...formData, imageUrl: url });
            }
            setShowGallery(null);
          }}
        />,
        document.body
      )}

      {/* Store Manager */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        
        {/* Store Catalog Section */}
        <div className="dashboard-header-sticky" style={{ position: 'sticky', top: '-2rem', zIndex: 40, background: 'var(--bg-card)', padding: '1rem 2rem', margin: '-2rem -2rem 1rem -2rem', backdropFilter: 'blur(10px)', borderTopLeftRadius: '16px', borderTopRightRadius: '16px', borderBottom: '1px solid var(--border-glass)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: '1.5rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Star color="var(--gold-primary)" /> Catálogo de Itens
            </h2>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              {isSuperAdmin && (
                <button className="login-btn" onClick={syncCatalogToBank} style={{ padding: '0.5rem 1rem', display: 'flex', gap: '0.5rem', alignItems: 'center', background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.4)' }} title="Compara o catálogo desta escola com o Banco de Itens e aplica no banco apenas os itens que sofreram modificações (ícone, nome, atributos, transformação 3D do Debug 3D etc.)">
                  <RefreshCcw size={18} /> Sincronizar com o Banco
                </button>
              )}
              {isSuperAdmin && (
                <button className="login-btn" onClick={syncCatalogFromBank} style={{ padding: '0.5rem 1rem', display: 'flex', gap: '0.5rem', alignItems: 'center', background: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6', border: '1px solid rgba(59, 130, 246, 0.4)' }} title="Aplica as configurações ATUAIS do Banco de Itens no catálogo desta escola (atualiza tenants que ainda estão com as configurações antigas)">
                  <RefreshCcw size={18} /> Sincronizar do Banco
                </button>
              )}
              {canItems('items', 'create') && (
                <button className="login-btn" onClick={() => setShowItemBank(true)} style={{ padding: '0.5rem 1rem', display: 'flex', gap: '0.5rem', alignItems: 'center', background: 'rgba(139, 92, 246, 0.2)', color: '#8b5cf6', border: '1px solid rgba(139, 92, 246, 0.3)' }}>
                  <Package size={18} /> Banco de Itens
                </button>
              )}
              {canItems('items', 'create') && (
                <button className="login-btn" onClick={() => { setEditingId(null); setFormData({ title: '', description: '', cost: 100, type: 'consumable', gameEffect: 'none', usableInQuest: false, minRankRequired: 0, active: true, imageUrl: '', rarity: 'common', minSalePrice: 0 }); setIsEditing(true); }} style={{ padding: '0.5rem 1rem', display: 'flex', gap: '0.5rem', alignItems: 'center', background: 'var(--gold-primary)', color: 'var(--text-on-gold, #000000)', border: 'none' }}>
                  <Plus size={18} /> Novo Item
                </button>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center', padding: '0.5rem 0', borderBottom: '1px solid rgba(255,255,255,0.05)', marginBottom: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Ordenar por:</span>
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)} style={{ background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', padding: '0.3rem 0.5rem', borderRadius: '4px', fontSize: '0.9rem' }}>
                <option value="name">Nome</option>
                <option value="rarity">Raridade</option>
                <option value="type">Tipo</option>
              </select>
              <button onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')} style={{ background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', padding: '0.3rem', borderRadius: '4px', cursor: 'pointer', display: 'flex' }} title="Alterar Direção">
                {sortOrder === 'asc' ? <ArrowDownAZ size={18} /> : <ArrowUpZA size={18} />}
              </button>
            </div>
            
            <div style={{ flex: 1 }} />
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', background: 'rgba(0,0,0,0.2)', padding: '0.25rem', borderRadius: '6px' }}>
              <button onClick={() => setLayoutMode('list')} style={{ background: layoutMode === 'list' ? 'rgba(255,255,255,0.1)' : 'transparent', border: 'none', color: layoutMode === 'list' ? 'var(--gold-primary)' : 'var(--text-secondary)', padding: '0.4rem', borderRadius: '4px', cursor: 'pointer' }} title="Lista 1 Coluna"><List size={18} /></button>
              <button onClick={() => setLayoutMode('grid-2')} style={{ background: layoutMode === 'grid-2' ? 'rgba(255,255,255,0.1)' : 'transparent', border: 'none', color: layoutMode === 'grid-2' ? 'var(--gold-primary)' : 'var(--text-secondary)', padding: '0.4rem', borderRadius: '4px', cursor: 'pointer' }} title="Lista 2 Colunas"><Columns size={18} /></button>
              <button onClick={() => setLayoutMode('grid-3')} style={{ background: layoutMode === 'grid-3' ? 'rgba(255,255,255,0.1)' : 'transparent', border: 'none', color: layoutMode === 'grid-3' ? 'var(--gold-primary)' : 'var(--text-secondary)', padding: '0.4rem', borderRadius: '4px', cursor: 'pointer' }} title="Lista 3 Colunas"><LayoutList size={18} /></button>
              <button onClick={() => setLayoutMode('small-icons')} style={{ background: layoutMode === 'small-icons' ? 'rgba(255,255,255,0.1)' : 'transparent', border: 'none', color: layoutMode === 'small-icons' ? 'var(--gold-primary)' : 'var(--text-secondary)', padding: '0.4rem', borderRadius: '4px', cursor: 'pointer' }} title="Grid Ícones Pequenos"><Grid size={18} /></button>
              <button onClick={() => setLayoutMode('large-icons')} style={{ background: layoutMode === 'large-icons' ? 'rgba(255,255,255,0.1)' : 'transparent', border: 'none', color: layoutMode === 'large-icons' ? 'var(--gold-primary)' : 'var(--text-secondary)', padding: '0.4rem', borderRadius: '4px', cursor: 'pointer' }} title="Grid Ícones Grandes"><LayoutGrid size={18} /></button>
            </div>
          </div>
        </div>

          <div style={
            layoutMode === 'grid-2' ? { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem' } :
            layoutMode === 'grid-3' ? { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '1rem' } :
            layoutMode === 'small-icons' ? { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: '1rem' } :
            layoutMode === 'large-icons' ? { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '1.5rem' } :
            { display: 'flex', flexDirection: 'column', gap: '1rem' }
          }>
            {(() => {
              const RARITY_WEIGHTS: any = { common: 1, uncommon: 2, rare: 3, epic: 4, legendary: 5 };
              const sortedItems = [...items].sort((a, b) => {
                let comparison = 0;
                if (sortBy === 'name') {
                  comparison = a.title.localeCompare(b.title);
                } else if (sortBy === 'rarity') {
                  const wA = RARITY_WEIGHTS[a.rarity || 'common'] || 1;
                  const wB = RARITY_WEIGHTS[b.rarity || 'common'] || 1;
                  comparison = wA - wB;
                } else if (sortBy === 'type') {
                  comparison = a.type.localeCompare(b.type);
                }
                return sortOrder === 'asc' ? comparison : -comparison;
              });

              return sortedItems.map(item => {
                const isGridIcon = layoutMode === 'small-icons' || layoutMode === 'large-icons';
                // grid-2/grid-3 empilham verticalmente (senão os botões estouram a célula)
                const isGridMode = layoutMode === 'grid-2' || layoutMode === 'grid-3' || isGridIcon;
                const imgSize = layoutMode === 'small-icons' ? '80px' : layoutMode === 'large-icons' ? '140px' : '50px';
                const isGlobalReadonly = item._isGlobal && !item._tenantId;
                
                return (
                  <div key={item.id} 
                    className={`rarity-${item.rarity || 'common'}`}
                    onMouseEnter={() => setHoveredItem(item.id)}
                    onMouseLeave={() => setHoveredItem(null)}
                    onMouseMove={(e) => setMousePos({ x: e.clientX, y: e.clientY })}
                    style={{ position: 'relative', display: 'flex', flexDirection: isGridMode ? 'column' : 'row', alignItems: 'center', justifyContent: isGridMode ? 'center' : 'space-between', padding: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', textAlign: isGridMode ? 'center' : 'left', minWidth: 0, overflow: 'hidden' }}>
                    <div style={{ display: 'flex', flexDirection: isGridMode ? 'column' : 'row', alignItems: 'center', gap: '1rem', width: isGridMode ? '100%' : 'auto', minWidth: 0 }}>
                      <div className={`rarity-badge ${item.rarity || 'common'}`}>
                        {getRarityLabel(item.rarity)}
                      </div>
                      {item.gameEffect === 'unlock_skin' && item.unlockedSkinId ? (
                        <SkinBuffIcon skinUrl={item.unlockedSkinId} durationDays={item.buffDurationDays || 7} size={parseInt(imgSize)} />
                      ) : (
                        <ItemIcon item={item} size={parseInt(imgSize)} />
                      )}
                      <div style={{ flex: 1, minWidth: 0, width: isGridMode ? '100%' : 'auto' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: isGridMode ? 'center' : 'flex-start', gap: '0.5rem', flexWrap: 'wrap' }}>
                          <h4 style={{ margin: '0', fontSize: isGridMode ? '0.95rem' : '1.1rem', whiteSpace: isGridMode ? 'nowrap' : 'normal', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%', color: `var(--rarity-${item.rarity || 'common'})` }}>{item.title}</h4>
                          {item._isGlobal && !item._tenantId && (
                            <span style={{ fontSize: '0.7rem', background: 'rgba(139,92,246,0.2)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.4)', padding: '0.1rem 0.5rem', borderRadius: '10px', whiteSpace: 'nowrap' }} title="Item do banco global (somente leitura para esta escola)">
                              Global
                            </span>
                          )}
                        </div>
                        {isGridMode ? (
                          <div style={{ fontSize: '0.85rem', color: 'var(--gold-primary)', fontWeight: 'bold', marginTop: '0.25rem' }}>
                            {item.cost} {economyType === 'coins' ? 'Moedas' : 'XP'}
                          </div>
                        ) : (
                          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                            <span>Custo: <strong style={{ color: 'var(--gold-primary)' }}>{item.cost} {economyType === 'coins' ? 'Moedas' : 'XP'}</strong></span>
                            <span>Tipo: {item.type === 'consumable' ? 'Consumível' : 'Equipável'}</span>
                            <span>Patente Mínima: {resolveMinRankName(item.minRankRequired) || 'Sem Patente'}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: isGridMode ? '0.75rem' : '0' }}>
                      <button onClick={() => openEdit(item)} disabled={(!canItems('items', 'update') && !isSuperAdmin) || (isGlobalReadonly && !isSuperAdmin)} style={{ background: 'transparent', border: '1px solid var(--border-glass)', borderRadius: '6px', color: 'var(--text-secondary)', cursor: ((!canItems('items', 'update') && !isSuperAdmin) || (isGlobalReadonly && !isSuperAdmin)) ? 'not-allowed' : 'pointer', padding: '0.4rem', display: 'flex', opacity: ((!canItems('items', 'update') && !isSuperAdmin) || (isGlobalReadonly && !isSuperAdmin)) ? 0.4 : 1 }} title={isGlobalReadonly && !isSuperAdmin ? 'Global (somente leitura) — importe para criar uma cópia local' : !canItems('items', 'update') && !isSuperAdmin ? 'Sem permissão para editar' : 'Editar'}><Edit2 size={16} /></button>
                      <button onClick={() => handleDeleteItem(item.id)} disabled={(!canItems('items', 'delete') && !isSuperAdmin) || (isGlobalReadonly && !isSuperAdmin)} style={{ background: 'transparent', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '6px', color: 'var(--accent-red)', cursor: ((!canItems('items', 'delete') && !isSuperAdmin) || (isGlobalReadonly && !isSuperAdmin)) ? 'not-allowed' : 'pointer', padding: '0.4rem', display: 'flex', opacity: ((!canItems('items', 'delete') && !isSuperAdmin) || (isGlobalReadonly && !isSuperAdmin)) ? 0.4 : 1 }} title={isGlobalReadonly && !isSuperAdmin ? 'Global (somente leitura)' : !canItems('items', 'delete') && !isSuperAdmin ? 'Sem permissão para excluir' : 'Excluir'}><Trash2 size={16} /></button>
                    </div>
                  </div>
                );
              });
            })()}
            {items.length === 0 && (
              <p style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '2rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>Nenhum item cadastrado na loja.</p>
            )}
          </div>
        </div>

      {/* Modal Novo/Editar Item */}
      {isEditing && createPortal(
        <div className="modal-overlay">
          <div className="glass-panel modal-content" style={{ padding: '0', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}>
            <div style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-card)', padding: '1.5rem 2rem', borderBottom: '1px solid var(--border-glass)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1.5rem' }}>{editingId ? 'Editar Item' : 'Criar Novo Item'}</h3>
              <button onClick={() => { setIsEditing(false); setEditingId(null); }} style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer' }}>
                <Trash2 size={24} style={{ display: 'none' }} />
                <span style={{ fontSize: '1.5rem', lineHeight: 1 }}>×</span>
              </button>
            </div>
            <div style={{ padding: '1.5rem 2rem', overflowY: 'auto' }}>
            
            {/* Linha 1: Nome e Tipo */}
            <div className="responsive-grid" style={{ marginBottom: '1.5rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Nome do Item</label>
                <input type="text" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} placeholder="Ex: Voucher +1 Ponto" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)' }} />
              </div>
              
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Tipo de Item</label>
                <select value={formData.type} onChange={e => setFormData({...formData, type: e.target.value as any})} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)' }}>
                  <option value="consumable">Consumível (Usa 1x)</option>
                  <option value="equippable">Equipável (Ex: Título)</option>
                  <option value="other">Outros / Diversos (materiais, drop de monstros/baú — não aparece na loja)</option>
                </select>
              </div>
            </div>

            {/* Linha 2: Valores e Raridade */}
            <div className="responsive-grid" style={{ marginBottom: '1.5rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Custo ({economyType === 'coins' ? 'Moedas' : 'XP'})</label>
                <input type="number" value={formData.cost} onChange={e => setFormData({...formData, cost: Number(e.target.value)})} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)' }} />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Preço Mín. de Revenda (Bazar)</label>
                <input
                  type="number"
                  min={0}
                  value={formData.minSalePrice ?? 0}
                  onChange={e => setFormData({...formData, minSalePrice: Number(e.target.value)})}
                  style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(251,191,36,0.4)', color: 'white' }}
                  placeholder="0 = sem restrição"
                />
                <p style={{ margin: '0.35rem 0 0 0', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  0 = Venda livre
                </p>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Raridade</label>
                <select value={formData.rarity || 'common'} onChange={e => setFormData({...formData, rarity: e.target.value as ItemRarity})} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)' }}>
                  <option value="common">Comum (Branco)</option>
                  <option value="uncommon">Incomum (Verde)</option>
                  <option value="rare">Raro (Azul)</option>
                  <option value="epic">Épico (Roxo)</option>
                  <option value="mestre">Mestre (Vermelho)</option>
                  <option value="legendary">Lendário (Dourado)</option>
                </select>
              </div>
            </div>

            {/* Linha 3: Requisitos e Efeitos */}
            <div className="responsive-grid" style={{ marginBottom: '1.5rem', alignItems: 'flex-start' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Patente Mínima Exigida</label>
                <select value={String(formData.minRankRequired || '')} onChange={e => setFormData({...formData, minRankRequired: e.target.value})} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)' }}>
                  <option value="">Sem Patente (todas)</option>
                  {tenantRanks.map((r, i) => (
                    <option key={`rank-${i}-${r.minXp}`} value={r.name}>{r.name} ({r.minXp} XP)</option>
                  ))}
                </select>
              </div>

              {formData.type === 'consumable' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Poder no Jogo (Gameplay)</label>
                    <select value={formData.gameEffect || 'none'} onChange={e => setFormData({...formData, gameEffect: e.target.value as GameEffectType})} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)' }}>
                      <option value="none">Nenhum (Efeito Personalizado)</option>
                      <option value="remove_wrong">Amuleto (Elimina 1 alternativa errada)</option>
                      <option value="add_time">Ampulheta (Adiciona +30 segundos)</option>
                      <option value="extra_life">Escudo (Protege contra erro na questão atual)</option>
                      <option value="restore_hp">Elixir da Vida (Recupera todo HP do jogador)</option>
                      <option value="heal_1_hp">Poção de Vida (Recupera 1 HP do jogador)</option>
                      <option value="reduce_hp_cooldown">Acelerador de Regeneração (Reduz tempo de recarga dos corações)</option>
                      <option value="add_attribute">Pergaminho do Novo Atributo (Adiciona até 2 atributos a um item base, 70% chance)</option>
                      <option value="reroll_attributes">Pergaminho do Aprimoramento (Sorteia novos atributos para um item que já possui)</option>
                      <option value="gift_wrap">Caixa de Presente (Pode colocar 1 item dentro)</option>
                      <option value="unlock_skin">Liberar Skin Temporária (Buff)</option>
                      <option value="unlock_gender">Liberar Troca de Gênero (15 min)</option>
                      <option value="rename_character">Carta de Troca de Nome (Renomear personagem)</option>
                      <option value="bazar_sale_permit">Licença de Venda no Bazar (Permite vender itens no bazar com validade)</option>
                    </select>
                  </div>
                  {formData.gameEffect === 'reduce_hp_cooldown' && (
                    <div className="responsive-grid-sm" style={{ background: 'rgba(239, 68, 68, 0.08)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.25)' }}>
                      <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', color: '#f87171', fontWeight: 'bold' }}>
                          ⚡ Tempo a Reduzir por Coração (Minutos)
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={29}
                          value={formData.hpCooldownReductionMinutes ?? 10}
                          onChange={e => setFormData({...formData, hpCooldownReductionMinutes: Math.max(1, Math.min(29, Number(e.target.value)))})}
                          style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)' }}
                        />
                        <small style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', display: 'block', marginTop: '4px' }}>
                          Padrão: 30 min. Com este item, cada coração encherá em <strong>{30 - (formData.hpCooldownReductionMinutes ?? 10)} minutos</strong>.
                        </small>
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>
                          ⏳ Duração do Efeito
                        </label>
                        <select
                          value={formData.buffDurationHours ?? 24}
                          onChange={e => setFormData({...formData, buffDurationHours: Number(e.target.value)})}
                          style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)' }}
                        >
                          <option value={1}>1 Hora</option>
                          <option value={6}>6 Horas</option>
                          <option value={12}>12 Horas</option>
                          <option value={24}>24 Horas (1 Dia)</option>
                          <option value={48}>48 Horas (2 Dias)</option>
                          <option value={72}>3 Dias</option>
                          <option value={168}>7 Dias</option>
                          <option value={720}>30 Dias</option>
                        </select>
                      </div>
                    </div>
                  )}
                  {formData.gameEffect === 'unlock_skin' && (
                    <div className="responsive-grid-sm">
                      <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Skin a ser Liberada</label>
                        <select value={formData.unlockedSkinId || ''} onChange={e => setFormData({...formData, unlockedSkinId: e.target.value})} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)' }}>
                          <option value="">Selecione uma skin...</option>
                          {presetSkins.filter(s => s.type === 'human').map(s => (
                            <option key={s.id} value={s.url}>{s.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Duração do Buff</label>
                        <select value={formData.buffDurationDays || 7} onChange={e => setFormData({...formData, buffDurationDays: Number(e.target.value)})} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)' }}>
                          <option value={7}>7 Dias</option>
                          <option value={15}>15 Dias</option>
                          <option value={30}>30 Dias</option>
                        </select>
                      </div>
                    </div>
                  )}
                  {formData.gameEffect === 'bazar_sale_permit' && (
                    <div className="responsive-grid-sm" style={{ background: 'rgba(139,92,246,0.08)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(139,92,246,0.25)' }}>
                      <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)', fontWeight: 'bold' }}>
                          🏪 Validade do Anúncio (Buff Máx. 15 dias)
                        </label>
                        <select value={formData.buffDurationDays || 3} onChange={e => setFormData({...formData, buffDurationDays: Math.min(15, Number(e.target.value))})} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)' }}>
                          <option value={1}>1 Dia</option>
                          <option value={3}>3 Dias</option>
                          <option value={5}>5 Dias</option>
                          <option value={10}>10 Dias</option>
                          <option value={15}>15 Dias</option>
                        </select>
                        <small style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', display: 'block', marginTop: '4px' }}>
                          Ao usar esta licença para vender um item no bazar, o anúncio ficará ativo por {formData.buffDurationDays || 3} dia(s). Quando expirar, o item volta ao inventário automaticamente.
                        </small>
                      </div>
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(255,255,255,0.03)', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-glass)' }}>
                    <input type="checkbox" checked={formData.usableInQuest || false} onChange={e => setFormData({...formData, usableInQuest: e.target.checked})} style={{ width: '20px', height: '20px', cursor: 'pointer' }} />
                    <label style={{ color: 'white', cursor: 'pointer', margin: 0 }}>Pode usar DENTRO dos desafios?</label>
                  </div>
                </div>
              )}

              {formData.type === 'equippable' && (
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Som de Ataque na Batalha (opcional)</label>
                  <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', marginBottom: '1rem' }}>
                    <input type="text" value={formData.battleSoundUrl || ''} onChange={e => setFormData({ ...formData, battleSoundUrl: e.target.value })} placeholder="URL do som de ataque..." style={{ flex: 1, padding: '0.6rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)' }} />
                    <button onClick={() => playSound(formData.battleSoundUrl || '')} disabled={!formData.battleSoundUrl} style={{ padding: '0.5rem 0.7rem', background: 'var(--btn-bg)', border: '1px solid var(--border-glass)', borderRadius: '8px', cursor: formData.battleSoundUrl ? 'pointer' : 'not-allowed', opacity: formData.battleSoundUrl ? 1 : 0.4 }}>▶</button>
                    <button onClick={() => setBattleSoundPickerOpen(true)} style={{ padding: '0.5rem 0.8rem', background: 'rgba(139,92,246,0.2)', color: '#c084fc', border: '1px solid rgba(139,92,246,0.4)', borderRadius: '8px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold', whiteSpace: 'nowrap' }}>Banco de Áudio</button>
                  </div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Parte do Avatar (Para Equipamentos Visuais)</label>
                  <select value={formData.avatarPart || ''} onChange={e => setFormData({...formData, avatarPart: e.target.value as any})} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)' }}>
                    <option value="">Nenhuma (Apenas Título/Inventário)</option>
                    <option value="background">Fundo (Atrás do Personagem)</option>
                    <option value="head">Cabeça (Chapéus/Capacetes)</option>
                    <option value="face">Rosto (Óculos/Máscaras)</option>
                    <option value="body">Corpo (Armaduras/Camisas)</option>
                    <option value="legs">Pernas (Calças/Grevas)</option>
                    <option value="feet">Pés (Botas/Sapatos)</option>
                    <option value="hand">Mãos (Armas Simples/Escudos)</option>
                    <option value="two_handed">Arma de Duas Mãos (Lanças/Machados Grandes)</option>
                    <option value="accessory">Acessórios (Luvas/Cintos/Amuletos)</option>
                    <option value="pet">Mascote (Acompanhante)</option>
                  </select>
                </div>
              )}
            </div>

            {/* Linha 4: Atributos e 3D (Se Equipável) */}
            {formData.type === 'equippable' && (
              <div style={{ background: 'rgba(0,0,0,0.15)', padding: '1.25rem', borderRadius: '12px', marginBottom: '1.5rem', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <h4 style={{ margin: '0', color: 'var(--gold-primary)', fontSize: '1.1rem' }}>Configurações de Equipamento</h4>
                  <button 
                    onClick={() => setShowGachaModal(true)}
                    style={{ padding: '0.5rem 1rem', background: 'rgba(59, 130, 246, 0.2)', color: '#60A5FA', border: '1px solid rgba(59, 130, 246, 0.5)', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 'bold' }}
                  >
                    ⚙️ Atributos Adicionais (Gacha / Fixos)
                  </button>
                </div>

                {/* Preview 3D do item no personagem — 1/3 à esquerda, campos ao lado */}
                {previewEquippedItems.length > 0 && (
                  <div style={{ marginRight: '1rem', marginBottom: '1rem', border: '1px solid var(--border-glass)', borderRadius: '12px', padding: '0.75rem', background: 'rgba(0,0,0,0.25)', width: '32%', minWidth: '200px', float: 'left', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem' }}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 'bold', textAlign: 'center' }}>Pré-visualização 3D no personagem</div>
                    <AvatarCharacter
                      config={{ gender: 'male' } as any}
                      equippedItems={previewEquippedItems}
                      size={130}
                      animation="idle"
                      interactive={false}
                    />
                  </div>
                )}

                <div className="responsive-grid" style={{ marginBottom: '1.25rem' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Categoria do Item</label>
                    <select value={formData.itemCategory || 'none'} onChange={e => setFormData({...formData, itemCategory: e.target.value as any})} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)' }}>
                      <option value="none">Cosmético (Nenhuma)</option>
                      <option value="attack">Ataque</option>
                      <option value="defense">Defesa</option>
                      <option value="support">Suporte</option>
                    </select>
                  </div>

                  {(formData.itemCategory === 'attack' || ['hand', 'two_handed', 'rightHand', 'leftHand'].includes(formData.avatarPart || '')) && (
                    <div>
                      <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Efeito Especial de Dano (batalha)</label>
                      <select value={formData.damageEffect || 'none'} onChange={e => setFormData({...formData, damageEffect: e.target.value as any})} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)' }}>
                        {DAMAGE_EFFECTS.map(ef => <option key={ef.id} value={ef.id}>{ef.label}</option>)}
                      </select>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '0.3rem' }}>
                        {DAMAGE_EFFECTS.find(ef => ef.id === (formData.damageEffect || 'none'))?.desc}
                      </div>
                    </div>
                  )}
                  
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Tipo de Atributo Base</label>
                    <select value={formData.baseAttributeType || 'none'} onChange={e => setFormData({...formData, baseAttributeType: e.target.value as any})} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)' }}>
                      <option value="none">Nenhum</option>
                      <option value="attack">Poder de Ataque (+X)</option>
                      <option value="defense">Poder de Defesa (+X)</option>
                      <option value="xp">Bônus de XP (+X%)</option>
                      <option value="coins">Bônus de Moedas (+X%)</option>
                      <option value="vitality">Vitalidade (+X%)</option>
                      <option value="fortitude">Fortitude (+X%)</option>
                      <option value="persuasion">Persuasão (+X%)</option>
                    </select>
                  </div>
                  
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Força do Atributo Base (poder MÁXIMO no +9)</label>
                    <input type="number" value={formData.baseAttributeValue || 0} onChange={e => setFormData({...formData, baseAttributeValue: parseInt(e.target.value) || 0})} className="login-input" style={{ width: '100%' }} />
                  </div>
                </div>

                {/* ===== FORJA (todos os equipáveis são forjáveis automaticamente) ===== */}
                <div style={{ marginBottom: '1.5rem', border: '1px solid rgba(234,88,12,0.4)', borderRadius: '10px', padding: '1rem', background: 'rgba(234,88,12,0.05)' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', cursor: 'pointer', fontWeight: 'bold', color: 'var(--accent-red)' }}>
                    <Hammer size={18} /> Forja do Item (+1 a +9)
                  </label>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', margin: '0 0 0.75rem 0' }}>
                    Todos os equipamentos são forjáveis. A <strong>força</strong> é calculada automaticamente a partir do Atributo Base (90% menor no +0, crescendo até 100% no +9). O <strong>custo em moedas</strong> é calculado automaticamente com base no valor de compra (metade do valor acumulado + % do grau). Aqui você configura apenas a <strong>chance de sucesso</strong> de cada nível (o fallback já vem preenchido).
                  </p>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                      <thead>
                        <tr style={{ background: 'rgba(234,88,12,0.2)' }}>
                          <th style={{ padding: '6px 8px', textAlign: 'center', color: 'var(--text-secondary)' }}>Nível</th>
                          <th style={{ padding: '6px 8px', textAlign: 'center', color: 'var(--text-secondary)' }}>Chance (%)</th>
                          <th style={{ padding: '6px 8px', textAlign: 'center', color: 'var(--text-secondary)' }}>Força (calculado)</th>
                          <th style={{ padding: '6px 8px', textAlign: 'center', color: 'var(--text-secondary)' }}>Custo (calculado)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[0,1,2,3,4,5,6,7,8,9].map(lvl => {
                          const baseVal = formData.baseAttributeValue || 0;
                          const strengthFrac = forgeStrengthFraction(lvl);
                          const curCost = lvl === 0 ? 0 : nextForgeCost(lvl - 1, formData.cost || 100);
                          return (
                            <tr key={lvl} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                              <td style={{ padding: '4px 8px', textAlign: 'center', color: lvl === 0 ? '#888' : 'var(--gold-primary)', fontWeight: 'bold' }}>+{lvl}</td>
                              <td style={{ padding: '4px 8px' }}>
                                {lvl === 0 ? <span style={{ color: '#666', fontSize: '0.75rem' }}>—</span> : (
                                  <input type="number" min={0} max={100} value={formData.forgeConfig?.successChancePerLevel?.[lvl] ?? DEFAULT_FORGE_SUCCESS[lvl]} onChange={e => {
                                    const updated = { ...(formData.forgeConfig || {}), successChancePerLevel: { ...(formData.forgeConfig?.successChancePerLevel || {}), [lvl]: Number(e.target.value) } };
                                    setFormData({ ...formData, forgeConfig: updated });
                                  }} style={{ width: '60px', padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--border-glass)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '0.8rem' }} />
                                )}
                              </td>
                              <td style={{ padding: '4px 8px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                                {lvl === 0 ? `${forgeAttributeValue(baseVal, 0)} (10%)` : `${forgeAttributeValue(baseVal, lvl)} (${Math.round(strengthFrac * 100)}%)`}
                              </td>
                              <td style={{ padding: '4px 8px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                                {lvl === 0 ? '—' : `${curCost} moedas`}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
                
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>URL do Modelo 3D (.glb) ou Sprite Pixel Art (.png) [Opcional]</label>
                  <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.5rem' }}>
                    <input type="text" value={formData.gameModelUrl || ''} onChange={e => setFormData({...formData, gameModelUrl: e.target.value})} placeholder="/models/item.glb ou https://.../imagem.png" style={{ flex: 1, padding: '0.75rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)' }} />
                    <DirectUploadButton folder="models" accept=".glb,.gltf,image/*" maxImageSizeBytes={3 * 1024 * 1024} onUploadComplete={(url) => setFormData({...formData, gameModelUrl: url})} buttonStyle={{ minHeight: '100%' }} />
                    <button onClick={() => setShowGallery('model')} style={{ background: 'var(--gold-primary)', color: 'var(--text-on-gold, #000000)', border: 'none', padding: '0 1rem', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', minHeight: '100%' }}>
                      <Search size={20} />
                    </button>
                  </div>
                  {formData.gameModelUrl && formData.gameModelUrl.trim() !== '' && (
                    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                      <button 
                        onClick={() => setShowTransformModal(true)}
                        style={{ padding: '0.5rem', background: 'rgba(245, 158, 11, 0.2)', border: '1px solid #f59e0b', color: '#f59e0b', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                      >
                        ⚙️ Configurar Posição 3D
                      </button>
                      
                      {formData.gameModelUrl.toLowerCase().endsWith('.glb') && (
                        <button 
                          onClick={() => setShowExtractorModal(true)}
                          style={{ padding: '0.5rem', background: 'rgba(16, 185, 129, 0.2)', border: '1px solid #10b981', color: '#10b981', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                        >
                          📦 Extrair Peça (GLB)
                        </button>
                      )}
                    </div>
                  )}
                  {formData.extractMeshName && (
                    <div style={{ padding: '0.5rem', background: 'rgba(59, 130, 246, 0.2)', border: '1px solid #3b82f6', color: '#60a5fa', borderRadius: '6px', fontSize: '0.85rem', marginBottom: '1rem' }}>
                      <strong>Malha extraída selecionada:</strong> {formData.extractMeshName}
                      <button onClick={() => setFormData({...formData, extractMeshName: null})} style={{ marginLeft: '1rem', background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', textDecoration: 'underline' }}>Remover</button>
                    </div>
                  )}
                </div>
                
                <div style={{ marginTop: '1rem' }}>
                  <label style={{ display: 'block', fontSize: '0.9rem', color: '#9ca3af', marginBottom: '0.25rem' }}>Skin (Textura) para o Modelo 3D</label>
                  <select value={formData.modelTextureUrl || ''} onChange={e => setFormData({...formData, modelTextureUrl: e.target.value})} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
                    <option value="">Nenhuma (Usar cor/textura original do .glb)</option>
                    {presetSkins.filter(s => s.type === 'equipment').map(s => (
                      <option key={s.id} value={s.url}>{s.name}</option>
                    ))}
                  </select>
                  <p style={{ fontSize: '0.8rem', color: '#9ca3af', marginBottom: '1.5rem', marginTop: '-0.25rem' }}>Selecione uma skin previamente enviada na tela de Gerenciar Skins para colorir o modelo .glb.</p>

                  <label style={{ display: 'block', fontSize: '0.9rem', color: '#9ca3af', marginBottom: '0.25rem' }}>Textura Minecraft (Base64 ou URL)</label>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Aplica a textura na "Parte do Avatar" selecionada acima (cabeça, torso, braços, pernas...). Não se aplica a armas. Cole a Base64 ou a Minecraft URL.</div>
                  <input type="text" value={formData.minecraftHeadValue || ''} onChange={e => setFormData({...formData, minecraftHeadValue: e.target.value})} placeholder="eyJ0ZXh0dXJlcyI..." style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', marginBottom: '0.5rem' }} />
                  {formData.minecraftHeadValue && formData.minecraftHeadValue.trim() !== '' && (
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <button 
                        onClick={() => setShowMinecraftPreview(true)}
                        style={{ padding: '0.5rem', background: 'rgba(59, 130, 246, 0.2)', border: '1px solid #3b82f6', color: '#60a5fa', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                      >
                        👁️ Ver Item 3D
                      </button>
                      <button 
                        onClick={() => setShowTransformModal(true)}
                        style={{ padding: '0.5rem', background: 'rgba(245, 158, 11, 0.2)', border: '1px solid #f59e0b', color: '#f59e0b', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                      >
                        ⚙️ Configurar Posição 3D
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Descrição (Lore do Item)</label>
              <textarea value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} rows={3} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', resize: 'vertical' }} />
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Imagem do Item (Opcional)</label>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <input type="text" value={formData.imageUrl || ''} onChange={e => setFormData({...formData, imageUrl: e.target.value})} placeholder="URL ou busque na galeria ->" style={{ flex: 1, padding: '0.75rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)' }} />
                <DirectUploadButton folder="store" onUploadComplete={(url) => setFormData({...formData, imageUrl: url})} buttonStyle={{ minHeight: '100%' }} />
                <button onClick={() => setShowGallery('image')} style={{ background: 'var(--gold-primary)', color: 'var(--text-on-gold, #000000)', border: 'none', padding: '0 1rem', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', minHeight: '100%' }}>
                  <Search size={20} />
                </button>
              </div>
              
              {formData.gameEffect === 'unlock_skin' && formData.unlockedSkinId ? (
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <SkinBuffIcon skinUrl={formData.unlockedSkinId} durationDays={formData.buffDurationDays || 7} size={100} />
                </div>
              ) : (
                <ItemIcon item={formData} size={100} />
              )}
            </div>

            {formData.type === 'equippable' && (
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={!!formData.backColor} onChange={(e) => setFormData({...formData, backColor: e.target.checked ? '#333333' : ''})} style={{ width: '18px', height: '18px' }} />
                  Usar cor sólida nas costas (Item 2.5D)
                </label>
                {formData.backColor !== undefined && formData.backColor !== '' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '0.5rem', justifyContent: 'flex-end' }}>
                    <span style={{ color: 'var(--text-primary)', fontSize: '0.9rem' }}>{formData.backColor}</span>
                    <input type="color" value={formData.backColor} onChange={(e) => setFormData({...formData, backColor: e.target.value})} style={{ width: '50px', height: '40px', padding: 0, border: 'none', borderRadius: '4px', cursor: 'pointer' }} />
                  </div>
                )}
              </div>
            )}

            {/* ===== FORGE CONFIG ===== */}
            {/* ===== TRANSMUTATION CONFIG ===== */}
            {formData.type === 'equippable' && (
              <div style={{ marginBottom: '1.5rem', border: '1px solid rgba(139,92,246,0.4)', borderRadius: '10px', padding: '1rem', background: 'rgba(139,92,246,0.05)' }}>
                <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontWeight: 'bold', color: '#8b5cf6' }}>
                    <input
                      type="checkbox"
                      checked={!!formData.isTransmutable}
                      disabled={!!formData.isTransmuted}
                      onChange={e => setFormData({
                        ...formData,
                        isTransmutable: e.target.checked,
                        isTransmuted: e.target.checked ? false : formData.isTransmuted,
                        transmuteConfig: e.target.checked ? (formData.transmuteConfig || { successChance: 25, coinsCost: 500, resultItemId: '' }) : undefined
                      })}
                      style={{ width: '18px', height: '18px' }}
                    />
                    ✨ Item Transmutável (requer +9)
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontWeight: 'bold', color: '#c084fc' }}>
                    <input
                      type="checkbox"
                      checked={!!formData.isTransmuted}
                      disabled={!!formData.isTransmutable}
                      onChange={e => setFormData({
                        ...formData,
                        isTransmuted: e.target.checked,
                        isTransmutable: e.target.checked ? false : formData.isTransmutable,
                        transmuteConfig: e.target.checked ? undefined : formData.transmuteConfig
                      })}
                      style={{ width: '18px', height: '18px' }}
                    />
                    🧪 Item Transmutado (resultado — não aparece na loja)
                  </label>
                </div>
                {formData.isTransmuted && (
                  <p style={{ margin: '0 0 0.5rem 0', color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
                    Este item só poderá ser obtido como <strong>resultado de transmutação</strong>. Ele <strong>não aparecerá na loja</strong>.
                  </p>
                )}

                {formData.isTransmutable && formData.transmuteConfig && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                      <div style={{ flex: 1, minWidth: '140px' }}>
                        <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Custo em Moedas</label>
                        <input type="number" min={0} value={formData.transmuteConfig.coinsCost ?? 500} onChange={e => setFormData({ ...formData, transmuteConfig: { ...formData.transmuteConfig!, coinsCost: Number(e.target.value) } })} style={{ width: '100%', padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border-glass)', background: 'var(--bg-card)', color: 'var(--text-primary)' }} />
                      </div>
                      <div style={{ flex: 1, minWidth: '140px' }}>
                        <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Chance de Sucesso (%)</label>
                        <input type="number" min={0} max={100} value={formData.transmuteConfig.successChance ?? 25} onChange={e => setFormData({ ...formData, transmuteConfig: { ...formData.transmuteConfig!, successChance: Number(e.target.value) } })} style={{ width: '100%', padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border-glass)', background: 'var(--bg-card)', color: 'var(--text-primary)' }} />
                      </div>
                    </div>
                    <div>
                      <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                        Item Resultado (só itens marcados como "Item Transmutado", da MESMA categoria: {formData.itemCategory === 'attack' ? 'arma' : formData.itemCategory === 'defense' ? 'defesa/escudo' : 'suporte'})
                      </label>
                      <select value={formData.transmuteConfig.resultItemId || ''} onChange={e => setFormData({ ...formData, transmuteConfig: { ...formData.transmuteConfig!, resultItemId: e.target.value } })} style={{ width: '100%', padding: '6px 10px', borderRadius: '6px', border: '1px solid rgba(139,92,246,0.5)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}>
                        <option value="">— Selecionar item resultado —</option>
                        {items.filter(i => i.type === 'equippable' && (i as any).isTransmuted && (i.itemCategory || 'none') === (formData.itemCategory || 'none')).map(i => (
                          <option key={i.id} value={i.id}>{i.title}</option>
                        ))}
                      </select>
                      {formData.transmuteConfig.resultItemId && (
                        <p style={{ color: '#8b5cf6', fontSize: '0.75rem', margin: '4px 0 0 0' }}>✓ Resultado: {items.find(i => i.id === formData.transmuteConfig!.resultItemId)?.title || 'Item não encontrado'}</p>
                      )}
                    </div>
                    <div>
                      <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Materiais (2 itens da categoria "Outros / Diversos", dropados por monstros/baús)</label>
                      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                        {[0, 1].map(matIdx => (
                          <div key={matIdx} style={{ flex: 1, minWidth: '150px' }}>
                            <label style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Material {matIdx + 1}</label>
                            <select
                              value={formData.transmuteConfig.materials?.[matIdx] || ''}
                              onChange={e => {
                                const mats = [...(formData.transmuteConfig!.materials || ['', ''])];
                                mats[matIdx] = e.target.value;
                                setFormData({ ...formData, transmuteConfig: { ...formData.transmuteConfig!, materials: mats } });
                              }}
                              style={{ width: '100%', padding: '6px 10px', borderRadius: '6px', border: '1px solid rgba(139,92,246,0.5)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
                            >
                              <option value="">— Selecionar material —</option>
                              {items.filter(i => i.type === 'other').map(i => (
                                <option key={i.id} value={i.id}>{i.title}</option>
                              ))}
                            </select>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {formData.type === 'equippable' && (() => {
              const isTransmuteResult = items.some(i => (i.data?.transmuteConfig?.resultItemId || (i as any).transmuteConfig?.resultItemId) === editingId);
              if (!isTransmuteResult) return null;
              return (
                <div style={{ marginBottom: '1.5rem', border: '1px solid rgba(139,92,246,0.4)', borderRadius: '10px', padding: '0.75rem 1rem', background: 'rgba(139,92,246,0.08)' }}>
                  <span style={{ color: '#c084fc', fontWeight: 'bold', fontSize: '0.85rem' }}>🧪 Item de Transmutação</span>
                  <p style={{ margin: '0.3rem 0 0 0', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                    Este item é o <strong>resultado</strong> de uma transmutação configurada em outro item. Ele <strong>não aparecerá na loja</strong> — só poderá ser obtido por transmutação.
                  </p>
                </div>
              );
            })()}

            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '2rem' }}>
              <button onClick={() => setIsEditing(false)} style={{ background: 'transparent', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', padding: '0.75rem 1.5rem', borderRadius: '8px', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={handleSaveItem} className="login-btn" style={{ padding: '0.75rem 1.5rem', background: 'var(--gold-primary)', color: 'var(--text-on-gold, #000000)', border: 'none' }}>Salvar Item</button>
            </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showMinecraftPreview && createPortal(
        <div className="modal-overlay" style={{ zIndex: 100000 }}>
          <div className="modal-content modal-content-sm" style={{ background: 'var(--bg-dark)', borderRadius: '16px', border: '1px solid var(--gold-primary)', display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 0, alignItems: 'center' }}>
            <div style={{ width: '100%', padding: '1rem', background: 'var(--btn-bg)', borderBottom: '1px solid var(--border-glass)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, color: 'var(--gold-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>👁️ Item 3D (Textura Minecraft)</h3>
              <button onClick={() => setShowMinecraftPreview(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>✖</button>
            </div>
            <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
              {formData.minecraftHeadValue ? (
                <MinecraftPartPreview minecraftHeadValue={formData.minecraftHeadValue} avatarPart={formData.avatarPart} size={240} />
              ) : (
                <p style={{ color: 'var(--text-secondary)' }}>Nenhuma textura informada.</p>
              )}
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
                Renderização da parte selecionada em "Parte do Avatar" com a textura aplicada. Para armas/acessórios, a textura de corpo não se aplica.
              </p>
              <button onClick={() => setShowMinecraftPreview(false)} style={{ padding: '0.6rem 1.5rem', background: 'var(--gold-primary)', color: 'var(--text-on-gold, #000000)', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>Fechar</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showTransformModal && createPortal(
        <div className="modal-overlay" style={{ zIndex: 100000 }}>
          <div className="modal-content modal-content-lg" style={{ background: 'var(--bg-dark)', borderRadius: '16px', border: '1px solid var(--gold-primary)', display: 'flex', flexDirection: 'column', padding: 0, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ padding: '1rem', background: 'var(--btn-bg)', borderBottom: '1px solid var(--border-glass)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, color: 'var(--gold-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>⚙️ Configurar Transformação 3D</h3>
              <button onClick={() => setShowTransformModal(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>✖</button>
            </div>
            
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border-glass)' }}>
              <button onClick={() => setTransformActiveTab('common')} style={{ flex: 1, padding: '0.75rem', background: transformActiveTab === 'common' ? 'rgba(245, 158, 11, 0.2)' : 'transparent', border: 'none', borderBottom: transformActiveTab === 'common' ? '2px solid #f59e0b' : '2px solid transparent', color: transformActiveTab === 'common' ? '#f59e0b' : 'var(--text-secondary)', cursor: 'pointer', fontWeight: 'bold' }}>Parado / Andar / Correr (Comum)</button>
              <button onClick={() => setTransformActiveTab('battle')} style={{ flex: 1, padding: '0.75rem', background: transformActiveTab === 'battle' ? 'rgba(239, 68, 68, 0.2)' : 'transparent', border: 'none', borderBottom: transformActiveTab === 'battle' ? '2px solid var(--accent-red)' : '2px solid transparent', color: transformActiveTab === 'battle' ? 'var(--accent-red)' : 'var(--text-secondary)', cursor: 'pointer', fontWeight: 'bold' }}>Animação de Batalha</button>
            </div>

            <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'row', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
              {previewEquippedItems.length > 0 && (
                <div style={{ width: '38%', minWidth: '220px', position: 'sticky', top: 0, display: 'flex', justifyContent: 'center', alignItems: 'center', background: 'rgba(0,0,0,0.3)', borderRadius: '12px', padding: '0.5rem', flexShrink: 0 }}>
                  <AvatarCharacter
                    config={{ gender: 'male' } as any}
                    equippedItems={previewEquippedItems}
                    size={160}
                    animation="idle"
                    interactive={false}
                  />
                </div>
              )}
              <div style={{ flex: 1, minWidth: '300px', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {(() => {
                const currentTransforms = formData.modelTransforms || {};
                const activeTransform = currentTransforms[transformActiveTab] || { posX: 0, posY: -11, posZ: 0, rotX: 1.428, rotY: 0, rotZ: -0.157, slide: -18 };
                
                const handleTransformChange = (key: keyof ModelTransform, value: number) => {
                  setFormData({
                    ...formData,
                    modelTransforms: {
                      ...currentTransforms,
                      [transformActiveTab]: {
                        ...activeTransform,
                        [key]: value
                      }
                    }
                  });
                };

                return (
                  <>
                    <p style={{ margin: '0 0 1rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      Dica: Use a tela "Personalizar Personagem" (com o Debug 3D ativado) para ajustar os valores visualmente e depois salve os valores lá ou copie para cá!
                    </p>
                    {[
                      { label: 'Pos X', key: 'posX' as const, step: 0.5 },
                      { label: 'Pos Y', key: 'posY' as const, step: 0.5 },
                      { label: 'Pos Z', key: 'posZ' as const, step: 0.5 },
                      { label: 'Rot X (Radianos)', key: 'rotX' as const, step: 0.05 },
                      { label: 'Rot Y (Radianos)', key: 'rotY' as const, step: 0.05 },
                      { label: 'Rot Z (Radianos)', key: 'rotZ' as const, step: 0.05 },
                      { label: 'Slide (Translação Y)', key: 'slide' as const, step: 1 },
                      { label: 'Curva X (Dobrar Horizontal)', key: 'curveX' as const, step: 0.01 },
                      { label: 'Curva Y (Dobrar Vertical)', key: 'curveY' as const, step: 0.01 },
                    ].map(({ label, key, step }) => (
                      <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <span style={{ width: '130px', color: 'white', fontSize: '0.9rem' }}>{label}</span>
                        <input 
                          type="number" 
                          step={step}
                          value={activeTransform[key]} 
                          onChange={(e) => handleTransformChange(key, parseFloat(e.target.value) || 0)}
                          style={{ flex: 1, padding: '0.5rem', borderRadius: '6px', background: 'rgba(0,0,0,0.5)', border: '1px solid var(--border-glass)', color: 'white' }}
                        />
                      </div>
                    ))}
                  </>
                );
              })()}
              </div>
            </div>

            <div style={{ padding: '1rem', borderTop: '1px solid var(--border-glass)', display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowTransformModal(false)} style={{ padding: '0.75rem 2rem', background: 'var(--gold-primary)', color: 'var(--text-on-gold, #000000)', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>Confirmar Posições</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showGachaModal && (
        <GachaConfigModal
          itemData={{
            title: formData.title || '',
            description: formData.description || '',
            imageUrl: formData.imageUrl
          }}
          initialConfig={formData.gachaConfig}
          initialFixed={formData.fixedAttributes}
          initialUseGlobal={formData.useGlobalGacha ?? true}
          globalConfig={globalGachaConfig}
          onSave={async (config, fixed, newGlobalConfig, useGlobal) => {
            setFormData({ ...formData, gachaConfig: config, fixedAttributes: fixed, useGlobalGacha: useGlobal });
            if (newGlobalConfig && isSuperAdmin) {
              setGlobalGachaConfig(newGlobalConfig);
              const existing = await supabase.from('system_collections').select('id').eq('collection_name', 'settings').eq('doc_id', 'gacha').single();
              if (existing.data) {
                await supabase.from('system_collections').update({ data: newGlobalConfig as any }).eq('collection_name', 'settings').eq('doc_id', 'gacha');
              } else {
                await supabase.from('system_collections').insert({ collection_name: 'settings', doc_id: 'gacha', data: newGlobalConfig as any });
              }
            }
            setShowGachaModal(false);
          }}
          onClose={() => setShowGachaModal(false)}
        />
      )}

      <AudioBankPicker
        open={battleSoundPickerOpen}
        onClose={() => setBattleSoundPickerOpen(false)}
        onSelect={(url) => { setFormData({ ...formData, battleSoundUrl: url }); setBattleSoundPickerOpen(false); }}
        categoryFilter="effect"
        title="Banco de Áudio — Som de Ataque do Item"
      />

      {showItemBank && (
        <ItemBankModal
          isOpen={showItemBank}
          onClose={() => setShowItemBank(false)}
          onImport={handleImportFromBank}
          onImportMultiple={handleImportMultipleFromBank}
          onEditGlobal={openEditGlobal}
          localItems={items}
        />
      )}

      {showExtractorModal && formData.gameModelUrl && (
        <GlbMeshExtractorModal
          glbUrl={formData.gameModelUrl}
          currentExtractedName={formData.extractMeshName || null}
          onSelect={(meshName) => {
            setFormData({ ...formData, extractMeshName: meshName || undefined });
          }}
          onClose={() => setShowExtractorModal(false)}
        />
      )}

      {/* Modal: selecionar quais opções sincronizar do Banco para esta escola */}
      {showSyncOptions && createPortal(
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0, 0, 0, 0.7)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000000, padding: '1rem' }}>
          <div style={{ background: 'var(--bg-glass)', border: '1px solid var(--border-glass)', borderRadius: '16px', padding: '1.75rem', width: '100%', maxWidth: '620px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)', animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--text-primary)' }}>Sincronizar do Banco — opções</h3>
              <button onClick={() => setShowSyncOptions(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '0.2rem', display: 'flex' }}><X size={20} /></button>
            </div>
            <p style={{ margin: '0 0 1rem', fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Marque apenas o que você deseja que o Banco de Itens sobreponha no catálogo desta escola. <b>Desmarcar uma opção preserva o valor já definido aqui.</b> Somente itens correspondentes (mesmo nome, tipo e efeito) e que realmente diferem são atualizados.
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <button onClick={() => { const all: Record<string, boolean> = {}; SYNC_GROUPS.forEach(g => { all[g.key] = true; }); setSyncSelection(all); }} style={{ padding: '0.3rem 0.8rem', background: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6', border: '1px solid rgba(59, 130, 246, 0.4)', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem' }}>Marcar tudo</button>
              <button onClick={() => { const none: Record<string, boolean> = {}; SYNC_GROUPS.forEach(g => { none[g.key] = false; }); setSyncSelection(none); }} style={{ padding: '0.3rem 0.8rem', background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border-glass)', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem' }}>Desmarcar tudo</button>
              <span style={{ marginLeft: 'auto', alignSelf: 'center', fontSize: '0.8rem', color: 'var(--gold-primary)', fontWeight: 'bold' }}>
                {SYNC_GROUPS.filter(g => syncSelection[g.key]).length} de {SYNC_GROUPS.length} opções
              </span>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', paddingRight: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {SYNC_GROUPS.map(g => (
                <label key={g.key} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', padding: '0.6rem 0.75rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', border: syncSelection[g.key] ? '1px solid rgba(59, 130, 246, 0.4)' : '1px solid var(--border-glass)', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={!!syncSelection[g.key]}
                    onChange={e => setSyncSelection(prev => ({ ...prev, [g.key]: e.target.checked }))}
                    style={{ marginTop: '0.15rem', accentColor: 'var(--gold-primary)', width: '16px', height: '16px', flexShrink: 0 }}
                  />
                  <span style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                    <span style={{ color: 'var(--text-primary)', fontSize: '0.9rem', fontWeight: 600 }}>{g.label}</span>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>{g.hint}</span>
                  </span>
                </label>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
              <button onClick={() => setShowSyncOptions(false)} style={{ flex: 1, padding: '0.75rem', background: 'transparent', border: '1px solid var(--border-glass)', borderRadius: '8px', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '0.9rem' }}>Cancelar</button>
              <button onClick={() => runSyncFromBank(syncSelection)} style={{ flex: 1, padding: '0.75rem', background: 'var(--gold-primary)', border: 'none', borderRadius: '8px', color: 'var(--text-on-gold, #000)', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.9rem' }}>
                Sincronizar selecionados
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
      
      {hoveredItem && (
        <ItemTooltip 
          item={items.find(i => i.id === hoveredItem)} 
          mousePos={mousePos} 
        />
      )}
    </div>
  );
}
