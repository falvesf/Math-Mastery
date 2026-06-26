import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { db } from '../lib/firebase';
import { collection, getDocs, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { Medal, Plus, Edit2, Trash2, Search } from 'lucide-react';
import ImageGalleryModal from './ImageGalleryModal';
import { RANKS } from '../lib/ranks';
import type { RankDef } from '../lib/ranks';

export default function AdminRankManager({ pixabayKey }: { pixabayKey: string }) {
  const [ranks, setRanks] = useState<RankDef[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [isEditing, setIsEditing] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [formData, setFormData] = useState<RankDef>({
    name: '', minXp: 0, color: '#fbbf24', imageUrl: ''
  });
  
  const [showGallery, setShowGallery] = useState(false);

  useEffect(() => {
    fetchRanks();
  }, []);

  const fetchRanks = async () => {
    setLoading(true);
    const snap = await getDocs(collection(db, 'custom_ranks'));
    if (!snap.empty) {
      const loadedRanks = snap.docs.map(d => d.data() as RankDef).sort((a,b) => a.minXp - b.minXp);
      setRanks(loadedRanks);
      // Sync with local memory
      RANKS.length = 0;
      RANKS.push(...loadedRanks);
    } else {
      setRanks([...RANKS]); // fallback to defaults
    }
    setLoading(false);
  };

  const handleSaveRank = async () => {
    if (!formData.name) return;

    const newRanks = [...ranks];
    if (editingIndex !== null) {
      newRanks[editingIndex] = formData;
    } else {
      newRanks.push(formData);
    }
    
    newRanks.sort((a, b) => a.minXp - b.minXp);

    // Save to Firebase
    for (let i = 0; i < newRanks.length; i++) {
      await setDoc(doc(db, 'custom_ranks', `rank_${i}`), newRanks[i]);
    }
    
    // Clean up extra documents if we deleted some
    const snap = await getDocs(collection(db, 'custom_ranks'));
    for (const d of snap.docs) {
      const index = parseInt(d.id.replace('rank_', ''));
      if (index >= newRanks.length) {
        await deleteDoc(doc(db, 'custom_ranks', d.id));
      }
    }

    setRanks(newRanks);
    RANKS.length = 0;
    RANKS.push(...newRanks);
    
    setIsEditing(false);
    setEditingIndex(null);
  };

  const handleDeleteRank = async (index: number) => {
    if (confirm('Tem certeza que deseja apagar esta patente?')) {
      const newRanks = ranks.filter((_, i) => i !== index);
      
      // Save to Firebase
      for (let i = 0; i < newRanks.length; i++) {
        await setDoc(doc(db, 'custom_ranks', `rank_${i}`), newRanks[i]);
      }
      
      // Delete the last one since we shifted everything up
      await deleteDoc(doc(db, 'custom_ranks', `rank_${newRanks.length}`));

      setRanks(newRanks);
      RANKS.length = 0;
      RANKS.push(...newRanks);
    }
  };

  const openEdit = (rank: RankDef, index: number) => {
    setFormData(rank);
    setEditingIndex(index);
    setIsEditing(true);
  };

  const openNew = () => {
    setFormData({ name: '', minXp: ranks.length > 0 ? ranks[ranks.length-1].minXp + 500 : 0, color: '#fbbf24', imageUrl: '' });
    setEditingIndex(null);
    setIsEditing(true);
  };

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Carregando Patentes...</div>;

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

      <div className="glass-panel" style={{ padding: '2rem' }}>
        <div style={{ position: 'sticky', top: '-2rem', zIndex: 40, background: 'rgba(30, 41, 59, 0.95)', padding: '1rem 2rem', margin: '-2rem -2rem 1rem -2rem', backdropFilter: 'blur(10px)', borderTopLeftRadius: '16px', borderTopRightRadius: '16px', borderBottom: '1px solid var(--border-glass)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ fontSize: '1.5rem', margin: '0 0 0.25rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Medal color="var(--gold-primary)" /> Patentes e Artes
            </h2>
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              Configure as patentes do jogo, a experiência necessária e as imagens (artes) de cada uma.
            </p>
          </div>
          <button className="login-btn" onClick={openNew} style={{ padding: '0.5rem 1rem', display: 'flex', gap: '0.5rem', alignItems: 'center', background: 'var(--gold-primary)', color: 'black', border: 'none' }}>
            <Plus size={18} /> Nova Patente
          </button>
        </div>

        {isEditing && createPortal(
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
            <div className="glass-panel" style={{ width: '500px', maxWidth: '95vw', padding: '2rem', animation: 'slideUp 0.3s ease-out' }}>
              <h3 style={{ marginTop: 0, marginBottom: '1.5rem', fontSize: '1.5rem' }}>{editingIndex !== null ? 'Editar Patente' : 'Criar Nova Patente'}</h3>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Nome da Patente</label>
                  <input type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="Ex: Guerreiro de Prata" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', color: 'white' }} />
                </div>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>XP Mínimo</label>
                    <input type="number" value={formData.minXp} onChange={e => setFormData({...formData, minXp: Number(e.target.value)})} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', color: 'white' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Cor do Brilho/Borda</label>
                    <input type="color" value={formData.color} onChange={e => setFormData({...formData, color: e.target.value})} style={{ width: '100%', height: '45px', padding: '0.2rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', cursor: 'pointer' }} />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Arte da Patente (URL da Imagem)</label>
                  <div style={{ display: 'flex', gap: '1rem' }}>
                    <input type="text" value={formData.imageUrl || ''} onChange={e => setFormData({...formData, imageUrl: e.target.value})} placeholder="Ex: https://..." style={{ flex: 1, padding: '0.75rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', color: 'white' }} />
                    <button onClick={() => setShowGallery(true)} style={{ background: 'var(--gold-primary)', color: 'black', border: 'none', padding: '0 1rem', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
                      <Search size={20} />
                    </button>
                  </div>
                  {formData.imageUrl && (
                    <div style={{ marginTop: '1rem', width: '120px', height: '120px', borderRadius: '12px', overflow: 'hidden', border: `3px solid ${formData.color}`, boxShadow: `0 0 15px ${formData.color}80` }}>
                      <img src={formData.imageUrl} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '2rem' }}>
                <button onClick={() => setIsEditing(false)} style={{ background: 'transparent', border: '1px solid var(--border-glass)', color: 'white', padding: '0.75rem 1.5rem', borderRadius: '8px', cursor: 'pointer' }}>Cancelar</button>
                <button onClick={handleSaveRank} className="login-btn" style={{ padding: '0.75rem 1.5rem', background: 'var(--gold-primary)', color: 'black', border: 'none' }}>Salvar Patente</button>
              </div>
            </div>
          </div>,
          document.body
        )}

        <div style={{ display: 'grid', gap: '1rem' }}>
          {ranks.map((rank, idx) => (
            <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', border: '1px solid var(--border-glass)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                {rank.imageUrl ? (
                  <img src={rank.imageUrl} alt={rank.name} style={{ width: '60px', height: '60px', borderRadius: '50%', objectFit: 'cover', border: `2px solid ${rank.color}`, boxShadow: `0 0 10px ${rank.color}80` }} />
                ) : (
                  <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: rank.color, border: '2px solid rgba(255,255,255,0.5)' }}></div>
                )}
                <div>
                  <h3 style={{ margin: 0, color: rank.color, fontSize: '1.2rem', textShadow: `0 0 5px ${rank.color}80` }}>{rank.name}</h3>
                  <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>A partir de {rank.minXp} XP</p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button onClick={() => openEdit(rank, idx)} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '0.5rem' }}><Edit2 size={18} /></button>
                <button onClick={() => handleDeleteRank(idx)} style={{ background: 'transparent', border: 'none', color: 'var(--accent-red)', cursor: 'pointer', padding: '0.5rem' }} disabled={ranks.length === 1}><Trash2 size={18} /></button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
