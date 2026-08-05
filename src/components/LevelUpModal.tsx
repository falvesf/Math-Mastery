import { useEffect, useState } from 'react';
import { ShieldAlert, Star } from 'lucide-react';
import type { RankDef } from '../lib/ranks';
import AvatarCharacter from './AvatarCharacter';
import type { AvatarConfig, EquippedItem } from './AvatarCharacter';

interface LevelUpModalProps {
  oldRank: RankDef | null;
  newRank: RankDef;
  onClose: () => void;
  isMaxRank?: boolean;
  avatarConfig?: AvatarConfig | null;
  equippedItems?: EquippedItem[];
}

const playVictorySound = () => {
  try {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    // Força o contexto de áudio a iniciar caso o navegador tenha bloqueado temporariamente
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    
    const playTone = (freq: number, start: number, dur: number, vol = 0.5) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      // O tipo 'square' (quadrada) remete muito a jogos antigos e é muito mais alto/claro que o 'triangle'
      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime + start);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      
      gain.gain.setValueAtTime(0, audioCtx.currentTime + start);
      gain.gain.linearRampToValueAtTime(vol, audioCtx.currentTime + start + dur * 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + start + dur);
      
      osc.start(audioCtx.currentTime + start);
      osc.stop(audioCtx.currentTime + start + dur);
    };
    
    // Toca a fanfarra (aumentado os tempos e o volume)
    playTone(523.25, 0, 0.4, 0.4); // C5
    playTone(659.25, 0.4, 0.4, 0.4); // E5
    playTone(783.99, 0.8, 0.4, 0.4); // G5
    playTone(1046.50, 1.2, 2.5, 0.5); // C6 longo
    
    // Harmonias para ficar mais épico
    playTone(392.00, 0, 0.4, 0.2); // G4
    playTone(523.25, 0.4, 0.4, 0.2); // C5
    playTone(659.25, 0.8, 0.4, 0.2); // E5
    playTone(783.99, 1.2, 2.5, 0.25); // G5
    
    // Um baixo no acorde final
    playTone(261.63, 1.2, 2.5, 0.3); // C4
  } catch (e) {
    console.error("Audio API not supported");
  }
};

export default function LevelUpModal({ oldRank, newRank, onClose, isMaxRank, avatarConfig, equippedItems }: LevelUpModalProps) {
  const [phase, setPhase] = useState(1);

  const playAudio = () => {
    if (newRank.audioUrl) {
      try {
        const customAudio = new Audio(newRank.audioUrl);
        customAudio.volume = 0.8;
        customAudio.play().catch(e => {
          console.warn("Custom audio blocked or error, falling back to fanfare", e);
          playVictorySound();
        });
      } catch (e) {
        playVictorySound();
      }
    } else {
      playVictorySound();
    }
  };

  useEffect(() => {
    if (!oldRank) {
      setPhase(2);
      playAudio();
    }
  }, [oldRank, newRank]);

  const handleReveal = () => {
    setPhase(2);
    playAudio();
  };

  return (
    <div className="level-up-overlay" style={{ background: isMaxRank ? 'rgba(0,0,0,0.95)' : 'rgba(0,0,0,0.85)', transition: 'background 2s' }}>
      <div style={{ position: 'absolute', top: '15%', left: '20%', animation: 'fadeIn 2s infinite alternate', color: 'var(--gold-primary)' }}><Star size={24} /></div>
      <div style={{ position: 'absolute', bottom: '20%', right: '20%', animation: 'fadeIn 1.5s infinite alternate', color: 'var(--gold-primary)' }}><Star size={40} /></div>
      <div style={{ position: 'absolute', top: '30%', right: '15%', animation: 'fadeIn 3s infinite alternate', color: 'var(--gold-primary)' }}><Star size={16} /></div>
      
      <h2 style={{ fontSize: '3rem', color: 'white', marginBottom: '4rem', animation: isMaxRank ? 'fadeIn 4s forwards' : 'fadeIn 1s', textShadow: `0 0 20px ${newRank.color}` }}>
        {phase === 1 ? 'A sua jornada evoluiu...' : isMaxRank ? 'O TOPO FOI ALCANÇADO!' : 'NOVA PATENTE ALCANÇADA!'}
      </h2>

      <div style={{ position: 'relative', width: '300px', height: '300px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
        
        {phase === 1 && oldRank && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'absolute' }}>
            {oldRank.imageUrl ? (
              <img src={oldRank.imageUrl} alt={oldRank.name} style={{ width: 150, height: 150, objectFit: 'contain', filter: `drop-shadow(0 0 20px ${oldRank.color})` }} />
            ) : (
              <ShieldAlert size={150} color={oldRank.color} style={{ filter: `drop-shadow(0 0 20px ${oldRank.color})` }} />
            )}
            <h3 style={{ marginTop: '1rem', color: oldRank.color, fontSize: '2rem' }}>{oldRank.name}</h3>
            <button 
              onClick={handleReveal}
              style={{ 
                marginTop: '2rem', padding: '0.8rem 2rem', fontSize: '1.1rem', fontWeight: 'bold', 
                background: `linear-gradient(45deg, var(--gold-primary), #B8860B)`, color: 'black', 
                border: `none`, borderRadius: '30px', cursor: 'pointer',
                boxShadow: `0 0 15px var(--gold-primary)`, animation: 'pulse 2s infinite'
              }}
            >
              Revelar Nova Patente
            </button>
          </div>
        )}

        {phase === 2 && (
          <div style={{ animation: isMaxRank ? 'epicZoom 4s cubic-bezier(0.1, 0.9, 0.1, 1) forwards' : 'epicZoom 1.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards', display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'absolute', zIndex: 10 }}>
            <div style={{ animation: 'epicGlow 3s infinite alternate', color: newRank.color, borderRadius: '50%' }}>
              {newRank.imageUrl ? (
                <img src={newRank.imageUrl} alt={newRank.name} style={{ width: 250, height: 250, objectFit: 'contain', filter: `drop-shadow(0 0 30px ${newRank.color})` }} />
              ) : (
                <ShieldAlert size={200} color={newRank.color} />
              )}
            </div>
            <h3 style={{ marginTop: '2rem', color: newRank.color, fontSize: '3.5rem', textShadow: `0 0 30px ${newRank.color}`, textTransform: 'uppercase', letterSpacing: '2px', whiteSpace: 'nowrap' }}>
              {newRank.name}
            </h3>
          </div>
        )}

        {/* Efeitos Surpresa e Personagem pulando para a patente máxima */}
        {phase === 2 && isMaxRank && (
          <>
            {/* Fogos de Artifício mais espaçados para durar a animação inteira */}
            <div className="firework" style={{ left: '10%', top: '20%', animationDelay: '2s' }}></div>
            <div className="firework" style={{ left: '80%', top: '30%', animationDelay: '3s' }}></div>
            <div className="firework" style={{ left: '20%', top: '60%', animationDelay: '4s' }}></div>
            <div className="firework" style={{ left: '70%', top: '70%', animationDelay: '5s' }}></div>
            <div className="firework" style={{ left: '50%', top: '10%', animationDelay: '6s' }}></div>
            
            {/* Avatar Passando bem devagar (30 segundos) */}
            {avatarConfig && (
              <div style={{
                position: 'fixed',
                bottom: '10%',
                left: '-20%',
                animation: 'walkAcrossScreen 12s linear infinite',
                animationDelay: '1s',
                zIndex: 5
              }}>
                <AvatarCharacter 
                  config={avatarConfig} 
                  equippedItems={equippedItems || []} 
                  size={200} 
                  animation="cheer" 
                  interactive={false} 
                />
              </div>
            )}
          </>
        )}

      </div>

      {phase === 2 && (
        <button 
          onClick={onClose}
          style={{ 
            marginTop: '4rem', padding: '1rem 3rem', fontSize: '1.2rem', fontWeight: 'bold', 
            background: `linear-gradient(45deg, rgba(0,0,0,0.8), rgba(0,0,0,0.4))`, color: 'white', 
            border: `2px solid ${newRank.color}`, borderRadius: '50px', cursor: 'pointer',
            animation: 'slideUp 0.5s forwards', animationDelay: isMaxRank ? '6s' : '1s', opacity: 0,
            boxShadow: `0 0 15px ${newRank.color}60`, zIndex: 20, position: 'relative'
          }}
        >
          Equipar Nova Patente
        </button>
      )}
    </div>
  );
}
