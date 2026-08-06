import { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, query, getDocs, doc, getDoc, addDoc, updateDoc, serverTimestamp, where, deleteDoc } from 'firebase/firestore';
import { ShoppingCart, Star, Coins, Store, Filter, Eye, X, ShieldAlert, Gift, Search, Edit3, Trash2, LayoutGrid, Grid, List as ListIcon, FlaskConical, Sword, Shield, Package, Sparkles } from 'lucide-react';
import type { UserData } from '../contexts/AuthContext';
import { useDialog } from '../contexts/DialogContext';
import { RANKS, getRankForXp } from '../lib/ranks';
import { type ItemCategory, type AttributeType, type ItemAdd, rollItemAdds, calculateTotalStats, fetchGlobalGachaConfig } from '../lib/gacha';
import type { StoreItem } from './AdminStoreManager';
import AvatarCharacter from './AvatarCharacter';

interface MarketItem {
  id: string;
  itemId: string;
  itemTitle: string;
  itemType: 'consumable' | 'equippable';
  itemImageUrl: string;
  quantity: number;
  price?: number;
  sellerName?: string;
  sellerClassName?: string;
  sellerClassColor?: string;
  itemCategory?: ItemCategory;
  baseAttributeType?: AttributeType;
  baseAttributeValue?: number;
  adds?: ItemAdd[];
  studentId: string;
  gameEffect?: string;
  avatarPart?: string;
  rarity?: string;
  gameModelUrl?: string;
  modelTextureUrl?: string;
  minecraftHeadValue?: string;
  modelTransforms?: any;
  unlockedSkinId?: string;
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
  const [officialCategoryTab, setOfficialCategoryTab] = useState<'all' | 'consumable' | 'attack' | 'defense' | 'other'>('all');
  const [items, setItems] = useState<StoreItem[]>([]);
  const [marketItems, setMarketItems] = useState<MarketItem[]>([]);
  const [myInventoryCount, setMyInventoryCount] = useState(0);
  const [myConsumableQuantities, setMyConsumableQuantities] = useState<Record<string, number>>({});
  const [totalEquippedStats, setTotalEquippedStats] = useState(calculateTotalStats([]));
  const [economyType, setEconomyType] = useState<'xp' | 'coins'>('coins');
  const [economySettings, setEconomySettings] = useState<any>(null);
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

  // Preview Modal
  const [previewItem, setPreviewItem] = useState<StoreItem | MarketItem | null>(null);

  // Filtros e View
  const [viewMode, setViewMode] = useState<'grid-large' | 'grid-small' | 'list'>(
    (localStorage.getItem('store_viewMode') as any) || 'grid-large'
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>(localStorage.getItem('store_filterType') || 'all');
  const [filterRarity, setFilterRarity] = useState<string>(localStorage.getItem('store_filterRarity') || 'all');
  const [sortBy, setSortBy] = useState<string>(localStorage.getItem('store_sortBy') || 'name-asc');
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);

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
      const eData = econSnap.data();
      setEconomyType(eData.currencyType || 'coins');
      setEconomySettings(eData);
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
      const currentRank = getRankForXp(userData.xp || 0, (userData as any).classId);
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
          modelTextureUrl: item.modelTextureUrl || '',
          minecraftHeadValue: item.minecraftHeadValue || '',
          modelTransforms: item.modelTransforms || null,
          adds: finalAdds,
          minSalePrice: item.minSalePrice || 0,
          rarity: item.rarity || 'common',
          unlockedSkinId: item.unlockedSkinId || '',
          buffDurationDays: item.buffDurationDays || 7
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
      unitCost = basePrice * (economySettings?.coinToXPRatio || 10);
    }
    const totalCost = unitCost * marketBuyQuantity;
    
    if (!isStaff && currentBalance < totalCost) {
      await showAlert(`Você não tem saldo suficiente para comprar este item.`);
      return;
    }

    const currentRank = getRankForXp(userData.xp || 0, (userData as any).classId);
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
          sellerUnitReceive = basePrice * (economySettings?.coinToXPRatio || 10); // converte XP pra moedas pro vendedor se ele escolheu Moedas
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
    const currentRank = getRankForXp(userData.xp || 0, (userData as any).classId);
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
  const currentRank = getRankForXp(userData.xp || 0, (userData as any).classId);
  const currentRankIndex = RANKS.findIndex(r => r.name === currentRank.name) || 0;
  
  const extraSlotsFromFortitude = Math.floor(totalEquippedStats.fortitude / 30);
  const maxInventorySpace = 6 + currentRankIndex + (userData.extraInventorySpace || 0) + extraSlotsFromFortitude;

  const getProcessedItems = () => {
    let result = [...items];
    const isStaff = userData.role !== 'student';
    
    // Esconde os itens se a patente do aluno for menor que a exigida
    if (!isStaff) {
      result = result.filter(i => (i.minRankRequired || 0) <= currentRankIndex);
    }

    if (searchQuery) {
      result = result.filter(i => i.title.toLowerCase().includes(searchQuery.toLowerCase()) || i.description.toLowerCase().includes(searchQuery.toLowerCase()));
    }
    
    if (officialCategoryTab === 'consumable') {
      result = result.filter(i => i.type === 'consumable');
    } else if (officialCategoryTab === 'attack') {
      result = result.filter(i => i.type === 'equippable' && i.itemCategory === 'attack');
    } else if (officialCategoryTab === 'defense') {
      result = result.filter(i => i.type === 'equippable' && i.itemCategory === 'defense');
    } else if (officialCategoryTab === 'other') {
      result = result.filter(i => i.type === 'equippable' && i.itemCategory !== 'attack' && i.itemCategory !== 'defense');
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
    const isStaff = userData.role !== 'student';
    
    // Esconde itens do mercado se a patente do aluno for menor que a exigida
    if (!isStaff) {
      result = result.filter(i => {
        // Encontrar o item original para checar a patente mínima (já que o marketItem pode não ter)
        const originalItem = items.find(storeI => storeI.id === i.itemId);
        const minRank = originalItem ? (originalItem.minRankRequired || 0) : 0;
        return minRank <= currentRankIndex;
      });
    }

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
    if (viewMode === 'grid-small') return { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '1rem' };
    if (viewMode === 'list') return { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' };
    return { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.5rem' };
  };

  return (
    <div style={{ animation: 'fadeIn 0.3s ease-out' }}>
      {previewItem && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div className="glass-panel" style={{ width: '400px', maxWidth: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', background: 'var(--bg-dark)', border: '2px solid var(--border-color)', borderRadius: '16px', padding: '1.5rem' }}>
            <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--text-primary)' }}>
                Prévia: {(previewItem as StoreItem).title || (previewItem as MarketItem).itemTitle}
              </h3>
              <button onClick={() => setPreviewItem(null)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                <X size={24} />
              </button>
            </div>
            
            <div style={{ height: '350px', width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', background: 'var(--bg-card)', borderRadius: '12px', overflow: 'hidden' }}>
              {(() => {
                let previewConfig: any = { ...(userData.avatarConfig || { gender: 'male' as any, skinColor: '#ffcc99', hairColor: '#4a3000', eyeColor: '#000000', hairStyle: 'short', mouthStyle: 'smile', facialHair: 'none' as any, handedness: 'right' as any, animationState: 'idle' as any }) };
                let previewEquipped = [];
                
                const type = (previewItem as StoreItem).type || (previewItem as MarketItem).itemType;
                if (previewItem.gameEffect === 'unlock_skin') {
                  previewConfig.customSkinUrl = previewItem.unlockedSkinId || '';
                } else if (type === 'equippable') {
                  previewEquipped.push({
                    itemId: previewItem.id,
                    itemTitle: (previewItem as any).itemTitle || (previewItem as any).title,
                    itemCategory: previewItem.itemCategory,
                    imageUrl: (previewItem as any).imageUrl || (previewItem as any).itemImageUrl || '',
                    avatarPart: previewItem.avatarPart as any,
                    gameModelUrl: previewItem.gameModelUrl,
                    modelTextureUrl: previewItem.modelTextureUrl,
                    minecraftHeadValue: previewItem.minecraftHeadValue,
                    modelTransforms: previewItem.modelTransforms
                  });
                }
                
                return <AvatarCharacter config={previewConfig} equippedItems={previewEquipped} size={300} animation="idle" />;
              })()}
            </div>
            <p style={{ marginTop: '1rem', color: 'var(--text-secondary)', fontSize: '0.85rem', textAlign: 'center' }}>
              Arraste para girar. O item já está pré-visualizado em seu personagem!
            </p>
          </div>
        </div>
      )}

      <div style={{ position: 'sticky', top: '75px', zIndex: 10, background: 'var(--bg-dark)', paddingBottom: '0.5rem', paddingTop: '0.5rem', borderBottom: '1px solid var(--border-glass)', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <h2 style={{ fontSize: '1.5rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Store size={28} color="var(--gold-primary)" /> Lojas do Acampamento
          </h2>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <div style={{ color: 'var(--text-secondary)', background: 'rgba(0,0,0,0.3)', padding: '0.5rem 0.75rem', borderRadius: '12px', fontSize: '0.9rem' }}>
               Mochila: <strong style={{ color: myInventoryCount >= maxInventorySpace ? 'var(--accent-red)' : 'var(--accent-green)' }}>{myInventoryCount}</strong> / {maxInventorySpace}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(0,0,0,0.5)', padding: '0.5rem 1rem', borderRadius: '20px', border: '1px solid var(--gold-primary)' }}>
              {economyType === 'xp' ? (
                <>
                  <Star size={18} color="var(--gold-primary)" />
                  <span style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'var(--gold-primary)', marginRight: '1rem' }}>
                    {userData.role !== 'student' ? 'Infinito (Staff)' : `${userData.xp || 0} XP`}
                  </span>
                  <Coins size={18} color="var(--gold-primary)" />
                  <span style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'var(--gold-primary)' }}>
                    {userData.role !== 'student' ? '' : `${userData.coins || 0} Moedas`}
                  </span>
                </>
              ) : (
                <>
                  <Coins size={18} color="var(--gold-primary)" />
                  <span style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'var(--gold-primary)' }}>
                    {userData.role !== 'student' ? 'Infinito (Staff)' : `${userData.coins || 0} Moedas`}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.5rem' }}>
          <button 
            onClick={() => setActiveTab('official')}
            className="login-btn"
            style={{ flex: 1, padding: '0.5rem', background: activeTab === 'official' ? 'var(--gold-primary)' : 'var(--bg-card)', color: activeTab === 'official' ? 'var(--text-on-gold, #000000)' : 'var(--text-primary)', fontWeight: 'bold' }}
          >
            Loja Oficial
          </button>
          <button 
            onClick={() => setActiveTab('market')}
            className="login-btn"
            style={{ flex: 1, padding: '0.5rem', background: activeTab === 'market' ? 'var(--gold-primary)' : 'var(--bg-card)', color: activeTab === 'market' ? 'var(--text-on-gold, #000000)' : 'var(--text-primary)', fontWeight: 'bold' }}
          >
            Bazar de Jogadores
          </button>
          <button
            onClick={() => setIsFiltersOpen(!isFiltersOpen)}
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', background: isFiltersOpen ? 'var(--btn-hover)' : 'var(--btn-bg)', color: 'var(--text-primary)', borderRadius: '8px', border: '1px solid var(--border-glass)', cursor: 'pointer', transition: 'all 0.2s' }}
            title="Mostrar / Ocultar Filtros"
          >
            <Filter size={18} />
          </button>
        </div>

        {/* Barra de Filtros */}
        {isFiltersOpen && (
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '0.5rem' }}>
            <div style={{ flex: 1, minWidth: '200px', display: 'flex', alignItems: 'center', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', borderRadius: '8px', padding: '0 0.5rem' }}>
              <Search size={16} color="var(--text-secondary)" />
              <input type="text" placeholder="Buscar item..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} style={{ width: '100%', padding: '0.5rem', fontSize: '0.9rem', background: 'transparent', border: 'none', color: 'var(--text-primary)', outline: 'none' }} />
            </div>
            <select value={filterType} onChange={e => setFilterType(e.target.value)} style={{ padding: '0.5rem', fontSize: '0.9rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)' }}>
              <option value="all">Todos os Tipos</option>
              <option value="consumable">Consumível</option>
              <option value="equippable">Equipável</option>
            </select>
            <select value={filterRarity} onChange={e => setFilterRarity(e.target.value)} style={{ padding: '0.5rem', fontSize: '0.9rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)' }}>
              <option value="all">Qualquer Raridade</option>
              <option value="common">Comum</option>
              <option value="uncommon">Incomum</option>
              <option value="rare">Raro</option>
              <option value="epic">Épico</option>
              <option value="legendary">Lendário</option>
            </select>
            <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ padding: '0.5rem', fontSize: '0.9rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)' }}>
              <option value="name-asc">A-Z</option>
              <option value="name-desc">Z-A</option>
              <option value="price-asc">Menor Preço</option>
              <option value="price-desc">Maior Preço</option>
              <option value="rarity-desc">Raridade (Maior)</option>
              <option value="rarity-asc">Raridade (Menor)</option>
            </select>
            
            <div style={{ display: 'flex', gap: '0.25rem', background: 'rgba(0,0,0,0.3)', padding: '0.25rem', borderRadius: '8px', border: '1px solid var(--border-glass)' }}>
              <button onClick={() => setViewMode('grid-large')} style={{ padding: '0.5rem', background: viewMode === 'grid-large' ? 'rgba(255,255,255,0.1)' : 'transparent', border: 'none', borderRadius: '4px', cursor: 'pointer', color: viewMode === 'grid-large'  ? 'var(--text-primary)' : 'var(--text-secondary)' }} title="Grid Grande"><LayoutGrid size={20} /></button>
              <button onClick={() => setViewMode('grid-small')} style={{ padding: '0.5rem', background: viewMode === 'grid-small' ? 'rgba(255,255,255,0.1)' : 'transparent', border: 'none', borderRadius: '4px', cursor: 'pointer', color: viewMode === 'grid-small'  ? 'var(--text-primary)' : 'var(--text-secondary)' }} title="Grid Pequeno"><Grid size={20} /></button>
              <button onClick={() => setViewMode('list')} style={{ padding: '0.5rem', background: viewMode === 'list' ? 'rgba(255,255,255,0.1)' : 'transparent', border: 'none', borderRadius: '4px', cursor: 'pointer', color: viewMode === 'list'  ? 'var(--text-primary)' : 'var(--text-secondary)' }} title="Lista"><ListIcon size={20} /></button>
            </div>
          </div>
        )}

        {/* Abas de Categoria da Loja Oficial movidas para dentro do cabeçalho fixo */}
        {activeTab === 'official' && (
          <div className="compact-tab-row" style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', paddingTop: '0.5rem', paddingBottom: '0.25rem' }}>
            <button 
              onClick={() => setOfficialCategoryTab('all')}
              style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', padding: '0.4rem 0.75rem', fontSize: '0.85rem', borderRadius: '20px', border: 'none', cursor: 'pointer', background: officialCategoryTab === 'all' ? 'var(--gold-primary)' : 'var(--bg-card)', color: officialCategoryTab === 'all' ? 'var(--text-on-gold, #000000)' : 'var(--text-primary)', fontWeight: 'bold' }}
            >
              <Sparkles size={18} /> Todos
            </button>
            <button 
              onClick={() => setOfficialCategoryTab('consumable')}
              style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', padding: '0.4rem 0.75rem', fontSize: '0.85rem', borderRadius: '20px', border: 'none', cursor: 'pointer', background: officialCategoryTab === 'consumable' ? 'var(--gold-primary)' : 'var(--bg-card)', color: officialCategoryTab === 'consumable' ? 'var(--text-on-gold, #000000)' : 'var(--text-primary)', fontWeight: 'bold' }}
            >
              <FlaskConical size={18} /> Consumíveis
            </button>
            <button 
              onClick={() => setOfficialCategoryTab('attack')}
              style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', padding: '0.4rem 0.75rem', fontSize: '0.85rem', borderRadius: '20px', border: 'none', cursor: 'pointer', background: officialCategoryTab === 'attack' ? 'var(--gold-primary)' : 'var(--btn-bg)', color: officialCategoryTab === 'attack'  ? 'var(--text-on-gold, #000000)' : 'var(--text-primary)', fontWeight: 'bold' }}
            >
              <Sword size={18} /> Ataque
            </button>
            <button 
              onClick={() => setOfficialCategoryTab('defense')}
              style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', padding: '0.4rem 0.75rem', fontSize: '0.85rem', borderRadius: '20px', border: 'none', cursor: 'pointer', background: officialCategoryTab === 'defense' ? 'var(--gold-primary)' : 'var(--btn-bg)', color: officialCategoryTab === 'defense'  ? 'var(--text-on-gold, #000000)' : 'var(--text-primary)', fontWeight: 'bold' }}
            >
              <Shield size={18} /> Defesa
            </button>
            <button 
              onClick={() => setOfficialCategoryTab('other')}
              style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', padding: '0.4rem 0.75rem', fontSize: '0.85rem', borderRadius: '20px', border: 'none', cursor: 'pointer', background: officialCategoryTab === 'other' ? 'var(--gold-primary)' : 'var(--btn-bg)', color: officialCategoryTab === 'other'  ? 'var(--text-on-gold, #000000)' : 'var(--text-primary)', fontWeight: 'bold' }}
            >
              <Package size={18} /> Outros
            </button>
          </div>
        )}
      </div>

      {activeTab === 'official' && (
        <div style={getGridStyle()}>
        {processedItems.map(item => {
          const isStaff = userData.role !== 'student';
          const itemQty = item.type === 'consumable' ? (quantities[item.id] || 1) : 1;
          const discountMultiplier = Math.max(0.5, 1 - (totalEquippedStats.persuasion / 100));
          const totalCost = Math.floor(item.cost * discountMultiplier) * itemQty;
          const ratio = economySettings?.coinToXPRatio || 10;
          const totalCostCoins = Math.floor(item.cost * ratio * discountMultiplier) * itemQty;
          
          const canAfford = isStaff || currentBalance >= (economyType === 'xp' ? totalCost : totalCostCoins);
          const currentRank = getRankForXp(userData.xp || 0, (userData as any).classId);
          const currentRankIndex = RANKS.findIndex(r => r.name === currentRank.name) || 0;
          const meetsRank = isStaff || currentRankIndex >= item.minRankRequired;
          const isGiftingThis = giftingItemId === item.id;

          const isList = viewMode === 'list';

          return (
            <div key={item.id} className={`glass-panel rarity-${item.rarity || 'common'}`} style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: isList ? 'row' : 'column' }}>
              <div style={{ height: isList ? '100%' : (viewMode === 'grid-small' ? '100px' : '160px'), width: isList ? '130px' : '100%', position: 'relative', background: 'var(--bg-dark)', flexShrink: 0 }}>
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
                  <div style={{ position: 'absolute', top: '5px', right: '5px', background: canAfford ? 'rgba(0,0,0,0.8)' : 'rgba(239, 68, 68, 0.9)', padding: '0.25rem 0.5rem', borderRadius: '12px', border: `1px solid ${canAfford ? 'var(--gold-primary)' : 'var(--accent-red)'}`, color: canAfford  ? 'var(--gold-primary)'  : 'var(--text-primary)', fontWeight: 'bold', fontSize: '0.8rem' }}>
                     {isStaff ? 'Grátis' : `${economyType === 'xp' ? totalCost + ' XP' : totalCostCoins + ' Moedas'}`}
                  </div>
                )}
              </div>
              <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', flex: 1, gap: '0.5rem', minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                  <h3 style={{ fontSize: viewMode === 'grid-small' ? '1rem' : '1.25rem', margin: 0, wordBreak: 'break-word', flex: 1 }}>{item.title}</h3>
                  {isList && (
                    <div style={{ flexShrink: 0, background: canAfford ? 'rgba(0,0,0,0.8)' : 'rgba(239, 68, 68, 0.9)', padding: '0.25rem 0.5rem', borderRadius: '12px', border: `1px solid ${canAfford ? 'var(--gold-primary)' : 'var(--accent-red)'}`, color: canAfford  ? 'var(--gold-primary)'  : 'var(--text-primary)', fontWeight: 'bold', fontSize: '0.8rem' }}>
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

                        <div style={{ display: 'flex', gap: '0.5rem', width: '100%', flexWrap: 'wrap', marginTop: 'auto' }}>
                        {economyType === 'xp' ? (
                           <>
                            <button 
                              className="login-btn hover-brightness" 
                              disabled={!canAfford || purchasing === item.id}
                              title={canAfford ? 'Comprar com XP' : 'Sem XP'}
                              onClick={() => handlePurchase(item, false, 'xp')}
                              style={{ 
                                flex: 1,
                                background: canAfford ? 'var(--gold-primary)' : 'rgba(255,255,255,0.1)', 
                                color: canAfford ? 'var(--text-on-gold, #000000)' : 'var(--text-secondary)', 
                                border: 'none', 
                                padding: '0.5rem',
                                opacity: canAfford ? 1 : 0.5,
                                cursor: canAfford ? 'pointer' : 'not-allowed',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '0.4rem'
                              }}
                            >
                              {purchasing === item.id ? <span style={{ fontSize: '0.8rem' }}>...</span> : (
                                <>
                                  <Star size={18} fill="currentColor" />
                                  <span style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>{totalCost}</span>
                                </>
                              )}
                            </button>
                            {economySettings?.coinsCanBuyItems && (
                              <button 
                                className="login-btn hover-brightness" 
                                title={(isStaff ? true : ((userData.coins || 0) >= totalCostCoins)) ? 'Comprar com Moedas' : 'Sem Moedas'}
                                disabled={(isStaff ? false : ((userData.coins || 0) < totalCostCoins)) || purchasing === item.id}
                                onClick={() => handlePurchase(item, false, 'coins')}
                                style={{ 
                                  flex: 1,
                                  background: (isStaff ? true : ((userData.coins || 0) >= totalCostCoins)) ? '#fbbf24' : 'rgba(255,255,255,0.1)', 
                                  color: (isStaff ? true : ((userData.coins || 0) >= totalCostCoins)) ? 'black' : 'var(--text-secondary)', 
                                  border: 'none', 
                                  padding: '0.5rem',
                                  opacity: (isStaff ? true : ((userData.coins || 0) >= totalCostCoins)) ? 1 : 0.5,
                                  cursor: (isStaff ? true : ((userData.coins || 0) >= totalCostCoins)) ? 'pointer' : 'not-allowed',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: '0.4rem'
                                }}
                              >
                                {purchasing === item.id ? <span style={{ fontSize: '0.8rem' }}>...</span> : (
                                  <>
                                    <Coins size={18} fill="currentColor" />
                                    <span style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>{totalCostCoins}</span>
                                  </>
                                )}
                              </button>
                            )}
                           </>
                        ) : economyType === 'coins' ? (
                            <button 
                              className="login-btn hover-brightness" 
                              title={(isStaff ? true : ((userData.coins || 0) >= totalCostCoins)) ? 'Comprar com Moedas' : 'Sem Moedas'}
                              disabled={(isStaff ? false : ((userData.coins || 0) < totalCostCoins)) || purchasing === item.id}
                              onClick={() => handlePurchase(item, false, 'coins')}
                              style={{ 
                                flex: 1,
                                background: (isStaff ? true : ((userData.coins || 0) >= totalCostCoins)) ? '#fbbf24' : 'rgba(255,255,255,0.1)', 
                                color: (isStaff ? true : ((userData.coins || 0) >= totalCostCoins)) ? 'black' : 'var(--text-secondary)', 
                                border: 'none', 
                                padding: '0.5rem',
                                opacity: (isStaff ? true : ((userData.coins || 0) >= totalCostCoins)) ? 1 : 0.5,
                                cursor: (isStaff ? true : ((userData.coins || 0) >= totalCostCoins)) ? 'pointer' : 'not-allowed',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '0.4rem'
                              }}
                            >
                              {purchasing === item.id ? <span style={{ fontSize: '0.8rem' }}>...</span> : (
                                <>
                                  <Coins size={18} fill="currentColor" />
                                  <span style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>{totalCostCoins}</span>
                                </>
                              )}
                            </button>
                        ) : (
                          <button 
                            className="login-btn hover-brightness" 
                            title={canAfford ? 'Comprar' : 'Sem Saldo'}
                            disabled={!canAfford || purchasing === item.id}
                            onClick={() => handlePurchase(item, false)}
                            style={{ 
                              flex: 1,
                              background: canAfford ? 'var(--gold-primary)' : 'rgba(255,255,255,0.1)', 
                              color: canAfford ? 'var(--text-on-gold, #000000)' : 'var(--text-secondary)', 
                              border: 'none', 
                              padding: '0.5rem',
                              opacity: canAfford ? 1 : 0.5,
                              cursor: canAfford ? 'pointer' : 'not-allowed',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '0.4rem'
                            }}
                          >
                            {purchasing === item.id ? <span style={{ fontSize: '0.8rem' }}>...</span> : (
                                <>
                                  <ShoppingCart size={18} />
                                  <span style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>Comprar</span>
                                </>
                              )}
                          </button>
                        )}
                          {(item.type === 'equippable' || item.gameEffect === 'unlock_skin') && (
                            <button
                              className="login-btn hover-brightness"
                              onClick={() => setPreviewItem(item)}
                              title="Ver no Personagem"
                              style={{
                                flex: 1,
                                maxWidth: '60px',
                                background: 'var(--btn-bg)',
                                color: 'var(--text-primary)',
                                border: '1px solid var(--border-glass)',
                                padding: '0.5rem',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                              }}
                            >
                              <Eye size={18} />
                            </button>
                          )}
                          {(userData.role !== 'student' || giftWrapItemIds.length > 0) && (
                            <button 
                              className="login-btn hover-brightness"
                              disabled={false} // Gift button just opens the sub-menu, so keep it enabled if they want to choose gift
                              title="Dar de Presente"
                              onClick={() => setGiftingItemId(item.id)}
                              style={{ 
                                flex: 1,
                                maxWidth: '60px',
                                background: 'rgba(251, 191, 36, 0.1)', 
                                color: 'var(--gold-primary)', 
                                border: '1px solid var(--gold-primary)', 
                                padding: '0.5rem',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer'
                              }}
                            >
                              <Gift size={18} />
                            </button>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <select 
                          value={selectedGiftRecipient} 
                          onChange={(e) => setSelectedGiftRecipient(e.target.value)}
                          style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)' }}
                        >
                          <option value="">Selecione o Aluno...</option>
                          {students.filter(s => s.uid !== userData.uid).map(s => (
                            <option key={s.uid} value={s.uid}>{s.name} ({s.classId || 'Sem Turma'})</option>
                          ))}
                        </select>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button onClick={() => { setGiftingItemId(null); setSelectedGiftRecipient(''); }} style={{ flex: 1, background: 'transparent', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', borderRadius: '8px', padding: '0.5rem' }}>Cancelar</button>
                          {economyType === 'xp' ? (
                            <>
                              <button 
                                disabled={!selectedGiftRecipient || (!canAfford && !isStaff) || purchasing === item.id} 
                                onClick={() => handlePurchase(item, true, 'xp')} 
                                style={{ flex: 1, background: 'var(--gold-primary)', border: 'none', color: 'var(--text-on-gold, #000000)', borderRadius: '8px', padding: '0.5rem', fontWeight: 'bold' }}
                              >
                                Enviar ({item.cost} XP)
                              </button>
                              {economySettings?.coinsCanBuyItems && (
                                <button 
                                  disabled={!selectedGiftRecipient || (!isStaff && (userData.coins || 0) < totalCostCoins) || purchasing === item.id} 
                                  onClick={() => handlePurchase(item, true, 'coins')} 
                                  style={{ flex: 1, background: '#fbbf24', border: 'none', color: 'black', borderRadius: '8px', padding: '0.5rem', fontWeight: 'bold' }}
                                >
                                  Enviar ({totalCostCoins} Moedas)
                                </button>
                              )}
                            </>
                          ) : (
                            <button 
                              disabled={!selectedGiftRecipient || (!canAfford && !isStaff) || purchasing === item.id} 
                              onClick={() => handlePurchase(item, true)} 
                              style={{ flex: 1, background: 'var(--gold-primary)', border: 'none', color: 'var(--text-on-gold, #000000)', borderRadius: '8px', padding: '0.5rem', fontWeight: 'bold' }}
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
              <div style={{ height: isList ? '100%' : (viewMode === 'grid-small' ? '100px' : '160px'), width: isList ? '120px' : '100%', position: 'relative', background: 'var(--bg-dark)', flexShrink: 0 }}>
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
                {item.quantity && item.quantity > 1 && (
                  <div style={{
                    position: 'absolute',
                    bottom: '5px',
                    right: '5px',
                    color: 'white',
                    textShadow: '1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000',
                    fontSize: '1.1rem',
                    fontWeight: 'bold',
                    zIndex: 2,
                    pointerEvents: 'none',
                    lineHeight: 1
                  }}>
                    {item.quantity}
                  </div>
                )}
                {!isList && (
                  <div style={{ position: 'absolute', top: '5px', right: '5px', background: canAfford ? 'rgba(0,0,0,0.8)' : 'rgba(239, 68, 68, 0.9)', padding: '0.25rem 0.5rem', borderRadius: '12px', border: `1px solid ${canAfford ? 'var(--gold-primary)' : 'var(--accent-red)'}`, color: canAfford  ? 'var(--gold-primary)'  : 'var(--text-primary)', fontWeight: 'bold', fontSize: '0.8rem' }}>
                    {item.price || 0} {economyType === 'xp' ? 'XP' : 'Moedas'}
                  </div>
                )}
              </div>
              <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', flex: 1, gap: '0.5rem', minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                  <h3 style={{ fontSize: viewMode === 'grid-small' ? '1rem' : '1.25rem', margin: 0, wordBreak: 'break-word', flex: 1 }}>{item.itemTitle}</h3>
                  {isList && (
                    <div style={{ flexShrink: 0, background: canAfford ? 'rgba(0,0,0,0.8)' : 'rgba(239, 68, 68, 0.9)', padding: '0.25rem 0.5rem', borderRadius: '12px', border: `1px solid ${canAfford ? 'var(--gold-primary)' : 'var(--accent-red)'}`, color: canAfford  ? 'var(--gold-primary)'  : 'var(--text-primary)', fontWeight: 'bold', fontSize: '0.8rem' }}>
                      {item.price || 0} {economyType === 'xp' ? 'XP' : 'M'}
                    </div>
                  )}
                </div>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                  Vendido por: <strong style={{ color: 'var(--gold-primary)' }}>
                    {item.sellerName?.split(' ')[0]} 
                    {item.sellerClassName && <span style={{ color: item.sellerClassColor || 'inherit' }}> | {item.sellerClassName}</span>}
                  </strong>
                </p>
                {viewMode !== 'grid-small' && items.find(si => si.id === item.itemId)?.description && (
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '0 0 0.5rem 0', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {items.find(si => si.id === item.itemId)?.description}
                  </p>
                )}
                <div style={{ flex: 1, marginBottom: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <div>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', background: 'rgba(0,0,0,0.3)', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>
                      {item.itemType === 'consumable' ? 'Consumível' : 'Equipável'}
                    </span>
                  </div>
                  {item.itemType === 'equippable' && item.baseAttributeType && item.baseAttributeType !== 'none' && (
                    <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.4rem' }}>
                      <div style={{ color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                        <strong style={{ color: 'var(--gold-primary)' }}>+{item.baseAttributeValue}</strong> {getAttributeName(item.baseAttributeType)}
                      </div>
                      {item.adds && item.adds.length > 0 && item.adds.map((add, idx) => (
                        <div key={idx} style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <span style={{ color: 'var(--border-glass)' }}>|</span>
                          <span><strong style={{ color: '#60A5FA' }}>+{add.value}</strong> {getAttributeName(add.type)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                
                <div style={{ display: 'flex', gap: '0.5rem', width: '100%', marginTop: 'auto', flexWrap: 'wrap' }}>
                  {item.studentId === userData.uid ? (
                    <div style={{ display: 'flex', gap: '0.5rem', flex: 1 }}>
                      <button 
                        className="login-btn hover-brightness" 
                        onClick={() => handleEditPrice(item)}
                        title="Editar Preço"
                        style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', background: 'rgba(59, 130, 246, 0.2)', color: '#60A5FA', border: '1px solid rgba(59, 130, 246, 0.3)', padding: '0.5rem' }}
                      >
                        <Edit3 size={18} />
                      </button>
                      <button 
                        className="login-btn hover-brightness" 
                        onClick={() => handleCancelSale(item)}
                        title="Cancelar Venda"
                        style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', background: 'rgba(239, 68, 68, 0.2)', color: '#F87171', border: '1px solid rgba(239, 68, 68, 0.3)', padding: '0.5rem' }}
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  ) : (
                    <button 
                      className="login-btn hover-brightness" 
                      disabled={!canAfford || purchasing === item.id}
                      onClick={() => {
                        setMarketBuyModalItem(item);
                        setMarketBuyQuantity(1);
                        setMarketBuyPaymentMethod('xp');
                      }}
                      title={canAfford ? 'Comprar' : 'Sem Saldo'}
                      style={{ 
                        flex: 1,
                        display: 'flex', justifyContent: 'center', alignItems: 'center',
                        background: canAfford ? 'var(--gold-primary)' : 'rgba(255,255,255,0.1)', 
                        color: canAfford ? 'var(--text-on-gold, #000000)' : 'var(--text-secondary)', 
                        border: 'none', 
                        padding: '0.5rem',
                        opacity: canAfford ? 1 : 0.5,
                        cursor: canAfford ? 'pointer' : 'not-allowed'
                      }}
                    >
                      {purchasing === item.id ? <span style={{ fontSize: '0.8rem' }}>...</span> : <ShoppingCart size={18} />}
                    </button>
                  )}
                  
                  {(item.itemType === 'equippable' || item.gameEffect === 'unlock_skin') && (
                    <button
                      className="login-btn hover-brightness"
                      onClick={() => setPreviewItem(item)}
                      title="Ver no Personagem"
                      style={{
                        flex: 1,
                        background: 'var(--btn-bg)',
                        color: 'var(--text-primary)',
                        border: '1px solid var(--border-glass)',
                        padding: '0.5rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      <Eye size={18} />
                    </button>
                  )}
                </div>
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
                {economySettings?.coinsCanBuyItems ? (
                  <select 
                    value={marketBuyPaymentMethod} 
                    onChange={(e) => setMarketBuyPaymentMethod(e.target.value as 'xp' | 'coins')}
                    style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)' }}
                  >
                    <option value="xp">Pagar com XP ({(marketBuyModalItem.price || 0) * marketBuyQuantity} XP)</option>
                    <option value="coins">Pagar com Moedas ({(marketBuyModalItem.price || 0) * (economySettings?.coinToXPRatio || 10) * marketBuyQuantity} Moedas)</option>
                  </select>
                ) : (
                  <div style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)' }}>
                    Pagar com XP ({(marketBuyModalItem.price || 0) * marketBuyQuantity} XP)
                  </div>
                )}
              </div>
            ) : (
              <div style={{ marginBottom: '1.5rem', fontSize: '1.1rem' }}>
                Total: <strong style={{ color: 'var(--gold-primary)' }}>{(marketBuyModalItem.price || 0) * marketBuyQuantity} Moedas</strong>
              </div>
            )}

            <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
              <button onClick={() => setMarketBuyModalItem(null)} className="login-btn" style={{ flex: 1, background: 'var(--bg-dark)', color: 'white' }}>Cancelar</button>
              <button onClick={submitMarketBuy} className="login-btn" disabled={purchasing === marketBuyModalItem.id} style={{ flex: 1, background: 'var(--gold-primary)', color: 'var(--text-on-gold, #000000)' }}>Confirmar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
