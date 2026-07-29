import { useState } from 'react';
import { createPortal } from 'react-dom';
import { type GachaConfig, type ItemAdd, type AttributeType, DEFAULT_GACHA_CONFIG, ATTRIBUTE_LABELS } from '../lib/gacha';
import { RotateCcw, X, Plus, Trash2 } from 'lucide-react';
import { useDialog } from '../contexts/DialogContext';

interface GachaConfigModalProps {
  itemData: {
    title: string;
    description: string;
    imageUrl?: string;
  };
  initialConfig?: GachaConfig;
  initialFixed?: ItemAdd[];
  initialUseGlobal?: boolean;
  globalConfig?: GachaConfig | null;
  onSave: (config: GachaConfig, fixed: ItemAdd[], globalConfig: GachaConfig | null, useGlobal: boolean) => void;
  onClose: () => void;
}

export default function GachaConfigModal({ itemData, initialConfig, initialFixed, initialUseGlobal, globalConfig, onSave, onClose }: GachaConfigModalProps) {
  const { showConfirm } = useDialog();
  const [config, setConfig] = useState<GachaConfig>(initialConfig || JSON.parse(JSON.stringify(DEFAULT_GACHA_CONFIG)));
  const [globalCfg, setGlobalCfg] = useState<GachaConfig>(globalConfig || JSON.parse(JSON.stringify(DEFAULT_GACHA_CONFIG)));
  const [fixedAttributes, setFixedAttributes] = useState<ItemAdd[]>(initialFixed || []);
  const [useGlobal, setUseGlobal] = useState(initialUseGlobal ?? true);
  const [activeTab, setActiveTab] = useState<'fixed' | 'rng' | 'global'>('fixed');

  const handleRestoreDefault = async (isGlobalTab: boolean) => {
    if (await showConfirm('Tem certeza que deseja restaurar as configurações padrão de RNG?')) {
      if (isGlobalTab) {
        setGlobalCfg(JSON.parse(JSON.stringify(DEFAULT_GACHA_CONFIG)));
      } else {
        setConfig(JSON.parse(JSON.stringify(DEFAULT_GACHA_CONFIG)));
      }
    }
  };

  const handleAddFixedAttribute = () => {
    if (fixedAttributes.length >= 4) return;
    setFixedAttributes([...fixedAttributes, { type: 'attack', value: 1 }]);
  };

  const handleUpdateFixedAttribute = (index: number, field: keyof ItemAdd, value: any) => {
    const updated = [...fixedAttributes];
    updated[index] = { ...updated[index], [field]: value };
    setFixedAttributes(updated);
  };

  const handleRemoveFixedAttribute = (index: number) => {
    const updated = [...fixedAttributes];
    updated.splice(index, 1);
    setFixedAttributes(updated);
  };

  const renderRngEditor = (cfg: GachaConfig, setCfg: (newCfg: GachaConfig) => void, isGlobalTab: boolean) => (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: 0, maxWidth: '70%' }}>
          {isGlobalTab 
            ? "Ajuste as chances do atributo padrão. Isso afeta TODOS os itens novos ou itens configurados para usar o RNG Global."
            : "Ajuste as chances de drop APENAS para este item específico."}
        </p>
        <button onClick={() => handleRestoreDefault(isGlobalTab)} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', background: 'rgba(255,255,255,0.05)', color: 'white', border: '1px solid var(--border-glass)', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem' }}>
          <RotateCcw size={16} /> Restaurar Padrões
        </button>
      </div>

      {!isGlobalTab && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', background: 'rgba(59, 130, 246, 0.1)', border: '1px solid #3b82f6', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem' }}>
          <input type="checkbox" id="useGlobalToggle" checked={!useGlobal} onChange={(e) => setUseGlobal(!e.target.checked)} style={{ width: '20px', height: '20px', cursor: 'pointer' }} />
          <label htmlFor="useGlobalToggle" style={{ color: 'white', cursor: 'pointer', flex: 1 }}>
            <strong>Ativar RNG Específico para este item</strong><br />
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Se desmarcado, este item usará as configurações da aba "RNG Global".</span>
          </label>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1.5rem', opacity: (!isGlobalTab && useGlobal) ? 0.4 : 1, pointerEvents: (!isGlobalTab && useGlobal) ? 'none' : 'auto' }}>
        {Object.keys(cfg.chances).map((attrKey) => {
          const key = attrKey as keyof typeof cfg.chances;
          const label = ATTRIBUTE_LABELS[key as AttributeType];
          return (
            <div key={key} style={{ background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span style={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>{label.icon} {label.label}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Chance de Sorteio:</span>
                  <input 
                    type="number" 
                    min="0" max="100" step="0.1" 
                    value={Number((cfg.chances[key] * 100).toFixed(2))} 
                    onChange={(e) => setCfg({ ...cfg, chances: { ...cfg.chances, [key]: (parseFloat(e.target.value) || 0) / 100 } })}
                    style={{ width: '70px', padding: '0.3rem', borderRadius: '4px', background: 'rgba(0,0,0,0.5)', color: 'var(--gold-primary)', border: '1px solid var(--border-glass)', textAlign: 'right' }} 
                  /> %
                </div>
              </div>
              
              <div style={{ marginTop: '0.5rem', padding: '0.75rem', background: 'rgba(0,0,0,0.3)', borderRadius: '6px' }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Forças Possíveis (Pesos de probabilidade para os valores):</div>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {cfg.weights[key].map((w, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', background: 'rgba(255,255,255,0.05)', padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.8rem' }}>
                      <span>+{w.value}</span>
                      <span style={{ color: 'var(--text-secondary)' }}>|</span>
                      <input 
                        type="number" 
                        value={w.weight} 
                        onChange={(e) => {
                          const updatedWeights = [...cfg.weights[key]];
                          updatedWeights[i] = { ...updatedWeights[i], weight: parseFloat(e.target.value) || 0 };
                          setCfg({ ...cfg, weights: { ...cfg.weights, [key]: updatedWeights } });
                        }}
                        style={{ width: '40px', padding: '0.1rem', background: 'transparent', border: 'none', borderBottom: '1px solid var(--text-secondary)', color: 'white', textAlign: 'center', fontSize: '0.8rem' }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }}>
      <div className="glass-panel" style={{ width: '800px', maxWidth: '95vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column', animation: 'fadeIn 0.2s ease-out' }}>
        
        {/* Header (Item Info) */}
        <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-glass)', display: 'flex', gap: '1rem', alignItems: 'center', background: 'rgba(0,0,0,0.3)' }}>
          <div style={{ width: '60px', height: '60px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border-glass)' }}>
            {itemData.imageUrl ? <img src={itemData.imageUrl} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} /> : '📦'}
          </div>
          <div style={{ flex: 1 }}>
            <h3 style={{ margin: '0 0 0.25rem 0', color: 'var(--gold-primary)', fontSize: '1.25rem' }}>{itemData.title || 'Novo Item'}</h3>
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{itemData.description || 'Sem descrição'}</p>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}><X size={24} /></button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border-glass)' }}>
          <button 
            onClick={() => setActiveTab('fixed')}
            style={{ flex: 1, padding: '1rem', background: activeTab === 'fixed' ? 'rgba(251, 191, 36, 0.1)' : 'transparent', border: 'none', borderBottom: activeTab === 'fixed' ? '2px solid var(--gold-primary)' : '2px solid transparent', color: activeTab === 'fixed' ? 'var(--gold-primary)' : 'var(--text-secondary)', fontWeight: 'bold', cursor: 'pointer' }}>
            Atributos Fixos (Garantidos)
          </button>
          <button 
            onClick={() => setActiveTab('rng')}
            style={{ flex: 1, padding: '1rem', background: activeTab === 'rng' ? 'rgba(251, 191, 36, 0.1)' : 'transparent', border: 'none', borderBottom: activeTab === 'rng' ? '2px solid var(--gold-primary)' : '2px solid transparent', color: activeTab === 'rng' ? 'var(--gold-primary)' : 'var(--text-secondary)', fontWeight: 'bold', cursor: 'pointer' }}>
            RNG Específico
          </button>
          <button 
            onClick={() => setActiveTab('global')}
            style={{ flex: 1, padding: '1rem', background: activeTab === 'global' ? 'rgba(251, 191, 36, 0.1)' : 'transparent', border: 'none', borderBottom: activeTab === 'global' ? '2px solid var(--gold-primary)' : '2px solid transparent', color: activeTab === 'global' ? 'var(--gold-primary)' : 'var(--text-secondary)', fontWeight: 'bold', cursor: 'pointer' }}>
            RNG Global (Padrão)
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '2rem' }}>
          
          {activeTab === 'fixed' && (
            <div>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
                Atributos fixos ignoram totalmente o sistema de sorteio (RNG). Se um item tiver pelo menos 1 atributo fixo configurado, ele será gerado <b>apenas</b> com esses atributos exatos (limite de 4).
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {fixedAttributes.map((attr, index) => (
                  <div key={index} style={{ display: 'flex', gap: '1rem', alignItems: 'center', background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <div style={{ flex: 2 }}>
                      <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Atributo</label>
                      <select value={attr.type} onChange={e => handleUpdateFixedAttribute(index, 'type', e.target.value)} style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', background: 'rgba(0,0,0,0.5)', color: 'white', border: '1px solid var(--border-glass)' }}>
                        {Object.entries(ATTRIBUTE_LABELS).filter(([k]) => k !== 'none').map(([key, val]) => (
                          <option key={key} value={key}>{val.icon} {val.label}</option>
                        ))}
                      </select>
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Valor (+X)</label>
                      <input type="number" min="1" value={attr.value} onChange={e => handleUpdateFixedAttribute(index, 'value', parseInt(e.target.value) || 1)} style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', background: 'rgba(0,0,0,0.5)', color: 'white', border: '1px solid var(--border-glass)' }} />
                    </div>
                    <button onClick={() => handleRemoveFixedAttribute(index)} style={{ marginTop: '1.2rem', padding: '0.5rem', background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.4)', borderRadius: '4px', cursor: 'pointer' }}>
                      <Trash2 size={18} />
                    </button>
                  </div>
                ))}
              </div>

              {fixedAttributes.length < 4 && (
                <button onClick={handleAddFixedAttribute} style={{ marginTop: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1rem', background: 'rgba(59, 130, 246, 0.2)', color: '#60a5fa', border: '1px solid #3b82f6', borderRadius: '8px', cursor: 'pointer' }}>
                  <Plus size={18} /> Adicionar Atributo Fixo ({fixedAttributes.length}/4)
                </button>
              )}
            </div>
          )}

          {activeTab === 'rng' && renderRngEditor(config, setConfig, false)}
          {activeTab === 'global' && renderRngEditor(globalCfg, setGlobalCfg, true)}
        </div>

        {/* Footer */}
        <div style={{ padding: '1.5rem', borderTop: '1px solid var(--border-glass)', display: 'flex', justifyContent: 'flex-end', gap: '1rem', background: 'rgba(0,0,0,0.3)' }}>
          <button onClick={onClose} style={{ background: 'transparent', border: '1px solid var(--border-glass)', color: 'white', padding: '0.75rem 1.5rem', borderRadius: '8px', cursor: 'pointer' }}>Cancelar</button>
          <button onClick={() => onSave(config, fixedAttributes, globalCfg, useGlobal)} className="login-btn" style={{ padding: '0.75rem 1.5rem', background: 'var(--gold-primary)', color: 'black', border: 'none' }}>Salvar Configurações</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
