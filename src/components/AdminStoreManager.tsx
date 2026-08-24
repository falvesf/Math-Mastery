import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase';
import { Plus, Edit2, Trash2, Star, Search, List, Grid, LayoutGrid, ArrowDownAZ, ArrowUpZA, LayoutList, Columns, Package } from 'lucide-react';
import ImageGalleryModal from './ImageGalleryModal';
import DirectUploadButton from './DirectUploadButton';
import GachaConfigModal from './GachaConfigModal';
import ItemBankModal from './ItemBankModal';
import GlbMeshExtractorModal from './GlbMeshExtractorModal';
import SkinBuffIcon from '../components/SkinBuffIcon';
import ItemIcon from './ItemIcon';
import { useDialog } from '../contexts/DialogContext';
import { useTenant } from '../contexts/TenantContext';
import { usePermissions } from '../lib/permissions';
import { fetchEconomyType } from '../lib/economy';
import { RANKS } from '../lib/ranks';
import { type ItemCategory, type AttributeType, type GachaConfig, type ItemAdd } from '../lib/gacha';
import { type ModelTransformsConfig, type ModelTransform } from './AvatarCharacter';
import { v4 as uuidv4 } from 'uuid';

export type GameEffectType = 'none' | 'remove_wrong' | 'add_time' | 'extra_life' | 'restore_hp' | 'heal_1_hp' | 'reduce_hp_cooldown' | 'add_attribute' | 'reroll_attributes' | 'gift_wrap' | 'unlock_skin' | 'unlock_gender' | 'rename_character' | 'bazar_sale_permit';
export type ItemRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

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
  minRankRequired: number; // Index of RANKS array
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
  useGlobalGacha?: boolean;
  unlockedSkinId?: string;
  buffDurationDays?: number;
  backColor?: string;
  importedFromId?: string;
  extractMeshName?: string;
}

const getRarityLabel = (rarity?: string) => {
  switch (rarity) {
    case 'legendary': return 'Lendário';
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
  const [loading, setLoading] = useState(true);
  const [economyType, setEconomyType] = useState<'xp' | 'coins'>('coins');
  const [globalGachaConfig, setGlobalGachaConfig] = useState<GachaConfig | null>(null);
  const [presetSkins, setPresetSkins] = useState<{id: string, name: string, url: string, type?: string}[]>([]);
  
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  // true = veio do "Importar e Personalizar" do banco: salva SÓ a cópia local
  const [isImportCustomize, setIsImportCustomize] = useState(false);
  const [formData, setFormData] = useState<Partial<StoreItem>>({
    title: '', description: '', cost: 100, type: 'consumable', gameEffect: 'none', usableInQuest: false, minRankRequired: 0, active: true, imageUrl: '', rarity: 'common'
  });
  
  const [showGallery, setShowGallery] = useState<'image' | 'model' | null>(null);
  const [showTransformModal, setShowTransformModal] = useState(false);
  const [showExtractorModal, setShowExtractorModal] = useState(false);
  const [showGachaModal, setShowGachaModal] = useState(false);
  const [showItemBank, setShowItemBank] = useState(false);
  const [transformActiveTab, setTransformActiveTab] = useState<'common' | 'battle'>('common');
  
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
      minRankRequired: 0,
      usableInQuest: !!item.usableInQuest,
      gameEffect: item.gameEffect || 'none',
      unlockedSkinId: item.unlockedSkinId || '',
      buffDurationDays: item.buffDurationDays,
      avatarPart: item.avatarPart,
      itemCategory: item.itemCategory,
      baseAttributeType: item.baseAttributeType,
      baseAttributeValue: item.baseAttributeValue,
      fixedAttributes: item.fixedAttributes,
      backColor: item.backColor,
      extractMeshName: item.extractMeshName,
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
          minRankRequired: 0,
          usableInQuest: !!item.usableInQuest,
          gameEffect: item.gameEffect || 'none',
          unlockedSkinId: item.unlockedSkinId || '',
          buffDurationDays: item.buffDurationDays,
          avatarPart: item.avatarPart,
          itemCategory: item.itemCategory,
          baseAttributeType: item.baseAttributeType,
          baseAttributeValue: item.baseAttributeValue,
          fixedAttributes: item.fixedAttributes,
          backColor: item.backColor,
          extractMeshName: item.extractMeshName,
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
      minRankRequired: Number(formData.minRankRequired),
      minSalePrice: formData.minSalePrice ? Number(formData.minSalePrice) : 0,
    };

    if (editingId) {
      await supabase.from('store_items').update({
        name: itemData.title, description: itemData.description, type: itemData.type,
        price: itemData.cost, image_url: itemData.imageUrl, active: itemData.active,
        rarity: itemData.rarity, avatar_part: itemData.avatarPart, data: itemData
      }).eq('id', editingId);
      
      // Cascade update retroativo para itens já no inventário dos alunos
      const { data: snapUserItems } = await supabase.from('user_items').select('*').eq('item_id', editingId);
      const updatePromises: Promise<any>[] = [];
      (snapUserItems || []).forEach(row => {
        const currentData = row.data as any;
        const newData = { ...currentData,
          itemCategory: itemData.itemCategory || 'none',
          baseAttributeType: itemData.baseAttributeType || 'none',
          baseAttributeValue: itemData.baseAttributeValue || 0,
          itemTitle: itemData.title,
          itemImageUrl: itemData.imageUrl || '',
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
          extractMeshName: itemData.extractMeshName || null
        };
        updatePromises.push(supabase.from('user_items').update({ data: newData }).eq('id', row.id) as any);
      });
      await Promise.all(updatePromises);
      
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
    setFormData(item);
    setEditingId(item.id);
    setIsEditing(true);
  };

  // Superadmin edita um item GLOBAL do banco (abre o mesmo editor; salvar atualiza o global)
  const openEditGlobal = (item: any) => {
    setFormData({ ...item, id: item._rawId, _isGlobal: true } as StoreItem);
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
                            <span>Patente Mínima: {RANKS[item.minRankRequired]?.name}</span>
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
                  <option value="legendary">Lendário (Dourado)</option>
                </select>
              </div>
            </div>

            {/* Linha 3: Requisitos e Efeitos */}
            <div className="responsive-grid" style={{ marginBottom: '1.5rem', alignItems: 'flex-start' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Patente Mínima Exigida</label>
                <select value={formData.minRankRequired} onChange={e => setFormData({...formData, minRankRequired: Number(e.target.value)})} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)' }}>
                  {RANKS.map((r, i) => (
                    <option key={r.name} value={i}>{r.name} ({r.minXp} XP)</option>
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
                    <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Força do Atributo Base</label>
                    <input type="number" value={formData.baseAttributeValue || 0} onChange={e => setFormData({...formData, baseAttributeValue: parseInt(e.target.value) || 0})} className="login-input" style={{ width: '100%' }} />
                  </div>
                </div>
                
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>URL do Modelo 3D (.glb) ou Sprite Pixel Art (.png) [Opcional]</label>
                  <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.5rem' }}>
                    <input type="text" value={formData.gameModelUrl || ''} onChange={e => setFormData({...formData, gameModelUrl: e.target.value})} placeholder="/models/item.glb ou https://.../imagem.png" style={{ flex: 1, padding: '0.75rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)' }} />
                    <DirectUploadButton folder="models" onUploadComplete={(url) => setFormData({...formData, gameModelUrl: url})} buttonStyle={{ minHeight: '100%' }} />
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

                  <label style={{ display: 'block', fontSize: '0.9rem', color: '#9ca3af', marginBottom: '0.25rem' }}>Textura Minecraft Head (Base64 ou URL)</label>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Use isso se não quiser usar um .glb para criar um capacete-cabeça. Cole aqui a Base64 ou a Minecraft URL.</div>
                  <input type="text" value={formData.minecraftHeadValue || ''} onChange={e => setFormData({...formData, minecraftHeadValue: e.target.value})} placeholder="eyJ0ZXh0dXJlcyI..." style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', marginBottom: '0.5rem' }} />
                  {formData.minecraftHeadValue && formData.minecraftHeadValue.trim() !== '' && (
                    <button 
                      onClick={() => setShowTransformModal(true)}
                      style={{ padding: '0.5rem', background: 'rgba(245, 158, 11, 0.2)', border: '1px solid #f59e0b', color: '#f59e0b', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                    >
                      ⚙️ Configurar Posição 3D
                    </button>
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

            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '2rem' }}>
              <button onClick={() => setIsEditing(false)} style={{ background: 'transparent', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', padding: '0.75rem 1.5rem', borderRadius: '8px', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={handleSaveItem} className="login-btn" style={{ padding: '0.75rem 1.5rem', background: 'var(--gold-primary)', color: 'var(--text-on-gold, #000000)', border: 'none' }}>Salvar Item</button>
            </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showTransformModal && createPortal(
        <div className="modal-overlay" style={{ zIndex: 100000 }}>
          <div className="modal-content modal-content-sm" style={{ background: 'var(--bg-dark)', borderRadius: '16px', border: '1px solid var(--gold-primary)', display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 0 }}>
            <div style={{ padding: '1rem', background: 'var(--btn-bg)', borderBottom: '1px solid var(--border-glass)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, color: 'var(--gold-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>⚙️ Configurar Transformação 3D</h3>
              <button onClick={() => setShowTransformModal(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>✖</button>
            </div>
            
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border-glass)' }}>
              <button onClick={() => setTransformActiveTab('common')} style={{ flex: 1, padding: '0.75rem', background: transformActiveTab === 'common' ? 'rgba(245, 158, 11, 0.2)' : 'transparent', border: 'none', borderBottom: transformActiveTab === 'common' ? '2px solid #f59e0b' : '2px solid transparent', color: transformActiveTab === 'common' ? '#f59e0b' : 'var(--text-secondary)', cursor: 'pointer', fontWeight: 'bold' }}>Parado / Andar / Correr (Comum)</button>
              <button onClick={() => setTransformActiveTab('battle')} style={{ flex: 1, padding: '0.75rem', background: transformActiveTab === 'battle' ? 'rgba(239, 68, 68, 0.2)' : 'transparent', border: 'none', borderBottom: transformActiveTab === 'battle' ? '2px solid var(--accent-red)' : '2px solid transparent', color: transformActiveTab === 'battle' ? 'var(--accent-red)' : 'var(--text-secondary)', cursor: 'pointer', fontWeight: 'bold' }}>Animação de Batalha</button>
            </div>

            <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
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
    </div>
  );
}
