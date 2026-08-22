import { useEffect, useState } from 'react';
import { X, Sparkles, Crown, Users, Target, Shield, Trophy } from 'lucide-react';
import AvatarCharacter, { type AvatarConfig, type EquippedItem } from './AvatarCharacter';
import Monster3D from './Monster3D';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useTenant } from '../contexts/TenantContext';

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AboutModal({ isOpen, onClose }: AboutModalProps) {
  const { userData } = useAuth();
  const { tenant } = useTenant();

  const [heroConfig, setHeroConfig] = useState<AvatarConfig | null>(null);
  const [heroItems, setHeroItems] = useState<EquippedItem[]>([]);
  const [admins, setAdmins] = useState<{ uid: string; config: AvatarConfig; items: EquippedItem[]; name: string }[]>([]);
  // Plateia: professores + administradores de fundo
  const [audience, setAudience] = useState<{ uid: string; config: AvatarConfig; items: EquippedItem[]; name: string }[]>([]);
  // Sequência da batalha épica (~16s)
  const [battlePhase, setBattlePhase] = useState<number>(0);
  const [monsterState, setMonsterState] = useState<'idle' | 'attack' | 'hit' | 'defeated' | 'fatal'>('idle');
  const [monsterFlash, setMonsterFlash] = useState(false);
  const [heroAnim, setHeroAnim] = useState<any>('idle');
  const [teleporting, setTeleporting] = useState(false);
  const [fatalFlash, setFatalFlash] = useState(false);

  // Teletransporte do herói: aparece perto do monstro com efeito
  const heroTeleport = (delay: number, duration: number) => {
    setTimeout(() => setTeleporting(true), delay);
    setTimeout(() => setTeleporting(false), delay + duration);
  };

  // Carregar o personagem do superadmin (fabio.feitoza — que pode ter role admin)
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

    const load = async () => {
      // Superadmin: busca por email mestre (o Fabio pode ter role 'admin', não 'superadmin')
      const { data: byEmail } = await supabase
        .from('users')
        .select('*')
        .eq('email', 'fabio.feitoza@eaportal.org')
        .limit(5);

      let hero = (byEmail || [])[0] || null;
      if (!hero) {
        const { data: byRole } = await supabase.from('users').select('*').eq('role', 'superadmin').limit(1);
        hero = (byRole || [])[0] || null;
      }

      if (cancelled) return;
      if (hero) {
        setHeroConfig(hero.avatar_config || null);
        const { data: items } = await supabase.from('user_items').select('*').eq('student_id', hero.id).eq('equipped', true);
        const loaded: EquippedItem[] = [];
        (items || []).forEach((d: any) => {
          const data = d.data || {};
          if (data.avatarPart && (data.itemImageUrl || data.minecraftHeadValue || data.gameModelUrl)) {
            loaded.push({
              docId: d.id, itemId: d.item_id, imageUrl: data.itemImageUrl || '',
              avatarPart: data.avatarPart, itemTitle: data.itemTitle,
              itemCategory: data.itemCategory,
              baseAttributeType: data.baseAttributeType, baseAttributeValue: data.baseAttributeValue,
              gameModelUrl: data.gameModelUrl, modelTextureUrl: data.modelTextureUrl,
              minecraftHeadValue: data.minecraftHeadValue, modelTransforms: data.modelTransforms,
              backColor: data.backColor || '', rarity: data.rarity,
            } as EquippedItem);
          }
        });
        if (!cancelled) setHeroItems(loaded);
      }

      // Monstro: o componente Monster3D busca sua própria skin aleatória

      // PLATEIA: professores + administradores para assistir e aplaudir
      const { data: adminsData } = await supabase.from('users').select('*').in('role', ['admin', 'teacher']).limit(12);
      const loadedAdmins: { uid: string; config: AvatarConfig; items: EquippedItem[]; name: string }[] = [];
      for (const a of (adminsData || [])) {
        const { data: items } = await supabase.from('user_items').select('*').eq('student_id', a.id).eq('equipped', true);
        const loaded: EquippedItem[] = [];
        (items || []).forEach((d: any) => {
          const data = d.data || {};
          if (data.avatarPart && (data.itemImageUrl || data.minecraftHeadValue || data.gameModelUrl)) {
            loaded.push({
              docId: d.id, itemId: d.item_id, imageUrl: data.itemImageUrl || '',
              avatarPart: data.avatarPart, itemTitle: data.itemTitle,
              itemCategory: data.itemCategory,
              baseAttributeType: data.baseAttributeType, baseAttributeValue: data.baseAttributeValue,
              gameModelUrl: data.gameModelUrl, modelTextureUrl: data.modelTextureUrl,
              minecraftHeadValue: data.minecraftHeadValue, modelTransforms: data.modelTransforms,
              backColor: data.backColor || '', rarity: data.rarity,
            } as EquippedItem);
          }
        });
        loadedAdmins.push({ uid: a.id, config: a.avatar_config || null, items: loaded, name: a.name || 'Equipe' });
      }
      if (!cancelled) {
        setAdmins(loadedAdmins.filter(a => a.name !== 'Fabio Alves Feitoza')); // herói não repete na plateia
        setAudience(loadedAdmins);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [isOpen]);

  // Sequência de batalha épica (~16s): ataques alternados herói<->monstro,
  // monstro fica vermelho ao levar dano, e o FATALITY explode o monstro.
  // A ordem é: derrota PRIMEIRO, depois o herói comemora.
  useEffect(() => {
    if (!isOpen) return;
    // Reseta
    setBattlePhase(0);
    setMonsterState('idle');
    setMonsterFlash(false);
    setHeroAnim('idle');
    setTeleporting(false);
    setFatalFlash(false);

    const timers: any[] = [];
    const schedule = (delay: number, fn: () => void) => timers.push(setTimeout(fn, delay));

    // Fase 1 (0-1.2s): intro — ambos idle
    schedule(0, () => { setBattlePhase(1); setMonsterState('idle'); setHeroAnim('idle'); });

    // Fase 2 (1.2-3s): HERÓI TELEPORTA e ataca -> monstro dano
    schedule(1200, () => {
      setBattlePhase(2);
      setHeroAnim('idle');
      setTeleporting(true);
      schedule(1600, () => setTeleporting(false));
      schedule(1600, () => {
        setHeroAnim('attack-fatal');
        setMonsterState('hit');
        setMonsterFlash(true);
      });
      schedule(2600, () => setMonsterFlash(false));
      schedule(2800, () => setHeroAnim('idle'));
    });

    // Fase 3 (3-4.5s): MONSTRO contra-ataca
    schedule(3000, () => {
      setBattlePhase(3);
      setHeroAnim('hurt');
      setMonsterState('attack');
    });
    schedule(4300, () => setHeroAnim('idle'));

    // Fase 4 (4.5-6.5s): HERÓI ataca 2
    schedule(4500, () => {
      setBattlePhase(4);
      setHeroAnim('idle');
      setTeleporting(true);
      schedule(4900, () => setTeleporting(false));
      schedule(4900, () => {
        setHeroAnim('attack-fatal');
        setMonsterState('hit');
        setMonsterFlash(true);
      });
      schedule(5900, () => setMonsterFlash(false));
      schedule(6100, () => setHeroAnim('idle'));
    });

    // Fase 5 (6.5-8.5s): MONSTRO ataca forte
    schedule(6500, () => {
      setBattlePhase(5);
      setHeroAnim('hurt');
      setMonsterState('attack');
    });
    schedule(8000, () => setHeroAnim('idle'));

    // Fase 6 (8.5-10.5s): HERÓI ataca 3
    schedule(8500, () => {
      setBattlePhase(6);
      setHeroAnim('idle');
      setTeleporting(true);
      schedule(8900, () => setTeleporting(false));
      schedule(8900, () => {
        setHeroAnim('attack-fatal');
        setMonsterState('hit');
        setMonsterFlash(true);
      });
      schedule(9900, () => setMonsterFlash(false));
      schedule(10100, () => setHeroAnim('idle'));
    });

    // Fase 7 (10.5-12s): MONSTRO desesperado
    schedule(10500, () => {
      setBattlePhase(7);
      setHeroAnim('hurt');
      setMonsterState('attack');
    });
    schedule(11800, () => setHeroAnim('idle'));

    // Fase 8 (12-13.5s): FATALITY — herói golpeia, monstro explode
    schedule(12200, () => {
      setBattlePhase(8);
      setHeroAnim('idle');
      setTeleporting(true);
    });
    schedule(12600, () => setTeleporting(false));
    schedule(12600, () => setHeroAnim('attack-fatal-slow')); // golpe lento épico
    schedule(13800, () => {
      setMonsterState('fatal'); // EXPLODE!
      setFatalFlash(true);
    });
    schedule(14400, () => setFatalFlash(false));

    // Fase 9 (14.5s+): VITÓRIA — monstro já explodiu (fatal), herói comemora
    schedule(14600, () => {
      setBattlePhase(9);
      setHeroAnim('cheer'); // comemoração SÓ depois da derrota
    });

    return () => timers.forEach(clearTimeout);
  }, [isOpen]);

  if (!isOpen) return null;

  const monsterDead = monsterState === 'fatal';
  const isVictory = battlePhase >= 9;
  // Proximidade: os personagens se aproximam conforme o combate avança
  const heroNear = teleporting || heroAnim === 'attack-fatal' || heroAnim === 'attack-fatal-slow';
  const heroPos = heroNear ? '42%' : '12%';
  const monsterPos = monsterState === 'attack' ? '38%' : monsterState === 'hit' ? '52%' : '18%';

  return (
    <div className="modal-overlay" style={{ zIndex: 25000, padding: '1rem' }}>
      <div className="glass-panel" style={{ width: '100%', maxWidth: '900px', maxHeight: '92vh', overflowY: 'auto', position: 'relative', padding: '1.5rem' }}>
        <button 
          onClick={onClose} 
          style={{ position: 'absolute', top: '0.75rem', right: '0.75rem', background: 'rgba(0,0,0,0.5)', border: '1px solid var(--border-glass)', borderRadius: '50%', color: 'var(--text-secondary)', cursor: 'pointer', padding: '0.4rem', zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          className="hover-brightness"
          title="Fechar"
        >
          <X size={20} />
        </button>

        <h2 style={{ margin: '0 0 1.5rem 0', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
          <Sparkles color="var(--gold-primary)" /> Sobre o Sistema
        </h2>

        {/* Cena animada */}
        <div style={{ position: 'relative', height: '360px', borderRadius: '16px', background: 'linear-gradient(180deg, rgba(88,28,135,0.35), rgba(0,0,0,0.55))', border: '1px solid var(--border-glass)', overflow: 'hidden', marginBottom: '1.5rem' }}>
          {/* Partículas */}
          <div className="firework" style={{ left: '20%', top: '30%', animationDelay: '0.5s', transform: 'scale(0.6)' }}></div>
          <div className="firework" style={{ left: '80%', top: '25%', animationDelay: '1.5s', transform: 'scale(0.6)' }}></div>
          <div className="firework" style={{ left: '50%', top: '15%', animationDelay: '2.5s', transform: 'scale(0.7)' }}></div>

          {/* Flash de impacto do fatality */}
          {fatalFlash && (
            <div style={{ position: 'absolute', inset: 0, background: 'white', animation: 'fatalFlashAnim 0.6s ease-out forwards', zIndex: 5 }} />
          )}

          {/* Monstro (direita) */}
          <div style={{
            position: 'absolute', right: monsterPos, top: '50%',
            transform: 'translateY(-50%) scale(1.5)',
            opacity: monsterDead ? 0 : 1,
            transition: 'right 0.4s ease, opacity 0.6s',
            filter: monsterFlash ? 'drop-shadow(0 0 30px rgba(239,68,68,0.9))' : 'drop-shadow(0 0 20px rgba(239,68,68,0.5))'
          }}>
            <Monster3D size={160} state={monsterState} flashRed={monsterFlash} />
            <div style={{ textAlign: 'center', fontSize: '0.7rem', color: 'var(--accent-red)', fontWeight: 'bold', marginTop: '0.25rem' }}>
              👹 Monstro Lendário
            </div>
          </div>

          {/* Herói (superadmin, esquerda) — teletransporte para perto do monstro */}
          <div style={{
            position: 'absolute', left: heroPos, top: '50%',
            transform: 'translateY(-50%) scale(1.5)',
            transition: 'left 0.4s ease',
            filter: teleporting ? 'drop-shadow(0 0 30px rgba(139,92,246,0.7))' : 'none',
            zIndex: 3
          }}>
            {heroConfig ? (
              <AvatarCharacter config={heroConfig} equippedItems={heroItems} size={110} interactive={false} animation={heroAnim} />
            ) : (
              <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'var(--gold-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#000', fontWeight: 'bold' }}>
                <Crown size={40} />
              </div>
            )}
            <div style={{ textAlign: 'center', fontSize: '0.7rem', color: 'var(--gold-primary)', fontWeight: 'bold', marginTop: '0.25rem' }}>
              👑 Super Admin
            </div>
          </div>

          {/* PLATEIA aplaudindo (fundo, em baixo) — professores + administradores */}
          <div style={{ position: 'absolute', bottom: '6px', left: '0', right: '0', display: 'flex', justifyContent: 'center', gap: '1.1rem', alignItems: 'flex-end', flexWrap: 'wrap', padding: '0 0.5rem' }}>
            {audience.map((member, i) => (
              <div key={member.uid} style={{ textAlign: 'center', animation: isVictory ? 'adminClap 1s ease-in-out infinite' : 'none', animationDelay: `${i * 0.15}s`, transform: `scale(${0.45 + i * 0.07})`, opacity: 0.95 }}>
                {member.config ? (
                  <AvatarCharacter config={member.config} equippedItems={member.items} size={44} interactive={false} animation={isVictory ? 'cheer' : 'idle'} />
                ) : (
                  <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--accent-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '0.55rem', fontWeight: 'bold' }}>
                    {member.name.substring(0, 5)}
                  </div>
                )}
                <div style={{ fontSize: '0.45rem', color: 'var(--text-secondary)', marginTop: '0.1rem', maxWidth: '60px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{member.name.split(' ')[0]}</div>
              </div>
            ))}
          </div>

          {/* Texto de vitória */}
          {isVictory && (
            <div style={{ position: 'absolute', top: '10px', left: '50%', transform: 'translateX(-50%)', background: 'rgba(251,191,36,0.9)', color: '#000', padding: '0.4rem 1.2rem', borderRadius: '20px', fontWeight: 'bold', animation: 'fadeIn 0.5s ease-out' }}>
              🎉 Vitória! O lendário foi derrotado!
            </div>
          )}
        </div>

        {/* Informações */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
          <div style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-glass)', borderRadius: '12px', padding: '1rem' }}>
            <Crown size={20} color="var(--gold-primary)" style={{ marginBottom: '0.5rem' }} />
            <strong style={{ display: 'block', marginBottom: '0.25rem' }}>Math Mastery</strong>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Aventura educativa que transforma matemática em batalhas épicas.</span>
          </div>
          <div style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-glass)', borderRadius: '12px', padding: '1rem' }}>
            <Users size={20} color="var(--accent-blue)" style={{ marginBottom: '0.5rem' }} />
            <strong style={{ display: 'block', marginBottom: '0.25rem' }}>{tenant?.name || 'Sua escola'}</strong>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Uma plataforma por escola, com progresso individual e rankings.</span>
          </div>
          <div style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-glass)', borderRadius: '12px', padding: '1rem' }}>
            <Target size={20} color="var(--accent-green)" style={{ marginBottom: '0.5rem' }} />
            <strong style={{ display: 'block', marginBottom: '0.25rem' }}>Missão</strong>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Enfrente monstros, ganhe XP e evolua sua patente respondendo certo.</span>
          </div>
        </div>

        <div style={{ textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          <Shield size={14} style={{ verticalAlign: 'middle', marginRight: '0.3rem' }} />
          Criado com carinho para tornar o aprendizado uma grande aventura. <Trophy size={14} style={{ verticalAlign: 'middle', marginLeft: '0.3rem', color: 'var(--gold-primary)' }} />
        </div>
      </div>
    </div>
  );
}