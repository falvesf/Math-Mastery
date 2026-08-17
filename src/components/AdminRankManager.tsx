import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase';
import { Medal, Plus, Edit2, Trash2, Search } from 'lucide-react';
import ImageGalleryModal from './ImageGalleryModal';
import DirectUploadButton from './DirectUploadButton';
import { useDialog } from '../contexts/DialogContext';
import { RANKS } from '../lib/ranks';
import type { RankDef } from '../lib/ranks';
import type { ClassDef } from '../pages/AdminDashboard';

const AnimatedRankIcon = ({ rank }: { rank: RankDef }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  
  const allImages = [rank.imageUrl, ...(rank.variants || []).map(v => v.imageUrl)].filter(Boolean) as string[];

  useEffect(() => {
    if (allImages.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentIndex(prev => (prev + 1) % allImages.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [allImages.length]);

  if (allImages.length === 0) {
    return <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: rank.color, border: '2px solid rgba(255,255,255,0.5)' }}></div>;
  }

  return (
    <img key={currentIndex} src={allImages[currentIndex]} alt={rank.name} style={{ width: '60px', height: '60px', borderRadius: '50%', objectFit: 'cover', border: `2px solid ${rank.color}`, boxShadow: `0 0 10px ${rank.color}80`, animation: 'fadeIn 0.5s ease-in-out' }} />
  );
};

export default function AdminRankManager({ pixabayKey }: { pixabayKey: string }) {
  const { showConfirm } = useDialog();
  const [ranks, setRanks] = useState<RankDef[]>([...RANKS]);
  const [classes, setClasses] = useState<ClassDef[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [isEditing, setIsEditing] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [formData, setFormData] = useState<RankDef>({
    name: '', minXp: 0, color: '#fbbf24', imageUrl: ''
  });
  
  const [galleryTarget, setGalleryTarget] = useState<'main' | number | null>(null);

  useEffect(() => {
    fetchRanks(false);
    fetchClasses();
  }, []);

  const fetchClasses = async (showLoading = true) => {
    try {
      const { data: snap } = await supabase.from('classes').select('*');
      if (snap && snap.length > 0) {
        setClasses(snap as ClassDef[]);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchRanks = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    const { data: snap } = await supabase.from('custom_ranks').select('*');
    if (snap && snap.length > 0) {
      const loadedRanks = snap.map(d => {
        const { id, ...rest } = d;
        return rest as RankDef;
      }).sort((a,b) => a.minXp - b.minXp);
      setRanks(loadedRanks);
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

    // Save to Supabase
    for (let i = 0; i < newRanks.length; i++) {
      await supabase.from('custom_ranks').upsert({ id: `rank_${i}`, ...newRanks[i] });
    }
    
    // Clean up extra documents if we deleted some
    const { data: snap } = await supabase.from('custom_ranks').select('id');
    if (snap) {
      for (const d of snap) {
        const index = parseInt(d.id.replace('rank_', ''));
        if (index >= newRanks.length) {
          await supabase.from('custom_ranks').delete().eq('id', d.id);
        }
      }
    }

    setRanks(newRanks);
    RANKS.length = 0;
    RANKS.push(...newRanks);
    
    setIsEditing(false);
    setEditingIndex(null);
  };

  const handleDeleteRank = async (index: number) => {
    const confirmed = await showConfirm('Tem certeza que deseja apagar esta patente?');
    if (confirmed) {
      const newRanks = ranks.filter((_, i) => i !== index);
      
      // Save to Supabase
      for (let i = 0; i < newRanks.length; i++) {
        await supabase.from('custom_ranks').upsert({ id: `rank_${i}`, ...newRanks[i] });
      }
      
      // Delete the last one since we shifted everything up
      await supabase.from('custom_ranks').delete().eq('id', `rank_${newRanks.length}`);

      setRanks(newRanks);
      RANKS.length = 0;
      RANKS.push(...newRanks);
    }
  };

  const openEdit = (rank: RankDef, index: number) => {
    setFormData({ ...rank, variants: rank.variants || [] });
    setEditingIndex(index);
    setIsEditing(true);
  };

  const openNew = () => {
    setFormData({ name: '', minXp: ranks.length > 0 ? ranks[ranks.length-1].minXp + 500 : 0, color: '#fbbf24', imageUrl: '', variants: [] });
    setEditingIndex(null);
    setIsEditing(true);
  };

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Carregando Patentes...</div>;

  return (
    <div style={{ animation: 'fadeIn 0.3s ease-out' }}>
      
      {galleryTarget !== null && createPortal(
        <ImageGalleryModal 
          apiKey={pixabayKey}
          onClose={() => setGalleryTarget(null)}
          onSelectImage={(url) => {
            if (galleryTarget === 'main') {
              setFormData({ ...formData, imageUrl: url });
            } else if (typeof galleryTarget === 'number') {
              const newVariants = [...(formData.variants || [])];
              newVariants[galleryTarget].imageUrl = url;
              setFormData({ ...formData, variants: newVariants });
            }
            setGalleryTarget(null);
          }}
        />,
        document.body
      )}

      <div className="glass-panel" style={{ padding: '2rem' }}>
        <div style={{ position: 'sticky', top: '-2rem', zIndex: 40, background: 'var(--bg-card)', padding: '1rem 2rem', margin: '-2rem -2rem 1rem -2rem', backdropFilter: 'blur(10px)', borderTopLeftRadius: '16px', borderTopRightRadius: '16px', borderBottom: '1px solid var(--border-glass)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ fontSize: '1.5rem', margin: '0 0 0.25rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Medal color="var(--gold-primary)" /> Patentes e Artes
            </h2>
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              Configure as patentes do jogo, a experiência necessária e as imagens (artes) de cada uma.
            </p>
          </div>
          <button className="login-btn" onClick={openNew} style={{ padding: '0.5rem 1rem', display: 'flex', gap: '0.5rem', alignItems: 'center', background: 'var(--gold-primary)', color: 'var(--text-on-gold, #000000)', border: 'none' }}>
            <Plus size={18} /> Nova Patente
          </button>
        </div>

        {isEditing && createPortal(
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
            <div className="glass-panel" style={{ width: '500px', maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto', padding: '2rem', animation: 'slideUp 0.3s ease-out' }}>
              <h3 style={{ marginTop: 0, marginBottom: '1.5rem', fontSize: '1.5rem' }}>{editingIndex !== null ? 'Editar Patente' : 'Criar Nova Patente'}</h3>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Nome da Patente</label>
                  <input type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="Ex: Guerreiro de Prata" style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)' }} />
                </div>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>XP Mínimo</label>
                    <input type="number" value={formData.minXp} onChange={e => setFormData({...formData, minXp: Number(e.target.value)})} style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Cor do Brilho/Borda</label>
                    <input type="color" value={formData.color} onChange={e => setFormData({...formData, color: e.target.value})} style={{ width: '100%', height: '45px', padding: '0.2rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', cursor: 'pointer' }} />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Arte da Patente (URL da Imagem)</label>
                  <div style={{ display: 'flex', gap: '1rem' }}>
                    <input type="text" value={formData.imageUrl || ''} onChange={e => setFormData({...formData, imageUrl: e.target.value})} placeholder="Ex: https://..." style={{ flex: 1, padding: '0.75rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)' }} />
                    <DirectUploadButton folder="ranks" onUploadComplete={(url) => setFormData({...formData, imageUrl: url})} buttonStyle={{ minHeight: '100%' }} />
                    <button onClick={() => setGalleryTarget('main')} style={{ background: 'var(--gold-primary)', color: 'var(--text-on-gold, #000000)', border: 'none', padding: '0 1rem', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', minHeight: '100%' }}>
                      <Search size={20} />
                    </button>
                  </div>
                  {formData.imageUrl && (
                    <div style={{ marginTop: '1rem', width: '120px', height: '120px', borderRadius: '12px', overflow: 'hidden', border: `3px solid ${formData.color}`, boxShadow: `0 0 15px ${formData.color}80` }}>
                      <img src={formData.imageUrl} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>
                  )}
                </div>

                <div style={{ marginTop: '1.5rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Música de Comemoração (Opcional - MP3/WAV)</label>
                  <div style={{ display: 'flex', gap: '1rem' }}>
                    <input type="text" value={formData.audioUrl || ''} onChange={e => setFormData({...formData, audioUrl: e.target.value})} placeholder="URL do áudio..." style={{ flex: 1, padding: '0.75rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)' }} />
                    <DirectUploadButton folder="audio" accept="audio/*" onUploadComplete={(url) => setFormData({...formData, audioUrl: url})} buttonStyle={{ minHeight: '100%' }} />
                  </div>
                  {formData.audioUrl && (
                    <audio controls src={formData.audioUrl} style={{ marginTop: '1rem', width: '100%', height: '40px' }} />
                  )}
                </div>
              </div>

              {/* Variações por Turma */}
              <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border-glass)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <label style={{ color: 'var(--text-secondary)', fontWeight: 'bold' }}>Variações de Arte (Por Turma)</label>
                  <button onClick={() => setFormData({...formData, variants: [...(formData.variants || []), { classIds: [], imageUrl: '' }]})} style={{ background: 'var(--btn-bg)', border: 'none', color: 'var(--text-primary)', padding: '0.25rem 0.75rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem' }}>
                    + Adicionar Variação
                  </button>
                </div>
                
                {(formData.variants || []).length === 0 ? (
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontStyle: 'italic' }}>Nenhuma variação específica. Todas as turmas usarão a arte padrão.</p>
                ) : (
                  <div style={{ display: 'grid', gap: '1rem', maxHeight: '300px', overflowY: 'auto', paddingRight: '0.5rem' }}>
                    {(formData.variants || []).map((variant, vIdx) => (
                      <div key={vIdx} style={{ background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-glass)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                          <span style={{ fontWeight: 'bold', color: 'var(--gold-primary)', fontSize: '0.9rem' }}>Variação {vIdx + 1}</span>
                          <button onClick={() => {
                            const newV = [...(formData.variants || [])];
                            newV.splice(vIdx, 1);
                            setFormData({...formData, variants: newV});
                          }} style={{ background: 'transparent', border: 'none', color: 'var(--accent-red)', cursor: 'pointer' }}><Trash2 size={16} /></button>
                        </div>
                        
                        <div style={{ marginBottom: '1rem' }}>
                          <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Turmas vinculadas:</label>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                            {classes.map(c => {
                              const isSelected = variant.classIds.includes(c.name);
                              return (
                                <button
                                  key={c.id}
                                  onClick={() => {
                                    const newV = [...(formData.variants || [])];
                                    if (isSelected) {
                                      newV[vIdx].classIds = newV[vIdx].classIds.filter(name => name !== c.name);
                                    } else {
                                      newV[vIdx].classIds.push(c.name);
                                    }
                                    setFormData({...formData, variants: newV});
                                  }}
                                  style={{
                                    padding: '0.25rem 0.5rem', fontSize: '0.8rem', borderRadius: '4px', cursor: 'pointer',
                                    background: isSelected ? c.color : 'var(--btn-bg)',
                                    color: isSelected ? 'var(--text-on-gold, #000000)' : 'var(--text-secondary)',
                                    border: `1px solid ${isSelected ? c.color : 'var(--border-glass)'}`,
                                    fontWeight: isSelected ? 'bold' : 'normal'
                                  }}
                                >
                                  {c.name}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div>
                          <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Imagem da Variação</label>
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <input type="text" value={variant.imageUrl} onChange={e => {
                              const newV = [...(formData.variants || [])];
                              newV[vIdx].imageUrl = e.target.value;
                              setFormData({...formData, variants: newV});
                            }} placeholder="URL..." style={{ flex: 1, padding: '0.5rem', borderRadius: '6px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontSize: '0.85rem' }} />
                            
                            <DirectUploadButton folder="ranks" onUploadComplete={(url) => {
                              const newV = [...(formData.variants || [])];
                              newV[vIdx].imageUrl = url;
                              setFormData({...formData, variants: newV});
                            }} buttonStyle={{ minHeight: '100%', padding: '0 0.5rem' }} />
                            
                            <button onClick={() => setGalleryTarget(vIdx)} style={{ background: 'var(--gold-primary)', color: 'var(--text-on-gold, #000000)', border: 'none', padding: '0 0.75rem', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
                              <Search size={16} />
                            </button>
                          </div>
                          {variant.imageUrl && (
                            <div style={{ marginTop: '0.5rem', width: '60px', height: '60px', borderRadius: '8px', overflow: 'hidden', border: `2px solid ${formData.color}` }}>
                              <img src={variant.imageUrl} alt="Variant Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '2rem' }}>
                <button onClick={() => setIsEditing(false)} style={{ background: 'transparent', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', padding: '0.75rem 1.5rem', borderRadius: '8px', cursor: 'pointer' }}>Cancelar</button>
                <button onClick={handleSaveRank} className="login-btn" style={{ padding: '0.75rem 1.5rem', background: 'var(--gold-primary)', color: 'var(--text-on-gold, #000000)', border: 'none' }}>Salvar Patente</button>
              </div>
            </div>
          </div>,
          document.body
        )}

        <div style={{ display: 'grid', gap: '1rem' }}>
          {ranks.map((rank, idx) => (
            <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', border: '1px solid var(--border-glass)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                <AnimatedRankIcon rank={rank} />
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
