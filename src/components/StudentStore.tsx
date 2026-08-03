import { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, query, getDocs, doc, getDoc, addDoc, updateDoc, serverTimestamp, where, deleteDoc } from 'firebase/firestore';
import { Coins, Star, ShieldAlert, Store, Search, LayoutGrid, Grid, List as ListIcon } from 'lucide-react';
import type { UserData } from '../contexts/AuthContext';
import { useDialog } from '../contexts/DialogContext';
import { RANKS, getRankForXp } from '../lib/ranks';
import { type ItemCategory, type AttributeType, type ItemAdd, rollItemAdds, calculateTotalStats, fetchGlobalGachaConfig } from '../lib/gacha';
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
const getRarityLabel = (rarity?: string) => {
  switch (rarity) {
    case 'legendary': return 'Lendário';
    case 'epic': return 'Épico';
    case 'rare': return 'Raro';
    case 'uncommon': return 'Incomum';
    case 'common':
    default: return 'Comum';
  }
};

export default function StudentStore({ userData }: { userData: UserData }) {
  const { showAlert, showConfirm, showPrompt, showToast } = useDialog();
  const [activeTab, setActiveTab] = useState<'official' | 'market'>('official');
  const [items, setItems] = useState<StoreItem[]>([]);
  const [marketItems, setMarketItems] = useState<MarketItem[]>([]);
  const [myInventoryCount, setMyInventoryCount] = useState(0);
  const [myConsumableQuantities, setMyConsumableQuantities] = useState<Record<string, number>>({});
  const [totalEquippedStats, setTotalEquippedStats] = useState(calculateTotalStats([]));
  const [economyType, setEconomyType] = useState<'xp' | 'coins'>('coins');
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  
  // Presente (Gifting)
  const [students, setStudents] = useState<UserData[]>([]);
  const [giftingItemId, setGiftingItemId] = useState<string | null>(null);
  const [selectedGiftRecipient, setSelectedGiftRecipient] = useState<string>('');
  const [giftWrapItemIds, setGiftWrapItemIds] = useState<string[]>([]);
  
  // Market Buy Modal
  const [marketBuyModalItem, setMarketBuyModalItem] = useState<MarketItem | null>(null);
  const [marketBuyQuantity, setMarketBuyQuantity] = useState(1);
  const [marketBuyPaymentMethod, setMarketBuyPaymentMethod] = useState<'xp' | 'coins'>('xp');

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

    // Carregar inventário do aluno
    if (userData.uid) {
      const myItemsQ = query(collection(db, 'user_items'), where('studentId', '==', userData.uid));
      const myItemsSnap = await getDocs(myItemsQ);
      let count = 0;
      const wrapIds: string[] = [];
      const consumableQuantities: Record<string, number> = {};
      const equippedItemsForStats: any[] = [];

      myItemsSnap.forEach(doc => {
        const d = doc.data();
        if (!d.forSale && d.studentId !== 'dropped') {
          if (d.equipped) {
            equippedItemsForStats.push(d);
          }
          if (d.itemType === 'consumable') {
            const key = d.itemId;
            if (!d.equipped) {
              consumableQuantities[key] = (consumableQuantities[key] || 0) + (d.quantity || 1);
            }
          } else {
            if (!d.equipped) count++;
          }

          if (d.gameEffect === 'gift_wrap') {
            wrapIds.push(doc.id);
          }
        }
      });
      
      Object.values(consumableQuantities).forEach((qty) => {
         count += Math.ceil(qty / 99);
      });
      
      setMyConsumableQuantities(consumableQuantities);
      setMyInventoryCount(count);
      setGiftWrapItemIds(wrapIds);
      setTotalEquippedStats(calculateTotalStats(equippedItemsForStats));
    }

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
      const originalStoreItem = loaded.find(si => si.id === data.itemId);
      const patchedRarity = data.rarity || originalStoreItem?.rarity || 'common';
      loadedMarket.push({ ...data, id: d.id, rarity: patchedRarity });
    });
    setMarketItems(loadedMarket);

    setLoading(false);
  };

  const handlePurchase = async (item: StoreItem, isGift: boolean = false, paymentMethod?: 'xp' | 'coins') => {
    if (!userData.uid) return;

    const recipientId = isGift ? selectedGiftRecipient : userData.uid;
    if (isGift && !recipientId) {
      showToast("Por favor, selecione um aluno para presentear.", 'error');
      return;
    }

    const isStaff = userData.role !== 'student';
    const method = paymentMethod || economyType;
    let quantityToBuy = item.type === 'consumable' ? (quantities[item.id] || 1) : 1;
    let wasCapped = false;
    
    if (!isStaff) {
      const currentRank = getRankForXp(userData.xp || 0);
      const currentRankIndex = RANKS.findIndex(r => r.name === currentRank.name) || 0;
      if (currentRankIndex < item.minRankRequired) {
        showToast(`Sua patente é muito baixa! Você precisa ser no mínimo ${RANKS[item.minRankRequired].name} para comprar este item.`, 'error');
        return;
      }

      if (!isGift) {
        const extraSlotsFromFortitude = Math.floor(totalEquippedStats.fortitude / 30);
        const maxInventorySpace = 6 + currentRankIndex + (userData.extraInventorySpace || 0) + extraSlotsFromFortitude;
        const availableSlots = Math.max(0, maxInventorySpace - myInventoryCount);

        let maxQuantityAllowed = 0;
        if (item.type === 'equippable') {
          maxQuantityAllowed = availableSlots > 0 ? 1 : 0;
        } else {
          const currentQuantity = myConsumableQuantities[item.id] || 0;
          const capacityInLastSlot = currentQuantity === 0 ? 0 : (currentQuantity % 99 === 0 ? 0 : 99 - (currentQuantity % 99));
          const capacityFromNewSlots = availableSlots * 99;
          maxQuantityAllowed = capacityInLastSlot + capacityFromNewSlots;
        }

        if (maxQuantityAllowed === 0) {
          showToast("Sua mochila ficará cheia! Jogue fora ou venda alguns itens antes de comprar.", 'error');
          return;
        }

        if (quantityToBuy > maxQuantityAllowed) {
          quantityToBuy = maxQuantityAllowed;
          wasCapped = true;
        }
      }
    }

    // Apply Persuasion discount (max 50%)
    const discountMultiplier = Math.max(0.5, 1 - (totalEquippedStats.persuasion / 100));
    
    const unitCost = Math.floor((economyType === 'xp' && method === 'coins') ? item.cost * 10 * discountMultiplier : item.cost * discountMultiplier);
    const finalCost = unitCost * quantityToBuy;
    const balanceToCheck = method === 'xp' ? (userData.xp || 0) : (userData.coins || 0);
    
    if (!isStaff && balanceToCheck < finalCost) {
      showToast(`Você não tem ${method === 'xp' ? 'XP' : 'Moedas'} suficiente para comprar ${quantityToBuy}x.`, 'error');
      return;
    }

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
        const globalGachaConfig = await fetchGlobalGachaConfig();
        finalAdds = rollItemAdds(item.gachaConfig, item.fixedAttributes, (item.useGlobalGacha ?? true) ? globalGachaConfig : undefined);
      }
      
      let remainingToBuy = quantityToBuy;
      while (remainingToBuy > 0) {
        const qty = Math.min(remainingToBuy, 99);
        await addDoc(collection(db, 'user_items'), {
          studentId: recipientId,
          itemId: item.id,
          itemTitle: item.title,
          itemDescription: item.description || '',
          itemType: item.type,
          itemImageUrl: item.imageUrl || '',
          gameEffect: item.gameEffect || 'none',
          usableInQuest: item.usableInQuest || false,
          quantity: qty,
          equipped: false,
          purchasedAt: serverTimestamp(),
          giftedBy: isGift ? userData.name : null,
          avatarPart: item.avatarPart || null,
          itemCategory: item.itemCategory || 'none',
          baseAttributeType: item.baseAttributeType || 'none',
          baseAttributeValue: item.baseAttributeValue || 0,
          gameModelUrl: item.gameModelUrl || '',
          modelTransforms: item.modelTransforms || null,
          adds: finalAdds,
          minSalePrice: item.minSalePrice || 0,
          rarity: item.rarity || 'common'
        });
        remainingToBuy -= qty;
      }

      if (wasCapped) {
        showToast(`Espaço insuficiente na mochila! A compra foi ajustada para ${quantityToBuy}x ${item.title}.`, 'success');
      } else {
        showToast(isGift ? "Presente enviado com sucesso!" : `Compra realizada: ${quantityToBuy}x ${item.title}!`, 'success');
      }
      
      setGiftingItemId(null);
      setSelectedGiftRecipient('');
      
      // Atualiza o limite de mochila e balance
      fetchStoreData();
    } catch (err) {
      showToast('Erro ao processar o pagamento.', 'error');
    }
    setPurchasing(null);
  };

  const submitMarketBuy = async () => {
    if (!userData.uid || !marketBuyModalItem) return;
    
    const isStaff = userData.role !== 'student';
    const currentBalance = economyType === 'xp' 
      ? (marketBuyPaymentMethod === 'xp' ? (userData.xp || 0) : (userData.coins || 0)) 
      : (userData.coins || 0);
      
    // Calcule o preço total
    // O preço base é marketBuyModalItem.price.
    // Se pagar em moedas num sistema XP, é 10x mais caro.
    let basePrice = marketBuyModalItem.price || 0;
    let unitCost = basePrice;
    if (economyType === 'xp' && marketBuyPaymentMethod === 'coins') {
      unitCost = basePrice * 10;
    }
    const totalCost = unitCost * marketBuyQuantity;
    
    if (!isStaff && currentBalance < totalCost) {
      await showAlert(`Você não tem saldo suficiente para comprar este item.`);
      return;
    }

    const currentRank = getRankForXp(userData.xp || 0);
    const currentRankIndex = RANKS.findIndex(r => r.name === currentRank.name) || 0;
    const extraSlotsFromFortitude = Math.floor(totalEquippedStats.fortitude / 30);
    const maxInventorySpace = 6 + currentRankIndex + (userData.extraInventorySpace || 0) + extraSlotsFromFortitude;
    if (!isStaff && myInventoryCount >= maxInventorySpace) {
      await showAlert("Sua mochila está cheia!");
      return;
    }

    setPurchasing(marketBuyModalItem.id);

    try {
      if (!isStaff) {
        const newBalance = currentBalance - totalCost;
        const userRef = doc(db, 'users', userData.uid);
        if (economyType === 'xp') {
          if (marketBuyPaymentMethod === 'xp') {
            await updateDoc(userRef, { xp: newBalance });
            userData.xp = newBalance;
          } else {
            await updateDoc(userRef, { coins: newBalance });
            userData.coins = newBalance;
          }
        } else {
          await updateDoc(userRef, { coins: newBalance });
          userData.coins = newBalance;
        }
      }

      // Transferir pagamento para o vendedor (Descontando 10% de taxa)
      // O vendedor escolheu preferredCurrency (se disponível), senão cai no padrão do sistema
      const sellerRef = doc(db, 'users', marketBuyModalItem.studentId);
      const sellerSnap = await getDoc(sellerRef);
      if (sellerSnap.exists()) {
        const sellerPref = (marketBuyModalItem as any).preferredCurrency || economyType;
        const persuasionBonus = (marketBuyModalItem as any).sellerPersuasion ? (basePrice * ((marketBuyModalItem as any).sellerPersuasion / 100)) : 0;
        
        let sellerUnitReceive = basePrice;
        if (sellerPref === 'coins' && economyType === 'xp') {
          sellerUnitReceive = basePrice * 10; // converte XP pra moedas pro vendedor se ele escolheu Moedas
        }
        const netValuePerUnit = Math.floor((sellerUnitReceive * 0.90) + persuasionBonus);
        const totalNetValue = netValuePerUnit * marketBuyQuantity;

        if (sellerPref === 'xp') {
          const sellerXp = (sellerSnap.data().xp || 0) + totalNetValue;
          await updateDoc(sellerRef, { xp: sellerXp });
        } else {
          const sellerCoins = (sellerSnap.data().coins || 0) + totalNetValue;
          await updateDoc(sellerRef, { coins: sellerCoins });
        }
      }

      if (marketBuyQuantity < (marketBuyModalItem.quantity || 1)) {
        // Comprou parcial: Deduz a quantidade do vendedor, cria um novo item para o comprador
        await updateDoc(doc(db, 'user_items', marketBuyModalItem.id), {
          quantity: (marketBuyModalItem.quantity || 1) - marketBuyQuantity
        });
        
        const { id, docIds, count, forSale, price, sellerName, sellerPersuasion, preferredCurrency, ...itemDataToDuplicate } = marketBuyModalItem as any;
        await addDoc(collection(db, 'user_items'), {
          ...itemDataToDuplicate,
          studentId: userData.uid,
          quantity: marketBuyQuantity,
          equipped: false,
          purchasedAt: serverTimestamp()
        });
      } else {
        // Comprou tudo: Alterar dono do item
        await updateDoc(doc(db, 'user_items', marketBuyModalItem.id), {
          studentId: userData.uid,
          forSale: false,
          price: null,
          sellerName: null,
          sellerPersuasion: null,
          preferredCurrency: null,
          equipped: false,
          purchasedAt: serverTimestamp()
        });
      }

      await showAlert("Compra no Mercado realizada com sucesso!");
      setMarketBuyModalItem(null);
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
    const extraSlotsFromFortitude = Math.floor(totalEquippedStats.fortitude / 30);
    const maxInventorySpace = 6 + currentRankIndex + (userData.extraInventorySpace || 0) + extraSlotsFromFortitude;

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
  
  const extraSlotsFromFortitude = Math.floor(totalEquippedStats.fortitude / 30);
  const maxInventorySpace = 6 + currentRankIndex + (userData.extraInventorySpace || 0) + extraSlotsFromFortitude;

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
          const itemQty = item.type === 'consumable' ? (quantities[item.id] || 1) : 1;
          const discountMultiplier = Math.max(0.5, 1 - (totalEquippedStats.persuasion / 100));
          const totalCost = Math.floor(item.cost * discountMultiplier) * itemQty;
          const totalCostCoins = Math.floor(item.cost * 10 * discountMultiplier) * itemQty;
          
          const canAfford = isStaff || currentBalance >= (economyType === 'xp' ? totalCost : totalCostCoins);
          const currentRank = getRankForXp(userData.xp || 0);
          const currentRankIndex = RANKS.findIndex(r => r.name === currentRank.name) || 0;
          const meetsRank = isStaff || currentRankIndex >= item.minRankRequired;
          const isGiftingThis = giftingItemId === item.id;

          const isList = viewMode === 'list';

          return (
            <div key={item.id} className={`glass-panel rarity-${item.rarity || 'common'}`} style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: isList ? 'row' : 'column' }}>
              <div style={{ height: isList ? '100%' : (viewMode === 'grid-small' ? '100px' : '150px'), width: isList ? '120px' : '100%', position: 'relative', background: 'var(--bg-dark)', flexShrink: 0 }}>
                {item.imageUrl ? (
                  <img src={item.imageUrl} alt={item.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Store size={isList || viewMode === 'grid-small' ? 32 : 48} color="var(--text-secondary)" />
                  </div>
                )}
                <div className={`rarity-badge ${item.rarity || 'common'}`}>
                  {getRarityLabel(item.rarity)}
                </div>
                {!isList && (
                  <div style={{ position: 'absolute', top: '5px', right: '5px', background: canAfford ? 'rgba(0,0,0,0.8)' : 'rgba(239, 68, 68, 0.9)', padding: '0.25rem 0.5rem', borderRadius: '12px', border: `1px solid ${canAfford ? 'var(--gold-primary)' : 'var(--accent-red)'}`, color: canAfford ? 'var(--gold-primary)' : 'white', fontWeight: 'bold', fontSize: '0.8rem' }}>
                     {isStaff ? 'Grátis' : `${economyType === 'xp' ? totalCost + ' XP' : totalCostCoins + ' Moedas'}`}
                  </div>
                )}
              </div>
              <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', flex: 1, gap: '0.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <h3 style={{ fontSize: viewMode === 'grid-small' ? '1rem' : '1.25rem', margin: 0 }}>{item.title}</h3>
                  {isList && (
                    <div style={{ background: canAfford ? 'rgba(0,0,0,0.8)' : 'rgba(239, 68, 68, 0.9)', padding: '0.25rem 0.5rem', borderRadius: '12px', border: `1px solid ${canAfford ? 'var(--gold-primary)' : 'var(--accent-red)'}`, color: canAfford ? 'var(--gold-primary)' : 'white', fontWeight: 'bold', fontSize: '0.8rem' }}>
                       {isStaff ? 'Grátis' : `${economyType === 'xp' ? totalCost + ' XP' : totalCostCoins + ' Moedas'}`}
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
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', flexDirection: viewMode === 'grid-small' ? 'column' : 'column' }}>
                        
                        {item.type === 'consumable' && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', alignSelf: 'flex-start' }}>
                            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Qtd:</span>
                            <input 
                              type="number" 
                              min="1" 
                              max="999" 
                              value={quantities[item.id] || 1} 
                              onChange={(e) => setQuantities({...quantities, [item.id]: Math.max(1, Math.min(999, parseInt(e.target.value) || 1))})}
                              style={{ width: '60px', padding: '0.4rem', borderRadius: '8px', background: 'rgba(0,0,0,0.5)', color: 'white', border: '1px solid var(--border-glass)' }}
                            />
                          </div>
                        )}

                        <div style={{ display: 'flex', gap: '0.5rem', width: '100%', flexWrap: 'wrap', flexDirection: viewMode === 'grid-small' ? 'column' : 'row' }}>
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
                                cursor: canAfford ? 'pointer' : 'not-allowed',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center'
                              }}
                            >
                              {purchasing === item.id ? '...' : (
                                <>
                                  <span>Comprar ({totalCost} XP)</span>
                                  {!canAfford && <span style={{ fontSize: '0.75em', marginTop: '2px', color: 'var(--accent-red)' }}>Sem XP</span>}
                                </>
                              )}
                            </button>
                            <button 
                              className="login-btn" 
                              disabled={(isStaff ? false : ((userData.coins || 0) < totalCostCoins)) || purchasing === item.id}
                              onClick={() => handlePurchase(item, false, 'coins')}
                              style={{ 
                                flex: 1,
                                background: (isStaff ? true : ((userData.coins || 0) >= totalCostCoins)) ? '#fbbf24' : 'rgba(255,255,255,0.1)', 
                                color: (isStaff ? true : ((userData.coins || 0) >= totalCostCoins)) ? 'black' : 'var(--text-secondary)', 
                                border: 'none', 
                                padding: viewMode === 'grid-small' ? '0.4rem' : '0.5rem', 
                                fontSize: viewMode === 'grid-small' ? '0.75rem' : '0.9rem',
                                opacity: (isStaff ? true : ((userData.coins || 0) >= totalCostCoins)) ? 1 : 0.5,
                                cursor: (isStaff ? true : ((userData.coins || 0) >= totalCostCoins)) ? 'pointer' : 'not-allowed',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center'
                              }}
                            >
                              {purchasing === item.id ? '...' : (
                                <>
                                  <span>Comprar ({totalCostCoins} Moedas)</span>
                                  {!(isStaff ? true : ((userData.coins || 0) >= totalCostCoins)) && <span style={{ fontSize: '0.75em', marginTop: '2px', color: 'var(--accent-red)' }}>Sem Moedas</span>}
                                </>
                              )}
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
                              cursor: canAfford ? 'pointer' : 'not-allowed',
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                          >
                            {purchasing === item.id ? '...' : (
                                <>
                                  <span>Comprar</span>
                                  {!canAfford && <span style={{ fontSize: '0.75em', marginTop: '2px', color: 'var(--accent-red)' }}>Sem Saldo</span>}
                                </>
                              )}
                          </button>
                        )}
                        </div>
                        
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
          
          return (
            <div key={item.id} className={`glass-panel rarity-${item.rarity || 'common'}`} style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: isList ? 'row' : 'column' }}>
              <div style={{ height: isList ? '100%' : (viewMode === 'grid-small' ? '100px' : '150px'), width: isList ? '120px' : '100%', position: 'relative', background: 'var(--bg-dark)', flexShrink: 0 }}>
                {item.itemImageUrl ? (
                  <img src={item.itemImageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Store size={isList || viewMode === 'grid-small' ? 32 : 48} color="var(--text-secondary)" />
                  </div>
                )}
                <div className={`rarity-badge ${item.rarity || 'common'}`}>
                  {getRarityLabel(item.rarity)}
                </div>
                {!isList && (
                  <div style={{ position: 'absolute', top: '5px', right: '5px', background: canAfford ? 'rgba(0,0,0,0.8)' : 'rgba(239, 68, 68, 0.9)', padding: '0.25rem 0.5rem', borderRadius: '12px', border: `1px solid ${canAfford ? 'var(--gold-primary)' : 'var(--accent-red)'}`, color: canAfford ? 'var(--gold-primary)' : 'white', fontWeight: 'bold', fontSize: '0.8rem' }}>
                    {item.price || 0} {economyType === 'xp' ? 'XP' : 'Moedas'}
                  </div>
                )}
              </div>
              <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', flex: 1, gap: '0.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <h3 style={{ fontSize: viewMode === 'grid-small' ? '1rem' : '1.25rem', margin: 0 }}>{item.itemTitle}</h3>
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
                    onClick={() => {
                      setMarketBuyModalItem(item);
                      setMarketBuyQuantity(1);
                      setMarketBuyPaymentMethod('xp');
                    }}
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

      {marketBuyModalItem && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div className="glass-panel" style={{ padding: '2rem', maxWidth: '400px', width: '100%' }}>
            <h3 style={{ marginTop: 0, color: 'var(--gold-primary)', fontSize: '1.5rem' }}>Confirmar Compra</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '12px', marginBottom: '1.5rem' }}>
              <img src={marketBuyModalItem.itemImageUrl} alt="" style={{ width: '40px', height: '40px', objectFit: 'contain' }} />
              <div>
                <strong>{marketBuyModalItem.itemTitle}</strong>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Vendido por: {marketBuyModalItem.sellerName}</div>
              </div>
            </div>

            {marketBuyModalItem.itemType === 'consumable' && (
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Quantidade (Máx: {marketBuyModalItem.quantity || 1}):</label>
                <input 
                  type="number" 
                  min="1" 
                  max={marketBuyModalItem.quantity || 1}
                  value={marketBuyQuantity}
                  onChange={(e) => setMarketBuyQuantity(Math.min(marketBuyModalItem.quantity || 1, Math.max(1, parseInt(e.target.value) || 1)))}
                  style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-glass)', background: 'rgba(0,0,0,0.5)', color: 'white' }}
                />
              </div>
            )}
            {marketBuyModalItem.itemType !== 'consumable' && (
              <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>Quantidade: 1</div>
            )}

            {economyType === 'xp' ? (
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Forma de Pagamento:</label>
                <select 
                  value={marketBuyPaymentMethod} 
                  onChange={(e) => setMarketBuyPaymentMethod(e.target.value as 'xp' | 'coins')}
                  style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', color: 'white' }}
                >
                  <option value="xp">Pagar com XP ({(marketBuyModalItem.price || 0) * marketBuyQuantity} XP)</option>
                  <option value="coins">Pagar com Moedas ({(marketBuyModalItem.price || 0) * 10 * marketBuyQuantity} Moedas)</option>
                </select>
              </div>
            ) : (
              <div style={{ marginBottom: '1.5rem', fontSize: '1.1rem' }}>
                Total: <strong style={{ color: 'var(--gold-primary)' }}>{(marketBuyModalItem.price || 0) * marketBuyQuantity} Moedas</strong>
              </div>
            )}

            <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
              <button onClick={() => setMarketBuyModalItem(null)} className="login-btn" style={{ flex: 1, background: 'var(--bg-dark)', color: 'white' }}>Cancelar</button>
              <button onClick={submitMarketBuy} className="login-btn" disabled={purchasing === marketBuyModalItem.id} style={{ flex: 1, background: 'var(--gold-primary)', color: 'black' }}>Confirmar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
