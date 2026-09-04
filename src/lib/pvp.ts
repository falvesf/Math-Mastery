import { supabase } from './supabase';
import { getRankForXp, RANKS } from './ranks';
import { orderEffectFirst } from './damageEffects';

// ============ Tipos ============

export type PvpBetType = 'none' | 'coins' | 'item';

export interface PvpBet {
  type: PvpBetType;
  coins?: number;
  item?: {
    userItemId: string; // id do registro em user_items (removido no escrow)
    itemId: string;
    itemTitle: string;
    imageUrl: string;
    rarity?: string;
    avatarPart?: string;
    gameEffect?: string;
    data: any; // snapshot completo do data do item (para transferir depois)
  };
}

export interface PvpBetConfig {
  challenger: PvpBet;
  opponent: PvpBet;
}

export interface PvpPlayerState {
  uid: string;
  name: string;
  hp: number;
  maxHp: number;
  score: number;
  ready: boolean;
  answered: boolean;
  answerIndex: number; // -1 = não respondeu
  answerTime: number; // ms desde o início da questão
  isCorrect: boolean;
  lastSeen: number; // epoch ms — heartbeat p/ detectar desconexão
  avatarConfig: any;
  equippedItems: any[];
}

export interface PvpMatch {
  id: string;
  challenger_id: string;
  opponent_id: string;
  challenger_name: string;
  opponent_name: string;
  status: 'challenged' | 'accepted' | 'playing' | 'finished' | 'cancelled';
  arena: any;
  question_count: number;
  bet: PvpBetConfig;
  questions: any[];
  player1: PvpPlayerState;
  player2: PvpPlayerState;
  current_question_index: number;
  question_started_at: number;
  winner_id: string | null;
  last_winner_id: string | null;
  last_winner_at: number;
  cancelled_by: string | null;
  challenger_last_seen: number;
  opponent_last_seen: number;
  fatal_death: string | null;
  spectators: { uid: string; name: string; avatarConfig: any }[];
  match_emojis: { uid: string; name: string; emoji: string; targetUid: string; at: number }[];
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  updated_at: string | null;
}

// ============ Helpers de conversão ============

// Converte linhas de user_items (equipados) para o formato EquippedItem usado pelo AvatarCharacter
// (igual ao Dashboard/QuestGameplay) — garante armas/aparência corretas no duelo.
export function normalizeEquippedItems(userItemRows: any[]): any[] {
  const out: any[] = [];
  (userItemRows || []).forEach((d: any) => {
    const data = d.data || {};
    if (data.avatarPart && (data.itemImageUrl || data.minecraftHeadValue || data.gameModelUrl)) {
      let parsedAdds: any[] = [];
      if (data.adds) {
        try { parsedAdds = typeof data.adds === 'string' ? JSON.parse(data.adds) : data.adds; } catch (e) { parsedAdds = []; }
      }
      parsedAdds = orderEffectFirst(parsedAdds);
      out.push({
        docId: d.id,
        itemId: d.item_id,
        imageUrl: data.itemImageUrl,
        avatarPart: data.avatarPart,
        itemTitle: data.itemTitle,
        itemCategory: data.itemCategory,
        baseAttributeType: data.baseAttributeType,
        baseAttributeValue: data.baseAttributeValue,
        adds: parsedAdds,
        gameModelUrl: data.gameModelUrl,
        modelTextureUrl: data.modelTextureUrl,
        minecraftHeadValue: data.minecraftHeadValue,
        modelTransforms: data.modelTransforms,
        backColor: data.backColor || '',
        customAnimation: data.customAnimation,
        battleSoundUrl: data.battleSoundUrl,
        damageEffect: data.damageEffect || 'none',
      });
    }
  });
  return out;
}

// Normaliza a arena (quest) — aceita snake_case e camelCase para o fundo/áudio.
export function normalizeArena(arena: any): any {
  const a = arena || {};
  return {
    ...a,
    battleBgUrl: a.battleBgUrl || a.battle_bg_url || '',
    battleBgPosX: a.battleBgPosX ?? a.battle_bg_pos_x ?? 0,
    battleBgPosY: a.battleBgPosY ?? a.battle_bg_pos_y ?? 0,
    battleBgScale: a.battleBgScale ?? a.battle_bg_scale ?? 1,
    battleBgMoveEnabled: a.battleBgMoveEnabled ?? a.battle_bg_move_enabled ?? false,
    battleBgMoveDirection: a.battleBgMoveDirection ?? a.battle_bg_move_direction ?? 'left',
    battleBgMoveSpeed: a.battleBgMoveSpeed ?? a.battle_bg_move_speed ?? 10,
    battleBgMoveDuration: a.battleBgMoveDuration ?? a.battle_bg_move_duration ?? 30,
    battleMusicUrl: a.battleMusicUrl || a.battle_music_url || '',
    battleMusicVolume: a.battleMusicVolume ?? a.battle_music_volume ?? 0.5,
  };
}

function mapRow(row: any): PvpMatch | null {
  if (!row) return null;
  return {
    id: row.id,
    challenger_id: row.challenger_id,
    opponent_id: row.opponent_id,
    challenger_name: row.challenger_name,
    opponent_name: row.opponent_name,
    status: row.status,
    arena: row.arena || {},
    question_count: row.question_count || 5,
    bet: row.bet || { challenger: { type: 'none' }, opponent: { type: 'none' } },
    questions: row.questions || [],
    player1: row.player1 || null,
    player2: row.player2 || null,
    current_question_index: row.current_question_index || 0,
    question_started_at: row.question_started_at || 0,
    winner_id: row.winner_id,
    last_winner_id: row.last_winner_id || null,
    last_winner_at: row.last_winner_at || 0,
    cancelled_by: row.cancelled_by || null,
    challenger_last_seen: row.challenger_last_seen || 0,
    opponent_last_seen: row.opponent_last_seen || 0,
    fatal_death: row.fatal_death || null,
    spectators: row.spectators || [],
    match_emojis: row.match_emojis || [],
    created_at: row.created_at,
    started_at: row.started_at,
    finished_at: row.finished_at,
    updated_at: row.updated_at || null,
  };
}

export function myRoleInMatch(match: PvpMatch, uid: string): 'player1' | 'player2' {
  return match.challenger_id === uid ? 'player1' : 'player2';
}

export function opponentRole(role: 'player1' | 'player2'): 'player1' | 'player2' {
  return role === 'player1' ? 'player2' : 'player1';
}

// ============ Dados do banco ============

export async function fetchAvailableQuestions(): Promise<any[]> {
  try {
    // O duelo usa perguntas de QUALQUER tenant (banco geral).
    const { data } = await supabase.from('question_bank').select('*');
    return data || [];
  } catch (e) {
    console.error('Erro ao buscar banco de questões:', e);
    return [];
  }
}

export async function fetchArenas(tenantId?: string): Promise<any[]> {
  try {
    // Arenas de duelo: inclui TODOS os tenants (gama maior de possibilidades no PvP),
    // além das da própria escola. Deduplica por fundo e ordena por nome.
    const { data } = await supabase.from('quests').select('*');
    const arenas = (data || []).filter((x: any) => (x.battle_bg_url || x.battleBgUrl));
    const seen = new Set<string>();
    const unique = arenas.filter((a: any) => {
      const url = a.battle_bg_url || a.battleBgUrl || '';
      if (seen.has(url)) return false;
      seen.add(url);
      return true;
    });
    return unique.sort((a: any, b: any) =>
      (a.title || a.name || '').localeCompare(b.title || b.name || '')
    );
  } catch (e) {
    console.error('Erro ao buscar arenas:', e);
    return [];
  }
}

// ============ Sorteio ============

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function randomN<T>(arr: T[], n: number): T[] {
  return shuffle(arr).slice(0, n);
}

export function normalizeQuestion(q: any): any {
  // Aceita camelCase e snake_case
  return {
    id: q.id || q._rawId || q.doc_id || `q_${Math.random().toString(36).slice(2)}`,
    title: q.title || q.question || '',
    imageUrl: q.imageUrl || q.image_url || '',
    options: q.options || [],
    correctIndex: typeof q.correctIndex === 'number' ? q.correctIndex : (typeof q.correct_index === 'number' ? q.correct_index : 0),
    category: q.category || '',
    difficulty: q.difficulty || '',
    timeLimit: q.timeLimit || q.time_limit || 20,
  };
}

export function drawQuestions(all: any[], count: number): any[] {
  return randomN(all.map(normalizeQuestion), count);
}

// ============ CRUD da partida ============

export async function getPvpMatch(matchId: string): Promise<PvpMatch | null> {
  const { data } = await supabase.from('pvp_matches').select('*').eq('id', matchId).single();
  return mapRow(data as any);
}

export async function createPvpChallenge(params: {
  tenantId?: string;
  challenger: { uid: string; name: string; avatarConfig: any; equippedItems: any[] };
  opponent: { uid: string; name: string; avatarConfig: any; equippedItems: any[] };
  arena: any;
  questionCount: number;
  bet: PvpBet;
}): Promise<PvpMatch | null> {
  const qs = await fetchAvailableQuestions();
  const questions = drawQuestions(qs, params.questionCount);
  const maxHp1 = await calcMaxHp(params.challenger.uid);
  const maxHp2 = await calcMaxHp(params.opponent.uid);
  const player1: PvpPlayerState = {
    uid: params.challenger.uid, name: params.challenger.name, hp: maxHp1, maxHp: maxHp1, score: 0,
    ready: false, answered: false, answerIndex: -1, answerTime: 0, isCorrect: false, lastSeen: Date.now(),
    avatarConfig: params.challenger.avatarConfig || {},
    equippedItems: params.challenger.equippedItems || [],
  };
  const player2: PvpPlayerState = {
    uid: params.opponent.uid, name: params.opponent.name, hp: maxHp2, maxHp: maxHp2, score: 0,
    ready: false, answered: false, answerIndex: -1, answerTime: 0, isCorrect: false, lastSeen: Date.now(),
    avatarConfig: params.opponent.avatarConfig || {},
    equippedItems: params.opponent.equippedItems || [],
  };
  const { data, error } = await supabase.from('pvp_matches').insert({
    challenger_id: params.challenger.uid,
    opponent_id: params.opponent.uid,
    challenger_name: params.challenger.name,
    opponent_name: params.opponent.name,
    status: 'challenged',
    arena: normalizeArena(params.arena),
    question_count: params.questionCount,
    bet: { challenger: params.bet, opponent: { type: 'none' } },
    questions,
    player1,
    player2,
  }).select().single();
  if (error) {
    console.error('Erro ao criar desafio PvP:', error);
    return null;
  }
  return mapRow(data as any);
}

export async function cancelPvpMatch(matchId: string, uid: string): Promise<void> {
  await supabase.from('pvp_matches')
    .update({ status: 'cancelled', cancelled_by: uid, finished_at: new Date().toISOString() })
    .eq('id', matchId)
    .in('status', ['challenged', 'accepted']);
}

// Recusa explícita do desafiado (o desafiante fica bloqueado temporariamente)
export async function declinePvpMatch(matchId: string, uid: string): Promise<void> {
  await supabase.from('pvp_matches')
    .update({ status: 'cancelled', cancelled_by: uid, finished_at: new Date().toISOString() })
    .eq('id', matchId)
    .in('status', ['challenged', 'accepted']);
}

// ============ Bloqueio por recusas (persistido no dispositivo do desafiante) ============

const PVP_REFUSALS_KEY = 'pvpRefusals';

export function recordPvpRefusal(opponentUid: string): void {
  try {
    const raw = localStorage.getItem(PVP_REFUSALS_KEY);
    const map = raw ? JSON.parse(raw) : {};
    const e = map[opponentUid];
    const count = (e?.count || 0) + 1;
    map[opponentUid] = { count, lastAt: Date.now() };
    localStorage.setItem(PVP_REFUSALS_KEY, JSON.stringify(map));
  } catch (e) { /* ignora */ }
}

// Retorna o tempo restante (ms) de bloqueio para desafiar esse oponente (0 = liberado)
export function getPvpBlockMs(opponentUid: string): number {
  try {
    const raw = localStorage.getItem(PVP_REFUSALS_KEY);
    const map = raw ? JSON.parse(raw) : {};
    const e = map[opponentUid];
    if (!e || !e.lastAt) return 0;
    const cooldownMs = (e.count || 1) * 60 * 1000;
    return Math.max(0, cooldownMs - (Date.now() - e.lastAt));
  } catch {
    return 0;
  }
}

// ============ Fluxo do desafio ============

/**
 * Resolve as apostas finais com a regra de coerência:
 * - Se o DESAFIANTE apostou MOEDAS, o desafiado precisa COBRIR com moedas ≥ N
 *   ou com um ITEM. Se não cobrir (sem itens / sem moedas suficientes), o duelo
 *   acontece SEM apostas de ambos os lados.
 */
export function resolveFinalBets(challengerBet: PvpBet | undefined, opponentBet: PvpBet | undefined): PvpBetConfig {
  const c: PvpBet = challengerBet || { type: 'none' };
  const o: PvpBet = opponentBet || { type: 'none' };
  if (c.type === 'coins') {
    const covers = o.type === 'item' || (o.type === 'coins' && (o.coins || 0) >= (c.coins || 0));
    if (!covers) return { challenger: { type: 'none' }, opponent: { type: 'none' } };
  }
  return { challenger: c, opponent: o };
}

export async function acceptPvpChallenge(matchId: string, opponentBet: PvpBet): Promise<PvpMatch | null> {
  const cur = await getPvpMatch(matchId);
  if (!cur) return null;
  const finalBets = resolveFinalBets(cur.bet?.challenger, opponentBet);
  const { data, error } = await supabase.from('pvp_matches')
    .update({ status: 'accepted', bet: finalBets })
    .eq('id', matchId)
    .in('status', ['challenged', 'accepted'])
    .select().single();
  if (error) { console.error('Erro ao aceitar desafio:', error); return null; }
  return mapRow(data as any);
}

// Escrow das apostas quando a partida começa (função SQL security definer)
async function escrowBets(match: PvpMatch): Promise<void> {
  try {
    await supabase.rpc('pvp_escrow_bets', { p_match_id: match.id });
  } catch (e) {
    console.error('Erro no escrow das apostas:', e);
  }
}

export async function setPvpReady(matchId: string, uid: string, avatarConfig: any, equippedItems: any[], myBet?: PvpBet): Promise<PvpMatch | null> {
  const cur = await getPvpMatch(matchId);
  if (!cur) return null;
  const role = myRoleInMatch(cur, uid);
  const me = cur[role];
  const other = cur[opponentRole(role)];
  // Não sobrescreve com vazio: usa o que veio só se tiver conteúdo real
  const safeConfig = (avatarConfig && Object.keys(avatarConfig).length > 0) ? avatarConfig : me.avatarConfig;
  const safeEquip = (equippedItems && equippedItems.length > 0) ? equippedItems : me.equippedItems;
  const nextMe = { ...me, ready: true, avatarConfig: safeConfig || {}, equippedItems: safeEquip || [], lastSeen: Date.now() };
  const players: any = { player1: cur.player1, player2: cur.player2 };
  players[role] = nextMe;

  const bothReady = nextMe.ready && other.ready;
  const status = bothReady ? 'playing' : 'accepted';
  const nowIso = new Date().toISOString();

  const updater: any = {
    status,
    player1: players.player1,
    player2: players.player2,
    question_started_at: status === 'playing' ? Date.now() : cur.question_started_at,
    started_at: status === 'playing' ? nowIso : cur.started_at,
    updated_at: nowIso,
  };
  // Se o desafiado passou a aposta dele, salva (challenger já tem a dele).
  // Aplica a regra de coerência (moedas precisam ser cobertas por moedas ≥ N ou item).
  if (myBet && role === 'player2') {
    updater.bet = resolveFinalBets(cur.bet?.challenger, myBet);
  }

  const { data, error } = await supabase.from('pvp_matches')
    .update(updater)
    .eq('id', matchId)
    .in('status', ['accepted', 'challenged'])
    .select().single();
  if (error) { console.error('Erro ao marcar pronto:', error); return null; }
  const updated = mapRow(data as any);
  if (updated && updated.status === 'playing') {
    await escrowBets(updated);
  }
  return updated;
}

// ============ Resposta / resolução ============

export async function calcMaxHp(uid: string): Promise<number> {
  try {
    const { data } = await supabase.from('users').select('xp').eq('id', uid).single();
    const xp = data?.xp || 0;
    const rank = getRankForXp(xp);
    const rankIndex = RANKS.findIndex(r => r.name === rank.name);
    const idx = rankIndex < 0 ? 0 : rankIndex;
    return Math.max(3, 3 + Math.floor(idx / 2));
  } catch {
    return 3;
  }
}

export async function submitPvpAnswer(matchId: string, uid: string, answerIndex: number): Promise<void> {
  const cur = await getPvpMatch(matchId);
  if (!cur || cur.status !== 'playing') return;
  const role = myRoleInMatch(cur, uid);
  const me = cur[role];
  if (!me) return;
  if (me.answered) return;
  const q = cur.questions[cur.current_question_index];
  const answerTime = Date.now() - (cur.question_started_at || Date.now());
  const isCorrect = answerIndex === q?.correctIndex;
  const nextMe = { ...me, answered: true, answerIndex, answerTime: Math.max(0, answerTime), isCorrect, lastSeen: Date.now() };
  const players: any = { player1: cur.player1, player2: cur.player2 };
  players[role] = nextMe;
  const col = role === 'player1' ? 'challenger_last_seen' : 'opponent_last_seen';
  const res = await supabase.from('pvp_matches')
    .update({ player1: players.player1, player2: players.player2, [col]: Date.now(), updated_at: new Date().toISOString() })
    .eq('id', matchId)
    .eq('status', 'playing');
  if (res.error) console.error('Erro ao registrar resposta PvP:', res.error);

  // Se a resposta foi CORRETA, resolve IMEDIATAMENTE (o primeiro acerto vence a questão).
  // Se ERRADA, espera o outro responder (retry curto para enxergar a resposta dele).
  // Só avança quando alguém acertou OU ambos responderam.
  for (let i = 0; i < 6; i++) {
    const fresh = await getPvpMatch(matchId);
    if (fresh && fresh.status === 'playing' && fresh.player1 && fresh.player2) {
      const qf = fresh.questions[fresh.current_question_index];
      const c1 = fresh.player1.answered && fresh.player1.answerIndex === qf?.correctIndex;
      const c2 = fresh.player2.answered && fresh.player2.answerIndex === qf?.correctIndex;
      const bothAnswered = fresh.player1.answered && fresh.player2.answered;
      if (c1 || c2 || bothAnswered) {
        await resolveAndAdvance(fresh);
        break;
      }
    }
    await new Promise(r => setTimeout(r, 300));
  }
}

// Busca uma questão de reposição (aleatória, diferente das já usadas)
async function fetchReplacementQuestion(usedIds: string[]): Promise<any | null> {
  try {
    const { data } = await supabase.from('question_bank').select('*');
    const pool = (data || []).map(normalizeQuestion).filter((q: any) => !usedIds.includes(q.id));
    if (pool.length === 0) return null;
    return pool[Math.floor(Math.random() * pool.length)];
  } catch (e) {
    return null;
  }
}

// Resolve a questão atual e avança (CAS-guarded — só um cliente aplica)
async function resolveAndAdvance(match: PvpMatch): Promise<void> {
  const q = match.questions[match.current_question_index];
  if (!q) return;
  const p1 = match.player1;
  const p2 = match.player2;
  // Estado inválido (jogador nulo): NÃO avança nem grava — evita escrever objetos
  // quebrados (sem nome/hp) que fazem o nome virar "?" e os corações zerarem.
  if (!p1 || !p2) return;
  const correct = q.correctIndex;

  const p1Correct = p1.answered && p1.answerIndex === correct;
  const p2Correct = p2.answered && p2.answerIndex === correct;
  // Empate exato: ambos acertaram no mesmo milésimo -> ninguém pontua, substitui a questão
  const tie = p1Correct && p2Correct && Math.abs((p1.answerTime || 0) - (p2.answerTime || 0)) < 2;

  let winnerRole: 'player1' | 'player2' | null = null;
  if (!tie) {
    if (p1Correct && !p2Correct) winnerRole = 'player1';
    else if (p2Correct && !p1Correct) winnerRole = 'player2';
    else if (p1Correct && p2Correct) winnerRole = p1.answerTime <= p2.answerTime ? 'player1' : 'player2';
  }

  const nextP1 = { ...p1, answered: false, answerIndex: -1, answerTime: 0, isCorrect: false };
  const nextP2 = { ...p2, answered: false, answerIndex: -1, answerTime: 0, isCorrect: false };
  if (winnerRole === 'player1') { nextP1.score += 1; nextP2.hp = Math.max(0, nextP2.hp - 1); }
  else if (winnerRole === 'player2') { nextP2.score += 1; nextP1.hp = Math.max(0, nextP1.hp - 1); }

  let questions = match.questions;
  if (tie) {
    const replacement = await fetchReplacementQuestion(questions.map((x: any) => x.id));
    if (replacement) questions = [...questions, replacement];
  }

  const nextIndex = match.current_question_index + 1;
  const lastQuestion = nextIndex >= questions.length;
  const ko = nextP1.hp <= 0 || nextP2.hp <= 0;

  const updater: any = {
    player1: nextP1,
    player2: nextP2,
    last_winner_id: winnerRole ? (winnerRole === 'player1' ? match.challenger_id : match.opponent_id) : null,
    last_winner_at: Date.now(),
    updated_at: new Date().toISOString(),
  };

  if (lastQuestion || ko) {
    let winnerId: string | null = null;
    if (nextP1.hp <= 0) winnerId = match.player2.uid;
    else if (nextP2.hp <= 0) winnerId = match.player1.uid;
    else if (nextP1.score !== nextP2.score) winnerId = nextP1.score > nextP2.score ? match.player1.uid : match.player2.uid;
    // empate -> winnerId null (apostas devolvidas)

    updater.status = 'finished';
    updater.winner_id = winnerId;
    updater.current_question_index = nextIndex;
    updater.questions = questions;
    updater.finished_at = new Date().toISOString();

    const { data, error } = await supabase.from('pvp_matches')
      .update(updater)
      .eq('id', match.id)
      .eq('status', 'playing')
      .eq('current_question_index', match.current_question_index)
      .select();
    if (!error && data && data.length > 0) {
      await settleBets({ ...match, questions, player1: nextP1, player2: nextP2, winner_id: winnerId, status: 'finished' });
    }
  } else {
    updater.current_question_index = nextIndex;
    updater.question_started_at = Date.now();
    if (tie) updater.questions = questions;
    const { error } = await supabase.from('pvp_matches')
      .update(updater)
      .eq('id', match.id)
      .eq('status', 'playing')
      .eq('current_question_index', match.current_question_index);
    if (error) console.error('Erro ao avançar questão PvP:', error);
  }
}

// Verifica se dá para resolver (ambos responderam OU estourou o tempo) e aplica.
export async function tickPvp(match: PvpMatch, myUid: string): Promise<void> {
  // Sempre usa o estado MAIS RECENTE do banco (evita travar por realtime atrasado)
  const fresh = await getPvpMatch(match.id);
  const m = fresh || match;
  if (m.status !== 'playing') return;

  // heartbeat próprio — usa COLUNA separada (não reescreve o player, evitando sobrescrever resposta)
  // Frequência de 10s (antes 4s): cada UPDATE no pvp_matches gera uma mensagem
  // realtime para TODOS os inscritos, então o heartbeat era o maior consumidor.
  // Com tolerância de desconexão de 60s, o heartbeat de 10s ainda detecta
  // quedas reais sem derrubar quem apenas pausou/aba em segundo plano.
  const role = myRoleInMatch(m, myUid);
  const meLastSeen = role === 'player1' ? m.challenger_last_seen : m.opponent_last_seen;
  if (Date.now() - (meLastSeen || 0) > 10000) {
    const col = role === 'player1' ? 'challenger_last_seen' : 'opponent_last_seen';
    await supabase.from('pvp_matches')
      .update({ [col]: Date.now(), updated_at: new Date().toISOString() })
      .eq('id', m.id)
      .eq('status', 'playing');
  }

  // Desconexão do oponente (sem heartbeat por 60s) -> vitória
  const oppLastSeen = role === 'player1' ? m.opponent_last_seen : m.challenger_last_seen;
  if (oppLastSeen && Date.now() - oppLastSeen > 60000) {
    await forceWinByDisconnect(m, m[role].uid);
    return;
  }

  const q = m.questions[m.current_question_index];
  if (!q) return;
  // Estado inválido (jogador nulo) → não resolve/avança para não gravar quebrado
  if (!m.player1 || !m.player2) return;
  const timeLimit = (q?.timeLimit || 20) * 1000;
  const elapsed = Date.now() - (m.question_started_at || Date.now());
  const c1 = m.player1.answered && m.player1.answerIndex === q.correctIndex;
  const c2 = m.player2.answered && m.player2.answerIndex === q.correctIndex;
  const someoneCorrect = c1 || c2;
  const bothAnswered = m.player1.answered && m.player2.answered;
  const timedOut = elapsed >= timeLimit;

  // Resolve quando alguém acertou (primeiro acerto vence) OU ambos responderam OU o tempo esgotou
  if (someoneCorrect || bothAnswered || timedOut) {
    await resolveAndAdvance(m);
  }
}

export async function forceWinByDisconnect(match: PvpMatch, survivorUid: string): Promise<void> {
  const { data, error } = await supabase.from('pvp_matches')
    .update({ status: 'finished', winner_id: survivorUid, finished_at: new Date().toISOString() })
    .eq('id', match.id)
    .eq('status', 'playing')
    .select();
  if (!error && data && data.length > 0) {
    await settleBets({ ...match, winner_id: survivorUid, status: 'finished' });
  }
}

// ============ Liquidação das apostas ============

async function settleBets(match: PvpMatch): Promise<void> {
  try {
    await supabase.rpc('pvp_pay_bets', { p_match_id: match.id, p_winner_id: match.winner_id || null });
  } catch (e) {
    console.error('Erro ao pagar apostas:', e);
  }
}

// ============ Realtime ============

export function subscribePvpMatch(matchId: string, cb: (m: PvpMatch | null) => void) {
  const channel = supabase
    .channel(`pvp_match_${matchId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'pvp_matches', filter: `id=eq.${matchId}` }, async (payload) => {
      cb(mapRow(payload.new as any));
    })
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}

export function subscribeIncomingChallenges(uid: string, cb: (m: PvpMatch) => void) {
  const channel = supabase
    .channel(`pvp_challenges_${uid}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pvp_matches', filter: `opponent_id=eq.${uid}` }, async (payload) => {
      const m = mapRow(payload.new as any);
      if (m && m.status === 'challenged') cb(m);
    })
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}

export async function fetchPendingChallenge(uid: string): Promise<PvpMatch | null> {
  const { data } = await supabase
    .from('pvp_matches')
    .select('*')
    .or(`opponent_id.eq.${uid}`)
    .eq('status', 'challenged')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return mapRow(data as any);
}

// Retorna uid -> matchId das partidas ATIVAS (challenged/accepted/playing) envolvendo
// o usuário e/ou os contatos (para desabilitar o botão de duelo e entrar como espectador).
// Só conta partidas com atualização RECENTE — duelos abandonados não marcam "Em duelo".
export async function fetchActivePvpMap(uid: string, contactUids: string[]): Promise<Record<string, { matchId: string; status: string }>> {
  try {
    const ids = [uid, ...(contactUids || [])].filter(Boolean);
    if (ids.length === 0) return {};
    const { data } = await supabase
      .from('pvp_matches')
      .select('id, challenger_id, opponent_id, status, updated_at')
      .in('status', ['challenged', 'accepted', 'playing'])
      .or(`challenger_id.in.(${ids.join(',')}),opponent_id.in.(${ids.join(',')})`);
    const now = Date.now();
    // 'playing': considera ativo se teve atualização nos últimos 5min (duelo vivo).
    // 'challenged'/'accepted': negociação — janela generosa (10min) para os dois
    // ficarem com o modal de apostas sem serem chamados por outros.
    const map: Record<string, { matchId: string; status: string }> = {};
    (data || []).forEach((r: any) => {
      const upd = r.updated_at ? new Date(r.updated_at).getTime() : 0;
      const freshPlaying = r.status === 'playing' && now - upd < 5 * 60 * 1000;
      const freshNegotiating = (r.status === 'challenged' || r.status === 'accepted') && now - upd < 10 * 60 * 1000;
      if (freshPlaying || freshNegotiating) {
        const entry = { matchId: r.id, status: r.status };
        if (r.challenger_id) map[r.challenger_id] = entry;
        if (r.opponent_id) map[r.opponent_id] = entry;
      }
    });
    return map;
  } catch (e) {
    return {};
  }
}

// ============ Espectadores ============

export async function joinSpectator(matchId: string, uid: string, name: string, avatarConfig: any, watchUid?: string): Promise<void> {
  try {
    await supabase.rpc('pvp_join_spectator', { p_match_id: matchId, p_uid: uid, p_name: name, p_avatar_config: avatarConfig || {}, p_watch_uid: watchUid || uid });
  } catch (e) {
    console.error('Erro ao entrar como espectador:', e);
  }
}

export async function leaveSpectator(matchId: string, uid: string): Promise<void> {
  try {
    await supabase.rpc('pvp_leave_spectator', { p_match_id: matchId, p_uid: uid });
  } catch (e) { /* ignora */ }
}

export async function sendEmoji(matchId: string, fromUid: string, fromName: string, emoji: string, targetUid: string): Promise<void> {
  try {
    await supabase.rpc('pvp_send_emoji', {
      p_match_id: matchId,
      p_uid: fromUid,
      p_name: fromName,
      p_emoji: emoji,
      p_target_uid: targetUid,
      p_at: Date.now(),
    });
  } catch (e) {
    console.error('Erro ao enviar emoji:', e);
  }
}

// ============ Emojis de torcida ============

export const PVP_EMOJIS: { id: string; emoji: string; label: string }[] = [
  { id: 'wink', emoji: '😉', label: 'Piscada' },
  { id: 'heart', emoji: '❤️', label: 'Coração' },
  { id: 'clap', emoji: '👏', label: 'Palmas' },
  { id: 'smile', emoji: '😊', label: 'Sorriso' },
  { id: 'happy', emoji: '😄', label: 'Feliz' },
  { id: 'kiss', emoji: '😘', label: 'Beijinho' },
  { id: 'tongue', emoji: '😛', label: 'Língua pra fora' },
  { id: 'tonguewink', emoji: '😜', label: 'Língua + piscada' },
  { id: 'sunglasses', emoji: '😎', label: 'Óculos de sol' },
  { id: 'wow', emoji: '😮', label: 'Uau' },
  { id: 'confused', emoji: '😕', label: 'Confuso' },
  { id: 'sad', emoji: '😢', label: 'Triste' },
  { id: 'angry', emoji: '😠', label: 'Bravo' },
  { id: 'annoyed', emoji: '😤', label: 'Irritado' },
  { id: 'crying', emoji: '😭', label: 'Chorando' },
];

// ============ Moedas por nº de questões (aposta) ============

export function maxCoinsBetFor(questionCount: number): number {
  return 1000 + Math.max(0, (questionCount - 5)) * 200;
}

// ============ Limite de patente ============

export async function getRankIndex(uid: string): Promise<number> {
  try {
    const { data } = await supabase.from('users').select('xp').eq('id', uid).single();
    const xp = data?.xp || 0;
    const rank = getRankForXp(xp);
    const idx = RANKS.findIndex(r => r.name === rank.name);
    return idx < 0 ? 0 : idx;
  } catch { return 0; }
}

export function ranksWithinTwo(a: number, b: number): boolean {
  return Math.abs(a - b) <= 2;
}

// ============ Recompensa de primeira batalha assistida (espectador) ============

const GIFT_BOX_RE = /caixa\s*de\s*presente|gift\s*box|caixa\s*presente/i;

// Procura o item "Caixa de presente" disponível para a tenant (local ou global)
async function findGiftBoxItem(tenantId?: string): Promise<any | null> {
  try {
    let q = supabase.from('store_items').select('*').eq('active', true);
    if (tenantId) {
      q = q.or(`is_global.eq.true,tenant_id.eq.${tenantId}`);
    } else {
      q = q.eq('is_global', true);
    }
    const { data } = await q;
    return (data || []).find((r: any) => {
      const title = r.data?.title || r.name || '';
      return GIFT_BOX_RE.test(title);
    }) || null;
  } catch (e) {
    return null;
  }
}

export interface SpectateRewardResult {
  awardedFirst: boolean;
  firstPrize: string;
  shareCoins: number;
  sharePrize?: string;
}

// Recompensa grande (1ª vez) só pode ocorrer UMA vez por usuário. Guard na sessão
// (síncrono, antes de qualquer await) evita corridas mesmo com o banco lento.
const firstSpectateClaimed = new Set<string>();

const SPECTATE_COLLECTION = 'spectate_rewards';

// Lê o histórico de recompensas de espectador (system_collections, com fallback legado).
async function readSpectateRewards(uid: string): Promise<any[]> {
  try {
    const { data } = await supabase
      .from('system_collections')
      .select('data')
      .eq('collection_name', SPECTATE_COLLECTION)
      .eq('doc_id', uid)
      .limit(1);
    const d = data?.[0]?.data;
    if (d && Array.isArray(d.rewards)) return d.rewards;
  } catch (e) { /* ignore */ }
  try {
    const { data: u } = await supabase.from('users').select('inventory_preferences').eq('id', uid).single();
    const p = (u?.inventory_preferences as any) || {};
    if (Array.isArray(p.spectateRewards)) return p.spectateRewards;
  } catch (e) { /* ignore */ }
  return [];
}

async function appendSpectateReward(uid: string, rewards: any[]) {
  try {
    await supabase.from('system_collections').delete().eq('collection_name', SPECTATE_COLLECTION).eq('doc_id', uid);
    await supabase.from('system_collections').insert({ collection_name: SPECTATE_COLLECTION, doc_id: uid, tenant_id: null, data: { rewards } });
  } catch (e) {
    console.error('Erro ao gravar histórico de espectador:', e);
  }
}

// Concede um item da loja ao usuário (user_items), com a estrutura padrão.
async function grantStoreItem(spectatorUid: string, item: any, tenantId?: string): Promise<void> {
  const d = item.data || {};
  await supabase.from('user_items').insert({
    student_id: spectatorUid,
    item_id: item.id,
    equipped: false,
    data: {
      itemTitle: d.title || item.name || 'Caixa de Presente',
      itemDescription: d.description || '',
      itemType: d.type || item.type || 'consumable',
      itemImageUrl: d.imageUrl || '',
      gameEffect: d.gameEffect || 'none',
      usableInQuest: d.usableInQuest || false,
      battleSoundUrl: d.battleSoundUrl || '',
      quantity: 1,
      giftedBy: 'Recompensa Espectador PvP',
      avatarPart: d.avatarPart || null,
      itemCategory: d.itemCategory || 'none',
      baseAttributeType: d.baseAttributeType || 'none',
      baseAttributeValue: d.baseAttributeValue || 0,
      gameModelUrl: d.gameModelUrl || '',
      modelTextureUrl: d.modelTextureUrl || '',
      minecraftHeadValue: d.minecraftHeadValue || '',
      modelTransforms: d.modelTransforms || null,
      adds: [],
      rarity: d.rarity || 'common',
    },
    tenant_id: item.tenant_id || tenantId || null,
  });
}

/**
 * Recompensas de espectador ao ver uma luta COMPLETA (status finished):
 * - 1ª vez (uma única vez): +100 moedas + Caixa de Presente, ou +200 moedas
 *   se a tenant não tiver a caixa cadastrada.
 * - Demais vezes: percentual de 0,25% do total de apostas (moedas) DIVIDIDO pelo
 *   número de espectadores torcendo do lado do VENCEDOR, apenas se o espectador
 *   estiver torcendo pelo vencedor (watchUid === winner_id). Torcendo pelo
 *   perdedor → nenhuma recompensa.
 */
export async function awardSpectateRewards(
  match: PvpMatch,
  spectatorUid: string,
  tenantId?: string
): Promise<SpectateRewardResult> {
  try {
    // Guard da recompensa GRANDE: campo direto no banco (users.spectate_rewarded).
    // 0 = nunca assistiu até o fim (pode receber); 1 = já recebeu (só as menores).
    const { data: u } = await supabase.from('users').select('spectate_rewarded, coins').eq('id', spectatorUid).single();
    const alreadyRewarded = (u?.spectate_rewarded || 0) === 1;
    const nowIso = new Date().toISOString();
    const score = `${match.player1?.score ?? 0} × ${match.player2?.score ?? 0}`;

    // ---- PRIMEIRA vez: recompensa grande (garante UMA única vez) ----
    if (!alreadyRewarded && !firstSpectateClaimed.has(spectatorUid)) {
      // Claim síncrono: uma chamada concorrente já vê o uid reservado → sem duplicar
      firstSpectateClaimed.add(spectatorUid);
      // 1. MARCA 1 no banco ANTES de conceder (mesmo se a recompensa falhar, o
      //    campo já ficou 1 → nunca mais recebe a recompensa máxima de novo)
      await supabase.from('users').update({ spectate_rewarded: 1 }).eq('id', spectatorUid);

      // 2. Concede a recompensa (validada no servidor — teto + anti-spam)
      const giftItem = await findGiftBoxItem(tenantId);
      const coins = giftItem ? 100 : 200;
      let prize = '';
      if (giftItem) {
        await supabase.rpc('award_spectate_coins', { p_student_id: spectatorUid, p_coins: 100, p_reason: 'Recompensa de espectador (primeira vez)' });
        await grantStoreItem(spectatorUid, giftItem, tenantId);
        prize = '100 moedas + Caixa de Presente';
      } else {
        await supabase.rpc('award_spectate_coins', { p_student_id: spectatorUid, p_coins: 200, p_reason: 'Recompensa de espectador (primeira vez)' });
        prize = '200 moedas';
      }

      // 3. Registra no histórico
      const rewards = await readSpectateRewards(spectatorUid);
      await appendSpectateReward(spectatorUid, [...rewards, { matchId: match.id, date: nowIso, score, prize, coins, kind: 'first' }]);
      return { awardedFirst: true, firstPrize: prize, shareCoins: 0 };
    }

    // ---- Próximas vezes: 0,25% da aposta dividido pelos espectadores do vencedor.
    // O lado usado é o REGISTRADO (match.spectators), imutável para o duelo — quem
    // tentar trocar de lado não engana a premiação. Precisa estar ATIVO até o final
    // e o lado registrado ter vencido.
    const mySpec = (match.spectators || []).find((s: any) => s.uid === spectatorUid);
    if (mySpec && mySpec.active !== false && match.winner_id && mySpec.watchUid === match.winner_id) {
      const bet = match.bet || {};
      const totalBet =
        ((bet.challenger?.type === 'coins' ? bet.challenger.coins : 0) || 0) +
        ((bet.opponent?.type === 'coins' ? bet.opponent.coins : 0) || 0);
      if (totalBet > 0) {
        const specsOnWinner = (match.spectators || []).filter((s: any) => s.active !== false && s.watchUid === match.winner_id).length;
        const divisor = Math.max(1, specsOnWinner);
        const share = Math.floor((totalBet * 0.0025) / divisor);
        if (share > 0) {
          await supabase.rpc('award_spectate_coins', { p_student_id: spectatorUid, p_coins: share, p_reason: 'Recompensa de espectador (0,25% da aposta)' });
          const sharePrize = `+${share} moedas (0,25% da aposta)`;
          const rewards = await readSpectateRewards(spectatorUid);
          await appendSpectateReward(spectatorUid, [...rewards, { matchId: match.id, date: nowIso, score, prize: sharePrize, coins: share, kind: 'share' }]);
          return { awardedFirst: false, firstPrize: '', shareCoins: share, sharePrize };
        }
      }
    }
    return { awardedFirst: false, firstPrize: '', shareCoins: 0 };
  } catch (e) {
    console.error('Erro ao premiar espectador PvP:', e);
    return { awardedFirst: false, firstPrize: '', shareCoins: 0 };
  }
}