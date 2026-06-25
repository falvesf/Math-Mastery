import { useEffect, useState } from 'react';
import { ShieldAlert, Star } from 'lucide-react';
import type { RankDef } from '../lib/ranks';

interface LevelUpModalProps {
  oldRank: RankDef | null;
  newRank: RankDef;
  onClose: () => void;
}

export default function LevelUpModal({ oldRank, newRank, onClose }: LevelUpModalProps) {
  const [phase, setPhase] = useState(1);

  useEffect(() => {
    if (!oldRank) {
      setPhase(2);
      return;
    }
    const timer = setTimeout(() => {
      setPhase(2);
    }, 2000); // Espera a animação de saída
    return () => clearTimeout(timer);
  }, [oldRank]);

  return (
    <div className="level-up-overlay">
      <div style={{ position: 'absolute', top: '15%', left: '20%', animation: 'fadeIn 2s infinite alternate', color: 'var(--gold-primary)' }}><Star size={24} /></div>
      <div style={{ position: 'absolute', bottom: '20%', right: '20%', animation: 'fadeIn 1.5s infinite alternate', color: 'var(--gold-primary)' }}><Star size={40} /></div>
      <div style={{ position: 'absolute', top: '30%', right: '15%', animation: 'fadeIn 3s infinite alternate', color: 'var(--gold-primary)' }}><Star size={16} /></div>
      
      <h2 style={{ fontSize: '3rem', color: 'white', marginBottom: '4rem', animation: 'fadeIn 1s', textShadow: `0 0 20px ${newRank.color}` }}>
        {phase === 1 ? 'A sua jornada evoluiu...' : 'NOVA PATENTE ALCANÇADA!'}
      </h2>

      <div style={{ position: 'relative', width: '300px', height: '300px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        
        {phase === 1 && oldRank && (
          <div style={{ animation: 'leaveLeft 1s forwards', animationDelay: '1s', display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'absolute' }}>
            <ShieldAlert size={150} color={oldRank.color} style={{ filter: `drop-shadow(0 0 20px ${oldRank.color})` }} />
            <h3 style={{ marginTop: '1rem', color: oldRank.color, fontSize: '2rem' }}>{oldRank.name}</h3>
          </div>
        )}

        {phase === 2 && (
          <div style={{ animation: 'epicZoom 1.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards', display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'absolute' }}>
            <div style={{ animation: 'epicGlow 3s infinite alternate', color: newRank.color, borderRadius: '50%' }}>
              <ShieldAlert size={200} color={newRank.color} />
            </div>
            <h3 style={{ marginTop: '2rem', color: newRank.color, fontSize: '3.5rem', textShadow: `0 0 30px ${newRank.color}`, textTransform: 'uppercase', letterSpacing: '2px', whiteSpace: 'nowrap' }}>
              {newRank.name}
            </h3>
          </div>
        )}

      </div>

      {phase === 2 && (
        <button 
          onClick={onClose}
          style={{ 
            marginTop: '4rem', padding: '1rem 3rem', fontSize: '1.2rem', fontWeight: 'bold', 
            background: `linear-gradient(45deg, rgba(0,0,0,0.8), rgba(0,0,0,0.4))`, color: 'white', 
            border: `2px solid ${newRank.color}`, borderRadius: '50px', cursor: 'pointer',
            animation: 'slideUp 0.5s forwards', animationDelay: '1s', opacity: 0,
            boxShadow: `0 0 15px ${newRank.color}60`
          }}
        >
          Equipar Nova Patente
        </button>
      )}
    </div>
  );
}
