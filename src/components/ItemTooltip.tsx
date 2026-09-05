import { createPortal } from 'react-dom';
import { ATTRIBUTE_LABELS, type AttributeType } from '../lib/gacha';
import { DAMAGE_EFFECTS, EFFECT_ADD_LABELS, isEffectAddType } from '../lib/damageEffects';

export const RARITY_COLORS: Record<string, string> = {
  common: '#9ca3af',
  uncommon: '#10b981',
  rare: '#3b82f6',
  epic: '#8b5cf6',
  legendary: '#f59e0b',
  mythic: '#ef4444'
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
    mythic: 'Mítico'
  };
  return labels[r] || 'Comum';
};

export interface TooltipItemData {
  id?: string;
  title: string;
  type?: 'consumable' | 'equippable';
  rarity?: string;
  itemCategory?: string;
  description?: string;
  baseAttributeType?: string;
  baseAttributeValue?: number;
  gameEffect?: string;
  hpCooldownReductionMinutes?: number;
  damageEffect?: string;
  fixedAttributes?: any[];
  adds?: any[];
  unlockedSkinId?: string;
}

export function normalizeItemForTooltip(item: any): TooltipItemData {
  return {
    id: item.id || item.itemId,
    title: item.title || item.itemTitle || item.name || 'Item Desconhecido',
    type: item.type || item.itemType,
    rarity: item.rarity,
    itemCategory: item.itemCategory,
    description: item.description || item.desc,
    baseAttributeType: item.baseAttributeType,
    baseAttributeValue: item.baseAttributeValue,
    gameEffect: item.gameEffect,
    hpCooldownReductionMinutes: item.hpCooldownReductionMinutes,
    damageEffect: item.damageEffect,
    fixedAttributes: item.fixedAttributes || (item.data ? item.data.fixedAttributes : []),
    adds: item.adds || (item.data ? item.data.adds : []),
    unlockedSkinId: item.unlockedSkinId || (item.data ? item.data.unlockedSkinId : undefined)
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
    item.gameEffect === 'reduce_hp_cooldown' ? `Acelera a recarga de vida: -${item.hpCooldownReductionMinutes || 10} min por coração.` :
    item.gameEffect === 'add_attribute' ? 'Adiciona um novo atributo aleatório a um equipamento.' :
    item.gameEffect === 'remove_attribute' ? 'Remove um atributo negativo de um equipamento.' :
    item.gameEffect === 'reroll_attributes' ? 'Sorteia novamente todos os atributos extras de um equipamento.' :
    item.gameEffect === 'unlock_skin' ? 'Desbloqueia uma skin para usar no personagem.' :
    item.gameEffect === 'bazar_sale_permit' ? 'Licença para vender itens no bazar.' :
    item.gameEffect === 'none' ? 'Um item comum sem efeitos mágicos.' :
    null;

  return createPortal(
    <div className="item-tooltip" style={{
      position: 'fixed',
      top: mousePos.y + 15,
      left: mousePos.x + 15,
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
        <h4 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--gold-primary)' }}>{item.title}</h4>
        <span style={{ fontSize: '0.6rem', fontWeight: 700, padding: '0.1rem 0.4rem', borderRadius: '4px', color: rColor, border: `1px solid ${rColor}`, background: `${rColor}22` }}>
          {getRarityLabel(item.rarity)}
        </span>
      </div>

      <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem', borderRadius: '4px', background: item.type === 'consumable' ? 'rgba(16,185,129,0.2)' : 'rgba(59,130,246,0.2)', color: item.type === 'consumable' ? '#10b981' : '#3b82f6' }}>
          {item.type === 'consumable' ? 'Consumível' : 'Equipável'}
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
          {baseAttr.icon} <strong>{baseAttr.label}:</strong> <span style={{ color: rColor }}>+{item.baseAttributeValue}{mainStatPct ? '%' : ''}</span>
        </div>
      )}

      {item.type === 'equippable' && (!item.adds || item.adds.length === 0) && (
        <div style={{ marginBottom: '0.35rem', fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
          {item.damageEffect && item.damageEffect !== 'none' && (() => {
            const eff = DAMAGE_EFFECTS.find(d => d.id === item.damageEffect);
            if (!eff) return null;
            return (
              <div>
                <strong style={{ color: '#fb7185' }}>{eff.label}</strong>
                {eff.desc && <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{eff.desc}</div>}
                <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>(a força/chance é sorteada no momento da compra)</div>
              </div>
            );
          })()}
          {item.fixedAttributes && item.fixedAttributes.length > 0 && (
            <div>
              <strong style={{ color: '#D8B4FE' }}>✨ Atributos Fixos:</strong>
              <ul style={{ margin: '0.15rem 0 0 0', paddingLeft: '1.2rem' }}>
                {item.fixedAttributes.map((add: any, i: number) => {
                  const lbl = isEffectAddType(add.type) ? EFFECT_ADD_LABELS[add.type] : ATTRIBUTE_LABELS[add.type as AttributeType];
                  if (!lbl) return null;
                  return (
                    <li key={i} style={{ color: lbl.color }}>
                      {lbl.icon} {lbl.label}: {isEffectAddType(add.type) ? `${add.value}% de chance` : `+${add.value}%`}
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
            {item.adds.map((add: any, i: number) => {
              const lbl = isEffectAddType(add.type) ? EFFECT_ADD_LABELS[add.type] : ATTRIBUTE_LABELS[add.type as AttributeType];
              if (!lbl) return null;
              return (
                <li key={i} style={{ color: lbl.color }}>
                  {lbl.icon} {lbl.label}: {isEffectAddType(add.type) ? `${add.value}% de chance` : `+${add.value}%`}
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
