// @ts-ignore
import React, { useState, useEffect, useRef } from 'react';

declare global {
  interface Window {
    Sketchfab: any;
  }
}
import { supabase } from '../lib/supabase';
// @ts-ignore
import { X, Hammer, ShieldAlert, Sparkles, Coins, Lock, CheckCircle2, AlertTriangle, ArrowRight } from 'lucide-react';
import CachedImage from './CachedImage';
// @ts-ignore
import { useTenant } from '../contexts/TenantContext';
// @ts-ignore
import { calculateTotalStats } from '../lib/gacha';
// @ts-ignore
import { forgeStrengthFraction, forgeAttributeValue, forgeAttributeValueWithConfig, nextForgeCost, nextForgeCostWithConfig, forgeSuccessChance, MAX_FORGE_LEVEL, forgeItemName } from '../lib/forge';
import { useDialog } from '../contexts/DialogContext';

interface BlacksmithModalProps {
  userData: any;
  currentRankIndex: number;
  onClose: () => void;
  onSuccess: () => void;
}

export default function BlacksmithModal({ userData, currentRankIndex, onClose, onSuccess }: BlacksmithModalProps) {
  const { showConfirm, showToast } = useDialog();
  const [activeTab, setActiveTab] = useState<'forge' | 'transmute'>('forge');
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Forge State
  const [selectedForgeItem, setSelectedForgeItem] = useState<any | null>(null);
  const [useScroll, setUseScroll] = useState(false);
  const [scrollCount, setScrollCount] = useState(0);
  
  // Transmute State
  const [selectedTransmuteItem, setSelectedTransmuteItem] = useState<any | null>(null);
  const [consumables, setConsumables] = useState<any[]>([]);
  
  // Sketchfab State
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [sketchfabApi, setSketchfabApi] = useState<any>(null);
  const [isForging, setIsForging] = useState(false);

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
            setSketchfabApi(api);
          });
        },
        error: function onError() {
          console.error('Sketchfab API error');
        },
        autostart: 1,
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
        transparent: 1
      });
    }
  }, []);
  
  const isTransmuteUnlocked = currentRankIndex >= 11; // 11 = Diamante I

  const fetchItems = async () => {
    setLoading(true);
    const { data: userItemsSnap } = await supabase
      .from('user_items')
      .select('id, equipped, data')
      .eq('student_id', userData.uid);

    let parsedItems = [];
    let scrollAmt = 0;
    let consumables: any[] = [];
    
    if (userItemsSnap) {
      const itemIds = userItemsSnap.map((r: any) => r.item_id).filter(Boolean);
      let priceMap: Record<string, number> = {};
      if (itemIds.length > 0) {
        const { data: storeSnap } = await supabase.from('store_items').select('id, price').in('id', itemIds);
        (storeSnap || []).forEach((s: any) => { priceMap[s.id] = s.price || 0; });
      }
      for (const row of userItemsSnap) {
        const itemData = row.data as any;
        if (itemData.gameEffect === 'blacksmith_scroll') {
          scrollAmt += itemData.quantity || 1;
        } else if (itemData.itemType === 'equippable') {
          parsedItems.push({
            docId: row.id,
            itemId: row.item_id,
            ...itemData,
            cost: priceMap[row.item_id] || itemData.cost || itemData.price || 100,
            equipped: row.equipped,
            forgeLevel: itemData.forgeLevel || 0
          });
        } else if (itemData.itemType === 'consumable' || itemData.itemType === 'other') {
          consumables.push({ docId: row.id, itemId: row.item_id, quantity: itemData.quantity || 1, itemTitle: itemData.itemTitle, itemImageUrl: itemData.itemImageUrl || '' });
        }
      }
    }
    setItems(parsedItems);
    setConsumables(consumables);
    setScrollCount(scrollAmt);
    
    // Refresh selections if needed
    if (selectedForgeItem) {
      const refreshed = parsedItems.find(i => i.docId === selectedForgeItem.docId);
      setSelectedForgeItem(refreshed || null);
    }
    if (selectedTransmuteItem) {
      const refreshed = parsedItems.find(i => i.docId === selectedTransmuteItem.docId);
      setSelectedTransmuteItem(refreshed || null);
    }
    
    setLoading(false);
  };

  useEffect(() => {
    fetchItems();
  }, []);

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
    const finalChance = useScroll ? 100 : forgeSuccessChance(nextLevel, selectedForgeItem.forgeConfig);
    
    if (userData.coins < cost) {
      showToast(`Você não tem moedas suficientes! Custo: ${cost}`, 'error');
      return;
    }
    if (useScroll && scrollCount <= 0) {
      showToast("Você não possui Pergaminho do Ferreiro!", 'error');
      return;
    }

    const confirmMsg = `Deseja forjar este item para +${nextLevel}?\nCusto: ${cost} moedas\nChance: ${Math.min(100, finalChance)}%\n${useScroll ? 'Pergaminho ativo: O item será protegido em caso de falha.' : 'AVISO: O item SERÁ DESTRUÍDO se a forja falhar!'}`;
    if (!await showConfirm(confirmMsg)) return;

    // Deduct coins
    await supabase.from('users').update({ coins: userData.coins - cost }).eq('uid', userData.uid);
    
    // Deduct scroll if used
    if (useScroll) {
      const { data: scrollItem } = await supabase.from('user_items').select('*').eq('student_id', userData.uid).filter('data->>gameEffect', 'eq', 'blacksmith_scroll').limit(1).single();
      if (scrollItem) {
        const currentData = scrollItem.data as any;
        if (currentData.quantity > 1) {
          await supabase.from('user_items').update({ data: { ...currentData, quantity: currentData.quantity - 1 } }).eq('id', scrollItem.id);
        } else {
          await supabase.from('user_items').delete().eq('id', scrollItem.id);
        }
      }
    }

    const isSuccess = (Math.random() * 100) <= finalChance;
    
    setIsForging(true);
    if (sketchfabApi) sketchfabApi.play();
    await new Promise(r => setTimeout(r, 2500));
    if (sketchfabApi) sketchfabApi.pause();
    setIsForging(false);
    
    if (isSuccess) {
      showToast("🔥 SUCESSO! O item foi forjado!", 'success');
      await supabase.from('user_items').update({
        data: {
          ...selectedForgeItem,
          forgeLevel: nextLevel
        }
      }).eq('id', selectedForgeItem.docId);
    } else {
      if (useScroll) {
        showToast("❌ FALHA! A forja falhou, mas o Pergaminho do Ferreiro protegeu o item da destruição.", 'error');
      } else {
        showToast("💥 QUEBROU! A forja falhou e o item foi destruído nas chamas!", 'error');
        await supabase.from('user_items').delete().eq('id', selectedForgeItem.docId);
        setSelectedForgeItem(null);
      }
    }
    
    fetchItems();
    onSuccess();
  };

  const handleTransmute = async () => {
    if (!selectedTransmuteItem) return;
    const config = selectedTransmuteItem.transmuteConfig;
    if (!config || !config.resultItemId) {
      showToast("Este item não possui configuração de transmutação.", 'error');
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
    if (userData.coins < (config.coinsCost || 0)) {
      showToast(`Você não tem moedas suficientes! Custo: ${config.coinsCost}`, 'error');
      return;
    }

    const confirmMsg = `Deseja tentar transmutar este item?\nChance de Sucesso: ${config.successChance}%\nCusto: ${config.coinsCost} moedas\nConsome ${requiredMats.length} material(is).\nSe falhar, o item voltará para o +8!`;
    if (!await showConfirm(confirmMsg)) return;

    const isSuccess = (Math.random() * 100) <= (config.successChance || 25);

    // Consome moedas e materiais (sucesso E falha consomem os materiais)
    if (config.coinsCost) {
      await supabase.from('users').update({ coins: userData.coins - (config.coinsCost || 0) }).eq('uid', userData.uid);
    }
    for (const matId of requiredMats) {
      const mat = consumables.find(c => c.itemId === matId && (c.quantity || 1) > 0);
      if (!mat) continue;
      if (mat.quantity > 1) {
        await supabase.from('user_items').update({ data: { ...(mat as any).data, quantity: mat.quantity - 1 } }).eq('id', mat.docId);
      } else {
        await supabase.from('user_items').delete().eq('id', mat.docId);
      }
    }

    if (isSuccess) {
      showToast("✨ SUCESSO ESPETACULAR! O item foi transmutado para uma nova forma!", 'success');
      // Fetch result item store data
      const { data: storeSnap } = await supabase.from('store_items').select('data').eq('id', config.resultItemId).single();
      if (storeSnap) {
        const storeItem = storeSnap.data as any;
        const newItemData = {
          ...selectedTransmuteItem,
          itemId: storeItem.id,
          itemTitle: storeItem.title,
          itemImageUrl: storeItem.imageUrl || '',
          gameEffect: storeItem.gameEffect || 'none',
          gameModelUrl: storeItem.gameModelUrl || '',
          modelTextureUrl: storeItem.modelTextureUrl || '',
          minecraftHeadValue: storeItem.minecraftHeadValue || '',
          avatarPart: storeItem.avatarPart || null,
          itemCategory: storeItem.itemCategory || 'none',
          baseAttributeType: storeItem.baseAttributeType || 'none',
          baseAttributeValue: storeItem.baseAttributeValue || 0,
          modelTransforms: storeItem.modelTransforms || null,
          forgeLevel: 0,
          isForgeable: storeItem.isForgeable,
          forgeConfig: storeItem.forgeConfig,
          isTransmutable: storeItem.isTransmutable,
          isTransmuted: storeItem.isTransmuted || false,
          transmuteConfig: storeItem.transmuteConfig,
          adds: []
        };
        await supabase.from('user_items').update({ data: newItemData }).eq('id', selectedTransmuteItem.docId);
      }
    } else {
      showToast("❌ FALHA! A energia se dissipou e o item caiu para o nível +8.", 'error');
      await supabase.from('user_items').update({
        data: {
          ...selectedTransmuteItem,
          forgeLevel: 8
        }
      }).eq('id', selectedTransmuteItem.docId);
    }
    
    fetchItems();
    onSuccess();
  };
  const forgeableItems = items.filter(item => {
    // items are spread: item.itemType === 'equippable', item.forgeLevel, etc.
    const isEquip = item.itemType === 'equippable';
    const notMaxed = (item.forgeLevel || 0) < 9;
    return isEquip && notMaxed;
  });

  const transmutableItems = items.filter(item => {
    const isEquip = item.itemType === 'equippable';
    const isMaxed = (item.forgeLevel || 0) === 9;
    return isEquip && isMaxed;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, background: '#1a1a1a', overflow: 'hidden', height: '100%' }}>

        {/* Tabs */}
        <div style={{ display: 'flex', background: 'rgba(0,0,0,0.5)', borderBottom: '1px solid var(--border-glass)', flexShrink: 0 }}>
          <button 
            onClick={() => setActiveTab('forge')}
            style={{ flex: 1, padding: '1rem', background: activeTab === 'forge' ? 'var(--gold-primary)' : 'transparent', color: activeTab === 'forge' ? 'black' : 'white', border: 'none', cursor: 'pointer', fontWeight: 'bold', fontSize: '1.1rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }}
          >
            <Hammer size={20} /> Forja (+1 a +9)
          </button>
          <button 
            onClick={() => isTransmuteUnlocked && setActiveTab('transmute')}
            style={{ flex: 1, padding: '1rem', background: activeTab === 'transmute' ? 'var(--gold-primary)' : 'transparent', color: activeTab === 'transmute' ? 'black' : isTransmuteUnlocked ? 'white' : '#666', border: 'none', cursor: isTransmuteUnlocked ? 'pointer' : 'not-allowed', fontWeight: 'bold', fontSize: '1.1rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }}
          >
            {isTransmuteUnlocked ? <Sparkles size={20} /> : <Lock size={20} />} 
            Transmutação (Requer Diamante I)
          </button>
        </div>

        {/* Content */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          
          {/* Left Side: Sketchfab & Inventory */}
          <div style={{ width: '40%', display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border-glass)', background: 'var(--bg-dark)' }}>
            
            {activeTab === 'forge' && (
              /* Sketchfab Embed */
              <div style={{ height: '300px', background: 'black', position: 'relative', overflow: 'hidden', pointerEvents: 'none' }}>
                <div className="sketchfab-embed-wrapper" style={{ position: 'absolute', top: '-65px', bottom: '-65px', left: '-10px', right: '-10px' }}>
                  <iframe ref={iframeRef} title="Blacksmith and his anvil" frameBorder="0" allowFullScreen allow="autoplay; fullscreen; xr-spatial-tracking" style={{ width: '100%', height: '100%', border: 'none' }}> </iframe>
                </div>
              </div>
            )}


            {/* Inventory List */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
              <h3 style={{ color: 'var(--text-secondary)', marginBottom: '1rem', fontSize: '1rem' }}>Seus Equipamentos</h3>
              
              {loading ? (
                <p style={{ color: 'white', textAlign: 'center' }}>Carregando...</p>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(70px, 1fr))', gap: '0.5rem' }}>
                  {(activeTab === 'forge' ? forgeableItems : transmutableItems).map((item, idx) => {
                    const isSelected = activeTab === 'forge' ? selectedForgeItem?.docId === item.docId : selectedTransmuteItem?.docId === item.docId;
                    return (
                      <div 
                        key={idx}
                        onClick={() => activeTab === 'forge' ? setSelectedForgeItem(item) : setSelectedTransmuteItem(item)}
                        style={{ 
                          width: '70px', height: '70px', background: isSelected ? 'rgba(255, 215, 0, 0.2)' : 'rgba(0,0,0,0.5)', 
                          border: isSelected ? '2px solid var(--gold-primary)' : '1px solid var(--border-glass)',
                          borderRadius: '8px', cursor: 'pointer', position: 'relative',
                          display: 'flex', justifyContent: 'center', alignItems: 'center'
                        }}
                      >
                        {item.itemImageUrl ? <CachedImage src={item.itemImageUrl} alt={item.itemTitle} style={{ width: '50px', height: '50px', objectFit: 'contain' }} /> : <Hammer size={30} color="gray" />}
                        {item.forgeLevel > 0 && (
                          <div style={{ position: 'absolute', top: '-5px', right: '-5px', background: 'var(--accent-red)', color: 'white', fontSize: '0.7rem', fontWeight: 'bold', padding: '2px 4px', borderRadius: '4px' }}>
                            +{item.forgeLevel}
                          </div>
                        )}
                        {item.equipped && (
                          <div style={{ position: 'absolute', bottom: '2px', fontSize: '0.6rem', color: 'var(--gold-primary)', fontWeight: 'bold', background: 'rgba(0,0,0,0.7)', padding: '2px 4px', borderRadius: '4px' }}>
                            Eqp
                          </div>
                        )}
                      </div>
                    )
                  })}
                  
                  {(activeTab === 'forge' ? forgeableItems : transmutableItems).length === 0 && (
                    <p style={{ gridColumn: '1 / -1', color: 'gray', textAlign: 'center', padding: '2rem 0' }}>Nenhum item elegível encontrado.</p>
                  )}
                </div>
              )}
            </div>

          </div>

          {/* Right Side: Action Panel */}
          <div style={{ flex: 1, padding: '2rem', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
            
            {activeTab === 'forge' && (
              <>
                <h3 style={{ color: 'var(--gold-primary)', fontSize: '1.5rem', marginBottom: '1rem', borderBottom: '1px solid var(--border-glass)', paddingBottom: '0.5rem' }}>Bigorna de Forja</h3>
                
                {!selectedForgeItem ? (
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', color: 'var(--text-secondary)' }}>
                    <Hammer size={64} style={{ opacity: 0.2, marginBottom: '1rem' }} />
                    <p>Selecione um equipamento no inventário à esquerda para forjá-lo.</p>
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
                      const nextChance = useScroll ? 100 : forgeSuccessChance(curLevel + 1, selectedForgeItem.forgeConfig);
                      return (
                        <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', background: 'rgba(0,0,0,0.3)', padding: '1.5rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)' }}>
                        <div style={{ width: '100px', height: '100px', background: 'black', borderRadius: '12px', display: 'flex', justifyContent: 'center', alignItems: 'center', border: '2px solid #555', position: 'relative' }}>
                          {selectedForgeItem.itemImageUrl && <CachedImage src={selectedForgeItem.itemImageUrl} alt={selectedForgeItem.itemTitle} style={{ width: '80px', height: '80px', objectFit: 'contain' }} />}
                          {curLevel > 0 && (
                            <div style={{ position: 'absolute', top: '-10px', right: '-10px', background: 'var(--accent-red)', color: 'white', fontSize: '1.2rem', fontWeight: 'bold', padding: '4px 8px', borderRadius: '6px', border: '2px solid black' }}>
                              +{curLevel}
                            </div>
                          )}
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
                        <div style={{ background: 'rgba(239, 68, 68, 0.1)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                          <h4 style={{ color: 'var(--accent-red)', margin: '0 0 0.5rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><ShieldAlert size={18} /> Proteção do Item</h4>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'white', cursor: 'pointer' }}>
                            <input type="checkbox" checked={useScroll} onChange={e => setUseScroll(e.target.checked)} style={{ width: '20px', height: '20px' }} />
                            Usar Pergaminho do Ferreiro (Você tem {scrollCount})
                          </label>
                          <p style={{ color: '#aaa', fontSize: '0.85rem', margin: '0.5rem 0 0 0', paddingLeft: '28px' }}>
                            Garante sucesso de 100% e evita que o item seja destruído em caso de falha (consome 1 pergaminho).
                          </p>
                        </div>
                      )}

                      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.5)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-glass)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'white', fontSize: '1.2rem', fontWeight: 'bold' }}>
                            <Coins size={24} color="var(--gold-primary)" /> {nextCost} Moedas
                          </div>
                          <div style={{ color: 'white', fontSize: '1.2rem' }}>
                            Chance: <strong style={{ color: useScroll ? '#10B981' : 'white' }}>
                              {nextChance}%
                            </strong>
                          </div>
                        </div>

                        <button 
                          onClick={handleForge}
                          disabled={userData.coins < nextCost || isForging}
                          style={{ width: '100%', padding: '1.2rem', background: 'linear-gradient(to right, #ea580c, #dc2626)', color: 'white', border: 'none', borderRadius: '12px', fontSize: '1.2rem', fontWeight: 'bold', cursor: isForging ? 'not-allowed' : 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', boxShadow: '0 4px 15px rgba(220, 38, 38, 0.3)', opacity: isForging ? 0.5 : 1 }}
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
                    <div style={{ width: '90px', height: '90px', background: 'rgba(0,0,0,0.7)', border: `2px solid ${selectedTransmuteItem ? 'var(--gold-primary)' : '#555'}`, borderRadius: '12px', display: 'flex', justifyContent: 'center', alignItems: 'center', position: 'relative', boxShadow: selectedTransmuteItem ? '0 0 16px rgba(255,215,0,0.4)' : 'none' }}>
                      {selectedTransmuteItem ? (
                        <>
                          <img src={selectedTransmuteItem.itemImageUrl} alt={selectedTransmuteItem.itemTitle} style={{ width: '70px', height: '70px', objectFit: 'contain' }} />
                          <div style={{ position: 'absolute', top: '-8px', right: '-8px', background: 'var(--accent-red)', color: 'white', fontSize: '0.75rem', fontWeight: 'bold', padding: '2px 5px', borderRadius: '4px' }}>+9</div>
                        </>
                      ) : (
                        <span style={{ color: '#555', fontSize: '0.65rem', textAlign: 'center', padding: '0.3rem' }}>Item +9</span>
                      )}
                    </div>
                    <span style={{ color: '#aaa', fontSize: '0.7rem', fontWeight: 'bold' }}>ITEM</span>
                  </div>

                  <span style={{ color: '#8b5cf6', fontSize: '1.5rem', fontWeight: 'bold' }}>+</span>

                  {/* Slots 2 & 3 – Ingredientes (materiais exigidos pelo ritual) */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'center' }}>
                    {[0, 1].map(matIdx => {
                      const matId = selectedTransmuteItem?.transmuteConfig?.materials?.[matIdx];
                      const haveMat = matId ? consumables.filter(c => c.itemId === matId).reduce((s, c) => s + (c.quantity || 1), 0) : 0;
                      const matTitle = matId ? (consumables.find(c => c.itemId === matId)?.itemTitle || 'Material') : 'Material';
                      return (
                        <div key={matIdx} style={{ width: '70px', height: '70px', background: 'rgba(139,92,246,0.1)', border: haveMat > 0 ? '1px solid #10B981' : '1px dashed #8b5cf6', borderRadius: '10px', display: 'flex', justifyContent: 'center', alignItems: 'center', position: 'relative' }}>
                          {consumables.find(c => c.itemId === matId)?.itemImageUrl ? (
                            <img src={consumables.find(c => c.itemId === matId)!.itemImageUrl} alt={matTitle} style={{ width: '40px', height: '40px', objectFit: 'contain' }} />
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

                  {/* Slot 4 – Resultado */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem' }}>
                    <div style={{ width: '90px', height: '90px', background: 'rgba(139,92,246,0.15)', border: '2px solid #8b5cf6', borderRadius: '12px', display: 'flex', justifyContent: 'center', alignItems: 'center', position: 'relative', boxShadow: '0 0 16px rgba(139,92,246,0.3)' }}>
                      {selectedTransmuteItem?.transmuteConfig?.resultItemId ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.2rem' }}>
                          <Sparkles size={32} color="#8b5cf6" style={{ opacity: 0.7 }} />
                          <span style={{ color: '#8b5cf6', fontSize: '0.6rem', textAlign: 'center' }}>Configurado</span>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.2rem' }}>
                          <Sparkles size={32} color="#555" />
                          <span style={{ color: '#555', fontSize: '0.6rem', textAlign: 'center' }}>Não config.</span>
                        </div>
                      )}
                    </div>
                    <span style={{ color: '#aaa', fontSize: '0.7rem', fontWeight: 'bold' }}>RESULTADO</span>
                  </div>

                </div>

                {!selectedTransmuteItem ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', color: 'var(--text-secondary)', gap: '0.5rem', marginTop: '1rem' }}>
                    <Sparkles size={48} style={{ opacity: 0.2 }} />
                    <p style={{ textAlign: 'center' }}>Selecione um equipamento +9 no inventário à esquerda para iniciar o ritual.</p>
                  </div>
                ) : (
                  <div style={{ width: '100%', maxWidth: '440px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div style={{ background: 'rgba(0,0,0,0.3)', padding: '1rem 1.5rem', borderRadius: '12px', border: '1px solid rgba(139,92,246,0.3)' }}>
                      <h4 style={{ color: 'white', margin: '0 0 0.75rem 0', fontSize: '1rem', textAlign: 'center' }}>{selectedTransmuteItem.itemTitle}</h4>
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: '#aaa', fontSize: '0.9rem', marginBottom: '0.4rem' }}>
                        <span>Custo:</span>
                        <span style={{ color: 'var(--gold-primary)', fontWeight: 'bold' }}>{selectedTransmuteItem.transmuteConfig?.coinsCost || 0} Moedas</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: '#aaa', fontSize: '0.9rem' }}>
                        <span>Chance de Sucesso:</span>
                        <span style={{ color: '#10B981', fontWeight: 'bold' }}>{selectedTransmuteItem.transmuteConfig?.successChance || 25}%</span>
                      </div>
                    </div>
                    <button
                      onClick={handleTransmute}
                      disabled={isForging || userData.coins < (selectedTransmuteItem.transmuteConfig?.coinsCost || 0) || (selectedTransmuteItem.transmuteConfig?.materials || []).filter(Boolean).some(id => consumables.filter(c => c.itemId === id).reduce((s, c) => s + (c.quantity || 1), 0) <= 0)}
                      style={{ width: '100%', padding: '1.2rem', background: 'linear-gradient(to right, #8b5cf6, #c084fc)', color: 'white', border: 'none', borderRadius: '12px', fontSize: '1.1rem', fontWeight: 'bold', cursor: isForging ? 'not-allowed' : 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', boxShadow: '0 4px 15px rgba(139, 92, 246, 0.3)', opacity: isForging ? 0.5 : 1 }}
                    >
                      <Sparkles size={22} className={isForging ? "animate-pulse" : ""} /> {isForging ? 'TRANSMUTANDO...' : 'INICIAR RITUAL DE TRANSMUTAÇÃO'}
                    </button>
                  </div>
                )}
              </>
            )}

          </div>
        </div>
    </div>
  );
}
