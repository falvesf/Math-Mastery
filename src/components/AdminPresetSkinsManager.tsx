import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Plus, Trash2, Edit2, Save, X, Globe, Building2 } from 'lucide-react';
import { useDialog } from '../contexts/DialogContext';
import { useTenant } from '../contexts/TenantContext';
import type { PresetSkin } from './AvatarCustomizationModal';
import DirectUploadButton from './DirectUploadButton';
import { sessionCache, CACHE_KEYS } from '../lib/sessionCache';
import { v4 as uuidv4 } from 'uuid';

export default function AdminPresetSkinsManager() {
  const { showAlert, showConfirm } = useDialog();
  const { tenantId, isSuperAdmin } = useTenant();
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
      let query = supabase.from('3d_models').select('*');
      if (tenantId) {
        query = query.or(`is_global.eq.true,tenant_id.eq.${tenantId}`);
      }
      const { data: snap } = await query;
      if (snap) {
        setModels3d(snap);
      }
    } catch (e) {
      console.error('Erro ao buscar modelos 3D', e);
    }
  };

  const fetchSkins = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      let query = supabase.from('preset_skins').select('*');
      if (tenantId) {
        query = query.or(`is_global.eq.true,tenant_id.eq.${tenantId}`);
      }
      const { data: snap, error } = await query;
      if (error) {
        console.error('Supabase fetch error:', error);
        showAlert(`Erro do Supabase: ${error.message}`);
      } else if (snap) {
        // Garante que type tenha um valor padrão se vier null do banco
        const mapped = snap.map((s: any) => ({
          ...s,
          type: s.type || 'human',
          genderTarget: s.genderTarget || 'both',
          _isGlobal: s.is_global ?? false,
        }));
        setSkins(mapped as PresetSkin[]);
      }
    } catch (e: any) {
      console.error(e);
      showAlert(`Erro ao buscar skins: ${e.message}`);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchSkins();
    fetchModels3d();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

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
      // As colunas no banco são camelCase (baseModelId, genderTarget)
      // O id é text sem default, por isso geramos um UUID manualmente no insert
      const data: any = {
        name: name.trim(),
        url: url.trim(),
        type,
        baseModelId: baseModelId === 'default' ? null : baseModelId,
        genderTarget,
        tenant_id: tenantId || null,
        is_global: false,
      };
      let saveError: any = null;
      if (editingId) {
        const editingSkin = skins.find(s => s.id === editingId);
        if ((editingSkin as any)?._isGlobal && !isSuperAdmin) {
          showAlert('Skins globais só podem ser editadas pelo superadmin.');
          return;
        }
        const { error } = await supabase.from('preset_skins').update(data).eq('id', editingId);
        saveError = error;
      } else {
        // Gera um ID único pois a coluna 'id' é text sem valor padrão
        const { error } = await supabase.from('preset_skins').insert({ id: uuidv4(), ...data });
        saveError = error;
      }
      if (saveError) {
        console.error('Supabase save error:', saveError);
        showAlert(`Erro ao salvar: ${saveError.message}`);
        return;
      }
      showAlert(editingId ? 'Skin atualizada com sucesso!' : 'Skin adicionada com sucesso!');
      sessionCache.invalidate(CACHE_KEYS.presetSkins(tenantId));
      setIsModalOpen(false);
      fetchSkins(false);
    } catch (e: any) {
      console.error(e);
      showAlert(`Erro ao salvar a skin: ${e.message}`);
    }
  };

  const handleDelete = async (id: string) => {
    if (await showConfirm('Deseja realmente excluir esta skin pré-definida?')) {
      try {
        const skin = skins.find(s => s.id === id);
        if ((skin as any)?._isGlobal && !isSuperAdmin) {
          showAlert('Skins globais só podem ser excluídas pelo superadmin.');
          return;
        }
        await supabase.from('preset_skins').delete().eq('id', id);
        sessionCache.invalidate(CACHE_KEYS.presetSkins(tenantId));
        showAlert('Skin excluída com sucesso!');
        fetchSkins(false);
      } catch (e) {
        console.error(e);
        showAlert('Erro ao excluir skin.');
      }
    }
  };

  return (
    <div style={{ background: 'var(--bg-card)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border-color)', marginTop: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem' }}>
          <div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', margin: 0, textTransform: 'uppercase', letterSpacing: '2px', color: 'var(--gold-primary)' }}>
              Skins Pré-definidas
            </h2>
            <p style={{ color: 'var(--text-secondary)', margin: '0.5rem 0 0 0', fontSize: '0.9rem' }}>
              Gerencie as skins disponíveis para alunos e monstros (Ex: Nova Skin).
            </p>
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
                        <h4 style={{ fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', margin: '0 0 0.25rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          {skin.name}
                          {(skin as any)._isGlobal ? <span title="Global (somente leitura)"><Globe size={14} color="var(--text-secondary)" /></span> : <span title="Local (editável)"><Building2 size={14} color="#10b981" /></span>}
                        </h4>
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
                        <button onClick={() => handleOpenModal(skin)} disabled={(skin as any)._isGlobal && !isSuperAdmin} style={{ padding: '0.5rem', color: '#60a5fa', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '8px', cursor: (skin as any)._isGlobal && !isSuperAdmin ? 'not-allowed' : 'pointer', border: 'none', opacity: (skin as any)._isGlobal && !isSuperAdmin ? 0.4 : 1 }}>
                          <Edit2 size={16} />
                        </button>
                        <button onClick={() => handleDelete(skin.id)} disabled={(skin as any)._isGlobal && !isSuperAdmin} style={{ padding: '0.5rem', color: '#f87171', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '8px', cursor: (skin as any)._isGlobal && !isSuperAdmin ? 'not-allowed' : 'pointer', border: 'none', opacity: (skin as any)._isGlobal && !isSuperAdmin ? 0.4 : 1 }}>
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
