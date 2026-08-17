import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Plus, Trash2, Edit2, Save, X, Box } from 'lucide-react';
import { useDialog } from '../contexts/DialogContext';
import DirectUploadButton from './DirectUploadButton';
import { sessionCache, CACHE_KEYS } from '../lib/sessionCache';

export interface Model3D {
  id: string;
  name: string;
  url: string;
}

export default function Admin3DModelsManager() {
  const { showAlert, showConfirm } = useDialog();
  const [models, setModels] = useState<Model3D[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');

  const fetchModels = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const { data: snap, error } = await supabase.from('3d_models').select('*');
      if (error) {
        console.error('Supabase fetch error:', error);
        showAlert(`Erro do Supabase: ${error.message}`);
      } else if (snap) {
        setModels(snap as Model3D[]);
      }
    } catch (e: any) {
      console.error(e);
      showAlert(`Erro ao buscar modelos 3D: ${e.message}`);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchModels();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleOpenModal = (model?: Model3D) => {
    if (model) {
      setEditingId(model.id);
      setName(model.name);
      setUrl(model.url);
    } else {
      setEditingId(null);
      setName('');
      setUrl('');
    }
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim() || !url.trim()) {
      showAlert('Preencha o nome e a URL do modelo (.glb).');
      return;
    }

    const urlLower = url.toLowerCase();
    const isGlbOrGltf = urlLower.includes('.glb') || urlLower.includes('.gltf') || url.startsWith('data:');

    if (!isGlbOrGltf) {
      const confirm = await showConfirm(
        'A URL não parece conter .glb ou .gltf. Você tem certeza que é um modelo 3D válido? Deseja salvar mesmo assim?'
      );
      if (!confirm) return;
    }

    try {
      const data = { name: name.trim(), url: url.trim() };
      if (editingId) {
        await supabase.from('3d_models').update(data).eq('id', editingId);
        showAlert('Modelo atualizado com sucesso!');
      } else {
        await supabase.from('3d_models').insert(data);
        showAlert('Modelo adicionado com sucesso!');
      }
      sessionCache.invalidate(CACHE_KEYS.models3d());
      setIsModalOpen(false);
      fetchModels(false);
    } catch (e) {
      console.error(e);
      showAlert('Erro ao salvar o modelo.');
    }
  };

  const handleDelete = async (id: string) => {
    if (await showConfirm('Deseja realmente excluir este modelo 3D? Ele deixará de funcionar nas skins que o utilizam.')) {
      try {
        await supabase.from('3d_models').delete().eq('id', id);
        sessionCache.invalidate(CACHE_KEYS.models3d());
        showAlert('Modelo excluído com sucesso!');
        fetchModels(false);
      } catch (e) {
        console.error(e);
        showAlert('Erro ao excluir modelo.');
      }
    }
  };

  return (
    <div style={{ background: 'var(--bg-card)', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--border-color)', marginTop: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Box size={20} color="var(--accent-primary)" /> Moldes 3D Customizados
          </h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Cadastre os moldes (.glb) que as skins de monstros e pets podem usar.</p>
        </div>
        <button onClick={() => handleOpenModal()} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Plus size={18} /> Novo Molde
        </button>
      </div>

      {isModalOpen ? (
        <div style={{ background: 'var(--bg-main)', borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--border-color)', marginTop: '1rem' }}>
          <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-card)' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', margin: 0 }}>{editingId ? 'Editar Molde' : 'Novo Molde'}</h2>
            <button onClick={() => setIsModalOpen(false)} style={{ color: 'var(--text-secondary)', cursor: 'pointer', background: 'none', border: 'none' }}>
              <X size={24} />
            </button>
          </div>
          
          <div style={{ padding: '1.5rem' }}>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Nome do Molde</label>
              <input 
                type="text" 
                value={name} 
                onChange={e => setName(e.target.value)} 
                placeholder="Ex: Iron Golem" 
                style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', color: 'white' }} 
              />
            </div>
            
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>URL do Modelo (.glb)</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input 
                  type="text" 
                  value={url} 
                  onChange={e => setUrl(e.target.value)} 
                  placeholder="https://meusite.com/golem.glb" 
                  style={{ flex: 1, padding: '0.75rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', color: 'white' }} 
                />
                <DirectUploadButton 
                  onUploadComplete={setUrl} 
                  folder="3d_models" 
                  accept=".glb,.gltf"
                />
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
            <p style={{ color: 'var(--text-secondary)' }}>Carregando moldes...</p>
          ) : models.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px dashed var(--border-color)' }}>
              <p style={{ color: 'var(--text-secondary)' }}>Nenhum molde 3D cadastrado.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
              {models.map(model => (
                <div key={model.id} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  <div style={{ width: '48px', height: '48px', borderRadius: '8px', background: 'var(--bg-card)', border: '1px solid var(--border-glass)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Box size={24} color="var(--accent-primary)" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h4 style={{ fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', margin: '0 0 0.25rem 0' }}>{model.name}</h4>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button onClick={() => handleOpenModal(model)} style={{ padding: '0.5rem', color: '#60a5fa', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '8px', cursor: 'pointer', border: 'none' }}>
                      <Edit2 size={16} />
                    </button>
                    <button onClick={() => handleDelete(model.id)} style={{ padding: '0.5rem', color: '#f87171', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '8px', cursor: 'pointer', border: 'none' }}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
