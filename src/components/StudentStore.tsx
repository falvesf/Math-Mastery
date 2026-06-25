import { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, query, getDocs, doc, getDoc, addDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { Coins, Star, ShieldAlert, Store } from 'lucide-react';
import type { UserData } from '../contexts/AuthContext';
import { RANKS } from '../lib/ranks';
import type { StoreItem } from './AdminStoreManager';

export default function StudentStore({ userData }: { userData: UserData }) {
  const [items, setItems] = useState<StoreItem[]>([]);
  const [economyType, setEconomyType] = useState<'xp' | 'coins'>('coins');
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState<string | null>(null);

  useEffect(() => {
    fetchStoreData();
  }, []);

  const fetchStoreData = async () => {
    setLoading(true);
    const econRef = doc(db, 'settings', 'economy');
    const econSnap = await getDoc(econRef);
    if (econSnap.exists()) {
      setEconomyType(econSnap.data().currencyType || 'coins');
    }

    const q = query(collection(db, 'store_items'));
    const snap = await getDocs(q);
    const loaded: StoreItem[] = [];
    snap.forEach(d => {
      const data = d.data() as StoreItem;
      if (data.active) loaded.push({ ...data, id: d.id });
    });
    setItems(loaded);
    setLoading(false);
  };

  const handlePurchase = async (item: StoreItem) => {
    if (!userData.uid) return;

    const currentBalance = economyType === 'xp' ? (userData.xp || 0) : (userData.coins || 0);
    
    if (currentBalance < item.cost) {
      alert(`Você não tem ${economyType === 'xp' ? 'XP' : 'Moedas'} suficiente para comprar este item.`);
      return;
    }

    const currentRankIndex = RANKS.findIndex(r => r.name === userData.lastSeenRank) || 0;
    if (currentRankIndex < item.minRankRequired) {
      alert(`Sua patente é muito baixa! Você precisa ser no mínimo ${RANKS[item.minRankRequired].name} para comprar este item.`);
      return;
    }

    if (!confirm(`Confirmar a compra de "${item.title}" por ${item.cost} ${economyType === 'xp' ? 'XP' : 'Moedas'}?`)) return;

    setPurchasing(item.id);

    try {
      // Deduzir valor
      const newBalance = currentBalance - item.cost;
      const userRef = doc(db, 'users', userData.uid);
      
      if (economyType === 'xp') {
        await updateDoc(userRef, { xp: newBalance });
        // Log the negative XP
        await addDoc(collection(db, 'xp_logs'), {
          studentId: userData.uid,
          evalName: `Compra na Loja: ${item.title}`,
          xpGained: -item.cost,
          timestamp: serverTimestamp()
        });
      } else {
        await updateDoc(userRef, { coins: newBalance });
      }

      // Adicionar item ao inventário
      await addDoc(collection(db, 'user_items'), {
        studentId: userData.uid,
        itemId: item.id,
        itemTitle: item.title,
        itemType: item.type,
        itemImageUrl: item.imageUrl || '',
        quantity: 1,
        equipped: false,
        purchasedAt: serverTimestamp()
      });

      alert('Item comprado com sucesso! Acesse seu Inventário para utilizá-lo.');
      // Update local state to reflect UI instantly
      if (economyType === 'xp') userData.xp = newBalance;
      else userData.coins = newBalance;

    } catch (err) {
      alert('Erro ao processar a compra.');
    }
    setPurchasing(null);
  };

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>Carregando a loja...</div>;

  const currentBalance = economyType === 'xp' ? (userData.xp || 0) : (userData.coins || 0);

  return (
    <div style={{ animation: 'fadeIn 0.3s ease-out' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '2rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Store color="var(--gold-primary)" /> Mercado do Acampamento
        </h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(0,0,0,0.5)', padding: '0.75rem 1.5rem', borderRadius: '20px', border: '1px solid var(--gold-primary)' }}>
          {economyType === 'xp' ? <Star color="var(--gold-primary)" /> : <Coins color="var(--gold-primary)" />}
          <span style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--gold-primary)' }}>
            Saldo: {currentBalance} {economyType === 'xp' ? 'XP' : 'Moedas'}
          </span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '2rem' }}>
        {items.map(item => {
          const canAfford = currentBalance >= item.cost;
          const currentRankIndex = RANKS.findIndex(r => r.name === userData.lastSeenRank) || 0;
          const meetsRank = currentRankIndex >= item.minRankRequired;

          return (
            <div key={item.id} className="glass-panel" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <div style={{ height: '150px', width: '100%', position: 'relative', background: 'var(--bg-dark)' }}>
                {item.imageUrl ? (
                  <img src={item.imageUrl} alt={item.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Store size={48} color="var(--text-secondary)" />
                  </div>
                )}
                <div style={{ position: 'absolute', top: '10px', right: '10px', background: canAfford ? 'rgba(0,0,0,0.8)' : 'rgba(239, 68, 68, 0.9)', padding: '0.5rem 1rem', borderRadius: '20px', border: `1px solid ${canAfford ? 'var(--gold-primary)' : 'var(--accent-red)'}`, color: canAfford ? 'var(--gold-primary)' : 'white', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                   {item.cost} {economyType === 'xp' ? 'XP' : 'Moedas'}
                </div>
              </div>
              <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', flex: 1 }}>
                <h3 style={{ fontSize: '1.25rem', margin: '0 0 0.5rem 0' }}>{item.title}</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.5rem', flex: 1 }}>
                  {item.description}
                </p>
                
                {!meetsRank ? (
                  <div style={{ padding: '0.75rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--accent-red)', borderRadius: '8px', color: 'var(--accent-red)', fontSize: '0.9rem', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                    <ShieldAlert size={16} /> Requer Patente: {RANKS[item.minRankRequired]?.name}
                  </div>
                ) : (
                  <button 
                    className="login-btn" 
                    disabled={!canAfford || purchasing === item.id}
                    onClick={() => handlePurchase(item)}
                    style={{ 
                      background: canAfford ? 'var(--gold-primary)' : 'rgba(255,255,255,0.1)', 
                      color: canAfford ? 'black' : 'var(--text-secondary)', 
                      border: 'none', 
                      padding: '0.75rem', 
                      fontSize: '1rem',
                      opacity: canAfford ? 1 : 0.5,
                      cursor: canAfford ? 'pointer' : 'not-allowed'
                    }}
                  >
                    {purchasing === item.id ? 'Comprando...' : canAfford ? 'Comprar Item' : 'Saldo Insuficiente'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {items.length === 0 && (
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
            <Store size={48} style={{ margin: '0 auto 1rem auto', opacity: 0.5 }} />
            <p>A loja está vazia no momento. O Mestre ainda não trouxe novos itens!</p>
          </div>
        )}
      </div>
    </div>
  );
}
