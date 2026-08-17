import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase';
import { Coins, Plus, Edit2, Trash2, ShieldAlert, Star, Search, List, Grid, LayoutGrid, ArrowDownAZ, ArrowUpZA, LayoutList, Columns } from 'lucide-react';
import ImageGalleryModal from './ImageGalleryModal';
import DirectUploadButton from './DirectUploadButton';
import GachaConfigModal from './GachaConfigModal';
import { useDialog } from '../contexts/DialogContext';
import { RANKS } from '../lib/ranks';
import { type ItemCategory, type AttributeType, type GachaConfig, type ItemAdd } from '../lib/gacha';
import { type ModelTransformsConfig, type ModelTransform } from './AvatarCharacter';

export type GameEffectType = 'none' | 'remove_wrong' | 'add_time' | 'extra_life' | 'restore_hp' | 'heal_1_hp' | 'add_attribute' | 'reroll_attributes' | 'gift_wrap' | 'unlock_skin' | 'unlock_gender';
export type ItemRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export interface StoreItem {
  id: string;
  title: string;
  description: string;
  imageUrl?: string;
  cost: number;
  type: 'consumable' | 'equippable';
  gameEffect?: GameEffectType;
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
  const [items, setItems] = useState<StoreItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [economyType, setEconomyType] = useState<'xp' | 'coins'>('coins');
  const [globalGachaConfig, setGlobalGachaConfig] = useState<GachaConfig | null>(null);
  const [isEconomyOpen, setIsEconomyOpen] = useState(false);
  const [presetSkins, setPresetSkins] = useState<{id: string, name: string, url: string, type?: string}[]>([]);
  
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<StoreItem>>({
    title: '', description: '', cost: 100, type: 'consumable', gameEffect: 'none', usableInQuest: false, minRankRequired: 0, active: true, imageUrl: '', rarity: 'common'
  });
  
  const [showGallery, setShowGallery] = useState<'image' | 'model' | null>(null);
  const [showTransformModal, setShowTransformModal] = useState(false);
  const [showGachaModal, setShowGachaModal] = useState(false);
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
    // Fetch Economy Settings
    const { data: econSnap } = await supabase.from('system_collections').select('*').eq('collection_name', 'settings').eq('doc_id', 'economy').single();
    if (econSnap) {
      setEconomyType((econSnap.data as any).currencyType || 'coins');
    } else {
      await supabase.from('system_collections').insert({ collection_name: 'settings', doc_id: 'economy', data: { currencyType: 'coins' } });
    }

    // Fetch Items
    const { data: snap } = await supabase.from('store_items').select('*');
    const loaded: StoreItem[] = [];
    (snap || []).forEach(row => loaded.push({ id: row.id, ...row.data } as StoreItem));
    setItems(loaded);
    
    try {
      const { data: gachaSnap } = await supabase.from('system_collections').select('*').eq('collection_name', 'settings').eq('doc_id', 'gacha').single();
      if (gachaSnap) {
        setGlobalGachaConfig(gachaSnap.data as GachaConfig);
      }
    } catch (e) { console.error(e); }
    
    try {
      const { data: skinsSnap } = await supabase.from('preset_skins').select('*');
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
    
    setLoading(false);
  };

  const handleSaveEconomy = async (type: 'xp' | 'coins') => {
    setEconomyType(type);
    await supabase.from('system_collections').update({ data: { currencyType: type } }).eq('collection_name', 'settings').eq('doc_id', 'economy');
    await showAlert('Configuração de economia salva com sucesso!');
  };

  const handleSaveItem = async () => {
    if (!formData.title || !formData.cost) return;

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
          backColor: itemData.backColor || ''
        };
        updatePromises.push(supabase.from('user_items').update({ data: newData }).eq('id', row.id) as any);
      });
      await Promise.all(updatePromises);
      
    } else {
      await supabase.from('store_items').insert({
        name: itemData.title, description: itemData.description, type: itemData.type,
        price: itemData.cost, image_url: itemData.imageUrl, active: itemData.active,
        rarity: itemData.rarity, avatar_part: itemData.avatarPart, data: itemData
      });
    }

    setIsEditing(false);
    setEditingId(null);
    setFormData({ title: '', description: '', cost: 100, type: 'consumable', gameEffect: 'none', minRankRequired: 0, active: true, imageUrl: '' });
    fetchData(false);
  };

  const handleDeleteItem = async (id: string) => {
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

      {/* Economy & Store Manager merged view */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        
        {/* Economy Config Section */}
        <div style={{ position: 'sticky', top: '-2rem', zIndex: 40, background: 'var(--bg-card)', padding: '1rem 2rem', margin: '-2rem -2rem 1rem -2rem', backdropFilter: 'blur(10px)', borderTopLeftRadius: '16px', borderTopRightRadius: '16px', borderBottom: '1px solid var(--border-glass)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div>
              <h2 style={{ fontSize: '1.5rem', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Coins color="var(--gold-primary)" /> Configuração de Economia
              </h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: 0 }}>
                O valor na loja mudará de Moedas para XP automaticamente.
              </p>
            </div>
          </div>
          
          <button className="retractable-toggle-btn" onClick={() => setIsEconomyOpen(!isEconomyOpen)}>
            {isEconomyOpen ? 'Ocultar Configuração' : 'Alterar Economia'}
          </button>
          <div className={`retractable-content ${isEconomyOpen ? 'open' : ''}`} style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
            <div 
              onClick={() => handleSaveEconomy('coins')}
              style={{ flex: 1, padding: '0.75rem 1rem', borderRadius: '8px', cursor: 'pointer', border: economyType === 'coins' ? '2px solid var(--gold-primary)' : '1px solid var(--border-glass)', background: economyType === 'coins' ? 'rgba(251, 191, 36, 0.1)' : 'rgba(0,0,0,0.2)' }}
            >
              <h3 style={{ margin: '0 0 0.25rem 0', fontSize: '1rem', color: 'var(--gold-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Coins size={16} /> Moedas de Ouro</h3>
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Ganha moedas para gastar. A patente não cai.</p>
            </div>

            <div 
              onClick={() => handleSaveEconomy('xp')}
              style={{ flex: 1, padding: '0.75rem 1rem', borderRadius: '8px', cursor: 'pointer', border: economyType === 'xp' ? '2px solid var(--accent-red)' : '1px solid var(--border-glass)', background: economyType === 'xp' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(0,0,0,0.2)' }}
            >
              <h3 style={{ margin: '0 0 0.25rem 0', fontSize: '1rem', color: 'var(--accent-red)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><ShieldAlert size={16} /> Gasto de XP</h3>
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Gasta o próprio XP. Pode perder patentes.</p>
            </div>
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid var(--border-glass)', margin: '0 0 1rem 0' }} />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: '1.5rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Star color="var(--gold-primary)" /> Catálogo de Itens
            </h2>
            <button className="login-btn" onClick={() => { setEditingId(null); setFormData({ title: '', description: '', cost: 100, type: 'consumable', gameEffect: 'none', usableInQuest: false, minRankRequired: 0, active: true, imageUrl: '', rarity: 'common', minSalePrice: 0 }); setIsEditing(true); }} style={{ padding: '0.5rem 1rem', display: 'flex', gap: '0.5rem', alignItems: 'center', background: 'var(--gold-primary)', color: 'var(--text-on-gold, #000000)', border: 'none' }}>
              <Plus size={18} /> Novo Item
            </button>
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
            layoutMode === 'grid-2' ? { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' } :
            layoutMode === 'grid-3' ? { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' } :
            layoutMode === 'small-icons' ? { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '1rem' } :
            layoutMode === 'large-icons' ? { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1.5rem' } :
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
                const imgSize = layoutMode === 'small-icons' ? '80px' : layoutMode === 'large-icons' ? '140px' : '50px';
                
                return (
                  <div key={item.id} 
                    className={`rarity-${item.rarity || 'common'}`}
                    style={{ position: 'relative', display: 'flex', flexDirection: isGridIcon ? 'column' : 'row', alignItems: 'center', justifyContent: isGridIcon ? 'center' : 'space-between', padding: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', textAlign: isGridIcon ? 'center' : 'left' }}>
                    <div style={{ display: 'flex', flexDirection: isGridIcon ? 'column' : 'row', alignItems: 'center', gap: '1rem', width: isGridIcon ? '100%' : 'auto', position: 'relative' }}>
                      <div className={`rarity-badge ${item.rarity || 'common'}`}>
                        {getRarityLabel(item.rarity)}
                      </div>
                      {item.imageUrl ? (
                        <img src={item.imageUrl} alt={item.title} style={{ width: imgSize, height: imgSize, borderRadius: '8px', objectFit: 'contain' }} />
                      ) : (
                        <div style={{ width: imgSize, height: imgSize, borderRadius: '8px', background: 'var(--bg-dark)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Star size={isGridIcon ? 32 : 24} color="var(--text-secondary)" />
                        </div>
                      )}
                      <div style={{ flex: 1, width: isGridIcon ? '100%' : 'auto' }}>
                        <h4 style={{ margin: '0 0 0.25rem 0', fontSize: isGridIcon ? '0.95rem' : '1.1rem', whiteSpace: isGridIcon ? 'nowrap' : 'normal', overflow: 'hidden', textOverflow: 'ellipsis', color: `var(--rarity-${item.rarity || 'common'})` }}>{item.title}</h4>
                        {!isGridIcon && (
                          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                            <span>Custo: <strong style={{ color: 'var(--gold-primary)' }}>{item.cost} {economyType === 'coins' ? 'Moedas' : 'XP'}</strong></span>
                            <span>Tipo: {item.type === 'consumable' ? 'Consumível' : 'Equipável'}</span>
                            <span>Patente Mínima: {RANKS[item.minRankRequired]?.name}</span>
                          </div>
                        )}
                        {isGridIcon && (
                          <div style={{ fontSize: '0.85rem', color: 'var(--gold-primary)', fontWeight: 'bold' }}>
                            {item.cost} {economyType === 'coins' ? 'Moedas' : 'XP'}
                          </div>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: isGridIcon ? '0.75rem' : '0' }}>
                      <button onClick={() => openEdit(item)} style={{ background: 'transparent', border: '1px solid var(--border-glass)', borderRadius: '6px', color: 'var(--text-secondary)', cursor: 'pointer', padding: '0.4rem', display: 'flex' }} title="Editar"><Edit2 size={16} /></button>
                      <button onClick={() => handleDeleteItem(item.id)} style={{ background: 'transparent', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '6px', color: 'var(--accent-red)', cursor: 'pointer', padding: '0.4rem', display: 'flex' }} title="Excluir"><Trash2 size={16} /></button>
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
          <div className="glass-panel modal-content">
            <h3 style={{ marginTop: 0, marginBottom: '1.5rem', fontSize: '1.5rem' }}>{editingId ? 'Editar Item' : 'Criar Novo Item'}</h3>
            
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
                      <option value="add_attribute">Pergaminho do Novo Atributo (Adiciona até 2 atributos a um item base, 70% chance)</option>
                      <option value="reroll_attributes">Pergaminho do Aprimoramento (Sorteia novos atributos para um item que já possui)</option>
                      <option value="gift_wrap">Caixa de Presente (Pode colocar 1 item dentro)</option>
                      <option value="unlock_skin">Liberar Skin Temporária (Buff)</option>
                      <option value="unlock_gender">Liberar Troca de Gênero (15 min)</option>
                    </select>
                  </div>
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
                    <button 
                      onClick={() => setShowTransformModal(true)}
                      style={{ padding: '0.5rem', background: 'rgba(245, 158, 11, 0.2)', border: '1px solid #f59e0b', color: '#f59e0b', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}
                    >
                      ⚙️ Configurar Posição 3D
                    </button>
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
              {formData.imageUrl && (
                <div style={{ marginTop: '1rem', width: '100px', height: '100px', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border-glass)' }}>
                  <img src={formData.imageUrl} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
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
            if (newGlobalConfig) {
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
    </div>
  );
}
