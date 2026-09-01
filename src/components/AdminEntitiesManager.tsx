import { useState, useEffect } from 'react';
import { User, Swords, Dog, Settings } from 'lucide-react';
import AvatarCustomizationModal from './AvatarCustomizationModal';
import AdminPresetSkinsManager from './AdminPresetSkinsManager';
import Admin3DModelsManager from './Admin3DModelsManager';
import { supabase } from '../lib/supabase';
import { useTenant } from '../contexts/TenantContext';

export default function AdminEntitiesManager() {
  const [activeTab, setActiveTab] = useState<'players' | 'monsters' | 'pets' | 'skins' | 'models'>('players');
  const { tenantId } = useTenant();
  const [skinModels, setSkinModels] = useState<any[]>([]);
  const [monsterModelUrl, setMonsterModelUrl] = useState('');

  const fetchSkinModels = () => {
    let q = supabase.from('3d_models').select('*');
    if (tenantId) q = q.or(`is_global.eq.true,tenant_id.eq.${tenantId}`);
    q.then(({ data }) => {
      setSkinModels((data || []).filter(m => (m.category || 'skin') === 'skin'));
    }).catch(() => {});
  };

  // Busca na abertura e sempre que trocar de guia (para novos moldes aparecerem
  // na combobox sem precisar recarregar a página).
  useEffect(() => {
    fetchSkinModels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, activeTab]);

  // Também atualiza quando um molde é salvo/excluído no Moldes 3D
  useEffect(() => {
    const onModelsChanged = () => fetchSkinModels();
    window.addEventListener('models3d-changed', onModelsChanged);
    return () => window.removeEventListener('models3d-changed', onModelsChanged);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  return (
    <div>
      {/* Sticky Header Area */}
      <div style={{ position: 'sticky', top: '-2rem', zIndex: 40, background: 'var(--bg-card)', padding: '1rem 2rem', margin: '-2rem -2rem 1rem -2rem', backdropFilter: 'blur(10px)', borderTopLeftRadius: '16px', borderTopRightRadius: '16px', borderBottom: '1px solid var(--border-glass)' }}>
        <h2 style={{ marginBottom: '1.5rem', color: 'var(--text-primary)' }}>Gerenciar Entidades 3D</h2>

        {/* Tabs */}
        <div className="hide-scrollbar" style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid var(--border-glass)', paddingBottom: '1rem', overflowX: 'auto', whiteSpace: 'nowrap' }}>
          <button
            onClick={() => setActiveTab('players')}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '0.75rem 1.5rem', borderRadius: '8px',
              color: activeTab === 'players' ? 'var(--accent-primary)' : 'var(--text-secondary)',
              backgroundColor: activeTab === 'players' ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
              fontWeight: activeTab === 'players' ? 'bold' : 'normal',
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              transition: 'all 0.2s'
            }}
          >
            <User size={18} /> Jogadores
          </button>
          <button
            onClick={() => setActiveTab('monsters')}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '0.75rem 1.5rem', borderRadius: '8px',
              color: activeTab === 'monsters' ? 'var(--accent-red)' : 'var(--text-secondary)',
              backgroundColor: activeTab === 'monsters' ? 'rgba(239, 68, 68, 0.1)' : 'transparent',
              fontWeight: activeTab === 'monsters' ? 'bold' : 'normal',
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              transition: 'all 0.2s'
            }}
        >
          <Swords size={18} /> Monstros
        </button>
        <button
          onClick={() => setActiveTab('pets')}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            padding: '0.75rem 1.5rem', borderRadius: '8px',
            color: activeTab === 'pets' ? 'var(--gold-primary)' : 'var(--text-secondary)',
            backgroundColor: activeTab === 'pets' ? 'rgba(251, 191, 36, 0.1)' : 'transparent',
            fontWeight: activeTab === 'pets' ? 'bold' : 'normal',
            display: 'flex', alignItems: 'center', gap: '0.5rem',
            transition: 'all 0.2s'
          }}
        >
          <Dog size={18} /> Pets
        </button>
        <button
          onClick={() => setActiveTab('skins')}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            padding: '0.75rem 1.5rem', borderRadius: '8px',
            color: activeTab === 'skins' ? '#60a5fa' : 'var(--text-secondary)',
            backgroundColor: activeTab === 'skins' ? 'rgba(96, 165, 250, 0.1)' : 'transparent',
            fontWeight: activeTab === 'skins' ? 'bold' : 'normal',
            display: 'flex', alignItems: 'center', gap: '0.5rem',
            transition: 'all 0.2s'
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg> Skins
        </button>
        <button
          onClick={() => setActiveTab('models')}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            padding: '0.75rem 1.5rem', borderRadius: '8px',
            color: activeTab === 'models' ? '#10b981' : 'var(--text-secondary)',
            backgroundColor: activeTab === 'models' ? 'rgba(16, 185, 129, 0.1)' : 'transparent',
            fontWeight: activeTab === 'models' ? 'bold' : 'normal',
            display: 'flex', alignItems: 'center', gap: '0.5rem',
            transition: 'all 0.2s'
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg> Moldes 3D
        </button>
        </div>
      </div>

      {/* Content */}
      <div className="glass-panel" style={{ padding: '1rem' }}>
        {activeTab === 'players' && (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{ marginBottom: '1rem', display: 'flex', alignItems: 'baseline', gap: '0.5rem', flexWrap: 'wrap' }}>
              <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '1.1rem' }}>Configuração de Jogadores</h3>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Configure a aparência base do avatar.</span>
            </div>
            <AvatarCustomizationModal 
              key="player-modal"
              isOpen={true} 
              onClose={() => {}} 
              isAdmin={true} 
              inline={true} 
              customSaveMode={false} 
            />
          </div>
        )}

{activeTab === 'monsters' && (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{ marginBottom: '1rem', display: 'flex', alignItems: 'baseline', gap: '0.5rem', flexWrap: 'wrap' }}>
              <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '1.1rem' }}>Criação de Monstros</h3>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Crie novos monstros com peças customizadas ou a partir de um molde 3D importado.</span>
            </div>
            <div style={{ marginBottom: '1rem', background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: '8px', padding: '0.75rem' }}>
              <label style={{ display: 'block', marginBottom: '0.4rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                Começar a partir de um Molde 3D importado (Skins de Monstros e Pets)
              </label>
              <select
                value={monsterModelUrl}
                onChange={e => setMonsterModelUrl(e.target.value)}
                style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontSize: '0.85rem' }}
              >
                <option value="">(Criar monstro do zero)</option>
                {skinModels.map(m => <option key={m.id} value={m.url}>{m.name}</option>)}
              </select>
              <span style={{ display: 'block', marginTop: '0.35rem', color: 'var(--text-secondary)', fontSize: '0.72rem' }}>
                Modelos .glb com cores próprias são usados direto, sem precisar de skin.
              </span>
            </div>
            <AvatarCustomizationModal
              key={`monster-modal-${monsterModelUrl}`}
              isOpen={true}
              onClose={() => {}}
              isAdmin={true}
              inline={true}
              customSaveMode={true}
              initialConfig={monsterModelUrl ? { customModelUrl: monsterModelUrl } as any : undefined}
              onSave={() => {
                // Salvo com sucesso!
              }}
            />
          </div>
        )}

        {activeTab === 'pets' && (
          <div style={{ textAlign: 'center', padding: '4rem 0', opacity: 0.7 }}>
            <Dog size={64} style={{ marginBottom: '1rem', color: 'var(--gold-primary)' }} />
            <h3 style={{ marginBottom: '0.5rem' }}>Sistema de Pets em Breve</h3>
            <p style={{ color: 'var(--text-secondary)' }}>Esta funcionalidade está em desenvolvimento e estará disponível em atualizações futuras.</p>
          </div>
        )}

        {activeTab === 'skins' && (
          <AdminPresetSkinsManager />
        )}

        {activeTab === 'models' && (
          <Admin3DModelsManager />
        )}
      </div>
    </div>
  );
}
