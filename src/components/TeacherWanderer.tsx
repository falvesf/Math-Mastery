import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { getTeacherVisit } from '../lib/teacherVisit';
import AvatarCharacter, { type AvatarConfig, type EquippedItem } from './AvatarCharacter';

interface TeacherWandererProps {
  myUid?: string;
  tenantId?: string | null;
  onOpenTeacherProfile?: (uid: string) => void;
  /** Nomes dos 3 melhores do ranking (para o balão de fala) */
  top3Names?: string[];
  /** Se está na tela de ranking (para parar e apontar) */
  isRankingView?: boolean;
}

interface OnlineTeacher {
  uid: string;
  name: string;
  characterName?: string;
  avatarConfig?: AvatarConfig;
  equippedItems?: EquippedItem[];
}

const ONLINE_WINDOW_MS = 5 * 60 * 1000; // 5 min (abas em background podem atrasar o heartbeat)
const DISMISS_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 1 dia

export default function TeacherWanderer({ myUid, tenantId, onOpenTeacherProfile, top3Names = [], isRankingView }: TeacherWandererProps) {
  const [teacher, setTeacher] = useState<OnlineTeacher | null>(null);
  const [equipped, setEquipped] = useState<EquippedItem[]>([]);
  const [visible, setVisible] = useState(false);
  const [posX, setPosX] = useState(-10);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [showBubble, setShowBubble] = useState(false);
  const [bubbleMsg, setBubbleMsg] = useState('');
  const [phase, setPhase] = useState<'walking' | 'pondering'>('walking');
  const animationRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Menu de interação + estados de pausa/animação
  const [menuOpen, setMenuOpen] = useState(false);
  const [chatPaused, setChatPaused] = useState(false);
  const [transientAnim, setTransientAnim] = useState<string | null>(null);

  const paused = menuOpen || chatPaused;

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      cancelAnimationFrame(animationRef.current);
    };
  }, []);

  // Buscar o professor e verificar se é a MINHA vez de ser visitado.
  // Consulta o estado central (banco) — o motor roda no professor.
  useEffect(() => {
    if (!tenantId || !myUid) return;
    let cancelled = false;

    const checkVisit = async () => {
      const visit = await getTeacherVisit(tenantId);
      if (cancelled) return;

      if (!visit || !visit.targetUid || visit.targetUid !== myUid) {
        setTeacher(null);
        return;
      }

      // Aluno dispensou este professor (cooldown de 1 dia para retorno)
      const { data: myRow } = await supabase
        .from('users')
        .select('visitor_dismissal')
        .eq('id', myUid)
        .maybeSingle();
      if (cancelled) return;
      const dismiss = (myRow as any)?.visitor_dismissal;
      if (dismiss && dismiss.teacherUid === visit.teacherUid && Date.now() - dismiss.dismissedAt < DISMISS_COOLDOWN_MS) {
        setTeacher(null);
        return;
      }

      // É a minha vez: carregar o professor (APENAS professores podem visitar)
      const { data: teacherRow } = await supabase
        .from('users')
        .select('id, name, role, character_name, photo_url, avatar_config')
        .eq('id', visit.teacherUid)
        .single();

      if (cancelled) return;
      if (!teacherRow || teacherRow.role !== 'teacher') { setTeacher(null); return; }

      setTeacher({
        uid: teacherRow.id,
        name: teacherRow.name || 'Professor(a)',
        characterName: teacherRow.character_name || undefined,
        avatarConfig: teacherRow.avatar_config || undefined,
      });

      const { data: items } = await supabase
        .from('user_items')
        .select('*')
        .eq('student_id', teacherRow.id)
        .eq('equipped', true);

      const loaded: EquippedItem[] = [];
      (items || []).forEach((d: any) => {
        const data = d.data || {};
        if (data.avatarPart && (data.itemImageUrl || data.minecraftHeadValue || data.gameModelUrl)) {
          loaded.push({
            docId: d.id,
            itemId: d.item_id,
            imageUrl: data.itemImageUrl || '',
            avatarPart: data.avatarPart,
            itemTitle: data.itemTitle,
            itemCategory: data.itemCategory,
            gameModelUrl: data.gameModelUrl,
            modelTextureUrl: data.modelTextureUrl,
            minecraftHeadValue: data.minecraftHeadValue,
            modelTransforms: data.modelTransforms,
            customAnimation: data.customAnimation,
          } as EquippedItem);
        }
      });
      if (!cancelled) setEquipped(loaded);
    };

    checkVisit();
    const int = setInterval(checkVisit, 5 * 1000);
    return () => {
      cancelled = true;
      clearInterval(int);
    };
  }, [tenantId, myUid]);

  // Visível enquanto o estado central indicar que sou o alvo da visita.
  // O banco decide quem está sendo visitado agora (motor roda no professor).
  useEffect(() => {
    setVisible(!!teacher);
  }, [teacher]);

  // Reinicia a posição quando a visita começa
  useEffect(() => {
    if (visible) {
      setPosX(-10);
      setDirection(1);
    }
  }, [visible]);

  // Pausar/retomar quando um chat com o professor visitante abre/fecha
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail) return;
      if (detail.open && teacher && detail.teacherUid === teacher.uid) {
        setChatPaused(true);
      } else if (!detail.open) {
        setChatPaused(false);
      }
    };
    window.addEventListener('teacher-visit-chat', handler);
    return () => window.removeEventListener('teacher-visit-chat', handler);
  }, [teacher]);

  // Fecha o menu se clicar fora do boneco/professor
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const t = setTimeout(() => document.addEventListener('mousedown', handler), 0);
    return () => { clearTimeout(t); document.removeEventListener('mousedown', handler); };
  }, [menuOpen]);

  // Animação de caminhada (para quando pausado/menu aberto)
  useEffect(() => {
    if (!visible || !teacher || paused) return;
    let lastTime = performance.now();

    const step = (time: number) => {
      const dt = (time - lastTime) / 1000;
      lastTime = time;
      const speed = isRankingView ? 8 : 22; // % por segundo (lento no ranking para "pensar")
      setPosX(prev => {
        const next = prev + direction * speed * dt;
        if (next > 105) { setDirection(-1); return 105; }
        if (next < -15) { setDirection(1); return -15; }
        return next;
      });
      animationRef.current = requestAnimationFrame(step);
    };
    animationRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animationRef.current);
  }, [visible, teacher, direction, isRankingView, paused]);

  // Quando está no ranking: parar no topo, pensar e apontar para os 3 melhores
  useEffect(() => {
    if (!isRankingView || !teacher || !visible || paused) return;
    // Após 2s de caminhada lenta, para e "pensa"
    const stopTimer = setTimeout(() => {
      setPhase('pondering');
      setShowBubble(true);
      if (top3Names.length >= 3) {
        setBubbleMsg(`Hmm... ${top3Names[0]}, ${top3Names[1]} e ${top3Names[2]} estão indo muito bem! 👀`);
      } else if (top3Names.length > 0) {
        setBubbleMsg(`Parabéns aos melhores do ranking! 🏆`);
      } else {
        setBubbleMsg(`Deixa eu ver quem está se destacando... 🤔`);
      }
      // Aponta para o ranking por 3s, depois continua andando
      setTimeout(() => {
        setShowBubble(false);
        setPhase('walking');
      }, 3000);
    }, 1500);
    return () => clearTimeout(stopTimer);
  }, [isRankingView, teacher, visible, top3Names, paused]);

  const playTransient = (anim: string) => {
    setTransientAnim(anim);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setTransientAnim(null), 1800);
  };

  const handleTeacherClick = () => {
    if (!teacher) return;
    setMenuOpen(o => !o);
  };

  const handleStatus = () => {
    if (!teacher) return;
    setMenuOpen(false);
    playTransient('raise-hand');
    onOpenTeacherProfile?.(teacher.uid);
  };

  const handleMessage = () => {
    if (!teacher) return;
    setMenuOpen(false);
    playTransient('cheer');
    setChatPaused(true);
    window.dispatchEvent(new CustomEvent('open-chat-with', {
      detail: { uid: teacher.uid, name: teacher.characterName || teacher.name, classId: undefined },
    }));
  };

  const handleBye = async () => {
    if (!teacher || !myUid) return;
    setMenuOpen(false);
    playTransient('victory-easy');
    // Registra a dispensa (cooldown de 1 dia para o retorno deste professor)
    try {
      await supabase.from('users').update({
        visitor_dismissal: { teacherUid: teacher.uid, dismissedAt: Date.now() },
      }).eq('id', myUid);
    } catch (e) { console.error('Erro ao registrar dispensa:', e); }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setTeacher(null), 1800);
  };

  if (!teacher || !visible) return null;

  const scale = 0.5 + (posX / 100) * 0.6;
  const animation = transientAnim || (paused ? 'idle' : phase === 'pondering' ? 'raise-hand' : 'walk');

  return (
    <div
      ref={rootRef}
      onClick={handleTeacherClick}
      style={{
        position: 'fixed',
        bottom: '8%',
        left: `${posX}%`,
        transform: `scaleX(${direction}) scale(${scale})`,
        zIndex: chatPaused ? 1 : 9000,
        cursor: 'pointer',
        transition: 'transform 0.1s',
        userSelect: 'none',
      }}
      title={teacher.characterName || teacher.name}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
        {/* Menu de interação */}
        {menuOpen && (
          <div
            style={{
              position: 'absolute',
              bottom: '100%',
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'var(--bg-panel)',
              border: '1px solid var(--border-glass)',
              borderRadius: '12px',
              boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
              padding: '0.5rem',
              minWidth: '180px',
              zIndex: 10,
              display: 'flex',
              flexDirection: 'column',
              gap: '0.25rem',
            }}
            onClick={e => e.stopPropagation()}
          >
            <button onClick={handleStatus} style={menuBtnStyle} title="Abrir o perfil/status do professor">
              📋 Verificar status
            </button>
            <button onClick={handleMessage} style={menuBtnStyle} title="Abrir o chat com este professor">
              💬 Enviar mensagem
            </button>
            <button onClick={handleBye} style={{ ...menuBtnStyle, color: '#f87171' }} title="Dispensar o professor (volta em 1 dia)">
              👋 Dar tchau
            </button>
          </div>
        )}

        {/* Balão de fala */}
        {showBubble && (
          <div style={{
            background: 'var(--bg-card)', border: '1px solid var(--gold-primary)',
            borderRadius: '12px', padding: '0.5rem 0.9rem', marginBottom: '0.25rem',
            fontSize: '0.85rem', color: 'var(--text-primary)', maxWidth: '220px',
            textAlign: 'center', boxShadow: '0 4px 16px rgba(0,0,0,0.4)', animation: 'fadeIn 0.3s ease-out',
            pointerEvents: 'none'
          }}>
            {bubbleMsg}
          </div>
        )}
        <div style={{ filter: phase === 'pondering' ? 'drop-shadow(0 0 12px var(--gold-glow))' : 'none' }}>
          {teacher.avatarConfig ? (
            <AvatarCharacter
              config={teacher.avatarConfig}
              equippedItems={equipped}
              size={110}
              interactive={false}
              animation={animation as any}
            />
          ) : (
            <div style={{
              width: '90px', height: '90px', borderRadius: '50%',
              background: 'var(--accent-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontWeight: 'bold', fontSize: '0.8rem'
            }}>
              {(teacher.characterName || teacher.name).substring(0, 12)}
            </div>
          )}
        </div>
        <div style={{
          fontSize: '0.7rem', color: 'var(--gold-primary)', background: 'rgba(0,0,0,0.5)',
          padding: '0.1rem 0.5rem', borderRadius: '10px', marginTop: '0.2rem', fontWeight: 'bold'
        }}>
          👩‍🏫 {teacher.characterName || teacher.name}
        </div>
      </div>
    </div>
  );
}

const menuBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  padding: '0.5rem 0.75rem',
  background: 'transparent',
  border: 'none',
  borderRadius: '8px',
  cursor: 'pointer',
  color: 'var(--text-primary)',
  fontSize: '0.85rem',
  textAlign: 'left',
  whiteSpace: 'nowrap',
  fontFamily: 'inherit',
};