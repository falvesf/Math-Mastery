import { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, query, getDocs, where, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { Package, ShieldAlert, CheckCircle, Gift } from 'lucide-react';
import type { UserData } from '../contexts/AuthContext';
import { useDialog } from '../contexts/DialogContext';
import { RANKS, getRankForXp } from '../lib/ranks';
import { type ItemCategory, type AttributeType, type ItemAdd } from '../lib/gacha';

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
}

export default function StudentInventory({ userData, onEquip }: { userData: UserData, onEquip?: () => void }) {
  const { showAlert, showConfirm, showConfirmWithCheckbox } = useDialog();
  const [items, setItems] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sellModalItem, setSellModalItem] = useState<UserItem | null>(null);
  const [sellPrice, setSellPrice] = useState('');

  const currentRank = getRankForXp(userData.xp || 0);
  const currentRankIndex = RANKS.findIndex(r => r.name === currentRank.name) || 0;
  const maxInventorySpace = 6 + currentRankIndex + (userData.extraInventorySpace || 0);
  const currentSpaceOccupied = items.length;

  useEffect(() => {
    fetchInventory();
  }, [userData]);

  const fetchInventory = async () => {
    if (!userData.uid) return;
    setLoading(true);
    const q = query(collection(db, 'user_items'), where('studentId', '==', userData.uid));
    const snap = await getDocs(q);
    const loaded: UserItem[] = [];
    snap.forEach(d => {
      loaded.push({ id: d.id, ...d.data() } as UserItem);
    });

    const groupedMap = new Map<string, UserItem>();
    const finalItems: UserItem[] = [];

    loaded.forEach(item => {
      // Ocultar itens que foram dropados ou que estão à venda
      if (item.forSale || item.studentId === 'dropped') return;

      if (item.itemType === 'consumable') {
        const key = `${item.itemId}-${item.giftedBy || 'self'}`;
        if (groupedMap.has(key)) {
          const existing = groupedMap.get(key)!;
          existing.count = (existing.count || 1) + 1;
          if (existing.docIds) existing.docIds.push(item.id);
        } else {
          groupedMap.set(key, { ...item, count: 1, docIds: [item.id] });
        }
      } else {
        // Equipáveis não se agrupam
        finalItems.push(item);
      }
    });

    setItems([...Array.from(groupedMap.values()), ...finalItems]);
    setLoading(false);
  };

  const handleEquip = async (item: UserItem) => {
    const newState = !item.equipped;
    const docToUpdate = item.docIds ? item.docIds[0] : item.id;
    
    // Se for equipar e tiver uma parte do avatar, desequipa a anterior
    if (newState && item.avatarPart) {
      if (item.avatarPart === 'hand') {
        const equippedHands = items.filter(i => i.equipped && i.avatarPart === 'hand' && i.id !== item.id);
        if (equippedHands.length >= 2) {
          const otherDoc = equippedHands[0].docIds ? equippedHands[0].docIds[0] : equippedHands[0].id;
          await updateDoc(doc(db, 'user_items', otherDoc), { equipped: false });
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

      const docToDelete = item.docIds ? item.docIds[0] : item.id;
      await deleteDoc(doc(db, 'user_items', docToDelete));
      
      if ((item.count || 1) > 1) {
        setItems(items.map(i => i.id === item.id ? { ...i, count: (i.count || 2) - 1, docIds: i.docIds?.slice(1) } : i));
      } else {
        setItems(items.filter(i => i.id !== item.id));
      }
      await showAlert("HP restaurado completamente!");
      return;
    }

    if (item.gameEffect && item.gameEffect !== 'none' && item.gameEffect !== 'restore_hp') {
      await showAlert(`O item "${item.itemTitle}" é um Poder de Jogo! Você só pode utilizá-lo de dentro de uma Missão/Desafio ativo.`);
      return;
    }

    const confirmed = await showConfirm(`Tem certeza que deseja consumir "${item.itemTitle}" agora? O professor precisará validar a ação na vida real.`);
    if (!confirmed) return;
    
    const docToDelete = item.docIds ? item.docIds[0] : item.id;
    await deleteDoc(doc(db, 'user_items', docToDelete));
    
    if ((item.count || 1) > 1) {
      setItems(items.map(i => i.id === item.id ? { ...i, count: (i.count || 2) - 1, docIds: i.docIds?.slice(1) } : i));
    } else {
      setItems(items.filter(i => i.id !== item.id));
    }
    await showAlert(`Você utilizou o item: ${item.itemTitle}! Avise seu professor para que ele valide o efeito.`);
  };

  const handleDrop = async (item: UserItem) => {
    if (item.equipped) {
      await showAlert("Desequipe o item antes de jogá-lo fora!");
      return;
    }
    const result = await showConfirmWithCheckbox(
      `Tem certeza que deseja DESCARTAR "${item.itemTitle}"? Ele ficará perdido e poderá ser encontrado por outros jogadores em missões.`,
      "Destruir item permanentemente (ninguém poderá encontrar)"
    );
    if (!result || !result.confirmed) return;
    
    const docToUpdate = item.docIds ? item.docIds[0] : item.id;
    
    if (result.checked) {
      await deleteDoc(doc(db, 'user_items', docToUpdate));
      fetchInventory();
      await showAlert("Item destruído permanentemente!");
    } else {
      await updateDoc(doc(db, 'user_items', docToUpdate), {
        studentId: 'dropped',
        droppedBy: userData.uid
      });
      fetchInventory();
      await showAlert("Item jogado fora!");
    }
  };

  const submitSell = async () => {
    if (!sellModalItem) return;
    const price = parseInt(sellPrice, 10);
    if (isNaN(price) || price <= 0) {
      await showAlert("Digite um valor válido maior que zero!");
      return;
    }
    
    const docToUpdate = sellModalItem.docIds ? sellModalItem.docIds[0] : sellModalItem.id;
    await updateDoc(doc(db, 'user_items', docToUpdate), {
      forSale: true,
      price: price,
      sellerName: userData.name
    });
    
    setSellModalItem(null);
    setSellPrice('');
    fetchInventory();
    await showAlert("Item colocado à venda com sucesso!");
  };

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>Carregando Mochila...</div>;

  const slots = Array.from({ length: maxInventorySpace }, (_, i) => items[i] || null);

  return (
    <div style={{ animation: 'fadeIn 0.3s ease-out' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <Package size={32} color="var(--gold-primary)" />
          <div>
            <h2 style={{ fontSize: '2rem', margin: 0 }}>Minha Mochila</h2>
            <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Seus itens. Arraste ou clique para ações.</p>
          </div>
        </div>
        <div style={{ color: 'var(--text-secondary)', fontSize: '1.2rem', background: 'rgba(0,0,0,0.3)', padding: '0.5rem 1rem', borderRadius: '12px' }}>
          Espaço: <strong style={{ color: currentSpaceOccupied >= maxInventorySpace ? 'var(--accent-red)' : 'var(--accent-green)' }}>{currentSpaceOccupied}</strong> / {maxInventorySpace}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
        <div style={{ flex: '2 1 400px' }}>
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', 
            gap: '1rem',
            background: 'rgba(0,0,0,0.2)',
            padding: '1.5rem',
            borderRadius: '16px',
            border: '2px solid rgba(255,255,255,0.05)'
          }}>
            {slots.map((item, index) => (
              item ? (
                <div key={item.id || index} style={{ 
                  background: 'var(--bg-dark)', 
                  padding: '1rem', 
                  borderRadius: '12px', 
                  display: 'flex', 
                  flexDirection: 'column', 
                  gap: '0.5rem', 
                  border: item.equipped ? '2px solid var(--accent-green)' : '2px solid rgba(255,255,255,0.1)',
                  position: 'relative',
                  boxShadow: item.equipped ? '0 0 15px rgba(16, 185, 129, 0.2)' : 'none'
                }}>
                  {item.count && item.count > 1 && (
                    <div style={{ position: 'absolute', top: '-10px', right: '-10px', background: 'var(--gold-primary)', color: 'black', width: '28px', height: '28px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', border: '2px solid var(--bg-dark)', zIndex: 2 }}>
                      {item.count}
                    </div>
                  )}
                  
                  <div style={{ display: 'flex', justifyContent: 'center', height: '80px' }}>
                    {item.itemImageUrl ? (
                      <img src={item.itemImageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.5))' }} />
                    ) : (
                      <Package size={48} color="var(--text-secondary)" style={{ alignSelf: 'center' }} />
                    )}
                  </div>
                  
                  <div style={{ textAlign: 'center' }}>
                    <h4 style={{ margin: '0 0 0.25rem 0', fontSize: '1rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={item.itemTitle}>{item.itemTitle}</h4>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      {item.itemType === 'consumable' ? 'Consumível' : 'Equipável'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', marginTop: 'auto' }}>
                    {item.itemType === 'equippable' ? (
                      <button onClick={() => handleEquip(item)} style={{ background: item.equipped ? 'rgba(16, 185, 129, 0.2)' : 'var(--bg-card)', color: item.equipped ? 'var(--accent-green)' : 'white', border: item.equipped ? '1px solid var(--accent-green)' : '1px solid var(--border-glass)', padding: '0.5rem', borderRadius: '8px', cursor: 'pointer', transition: 'all 0.2s', fontSize: '0.85rem' }}>
                        {item.equipped ? '✔ Equipado' : 'Equipar'}
                      </button>
                    ) : (
                      <button onClick={() => handleUseConsumable(item)} style={{ background: 'var(--gold-primary)', color: 'black', border: 'none', padding: '0.5rem', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.85rem' }}>
                        Usar
                      </button>
                    )}
                    
                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                      <button onClick={() => {
                        if (item.equipped) { showAlert("Desequipe antes de vender."); return; }
                        setSellModalItem(item);
                      }} style={{ flex: 1, background: 'rgba(59, 130, 246, 0.2)', color: '#60A5FA', border: '1px solid rgba(59, 130, 246, 0.3)', padding: '0.4rem', borderRadius: '8px', cursor: 'pointer', fontSize: '0.8rem' }}>
                        Vender
                      </button>
                      <button onClick={() => handleDrop(item)} style={{ flex: 1, background: 'rgba(239, 68, 68, 0.2)', color: '#F87171', border: '1px solid rgba(239, 68, 68, 0.3)', padding: '0.4rem', borderRadius: '8px', cursor: 'pointer', fontSize: '0.8rem' }}>
                        Jogar Fora
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div key={`empty-${index}`} style={{ 
                  height: '240px', 
                  background: 'rgba(255,255,255,0.03)', 
                  borderRadius: '12px', 
                  border: '2px dashed rgba(255,255,255,0.1)', 
                  display: 'flex', 
                  justifyContent: 'center', 
                  alignItems: 'center' 
                }}>
                   <div style={{ width: '40px', height: '40px', background: 'rgba(255,255,255,0.05)', borderRadius: '50%' }} />
                </div>
              )
            ))}
          </div>
        </div>
      </div>

      {sellModalItem && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div className="glass-panel" style={{ padding: '2rem', maxWidth: '400px', width: '100%' }}>
            <h3 style={{ marginTop: 0, color: 'var(--gold-primary)', fontSize: '1.5rem' }}>Vender no Mercado Livre</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
              Ao colocar este item à venda, ele sairá da sua mochila. Uma taxa de 10% será descontada se outro jogador comprar.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '12px', marginBottom: '1.5rem' }}>
              <img src={sellModalItem.itemImageUrl} alt="" style={{ width: '40px', height: '40px', objectFit: 'contain' }} />
              <div>
                <strong>{sellModalItem.itemTitle}</strong>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Quantidade a vender: 1</div>
              </div>
            </div>
            
            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Preço de Venda</label>
            <input 
              type="number" 
              value={sellPrice} 
              onChange={e => setSellPrice(e.target.value)}
              className="login-input" 
              placeholder="Ex: 500"
              autoFocus
              min={1}
            />
            
            <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
              <button onClick={() => setSellModalItem(null)} className="login-btn" style={{ flex: 1, background: 'var(--bg-dark)', color: 'white' }}>Cancelar</button>
              <button onClick={submitSell} className="login-btn" style={{ flex: 1, background: 'var(--gold-primary)', color: 'black' }}>Confirmar Venda</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
