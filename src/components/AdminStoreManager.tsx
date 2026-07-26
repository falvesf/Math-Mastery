import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { db } from '../lib/firebase';
import { collection, query, getDocs, getDoc, doc, setDoc, addDoc, updateDoc, deleteDoc, where } from 'firebase/firestore';
import { Coins, Plus, Edit2, Trash2, ShieldAlert, Star, Search, List, Grid, LayoutGrid, ArrowDownAZ, ArrowUpZA, LayoutList, Columns } from 'lucide-react';
import ImageGalleryModal from './ImageGalleryModal';
import DirectUploadButton from './DirectUploadButton';
import { useDialog } from '../contexts/DialogContext';
import { RANKS } from '../lib/ranks';
import { type ItemCategory, type AttributeType } from '../lib/gacha';

export type GameEffectType = 'none' | 'remove_wrong' | 'add_time' | 'extra_life' | 'restore_hp' | 'gift_wrap';
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
  avatarPart?: 'head' | 'face' | 'body' | 'legs' | 'feet' | 'hand' | 'accessory' | 'background' | 'pet';
  itemCategory?: ItemCategory;
  baseAttributeType?: AttributeType;
  baseAttributeValue?: number;
  rarity?: ItemRarity;
  minSalePrice?: number; // Preço mínimo que jogadores podem usar para revender no bazar
}

export default function AdminStoreManager({ pixabayKey }: { pixabayKey: string }) {
  const { showAlert, showConfirm } = useDialog();
  const [items, setItems] = useState<StoreItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [economyType, setEconomyType] = useState<'xp' | 'coins'>('coins');
  
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<StoreItem>>({
    title: '', description: '', cost: 100, type: 'consumable', gameEffect: 'none', usableInQuest: false, minRankRequired: 0, active: true, imageUrl: '', rarity: 'common'
  });
  
  const [showGallery, setShowGallery] = useState(false);
  
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

  const fetchData = async () => {
    setLoading(true);
    // Fetch Economy Settings
    const econRef = doc(db, 'settings', 'economy');
    const econSnap = await getDoc(econRef);
    if (econSnap.exists()) {
      setEconomyType(econSnap.data().currencyType || 'coins');
    } else {
      await setDoc(econRef, { currencyType: 'coins' });
    }

    // Fetch Items
    const q = query(collection(db, 'store_items'));
    const snap = await getDocs(q);
    const loaded: StoreItem[] = [];
    snap.forEach(d => loaded.push({ id: d.id, ...d.data() } as StoreItem));
    setItems(loaded);
    setLoading(false);
  };

  const handleSaveEconomy = async (type: 'xp' | 'coins') => {
    setEconomyType(type);
    await setDoc(doc(db, 'settings', 'economy'), { currencyType: type }, { merge: true });
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
      await updateDoc(doc(db, 'store_items', editingId), itemData);
      
      // Cascade update retroativo para itens já no inventário dos alunos
      const qUserItems = query(collection(db, 'user_items'), where('itemId', '==', editingId));
      const snapUserItems = await getDocs(qUserItems);
      const updatePromises: Promise<void>[] = [];
      snapUserItems.forEach(d => {
        updatePromises.push(updateDoc(doc(db, 'user_items', d.id), {
          itemCategory: itemData.itemCategory || 'none',
          baseAttributeType: itemData.baseAttributeType || 'none',
          baseAttributeValue: itemData.baseAttributeValue || 0,
          itemTitle: itemData.title,
          itemImageUrl: itemData.imageUrl || '',
          itemType: itemData.type || 'consumable',
          gameEffect: itemData.gameEffect || 'none',
          gameModelUrl: itemData.gameModelUrl || '',
          avatarPart: itemData.avatarPart || null,
          usableInQuest: itemData.usableInQuest || false
        }));
      });
      await Promise.all(updatePromises);
      
    } else {
      await addDoc(collection(db, 'store_items'), itemData);
    }

    setIsEditing(false);
    setEditingId(null);
    setFormData({ title: '', description: '', cost: 100, type: 'consumable', gameEffect: 'none', minRankRequired: 0, active: true, imageUrl: '' });
    fetchData();
  };

  const handleDeleteItem = async (id: string) => {
    const confirmed = await showConfirm('Tem certeza que deseja apagar este item?');
    if (confirmed) {
      await deleteDoc(doc(db, 'store_items', id));
      fetchData();
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
          onClose={() => setShowGallery(false)}
          onSelectImage={(url) => {
            setFormData({ ...formData, imageUrl: url });
            setShowGallery(false);
          }}
        />,
        document.body
      )}

      {/* Economy & Store Manager merged view */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        
        {/* Economy Config Section */}
        <div style={{ position: 'sticky', top: '-2rem', zIndex: 40, background: 'rgba(30, 41, 59, 0.95)', padding: '1rem 2rem', margin: '-2rem -2rem 1rem -2rem', backdropFilter: 'blur(10px)', borderTopLeftRadius: '16px', borderTopRightRadius: '16px', borderBottom: '1px solid var(--border-glass)' }}>
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
          
          <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
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
            <button className="login-btn" onClick={() => { setEditingId(null); setFormData({ title: '', description: '', cost: 100, type: 'consumable', gameEffect: 'none', usableInQuest: false, minRankRequired: 0, active: true, imageUrl: '', rarity: 'common', minSalePrice: 0 }); setIsEditing(true); }} style={{ padding: '0.5rem 1rem', display: 'flex', gap: '0.5rem', alignItems: 'center', background: 'var(--gold-primary)', color: 'black', border: 'none' }}>
              <Plus size={18} /> Novo Item
            </button>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center', padding: '0.5rem 0', borderBottom: '1px solid rgba(255,255,255,0.05)', marginBottom: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Ordenar por:</span>
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)} style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', color: 'white', padding: '0.3rem 0.5rem', borderRadius: '4px', fontSize: '0.9rem' }}>
                <option value="name">Nome</option>
                <option value="rarity">Raridade</option>
                <option value="type">Tipo</option>
              </select>
              <button onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')} style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', color: 'white', padding: '0.3rem', borderRadius: '4px', cursor: 'pointer', display: 'flex' }} title="Alterar Direção">
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
                  <div key={item.id} style={{ display: 'flex', flexDirection: isGridIcon ? 'column' : 'row', alignItems: 'center', justifyContent: isGridIcon ? 'center' : 'space-between', padding: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', border: '1px solid var(--border-glass)', textAlign: isGridIcon ? 'center' : 'left' }}>
                    <div style={{ display: 'flex', flexDirection: isGridIcon ? 'column' : 'row', alignItems: 'center', gap: '1rem', width: isGridIcon ? '100%' : 'auto' }}>
                      {item.imageUrl ? (
                        <img src={item.imageUrl} alt={item.title} style={{ width: imgSize, height: imgSize, borderRadius: '8px', objectFit: 'cover' }} />
                      ) : (
                        <div style={{ width: imgSize, height: imgSize, borderRadius: '8px', background: 'var(--bg-dark)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Star size={isGridIcon ? 32 : 24} color="var(--text-secondary)" />
                        </div>
                      )}
                      <div style={{ flex: 1, width: isGridIcon ? '100%' : 'auto' }}>
                        <h4 style={{ margin: '0 0 0.25rem 0', fontSize: isGridIcon ? '0.95rem' : '1.1rem', whiteSpace: isGridIcon ? 'nowrap' : 'normal', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.title}</h4>
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
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div className="glass-panel" style={{ width: '750px', maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto', padding: '2rem', animation: 'slideUp 0.3s ease-out' }}>
            <h3 style={{ marginTop: 0, marginBottom: '1.5rem', fontSize: '1.5rem' }}>{editingId ? 'Editar Item' : 'Criar Novo Item'}</h3>
            
            {/* Linha 1: Nome e Tipo */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Nome do Item</label>
                <input type="text" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} placeholder="Ex: Voucher +1 Ponto" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', color: 'white' }} />
              </div>
              
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Tipo de Item</label>
                <select value={formData.type} onChange={e => setFormData({...formData, type: e.target.value as any})} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', color: 'white' }}>
                  <option value="consumable">Consumível (Usa 1x)</option>
                  <option value="equippable">Equipável (Ex: Título)</option>
                </select>
              </div>
            </div>

            {/* Linha 2: Valores e Raridade */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Custo ({economyType === 'coins' ? 'Moedas' : 'XP'})</label>
                <input type="number" value={formData.cost} onChange={e => setFormData({...formData, cost: Number(e.target.value)})} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', color: 'white' }} />
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
                <select value={formData.rarity || 'common'} onChange={e => setFormData({...formData, rarity: e.target.value as ItemRarity})} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', color: 'white' }}>
                  <option value="common">Comum (Branco)</option>
                  <option value="uncommon">Incomum (Verde)</option>
                  <option value="rare">Raro (Azul)</option>
                  <option value="epic">Épico (Roxo)</option>
                  <option value="legendary">Lendário (Dourado)</option>
                </select>
              </div>
            </div>

            {/* Linha 3: Requisitos e Efeitos */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem', alignItems: 'flex-start' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Patente Mínima Exigida</label>
                <select value={formData.minRankRequired} onChange={e => setFormData({...formData, minRankRequired: Number(e.target.value)})} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', color: 'white' }}>
                  {RANKS.map((r, i) => (
                    <option key={r.name} value={i}>{r.name} ({r.minXp} XP)</option>
                  ))}
                </select>
              </div>

              {formData.type === 'consumable' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Poder no Jogo (Gameplay)</label>
                    <select value={formData.gameEffect || 'none'} onChange={e => setFormData({...formData, gameEffect: e.target.value as GameEffectType})} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', color: 'white' }}>
                      <option value="none">Nenhum (Efeito Personalizado)</option>
                      <option value="remove_wrong">Amuleto (Elimina 1 alternativa errada)</option>
                      <option value="add_time">Ampulheta (Adiciona +30 segundos)</option>
                      <option value="extra_life">Escudo (Protege contra erro na questão atual)</option>
                      <option value="restore_hp">Poção de Vida (Restaura todo o HP do aluno)</option>
                      <option value="gift_wrap">Embalar para presente (Permite enviar presente da loja)</option>
                    </select>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(255,255,255,0.03)', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-glass)' }}>
                    <input type="checkbox" checked={formData.usableInQuest || false} onChange={e => setFormData({...formData, usableInQuest: e.target.checked})} style={{ width: '20px', height: '20px', cursor: 'pointer' }} />
                    <label style={{ color: 'white', cursor: 'pointer', margin: 0 }}>Pode usar DENTRO dos desafios?</label>
                  </div>
                </div>
              )}

              {formData.type === 'equippable' && (
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Parte do Avatar (Para Equipamentos Visuais)</label>
                  <select value={formData.avatarPart || ''} onChange={e => setFormData({...formData, avatarPart: e.target.value as any})} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', color: 'white' }}>
                    <option value="">Nenhuma (Apenas Título/Inventário)</option>
                    <option value="background">Fundo (Atrás do Personagem)</option>
                    <option value="head">Cabeça (Chapéus/Capacetes)</option>
                    <option value="face">Rosto (Óculos/Máscaras)</option>
                    <option value="body">Corpo (Armaduras/Camisas)</option>
                    <option value="legs">Pernas (Calças/Grevas)</option>
                    <option value="feet">Pés (Botas/Sapatos)</option>
                    <option value="hand">Mãos (Armas/Escudos)</option>
                    <option value="accessory">Acessórios (Luvas/Cintos/Amuletos)</option>
                    <option value="pet">Mascote (Acompanhante)</option>
                  </select>
                </div>
              )}
            </div>

            {/* Linha 4: Atributos e 3D (Se Equipável) */}
            {formData.type === 'equippable' && (
              <div style={{ background: 'rgba(0,0,0,0.15)', padding: '1.25rem', borderRadius: '12px', marginBottom: '1.5rem', border: '1px solid rgba(255,255,255,0.05)' }}>
                <h4 style={{ margin: '0 0 1rem 0', color: 'var(--gold-primary)', fontSize: '1.1rem' }}>Configurações de Equipamento</h4>
                
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1.5rem', marginBottom: '1.25rem' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Categoria do Item</label>
                    <select value={formData.itemCategory || 'none'} onChange={e => setFormData({...formData, itemCategory: e.target.value as any})} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', color: 'white' }}>
                      <option value="none">Cosmético (Nenhuma)</option>
                      <option value="attack">Ataque</option>
                      <option value="defense">Defesa</option>
                      <option value="support">Suporte</option>
                    </select>
                  </div>
                  
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Tipo de Atributo Base</label>
                    <select value={formData.baseAttributeType || 'none'} onChange={e => setFormData({...formData, baseAttributeType: e.target.value as any})} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', color: 'white' }}>
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
                  <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>URL do Modelo 3D (.glb) [Opcional]</label>
                  <input type="text" value={formData.gameModelUrl || ''} onChange={e => setFormData({...formData, gameModelUrl: e.target.value})} placeholder="/models/item.glb" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', color: 'white' }} />
                </div>
              </div>
            )}

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Descrição (Lore do Item)</label>
              <textarea value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} rows={3} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', color: 'white', resize: 'vertical' }} />
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Imagem do Item (Opcional)</label>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <input type="text" value={formData.imageUrl || ''} onChange={e => setFormData({...formData, imageUrl: e.target.value})} placeholder="URL ou busque na galeria ->" style={{ flex: 1, padding: '0.75rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', color: 'white' }} />
                <DirectUploadButton folder="store" onUploadComplete={(url) => setFormData({...formData, imageUrl: url})} buttonStyle={{ minHeight: '100%' }} />
                <button onClick={() => setShowGallery(true)} style={{ background: 'var(--gold-primary)', color: 'black', border: 'none', padding: '0 1rem', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', minHeight: '100%' }}>
                  <Search size={20} />
                </button>
              </div>
              {formData.imageUrl && (
                <div style={{ marginTop: '1rem', width: '100px', height: '100px', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border-glass)' }}>
                  <img src={formData.imageUrl} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '2rem' }}>
              <button onClick={() => setIsEditing(false)} style={{ background: 'transparent', border: '1px solid var(--border-glass)', color: 'white', padding: '0.75rem 1.5rem', borderRadius: '8px', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={handleSaveItem} className="login-btn" style={{ padding: '0.75rem 1.5rem', background: 'var(--gold-primary)', color: 'black', border: 'none' }}>Salvar Item</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
