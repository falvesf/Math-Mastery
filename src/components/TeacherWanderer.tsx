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

      // É a minha vez: carregar o avatar do professor
      const { data: teacherRow } = await supabase
        .from('users')
        .select('id, name, character_name, photo_url, avatar_config')
        .eq('id', visit.teacherUid)
        .single();

      if (cancelled) return;
      if (!teacherRow) { setTeacher(null); return; }

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

  // Animação de caminhada com requestAnimationFrame (ida e volta)
  useEffect(() => {
    if (!visible || !teacher) return;
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
  }, [visible, teacher, direction, isRankingView]);

  // Quando está no ranking: parar no topo, pensar e apontar para os 3 melhores
  useEffect(() => {
    if (!isRankingView || !teacher || !visible) return;
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
  }, [isRankingView, teacher, visible, top3Names]);

  if (!teacher || !visible) return null;

  const scale = 0.5 + (posX / 100) * 0.6;

  return (
    <div
      onClick={() => onOpenTeacherProfile?.(teacher.uid)}
      style={{
        position: 'fixed',
        bottom: '8%',
        left: `${posX}%`,
        transform: `scaleX(${direction}) scale(${scale})`,
        zIndex: 9000,
        cursor: 'pointer',
        transition: 'transform 0.1s',
        userSelect: 'none',
      }}
      title={`${teacher.characterName || teacher.name} — clique para ver o histórico e adicionar aos contatos`}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
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
              animation={phase === 'pondering' ? 'raise-hand' : 'walk'}
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