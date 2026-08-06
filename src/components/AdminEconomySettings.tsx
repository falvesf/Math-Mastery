import { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { Coins, Star, Save, Loader2 } from 'lucide-react';
import { useDialog } from '../contexts/DialogContext';

export default function AdminEconomySettings() {
  const { showAlert } = useDialog();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'coins' | 'xp'>('coins');

  // Settings states
  const [coinsDropInCombat, setCoinsDropInCombat] = useState(false);
  const [coinsLostInCombat, setCoinsLostInCombat] = useState(false);
  const [coinsCanBuyItems, setCoinsCanBuyItems] = useState(true);
  const [coinToXPRatio, setCoinToXPRatio] = useState(10);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const econRef = doc(db, 'settings', 'economy');
      const snap = await getDoc(econRef);
      if (snap.exists()) {
        const data = snap.data();
        setCoinsDropInCombat(data.coinsDropInCombat ?? false);
        setCoinsLostInCombat(data.coinsLostInCombat ?? false);
        setCoinsCanBuyItems(data.coinsCanBuyItems ?? true);
        setCoinToXPRatio(data.coinToXPRatio ?? 10);
      } else {
        // Initialize if doesn't exist
        await setDoc(econRef, {
          currencyType: 'coins',
          coinsDropInCombat: false,
          coinsLostInCombat: false,
          coinsCanBuyItems: true,
          coinToXPRatio: 10
        });
      }
    } catch (err) {
      console.error("Erro ao carregar configs de economia:", err);
      showAlert('Erro', 'Não foi possível carregar as configurações de economia.');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const econRef = doc(db, 'settings', 'economy');
      const snap = await getDoc(econRef);
      
      const payload = {
        coinsDropInCombat,
        coinsLostInCombat,
        coinsCanBuyItems,
        coinToXPRatio: Number(coinToXPRatio)
      };

      if (snap.exists()) {
        await updateDoc(econRef, payload);
      } else {
        await setDoc(econRef, { currencyType: 'coins', ...payload });
      }

      showAlert('Sucesso', 'Configurações de economia salvas globalmente!');
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      
      <div style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid var(--border-glass)' }}>
        <button
          onClick={() => setActiveTab('coins')}
          style={{
            background: 'transparent',
            border: 'none',
            borderBottom: activeTab === 'coins' ? '3px solid #fbbf24' : '3px solid transparent',
            color: activeTab === 'coins' ? '#fbbf24' : 'var(--text-secondary)',
            padding: '1rem 2rem',
            cursor: 'pointer',
            fontSize: '1rem',
            fontWeight: activeTab === 'coins' ? 'bold' : 'normal',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}
        >
          <Coins size={20} /> Moedas de Ouro
        </button>
        <button
          onClick={() => setActiveTab('xp')}
          style={{
            background: 'transparent',
            border: 'none',
            borderBottom: activeTab === 'xp' ? '3px solid var(--gold-primary)' : '3px solid transparent',
            color: activeTab === 'xp' ? 'var(--gold-primary)' : 'var(--text-secondary)',
            padding: '1rem 2rem',
            cursor: 'pointer',
            fontSize: '1rem',
            fontWeight: activeTab === 'xp' ? 'bold' : 'normal',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}
        >
          <Star size={20} /> Gasto de XP
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', background: 'rgba(0,0,0,0.2)', padding: '2rem', borderRadius: '12px', border: '1px solid var(--border-glass)' }}>
        {activeTab === 'coins' ? (
          <>
            <h3 style={{ margin: 0, color: 'white' }}>Configurações de Moedas nos Combates</h3>
            <p style={{ color: 'var(--text-secondary)', margin: 0, marginBottom: '1rem', fontSize: '0.9rem' }}>
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
                <strong style={{ color: 'white' }}>Moedas visíveis nos desafios</strong>
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
                <strong style={{ color: 'white' }}>Moedas podem ser perdidas</strong>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '4px' }}>
                  Quando o jogador erra e leva dano, ele tem chance de perder uma quantidade aleatória de moedas (cálculo = Patente x HP restante do monstro).
                </span>
              </div>
            </label>
          </>
        ) : (
          <>
            <h3 style={{ margin: 0, color: 'white' }}>Configurações de Conversão de XP</h3>
            <p style={{ color: 'var(--text-secondary)', margin: 0, marginBottom: '1rem', fontSize: '0.9rem' }}>
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
                <strong style={{ color: 'white' }}>Moedas podem ser usadas para comprar itens</strong>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '4px' }}>
                  Ativa o botão de comprar com Moedas na Loja de Itens e Bazar, mesmo se a economia for Gasto de XP.
                </span>
              </div>
            </label>

            {coinsCanBuyItems && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '1rem', paddingLeft: '2.5rem' }}>
                <label style={{ color: 'white', fontWeight: 'bold' }}>Valor da Moeda em relação ao XP</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Preço = Custo em XP ×</span>
                  <input 
                    type="number"
                    min="1"
                    value={coinToXPRatio}
                    onChange={(e) => setCoinToXPRatio(Number(e.target.value))}
                    style={{ width: '100px', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border-glass)', background: 'var(--bg-dark)', color: 'white' }}
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

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
        <button
          className="login-btn hover-brightness"
          onClick={handleSave}
          disabled={saving}
          style={{
            background: 'var(--gold-primary)',
            color: 'var(--text-on-gold, #000000)',
            border: 'none',
            padding: '0.75rem 2rem',
            fontSize: '1rem',
            fontWeight: 'bold',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}
        >
          {saving ? <Loader2 className="spin" size={20} /> : <Save size={20} />}
          Salvar Configurações
        </button>
      </div>

    </div>
  );
}
