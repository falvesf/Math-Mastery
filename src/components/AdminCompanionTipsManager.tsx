import { useState, useEffect } from 'react';
import { MessageCircle, Plus, Trash2, Save, RotateCcw } from 'lucide-react';
import { useDialog } from '../contexts/DialogContext';
import { COMPANION_TIPS, fetchCompanionTips, saveCompanionTips, type CompanionTip } from '../lib/companionTips';

const KNOWN_TABS = [
  { value: 'quests', label: 'Central de Missões' },
  { value: 'inventory', label: 'Mochila' },
  { value: 'ranking_class', label: 'Ranking da Turma' },
  { value: 'ranking_general', label: 'Ranking Geral' },
  { value: 'store', label: 'Loja' },
];

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.5rem',
  borderRadius: '6px',
  background: 'var(--bg-dark)',
  border: '1px solid var(--border-glass)',
  color: 'var(--text-primary)',
  fontFamily: 'inherit',
  fontSize: '0.85rem',
};

export default function AdminCompanionTipsManager() {
  const { showAlert, showConfirm } = useDialog();
  const [tips, setTips] = useState<CompanionTip[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const loaded = await fetchCompanionTips();
    setTips(loaded.map(t => ({ ...t, lines: [...t.lines] })));
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const updateTip = (id: string, patch: Partial<CompanionTip>) => {
    setTips(prev => prev.map(t => (t.id === id ? { ...t, ...patch } : t)));
  };

  const updateLine = (id: string, lineIndex: number, value: string) => {
    setTips(prev => prev.map(t => {
      if (t.id !== id) return t;
      const lines = [...t.lines];
      while (lines.length < 3) lines.push('');
      lines[lineIndex] = value;
      return { ...t, lines };
    }));
  };

  const toggleTab = (id: string, tab: string) => {
    setTips(prev => prev.map(t => {
      if (t.id !== id) return t;
      const seen = t.seenOnTabs || [];
      const has = seen.includes(tab);
      return { ...t, seenOnTabs: has ? seen.filter(s => s !== tab) : [...seen, tab] };
    }));
  };

  const addTip = () => {
    setTips(prev => [...prev, { id: `dica_${Date.now()}`, lines: ['', '', ''], priority: (prev.length + 1) * 10 }]);
  };

  const removeTip = async (id: string) => {
    const confirmed = await showConfirm('Remover esta dica?');
    if (!confirmed) return;
    setTips(prev => prev.filter(t => t.id !== id));
  };

  const resetToDefault = async () => {
    const confirmed = await showConfirm('Restaurar as dicas padrão do sistema? Isso substitui as atuais.');
    if (!confirmed) return;
    setTips(COMPANION_TIPS.map(t => ({ ...t, lines: [...t.lines] })));
  };

  // Ordenar por prioridade (menor primeiro), como no jogo
  const sortedTips = [...tips].sort((a, b) => (a.priority || 100) - (b.priority || 100));

  const handleSave = async () => {
    const clean = tips
      .map(t => ({
        ...t,
        id: (t.id || '').trim() || `dica_${Date.now()}`,
        lines: (t.lines || []).map(l => (l || '').trim()).filter(l => l !== ''),
        seenOnTabs: t.seenOnTabs || [],
        priority: typeof t.priority === 'number' ? t.priority : 100,
      }))
      .filter(t => t.lines.length > 0);

    if (clean.length === 0) {
      showAlert('Erro', 'Adicione ao menos uma dica com texto antes de salvar.');
      return;
    }

    const ids = clean.map(t => t.id);
    if (new Set(ids).size !== ids.length) {
      showAlert('Erro', 'Existem ids de dicas duplicados. Cada dica precisa de um id único.');
      return;
    }

    setSaving(true);
    const ok = await saveCompanionTips(clean);
    setSaving(false);
    if (ok) {
      showAlert('Sucesso', 'Dicas do companheiro salvas!');
      setTips(clean);
    } else {
      showAlert('Erro', 'Não foi possível salvar as dicas. Verifique o console.');
    }
  };

  if (loading) {
    return <p style={{ color: 'var(--text-secondary)' }}>Carregando dicas...</p>;
  }

  return (
    <div>
      <div style={{ marginBottom: '1rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
        Edite as falas do personagem que dão dicas aos iniciantes. Cada balão mostra no máximo <strong>3 linhas</strong>; se o texto for maior, quebre em várias linhas (o balão troca de linha automaticamente). Essas dicas valem para todas as escolas.
      </div>

      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <button onClick={addTip} className="login-btn" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 1rem', fontSize: '0.9rem', background: 'rgba(16, 185, 129, 0.2)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.4)' }}>
          <Plus size={16} /> Nova Dica
        </button>
        <button onClick={resetToDefault} className="login-btn" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 1rem', fontSize: '0.9rem', background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border-glass)' }}>
          <RotateCcw size={16} /> Restaurar Padrão
        </button>
        <button onClick={handleSave} className="login-btn" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 1.2rem', fontSize: '0.9rem', background: 'var(--gold-primary)', color: 'var(--text-on-gold, #000000)', border: 'none', fontWeight: 'bold', marginLeft: 'auto' }}>
          <Save size={16} /> {saving ? 'Salvando...' : 'Salvar Dicas'}
        </button>
      </div>

      {sortedTips.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>Nenhuma dica cadastrada. Clique em "Nova Dica" para começar.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {sortedTips.map(tip => (
            <div key={tip.id} style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-glass)', borderRadius: '12px', padding: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1 }}>
                  <MessageCircle size={18} color="var(--gold-primary)" />
                  <input
                    value={tip.id}
                    onChange={e => updateTip(tip.id, { id: e.target.value })}
                    placeholder="Id da dica (ex: quests)"
                    style={{ ...inputStyle, maxWidth: '220px', fontWeight: 'bold' }}
                  />
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Prioridade:</span>
                    <input
                      type="number"
                      value={tip.priority}
                      onChange={e => updateTip(tip.id, { priority: parseInt(e.target.value) || 100 })}
                      style={{ ...inputStyle, width: '70px' }}
                    />
                  </div>
                </div>
                <button onClick={() => removeTip(tip.id)} style={{ background: 'transparent', border: 'none', color: 'var(--accent-red)', cursor: 'pointer', padding: '0.25rem' }} title="Remover dica">
                  <Trash2 size={16} />
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.5rem', marginBottom: '0.75rem' }}>
                {[0, 1, 2].map(lineIdx => (
                  <input
                    key={lineIdx}
                    value={tip.lines[lineIdx] || ''}
                    onChange={e => updateLine(tip.id, lineIdx, e.target.value)}
                    placeholder={`Linha ${lineIdx + 1}${lineIdx === 0 ? ' (primeira fala)' : ''}`}
                    style={inputStyle}
                  />
                ))}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Para de falar quando o aluno acessar:</span>
                {KNOWN_TABS.map(tab => {
                  const checked = (tip.seenOnTabs || []).includes(tab.value);
                  return (
                    <label key={tab.value} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.8rem', color: 'var(--text-primary)', cursor: 'pointer' }}>
                      <input type="checkbox" checked={checked} onChange={() => toggleTab(tip.id, tab.value)} />
                      {tab.label}
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}