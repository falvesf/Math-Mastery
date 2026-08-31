import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { Swords, Heart, ChevronLeft } from 'lucide-react';
import AvatarCharacter from './AvatarCharacter';
import type { UserData } from '../contexts/AuthContext';
import {
  type PvpMatch, type PvpPlayerState,
  getPvpMatch, subscribePvpMatch, submitPvpAnswer, tickPvp,
  myRoleInMatch, opponentRole, normalizeEquippedItems, joinSpectator, leaveSpectator,
  sendEmoji, PVP_EMOJIS,
} from '../lib/pvp';
import { playSound, resolveAudioUrl } from '../lib/audioBank';
import BattleTransition from './BattleTransition';

interface PvpBattleProps {
  matchId: string;
  userData: UserData;
  watchUid?: string | null;
  onExit: () => void;
}

function abbreviate(name?: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 8);
  return parts[0] + ' ' + parts[1][0] + '.';
}

interface BattleSounds {
  victory: string; deathMale: string; deathFemale: string; fail: string; punch: string;
  fatalFall: string; fatalEvaporate: string; fatalSlice: string; fatalExplode: string;
}

// Lê as configurações do Arena Debug (mesmo mecanismo das missões) para o espaço/lunge
function loadArenaDebug() {
  try {
    const key = `arenaDebugConfig_${window.innerWidth < 768 ? 'mobile' : 'desktop'}`;
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export default function PvpBattle({ matchId, userData, watchUid, onExit }: PvpBattleProps) {
  const isSpectator = !!watchUid && watchUid !== userData.uid;
  const [match, setMatch] = useState<PvpMatch | null>(null);
  const [now, setNow] = useState(Date.now());
  const [answerLock, setAnswerLock] = useState(false);
  const [myLocalAnswer, setMyLocalAnswer] = useState<number | null>(null);
  const [fatalChoice, setFatalChoice] = useState<string>('death-fall');
  const [lungeMe, setLungeMe] = useState(false);
  const [lungeThem, setLungeThem] = useState(false);
  const [hurtMe, setHurtMe] = useState(false);
  const [hurtThem, setHurtThem] = useState(false);
  // Estados locais do ESPECTADOR: ataque/dano de cada lado (player1 esquerda / player2 direita)
  const [specLeftAttack, setSpecLeftAttack] = useState(false);
  const [specRightAttack, setSpecRightAttack] = useState(false);
  const [specLeftHurt, setSpecLeftHurt] = useState(false);
  const [specRightHurt, setSpecRightHurt] = useState(false);
  const lastWinnerRef = useRef<{ id: string | null; at: number }>({ id: null, at: 0 });
  const [transition, setTransition] = useState<'none' | 'enter' | 'exit'>('none');
  const transitionDoneRef = useRef(false);
  const uid = userData.uid;
  const [emojiCooldown, setEmojiCooldown] = useState(false);
  const lastEmojiRef = useRef(0);

  // Emojis de torcida recebidos (mostrados na tela do jogador assistido / do participante)
  const emojiTarget = isSpectator ? (watchUid || '') : uid;
  const visibleEmojis = useMemo(() => {
    if (!match?.match_emojis) return [];
    const cutoff = now - 4000;
    return match.match_emojis.filter((e: any) => e.targetUid === emojiTarget && Number(e.at) > cutoff);
  }, [match?.match_emojis, now, emojiTarget]);

  const battleSoundsRef = useRef<BattleSounds>({ victory: '', deathMale: '', deathFemale: '', fail: '', punch: '', fatalFall: '', fatalEvaporate: '', fatalSlice: '', fatalExplode: '' });
  const damageSoundsRef = useRef<{ male: string; female: string }>({ male: '', female: '' });
  const musicAudioRef = useRef<HTMLAudioElement | null>(null);
  const celebrationAudioRef = useRef<HTMLAudioElement | null>(null);
  const arenaDebugRef = useRef<any>(loadArenaDebug());
  const attackDist = arenaDebugRef.current.attackDist || 150;
  const arenaGap = arenaDebugRef.current.arenaGap || 0;

  const matchRef = useRef<PvpMatch | null>(null);
  matchRef.current = match;
  const lastFetchRef = useRef(0);

  const FATALS = ['death-fall', 'death-slice', 'death-evaporate', 'death-explode'];

  // Contagem do fatal ancorada ao momento em que o CLIENTE vê o fim — garante o suspense (taunt) sempre
  const fatalStartRef = useRef<number>(0);
  useEffect(() => {
    if (match?.status === 'finished' && !fatalStartRef.current) {
      fatalStartRef.current = Date.now();
    }
  }, [match?.status]);

  // Fundo da arena: captura UMA VEZ e nunca perde (imune a re-renders/estado atrasado)
  const arenaBgRef = useRef<string>('');
  useEffect(() => {
    const bg = match?.arena?.battleBgUrl || match?.arena?.battle_bg_url || '';
    if (bg) {
      arenaBgRef.current = bg;
      console.log('[PvP] Arena background:', bg);
    }
  }, [match?.arena?.battleBgUrl, match?.arena?.battle_bg_url]);

  // Bonecos ESTÁVEIS por conteúdo (JSON) — o match é re-criado a cada update do realtime,
  // então usar match.playerX direto faria os avatares reiniciarem (sem equipamentos).
  // REF-fallback: se um update transiente chegar com config vazio, mantém o último não-vazio
  // (impede o boneco de "resetar ao padrão" a cada resposta no modo espectador).
  const p1ConfigRef = useRef<any>({});
  const p2ConfigRef = useRef<any>({});
  const p1EquipRef = useRef<any[]>([]);
  const p2EquipRef = useRef<any[]>([]);
  const p1Config = useMemo(() => {
    const c = match?.player1?.avatarConfig;
    if (c && Object.keys(c).length > 0) p1ConfigRef.current = c;
    return p1ConfigRef.current;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(match?.player1?.avatarConfig || {})]);
  const p2Config = useMemo(() => {
    const c = match?.player2?.avatarConfig;
    if (c && Object.keys(c).length > 0) p2ConfigRef.current = c;
    return p2ConfigRef.current;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(match?.player2?.avatarConfig || {})]);
  const p1Equip = useMemo(() => {
    const e = match?.player1?.equippedItems;
    if (e && e.length > 0) p1EquipRef.current = e;
    return p1EquipRef.current;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(match?.player1?.equippedItems || [])]);
  const p2Equip = useMemo(() => {
    const e = match?.player2?.equippedItems;
    if (e && e.length > 0) p2EquipRef.current = e;
    return p2EquipRef.current;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(match?.player2?.equippedItems || [])]);

  // Meus itens/avatar REAIS (nunca ficam resetados mesmo se o match tiver vazio)
  const [myRealEquip, setMyRealEquip] = useState<any[]>([]);
  useEffect(() => {
    if (!uid) return;
    supabase.from('user_items').select('*').eq('student_id', uid).eq('equipped', true).then(({ data }) => {
      setMyRealEquip(normalizeEquippedItems(data || []));
    });
  }, [uid]);
  const myRealConfig = useMemo(() => userData.avatarConfig && Object.keys(userData.avatarConfig).length > 0 ? userData.avatarConfig : {}, [JSON.stringify(userData.avatarConfig || {})]);

  // Dados REAIS do adversário (fallback se o match tiver vazio)
  const [oppRealConfig, setOppRealConfig] = useState<any>({});
  const [oppRealEquip, setOppRealEquip] = useState<any[]>([]);
  const oppUid = match ? (match.challenger_id === uid ? match.opponent_id : match.challenger_id) : null;
  useEffect(() => {
    if (!oppUid) return;
    supabase.from('users').select('avatar_config').eq('id', oppUid).single().then(({ data }) => {
      if (data?.avatar_config) setOppRealConfig(data.avatar_config);
    });
    supabase.from('user_items').select('*').eq('student_id', oppUid).eq('equipped', true).then(({ data }) => {
      setOppRealEquip(normalizeEquippedItems(data || []));
    });
  }, [oppUid]);

  // Carrega sons globais de batalha + dano do personagem
  useEffect(() => {
    let active = true;
    supabase.from('system_collections').select('data').eq('collection_name', 'audio').eq('doc_id', 'player_damage_sounds').then(({ data }) => {
      if (!active) return;
      let d: any = {};
      (data || []).forEach((r: any) => d = { ...d, ...(r.data || {}) });
      damageSoundsRef.current = { male: d.male || '', female: d.female || '' };
    });
    supabase.from('system_collections').select('data').eq('collection_name', 'audio').eq('doc_id', 'battle_sounds').then(({ data }) => {
      if (!active) return;
      let b: any = {};
      (data || []).forEach((r: any) => b = { ...b, ...(r.data || {}) });
      const s: BattleSounds = {
        victory: b.victory || b.victory_sound || '',
        deathMale: b.deathMale || b.death_male || '',
        deathFemale: b.deathFemale || b.death_female || '',
        fail: b.fail || b.fail_sound || '',
        punch: b.punch || b.punch_sound || '',
        fatalFall: b.fatalFall || b.fatal_fall || '',
        fatalEvaporate: b.fatalEvaporate || b.fatal_evaporate || '',
        fatalSlice: b.fatalSlice || b.fatal_slice || '',
        fatalExplode: b.fatalExplode || b.fatal_explode || '',
      };
      battleSoundsRef.current = s;
      ['victory', 'deathMale', 'deathFemale', 'fail', 'punch', 'fatalFall', 'fatalEvaporate', 'fatalSlice', 'fatalExplode'].forEach(key => {
        const u = (s as any)[key];
        if (u) { const a = new Audio(resolveAudioUrl(u)); a.preload = 'auto'; a.load(); }
      });
    });
    return () => { active = false; };
  }, []);

  // Música ambiente da arena
  useEffect(() => {
    const m = matchRef.current;
    if (!m || m.status !== 'playing') return;
    const musicUrl = m.arena?.battleMusicUrl;
    if (musicUrl && !musicAudioRef.current) {
      const a = new Audio(resolveAudioUrl(musicUrl));
      a.loop = true;
      a.volume = (m.arena?.battleMusicVolume ?? 0.5) / 10;
      a.play().catch(() => {});
      musicAudioRef.current = a;
    }
  }, [match?.id, match?.status]);

  // Para as músicas ao desmontar (fallback do fade)
  useEffect(() => {
    return () => {
      if (musicAudioRef.current) { musicAudioRef.current.pause(); musicAudioRef.current = null; }
      if (celebrationAudioRef.current) { celebrationAudioRef.current.pause(); celebrationAudioRef.current = null; }
    };
  }, []);

  // Espectador: registra no duelo e sai ao fechar
  useEffect(() => {
    if (!isSpectator || !matchId) return;
    joinSpectator(matchId, userData.uid, userData.name, userData.avatarConfig);
    return () => { leaveSpectator(matchId, userData.uid); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSpectator, matchId]);

  // Libera a trava na troca de questão (não depende do realtime, evitando cliques perdidos)
  useEffect(() => {
    setAnswerLock(false);
    setMyLocalAnswer(null);
  }, [match?.current_question_index, match?.id]);

  // Transição FF7 de ENTRADA quando o duelo começa (os dois iniciaram) — UMA única vez
  useEffect(() => {
    if (match?.status === 'playing' && !transitionDoneRef.current && !isSpectator) {
      transitionDoneRef.current = true;
      setTransition('enter');
    }
  }, [match?.status, isSpectator]);

  // Detecção de ataque/vencedor da última questão -> animação de lunge/ataque + sons.
  // Para o ESPECTADOR, dispara o golpe no lado correspondente (player1 esquerda / player2 direita)
  // a partir do last_winner_id (o 'answered' no banco dura menos que o realtime, então não aparece).
  useEffect(() => {
    const m = match;
    if (!m || !m.last_winner_id || m.status === 'finished') return;
    const at = m.last_winner_at || 0;
    const prev = lastWinnerRef.current;
    const isNew = prev.id !== m.last_winner_id || (prev.id === m.last_winner_id && at > prev.at);
    if (!isNew) return;
    lastWinnerRef.current = { id: m.last_winner_id, at };
    if (Date.now() - at > 2500) return;

    const winnerIsP1 = m.last_winner_id === m.challenger_id;
    if (isSpectator) {
      if (winnerIsP1) {
        setSpecLeftAttack(true);
        setTimeout(() => setSpecLeftAttack(false), 900);
        setSpecRightHurt(true);
        setTimeout(() => setSpecRightHurt(false), 650);
      } else {
        setSpecRightAttack(true);
        setTimeout(() => setSpecRightAttack(false), 900);
        setSpecLeftHurt(true);
        setTimeout(() => setSpecLeftHurt(false), 650);
      }
    } else {
      const winnerIsMe = m.last_winner_id === uid;
      if (winnerIsMe) {
        setLungeMe(true);
        setTimeout(() => setLungeMe(false), 900);
        setHurtThem(true);
        setTimeout(() => setHurtThem(false), 650);
      } else {
        setLungeThem(true);
        setTimeout(() => setLungeThem(false), 900);
        setHurtMe(true);
        setTimeout(() => setHurtMe(false), 650);
      }
    }
    const winnerItems = (winnerIsP1 ? m.player1?.equippedItems : m.player2?.equippedItems) || [];
    const weaponSound = (winnerItems as any[]).find((i: any) => i.battleSoundUrl)?.battleSoundUrl;
    playSound(resolveAudioUrl(weaponSound || battleSoundsRef.current.punch), 0.8);
    const loserGender = (winnerIsP1 ? m.player2?.avatarConfig?.gender : m.player1?.avatarConfig?.gender) || 'male';
    playSound(resolveAudioUrl(damageSoundsRef.current[loserGender === 'female' ? 'female' : 'male']), 0.8);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match?.last_winner_at, match?.last_winner_id, match?.status, isSpectator]);

  // Fim do duelo: SONS (o visual do fatal é derivado do tempo de finished_at no render).
  useEffect(() => {
    if (match?.status !== 'finished') return;
    const won = match.winner_id === uid;
    const draw = match.winner_id === null;
    if (draw) {
      playSound(resolveAudioUrl(battleSoundsRef.current.fail), 0.9);
      return;
    }
    // Fatalidade determinística (mesma nas DUAS telas)
    const death = (() => {
      const s = (match.id || 'x') + '_' + (match.last_winner_at || 0);
      let h = 0;
      for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
      return FATALS[h % FATALS.length];
    })();
    setFatalChoice(death);
    if (!won) {
      // Som de derrota SÓ quando o placar aparecer (~8.5s), não antes do fatality
      setTimeout(() => playSound(resolveAudioUrl(battleSoundsRef.current.fail), 0.9), 8500);
    }
    // (a música de vitória NÃO toca aqui — só o loop da comemoração em t2, uma única vez)
    // Som do golpe fatal no momento do strike (~3s)
    const fatalSoundMap: Record<string, string> = {
      'death-fall': battleSoundsRef.current.fatalFall,
      'death-slice': battleSoundsRef.current.fatalSlice,
      'death-evaporate': battleSoundsRef.current.fatalEvaporate,
      'death-explode': battleSoundsRef.current.fatalExplode,
    };
    const t1 = setTimeout(() => playSound(resolveAudioUrl(fatalSoundMap[death] || battleSoundsRef.current.punch), 0.9), 3000);
    // Comemoração do vencedor (música de vitória UMA vez, em loop)
    const t2 = setTimeout(() => {
      if (won && !celebrationAudioRef.current) {
        const v = battleSoundsRef.current.victory;
        if (v) {
          const a = new Audio(resolveAudioUrl(v));
          a.loop = true;
          a.volume = 0.9;
          a.play().catch(() => {});
          celebrationAudioRef.current = a;
        }
      }
    }, 5500);
    return () => { clearTimeout(t1); clearTimeout(t2); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match?.status, match?.id]);

  // Fade out de todas as músicas ao sair (só navega quando parar)
  const fadeAndStopMusic = () => {
    const els = [musicAudioRef.current, celebrationAudioRef.current].filter(Boolean) as HTMLAudioElement[];
    if (els.length === 0) { onExit(); return; }
    let remaining = els.length;
    const done = () => { remaining--; if (remaining === 0) onExit(); };
    els.forEach(a => {
      const orig = a.volume || 0.8;
      const step = orig / 12;
      const iv = setInterval(() => {
        if (a.volume - step <= 0.02) {
          a.pause();
          a.currentTime = 0;
          clearInterval(iv);
          done();
        } else {
          a.volume = Math.max(0, a.volume - step);
        }
      }, 70);
    });
  };

  const refresh = useCallback(async () => {
    const m = await getPvpMatch(matchId);
    if (m) {
      setMatch(m);
      if (m.status === 'playing' && !isSpectator) {
        await tickPvp(m, uid);
      }
    }
  }, [matchId, uid, isSpectator]);

  useEffect(() => {
    refresh();
    const unsub = subscribePvpMatch(matchId, (m) => {
      if (!m) return;
      setMatch(m);
      if (m.status === 'playing' && !isSpectator) tickPvp(m, uid);
    });
    const timer = setInterval(() => {
      setNow(Date.now());
      const m = matchRef.current;
      if (m && m.status === 'playing' && !isSpectator) tickPvp(m, uid);
      // Fallback do realtime: re-busca o estado a cada ~3s para não ficar preso
      // (ex.: o outro lado finalizou mas o update de 'finished' não chegou aqui).
      const t = Date.now();
      if (m && t - lastFetchRef.current > 3000) {
        lastFetchRef.current = t;
        refresh();
      }
    }, 1000);
    return () => { unsub(); clearInterval(timer); };
  }, [matchId, uid, refresh]);

  if (!match) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
        Carregando duelo...
      </div>
    );
  }

  const role = myRoleInMatch(match, isSpectator && watchUid ? watchUid : uid);
  const me: PvpPlayerState | null = match[role];
  const them: PvpPlayerState | null = match[opponentRole(role)];
  const arenaBg = arenaBgRef.current || match?.arena?.battleBgUrl || match?.arena?.battle_bg_url || '';
  const arena = match.arena || {};
  const lungePx = Math.max(20, Math.round(attackDist * 0.45));
  const p1Won = match.status === 'finished' && !!match.winner_id && match.winner_id === match.challenger_id;
  const isP1 = role === 'player1';
  // MEU boneco: sempre meu avatar/itens reais; adversário: dados reais buscados (fallback do match)
  const myConfig = (myRealConfig && Object.keys(myRealConfig).length > 0) ? myRealConfig : (isP1 ? p1Config : p2Config);
  const myEquip = myRealEquip.length ? myRealEquip : (isP1 ? p1Equip : p2Equip);
  const themConfig = (oppRealConfig && Object.keys(oppRealConfig).length > 0) ? oppRealConfig : (isP1 ? p2Config : p1Config);
  const themEquip = oppRealEquip.length ? oppRealEquip : (isP1 ? p2Equip : p1Equip);

  // Ainda não começou
  if (match.status === 'challenged' || match.status === 'accepted') {
    const themReady = them?.ready;
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem', background: 'var(--bg-dark)', padding: '2rem' }}>
        <Swords size={48} color="var(--gold-primary)" />
        <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>
          {match.status === 'accepted' ? 'Duelo aceito!' : 'Aguardando o desafio ser aceito...'}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <AvatarCharacter config={p1Config} equippedItems={p1Equip} size={70} animation="idle" interactive={false} />
          <span style={{ fontSize: '1.6rem', fontWeight: '900', color: '#f43f5e' }}>VS</span>
          <AvatarCharacter config={p2Config} equippedItems={p2Equip} size={70} animation="idle" interactive={false} />
        </div>
        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          {themReady ? 'O adversário está pronto — aguardando você iniciar.' : 'Você está pronto. O duelo inicia quando os dois confirmarem.'}
        </div>
        <button onClick={fadeAndStopMusic} style={{ padding: '0.6rem 2rem', background: 'var(--btn-bg)', color: 'var(--text-primary)', border: '1px solid var(--border-glass)', borderRadius: '10px', cursor: 'pointer' }}>Voltar</button>
      </div>
    );
  }

  // Resultado final
  if (match.status === 'finished' || match.status === 'cancelled') {
    if (match.status === 'cancelled') {
      return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem', background: 'var(--bg-dark)', padding: '2rem' }}>
          <div style={{ fontSize: '1.3rem', fontWeight: '900', color: '#94a3b8' }}>Duelo cancelado</div>
          <button onClick={fadeAndStopMusic} style={{ padding: '0.7rem 2rem', background: 'var(--gold-primary)', color: 'var(--text-on-gold, #000)', border: 'none', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer' }}>Voltar</button>
        </div>
      );
    }
    const won = match.winner_id === uid;
    const draw = match.winner_id === null;
    // Fase derivada do tempo (ancorada quando o cliente viu o fim) — taunt 3s, strike, celebrate, result
    const fatalElapsed = fatalStartRef.current ? Math.max(0, Date.now() - fatalStartRef.current) : 0;
    const phase: 'taunt' | 'strike' | 'celebrate' | 'result' =
      fatalElapsed < 3000 ? 'taunt' : fatalElapsed < 5500 ? 'strike' : fatalElapsed < 8500 ? 'celebrate' : 'result';
    const showResult = match.status === 'cancelled' || phase === 'result' || draw;

    if (!showResult) {
      // Sequência final: EU sempre à ESQUERDA, oponente à DIREITA.
      // Suspense ("Eu venci") -> teletransporte + golpe fatal -> comemoração na arena
      const meWon = match.winner_id === (isSpectator && watchUid ? watchUid : uid);
      const loserAnim = fatalChoice;
      // Espectador: visão NEUTRA (player1 esquerda, player2 direita), vencedor por p1Won.
      const fatalLeftWon = isSpectator ? p1Won : meWon;
      // Igual à missão normal: perdedor inteiro no suspense, toma o golpe (hurt),
      // e a MORTE é feita pela classe CSS (anim-death-* / death-slice-*), com o boneco em idle.
      const loserHurt = phase === 'strike' && fatalElapsed < 3700;
      const loserDying = (phase === 'strike' && fatalElapsed >= 3700) || phase === 'celebrate';
      const loserDeathClass = loserAnim === 'death-fall' ? 'anim-death-fall'
        : loserAnim === 'death-evaporate' ? 'anim-death-evaporate'
        : loserAnim === 'death-explode' ? 'anim-death-explode'
        : '';
      const winnerAnim = phase === 'taunt' ? 'victory-mid' : (phase === 'strike' ? 'attack-fatal' : 'victory-mid');
      // Configs: neutro (p1/p2) para espectador; me/them para participante.
      const fatalLeftConfig = isSpectator ? p1Config : myConfig;
      const fatalRightConfig = isSpectator ? p2Config : themConfig;
      const fatalLeftEquip = isSpectator ? p1Equip : myEquip;
      const fatalRightEquip = isSpectator ? p2Equip : themEquip;

      const renderLoser = (config: any, equip: any[], role: 'player' | 'enemy' = 'player') => {
        const baseChar = <AvatarCharacter config={config} equippedItems={equip} size={170} animation={loserHurt ? 'hurt' : 'idle'} interactive={false} role={role} />;
        if (loserAnim === 'death-slice' && loserDying) {
          return (
            <div style={{ position: 'relative' }}>
              <div className="death-slice-left" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>{baseChar}</div>
              <div className="death-slice-right" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>{baseChar}</div>
            </div>
          );
        }
        return (
          <div className={loserDying ? loserDeathClass : ''} style={{ position: 'relative', transformOrigin: 'bottom center' }}>
            {baseChar}
          </div>
        );
      };
      const meLunge = phase === 'strike' && fatalLeftWon;
      const themLunge = phase === 'strike' && !fatalLeftWon;
      const teleportPx = Math.max(40, Math.round(attackDist * 0.7));
      const leftName = isSpectator ? match.player1?.name : me?.name;
      const rightName = isSpectator ? match.player2?.name : them?.name;
      return (
        <div style={{ minHeight: '100vh', height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-dark)', position: 'relative', overflow: 'hidden' }}>
          <div style={{ flex: 1, position: 'relative', overflow: 'hidden', backgroundColor: '#0b1220' }}>
            {arenaBg && <img src={arenaBg} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', zIndex: 0, pointerEvents: 'none' }} />}
            {/* Emojis de torcida durante o fatal/celebração */}
          {visibleEmojis.length > 0 && (
            <div style={{ position: 'absolute', inset: 0, zIndex: 5, pointerEvents: 'none', overflow: 'hidden' }}>
              {visibleEmojis.map((e: any, i: number) => (
                <div key={`${e.uid}-${e.at}`} className="pvp-emoji-float"
                  style={{ left: `${30 + (i * 18) % 40}%`, bottom: '42%', animationDelay: `${(i % 4) * 0.12}s` }}>
                  <span className="pvp-emoji-char">{e.emoji}</span>
                  <span className="pvp-emoji-name">{abbreviate(e.name)}</span>
                </div>
              ))}
            </div>
          )}
          <div style={{ position: 'absolute', inset: 0, background: phase === 'strike' ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0.15)', zIndex: 1 }} />
            <div style={{ position: 'absolute', inset: 0, zIndex: 2, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-around', gap: `${arenaGap}px` }}>
              {/* JOGADOR 1 — esquerda */}
              <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingBottom: '0.5rem', transform: meLunge ? `translateX(${teleportPx}px)` : 'none', transition: 'transform 0.35s ease-in' }}>
                {fatalLeftWon
                  ? <AvatarCharacter config={fatalLeftConfig} equippedItems={fatalLeftEquip} size={170} animation={winnerAnim} interactive={false} />
                  : renderLoser(fatalLeftConfig, fatalLeftEquip)}
                {phase === 'taunt' && fatalLeftWon && (
                  <div style={{ marginTop: '0.3rem', textAlign: 'center', background: 'rgba(0,0,0,0.75)', color: '#fbbf24', fontWeight: '900', padding: '0.3rem 0.8rem', borderRadius: '10px', fontSize: '0.9rem' }}>💪 Eu venci!</div>
                )}
                <div style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#fbbf24', background: 'rgba(0,0,0,0.6)', padding: '0.15rem 0.6rem', borderRadius: '6px', marginTop: '0.2rem' }}>{abbreviate(leftName)}</div>
              </div>
              {/* JOGADOR 2 — direita */}
              <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingBottom: '0.5rem', transform: themLunge ? `translateX(-${teleportPx}px)` : 'none', transition: 'transform 0.35s ease-in' }}>
                {fatalLeftWon
                  ? renderLoser(fatalRightConfig, fatalRightEquip, 'enemy')
                  : <AvatarCharacter config={fatalRightConfig} equippedItems={fatalRightEquip} size={170} animation={winnerAnim} interactive={false} role="enemy" />}
                {phase === 'taunt' && !fatalLeftWon && (
                  <div style={{ marginTop: '0.3rem', textAlign: 'center', background: 'rgba(0,0,0,0.75)', color: '#fbbf24', fontWeight: '900', padding: '0.3rem 0.8rem', borderRadius: '10px', fontSize: '0.9rem' }}>💪 Eu venci!</div>
                )}
                <div style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#94a3b8', background: 'rgba(0,0,0,0.6)', padding: '0.15rem 0.6rem', borderRadius: '6px', marginTop: '0.2rem' }}>{abbreviate(rightName)}</div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem', background: 'var(--bg-dark)', padding: '2rem' }}>
        <div style={{ fontSize: '1.4rem', fontWeight: '900', color: won ? '#fbbf24' : (draw ? '#94a3b8' : '#f87171') }}>
          {isSpectator
            ? (draw ? '🤝 EMPATE' : `🏆 ${abbreviate(match.winner_id === match.player1?.uid ? match.player1?.name : match.player2?.name)} venceu!`)
            : (won ? '🏆 VITÓRIA!' : draw ? '🤝 EMPATE' : '💀 DERROTA')}
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '1.5rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <AvatarCharacter config={p1Config} equippedItems={p1Equip} size={70} animation={p1Won ? 'victory-mid' : (draw ? 'idle' : 'death-fall')} interactive={false} />
            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>{abbreviate(match.player1?.name)}</div>
          </div>
          <div style={{ textAlign: 'center', paddingBottom: '0.5rem' }}>
            <div style={{ fontSize: '2rem', fontWeight: '900', color: 'var(--gold-primary)' }}>{match.player1?.score} : {match.player2?.score}</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{match.question_count} perguntas</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <AvatarCharacter config={p2Config} equippedItems={p2Equip} size={70} animation={!p1Won && !draw ? 'victory-mid' : (draw ? 'idle' : 'death-fall')} interactive={false} />
            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>{abbreviate(match.player2?.name)}</div>
          </div>
        </div>
        <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', maxWidth: '420px', textAlign: 'center' }}>
          {isSpectator
            ? (draw ? 'Empate! As apostas foram devolvidas.' : 'Você assistiu ao duelo.')
            : (won ? 'Você venceu o duelo e recebeu as apostas!' :
                draw ? 'Empate! As apostas foram devolvidas.' : 'Você perdeu o duelo.')}
        </div>
        <button onClick={fadeAndStopMusic} style={{ padding: '0.7rem 2rem', background: 'var(--gold-primary)', color: 'var(--text-on-gold, #000)', border: 'none', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer' }}>Voltar</button>
      </div>
    );
  }

  const q = match.questions[match.current_question_index];
  const timeLimitMs = (q?.timeLimit || 20) * 1000;
  const elapsed = Math.max(0, now - (match.question_started_at || now));
  const remaining = Math.max(0, timeLimitMs - elapsed);
  const timePct = Math.min(100, (remaining / timeLimitMs) * 100);

  const myAnswered = me?.answered;
  const themAnswered = them?.answered;

  const handleAnswer = (idx: number) => {
    if (isSpectator || answerLock || myLocalAnswer !== null || !q) return;
    setAnswerLock(true);
    setMyLocalAnswer(idx);
    submitPvpAnswer(match.id, uid, idx);
    setNow(Date.now());
  };

  // Emojis de torcida: espectador dispara para o jogador que está assistindo (1 a cada 5s)
  const handleEmoji = (emoji: string) => {
    if (!isSpectator || !watchUid || !match) return;
    const nowMs = Date.now();
    if (nowMs - lastEmojiRef.current < 5000) return;
    lastEmojiRef.current = nowMs;
    setEmojiCooldown(true);
    setTimeout(() => setEmojiCooldown(false), 5000);
    sendEmoji(match.id, uid, userData.name || 'Espectador', emoji, watchUid);
  };

  const answerDisabled = answerLock || myLocalAnswer !== null;

  // Visão do espectador: mostra os DOIS jogadores de forma neutra (player1 esquerda,
  // player2 direita), sem "meu" personagem. Participante: eu à esquerda, oponente à direita.
  const left = isSpectator ? match.player1 : me;
  const right = isSpectator ? match.player2 : them;
  const leftConfig = isSpectator ? p1Config : myConfig;
  const rightConfig = isSpectator ? p2Config : themConfig;
  const leftEquip = isSpectator ? p1Equip : myEquip;
  const rightEquip = isSpectator ? p2Equip : themEquip;
  const leftAnswered = isSpectator ? (specLeftAttack || !!match.player1?.answered) : (lungeMe || !!myAnswered);
  const rightAnswered = isSpectator ? (specRightAttack || !!match.player2?.answered) : (lungeThem || !!themAnswered);
  const leftHurt = isSpectator ? specLeftHurt : hurtMe;
  const rightHurt = isSpectator ? specRightHurt : hurtThem;
  const leftLunge = isSpectator ? specLeftAttack : lungeMe;
  const rightLunge = isSpectator ? specRightAttack : lungeThem;

  return (
    <div style={{ minHeight: '100vh', height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-dark)', position: 'relative', overflow: 'hidden' }}>
      {/* Barra superior */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.6rem 1rem', background: 'var(--btn-bg)', borderBottom: '1px solid var(--border-glass)', zIndex: 30 }}>
        <button onClick={fadeAndStopMusic} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem' }}><ChevronLeft size={18} /> Sair</button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: isSpectator ? '#10b981' : 'var(--gold-primary)', fontWeight: 'bold' }}><Swords size={18} /> {isSpectator ? 'Assistindo Duelo' : 'Duelo'}</div>
        <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{match.current_question_index + 1}/{match.questions.length}</div>
      </div>

      {/* Arena */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', backgroundColor: '#0b1220' }}>
        {arenaBg && (
          <img src={arenaBg} alt="" onError={(e) => console.error('[PvP] falha ao carregar fundo:', arenaBg)}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', zIndex: 0, pointerEvents: 'none' }} />
        )}
        {/* Espectadores (figuras pequenas vibrando ao fundo) */}
        {(() => {
          const specs = (match.spectators || []).filter((s: any) => s.uid !== uid && s.uid !== match.player1?.uid && s.uid !== match.player2?.uid);
          if (specs.length === 0) return null;
          return (
            <div style={{ position: 'absolute', top: '0.4rem', left: '50%', transform: 'translateX(-50%)', zIndex: 3, display: 'flex', gap: '0.35rem', alignItems: 'flex-end' }}>
              {specs.map((s: any) => (
                <div key={s.uid} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', animation: 'pvp-bob 0.6s ease-in-out infinite alternate' }}>
                  <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#8b5cf6', border: '1px solid rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '0.6rem', fontWeight: 'bold' }}>
                    {(s.name || 'S')[0].toUpperCase()}
                  </div>
                  <span style={{ fontSize: '0.5rem', color: '#a78bfa', background: 'rgba(0,0,0,0.6)', padding: '0 3px', borderRadius: '4px', whiteSpace: 'nowrap', maxWidth: 60, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {abbreviate(s.name)}
                  </span>
                </div>
              ))}
            </div>
          );
        })()}
        {/* Emojis de torcida flutuando (aparecem e desaparecem, com nome do espectador) */}
        {visibleEmojis.length > 0 && (
          <div style={{ position: 'absolute', inset: 0, zIndex: 6, pointerEvents: 'none', overflow: 'hidden' }}>
            {visibleEmojis.map((e: any, i: number) => (
              <div key={`${e.uid}-${e.at}`} className="pvp-emoji-float"
                style={{ left: `${30 + (i * 18) % 40}%`, bottom: '42%', animationDelay: `${(i % 4) * 0.12}s` }}>
                <span className="pvp-emoji-char">{e.emoji}</span>
                <span className="pvp-emoji-name">{abbreviate(e.name)}</span>
              </div>
            ))}
          </div>
        )}
        <div style={{ position: 'absolute', inset: 0, zIndex: 1, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-around', gap: `${arenaGap}px` }}>
          <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingBottom: '0.5rem', transform: leftLunge ? `translateX(${lungePx}px)` : 'none', transition: 'transform 0.18s ease-in' }}>
            <AvatarCharacter config={leftConfig} equippedItems={leftEquip} size={170} animation={leftAnswered ? 'attack' : (leftHurt ? 'hurt' : 'idle')} interactive={false} hurt={leftHurt} />
            <div style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#fbbf24', background: 'rgba(0,0,0,0.6)', padding: '0.15rem 0.6rem', borderRadius: '6px', marginTop: '0.2rem' }}>{abbreviate(left?.name)}</div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '0.3rem' }}>
              <div style={{ fontSize: '1.3rem', fontWeight: '900', color: 'var(--gold-primary)' }}>{left?.score}</div>
              <div style={{ display: 'flex', gap: '2px' }}>
                {Array.from({ length: left?.maxHp || 3 }).map((_, i) => (
                  <Heart key={i} size={16} fill={i < (left?.hp || 0) ? '#ef4444' : 'transparent'} color={i < (left?.hp || 0) ? '#ef4444' : '#444'} />
                ))}
              </div>
            </div>
          </div>
          <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingBottom: '0.5rem', transform: rightLunge ? `translateX(-${lungePx}px)` : 'none', transition: 'transform 0.18s ease-in' }}>
            <AvatarCharacter config={rightConfig} equippedItems={rightEquip} size={170} animation={rightAnswered ? 'attack' : (rightHurt ? 'hurt' : 'idle')} interactive={false} hurt={rightHurt} role="enemy" />
            <div style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#94a3b8', background: 'rgba(0,0,0,0.6)', padding: '0.15rem 0.6rem', borderRadius: '6px', marginTop: '0.2rem' }}>{abbreviate(right?.name)}</div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '0.3rem' }}>
              <div style={{ fontSize: '1.3rem', fontWeight: '900', color: '#94a3b8' }}>{right?.score}</div>
              <div style={{ display: 'flex', gap: '2px' }}>
                {Array.from({ length: right?.maxHp || 3 }).map((_, i) => (
                  <Heart key={i} size={16} fill={i < (right?.hp || 0) ? '#ef4444' : 'transparent'} color={i < (right?.hp || 0) ? '#ef4444' : '#444'} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Pergunta */}
      <div style={{ zIndex: 20, padding: '1rem', borderTop: '1px solid var(--border-glass)', background: 'rgba(10,12,20,0.92)', backdropFilter: 'blur(6px)' }}>
        <div style={{ height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', overflow: 'hidden', marginBottom: '0.75rem' }}>
          <div style={{ height: '100%', background: timePct > 25 ? '#f59e0b' : '#ef4444', width: `${timePct}%`, transition: 'width 0.3s linear' }} />
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.75rem' }}>
          {q?.imageUrl && <img src={q.imageUrl} alt="" style={{ width: '70px', height: '70px', objectFit: 'contain', borderRadius: '8px', background: '#000', border: '1px solid var(--border-glass)' }} />}
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 'bold', fontSize: '1rem', color: 'var(--text-primary)' }} dangerouslySetInnerHTML={{ __html: q?.title || '' }} />
            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
              {themAnswered ? 'Adversário respondeu ✓' : 'Aguardando respostas...'}
            </div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
          {isSpectator ? (
            <div style={{ gridColumn: '1 / -1', padding: '1rem', textAlign: 'center', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.4)', borderRadius: '10px', color: '#10b981', fontSize: '0.85rem', fontWeight: 'bold' }}>
              👁 Você está assistindo este duelo como espectador.
            </div>
          ) : (
            <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              {(q?.options || []).map((opt: any, i: number) => {
                const selectedMine = myLocalAnswer === i;
                return (
                  <button key={i} onClick={() => handleAnswer(i)} disabled={answerDisabled}
                    style={{ padding: '0.7rem', borderRadius: '10px', border: selectedMine ? '2px solid #10b981' : '1px solid var(--border-glass)', background: selectedMine ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.04)', color: 'var(--text-primary)', cursor: answerDisabled ? 'default' : 'pointer', fontSize: '0.9rem', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {opt?.imageUrl && <img src={opt.imageUrl} alt="" style={{ width: 30, height: 30, objectFit: 'contain', borderRadius: 4 }} />}
                    <span dangerouslySetInnerHTML={{ __html: opt?.text || '' }} />
                  </button>
                );
              })}
            </div>
          )}
          {isSpectator && (
            <div style={{ gridColumn: '1 / -1', marginTop: '0.6rem' }}>
              <div style={{ fontSize: '0.65rem', color: '#34d399', fontWeight: 'bold', marginBottom: '0.35rem', textAlign: 'center' }}>
                Torça para o jogador que está assistindo {emojiCooldown ? '· aguarde 5s' : ''}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', justifyContent: 'center' }}>
                {PVP_EMOJIS.map((em) => (
                  <button key={em.id} disabled={emojiCooldown} onClick={() => handleEmoji(em.emoji)} title={em.label}
                    style={{ width: 38, height: 38, borderRadius: '10px', fontSize: '1.1rem', cursor: emojiCooldown ? 'default' : 'pointer', background: emojiCooldown ? 'rgba(255,255,255,0.05)' : 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.4)', opacity: emojiCooldown ? 0.45 : 1, transition: 'transform 0.1s', filter: emojiCooldown ? 'grayscale(0.7)' : 'none' }}>
                    {em.emoji}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Transição de entrada estilo FF7 ao iniciar o duelo */}
      <BattleTransition
        active={transition !== 'none'}
        direction={transition === 'exit' ? 'exit' : 'enter'}
        onComplete={() => setTransition('none')}
      />
    </div>
  );
}