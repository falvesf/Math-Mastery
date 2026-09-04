import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase';
// @ts-ignore
import { X, Swords, Coins, Package, Check, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import AvatarCharacter from './AvatarCharacter';
import { useTenant } from '../contexts/TenantContext';
import { useDialog } from '../contexts/DialogContext';
import type { UserData } from '../contexts/AuthContext';
import {
  // @ts-ignore
  type PvpMatch, type PvpBet, type PvpBetConfig,
  createPvpChallenge, acceptPvpChallenge, setPvpReady, cancelPvpMatch,
  subscribePvpMatch, fetchAvailableQuestions, fetchArenas,
  // @ts-ignore
  drawQuestions, maxCoinsBetFor, getRankIndex, ranksWithinTwo, normalizeEquippedItems,
  recordPvpRefusal,
} from '../lib/pvp';
import { fetchEquippedItems } from '../lib/equippedItems';

interface Contact {
  uid: string;
  name: string;
  avatarConfig?: any;
  equippedItems?: any[];
}

interface PvpChallengeModalProps {
  open: boolean;
  onClose: () => void;
  mode: 'challenger' | 'opponent' | null;
  userData: UserData;
  contact?: Contact | null;
  incomingMatch?: PvpMatch | null;
  onStartMatch: (matchId: string) => void;
}

function abbreviate(name?: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 8);
  return parts[0] + ' ' + parts[1][0] + '.';
}

export default function PvpChallengeModal({ open, onClose, mode, userData, contact, incomingMatch, onStartMatch }: PvpChallengeModalProps) {
  const { tenantId } = useTenant();
  const { showAlert, showConfirm, showToast } = useDialog();

  const [arenas, setArenas] = useState<any[]>([]);
  const [arenaTenantNames, setArenaTenantNames] = useState<Record<string, string>>({});
  const [availableQ, setAvailableQ] = useState(0);
  const [arenaIdx, setArenaIdx] = useState(0);
  const [questionCount, setQuestionCount] = useState(5);
  const [myBetType, setMyBetType] = useState<'none' | 'coins' | 'item'>('none');
  const [myBetCoins, setMyBetCoins] = useState(500);
  const [myItems, setMyItems] = useState<any[]>([]);
  const [myEquippedItems, setMyEquippedItems] = useState<any[]>([]);
  const [myBetItemId, setMyBetItemId] = useState<string>('');
  // @ts-ignore
  const [rankIndex, setRankIndex] = useState(0);
  const [balance, setBalance] = useState(0);
  const [opponentBalance, setOpponentBalance] = useState<number | null>(null);

  const [match, setMatch] = useState<PvpMatch | null>(incomingMatch || null);
  const [submitting, setSubmitting] = useState(false);
  const [opponentAvatar, setOpponentAvatar] = useState<any>(null);
  const [opponentEquipped, setOpponentEquipped] = useState<any[]>([]);

  const matchRef = useRef<PvpMatch | null>(match);
  matchRef.current = match;

  const isChallenger = mode === 'challenger';
  const myUid = userData.uid;

  const myBet: PvpBet = myBetType === 'coins'
    ? { type: 'coins', coins: myBetCoins }
    : myBetType === 'item'
      ? (() => {
          const it = myItems.find(i => i.id === myBetItemId);
          if (!it) return { type: 'none' as const };
          const data = it.data || {};
          return {
            type: 'item',
            item: {
              userItemId: it.id,
              itemId: data.itemId || it.item_id || it.id,
              itemTitle: data.itemTitle || it.itemTitle || 'Item',
              imageUrl: data.itemImageUrl || data.imageUrl || '',
              rarity: data.rarity,
              avatarPart: data.avatarPart,
              gameEffect: data.gameEffect,
              data: data,
            },
          };
        })()
      : { type: 'none' };

  const opponentBet: PvpBet = match?.bet?.opponent || { type: 'none' };
  const challengerBet: PvpBet = match?.bet?.challenger || (isChallenger ? myBet : { type: 'none' });
  // Do ponto de vista de cada um, o "adversário" é o outro lado
  const adversaryBet: PvpBet = match ? (isChallenger ? opponentBet : challengerBet) : { type: 'none' };

  const loadBase = useCallback(async () => {
    const [a, q] = await Promise.all([fetchArenas(tenantId), fetchAvailableQuestions()]);
    setArenas(a);
    setAvailableQ(q.length);
    // Nomes das escolas donas das arenas (inclui outras tenants no PvP)
    const tenantIds = Array.from(new Set((a || []).map((x: any) => x.tenant_id).filter(Boolean)));
    const names: Record<string, string> = {};
    if (tenantIds.length > 0) {
      const { data: ts } = await supabase.from('tenants').select('id, name').in('id', tenantIds);
      (ts || []).forEach((t: any) => { names[t.id] = t.name; });
    }
    setArenaTenantNames(names);
  }, [tenantId]);

  const loadMyData = useCallback(async () => {
    const [ri, bal, items, equipped] = await Promise.all([
      getRankIndex(myUid),
      supabase.from('users').select('coins').eq('id', myUid).single(),
      supabase.from('user_items').select('*').eq('student_id', myUid).order('created_at', { ascending: false }),
      fetchEquippedItems(myUid),
    ]);
    setRankIndex(ri);
    setBalance(bal.data?.coins || 0);
    // Filtra por quantidade >= 1 no cliente (coluna `count` é reservada no PostgREST)
    setMyItems(((items.data || []) as any[]).filter((i: any) => {
      const qty = typeof i.count === 'number' ? i.count : (i.data?.quantity ?? 1);
      if (qty < 1) return false;
      const minRank = (i.data?.minRankRequired ?? 0);
      return ri >= (typeof minRank === 'number' ? minRank : 0);
    }));
    setMyEquippedItems(normalizeEquippedItems(equipped || []));
  }, [myUid]);

  useEffect(() => {
    if (!open) return;
    setArenaIdx(0);
    setQuestionCount(5);
    setMyBetType('none');
    setMyBetCoins(500);
    setMyBetItemId('');
    setMatch(incomingMatch || null);
    loadBase();
    loadMyData();
    // Busca o avatar/itens do ADVERSÁRIO (para o modal e o duelo):
    // desafiante -> o contato/desafiado; desafiado -> o desafiante (do match)
    const targetUid = incomingMatch
      ? (isChallenger ? incomingMatch.opponent_id : incomingMatch.challenger_id)
      : contact?.uid;
    if (targetUid) {
      supabase.from('users').select('avatar_config').eq('id', targetUid).single().then(({ data }) => {
        if (data?.avatar_config) setOpponentAvatar(data.avatar_config);
      });
      fetchEquippedItems(targetUid).then((data) => {
        setOpponentEquipped(normalizeEquippedItems(data || []));
      });
      // Saldo do adversário: limita o teto comum de apostas em moedas
      supabase.from('users').select('coins').eq('id', targetUid).single().then(({ data }) => {
        setOpponentBalance(data?.coins || 0);
      });
    }
  }, [open, incomingMatch, loadBase, loadMyData, contact?.uid, isChallenger]);

  // Real-time da partida criada
  useEffect(() => {
    if (!open || !match?.id) return;
    const unsub = subscribePvpMatch(match.id, (m) => {
      if (m) setMatch(m);
    });
    return unsub;
  }, [open, match?.id]);

  // Se o desafiado RECUSOU (cancelled_by = oponente, visto pelo desafiante) -> bloqueia + toast
  useEffect(() => {
    if (!match) return;
    const refused = match.status === 'cancelled' && match.cancelled_by && match.cancelled_by !== myUid;
    if (refused && isChallenger) {
      recordPvpRefusal(match.opponent_id);
      showToast(`⚔️ ${match.opponent_name || 'O jogador'} não aceitou o duelo.`);
      onClose();
    } else if (match.status === 'cancelled' && match.cancelled_by === myUid) {
      onClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match?.status, match?.cancelled_by]);

  // Quando ambos prontos -> inicia
  useEffect(() => {
    if (match?.status === 'playing' && match.id) {
      onStartMatch(match.id);
    }
  }, [match?.status, match?.id, onStartMatch]);

  const me = match ? (isChallenger ? match.player1 : match.player2) : null;
  const them = match ? (isChallenger ? match.player2 : match.player1) : null;
  // Bonecos SEMPRE com dados REAIS (nunca dependem do match, que muda no aceite/realtime)
  const myAvatar = useMemo(() => {
    const c = userData.avatarConfig && Object.keys(userData.avatarConfig).length > 0 ? userData.avatarConfig : {};
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(userData.avatarConfig || {})]);
  const themAvatar = useMemo(() => {
    const c = opponentAvatar && Object.keys(opponentAvatar).length > 0 ? opponentAvatar : {};
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(opponentAvatar || {})]);
  const myEquipped = myEquippedItems;
  const themEquipped = opponentEquipped;

  if (!open) return null;

  const myName = match ? (isChallenger ? match.challenger_name : match.opponent_name) : (isChallenger ? userData.name : contact?.name);
  const themName = match ? (isChallenger ? match.opponent_name : match.challenger_name) : contact?.name;

  // @ts-ignore
  const maxQ = Math.max(5, Math.min(15, availableQ));
  const canChallenge = availableQ >= 5;
  // Teto comum: o máximo que AMBOS podem apostar em moedas é o menor saldo dos dois
  // (e também o teto por nº de perguntas). Se o saldo do adversário ainda não carregou,
  // usa o meu como teto.
  const questionCountUsed = match?.question_count || questionCount;
  const maxCoins = Math.min(maxCoinsBetFor(questionCountUsed), balance, opponentBalance ?? balance);

  // Regra de coerência: se o desafiante apostou moedas, o desafiado precisa cobrir
  // com moedas >= N ou com um item; senão o duelo fica sem aposta dos dois lados.
  const challengerBetCoins = match && !isChallenger && challengerBet.type === 'coins' ? challengerBet.coins || 0 : 0;

  const handleCreate = async () => {
    if (!contact) return;
    if (!arenas[arenaIdx]) { showAlert('Selecione uma arena (fundo) para o duelo.'); return; }
    if (!canChallenge) { showAlert('Não há perguntas suficientes no banco para um duelo (mínimo 5).'); return; }
    // Limite de patente: no máximo 2 patentes para mais ou para menos
    const [ri, riOpp] = await Promise.all([getRankIndex(userData.uid), getRankIndex(contact.uid)]);
    if (!ranksWithinTwo(ri, riOpp)) {
      showToast('A diferença de patentes é maior que 2. Não é possível duelar (duelo desequilibrado).');
      return;
    }
    if (myBetType === 'coins' && myBetCoins > balance) { showAlert('Saldo de moedas insuficiente para esta aposta.'); return; }
    if (myBetType === 'coins' && myBetCoins > maxCoins) { showAlert(`Máximo de ${maxCoins} moedas para o duelo (teto comum entre os dois jogadores).`); return; }
    setSubmitting(true);
    const m = await createPvpChallenge({
      tenantId,
      challenger: { uid: userData.uid, name: userData.name, avatarConfig: userData.avatarConfig, equippedItems: myEquippedItems },
      opponent: { uid: contact.uid, name: contact.name, avatarConfig: opponentAvatar, equippedItems: opponentEquipped },
      arena: arenas[arenaIdx],
      questionCount,
      bet: myBet,
    });
    setSubmitting(false);
    if (m) { setMatch(m); showToast('⚔️ Desafio enviado! Aguardando o(a) ' + contact.name + ' aceitar.'); }
    else showAlert('Erro ao criar o desafio.');
  };

  // @ts-ignore
  const handleAccept = async () => {
    if (!match) return;
    if (myBetType === 'coins' && myBetCoins > balance) { showAlert('Saldo de moedas insuficiente para esta aposta.'); return; }
    if (myBetType === 'coins' && myBetCoins > maxCoins) { showAlert(`Máximo de ${maxCoins} moedas para o duelo (teto comum entre os dois jogadores).`); return; }
    // Regra de coerência: o desafiante apostou moedas → o desafiado precisa cobrir
    // com moedas >= N ou um item; se não cobrir, o duelo acontece sem apostas.
    if (!isChallenger && challengerBet.type === 'coins') {
      if (myBetType === 'coins' && myBetCoins < (challengerBet.coins || 0)) {
        showAlert(`O desafiante apostou ${challengerBet.coins} moedas. Você precisa apostar pelo menos esse valor em moedas ou escolher um item — ou deixar sem aposta (o duelo ocorre sem apostas).`);
        return;
      }
      if (myBetType === 'none' && myItems.length === 0 && balance < (challengerBet.coins || 0)) {
        showConfirm('Você não tem moedas suficientes nem itens para cobrir a aposta do desafiante. O duelo ocorrerá SEM apostas. Continuar?').then(ok => {
          if (ok) doAccept();
        });
        return;
      }
    }
    doAccept();
  };

  const doAccept = async () => {
    if (!match) return;
    setSubmitting(true);
    const m = await acceptPvpChallenge(match.id, myBet);
    setSubmitting(false);
    if (m) setMatch(m);
    else showAlert('Este desafio não está mais disponível.');
  };

  const handleReady = async () => {
    if (!match) return;
    setSubmitting(true);
    const m = await setPvpReady(match.id, myUid, myAvatar, myEquippedItems, myBet);
    setSubmitting(false);
    if (m) setMatch(m);
  };

  const handleCancel = async () => {
    if (match?.id && (match.status === 'challenged' || match.status === 'accepted')) {
      const ok = await showConfirm('Cancelar este duelo?');
      if (ok) await cancelPvpMatch(match.id, myUid);
    }
    onClose();
  };

  const statusLabel = !match ? 'Configurar Desafio' :
    match.status === 'challenged' ? (isChallenger ? 'Aguardando aceite do desafiado...' : 'Desafio recebido!') :
    match.status === 'accepted' ? 'Duelo aceito — ajuste e confirme' :
    match.status === 'playing' ? 'Iniciando duelo...' : 'Duelo encerrado';

  const renderBetBadge = (bet: PvpBet) => {
    if (!bet || bet.type === 'none') return <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Sem aposta</span>;
    if (bet.type === 'coins') return <span style={{ fontSize: '0.7rem', color: '#fbbf24', fontWeight: 'bold' }}>🪙 {bet.coins} moedas</span>;
    if (bet.type === 'item' && bet.item) return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.7rem', color: '#a78bfa', fontWeight: 'bold' }}>
        {bet.item.imageUrl ? <img src={bet.item.imageUrl} alt="" style={{ width: 18, height: 18, objectFit: 'contain', borderRadius: 4 }} /> : <Package size={14} />}
        {bet.item.itemTitle}
      </span>
    );
    return null;
  };

  const myReady = me?.ready;
  const themReady = them?.ready;
  const bothReady = myReady && themReady;

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 200000, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div style={{ background: 'var(--bg-dark)', border: '1px solid var(--gold-primary)', borderRadius: '18px', width: 'min(720px, 100%)', maxHeight: '94vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.9rem 1.2rem', background: 'var(--btn-bg)', borderBottom: '1px solid var(--border-glass)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--gold-primary)', fontWeight: 'bold' }}>
            <Swords size={20} /> Duelo PvP
          </div>
          <button onClick={handleCancel} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}><X size={22} /></button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '1.2rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ fontSize: '0.8rem', color: '#f59e0b', textAlign: 'center', fontWeight: 'bold' }}>{statusLabel}</div>

          {/* Personagens frente a frente */}
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-around', gap: '0.5rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
              <AvatarCharacter config={myAvatar || null} equippedItems={myEquipped || []} size={110} animation="idle" interactive={false} />
              <div style={{ marginTop: '0.2rem', fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--gold-primary)', textAlign: 'center' }}>
                {abbreviate(myName)} {myReady && <span style={{ color: '#10b981' }}>✔</span>}
              </div>
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: '900', color: '#f43f5e', fontStyle: 'italic', paddingBottom: '40px' }}>VS</div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
              <div style={{ transform: 'scaleX(-1)' }}>
                <AvatarCharacter config={themAvatar || null} equippedItems={themEquipped || []} size={110} animation="idle" interactive={false} />
              </div>
              <div style={{ marginTop: '0.2rem', fontSize: '0.75rem', fontWeight: 'bold', color: '#94a3b8', textAlign: 'center' }}>
                {abbreviate(themName)} {themReady && <span style={{ color: '#10b981' }}>✔</span>}
              </div>
            </div>
          </div>

          {/* Configuração — só na fase inicial (sem match ainda, ou durante challenged/accepted para o desafiante) */}
          {!match && isChallenger && (
            <>
              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>🏟️ Arena (fundo da missão)</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <button onClick={() => setArenaIdx(Math.max(0, arenaIdx - 1))} disabled={arenaIdx === 0} style={{ background: 'var(--btn-bg)', border: '1px solid var(--border-glass)', borderRadius: '8px', padding: '0.4rem', color: 'var(--text-primary)', cursor: 'pointer' }}><ChevronLeft size={16} /></button>
                  <div style={{ flex: 1, height: '90px', borderRadius: '10px', overflow: 'hidden', border: '2px solid var(--gold-primary)', background: '#000 center/cover no-repeat', backgroundImage: arenas[arenaIdx] ? `url(${arenas[arenaIdx].battle_bg_url || arenas[arenaIdx].battleBgUrl})` : undefined, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {!arenas[arenaIdx] && <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Sem arenas disponíveis</span>}
                  </div>
                  <button onClick={() => setArenaIdx(Math.min(arenas.length - 1, arenaIdx + 1))} disabled={arenaIdx >= arenas.length - 1} style={{ background: 'var(--btn-bg)', border: '1px solid var(--border-glass)', borderRadius: '8px', padding: '0.4rem', color: 'var(--text-primary)', cursor: 'pointer' }}><ChevronRight size={16} /></button>
                </div>
                {arenas[arenaIdx] && <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '0.3rem' }}>
                    {arenas[arenaIdx].title || arenas[arenaIdx].name || 'Arena'}
                    {arenas[arenaIdx].tenant_id && arenaTenantNames[arenas[arenaIdx].tenant_id] && (
                      <span style={{ marginLeft: '0.4rem', padding: '0.05rem 0.4rem', borderRadius: '8px', background: 'rgba(139,92,246,0.2)', color: '#c084fc', fontSize: '0.62rem', fontWeight: 'bold' }}>
                        {arenaTenantNames[arenas[arenaIdx].tenant_id]}
                      </span>
                    )}
                  </div>}
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.35rem' }}>❓ Quantidade de Perguntas</label>
                {canChallenge ? (
                  <select value={questionCount} onChange={e => setQuestionCount(Number(e.target.value))} style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)' }}>
                    {Array.from({ length: Math.min(15, availableQ) - 4 }, (_, i) => 5 + i).map(n => <option key={n} value={n}>{n} perguntas</option>)}
                  </select>
                ) : (
                  <div style={{ padding: '0.6rem', borderRadius: '8px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.4)', color: '#f87171', fontSize: '0.8rem' }}>
                    Não há perguntas suficientes no banco (mínimo 5). Não é possível duelar.
                  </div>
                )}
                <div style={{ fontSize: '0.65rem', color: '#94a3b8', marginTop: '0.25rem' }}>{availableQ} disponíveis no banco de questões.</div>
              </div>
            </>
          )}

          {/* Apostas */}
          {(match || isChallenger) && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div style={{ background: 'rgba(0,0,0,0.25)', borderRadius: '10px', padding: '0.75rem', border: '1px solid var(--border-glass)' }}>
                <div style={{ fontSize: '0.7rem', color: '#f59e0b', fontWeight: 'bold', marginBottom: '0.4rem' }}>Sua aposta {myBetType === 'none' && challengerBetCoins > 0 ? '(sem aposta → duelo sem apostas)' : '(opcional)'}</div>
                {myBetType === 'coins' && <div style={{ fontSize: '0.7rem', color: '#fbbf24', marginBottom: '0.4rem' }}>🪙 {myBetCoins} moedas (máx {maxCoins})</div>}
                {myBetType === 'item' && myBet.item && <div style={{ fontSize: '0.7rem', color: '#a78bfa', marginBottom: '0.4rem' }}>{myBet.item.itemTitle}</div>}
                {myBetType === 'none' && <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginBottom: '0.4rem' }}>Sem aposta</div>}
                {challengerBetCoins > 0 && (
                  <div style={{ fontSize: '0.65rem', color: '#fbbf24', background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.3)', borderRadius: '6px', padding: '0.35rem 0.5rem', marginBottom: '0.4rem', lineHeight: '1.35' }}>
                    O desafiante apostou <b>{challengerBetCoins} moedas</b>. Para a aposta valer, você precisa propor <b>≥ {challengerBetCoins}</b> em moedas ou <b>um item</b>. Se não cobrir, o duelo acontece <b>sem apostas</b>.
                  </div>
                )}
                <select value={myBetType} onChange={e => setMyBetType(e.target.value as any)} style={{ width: '100%', padding: '0.4rem', borderRadius: '6px', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontSize: '0.75rem' }}>
                  <option value="none">Sem aposta</option>
                  <option value="coins">🪙 Moedas</option>
                  <option value="item">🎒 Item</option>
                </select>
                {myBetType === 'coins' && (
                  <input type="number" min={challengerBetCoins > 0 ? challengerBetCoins : 50} max={maxCoins} step={50} value={myBetCoins} onChange={e => setMyBetCoins(Math.max(challengerBetCoins > 0 ? challengerBetCoins : 50, Math.min(maxCoins, Number(e.target.value) || (challengerBetCoins > 0 ? challengerBetCoins : 50))))} style={{ width: '100%', marginTop: '0.4rem', padding: '0.4rem', borderRadius: '6px', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontSize: '0.75rem' }} />
                )}
                {myBetType === 'item' && (
                  <select value={myBetItemId} onChange={e => setMyBetItemId(e.target.value)} style={{ width: '100%', marginTop: '0.4rem', padding: '0.4rem', borderRadius: '6px', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontSize: '0.75rem' }}>
                    <option value="">Selecione um item...</option>
                    {myItems.map(i => <option key={i.id} value={i.id}>{(i.data?.itemTitle || 'Item')}</option>)}
                  </select>
                )}
              </div>
              <div style={{ background: 'rgba(0,0,0,0.25)', borderRadius: '10px', padding: '0.75rem', border: '1px solid var(--border-glass)' }}>
                <div style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 'bold', marginBottom: '0.4rem' }}>Aposta do adversário</div>
                <div style={{ minHeight: '30px' }}>
                  {match ? renderBetBadge(adversaryBet) : renderBetBadge({ type: 'none' })}
                </div>
                <div style={{ fontSize: '0.6rem', color: '#94a3b8', marginTop: '0.4rem' }}>
                  {match ? `${match.question_count} perguntas · ${match.challenger_name} desafiou` : `${questionCount} perguntas`}
                </div>
              </div>
            </div>
          )}

          {/* Ações */}
          <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.2rem' }}>
            {!match && isChallenger && (
              <button onClick={handleCreate} disabled={!canChallenge || submitting} style={{ flex: 1, padding: '0.75rem', background: canChallenge ? 'var(--gold-primary)' : 'rgba(255,255,255,0.1)', color: canChallenge ? 'var(--text-on-gold, #000)' : 'var(--text-secondary)', border: 'none', borderRadius: '10px', fontWeight: 'bold', cursor: canChallenge ? 'pointer' : 'not-allowed' }}>
                {submitting ? <Loader2 className="animate-spin" size={16} /> : '⚔️ Desafiar para Duelo'}
              </button>
            )}
            {match && (match.status === 'accepted' || match.status === 'challenged') && (
              <button onClick={handleReady} disabled={submitting || myReady} style={{ flex: 1, padding: '0.75rem', background: myReady ? 'rgba(16,185,129,0.25)' : 'var(--gold-primary)', color: myReady ? '#10b981' : 'var(--text-on-gold, #000)', border: '1px solid rgba(16,185,129,0.4)', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer' }}>
                {myReady ? '✔ Pronto — aguardando o outro' : '⚔️ Iniciar Duelo'}
              </button>
            )}
            {bothReady && (
              <div style={{ flex: 1, padding: '0.75rem', textAlign: 'center', background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.4)', borderRadius: '10px', color: '#10b981', fontWeight: 'bold', fontSize: '0.85rem' }}>
                Carregando a arena...
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}