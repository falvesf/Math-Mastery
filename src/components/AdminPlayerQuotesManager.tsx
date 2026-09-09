import React, { useState, useEffect } from 'react';
import { 
  MessageSquare, 
  Sparkles, 
  ShieldAlert, 
  Trophy, 
  Sliders, 
  Plus, 
  Trash2, 
  Save, 
  RotateCcw, 
  HelpCircle,
  Volume2
} from 'lucide-react';
import type { PlayerBattleQuotes } from '../lib/playerQuotes';
import { 
  DEFAULT_PLAYER_BATTLE_QUOTES, 
  fetchPlayerBattleQuotes, 
  savePlayerBattleQuotes 
} from '../lib/playerQuotes';
import { useTenant } from '../contexts/TenantContext';

// @ts-ignore
void HelpCircle;
// @ts-ignore
void Volume2;

export const AdminPlayerQuotesManager: React.FC = () => {
  const { tenantId } = useTenant();
  const [quotes, setQuotes] = useState<PlayerBattleQuotes>(DEFAULT_PLAYER_BATTLE_QUOTES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [activeTab, setActiveTab] = useState<'hp' | 'stress' | 'events' | 'rates'>('hp');

  // Input temporário para adicionar frase em cada lista
  // @ts-ignore
  const [newQuoteInput, setNewQuoteInput] = useState<{ [key: string]: string }>({});
  // @ts-ignore
  void newQuoteInput;
  // @ts-ignore
  void setNewQuoteInput;

  useEffect(() => {
    loadQuotes();
  }, [tenantId]);

  const loadQuotes = async () => {
    setLoading(true);
    try {
      const data = await fetchPlayerBattleQuotes(tenantId);
      setQuotes(data);
    } catch (err) {
      console.error('Erro ao carregar falas de batalha:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateQuote = (path: string[], index: number, value: string) => {
    setQuotes(prev => {
      const clone = JSON.parse(JSON.stringify(prev));
      let target = clone;
      for (let i = 0; i < path.length - 1; i++) {
        target = target[path[i]];
      }
      const listKey = path[path.length - 1];
      if (Array.isArray(target[listKey])) {
        target[listKey][index] = value;
      }
      return clone;
    });
  };

  const handleAddQuoteLine = (path: string[]) => {
    setQuotes(prev => {
      const clone = JSON.parse(JSON.stringify(prev));
      let target = clone;
      for (let i = 0; i < path.length - 1; i++) {
        target = target[path[i]];
      }
      const listKey = path[path.length - 1];
      if (Array.isArray(target[listKey])) {
        target[listKey].push('');
      }
      return clone;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const cleanList = (arr: string[]) => (arr || []).map(s => (s || '').trim()).filter(Boolean);
      const cleanQuotes: PlayerBattleQuotes = {
        speechChance: typeof quotes.speechChance === 'number' ? quotes.speechChance : 25,
        stressModeWeight: typeof quotes.stressModeWeight === 'number' ? quotes.stressModeWeight : 50,
        byHp: {
          hp100_80: cleanList(quotes.byHp?.hp100_80),
          hp79_50: cleanList(quotes.byHp?.hp79_50),
          hp49_25: cleanList(quotes.byHp?.hp49_25),
          hp24_0: cleanList(quotes.byHp?.hp24_0),
        },
        byStress: {
          easy: cleanList(quotes.byStress?.easy),
          tense: cleanList(quotes.byStress?.tense),
          epic: cleanList(quotes.byStress?.epic),
        },
        events: {
          criticalHit: cleanList(quotes.events?.criticalHit),
          hurt: cleanList(quotes.events?.hurt),
          victory: cleanList(quotes.events?.victory),
        },
      };

      const success = await savePlayerBattleQuotes(tenantId, cleanQuotes);
      if (success) {
        setQuotes(cleanQuotes);
        setMessage({ text: 'Configurações de falas salvas com sucesso para esta escola!', type: 'success' });
        setTimeout(() => setMessage(null), 4000);
      } else {
        setMessage({ text: 'Falha ao salvar falas no banco de dados.', type: 'error' });
      }
    } catch (err: any) {
      setMessage({ text: `Erro: ${err?.message || 'Falha ao salvar'}`, type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (window.confirm('Deseja restaurar todas as falas de batalha para o padrão de fábrica? Todas as customizações não salvas serão perdidas.')) {
      setQuotes(JSON.parse(JSON.stringify(DEFAULT_PLAYER_BATTLE_QUOTES)));
    }
  };

  const handleRemoveQuote = (path: string[], index: number) => {
    setQuotes(prev => {
      const clone = JSON.parse(JSON.stringify(prev));
      let target = clone;
      for (let i = 0; i < path.length - 1; i++) {
        target = target[path[i]];
      }
      const listKey = path[path.length - 1];
      if (Array.isArray(target[listKey])) {
        target[listKey].splice(index, 1);
      }
      return clone;
    });
  };

  const renderQuoteList = (
    title: string, 
    path: string[], 
    subtitle?: string, 
    accentColor: string = '#3b82f6'
  ) => {
    let currentList: string[] = [];
    let target: any = quotes;
    for (const p of path) {
      if (target && target[p] !== undefined) {
        target = target[p];
      }
    }
    if (Array.isArray(target)) {
      currentList = target;
    }

    return (
      <div style={{
        background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.6) 0%, rgba(15, 23, 42, 0.8) 100%)',
        border: '1px solid var(--border-glass)',
        borderRadius: '14px',
        padding: '1.25rem',
        boxShadow: '0 6px 20px rgba(0, 0, 0, 0.25)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        gap: '0.85rem',
      }}>
        <div>
          {/* Header do Grupo */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
            <h4 style={{
              margin: 0,
              fontSize: '0.95rem',
              fontWeight: 700,
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-body)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}>
              <span style={{
                fontSize: '0.75rem',
                fontWeight: 800,
                padding: '0.15rem 0.5rem',
                borderRadius: '6px',
                background: `${accentColor}20`,
                color: accentColor,
                border: `1px solid ${accentColor}40`,
              }}>
                {currentList.length}
              </span>
              {title}
            </h4>
          </div>

          {subtitle && (
            <p style={{ margin: '0 0 0.85rem 0', fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
              {subtitle}
            </p>
          )}

          {/* Lista de Falas Editáveis Diretamente como na Guia Tutorial */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem',
            maxHeight: '280px',
            overflowY: 'auto',
            paddingRight: '0.35rem',
          }}>
            {currentList.length === 0 ? (
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontStyle: 'italic', textAlign: 'center', padding: '1rem 0' }}>
                Nenhuma fala cadastrada. Clique abaixo para adicionar.
              </p>
            ) : (
              currentList.map((item, idx) => (
                <div 
                  key={idx} 
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.45rem',
                  }}
                >
                  <input
                    type="text"
                    value={item}
                    onChange={(e) => handleUpdateQuote(path, idx, e.target.value)}
                    placeholder="Escreva a fala do herói..."
                    style={{
                      flex: 1,
                      padding: '0.55rem 0.8rem',
                      borderRadius: '8px',
                      background: 'rgba(15, 23, 42, 0.85)',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      color: 'var(--text-primary)',
                      fontFamily: 'inherit',
                      fontSize: '0.85rem',
                      outline: 'none',
                      transition: 'border-color 0.2s, box-shadow 0.2s',
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = accentColor;
                      e.currentTarget.style.boxShadow = `0 0 0 2px ${accentColor}30`;
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.12)';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveQuote(path, idx)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text-secondary)',
                      cursor: 'pointer',
                      padding: '0.4rem',
                      borderRadius: '6px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = '#ef4444';
                      e.currentTarget.style.background = 'rgba(239, 68, 68, 0.15)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = 'var(--text-secondary)';
                      e.currentTarget.style.background = 'transparent';
                    }}
                    title="Remover fala"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Botão de Adicionar Nova Linha de Fala Livre */}
        <div style={{
          display: 'flex',
          justifyContent: 'flex-start',
          paddingTop: '0.65rem',
          borderTop: '1px solid rgba(255, 255, 255, 0.06)',
        }}>
          <button
            type="button"
            onClick={() => handleAddQuoteLine(path)}
            style={{
              padding: '0.45rem 0.9rem',
              borderRadius: '8px',
              background: `${accentColor}18`,
              color: accentColor,
              border: `1px dashed ${accentColor}60`,
              fontSize: '0.8rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = `${accentColor}30`;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = `${accentColor}18`;
            }}
          >
            <Plus size={14} />
            Nova Fala
          </button>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
        <p>Carregando falas de combate...</p>
      </div>
    );
  }

  const tabOptions = [
    { id: 'hp', label: 'Por Vida / HP', icon: <ShieldAlert size={15} color="#10b981" />, accent: '#10b981' },
    { id: 'stress', label: 'Por Tensão / Estresse', icon: <Sparkles size={15} color="#c084fc" />, accent: '#c084fc' },
    { id: 'events', label: 'Eventos de Batalha', icon: <Trophy size={15} color="#fbbf24" />, accent: '#fbbf24' },
    { id: 'rates', label: 'Chances & Frequência', icon: <Sliders size={15} color="#06b6d4" />, accent: '#06b6d4' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%', paddingTop: '0.5rem' }}>
      {/* Barra de Ações Superior com Estilo Glassmorphism */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.85) 100%)',
        border: '1px solid var(--border-glass)',
        borderRadius: '16px',
        padding: '1.25rem 1.75rem',
        boxShadow: '0 8px 30px rgba(0, 0, 0, 0.35)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '1rem',
      }}>
        <div>
          <h3 style={{
            margin: 0,
            fontSize: '1.3rem',
            fontWeight: 800,
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-body)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}>
            <MessageSquare size={20} color="var(--gold-primary)" />
            Falas do Personagem em Combate
          </h3>
          <p style={{
            margin: '0.25rem 0 0 0',
            fontSize: '0.82rem',
            color: 'var(--text-secondary)',
            maxWidth: '620px',
            lineHeight: 1.45,
          }}>
            Configure as frases que o herói expressa dinamicamente durante as missões. As falas reagem ao HP atual, nível de tensão/estresse da batalha e momentos decisivos (crítico, dano sofrido e vitória).
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button
            onClick={handleReset}
            type="button"
            style={{
              padding: '0.55rem 1rem',
              borderRadius: '10px',
              border: '1px solid var(--border-glass)',
              background: 'rgba(255, 255, 255, 0.05)',
              color: 'var(--text-secondary)',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              transition: 'all 0.2s',
            }}
          >
            <RotateCcw size={14} />
            Padrão
          </button>

          <button
            onClick={handleSave}
            disabled={saving}
            type="button"
            style={{
              padding: '0.6rem 1.35rem',
              borderRadius: '10px',
              border: 'none',
              background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
              color: '#0f172a',
              fontSize: '0.82rem',
              fontWeight: 800,
              cursor: saving ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              boxShadow: '0 4px 14px rgba(245, 158, 11, 0.35)',
              opacity: saving ? 0.6 : 1,
              transition: 'all 0.2s',
            }}
          >
            <Save size={15} />
            {saving ? 'Salvando...' : 'Salvar Alterações'}
          </button>
        </div>
      </div>

      {message && (
        <div style={{
          padding: '0.75rem 1.25rem',
          borderRadius: '10px',
          fontSize: '0.85rem',
          fontWeight: 600,
          border: message.type === 'success' ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid rgba(239, 68, 68, 0.4)',
          background: message.type === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
          color: message.type === 'success' ? '#34d399' : '#f87171',
        }}>
          {message.text}
        </div>
      )}

      {/* Navegação de Abas */}
      <div style={{
        display: 'flex',
        gap: '0.5rem',
        borderBottom: '1px solid var(--border-glass)',
        paddingBottom: '0.5rem',
        flexWrap: 'wrap',
      }}>
        {tabOptions.map(tab => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              style={{
                padding: '0.6rem 1.15rem',
                borderRadius: '10px',
                fontSize: '0.82rem',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: '0.45rem',
                cursor: 'pointer',
                border: isActive ? `1px solid ${tab.accent}60` : '1px solid transparent',
                background: isActive ? `${tab.accent}20` : 'transparent',
                color: isActive ? tab.accent : 'var(--text-secondary)',
                boxShadow: isActive ? `0 4px 12px ${tab.accent}25` : 'none',
                transition: 'all 0.2s',
              }}
            >
              {tab.icon}
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Conteúdo da Aba HP */}
      {activeTab === 'hp' && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))',
          gap: '1.25rem',
        }}>
          {renderQuoteList('HP Pleno (100% - 80%)', ['byHp', 'hp100_80'], 'Quando o herói está cheio de energia e confiante.', '#10b981')}
          {renderQuoteList('HP Alto (79% - 50%)', ['byHp', 'hp79_50'], 'Foco total mantendo o ritmo da luta.', '#3b82f6')}
          {renderQuoteList('HP Médio (49% - 25%)', ['byHp', 'hp49_25'], 'Sentindo a pressão dos ataques do monstro.', '#f59e0b')}
          {renderQuoteList('HP Crítico (< 25%)', ['byHp', 'hp24_0'], 'Perigo iminente de derrota e desespero.', '#ef4444')}
        </div>
      )}

      {/* Conteúdo da Aba Estresse */}
      {activeTab === 'stress' && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))',
          gap: '1.25rem',
        }}>
          {renderQuoteList('Luta Tranquila (Estresse Baixo)', ['byStress', 'easy'], 'Vantagem confortável sobre o monstro.', '#14b8a6')}
          {renderQuoteList('Luta Tensa (Estresse Médio)', ['byStress', 'tense'], 'Disputa acirrada, exige precisão matemática.', '#f97316')}
          {renderQuoteList('Luta Épica (Estresse Alto)', ['byStress', 'epic'], 'Ambos em perigo crítico ou momento decisivo.', '#a855f7')}
        </div>
      )}

      {/* Conteúdo da Aba Eventos */}
      {activeTab === 'events' && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))',
          gap: '1.25rem',
        }}>
          {renderQuoteList('Ao Acertar Crítico', ['events', 'criticalHit'], 'Disparado ao acertar um golpe devastador.', '#eab308')}
          {renderQuoteList('Ao Sofrer Dano', ['events', 'hurt'], 'Reação imediata ao receber um ataque.', '#f43f5e')}
          {renderQuoteList('Vitória na Missão', ['events', 'victory'], 'Comemoração final ao derrotar o monstro.', '#6366f1')}
        </div>
      )}

      {/* Conteúdo da Aba Chances & Frequência */}
      {activeTab === 'rates' && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.6) 0%, rgba(15, 23, 42, 0.8) 100%)',
          border: '1px solid var(--border-glass)',
          borderRadius: '16px',
          padding: '1.75rem',
          maxWidth: '680px',
          boxShadow: '0 8px 30px rgba(0, 0, 0, 0.35)',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.75rem',
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            paddingBottom: '0.85rem',
            borderBottom: '1px solid var(--border-glass)',
          }}>
            <Sliders size={20} color="var(--gold-primary)" />
            <h4 style={{
              margin: 0,
              fontSize: '1.1rem',
              fontWeight: 800,
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-body)',
            }}>
              Parâmetros de Disparo em Combate
            </h4>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Chance Geral de Fala por Ação
                </span>
                <span style={{
                  fontSize: '0.85rem',
                  fontWeight: 800,
                  color: 'var(--gold-primary)',
                  padding: '0.2rem 0.6rem',
                  borderRadius: '6px',
                  background: 'rgba(245, 158, 11, 0.15)',
                  border: '1px solid rgba(245, 158, 11, 0.3)',
                }}>
                  {quotes.speechChance ?? 25}%
                </span>
              </div>
              <input
                type="range"
                min="5"
                max="100"
                step="5"
                value={quotes.speechChance ?? 25}
                onChange={(e) => setQuotes(prev => ({ ...prev, speechChance: parseInt(e.target.value) || 25 }))}
                style={{
                  width: '100%',
                  accentColor: 'var(--gold-primary)',
                  cursor: 'pointer',
                  height: '6px',
                  borderRadius: '4px',
                }}
              />
              <p style={{ margin: '0.35rem 0 0 0', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                Probabilidade do balão de fala aparecer ao longo dos turnos normais de batalha.
              </p>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Peso do Fator Estresse vs Fator HP
                </span>
                <span style={{
                  fontSize: '0.85rem',
                  fontWeight: 800,
                  color: '#06b6d4',
                  padding: '0.2rem 0.6rem',
                  borderRadius: '6px',
                  background: 'rgba(6, 182, 212, 0.15)',
                  border: '1px solid rgba(6, 182, 212, 0.3)',
                }}>
                  {quotes.stressModeWeight ?? 50}%
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="10"
                value={quotes.stressModeWeight ?? 50}
                onChange={(e) => setQuotes(prev => ({ ...prev, stressModeWeight: parseInt(e.target.value) || 50 }))}
                style={{
                  width: '100%',
                  accentColor: '#06b6d4',
                  cursor: 'pointer',
                  height: '6px',
                  borderRadius: '4px',
                }}
              />
              <p style={{ margin: '0.35rem 0 0 0', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                0% = escolhe falas baseando-se puramente no HP restante do jogador. 100% = prioriza o cálculo dinâmico de estresse e perigo do combate.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
