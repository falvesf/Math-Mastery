import { useState, useEffect } from 'react';
import { Coins, Star, Save, Loader2, ShieldAlert, Gift, Building2 } from 'lucide-react';
import { useDialog } from '../contexts/DialogContext';
import { useTenant } from '../contexts/TenantContext';
import { fetchEconomySettings, saveEconomySettings, DEFAULT_ECONOMY, type EconomySettings } from '../lib/economy';

export default function AdminEconomySettings() {
  const { showAlert } = useDialog();
  const { tenantId, tenant } = useTenant();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [settings, setSettings] = useState<EconomySettings>(DEFAULT_ECONOMY);
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
        rankUpChestEnabled,
        rankUpChestItems,
      };
      const ok = await saveEconomySettings(tenantId, payload);
      if (ok) {
        showAlert('Configurações de economia salvas com sucesso!');
      } else {
        showAlert('Ocorreu um erro ao salvar as configurações. Verifique o console (F12).');
      }
    } catch (err: any) {
      console.error("Erro ao salvar:", err);
      showAlert('Erro ao salvar: ' + (err.message || 'Erro desconhecido.'));
    } finally {
      setSaving(false);
    }
  };

  const update = (partial: Partial<EconomySettings>) => {
    setSettings(s => ({ ...s, ...partial }));
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
        <Loader2 className="spin" size={40} color="var(--gold-primary)" />
      </div>
    );
  }

  const isCoins = settings.currencyType === 'coins';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid var(--border-glass)', background: 'rgba(139, 92, 246, 0.08)' }}>
        <Building2 size={18} color="#8b5cf6" />
        <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          Escola ativa: <strong style={{ color: 'var(--text-primary)' }}>{tenant?.name || (tenantId ? tenantId : 'Global (sem escola específica)')}</strong>
        </span>
        {!tenantId && (
          <span style={{ fontSize: '0.8rem', color: '#f59e0b' }}>
            As alterações serão salvas na configuração GLOBAL.
          </span>
        )}
      </div>

      {/* Header com título e botão salvar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '1.2rem' }}>Ajustes de Economia</h3>
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
            gap: '0.5rem'
          }}
        >
          {saving ? <Loader2 className="spin" size={18} /> : <Save size={18} />}
          Salvar
        </button>
      </div>

      {/* Tipo de Economia */}
      <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '12px', border: '1px solid var(--border-glass)' }}>
        <h3 style={{ margin: '0 0 0.5rem 0', color: 'var(--text-primary)', fontSize: '1.1rem' }}>Tipo de Economia</h3>
        <p style={{ color: 'var(--text-secondary)', margin: '0 0 1rem 0', fontSize: '0.85rem' }}>
          Selecione como os itens são comprados na loja. As configurações abaixo se ajustam conforme a economia escolhida.
        </p>

        <div style={{ display: 'flex', gap: '1rem' }}>
          <div 
            onClick={() => update({ currencyType: 'coins', coinsCanBuyItems: true })}
            style={{ flex: 1, padding: '1rem', borderRadius: '8px', cursor: 'pointer', border: isCoins ? '2px solid var(--gold-primary)' : '1px solid var(--border-glass)', background: isCoins ? 'rgba(251, 191, 36, 0.1)' : 'rgba(0,0,0,0.2)', transition: 'all 0.2s' }}
          >
            <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem', color: 'var(--gold-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Coins size={20} /> Moedas de Ouro</h3>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>Ganha moedas para gastar. A patente não cai.</p>
          </div>
          <div 
            onClick={() => update({ currencyType: 'xp', coinsCanBuyItems: false })}
            style={{ flex: 1, padding: '1rem', borderRadius: '8px', cursor: 'pointer', border: !isCoins ? '2px solid var(--accent-red)' : '1px solid var(--border-glass)', background: !isCoins ? 'rgba(239, 68, 68, 0.1)' : 'rgba(0,0,0,0.2)', transition: 'all 0.2s' }}
          >
            <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1rem', color: 'var(--accent-red)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><ShieldAlert size={20} /> Gasto de XP</h3>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>Gasta o próprio XP. Pode perder patentes.</p>
          </div>
        </div>
      </div>

      {/* Moedas de Ouro - Combates e Baú */}
      {isCoins && (
        <>
          <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '12px', border: '1px solid var(--border-glass)' }}>
            <h3 style={{ margin: '0 0 0.5rem 0', color: 'var(--text-primary)', fontSize: '1.1rem' }}>Moedas nos Combates</h3>
        <p style={{ color: 'var(--text-secondary)', margin: '0 0 1rem 0', fontSize: '0.85rem' }}>
          Configure como as moedas se comportam durante os desafios.
        </p>

        <label style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', cursor: 'pointer' }}>
          <input 
            type="checkbox" 
            checked={settings.coinsDropInCombat}
            onChange={(e) => update({ coinsDropInCombat: e.target.checked })}
            style={{ width: '20px', height: '20px', marginTop: '2px' }}
          />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <strong style={{ color: 'var(--text-primary)' }}>Moedas visíveis nos desafios</strong>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '4px' }}>
              A cada golpe com acerto, chance de cair moedas na tela (Patente x Dano). Golpe crítico dobra o drop.
            </span>
          </div>
        </label>

        <label style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', cursor: 'pointer', marginTop: '0.75rem' }}>
          <input 
            type="checkbox" 
            checked={settings.coinsLostInCombat}
            onChange={(e) => update({ coinsLostInCombat: e.target.checked })}
            style={{ width: '20px', height: '20px', marginTop: '2px' }}
          />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <strong style={{ color: 'var(--text-primary)' }}>Moedas podem ser perdidas</strong>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '4px' }}>
              Quando o jogador erra e leva dano, chance de perder moedas (Patente x HP restante do monstro).
            </span>
          </div>
        </label>
      </div>

      {/* Baú ao subir de patente */}
      <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '12px', border: '1px solid var(--border-glass)' }}>
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
              Quando alcançar uma nova patente, receberá um baú com itens configurados. Uma vez por patente.
            </span>
          </div>
        </label>
        <div style={{ marginTop: '0.75rem', padding: '0.75rem 1rem', background: 'rgba(139, 92, 246, 0.08)', borderRadius: '8px', border: '1px solid var(--border-glass)' }}>
          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            <Gift size={14} color="#8b5cf6" style={{ marginRight: '0.35rem', verticalAlign: 'middle' }} />
            Os itens do baú são definidos em <strong style={{ color: 'var(--text-primary)' }}>Patentes e Artes</strong>, ao editar cada patente.
          </p>
        </div>
        </div>
        </>
      )}

      {/* Gasto de XP - Moedas como pagamento alternativo */}
      {!isCoins && (
        <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '12px', border: '1px solid var(--border-glass)' }}>
          <h3 style={{ margin: '0 0 0.5rem 0', color: 'var(--text-primary)', fontSize: '1.1rem' }}>Pagamento Alternativo com Moedas</h3>
          <p style={{ color: 'var(--text-secondary)', margin: '0 0 1rem 0', fontSize: '0.85rem' }}>
            Com a economia de XP ativa, você pode permitir que moedas também sejam usadas como forma de pagamento.
          </p>

          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', cursor: 'pointer' }}>
            <input 
              type="checkbox" 
              checked={settings.coinsCanBuyItems}
              onChange={(e) => update({ coinsCanBuyItems: e.target.checked })}
              style={{ width: '20px', height: '20px', marginTop: '2px' }}
            />
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <strong style={{ color: 'var(--text-primary)' }}>Aceitar moedas na loja</strong>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '4px' }}>
                Ativa o botão de comprar com Moedas na Loja de Itens e Bazar.
              </span>
            </div>
          </label>

          {settings.coinsCanBuyItems && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '1rem', paddingLeft: '2.5rem' }}>
              <label style={{ color: 'var(--text-primary)', fontWeight: 'bold' }}>Valor da Moeda em relação ao XP</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Preço = Custo em XP ×</span>
                <input 
                  type="number"
                  min="1"
                  value={settings.coinToXPRatio}
                  onChange={(e) => update({ coinToXPRatio: Number(e.target.value) })}
                  style={{ width: '100px', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-glass)', background: 'var(--btn-bg)', color: 'var(--text-primary)' }}
                />
              </div>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                Exemplo: Se a Poção custa 25 XP e esse valor for 10, ela custará 250 Moedas.
              </span>
            </div>
          )}
        </div>
      )}

    </div>
  );
}
