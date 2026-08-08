import { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { Plus, Trash2, Edit2, Save, X } from 'lucide-react';
import { useDialog } from '../contexts/DialogContext';
import type { PresetSkin } from './AvatarCustomizationModal';
import DirectUploadButton from './DirectUploadButton';
import { sessionCache, CACHE_KEYS } from '../lib/sessionCache';

export default function AdminPresetSkinsManager() {
  const { showAlert, showConfirm } = useDialog();
  const [skins, setSkins] = useState<PresetSkin[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const [activeTab, setActiveTab] = useState<'human' | 'monster' | 'equipment'>('human');
  
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [type, setType] = useState<'human' | 'monster' | 'equipment'>('human');
  const [baseModelId, setBaseModelId] = useState<string>('default');
  const [genderTarget, setGenderTarget] = useState<'male' | 'female' | 'both'>('both');

  const [models3d, setModels3d] = useState<any[]>([]);

  const fetchModels3d = async () => {
    try {
      const snap = await getDocs(collection(db, '3d_models'));
      const fetched: any[] = [];
      snap.forEach(d => {
        fetched.push({ id: d.id, ...d.data() });
      });
      setModels3d(fetched);
    } catch (e) {
      console.error('Erro ao buscar modelos 3D', e);
    }
  };

  const fetchSkins = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, 'preset_skins'));
      const fetched: PresetSkin[] = [];
      snap.forEach(d => {
        fetched.push({ id: d.id, ...d.data() } as PresetSkin);
      });
      setSkins(fetched);
    } catch (e) {
      console.error(e);
      showAlert('Erro ao buscar skins pré-definidas.');
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchSkins();
    fetchModels3d();
  }, []);

  const handleOpenModal = (skin?: PresetSkin) => {
    if (skin) {
      setEditingId(skin.id);
      setName(skin.name);
      setUrl(skin.url);
      setType(skin.type || activeTab);
      setBaseModelId(skin.baseModelId || 'default');
      setGenderTarget(skin.genderTarget || 'both');
    } else {
      setEditingId(null);
      setName('');
      setUrl('');
      setType(activeTab); // Initialize with the active tab
      setBaseModelId('default');
      setGenderTarget('both');
    }
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim() || !url.trim()) {
      showAlert('Preencha o nome e a URL da imagem.');
      return;
    }

    const isLikelyValidImage = url.startsWith('data:') || url.toLowerCase().endsWith('.png') || url.includes('t.novaskin.me');

    if (!isLikelyValidImage) {
      const confirm = await showConfirm(
        'A URL não termina em .png e pode ser um link de página (ex: novask.in/...) em vez de uma imagem. Você precisa do link direto da imagem ou fazer o Upload do arquivo. Deseja salvar mesmo assim?'
      );
      if (!confirm) return;
    }

    try {
      const data = { name: name.trim(), url: url.trim(), type, baseModelId: baseModelId === 'default' ? null : baseModelId, genderTarget };
      if (editingId) {
        await updateDoc(doc(db, 'preset_skins', editingId), data);
        showAlert('Skin atualizada com sucesso!');
      } else {
        await addDoc(collection(db, 'preset_skins'), data);
        showAlert('Skin adicionada com sucesso!');
      }
      sessionCache.invalidate(CACHE_KEYS.presetSkins());
      setIsModalOpen(false);
      fetchSkins();
    } catch (e) {
      console.error(e);
      showAlert('Erro ao salvar a skin.');
    }
  };

  const handleDelete = async (id: string) => {
    if (await showConfirm('Deseja realmente excluir esta skin pré-definida?')) {
      try {
        await deleteDoc(doc(db, 'preset_skins', id));
        sessionCache.invalidate(CACHE_KEYS.presetSkins());
        showAlert('Skin excluída com sucesso!');
        fetchSkins();
      } catch (e) {
        console.error(e);
        showAlert('Erro ao excluir skin.');
      }
    }
  };

  return (
    <div style={{ background: 'var(--bg-card)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border-color)', marginTop: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>Skins Pré-definidas</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Gerencie as skins disponíveis para alunos e monstros (Ex: Nova Skin).</p>
        </div>
        {!isModalOpen && (
          <button onClick={() => handleOpenModal()} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Plus size={18} /> Nova Skin
          </button>
        )}
      </div>

      {!isModalOpen && (
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-glass)' }}>
          <button 
            onClick={() => setActiveTab('human')} 
            style={{ padding: '0.5rem 1rem', background: 'transparent', color: activeTab === 'human' ? 'var(--gold-primary)' : 'var(--text-secondary)', border: 'none', borderBottom: activeTab === 'human' ? '2px solid var(--gold-primary)' : '2px solid transparent', cursor: 'pointer', fontWeight: 'bold' }}
          >
            Alunos / Humanos
          </button>
          <button 
            onClick={() => setActiveTab('monster')} 
            style={{ padding: '0.5rem 1rem', background: 'transparent', color: activeTab === 'monster' ? 'var(--gold-primary)' : 'var(--text-secondary)', border: 'none', borderBottom: activeTab === 'monster' ? '2px solid var(--gold-primary)' : '2px solid transparent', cursor: 'pointer', fontWeight: 'bold' }}
          >
            Monstros
          </button>
          <button 
            onClick={() => setActiveTab('equipment')} 
            style={{ padding: '0.5rem 1rem', background: 'transparent', color: activeTab === 'equipment' ? 'var(--gold-primary)' : 'var(--text-secondary)', border: 'none', borderBottom: activeTab === 'equipment' ? '2px solid var(--gold-primary)' : '2px solid transparent', cursor: 'pointer', fontWeight: 'bold' }}
          >
            Equipamentos
          </button>
        </div>
      )}

      {isModalOpen ? (
        <div style={{ background: 'var(--bg-main)', borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--border-color)', marginTop: '1rem' }}>
          <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-card)' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', margin: 0 }}>{editingId ? 'Editar Skin' : 'Nova Skin'}</h2>
            <button onClick={() => setIsModalOpen(false)} style={{ color: 'var(--text-secondary)', cursor: 'pointer', background: 'none', border: 'none' }}>
              <X size={24} />
            </button>
          </div>
          
          <div style={{ padding: '1.5rem' }}>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Nome da Skin</label>
              <input 
                type="text" 
                value={name} 
                onChange={e => setName(e.target.value)} 
                placeholder="Ex: Guerreiro Místico" 
                style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', color: 'white' }} 
              />
            </div>
            
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>URL da Imagem (.png)</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input 
                  type="text" 
                  value={url} 
                  onChange={e => setUrl(e.target.value)} 
                  placeholder="https://p.novaskin.me/exemplo.png" 
                  style={{ flex: 1, padding: '0.75rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', color: 'white' }} 
                />
                <DirectUploadButton 
                  onUploadComplete={setUrl} 
                  folder="skins" 
                />
              </div>
            </div>

            <div style={{ marginBottom: '1rem', display: 'flex', gap: '1rem' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Categoria da Skin</label>
                <select 
                  value={type} 
                  onChange={e => setType(e.target.value as any)} 
                  style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', color: 'white' }}
                >
                  <option value="human">Aluno / Humanoide</option>
                  <option value="monster">Monstro</option>
                  <option value="equipment">Equipamento</option>
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Molde Base (3D)</label>
                <select 
                  value={baseModelId} 
                  onChange={e => setBaseModelId(e.target.value)} 
                  style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', color: 'white' }}
                >
                  <option value="default">Padrão Humanoide (Minecraft)</option>
                  {models3d.map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Gênero Alvo</label>
                <select 
                  value={genderTarget} 
                  onChange={e => setGenderTarget(e.target.value as any)} 
                  style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', color: 'white' }}
                >
                  <option value="both">Ambos (Unissex)</option>
                  <option value="male">Masculino</option>
                  <option value="female">Feminino</option>
                </select>
              </div>
            </div>

            <button 
              onClick={handleSave} 
              className="btn-primary" 
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', padding: '0.75rem' }}
            >
              <Save size={18} /> Salvar
            </button>
          </div>
        </div>
      ) : (
        <>
          {loading ? (
            <p style={{ color: 'var(--text-secondary)' }}>Carregando skins...</p>
          ) : (
            (() => {
              const filteredSkins = skins.filter(s => (s.type || 'human') === activeTab);
              if (filteredSkins.length === 0) {
                return (
                  <div style={{ padding: '2rem', textAlign: 'center', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px dashed var(--border-color)' }}>
                    <p style={{ color: 'var(--text-secondary)' }}>Nenhuma skin encontrada nesta categoria.</p>
                  </div>
                );
              }
              return (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
                  {filteredSkins.map(skin => (
                    <div key={skin.id} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                      <div style={{ width: '48px', height: '48px', borderRadius: '8px', background: 'var(--bg-card)', border: '1px solid var(--border-glass)', overflow: 'hidden', flexShrink: 0, backgroundImage: `url(${skin.url})`, backgroundSize: 'cover', backgroundPosition: 'top center' }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <h4 style={{ fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', margin: '0 0 0.25rem 0' }}>{skin.name}</h4>
                        <span style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem', background: skin.type === 'monster' ? 'rgba(239, 68, 68, 0.2)' : skin.type === 'equipment' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(59, 130, 246, 0.2)', color: skin.type === 'monster' ? '#f87171' : skin.type === 'equipment' ? '#f59e0b' : '#60a5fa', borderRadius: '1rem' }}>
                          {skin.type === 'monster' ? 'Monstro' : skin.type === 'equipment' ? 'Equipamento' : 'Humano'}
                        </span>
                        {skin.genderTarget && skin.genderTarget !== 'both' && (
                          <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', padding: '0.2rem 0.5rem', background: skin.genderTarget === 'male' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(236, 72, 153, 0.2)', color: skin.genderTarget === 'male' ? '#60a5fa' : '#f472b6', borderRadius: '1rem' }}>
                            {skin.genderTarget === 'male' ? 'Masculino' : 'Feminino'}
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button onClick={() => handleOpenModal(skin)} style={{ padding: '0.5rem', color: '#60a5fa', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '8px', cursor: 'pointer', border: 'none' }}>
                          <Edit2 size={16} />
                        </button>
                        <button onClick={() => handleDelete(skin.id)} style={{ padding: '0.5rem', color: '#f87171', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '8px', cursor: 'pointer', border: 'none' }}>
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()
          )}
        </>
      )}
    </div>
  );
}
