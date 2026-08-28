import { useState, useEffect } from 'react';
import { Save, KeyRound, Cpu, PlugZap } from 'lucide-react';
import { getGrokConfig, saveGrokConfig, clearGrokConfigCache } from '../lib/aiConfig';
import { useDialog } from '../contexts/DialogContext';

export default function AiSettingsPanel() {
  const { showAlert } = useDialog();
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('openai/gpt-oss-120b');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    getGrokConfig().then(cfg => {
      if (cfg) { setApiKey(cfg.apiKey); setModel(cfg.model || 'grok-3-mini'); }
    });
  }, []);

  const handleSave = async () => {
    if (!apiKey.trim()) { showAlert('Cole a chave de API do Groq (começa com gsk_).'); return; }
    setSaving(true);
    const ok = await saveGrokConfig(apiKey.trim(), model);
    setSaving(false);
    if (ok) {
      clearGrokConfigCache();
      showAlert('Chave da IA salva! As missões sem descrição passarão a usar o Groq.');
    } else {
      showAlert('Erro ao salvar a chave.');
    }
  };

  const handleTest = async () => {
    const key = apiKey.trim() || (await getGrokConfig())?.apiKey || '';
    if (!key) { showAlert('Cole a chave primeiro (ou salve) para testar.'); return; }
    setTesting(true);
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: JSON.stringify({
          model: model || 'openai/gpt-oss-120b',
          messages: [{ role: 'user', content: 'Responda apenas: OK' }],
          max_tokens: 10,
        }),
      });
      if (res.ok) {
        const json = await res.json();
        showAlert(`Conexão OK! Modelo respondeu: "${(json?.choices?.[0]?.message?.content || '').trim()}"`);
      } else {
        const err = await res.text().catch(() => '');
        showAlert(`Erro ${res.status}: ${err.slice(0, 200)}`);
      }
    } catch (e: any) {
      showAlert(`Falha de conexão/CORS: ${e?.message || e}`);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="glass-panel" style={{ padding: '1.5rem', marginTop: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.5rem' }}>
        <Cpu size={20} color="var(--gold-primary)" />
        <h3 style={{ margin: 0, fontSize: '1.1rem' }}>IA das Missões (Groq/GPT)</h3>
      </div>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '0 0 1rem 0' }}>
        A chave fica numa tabela do Supabase e pode ser alterada a qualquer momento. As missões sem descrição manual usam essa IA para gerar o texto épico/pedagógico do card.
      </p>
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
        <div style={{ flex: '2 1 300px' }}>
          <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.8rem', marginBottom: '0.3rem' }}>
            <KeyRound size={12} style={{ marginRight: '0.25rem', verticalAlign: 'middle' }} /> Chave da API (Groq — começa com <code>gsk_</code>)
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder="gsk_..."
            style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontFamily: 'inherit' }}
          />
        </div>
        <div style={{ flex: '1 1 180px' }}>
          <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.8rem', marginBottom: '0.3rem' }}>Modelo</label>
          <select value={model} onChange={e => setModel(e.target.value)} style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)' }}>
            <option value="openai/gpt-oss-120b">GPT-OSS 120B (melhor qualidade)</option>
            <option value="openai/gpt-oss-20b">GPT-OSS 20B (mais rápido)</option>
            <option value="llama-3.3-70b-versatile">Llama 3.3 70B (alternativa)</option>
          </select>
        </div>
      </div>
      <button onClick={handleSave} disabled={saving} style={{ padding: '0.6rem 1.25rem', background: 'var(--gold-primary)', color: 'var(--text-on-gold, #000000)', border: 'none', borderRadius: '8px', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
        <Save size={16} /> {saving ? 'Salvando...' : 'Salvar Chave da IA'}
      </button>
      <button onClick={handleTest} disabled={testing} style={{ marginLeft: '0.75rem', padding: '0.6rem 1.25rem', background: 'rgba(16,185,129,0.15)', color: '#10b981', border: '1px solid rgba(16,185,129,0.4)', borderRadius: '8px', cursor: testing ? 'not-allowed' : 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
        <PlugZap size={16} /> {testing ? 'Testando...' : 'Testar conexão'}
      </button>
    </div>
  );
}