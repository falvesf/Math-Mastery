import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { db } from '../lib/firebase';
import { collection, query, getDocs, getDoc, doc, setDoc, addDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { Coins, Plus, Edit2, Trash2, ShieldAlert, Star, Search } from 'lucide-react';
import ImageGalleryModal from './ImageGalleryModal';
import { RANKS } from '../lib/ranks';

export type GameEffectType = 'none' | 'remove_wrong' | 'add_time' | 'extra_life';

export interface StoreItem {
  id: string;
  title: string;
  description: string;
  imageUrl?: string;
  cost: number;
  type: 'consumable' | 'equippable';
  gameEffect?: GameEffectType;
  minRankRequired: number; // Index of RANKS array
  active: boolean;
}

export default function AdminStoreManager({ pixabayKey }: { pixabayKey: string }) {
  const [items, setItems] = useState<StoreItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [economyType, setEconomyType] = useState<'xp' | 'coins'>('coins');
  
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<StoreItem>>({
    title: '', description: '', cost: 100, type: 'consumable', gameEffect: 'none', minRankRequired: 0, active: true, imageUrl: ''
  });
  
  const [showGallery, setShowGallery] = useState(false);

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
    alert('Configuração de economia salva com sucesso!');
  };

  const handleSaveItem = async () => {
    if (!formData.title || !formData.cost) return;

    const itemData = {
      ...formData,
      cost: Number(formData.cost),
      minRankRequired: Number(formData.minRankRequired)
    };

    if (editingId) {
      await updateDoc(doc(db, 'store_items', editingId), itemData);
    } else {
      await addDoc(collection(db, 'store_items'), itemData);
    }

    setIsEditing(false);
    setEditingId(null);
    setFormData({ title: '', description: '', cost: 100, type: 'consumable', gameEffect: 'none', minRankRequired: 0, active: true, imageUrl: '' });
    fetchData();
  };

  const handleDeleteItem = async (id: string) => {
    if (confirm('Tem certeza que deseja apagar este item?')) {
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
        <div>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Coins color="var(--gold-primary)" /> Configuração de Economia
          </h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
            Defina como os alunos pagarão pelos itens na loja. O valor nas vitrines mudará automaticamente de Moedas para XP.
          </p>
          
          <div style={{ display: 'flex', gap: '2rem' }}>
            <div 
              onClick={() => handleSaveEconomy('coins')}
              style={{ flex: 1, padding: '1.5rem', borderRadius: '12px', cursor: 'pointer', border: economyType === 'coins' ? '2px solid var(--gold-primary)' : '1px solid var(--border-glass)', background: economyType === 'coins' ? 'rgba(251, 191, 36, 0.1)' : 'rgba(0,0,0,0.2)' }}
            >
              <h3 style={{ margin: '0 0 0.5rem 0', color: 'var(--gold-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Coins /> Moedas de Ouro</h3>
              <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>O XP ganho define a patente (nunca cai). O aluno ganha moedas junto com o XP para gastar livremente.</p>
            </div>

            <div 
              onClick={() => handleSaveEconomy('xp')}
              style={{ flex: 1, padding: '1.5rem', borderRadius: '12px', cursor: 'pointer', border: economyType === 'xp' ? '2px solid var(--accent-red)' : '1px solid var(--border-glass)', background: economyType === 'xp' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(0,0,0,0.2)' }}
            >
              <h3 style={{ margin: '0 0 0.5rem 0', color: 'var(--accent-red)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><ShieldAlert /> Gasto de XP (Hardcore)</h3>
              <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>O aluno gasta o próprio XP. Se o XP cair, ele perde a patente e cai no ranking. Gera dilemas difíceis!</p>
            </div>
          </div>
        </div>

        <hr style={{ border: 'none', borderTop: '1px solid var(--border-glass)', margin: 0 }} />

        {/* Items List Section */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h2 style={{ fontSize: '1.5rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Star color="var(--gold-primary)" /> Catálogo de Itens
            </h2>
            <button className="login-btn" onClick={() => { setEditingId(null); setFormData({ title: '', description: '', cost: 100, type: 'consumable', gameEffect: 'none', minRankRequired: 0, active: true, imageUrl: '' }); setIsEditing(true); }} style={{ padding: '0.5rem 1rem', display: 'flex', gap: '0.5rem', alignItems: 'center', background: 'var(--gold-primary)', color: 'black', border: 'none' }}>
              <Plus size={18} /> Novo Item
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {items.map(item => (
              <div key={item.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', border: '1px solid var(--border-glass)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt={item.title} style={{ width: '50px', height: '50px', borderRadius: '8px', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: '50px', height: '50px', borderRadius: '8px', background: 'var(--bg-dark)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Star size={24} color="var(--text-secondary)" />
                    </div>
                  )}
                  <div>
                    <h4 style={{ margin: '0 0 0.25rem 0', fontSize: '1.1rem' }}>{item.title}</h4>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', gap: '1rem' }}>
                      <span>Custo: <strong style={{ color: 'var(--gold-primary)' }}>{item.cost} {economyType === 'coins' ? 'Moedas' : 'XP'}</strong></span>
                      <span>Tipo: {item.type === 'consumable' ? 'Consumível' : 'Equipável'}</span>
                      <span>Patente Mínima: {RANKS[item.minRankRequired]?.name}</span>
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button onClick={() => openEdit(item)} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '0.5rem' }}><Edit2 size={18} /></button>
                  <button onClick={() => handleDeleteItem(item.id)} style={{ background: 'transparent', border: 'none', color: 'var(--accent-red)', cursor: 'pointer', padding: '0.5rem' }}><Trash2 size={18} /></button>
                </div>
              </div>
            ))}
            {items.length === 0 && (
              <p style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '2rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>Nenhum item cadastrado na loja.</p>
            )}
          </div>
        </div>
      </div>

      {/* Modal Novo/Editar Item */}
      {isEditing && createPortal(
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div className="glass-panel" style={{ width: '600px', maxWidth: '95vw', padding: '2rem', animation: 'slideUp 0.3s ease-out' }}>
            <h3 style={{ marginTop: 0, marginBottom: '1.5rem', fontSize: '1.5rem' }}>{editingId ? 'Editar Item' : 'Criar Novo Item'}</h3>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Nome do Item</label>
                <input type="text" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} placeholder="Ex: Voucher +1 Ponto" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', color: 'white' }} />
              </div>
              
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Custo ({economyType === 'coins' ? 'Moedas' : 'XP'})</label>
                <input type="number" value={formData.cost} onChange={e => setFormData({...formData, cost: Number(e.target.value)})} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', color: 'white' }} />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Tipo de Item</label>
                <select value={formData.type} onChange={e => setFormData({...formData, type: e.target.value as any})} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', color: 'white' }}>
                  <option value="consumable">Consumível (Usa 1x)</option>
                  <option value="equippable">Equipável (Ex: Título)</option>
                </select>
              </div>

              {formData.type === 'consumable' && (
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Poder no Jogo (Gameplay)</label>
                  <select value={formData.gameEffect || 'none'} onChange={e => setFormData({...formData, gameEffect: e.target.value as GameEffectType})} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', color: 'white' }}>
                    <option value="none">Nenhum (Uso na vida real / Estético)</option>
                    <option value="remove_wrong">Amuleto (Elimina 1 alternativa errada)</option>
                    <option value="add_time">Ampulheta (Adiciona +30 segundos)</option>
                    <option value="extra_life">Escudo (Protege contra erro na questão atual)</option>
                  </select>
                </div>
              )}

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Patente Mínima Exigida</label>
                <select value={formData.minRankRequired} onChange={e => setFormData({...formData, minRankRequired: Number(e.target.value)})} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', color: 'white' }}>
                  {RANKS.map((r, i) => (
                    <option key={r.name} value={i}>{r.name} ({r.minXp} XP)</option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Descrição (Lore do Item)</label>
              <textarea value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} rows={3} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', color: 'white', resize: 'vertical' }} />
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Imagem do Item (Opcional)</label>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <input type="text" value={formData.imageUrl || ''} onChange={e => setFormData({...formData, imageUrl: e.target.value})} placeholder="URL ou busque na galeria ->" style={{ flex: 1, padding: '0.75rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', color: 'white' }} />
                <button onClick={() => setShowGallery(true)} style={{ background: 'var(--gold-primary)', color: 'black', border: 'none', padding: '0 1rem', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
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
