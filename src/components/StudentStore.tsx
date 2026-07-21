import { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, query, getDocs, doc, getDoc, addDoc, updateDoc, serverTimestamp, where } from 'firebase/firestore';
import { Coins, Star, ShieldAlert, Store } from 'lucide-react';
import type { UserData } from '../contexts/AuthContext';
import { useDialog } from '../contexts/DialogContext';
import { RANKS, getRankForXp } from '../lib/ranks';
import { type ItemCategory, type AttributeType, type ItemAdd, rollItemAdds } from '../lib/gacha';
import type { StoreItem } from './AdminStoreManager';

interface MarketItem {
  id: string;
  itemId: string;
  itemTitle: string;
  itemType: 'consumable' | 'equippable';
  itemImageUrl: string;
  quantity: number;
  price?: number;
  sellerName?: string;
  itemCategory?: ItemCategory;
  baseAttributeType?: AttributeType;
  baseAttributeValue?: number;
  adds?: ItemAdd[];
  studentId: string;
  gameEffect?: string;
  avatarPart?: string;
}

export default function StudentStore({ userData }: { userData: UserData }) {
  const { showAlert, showConfirm } = useDialog();
  const [activeTab, setActiveTab] = useState<'official' | 'market'>('official');
  const [items, setItems] = useState<StoreItem[]>([]);
  const [marketItems, setMarketItems] = useState<MarketItem[]>([]);
  const [myInventoryCount, setMyInventoryCount] = useState(0);
  const [economyType, setEconomyType] = useState<'xp' | 'coins'>('coins');
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  
  // Presente (Gifting)
  const [students, setStudents] = useState<UserData[]>([]);
  const [giftingItemId, setGiftingItemId] = useState<string | null>(null);
  const [selectedGiftRecipient, setSelectedGiftRecipient] = useState<string>('');

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
    
    // Buscar lista de alunos para presente
    const userQ = query(collection(db, 'users'), where('role', '==', 'student'));
    const userSnap = await getDocs(userQ);
    const loadedStudents: UserData[] = [];
    userSnap.forEach(d => loadedStudents.push(d.data() as UserData));
    loadedStudents.sort((a,b) => a.name.localeCompare(b.name));
    setStudents(loadedStudents);
    
    // Buscar itens à venda no mercado
    const marketQ = query(collection(db, 'user_items'), where('forSale', '==', true));
    const marketSnap = await getDocs(marketQ);
    const loadedMarket: MarketItem[] = [];
    marketSnap.forEach(d => {
      const data = d.data() as MarketItem;
      loadedMarket.push({ ...data, id: d.id });
    });
    setMarketItems(loadedMarket);

    // Buscar quantidade de itens do usuário para calcular capacidade da mochila
    if (userData.uid) {
      const myItemsQ = query(collection(db, 'user_items'), where('studentId', '==', userData.uid));
      const myItemsSnap = await getDocs(myItemsQ);
      let count = 0;
      myItemsSnap.forEach(doc => {
        const d = doc.data();
        if (!d.forSale && d.studentId !== 'dropped') {
          // Consumíveis seriam agrupados? Na mochila atual cada item é contado, mas se ele comprar oficial vai criar novo doc.
          // Para simplificar: checamos o total de documentos ativos.
          count++;
        }
      });
      setMyInventoryCount(count);
    }

    setLoading(false);
  };

  const handlePurchase = async (item: StoreItem, isGift: boolean = false) => {
    if (!userData.uid) return;

    const recipientId = isGift ? selectedGiftRecipient : userData.uid;
    if (isGift && !recipientId) {
      await showAlert("Por favor, selecione um aluno para presentear.");
      return;
    }

    const isStaff = userData.role !== 'student';
    const currentBalance = economyType === 'xp' ? (userData.xp || 0) : (userData.coins || 0);
    
    if (!isStaff && currentBalance < item.cost) {
      await showAlert(`Você não tem ${economyType === 'xp' ? 'XP' : 'Moedas'} suficiente.`);
      return;
    }

    if (!isStaff) {
      const currentRank = getRankForXp(userData.xp || 0);
    const currentRankIndex = RANKS.findIndex(r => r.name === currentRank.name) || 0;
      if (currentRankIndex < item.minRankRequired) {
        await showAlert(`Sua patente é muito baixa! Você precisa ser no mínimo ${RANKS[item.minRankRequired].name} para comprar este item.`);
        return;
      }
    }

    const currentRank = getRankForXp(userData.xp || 0);
    const currentRankIndex = RANKS.findIndex(r => r.name === currentRank.name) || 0;
    const maxInventorySpace = 6 + currentRankIndex + (userData.extraInventorySpace || 0);

    if (!isStaff && !isGift && myInventoryCount >= maxInventorySpace) {
      await showAlert("Sua mochila está cheia! Jogue fora ou venda alguns itens antes de comprar novos.");
      return;
    }

    const actionText = isGift ? 'presentear' : 'comprar';
    const costText = isStaff ? 'gratuitamente (Staff)' : `por ${item.cost} ${economyType === 'xp' ? 'XP' : 'Moedas'}`;
    const confirmed = await showConfirm(`Confirmar ${actionText} "${item.title}" ${costText}?`);
    if (!confirmed) return;

    setPurchasing(item.id);

    try {
      // Deduzir valor Apenas de Alunos
      let newBalance = currentBalance;
      if (!isStaff) {
        newBalance = currentBalance - item.cost;
        const userRef = doc(db, 'users', userData.uid);
        
        if (economyType === 'xp') {
          await updateDoc(userRef, { xp: newBalance });
          await addDoc(collection(db, 'xp_logs'), {
            studentId: userData.uid,
            evalName: `Compra na Loja: ${item.title} ${isGift ? '(Presente)' : ''}`,
            xpGained: -item.cost,
            timestamp: serverTimestamp()
          });
        } else {
          await updateDoc(userRef, { coins: newBalance });
        }
      }

      // Adicionar novo doc
      let finalAdds: ItemAdd[] = [];
      if (item.type === 'equippable') {
        finalAdds = rollItemAdds();
      }
      
      await addDoc(collection(db, 'user_items'), {
        studentId: recipientId,
        itemId: item.id,
        itemTitle: item.title,
        itemType: item.type,
        itemImageUrl: item.imageUrl || '',
        gameEffect: item.gameEffect || 'none',
        usableInQuest: item.usableInQuest || false,
        quantity: 1,
        equipped: false,
        purchasedAt: serverTimestamp(),
        giftedBy: isGift ? userData.name : null,
        avatarPart: item.avatarPart || null,
        itemCategory: item.itemCategory || 'none',
        baseAttributeType: item.baseAttributeType || 'none',
        baseAttributeValue: item.baseAttributeValue || 0,
        adds: finalAdds
      });

      await showAlert(isGift ? 'Presente enviado com sucesso!' : 'Item comprado com sucesso! Acesse seu Inventário.');
      
      if (!isStaff) {
        if (economyType === 'xp') userData.xp = newBalance;
        else userData.coins = newBalance;
      }

      setGiftingItemId(null);
      setSelectedGiftRecipient('');

    } catch (err) {
      await showAlert('Erro ao processar a compra.');
    }
    setPurchasing(null);
  };

  const handleBuyFromMarket = async (item: MarketItem) => {
    if (!userData.uid) return;
    
    const isStaff = userData.role !== 'student';
    const currentBalance = economyType === 'xp' ? (userData.xp || 0) : (userData.coins || 0);
    
    if (!isStaff && currentBalance < item.price) {
      await showAlert(`Você não tem saldo suficiente para comprar este item.`);
      return;
    }

    const currentRank = getRankForXp(userData.xp || 0);
    const currentRankIndex = RANKS.findIndex(r => r.name === currentRank.name) || 0;
    const maxInventorySpace = 6 + currentRankIndex + (userData.extraInventorySpace || 0);
    if (!isStaff && myInventoryCount >= maxInventorySpace) {
      await showAlert("Sua mochila está cheia!");
      return;
    }

    const confirmed = await showConfirm(`Comprar "${item.itemTitle}" de ${item.sellerName} por ${item.price}?`);
    if (!confirmed) return;

    setPurchasing(item.id);

    try {
      let newBalance = currentBalance;
      if (!isStaff) {
        newBalance = currentBalance - item.price;
        const userRef = doc(db, 'users', userData.uid);
        if (economyType === 'xp') {
          await updateDoc(userRef, { xp: newBalance });
        } else {
          await updateDoc(userRef, { coins: newBalance });
        }
        if (economyType === 'xp') userData.xp = newBalance;
        else userData.coins = newBalance;
      }

      // Transferir pagamento para o vendedor (Descontando 10% de taxa)
      const sellerRef = doc(db, 'users', item.studentId);
      const sellerSnap = await getDoc(sellerRef);
      if (sellerSnap.exists()) {
        const netValue = Math.floor(item.price * 0.90); // 10% tax
        if (economyType === 'xp') {
          const sellerXp = (sellerSnap.data().xp || 0) + netValue;
          await updateDoc(sellerRef, { xp: sellerXp });
        } else {
          const sellerCoins = (sellerSnap.data().coins || 0) + netValue;
          await updateDoc(sellerRef, { coins: sellerCoins });
        }
      }

      // Alterar dono do item
      await updateDoc(doc(db, 'user_items', item.id), {
        studentId: userData.uid,
        forSale: false,
        price: null,
        sellerName: null,
        equipped: false,
        purchasedAt: serverTimestamp()
      });

      await showAlert("Compra no Mercado realizada com sucesso!");
      fetchStoreData(); // Recarrega loja

    } catch (err) {
      await showAlert('Erro ao processar a compra no mercado.');
    }
    setPurchasing(null);
  };

  const handleCancelSale = async (item: MarketItem) => {
    const isStaff = userData.role !== 'student';
    const currentRank = getRankForXp(userData.xp || 0);
    const currentRankIndex = RANKS.findIndex(r => r.name === currentRank.name) || 0;
    const maxInventorySpace = 6 + currentRankIndex + (userData.extraInventorySpace || 0);

    if (!isStaff && myInventoryCount >= maxInventorySpace) {
      await showAlert("Sua mochila está cheia! Você não pode cancelar a venda enquanto não tiver espaço para receber o item de volta.");
      return;
    }

    const confirmed = await showConfirm(`Tem certeza que deseja cancelar a venda de "${item.itemTitle}"? Ele voltará para sua mochila.`);
    if (!confirmed) return;

    try {
      await updateDoc(doc(db, 'user_items', item.id), {
        forSale: false,
        price: null,
        sellerName: null
      });
      await showAlert("Venda cancelada! O item voltou para sua mochila.");
      fetchStoreData();
    } catch (err) {
      await showAlert("Erro ao cancelar a venda.");
    }
  };

  const handleEditPrice = async (item: MarketItem) => {
    const priceStr = window.prompt(`Digite o novo preço para "${item.itemTitle}":`, item.price.toString());
    if (!priceStr) return;
    
    const price = parseInt(priceStr, 10);
    if (isNaN(price) || price <= 0) {
      await showAlert("Valor inválido!");
      return;
    }

    try {
      await updateDoc(doc(db, 'user_items', item.id), { price: price });
      await showAlert("Preço atualizado com sucesso!");
      fetchStoreData();
    } catch (err) {
      await showAlert("Erro ao atualizar o preço.");
    }
  };

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>Carregando a loja...</div>;

  const currentBalance = economyType === 'xp' ? (userData.xp || 0) : (userData.coins || 0);
  const currentRank = getRankForXp(userData.xp || 0);
  const currentRankIndex = RANKS.findIndex(r => r.name === currentRank.name) || 0;
  const maxInventorySpace = 6 + currentRankIndex + (userData.extraInventorySpace || 0);

  return (
    <div style={{ animation: 'fadeIn 0.3s ease-out' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '2rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Store color="var(--gold-primary)" /> Lojas do Acampamento
        </h2>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <div style={{ color: 'var(--text-secondary)', background: 'rgba(0,0,0,0.3)', padding: '0.75rem 1rem', borderRadius: '12px' }}>
             Mochila: <strong style={{ color: myInventoryCount >= maxInventorySpace ? 'var(--accent-red)' : 'var(--accent-green)' }}>{myInventoryCount}</strong> / {maxInventorySpace}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(0,0,0,0.5)', padding: '0.75rem 1.5rem', borderRadius: '20px', border: '1px solid var(--gold-primary)' }}>
            {economyType === 'xp' ? <Star color="var(--gold-primary)" /> : <Coins color="var(--gold-primary)" />}
            <span style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--gold-primary)' }}>
              Saldo: {userData.role !== 'student' ? 'Infinito (Staff)' : `${currentBalance} ${economyType === 'xp' ? 'XP' : 'Moedas'}`}
            </span>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
        <button 
          onClick={() => setActiveTab('official')}
          className="login-btn"
          style={{ flex: 1, background: activeTab === 'official' ? 'var(--gold-primary)' : 'var(--bg-card)', color: activeTab === 'official' ? 'black' : 'white', fontWeight: 'bold' }}
        >
          Loja Oficial
        </button>
        <button 
          onClick={() => setActiveTab('market')}
          className="login-btn"
          style={{ flex: 1, background: activeTab === 'market' ? 'var(--gold-primary)' : 'var(--bg-card)', color: activeTab === 'market' ? 'black' : 'white', fontWeight: 'bold' }}
        >
          Bazar de Jogadores
        </button>
      </div>

      {activeTab === 'official' && (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '2rem' }}>
        {items.map(item => {
          const isStaff = userData.role !== 'student';
          const canAfford = isStaff || currentBalance >= item.cost;
          const currentRank = getRankForXp(userData.xp || 0);
    const currentRankIndex = RANKS.findIndex(r => r.name === currentRank.name) || 0;
          const meetsRank = isStaff || currentRankIndex >= item.minRankRequired;
          const isGiftingThis = giftingItemId === item.id;

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
                   {isStaff ? 'Grátis' : `${item.cost} ${economyType === 'xp' ? 'XP' : 'Moedas'}`}
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
                  <>
                    {!isGiftingThis ? (
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button 
                          className="login-btn" 
                          disabled={!canAfford || purchasing === item.id}
                          onClick={() => handlePurchase(item, false)}
                          style={{ 
                            flex: 2,
                            background: canAfford ? 'var(--gold-primary)' : 'rgba(255,255,255,0.1)', 
                            color: canAfford ? 'black' : 'var(--text-secondary)', 
                            border: 'none', 
                            padding: '0.75rem', 
                            fontSize: '1rem',
                            opacity: canAfford ? 1 : 0.5,
                            cursor: canAfford ? 'pointer' : 'not-allowed'
                          }}
                        >
                          {purchasing === item.id ? '...' : canAfford ? 'Comprar' : 'Sem Saldo'}
                        </button>
                        <button 
                          className="login-btn"
                          disabled={!canAfford}
                          onClick={() => setGiftingItemId(item.id)}
                          style={{ 
                            flex: 1,
                            background: 'rgba(251, 191, 36, 0.1)', 
                            color: 'var(--gold-primary)', 
                            border: '1px solid var(--gold-primary)', 
                            padding: '0.75rem',
                            opacity: canAfford ? 1 : 0.5,
                            cursor: canAfford ? 'pointer' : 'not-allowed'
                          }}
                        >
                          Presente
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <select 
                          value={selectedGiftRecipient} 
                          onChange={(e) => setSelectedGiftRecipient(e.target.value)}
                          style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', color: 'white' }}
                        >
                          <option value="">Selecione o Aluno...</option>
                          {students.filter(s => s.uid !== userData.uid).map(s => (
                            <option key={s.uid} value={s.uid}>{s.name} ({s.classId || 'Sem Turma'})</option>
                          ))}
                        </select>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button onClick={() => { setGiftingItemId(null); setSelectedGiftRecipient(''); }} style={{ flex: 1, background: 'transparent', border: '1px solid var(--border-glass)', color: 'white', borderRadius: '8px', padding: '0.5rem' }}>Cancelar</button>
                          <button 
                            disabled={!selectedGiftRecipient || purchasing === item.id} 
                            onClick={() => handlePurchase(item, true)} 
                            style={{ flex: 1, background: 'var(--gold-primary)', border: 'none', color: 'black', borderRadius: '8px', padding: '0.5rem', fontWeight: 'bold' }}
                          >
                            Enviar
                          </button>
                        </div>
                      </div>
                    )}
                  </>
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
      )}

      {activeTab === 'market' && (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '2rem' }}>
        {marketItems.length === 0 && (
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
            Nenhum item à venda no Bazar no momento.
          </div>
        )}
        {marketItems.map(item => {
          const isStaff = userData.role !== 'student';
          const canAfford = isStaff || currentBalance >= item.price;
          
          return (
            <div key={item.id} className="glass-panel" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <div style={{ height: '150px', width: '100%', position: 'relative', background: 'var(--bg-dark)' }}>
                {item.itemImageUrl ? (
                  <img src={item.itemImageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                ) : (
                  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Store size={48} color="var(--text-secondary)" />
                  </div>
                )}
                <div style={{ position: 'absolute', top: '10px', right: '10px', background: canAfford ? 'rgba(0,0,0,0.8)' : 'rgba(239, 68, 68, 0.9)', padding: '0.5rem 1rem', borderRadius: '20px', border: `1px solid ${canAfford ? 'var(--gold-primary)' : 'var(--accent-red)'}`, color: canAfford ? 'var(--gold-primary)' : 'white', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                   {item.price} {economyType === 'xp' ? 'XP' : 'Moedas'}
                </div>
              </div>
              <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', flex: 1 }}>
                <h3 style={{ fontSize: '1.25rem', margin: '0 0 0.5rem 0' }}>{item.itemTitle}</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                  Vendido por: <strong style={{ color: 'var(--gold-primary)' }}>{item.sellerName}</strong>
                </p>
                <div style={{ flex: 1, marginBottom: '1rem' }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', background: 'rgba(0,0,0,0.3)', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>
                    {item.itemType === 'consumable' ? 'Consumível' : 'Equipável'}
                  </span>
                </div>
                
                {item.studentId === userData.uid ? (
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button 
                      className="login-btn" 
                      onClick={() => handleEditPrice(item)}
                      style={{ flex: 1, background: 'rgba(59, 130, 246, 0.2)', color: '#60A5FA', border: '1px solid rgba(59, 130, 246, 0.3)', padding: '0.75rem', fontSize: '0.9rem' }}
                    >
                      Editar Preço
                    </button>
                    <button 
                      className="login-btn" 
                      onClick={() => handleCancelSale(item)}
                      style={{ flex: 1, background: 'rgba(239, 68, 68, 0.2)', color: '#F87171', border: '1px solid rgba(239, 68, 68, 0.3)', padding: '0.75rem', fontSize: '0.9rem' }}
                    >
                      Cancelar Venda
                    </button>
                  </div>
                ) : (
                  <button 
                    className="login-btn" 
                    disabled={!canAfford || purchasing === item.id}
                    onClick={() => handleBuyFromMarket(item)}
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
                    {purchasing === item.id ? '...' : canAfford ? 'Comprar do Jogador' : 'Sem Saldo'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      )}
    </div>
  );
}
