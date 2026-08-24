import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { ShoppingCart, Star, Coins, Store, Filter, Eye, X, ShieldAlert, Gift, Search, Edit3, Trash2, LayoutGrid, Grid, List as ListIcon, FlaskConical, Sword, Shield, Package, Sparkles, Swords } from 'lucide-react';
import type { UserData } from '../contexts/AuthContext';
import { useTenant } from '../contexts/TenantContext';
import { fetchEconomySettings } from '../lib/economy';
import { useDialog } from '../contexts/DialogContext';
import { RANKS, getRankForXp } from '../lib/ranks';
import { type ItemCategory, type AttributeType, type ItemAdd, rollItemAdds, calculateTotalStats, fetchGlobalGachaConfig } from '../lib/gacha';
import type { StoreItem } from './AdminStoreManager';
import AvatarCharacter from './AvatarCharacter';
import SkinBuffIcon from './SkinBuffIcon';
import ItemIcon from './ItemIcon';
import { processExpiredSales, formatSaleRemaining } from '../lib/bazar';

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
  buffDurationDays?: number;
  saleExpiresAt?: number;
  saleBuffDays?: number;
  hiddenFromMarket?: boolean;
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
  const { tenantId } = useTenant();
  const [activeTab, setActiveTab] = useState<'official' | 'market'>('official');
  const [officialCategoryTab, setOfficialCategoryTab] = useState<'all' | 'consumable' | 'attack' | 'defense' | 'other'>('all');
  const [items, setItems] = useState<StoreItem[]>([]);
  const [marketItems, setMarketItems] = useState<MarketItem[]>([]);
  const [myInventoryCount, setMyInventoryCount] = useState(0);
  const [myConsumableQuantities, setMyConsumableQuantities] = useState<Record<string, number>>({});
  const [totalEquippedStats, setTotalEquippedStats] = useState(calculateTotalStats([], userData?.distributedStats));
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
    (localStorage.getItem('store_viewMode') as any) || 'list'
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>(localStorage.getItem('store_filterType') || 'all');
  const [filterRarity, setFilterRarity] = useState<string>(localStorage.getItem('store_filterRarity') || 'all');
  const [sortBy, setSortBy] = useState<string>(localStorage.getItem('store_sortBy') || 'rarity-desc');
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem('store_viewMode', viewMode);
    localStorage.setItem('store_filterType', filterType);
    localStorage.setItem('store_filterRarity', filterRarity);
    localStorage.setItem('store_sortBy', sortBy);
  }, [viewMode, filterType, filterRarity, sortBy]);

  useEffect(() => {
    fetchStoreData();
  }, [tenantId]);

  // Enquanto o Bazar estiver aberto, processa anúncios expirados periodicamente
  // (buff vencido -> item volta ao inventário ou é ocultado sem espaço)
  useEffect(() => {
    if (activeTab !== 'market') return;
    const int = setInterval(() => { fetchStoreData(false); }, 60 * 1000);
    return () => clearInterval(int);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const fetchStoreData = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    const econ = await fetchEconomySettings(tenantId);
    setEconomyType(econ.currencyType);
    setEconomySettings(econ);

    // Buscar itens da loja: APENAS os locais da escola (catálogo montado pelo admin)
    let storeQuery = supabase.from('store_items').select('*').eq('active', true);
    if (tenantId) {
      storeQuery = storeQuery.eq('tenant_id', tenantId);
    } else {
      // Sem tenant: não listar itens órfãos de outras escolas (evita o "limbo")
      storeQuery = storeQuery.eq('tenant_id', '00000000-0000-0000-0000-000000000001');
    }
    const { data: storeSnap } = await storeQuery;
    const loaded: StoreItem[] = [];
    (storeSnap || []).forEach(d => {
      const data = d.data as StoreItem;
      loaded.push({ ...data, id: d.id, price: d.price } as StoreItem);
    });
    setItems(loaded);

    if (userData.uid) {
      const { data: myItemsSnap } = await supabase.from('user_items').select('*').eq('student_id', userData.uid);
      let count = 0;
      const wrapIds: string[] = [];
      const consumableQuantities: Record<string, number> = {};
      const equippedItemsForStats: any[] = [];

      (myItemsSnap || []).forEach(doc => {
        const d = doc.data as any;
        if (!d.forSale && doc.student_id !== 'dropped') {
          if (doc.equipped) {
            equippedItemsForStats.push(d);
          }
          if (d.itemType === 'consumable') {
            const key = doc.item_id;
            if (!doc.equipped) {
              consumableQuantities[key] = (consumableQuantities[key] || 0) + (d.quantity || 1);
            }
          } else {
            if (!doc.equipped) count++;
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
      setTotalEquippedStats(calculateTotalStats(equippedItemsForStats, userData?.distributedStats));
    }

    const { data: userSnap } = await supabase.from('users').select('*').eq('role', 'student');
    const loadedStudents: UserData[] = [];
    (userSnap || []).forEach(d => {
       const u = d.data as UserData;
       loadedStudents.push({ ...u, uid: d.id, name: d.name, email: d.email, xp: d.xp, coins: d.coins, role: d.role, photoURL: d.photo_url, classId: d.class_id });
    });
    loadedStudents.sort((a,b) => a.name.localeCompare(b.name));
    setStudents(loadedStudents);
    
    // Processar anúncios expirados (buff vencido -> item volta ao inventário
    // ou é ocultado do bazar até haver espaço) antes de listar o bazar.
    await processExpiredSales();

    const { data: marketSnap } = await supabase.from('user_items').select('*').eq('data->>forSale', 'true');
    const loadedMarket: MarketItem[] = [];
    (marketSnap || []).forEach(d => {
      const data = d.data as MarketItem;
      // Ocultos: buff expirado e vendedor sem espaço — não aparecem no bazar
      if (data.hiddenFromMarket === true) return;
      // Filtrar conforme o alcance configurado no Bazar (economia da escola)
      const scope = econ.bazarCommerceScope || 'all';
      if (scope === 'school' && tenantId && d.tenant_id !== tenantId) return;
      if (scope === 'class') {
        const sellerClass = data.sellerClassName || '';
        const myClass = userData?.classId || '';
        if (tenantId && d.tenant_id !== tenantId) return;
        if (myClass && sellerClass && sellerClass !== myClass) return;
      }
      const originalStoreItem = loaded.find(si => si.id === d.item_id);
      const patchedRarity = data.rarity || originalStoreItem?.rarity || 'common';
      loadedMarket.push({ ...data, id: d.id, itemId: d.item_id, rarity: patchedRarity });
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

    const isStaff = userData.role !== 'student' && !userData.studentViewActive;
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
    const ratio = economySettings?.coinToXPRatio || 10;
    
    const unitCost = Math.floor((economyType === 'xp' && method === 'coins') ? item.cost * ratio * discountMultiplier : item.cost * discountMultiplier);
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
        const boxIdToConsume = giftWrapItemIds[0];
        await supabase.from('user_items').delete().eq('id', boxIdToConsume);
        setGiftWrapItemIds(prev => prev.slice(1));
      }

      let newBalance = balanceToCheck;
      if (!isStaff) {
        newBalance = balanceToCheck - finalCost;
        if (method === 'xp') {
          await supabase.from('users').update({ xp: newBalance }).eq('id', userData.uid);
          userData.xp = newBalance;
        } else {
          await supabase.from('users').update({ coins: newBalance }).eq('id', userData.uid);
          userData.coins = newBalance;
        }
      }

      let finalAdds: ItemAdd[] = [];
      if (item.type === 'equippable') {
        const globalGachaConfig = await fetchGlobalGachaConfig();
        finalAdds = rollItemAdds(item.gachaConfig, item.fixedAttributes, (item.useGlobalGacha ?? true) ? globalGachaConfig : undefined);
      }
      
      let remainingToBuy = quantityToBuy;
      while (remainingToBuy > 0) {
        const qty = Math.min(remainingToBuy, 99);
        await supabase.from('user_items').insert({
          student_id: recipientId,
          item_id: item.id,
          equipped: false,
          data: {
            itemTitle: item.title,
            itemDescription: item.description || '',
            itemType: item.type,
            itemImageUrl: item.imageUrl || '',
            gameEffect: item.gameEffect || 'none',
            usableInQuest: item.usableInQuest || false,
            quantity: qty,
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
            buffDurationDays: item.buffDurationDays || 7,
            backColor: item.backColor || ''
          }
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
      fetchStoreData(false);
    } catch (err) {
      showToast('Erro ao processar o pagamento.', 'error');
    }
    setPurchasing(null);
  };

  const submitMarketBuy = async () => {
    if (!userData.uid || !marketBuyModalItem) return;
    
    const isStaff = userData.role !== 'student' && !userData.studentViewActive;
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
        if (economyType === 'xp') {
          if (marketBuyPaymentMethod === 'xp') {
            await supabase.from('users').update({ xp: newBalance }).eq('id', userData.uid);
            userData.xp = newBalance;
          } else {
            await supabase.from('users').update({ coins: newBalance }).eq('id', userData.uid);
            userData.coins = newBalance;
          }
        } else {
          await supabase.from('users').update({ coins: newBalance }).eq('id', userData.uid);
          userData.coins = newBalance;
        }
      }

      const { data: sellerSnap } = await supabase.from('users').select('*').eq('id', marketBuyModalItem.studentId).single();
      if (sellerSnap) {
        const sellerPref = (marketBuyModalItem as any).preferredCurrency || economyType;
        const persuasionBonus = (marketBuyModalItem as any).sellerPersuasion ? (basePrice * ((marketBuyModalItem as any).sellerPersuasion / 100)) : 0;
        
        let sellerUnitReceive = basePrice;
        if (sellerPref === 'coins' && economyType === 'xp') {
          sellerUnitReceive = basePrice * (economySettings?.coinToXPRatio || 10);
        }
        const netValuePerUnit = Math.floor((sellerUnitReceive * 0.90) + persuasionBonus);
        const totalNetValue = netValuePerUnit * marketBuyQuantity;

        if (sellerPref === 'xp') {
          const sellerXp = (sellerSnap.xp || 0) + totalNetValue;
          await supabase.from('users').update({ xp: sellerXp }).eq('id', marketBuyModalItem.studentId);
        } else {
          const sellerCoins = (sellerSnap.coins || 0) + totalNetValue;
          await supabase.from('users').update({ coins: sellerCoins }).eq('id', marketBuyModalItem.studentId);
        }
      }

      if (marketBuyQuantity < (marketBuyModalItem.quantity || 1)) {
        const { data: oldItem } = await supabase.from('user_items').select('data').eq('id', marketBuyModalItem.id).single();
        if (oldItem) await supabase.from('user_items').update({ data: { ...(oldItem.data as any), quantity: (marketBuyModalItem.quantity || 1) - marketBuyQuantity } }).eq('id', marketBuyModalItem.id);
        
        const { id, docIds, count, forSale, price, sellerName, sellerPersuasion, preferredCurrency, ...itemDataToDuplicate } = marketBuyModalItem as any;
        await supabase.from('user_items').insert({
          student_id: userData.uid,
          item_id: marketBuyModalItem.itemId,
          equipped: false,
          data: {
            ...itemDataToDuplicate,
            quantity: marketBuyQuantity
          }
        });
      } else {
        const { data: oldItem } = await supabase.from('user_items').select('data').eq('id', marketBuyModalItem.id).single();
        if (oldItem) await supabase.from('user_items').update({
          student_id: userData.uid,
          data: {
            ...(oldItem.data as any),
            forSale: false,
            price: null,
            sellerName: null,
            sellerPersuasion: null,
            preferredCurrency: null,
            saleExpiresAt: null,
            saleBuffDays: null,
            hiddenFromMarket: null
          }
        }).eq('id', marketBuyModalItem.id);
      }

      showToast("Compra no Mercado realizada com sucesso!", 'success');
      setMarketBuyModalItem(null);
      fetchStoreData(false); // Recarrega loja suavemente

    } catch (err) {
      showToast('Erro ao processar a compra no mercado.', 'error');
    }
    setPurchasing(null);
  };

  const handleCancelSale = async (item: MarketItem) => {
    const isStaff = userData.role !== 'student' && !userData.studentViewActive;
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
      const { data: oldItem } = await supabase.from('user_items').select('data').eq('id', item.id).single();
      if (oldItem) await supabase.from('user_items').update({
        data: { ...(oldItem.data as any), forSale: false, price: null, sellerName: null, saleExpiresAt: null, saleBuffDays: null, hiddenFromMarket: null }
      }).eq('id', item.id);
      await showAlert("Venda cancelada! O item voltou para sua mochila.");
      fetchStoreData(false);
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
      const { data: oldItem } = await supabase.from('user_items').select('data').eq('id', item.id).single();
      if (oldItem) await supabase.from('user_items').update({
        data: { ...(oldItem.data as any), price: price }
      }).eq('id', item.id);
      await showAlert("Preço atualizado com sucesso!");
      fetchStoreData(false);
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
    const isStaff = userData.role !== 'student' && !userData.studentViewActive;
    
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
    const isStaff = userData.role !== 'student' && !userData.studentViewActive;
    
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
    if (viewMode === 'grid-small') return { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '0.5rem' };
    if (viewMode === 'list') return { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 260px), 1fr))', gap: '0.5rem' };
    return { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: '0.5rem' };
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 180px)', minHeight: '520px', animation: 'fadeIn 0.3s ease-out' }}>
      {previewItem && (
        <div className="modal-overlay">
          <div className="glass-panel modal-content modal-content-sm" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: 'var(--bg-dark)', border: '2px solid var(--border-color)', borderRadius: '16px' }}>
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
                const isSkinPreview = previewItem.gameEffect === 'unlock_skin';
                if (isSkinPreview) {
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
                  if (previewConfig.hiddenSlots && previewItem.avatarPart) {
                    previewConfig.hiddenSlots = previewConfig.hiddenSlots.filter((slot: string) => slot !== previewItem.avatarPart);
                  }
                }
                let previewAnimation = "idle";
                if (previewItem && (previewItem.avatarPart === 'legs' || previewItem.avatarPart === 'feet')) {
                  previewAnimation = "walk";
                }
                
                return <AvatarCharacter config={previewConfig} equippedItems={previewEquipped} size={300} animation={previewAnimation as any} hideConfigAddons={isSkinPreview} />;
              })()}
            </div>
            <p style={{ marginTop: '1rem', color: 'var(--text-secondary)', fontSize: '0.85rem', textAlign: 'center' }}>
              Arraste para girar. O item já está pré-visualizado em seu personagem!
            </p>
          </div>
        </div>
      )}

      <div style={{ flexShrink: 0, background: 'var(--bg-panel)', backdropFilter: 'blur(16px)', padding: '0.65rem 0.85rem', border: '1px solid var(--border-glass)', borderRadius: '14px', marginBottom: '0.75rem', boxShadow: '0 8px 30px rgba(0,0,0,0.5)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <h2 style={{ fontSize: '1.3rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Store size={24} color="var(--gold-primary)" /> Lojas do Acampamento
          </h2>
          
          {/* Saldo Permanente de Moedas e XP */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'var(--bg-badge)', padding: '0.35rem 0.75rem', borderRadius: '20px', border: '1px solid var(--gold-primary)', marginLeft: 'auto' }}>
            {economyType === 'xp' ? (
              <>
                <Star size={16} color="var(--gold-primary)" />
                <span style={{ fontSize: '0.95rem', fontWeight: 'bold', color: 'var(--gold-primary)', marginRight: '0.5rem' }}>
                  {(userData.role !== 'student' && !userData.studentViewActive) ? 'Staff' : `${userData.xp || 0} XP`}
                </span>
                <Coins size={16} color="var(--gold-primary)" />
                <span style={{ fontSize: '0.95rem', fontWeight: 'bold', color: 'var(--gold-primary)' }}>
                  {userData.role !== 'student' ? '' : `${userData.coins || 0} M`}
                </span>
              </>
            ) : (
              <>
                <Coins size={16} color="var(--gold-primary)" />
                <span style={{ fontSize: '0.95rem', fontWeight: 'bold', color: 'var(--gold-primary)' }}>
                  {(userData.role !== 'student' && !userData.studentViewActive) ? 'Staff' : `${userData.coins || 0} Moedas`}
                </span>
              </>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', alignItems: 'center' }}>
          <button 
            onClick={() => setActiveTab('official')}
            className="login-btn"
            style={{ flex: 1, padding: '0.4rem', background: activeTab === 'official' ? 'var(--gold-primary)' : 'var(--bg-card)', color: activeTab === 'official' ? 'var(--text-on-gold, #000000)' : 'var(--text-primary)', fontWeight: 'bold', fontSize: '0.85rem', justifyContent: 'center' }}
          >
            Loja Oficial
          </button>
          <button 
            onClick={() => setActiveTab('market')}
            className="login-btn"
            style={{ flex: 1, padding: '0.4rem', background: activeTab === 'market' ? 'var(--gold-primary)' : 'var(--bg-card)', color: activeTab === 'market' ? 'var(--text-on-gold, #000000)' : 'var(--text-primary)', fontWeight: 'bold', fontSize: '0.85rem', justifyContent: 'center' }}
          >
            Bazar
          </button>
          <button
            onClick={() => setIsFiltersOpen(!isFiltersOpen)}
            style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.4rem 0.75rem', background: isFiltersOpen ? 'var(--btn-hover)' : 'var(--btn-bg)', color: 'var(--text-primary)', borderRadius: '8px', border: '1px solid var(--border-glass)', cursor: 'pointer', transition: 'all 0.2s', fontSize: '0.85rem' }}
            title="Mostrar / Ocultar Filtros"
          >
            <Filter size={16} />
          </button>
        </div>

        {/* Barra de Filtros */}
        {isFiltersOpen && (
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', flexWrap: 'wrap', animation: 'fadeIn 0.2s ease-out' }}>
            <div style={{ flex: 1, minWidth: '130px', display: 'flex', alignItems: 'center', background: 'var(--bg-badge)', border: '1px solid var(--border-glass)', borderRadius: '8px', padding: '0 0.5rem' }}>
              <Search size={14} color="var(--text-secondary)" />
              <input type="text" placeholder="Buscar item..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} style={{ width: '100%', padding: '0.4rem', fontSize: '0.85rem', background: 'transparent', border: 'none', color: 'var(--text-primary)', outline: 'none' }} />
            </div>
            <select value={filterType} onChange={e => setFilterType(e.target.value)} style={{ padding: '0.4rem 0.6rem', fontSize: '0.85rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)' }}>
              <option value="all">Todos os Tipos</option>
              <option value="consumable">Consumível</option>
              <option value="equippable">Equipável</option>
            </select>
            <select value={filterRarity} onChange={e => setFilterRarity(e.target.value)} style={{ padding: '0.4rem 0.6rem', fontSize: '0.85rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)' }}>
              <option value="all">Qualquer Raridade</option>
              <option value="common">Comum</option>
              <option value="uncommon">Incomum</option>
              <option value="rare">Raro</option>
              <option value="epic">Épico</option>
              <option value="legendary">Lendário</option>
            </select>
            <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ padding: '0.4rem 0.6rem', fontSize: '0.85rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)' }}>
              <option value="name-asc">A-Z</option>
              <option value="name-desc">Z-A</option>
              <option value="price-asc">Menor Preço</option>
              <option value="price-desc">Maior Preço</option>
              <option value="rarity-desc">Raridade (Maior)</option>
              <option value="rarity-asc">Raridade (Menor)</option>
            </select>
            <div style={{ display: 'flex', gap: '0.2rem', background: 'var(--bg-badge)', padding: '0.2rem', borderRadius: '8px', border: '1px solid var(--border-glass)' }}>
              <button onClick={() => { setViewMode('grid-large'); localStorage.setItem('store_viewMode', 'grid-large'); }} style={{ padding: '0.35rem', background: viewMode === 'grid-large' ? 'rgba(255,255,255,0.1)' : 'transparent', border: 'none', borderRadius: '4px', cursor: 'pointer', color: viewMode === 'grid-large'  ? 'var(--text-primary)' : 'var(--text-secondary)' }} title="Grid Grande"><LayoutGrid size={16} /></button>
              <button onClick={() => { setViewMode('grid-small'); localStorage.setItem('store_viewMode', 'grid-small'); }} style={{ padding: '0.35rem', background: viewMode === 'grid-small' ? 'rgba(255,255,255,0.1)' : 'transparent', border: 'none', borderRadius: '4px', cursor: 'pointer', color: viewMode === 'grid-small'  ? 'var(--text-primary)' : 'var(--text-secondary)' }} title="Grid Pequeno"><Grid size={16} /></button>
              <button onClick={() => { setViewMode('list'); localStorage.setItem('store_viewMode', 'list'); }} style={{ padding: '0.35rem', background: viewMode === 'list' ? 'rgba(255,255,255,0.1)' : 'transparent', border: 'none', borderRadius: '4px', cursor: 'pointer', color: viewMode === 'list'  ? 'var(--text-primary)' : 'var(--text-secondary)' }} title="Lista"><ListIcon size={16} /></button>
            </div>
          </div>
        )}

        {/* Barra Inferior: Categorias Rápidas + Espaço da Mochila */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', paddingTop: '0.25rem' }}>
          <div>
            {activeTab === 'official' && !isFiltersOpen && (
              <div className="compact-tab-row" style={{ display: 'flex', gap: '0.35rem', overflowX: 'auto' }}>
                <button 
                  onClick={() => setOfficialCategoryTab('all')}
                  title="Todos"
                  style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', padding: '0.35rem 0.65rem', fontSize: '0.8rem', borderRadius: '20px', border: 'none', cursor: 'pointer', background: officialCategoryTab === 'all' ? 'var(--gold-primary)' : 'var(--bg-card)', color: officialCategoryTab === 'all' ? 'var(--text-on-gold, #000000)' : 'var(--text-primary)', fontWeight: 'bold' }}
                >
                  <Sparkles size={14} /> <span className="category-tab-text">Todos</span>
                </button>
                <button 
                  onClick={() => setOfficialCategoryTab('consumable')}
                  title="Consumíveis"
                  style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', padding: '0.35rem 0.65rem', fontSize: '0.8rem', borderRadius: '20px', border: 'none', cursor: 'pointer', background: officialCategoryTab === 'consumable' ? 'var(--gold-primary)' : 'var(--bg-card)', color: officialCategoryTab === 'consumable' ? 'var(--text-on-gold, #000000)' : 'var(--text-primary)', fontWeight: 'bold' }}
                >
                  <FlaskConical size={14} /> <span className="category-tab-text">Consumíveis</span>
                </button>
                <button 
                  onClick={() => setOfficialCategoryTab('attack')}
                  title="Ataque"
                  style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', padding: '0.35rem 0.65rem', fontSize: '0.8rem', borderRadius: '20px', border: 'none', cursor: 'pointer', background: officialCategoryTab === 'attack' ? 'var(--gold-primary)' : 'var(--btn-bg)', color: officialCategoryTab === 'attack'  ? 'var(--text-on-gold, #000000)' : 'var(--text-primary)', fontWeight: 'bold' }}
                >
                  <Sword size={14} /> <span className="category-tab-text">Ataque</span>
                </button>
                <button 
                  onClick={() => setOfficialCategoryTab('defense')}
                  title="Defesa"
                  style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', padding: '0.35rem 0.65rem', fontSize: '0.8rem', borderRadius: '20px', border: 'none', cursor: 'pointer', background: officialCategoryTab === 'defense' ? 'var(--gold-primary)' : 'var(--btn-bg)', color: officialCategoryTab === 'defense'  ? 'var(--text-on-gold, #000000)' : 'var(--text-primary)', fontWeight: 'bold' }}
                >
                  <Shield size={14} /> <span className="category-tab-text">Defesa</span>
                </button>
                <button 
                  onClick={() => setOfficialCategoryTab('other')}
                  title="Outros"
                  style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', padding: '0.35rem 0.65rem', fontSize: '0.8rem', borderRadius: '20px', border: 'none', cursor: 'pointer', background: officialCategoryTab === 'other' ? 'var(--gold-primary)' : 'var(--btn-bg)', color: officialCategoryTab === 'other'  ? 'var(--text-on-gold, #000000)' : 'var(--text-primary)', fontWeight: 'bold' }}
                >
                  <Package size={14} /> <span className="category-tab-text">Outros</span>
                </button>
              </div>
            )}
          </div>

          <div style={{ color: 'var(--text-secondary)', background: 'var(--bg-badge)', padding: '0.35rem 0.65rem', borderRadius: '12px', fontSize: '0.8rem', marginLeft: 'auto' }}>
            Mochila: <strong style={{ color: myInventoryCount >= maxInventorySpace ? 'var(--accent-red)' : 'var(--accent-green)' }}>{myInventoryCount}</strong> / {maxInventorySpace}
          </div>
        </div>
      </div>

      {/* Container Rolável Exclusivo dos Itens */}
      <div style={{ flex: 1, overflowY: 'auto', paddingRight: '0.25rem' }}>
        {activeTab === 'official' && (
          <div className={viewMode === 'list' ? 'store-grid-list' : ''} style={getGridStyle()}>
          {processedItems.map(item => {
            const isStaff = userData.role !== 'student' && !userData.studentViewActive;
            const itemQty = item.type === 'consumable' ? (quantities[item.id] || 1) : 1;
            const discountMultiplier = Math.max(0.5, 1 - (totalEquippedStats.persuasion / 100));
            const totalCost = Math.floor(item.cost * discountMultiplier) * itemQty;
            const ratio = economyType === 'xp' ? (economySettings?.coinToXPRatio || 10) : 1;
            const totalCostCoins = Math.floor(item.cost * ratio * discountMultiplier) * itemQty;
            
            const canAfford = isStaff || currentBalance >= (economyType === 'xp' ? totalCost : totalCostCoins);
            const currentRank = getRankForXp(userData.xp || 0, (userData as any).classId);
            const currentRankIndex = RANKS.findIndex(r => r.name === currentRank.name) || 0;
            const meetsRank = isStaff || currentRankIndex >= item.minRankRequired;
            const isGiftingThis = giftingItemId === item.id;

            const isList = viewMode === 'list';

            return (
              <div key={item.id} className={`glass-panel rarity-${item.rarity || 'common'} ${isList ? 'store-list-card' : ''}`} style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: isList ? 'row' : 'column' }}>
                <div className={isList ? 'store-list-card-media' : ''} style={{ position: 'relative', width: isList ? '75px' : '100%', aspectRatio: isList ? 'none' : '1', minHeight: isList ? '75px' : undefined, background: 'rgba(0,0,0,0.3)', borderRadius: '10px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {item.gameEffect === 'unlock_skin' && item.unlockedSkinId ? (
                    <SkinBuffIcon skinUrl={item.unlockedSkinId} durationDays={item.buffDurationDays || 7} size={50} />
                  ) : (
                    <ItemIcon item={item} size={isList ? 70 : 120} />
                  )}
                  {item.type === 'equippable' && (
                    <div style={{ position: 'absolute', top: '4px', right: '4px', background: 'rgba(0,0,0,0.8)', padding: '2px', borderRadius: '3px' }}>
                      <Swords size={11} color="var(--gold-primary)" />
                    </div>
                  )}
                  {(item.type === 'equippable' || item.gameEffect === 'unlock_skin') && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setPreviewItem(item); }}
                      title="Ver no Personagem"
                      style={{
                        position: 'absolute',
                        bottom: '4px',
                        right: '4px',
                        background: 'rgba(0,0,0,0.7)',
                        border: 'none',
                        borderRadius: '4px',
                        padding: '3px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--text-secondary)',
                        zIndex: 6
                      }}
                    >
                      <Eye size={12} />
                    </button>
                  )}
                  {item.type === 'consumable' && (
                    <div style={{
                      position: 'absolute',
                      bottom: '4px',
                      left: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '2px',
                      background: 'rgba(0,0,0,0.7)',
                      borderRadius: '4px',
                      padding: '2px 4px',
                      zIndex: 6
                    }}>
                      <span style={{ fontSize: '0.6rem', color: 'var(--text-secondary)' }}>Qtd:</span>
                      <input 
                        type="number" 
                        min="1" 
                        max="999" 
                        value={quantities[item.id] || 1} 
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => setQuantities({...quantities, [item.id]: Math.max(1, Math.min(999, parseInt(e.target.value) || 1))})}
                        style={{ width: '32px', padding: '1px 2px', borderRadius: '4px', background: 'rgba(255,255,255,0.15)', color: 'white', border: 'none', fontSize: '0.65rem', textAlign: 'center' }}
                      />
                    </div>
                  )}
                  <div className={`rarity-badge ${item.rarity || 'common'}`}>
                    {getRarityLabel(item.rarity)}
                  </div>
                  {viewMode !== 'list' && (
                    <div style={{ position: 'absolute', top: '4px', right: '4px', background: canAfford ? 'var(--bg-badge)' : 'rgba(239, 68, 68, 0.9)', padding: '0.15rem 0.4rem', borderRadius: '8px', border: `1px solid ${canAfford ? 'var(--gold-primary)' : 'var(--accent-red)'}`, color: canAfford  ? 'var(--gold-primary)'  : 'var(--text-primary)', fontWeight: 'bold', fontSize: '0.7rem' }}>
                       {isStaff ? 'Grátis' : `${economyType === 'xp' ? totalCost + ' XP' : totalCostCoins + ' Moedas'}`}
                    </div>
                  )}
                </div>
                <div style={{ padding: '0.5rem 0.65rem', display: 'flex', flexDirection: 'column', flex: 1, gap: '0.25rem', minWidth: 0, justifyContent: 'center' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.4rem' }}>
                    <h3 title={item.title} style={{ fontSize: '0.85rem', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, lineHeight: 1.2, fontWeight: 'bold' }}>{item.title}</h3>
                    {isList && (
                      <div style={{ flexShrink: 0, background: canAfford ? 'var(--bg-badge)' : 'rgba(239, 68, 68, 0.9)', padding: '0.15rem 0.4rem', borderRadius: '8px', border: `1px solid ${canAfford ? 'var(--gold-primary)' : 'var(--accent-red)'}`, color: canAfford  ? 'var(--gold-primary)'  : 'var(--text-primary)', fontWeight: 'bold', fontSize: '0.7rem' }}>
                         {isStaff ? 'Grátis' : `${economyType === 'xp' ? totalCost + ' XP' : totalCostCoins + ' M'}`}
                      </div>
                    )}
                  </div>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.72rem', margin: 0, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {item.description}
                  </p>
                  
                  {!meetsRank ? (
                    <div style={{ padding: '0.4rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--accent-red)', borderRadius: '6px', color: 'var(--accent-red)', fontSize: '0.75rem', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem' }}>
                      <ShieldAlert size={14} /> Requer Patente: {RANKS[item.minRankRequired]?.name}
                    </div>
                  ) : (
                    <>
                      {!isGiftingThis ? (
                        <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'nowrap', alignItems: 'center', marginTop: '0.2rem' }}>
                          
                          <div style={{ display: 'flex', gap: '0.3rem', flex: 1 }}>
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
                                  padding: '0.3rem 0.4rem',
                                  opacity: canAfford ? 1 : 0.5,
                                  cursor: canAfford ? 'pointer' : 'not-allowed',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: '0.25rem'
                                }}
                              >
                                {purchasing === item.id ? <span style={{ fontSize: '0.75rem' }}>...</span> : (
                                  <>
                                    <Star size={13} fill="currentColor" />
                                    <span style={{ fontWeight: 'bold', fontSize: '0.75rem' }}>{totalCost}</span>
                                  </>
                                )}
                              </button>
                              {economySettings?.coinsCanBuyItems && (
                                <button 
                                  className="login-btn hover-brightness" 
                                  disabled={isStaff ? false : ((userData.coins || 0) < totalCostCoins) || purchasing === item.id}
                                  title={(isStaff || (userData.coins || 0) >= totalCostCoins) ? 'Comprar com Moedas' : 'Sem Moedas'}
                                  onClick={() => handlePurchase(item, false, 'coins')}
                                  style={{ 
                                    flex: 1,
                                    background: (isStaff || (userData.coins || 0) >= totalCostCoins) ? 'var(--btn-bg)' : 'rgba(255,255,255,0.05)', 
                                    color: (isStaff || (userData.coins || 0) >= totalCostCoins) ? 'var(--gold-primary)' : 'var(--text-secondary)', 
                                    border: '1px solid var(--border-glass)', 
                                    padding: '0.3rem 0.4rem',
                                    opacity: (isStaff || (userData.coins || 0) >= totalCostCoins) ? 1 : 0.5,
                                    cursor: (isStaff || (userData.coins || 0) >= totalCostCoins) ? 'pointer' : 'not-allowed',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '0.25rem'
                                  }}
                                >
                                  {purchasing === item.id ? <span style={{ fontSize: '0.75rem' }}>...</span> : (
                                    <>
                                      <Coins size={13} />
                                      <span style={{ fontWeight: 'bold', fontSize: '0.75rem' }}>{totalCostCoins}</span>
                                    </>
                                  )}
                                </button>
                              )}
                             </>
                          ) : (
                            <button 
                              className="login-btn hover-brightness" 
                              disabled={!canAfford || purchasing === item.id}
                              title={canAfford ? 'Comprar com Moedas' : 'Sem Moedas'}
                              onClick={() => handlePurchase(item, false, 'coins')}
                              style={{ 
                                flex: 1,
                                background: canAfford ? 'var(--gold-primary)' : 'rgba(255,255,255,0.1)', 
                                color: canAfford ? 'var(--text-on-gold, #000000)' : 'var(--text-secondary)', 
                                border: 'none', 
                                padding: '0.3rem 0.4rem',
                                opacity: canAfford ? 1 : 0.5,
                                cursor: canAfford ? 'pointer' : 'not-allowed',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '0.25rem'
                              }}
                            >
                              {purchasing === item.id ? <span style={{ fontSize: '0.75rem' }}>...</span> : (
                                <>
                                  <Coins size={13} />
                                  <span style={{ fontWeight: 'bold', fontSize: '0.75rem' }}>{totalCostCoins}</span>
                                </>
                              )}
                            </button>
                          )}
                          </div>

                          {((userData.role !== 'student' && !userData.studentViewActive) || giftWrapItemIds.length > 0) && (
                            <button
                              onClick={() => setGiftingItemId(item.id)}
                              className="login-btn hover-brightness"
                              title="Presentear um Colega (Gasta 1 Embalagem)"
                              style={{ padding: '0.3rem 0.45rem', background: 'rgba(168, 85, 247, 0.2)', border: '1px solid #a855f7', color: '#c084fc', borderRadius: '8px' }}
                            >
                              <Gift size={13} />
                            </button>
                          )}
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', background: 'rgba(0,0,0,0.4)', padding: '0.4rem', borderRadius: '8px', border: '1px solid #a855f7', marginTop: '0.2rem' }}>
                          <span style={{ fontSize: '0.7rem', color: '#c084fc', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                            <Gift size={11} /> Escolha o colega:
                          </span>
                          <select
                            value={selectedGiftRecipient}
                            onChange={(e) => setSelectedGiftRecipient(e.target.value)}
                            style={{ width: '100%', padding: '0.25rem', borderRadius: '4px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontSize: '0.75rem' }}
                          >
                            <option value="">Selecione um aluno...</option>
                            {students.filter(s => s.uid !== userData.uid).map(s => (
                              <option key={s.uid} value={s.uid}>{s.name} ({s.classId || 'Sem Turma'})</option>
                            ))}
                          </select>
                          <div style={{ display: 'flex', gap: '0.25rem' }}>
                            <button
                              onClick={() => { setGiftingItemId(null); setSelectedGiftRecipient(''); }}
                              style={{ flex: 1, padding: '0.25rem', borderRadius: '4px', background: 'transparent', border: '1px solid var(--border-glass)', color: 'var(--text-secondary)', fontSize: '0.7rem', cursor: 'pointer' }}
                            >
                              Cancelar
                            </button>
                            <button
                              disabled={!selectedGiftRecipient || !canAfford || purchasing === item.id}
                              onClick={() => handlePurchase(item, true, economyType)}
                              style={{ flex: 1, padding: '0.25rem', borderRadius: '4px', background: selectedGiftRecipient && canAfford ? '#a855f7' : 'rgba(255,255,255,0.1)', border: 'none', color: 'white', fontWeight: 'bold', fontSize: '0.7rem', cursor: selectedGiftRecipient && canAfford ? 'pointer' : 'not-allowed' }}
                            >
                              {purchasing === item.id ? '...' : 'Enviar'}
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
          {processedItems.length === 0 && (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
              <Store size={48} style={{ margin: '0 auto 1rem auto', opacity: 0.5 }} />
              <p>Nenhum item encontrado.</p>
            </div>
          )}
        </div>
        )}

        {activeTab === 'market' && (
        <div className={viewMode === 'list' ? 'store-grid-list' : ''} style={getGridStyle()}>
          {processedMarketItems.length === 0 && (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
              Nenhum item encontrado no Bazar.
            </div>
          )}
          {processedMarketItems.map(item => {
            const isStaff = userData.role !== 'student' && !userData.studentViewActive;
            const canAfford = isStaff || currentBalance >= (item.price || 0);
            const isList = viewMode === 'list';
            
            return (
              <div key={item.id} className={`glass-panel rarity-${item.rarity || 'common'} ${isList ? 'store-list-card' : ''}`} style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: isList ? 'row' : 'column' }}>
                <div className={isList ? 'store-list-card-media' : ''} style={{ width: isList ? '75px' : '100%', height: isList ? '75px' : undefined, aspectRatio: isList ? 'none' : '1', background: 'rgba(0,0,0,0.5)', borderRadius: '10px', overflow: 'hidden', border: '1px solid var(--border-glass)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <ItemIcon item={item} size={isList ? 70 : 80} />
                </div>
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
                  <div style={{ position: 'absolute', top: '5px', right: '5px', background: canAfford ? 'var(--bg-badge)' : 'rgba(239, 68, 68, 0.9)', padding: '0.25rem 0.5rem', borderRadius: '12px', border: `1px solid ${canAfford ? 'var(--gold-primary)' : 'var(--accent-red)'}`, color: canAfford  ? 'var(--gold-primary)'  : 'var(--text-primary)', fontWeight: 'bold', fontSize: '0.8rem' }}>
                    {item.price || 0} {economyType === 'xp' ? 'XP' : 'Moedas'}
                  </div>
                )}
                <div style={{ padding: '0.5rem 0.65rem', display: 'flex', flexDirection: 'column', flex: 1, gap: '0.25rem', minWidth: 0, justifyContent: 'center' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.4rem' }}>
                    <h3 title={item.itemTitle} style={{ fontSize: viewMode === 'grid-small' ? '0.85rem' : '0.95rem', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, lineHeight: 1.2, fontWeight: 'bold' }}>{item.itemTitle}</h3>
                    {isList && (
                      <div style={{ flexShrink: 0, background: canAfford ? 'var(--bg-badge)' : 'rgba(239, 68, 68, 0.9)', padding: '0.15rem 0.4rem', borderRadius: '8px', border: `1px solid ${canAfford ? 'var(--gold-primary)' : 'var(--accent-red)'}`, color: canAfford  ? 'var(--gold-primary)'  : 'var(--text-primary)', fontWeight: 'bold', fontSize: '0.75rem' }}>
                        {item.price || 0} {economyType === 'xp' ? 'XP' : 'M'}
                      </div>
                    )}
                  </div>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.72rem', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    Vendido por: <strong style={{ color: 'var(--gold-primary)' }}>
                      {item.sellerName?.split(' ')[0]} 
                      {item.sellerClassName && <span style={{ color: item.sellerClassColor || 'inherit' }}> | {item.sellerClassName}</span>}
                    </strong>
                  </p>
                  {item.saleExpiresAt && (
                    <div style={{ fontSize: '0.68rem', color: 'var(--gold-primary)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      ⏳ Anúncio expira em <strong>{formatSaleRemaining(item.saleExpiresAt)}</strong>
                    </div>
                  )}
                  {viewMode !== 'grid-small' && items.find(si => si.id === item.itemId)?.description && (
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.72rem', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {items.find(si => si.id === item.itemId)?.description}
                    </p>
                  )}
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.3rem', marginTop: '0.2rem' }}>
                    <div>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', background: 'rgba(0,0,0,0.3)', padding: '0.15rem 0.4rem', borderRadius: '4px' }}>
                        {item.itemType === 'consumable' ? 'Consumível' : 'Equipável'}
                      </span>
                    </div>
                    {item.itemType === 'equippable' && item.baseAttributeType && item.baseAttributeType !== 'none' && (
                      <div style={{ fontSize: '0.75rem', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.3rem' }}>
                        <div style={{ color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                          <strong style={{ color: 'var(--gold-primary)' }}>+{item.baseAttributeValue}</strong> {getAttributeName(item.baseAttributeType)}
                        </div>
                        {item.adds && item.adds.length > 0 && item.adds.map((add, idx) => (
                          <div key={idx} style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                            <span style={{ color: 'var(--border-glass)' }}>|</span>
                            <span><strong style={{ color: '#60A5FA' }}>+{add.value}</strong> {getAttributeName(add.type)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  
                  <div style={{ display: 'flex', gap: '0.3rem', width: '100%', marginTop: '0.2rem', alignItems: 'center' }}>
                    {item.studentId === userData.uid ? (
                      <div style={{ display: 'flex', gap: '0.3rem', flex: 1 }}>
                        <button 
                          className="login-btn hover-brightness" 
                          onClick={() => handleEditPrice(item)}
                          title="Editar Preço"
                          style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', background: 'rgba(59, 130, 246, 0.2)', color: '#60A5FA', border: '1px solid rgba(59, 130, 246, 0.3)', padding: '0.35rem' }}
                        >
                          <Edit3 size={14} />
                        </button>
                        <button 
                          className="login-btn hover-brightness" 
                          onClick={() => handleCancelSale(item)}
                          title="Cancelar Venda"
                          style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', background: 'rgba(239, 68, 68, 0.2)', color: '#F87171', border: '1px solid rgba(239, 68, 68, 0.3)', padding: '0.35rem' }}
                        >
                          <Trash2 size={14} />
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
                          padding: '0.35rem',
                          opacity: canAfford ? 1 : 0.5,
                          cursor: canAfford ? 'pointer' : 'not-allowed'
                        }}
                      >
                        {purchasing === item.id ? <span style={{ fontSize: '0.75rem' }}>...</span> : <ShoppingCart size={15} />}
                      </button>
                    )}
                    
                    {(item.itemType === 'equippable' || item.gameEffect === 'unlock_skin') && (
                      <button
                        className="login-btn hover-brightness"
                        onClick={() => setPreviewItem(item)}
                        title="Ver no Personagem"
                        style={{
                          background: 'var(--btn-bg)',
                          color: 'var(--text-primary)',
                          border: '1px solid var(--border-glass)',
                          padding: '0.35rem 0.5rem',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                      >
                        <Eye size={15} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        )}
      </div>

      {marketBuyModalItem && (
        <div className="modal-overlay">
          <div className="glass-panel modal-content modal-content-sm">
            <h3 style={{ marginTop: 0, color: 'var(--gold-primary)', fontSize: '1.5rem' }}>Confirmar Compra</h3>
            <div className="glass-panel" style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1.5rem', background: 'rgba(0,0,0,0.3)' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: 'var(--bg-dark)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
              {marketBuyModalItem.itemImageUrl || marketBuyModalItem.minecraftHeadValue ? (
                <ItemIcon item={marketBuyModalItem} size={40} />
              ) : (
                <Package size={20} color="var(--text-secondary)" />
              )}
            </div>
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
              <button onClick={() => setMarketBuyModalItem(null)} className="login-btn hover-brightness" style={{ flex: 1, background: 'var(--btn-bg)', color: 'var(--text-primary)', border: '1px solid var(--border-glass)' }}>Cancelar</button>
              <button onClick={submitMarketBuy} className="login-btn" disabled={purchasing === marketBuyModalItem.id} style={{ flex: 1, background: 'var(--gold-primary)', color: 'var(--text-on-gold, #000000)' }}>Confirmar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
