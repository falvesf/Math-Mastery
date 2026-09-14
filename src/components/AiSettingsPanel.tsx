import { useState, useEffect } from 'react';
import { Save, KeyRound, Cpu, PlugZap, Eye, EyeOff } from 'lucide-react';
import { getGrokConfig, saveGrokConfig, clearGrokConfigCache } from '../lib/aiConfig';
import { useDialog } from '../contexts/DialogContext';

export default function AiSettingsPanel() {
  const { showAlert } = useDialog();
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('qwen/qwen3.8-27b');
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    getGrokConfig().then(cfg => {
      if (cfg) {
        setApiKey(cfg.apiKey || '');
        setModel(cfg.model || 'qwen/qwen3.8-27b');
      }
    });
  }, []);

  const handleSave = async () => {
    const cleanKey = apiKey.trim();
    if (!cleanKey) {
      showAlert('Cole a chave de API do Groq (começa com gsk_).');
      return;
    }
    setSaving(true);
    const ok = await saveGrokConfig(cleanKey, model);
    setSaving(false);
    if (ok) {
      clearGrokConfigCache();
      showAlert(`Chave da IA salva com sucesso!\nFinal da chave: ...${cleanKey.slice(-4)}\nAs missões e a geração de lore da loja agora usarão essa chave.`);
    } else {
      showAlert('Erro ao salvar a chave no banco de dados.');
    }
  };

  const handleTest = async () => {
    const key = apiKey.trim() || (await getGrokConfig())?.apiKey || '';
    if (!key) {
      showAlert('Cole a chave primeiro (ou salve) para testar.');
      return;
    }
    setTesting(true);
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: JSON.stringify({
          model: model || 'llama-3.3-70b-versatile',
          messages: [{ role: 'user', content: 'Responda apenas com a palavra OK' }],
          max_tokens: 10,
        }),
      });
      if (res.ok) {
        const json = await res.json();
        showAlert(`✅ Conexão com a IA estabelecida com sucesso!\nModelo: ${model}\nResposta do servidor: "${(json?.choices?.[0]?.message?.content || '').trim()}"`);
      } else {
        const err = await res.text().catch(() => '');
        if (res.status === 401) {
          showAlert(`❌ Erro 401 (Não Autorizado): A chave de API atual não é reconhecida pelo Groq.\n\nVerifique se copiou a chave correta no console do Groq (deve terminar com o mesmo sufixo que aparece na sua lista de API Keys).`);
        } else {
          showAlert(`❌ Erro ${res.status}: ${err.slice(0, 200)}`);
        }
      }
    } catch (e: any) {
      showAlert(`Falha de conexão/rede: ${e?.message || e}`);
    } finally {
      setTesting(false);
    }
  };

  const savedSuffix = apiKey.length >= 8 ? apiKey.slice(-4) : '';

  return (
    <div className="glass-panel" style={{ padding: '1.5rem', marginTop: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <Cpu size={20} color="var(--gold-primary)" />
          <h3 style={{ margin: 0, fontSize: '1.1rem' }}>IA das Missões & Loja (Groq Cloud)</h3>
        </div>
        {savedSuffix && (
          <span style={{ fontSize: '0.75rem', background: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24', border: '1px solid rgba(245, 158, 11, 0.3)', padding: '2px 8px', borderRadius: '4px' }}>
            Chave atual: <code>gsk_...{savedSuffix}</code>
          </span>
        )}
      </div>

      <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '0 0 1rem 0' }}>
        A chave da API é usada para criar missões narrativas e gerar descrições (lore) para os itens da loja. Obtenha sua chave gratuita em <strong>console.groq.com/keys</strong>.
      </p>

      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
        <div style={{ flex: '2 1 300px' }}>
          <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.8rem', marginBottom: '0.3rem' }}>
            <KeyRound size={12} style={{ marginRight: '0.25rem', verticalAlign: 'middle' }} /> Chave da API (começa com <code>gsk_</code>)
          </label>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder="gsk_..."
              style={{ width: '100%', padding: '0.6rem 2.4rem 0.6rem 0.6rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontFamily: 'inherit', boxSizing: 'border-box' }}
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              title={showKey ? 'Ocultar chave' : 'Exibir chave'}
              style={{ position: 'absolute', right: '8px', background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '4px' }}
            >
              {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        <div style={{ flex: '1 1 200px' }}>
          <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.8rem', marginBottom: '0.3rem' }}>Modelo do Groq</label>
          <select
            value={model}
            onChange={e => setModel(e.target.value)}
            style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)' }}
          >
            <option value="qwen/qwen3.8-27b">Qwen 3.8 27B (Recomendado - Mais Rápido & Preciso)</option>
            <option value="groq/compound-mini">Groq Compound Mini</option>
            <option value="groq/compound">Groq Compound</option>
            <option value="llama-3.3-70b-versatile">Llama 3.3 70B</option>
            <option value="llama-3.1-8b-instant">Llama 3.1 8B</option>
          </select>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          style={{ padding: '0.6rem 1.25rem', background: 'var(--gold-primary)', color: 'var(--text-on-gold, #000000)', border: 'none', borderRadius: '8px', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
        >
          <Save size={16} /> {saving ? 'Salvando...' : 'Salvar Chave da IA'}
        </button>

        <button
          type="button"
          onClick={handleTest}
          disabled={testing}
          style={{ padding: '0.6rem 1.25rem', background: 'rgba(16,185,129,0.15)', color: '#10b981', border: '1px solid rgba(16,185,129,0.4)', borderRadius: '8px', cursor: testing ? 'not-allowed' : 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
        >
          <PlugZap size={16} /> {testing ? 'Testando...' : 'Testar conexão'}
        </button>
      </div>
    </div>
  );
}