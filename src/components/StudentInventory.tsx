import { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, query, getDocs, where, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { Package, ShieldAlert, CheckCircle } from 'lucide-react';
import type { UserData } from '../contexts/AuthContext';

interface UserItem {
  id: string;
  itemId: string;
  itemTitle: string;
  itemType: 'consumable' | 'equippable';
  itemImageUrl: string;
  quantity: number;
  equipped: boolean;
}

export default function StudentInventory({ userData }: { userData: UserData }) {
  const [items, setItems] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);

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
    setItems(loaded);
    setLoading(false);
  };

  const handleEquip = async (item: UserItem) => {
    // If it's a title or border, maybe unequip others of the same type? 
    // Keep it simple: just toggle equipped status
    const newState = !item.equipped;
    await updateDoc(doc(db, 'user_items', item.id), { equipped: newState });
    setItems(items.map(i => i.id === item.id ? { ...i, equipped: newState } : i));
  };

  const handleUseConsumable = async (item: UserItem) => {
    if (!confirm(`Tem certeza que deseja consumir "${item.itemTitle}" agora? O professor precisará validar a ação na vida real.`)) return;
    // Remove the item from inventory (consumed)
    await deleteDoc(doc(db, 'user_items', item.id));
    setItems(items.filter(i => i.id !== item.id));
    alert(`Você utilizou o item: ${item.itemTitle}! Avise seu professor para que ele valide o efeito.`);
  };

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>Carregando Mochila...</div>;

  return (
    <div style={{ animation: 'fadeIn 0.3s ease-out' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
        <Package size={32} color="var(--gold-primary)" />
        <div>
          <h2 style={{ fontSize: '2rem', margin: 0 }}>Minha Mochila</h2>
          <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Seus itens comprados no Mercado.</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '2rem' }}>
        {items.map(item => (
          <div key={item.id} className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', border: item.equipped ? '2px solid var(--accent-green)' : '1px solid var(--border-glass)' }}>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
              {item.itemImageUrl ? (
                <img src={item.itemImageUrl} alt="" style={{ width: '60px', height: '60px', borderRadius: '8px', objectFit: 'cover' }} />
              ) : (
                <div style={{ width: '60px', height: '60px', borderRadius: '8px', background: 'var(--bg-dark)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Package size={24} color="var(--text-secondary)" />
                </div>
              )}
              <div>
                <h3 style={{ margin: '0 0 0.25rem 0', fontSize: '1.2rem' }}>{item.itemTitle}</h3>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', background: 'rgba(0,0,0,0.3)', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>
                  {item.itemType === 'consumable' ? 'Consumível' : 'Equipável'}
                </span>
              </div>
            </div>

            {item.itemType === 'equippable' ? (
              <button 
                onClick={() => handleEquip(item)}
                className="login-btn"
                style={{ 
                  background: item.equipped ? 'rgba(16, 185, 129, 0.2)' : 'transparent',
                  color: item.equipped ? 'var(--accent-green)' : 'white',
                  border: item.equipped ? '1px solid var(--accent-green)' : '1px solid var(--border-glass)'
                }}
              >
                {item.equipped ? <><CheckCircle size={18}/> Equipado</> : 'Equipar'}
              </button>
            ) : (
              <button 
                onClick={() => handleUseConsumable(item)}
                className="login-btn"
                style={{ background: 'var(--gold-primary)', color: 'black', border: 'none' }}
              >
                Utilizar Agora
              </button>
            )}
          </div>
        ))}

        {items.length === 0 && (
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
            <ShieldAlert size={48} style={{ margin: '0 auto 1rem auto', opacity: 0.5 }} />
            <p>Sua mochila está vazia. Visite o Mercado para comprar itens!</p>
          </div>
        )}
      </div>
    </div>
  );
}
