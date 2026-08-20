import { useState, useEffect } from 'react';
import { Coins, Star, Save, Loader2, Settings, ShieldAlert, Gift, Building2 } from 'lucide-react';
import { useDialog } from '../contexts/DialogContext';
import { useTenant } from '../contexts/TenantContext';
import { fetchEconomySettings, saveEconomySettings, DEFAULT_ECONOMY, type EconomySettings } from '../lib/economy';

export default function AdminEconomySettings() {
  const { showAlert } = useDialog();
  const { tenantId, tenant } = useTenant();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'settings' | 'coins' | 'xp'>('settings');

  // Settings states
  const [settings, setSettings] = useState<EconomySettings>(DEFAULT_ECONOMY);

  // Rank up chest states
  const [rankUpChestEnabled, setRankUpChestEnabled] = useState(false);
  const [rankUpChestItems, setRankUpChestItems] = useState<{ itemId: string; quantity: number }[]>([]);

  useEffect(() => {
    fetchSettings();
  }, [tenantId]);

  const fetchSettings = async () => {
    setLoading(true);
    const econ = await fetchEconomySettings(tenantId);
    setSettings(econ);
    setRankUpChestEnabled(econ.rankUpChestEnabled);
    setRankUpChestItems(econ.rankUpChestItems);
    setLoading(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: EconomySettings = {
        ...settings,
        currencyType: settings.coinsCanBuyItems ? 'coins' : 'xp',
        rankUpChestEnabled,
        rankUpChestItems,
      };
      const ok = await saveEconomySettings(tenantId, payload);
      if (ok) {
        showAlert('Sucesso', `Configurações de economia salvas para esta escola!`);
      } else {
        showAlert('Erro', 'Ocorreu um erro ao salvar as configurações.');
      }
    } catch (err) {
      console.error("Erro ao salvar:", err);
      showAlert('Erro', 'Ocorreu um erro ao salvar as configurações.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
        <Loader2 className="spin" size={40} color="var(--gold-primary)" />
      </div>
    );
  }

  const coinsDropInCombat = settings.coinsDropInCombat;
  const coinsLostInCombat = settings.coinsLostInCombat;
  const coinsCanBuyItems = settings.coinsCanBuyItems;
  const coinToXPRatio = settings.coinToXPRatio;

  const setCoinsDropInCombat = (v: boolean) => setSettings(s => ({ ...s, coinsDropInCombat: v }));
  const setCoinsLostInCombat = (v: boolean) => setSettings(s => ({ ...s, coinsLostInCombat: v }));
  const setCoinsCanBuyItems = (v: boolean) => setSettings(s => ({ ...s, coinsCanBuyItems: v }));
  const setCoinToXPRatio = (v: number) => setSettings(s => ({ ...s, coinToXPRatio: v }));

  // Alternar tipo de economia salva imediatamente (como antes na Loja de Itens)
  const toggleEconomyType = async (coins: boolean) => {
    setCoinsCanBuyItems(coins);
    setSaving(true);
    try {
      const payload: EconomySettings = {
        ...settings,
        coinsCanBuyItems: coins,
        currencyType: coins ? 'coins' : 'xp',
        rankUpChestEnabled,
        rankUpChestItems,
      };
      const ok = await saveEconomySettings(tenantId, payload);
      if (!ok) {
        showAlert('Erro', 'Ocorreu um erro ao salvar o tipo de economia.');
      }
    } catch (err) {
      console.error("Erro ao salvar tipo de economia:", err);
      showAlert('Erro', 'Ocorreu um erro ao salvar o tipo de economia.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid var(--border-glass)', background: 'rgba(139, 92, 246, 0.08)' }}>
        <Building2 size={18} color="#8b5cf6" />
        <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          Escola ativa: <strong style={{ color: 'var(--text-primary)' }}>{tenant?.name || (tenantId ? tenantId : 'Global (sem escola específica)')}</strong>
        </span>
        {!tenantId && (
          <span style={{ fontSize: '0.8rem', color: '#f59e0b' }}>
            As alterações serão salvas na configuração GLOBAL (aplicada a quem não tem escola). Para configurar uma escola específica, use o botão "Entrar" na aba Escolas.
          </span>
        )}
      </div>

      <div style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid var(--border-glass)', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button
            onClick={() => setActiveTab('settings')}
            style={{
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === 'settings' ? '3px solid var(--accent-blue)' : '3px solid transparent',
              color: activeTab === 'settings' ? 'var(--accent-blue)' : 'var(--text-secondary)',
              padding: '0.75rem 1rem',
              cursor: 'pointer',
              fontSize: '1rem',
              fontWeight: activeTab === 'settings' ? 'bold' : 'normal',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            <Settings size={18} /> Configurações
          </button>
          <button
            onClick={() => setActiveTab('coins')}
            style={{
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === 'coins' ? '3px solid #fbbf24' : '3px solid transparent',
              color: activeTab === 'coins' ? '#fbbf24' : 'var(--text-secondary)',
              padding: '0.75rem 1rem',
              cursor: 'pointer',
              fontSize: '1rem',
              fontWeight: activeTab === 'coins' ? 'bold' : 'normal',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            <Coins size={18} /> Moedas de Ouro
          </button>
          <button
            onClick={() => setActiveTab('xp')}
            style={{
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === 'xp' ? '3px solid var(--gold-primary)' : '3px solid transparent',
              color: activeTab === 'xp' ? 'var(--gold-primary)' : 'var(--text-secondary)',
              padding: '0.75rem 1rem',
              cursor: 'pointer',
              fontSize: '1rem',
              fontWeight: activeTab === 'xp' ? 'bold' : 'normal',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            <Star size={18} /> Gasto de XP
          </button>
        </div>
        
        <button
          className="login-btn hover-brightness"
          onClick={handleSave}
          disabled={saving}
          style={{
            background: 'var(--gold-primary)',
            color: 'var(--text-on-gold, #000000)',
            border: 'none',
            padding: '0.5rem 1rem',
            fontSize: '0.9rem',
            fontWeight: 'bold',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            marginBottom: '0.5rem'
          }}
        >
          {saving ? <Loader2 className="spin" size={18} /> : <Save size={18} />}
          Salvar Configurações
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '12px', border: '1px solid var(--border-glass)' }}>
        {activeTab === 'settings' ? (
          <>
            <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '1.1rem' }}>Configurações Gerais da Economia</h3>
            <p style={{ color: 'var(--text-secondary)', margin: 0, marginBottom: '0.5rem', fontSize: '0.85rem' }}>
              Selecione o tipo de economia que será utilizada no jogo. Isso afetará como os itens são comprados na loja.
            </p>

            <div style={{ padding: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', border: '1px solid var(--border-glass)' }}>
              <h4 style={{ margin: '0 0 0.75rem 0', color: 'var(--text-primary)', fontSize: '1rem' }}>Tipo de Economia</h4>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <div 
                  onClick={() => toggleEconomyType(true)}
                  style={{ flex: 1, padding: '1rem', borderRadius: '8px', cursor: 'pointer', border: coinsCanBuyItems ? '2px solid var(--gold-primary)' : '1px solid var(--border-glass)', background: coinsCanBuyItems ? 'rgba(251, 191, 36, 0.1)' : 'rgba(0,0,0,0.2)', transition: 'all 0.2s' }}
                >
                  <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem', color: 'var(--gold-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Coins size={20} /> Moedas de Ouro</h3>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>Ganha moedas para gastar. A patente não cai.</p>
                </div>
                <div 
                  onClick={() => toggleEconomyType(false)}
                  style={{ flex: 1, padding: '1rem', borderRadius: '8px', cursor: 'pointer', border: !coinsCanBuyItems ? '2px solid var(--accent-red)' : '1px solid var(--border-glass)', background: !coinsCanBuyItems ? 'rgba(239, 68, 68, 0.1)' : 'rgba(0,0,0,0.2)', transition: 'all 0.2s' }}
                >
                  <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem', color: 'var(--accent-red)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><ShieldAlert size={20} /> Gasto de XP</h3>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>Gasta o próprio XP. Pode perder patentes.</p>
                </div>
              </div>
            </div>
          </>
        ) : activeTab === 'coins' ? (
          <>
            <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '1.1rem' }}>Configurações de Moedas nos Combates</h3>
            <p style={{ color: 'var(--text-secondary)', margin: 0, marginBottom: '0.5rem', fontSize: '0.85rem' }}>
              Defina como as moedas se comportarão dentro dos desafios quando a economia do jogo for baseada nelas.
            </p>

            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', cursor: 'pointer' }}>
              <input 
                type="checkbox" 
                checked={coinsDropInCombat}
                onChange={(e) => setCoinsDropInCombat(e.target.checked)}
                style={{ width: '20px', height: '20px', marginTop: '2px' }}
              />
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <strong style={{ color: 'var(--text-primary)' }}>Moedas visíveis nos desafios</strong>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '4px' }}>
                  A cada golpe com acerto no monstro, haverá chance de cair moedas na tela (cálculo = Patente x Dano). Se for golpe crítico, o drop é dobrado.
                </span>
              </div>
            </label>

            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', cursor: 'pointer', marginTop: '0.5rem' }}>
              <input 
                type="checkbox" 
                checked={coinsLostInCombat}
                onChange={(e) => setCoinsLostInCombat(e.target.checked)}
                style={{ width: '20px', height: '20px', marginTop: '2px' }}
              />
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <strong style={{ color: 'var(--text-primary)' }}>Moedas podem ser perdidas</strong>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '4px' }}>
                  Quando o jogador erra e leva dano, ele tem chance de perder uma quantidade aleatória de moedas (cálculo = Patente x HP restante do monstro).
                </span>
              </div>
            </label>

            <hr style={{ border: 'none', borderTop: '1px solid var(--border-glass)', margin: '0.5rem 0' }} />

            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', cursor: 'pointer' }}>
              <input 
                type="checkbox" 
                checked={rankUpChestEnabled}
                onChange={(e) => setRankUpChestEnabled(e.target.checked)}
                style={{ width: '20px', height: '20px', marginTop: '2px' }}
              />
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <strong style={{ color: 'var(--text-primary)' }}>Receber Baú ao subir de patente</strong>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '4px' }}>
                  Quando o jogador alcançar uma nova patente, receberá um baú com os itens configurados naquela patente. O baú só é dado uma vez por patente e apenas se houver itens configurados.
                </span>
              </div>
            </label>

            <div style={{ marginTop: '0.75rem', padding: '0.75rem 1rem', background: 'rgba(139, 92, 246, 0.08)', borderRadius: '8px', border: '1px solid var(--border-glass)' }}>
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                <Gift size={14} color="#8b5cf6" style={{ marginRight: '0.35rem', verticalAlign: 'middle' }} />
                Os itens do baú são definidos em <strong style={{ color: 'var(--text-primary)' }}>Patentes e Artes</strong>, ao editar/criar cada patente. Se a patente alcançada não tiver itens configurados, nenhum baú será distribuído.
              </p>
            </div>
          </>
        ) : (
          <>
            <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '1.1rem' }}>Configurações de Conversão de XP</h3>
            <p style={{ color: 'var(--text-secondary)', margin: 0, marginBottom: '0.5rem', fontSize: '0.85rem' }}>
              Quando a economia "Gasto de XP" estiver ativa na loja, você pode controlar se as moedas também serão aceitas como forma de pagamento alternativo.
            </p>

            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', cursor: 'pointer' }}>
              <input 
                type="checkbox" 
                checked={coinsCanBuyItems}
                onChange={(e) => setCoinsCanBuyItems(e.target.checked)}
                style={{ width: '20px', height: '20px', marginTop: '2px' }}
              />
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <strong style={{ color: 'var(--text-primary)' }}>Moedas podem ser usadas para comprar itens</strong>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '4px' }}>
                  Ativa o botão de comprar com Moedas na Loja de Itens e Bazar, mesmo se a economia for Gasto de XP.
                </span>
              </div>
            </label>

            {coinsCanBuyItems && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '1rem', paddingLeft: '2.5rem' }}>
                <label style={{ color: 'var(--text-primary)', fontWeight: 'bold' }}>Valor da Moeda em relação ao XP</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Preço = Custo em XP ×</span>
                  <input 
                    type="number"
                    min="1"
                    value={coinToXPRatio}
                    onChange={(e) => setCoinToXPRatio(Number(e.target.value))}
                    style={{ width: '100px', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-glass)', background: 'var(--btn-bg)', color: 'var(--text-primary)' }}
                  />
                </div>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                  Exemplo: Se a Poção custa 25 XP e esse valor for 10, ela custará 250 Moedas.
                </span>
              </div>
            )}
          </>
        )}
      </div>

    </div>
  );
}