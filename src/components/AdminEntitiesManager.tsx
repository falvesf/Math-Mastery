import { useState } from 'react';
import { User, Swords, Dog, Settings } from 'lucide-react';
import AvatarCustomizationModal from './AvatarCustomizationModal';
import AdminPresetSkinsManager from './AdminPresetSkinsManager';
import Admin3DModelsManager from './Admin3DModelsManager';

export default function AdminEntitiesManager() {
  const [activeTab, setActiveTab] = useState<'players' | 'monsters' | 'pets' | 'skins' | 'models'>('players');

  return (
    <div>
      {/* Sticky Header Area */}
      <div style={{ position: 'sticky', top: '-2rem', zIndex: 10, background: 'var(--bg-panel)', margin: '-2rem -2rem 2rem -2rem', padding: '2rem 2rem 0 2rem', borderTopLeftRadius: '16px', borderTopRightRadius: '16px', borderBottom: '1px solid var(--border-glass)' }}>
        <h2 style={{ marginBottom: '1.5rem', color: 'var(--text-primary)' }}>Gerenciar Entidades 3D</h2>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid var(--border-glass)', paddingBottom: '1rem' }}>
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
          <Settings size={18} /> Skins
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
          <Settings size={18} /> Moldes 3D
        </button>
        </div>
      </div>

      {/* Content */}
      <div className="glass-panel" style={{ padding: '2rem' }}>
        {activeTab === 'players' && (
          <div>
            <h3 style={{ marginBottom: '1rem', color: 'var(--text-primary)' }}>Configuração de Perfil do Jogador</h3>
            <p style={{ marginBottom: '2rem', color: 'var(--text-secondary)' }}>
              Configure a aparência do seu avatar. As opções avançadas (Skins, Moldes 3D) estão disponíveis abaixo.
            </p>
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
          <div>
            <h3 style={{ marginBottom: '1rem', color: 'var(--text-primary)' }}>Criação de Monstros</h3>
            <p style={{ marginBottom: '2rem', color: 'var(--text-secondary)' }}>
              Crie um novo monstro com peças customizadas ou importe um Molde 3D. Salve com um nome para utilizá-lo nas missões.
            </p>
            <AvatarCustomizationModal 
              key="monster-modal"
              isOpen={true} 
              onClose={() => {}} 
              isAdmin={true} 
              inline={true} 
              customSaveMode={true} 
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
