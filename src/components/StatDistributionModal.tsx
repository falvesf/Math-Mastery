import { useState, useEffect } from 'react';
import { X, Save, Plus, Minus } from 'lucide-react';
import { ATTRIBUTE_LABELS } from '../lib/gacha';
import { supabase } from '../lib/supabase';
import { RANKS, getRankForXp } from '../lib/ranks';
import { useAuth } from '../contexts/AuthContext';

interface StatDistributionModalProps {
  isOpen: boolean;
  onClose: () => void;
  userData: any;
}

const ATTRIBUTE_DESCRIPTIONS: Record<string, string> = {
  attack: "Aumenta o dano causado em combates, missões e chefões.",
  defense: "Reduz o dano recebido ao errar questões ou sofrer ataques.",
  xp: "Aumenta a quantidade de XP ganho em todas as atividades.",
  coins: "Aumenta a quantidade de Moedas ganhas nas atividades.",
  vitality: "A cada certos pontos de vitalidade, aumenta permanentemente suas vidas (HP) máximas.",
  fortitude: "Aumenta a quantidade máxima de slots (espaço) disponíveis na sua mochila.",
  persuasion: "Melhora o valor de revenda dos itens e pode gerar benefícios no mercado."
};

export default function StatDistributionModal({ isOpen, onClose, userData }: StatDistributionModalProps) {
  const [pendingStats, setPendingStats] = useState<Record<string, number>>({});
  const { updateUserDataLocally } = useAuth();
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setPendingStats({});
    }
  }, [isOpen]);

  if (!isOpen || !userData) return null;

  const currentRank = getRankForXp(userData.xp || 0, userData.classId);
  const currentRankIndex = Math.max(0, RANKS.findIndex(r => r.name === currentRank.name));
  
  const totalEarnedPoints = currentRankIndex * 4;
  
  const confirmedStats = userData.distributedStats || {};
  const totalConfirmedPoints = Object.values(confirmedStats).reduce((sum: any, val: any) => sum + (val || 0), 0) as number;
  
  const totalPendingPoints = Object.values(pendingStats).reduce((sum, val) => sum + val, 0);
  
  const unspentPoints = totalEarnedPoints - totalConfirmedPoints - totalPendingPoints;

  const handleAdd = (statKey: string) => {
    if (unspentPoints > 0) {
      setPendingStats(prev => ({
        ...prev,
        [statKey]: (prev[statKey] || 0) + 1
      }));
    }
  };

  const handleSub = (statKey: string) => {
    if (pendingStats[statKey] > 0) {
      setPendingStats(prev => ({
        ...prev,
        [statKey]: prev[statKey] - 1
      }));
    }
  };

  const handleSave = async () => {
    if (totalPendingPoints === 0) {
      onClose();
      return;
    }

    setIsSaving(true);
    try {
      const currentStats = { ...confirmedStats };
      
      Object.entries(pendingStats).forEach(([key, val]) => {
        if (val > 0) {
          currentStats[key] = (currentStats[key] || 0) + val;
        }
      });

      await supabase.from('users').update({ distributed_stats: currentStats }).eq('id', userData.uid);
      updateUserDataLocally({ distributedStats: currentStats });
      setPendingStats({});
      onClose();
    } catch (error) {
      console.error("Erro ao salvar distribuição de atributos:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const attributes = Object.keys(ATTRIBUTE_LABELS).filter(k => k !== 'none' && k !== 'xp' && k !== 'coins');

  return (
    <div className="modal-overlay">
      <div className="glass-panel modal-content modal-content-sm" style={{
        position: 'relative',
        borderRadius: '24px'
      }}>
        <button 
          onClick={onClose}
          style={{
            position: 'absolute', top: '1rem', right: '1rem',
            background: 'transparent', border: 'none', color: 'var(--text-secondary)',
            cursor: 'pointer'
          }}
          className="hover-brightness"
        >
          <X size={24} />
        </button>

        <h2 style={{ fontSize: '1.5rem', marginTop: 0, marginBottom: '0.5rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          Distribuição de Pontos
        </h2>
        
        <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.9rem', lineHeight: 1.4 }}>
          Você ganha <strong style={{color: 'var(--gold-primary)'}}>4 pontos</strong> a cada avanço de patente. Melhore os atributos que combinam com seu estilo de jogo.
        </p>

        <div style={{ 
          background: unspentPoints > 0 ? 'var(--bg-card)' : 'rgba(255, 255, 255, 0.05)', 
          border: unspentPoints > 0 ? '1px solid var(--gold-primary)' : '1px solid rgba(255, 255, 255, 0.1)', 
          padding: '1rem', 
          borderRadius: '12px', 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          marginBottom: '1.5rem',
          boxShadow: unspentPoints > 0 ? '0 0 15px rgba(251, 191, 36, 0.15)' : 'none'
        }}>
          <span style={{ fontSize: '1rem', color: 'var(--text-secondary)' }}>Pontos Disponíveis:</span>
          <span style={{ fontSize: '1.8rem', fontWeight: 'bold', color: unspentPoints > 0 ? 'var(--gold-primary)' : 'var(--text-primary)' }}>
            {unspentPoints}
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '40vh', overflowY: 'auto', paddingRight: '0.5rem' }}>
          {attributes.map(key => {
            const labelInfo = ATTRIBUTE_LABELS[key];
            const confirmedValue = confirmedStats[key] || 0;
            const pendingValue = pendingStats[key] || 0;
            const totalDisplayValue = confirmedValue + pendingValue;

            return (
              <div key={key} style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between',
                background: 'rgba(0,0,0,0.2)',
                padding: '0.75rem 1rem',
                borderRadius: '12px',
                border: pendingValue > 0 ? `1px solid var(--gold-primary)` : '1px solid transparent',
                transition: 'border-color 0.2s ease'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }} title={ATTRIBUTE_DESCRIPTIONS[key]}>
                  <span style={{ fontSize: '1.5rem', cursor: 'help' }}>{labelInfo.icon}</span>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ color: 'var(--text-primary)', fontWeight: 'bold', fontSize: '1rem', cursor: 'help' }}>{labelInfo.label}</span>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                      Atual: +{confirmedValue}{key === 'xp' || key === 'coins' ? '%' : ''}
                      {pendingValue > 0 && (
                        <span style={{ color: 'var(--gold-primary)', fontWeight: 'bold' }}>
                          {' '}» Novo: +{totalDisplayValue}{key === 'xp' || key === 'coins' ? '%' : ''}
                        </span>
                      )}
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <button
                    onClick={() => handleSub(key)}
                    disabled={pendingValue === 0}
                    style={{
                      width: '32px', height: '32px', borderRadius: '8px',
                      background: pendingValue === 0 ? 'rgba(255,255,255,0.05)' : 'var(--bg-card)',
                      border: '1px solid var(--border-glass)',
                      color: pendingValue === 0 ? 'var(--text-tertiary)' : 'var(--text-primary)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: pendingValue === 0 ? 'not-allowed' : 'pointer',
                      transition: 'all 0.2s'
                    }}
                  >
                    <Minus size={16} />
                  </button>

                  <span style={{ 
                    width: '40px', textAlign: 'center', fontSize: '1.2rem', fontWeight: 'bold',
                    color: pendingValue > 0 ? '#ffffff' : 'var(--text-primary)'
                  }}>
                    {pendingValue > 0 ? `+${pendingValue}` : 0}
                  </span>

                  <button
                    onClick={() => handleAdd(key)}
                    disabled={unspentPoints === 0}
                    style={{
                      width: '32px', height: '32px', borderRadius: '8px',
                      background: unspentPoints === 0 ? 'rgba(255,255,255,0.05)' : 'var(--bg-card)',
                      border: '1px solid var(--border-glass)',
                      color: unspentPoints === 0 ? 'var(--text-tertiary)' : 'var(--text-primary)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: unspentPoints === 0 ? 'not-allowed' : 'pointer',
                      transition: 'all 0.2s'
                    }}
                  >
                    <Plus size={16} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
          <button
            onClick={onClose}
            style={{
              padding: '0.75rem 1.5rem',
              borderRadius: '12px',
              border: 'none',
              background: 'rgba(255,255,255,0.05)',
              color: 'var(--text-primary)',
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
            className="hover-brightness"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={totalPendingPoints === 0 || isSaving}
            style={{
              padding: '0.75rem 1.5rem',
              borderRadius: '12px',
              border: 'none',
              background: totalPendingPoints === 0 ? 'rgba(255,255,255,0.1)' : 'var(--gold-primary)',
              color: totalPendingPoints === 0 ? 'var(--text-tertiary)' : '#ffffff',
              fontWeight: 'bold',
              cursor: totalPendingPoints === 0 ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              transition: 'all 0.2s ease'
            }}
            className={totalPendingPoints > 0 ? "hover-brightness glow-effect" : ""}
          >
            <Save size={18} />
            {isSaving ? 'Salvando...' : 'Confirmar Distribuição'}
          </button>
        </div>

      </div>
    </div>
  );
}
