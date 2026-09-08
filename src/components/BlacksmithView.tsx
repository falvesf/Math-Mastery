// @ts-ignore
import React, { useState, useEffect, useRef } from 'react';

declare global {
  interface Window {
    Sketchfab: any;
  }
}
import { supabase } from '../lib/supabase';
// @ts-ignore
import { X, Hammer, ShieldAlert, Sparkles, Coins, Lock, CheckCircle2, AlertTriangle, ArrowRight, ChevronUp, ChevronDown, Layers } from 'lucide-react';
import CachedImage from './CachedImage';
import ItemTooltip from './ItemTooltip';
// @ts-ignore
import { useTenant } from '../contexts/TenantContext';
// @ts-ignore
import { calculateTotalStats, isStackableItemType } from '../lib/gacha';
// @ts-ignore
import { fetchActiveCoin } from '../lib/model3d';
// @ts-ignore
import { forgeStrengthFraction, forgeAttributeValue, forgeAttributeValueWithConfig, nextForgeCost, nextForgeCostWithConfig, forgeSuccessChance, forgeMaterialsForLevel, MAX_FORGE_LEVEL, forgeItemName } from '../lib/forge';
import { getMinRankIndex, resolveMinRankName } from '../lib/ranks';
import { useDialog } from '../contexts/DialogContext';
import { playSound, resolveAudioUrl } from '../lib/audioBank';
import { fetchForgeSounds, type ForgeSoundsConfig } from '../lib/forgeSounds';

interface BlacksmithModalProps {
  userData: any;
  currentRankIndex: number;
  onClose: () => void;
  onSuccess: (newCoins?: number) => void;
  onGoToStore?: () => void;
}

interface AvailableScroll {
  docId: string;
  itemId: string;
  title: string;
  imageUrl?: string;
  bonus: number;
  quantity: number;
}

// @ts-ignore — onClose é parte do contrato da interface (mantido; pode ser usado por consumidores)
export default function BlacksmithModal({ userData, currentRankIndex, onClose, onSuccess, onGoToStore }: BlacksmithModalProps) {
  const { showConfirm, showToast } = useDialog();
  const { tenantId } = useTenant();
  const [activeTab, setActiveTab] = useState<'forge' | 'transmute'>('forge');
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCoin, setActiveCoin] = useState<any>(null);
  
  // Tooltip State
  const [hoveredTooltipItem, setHoveredTooltipItem] = useState<any | null>(null);
  const [tooltipMousePos, setTooltipMousePos] = useState({ x: 0, y: 0 });

  // Forge State
  const [selectedForgeItem, setSelectedForgeItem] = useState<any | null>(null);
  const [useScroll, setUseScroll] = useState(false);
  const [availableScrolls, setAvailableScrolls] = useState<AvailableScroll[]>([]);
  const [selectedScrollDocId, setSelectedScrollDocId] = useState<string | null>(null);
  const [inventoryFilter, setInventoryFilter] = useState<'all' | 'equipment' | 'materials'>('all');
  const [breakQty, setBreakQty] = useState<number>(1);
  const [fuseBatches, setFuseBatches] = useState<number>(1);
  const [isConsolidating, setIsConsolidating] = useState(false);
  
  // Transmute State
  const [selectedTransmuteItem, setSelectedTransmuteItem] = useState<any | null>(null);
  const [consumables, setConsumables] = useState<any[]>([]);
  // Catálogo (loja) dos materiais/itens — para mostrar nome/ícone mesmo sem possuir
  const [materialCatalog, setMaterialCatalog] = useState<Record<string, { id?: string; title: string; imageUrl: string; minRankRequired?: any; rarity?: string }>>({});
  
  // Sketchfab State
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [sketchfabApi, setSketchfabApi] = useState<any>(null);
  const [showBlacksmith, setShowBlacksmith] = useState(true);
  const [isForging, setIsForging] = useState(false);
  const isForgingRef = useRef(false);
  const [forgeSounds, setForgeSounds] = useState<ForgeSoundsConfig>({});

  // ---- Música de fundo (loop) com fade ----
  const bgAudioRef = useRef<HTMLAudioElement | null>(null);
  const bgVolumeRef = useRef(0.5);
  const anvilAudioRef = useRef<HTMLAudioElement | null>(null);
  const anvilTimerRef = useRef<any>(null);
  const bgFadeRafRef = useRef<number | null>(null);

  const ensureBgAudio = (): HTMLAudioElement => {
    if (!bgAudioRef.current) {
      const a = new Audio();
      a.loop = true;
      a.volume = 0;
      bgAudioRef.current = a;
    }
    return bgAudioRef.current;
  };

  const rampVolume = (target: number, durMs: number, onDone?: () => void) => {
    const a = ensureBgAudio();
    const from = a.volume;
    const start = performance.now();
    if (bgFadeRafRef.current) cancelAnimationFrame(bgFadeRafRef.current);
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / durMs);
      a.volume = Math.max(0, Math.min(1, from + (target - from) * t));
      if (t < 1) { bgFadeRafRef.current = requestAnimationFrame(step); }
      else { bgFadeRafRef.current = null; if (onDone) onDone(); }
    };
    bgFadeRafRef.current = requestAnimationFrame(step);
  };

  /** Toca a música da guia atual em loop, com fade-in. Retoma do ponto onde parou. */
  const playTabMusic = (url?: string, volume = 0.5) => {
    const a = ensureBgAudio();
    bgVolumeRef.current = volume;
    if (!url) return;
    const resolved = resolveAudioUrl(url);
    if (a.src !== resolved) {
      a.src = resolved;
      a.currentTime = 0;
    }
    a.play().catch(() => {});
    rampVolume(volume, 700);
  };

  /** Fade-out e pausa a música (preserva currentTime p/ retomar do mesmo ponto). */
  const pauseTabMusic = (durMs = 600) => {
    const a = ensureBgAudio();
    rampVolume(0, durMs, () => { a.pause(); });
  };

  /** Para a música imediatamente e zera o ponto de reprodução (troca de guia/saída). */
  const stopTabMusic = () => {
    const a = bgAudioRef.current;
    if (!a) return;
    if (bgFadeRafRef.current) cancelAnimationFrame(bgFadeRafRef.current);
    bgFadeRafRef.current = null;
    a.pause();
    a.currentTime = 0;
  };

  /** Toca o som do martelo na bigorna durante o trabalho do ferreiro. */
  const startAnvilHits = (anvilUrl?: string) => {
    stopAnvilHits();
    if (!anvilUrl) return;
    try {
      const a = new Audio(resolveAudioUrl(anvilUrl));
      a.volume = 0.9;
      anvilAudioRef.current = a;
      a.play().catch(() => {});
    } catch (_) {}
  };

  const stopAnvilHits = () => {
    if (anvilTimerRef.current) {
      clearInterval(anvilTimerRef.current);
      anvilTimerRef.current = null;
    }
    if (anvilAudioRef.current) {
      try {
        anvilAudioRef.current.pause();
        anvilAudioRef.current.currentTime = 0;
      } catch (_) {}
      anvilAudioRef.current = null;
    }
  };

  useEffect(() => {
    let isMounted = true;
    fetchForgeSounds(tenantId).then(c => { if (isMounted) setForgeSounds(c); });
    return () => { isMounted = false; };
  }, [tenantId]);

  // Música da guia ativa (a anterior para antes da nova começar, ao alternar guia)
  useEffect(() => {
    const url = activeTab === 'forge' ? forgeSounds.forgeMusicUrl : forgeSounds.transmuteMusicUrl;
    stopTabMusic();
    if (!url) return;
    playTabMusic(url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, forgeSounds.forgeMusicUrl, forgeSounds.transmuteMusicUrl]);

  // Limpa áudio ao desmontar (sair da guia "A Forja" para a música)
  useEffect(() => () => {
    stopAnvilHits();
    stopTabMusic();
  }, []);

  useEffect(() => {
    if (!window.Sketchfab) {
      const script = document.createElement('script');
      script.src = 'https://static.sketchfab.com/api/sketchfab-viewer-1.12.1.js';
      script.async = true;
      script.onload = initSketchfab;
      document.body.appendChild(script);
    } else {
      initSketchfab();
    }
    
    function initSketchfab() {
      if (!iframeRef.current || !window.Sketchfab) return;
      const client = new window.Sketchfab('1.12.1', iframeRef.current);
      client.init('a166214653af44d9877785a7e638263b', {
        success: function onSuccess(api: any) {
          api.start();
          api.addEventListener('viewerready', function() {
            api.pause();
            if (typeof api.seekTo === 'function') {
              try { api.seekTo(0); } catch (_) {}
            }
            if (typeof api.setCameraConstraints === 'function') {
              try {
                api.setCameraConstraints({
                  usePitchConstraints: true,
                  up: 0.05,
                  down: -0.05,
                  useYawConstraints: false,
                  useZoomConstraints: true,
                  usePanConstraints: true
                }, function(err: any) {
                  if (!err && typeof api.setEnableCameraConstraints === 'function') {
                    api.setEnableCameraConstraints(true, { preventCameraConstraintsFocus: true });
                  }
                });
              } catch (_) {}
            }
            setSketchfabApi(api);
          });
        },
        error: function onError() {
          console.error('Sketchfab API error');
        },
        autostart: 1,
        camera: 0,
        ui_hint: 0,
        autospin: 0,
        preload: 0,
        scrollwheel: 0,
        ui_loading: 0,
        ui_infos: 0,
        ui_controls: 0,
        ui_stop: 0,
        ui_watermark: 0,
        ui_inspector: 0,
        ui_settings: 0,
        ui_help: 0,
        ui_vr: 0,
        ui_ar: 0,
        ui_fullscreen: 0,
        ui_animations: 0,
        ui_theme: 'dark',
        dnt: 1,
        transparent: 0
      });
    }
  }, []);
  
  useEffect(() => {
    let isMounted = true;
    fetchActiveCoin(tenantId).then(m => { if (isMounted) setActiveCoin(m); });
    return () => { isMounted = false; };
  }, [tenantId]);
  
  const isTransmuteUnlocked = currentRankIndex >= 11; // 11 = Diamante I
  const isStaff = userData.role !== 'student' && !userData.studentViewActive;
  const coinUrl = activeCoin?.open_url || activeCoin?.url || '';
  const consolidateUserStacks = async (rawRows: any[]) => {
    const groups: Record<string, any[]> = {};
    for (const row of rawRows) {
      const d = (row.data || {}) as any;
      if (row.equipped || d.forSale || d.isDropped) continue;
      if (d.itemType === 'equippable') continue;
      
      const isStackable = isStackableItemType(d.itemType) || 
        d.gameEffect === 'break_item' || 
        d.gameEffect === 'fuse_item' || 
        d.gameEffect === 'blacksmith_scroll';
        
      if (!isStackable) continue;
      
      if (!groups[row.item_id]) groups[row.item_id] = [];
      groups[row.item_id].push(row);
    }

    let hasChanges = false;
    for (const itemId in groups) {
      const stackList = groups[itemId];
      if (stackList.length <= 1) continue;

      let totalQty = 0;
      stackList.forEach(r => {
        const q = (r.data?.quantity) || 1;
        totalQty += q;
      });

      let remaining = totalQty;
      for (let i = 0; i < stackList.length; i++) {
        const row = stackList[i];
        const curData = (row.data || {}) as any;
        const targetQty = Math.min(99, remaining);
        remaining -= targetQty;

        if (targetQty > 0) {
          if ((curData.quantity || 1) !== targetQty) {
            hasChanges = true;
            row.data = { ...curData, quantity: targetQty };
            await supabase.from('user_items').update({
              data: row.data
            }).eq('id', row.id);
          }
        } else {
          hasChanges = true;
          await supabase.from('user_items').delete().eq('id', row.id);
          stackList[i] = null;
        }
      }

      while (remaining > 0) {
        hasChanges = true;
        const newStackQty = Math.min(99, remaining);
        remaining -= newStackQty;
        const baseRow = stackList.find(Boolean);
        const baseData = (baseRow?.data || {}) as any;
        await supabase.from('user_items').insert({
          student_id: userData.uid,
          item_id: itemId,
          equipped: false,
          tenant_id: tenantId || null,
          data: {
            ...baseData,
            quantity: newStackQty
          }
        });
      }
    }

    return hasChanges;
  };

  const handleManualConsolidateStacks = async () => {
    if (isForging || isConsolidating) return;
    setIsConsolidating(true);
    try {
      await fetchItems();
      showToast("Montes e fragmentos organizados e juntados com sucesso!", 'success');
    } catch (err) {
      showToast("Erro ao juntar montes.", 'error');
    } finally {
      setIsConsolidating(false);
    }
  };

  const fetchItems = async () => {
    setLoading(true);
    let { data: userItemsSnap } = await supabase
      .from('user_items')
      .select('id, item_id, equipped, data')
      .eq('student_id', userData.uid);

    // Auto-consolidação inteligente de montes duplicados de fragmentos/materiais/consumíveis
    try {
      if (userItemsSnap && userItemsSnap.length > 1) {
        const didConsolidate = await consolidateUserStacks(userItemsSnap);
        if (didConsolidate) {
          const { data: reloadedSnap } = await supabase
            .from('user_items')
            .select('id, item_id, equipped, data')
            .eq('student_id', userData.uid);
          if (reloadedSnap) userItemsSnap = reloadedSnap;
        }
      }
    } catch (consErr) {
      console.error('Erro na consolidação automática de itens:', consErr);
    }

    // Catálogo de materiais/itens (nome/ícone/patente) — mesmo os que o jogador ainda não possui
    try {
      let catQ = supabase.from('store_items').select('id, name, image_url, rarity, data');
      if (tenantId) catQ = catQ.or(`is_global.eq.true,tenant_id.eq.${tenantId}`);
      const { data: catSnap } = await catQ;
      const catMap: Record<string, { id?: string; title: string; imageUrl: string; minRankRequired?: any; rarity?: string }> = {};
      (catSnap || []).forEach((s: any) => {
        const d = (s.data || {}) as any;
        catMap[s.id] = {
          id: s.id,
          title: d.title || s.name || 'Item',
          imageUrl: d.imageUrl || s.image_url || '',
          minRankRequired: d.minRankRequired,
          rarity: d.rarity || s.rarity || 'common'
        };
      });
      setMaterialCatalog(catMap);
    } catch (e) { /* catálogo opcional */ }

    let parsedItems = [];
    let consumables: any[] = [];
    const parsedScrolls: AvailableScroll[] = [];
    
    if (userItemsSnap) {
      const itemIds = userItemsSnap.map((r: any) => r.item_id).filter(Boolean);
      let priceMap: Record<string, number> = {};
      let storeDataMap: Record<string, any> = {};
      if (itemIds.length > 0) {
        const { data: storeSnap } = await supabase.from('store_items').select('id, price, data').in('id', itemIds);
        (storeSnap || []).forEach((s: any) => { 
          priceMap[s.id] = s.price || 0; 
          storeDataMap[s.id] = s.data || {};
        });
      }
      for (const row of userItemsSnap) {
        const itemData = (row.data || {}) as any;
        if (itemData.isDropped) continue;

        const storeItemData = storeDataMap[row.item_id] || {};
        const isScroll = itemData.gameEffect === 'blacksmith_scroll' || storeItemData.gameEffect === 'blacksmith_scroll';
        const gameEffect = itemData.gameEffect || storeItemData.gameEffect;
        const isBreakMaterial = gameEffect === 'break_item';
        const isFuseMaterial = gameEffect === 'fuse_item';

        if (isScroll) {
          const rawBonus = itemData.scrollChanceBonus ?? storeItemData.scrollChanceBonus;
          const bonus = rawBonus !== undefined && rawBonus !== null && rawBonus !== '' ? Number(rawBonus) : 30;
          const qty = itemData.quantity || 1;
          parsedScrolls.push({
            docId: row.id,
            itemId: row.item_id,
            title: itemData.itemTitle || storeItemData.title || 'Pergaminho do Ferreiro',
            imageUrl: itemData.itemImageUrl || storeItemData.imageUrl || '',
            bonus,
            quantity: qty
          });
        } else if (isBreakMaterial || isFuseMaterial) {
          parsedItems.push({
            docId: row.id,
            itemId: row.item_id,
            ...itemData,
            itemTitle: itemData.itemTitle || storeItemData.title || (isBreakMaterial ? 'Material Bruto' : 'Fragmento'),
            itemImageUrl: itemData.itemImageUrl || storeItemData.imageUrl || '',
            itemType: itemData.itemType || storeItemData.type || 'consumable',
            rarity: itemData.rarity || storeItemData.rarity || 'common',
            quantity: itemData.quantity || 1,
            gameEffect,
            breakTargetItemId: itemData.breakTargetItemId || storeItemData.breakTargetItemId,
            breakMinQty: itemData.breakMinQty ?? storeItemData.breakMinQty ?? 1,
            breakMaxQty: itemData.breakMaxQty ?? storeItemData.breakMaxQty ?? 1,
            breakCost: itemData.breakCost ?? storeItemData.breakCost ?? 0,
            breakSuccessChance: itemData.breakSuccessChance ?? storeItemData.breakSuccessChance ?? 80,
            fuseTargetItemId: itemData.fuseTargetItemId || storeItemData.fuseTargetItemId,
            fuseRequiredQty: itemData.fuseRequiredQty ?? storeItemData.fuseRequiredQty ?? 50,
            fuseResultQty: itemData.fuseResultQty ?? storeItemData.fuseResultQty ?? 1,
            fuseCost: itemData.fuseCost ?? storeItemData.fuseCost ?? 0,
            fuseSuccessChance: itemData.fuseSuccessChance ?? storeItemData.fuseSuccessChance ?? 75,
          });
          consumables.push({ docId: row.id, itemId: row.item_id, quantity: itemData.quantity || 1, itemTitle: itemData.itemTitle || storeItemData.title, itemImageUrl: itemData.itemImageUrl || storeItemData.imageUrl || '' });
        } else if (itemData.itemType === 'equippable') {
          // Autoridade da loja para flags e configurações de transmutação/forja
          const isTransmutable = storeItemData.isTransmutable !== undefined ? storeItemData.isTransmutable : itemData.isTransmutable;
          const isTransmuted = storeItemData.isTransmuted !== undefined ? storeItemData.isTransmuted : itemData.isTransmuted;
          const transmuteConfig = storeItemData.transmuteConfig || itemData.transmuteConfig;
          const isForgeable = storeItemData.isForgeable !== undefined ? storeItemData.isForgeable : itemData.isForgeable;
          const forgeConfig = storeItemData.forgeConfig || itemData.forgeConfig;

          parsedItems.push({
            docId: row.id,
            itemId: row.item_id,
            ...itemData,
            itemTitle: itemData.itemTitle || storeItemData.title || 'Equipamento',
            itemImageUrl: itemData.itemImageUrl || storeItemData.imageUrl || '',
            isTransmutable: !!isTransmutable,
            isTransmuted: !!isTransmuted,
            transmuteConfig: transmuteConfig || null,
            isForgeable: isForgeable !== undefined ? isForgeable : true,
            forgeConfig: forgeConfig || null,
            cost: priceMap[row.item_id] || itemData.cost || itemData.price || 100,
            equipped: row.equipped,
            forgeLevel: itemData.forgeLevel || 0
          });
        } else if (itemData.itemType === 'consumable' || itemData.itemType === 'other') {
          consumables.push({ docId: row.id, itemId: row.item_id, quantity: itemData.quantity || 1, itemTitle: itemData.itemTitle || storeItemData.title, itemImageUrl: itemData.itemImageUrl || storeItemData.imageUrl || '' });
        }
      }
    }
    setItems(parsedItems);
    setConsumables(consumables);
    setAvailableScrolls(parsedScrolls);
    if (parsedScrolls.length > 0) {
      setSelectedScrollDocId(prev => (prev && parsedScrolls.some(s => s.docId === prev)) ? prev : parsedScrolls[0].docId);
    } else {
      setSelectedScrollDocId(null);
    }
    
    // Refresh selections if needed
    if (selectedForgeItem) {
      const refreshed = parsedItems.find(i => i.docId === selectedForgeItem.docId)
        || (selectedForgeItem.gameEffect === 'break_item' || selectedForgeItem.gameEffect === 'fuse_item'
            ? parsedItems.find(i => i.itemId === selectedForgeItem.itemId && i.gameEffect === selectedForgeItem.gameEffect)
            : null);
      setSelectedForgeItem(refreshed || null);
    }
    if (selectedTransmuteItem) {
      const refreshed = parsedItems.find(i => i.docId === selectedTransmuteItem.docId && i.isTransmutable && !i.isTransmuted && (i.forgeLevel || 0) === 9);
      setSelectedTransmuteItem(refreshed || null);
    }
    
    setLoading(false);
  };

  useEffect(() => {
    fetchItems();
  }, []);

  const activeScroll = availableScrolls.find(s => s.docId === selectedScrollDocId) || availableScrolls[0] || null;
  const scrollChanceBonus = activeScroll?.bonus ?? 30;
  const scrollCount = availableScrolls.reduce((acc, s) => acc + s.quantity, 0);

  const handleForge = async () => {
    if (!selectedForgeItem) return;
    const currentLevel = selectedForgeItem.forgeLevel || 0;
    if (currentLevel >= MAX_FORGE_LEVEL) {
      showToast("Item já está no nível máximo (+9)!", 'error');
      return;
    }

    const nextLevel = currentLevel + 1;
    const buyPrice = selectedForgeItem.cost || selectedForgeItem.price || 100;
    const cost = nextForgeCostWithConfig(currentLevel, buyPrice, selectedForgeItem.forgeConfig);
    const baseChance = forgeSuccessChance(nextLevel, selectedForgeItem.forgeConfig);
    const finalChance = useScroll ? Math.min(100, baseChance + scrollChanceBonus) : baseChance;
    
    if (!isStaff && userData.coins < cost) {
      showToast(`Você não tem moedas suficientes! Custo: ${cost}`, 'error');
      return;
    }
    if (useScroll && scrollCount <= 0) {
      showToast("Você não possui Pergaminho do Ferreiro!", 'error');
      return;
    }
    const requiredMats = forgeMaterialsForLevel(nextLevel, selectedForgeItem.forgeConfig);
    const matCounts = (id: string) => consumables.filter(c => c.itemId === id).reduce((s, c) => s + (c.quantity || 1), 0);
    const missingMats = requiredMats.filter(id => matCounts(id) <= 0);
    if (missingMats.length > 0) {
      showToast("Você não possui os materiais exigidos para esta forja!", 'error');
      return;
    }
    const matsLabel = requiredMats.length > 0
      ? requiredMats.map(id => consumables.find(c => c.itemId === id)?.itemTitle || 'Material').join(', ')
      : 'Nenhum';
    const confirmMsg = `Deseja forjar este item para +${nextLevel}?\nCusto: ${cost} moedas\nMateriais: ${matsLabel}\nChance: ${Math.min(100, finalChance)}%${useScroll ? ` (${baseChance}% base + ${scrollChanceBonus}% bônus)` : ''}\n${useScroll ? `Pergaminho ativo (${activeScroll?.title || 'Pergaminho'}): O item não será destruído em caso de falha${currentLevel > 0 ? ', mas regredirá 1 nível (-1)' : ' (mantém +0)'}.` : 'AVISO: O item SERÁ DESTRUÍDO se a forja falhar!'}\nOs materiais serão consumidos em caso de sucesso ou falha.`;
    if (!await showConfirm(confirmMsg)) return;

    setIsForging(true);
    isForgingRef.current = true;
    pauseTabMusic(600);
    startAnvilHits(forgeSounds.forgeAnvilSoundUrl);
    if (sketchfabApi) sketchfabApi.play();
    
    let rpcRes = await supabase.rpc('forge_item', { 
      p_item_id: selectedForgeItem.docId, 
      p_use_scroll: useScroll,
      p_scroll_doc_id: useScroll && activeScroll ? activeScroll.docId : null
    });
    // Fallback automático caso a RPC no banco ainda use a assinatura anterior (2 parâmetros)
    if (rpcRes.error && rpcRes.error.message?.includes('p_scroll_doc_id')) {
      rpcRes = await supabase.rpc('forge_item', { 
        p_item_id: selectedForgeItem.docId, 
        p_use_scroll: useScroll 
      });
    }

    await new Promise(r => setTimeout(r, 7000));
    stopAnvilHits();
    if (sketchfabApi) sketchfabApi.pause();
    setIsForging(false);
    isForgingRef.current = false;

    const { data, error } = rpcRes;
    if (error || !data?.ok) {
      showToast(data?.error || 'Não foi possível forjar o item.', 'error');
      playTabMusic(activeTab === 'forge' ? forgeSounds.forgeMusicUrl : forgeSounds.transmuteMusicUrl, bgVolumeRef.current);
      fetchItems();
      return;
    }
    if (data.success) {
      playSound(forgeSounds.successSoundUrl, 0.9);
      showToast("🔥 SUCESSO! O item foi forjado!", 'success');
    } else if (!useScroll || data.destroyed) {
      playSound(forgeSounds.failSoundUrl, 0.9);
      showToast("💥 QUEBROU! A forja falhou e o item foi destruído nas chamas!", 'error');
      setSelectedForgeItem(null);
    } else {
      playSound(forgeSounds.failSoundUrl, 0.9);
      const newLevel = typeof data.level === 'number' ? data.level : Math.max(0, currentLevel - 1);
      if (currentLevel > 0) {
        showToast(`❌ FALHA! A forja falhou! O Pergaminho do Ferreiro evitou a destruição, mas o item regrediu para +${newLevel}.`, 'error');
      } else {
        showToast("❌ FALHA! A forja falhou, mas o Pergaminho do Ferreiro protegeu o item da destruição.", 'error');
      }
    }
    playTabMusic(activeTab === 'forge' ? forgeSounds.forgeMusicUrl : forgeSounds.transmuteMusicUrl, bgVolumeRef.current);
    fetchItems();
    onSuccess(data.coins);
  };

  const handleTransmute = async () => {
    if (!selectedTransmuteItem) return;
    const config = selectedTransmuteItem.transmuteConfig;
    if (!config || !config.resultItemId) {
      showToast("Este item não possui configuração de transmutação.", 'error');
      return;
    }

    // Validação da patente do item resultado
    const resultItemInfo = materialCatalog[config.resultItemId];
    const resultMinRankIndex = resultItemInfo ? getMinRankIndex(resultItemInfo.minRankRequired) : 0;
    if (!isStaff && currentRankIndex < resultMinRankIndex) {
      showToast(`Sua patente é insuficiente para receber este item transmutado! Você precisa ser no mínimo ${resolveMinRankName(resultItemInfo?.minRankRequired) || 'Diamante'}.`, 'error');
      return;
    }

    // Materiais exigidos pelo ritual (2 consumíveis)
    const requiredMats: string[] = (config.materials || []).filter(Boolean);
    const haveMats: Record<string, number> = {};
    consumables.forEach(c => { haveMats[c.itemId] = (haveMats[c.itemId] || 0) + (c.quantity || 1); });
    const missingMats = requiredMats.filter(id => !haveMats[id] || haveMats[id] <= 0);
    if (missingMats.length > 0) {
      showToast("Você não possui os materiais consumíveis exigidos para a transmutação!", 'error');
      return;
    }
    if (!isStaff && userData.coins < (config.coinsCost || 0)) {
      showToast(`Você não tem moedas suficientes! Custo: ${config.coinsCost} moedas.`, 'error');
      return;
    }

    const confirmMsg = `Deseja tentar transmutar este item?\nItem Resultado: ${resultItemInfo?.title || 'Item Transmutado'}\nChance de Sucesso: ${config.successChance}%\nCusto: ${config.coinsCost} moedas\nConsome ${requiredMats.length} material(is).\nSe falhar, o item voltará para o +8!`;
    if (!await showConfirm(confirmMsg, "Altar de Transmutação")) return;

    setIsForging(true);
    pauseTabMusic(600);
    if (forgeSounds.transmuteEffectUrl) playSound(forgeSounds.transmuteEffectUrl, 0.9);
    const rpcPromise = supabase.rpc('transmute_item', { p_item_id: selectedTransmuteItem.docId });
    await new Promise(r => setTimeout(r, 800));
    setIsForging(false);

    const { data, error } = await rpcPromise;
    if (error || !data?.ok) {
      showToast(data?.error || 'Não foi possível transmutar o item.', 'error');
      playTabMusic(activeTab === 'forge' ? forgeSounds.forgeMusicUrl : forgeSounds.transmuteMusicUrl, bgVolumeRef.current);
      fetchItems();
      return;
    }
    if (data.success) {
      playSound(forgeSounds.successSoundUrl, 0.9);
      showToast(`✨ SUCESSO ESPETACULAR! O item foi transmutado para "${data.newTitle || resultItemInfo?.title || 'uma nova forma'}"!`, 'success');
      setSelectedTransmuteItem(null);
    } else {
      playSound(forgeSounds.failSoundUrl, 0.9);
      showToast("❌ FALHA! A energia se dissipou e o item caiu para o nível +8.", 'error');
    }
    playTabMusic(activeTab === 'forge' ? forgeSounds.forgeMusicUrl : forgeSounds.transmuteMusicUrl, bgVolumeRef.current);
    fetchItems();
    onSuccess(data.coins);
  };

  const handleBreakMaterial = async () => {
    if (!selectedForgeItem || isForging) return;
    const matchingStacks = items.filter(i => 
      i.itemId === selectedForgeItem.itemId && 
      i.gameEffect === selectedForgeItem.gameEffect
    );
    const totalOwned = matchingStacks.length > 0
      ? matchingStacks.reduce((sum, s) => sum + (s.quantity || 1), 0)
      : (selectedForgeItem.quantity || 1);
    const qtyToBreak = Math.max(1, Math.min(totalOwned, breakQty));
    const unitCost = selectedForgeItem.breakCost ?? 0;
    const totalCost = qtyToBreak * unitCost;
    const successChance = selectedForgeItem.breakSuccessChance ?? 80;

    if (!isStaff && (userData.coins || 0) < totalCost) {
      showToast(`Você precisa de ${totalCost} moedas para quebrar ${qtyToBreak}x este material.`, 'error');
      return;
    }

    const targetItemId = selectedForgeItem.breakTargetItemId;
    if (!targetItemId) {
      showToast('Nenhum item/fragmento de destino configurado para este material.', 'error');
      return;
    }

    const targetInfo = materialCatalog[targetItemId];
    const targetTitle = targetInfo?.title || 'Fragmentos';

    const confirmed = await showConfirm(
      `Deseja pagar ${totalCost} moedas para tentar triturar ${qtyToBreak}x "${selectedForgeItem.itemTitle}" no Ferreiro?\n\nTaxa de Sucesso: ${successChance}%\n\n⚠️ Atenção: Se o ferreiro falhar, os materiais e as moedas serão perdidos!`
    );
    if (!confirmed) return;

    setIsForging(true);
    isForgingRef.current = true;
    pauseTabMusic(600);
    startAnvilHits(forgeSounds.forgeAnvilSoundUrl);
    if (sketchfabApi) sketchfabApi.play();

    try {
      const minQ = selectedForgeItem.breakMinQty ?? 1;
      const maxQ = Math.max(minQ, selectedForgeItem.breakMaxQty ?? minQ);
      let totalYield = 0;
      let successfulUnits = 0;
      let failedUnits = 0;
      for (let i = 0; i < qtyToBreak; i++) {
        const rollSuccess = Math.random() * 100 < successChance;
        if (rollSuccess) {
          const roll = Math.floor(Math.random() * (maxQ - minQ + 1)) + minQ;
          totalYield += roll;
          successfulUnits++;
        } else {
          failedUnits++;
        }
      }

      const dbPromise = (async () => {
        // 1. Deduzir moedas (o ferreiro sempre cobra pelo serviço)
        let newCoins = userData.coins || 0;
        if (!isStaff && totalCost > 0) {
          newCoins = Math.max(0, newCoins - totalCost);
          await supabase.from('users').update({ coins: newCoins }).eq('id', userData.uid);
          userData.coins = newCoins;
        }

        // 2. Consumir material bruto através das pilhas existentes (priorizando a pilha selecionada)
        let remainingToConsume = qtyToBreak;
        const sortedStacks = [
          ...matchingStacks.filter(s => s.docId === selectedForgeItem.docId),
          ...matchingStacks.filter(s => s.docId !== selectedForgeItem.docId)
        ];

        for (const stack of sortedStacks) {
          if (remainingToConsume <= 0) break;
          const curStackQty = stack.quantity || 1;
          if (curStackQty <= remainingToConsume) {
            await supabase.from('user_items').delete().eq('id', stack.docId);
            remainingToConsume -= curStackQty;
          } else {
            const newQty = curStackQty - remainingToConsume;
            const { data: curRow } = await supabase.from('user_items').select('data').eq('id', stack.docId).maybeSingle();
            const curData = (curRow?.data || {}) as any;
            await supabase.from('user_items').update({
              data: { ...curData, quantity: newQty }
            }).eq('id', stack.docId);
            remainingToConsume = 0;
          }
        }

        // 3. Adicionar fragmentos apenas se houver unidades com sucesso
        if (totalYield > 0) {
          const { data: existingSnap } = await supabase
            .from('user_items')
            .select('id, data')
            .eq('student_id', userData.uid)
            .eq('item_id', targetItemId);

          const { data: targetStoreRow } = await supabase
            .from('store_items')
            .select('*')
            .eq('id', targetItemId)
            .maybeSingle();

          const storeTargetData = (targetStoreRow?.data || {}) as any;
          const baseItemPayload = {
            ...storeTargetData,
            itemTitle: storeTargetData.title || targetStoreRow?.name || targetTitle,
            itemImageUrl: storeTargetData.imageUrl || targetStoreRow?.image_url || targetInfo?.imageUrl || '',
            itemType: storeTargetData.type || targetStoreRow?.type || 'consumable',
            gameEffect: storeTargetData.gameEffect || 'none',
            rarity: storeTargetData.rarity || targetStoreRow?.rarity || targetInfo?.rarity || 'common',
          };

          let remainingToAdd = totalYield;
          for (const row of (existingSnap || [])) {
            if (remainingToAdd <= 0) break;
            const d = (row.data || {}) as any;
            if (d.forSale) continue;
            const curQ = d.quantity || 1;
            if (curQ < 99) {
              const space = 99 - curQ;
              const adding = Math.min(space, remainingToAdd);
              await supabase.from('user_items').update({
                data: { ...d, quantity: curQ + adding }
              }).eq('id', row.id);
              remainingToAdd -= adding;
            }
          }

          while (remainingToAdd > 0) {
            const stackQty = Math.min(99, remainingToAdd);
            await supabase.from('user_items').insert({
              student_id: userData.uid,
              item_id: targetItemId,
              equipped: false,
              tenant_id: tenantId || null,
              data: {
                ...baseItemPayload,
                quantity: stackQty
              }
            });
            remainingToAdd -= stackQty;
          }
        }

        return { newCoins };
      })();

      // Aguarda os 7 segundos exatamente como na forja de itens para casar áudio e animação
      const [dbResult] = await Promise.all([
        dbPromise,
        new Promise(r => setTimeout(r, 7000))
      ]);

      stopAnvilHits();
      if (sketchfabApi) sketchfabApi.pause();
      setIsForging(false);
      isForgingRef.current = false;

      if (totalYield === 0) {
        playSound(forgeSounds.failSoundUrl, 0.9);
        showToast(`💥 QUEBROU TUDO! O ferreiro deu uma martelada desajeitada, o material virou pó e você não conseguiu nenhum fragmento!`, 'error');
      } else if (failedUnits > 0) {
        playSound(forgeSounds.successSoundUrl, 0.9);
        showToast(`⛏️ Sucesso parcial! O ferreiro triturou ${successfulUnits}x com sucesso (${totalYield}x ${targetTitle}), mas atrapalhou-se e destruiu ${failedUnits}x material(is)!`, 'info');
      } else {
        playSound(forgeSounds.successSoundUrl, 0.9);
        showToast(`⛏️ Sucesso total! Você triturou ${qtyToBreak}x ${selectedForgeItem.itemTitle} e obteve ${totalYield}x ${targetTitle}!`, 'success');
      }
      playTabMusic(activeTab === 'forge' ? forgeSounds.forgeMusicUrl : forgeSounds.transmuteMusicUrl, bgVolumeRef.current);
      onSuccess(dbResult.newCoins);
      await fetchItems();
    } catch (err: any) {
      console.error('Erro ao quebrar material:', err);
      stopAnvilHits();
      if (sketchfabApi) sketchfabApi.pause();
      setIsForging(false);
      isForgingRef.current = false;
      playTabMusic(activeTab === 'forge' ? forgeSounds.forgeMusicUrl : forgeSounds.transmuteMusicUrl, bgVolumeRef.current);
      showToast('Ocorreu um erro ao quebrar o material no ferreiro.', 'error');
    }
  };

  const handleFuseMaterial = async () => {
    if (!selectedForgeItem || isForging) return;
    const matchingStacks = items.filter(i => 
      i.itemId === selectedForgeItem.itemId && 
      i.gameEffect === selectedForgeItem.gameEffect
    );
    const totalOwned = matchingStacks.length > 0
      ? matchingStacks.reduce((sum, s) => sum + (s.quantity || 1), 0)
      : (selectedForgeItem.quantity || 1);
    const reqQty = selectedForgeItem.fuseRequiredQty ?? 50;
    const resQty = selectedForgeItem.fuseResultQty ?? 1;
    const unitCost = selectedForgeItem.fuseCost ?? 0;
    const successChance = selectedForgeItem.fuseSuccessChance ?? 75;

    const maxBatches = Math.floor(totalOwned / reqQty);
    if (maxBatches < 1) {
      showToast(`Você precisa de pelo menos ${reqQty}x deste fragmento para fundir.`, 'error');
      return;
    }

    const batchesToFuse = Math.max(1, Math.min(maxBatches, fuseBatches));
    const totalFragmentsConsumed = batchesToFuse * reqQty;
    const totalCost = batchesToFuse * unitCost;

    if (!isStaff && (userData.coins || 0) < totalCost) {
      showToast(`Você precisa de ${totalCost} moedas para fundir ${batchesToFuse} lote(s).`, 'error');
      return;
    }

    const targetItemId = selectedForgeItem.fuseTargetItemId;
    if (!targetItemId) {
      showToast('Nenhum lingote/item de destino configurado para este fragmento.', 'error');
      return;
    }

    const targetInfo = materialCatalog[targetItemId];
    const targetTitle = targetInfo?.title || 'Lingote';

    const confirmed = await showConfirm(
      `Deseja pagar ${totalCost} moedas e consumir ${totalFragmentsConsumed}x "${selectedForgeItem.itemTitle}" para tentar fundir ${batchesToFuse * resQty}x "${targetTitle}"?\n\nTaxa de Sucesso: ${successChance}%\n\n⚠️ Atenção: Se o ferreiro falhar, os fragmentos e as moedas serão consumidos no fogo!`
    );
    if (!confirmed) return;

    setIsForging(true);
    isForgingRef.current = true;
    pauseTabMusic(600);
    startAnvilHits(forgeSounds.forgeAnvilSoundUrl);
    if (sketchfabApi) sketchfabApi.play();

    try {
      let successfulBatches = 0;
      let failedBatches = 0;
      for (let b = 0; b < batchesToFuse; b++) {
        const rollSuccess = Math.random() * 100 < successChance;
        if (rollSuccess) {
          successfulBatches++;
        } else {
          failedBatches++;
        }
      }
      const totalYield = successfulBatches * resQty;

      const dbPromise = (async () => {
        // 1. Deduzir moedas (o ferreiro sempre cobra pelo serviço)
        let newCoins = userData.coins || 0;
        if (!isStaff && totalCost > 0) {
          newCoins = Math.max(0, newCoins - totalCost);
          await supabase.from('users').update({ coins: newCoins }).eq('id', userData.uid);
          userData.coins = newCoins;
        }

        // 2. Consumir fragmentos através das pilhas existentes (priorizando a pilha selecionada)
        let remainingToConsume = totalFragmentsConsumed;
        const sortedStacks = [
          ...matchingStacks.filter(s => s.docId === selectedForgeItem.docId),
          ...matchingStacks.filter(s => s.docId !== selectedForgeItem.docId)
        ];

        for (const stack of sortedStacks) {
          if (remainingToConsume <= 0) break;
          const curStackQty = stack.quantity || 1;
          if (curStackQty <= remainingToConsume) {
            await supabase.from('user_items').delete().eq('id', stack.docId);
            remainingToConsume -= curStackQty;
          } else {
            const newQty = curStackQty - remainingToConsume;
            const { data: curRow } = await supabase.from('user_items').select('data').eq('id', stack.docId).maybeSingle();
            const curData = (curRow?.data || {}) as any;
            await supabase.from('user_items').update({
              data: { ...curData, quantity: newQty }
            }).eq('id', stack.docId);
            remainingToConsume = 0;
          }
        }

        // 3. Adicionar lingotes apenas para os lotes fundidos com sucesso
        if (totalYield > 0) {
          const { data: existingSnap } = await supabase
            .from('user_items')
            .select('id, data')
            .eq('student_id', userData.uid)
            .eq('item_id', targetItemId);

          const { data: targetStoreRow } = await supabase
            .from('store_items')
            .select('*')
            .eq('id', targetItemId)
            .maybeSingle();

          const storeTargetData = (targetStoreRow?.data || {}) as any;
          const baseItemPayload = {
            ...storeTargetData,
            itemTitle: storeTargetData.title || targetStoreRow?.name || targetTitle,
            itemImageUrl: storeTargetData.imageUrl || targetStoreRow?.image_url || targetInfo?.imageUrl || '',
            itemType: storeTargetData.type || targetStoreRow?.type || 'other',
            gameEffect: storeTargetData.gameEffect || 'none',
            rarity: storeTargetData.rarity || targetStoreRow?.rarity || targetInfo?.rarity || 'common',
          };

          let remainingToAdd = totalYield;
          for (const row of (existingSnap || [])) {
            if (remainingToAdd <= 0) break;
            const d = (row.data || {}) as any;
            if (d.forSale) continue;
            const curQ = d.quantity || 1;
            if (curQ < 99) {
              const space = 99 - curQ;
              const adding = Math.min(space, remainingToAdd);
              await supabase.from('user_items').update({
                data: { ...d, quantity: curQ + adding }
              }).eq('id', row.id);
              remainingToAdd -= adding;
            }
          }

          while (remainingToAdd > 0) {
            const stackQty = Math.min(99, remainingToAdd);
            await supabase.from('user_items').insert({
              student_id: userData.uid,
              item_id: targetItemId,
              equipped: false,
              tenant_id: tenantId || null,
              data: {
                ...baseItemPayload,
                quantity: stackQty
              }
            });
            remainingToAdd -= stackQty;
          }
        }

        return { newCoins };
      })();

      // Aguarda os 7 segundos exatamente como na forja de itens para casar áudio e animação
      const [dbResult] = await Promise.all([
        dbPromise,
        new Promise(r => setTimeout(r, 7000))
      ]);

      stopAnvilHits();
      if (sketchfabApi) sketchfabApi.pause();
      setIsForging(false);
      isForgingRef.current = false;

      if (totalYield === 0) {
        playSound(forgeSounds.failSoundUrl, 0.9);
        showToast(`💥 FALHOU! O ferreiro se atrapalhou no fogo, o crisol entornou e os fragmentos viraram cinzas!`, 'error');
      } else if (failedBatches > 0) {
        playSound(forgeSounds.successSoundUrl, 0.9);
        showToast(`🔥 Sucesso parcial! O ferreiro fundiu ${successfulBatches}x lote(s) (${totalYield}x ${targetTitle}), mas ${failedBatches}x lote(s) viraram cinzas!`, 'info');
      } else {
        playSound(forgeSounds.successSoundUrl, 0.9);
        showToast(`🔥 Fundição concluída com maestria! Você forjou ${totalYield}x ${targetTitle}!`, 'success');
      }
      playTabMusic(activeTab === 'forge' ? forgeSounds.forgeMusicUrl : forgeSounds.transmuteMusicUrl, bgVolumeRef.current);
      onSuccess(dbResult.newCoins);
      await fetchItems();
    } catch (err: any) {
      console.error('Erro ao fundir material:', err);
      stopAnvilHits();
      if (sketchfabApi) sketchfabApi.pause();
      setIsForging(false);
      isForgingRef.current = false;
      playTabMusic(activeTab === 'forge' ? forgeSounds.forgeMusicUrl : forgeSounds.transmuteMusicUrl, bgVolumeRef.current);
      showToast('Ocorreu um erro ao fundir os fragmentos no ferreiro.', 'error');
    }
  };

  const forgeableItems = items.filter(item => {
    const isEquip = item.itemType === 'equippable' && (item.forgeLevel || 0) < 9;
    const isMaterial = item.gameEffect === 'break_item' || item.gameEffect === 'fuse_item';
    if (inventoryFilter === 'equipment') return isEquip;
    if (inventoryFilter === 'materials') return isMaterial;
    return isEquip || isMaterial;
  });

  // Transmutação: apenas itens equipáveis que estão no +9 E possuem o checkbox "Item Transmutável"
  // (itens marcados como "Item Transmutado" são o resultado final e não entram no slot +9)
  const transmutableItems = items.filter(item => {
    const isEquip = item.itemType === 'equippable';
    const isMaxed = (item.forgeLevel || 0) === 9;
    const isTransmutable = item.isTransmutable === true;
    const isNotTransmuted = !item.isTransmuted;
    return isEquip && isMaxed && isTransmutable && isNotTransmuted;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, background: '#1a1a1a', overflow: 'hidden', height: '100%' }}>

        {/* Tabs */}
        <div style={{ display: 'flex', background: 'rgba(0,0,0,0.5)', borderBottom: '1px solid var(--border-glass)', flexShrink: 0 }}>
          <button 
            onClick={() => setActiveTab('forge')}
            disabled={isForging}
            style={{ flex: 1, padding: '1rem', background: activeTab === 'forge' ? 'var(--gold-primary)' : 'transparent', color: activeTab === 'forge' ? 'black' : 'white', border: 'none', cursor: isForging ? 'not-allowed' : 'pointer', fontWeight: 'bold', fontSize: '1.1rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', opacity: isForging ? 0.5 : 1 }}
          >
            <Hammer size={20} /> Forja (+1 a +9)
          </button>
          <button 
            onClick={() => isTransmuteUnlocked && setActiveTab('transmute')}
            disabled={isForging}
            style={{ flex: 1, padding: '1rem', background: activeTab === 'transmute' ? 'var(--gold-primary)' : 'transparent', color: activeTab === 'transmute' ? 'black' : isTransmuteUnlocked ? 'white' : '#666', border: 'none', cursor: (isForging || !isTransmuteUnlocked) ? 'not-allowed' : 'pointer', fontWeight: 'bold', fontSize: '1.1rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', opacity: isForging ? 0.5 : 1 }}
          >
            {isTransmuteUnlocked ? <Sparkles size={20} /> : <Lock size={20} />} 
            Transmutação (Requer Diamante I)
          </button>
        </div>

        {/* Saldo de moedas (visível nas duas guias; label + valor à direita) */}
        <div style={{ background: 'rgba(0,0,0,0.4)', borderBottom: '1px solid var(--border-glass)', padding: '0.6rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', color: 'white', fontWeight: 'bold', flexShrink: 0 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {coinUrl ? <CachedImage src={coinUrl} alt="Moeda" style={{ width: 20, height: 20, objectFit: 'contain' }} /> : <Coins size={18} color="var(--gold-primary)" />}
            Moedas disponíveis:
            <span style={{ color: 'var(--gold-primary)', fontSize: '1.1rem' }}>
              {isStaff ? '∞' : (userData.coins || 0)}
            </span>
          </span>
        </div>

        {/* Content */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>
          
          {/* Left Side: Sketchfab & Inventory */}
          <div style={{ width: '40%', display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border-glass)', background: 'var(--bg-dark)', minHeight: 0 }}>
            
            {/* Sketchfab Embed (visível só na Forja; oculto via CSS na Transmutação para não recarregar) */}
            <div style={{ 
              height: 'clamp(160px, 22vh, 195px)', 
              background: '#0f0f12', 
              position: 'relative', 
              overflow: 'hidden', 
              display: activeTab === 'forge' && showBlacksmith ? 'block' : 'none',
              flexShrink: 0 
            }}>
              <div style={{ 
                width: '142.8%', 
                height: '265px', 
                position: 'absolute', 
                top: 0, 
                left: '50%', 
                transform: 'translateX(-50%) scale(0.7)', 
                transformOrigin: 'top center' 
              }}>
                <div className="sketchfab-embed-wrapper" style={{ position: 'absolute', top: '-60px', bottom: '-60px', left: 0, right: 0 }}>
                  <iframe 
                    ref={iframeRef} 
                    title="Blacksmith and his anvil" 
                    frameBorder="0" 
                    allow="autoplay; fullscreen; xr-spatial-tracking" 
                    style={{ width: '100%', height: '100%', border: 'none', background: '#0f0f12', cursor: 'grab' }} 
                  />
                </div>
              </div>
              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '16px', background: 'linear-gradient(to top, #0f0f12, transparent)', pointerEvents: 'none' }} />
              {!sketchfabApi && (
                <div style={{ position: 'absolute', inset: 0, background: '#0f0f12', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#777', fontSize: '0.85rem', fontWeight: 'bold', gap: '0.5rem' }}>
                  <Hammer size={18} /> Carregando o ferreiro...
                </div>
              )}
            </div>


            {/* Inventory List */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem 1rem', minHeight: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <h3 style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.95rem' }}>
                  {activeTab === 'forge' ? 'Inventário da Forja' : 'Seus Equipamentos'}
                </h3>
                {activeTab === 'forge' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <button
                      type="button"
                      onClick={handleManualConsolidateStacks}
                      disabled={isForging || isConsolidating}
                      title="Juntar e organizar fragmentos e materiais duplicados em montes de até 99"
                      style={{
                        background: 'rgba(255, 215, 0, 0.08)',
                        border: '1px solid rgba(255, 215, 0, 0.25)',
                        color: 'var(--gold-primary)',
                        borderRadius: '6px',
                        padding: '3px 8px',
                        fontSize: '0.75rem',
                        cursor: isForging || isConsolidating ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        transition: 'background 0.2s, color 0.2s',
                        opacity: isForging || isConsolidating ? 0.6 : 1
                      }}
                      onMouseEnter={(e) => {
                        if (!isForging && !isConsolidating) {
                          e.currentTarget.style.background = 'rgba(255, 215, 0, 0.18)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isForging && !isConsolidating) {
                          e.currentTarget.style.background = 'rgba(255, 215, 0, 0.08)';
                        }
                      }}
                    >
                      <Layers size={13} className={isConsolidating ? "animate-spin" : ""} />
                      {isConsolidating ? 'Juntando...' : 'Juntar Montes'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowBlacksmith(!showBlacksmith)}
                      title={showBlacksmith ? 'Recolher ferreiro 3D para expandir o inventário' : 'Exibir ferreiro 3D'}
                      style={{
                        background: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        color: '#bbb',
                        borderRadius: '6px',
                        padding: '3px 8px',
                        fontSize: '0.75rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        transition: 'background 0.2s, color 0.2s'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                        e.currentTarget.style.color = '#fff';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                        e.currentTarget.style.color = '#bbb';
                      }}
                    >
                      {showBlacksmith ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                      {showBlacksmith ? 'Recolher 3D' : 'Exibir 3D'}
                    </button>
                  </div>
                )}
              </div>

              {activeTab === 'forge' && (
                <div style={{ display: 'flex', gap: '4px', marginBottom: '0.75rem', background: 'rgba(0,0,0,0.3)', padding: '3px', borderRadius: '6px' }}>
                  <button
                    type="button"
                    onClick={() => setInventoryFilter('all')}
                    disabled={isForging}
                    style={{
                      flex: 1, padding: '4px 6px', fontSize: '0.75rem', fontWeight: inventoryFilter === 'all' ? 'bold' : 'normal',
                      background: inventoryFilter === 'all' ? 'var(--gold-primary)' : 'transparent',
                      color: inventoryFilter === 'all' ? '#000' : '#aaa',
                      border: 'none', borderRadius: '4px', cursor: isForging ? 'not-allowed' : 'pointer', transition: 'all 0.15s',
                      opacity: isForging ? 0.6 : 1
                    }}
                  >
                    Todos
                  </button>
                  <button
                    type="button"
                    onClick={() => setInventoryFilter('equipment')}
                    disabled={isForging}
                    style={{
                      flex: 1, padding: '4px 6px', fontSize: '0.75rem', fontWeight: inventoryFilter === 'equipment' ? 'bold' : 'normal',
                      background: inventoryFilter === 'equipment' ? 'var(--gold-primary)' : 'transparent',
                      color: inventoryFilter === 'equipment' ? '#000' : '#aaa',
                      border: 'none', borderRadius: '4px', cursor: isForging ? 'not-allowed' : 'pointer', transition: 'all 0.15s',
                      opacity: isForging ? 0.6 : 1
                    }}
                  >
                    Equipamentos
                  </button>
                  <button
                    type="button"
                    onClick={() => setInventoryFilter('materials')}
                    disabled={isForging}
                    style={{
                      flex: 1, padding: '4px 6px', fontSize: '0.75rem', fontWeight: inventoryFilter === 'materials' ? 'bold' : 'normal',
                      background: inventoryFilter === 'materials' ? 'var(--gold-primary)' : 'transparent',
                      color: inventoryFilter === 'materials' ? '#000' : '#aaa',
                      border: 'none', borderRadius: '4px', cursor: isForging ? 'not-allowed' : 'pointer', transition: 'all 0.15s',
                      opacity: isForging ? 0.6 : 1
                    }}
                  >
                    Materiais
                  </button>
                </div>
              )}
              
              {loading ? (
                <p style={{ color: 'white', textAlign: 'center' }}>Carregando...</p>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(70px, 1fr))', gap: '0.5rem' }}>
                  {(activeTab === 'forge' ? forgeableItems : transmutableItems).map((item, idx) => {
                    const isSelected = activeTab === 'forge' ? selectedForgeItem?.docId === item.docId : selectedTransmuteItem?.docId === item.docId;
                    return (
                      <div 
                        key={idx}
                        onClick={() => {
                          if (isForging) return;
                          if (activeTab === 'forge') {
                            setSelectedForgeItem(item);
                            setBreakQty(1);
                            setFuseBatches(1);
                          } else {
                            setSelectedTransmuteItem(item);
                          }
                        }}
                        onMouseEnter={() => setHoveredTooltipItem(item)}
                        onMouseMove={(e) => setTooltipMousePos({ x: e.clientX, y: e.clientY })}
                        onMouseLeave={() => setHoveredTooltipItem(null)}
                        style={{ 
                          width: '70px', height: '70px', background: isSelected ? 'rgba(255, 215, 0, 0.2)' : 'rgba(0,0,0,0.5)', 
                          border: isSelected ? '2px solid var(--gold-primary)' : '1px solid var(--border-glass)',
                          borderRadius: '8px', cursor: 'pointer', position: 'relative',
                          display: 'flex', justifyContent: 'center', alignItems: 'center'
                        }}
                      >
                        {item.itemImageUrl ? <CachedImage src={item.itemImageUrl} alt={item.itemTitle} style={{ width: '50px', height: '50px', objectFit: 'contain' }} /> : <Hammer size={30} color="gray" />}
                        {item.forgeLevel > 0 && (
                          <div style={{ position: 'absolute', top: '2px', right: '2px', fontSize: '0.65rem', color: 'white', background: 'var(--accent-red)', fontWeight: 'bold', padding: '1px 4px', borderRadius: '4px' }}>
                            +{item.forgeLevel}
                          </div>
                        )}
                        {item.gameEffect === 'break_item' && (
                          <div style={{ position: 'absolute', top: '2px', left: '2px', fontSize: '0.65rem' }} title="Material Bruto (Triturável)">
                            ⛏️
                          </div>
                        )}
                        {item.gameEffect === 'fuse_item' && (
                          <div style={{ position: 'absolute', top: '2px', left: '2px', fontSize: '0.65rem' }} title="Fragmento (Fundível)">
                            🔥
                          </div>
                        )}
                        {activeTab === 'transmute' && (
                          <div style={{ position: 'absolute', top: '2px', left: '2px', fontSize: '0.65rem' }}>
                            ✨
                          </div>
                        )}
                        {item.equipped && (
                          <div style={{ position: 'absolute', bottom: '2px', fontSize: '0.6rem', color: 'var(--gold-primary)', fontWeight: 'bold', background: 'rgba(0,0,0,0.7)', padding: '2px 4px', borderRadius: '4px' }}>
                            Eqp
                          </div>
                        )}
                        {item.quantity && item.quantity > 1 && (
                          <div style={{ position: 'absolute', bottom: '2px', right: '2px', fontSize: '0.65rem', color: '#fff', fontWeight: 'bold', background: 'rgba(0,0,0,0.85)', padding: '1px 4px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.15)' }}>
                            x{item.quantity}
                          </div>
                        )}
                      </div>
                    )
                  })}
                  
                  {(activeTab === 'forge' ? forgeableItems : transmutableItems).length === 0 && (
                    <p style={{ gridColumn: '1 / -1', color: 'gray', textAlign: 'center', padding: '2rem 0', fontSize: '0.85rem' }}>
                      {activeTab === 'forge' ? 'Nenhum equipamento ou material disponível.' : 'Nenhum equipamento +9 transmutável no inventário.'}
                    </p>
                  )}
                </div>
              )}
            </div>

          </div>

          {/* Right Side: Action Panel */}
          <div style={{ flex: 1, padding: '2rem', display: 'flex', flexDirection: 'column', overflowY: 'auto', minHeight: 0 }}>
            
            {activeTab === 'forge' && (
              <>
                <h3 style={{ color: 'var(--gold-primary)', fontSize: '1.5rem', marginBottom: '1rem', borderBottom: '1px solid var(--border-glass)', paddingBottom: '0.5rem' }}>
                  {selectedForgeItem?.gameEffect === 'break_item'
                    ? 'Bancada de Quebra & Refino'
                    : selectedForgeItem?.gameEffect === 'fuse_item'
                    ? 'Crisol de Fundição de Materiais'
                    : 'Bigorna de Forja'}
                </h3>
                
                {!selectedForgeItem ? (
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', color: 'var(--text-secondary)' }}>
                    <Hammer size={64} style={{ opacity: 0.2, marginBottom: '1rem' }} />
                    <p>Selecione um equipamento ou material no inventário à esquerda.</p>
                  </div>
                ) : selectedForgeItem.gameEffect === 'break_item' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    {(() => {
                      const matchingStacks = items.filter(i => i.itemId === selectedForgeItem.itemId && i.gameEffect === selectedForgeItem.gameEffect);
                      const totalOwned = matchingStacks.length > 0 
                        ? matchingStacks.reduce((sum, s) => sum + (s.quantity || 1), 0)
                        : (selectedForgeItem.quantity || 1);
                      const minQ = selectedForgeItem.breakMinQty ?? 1;
                      const maxQ = Math.max(minQ, selectedForgeItem.breakMaxQty ?? minQ);
                      const unitCost = selectedForgeItem.breakCost ?? 0;
                      const successChance = selectedForgeItem.breakSuccessChance ?? 80;
                      const currentBreakQty = Math.max(1, Math.min(totalOwned, breakQty));
                      const totalCost = currentBreakQty * unitCost;
                      const targetItemId = selectedForgeItem.breakTargetItemId;
                      const targetInfo = targetItemId ? materialCatalog[targetItemId] : null;
                      const targetTitle = targetInfo?.title || 'Fragmento';
                      const targetImg = targetInfo?.imageUrl || '';
                      const canAfford = isStaff || (userData.coins || 0) >= totalCost;

                      return (
                        <>
                          {/* Header Box com Material Bruto -> Seta -> Fragmentos */}
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around', gap: '1rem', background: 'rgba(0,0,0,0.35)', padding: '1.5rem', borderRadius: '12px', border: '1px solid rgba(234,88,12,0.3)', flexWrap: 'wrap' }}>
                            {/* Origem */}
                            <div 
                              onMouseEnter={() => setHoveredTooltipItem(selectedForgeItem)}
                              onMouseMove={(e) => setTooltipMousePos({ x: e.clientX, y: e.clientY })}
                              onMouseLeave={() => setHoveredTooltipItem(null)}
                              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}
                            >
                              <div style={{ width: '84px', height: '84px', background: 'rgba(0,0,0,0.7)', borderRadius: '12px', display: 'flex', justifyContent: 'center', alignItems: 'center', border: '2px solid rgba(234,88,12,0.6)', position: 'relative' }}>
                                {selectedForgeItem.itemImageUrl ? <CachedImage src={selectedForgeItem.itemImageUrl} alt={selectedForgeItem.itemTitle} style={{ width: '64px', height: '64px', objectFit: 'contain' }} /> : <Hammer size={40} color="#f97316" />}
                                <div style={{ position: 'absolute', bottom: '4px', right: '4px', fontSize: '0.7rem', color: '#fff', fontWeight: 'bold', background: 'rgba(0,0,0,0.85)', padding: '1px 5px', borderRadius: '4px' }}>
                                  x{totalOwned}
                                </div>
                              </div>
                              <span style={{ color: 'white', fontWeight: 'bold', fontSize: '0.9rem', textAlign: 'center', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {selectedForgeItem.itemTitle}
                              </span>
                              <span style={{ fontSize: '0.7rem', color: '#f97316', background: 'rgba(234,88,12,0.15)', padding: '2px 6px', borderRadius: '4px', border: '1px solid rgba(234,88,12,0.3)' }}>
                                Material Bruto
                              </span>
                            </div>

                            {/* Seta e Rendimento */}
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem' }}>
                              <ArrowRight size={32} color="#f97316" />
                              <span style={{ fontSize: '0.8rem', color: '#f97316', fontWeight: 'bold', background: 'rgba(234,88,12,0.12)', padding: '3px 8px', borderRadius: '6px' }}>
                                {minQ === maxQ ? `${minQ}x un.` : `${minQ} a ${maxQ}x un.`}
                              </span>
                              <span style={{ fontSize: '0.75rem', color: '#aaa' }}>
                                {unitCost > 0 ? `${unitCost} moedas / un.` : 'Grátis'}
                              </span>
                            </div>

                            {/* Destino */}
                            <div 
                              onMouseEnter={() => targetInfo && setHoveredTooltipItem(targetInfo)}
                              onMouseMove={(e) => setTooltipMousePos({ x: e.clientX, y: e.clientY })}
                              onMouseLeave={() => setHoveredTooltipItem(null)}
                              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', cursor: targetInfo ? 'pointer' : 'default' }}
                            >
                              <div style={{ width: '84px', height: '84px', background: 'rgba(0,0,0,0.7)', borderRadius: '12px', display: 'flex', justifyContent: 'center', alignItems: 'center', border: '2px solid rgba(251,191,36,0.6)', position: 'relative' }}>
                                {targetImg ? <CachedImage src={targetImg} alt={targetTitle} style={{ width: '64px', height: '64px', objectFit: 'contain' }} /> : <Sparkles size={40} color="#fbbf24" />}
                              </div>
                              <span style={{ color: 'white', fontWeight: 'bold', fontSize: '0.9rem', textAlign: 'center', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {targetTitle}
                              </span>
                              <span style={{ fontSize: '0.7rem', color: '#fbbf24', background: 'rgba(251,191,36,0.15)', padding: '2px 6px', borderRadius: '4px', border: '1px solid rgba(251,191,36,0.3)' }}>
                                Fragmento
                              </span>
                            </div>
                          </div>

                          {/* Seletor de Quantidade */}
                          <div style={{ background: 'rgba(0,0,0,0.4)', padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--border-glass)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                              <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Quantidade a quebrar:</span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <button
                                  type="button"
                                  onClick={() => setBreakQty(prev => Math.max(1, prev - 1))}
                                  disabled={currentBreakQty <= 1 || isForging}
                                  style={{ width: '32px', height: '32px', borderRadius: '6px', background: 'rgba(255,255,255,0.1)', color: 'white', border: 'none', cursor: currentBreakQty <= 1 ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}
                                >
                                  -
                                </button>
                                <input
                                  type="number"
                                  min={1}
                                  max={totalOwned}
                                  value={currentBreakQty}
                                  onChange={e => setBreakQty(Math.max(1, Math.min(totalOwned, Number(e.target.value) || 1)))}
                                  disabled={isForging}
                                  style={{ width: '60px', textAlign: 'center', padding: '0.4rem', borderRadius: '6px', background: 'rgba(0,0,0,0.6)', border: '1px solid var(--border-glass)', color: 'white', fontWeight: 'bold' }}
                                />
                                <button
                                  type="button"
                                  onClick={() => setBreakQty(prev => Math.min(totalOwned, prev + 1))}
                                  disabled={currentBreakQty >= totalOwned || isForging}
                                  style={{ width: '32px', height: '32px', borderRadius: '6px', background: 'rgba(255,255,255,0.1)', color: 'white', border: 'none', cursor: currentBreakQty >= totalOwned ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}
                                >
                                  +
                                </button>
                                {totalOwned > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => setBreakQty(totalOwned)}
                                    disabled={isForging}
                                    style={{ padding: '0.35rem 0.65rem', borderRadius: '6px', background: 'rgba(234,88,12,0.2)', color: '#f97316', border: '1px solid rgba(234,88,12,0.4)', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 'bold' }}
                                  >
                                    Máx ({totalOwned})
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Resumo */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.75rem', background: 'rgba(0,0,0,0.3)', padding: '0.85rem', borderRadius: '8px' }}>
                              <div>
                                <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>Consumo:</div>
                                <div style={{ color: 'white', fontWeight: 'bold', fontSize: '0.95rem' }}>{currentBreakQty}x {selectedForgeItem.itemTitle}</div>
                              </div>
                              <div>
                                <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>Rendimento Estimado:</div>
                                <div style={{ color: '#fbbf24', fontWeight: 'bold', fontSize: '0.95rem' }}>
                                  {currentBreakQty * minQ === currentBreakQty * maxQ ? `${currentBreakQty * minQ}x` : `${currentBreakQty * minQ} a ${currentBreakQty * maxQ}x`}
                                </div>
                              </div>
                              <div>
                                <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>Taxa de Sucesso:</div>
                                <div style={{ color: successChance >= 80 ? '#10b981' : successChance >= 50 ? '#f59e0b' : '#ef4444', fontWeight: 'bold', fontSize: '0.95rem' }}>
                                  {successChance}%
                                </div>
                              </div>
                              <div>
                                <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>Taxa do Ferreiro:</div>
                                <div style={{ color: canAfford ? 'var(--gold-primary)' : '#ef4444', fontWeight: 'bold', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  {coinUrl ? <CachedImage src={coinUrl} alt="Moeda" style={{ width: 16, height: 16, objectFit: 'contain' }} /> : <Coins size={15} color="var(--gold-primary)" />}
                                  {totalCost} moedas
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Botão de Quebrar */}
                          <button
                            onClick={handleBreakMaterial}
                            disabled={!canAfford || isForging || !targetItemId}
                            style={{
                              width: '100%',
                              padding: '1.2rem',
                              background: (!canAfford || isForging || !targetItemId) ? 'rgba(120,120,120,0.4)' : 'linear-gradient(to right, #ea580c, #c2410c)',
                              color: 'white',
                              border: 'none',
                              borderRadius: '12px',
                              fontSize: '1.15rem',
                              fontWeight: 'bold',
                              cursor: (!canAfford || isForging || !targetItemId) ? 'not-allowed' : 'pointer',
                              display: 'flex',
                              justifyContent: 'center',
                              alignItems: 'center',
                              gap: '0.5rem',
                              boxShadow: '0 4px 15px rgba(234,88,12,0.35)',
                              opacity: (!canAfford || isForging || !targetItemId) ? 0.5 : 1
                            }}
                          >
                            <Hammer size={22} className={isForging ? "animate-bounce" : ""} />
                            {isForging ? 'TRITURANDO MATERIAL...' : (!targetItemId ? 'Destino não configurado' : !canAfford ? 'Moedas Insuficientes' : `TRITURAR (${totalCost} Moedas)`)}
                          </button>
                          <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', textAlign: 'center', margin: '-0.75rem 0 0 0' }}>
                            ⚠️ O ferreiro pode falhar ao triturar. Se falhar, o material e as moedas serão perdidos!
                          </p>
                        </>
                      );
                    })()}
                  </div>
                ) : selectedForgeItem.gameEffect === 'fuse_item' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    {(() => {
                      const matchingStacks = items.filter(i => i.itemId === selectedForgeItem.itemId && i.gameEffect === selectedForgeItem.gameEffect);
                      const totalOwned = matchingStacks.length > 0 
                        ? matchingStacks.reduce((sum, s) => sum + (s.quantity || 1), 0)
                        : (selectedForgeItem.quantity || 1);
                      const reqQty = selectedForgeItem.fuseRequiredQty ?? 50;
                      const resQty = selectedForgeItem.fuseResultQty ?? 1;
                      const unitCost = selectedForgeItem.fuseCost ?? 0;
                      const successChance = selectedForgeItem.fuseSuccessChance ?? 75;
                      const maxBatches = Math.floor(totalOwned / reqQty);
                      const currentBatches = Math.max(1, Math.min(Math.max(1, maxBatches), fuseBatches));
                      const totalFragmentsConsumed = currentBatches * reqQty;
                      const totalYield = currentBatches * resQty;
                      const totalCost = currentBatches * unitCost;
                      const targetItemId = selectedForgeItem.fuseTargetItemId;
                      const targetInfo = targetItemId ? materialCatalog[targetItemId] : null;
                      const targetTitle = targetInfo?.title || 'Lingote';
                      const targetImg = targetInfo?.imageUrl || '';
                      const canAfford = isStaff || (userData.coins || 0) >= totalCost;
                      const hasEnoughFragments = totalOwned >= reqQty;
                      const progressPct = Math.min(100, Math.round((totalOwned / reqQty) * 100));

                      return (
                        <>
                          {/* Header Box com Fragmentos -> Seta -> Lingote */}
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around', gap: '1rem', background: 'rgba(0,0,0,0.35)', padding: '1.5rem', borderRadius: '12px', border: '1px solid rgba(59,130,246,0.3)', flexWrap: 'wrap' }}>
                            {/* Origem */}
                            <div 
                              onMouseEnter={() => setHoveredTooltipItem(selectedForgeItem)}
                              onMouseMove={(e) => setTooltipMousePos({ x: e.clientX, y: e.clientY })}
                              onMouseLeave={() => setHoveredTooltipItem(null)}
                              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}
                            >
                              <div style={{ width: '84px', height: '84px', background: 'rgba(0,0,0,0.7)', borderRadius: '12px', display: 'flex', justifyContent: 'center', alignItems: 'center', border: `2px solid ${hasEnoughFragments ? '#10b981' : '#3b82f6'}`, position: 'relative' }}>
                                {selectedForgeItem.itemImageUrl ? <CachedImage src={selectedForgeItem.itemImageUrl} alt={selectedForgeItem.itemTitle} style={{ width: '64px', height: '64px', objectFit: 'contain' }} /> : <Sparkles size={40} color="#3b82f6" />}
                                <div style={{ position: 'absolute', bottom: '4px', right: '4px', fontSize: '0.7rem', color: '#fff', fontWeight: 'bold', background: 'rgba(0,0,0,0.85)', padding: '1px 5px', borderRadius: '4px' }}>
                                  x{totalOwned}
                                </div>
                              </div>
                              <span style={{ color: 'white', fontWeight: 'bold', fontSize: '0.9rem', textAlign: 'center', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {selectedForgeItem.itemTitle}
                              </span>
                              <span style={{ fontSize: '0.7rem', color: '#60a5fa', background: 'rgba(59,130,246,0.15)', padding: '2px 6px', borderRadius: '4px', border: '1px solid rgba(59,130,246,0.3)' }}>
                                Fragmento
                              </span>
                            </div>

                            {/* Seta e Requisito */}
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem' }}>
                              <ArrowRight size={32} color="#60a5fa" />
                              <span style={{ fontSize: '0.8rem', color: '#60a5fa', fontWeight: 'bold', background: 'rgba(59,130,246,0.12)', padding: '3px 8px', borderRadius: '6px' }}>
                                {reqQty}x ➔ {resQty}x
                              </span>
                              <span style={{ fontSize: '0.75rem', color: '#aaa' }}>
                                {unitCost > 0 ? `${unitCost} moedas / lote` : 'Grátis'}
                              </span>
                            </div>

                            {/* Destino */}
                            <div 
                              onMouseEnter={() => targetInfo && setHoveredTooltipItem(targetInfo)}
                              onMouseMove={(e) => setTooltipMousePos({ x: e.clientX, y: e.clientY })}
                              onMouseLeave={() => setHoveredTooltipItem(null)}
                              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', cursor: targetInfo ? 'pointer' : 'default' }}
                            >
                              <div style={{ width: '84px', height: '84px', background: 'rgba(0,0,0,0.7)', borderRadius: '12px', display: 'flex', justifyContent: 'center', alignItems: 'center', border: '2px solid rgba(251,191,36,0.6)', position: 'relative' }}>
                                {targetImg ? <CachedImage src={targetImg} alt={targetTitle} style={{ width: '64px', height: '64px', objectFit: 'contain' }} /> : <Sparkles size={40} color="#fbbf24" />}
                              </div>
                              <span style={{ color: 'white', fontWeight: 'bold', fontSize: '0.9rem', textAlign: 'center', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {targetTitle}
                              </span>
                              <span style={{ fontSize: '0.7rem', color: '#fbbf24', background: 'rgba(251,191,36,0.15)', padding: '2px 6px', borderRadius: '4px', border: '1px solid rgba(251,191,36,0.3)' }}>
                                Lingote / Barra
                              </span>
                            </div>
                          </div>

                          {/* Barra de Progresso do Fragmento */}
                          <div style={{ background: 'rgba(0,0,0,0.4)', padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--border-glass)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                              <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Progresso para fundição:</span>
                              <span style={{ color: hasEnoughFragments ? '#10b981' : '#f59e0b', fontWeight: 'bold', fontSize: '0.85rem' }}>
                                {totalOwned} / {reqQty} ({progressPct}%)
                              </span>
                            </div>
                            <div style={{ width: '100%', height: '10px', background: 'rgba(255,255,255,0.1)', borderRadius: '5px', overflow: 'hidden', marginBottom: '1rem' }}>
                              <div style={{ width: `${progressPct}%`, height: '100%', background: hasEnoughFragments ? 'linear-gradient(to right, #10b981, #059669)' : 'linear-gradient(to right, #f59e0b, #d97706)', transition: 'width 0.3s' }} />
                            </div>

                            {/* Seletor de Lotes se tiver para mais de 1 */}
                            {maxBatches > 1 && (
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem', paddingTop: '0.5rem', borderTop: '1px dashed rgba(255,255,255,0.1)' }}>
                                <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Lotes a fundir:</span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                  <button
                                    type="button"
                                    onClick={() => setFuseBatches(prev => Math.max(1, prev - 1))}
                                    disabled={currentBatches <= 1 || isForging}
                                    style={{ width: '32px', height: '32px', borderRadius: '6px', background: 'rgba(255,255,255,0.1)', color: 'white', border: 'none', cursor: currentBatches <= 1 ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}
                                  >
                                    -
                                  </button>
                                  <input
                                    type="number"
                                    min={1}
                                    max={maxBatches}
                                    value={currentBatches}
                                    onChange={e => setFuseBatches(Math.max(1, Math.min(maxBatches, Number(e.target.value) || 1)))}
                                    disabled={isForging}
                                    style={{ width: '60px', textAlign: 'center', padding: '0.4rem', borderRadius: '6px', background: 'rgba(0,0,0,0.6)', border: '1px solid var(--border-glass)', color: 'white', fontWeight: 'bold' }}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => setFuseBatches(prev => Math.min(maxBatches, prev + 1))}
                                    disabled={currentBatches >= maxBatches || isForging}
                                    style={{ width: '32px', height: '32px', borderRadius: '6px', background: 'rgba(255,255,255,0.1)', color: 'white', border: 'none', cursor: currentBatches >= maxBatches ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}
                                  >
                                    +
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setFuseBatches(maxBatches)}
                                    disabled={isForging}
                                    style={{ padding: '0.35rem 0.65rem', borderRadius: '6px', background: 'rgba(59,130,246,0.2)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.4)', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 'bold' }}
                                  >
                                    Máx ({maxBatches})
                                  </button>
                                </div>
                              </div>
                            )}

                            {/* Resumo */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.75rem', background: 'rgba(0,0,0,0.3)', padding: '0.85rem', borderRadius: '8px' }}>
                              <div>
                                <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>Consumo de Fragmentos:</div>
                                <div style={{ color: 'white', fontWeight: 'bold', fontSize: '0.95rem' }}>{totalFragmentsConsumed}x {selectedForgeItem.itemTitle}</div>
                              </div>
                              <div>
                                <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>Lingotes Produzidos:</div>
                                <div style={{ color: '#fbbf24', fontWeight: 'bold', fontSize: '0.95rem' }}>
                                  {totalYield}x {targetTitle}
                                </div>
                              </div>
                              <div>
                                <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>Taxa de Sucesso:</div>
                                <div style={{ color: successChance >= 80 ? '#10b981' : successChance >= 50 ? '#f59e0b' : '#ef4444', fontWeight: 'bold', fontSize: '0.95rem' }}>
                                  {successChance}%
                                </div>
                              </div>
                              <div>
                                <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>Taxa do Ferreiro:</div>
                                <div style={{ color: canAfford ? 'var(--gold-primary)' : '#ef4444', fontWeight: 'bold', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  {coinUrl ? <CachedImage src={coinUrl} alt="Moeda" style={{ width: 16, height: 16, objectFit: 'contain' }} /> : <Coins size={15} color="var(--gold-primary)" />}
                                  {totalCost} moedas
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Botão de Fundir */}
                          <button
                            onClick={handleFuseMaterial}
                            disabled={!hasEnoughFragments || !canAfford || isForging || !targetItemId}
                            style={{
                              width: '100%',
                              padding: '1.2rem',
                              background: (!hasEnoughFragments || !canAfford || isForging || !targetItemId) ? 'rgba(120,120,120,0.4)' : 'linear-gradient(to right, #2563eb, #1d4ed8)',
                              color: 'white',
                              border: 'none',
                              borderRadius: '12px',
                              fontSize: '1.15rem',
                              fontWeight: 'bold',
                              cursor: (!hasEnoughFragments || !canAfford || isForging || !targetItemId) ? 'not-allowed' : 'pointer',
                              display: 'flex',
                              justifyContent: 'center',
                              alignItems: 'center',
                              gap: '0.5rem',
                              boxShadow: '0 4px 15px rgba(37,99,235,0.35)',
                              opacity: (!hasEnoughFragments || !canAfford || isForging || !targetItemId) ? 0.5 : 1
                            }}
                          >
                            <Hammer size={22} className={isForging ? "animate-bounce" : ""} />
                            {isForging ? 'FUNDINDO MATERIAL...' : (!targetItemId ? 'Destino não configurado' : !hasEnoughFragments ? `Faltam ${reqQty - totalOwned} Fragmentos` : !canAfford ? 'Moedas Insuficientes' : `FUNDIR NO FERREIRO (${totalCost} Moedas)`)}
                          </button>
                          <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', textAlign: 'center', margin: '-0.75rem 0 0 0' }}>
                            ⚠️ O ferreiro pode falhar ao fundir. Se falhar, os fragmentos e as moedas serão perdidos!
                          </p>
                        </>
                      );
                    })()}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    {(() => {
                      const curLevel = selectedForgeItem.forgeLevel || 0;
                      const baseAttr = selectedForgeItem.baseAttributeValue || 0;
                      const buyPrice = selectedForgeItem.cost || selectedForgeItem.price || 100;
                      const curAttr = forgeAttributeValueWithConfig(baseAttr, curLevel, selectedForgeItem.forgeConfig);
                      const maxAttr = forgeAttributeValueWithConfig(baseAttr, MAX_FORGE_LEVEL, selectedForgeItem.forgeConfig);
                      const nextAttr = forgeAttributeValueWithConfig(baseAttr, curLevel + 1, selectedForgeItem.forgeConfig);
                      const nextCost = nextForgeCostWithConfig(curLevel, buyPrice, selectedForgeItem.forgeConfig);
                      const nextBaseChance = forgeSuccessChance(curLevel + 1, selectedForgeItem.forgeConfig);
                      const nextChance = useScroll ? Math.min(100, nextBaseChance + scrollChanceBonus) : nextBaseChance;
                      const requiredMats = forgeMaterialsForLevel(curLevel + 1, selectedForgeItem.forgeConfig);
                      const matCount = (id: string) => consumables.filter(c => c.itemId === id).reduce((s, c) => s + (c.quantity || 1), 0);
                      const materialsMissing = requiredMats.some(id => matCount(id) <= 0);
                      return (
                        <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', background: 'rgba(0,0,0,0.3)', padding: '1.5rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)' }}>
                        <div 
                          onMouseEnter={() => selectedForgeItem && setHoveredTooltipItem(selectedForgeItem)}
                          onMouseMove={(e) => setTooltipMousePos({ x: e.clientX, y: e.clientY })}
                          onMouseLeave={() => setHoveredTooltipItem(null)}
                          style={{ width: '100px', height: '100px', background: 'black', borderRadius: '12px', display: 'flex', justifyContent: 'center', alignItems: 'center', border: '2px solid #555', position: 'relative', cursor: 'pointer' }}
                        >
                          {selectedForgeItem.itemImageUrl && <CachedImage src={selectedForgeItem.itemImageUrl} alt={selectedForgeItem.itemTitle} style={{ width: '80px', height: '80px', objectFit: 'contain' }} />}
                        </div>
                        <div>
                          <h4 style={{ color: 'white', margin: '0 0 0.5rem 0', fontSize: '1.2rem' }}>{forgeItemName(selectedForgeItem.itemTitle, curLevel)}</h4>
                          <div style={{ color: '#aaa', fontSize: '0.9rem', marginBottom: '0.5rem' }}>Nível Atual: +{curLevel}</div>
                          <div style={{ color: '#aaa', fontSize: '0.9rem' }}>
                            {selectedForgeItem.baseAttributeType && selectedForgeItem.baseAttributeType !== 'none'
                              ? `${selectedForgeItem.baseAttributeType.toUpperCase()}: ${curAttr} / ${maxAttr}`
                              : `Força: ${curAttr} / ${maxAttr}`}
                            {' '}
                            <span style={{ color: '#888', fontSize: '0.8rem' }}>(máx. +{MAX_FORGE_LEVEL})</span>
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', justifyContent: 'center' }}>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ color: '#aaa', fontSize: '0.9rem' }}>Força Atual</div>
                          <div style={{ color: 'white', fontSize: '1.5rem', fontWeight: 'bold' }}>{curAttr}</div>
                          <div style={{ color: '#888', fontSize: '0.75rem' }}>({Math.round(forgeStrengthFraction(curLevel) * 100)}% do máx.)</div>
                        </div>
                        <ArrowRight size={30} color="var(--gold-primary)" />
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ color: 'var(--gold-primary)', fontSize: '0.9rem' }}>Próximo Nível (+{curLevel + 1})</div>
                          <div style={{ color: 'var(--gold-primary)', fontSize: '1.5rem', fontWeight: 'bold' }}>{nextAttr}</div>
                          <div style={{ color: '#888', fontSize: '0.75rem' }}>({Math.round(forgeStrengthFraction(curLevel + 1) * 100)}% do máx.)</div>
                        </div>
                      </div>

                      {scrollCount > 0 && (
                        <div style={{ background: 'rgba(251, 191, 36, 0.08)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(251, 191, 36, 0.3)' }}>
                          <h4 style={{ color: '#fbbf24', margin: '0 0 0.5rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            🔨 Pergaminho do Ferreiro
                          </h4>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'white', cursor: 'pointer' }}>
                            <input type="checkbox" checked={useScroll} onChange={e => setUseScroll(e.target.checked)} style={{ width: '20px', height: '20px', cursor: 'pointer' }} />
                            <span>
                              Usar {activeScroll?.title || 'Pergaminho'}
                              <strong style={{ color: '#fbbf24', marginLeft: '6px' }}>
                                (+{scrollChanceBonus}%)
                              </strong>
                              <span style={{ color: '#aaa', fontSize: '0.85rem', marginLeft: '6px' }}>
                                (Você tem {activeScroll?.quantity || scrollCount})
                              </span>
                            </span>
                          </label>

                          {availableScrolls.length > 1 && (
                            <div style={{ marginTop: '0.75rem', paddingLeft: '28px' }}>
                              <label style={{ fontSize: '0.8rem', color: '#ccc', display: 'block', marginBottom: '4px' }}>
                                Escolha qual pergaminho utilizar:
                              </label>
                              <select
                                value={activeScroll?.docId}
                                onChange={e => setSelectedScrollDocId(e.target.value)}
                                style={{ width: '100%', padding: '0.4rem 0.6rem', borderRadius: '6px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                              >
                                {availableScrolls.map(s => (
                                  <option key={s.docId} value={s.docId}>
                                    {s.title} (+{s.bonus}%) — {s.quantity} disponível(is)
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}

                          <p style={{ color: '#aaa', fontSize: '0.85rem', margin: '0.5rem 0 0 0', paddingLeft: '28px' }}>
                            {scrollChanceBonus >= 100
                              ? 'Garante 100% de sucesso na forja (consome 1 pergaminho).'
                              : `Soma +${scrollChanceBonus}% à chance base de sucesso e protege o item da destruição em caso de falha (se falhar, regride 1 nível até o mínimo +0; consome 1 pergaminho).`
                            }
                          </p>
                        </div>
                      )}

                      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.5)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-glass)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'white', fontSize: '1.2rem', fontWeight: 'bold' }}>
                            {coinUrl ? <CachedImage src={coinUrl} alt="Moeda" style={{ width: 26, height: 26, objectFit: 'contain' }} /> : <Coins size={24} color="var(--gold-primary)" />} {nextCost} Moedas
                          </div>
                          <div style={{ color: 'white', fontSize: '1.2rem', display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                            <span>Chance:</span>
                            <strong style={{ color: useScroll ? '#10B981' : 'white' }}>
                              {nextChance}%
                            </strong>
                            {useScroll && (
                              <span style={{ fontSize: '0.85rem', color: '#10B981' }}>
                                ({nextBaseChance}% + {scrollChanceBonus}%)
                              </span>
                            )}
                          </div>
                        </div>

                        {requiredMats.length > 0 && (
                          <div style={{ background: 'rgba(139,92,246,0.1)', padding: '0.85rem 1rem', borderRadius: '8px', border: '1px solid rgba(139,92,246,0.3)' }}>
                            <div style={{ color: '#c084fc', fontWeight: 'bold', fontSize: '0.9rem', marginBottom: '0.4rem' }}>🧪 Materiais exigidos (consumidos no sucesso ou falha)</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                              {requiredMats.map(id => {
                                const qty = matCount(id);
                                const owned = consumables.find(c => c.itemId === id);
                                const cat = materialCatalog[id];
                                const title = owned?.itemTitle || cat?.title || 'Material';
                                const img = owned?.itemImageUrl || cat?.imageUrl || '';
                                return (
                                  <div 
                                    key={id} 
                                    onMouseEnter={() => {
                                      const matObj = owned || cat;
                                      if (matObj) setHoveredTooltipItem(matObj);
                                    }}
                                    onMouseMove={(e) => setTooltipMousePos({ x: e.clientX, y: e.clientY })}
                                    onMouseLeave={() => setHoveredTooltipItem(null)}
                                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem', gap: '0.5rem', cursor: (owned || cat) ? 'pointer' : 'default' }}
                                  >
                                    <span style={{ color: 'white', display: 'flex', alignItems: 'center', gap: '0.4rem', minWidth: 0 }}>
                                      {img ? <CachedImage src={img} alt={title} style={{ width: 22, height: 22, objectFit: 'contain', flexShrink: 0 }} /> : <Sparkles size={18} color="#c084fc" style={{ flexShrink: 0 }} />}
                                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
                                    </span>
                                    <strong style={{ color: qty > 0 ? '#10B981' : '#ef4444', flexShrink: 0 }}>
                                      {qty > 0 ? `✓ ${qty}x` : 'FALTA'}
                                    </strong>
                                  </div>
                                );
                              })}
                            </div>
                            <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px dashed rgba(139,92,246,0.3)', fontSize: '0.75rem', color: '#a78bfa' }}>
                              💡 Estes materiais podem ser encontrados em <strong>missões</strong> (drops de monstros/baús) ou no <strong>Bazar</strong> (itens à venda por outros jogadores). Junte-os na mochila antes de forjar.
                            </div>
                            {onGoToStore && (
                              <button
                                onClick={onGoToStore}
                                style={{ marginTop: '0.6rem', width: '100%', padding: '0.45rem', background: 'rgba(139,92,246,0.2)', color: '#c084fc', border: '1px solid rgba(139,92,246,0.4)', borderRadius: '8px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 'bold' }}
                              >
                                🛒 Ir à Loja / Bazar para tentar conseguir
                              </button>
                            )}
                          </div>
                        )}

                        <button 
                          onClick={handleForge}
                          disabled={((!isStaff && userData.coins < nextCost) || materialsMissing) || isForging}
                          style={{ width: '100%', padding: '1.2rem', background: (((!isStaff && userData.coins < nextCost) || materialsMissing) || isForging) ? 'rgba(120,120,120,0.4)' : 'linear-gradient(to right, #ea580c, #dc2626)', color: 'white', border: 'none', borderRadius: '12px', fontSize: '1.2rem', fontWeight: 'bold', cursor: (((!isStaff && userData.coins < nextCost) || materialsMissing) || isForging) ? 'not-allowed' : 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', boxShadow: '0 4px 15px rgba(220, 38, 38, 0.3)', opacity: (((!isStaff && userData.coins < nextCost) || materialsMissing) || isForging) ? 0.5 : 1 }}
                        >
                          <Hammer size={24} className={isForging ? "animate-bounce" : ""} /> {isForging ? 'FORJANDO...' : 'BATER O MARTELO'}
                        </button>
                      </div>
                      </>
                      );
                    })()}
                  </div>
                )}
              </>
            )}

            {activeTab === 'transmute' && (
              <>
                <h3 style={{ color: 'var(--gold-primary)', fontSize: '1.5rem', marginBottom: '1rem', borderBottom: '1px solid var(--border-glass)', paddingBottom: '0.5rem' }}>Altar de Transmutação</h3>

                {/* 4-Slot Altar */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>

                  {/* Slot 1 – Item a transmutar (+9) */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem' }}>
                    <div 
                      onMouseEnter={() => selectedTransmuteItem && setHoveredTooltipItem(selectedTransmuteItem)}
                      onMouseMove={(e) => setTooltipMousePos({ x: e.clientX, y: e.clientY })}
                      onMouseLeave={() => setHoveredTooltipItem(null)}
                      style={{ width: '90px', height: '90px', background: 'rgba(0,0,0,0.7)', border: `2px solid ${selectedTransmuteItem ? 'var(--gold-primary)' : '#555'}`, borderRadius: '12px', display: 'flex', justifyContent: 'center', alignItems: 'center', position: 'relative', boxShadow: selectedTransmuteItem ? '0 0 16px rgba(255,215,0,0.4)' : 'none', cursor: selectedTransmuteItem ? 'pointer' : 'default' }}
                    >
                      {selectedTransmuteItem ? (
                        <>
                          <img src={selectedTransmuteItem.itemImageUrl} alt={selectedTransmuteItem.itemTitle} style={{ width: '70px', height: '70px', objectFit: 'contain' }} />
                          <div style={{ position: 'absolute', top: '-8px', right: '-8px', background: 'var(--accent-red)', color: 'white', fontSize: '0.75rem', fontWeight: 'bold', padding: '2px 5px', borderRadius: '4px' }}>+9</div>
                          <div style={{ position: 'absolute', bottom: '-6px', background: 'rgba(139,92,246,0.9)', color: 'white', fontSize: '0.6rem', fontWeight: 'bold', padding: '1px 6px', borderRadius: '4px' }}>Transmutável</div>
                        </>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0.3rem', color: '#666' }}>
                          <Hammer size={24} style={{ opacity: 0.5, marginBottom: '2px' }} />
                          <span style={{ fontSize: '0.65rem', textAlign: 'center', lineHeight: 1.1 }}>Item +9 Transmutável</span>
                        </div>
                      )}
                    </div>
                    <span style={{ color: '#aaa', fontSize: '0.7rem', fontWeight: 'bold' }}>ITEM +9</span>
                  </div>

                  <span style={{ color: '#8b5cf6', fontSize: '1.5rem', fontWeight: 'bold' }}>+</span>

                  {/* Slots 2 & 3 – Ingredientes (materiais exigidos pelo ritual) */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'center' }}>
                    {[0, 1].map(matIdx => {
                      const matId = selectedTransmuteItem?.transmuteConfig?.materials?.[matIdx];
                      const haveMat = matId ? consumables.filter(c => c.itemId === matId).reduce((s, c) => s + (c.quantity || 1), 0) : 0;
                      const matTitle = matId ? (materialCatalog[matId]?.title || consumables.find(c => c.itemId === matId)?.itemTitle || 'Material') : 'Material';
                      const matImg = matId ? (materialCatalog[matId]?.imageUrl || consumables.find(c => c.itemId === matId)?.itemImageUrl) : undefined;
                      return (
                        <div 
                          key={matIdx} 
                          title={matTitle} 
                          onMouseEnter={() => {
                            const matObj = matId ? (materialCatalog[matId] || consumables.find(c => c.itemId === matId)) : null;
                            if (matObj) setHoveredTooltipItem(matObj);
                          }}
                          onMouseMove={(e) => setTooltipMousePos({ x: e.clientX, y: e.clientY })}
                          onMouseLeave={() => setHoveredTooltipItem(null)}
                          style={{ width: '70px', height: '70px', background: 'rgba(139,92,246,0.1)', border: haveMat > 0 ? '1px solid #10B981' : '1px dashed #8b5cf6', borderRadius: '10px', display: 'flex', justifyContent: 'center', alignItems: 'center', position: 'relative', cursor: matId ? 'pointer' : 'default' }}
                        >
                          {matImg ? (
                            <img src={matImg} alt={matTitle} style={{ width: '40px', height: '40px', objectFit: 'contain' }} />
                          ) : (
                            <span style={{ color: '#8b5cf6', fontSize: '0.6rem', textAlign: 'center', padding: '0.3rem' }}>{matId ? 'Material' : `Ingred. ${matIdx + 1}`}</span>
                          )}
                          {matId && (
                            <div style={{ position: 'absolute', top: '-6px', right: '-6px', background: haveMat > 0 ? '#10B981' : '#ef4444', color: 'white', fontSize: '0.6rem', fontWeight: 'bold', padding: '1px 4px', borderRadius: '4px' }}>{haveMat > 0 ? `x${haveMat}` : 'FALTA'}</div>
                          )}
                        </div>
                      );
                    })}
                    <span style={{ color: '#aaa', fontSize: '0.7rem', fontWeight: 'bold' }}>INGREDIENTES</span>
                  </div>

                  <span style={{ color: '#8b5cf6', fontSize: '2rem' }}>→</span>

                  {/* Slot 4 – Resultado (Item Transmutado) */}
                  {(() => {
                    const resultId = selectedTransmuteItem?.transmuteConfig?.resultItemId;
                    const resultItemInfo = resultId ? materialCatalog[resultId] : null;
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem' }}>
                        <div 
                          onMouseEnter={() => resultItemInfo && setHoveredTooltipItem(resultItemInfo)}
                          onMouseMove={(e) => setTooltipMousePos({ x: e.clientX, y: e.clientY })}
                          onMouseLeave={() => setHoveredTooltipItem(null)}
                          style={{ width: '90px', height: '90px', background: 'rgba(139,92,246,0.15)', border: `2px solid ${resultItemInfo ? '#a855f7' : '#555'}`, borderRadius: '12px', display: 'flex', justifyContent: 'center', alignItems: 'center', position: 'relative', boxShadow: resultItemInfo ? '0 0 16px rgba(168,85,247,0.4)' : 'none', cursor: resultItemInfo ? 'pointer' : 'default' }}
                        >
                          {resultItemInfo ? (
                            <>
                              {resultItemInfo.imageUrl ? (
                                <img src={resultItemInfo.imageUrl} alt={resultItemInfo.title} style={{ width: '70px', height: '70px', objectFit: 'contain' }} />
                              ) : (
                                <Sparkles size={36} color="#c084fc" />
                              )}
                              <div style={{ position: 'absolute', bottom: '-6px', background: 'rgba(168,85,247,0.95)', color: 'white', fontSize: '0.6rem', fontWeight: 'bold', padding: '1px 6px', borderRadius: '4px' }}>
                                Transmutado
                              </div>
                            </>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.2rem', color: '#555' }}>
                              <Sparkles size={30} style={{ opacity: 0.5 }} />
                              <span style={{ fontSize: '0.6rem', textAlign: 'center' }}>Resultado</span>
                            </div>
                          )}
                        </div>
                        <span style={{ color: resultItemInfo ? '#c084fc' : '#aaa', fontSize: '0.7rem', fontWeight: 'bold', maxWidth: '100px', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {resultItemInfo ? resultItemInfo.title : 'TRANSMUTADO'}
                        </span>
                      </div>
                    );
                  })()}

                </div>

                {!selectedTransmuteItem ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', color: 'var(--text-secondary)', gap: '0.5rem', marginTop: '1rem' }}>
                    <Sparkles size={48} style={{ opacity: 0.2 }} />
                    <p style={{ textAlign: 'center' }}>Selecione um equipamento +9 transmutável no inventário à esquerda para iniciar o ritual.</p>
                  </div>
                ) : (() => {
                  const resultId = selectedTransmuteItem.transmuteConfig?.resultItemId;
                  const resultItemInfo = resultId ? materialCatalog[resultId] : null;
                  const resultMinRankIndex = resultItemInfo ? getMinRankIndex(resultItemInfo.minRankRequired) : 0;
                  const meetsRankForResult = isStaff || currentRankIndex >= resultMinRankIndex;
                  const coinsCost = selectedTransmuteItem.transmuteConfig?.coinsCost || 0;
                  const hasCoins = isStaff || (userData.coins || 0) >= coinsCost;
                  const requiredMats = (selectedTransmuteItem.transmuteConfig?.materials || []).filter(Boolean);
                  const hasAllMats = requiredMats.every((id: string) => consumables.filter(c => c.itemId === id).reduce((s, c) => s + (c.quantity || 1), 0) > 0);

                  let buttonLabel = 'INICIAR RITUAL DE TRANSMUTAÇÃO';
                  if (!resultId) {
                    buttonLabel = 'ITEM RESULTADO NÃO CONFIGURADO';
                  } else if (!meetsRankForResult) {
                    buttonLabel = `PATENTE INSUFICIENTE (REQUER ${resolveMinRankName(resultItemInfo?.minRankRequired)?.toUpperCase() || 'SUPERIOR'})`;
                  } else if (!hasCoins) {
                    buttonLabel = 'MOEDAS INSUFICIENTES';
                  } else if (!hasAllMats) {
                    buttonLabel = 'MATERIAIS INSUFICIENTES';
                  } else if (isForging) {
                    buttonLabel = 'TRANSMUTANDO...';
                  }

                  const canSubmit = !isForging && meetsRankForResult && hasCoins && hasAllMats && !!resultId;

                  return (
                    <div style={{ width: '100%', maxWidth: '440px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      <div style={{ background: 'rgba(0,0,0,0.3)', padding: '1rem 1.5rem', borderRadius: '12px', border: '1px solid rgba(139,92,246,0.3)' }}>
                        <h4 style={{ color: 'white', margin: '0 0 0.75rem 0', fontSize: '1rem', textAlign: 'center' }}>{selectedTransmuteItem.itemTitle}</h4>
                        
                        {resultItemInfo && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#aaa', fontSize: '0.9rem', marginBottom: '0.4rem' }}>
                            <span>Item Resultado:</span>
                            <span style={{ color: '#c084fc', fontWeight: 'bold' }}>{resultItemInfo.title}</span>
                          </div>
                        )}

                        {resultItemInfo?.minRankRequired && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#aaa', fontSize: '0.9rem', marginBottom: '0.4rem' }}>
                            <span>Patente do Resultado:</span>
                            <span style={{ color: meetsRankForResult ? '#10B981' : '#ef4444', fontWeight: 'bold' }}>
                              {resolveMinRankName(resultItemInfo.minRankRequired) || 'Sem Patente'} {meetsRankForResult ? '✓' : '(Bloqueado)'}
                            </span>
                          </div>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#aaa', fontSize: '0.9rem', marginBottom: '0.4rem' }}>
                          <span>Custo:</span>
                          <span style={{ color: hasCoins ? 'var(--gold-primary)' : '#ef4444', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            {coinUrl ? <CachedImage src={coinUrl} alt="Moeda" style={{ width: 18, height: 18, objectFit: 'contain' }} /> : null}
                            {coinsCost} Moedas {hasCoins ? '' : '(Insuficiente)'}
                          </span>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#aaa', fontSize: '0.9rem' }}>
                          <span>Chance de Sucesso:</span>
                          <span style={{ color: '#10B981', fontWeight: 'bold' }}>{selectedTransmuteItem.transmuteConfig?.successChance || 25}%</span>
                        </div>
                      </div>

                      <button
                        onClick={handleTransmute}
                        disabled={!canSubmit}
                        style={{
                          width: '100%',
                          padding: '1.2rem',
                          background: canSubmit ? 'linear-gradient(to right, #8b5cf6, #c084fc)' : 'rgba(120,120,120,0.35)',
                          color: canSubmit ? 'white' : '#999',
                          border: 'none',
                          borderRadius: '12px',
                          fontSize: '1rem',
                          fontWeight: 'bold',
                          cursor: canSubmit ? 'pointer' : 'not-allowed',
                          display: 'flex',
                          justifyContent: 'center',
                          alignItems: 'center',
                          gap: '0.5rem',
                          boxShadow: canSubmit ? '0 4px 15px rgba(139, 92, 246, 0.35)' : 'none',
                          opacity: canSubmit ? 1 : 0.7
                        }}
                      >
                        <Sparkles size={22} className={isForging ? "animate-pulse" : ""} /> {buttonLabel}
                      </button>
                    </div>
                  );
                })()}
              </>
            )}

          </div>
        </div>

      {/* Tooltip Portal */}
      {hoveredTooltipItem && (
        <ItemTooltip 
          item={hoveredTooltipItem} 
          mousePos={tooltipMousePos} 
        />
      )}
    </div>
  );
}
