import { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, query, getDocs, doc, getDoc, addDoc, updateDoc, serverTimestamp, where, deleteDoc } from 'firebase/firestore';
import { Coins, Star, ShieldAlert, Store, Search, Filter, LayoutGrid, Grid, List as ListIcon } from 'lucide-react';
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
  rarity?: string;
}

const getAttributeName = (type: string) => {
  switch(type) {
    case 'attack': return 'Ataque';
    case 'defense': return 'Defesa';
    case 'xp': return 'XP Extra';
    case 'coins': return 'Moedas Extras';
    case 'vitality': return 'Vitalidade';
    case 'fortitude': return 'Fortitude';
    case 'persuasion': return 'Persuasão';
    default: return type;
  }
};

const getRarityColor = (rarity?: string) => {
  switch (rarity) {
    case 'legendary': return 'var(--gold-primary)'; // Or 'orange'
    case 'epic': return '#A855F7'; // Roxo
    case 'rare': return '#3B82F6'; // Azul
    case 'uncommon': return '#22C55E'; // Verde
    case 'common':
    default: return 'var(--text-primary)'; // Branca/transparente
  }
};

export default function StudentStore({ userData }: { userData: UserData }) {
  const { showAlert, showConfirm, showPrompt } = useDialog();
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
  const [giftWrapItemIds, setGiftWrapItemIds] = useState<string[]>([]);

  // Filtros e View
  const [viewMode, setViewMode] = useState<'grid-large' | 'grid-small' | 'list'>(
    (localStorage.getItem('store_viewMode') as any) || 'grid-large'
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>(localStorage.getItem('store_filterType') || 'all');
  const [filterRarity, setFilterRarity] = useState<string>(localStorage.getItem('store_filterRarity') || 'all');
  const [sortBy, setSortBy] = useState<string>(localStorage.getItem('store_sortBy') || 'name-asc');

  useEffect(() => {
    localStorage.setItem('store_viewMode', viewMode);
    localStorage.setItem('store_filterType', filterType);
    localStorage.setItem('store_filterRarity', filterRarity);
    localStorage.setItem('store_sortBy', sortBy);
  }, [viewMode, filterType, filterRarity, sortBy]);

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
      const wrapIds: string[] = [];
      const groupedConsumables = new Set<string>();

      myItemsSnap.forEach(doc => {
        const d = doc.data();
        if (!d.forSale && d.studentId !== 'dropped') {
          if (d.itemType === 'consumable') {
            const key = `${d.itemId}-${d.giftedBy || 'self'}`;
            if (!groupedConsumables.has(key)) {
              groupedConsumables.add(key);
              count++;
            }
          } else {
            count++;
          }

          if (d.gameEffect === 'gift_wrap') {
            wrapIds.push(doc.id);
          }
        }
      });
      setMyInventoryCount(count);
      setGiftWrapItemIds(wrapIds);
    }

    setLoading(false);
  };

  const handlePurchase = async (item: StoreItem, isGift: boolean = false, paymentMethod?: 'xp' | 'coins') => {
    if (!userData.uid) return;

    const recipientId = isGift ? selectedGiftRecipient : userData.uid;
    if (isGift && !recipientId) {
      await showAlert("Por favor, selecione um aluno para presentear.");
      return;
    }

    const isStaff = userData.role !== 'student';
    const method = paymentMethod || economyType;
    const finalCost = (economyType === 'xp' && method === 'coins') ? item.cost * 10 : item.cost;
    const balanceToCheck = method === 'xp' ? (userData.xp || 0) : (userData.coins || 0);
    
    if (!isStaff && balanceToCheck < finalCost) {
      await showAlert(`Você não tem ${method === 'xp' ? 'XP' : 'Moedas'} suficiente.`);
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
    const costText = isStaff ? 'gratuitamente (Staff)' : `por ${finalCost} ${method === 'xp' ? 'XP' : 'Moedas'}`;
    const confirmed = await showConfirm(`Confirmar ${actionText} "${item.title}" ${costText}?`);
    if (!confirmed) return;

    setPurchasing(item.id);

    try {
      if (isGift && !isStaff) {
        if (giftWrapItemIds.length === 0) {
          await showAlert("Você não tem nenhuma Caixa de Presente no inventário.");
          setPurchasing(null);
          return;
        }
        // Consumir a caixa de presente
        const boxIdToConsume = giftWrapItemIds[0];
        await deleteDoc(doc(db, 'user_items', boxIdToConsume));
        setGiftWrapItemIds(prev => prev.slice(1));
      }

      // Deduzir valor Apenas de Alunos
      let newBalance = balanceToCheck;
      if (!isStaff) {
        newBalance = balanceToCheck - finalCost;
        const userRef = doc(db, 'users', userData.uid);
        
        if (method === 'xp') {
          await updateDoc(userRef, { xp: newBalance });
          await addDoc(collection(db, 'xp_logs'), {
            studentId: userData.uid,
            evalName: `Compra na Loja: ${item.title} ${isGift ? '(Presente)' : ''}`,
            xpGained: -finalCost,
            timestamp: serverTimestamp()
          });
          userData.xp = newBalance;
        } else {
          await updateDoc(userRef, { coins: newBalance });
          userData.coins = newBalance;
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
        gameModelUrl: item.gameModelUrl || '',
        adds: finalAdds
      });

      await showAlert(isGift ? 'Presente enviado com sucesso!' : 'Item comprado com sucesso! Acesse seu Inventário.');

      setGiftingItemId(null);
      setSelectedGiftRecipient('');
      
      // Atualiza o limite de mochila e balance
      fetchStoreData();
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
    const priceStr = await showPrompt(`Digite o novo preço para "${item.itemTitle}":`, item.price?.toString() || '');
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

  const getProcessedItems = () => {
    let result = [...items];
    if (searchQuery) {
      result = result.filter(i => i.title.toLowerCase().includes(searchQuery.toLowerCase()) || i.description.toLowerCase().includes(searchQuery.toLowerCase()));
    }
    if (filterType !== 'all') result = result.filter(i => i.type === filterType);
    if (filterRarity !== 'all') result = result.filter(i => (i.rarity || 'common') === filterRarity);
    
    result.sort((a, b) => {
      if (sortBy === 'name-asc') return a.title.localeCompare(b.title);
      if (sortBy === 'name-desc') return b.title.localeCompare(a.title);
      if (sortBy === 'price-asc') return a.cost - b.cost;
      if (sortBy === 'price-desc') return b.cost - a.cost;
      if (sortBy === 'rarity-desc') {
        const order: Record<string, number> = { legendary: 5, epic: 4, rare: 3, uncommon: 2, common: 1 };
        return (order[b.rarity || 'common'] || 1) - (order[a.rarity || 'common'] || 1);
      }
      if (sortBy === 'rarity-asc') {
        const order: Record<string, number> = { legendary: 5, epic: 4, rare: 3, uncommon: 2, common: 1 };
        return (order[a.rarity || 'common'] || 1) - (order[b.rarity || 'common'] || 1);
      }
      return 0;
    });
    return result;
  };

  const getProcessedMarketItems = () => {
    let result = [...marketItems];
    if (searchQuery) result = result.filter(i => i.itemTitle.toLowerCase().includes(searchQuery.toLowerCase()));
    if (filterType !== 'all') result = result.filter(i => i.itemType === filterType);
    if (filterRarity !== 'all') result = result.filter(i => (i.rarity || 'common') === filterRarity);
    
    result.sort((a, b) => {
      if (sortBy === 'name-asc') return a.itemTitle.localeCompare(b.itemTitle);
      if (sortBy === 'name-desc') return b.itemTitle.localeCompare(a.itemTitle);
      if (sortBy === 'price-asc') return (a.price || 0) - (b.price || 0);
      if (sortBy === 'price-desc') return (b.price || 0) - (a.price || 0);
      return 0;
    });
    return result;
  };

  const processedItems = getProcessedItems();
  const processedMarketItems = getProcessedMarketItems();

  const getGridStyle = () => {
    if (viewMode === 'grid-small') return { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' };
    if (viewMode === 'list') return { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: '1rem' };
    return { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '2rem' };
  };

  return (
    <div style={{ animation: 'fadeIn 0.3s ease-out' }}>
      <div style={{ position: 'sticky', top: '75px', zIndex: 10, background: 'var(--bg-dark)', paddingBottom: '1rem', paddingTop: '1rem', borderBottom: '1px solid var(--border-glass)', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '2rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Store color="var(--gold-primary)" /> Lojas do Acampamento
          </h2>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <div style={{ color: 'var(--text-secondary)', background: 'rgba(0,0,0,0.3)', padding: '0.75rem 1rem', borderRadius: '12px' }}>
               Mochila: <strong style={{ color: myInventoryCount >= maxInventorySpace ? 'var(--accent-red)' : 'var(--accent-green)' }}>{myInventoryCount}</strong> / {maxInventorySpace}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(0,0,0,0.5)', padding: '0.75rem 1.5rem', borderRadius: '20px', border: '1px solid var(--gold-primary)' }}>
              {economyType === 'xp' ? (
                <>
                  <Star color="var(--gold-primary)" />
                  <span style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--gold-primary)', marginRight: '1rem' }}>
                    {userData.role !== 'student' ? 'Infinito (Staff)' : `${userData.xp || 0} XP`}
                  </span>
                  <Coins color="var(--gold-primary)" />
                  <span style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--gold-primary)' }}>
                    {userData.role !== 'student' ? '' : `${userData.coins || 0} Moedas`}
                  </span>
                </>
              ) : (
                <>
                  <Coins color="var(--gold-primary)" />
                  <span style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--gold-primary)' }}>
                    {userData.role !== 'student' ? 'Infinito (Staff)' : `${userData.coins || 0} Moedas`}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
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

        {/* Barra de Filtros */}
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: 1, minWidth: '200px', display: 'flex', alignItems: 'center', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', borderRadius: '8px', padding: '0 0.75rem' }}>
            <Search size={18} color="var(--text-secondary)" />
            <input type="text" placeholder="Buscar item..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} style={{ width: '100%', padding: '0.75rem', background: 'transparent', border: 'none', color: 'white', outline: 'none' }} />
          </div>
          <select value={filterType} onChange={e => setFilterType(e.target.value)} style={{ padding: '0.75rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', color: 'white' }}>
            <option value="all">Todos os Tipos</option>
            <option value="consumable">Consumível</option>
            <option value="equippable">Equipável</option>
          </select>
          <select value={filterRarity} onChange={e => setFilterRarity(e.target.value)} style={{ padding: '0.75rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', color: 'white' }}>
            <option value="all">Qualquer Raridade</option>
            <option value="common">Comum</option>
            <option value="uncommon">Incomum</option>
            <option value="rare">Raro</option>
            <option value="epic">Épico</option>
            <option value="legendary">Lendário</option>
          </select>
          <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ padding: '0.75rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', color: 'white' }}>
            <option value="name-asc">A-Z</option>
            <option value="name-desc">Z-A</option>
            <option value="price-asc">Menor Preço</option>
            <option value="price-desc">Maior Preço</option>
            <option value="rarity-desc">Raridade (Maior)</option>
            <option value="rarity-asc">Raridade (Menor)</option>
          </select>
          
          <div style={{ display: 'flex', gap: '0.25rem', background: 'rgba(0,0,0,0.3)', padding: '0.25rem', borderRadius: '8px', border: '1px solid var(--border-glass)' }}>
            <button onClick={() => setViewMode('grid-large')} style={{ padding: '0.5rem', background: viewMode === 'grid-large' ? 'rgba(255,255,255,0.1)' : 'transparent', border: 'none', borderRadius: '4px', cursor: 'pointer', color: viewMode === 'grid-large' ? 'white' : 'var(--text-secondary)' }} title="Grid Grande"><LayoutGrid size={20} /></button>
            <button onClick={() => setViewMode('grid-small')} style={{ padding: '0.5rem', background: viewMode === 'grid-small' ? 'rgba(255,255,255,0.1)' : 'transparent', border: 'none', borderRadius: '4px', cursor: 'pointer', color: viewMode === 'grid-small' ? 'white' : 'var(--text-secondary)' }} title="Grid Pequeno"><Grid size={20} /></button>
            <button onClick={() => setViewMode('list')} style={{ padding: '0.5rem', background: viewMode === 'list' ? 'rgba(255,255,255,0.1)' : 'transparent', border: 'none', borderRadius: '4px', cursor: 'pointer', color: viewMode === 'list' ? 'white' : 'var(--text-secondary)' }} title="Lista"><ListIcon size={20} /></button>
          </div>
        </div>
      </div>

      {activeTab === 'official' && (
      <div style={getGridStyle()}>
        {processedItems.map(item => {
          const isStaff = userData.role !== 'student';
          const canAfford = isStaff || currentBalance >= item.cost;
          const currentRank = getRankForXp(userData.xp || 0);
    const currentRankIndex = RANKS.findIndex(r => r.name === currentRank.name) || 0;
          const meetsRank = isStaff || currentRankIndex >= item.minRankRequired;
          const isGiftingThis = giftingItemId === item.id;

          const isList = viewMode === 'list';
          const rarityColor = getRarityColor(item.rarity);

          return (
            <div key={item.id} className="glass-panel" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: isList ? 'row' : 'column', border: `1px solid ${rarityColor}` }}>
              <div style={{ height: isList ? '100%' : (viewMode === 'grid-small' ? '100px' : '150px'), width: isList ? '120px' : '100%', position: 'relative', background: 'var(--bg-dark)', flexShrink: 0 }}>
                {item.imageUrl ? (
                  <img src={item.imageUrl} alt={item.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Store size={isList || viewMode === 'grid-small' ? 32 : 48} color="var(--text-secondary)" />
                  </div>
                )}
                {!isList && (
                  <div style={{ position: 'absolute', top: '5px', right: '5px', background: canAfford ? 'rgba(0,0,0,0.8)' : 'rgba(239, 68, 68, 0.9)', padding: '0.25rem 0.5rem', borderRadius: '12px', border: `1px solid ${canAfford ? 'var(--gold-primary)' : 'var(--accent-red)'}`, color: canAfford ? 'var(--gold-primary)' : 'white', fontWeight: 'bold', fontSize: '0.8rem' }}>
                     {isStaff ? 'Grátis' : `${item.cost} ${economyType === 'xp' ? 'XP' : 'M'}`}
                  </div>
                )}
              </div>
              <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', flex: 1, gap: '0.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <h3 style={{ fontSize: viewMode === 'grid-small' ? '1rem' : '1.25rem', margin: 0, color: rarityColor }}>{item.title}</h3>
                  {isList && (
                    <div style={{ background: canAfford ? 'rgba(0,0,0,0.8)' : 'rgba(239, 68, 68, 0.9)', padding: '0.25rem 0.5rem', borderRadius: '12px', border: `1px solid ${canAfford ? 'var(--gold-primary)' : 'var(--accent-red)'}`, color: canAfford ? 'var(--gold-primary)' : 'white', fontWeight: 'bold', fontSize: '0.8rem' }}>
                       {isStaff ? 'Grátis' : `${item.cost} ${economyType === 'xp' ? 'XP' : 'M'}`}
                    </div>
                  )}
                </div>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: 0, flex: 1, display: viewMode === 'grid-small' ? '-webkit-box' : 'block', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {item.description}
                </p>
                
                {!meetsRank ? (
                  <div style={{ padding: '0.75rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--accent-red)', borderRadius: '8px', color: 'var(--accent-red)', fontSize: '0.9rem', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                    <ShieldAlert size={16} /> Requer Patente: {RANKS[item.minRankRequired]?.name}
                  </div>
                ) : (
                  <>
                    {!isGiftingThis ? (
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', flexDirection: viewMode === 'grid-small' ? 'column' : 'row' }}>
                        {economyType === 'xp' ? (
                           <>
                            <button 
                              className="login-btn" 
                              disabled={!canAfford || purchasing === item.id}
                              onClick={() => handlePurchase(item, false, 'xp')}
                              style={{ 
                                flex: 1,
                                background: canAfford ? 'var(--gold-primary)' : 'rgba(255,255,255,0.1)', 
                                color: canAfford ? 'black' : 'var(--text-secondary)', 
                                border: 'none', 
                                padding: viewMode === 'grid-small' ? '0.4rem' : '0.5rem', 
                                fontSize: viewMode === 'grid-small' ? '0.75rem' : '0.9rem',
                                opacity: canAfford ? 1 : 0.5,
                                cursor: canAfford ? 'pointer' : 'not-allowed'
                              }}
                            >
                              {purchasing === item.id ? '...' : canAfford ? `Comprar (${item.cost} XP)` : 'Sem XP'}
                            </button>
                            <button 
                              className="login-btn" 
                              disabled={(isStaff ? false : ((userData.coins || 0) < item.cost * 10)) || purchasing === item.id}
                              onClick={() => handlePurchase(item, false, 'coins')}
                              style={{ 
                                flex: 1,
                                background: (isStaff ? true : ((userData.coins || 0) >= item.cost * 10)) ? '#fbbf24' : 'rgba(255,255,255,0.1)', 
                                color: (isStaff ? true : ((userData.coins || 0) >= item.cost * 10)) ? 'black' : 'var(--text-secondary)', 
                                border: 'none', 
                                padding: viewMode === 'grid-small' ? '0.4rem' : '0.5rem', 
                                fontSize: viewMode === 'grid-small' ? '0.75rem' : '0.9rem',
                                opacity: (isStaff ? true : ((userData.coins || 0) >= item.cost * 10)) ? 1 : 0.5,
                                cursor: (isStaff ? true : ((userData.coins || 0) >= item.cost * 10)) ? 'pointer' : 'not-allowed'
                              }}
                            >
                              {purchasing === item.id ? '...' : (isStaff ? true : ((userData.coins || 0) >= item.cost * 10)) ? `Comprar (${item.cost * 10} Moedas)` : 'Sem Moedas'}
                            </button>
                           </>
                        ) : (
                          <button 
                            className="login-btn" 
                            disabled={!canAfford || purchasing === item.id}
                            onClick={() => handlePurchase(item, false)}
                            style={{ 
                              flex: 2,
                              background: canAfford ? 'var(--gold-primary)' : 'rgba(255,255,255,0.1)', 
                              color: canAfford ? 'black' : 'var(--text-secondary)', 
                              border: 'none', 
                              padding: viewMode === 'grid-small' ? '0.5rem' : '0.75rem', 
                              fontSize: viewMode === 'grid-small' ? '0.85rem' : '1rem',
                              opacity: canAfford ? 1 : 0.5,
                              cursor: canAfford ? 'pointer' : 'not-allowed'
                            }}
                          >
                            {purchasing === item.id ? '...' : canAfford ? 'Comprar' : 'Sem Saldo'}
                          </button>
                        )}
                        
                        {(userData.role !== 'student' || giftWrapItemIds.length > 0) && (
                          <button 
                            className="login-btn"
                            disabled={false} // Gift button just opens the sub-menu, so keep it enabled if they want to choose gift
                            onClick={() => setGiftingItemId(item.id)}
                            style={{ 
                              flex: 1,
                              background: 'rgba(251, 191, 36, 0.1)', 
                              color: 'var(--gold-primary)', 
                              border: '1px solid var(--gold-primary)', 
                              padding: viewMode === 'grid-small' ? '0.4rem' : '0.75rem',
                              fontSize: viewMode === 'grid-small' ? '0.8rem' : '1rem',
                              cursor: 'pointer'
                            }}
                          >
                            Presente
                          </button>
                        )}
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
                          {economyType === 'xp' ? (
                            <>
                              <button 
                                disabled={!selectedGiftRecipient || (!canAfford && !isStaff) || purchasing === item.id} 
                                onClick={() => handlePurchase(item, true, 'xp')} 
                                style={{ flex: 1, background: 'var(--gold-primary)', border: 'none', color: 'black', borderRadius: '8px', padding: '0.5rem', fontWeight: 'bold' }}
                              >
                                Enviar ({item.cost} XP)
                              </button>
                              <button 
                                disabled={!selectedGiftRecipient || (!isStaff && (userData.coins || 0) < item.cost * 10) || purchasing === item.id} 
                                onClick={() => handlePurchase(item, true, 'coins')} 
                                style={{ flex: 1, background: '#fbbf24', border: 'none', color: 'black', borderRadius: '8px', padding: '0.5rem', fontWeight: 'bold' }}
                              >
                                Enviar ({item.cost * 10} Moedas)
                              </button>
                            </>
                          ) : (
                            <button 
                              disabled={!selectedGiftRecipient || (!canAfford && !isStaff) || purchasing === item.id} 
                              onClick={() => handlePurchase(item, true)} 
                              style={{ flex: 1, background: 'var(--gold-primary)', border: 'none', color: 'black', borderRadius: '8px', padding: '0.5rem', fontWeight: 'bold' }}
                            >
                              Enviar
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
        {processedItems.length === 0 && (
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
            <Store size={48} style={{ margin: '0 auto 1rem auto', opacity: 0.5 }} />
            <p>Nenhum item encontrado.</p>
          </div>
        )}
      </div>
      )}

      {activeTab === 'market' && (
      <div style={getGridStyle()}>
        {processedMarketItems.length === 0 && (
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
            Nenhum item encontrado no Bazar.
          </div>
        )}
        {processedMarketItems.map(item => {
          const isStaff = userData.role !== 'student';
          const canAfford = isStaff || currentBalance >= (item.price || 0);
          const isList = viewMode === 'list';
          const rarityColor = getRarityColor(item.rarity);
          
          return (
            <div key={item.id} className="glass-panel" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: isList ? 'row' : 'column', border: `1px solid ${rarityColor}` }}>
              <div style={{ height: isList ? '100%' : (viewMode === 'grid-small' ? '100px' : '150px'), width: isList ? '120px' : '100%', position: 'relative', background: 'var(--bg-dark)', flexShrink: 0 }}>
                {item.itemImageUrl ? (
                  <img src={item.itemImageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Store size={isList || viewMode === 'grid-small' ? 32 : 48} color="var(--text-secondary)" />
                  </div>
                )}
                {!isList && (
                  <div style={{ position: 'absolute', top: '5px', right: '5px', background: canAfford ? 'rgba(0,0,0,0.8)' : 'rgba(239, 68, 68, 0.9)', padding: '0.25rem 0.5rem', borderRadius: '12px', border: `1px solid ${canAfford ? 'var(--gold-primary)' : 'var(--accent-red)'}`, color: canAfford ? 'var(--gold-primary)' : 'white', fontWeight: 'bold', fontSize: '0.8rem' }}>
                    {item.price || 0} {economyType === 'xp' ? 'XP' : 'Moedas'}
                  </div>
                )}
              </div>
              <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', flex: 1, gap: '0.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <h3 style={{ fontSize: viewMode === 'grid-small' ? '1rem' : '1.25rem', margin: 0, color: rarityColor }}>{item.itemTitle}</h3>
                  {isList && (
                    <div style={{ background: canAfford ? 'rgba(0,0,0,0.8)' : 'rgba(239, 68, 68, 0.9)', padding: '0.25rem 0.5rem', borderRadius: '12px', border: `1px solid ${canAfford ? 'var(--gold-primary)' : 'var(--accent-red)'}`, color: canAfford ? 'var(--gold-primary)' : 'white', fontWeight: 'bold', fontSize: '0.8rem' }}>
                      {item.price || 0} {economyType === 'xp' ? 'XP' : 'M'}
                    </div>
                  )}
                </div>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                  Vendido por: <strong style={{ color: 'var(--gold-primary)' }}>{item.sellerName}</strong>
                </p>
                <div style={{ flex: 1, marginBottom: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <div>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', background: 'rgba(0,0,0,0.3)', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>
                      {item.itemType === 'consumable' ? 'Consumível' : 'Equipável'}
                    </span>
                  </div>
                  {item.itemType === 'equippable' && item.baseAttributeType && item.baseAttributeType !== 'none' && (
                    <div style={{ marginTop: '0.5rem', fontSize: '0.9rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      <div style={{ color: 'var(--text-primary)' }}>
                        <strong style={{ color: 'var(--gold-primary)' }}>+{item.baseAttributeValue}</strong> {getAttributeName(item.baseAttributeType)}
                      </div>
                      {item.adds && item.adds.length > 0 && item.adds.map((add, idx) => (
                        <div key={idx} style={{ color: 'var(--text-secondary)' }}>
                          <strong style={{ color: '#60A5FA' }}>+{add.value}</strong> {getAttributeName(add.type)}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                
                {item.studentId === userData.uid ? (
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', flexDirection: viewMode === 'grid-small' ? 'column' : 'row' }}>
                    <button 
                      className="login-btn" 
                      onClick={() => handleEditPrice(item)}
                      style={{ flex: 1, background: 'rgba(59, 130, 246, 0.2)', color: '#60A5FA', border: '1px solid rgba(59, 130, 246, 0.3)', padding: viewMode === 'grid-small' ? '0.5rem' : '0.75rem', fontSize: viewMode === 'grid-small' ? '0.8rem' : '0.9rem' }}
                    >
                      Editar Preço
                    </button>
                    <button 
                      className="login-btn" 
                      onClick={() => handleCancelSale(item)}
                      style={{ flex: 1, background: 'rgba(239, 68, 68, 0.2)', color: '#F87171', border: '1px solid rgba(239, 68, 68, 0.3)', padding: viewMode === 'grid-small' ? '0.5rem' : '0.75rem', fontSize: viewMode === 'grid-small' ? '0.8rem' : '0.9rem' }}
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
                      padding: viewMode === 'grid-small' ? '0.5rem' : '0.75rem', 
                      fontSize: viewMode === 'grid-small' ? '0.85rem' : '1rem',
                      opacity: canAfford ? 1 : 0.5,
                      cursor: canAfford ? 'pointer' : 'not-allowed'
                    }}
                  >
                    {purchasing === item.id ? '...' : canAfford ? 'Comprar' : 'Sem Saldo'}
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
