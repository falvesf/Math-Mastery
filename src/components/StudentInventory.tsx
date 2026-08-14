import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { db } from '../lib/firebase';
import { collection, query, getDocs, getDoc, where, doc, updateDoc, deleteDoc, addDoc } from 'firebase/firestore';
import { Package, Lock, Search, LayoutGrid, Grid, List as ListIcon, Shield, Coins, Trash2, Zap, Hand, Sparkles, FlaskConical, Sword } from 'lucide-react';
import type { UserData } from '../contexts/AuthContext';
import { useDialog } from '../contexts/DialogContext';
import { RANKS, getRankForXp } from '../lib/ranks';
import { ATTRIBUTE_LABELS, rollExactAttributes, type ItemCategory, type AttributeType, type ItemAdd, calculateTotalStats, fetchGlobalGachaConfig } from '../lib/gacha';
interface UserItem {
  id: string;
  itemId: string;
  itemTitle: string;
  itemType: 'consumable' | 'equippable';
  itemImageUrl: string;
  quantity: number;
  equipped: boolean;
  giftedBy?: string;
  gameEffect?: string;
  count?: number;
  docIds?: string[];
  avatarPart?: string;
  studentId?: string;
  droppedBy?: string;
  forSale?: boolean;
  price?: number;
  sellerName?: string;
  itemCategory?: ItemCategory;
  baseAttributeType?: AttributeType;
  baseAttributeValue?: number;
  adds?: ItemAdd[];
  minSalePrice?: number; // Preço mínimo definido pelo admin
  preferredCurrency?: 'xp' | 'coins';
  itemDescription?: string;
  rarity?: string;
  unlockedSkinId?: string;
  buffDurationDays?: number;
}

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


export default function StudentInventory({ userData, onEquip, inventoryRefresh }: { userData: UserData, onEquip?: () => void, inventoryRefresh?: number }) {
  const { showAlert, showConfirm, showConfirmWithCheckbox, showToast } = useDialog();
  const [items, setItems] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sellModalItem, setSellModalItem] = useState<UserItem | null>(null);
  const [sellPrice, setSellPrice] = useState('');
  const [sellQuantity, setSellQuantity] = useState(1);
  const [trashModalItem, setTrashModalItem] = useState<UserItem | null>(null);
  const [trashQuantity, setTrashQuantity] = useState(1);
  const [preferredCurrency, setPreferredCurrency] = useState<'xp' | 'coins'>('xp');
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [draggedItem, setDraggedItem] = useState<UserItem | null>(null);
  const [economyType, setEconomyType] = useState<'xp'|'coins'>('coins');
  const [economySettings, setEconomySettings] = useState<any>(null);

  const [viewMode, setViewMode] = useState<'grid-large' | 'grid-small' | 'list'>(userData.inventoryPreferences?.viewMode as any || 'grid-large');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRarity, setFilterRarity] = useState<string>(userData.inventoryPreferences?.filterRarity || 'all');
  
  const [activeCategory, setActiveCategory] = useState<string>(sessionStorage.getItem('pendingCategory') || userData.inventoryPreferences?.activeCategory || 'Todos');
  const [cascadeAnimationTrigger, setCascadeAnimationTrigger] = useState<number>(sessionStorage.getItem('pendingCategory') ? Date.now() : 0);

  useEffect(() => {
    if (sessionStorage.getItem('pendingCategory')) {
      sessionStorage.removeItem('pendingCategory');
      setTimeout(() => setCascadeAnimationTrigger(0), 4000);
    }
    const handleTabSelect = (e: any) => {
      setActiveCategory(e.detail.category);
      setCascadeAnimationTrigger(Date.now());
      // Remover a animação depois que terminar para poder rodar de novo se clicar na mesma aba
      setTimeout(() => setCascadeAnimationTrigger(0), 4000); 
    };
    window.addEventListener('select-inventory-tab', handleTabSelect);
    return () => window.removeEventListener('select-inventory-tab', handleTabSelect);
  }, []);
  
  // Custom slot mapping
  const [slotMap, setSlotMap] = useState<Record<string, number>>((userData.inventoryPreferences as any)?.slotMap || {});
  
  const inventoryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!userData.uid) return;
    const savePreferences = async () => {
      try {
        await updateDoc(doc(db, 'users', userData.uid), {
          inventoryPreferences: { viewMode, activeCategory, filterRarity }
        });
      } catch (err) {}
    };
    const t = setTimeout(savePreferences, 1000);
    return () => clearTimeout(t);
  }, [viewMode, activeCategory, filterRarity, userData.uid]);

  const currentRank = getRankForXp(userData.xp || 0, (userData as any).classId);
  const currentRankIndex = RANKS.findIndex(r => r.name === currentRank.name) || 0;
  const totalEquippedStats = calculateTotalStats(items.filter(i => i.equipped));
  const extraSlotsFromFortitude = Math.floor(totalEquippedStats.fortitude / 30);
  const maxInventorySpace = 6 + currentRankIndex + (userData?.extraInventorySpace || 0) + extraSlotsFromFortitude;
  const currentSpaceOccupied = items.filter(i => !i.equipped).length;

  useEffect(() => {
    fetchInventory();
  }, [userData.uid, inventoryRefresh]);

  useEffect(() => {
    const handleEquipEvent = (e: any) => {
      const { itemId, targetSlot } = e.detail;
      const itemToEquip = items.find(i => i.id === itemId);
      if (!itemToEquip) return;
      
      let compatible = false;
      if (itemToEquip.avatarPart === targetSlot) compatible = true;
      if (itemToEquip.avatarPart === 'hand' && (targetSlot === 'hand1' || targetSlot === 'hand2')) compatible = true;
      if (itemToEquip.avatarPart === 'two_handed' && (targetSlot === 'hand1' || targetSlot === 'hand2')) compatible = true;
      if (itemToEquip.avatarPart === 'rightHand' && targetSlot === 'hand1') compatible = true;
      if (itemToEquip.avatarPart === 'leftHand' && targetSlot === 'hand2') compatible = true;

      if (compatible && !itemToEquip.equipped) {
        handleEquip(itemToEquip);
      } else if (!compatible) {
         showAlert('Este item não pode ser equipado neste slot!');
      }
    };
    window.addEventListener('equip-item', handleEquipEvent);
    return () => window.removeEventListener('equip-item', handleEquipEvent);
  }, [items]);

  const fetchInventory = async () => {
    if (!userData.uid) return;
    setLoading(true);

    const econRef = doc(db, 'settings', 'economy');
    const econSnap = await getDoc(econRef);
    if (econSnap.exists()) {
      const eData = econSnap.data();
      setEconomyType(eData.currencyType || 'coins');
      setEconomySettings(eData);
    }

    const storeQ = query(collection(db, 'store_items'));
    const storeSnap = await getDocs(storeQ);
    const storeRarities = new Map<string, string>();
    storeSnap.forEach(d => {
      storeRarities.set(d.id, d.data().rarity || 'common');
    });

    const q = query(collection(db, 'user_items'), where('studentId', '==', userData.uid));
    const snap = await getDocs(q);
    const loaded: UserItem[] = [];
    snap.forEach(d => {
      const data = d.data();
      loaded.push({ id: d.id, ...data, rarity: data.rarity || storeRarities.get(data.itemId) || 'common' } as UserItem);
    });

    const finalItems: UserItem[] = [];

    for (const item of loaded) {
      // Ocultar itens que foram dropados ou que estão à venda
      if (item.forSale || item.studentId === 'dropped') continue;
      
      if (item.itemType === 'consumable') {
        const qty = item.quantity || 1;
        if (qty > 99) {
          const excess = qty - 99;
          item.count = 99;
          
          if (!(window as any)[`migrating_${item.id}`]) {
            (window as any)[`migrating_${item.id}`] = true;
            
            const { id, docIds, count, rarity, ...itemDataToDuplicate } = item as any;
            Promise.all([
              updateDoc(doc(db, 'user_items', item.id), { quantity: 99 }),
              addDoc(collection(db, 'user_items'), {
                ...itemDataToDuplicate,
                quantity: excess
              })
            ]).finally(() => {
              setTimeout(() => { (window as any)[`migrating_${item.id}`] = false; }, 2000);
            });
          }
        } else {
          item.count = qty;
        }
      }
      
      finalItems.push(item);
    }

    setItems(finalItems);
    setLoading(false);
  };

  const consumeItemQuantity = async (itemId: string, amount: number = 1, specificDocId?: string) => {
    if (!userData.uid) return;
    let remainingToRemove = amount;

    if (specificDocId) {
      const specificDocRef = doc(db, 'user_items', specificDocId);
      const specificDocSnap = await getDoc(specificDocRef);
      if (specificDocSnap.exists()) {
        const data = specificDocSnap.data() as UserItem;
        if (data.itemType === 'consumable' && !data.forSale && data.studentId === userData.uid) {
          const qty = data.quantity || 1;
          if (qty <= remainingToRemove) {
            await deleteDoc(specificDocRef);
            remainingToRemove -= qty;
          } else {
            await updateDoc(specificDocRef, { quantity: qty - remainingToRemove });
            remainingToRemove = 0;
          }
        }
      }
    }

    if (remainingToRemove <= 0) return;

    const q = query(collection(db, 'user_items'), where('studentId', '==', userData.uid), where('itemId', '==', itemId));
    const snap = await getDocs(q);
    
    for (const d of snap.docs) {
      if (d.id === specificDocId) continue;
      if (remainingToRemove <= 0) break;
      const data = d.data() as UserItem;
      if (data.itemType !== 'consumable' || data.forSale) continue;
      
      const qty = data.quantity || 1;
      if (qty <= remainingToRemove) {
        await deleteDoc(d.ref);
        remainingToRemove -= qty;
      } else {
        await updateDoc(d.ref, { quantity: qty - remainingToRemove });
        remainingToRemove = 0;
      }
    }
  };

  const handleEquip = async (item: UserItem) => {
    const newState = !item.equipped;
    const docToUpdate = item.docIds ? item.docIds[0] : item.id;
    
    // Se for equipar e tiver uma parte do avatar, desequipa a anterior
    if (newState && item.avatarPart) {
      if (item.avatarPart === 'hand') {
        const equippedHands = items.filter(i => i.equipped && i.avatarPart === 'hand' && i.id !== item.id);
        const equippedTwoHanded = items.filter(i => i.equipped && i.avatarPart === 'two_handed' && i.id !== item.id);
        
        // Unequip two-handed weapons if we are equipping a one-handed weapon
        for (const th of equippedTwoHanded) {
          const docId = th.docIds ? th.docIds[0] : th.id;
          await updateDoc(doc(db, 'user_items', docId), { equipped: false });
        }
        
        // Não permitir duas armas de ataque ou dois escudos. Desequipa o item da mesma categoria
        const sameCategoryEquipped = equippedHands.find(i => i.itemCategory === item.itemCategory);
        if (sameCategoryEquipped) {
          const docId = sameCategoryEquipped.docIds ? sameCategoryEquipped.docIds[0] : sameCategoryEquipped.id;
          await updateDoc(doc(db, 'user_items', docId), { equipped: false });
          equippedHands.splice(equippedHands.indexOf(sameCategoryEquipped), 1);
        }
        
        if (equippedHands.length >= 2) {
          const otherDoc = equippedHands[0].docIds ? equippedHands[0].docIds[0] : equippedHands[0].id;
          await updateDoc(doc(db, 'user_items', otherDoc), { equipped: false });
        }
      } else if (item.avatarPart === 'two_handed') {
        // Unequip all one-handed and two-handed weapons
        const equippedWeapons = items.filter(i => i.equipped && (i.avatarPart === 'hand' || i.avatarPart === 'two_handed') && i.id !== item.id);
        for (const w of equippedWeapons) {
          const docId = w.docIds ? w.docIds[0] : w.id;
          await updateDoc(doc(db, 'user_items', docId), { equipped: false });
        }
      } else {
        const alreadyEquipped = items.find(i => i.equipped && i.avatarPart === item.avatarPart && i.id !== item.id);
        if (alreadyEquipped) {
          const otherDoc = alreadyEquipped.docIds ? alreadyEquipped.docIds[0] : alreadyEquipped.id;
          await updateDoc(doc(db, 'user_items', otherDoc), { equipped: false });
        }
      }
    }

    await updateDoc(doc(db, 'user_items', docToUpdate), { equipped: newState });
    if (onEquip) onEquip();
    fetchInventory(); // recarrega do banco pra garantir consistência
  };

  const handleUseConsumable = async (item: UserItem) => {
    if (item.gameEffect === 'restore_hp') {
      const currentRankIndex = RANKS.findIndex(r => r.name === userData.lastSeenRank) || 0;
      const maxHearts = 3 + Math.floor(currentRankIndex / 2);
      
      if ((userData.hearts || 0) >= maxHearts) {
        await showAlert("Sua vida já está cheia!");
        return;
      }
      const confirmed = await showConfirm(`Deseja beber "${item.itemTitle}" e restaurar todo o seu HP?`);
      if (!confirmed) return;
      
      const userRef = doc(db, 'users', userData.uid);
      await updateDoc(userRef, { 
        hearts: maxHearts,
        happyBuffUntil: null,
        happyBuffDuration: null,
        stunnedUntil: null
      });
      userData.hearts = maxHearts;

      await consumeItemQuantity(item.itemId, 1, item.id);
      fetchInventory();
      await showAlert("HP restaurado completamente!");
      return;
    }

    if (item.gameEffect === 'unlock_skin') {
      const skinId = item.unlockedSkinId;
      if (!skinId) {
        await showAlert('Este buff não possui uma skin configurada corretamente.');
        return;
      }
      
      const skinsRef = collection(db, 'preset_skins');
      const q = query(skinsRef, where('url', '==', skinId));
      const querySnapshot = await getDocs(q);
      
      if (!querySnapshot.empty) {
        const skinData = querySnapshot.docs[0].data();
        const genderTarget = skinData.genderTarget;
        const currentGender = userData.avatarConfig?.gender || 'male';
        if (genderTarget && genderTarget !== 'both' && genderTarget !== currentGender) {
          await showAlert(`Esta skin é exclusiva para o gênero ${genderTarget === 'male' ? 'Masculino' : 'Feminino'}. Mude o gênero do seu avatar para usá-la.`);
          return;
        }
      }
      
      const confirmed = await showConfirm(`Deseja usar este item para liberar a skin por ${item.buffDurationDays || 7} dias?`);
      if (!confirmed) return;
      
      const durationMs = (item.buffDurationDays || 7) * 24 * 60 * 60 * 1000;
      const currentExpiry = (userData.unlockedSkins || {})[skinId] || 0;
      const now = Date.now();
      
      const newExpiry = currentExpiry > now ? currentExpiry + durationMs : now + durationMs;
      
      const userRef = doc(db, 'users', userData.uid);
      await updateDoc(userRef, {
        [`unlockedSkins.${skinId}`]: newExpiry
      });
      
      if (!userData.unlockedSkins) userData.unlockedSkins = {};
      userData.unlockedSkins[skinId] = newExpiry;

      await consumeItemQuantity(item.itemId, 1, item.id);
      fetchInventory();
      await showAlert(`A skin foi ativada/estendida com sucesso e está disponível em "Personalizar Personagem"!`);
      return;
    }

    if (item.gameEffect === 'unlock_gender') {
      const confirmed = await showConfirm(`Deseja usar este item para liberar a troca de gênero por 15 minutos?`);
      if (!confirmed) return;
      
      const userRef = doc(db, 'users', userData.uid);
      const newUnlock = Date.now() + 15 * 60 * 1000;
      await updateDoc(userRef, {
        'avatarConfig.genderUnlockUntil': newUnlock
      });
      
      await consumeItemQuantity(item.itemId, 1, item.id);
      fetchInventory();
      await showAlert(`Seletor de gênero liberado por 15 minutos!`);
      return;
    }

    if (item.gameEffect && item.gameEffect !== 'none' && item.gameEffect !== 'restore_hp' && item.gameEffect !== 'unlock_skin' && item.gameEffect !== 'unlock_gender') {
      await showAlert(`O item "${item.itemTitle}" é um Poder de Jogo! Você só pode utilizá-lo de dentro de uma Missão/Desafio ativo.`);
      return;
    }

    const confirmed = await showConfirm(`Tem certeza que deseja consumir "${item.itemTitle}" agora? O professor precisará validar a ação na vida real.`);
    if (!confirmed) return;
    
    await consumeItemQuantity(item.itemId, 1, item.id);
    fetchInventory();
    await showAlert(`Você utilizou o item: ${item.itemTitle}! Avise seu professor para que ele valide o efeito.`);
  };

  const handleDropItemToTrash = async (item: UserItem) => {
    if (item.equipped) {
      await showAlert("Desequipe o item antes de jogá-lo fora!");
      return;
    }

    if (item.itemType === 'consumable' && item.count && item.count > 1) {
      setTrashModalItem(item);
      setTrashQuantity(1);
      return;
    }

    const result = await showConfirmWithCheckbox(
      `Tem certeza que deseja DESCARTAR 1x "${item.itemTitle}"? Ele ficará perdido e poderá ser encontrado por outros jogadores em missões.`,
      "Destruir item permanentemente (ninguém poderá encontrar)"
    );
    if (!result || !result.confirmed) return;
    
    if (item.itemType === 'consumable') {
      await consumeItemQuantity(item.itemId, 1, item.id);
      if (!result.checked) {
        const { id, count, docIds, ...itemDataToDrop } = item;
        await addDoc(collection(db, 'user_items'), {
          ...itemDataToDrop,
          studentId: 'dropped',
          droppedBy: userData.uid,
          quantity: 1
        });
      }
    } else {
      const docToUpdate = item.docIds ? item.docIds[0] : item.id;
      if (result.checked) {
        await deleteDoc(doc(db, 'user_items', docToUpdate));
      } else {
        await updateDoc(doc(db, 'user_items', docToUpdate), {
          studentId: 'dropped',
          droppedBy: userData.uid
        });
      }
    }
    
    fetchInventory();
    showToast(result.checked ? "Item destruído permanentemente!" : "Item jogado fora!", 'info');
  };

  const submitTrash = async (permanent: boolean) => {
    if (!trashModalItem) return;
    
    if (trashQuantity < 1 || trashQuantity > (trashModalItem.count || 1)) {
      await showAlert('Quantidade inválida!');
      return;
    }

    await consumeItemQuantity(trashModalItem.itemId, trashQuantity, trashModalItem.id);
    
    if (!permanent) {
      const { id, count, docIds, ...itemDataToDrop } = trashModalItem;
      await addDoc(collection(db, 'user_items'), {
        ...itemDataToDrop,
        studentId: 'dropped',
        droppedBy: userData.uid,
        quantity: trashQuantity
      });
    }
    
    setTrashModalItem(null);
    setTrashQuantity(1);
    fetchInventory();
    showToast(permanent ? "Itens destruídos permanentemente!" : "Itens jogados fora!", 'info');
  };

  const handleItemDrop = async (dragItem: UserItem, targetItem: UserItem) => {
    if (!dragItem || dragItem.id === targetItem.id) return;

    if (dragItem.gameEffect === 'add_attribute') {
      if (targetItem.itemType !== 'equippable') {
        showToast("Você só pode usar este pergaminho em itens equipáveis!", 'error');
        return;
      }
      const currentAddsCount = targetItem.adds ? targetItem.adds.length : 0;
      if (currentAddsCount >= 2) {
        showToast("Este item já possui o limite máximo de atributos extras (2)!", 'error');
        return;
      }

      await consumeItemQuantity(dragItem.itemId, 1, dragItem.id);

      const isSuccess = Math.random() < 0.70;
      if (!isSuccess) {
        showToast("O pergaminho falhou e foi destruído... Mais sorte na próxima vez!", 'error');
        fetchInventory();
        return;
      }

      const amountToGenerate = 1;
      
      const storeItemSnap = await getDoc(doc(db, 'store_items', targetItem.itemId));
      const storeItemData = storeItemSnap.data();
      const globalGachaConfig = await fetchGlobalGachaConfig();

      const existingTypes = targetItem.adds ? targetItem.adds.map((a: any) => a.type as AttributeType) : [];
      const newAdds = rollExactAttributes(
        amountToGenerate, 
        existingTypes, 
        storeItemData?.gachaConfig, 
        storeItemData?.fixedAttributes, 
        (storeItemData?.useGlobalGacha ?? true) ? globalGachaConfig : undefined
      );
      const finalAdds = [...(targetItem.adds || []), ...newAdds].slice(0, 4);

      const targetDocId = targetItem.docIds ? targetItem.docIds[0] : targetItem.id;
      await updateDoc(doc(db, 'user_items', targetDocId), { adds: finalAdds });
      
      showToast("SUCESSO! O poder do pergaminho fluiu para o equipamento e gerou novos atributos!", 'success');
      fetchInventory();
    }
    else if (dragItem.gameEffect === 'reroll_attributes') {
      if (targetItem.itemType !== 'equippable') {
        showToast("Você só pode usar este pergaminho em itens equipáveis!", 'error');
        return;
      }
      const currentAddsCount = targetItem.adds ? targetItem.adds.length : 0;
      if (currentAddsCount === 0) {
        showToast("Este item não possui atributos extras para rerolar!", 'error');
        return;
      }

      await consumeItemQuantity(dragItem.itemId, 1, dragItem.id);

      const storeItemSnap = await getDoc(doc(db, 'store_items', targetItem.itemId));
      const storeItemData = storeItemSnap.data();
      const globalGachaConfig = await fetchGlobalGachaConfig();

      const areAddsEqual = (addsA: ItemAdd[], addsB: ItemAdd[]) => {
        if (addsA.length !== addsB.length) return false;
        return addsA.every((a, i) => a.type === addsB[i].type && a.value === addsB[i].value);
      };

      let newAdds: ItemAdd[] = [];
      let attempts = 0;
      do {
        newAdds = rollExactAttributes(
          currentAddsCount, 
          [], 
          storeItemData?.gachaConfig, 
          storeItemData?.fixedAttributes, 
          (storeItemData?.useGlobalGacha ?? true) ? globalGachaConfig : undefined
        );
        attempts++;
      } while (areAddsEqual(newAdds, targetItem.adds || []) && attempts < 10);
      
      const targetDocId = targetItem.docIds ? targetItem.docIds[0] : targetItem.id;
      await updateDoc(doc(db, 'user_items', targetDocId), { adds: newAdds });
      
      showToast("SUCESSO! O equipamento brilhou e seus atributos foram completamente renovados!", 'success');
      fetchInventory();
    }
  };

  const submitSell = async () => {
    if (!sellModalItem) return;
    const price = parseInt(sellPrice, 10);
    if (isNaN(price) || price <= 0) {
      await showAlert('Digite um valor válido maior que zero!');
      return;
    }

    const minSalePriceCoins = sellModalItem.minSalePrice || 0;
    const isXp = preferredCurrency === 'xp';
    const minSalePrice = isXp ? Math.max(1, Math.floor(minSalePriceCoins / (economySettings?.coinToXPRatio || 10))) : minSalePriceCoins;
    
    if (minSalePrice > 0 && price < minSalePrice) {
      await showAlert(`Este item tem um preço mínimo de revenda de ${minSalePrice} ${isXp ? 'XP' : 'moedas'}. Você não pode colocar à venda por menos que isso.`);
      return;
    }
    
    if (sellModalItem.itemType === 'consumable') {
      if (sellQuantity < 1 || sellQuantity > (sellModalItem.count || 1)) {
        await showAlert('Quantidade inválida!');
        return;
      }
      
      await consumeItemQuantity(sellModalItem.itemId, sellQuantity, sellModalItem.id);
      
      const { id, count, docIds, ...itemDataToSell } = sellModalItem;
      let sellerClassName = '';
      let sellerClassColor = '';
      if (userData.classId) {
        const classDoc = await getDoc(doc(db, 'classes', userData.classId));
        if (classDoc.exists()) {
          sellerClassName = classDoc.data().name || '';
          sellerClassColor = classDoc.data().color || '';
        }
      }

      await addDoc(collection(db, 'user_items'), {
        ...itemDataToSell,
        quantity: sellQuantity,
        forSale: true,
        price: price,
        preferredCurrency: preferredCurrency,
        sellerName: userData.name,
        sellerClassName,
        sellerClassColor,
        sellerPersuasion: totalEquippedStats.persuasion
      });
    } else {
      let sellerClassName = '';
      let sellerClassColor = '';
      if (userData.classId) {
        const classDoc = await getDoc(doc(db, 'classes', userData.classId));
        if (classDoc.exists()) {
          sellerClassName = classDoc.data().name || '';
          sellerClassColor = classDoc.data().color || '';
        }
      }

      const docToUpdate = sellModalItem.docIds ? sellModalItem.docIds[0] : sellModalItem.id;
      await updateDoc(doc(db, 'user_items', docToUpdate), {
        forSale: true,
        price: price,
        preferredCurrency: preferredCurrency,
        sellerName: userData.name,
        sellerClassName,
        sellerClassColor,
        sellerPersuasion: totalEquippedStats.persuasion
      });
    }
    
    setSellModalItem(null);
    setSellPrice('');
    setSellQuantity(1);
    setPreferredCurrency('xp');
    fetchInventory();
    await showAlert('Item colocado à venda com sucesso!');
  };

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>Carregando Mochila...</div>;

  let bagItems = items.filter(i => !i.equipped);
  
  if (searchQuery) bagItems = bagItems.filter(i => i.itemTitle.toLowerCase().includes(searchQuery.toLowerCase()));
  if (filterRarity !== 'all') bagItems = bagItems.filter(i => (i.rarity || 'common') === filterRarity);
  
  if (activeCategory !== 'Todos') {
    bagItems = bagItems.filter(i => {
      if (activeCategory === 'Consumíveis') return i.itemType === 'consumable';
      if (activeCategory === 'Ataque') {
        return ['two_handed', 'rightHand', 'leftHand'].includes(i.avatarPart || '') || 
               (i.avatarPart === 'hand' && i.itemCategory !== 'defense');
      }
      if (activeCategory === 'Defesa') {
        return ['head', 'body', 'legs', 'feet'].includes(i.avatarPart || '') || 
               (i.avatarPart === 'hand' && i.itemCategory === 'defense');
      }
      if (activeCategory === 'Outros') {
        return !['consumable'].includes(i.itemType) && 
               !['hand', 'two_handed', 'rightHand', 'leftHand', 'head', 'body', 'legs', 'feet'].includes(i.avatarPart || '');
      }
      return true;
    });
  }
  
  bagItems.sort((a, b) => a.itemTitle.localeCompare(b.itemTitle));

  const totalSlotsToRender = Math.max(maxInventorySpace, bagItems.length);
  const slots: (UserItem | null)[] = Array(totalSlotsToRender).fill(null);
  const unplacedItems: UserItem[] = [];

  bagItems.forEach(item => {
    const idx = slotMap[item.id];
    if (idx !== undefined && idx >= 0 && idx < totalSlotsToRender && slots[idx] === null) {
      slots[idx] = item;
    } else {
      unplacedItems.push(item);
    }
  });

  unplacedItems.forEach(item => {
    const emptyIdx = slots.indexOf(null);
    if (emptyIdx !== -1) {
      slots[emptyIdx] = item;
    } else {
      slots.push(item);
    }
  });

  const handleGridSwap = async (draggedItem: UserItem, targetIndex: number, targetItem: UserItem | null) => {
    if (draggedItem.id === targetItem?.id) return;
    
    // Combinar pilhas de itens consumíveis iguais
    if (targetItem && draggedItem.itemId === targetItem.itemId && draggedItem.itemType === 'consumable' && targetItem.itemType === 'consumable') {
      const draggedQty = draggedItem.count || 1;
      const targetQty = targetItem.count || 1;
      
      if (targetQty < 99) {
        const spaceLeft = 99 - targetQty;
        const transferAmount = Math.min(spaceLeft, draggedQty);
        
        const draggedRef = doc(db, 'user_items', draggedItem.id);
        const targetRef = doc(db, 'user_items', targetItem.id);
        
        if (transferAmount === draggedQty) {
          await deleteDoc(draggedRef);
        } else {
          await updateDoc(draggedRef, { quantity: draggedQty - transferAmount });
        }
        await updateDoc(targetRef, { quantity: targetQty + transferAmount });
        
        setDraggedItem(null);
        fetchInventory();
        return;
      }
    }

    // If dropping a scroll onto a valid item, use the scroll instead of swapping!
    if (targetItem && ['add_attribute', 'remove_attribute', 'reroll_attributes'].includes(draggedItem.gameEffect || '')) {
      handleItemDrop(draggedItem, targetItem);
      setDraggedItem(null);
      return;
    }

    const newMap = { ...slotMap };
    const draggedOldIndex = slots.findIndex(s => s?.id === draggedItem.id);
    
    newMap[draggedItem.id] = targetIndex;
    if (targetItem) {
      newMap[targetItem.id] = draggedOldIndex;
    } else if (draggedOldIndex !== -1) {
      // It moved to an empty slot, clear its old slot mapping if we were tracking it
      // Wait, if it swaps with null, targetItem is null. The old slot becomes empty.
      // We just don't map anything to draggedOldIndex.
    }

    setSlotMap(newMap);
    setDraggedItem(null);
    await updateDoc(doc(db, 'users', userData.uid), { 'inventoryPreferences.slotMap': newMap });
  };

  const getGridItemStyle = () => {
    return { width: '100%', minHeight: viewMode === 'list' ? '60px' : 'auto' };
  };

  return (
    <div 
      ref={inventoryRef}
      style={{ animation: 'fadeIn 0.3s ease-out', display: 'flex', flexDirection: 'column', height: 'calc(100vh - 300px)' }}
      onDragOver={(e) => { e.preventDefault(); }}
      onDrop={(e) => { e.preventDefault(); }}
    >
      <style>{`
        .inventory-item-card {
          transition: transform 0.2s;
        }
        .inventory-item-card:hover {
          transform: translateY(-5px);
        }
        }
        @media (max-width: 850px) {
          .inventory-layout {
            flex-direction: column !important;
          }
          .inventory-avatar-col {
            position: relative !important;
            top: 0 !important;
            width: 100% !important;
            margin-bottom: 2rem;
          }
        }
        @keyframes highlight-cascade {
          0% { box-shadow: 0 0 0px transparent; transform: scale(1); filter: brightness(1); }
          50% { box-shadow: 0 0 15px rgba(255, 215, 0, 0.6); transform: scale(1.05); filter: brightness(1.2); }
          100% { box-shadow: 0 0 0px transparent; transform: scale(1); filter: brightness(1); }
        }
      `}</style>

      <div style={{ paddingBottom: '1rem', borderBottom: '1px solid var(--border-glass)', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Package size={24} color="var(--gold-primary)" />
            <h3 style={{ fontSize: '1.5rem', margin: 0 }}>Minha Mochila</h3>
          </div>
          <div style={{ color: 'var(--text-secondary)', fontSize: '1rem', background: 'rgba(0,0,0,0.3)', padding: '0.5rem 1rem', borderRadius: '12px' }}>
            Espaço: <strong style={{ color: currentSpaceOccupied >= maxInventorySpace ? 'var(--accent-red)' : 'var(--accent-green)' }}>{currentSpaceOccupied}</strong> / {maxInventorySpace}
          </div>
        </div>

        {/* Barra de Filtros */}
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '1rem' }}>
          {[
            { id: 'Todos', icon: <Sparkles size={16} /> },
            { id: 'Consumíveis', icon: <FlaskConical size={16} /> },
            { id: 'Ataque', icon: <Sword size={16} /> },
            { id: 'Defesa', icon: <Shield size={16} /> },
            { id: 'Outros', icon: <Package size={16} /> },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveCategory(tab.id);
                setCascadeAnimationTrigger(Date.now());
                setTimeout(() => setCascadeAnimationTrigger(0), 2000);
              }}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.5rem',
                padding: '0.5rem 1rem',
                borderRadius: '999px',
                border: 'none',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '0.9rem',
                transition: 'all 0.2s ease',
                background: activeCategory === tab.id ? 'var(--gold-primary)' : 'var(--btn-bg)',
                color: activeCategory === tab.id ? 'var(--text-on-gold, #000000)' : 'var(--text-secondary)'
              }}
            >
              {tab.icon} {tab.id}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: 1, minWidth: '150px', display: 'flex', alignItems: 'center', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', borderRadius: '8px', padding: '0 0.5rem' }}>
            <Search size={16} color="var(--text-secondary)" />
            <input type="text" placeholder="Buscar item..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} style={{ width: '100%', padding: '0.5rem', background: 'transparent', border: 'none', color: 'var(--text-primary)', outline: 'none', fontSize: '0.9rem' }} />
          </div>
          <select value={filterRarity} onChange={e => setFilterRarity(e.target.value)} style={{ padding: '0.5rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontSize: '0.9rem' }}>
            <option value="all">Raridades</option>
            <option value="common">Comum</option>
            <option value="uncommon">Incomum</option>
            <option value="rare">Raro</option>
            <option value="epic">Épico</option>
            <option value="legendary">Lendário</option>
          </select>
          
          <div style={{ display: 'flex', gap: '0.25rem', background: 'rgba(0,0,0,0.3)', padding: '0.25rem', borderRadius: '8px', border: '1px solid var(--border-glass)' }}>
            <button onClick={() => setViewMode('grid-large')} style={{ padding: '0.25rem', background: viewMode === 'grid-large' ? 'rgba(255,255,255,0.1)' : 'transparent', border: 'none', borderRadius: '4px', cursor: 'pointer', color: viewMode === 'grid-large'  ? 'var(--text-primary)' : 'var(--text-secondary)' }} title="Grid Grande"><LayoutGrid size={16} /></button>
            <button onClick={() => setViewMode('grid-small')} style={{ padding: '0.25rem', background: viewMode === 'grid-small' ? 'rgba(255,255,255,0.1)' : 'transparent', border: 'none', borderRadius: '4px', cursor: 'pointer', color: viewMode === 'grid-small'  ? 'var(--text-primary)' : 'var(--text-secondary)' }} title="Grid Pequeno"><Grid size={16} /></button>
            <button onClick={() => setViewMode('list')} style={{ padding: '0.25rem', background: viewMode === 'list' ? 'rgba(255,255,255,0.1)' : 'transparent', border: 'none', borderRadius: '4px', cursor: 'pointer', color: viewMode === 'list'  ? 'var(--text-primary)' : 'var(--text-secondary)' }} title="Lista"><ListIcon size={16} /></button>
          </div>
        </div>
      </div>

      <div className="inventory-items-col" style={{ 
        flex: 1, 
        overflowY: 'auto', 
        paddingRight: '0.5rem',
        display: 'grid', 
        gridTemplateColumns: viewMode === 'list' ? '1fr' : (viewMode === 'grid-small' ? 'repeat(auto-fill, minmax(75px, 1fr))' : 'repeat(auto-fill, minmax(100px, 1fr))'), 
        gap: '1rem',
        alignContent: 'start'
      }}>
          {slots.map((item, index) => {
            const isOverflow = index >= maxInventorySpace;
            
            if (item) {
              const isDragged = draggedItem?.id === item.id;
              const isFullyDragged = isDragged && (!item.count || item.count <= 1);
              const isPartiallyDragged = isDragged && (item.count && item.count > 1);
              const displayCount = isPartiallyDragged ? (item.count! - 1) : item.count;

              return (
                <div key={item.id || index} 
                  className={`inventory-item-card ${isFullyDragged ? '' : `rarity-${item.rarity || 'common'}`}`}
                  onMouseEnter={(e) => {
                    if (!isOverflow) {
                      setHoveredItem(item.id);
                      setMousePos({ x: e.clientX, y: e.clientY });
                    }
                  }}
                  onMouseLeave={() => setHoveredItem(null)}
                  onMouseMove={(e) => {
                    if (hoveredItem === item.id) {
                      setMousePos({ x: e.clientX, y: e.clientY });
                    }
                  }}
                  draggable={!isOverflow}
                  onDragStart={(e) => {
                    if (isOverflow) {
                      e.preventDefault();
                      return;
                    }
                    if (!isOverflow) {
                      const imgEl = e.currentTarget.querySelector('img');
                      if (imgEl) {
                        e.dataTransfer.setDragImage(imgEl, imgEl.width / 2, imgEl.height / 2);
                      }
                      e.dataTransfer.setData('text/plain', item.id);
                      e.dataTransfer.effectAllowed = 'move';
                      setDraggedItem(item);
                    } else {
                      e.preventDefault();
                    }
                  }}
                  onDragEnd={(e) => {
                    setDraggedItem(null);
                    if (inventoryRef.current) {
                      const rect = inventoryRef.current.getBoundingClientRect();
                      const isOutside = e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom;
                      if (isOutside && e.dataTransfer.dropEffect === 'none') {
                        handleDropItemToTrash(item);
                      }
                    }
                  }}
                  onDragOver={(e) => {
                    if (!isOverflow && draggedItem && draggedItem.id !== item.id) {
                      e.preventDefault();
                    }
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (!isOverflow && draggedItem) {
                      handleGridSwap(draggedItem, index, item);
                    }
                  }}
                  style={{ 
                    ...getGridItemStyle(),
                  background: isFullyDragged ? 'var(--btn-bg)' : 'var(--bg-card)', 
                  padding: viewMode === 'list' ? '0.5rem 1rem' : (viewMode === 'grid-small' ? '0.35rem' : '0.5rem'), 
                  borderRadius: '8px', 
                  animation: (cascadeAnimationTrigger && item) ? `highlight-cascade 1.2s ease-out ${0.2 + index * 0.15}s` : undefined,
                  border: isFullyDragged ? '2px dashed rgba(255,255,255,0.3)' : undefined,
                  display: 'flex', 
                  flexDirection: viewMode === 'list' ? 'row' : 'column', 
                  alignItems: viewMode === 'list' ? 'center' : 'stretch',
                  gap: viewMode === 'list' ? '1rem' : '0.25rem', 
                  position: 'relative',
                  zIndex: hoveredItem === item.id ? 100 : 1,
                  cursor: isOverflow ? 'not-allowed' : 'grab',
                  boxShadow: isFullyDragged ? 'none' : undefined,
                  opacity: isFullyDragged ? 0.5 : 1,
                  filter: isOverflow ? 'grayscale(100%)' : (isPartiallyDragged ? 'brightness(0.8)' : 'none')
                }}>
                    {isOverflow && (
                      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10, background: 'rgba(0,0,0,0.5)', borderRadius: '10px' }}>
                        <Lock size={32} color="var(--accent-red)" />
                      </div>
                    )}
                    
                  <div className={`rarity-badge ${item.rarity || 'common'}`}>
                    {getRarityLabel(item.rarity)}
                  </div>
                    
                  <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', height: viewMode === 'grid-small' ? '36px' : '48px', width: viewMode === 'list' ? '48px' : 'fit-content', margin: viewMode === 'list' ? '0' : '0 auto', flexShrink: 0 }}>
                    {item.itemImageUrl ? (
                      <img src={item.itemImageUrl} alt="" style={{ height: '100%', width: 'auto', objectFit: 'contain', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))' }} />
                    ) : (
                      <Package size={viewMode === 'grid-small' ? 24 : 32} color="var(--text-secondary)" style={{ alignSelf: 'center' }} />
                    )}

                    {displayCount && displayCount > 1 && (
                      <div style={{
                        position: 'absolute',
                        bottom: '0',
                        right: '-4px',
                        color: 'white',
                        textShadow: '1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000',
                        fontSize: viewMode === 'grid-small' ? '0.75rem' : '0.85rem',
                        fontWeight: 'bold',
                        zIndex: 2,
                        pointerEvents: 'none',
                        lineHeight: 1
                      }}>
                        {displayCount}
                      </div>
                    )}
                  </div>
                  
                  {viewMode === 'list' ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: 1, minWidth: 0, justifyContent: 'center' }}>
                      <h4 style={{ margin: 0, fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={item.itemTitle}>{item.itemTitle}</h4>
                      <div style={{ display: 'flex' }}>
                        <span style={{ 
                          fontSize: '0.65rem', 
                          color: 'var(--text-secondary)', 
                          background: 'rgba(255,255,255,0.05)',
                          padding: '0.15rem 0.4rem',
                          borderRadius: '4px',
                          border: '1px solid var(--border-glass)'
                        }}>
                          {item.itemType === 'consumable' ? 'Consumível' : 'Equipável'}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center' }}>
                      <h4 style={{ margin: '0 0 0.15rem 0', fontSize: viewMode === 'grid-small' ? '0.6rem' : '0.8rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={item.itemTitle}>{item.itemTitle}</h4>
                      <span style={{ fontSize: viewMode === 'grid-small' ? '0.55rem' : '0.7rem', color: 'var(--text-secondary)' }}>
                        {item.itemType === 'consumable' ? 'Consumível' : 'Equipável'}
                      </span>
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '0.25rem', marginTop: viewMode === 'list' ? '0' : 'auto', justifyContent: 'center', flexShrink: 0 }}>
                    {item.itemType === 'equippable' ? (
                      <button 
                        title={item.equipped ? '✔ Equipado' : 'Equipar'}
                        onClick={() => handleEquip(item)} 
                        style={{ flex: 1, background: item.equipped ? 'rgba(16, 185, 129, 0.2)' : 'var(--btn-bg)', color: item.equipped  ? 'var(--accent-green)'  : 'var(--text-primary)', border: item.equipped ? '1px solid var(--accent-green)' : '1px solid var(--border-glass)', padding: viewMode === 'grid-small' ? '0.25rem' : '0.4rem', borderRadius: '6px', cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Shield size={viewMode === 'grid-small' ? 14 : 16} />
                      </button>
                    ) : (
                      ['add_attribute', 'remove_attribute', 'reroll_attributes'].includes(item.gameEffect || '') ? (
                        <div title="Arraste para usar" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--btn-bg)', color: 'var(--text-secondary)', padding: viewMode === 'grid-small' ? '0.25rem' : '0.4rem', borderRadius: '6px', border: '1px dashed rgba(255,255,255,0.2)', cursor: 'grab' }}>
                          <Hand size={viewMode === 'grid-small' ? 14 : 16} />
                        </div>
                      ) : (
                        <button 
                          title="Usar Item"
                          onClick={() => handleUseConsumable(item)} 
                          style={{ flex: 1, background: 'rgba(251, 191, 36, 0.2)', color: 'var(--gold-primary)', border: '1px solid rgba(251, 191, 36, 0.3)', padding: viewMode === 'grid-small' ? '0.25rem' : '0.4rem', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Zap size={viewMode === 'grid-small' ? 14 : 16} />
                        </button>
                      )
                    )}
                    
                    <button 
                      title="Vender"
                      disabled={isOverflow}
                      onClick={() => {
                        if (item.equipped) { showAlert("Desequipe antes de vender."); return; }
                        setSellModalItem(item);
                      }} 
                      style={{ flex: 1, background: 'rgba(59, 130, 246, 0.2)', color: '#60A5FA', border: '1px solid rgba(59, 130, 246, 0.3)', padding: viewMode === 'grid-small' ? '0.25rem' : '0.4rem', borderRadius: '6px', cursor: isOverflow ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: isOverflow ? 0.5 : 1 }}>
                      <Coins size={viewMode === 'grid-small' ? 14 : 16} />
                    </button>
                    <button 
                      title="Jogar Fora"
                      disabled={isOverflow}
                      onClick={() => handleDropItemToTrash(item)} 
                      style={{ flex: 1, background: 'rgba(239, 68, 68, 0.2)', color: '#F87171', border: '1px solid rgba(239, 68, 68, 0.3)', padding: viewMode === 'grid-small' ? '0.25rem' : '0.4rem', borderRadius: '6px', cursor: isOverflow ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: isOverflow ? 0.5 : 1 }}>
                      <Trash2 size={viewMode === 'grid-small' ? 14 : 16} />
                    </button>
                  </div>
              </div>
            );
            } else {
              return (
                <div key={`empty-${index}`} 
                  className="inventory-item-card"
                  onDragOver={(e) => { e.preventDefault(); }}
                  onDrop={(e) => { 
                    e.preventDefault(); 
                    if (draggedItem) handleGridSwap(draggedItem, index, null); 
                  }}
                  style={{ 
                    ...getGridItemStyle(),
                  background: 'var(--btn-bg)', 
                  borderRadius: '8px', 
                  border: '2px dashed var(--border-glass)', 
                  display: 'flex', 
                  justifyContent: 'center', 
                  alignItems: 'center',
                  minHeight: viewMode === 'list' ? '60px' : '100px'
                }}>
                   <div style={{ width: viewMode === 'grid-small' ? '24px' : '32px', height: viewMode === 'grid-small' ? '24px' : '32px', background: 'var(--btn-bg)', borderRadius: '50%' }} />
                </div>
              );
            }
          })}
        </div>

      {sellModalItem && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div className="glass-panel" style={{ padding: '2rem', maxWidth: '400px', width: '100%' }}>
            <h3 style={{ marginTop: 0, color: 'var(--gold-primary)', fontSize: '1.5rem' }}>Vender no Bazar do Jogador</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
              Ao colocar este item à venda, ele sairá da sua mochila. Uma taxa de 10% será descontada se outro jogador comprar.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '12px', marginBottom: '1.5rem' }}>
              <img src={sellModalItem.itemImageUrl} alt="" style={{ width: '40px', height: '40px', objectFit: 'contain' }} />
              <div>
                <strong>{sellModalItem.itemTitle}</strong>
                {sellModalItem.itemType === 'consumable' && (
                  <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Quantidade:</label>
                    <input 
                      type="number" 
                      min={1} 
                      max={sellModalItem.count || 1} 
                      value={sellQuantity}
                      onChange={e => setSellQuantity(Math.min(Math.max(1, parseInt(e.target.value) || 1), sellModalItem.count || 1))}
                      style={{ width: '60px', padding: '0.3rem', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', borderRadius: '4px' }}
                    />
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>/ {sellModalItem.count || 1}</span>
                  </div>
                )}
                {sellModalItem.itemType !== 'consumable' && (
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Quantidade a vender: 1</div>
                )}
              </div>
            </div>
            
            {economyType === 'xp' && (
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Moeda de Recebimento:</label>
                <select 
                  value={preferredCurrency} 
                  onChange={(e) => setPreferredCurrency(e.target.value as 'xp' | 'coins')}
                  style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)' }}
                >
                  <option value="xp">Receber em XP (Padrão)</option>
                  <option value="coins">Receber em Moedas</option>
                </select>
              </div>
            )}
            
            {(sellModalItem.minSalePrice ?? 0) > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.3)', borderRadius: '8px', padding: '0.6rem 1rem', marginBottom: '1rem' }}>
                <span style={{ fontSize: '1.1rem' }}>⚠️</span>
                <span style={{ fontSize: '0.85rem', color: 'var(--gold-primary)' }}>
                  Preço mínimo de revenda: <strong>
                    {preferredCurrency === 'xp' 
                      ? Math.max(1, Math.floor((sellModalItem.minSalePrice || 0) / (economySettings?.coinToXPRatio || 10))) + ' XP'
                      : (sellModalItem.minSalePrice || 0) + ' moedas'}
                  </strong>
                </span>
              </div>
            )}

            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Preço de Venda</label>
            <input 
              type="number" 
              value={sellPrice} 
              onChange={e => setSellPrice(e.target.value)}
              className="login-input" 
              placeholder={`Mínimo: ${preferredCurrency === 'xp' ? Math.max(1, Math.floor((sellModalItem.minSalePrice || 0) / (economySettings?.coinToXPRatio || 10))) : (sellModalItem.minSalePrice || 1)}`}
              autoFocus
              min={preferredCurrency === 'xp' ? Math.max(1, Math.floor((sellModalItem.minSalePrice || 0) / (economySettings?.coinToXPRatio || 10))) : (sellModalItem.minSalePrice || 1)}
            />
            
            <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
              <button onClick={() => setSellModalItem(null)} className="login-btn" style={{ flex: 1, background: 'var(--bg-dark)', color: 'white' }}>Cancelar</button>
              <button onClick={submitSell} className="login-btn" style={{ flex: 1, background: 'var(--gold-primary)', color: 'var(--text-on-gold, #000000)' }}>Confirmar Venda</button>
            </div>
          </div>
        </div>
      )}

      {trashModalItem && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div className="glass-panel" style={{ padding: '2rem', maxWidth: '400px', width: '100%' }}>
            <h3 style={{ marginTop: 0, color: 'var(--accent-red)', fontSize: '1.5rem' }}>Jogar Item Fora</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
              Selecione a quantidade que deseja descartar. Itens não destruídos poderão ser encontrados por outros jogadores em missões.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '12px', marginBottom: '1.5rem' }}>
              <img src={trashModalItem.itemImageUrl} alt="" style={{ width: '40px', height: '40px', objectFit: 'contain' }} />
              <div>
                <strong>{trashModalItem.itemTitle}</strong>
                <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Quantidade:</label>
                  <input 
                    type="range" 
                    min={1} 
                    max={trashModalItem.count || 1} 
                    value={trashQuantity}
                    onChange={e => setTrashQuantity(parseInt(e.target.value) || 1)}
                    style={{ width: '100px', accentColor: 'var(--accent-red)' }}
                  />
                  <input 
                    type="number" 
                    min={1} 
                    max={trashModalItem.count || 1} 
                    value={trashQuantity}
                    onChange={e => setTrashQuantity(Math.min(Math.max(1, parseInt(e.target.value) || 1), trashModalItem.count || 1))}
                    style={{ width: '50px', padding: '0.2rem', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', borderRadius: '4px', textAlign: 'center' }}
                  />
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>/ {trashModalItem.count || 1}</span>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '2rem' }}>
              <button onClick={() => setTrashModalItem(null)} style={{ flex: 1, padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-glass)', background: 'var(--bg-dark)', color: 'white', cursor: 'pointer', fontWeight: 'bold' }}>
                Cancelar
              </button>
              <button onClick={() => submitTrash(false)} style={{ flex: 1, padding: '0.75rem', borderRadius: '8px', border: 'none', background: 'var(--gold-primary)', color: 'var(--text-on-gold, #000000)', cursor: 'pointer', fontWeight: 'bold' }}>
                Jogar Fora
              </button>
              <button onClick={() => submitTrash(true)} style={{ flex: 1, padding: '0.75rem', borderRadius: '8px', border: 'none', background: 'var(--accent-red)', color: 'white', cursor: 'pointer', fontWeight: 'bold' }} title="Destruir Permanentemente">
                Destruir
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Tooltip Portal */}
      {hoveredItem && (() => {
        const item = items.find(i => i.id === hoveredItem);
        if (!item) return null;
        return createPortal(
          <div style={{
            position: 'fixed',
            top: mousePos.y + 15,
            left: mousePos.x + 15,
            background: 'var(--bg-card)',
            border: '1px solid var(--border-glass)',
            borderRadius: '8px',
            padding: '1rem',
            width: 'max-content',
            minWidth: '200px',
            zIndex: 999999,
            boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
            backdropFilter: 'blur(10px)',
            pointerEvents: 'none',
            color: 'var(--text-primary)',
            textAlign: 'left'
          }}>
            <h4 style={{ margin: '0 0 0.5rem 0', color: 'var(--gold-primary)' }}>{item.itemTitle}</h4>
            
            {item.itemDescription ? (
              <div style={{ marginBottom: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)', fontStyle: 'italic', maxWidth: '250px', whiteSpace: 'normal' }}>
                "{item.itemDescription}"
              </div>
            ) : (
              item.itemType === 'consumable' && (
                <div style={{ marginBottom: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)', fontStyle: 'italic', maxWidth: '250px', whiteSpace: 'normal' }}>
                  {item.gameEffect === 'restore_hp' ? '"Restaura todos os pontos de vida."' :
                   item.gameEffect === 'add_attribute' ? '"Adiciona um novo atributo aleatório a um equipamento."' :
                   item.gameEffect === 'remove_attribute' ? '"Remove um atributo negativo de um equipamento."' :
                   item.gameEffect === 'reroll_attributes' ? '"Sorteia novamente todos os atributos extras de um equipamento."' :
                   item.gameEffect === 'none' ? '"Um item comum sem efeitos mágicos."' :
                   '"Item consumível."'}
                </div>
              )
            )}
            
            {item.itemType === 'consumable' && ['add_attribute', 'remove_attribute', 'reroll_attributes'].includes(item.gameEffect || '') && (
              <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: '#60A5FA', fontWeight: 'bold' }}>
                🖐️ Arraste sobre um equipamento para usar.
              </div>
            )}
            
            {item.itemType === 'equippable' && item.baseAttributeType && item.baseAttributeType !== 'none' && ATTRIBUTE_LABELS[item.baseAttributeType] && (
              <div style={{ marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                {ATTRIBUTE_LABELS[item.baseAttributeType].icon} {ATTRIBUTE_LABELS[item.baseAttributeType].label}: +{item.baseAttributeValue}{['xp','coins','vitality','fortitude','persuasion'].includes(item.baseAttributeType) ? '%' : ''}
              </div>
            )}
            
            {item.itemType === 'equippable' && item.adds && item.adds.length > 0 && (
              <div style={{ fontSize: '0.9rem' }}>
                <strong style={{ color: '#D8B4FE' }}>✨ Atributos Adicionais:</strong>
                <ul style={{ margin: '0.25rem 0 0 0', paddingLeft: '1.25rem', color: 'var(--text-secondary)' }}>
                  {item.adds.map((add, i) => {
                    const lbl = ATTRIBUTE_LABELS[add.type];
                    if (!lbl) return null;
                    return (
                      <li key={i} style={{ color: add.value > 0 ? '#60A5FA' : '#F87171' }}>
                        {lbl.icon} {lbl.label}: +{add.value}%
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>,
          document.body
        );
      })()}
    </div>
  );
}
