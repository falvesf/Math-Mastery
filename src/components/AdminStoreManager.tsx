import { useState, useEffect, useMemo, useRef, Fragment } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase';
// @ts-ignore
import { Plus, Edit2, Trash2, Star, Search, List, Grid, LayoutGrid, ArrowDownAZ, ArrowUpZA, LayoutList, Columns, Package, RefreshCcw, X, Hammer, Volume2, UploadCloud, DownloadCloud } from 'lucide-react';
// @ts-ignore — força/custo de forja (mantido no import por segurança; usado em cálculo quando necessário)
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
import { fetchForgeSounds, saveForgeSounds, type ForgeSoundsConfig } from '../lib/forgeSounds';
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
import { computeItemTransformKey, invalidateGlobalItemTransforms } from '../lib/itemTransforms';

export type GameEffectType = 'none' | 'remove_wrong' | 'add_time' | 'extra_life' | 'restore_hp' | 'heal_1_hp' | 'reduce_hp_cooldown' | 
  'add_attribute' | 'remove_attribute' | 'reroll_attributes' | 'gift_wrap' | 'unlock_skin' | 'unlock_gender' | 'rename_character' | 
  'bazar_sale_permit' | 'cure_bleed' | 'cure_poison' | 'cure_freeze' | 'cure_burn' | 'cure_electric' | 'blacksmith_scroll' |
  'break_item' | 'fuse_item';
export type ItemRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'mestre' | 'legendary';

export interface StoreItem {
  id: string;
  _isGlobal?: boolean;
  _tenantId?: string | null;
  title: string;
  description: string;
  imageUrl?: string;
  cost: number;
  type: 'consumable' | 'equippable' | 'other';
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
  scrollChanceBonus?: number; // % de bônus de chance que o Pergaminho do Ferreiro concede (0–100)
  breakTargetItemId?: string; // ID do item fragmento resultante ao quebrar no ferreiro
  breakMinQty?: number; // Quantidade mínima de fragmentos ao quebrar
  breakMaxQty?: number; // Quantidade máxima de fragmentos ao quebrar
  breakCost?: number; // Custo em moedas para quebrar cada unidade no ferreiro
  breakSuccessChance?: number; // % de chance de sucesso na quebra (1–100, padrão 80)
  fuseTargetItemId?: string; // ID do item lingote resultante ao fundir no ferreiro
  fuseRequiredQty?: number; // Quantidade de fragmentos necessária para fundir (ex: 50)
  fuseResultQty?: number; // Quantidade gerada do item resultante (ex: 1)
  fuseCost?: number; // Custo em moedas para realizar a fundição no ferreiro
  fuseSuccessChance?: number; // % de chance de sucesso na fundição (1–100, padrão 75)
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

const getRarityColor = (rarity?: string) => {
  switch (rarity) {
    case 'legendary': return '#f59e0b';
    case 'mestre': return '#ef4444';
    case 'epic': return '#8b5cf6';
    case 'rare': return '#3b82f6';
    case 'uncommon': return '#10b981';
    case 'common':
    default: return '#9ca3af';
  }
};

const RARITY_WEIGHTS: Record<string, number> = {
  common: 1,
  uncommon: 2,
  rare: 3,
  epic: 4,
  mestre: 5,
  legendary: 6,
};

const sortByRarityThenTitle = (a: { rarity?: string; title?: string }, b: { rarity?: string; title?: string }) => {
  const wA = RARITY_WEIGHTS[a.rarity || 'common'] ?? 99;
  const wB = RARITY_WEIGHTS[b.rarity || 'common'] ?? 99;
  if (wA !== wB) return wA - wB;
  return (a.title || '').localeCompare(b.title || '', 'pt-BR', { sensitivity: 'base' });
};

interface ItemSelectOption {
  id: string;
  title: string;
  imageUrl?: string;
  badge?: string;
  rarity?: string;
}

// Combobox customizado com ícone + nome + raridade (os <select> nativos não renderizam imagem).
// O dropdown é renderizado em PORTAL com position:fixed — não expande o scroll do modal,
// agrupa materiais por raridade com cabeçalhos visuais elegantes e permite busca instantânea.
function ItemSelect({ items, value, onChange, placeholder, width = 170 }: { items: ItemSelectOption[]; value: string; onChange: (id: string) => void; placeholder: string; width?: number | string }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const portalRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

  const place = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const ddHeight = 270;
    const spaceBelow = window.innerHeight - r.bottom;
    const openUp = spaceBelow < ddHeight + 8;
    setPos({
      top: openUp ? Math.max(4, r.top - ddHeight - 4) : r.bottom + 4,
      left: r.left,
      width: Math.max(r.width, 240)
    });
  };

  useEffect(() => {
    if (!open) {
      setSearch('');
      return;
    }
    place();
    const close = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        rootRef.current && !rootRef.current.contains(target) &&
        portalRef.current && !portalRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    setTimeout(() => {
      searchInputRef.current?.focus();
    }, 50);
    return () => {
      document.removeEventListener('mousedown', close);
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open]);

  // Itens classificados por raridade (Comum -> Incomum -> Raro -> Épico -> Mestre -> Lendário) e por ordem alfabética A-Z
  const sortedItems = [...items].sort(sortByRarityThenTitle);

  const filteredItems = search.trim()
    ? sortedItems.filter(i => {
        const q = search.toLowerCase();
        const t = (i.title || '').toLowerCase();
        const r = getRarityLabel(i.rarity).toLowerCase();
        return t.includes(q) || r.includes(q);
      })
    : sortedItems;

  const selected = items.find(i => i.id === value);
  const selectedRarityColor = selected?.rarity ? getRarityColor(selected.rarity) : undefined;

  return (
    <div ref={rootRef} style={{ width }}>
      <button
        ref={btnRef}
        type="button"
        onMouseDown={(e) => { e.stopPropagation(); setOpen(o => !o); }}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: '0.4rem',
          padding: '3px 8px',
          borderRadius: '6px',
          border: selectedRarityColor ? `1px solid ${selectedRarityColor}77` : '1px solid rgba(139,92,246,0.5)',
          background: 'var(--bg-card)',
          color: 'var(--text-primary)',
          fontSize: '0.72rem',
          cursor: 'pointer',
          minHeight: 26,
          textAlign: 'left'
        }}
      >
        {selected ? (
          <>
            {selected.imageUrl ? (
              <img src={selected.imageUrl} alt="" style={{ width: 18, height: 18, objectFit: 'contain', flexShrink: 0, borderRadius: 2 }} />
            ) : (
              <Package size={16} color="var(--text-secondary)" style={{ flexShrink: 0 }} />
            )}
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }} title={selected.title}>
              {selected.title}
            </span>
            {selected.rarity && (
              <span style={{
                flexShrink: 0,
                fontSize: '0.58rem',
                fontWeight: 600,
                padding: '1px 4px',
                borderRadius: '3px',
                background: `${selectedRarityColor}22`,
                color: selectedRarityColor,
                border: `1px solid ${selectedRarityColor}44`
              }}>
                {getRarityLabel(selected.rarity)}
              </span>
            )}
            {selected.badge && (
              <span style={{ flexShrink: 0, fontSize: '0.6rem', color: '#c084fc' }}>{selected.badge}</span>
            )}
            <span
              title="Limpar (nenhum)"
              onMouseDown={(e) => { e.stopPropagation(); onChange(''); setOpen(false); }}
              style={{
                flexShrink: 0,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 16,
                height: 16,
                borderRadius: '50%',
                background: 'rgba(239,68,68,0.25)',
                color: '#ef4444',
                fontSize: '0.75rem',
                lineHeight: 1,
                cursor: 'pointer',
                fontWeight: 'bold'
              }}
            >×</span>
          </>
        ) : (
          <span style={{ color: 'var(--text-secondary)' }}>{placeholder}</span>
        )}
      </button>

      {open && pos && createPortal(
        <div
          ref={portalRef}
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            top: pos.top,
            left: pos.left,
            width: pos.width,
            zIndex: 2147483000,
            maxHeight: 270,
            display: 'flex',
            flexDirection: 'column',
            background: 'rgba(20,20,26,0.98)',
            border: '1px solid rgba(139,92,246,0.6)',
            borderRadius: '8px',
            boxShadow: '0 12px 35px rgba(0,0,0,0.85)',
            overflow: 'hidden'
          }}
        >
          {/* Quick Search */}
          <div style={{ padding: '6px 8px', borderBottom: '1px solid rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.25)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Search size={14} color="var(--text-secondary)" style={{ flexShrink: 0 }} />
            <input
              ref={searchInputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome ou raridade..."
              style={{
                width: '100%',
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: '#fff',
                fontSize: '0.72rem'
              }}
            />
            {search && (
              <span
                onClick={() => setSearch('')}
                style={{ cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.75rem', padding: '0 2px' }}
                title="Limpar busca"
              >✕</span>
            )}
          </div>

          <div style={{ overflowY: 'auto', flex: 1, padding: '2px 0' }}>
            {/* Opção para limpar */}
            <div
              onMouseDown={(e) => { e.stopPropagation(); onChange(''); setOpen(false); }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '6px 8px',
                cursor: 'pointer',
                fontSize: '0.72rem',
                color: '#ef4444',
                borderBottom: '1px solid rgba(255,255,255,0.06)'
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.1)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
              <span style={{ fontWeight: 'bold' }}>✕ Limpar (nenhum)</span>
            </div>

            {filteredItems.length === 0 ? (
              <div style={{ padding: '10px 8px', color: 'var(--text-secondary)', fontSize: '0.72rem', textAlign: 'center' }}>
                Nenhum item encontrado
              </div>
            ) : (
              (() => {
                let currentRarity: string | null = null;
                const hasRarities = filteredItems.some(i => !!i.rarity);
                return filteredItems.map((i) => {
                  const itemRarity = i.rarity || 'common';
                  const isNewSection = hasRarities && itemRarity !== currentRarity;
                  if (isNewSection) {
                    currentRarity = itemRarity;
                  }
                  const rColor = getRarityColor(itemRarity);
                  const isSelected = i.id === value;

                  return (
                    <Fragment key={i.id}>
                      {isNewSection && (
                        <div style={{
                          padding: '4px 8px',
                          fontSize: '0.62rem',
                          fontWeight: 800,
                          textTransform: 'uppercase',
                          letterSpacing: '0.06em',
                          color: rColor,
                          background: 'rgba(255,255,255,0.04)',
                          borderTop: '1px solid rgba(255,255,255,0.06)',
                          borderBottom: '1px solid rgba(255,255,255,0.03)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          position: 'sticky',
                          top: 0,
                          zIndex: 1,
                          backdropFilter: 'blur(8px)'
                        }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: rColor, display: 'inline-block' }} />
                          <span>{getRarityLabel(itemRarity)}</span>
                        </div>
                      )}
                      <div
                        onMouseDown={(e) => { e.stopPropagation(); onChange(i.id); setOpen(false); }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.4rem',
                          padding: '5px 8px',
                          cursor: 'pointer',
                          fontSize: '0.72rem',
                          background: isSelected ? 'rgba(255,215,0,0.15)' : 'transparent',
                          whiteSpace: 'nowrap',
                          transition: 'background 0.12s ease'
                        }}
                        onMouseEnter={(e) => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)'; }}
                        onMouseLeave={(e) => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                      >
                        {i.imageUrl ? (
                          <img src={i.imageUrl} alt="" style={{ width: 18, height: 18, objectFit: 'contain', flexShrink: 0, borderRadius: 2 }} />
                        ) : (
                          <Package size={16} color="var(--text-secondary)" style={{ flexShrink: 0 }} />
                        )}
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>{i.title}</span>
                        {i.rarity && (
                          <span style={{
                            fontSize: '0.58rem',
                            padding: '1px 5px',
                            borderRadius: '3px',
                            background: `${rColor}22`,
                            color: rColor,
                            border: `1px solid ${rColor}44`,
                            flexShrink: 0,
                            marginLeft: 'auto'
                          }}>
                            {getRarityLabel(itemRarity)}
                          </span>
                        )}
                        {i.badge && (
                          <span style={{ fontSize: '0.58rem', color: '#c084fc', flexShrink: 0, marginLeft: i.rarity ? 4 : 'auto' }}>
                            {i.badge}
                          </span>
                        )}
                      </div>
                    </Fragment>
                  );
                });
              })()
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

export default function AdminStoreManager({ pixabayKey }: { pixabayKey: string }) {
  const { showAlert, showConfirm, showToast } = useDialog();
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
  const [showChanceFill, setShowChanceFill] = useState(false);
  const [chanceFillStart, setChanceFillStart] = useState(90);
  const [chanceFillStep, setChanceFillStep] = useState(10);
  const [showCostFill, setShowCostFill] = useState(false);
  const [costFillStart, setCostFillStart] = useState(550);
  const [costFillStep, setCostFillStep] = useState(380);
  const [costFillMode, setCostFillMode] = useState<'add' | 'multiply'>('add');
  const [showMinecraftPreview, setShowMinecraftPreview] = useState(false);
  const [showExtractorModal, setShowExtractorModal] = useState(false);
  const [showGachaModal, setShowGachaModal] = useState(false);
  const [showItemBank, setShowItemBank] = useState(false);
  const [showForgeSounds, setShowForgeSounds] = useState(false);
  const [forgeSoundsConfig, setForgeSoundsConfig] = useState<ForgeSoundsConfig>({});
  const [soundPickerTarget, setSoundPickerTarget] = useState<keyof ForgeSoundsConfig | null>(null);
  const [copyForgeFromId, setCopyForgeFromId] = useState('');
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
      itemCategory: f.itemCategory || 'none',
      baseAttributeType: f.baseAttributeType || 'none',
      baseAttributeValue: f.baseAttributeValue || 0,
      gameModelUrl: f.gameModelUrl || '',
      modelTextureUrl: f.modelTextureUrl || '',
      minecraftHeadValue: f.minecraftHeadValue || '',
      modelTransforms: f.modelTransforms || undefined,
      gameEffect: f.gameEffect || 'none',
      rarity: f.rarity || 'common',
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
  const [catalogCategoryTab, setCatalogCategoryTab] = useState<'all' | 'consumable' | 'attack' | 'defense' | 'other'>('all');

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
  const SYNC_EXCLUDE = new Set(['id', 'importedFromId', '_isGlobal', '_tenantId', '_rawId']);

  // Opções sincronizáveis ao puxar do Banco para o tenant. Cada grupo cobre um
  // conjunto de chaves do `data` do item. Desmarcar um grupo preserva o valor
  // definido no tenant para aquelas chaves.
  const SYNC_GROUPS: { key: string; label: string; hint: string; keys: string[] }[] = [
    { key: 'image', label: 'Ícone / Imagem', hint: 'imageUrl', keys: ['imageUrl'] },
    { key: 'title', label: 'Nome do item', hint: 'title', keys: ['title'] },
    { key: 'description', label: 'Descrição', hint: 'description', keys: ['description'] },
    { key: 'type', label: 'Tipo de item (consumível, equipável, outro)', hint: 'type', keys: ['type'] },
    { key: 'price', label: 'Preço', hint: 'cost', keys: ['cost'] },
    { key: 'effect', label: 'Efeito do item (uso em missão, buffs, cooldown, refino, pergaminho)', hint: 'gameEffect, usableInQuest, buffs, quebra e fundição, pergaminho', keys: ['gameEffect', 'usableInQuest', 'hpCooldownReductionMinutes', 'buffDurationHours', 'buffDurationDays', 'unlockedSkinId', 'scrollChanceBonus', 'breakTargetItemId', 'breakMinQty', 'breakMaxQty', 'breakCost', 'breakSuccessChance', 'fuseTargetItemId', 'fuseRequiredQty', 'fuseResultQty', 'fuseCost', 'fuseSuccessChance'] },
    { key: 'stats', label: 'Atributos / Poder (ataque, defesa, dano, adds)', hint: 'fixedAttributes, adds, baseAttribute, damageEffect', keys: ['baseAttributeType', 'baseAttributeValue', 'fixedAttributes', 'adds', 'itemCategory', 'damageEffect'] },
    { key: 'rank', label: 'Patente mínima exigida', hint: 'minRankRequired', keys: ['minRankRequired'] },
    { key: 'sound', label: 'Som de Batalha (SFX ao atacar)', hint: 'battleSoundUrl', keys: ['battleSoundUrl'] },
    { key: 'model', label: 'Modelo 2D/3D e Malha (Mesh)', hint: 'gameModelUrl, textura, cabeça Minecraft, paper doll 2D, extractMeshName', keys: ['gameModelUrl', 'modelTextureUrl', 'minecraftHeadValue', 'gameImage2dUrl', 'backColor', 'extractMeshName'] },
    { key: 'transforms', label: 'Transformação 3D (Debug 3D)', hint: 'modelTransforms (posição, rotação, escala por gênero/parte)', keys: ['modelTransforms'] },
    { key: 'rarity', label: 'Raridade', hint: 'rarity', keys: ['rarity'] },
    { key: 'gacha', label: 'Configuração de Gacha', hint: 'gachaConfig, useGlobalGacha', keys: ['gachaConfig', 'useGlobalGacha'] },
    { key: 'slot', label: 'Parte do corpo (slot)', hint: 'avatarPart', keys: ['avatarPart'] },
    { key: 'active', label: 'Disponível na loja', hint: 'active', keys: ['active'] },
    { key: 'sale', label: 'Bazar (preço mínimo de revenda)', hint: 'minSalePrice', keys: ['minSalePrice'] },
    { key: 'forge', label: 'Forja e Transmutação (chance, custo, materiais, resultado)', hint: 'forgeConfig, isForgeable, isTransmutable, transmuteConfig, isTransmuted', keys: ['forgeConfig', 'isForgeable', 'isTransmutable', 'transmuteConfig', 'isTransmuted'] },
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

  // Encontra a correspondência entre itens locais e do Banco de forma robusta e inteligente:
  // 1) Link direto por importedFromId ou ID correspondente;
  // 2) Correspondência por Modelo 3D + Slot + Malha (se configurado 3D);
  // 3) Correspondência por Título normalizado + Slot/Tipo;
  // 4) Correspondência por Título normalizado apenas.
  const findMatch = (rows: any[], targetData: any, targetId?: string) => {
    const norm = (s?: string) => (s || '').trim().toLowerCase();
    const tTitle = norm(targetData?.title || targetData?.name);
    const tModel = (targetData?.gameModelUrl || '').trim();
    const tPart = (targetData?.avatarPart || '').trim();
    const tMesh = (targetData?.extractMeshName || '').trim();
    const tType = (targetData?.type || '').trim();

    // 1) Link direto por importedFromId ou ID
    if (targetId) {
      const byDirectId = (rows || []).find(r => r.id === targetId || (r.data && r.data.importedFromId === targetId));
      if (byDirectId) return byDirectId;
    }
    if (targetData?.importedFromId) {
      const byImportId = (rows || []).find(r => r.id === targetData.importedFromId || (r.data && r.data.importedFromId === targetData.importedFromId));
      if (byImportId) return byImportId;
    }

    // 2) Correspondência por Modelo 3D + Slot (+ Malha se especificada)
    if (tModel && tPart) {
      const byModel = (rows || []).find(r => {
        const rd = r.data || {};
        const rModel = (rd.gameModelUrl || '').trim();
        const rPart = (rd.avatarPart || '').trim();
        const rMesh = (rd.extractMeshName || '').trim();
        if (rModel === tModel && rPart === tPart) {
          if (tMesh || rMesh) return tMesh === rMesh;
          return true;
        }
        return false;
      });
      if (byModel) return byModel;
    }

    // 3) Correspondência por Nome Exato normalizado + Slot/Tipo
    if (tTitle) {
      const byTitleAndSlot = (rows || []).find(r => {
        const rd = r.data || {};
        const rTitle = norm(rd.title || r.name);
        const rPart = (rd.avatarPart || '').trim();
        const rType = (rd.type || r.type || '').trim();
        return rTitle === tTitle && (
          (tPart && rPart && tPart === rPart) ||
          (tType && rType && tType === rType)
        );
      });
      if (byTitleAndSlot) return byTitleAndSlot;

      // 4) Fallback por Nome Exato normalizado
      const byTitleOnly = (rows || []).find(r => {
        const rd = r.data || {};
        const rTitle = norm(rd.title || r.name);
        return rTitle === tTitle;
      });
      if (byTitleOnly) return byTitleOnly;
    }

    return null;
  };

  // Superadmin: sincroniza o catálogo DESTA escola com o Banco de Itens (global).
  // Compara item por item e aplica TODAS as configurações modificadas para o Banco de Itens:
  // - Atualiza itens existentes no banco com as novas configurações (modelTransforms do Debug 3D, malhas, efeitos, atributos, sons etc.)
  // - Se um item foi criado nesta escola e ainda não existe no Banco, cadastra como novo item global
  // - Vincula o importedFromId no item local para manter sincronia perfeita
  // - Atualiza a tabela global de transforms (item_transforms)
  const syncCatalogToBank = async () => {
    if (!isSuperAdmin) return;
    const confirmed = await showConfirm(
      'Sincronizar o catálogo DESTA escola com o Banco de Itens Global?\n\n' +
      '• Todas as configurações modificadas nesta escola (incluindo Debug 3D, malhas, efeitos, atributos, imagens e sons) serão refletidas no Banco Global.\n' +
      '• Itens locais novos que ainda não existem no Banco de Itens serão cadastrados no Banco Global.\n\n' +
      'Deseja continuar?'
    );
    if (!confirmed) return;
    if (!tenantId) { showAlert('Selecione uma escola para sincronizar.'); return; }
    setLoading(true);
    try {
      const { data: localRows } = await supabase.from('store_items').select('*').eq('tenant_id', tenantId);
      const { data: bankRows } = await supabase.from('store_items').select('*').eq('is_global', true);

      let matched = 0, updated = 0, unchanged = 0, created = 0;
      const bankItemsList = [...(bankRows || [])];

      for (const local of (localRows || [])) {
        const localData = local.data || {};
        const bankMatch = findMatch(bankItemsList, localData, local.id);

        if (bankMatch) {
          matched++;
          const bankData = bankMatch.data || {};
          const { result, changed } = mergeDeepChanged(bankData, localData);

          // Se houve alteração nos dados do banco
          if (changed) {
            const columns = deriveStoreColumns(result);
            const { error } = await supabase.from('store_items').update({ data: result, ...columns }).eq('id', bankMatch.id);
            if (!error) {
              updated++;
              bankMatch.data = result;
            } else {
              console.error('Erro ao sincronizar item do banco:', error);
            }
          } else {
            unchanged++;
          }

          // Garante que o item local aponte para o bankMatch.id
          if (localData.importedFromId !== bankMatch.id) {
            localData.importedFromId = bankMatch.id;
            await supabase.from('store_items').update({ data: localData }).eq('id', local.id);
          }

          // Se houver modelTransforms, garante sincronização na tabela global item_transforms
          if (localData.modelTransforms && Object.keys(localData.modelTransforms).length > 0) {
            try {
              const itemKey = computeItemTransformKey(localData);
              if (itemKey && itemKey !== '||') {
                const { data: exSnap } = await supabase.from('item_transforms').select('model_transforms').eq('item_key', itemKey).maybeSingle();
                const prev = (exSnap?.model_transforms as any) || {};
                await supabase.from('item_transforms').upsert({
                  item_key: itemKey,
                  model_transforms: { ...prev, ...localData.modelTransforms }
                }, { onConflict: 'item_key' });
              }
            } catch (e) {
              console.error('Erro ao upsert em item_transforms:', e);
            }
          }
        } else {
          // Item local não existe no Banco Global -> criar no Banco Global!
          const newBankId = uuidv4();
          const newBankData = { ...localData };
          delete newBankData.importedFromId;
          const columns = deriveStoreColumns(newBankData);

          const { error: insErr } = await supabase.from('store_items').insert({
            id: newBankId,
            ...columns,
            data: newBankData,
            tenant_id: null,
            is_global: true
          });

          if (!insErr) {
            created++;
            bankItemsList.push({ id: newBankId, is_global: true, data: newBankData, ...columns });
            // Vincula no item local
            localData.importedFromId = newBankId;
            await supabase.from('store_items').update({ data: localData }).eq('id', local.id);

            // Upsert em item_transforms
            if (localData.modelTransforms && Object.keys(localData.modelTransforms).length > 0) {
              try {
                const itemKey = computeItemTransformKey(localData);
                if (itemKey && itemKey !== '||') {
                  await supabase.from('item_transforms').upsert({
                    item_key: itemKey,
                    model_transforms: localData.modelTransforms
                  }, { onConflict: 'item_key' });
                }
              } catch (e) {
                console.error('Erro ao upsert em item_transforms:', e);
              }
            }
          } else {
            console.error('Erro ao criar novo item no Banco:', insErr);
          }
        }
      }

      invalidateGlobalItemTransforms();
      await fetchData(false);
      showAlert(`Sincronização com o Banco concluída!\n\n• ${updated} item(ns) atualizado(s) no Banco Global\n• ${created} novo(s) item(ns) cadastrado(s) no Banco\n• ${unchanged} item(ns) já estavam idênticos.`);
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
    const init: Record<string, boolean> = {
      importNew: true
    };
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
    const shouldImportNew = !!selection['importNew'];

    if (allowedKeys.size === 0 && !shouldImportNew) {
      showAlert('Nenhuma opção selecionada — nada será sincronizado.');
      return;
    }
    setShowSyncOptions(false);
    setLoading(true);
    try {
      const { data: localRows } = await supabase.from('store_items').select('*').eq('tenant_id', tenantId);
      const { data: bankRows } = await supabase.from('store_items').select('*').eq('is_global', true);

      let matched = 0, updated = 0, unchanged = 0, imported = 0;
      const currentLocalRows = [...(localRows || [])];

      for (const bank of (bankRows || [])) {
        const bankData = bank.data || {};
        const local = findMatch(currentLocalRows, bankData, bank.id);

        if (!local) {
          // Item do banco não existe nesta escola. Se marcado "Importar itens novos", importa!
          if (shouldImportNew) {
            const newItemData = {
              ...bankData,
              importedFromId: bank.id,
              active: bankData.active ?? true
            };
            const columns = deriveStoreColumns(newItemData);
            const { data: inserted, error: insErr } = await supabase.from('store_items').insert({
              ...columns,
              data: newItemData,
              tenant_id: tenantId,
              is_global: false
            }).select('*').single();

            if (!insErr && inserted) {
              imported++;
              currentLocalRows.push(inserted);

              // Se o item importado tem modelTransforms, reflete no registro global
              if (newItemData.modelTransforms && Object.keys(newItemData.modelTransforms).length > 0) {
                try {
                  const itemKey = computeItemTransformKey(newItemData);
                  if (itemKey && itemKey !== '||') {
                    const { data: exSnap } = await supabase.from('item_transforms').select('model_transforms').eq('item_key', itemKey).maybeSingle();
                    const prev = (exSnap?.model_transforms as any) || {};
                    await supabase.from('item_transforms').upsert({
                      item_key: itemKey,
                      model_transforms: { ...prev, ...newItemData.modelTransforms }
                    }, { onConflict: 'item_key' });
                  }
                } catch (e) {
                  console.error('Erro ao registrar item_transforms no import:', e);
                }
              }
            } else {
              console.error('Erro ao importar novo item do banco:', insErr);
            }
          }
          continue;
        }

        matched++;
        const localData = local.data || {};
        const { result, changed } = mergeDeepChanged(localData, bankData, allowedKeys);

        // Garante que o item local tenha o importedFromId do banco configurado
        let needLinkUpdate = false;
        if (result.importedFromId !== bank.id) {
          result.importedFromId = bank.id;
          needLinkUpdate = true;
        }

        if (!changed && !needLinkUpdate) {
          unchanged++;
          continue;
        }

        const columns = deriveStoreColumns(result);
        const { error } = await supabase.from('store_items').update({ data: result, ...columns }).eq('id', local.id);
        if (error) { console.error('Erro ao atualizar item local:', error); continue; }
        updated++;

        // Cascateia a nova configuração (principalmente modelTransforms do Debug 3D)
        // para os inventários dos jogadores desta escola que já possuem o item.
        const { data: userItems } = await supabase.from('user_items').select('id, data').eq('item_id', local.id);
        if (userItems && userItems.length > 0) {
          for (const ui of userItems) {
            const uiData = ui.data || {};
            const { result: uiResult, changed: uiChanged } = mergeDeepChanged(uiData, result, allowedKeys);
            if (uiChanged) {
              await supabase.from('user_items').update({ data: uiResult }).eq('id', ui.id);
            }
          }
        }

        // Se modelTransforms foi sincronizado, garante em item_transforms
        if (result.modelTransforms && Object.keys(result.modelTransforms).length > 0) {
          try {
            const itemKey = computeItemTransformKey(result);
            if (itemKey && itemKey !== '||') {
              const { data: exSnap } = await supabase.from('item_transforms').select('model_transforms').eq('item_key', itemKey).maybeSingle();
              const prev = (exSnap?.model_transforms as any) || {};
              await supabase.from('item_transforms').upsert({
                item_key: itemKey,
                model_transforms: { ...prev, ...result.modelTransforms }
              }, { onConflict: 'item_key' });
            }
          } catch (e) {
            console.error('Erro ao sincronizar item_transforms:', e);
          }
        }
      }

      invalidateGlobalItemTransforms();
      await fetchData(false);
      showAlert(`Atualização a partir do Banco concluída!\n\n• ${updated} item(ns) desta escola atualizado(s)\n• ${imported} novo(s) item(ns) importado(s) do Banco\n• ${unchanged} item(ns) já estavam idênticos.`);
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
      scrollChanceBonus: item.scrollChanceBonus,
      breakTargetItemId: item.breakTargetItemId,
      breakMinQty: item.breakMinQty,
      breakMaxQty: item.breakMaxQty,
      breakCost: item.breakCost,
      breakSuccessChance: item.breakSuccessChance,
      fuseTargetItemId: item.fuseTargetItemId,
      fuseRequiredQty: item.fuseRequiredQty,
      fuseResultQty: item.fuseResultQty,
      fuseCost: item.fuseCost,
      fuseSuccessChance: item.fuseSuccessChance,
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
  const handleImportMultipleFromBank = async (itemsToImport: any[]) => {
    if (!itemsToImport || itemsToImport.length === 0) return;
    let imported = 0;
    let errors = 0;
    let skipped = 0;
    for (const item of itemsToImport) {
      try {
        // DEDUP: pular itens já importados por esta escola (compara com o estado local 'items')
        const already = (items || []).find((i: any) =>
          ((i as any).importedFromId && (i as any).importedFromId === (item._rawId || item.id)) ||
          ((i as any).title === item.title && (i as any).avatarPart === item.avatarPart && (i as any).gameModelUrl === item.gameModelUrl)
        );
        if (already) {
          skipped++;
          continue;
        }
        const itemData: any = {
          ...item,
          title: item.title || 'Sem nome',
          description: item.description || '',
          cost: Number(item.cost) || 100,
          type: item.type || 'consumable',
          imageUrl: item.imageUrl || '',
          rarity: item.rarity || 'common',
          active: item.active ?? true,
          minRankRequired: item.minRankRequired || 0,
          minSalePrice: item.minSalePrice || 0,
          importedFromId: item._rawId || item.id || null,
        };
        delete itemData._rawId;
        delete itemData._isGlobal;
        delete itemData._tenantId;

        const columns = deriveStoreColumns(itemData);
        const { error } = await supabase.from('store_items').insert({
          ...columns,
          data: itemData,
          tenant_id: tenantId || null,
          is_global: false
        });
        if (error) {
          console.error('Erro ao importar item:', item.title, error);
          errors++;
        } else {
          imported++;
          // Se tiver transform 3D, reflete no registro global
          if (itemData.modelTransforms && Object.keys(itemData.modelTransforms).length > 0) {
            try {
              const itemKey = computeItemTransformKey(itemData);
              if (itemKey && itemKey !== '||') {
                const { data: exSnap } = await supabase.from('item_transforms').select('model_transforms').eq('item_key', itemKey).maybeSingle();
                const prev = (exSnap?.model_transforms as any) || {};
                await supabase.from('item_transforms').upsert({
                  item_key: itemKey,
                  model_transforms: { ...prev, ...itemData.modelTransforms }
                }, { onConflict: 'item_key' });
              }
            } catch (e) {
              console.error('Erro ao registrar item_transforms no lote:', e);
            }
          }
        }
      } catch (e) {
        console.error('Erro ao importar item:', item.title, e);
        errors++;
      }
    }
    invalidateGlobalItemTransforms();
    await showAlert('Importação concluída', `${imported} item(ns) importado(s) com sucesso.${skipped > 0 ? ` ${skipped} já estavam importados e foram ignorados.` : ''}${errors > 0 ? ` ${errors} falharam.` : ''}`);
    fetchData(false);
  };

  const handleSaveItem = async () => {
    // Validações de campos obrigatórios (feedback explícito, sem erro silencioso)
    if (!formData.title || !formData.title.trim()) {
      showToast('Informe o nome (título) do item.', 'error');
      return;
    }
    if (!formData.cost || Number(formData.cost) <= 0) {
      showToast('Informe um custo válido (maior que zero).', 'error');
      return;
    }

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
      scrollChanceBonus: formData.gameEffect === 'blacksmith_scroll'
        ? (formData.scrollChanceBonus !== undefined && formData.scrollChanceBonus !== null && !isNaN(Number(formData.scrollChanceBonus))
            ? Number(formData.scrollChanceBonus)
            : 30)
        : undefined,
      breakTargetItemId: formData.gameEffect === 'break_item' ? (formData.breakTargetItemId || undefined) : undefined,
      breakMinQty: formData.gameEffect === 'break_item' ? (Number(formData.breakMinQty) || 1) : undefined,
      breakMaxQty: formData.gameEffect === 'break_item' ? (Number(formData.breakMaxQty) || 1) : undefined,
      breakCost: formData.gameEffect === 'break_item' ? (Number(formData.breakCost) || 0) : undefined,
      breakSuccessChance: formData.gameEffect === 'break_item' ? (formData.breakSuccessChance !== undefined && formData.breakSuccessChance !== null && !isNaN(Number(formData.breakSuccessChance)) ? Number(formData.breakSuccessChance) : 80) : undefined,
      fuseTargetItemId: formData.gameEffect === 'fuse_item' ? (formData.fuseTargetItemId || undefined) : undefined,
      fuseRequiredQty: formData.gameEffect === 'fuse_item' ? (Number(formData.fuseRequiredQty) || 50) : undefined,
      fuseResultQty: formData.gameEffect === 'fuse_item' ? (Number(formData.fuseResultQty) || 1) : undefined,
      fuseCost: formData.gameEffect === 'fuse_item' ? (Number(formData.fuseCost) || 0) : undefined,
      fuseSuccessChance: formData.gameEffect === 'fuse_item' ? (formData.fuseSuccessChance !== undefined && formData.fuseSuccessChance !== null && !isNaN(Number(formData.fuseSuccessChance)) ? Number(formData.fuseSuccessChance) : 75) : undefined,
    };

    if (editingId) {
      const { error: saveErr } = await supabase.from('store_items').update({
        name: itemData.title, description: itemData.description, type: itemData.type,
        price: itemData.cost, image_url: itemData.imageUrl, active: itemData.active,
        rarity: itemData.rarity, avatar_part: itemData.avatarPart, data: itemData
      }).eq('id', editingId);
      if (saveErr) {
        showToast(`Erro ao salvar o item: ${saveErr.message}`, 'error');
        return;
      }

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
          transmuteConfig: itemData.transmuteConfig || null,
          scrollChanceBonus: itemData.scrollChanceBonus ?? null,
          breakTargetItemId: itemData.breakTargetItemId ?? null,
          breakMinQty: itemData.breakMinQty ?? null,
          breakMaxQty: itemData.breakMaxQty ?? null,
          breakCost: itemData.breakCost ?? null,
          fuseTargetItemId: itemData.fuseTargetItemId ?? null,
          fuseRequiredQty: itemData.fuseRequiredQty ?? null,
          fuseResultQty: itemData.fuseResultQty ?? null,
          fuseCost: itemData.fuseCost ?? null
        };
        updatePromises.push(supabase.from('user_items').update({ data: newData }).eq('id', row.id) as any);
      });
      await Promise.all(updatePromises);
      // Invalida o cache de itens equipados de TODOS os alunos afetados (para o
      // boneco refletir a nova configuração sem recarregar a página).
      const affectedStudents = new Set<string>();
      (snapUserItems || []).forEach((row: any) => { if (row.student_id) affectedStudents.add(row.student_id); });
      affectedStudents.forEach(uid => invalidateEquippedItems(uid));

      // Se houver transforms 3D (Debug 3D), atualiza o registro global
      if (itemData.modelTransforms && Object.keys(itemData.modelTransforms).length > 0) {
        try {
          const itemKey = computeItemTransformKey(itemData);
          if (itemKey && itemKey !== '||') {
            const { data: exSnap } = await supabase.from('item_transforms').select('model_transforms').eq('item_key', itemKey).maybeSingle();
            const prev = (exSnap?.model_transforms as any) || {};
            await supabase.from('item_transforms').upsert({
              item_key: itemKey,
              model_transforms: { ...prev, ...itemData.modelTransforms }
            }, { onConflict: 'item_key' });
            invalidateGlobalItemTransforms();
          }
        } catch (e) {
          console.error('Erro ao atualizar item_transforms no handleSaveItem:', e);
        }
      }
      
    } else {
      // Cópia local (da escola) — editável pelo admin local
      const { error: saveErr } = await supabase.from('store_items').insert({
        name: itemData.title, description: itemData.description, type: itemData.type,
        price: itemData.cost, image_url: itemData.imageUrl, active: itemData.active,
        rarity: itemData.rarity, avatar_part: itemData.avatarPart, data: itemData,
        tenant_id: tenantId || null,
        is_global: false
      });
      if (saveErr) {
        showToast(`Erro ao criar o item: ${saveErr.message}`, 'error');
        return;
      }

      // Se houver transforms 3D (Debug 3D), atualiza o registro global
      if (itemData.modelTransforms && Object.keys(itemData.modelTransforms).length > 0) {
        try {
          const itemKey = computeItemTransformKey(itemData);
          if (itemKey && itemKey !== '||') {
            await supabase.from('item_transforms').upsert({
              item_key: itemKey,
              model_transforms: itemData.modelTransforms
            }, { onConflict: 'item_key' });
            invalidateGlobalItemTransforms();
          }
        } catch (e) {
          console.error('Erro ao registrar item_transforms na criação:', e);
        }
      }

      // Só a CRIAÇÃO MANUAL cria também a cópia-base GLOBAL (banco de itens).
      // Importações (importadoFromId presente) NÃO geram global.
      if (!itemData.importedFromId && !isImportCustomize) {
        const { error: globalErr } = await supabase.from('store_items').insert({
          id: uuidv4(),
          name: itemData.title, description: itemData.description, type: itemData.type,
          price: itemData.cost, image_url: itemData.imageUrl, active: itemData.active,
          rarity: itemData.rarity, avatar_part: itemData.avatarPart, data: itemData,
          tenant_id: null,
          is_global: true
        });
        if (globalErr) {
          console.error('Erro ao criar cópia global do item:', globalErr);
          showToast(`Item criado localmente, mas a cópia GLOBAL (banco) falhou: ${globalErr.message}`, 'error');
        }
      }
    }

    setIsEditing(false);
    setEditingId(null);
    setIsImportCustomize(false);
    setFormData({ title: '', description: '', cost: 100, type: 'consumable', gameEffect: 'none', minRankRequired: 0, active: true, imageUrl: '' });
    fetchData(false);
    showToast(`Item ${editingId ? 'atualizado' : 'criado'} com sucesso!`, 'success');
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
    setHoveredItem(null);
    setFormData({
      ...item,
      minRankRequired: resolveMinRankName(item.minRankRequired),
      scrollChanceBonus: item.scrollChanceBonus !== undefined && item.scrollChanceBonus !== null
        ? Number(item.scrollChanceBonus)
        : (item.gameEffect === 'blacksmith_scroll' ? 30 : undefined)
    });
    setEditingId(item.id);
    setIsEditing(true);
  };

  // Superadmin edita um item GLOBAL do banco (abre o mesmo editor; salvar atualiza o global)
  const openEditGlobal = (item: any) => {
    setHoveredItem(null);
    setFormData({
      ...item,
      id: item._rawId,
      _isGlobal: true,
      minRankRequired: resolveMinRankName(item.minRankRequired),
      scrollChanceBonus: item.scrollChanceBonus !== undefined && item.scrollChanceBonus !== null
        ? Number(item.scrollChanceBonus)
        : (item.gameEffect === 'blacksmith_scroll' ? 30 : undefined)
    } as StoreItem);
    setEditingId(item._rawId);
    setIsEditing(true);
  };

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Carregando Loja...</div>;

  // Todos os itens do TENANT ATUAL (sem duplicar com o Banco — o Banco entra quando importado)
  const allItems = items;
  // @ts-ignore
  const sortByTitle = (a: StoreItem, b: StoreItem) => (a.title || '').toLowerCase().localeCompare((b.title || '').toLowerCase());
  // Materiais disponíveis para forja/transmutação: itens 'other' do tenant atual, ordem alfabética por raridade
  const materialOptions = allItems.filter(i => (i.type || '') === 'other').sort(sortByRarityThenTitle);
  // Itens resultado de transmutação: equipáveis marcados como isTransmuted (tenant atual), ordem alfabética por raridade
  const transmuteResultOptions = allItems.filter(i => i.type === 'equippable' && (i as any).isTransmuted).sort(sortByRarityThenTitle);

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
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
              {isSuperAdmin && (
                <button className="login-btn" onClick={syncCatalogToBank} style={{ padding: '0.45rem 0.8rem', display: 'flex', gap: '0.4rem', alignItems: 'center', background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.4)' }} title="Sincronizar com o Banco: envia itens modificados desta escola para o Banco Global">
                  <UploadCloud size={18} /> <span className="hide-on-mobile">Sincronizar com o Banco</span>
                </button>
              )}
              {isSuperAdmin && (
                <button className="login-btn" onClick={syncCatalogFromBank} style={{ padding: '0.45rem 0.8rem', display: 'flex', gap: '0.4rem', alignItems: 'center', background: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6', border: '1px solid rgba(59, 130, 246, 0.4)' }} title="Sincronizar do Banco: baixa as configurações do Banco Global para esta escola">
                  <DownloadCloud size={18} /> <span className="hide-on-mobile">Sincronizar do Banco</span>
                </button>
              )}
              {canItems('items', 'create') && (
                <button className="login-btn" onClick={() => setShowItemBank(true)} style={{ padding: '0.45rem 0.8rem', display: 'flex', gap: '0.4rem', alignItems: 'center', background: 'rgba(139, 92, 246, 0.2)', color: '#8b5cf6', border: '1px solid rgba(139, 92, 246, 0.3)' }} title="Banco de Itens">
                  <Package size={18} /> <span className="hide-on-mobile">Banco de Itens</span>
                </button>
              )}
              {(isSuperAdmin || canItems('banks', 'view')) && (
                <button className="login-btn" onClick={async () => { setForgeSoundsConfig(await fetchForgeSounds(tenantId)); setShowForgeSounds(true); }} style={{ padding: '0.45rem 0.8rem', display: 'flex', gap: '0.4rem', alignItems: 'center', background: 'rgba(234, 88, 12, 0.15)', color: '#f97316', border: '1px solid rgba(234, 88, 12, 0.4)' }} title="Sons da Forja & Transmutação">
                  <Volume2 size={18} /> <span className="hide-on-mobile">Sons da Forja</span>
                </button>
              )}
              {canItems('items', 'create') && (
                <button className="login-btn" onClick={() => { setHoveredItem(null); setEditingId(null); setFormData({ title: '', description: '', cost: 100, type: 'consumable', gameEffect: 'none', usableInQuest: false, minRankRequired: 0, active: true, imageUrl: '', rarity: 'common', minSalePrice: 0 }); setIsEditing(true); }} style={{ padding: '0.45rem 0.8rem', display: 'flex', gap: '0.4rem', alignItems: 'center', background: 'var(--gold-primary)', color: 'var(--text-on-gold, #000000)', border: 'none' }} title="Novo Item">
                  <Plus size={18} /> <span className="hide-on-mobile">Novo Item</span>
                </button>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center', padding: '0.5rem 0', borderBottom: '1px solid rgba(255,255,255,0.05)', marginBottom: '0.5rem' }}>
            <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap', alignItems: 'center' }}>
              {([
                { key: 'all', label: 'Todos' },
                { key: 'consumable', label: 'Consumíveis' },
                { key: 'attack', label: 'Ataque' },
                { key: 'defense', label: 'Defesa' },
                { key: 'other', label: 'Outros' },
              ] as const).map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setCatalogCategoryTab(tab.key)}
                  style={{ padding: '0.3rem 0.8rem', borderRadius: '6px', border: '1px solid var(--border-glass)', background: catalogCategoryTab === tab.key ? 'var(--gold-primary)' : 'rgba(0,0,0,0.25)', color: catalogCategoryTab === tab.key ? '#000' : 'var(--text-primary)', fontSize: '0.85rem', cursor: 'pointer', fontWeight: catalogCategoryTab === tab.key ? 'bold' : 'normal' }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

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
              let filtered = [...items];
              if (catalogCategoryTab === 'consumable') {
                filtered = filtered.filter(i => i.type === 'consumable');
              } else if (catalogCategoryTab === 'attack') {
                filtered = filtered.filter(i => i.type === 'equippable' && i.itemCategory === 'attack');
              } else if (catalogCategoryTab === 'defense') {
                filtered = filtered.filter(i => i.type === 'equippable' && i.itemCategory === 'defense');
              } else if (catalogCategoryTab === 'other') {
                filtered = filtered.filter(i => i.type === 'other' || (i.type === 'equippable' && i.itemCategory !== 'attack' && i.itemCategory !== 'defense'));
              }
              const sortedItems = filtered.sort((a, b) => {
                let comparison = 0;
                if (sortBy === 'name') {
                  comparison = a.title.localeCompare(b.title);
                } else if (sortBy === 'rarity') {
                  const wA = RARITY_WEIGHTS[a.rarity || 'common'] || 1;
                  const wB = RARITY_WEIGHTS[b.rarity || 'common'] || 1;
                  comparison = (wA - wB) || a.title.localeCompare(b.title);
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
                          {(item.isTransmuted || item.type === 'other' || item.gameEffect === 'break_item' || item.gameEffect === 'fuse_item') && (
                            <span style={{ fontSize: '0.68rem', background: 'rgba(234,88,12,0.18)', color: '#fb923c', border: '1px solid rgba(234,88,12,0.35)', padding: '0.1rem 0.45rem', borderRadius: '10px', whiteSpace: 'nowrap' }} title="Este item não aparece na loja dos alunos (obtido via missões, drops ou ferreiro)">
                              Oculto na Loja
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
                            <span>Tipo: {item.type === 'consumable' ? 'Consumível' : item.type === 'other' ? 'Material' : 'Equipável'}</span>
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
                <input type="number" value={formData.cost ?? 0} onChange={e => setFormData({...formData, cost: Number(e.target.value)})} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)' }} />
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

              {(formData.type === 'consumable' || formData.type === 'other') && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Poder no Jogo (Gameplay)</label>
                    <select
                      value={formData.gameEffect || 'none'}
                      onChange={e => {
                        const eff = e.target.value as GameEffectType;
                        setFormData({
                          ...formData,
                          gameEffect: eff,
                          scrollChanceBonus: eff === 'blacksmith_scroll'
                            ? (formData.scrollChanceBonus !== undefined && formData.scrollChanceBonus !== null ? formData.scrollChanceBonus : 30)
                            : formData.scrollChanceBonus,
                          breakMinQty: eff === 'break_item' ? (formData.breakMinQty ?? 1) : formData.breakMinQty,
                          breakMaxQty: eff === 'break_item' ? (formData.breakMaxQty ?? 5) : formData.breakMaxQty,
                          breakCost: eff === 'break_item' ? (formData.breakCost ?? 10) : formData.breakCost,
                          breakSuccessChance: eff === 'break_item' ? (formData.breakSuccessChance ?? 80) : formData.breakSuccessChance,
                          fuseRequiredQty: eff === 'fuse_item' ? (formData.fuseRequiredQty ?? 50) : formData.fuseRequiredQty,
                          fuseResultQty: eff === 'fuse_item' ? (formData.fuseResultQty ?? 1) : formData.fuseResultQty,
                          fuseCost: eff === 'fuse_item' ? (formData.fuseCost ?? 50) : formData.fuseCost,
                          fuseSuccessChance: eff === 'fuse_item' ? (formData.fuseSuccessChance ?? 75) : formData.fuseSuccessChance
                        });
                      }}
                      style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)' }}
                    >
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
                      <option value="cure_bleed">Bandagem (Estanca o sangramento)</option>
                      <option value="cure_poison">Antídoto (Cura o envenenamento)</option>
                      <option value="cure_freeze">Chá Quente (Descongela)</option>
                      <option value="cure_burn">Pomada Refrescante (Apaga o fogo)</option>
                      <option value="cure_electric">Isolante (Elimina o choque elétrico)</option>
                      <option value="blacksmith_scroll">Pergaminho do Ferreiro (Bônus de chance + Proteção contra destruição)</option>
                      <option value="break_item">⛏️ Quebrar / Triturar no Ferreiro (Material Bruto ➔ Fragmentos)</option>
                      <option value="fuse_item">🔥 Fundir / Agrupar no Ferreiro (Fragmentos ➔ Lingote/Item)</option>
                    </select>
                  </div>
                  {formData.gameEffect === 'blacksmith_scroll' && (
                    <div style={{ background: 'rgba(251, 191, 36, 0.08)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(251, 191, 36, 0.3)' }}>
                      <label style={{ display: 'block', marginBottom: '0.5rem', color: '#fbbf24', fontWeight: 'bold' }}>
                        🔨 Bônus de Chance na Forja (%)
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={formData.scrollChanceBonus ?? 30}
                        onChange={e => setFormData({...formData, scrollChanceBonus: Math.max(1, Math.min(100, Number(e.target.value)))})}
                        style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)' }}
                      />
                      <small style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', display: 'block', marginTop: '4px' }}>
                        Este valor (%) é somado à chance base de forja. Ex.: base 70% + 30% = 100% (limitado a 100%).
                        Se deixar em 100%, o pergaminho garante sucesso total como antes.
                      </small>
                    </div>
                  )}
                  {formData.gameEffect === 'break_item' && (
                    <div style={{ background: 'rgba(234, 88, 12, 0.08)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(234, 88, 12, 0.3)' }}>
                      <label style={{ display: 'block', marginBottom: '0.5rem', color: '#f97316', fontWeight: 'bold' }}>
                        ⛏️ Quebra & Refino no Ferreiro (Material Bruto ➔ Fragmentos)
                      </label>
                      <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', margin: '0 0 0.5rem 0' }}>
                        Ao levar este material bruto ao Ferreiro, o jogador paga a taxa para quebrar o item e obter fragmentos aleatórios (entre o mínimo e o máximo configurado por unidade).
                      </p>
                      <div style={{ background: 'rgba(234, 88, 12, 0.15)', border: '1px solid rgba(234, 88, 12, 0.35)', borderRadius: '6px', padding: '0.4rem 0.6rem', fontSize: '0.75rem', color: '#fb923c', marginBottom: '0.75rem' }}>
                        🛡️ <strong>Oculto na Loja:</strong> Este item não é vendido na loja dos alunos (só pode ser obtido via missões, baús ou drops).
                      </div>

                      <div style={{ marginBottom: '0.75rem' }}>
                        <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                          Item / Fragmento Resultante:
                        </label>
                        <ItemSelect
                          items={allItems.filter(i => i.id !== (formData as any).id).sort(sortByRarityThenTitle).map(i => ({ id: i.id, title: i.title, imageUrl: i.imageUrl, rarity: i.rarity || 'common' }))}
                          value={formData.breakTargetItemId || ''}
                          onChange={(id) => setFormData({ ...formData, breakTargetItemId: id })}
                          placeholder="Selecione o fragmento resultante..."
                          width="100%"
                        />
                      </div>

                      <div className="responsive-grid-sm" style={{ gap: '0.75rem' }}>
                        <div>
                          <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                            Rendimento Mín. (por un.)
                          </label>
                          <input
                            type="number"
                            min={1}
                            max={999}
                            value={formData.breakMinQty ?? 1}
                            onChange={e => {
                              const minVal = Math.max(1, Number(e.target.value) || 1);
                              setFormData({
                                ...formData,
                                breakMinQty: minVal,
                                breakMaxQty: Math.max(minVal, formData.breakMaxQty ?? minVal)
                              });
                            }}
                            style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)' }}
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                            Rendimento Máx. (por un.)
                          </label>
                          <input
                            type="number"
                            min={formData.breakMinQty ?? 1}
                            max={999}
                            value={formData.breakMaxQty ?? 5}
                            onChange={e => {
                              const maxVal = Math.max(formData.breakMinQty ?? 1, Number(e.target.value) || 1);
                              setFormData({ ...formData, breakMaxQty: maxVal });
                            }}
                            style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)' }}
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                            Taxa Ferreiro (Moedas/un.)
                          </label>
                          <input
                            type="number"
                            min={0}
                            value={formData.breakCost ?? 10}
                            onChange={e => setFormData({ ...formData, breakCost: Math.max(0, Number(e.target.value) || 0) })}
                            style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)' }}
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.8rem', color: '#f59e0b', fontWeight: 'bold' }}>
                            Taxa de Sucesso (%)
                          </label>
                          <input
                            type="number"
                            min={1}
                            max={100}
                            value={formData.breakSuccessChance ?? 80}
                            onChange={e => setFormData({ ...formData, breakSuccessChance: Math.max(1, Math.min(100, Number(e.target.value) || 1)) })}
                            style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)' }}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                  {formData.gameEffect === 'fuse_item' && (
                    <div style={{ background: 'rgba(59, 130, 246, 0.08)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(59, 130, 246, 0.3)' }}>
                      <label style={{ display: 'block', marginBottom: '0.5rem', color: '#60a5fa', fontWeight: 'bold' }}>
                        🔥 Fundição & Agrupamento no Ferreiro (Fragmentos ➔ Lingote/Item)
                      </label>
                      <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', margin: '0 0 0.5rem 0' }}>
                        Ao juntar a quantidade necessária de fragmentos, o jogador pode levá-los ao Ferreiro e pagar a taxa para fundi-los no item/lingote resultante.
                      </p>
                      <div style={{ background: 'rgba(59, 130, 246, 0.15)', border: '1px solid rgba(59, 130, 246, 0.35)', borderRadius: '6px', padding: '0.4rem 0.6rem', fontSize: '0.75rem', color: '#93c5fd', marginBottom: '0.75rem' }}>
                        🛡️ <strong>Oculto na Loja:</strong> Este item não é vendido na loja dos alunos (só pode ser obtido via trituração no ferreiro ou missões).
                      </div>

                      <div style={{ marginBottom: '0.75rem' }}>
                        <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                          Item / Lingote Resultante:
                        </label>
                        <ItemSelect
                          items={allItems.filter(i => i.id !== (formData as any).id).sort(sortByRarityThenTitle).map(i => ({ id: i.id, title: i.title, imageUrl: i.imageUrl, rarity: i.rarity || 'common' }))}
                          value={formData.fuseTargetItemId || ''}
                          onChange={(id) => setFormData({ ...formData, fuseTargetItemId: id })}
                          placeholder="Selecione o lingote resultante..."
                          width="100%"
                        />
                      </div>

                      <div className="responsive-grid-sm" style={{ gap: '0.75rem' }}>
                        <div>
                          <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                            Fragmentos Exigidos
                          </label>
                          <input
                            type="number"
                            min={1}
                            max={9999}
                            value={formData.fuseRequiredQty ?? 50}
                            onChange={e => setFormData({ ...formData, fuseRequiredQty: Math.max(1, Number(e.target.value) || 1) })}
                            style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)' }}
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                            Quantidade Gerada
                          </label>
                          <input
                            type="number"
                            min={1}
                            max={999}
                            value={formData.fuseResultQty ?? 1}
                            onChange={e => setFormData({ ...formData, fuseResultQty: Math.max(1, Number(e.target.value) || 1) })}
                            style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)' }}
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                            Taxa Ferreiro (Moedas/lote)
                          </label>
                          <input
                            type="number"
                            min={0}
                            value={formData.fuseCost ?? 50}
                            onChange={e => setFormData({ ...formData, fuseCost: Math.max(0, Number(e.target.value) || 0) })}
                            style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)' }}
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.8rem', color: '#f59e0b', fontWeight: 'bold' }}>
                            Taxa de Sucesso (%)
                          </label>
                          <input
                            type="number"
                            min={1}
                            max={100}
                            value={formData.fuseSuccessChance ?? 75}
                            onChange={e => setFormData({ ...formData, fuseSuccessChance: Math.max(1, Math.min(100, Number(e.target.value) || 1)) })}
                            style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)' }}
                          />
                        </div>
                      </div>
                    </div>
                  )}
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
                <div style={{ clear: 'both', marginBottom: '1.5rem', border: '1px solid rgba(234,88,12,0.4)', borderRadius: '10px', padding: '1rem', background: 'rgba(234,88,12,0.05)' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', cursor: 'pointer', fontWeight: 'bold', color: 'var(--accent-red)' }}>
                    <Hammer size={18} /> Forja do Item (+1 a +9)
                  </label>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', margin: '0 0 0.75rem 0' }}>
                    Todos os equipamentos são forjáveis. A <strong>força</strong> é calculada automaticamente a partir do Atributo Base (90% menor no +0, crescendo até 100% no +9). O <strong>custo em moedas</strong> é calculado automaticamente com base no valor de compra (metade do valor acumulado + % do grau). Aqui você configura apenas a <strong>chance de sucesso</strong> de cada nível (o fallback já vem preenchido).
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>📋 Copiar Forja/Transmutação de outro item:</span>
                    <ItemSelect
                      items={allItems.filter(i => i.type === 'equippable' && i.id !== (formData as any).id).sort(sortByRarityThenTitle).map(i => ({ id: i.id, title: i.title, imageUrl: i.imageUrl, rarity: i.rarity || 'common' }))}
                      value={copyForgeFromId}
                      onChange={(id) => {
                        if (!id) { setCopyForgeFromId(''); return; }
                        const src = allItems.find(i => i.id === id);
                        if (src) {
                          setFormData({
                            ...formData,
                            isForgeable: src.isForgeable ?? true,
                            forgeConfig: src.forgeConfig || null,
                            isTransmutable: src.isTransmutable || false,
                            transmuteConfig: src.transmuteConfig || undefined,
                            isTransmuted: src.isTransmuted || false,
                          });
                          showToast(`Forja/Transmutação copiadas de "${src.title}". Revise e salve.`, 'success');
                        }
                        setCopyForgeFromId('');
                      }}
                      placeholder="— selecionar item —"
                      width={260}
                    />
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                      <thead>
                        <tr style={{ background: 'rgba(234,88,12,0.2)' }}>
                          <th style={{ padding: '6px 8px', textAlign: 'center', color: 'var(--text-secondary)' }}>Nível</th>
                          <th style={{ padding: '4px 8px', textAlign: 'center' }}>
                            <button
                              type="button"
                              onClick={() => { setChanceFillStart(typeof formData.forgeConfig?.successChancePerLevel?.[1] === 'number' ? formData.forgeConfig.successChancePerLevel[1] : (DEFAULT_FORGE_SUCCESS[1] ?? 90)); setShowChanceFill(true); }}
                              style={{ cursor: 'pointer', background: 'rgba(234,88,12,0.15)', border: '1px solid rgba(234,88,12,0.45)', color: 'var(--text-secondary)', borderRadius: '6px', padding: '4px 8px', fontWeight: 'bold', fontSize: '0.78rem', whiteSpace: 'nowrap' }}
                              title="Clique para preencher todas as chances de uma vez (início + pulo)"
                            >
                              Chance (%) ⚡ preencher
                            </button>
                          </th>
                          <th style={{ padding: '6px 8px', textAlign: 'center', color: 'var(--text-secondary)' }}>Força (calculado = padrão)</th>
                          <th
                            onClick={() => {
                              const bp = formData.cost || 100;
                              setCostFillStart(nextForgeCost(0, bp));
                              setCostFillStep(nextForgeCost(1, bp) - nextForgeCost(0, bp));
                              setCostFillMode('add');
                              setShowCostFill(true);
                            }}
                            style={{ padding: '6px 8px', textAlign: 'center', color: 'var(--text-secondary)', cursor: 'pointer', userSelect: 'none' }}
                            title="Clique para preencher todos os custos de uma vez (início + pulo/multiplicador)"
                          >
                            Custo (calculado = padrão) <span style={{ fontSize: '0.65rem', color: '#f59e0b' }}>⚡ preencher</span>
                          </th>
                          <th style={{ padding: '6px 8px', textAlign: 'center', color: 'var(--text-secondary)' }}>Materiais (item outro)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[0,1,2,3,4,5,6,7,8,9].map(lvl => {
                          const baseVal = formData.baseAttributeValue || 0;
                          const calcStrength = forgeAttributeValue(baseVal, lvl);
                          const calcCost = lvl === 0 ? 0 : nextForgeCost(lvl - 1, formData.cost || 100);
                          const setOverride = (key: 'successChancePerLevel' | 'statsPerLevel' | 'coinsCostPerLevel', l: number, val: number) => {
                            const updated = { ...(formData.forgeConfig || {}), [key]: { ...(formData.forgeConfig?.[key] || {}), [l]: val } };
                            setFormData({ ...formData, forgeConfig: updated });
                          };
                          const setMaterial = (l: number, matIdx: number, val: string) => {
                            const list = [...((formData.forgeConfig?.materialsPerLevel?.[l]) || [])];
                            if (val) list[matIdx] = val; else list.splice(matIdx, 1);
                            const updated = { ...(formData.forgeConfig || {}), materialsPerLevel: { ...(formData.forgeConfig?.materialsPerLevel || {}), [l]: list.filter(Boolean) } };
                            setFormData({ ...formData, forgeConfig: updated });
                          };
                          return (
                            <tr key={lvl} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                              <td style={{ padding: '4px 8px', textAlign: 'center', color: lvl === 0 ? '#888' : 'var(--gold-primary)', fontWeight: 'bold' }}>+{lvl}</td>
                              <td style={{ padding: '4px 8px' }}>
                                {lvl === 0 ? <span style={{ color: '#666', fontSize: '0.75rem' }}>—</span> : (
                                  <input type="number" min={0} max={100} value={formData.forgeConfig?.successChancePerLevel?.[lvl] ?? DEFAULT_FORGE_SUCCESS[lvl]} onChange={e => setOverride('successChancePerLevel', lvl, Number(e.target.value))} style={{ width: '60px', padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--border-glass)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '0.8rem' }} />
                                )}
                              </td>
                              <td style={{ padding: '4px 8px' }}>
                                <input type="number" min={0} value={formData.forgeConfig?.statsPerLevel?.[lvl] ?? calcStrength} onChange={e => setOverride('statsPerLevel', lvl, Number(e.target.value))} style={{ width: '70px', padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--border-glass)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '0.8rem' }} />
                                <div style={{ fontSize: '0.62rem', color: '#666' }}>(calc {calcStrength})</div>
                              </td>
                              <td style={{ padding: '4px 8px' }}>
                                {lvl === 0 ? <span style={{ color: '#666', fontSize: '0.75rem' }}>—</span> : (
                                  <>
                                    <input type="number" min={0} value={formData.forgeConfig?.coinsCostPerLevel?.[lvl] ?? calcCost} onChange={e => setOverride('coinsCostPerLevel', lvl, Number(e.target.value))} style={{ width: '90px', padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--border-glass)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '0.8rem' }} />
                                    <div style={{ fontSize: '0.62rem', color: '#666' }}>(calc {calcCost})</div>
                                  </>
                                )}
                              </td>
                              <td style={{ padding: '4px 8px' }}>
                                {lvl === 0 ? <span style={{ color: '#666', fontSize: '0.75rem' }}>—</span> : (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                    {[0, 1].map(matIdx => {
                                      const current = (formData.forgeConfig?.materialsPerLevel?.[lvl] || [])[matIdx] || '';
                                      return (
                                        <ItemSelect
                                          key={matIdx}
                                          items={materialOptions.map(i => ({ id: i.id, title: i.title, imageUrl: i.imageUrl, badge: i._isGlobal ? 'Banco' : undefined, rarity: i.rarity || 'common' }))}
                                          value={current}
                                          onChange={id => setMaterial(lvl, matIdx, id)}
                                          placeholder="— sem material —"
                                          width={170}
                                        />
                                      );
                                    })}
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* ===== TRANSMUTAÇÃO ===== */}
                {formData.type === 'equippable' && (
                  <div style={{ clear: 'both', marginBottom: '1.5rem', border: '1px solid rgba(139,92,246,0.4)', borderRadius: '10px', padding: '1rem', background: 'rgba(139,92,246,0.05)' }}>
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
                          <ItemSelect
                            items={transmuteResultOptions.filter(i => (i.itemCategory || 'none') === (formData.itemCategory || 'none')).map(i => ({ id: i.id, title: i.title, imageUrl: i.imageUrl, badge: i._isGlobal ? 'Banco' : undefined, rarity: i.rarity || 'common' }))}
                            value={formData.transmuteConfig.resultItemId || ''}
                            onChange={id => setFormData({ ...formData, transmuteConfig: { ...formData.transmuteConfig!, resultItemId: id } })}
                            placeholder="— Selecionar item resultado —"
                            width={280}
                          />
                          {formData.transmuteConfig.resultItemId && (
                            <p style={{ color: '#8b5cf6', fontSize: '0.75rem', margin: '4px 0 0 0' }}>✓ Resultado: {transmuteResultOptions.find(i => i.id === formData.transmuteConfig!.resultItemId)?.title || 'Item não encontrado'}</p>
                          )}
                        </div>
                        <div>
                          <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Materiais (2 itens da categoria "Outros / Diversos", dropados por monstros/baús)</label>
                          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                            {[0, 1].map(matIdx => (
                              <div key={matIdx} style={{ flex: 1, minWidth: '150px' }}>
                                <label style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Material {matIdx + 1}</label>
                                <ItemSelect
                                  items={materialOptions.map(i => ({ id: i.id, title: i.title, imageUrl: i.imageUrl, badge: i._isGlobal ? 'Banco' : undefined, rarity: i.rarity || 'common' }))}
                                  value={formData.transmuteConfig.materials?.[matIdx] || ''}
                                  onChange={id => {
                                    const mats = [...(formData.transmuteConfig!.materials || ['', ''])];
                                    mats[matIdx] = id;
                                    setFormData({ ...formData, transmuteConfig: { ...formData.transmuteConfig!, materials: mats } });
                                  }}
                                  placeholder="— Selecionar material —"
                                  width="100%"
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {formData.type === 'equippable' && formData.isTransmuted && (
                  <div style={{ marginBottom: '1.5rem', border: '1px solid rgba(139,92,246,0.4)', borderRadius: '10px', padding: '0.75rem 1rem', background: 'rgba(139,92,246,0.08)' }}>
                    <span style={{ color: '#c084fc', fontWeight: 'bold', fontSize: '0.85rem' }}>🧪 Item de Transmutação</span>
                    <p style={{ margin: '0.3rem 0 0 0', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                      Este item é marcado como <strong>resultado de transmutação</strong>. Ele <strong>não aparecerá na loja</strong> — só poderá ser obtido por transmutação.
                    </p>
                  </div>
                )}

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
                    <input type="color" value={formData.backColor || ''} onChange={(e) => setFormData({...formData, backColor: e.target.value})} style={{ width: '50px', height: '40px', padding: 0, border: 'none', borderRadius: '4px', cursor: 'pointer' }} />
                  </div>
                )}
              </div>
            )}

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
              Marque o que você deseja que o Banco de Itens atualize no catálogo desta escola. O sistema localiza o item correspondente de forma inteligente (por vínculo, modelo 3D ou nome) e atualiza apenas os campos marcados. <b>Desmarcar uma opção preserva a configuração já existente nesta escola.</b>
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <button onClick={() => { const all: Record<string, boolean> = { importNew: true }; SYNC_GROUPS.forEach(g => { all[g.key] = true; }); setSyncSelection(all); }} style={{ padding: '0.3rem 0.8rem', background: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6', border: '1px solid rgba(59, 130, 246, 0.4)', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem' }}>Marcar tudo</button>
              <button onClick={() => { const none: Record<string, boolean> = { importNew: false }; SYNC_GROUPS.forEach(g => { none[g.key] = false; }); setSyncSelection(none); }} style={{ padding: '0.3rem 0.8rem', background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border-glass)', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem' }}>Desmarcar tudo</button>
              <span style={{ marginLeft: 'auto', alignSelf: 'center', fontSize: '0.8rem', color: 'var(--gold-primary)', fontWeight: 'bold' }}>
                {(SYNC_GROUPS.filter(g => syncSelection[g.key]).length + (syncSelection['importNew'] ? 1 : 0))} de {SYNC_GROUPS.length + 1} opções
              </span>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', paddingRight: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', padding: '0.65rem 0.75rem', background: 'rgba(59, 130, 246, 0.12)', borderRadius: '8px', border: syncSelection['importNew'] ? '1px solid rgba(59, 130, 246, 0.5)' : '1px solid var(--border-glass)', cursor: 'pointer', marginBottom: '0.2rem' }}>
                <input
                  type="checkbox"
                  checked={!!syncSelection['importNew']}
                  onChange={e => setSyncSelection(prev => ({ ...prev, importNew: e.target.checked }))}
                  style={{ marginTop: '0.15rem', accentColor: '#3b82f6', width: '16px', height: '16px', flexShrink: 0 }}
                />
                <span style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                  <span style={{ color: '#60a5fa', fontSize: '0.9rem', fontWeight: 600 }}>📥 Importar itens novos do Banco</span>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>Cadastra automaticamente nesta escola qualquer item do Banco Global que ainda não exista no catálogo desta escola</span>
                </span>
              </label>
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

      {/* Modal: preencher as chances de forja de uma vez (início + pulo) */}
      {showChanceFill && createPortal(
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0, 0, 0, 0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000001, padding: '1rem' }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) setShowChanceFill(false); }}
        >
          <div style={{ background: 'var(--bg-card)', border: '1px solid rgba(234,88,12,0.5)', borderRadius: '14px', padding: '1.5rem', maxWidth: '480px', width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.7)' }}>
            <h3 style={{ margin: '0 0 0.25rem 0', color: 'var(--accent-red)', fontSize: '1.15rem' }}>⚡ Preencher Chances de Forja</h3>
            <p style={{ margin: '0 0 1rem 0', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
              Preenche as chances de <strong>+1 a +9</strong> para <strong>ESTE item</strong>. O +1 recebe a chance inicial e os próximos níveis caem pelo "pulo" escolhido.
            </p>

            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '150px' }}>
                <label style={{ display: 'block', marginBottom: '4px', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Chance inicial (+1) (%)</label>
                <input type="number" min={1} max={100} value={chanceFillStart} onChange={e => setChanceFillStart(Math.min(100, Math.max(1, Number(e.target.value) || 1)))} style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--border-glass)', background: 'var(--bg-dark)', color: 'var(--text-primary)' }} />
              </div>
              <div style={{ flex: 1, minWidth: '150px' }}>
                <label style={{ display: 'block', marginBottom: '4px', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Pulo a cada nível (%)</label>
                <input type="number" min={1} max={100} value={chanceFillStep} onChange={e => setChanceFillStep(Math.max(1, Number(e.target.value) || 1))} style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--border-glass)', background: 'var(--bg-dark)', color: 'var(--text-primary)' }} />
                <div style={{ display: 'flex', gap: '0.3rem', marginTop: '0.4rem', flexWrap: 'wrap' }}>
                  {[1, 2, 3, 5, 10, 15, 20].map(s => (
                    <button key={s} onClick={() => setChanceFillStep(s)} style={{ padding: '2px 8px', fontSize: '0.72rem', borderRadius: '4px', background: chanceFillStep === s ? 'var(--accent-red)' : 'rgba(234,88,12,0.15)', border: `1px solid ${chanceFillStep === s ? 'var(--accent-red)' : 'rgba(234,88,12,0.4)'}`, color: 'var(--text-primary)', cursor: 'pointer' }}>{s}</button>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ background: 'rgba(0,0,0,0.35)', borderRadius: '8px', padding: '0.6rem 0.9rem', marginBottom: '1.25rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              <div style={{ marginBottom: '0.25rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>Prévia:</div>
              <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                {[1,2,3,4,5,6,7,8,9].map(lvl => {
                  const v = Math.max(0, Math.min(100, chanceFillStart - (lvl - 1) * chanceFillStep));
                  return <span key={lvl} style={{ padding: '2px 6px', borderRadius: '4px', background: 'rgba(234,88,12,0.15)', border: '1px solid rgba(234,88,12,0.4)' }}>+{lvl}: {v}%</span>;
                })}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowChanceFill(false)} style={{ padding: '0.6rem 1.2rem', background: 'transparent', border: '1px solid var(--border-glass)', borderRadius: '8px', color: 'var(--text-primary)', cursor: 'pointer' }}>Cancelar</button>
              <button
                onClick={() => {
                  const perLevel: Record<number, number> = {};
                  for (let lvl = 1; lvl <= 9; lvl++) perLevel[lvl] = Math.max(0, Math.min(100, chanceFillStart - (lvl - 1) * chanceFillStep));
                  setFormData({ ...formData, forgeConfig: { ...(formData.forgeConfig || {}), successChancePerLevel: { ...(formData.forgeConfig?.successChancePerLevel || {}), ...perLevel } } });
                  setShowChanceFill(false);
                }}
                className="login-btn"
                style={{ padding: '0.6rem 1.5rem', background: 'var(--accent-red)', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
              >
                Aplicar
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal: preencher os custos de forja de uma vez (início + pulo/multiplicador) */}
      {showCostFill && createPortal(
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0, 0, 0, 0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000001, padding: '1rem' }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) setShowCostFill(false); }}
        >
          <div style={{ background: 'var(--bg-card)', border: '1px solid rgba(234,88,12,0.5)', borderRadius: '14px', padding: '1.5rem', maxWidth: '520px', width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.7)' }}>
            <h3 style={{ margin: '0 0 0.25rem 0', color: 'var(--accent-red)', fontSize: '1.15rem' }}>⚡ Preencher Custos de Forja</h3>
            <p style={{ margin: '0 0 1rem 0', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
              Preenche os custos de <strong>+1 a +9</strong> para <strong>ESTE item</strong>. O +1 recebe o valor inicial e os próximos crescem pelo "pulo" escolhido (soma ou multiplicador).
            </p>

            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '140px' }}>
                <label style={{ display: 'block', marginBottom: '4px', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Valor inicial (+1)</label>
                <input type="number" min={1} value={costFillStart} onChange={e => setCostFillStart(Math.max(1, Number(e.target.value) || 1))} style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--border-glass)', background: 'var(--bg-dark)', color: 'var(--text-primary)' }} />
              </div>
              <div style={{ flex: 1, minWidth: '140px' }}>
                <label style={{ display: 'block', marginBottom: '4px', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{costFillMode === 'add' ? 'Pulo (+ por nível)' : 'Multiplicador (× por nível)'}</label>
                <input type="number" min={1} value={costFillStep} onChange={e => setCostFillStep(Math.max(1, Number(e.target.value) || 1))} style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--border-glass)', background: 'var(--bg-dark)', color: 'var(--text-primary)' }} />
              </div>
              <div style={{ flex: 1, minWidth: '120px' }}>
                <label style={{ display: 'block', marginBottom: '4px', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Modo</label>
                <select value={costFillMode} onChange={e => setCostFillMode(e.target.value as 'add' | 'multiply')} style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--border-glass)', background: 'var(--bg-dark)', color: 'var(--text-primary)' }}>
                  <option value="add">Somar (+X por nível)</option>
                  <option value="multiply">Multiplicar (×X por nível)</option>
                </select>
              </div>
            </div>

            <div style={{ background: 'rgba(0,0,0,0.35)', borderRadius: '8px', padding: '0.6rem 0.9rem', marginBottom: '1.25rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              <div style={{ marginBottom: '0.25rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>Prévia:</div>
              <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                {[1,2,3,4,5,6,7,8,9].map(lvl => {
                  const v = costFillMode === 'add'
                    ? Math.max(0, Math.round(costFillStart + (lvl - 1) * costFillStep))
                    : Math.max(0, Math.round(costFillStart * Math.pow(costFillStep, lvl - 1)));
                  return <span key={lvl} style={{ padding: '2px 6px', borderRadius: '4px', background: 'rgba(234,88,12,0.15)', border: '1px solid rgba(234,88,12,0.4)' }}>+{lvl}: {v}</span>;
                })}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowCostFill(false)} style={{ padding: '0.6rem 1.2rem', background: 'transparent', border: '1px solid var(--border-glass)', borderRadius: '8px', color: 'var(--text-primary)', cursor: 'pointer' }}>Cancelar</button>
              <button
                onClick={() => {
                  const perLevel: Record<number, number> = {};
                  for (let lvl = 1; lvl <= 9; lvl++) {
                    perLevel[lvl] = costFillMode === 'add'
                      ? Math.max(0, Math.round(costFillStart + (lvl - 1) * costFillStep))
                      : Math.max(0, Math.round(costFillStart * Math.pow(costFillStep, lvl - 1)));
                  }
                  setFormData({ ...formData, forgeConfig: { ...(formData.forgeConfig || {}), coinsCostPerLevel: { ...(formData.forgeConfig?.coinsCostPerLevel || {}), ...perLevel } } });
                  setShowCostFill(false);
                }}
                className="login-btn"
                style={{ padding: '0.6rem 1.5rem', background: 'var(--accent-red)', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
              >
                Aplicar
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal: Sons da Forja & Transmutação */}
      {showForgeSounds && (isSuperAdmin || canItems('banks', 'view')) && createPortal(
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0, 0, 0, 0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000001, padding: '1rem' }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) setShowForgeSounds(false); }}
        >
          <div style={{ background: 'var(--bg-card)', border: '1px solid rgba(234,88,12,0.5)', borderRadius: '14px', padding: '1.5rem', maxWidth: '640px', width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.7)', maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ margin: '0 0 0.25rem 0', color: 'var(--accent-red)', fontSize: '1.15rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Volume2 size={20} /> Sons da Forja & Transmutação</h3>
            <p style={{ margin: '0 0 1rem 0', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
              Música de fundo em loop por guia. Ao forjar/transmutar a música diminui, toca o efeito e depois sucesso/falha, e a música volta do ponto em que parou.
            </p>

            {([
              { key: 'forgeMusicUrl', label: '🎵 Música da guia Forja', cat: 'music' },
              { key: 'transmuteMusicUrl', label: '🎵 Música da guia Transmutação', cat: 'music' },
              { key: 'forgeAnvilSoundUrl', label: '🔨 Som do martelo na bigorna', cat: 'effect' },
              { key: 'transmuteEffectUrl', label: '✨ Efeito sonoro da transmutação', cat: 'effect' },
              { key: 'successSoundUrl', label: '✅ Som de SUCESSO', cat: 'effect' },
              { key: 'failSoundUrl', label: '❌ Som de FALHA', cat: 'effect' },
            ] as const).map(f => (
              <div key={f.key} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.6rem', padding: '0.6rem 0.75rem', background: 'rgba(0,0,0,0.25)', borderRadius: '8px', border: '1px solid var(--border-glass)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 'bold', fontSize: '0.85rem', color: 'var(--text-primary)' }}>{f.label}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {forgeSoundsConfig[f.key] || '(nenhum)'}
                  </div>
                </div>
                <button onClick={() => { if (forgeSoundsConfig[f.key]) playSound(forgeSoundsConfig[f.key], 0.9); }} disabled={!forgeSoundsConfig[f.key]} style={{ padding: '0.4rem 0.7rem', background: 'var(--btn-bg)', border: '1px solid var(--border-glass)', borderRadius: '6px', cursor: forgeSoundsConfig[f.key] ? 'pointer' : 'not-allowed', fontSize: '0.8rem', opacity: forgeSoundsConfig[f.key] ? 1 : 0.4 }} title="Prévia">▶</button>
                <button onClick={() => setSoundPickerTarget(f.key)} style={{ padding: '0.4rem 0.7rem', background: 'rgba(139,92,246,0.2)', color: '#c084fc', border: '1px solid rgba(139,92,246,0.4)', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold', whiteSpace: 'nowrap' }}>Banco</button>
                <button onClick={() => setForgeSoundsConfig({ ...forgeSoundsConfig, [f.key]: '' })} disabled={!forgeSoundsConfig[f.key]} style={{ padding: '0.4rem 0.6rem', background: 'rgba(239,68,68,0.15)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.4)', borderRadius: '6px', cursor: forgeSoundsConfig[f.key] ? 'pointer' : 'not-allowed', fontSize: '0.85rem', opacity: forgeSoundsConfig[f.key] ? 1 : 0.4 }} title="Limpar">×</button>
              </div>
            ))}

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button onClick={() => setShowForgeSounds(false)} style={{ padding: '0.6rem 1.2rem', background: 'transparent', border: '1px solid var(--border-glass)', borderRadius: '8px', color: 'var(--text-primary)', cursor: 'pointer' }}>Cancelar</button>
              <button
                onClick={async () => {
                  const ok = await saveForgeSounds(tenantId, forgeSoundsConfig);
                  showToast(ok ? 'Sons da forja salvos com sucesso!' : 'Erro ao salvar os sons da forja.', ok ? 'success' : 'error');
                  if (ok) setShowForgeSounds(false);
                }}
                className="login-btn"
                style={{ padding: '0.6rem 1.5rem', background: 'var(--accent-red)', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
              >
                Salvar
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      <AudioBankPicker
        open={!!soundPickerTarget}
        onClose={() => setSoundPickerTarget(null)}
        categoryFilter={soundPickerTarget === 'forgeMusicUrl' || soundPickerTarget === 'transmuteMusicUrl' ? 'music' : 'effect'}
        title={soundPickerTarget ? ({ forgeMusicUrl: 'Música da guia Forja', transmuteMusicUrl: 'Música da guia Transmutação', forgeAnvilSoundUrl: 'Som do martelo na bigorna', transmuteEffectUrl: 'Efeito da transmutação', successSoundUrl: 'Som de sucesso', failSoundUrl: 'Som de falha' } as Record<string, string>)[soundPickerTarget] : ''}
        onSelect={(url) => {
          if (soundPickerTarget) setForgeSoundsConfig(c => ({ ...c, [soundPickerTarget]: url }));
          setSoundPickerTarget(null);
        }}
      />
    </div>
  );
}
