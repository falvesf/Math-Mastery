import { createPortal } from 'react-dom';
import { ATTRIBUTE_LABELS, type AttributeType, getAddEffectiveValue } from '../lib/gacha';
import { DAMAGE_EFFECTS, EFFECT_ADD_LABELS, isEffectAddType, orderEffectFirst } from '../lib/damageEffects';
// @ts-ignore
import { forgeAttributeValue, forgeAttributeValueWithConfig, forgeItemName } from '../lib/forge';

export const RARITY_COLORS: Record<string, string> = {
  common: '#9ca3af',
  uncommon: '#10b981',
  rare: '#3b82f6',
  epic: '#8b5cf6',
  legendary: '#f59e0b',
  mestre: '#ef4444'
};

export const CATEGORY_LABELS: Record<string, string> = {
  weapon: 'Arma',
  shield: 'Escudo',
  armor: 'Armadura',
  helmet: 'Capacete',
  boots: 'Botas',
  accessory: 'Acessório',
  pet: 'Pet',
  mount: 'Montaria'
};

const getRarityLabel = (rarity?: string) => {
  const r = rarity || 'common';
  const labels: Record<string, string> = {
    common: 'Comum',
    uncommon: 'Incomum',
    rare: 'Raro',
    epic: 'Épico',
    legendary: 'Lendário',
    mestre: 'Mestre'
  };
  return labels[r] || 'Comum';
};

export interface TooltipItemData {
  id?: string;
  title: string;
  type?: 'consumable' | 'equippable' | 'other' | 'ranch';
  rarity?: string;
  itemCategory?: string;
  description?: string;
  baseAttributeType?: string;
  baseAttributeValue?: number;
  gameEffect?: string;
  hpCooldownReductionMinutes?: number;
  damageEffect?: string;
  damageEffectMin?: number;
  damageEffectMax?: number;
  fixedAttributes?: any[];
  adds?: any[];
  unlockedSkinId?: string;
  forgeLevel?: number;
  forgeConfig?: any;
  scrollChanceBonus?: number;
  breakMinQty?: number;
  breakMaxQty?: number;
  fuseRequiredQty?: number;
  fuseResultQty?: number;
  breakSuccessChance?: number;
  fuseSuccessChance?: number;
}

export function normalizeItemForTooltip(item: any): TooltipItemData {
  const d = item.data || {};
  return {
    id: item.id || item.itemId || d.id,
    title: (item.title || item.itemTitle || item.name || d.title || d.itemTitle || d.name || 'Item Desconhecido').trim(),
    type: item.type || item.itemType || d.type || d.itemType,
    forgeLevel: item.forgeLevel ?? d.forgeLevel,
    forgeConfig: item.forgeConfig || d.forgeConfig,
    rarity: item.rarity || d.rarity,
    itemCategory: item.itemCategory || d.itemCategory || item.avatarPart || d.avatarPart,
    description: item.description || item.desc || item.itemDescription || d.description || d.itemDescription,
    baseAttributeType: item.baseAttributeType || d.baseAttributeType,
    baseAttributeValue: item.baseAttributeValue ?? d.baseAttributeValue,
    gameEffect: item.gameEffect || d.gameEffect,
    hpCooldownReductionMinutes: item.hpCooldownReductionMinutes ?? d.hpCooldownReductionMinutes,
    damageEffect: item.damageEffect || d.damageEffect,
    damageEffectMin: item.damageEffectMin ?? d.damageEffectMin,
    damageEffectMax: item.damageEffectMax ?? d.damageEffectMax,
    fixedAttributes: item.fixedAttributes || d.fixedAttributes || [],
    adds: item.adds || d.adds || [],
    unlockedSkinId: item.unlockedSkinId || d.unlockedSkinId,
    scrollChanceBonus: item.scrollChanceBonus ?? d.scrollChanceBonus,
    breakMinQty: item.breakMinQty ?? d.breakMinQty,
    breakMaxQty: item.breakMaxQty ?? d.breakMaxQty,
    fuseRequiredQty: item.fuseRequiredQty ?? d.fuseRequiredQty,
    fuseResultQty: item.fuseResultQty ?? d.fuseResultQty,
    breakSuccessChance: item.breakSuccessChance ?? d.breakSuccessChance,
    fuseSuccessChance: item.fuseSuccessChance ?? d.fuseSuccessChance,
  };
}

export interface ItemTooltipProps {
  item: any;
  mousePos: { x: number; y: number };
}

export default function ItemTooltip({ item: rawItem, mousePos }: ItemTooltipProps) {
  if (!rawItem) return null;

  const item = normalizeItemForTooltip(rawItem);
  const rColor = RARITY_COLORS[item.rarity || 'common'] || '#9ca3af';
  const baseAttr = item.baseAttributeType && item.baseAttributeType !== 'none' && ATTRIBUTE_LABELS[item.baseAttributeType as AttributeType]
    ? ATTRIBUTE_LABELS[item.baseAttributeType as AttributeType]
    : null;
  const mainStatPct = baseAttr && ['xp','coins','vitality','fortitude','persuasion'].includes(item.baseAttributeType || '');
  const consumableDesc = item.gameEffect === 'restore_hp' ? 'Restaura todos os pontos de vida.' :
    item.gameEffect === 'heal_1_hp' ? 'Recupera 1 coração de vida.' :
    item.gameEffect === 'cure_bleed' ? 'Estanca o sangramento ativo no personagem.' :
    item.gameEffect === 'cure_poison' ? 'Cura o envenenamento ativo no personagem.' :
    item.gameEffect === 'cure_freeze' ? 'Descongela o personagem.' :
    item.gameEffect === 'cure_burn' ? 'Apaga o fogo ativo no personagem.' :
    item.gameEffect === 'cure_electric' ? 'Elimina o choque elétrico ativo no personagem.' :
    item.gameEffect === 'reduce_hp_cooldown' ? `Acelera a recarga de vida: -${item.hpCooldownReductionMinutes || 10} min por coração.` :
    item.gameEffect === 'add_attribute' ? 'Adiciona um novo atributo aleatório a um equipamento.' :
    item.gameEffect === 'remove_attribute' ? 'Remove um atributo negativo de um equipamento.' :
    item.gameEffect === 'reroll_attributes' ? 'Sorteia novamente todos os atributos extras de um equipamento.' :
    item.gameEffect === 'unlock_skin' ? 'Desbloqueia uma skin para usar no personagem.' :
    item.gameEffect === 'bazar_sale_permit' ? 'Licença para vender itens no bazar.' :
    item.gameEffect === 'ranch_license' ? 'Licença do Rancho: desbloqueia o rancho, a criação de animais e os itens de rancho na loja.' :
    item.gameEffect === 'inventory_space' ? `Aumenta a mochila em +${Math.max(1, Number(item.spaceBonus) || 5)} espaço(s)${(Number(item.inventorySpaceDuration) ?? 7) > 0 ? ` por ${Number(item.inventorySpaceDuration) || 7} dias` : ' (permanente)'}.` :
    item.gameEffect === 'blacksmith_scroll' ? (
      `Pergaminho do Ferreiro: +${item.scrollChanceBonus !== undefined && item.scrollChanceBonus !== null ? item.scrollChanceBonus : 30}% de chance de sucesso na forja e protege o item contra destruição (se falhar, regride 1 nível até o mínimo +0).`
    ) :
    item.gameEffect === 'break_item' ? (
      `Material Bruto: Leve ao Ferreiro para quebrar em fragmentos (${item.breakMinQty ?? 1} a ${item.breakMaxQty ?? 5} un. • ${item.breakSuccessChance ?? 80}% de chance).`
    ) :
    item.gameEffect === 'fuse_item' ? (
      `Fragmento de Material: Reúna ${item.fuseRequiredQty ?? 50} unidades e leve ao Ferreiro para fundir em ${item.fuseResultQty ?? 1} lingote (${item.fuseSuccessChance ?? 75}% de chance).`
    ) :
    item.gameEffect === 'none' ? 'Um item comum sem efeitos mágicos.' :
    null;

  return createPortal(
    <div className="item-tooltip" style={{
      position: 'fixed',
      top: Math.max(8, Math.min(mousePos.y + 15, typeof window !== 'undefined' ? window.innerHeight - 340 : mousePos.y)),
      left: Math.max(8, Math.min(mousePos.x + 15, typeof window !== 'undefined' ? window.innerWidth - 320 : mousePos.x)),
      background: 'var(--bg-card)',
      border: `2px solid ${rColor}`,
      borderRadius: '10px',
      padding: '1rem',
      width: 'max-content',
      minWidth: '220px',
      maxWidth: '300px',
      zIndex: 999999,
      boxShadow: `0 8px 30px rgba(0,0,0,0.6), 0 0 14px ${rColor}55`,
      backdropFilter: 'blur(10px)',
      pointerEvents: 'none',
      color: 'var(--text-primary)',
      textAlign: 'left'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem', flexWrap: 'wrap' }}>
        
        <h4 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--gold-primary)' }}>
          {item.type === 'equippable' ? forgeItemName(item.title, item.forgeLevel || 0) : item.title}
        </h4>

        <span style={{ fontSize: '0.6rem', fontWeight: 700, padding: '0.1rem 0.4rem', borderRadius: '4px', color: rColor, border: `1px solid ${rColor}`, background: `${rColor}22` }}>
          {getRarityLabel(item.rarity)}
        </span>
      </div>

      <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem', borderRadius: '4px', background: item.type === 'consumable' ? 'rgba(16,185,129,0.2)' : item.type === 'other' ? 'rgba(139,92,246,0.2)' : 'rgba(59,130,246,0.2)', color: item.type === 'consumable' ? '#10b981' : item.type === 'other' ? '#c084fc' : '#3b82f6' }}>
          {item.type === 'consumable' ? 'Consumível' : item.type === 'other' ? 'Material' : 'Equipável'}
        </span>
        {item.itemCategory && item.itemCategory !== 'none' && (
          <span style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem', borderRadius: '4px', background: 'rgba(245,158,11,0.15)', color: '#fbbf24' }}>
            {CATEGORY_LABELS[item.itemCategory] || item.itemCategory}
          </span>
        )}
      </div>

      {item.description ? (
        <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.82rem', color: 'var(--text-secondary)', fontStyle: 'italic', whiteSpace: 'normal' }}>"{item.description}"</p>
      ) : (
        consumableDesc && (
          <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.82rem', color: 'var(--text-secondary)', fontStyle: 'italic', whiteSpace: 'normal' }}>"{consumableDesc}"</p>
        )
      )}

      {item.type === 'equippable' && baseAttr && (
        <div style={{ marginBottom: '0.35rem', fontSize: '0.9rem' }}>
          {baseAttr.icon} <strong>{baseAttr.label}:</strong> <span style={{ color: rColor }}>+{forgeAttributeValueWithConfig(item.baseAttributeValue || 0, item.forgeLevel || 0, item.forgeConfig)}{mainStatPct ? '%' : ''}</span>
        </div>
      )}

      {item.type === 'equippable' && (!item.adds || item.adds.length === 0) && (
        <div style={{ marginBottom: '0.35rem', fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
          {item.damageEffect && item.damageEffect !== 'none' && (() => {
            const eff = DAMAGE_EFFECTS.find(d => d.id === item.damageEffect);
            if (!eff) return null;
            const minVal = item.damageEffectMin ?? 1;
            const maxVal = item.damageEffectMax ?? 25;
            return (
              <div>
                <strong style={{ color: '#fb7185' }}>{eff.label}</strong>
                {eff.desc && <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{eff.desc}</div>}
                <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
                  (força inicial: {minVal}% • aprimorável até {maxVal}%)
                </div>
              </div>
            );
          })()}
          {item.fixedAttributes && item.fixedAttributes.length > 0 && (
            <div>
              <strong style={{ color: '#D8B4FE' }}>✨ Atributos Fixos:</strong>
              <ul style={{ margin: '0.15rem 0 0 0', paddingLeft: '1.2rem' }}>
                {orderEffectFirst(item.fixedAttributes).map((add: any, i: number) => {
                  const lbl = isEffectAddType(add.type) ? EFFECT_ADD_LABELS[add.type] : ATTRIBUTE_LABELS[add.type as AttributeType];
                  if (!lbl) return null;
                  const effV = isEffectAddType(add.type) ? null : getAddEffectiveValue(add, item.forgeLevel || 0);
                  
                  let valueStr = '';
                  if (isEffectAddType(add.type)) {
                    const minV = item.damageEffectMin ?? 1;
                    const maxV = item.damageEffectMax ?? 25;
                    const forgeLvl = Math.max(0, Math.min(9, item.forgeLevel || 0));
                    const currentEffectChance = (add.value && add.value > minV && !item.damageEffectMax)
                      ? add.value
                      : Math.round(minV + (maxV - minV) * (forgeLvl / 9));
                    const maxSuffix = item.damageEffectMax && forgeLvl < 9 ? ` (máx ${item.damageEffectMax}% em +9)` : '';
                    valueStr = `${currentEffectChance}% de chance${maxSuffix}`;
                  } else if (add.type === 'damage') {
                    const dmgVal = effV !== null ? Math.round(effV) : Math.round(add.value || 0);
                    const sign = dmgVal >= 0 ? '+' : '';
                    const forgeHint = add.damageMode === 'forge' ? ' (por nível da forja)' : '';
                    valueStr = `${sign}${dmgVal}%${forgeHint}`;
                  } else {
                    valueStr = `+${add.maxAtForge9 ? effV!.toFixed(1) : add.value}%${add.maxAtForge9 ? ` (máx +${add.value}% em +9)` : ''}`;
                  }

                  return (
                    <li key={i} style={{ color: lbl.color }}>
                      {lbl.icon} {lbl.label}: {valueStr}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      )}

      {item.type === 'equippable' && item.adds && item.adds.length > 0 && (
        <div style={{ fontSize: '0.85rem' }}>
          <strong style={{ color: '#D8B4FE' }}>✨ Atributos Adicionais:</strong>
          <ul style={{ margin: '0.25rem 0 0 0', paddingLeft: '1.2rem' }}>
            {orderEffectFirst(item.adds).map((add: any, i: number) => {
              const lbl = isEffectAddType(add.type) ? EFFECT_ADD_LABELS[add.type] : ATTRIBUTE_LABELS[add.type as AttributeType];
              if (!lbl) return null;
              const effV = isEffectAddType(add.type) ? null : getAddEffectiveValue(add, item.forgeLevel || 0);
              
              let valueStr = '';
              if (isEffectAddType(add.type)) {
                const minV = item.damageEffectMin ?? 1;
                const maxV = item.damageEffectMax ?? 25;
                const forgeLvl = Math.max(0, Math.min(9, item.forgeLevel || 0));
                const currentEffectChance = (add.value && add.value > minV && !item.damageEffectMax)
                  ? add.value
                  : Math.round(minV + (maxV - minV) * (forgeLvl / 9));
                const maxSuffix = item.damageEffectMax && forgeLvl < 9 ? ` (máx ${item.damageEffectMax}% em +9)` : '';
                valueStr = `${currentEffectChance}% de chance${maxSuffix}`;
              } else if (add.type === 'damage') {
                const dmgVal = effV !== null ? Math.round(effV) : Math.round(add.value || 0);
                const sign = dmgVal >= 0 ? '+' : '';
                const forgeHint = add.damageMode === 'forge' ? ' (por nível da forja)' : '';
                valueStr = `${sign}${dmgVal}%${forgeHint}`;
              } else {
                valueStr = `+${add.maxAtForge9 ? effV!.toFixed(1) : add.value}%${add.maxAtForge9 ? ` (máx +${add.value}% em +9)` : ''}`;
              }

              return (
                <li key={i} style={{ color: lbl.color, marginBottom: '0.2rem' }}>
                  <div>{lbl.icon} {lbl.label}: {valueStr}</div>
                  {isEffectAddType(add.type) && (() => {
                    const effDef = DAMAGE_EFFECTS.find(d => d.id === add.type);
                    return effDef?.desc ? (
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginLeft: '1.2rem', fontStyle: 'italic' }}>
                        {effDef.desc}
                      </div>
                    ) : null;
                  })()}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {item.type === 'consumable' && ['add_attribute', 'remove_attribute', 'reroll_attributes'].includes(item.gameEffect || '') && (
        <div style={{ marginTop: '0.4rem', fontSize: '0.8rem', color: '#60A5FA', fontWeight: 'bold' }}>🖐️ Arraste sobre um equipamento para usar.</div>
      )}

      {item.gameEffect === 'reduce_hp_cooldown' && (
        <div style={{ marginTop: '0.3rem', fontSize: '0.8rem', color: '#f87171', fontWeight: 'bold' }}>
          ⚡ Recarga Acelerada: -{item.hpCooldownReductionMinutes || 10} min por coração
        </div>
      )}
    </div>,
    document.body
  );
}
