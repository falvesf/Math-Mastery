import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Terminal, X, Search, HelpCircle, Trash2, Package, Check, CornerDownLeft, Copy } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { rollItemAdds, fetchGlobalGachaConfig } from '../lib/gacha';
import { applyEffectAdd, isEffectAddType } from '../lib/damageEffects';
import { getAvailableInventorySpace, computeMaxInventorySpace } from '../lib/inventorySlots';
import { invalidateEquippedItems } from '../lib/equippedItems';
import { getRankForXp, getMaxAddsLimit } from '../lib/ranks';
import { formatAdminFirstName } from '../lib/formatAdminName';
import { RARITY_COLORS } from './ItemTooltip';

interface ConsoleLine {
  id: string;
  type: 'cmd' | 'output' | 'error' | 'success' | 'info';
  text: string;
  timestamp: string;
}

interface IndexedStoreItem {
  code: number;
  id: string;
  name: string;
  type: string;
  rarity: string;
  imageUrl: string;
  description: string;
  itemCategory?: string;
  avatarPart?: string;
  baseAttributeType?: string;
  baseAttributeValue?: number;
  data: any;
  created_at?: string;
}

// Síntese de áudio retrô via Web Audio API (sem dependência de arquivos externos)
function playTerminalSound(type: 'open' | 'success' | 'error') {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'open') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.08);
      gain.gain.setValueAtTime(0.04, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      osc.start(now);
      osc.stop(now + 0.08);
    } else if (type === 'success') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(523.25, now);
      osc.frequency.setValueAtTime(659.25, now + 0.06);
      osc.frequency.setValueAtTime(783.99, now + 0.12);
      gain.gain.setValueAtTime(0.05, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      osc.start(now);
      osc.stop(now + 0.22);
    } else if (type === 'error') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.setValueAtTime(164.81, now + 0.1);
      gain.gain.setValueAtTime(0.05, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc.start(now);
      osc.stop(now + 0.25);
    }
  } catch {
    // Áudio opcional desativado se bloqueado pelo navegador
  }
}

export default function AdminConsole() {
  const { userData } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [isCatalogOpen, setIsCatalogOpen] = useState(false);
  const [inputVal, setInputVal] = useState('');
  const [lines, setLines] = useState<ConsoleLine[]>([]);
  const [items, setItems] = useState<IndexedStoreItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogCategory, setCatalogCategory] = useState<'all' | 'equippable' | 'consumable' | 'other'>('all');
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [copiedCode, setCopiedCode] = useState<number | null>(null);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const terminalEndRef = useRef<HTMLDivElement | null>(null);

  const isAdmin = userData?.role === 'admin' || userData?.role === 'superadmin';

  // Carrega todos os itens de store_items e mapeia IDs sequenciais #1..#N
  useEffect(() => {
    if (!isAdmin) return;
    let active = true;

    const fetchStoreItems = async () => {
      setLoadingItems(true);
      try {
        const { data, error } = await supabase
          .from('store_items')
          .select('*')
          .order('created_at', { ascending: true });

        if (error) throw error;
        if (!active || !data) return;

        // Deduplica ou indexa ordenadamente por data de criação
        const indexed: IndexedStoreItem[] = data.map((item, index) => {
          const d = item.data || {};
          return {
            code: index + 1,
            id: item.id,
            name: item.name || d.title || d.itemTitle || 'Item sem nome',
            type: item.type || d.type || 'other',
            rarity: item.rarity || d.rarity || 'common',
            imageUrl: item.image_url || d.imageUrl || d.itemImageUrl || '',
            description: item.description || d.description || d.itemDescription || '',
            itemCategory: d.itemCategory || item.avatar_part || 'none',
            avatarPart: d.avatarPart || item.avatar_part || undefined,
            baseAttributeType: d.baseAttributeType,
            baseAttributeValue: d.baseAttributeValue,
            data: d,
            created_at: item.created_at
          };
        });

        setItems(indexed);
      } catch (err) {
        console.error('[AdminConsole] Erro ao carregar catálogo de itens:', err);
      } finally {
        if (active) setLoadingItems(false);
      }
    };

    fetchStoreItems();
    return () => { active = false; };
  }, [isAdmin]);

  // Mensagem inicial de boas-vindas ao console
  useEffect(() => {
    if (lines.length === 0) {
      setLines([
        {
          id: 'welcome-1',
          type: 'info',
          text: '══════════════════════════════════════════════════════════════════════════════',
          timestamp: new Date().toLocaleTimeString()
        },
        {
          id: 'welcome-2',
          type: 'success',
          text: '▶ MATH MASTERY // ADMIN COMMAND TERMINAL v1.0 [STATUS: PRONTO]',
          timestamp: new Date().toLocaleTimeString()
        },
        {
          id: 'welcome-3',
          type: 'info',
          text: '• Pressione [ \' ] (aspas simples) a qualquer momento para abrir/fechar o console.',
          timestamp: new Date().toLocaleTimeString()
        },
        {
          id: 'welcome-4',
          type: 'info',
          text: '• Comando de Itens: /i <código> [poder: 0-9] [quantidade: 1+]',
          timestamp: new Date().toLocaleTimeString()
        },
        {
          id: 'welcome-5',
          type: 'info',
          text: '• Ex: /i 1 3 1 (gera 1x Item #1 +3) | /items (lista itens) | /help (mais comandos)',
          timestamp: new Date().toLocaleTimeString()
        },
        {
          id: 'welcome-6',
          type: 'info',
          text: '══════════════════════════════════════════════════════════════════════════════',
          timestamp: new Date().toLocaleTimeString()
        }
      ]);
    }
  }, [lines.length]);

  // Listener global de atalho [ ' ] (aspas simples) e evento customizado para mobile
  useEffect(() => {
    if (!isAdmin) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Aspas simples: e.key === "'" ou e.code === 'Quote'
      if (e.key === "'") {
        const target = e.target as HTMLElement | null;
        const isTypingElsewhere = target && (
          (target.tagName === 'INPUT' && target !== inputRef.current) ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable
        );

        if (isTypingElsewhere) return; // Permite digitar aspas em inputs normais e chat

        e.preventDefault();
        setIsOpen(prev => {
          const next = !prev;
          if (next) playTerminalSound('open');
          return next;
        });
      } else if (e.key === 'Escape') {
        if (isOpen) {
          e.preventDefault();
          setIsOpen(false);
        }
      }
    };

    const handleOpenCustom = () => {
      setIsOpen(true);
      playTerminalSound('open');
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('open-admin-console', handleOpenCustom);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('open-admin-console', handleOpenCustom);
    };
  }, [isAdmin, isOpen]);

  // Auto-foco no input ao abrir
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  // Auto-scroll para o fim do terminal ao adicionar linhas
  useEffect(() => {
    if (isOpen) {
      terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [lines, isOpen]);

  // Adiciona linha no terminal
  const addLine = (text: string, type: ConsoleLine['type'] = 'output') => {
    setLines(prev => [
      ...prev,
      {
        id: Math.random().toString(36).substring(2, 9),
        type,
        text,
        timestamp: new Date().toLocaleTimeString()
      }
    ]);
  };

  // Execução de comando
  // Auxiliar para busca de jogador por ID ou Nome (com resolução de ambiguidade)
  const resolveTargetPlayer = async (identifier: string, tenantId?: string): Promise<{ player?: any; error?: string }> => {
    const clean = identifier.trim();
    if (!clean) return { error: 'Identificador do jogador não informado.' };

    // 1. UUID exato
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clean);
    if (isUuid) {
      const { data, error } = await supabase.from('users').select('*').eq('id', clean).maybeSingle();
      if (data) return { player: data };
      if (error) return { error: `Erro na busca por ID: ${error.message}` };
    }

    // 2. Busca exata por nome, nome do personagem ou email
    let exactQuery = supabase.from('users').select('*');
    if (tenantId) exactQuery = exactQuery.eq('tenant_id', tenantId);
    const { data: exactRows } = await exactQuery.or(`name.ilike.${clean},character_name.ilike.${clean},email.ilike.${clean}`);
    if (exactRows && exactRows.length === 1) {
      return { player: exactRows[0] };
    }

    // 3. Busca por prefixo
    let prefixQuery = supabase.from('users').select('*');
    if (tenantId) prefixQuery = prefixQuery.eq('tenant_id', tenantId);
    const { data: prefixRows } = await prefixQuery.or(`name.ilike.${clean}%,character_name.ilike.${clean}%,email.ilike.${clean}%`).limit(10);
    if (prefixRows && prefixRows.length === 1) {
      return { player: prefixRows[0] };
    }

    // 4. Busca parcial (contém)
    let partialQuery = supabase.from('users').select('*');
    if (tenantId) partialQuery = partialQuery.eq('tenant_id', tenantId);
    const { data: partialRows } = await partialQuery.or(`name.ilike.%${clean}%,character_name.ilike.%${clean}%,email.ilike.%${clean}%`).limit(10);

    const pool = (prefixRows && prefixRows.length > 0) ? prefixRows : (partialRows || []);

    if (pool.length === 1) {
      return { player: pool[0] };
    }
    if (pool.length > 1) {
      const names = pool.map(p => `"${p.name || p.character_name || p.email}"`).join(', ');
      return { error: `Mais de um jogador encontrado (${names}). Seja mais específico ou utilize o ID.` };
    }

    return { error: `Nenhum jogador encontrado com "${clean}".` };
  };

  // Parser inteligente de argumentos para comandos numéricos com alvo opcional (ex: /coins [alvo] [+/-] [qtd])
  const parseTargetAndAmount = (rawArgs: string[]): { targetIdentifier: string | null; amount: number | null } => {
    if (rawArgs.length === 0) {
      return { targetIdentifier: null, amount: null };
    }

    // 1 argumento
    if (rawArgs.length === 1) {
      const single = rawArgs[0];
      if (/^[+-]?\d+$/.test(single)) {
        return { targetIdentifier: null, amount: parseInt(single, 10) };
      }
      return { targetIdentifier: single, amount: null };
    }

    // 2 ou mais argumentos
    const last = rawArgs[rawArgs.length - 1];
    const secondLast = rawArgs[rawArgs.length - 2];

    // Formato: /cmd <alvo> + 500 ou /cmd <alvo> - 200
    if (/^\d+$/.test(last) && (secondLast === '+' || secondLast === '-')) {
      const val = parseInt(last, 10);
      const amount = secondLast === '-' ? -val : val;
      const target = rawArgs.slice(0, rawArgs.length - 2).join(' ').trim();
      return { targetIdentifier: target || null, amount };
    }

    // Formato: /cmd <alvo> +500 ou /cmd <alvo> -200 ou /cmd <alvo> 500
    if (/^[+-]?\d+$/.test(last)) {
      const val = parseInt(last, 10);
      const target = rawArgs.slice(0, rawArgs.length - 1).join(' ').trim();
      return { targetIdentifier: target || null, amount: val };
    }

    // Apenas nome/alvo composto sem número
    return { targetIdentifier: rawArgs.join(' ').trim(), amount: null };
  };

  // Execução de comando
  const handleExecuteCommand = async (rawCmd: string) => {
    const trimmed = rawCmd.trim();
    if (!trimmed) return;

    addLine(`admin@math-mastery:~$ ${trimmed}`, 'cmd');

    // Salva histórico
    setCommandHistory(prev => [trimmed, ...prev.filter(c => c !== trimmed)].slice(0, 50));
    setHistoryIndex(-1);
    setInputVal('');

    const parts = trimmed.split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);
    const adminFirstName = formatAdminFirstName(userData?.name, userData?.email);

    // 1. Comando de Ajuda
    if (cmd === '/help' || cmd === 'help' || cmd === '/ajuda' || cmd === '?') {
      addLine('COMANDOS DISPONÍVEIS NO CONSOLE ADMIN:', 'info');
      addLine('  • /i <id> [poder: 0-9] [qtd] [jogador]  - Gera item na mochila (sua ou de um jogador)', 'info');
      addLine('  • /items [filtro]                      - Consulta catálogo de IDs e códigos dos itens', 'info');
      addLine('  • /slots [jogador]                     - Verifica slots ocupados e livres (seus ou de um jogador)', 'info');
      addLine('  • /coins [jogador] [+/-] [qtd]         - Consulta ou altera saldo de moedas (seu ou de um jogador)', 'info');
      addLine('  • /xp [jogador] [+/-] [qtd]            - Consulta ou altera experiência/patente (sua ou de um jogador)', 'info');
      addLine('  • /hp [jogador] [valor | +/- | full]   - Consulta ou altera corações de vida (seus ou de um jogador)', 'info');
      addLine('  • /clear ou /cls                       - Limpa o histórico visual do terminal', 'info');
      addLine('  • /help ou /ajuda                      - Exibe esta lista de instruções', 'info');
      return;
    }

    // 2. Comando Limpar
    if (cmd === '/clear' || cmd === 'clear' || cmd === '/limpar' || cmd === 'cls') {
      setLines([]);
      return;
    }

    // 3. Comando Slots (/slots [jogador])
    if (cmd === '/slots' || cmd === 'slots' || cmd === '/espaco') {
      if (args.length === 0) {
        // Verifica slots próprios
        if (!userData?.uid) {
          addLine('[ERRO] Usuário não autenticado.', 'error');
          return;
        }
        try {
          const { data: myItems } = await supabase
            .from('user_items')
            .select('id, equipped')
            .eq('student_id', userData.uid);

          const unequipped = (myItems || []).filter(r => !r.equipped).length;
          const free = getAvailableInventorySpace(userData, unequipped);
          const max = computeMaxInventorySpace(userData);
          addLine(`🎒 Sua Mochila: ${unequipped} / ${max} slots ocupados. (${free} slot(s) livre(s))`, 'info');
        } catch (err: any) {
          addLine(`[ERRO] Falha ao consultar seus slots: ${err.message}`, 'error');
        }
        return;
      }

      // Verifica slots de jogador específico
      const targetIdentifier = args.join(' ').trim();
      const res = await resolveTargetPlayer(targetIdentifier, userData?.tenant_id);
      if (!res.player) {
        addLine(`[ERRO] ${res.error || 'Jogador não encontrado.'}`, 'error');
        playTerminalSound('error');
        return;
      }

      const targetPlayer = res.player;
      const targetName = targetPlayer.name || targetPlayer.character_name || targetPlayer.email || 'Jogador';

      try {
        const { data: pItems } = await supabase
          .from('user_items')
          .select('id, equipped')
          .eq('student_id', targetPlayer.id);

        const unequipped = (pItems || []).filter(r => !r.equipped).length;
        const max = computeMaxInventorySpace(targetPlayer);
        const free = Math.max(0, max - unequipped);

        addLine(`🎒 Mochila de ${targetName} (${targetPlayer.email || targetPlayer.id}):`, 'info');
        addLine(`   • Slots Ocupados: ${unequipped} / ${max}`, 'output');
        addLine(`   • Slots Livres:   ${free} ${free <= 0 ? '(⚠️ Mochila cheia!)' : ''}`, free <= 0 ? 'error' : 'success');
      } catch (err: any) {
        addLine(`[ERRO] Falha ao consultar slots de ${targetName}: ${err.message}`, 'error');
      }
      return;
    }

    // 4. Comando Moedas (/coins [jogador] [+/-] [quantidade])
    if (cmd === '/coins' || cmd === '/moedas' || cmd === '/gold' || cmd === '/ouro') {
      const parsed = parseTargetAndAmount(args);

      // Consulta próprias moedas
      if (!parsed.targetIdentifier && parsed.amount === null) {
        addLine(`💰 Suas moedas atuais: ${Number(userData?.coins || 0).toLocaleString('pt-BR')} GP`, 'info');
        return;
      }

      // Identifica o usuário alvo (próprio admin ou jogador)
      let targetUser: any = userData;
      let isSelf = true;
      if (parsed.targetIdentifier) {
        const res = await resolveTargetPlayer(parsed.targetIdentifier, userData?.tenant_id);
        if (!res.player) {
          addLine(`[ERRO] ${res.error || 'Jogador não encontrado.'}`, 'error');
          playTerminalSound('error');
          return;
        }
        targetUser = res.player;
        isSelf = (targetUser.id || targetUser.uid) === userData?.uid;
      }

      const targetId = targetUser?.id || targetUser?.uid;
      const targetName = targetUser?.name || targetUser?.characterName || targetUser?.character_name || 'Jogador';

      // Apenas consulta saldo de moedas do jogador
      if (parsed.amount === null) {
        addLine(`💰 Saldo de moedas de ${targetName}: ${Number(targetUser.coins || 0).toLocaleString('pt-BR')} GP`, 'info');
        return;
      }

      // Adiciona ou retira moedas
      const delta = parsed.amount;
      const curCoins = Number(targetUser.coins || 0);
      const newCoins = Math.max(0, curCoins + delta);

      const { error: updErr } = await supabase.from('users').update({ coins: newCoins }).eq('id', targetId);
      if (updErr) {
        addLine(`[ERRO] Falha ao atualizar moedas de ${targetName}: ${updErr.message}`, 'error');
        playTerminalSound('error');
        return;
      }

      // Registra no histórico oficial do jogador (coin_logs) com primeiro nome do admin
      const sign = delta > 0 ? '+' : '';
      const { error: logErr } = await supabase.from('coin_logs').insert({
        student_id: targetId,
        amount: delta,
        reason: `Comando Console /coins (${sign}${delta} GP) por ${adminFirstName}`,
        justification: `Ajuste via console admin por ${adminFirstName}`,
        tenant_id: targetUser.tenant_id || userData?.tenant_id || null,
      });
      if (logErr) {
        console.warn('[AdminConsole] Falha ao registrar histórico em coin_logs:', logErr);
      }

      addLine(`[SUCESSO] ${sign}${delta} moedas para ${targetName}! Saldo: ${curCoins} ➔ ${newCoins} GP (por ${adminFirstName})`, 'success');
      playTerminalSound('success');

      if (isSelf) {
        window.dispatchEvent(new CustomEvent('user-data-updated'));
      }
      return;
    }

    // 5. Comando XP (/xp [jogador] [+/-] [quantidade])
    if (cmd === '/xp') {
      const parsed = parseTargetAndAmount(args);

      // Consulta próprio XP
      if (!parsed.targetIdentifier && parsed.amount === null) {
        const curXp = Number(userData?.xp || 0);
        const myRank = getRankForXp(curXp, userData?.classId || (userData as any)?.class_id);
        addLine(`⭐ Seu XP atual: ${curXp.toLocaleString('pt-BR')} XP | Patente: ${myRank.name}`, 'info');
        return;
      }

      // Identifica o usuário alvo (próprio admin ou jogador)
      let targetUser: any = userData;
      let isSelf = true;
      if (parsed.targetIdentifier) {
        const res = await resolveTargetPlayer(parsed.targetIdentifier, userData?.tenant_id);
        if (!res.player) {
          addLine(`[ERRO] ${res.error || 'Jogador não encontrado.'}`, 'error');
          playTerminalSound('error');
          return;
        }
        targetUser = res.player;
        isSelf = (targetUser.id || targetUser.uid) === userData?.uid;
      }

      const targetId = targetUser?.id || targetUser?.uid;
      const targetName = targetUser?.name || targetUser?.characterName || targetUser?.character_name || 'Jogador';
      const targetClassId = targetUser?.classId || targetUser?.class_id;

      // Apenas consulta XP do jogador
      if (parsed.amount === null) {
        const pXp = Number(targetUser.xp || 0);
        const pRank = getRankForXp(pXp, targetClassId);
        addLine(`⭐ XP de ${targetName}: ${pXp.toLocaleString('pt-BR')} XP | Patente: ${pRank.name}`, 'info');
        return;
      }

      // Adiciona ou retira XP
      const delta = parsed.amount;
      const curXp = Number(targetUser.xp || 0);
      const newXp = Math.max(0, curXp + delta);
      const newRank = getRankForXp(newXp, targetClassId);

      const { error: updErr } = await supabase
        .from('users')
        .update({ xp: newXp, rank: newRank.name })
        .eq('id', targetId);

      if (updErr) {
        addLine(`[ERRO] Falha ao atualizar XP de ${targetName}: ${updErr.message}`, 'error');
        playTerminalSound('error');
        return;
      }

      // Registra no histórico oficial do jogador (xp_logs) com primeiro nome do admin
      const sign = delta > 0 ? '+' : '';
      const { error: logErr } = await supabase.from('xp_logs').insert({
        student_id: targetId,
        amount: delta,
        reason: `Comando Console /xp (${sign}${delta} XP) por ${adminFirstName}`,
        tenant_id: targetUser.tenant_id || userData?.tenant_id || null,
      });
      if (logErr) {
        console.warn('[AdminConsole] Falha ao registrar histórico em xp_logs:', logErr);
      }

      addLine(`[SUCESSO] ${sign}${delta} XP para ${targetName}! Total: ${curXp} ➔ ${newXp} XP (Patente: ${newRank.name}) (por ${adminFirstName})`, 'success');
      playTerminalSound('success');

      if (isSelf) {
        window.dispatchEvent(new CustomEvent('user-data-updated'));
      }
      return;
    }

    // 6. Comando HP (/hp [jogador] [valor | +/- | full])
    if (cmd === '/hp' || cmd === '/vida') {
      // Sem argumentos: restaura a própria vida
      if (args.length === 0) {
        const maxHp = Number((userData as any)?.max_hp || (userData as any)?.maxHp || 20);
        await supabase.from('users').update({ hp: maxHp, hp_recovery_start_timestamp: null }).eq('id', userData!.uid);
        addLine(`[SUCESSO] Sua vida foi totalmente restaurada para ${maxHp} corações!`, 'success');
        playTerminalSound('success');
        window.dispatchEvent(new CustomEvent('user-data-updated'));
        return;
      }

      // Se passou apenas um número: afeta o próprio admin
      if (args.length === 1 && /^[+-]?\d+$/.test(args[0])) {
        const val = parseInt(args[0], 10);
        const curHp = Number(userData?.hp ?? 20);
        const newHp = args[0].startsWith('+') || args[0].startsWith('-') ? Math.max(0, curHp + val) : Math.max(0, val);
        await supabase.from('users').update({ hp: newHp, hp_recovery_start_timestamp: null }).eq('id', userData!.uid);
        addLine(`[SUCESSO] Sua vida foi alterada: ${curHp} ➔ ${newHp} corações.`, 'success');
        playTerminalSound('success');
        window.dispatchEvent(new CustomEvent('user-data-updated'));
        return;
      }

      // Caso com alvo de jogador
      let targetIdentifier = '';
      let hpAction: 'view' | 'set' | 'add' | 'full' = 'view';
      let hpVal = 0;

      const lastToken = args[args.length - 1].toLowerCase();
      const secondLast = args.length >= 2 ? args[args.length - 2] : '';

      if (lastToken === 'full' || lastToken === 'max') {
        hpAction = 'full';
        targetIdentifier = args.slice(0, args.length - 1).join(' ').trim();
      } else if (/^\d+$/.test(lastToken) && (secondLast === '+' || secondLast === '-')) {
        hpAction = 'add';
        const num = parseInt(lastToken, 10);
        hpVal = secondLast === '-' ? -num : num;
        targetIdentifier = args.slice(0, args.length - 2).join(' ').trim();
      } else if (/^[+-]\d+$/.test(lastToken)) {
        hpAction = 'add';
        hpVal = parseInt(lastToken, 10);
        targetIdentifier = args.slice(0, args.length - 1).join(' ').trim();
      } else if (/^\d+$/.test(lastToken) && args.length >= 2) {
        hpAction = 'set';
        hpVal = parseInt(lastToken, 10);
        targetIdentifier = args.slice(0, args.length - 1).join(' ').trim();
      } else {
        hpAction = 'view';
        targetIdentifier = args.join(' ').trim();
      }

      const res = await resolveTargetPlayer(targetIdentifier, userData?.tenant_id);
      if (!res.player) {
        addLine(`[ERRO] ${res.error || 'Jogador não encontrado.'}`, 'error');
        playTerminalSound('error');
        return;
      }
      const targetUser = res.player;
      const targetName = targetUser.name || targetUser.character_name || 'Jogador';
      const curHp = Number(targetUser.hp ?? 5);
      const maxHp = Number(targetUser.max_hp ?? 20);

      if (hpAction === 'view') {
        addLine(`❤️ Vida (HP) de ${targetName}: ${curHp} / ${maxHp} corações`, 'info');
        return;
      }

      let finalHp = curHp;
      if (hpAction === 'full') {
        finalHp = maxHp;
      } else if (hpAction === 'set') {
        finalHp = Math.max(0, hpVal);
      } else if (hpAction === 'add') {
        finalHp = Math.max(0, curHp + hpVal);
      }

      const { error: updErr } = await supabase
        .from('users')
        .update({ hp: finalHp, hp_recovery_start_timestamp: null })
        .eq('id', targetUser.id);

      if (updErr) {
        addLine(`[ERRO] Falha ao atualizar vida de ${targetName}: ${updErr.message}`, 'error');
        playTerminalSound('error');
        return;
      }

      addLine(`[SUCESSO] Vida de ${targetName} atualizada: ${curHp} ➔ ${finalHp} corações (por ${adminFirstName})`, 'success');
      playTerminalSound('success');

      if (targetUser.id === userData?.uid) {
        window.dispatchEvent(new CustomEvent('user-data-updated'));
      }
      return;
    }

    // 7. Comando Listar Itens (/items ou /list)
    if (cmd === '/items' || cmd === '/itens' || cmd === '/list' || cmd === 'items') {
      const filter = args.join(' ').toLowerCase().trim();
      let matches = items;
      if (filter) {
        matches = items.filter(i => 
          String(i.code) === filter ||
          i.name.toLowerCase().includes(filter) ||
          i.type.toLowerCase().includes(filter) ||
          i.rarity.toLowerCase().includes(filter)
        );
      }

      if (matches.length === 0) {
        addLine(`Nenhum item encontrado com o termo "${filter}".`, 'error');
        return;
      }

      addLine(`CATÁLOGO DE ITENS (${matches.length} encontrado(s)):`, 'info');
      matches.slice(0, 25).forEach(i => {
        const typeBadge = i.type === 'equippable' ? '⚔️ Equipável' : (i.type === 'consumable' ? '🧪 Consumível' : '📦 Material');
        addLine(`  #${String(i.code).padEnd(3)} | ${i.name.padEnd(28)} | ${typeBadge.padEnd(14)} | ${i.rarity}`, 'output');
      });
      if (matches.length > 25) {
        addLine(`  ... e mais ${matches.length - 25} itens. Use o botão [Catálogo de IDs] acima para visualizar todos com imagens.`, 'info');
      }
      addLine('Dica: Use /i <código> [poder] [qtd] [jogador] para gerar.', 'info');
      return;
    }

    // 8. Comando Criar Item (/i <código> [poder] [quantidade] [jogador])
    if (cmd === '/i' || cmd === '/item') {
      if (args.length === 0) {
        addLine('Uso incorreto! Formatos aceitos:', 'error');
        addLine('  • Equipáveis:   /i <código> [poder: 0-9] [quantidade] [jogador]', 'error');
        addLine('  • Consumíveis:  /i <código> [quantidade: 1-99] [jogador]', 'error');
        addLine('Exemplo: /i 1 3 1 (gera 1x Item #1 +3 para você) | Digite /items para ver os códigos.', 'info');
        playTerminalSound('error');
        return;
      }

      const itemIdentifier = args[0];
      let targetItem: IndexedStoreItem | undefined;

      // Busca por código numérico #1..#N
      const numericCode = parseInt(itemIdentifier, 10);
      if (!isNaN(numericCode) && numericCode > 0 && numericCode <= items.length) {
        targetItem = items.find(i => i.code === numericCode);
      }

      // Se não encontrou por número, busca por UUID ou nome
      if (!targetItem) {
        targetItem = items.find(i => i.id.toLowerCase() === itemIdentifier.toLowerCase() || i.id.toLowerCase().startsWith(itemIdentifier.toLowerCase()));
      }
      if (!targetItem) {
        targetItem = items.find(i => i.name.toLowerCase() === itemIdentifier.toLowerCase());
      }
      if (!targetItem) {
        targetItem = items.find(i => i.name.toLowerCase().includes(itemIdentifier.toLowerCase()));
      }

      if (!targetItem) {
        addLine(`[ERRO] Item não encontrado com o identificador "${itemIdentifier}". Digite /items para consultar a lista.`, 'error');
        playTerminalSound('error');
        return;
      }

      const isEquippable = targetItem.type === 'equippable';

      let power = 0;
      let quantity = 1;
      let recipientSearch: string | null = null;

      if (isEquippable) {
        // args[1]: poder (0-9) ou nome de jogador se não for número
        if (args[1] !== undefined) {
          if (/^\d+$/.test(args[1])) {
            power = Math.max(0, Math.min(9, parseInt(args[1], 10) || 0));
          } else {
            recipientSearch = args.slice(1).join(' ');
          }
        }
        // args[2]: quantidade ou nome de jogador
        if (args[2] !== undefined && !recipientSearch) {
          if (/^\d+$/.test(args[2])) {
            quantity = Math.max(1, parseInt(args[2], 10) || 1);
          } else {
            recipientSearch = args.slice(2).join(' ');
          }
        }
        // args[3]: jogador
        if (args[3] !== undefined && !recipientSearch) {
          recipientSearch = args.slice(3).join(' ');
        }
      } else {
        // Para consumíveis: args[1] é quantidade ou jogador
        if (args[1] !== undefined) {
          if (/^\d+$/.test(args[1])) {
            quantity = Math.max(1, Math.min(99, parseInt(args[1], 10) || 1));
          } else {
            recipientSearch = args.slice(1).join(' ');
          }
        }
        if (args[2] !== undefined && !recipientSearch) {
          recipientSearch = args.slice(2).join(' ');
        }
      }

      // Identifica o destinatário (admin ou jogador)
      let recipientUser: any = userData!;
      let isSelfRecipient = true;
      if (recipientSearch) {
        const res = await resolveTargetPlayer(recipientSearch, userData?.tenant_id);
        if (!res.player) {
          addLine(`[ERRO] Destinatário "${recipientSearch}" não encontrado: ${res.error}`, 'error');
          playTerminalSound('error');
          return;
        }
        recipientUser = res.player;
        isSelfRecipient = (recipientUser.id || recipientUser.uid) === userData?.uid;
      }

      const recipientId = recipientUser?.id || recipientUser?.uid;
      const recipientName = recipientUser?.name || recipientUser?.characterName || recipientUser?.character_name || (isSelfRecipient ? 'sua' : 'jogador');

      // Verificação de Limite de Espaço na Mochila do Destinatário
      try {
        const { data: recipientItemsSnap } = await supabase
          .from('user_items')
          .select('id, equipped, data')
          .eq('student_id', recipientId);

        const currentRows = recipientItemsSnap || [];
        const unequippedRows = currentRows.filter(r => !r.equipped);
        const maxSpace = computeMaxInventorySpace(recipientUser);
        const freeSlots = Math.max(0, maxSpace - unequippedRows.length);

        if (isEquippable) {
          if (quantity > freeSlots) {
            addLine(`[ERRO] Mochila cheia! ${isSelfRecipient ? 'Você precisa' : `"${recipientName}" precisa`} de ${quantity} slot(s) livre(s), mas possui apenas ${freeSlots} slot(s) disponível(is). Nenhum item foi gerado.`, 'error');
            playTerminalSound('error');
            return;
          }
        } else {
          // Itens empilháveis: verifica se já tem pilha com espaço
          const existingStack = unequippedRows.find(r => {
            const dt = r.data || {};
            return (dt.itemTitle === targetItem!.name || dt.title === targetItem!.name) && (Number(dt.quantity) || 1) < 99;
          });

          if (!existingStack && freeSlots <= 0) {
            addLine(`[ERRO] Mochila cheia! Não há slots livres para criar uma nova pilha de "${targetItem.name}".`, 'error');
            playTerminalSound('error');
            return;
          }
        }

        // Geração dos Itens
        addLine(`Gerando ${quantity}x "${targetItem.name}"${isEquippable && power > 0 ? ` +${power}` : ''} para ${isSelfRecipient ? 'sua mochila' : recipientName}...`, 'info');

        if (isEquippable) {
          const globalGachaConfig = await fetchGlobalGachaConfig();
          const maxAdds = getMaxAddsLimit(targetItem.data?.minRankRequired);

          // Verifica se o item possui efeito especial configurado (Adds especiais: fogo, gelo, veneno, raio, transformar, etc.)
          const itemEff = targetItem.data?.damageEffect;
          const hasSpecialEffect = itemEff && itemEff !== 'none' && isEffectAddType(itemEff);

          for (let k = 0; k < quantity; k++) {
            // Sorteia adds adicionais (fortitude, bônus xp, moedas, etc.) usando as chances reais do sistema (nem sempre vem add adicional)
            const rolledAdds = rollItemAdds(
              targetItem.data?.gachaConfig,
              targetItem.data?.fixedAttributes,
              (targetItem.data?.useGlobalGacha ?? true) ? globalGachaConfig : undefined,
              maxAdds
            );

            // Adds especiais: SOMENTE se o item original do sistema possuir efeito de dano especial configurado.
            // Itens comuns (como espada comum de madeira) NUNCA recebem efeito especial de fogo, gelo, etc.
            const finalAdds = hasSpecialEffect
              ? applyEffectAdd(rolledAdds, itemEff, targetItem.data?.damageEffectMin, targetItem.data?.damageEffectMax)
              : rolledAdds.filter((a: any) => !isEffectAddType(a.type));

            const payload: any = {
              ...targetItem.data,
              itemTitle: targetItem.name,
              itemDescription: targetItem.description || '',
              itemType: 'equippable',
              itemImageUrl: targetItem.imageUrl || '',
              avatarPart: targetItem.avatarPart || null,
              itemCategory: targetItem.itemCategory || 'none',
              baseAttributeType: targetItem.baseAttributeType || 'none',
              baseAttributeValue: targetItem.baseAttributeValue || 0,
              forgeLevel: power,
              forgeConfig: targetItem.data?.forgeConfig || null,
              adds: finalAdds,
              fixedAttributes: targetItem.data?.fixedAttributes || [],
              gameModelUrl: targetItem.data?.gameModelUrl || '',
              keepMetal: targetItem.data?.keepMetal || false,
              modelTextureUrl: targetItem.data?.modelTextureUrl || '',
              minecraftHeadValue: targetItem.data?.minecraftHeadValue || '',
              modelTransforms: targetItem.data?.modelTransforms || null,
              rarity: targetItem.rarity || 'common',
              quantity: 1,
              damageEffect: hasSpecialEffect ? itemEff : 'none',
              damageEffectMin: hasSpecialEffect ? (targetItem.data?.damageEffectMin ?? null) : null,
              damageEffectMax: hasSpecialEffect ? (targetItem.data?.damageEffectMax ?? null) : null,
              backColor: targetItem.data?.backColor || '',
            };

            const insertRow: any = {
              student_id: recipientId,
              item_id: targetItem.id,
              equipped: false,
              data: payload,
            };
            if (targetItem.data?.tenant_id || recipientUser.tenant_id) {
              insertRow.tenant_id = targetItem.data?.tenant_id || recipientUser.tenant_id;
            }

            const { error: insErr } = await supabase.from('user_items').insert(insertRow);
            if (insErr) throw insErr;
          }
        } else {
          // Consumíveis / Outros empilháveis
          const existingRow = unequippedRows.find(r => {
            const dt = r.data || {};
            return (dt.itemTitle === targetItem!.name || dt.title === targetItem!.name) && (Number(dt.quantity) || 1) < 99;
          });

          if (existingRow) {
            const curQ = Number((existingRow.data as any)?.quantity) || 1;
            const spaceInStack = 99 - curQ;
            const addQ = Math.min(spaceInStack, quantity);
            const remaining = quantity - addQ;

            await supabase
              .from('user_items')
              .update({ data: { ...(existingRow.data as any), quantity: curQ + addQ } })
              .eq('id', existingRow.id);

            if (remaining > 0) {
              const payload: any = {
                ...targetItem.data,
                itemTitle: targetItem.name,
                itemDescription: targetItem.description || '',
                itemType: targetItem.type || 'other',
                itemImageUrl: targetItem.imageUrl || '',
                rarity: targetItem.rarity || 'common',
                quantity: remaining,
              };
              await supabase.from('user_items').insert({
                student_id: recipientId,
                item_id: targetItem.id,
                equipped: false,
                data: payload,
              });
            }
          } else {
            const payload: any = {
              ...targetItem.data,
              itemTitle: targetItem.name,
              itemDescription: targetItem.description || '',
              itemType: targetItem.type || 'other',
              itemImageUrl: targetItem.imageUrl || '',
              rarity: targetItem.rarity || 'common',
              quantity: quantity,
            };
            await supabase.from('user_items').insert({
              student_id: recipientId,
              item_id: targetItem.id,
              equipped: false,
              data: payload,
            });
          }
        }

        // Sucesso total
        addLine(`[SUCESSO] ${quantity}x "${targetItem.name}"${isEquippable ? ` +${power}` : ''} adicionado(s) à mochila de ${isSelfRecipient ? 'sua conta' : recipientName}! (por ${adminFirstName})`, 'success');
        playTerminalSound('success');

        // Notifica o restante da aplicação para sincronizar imediatamente
        invalidateEquippedItems(recipientId);
        window.dispatchEvent(new CustomEvent('inventory-changed'));
        window.dispatchEvent(new CustomEvent('refresh-inventory'));
      } catch (err: any) {
        addLine(`[ERRO] Falha ao criar item: ${err.message}`, 'error');
        playTerminalSound('error');
      }
      return;
    }

    // Comando não reconhecido
    addLine(`[ERRO] Comando desconhecido: "${cmd}". Digite /help para ver os comandos válidos.`, 'error');
    playTerminalSound('error');
  };

  // Navegação no histórico com Setas Cima/Baixo
  const handleKeyDownInput = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleExecuteCommand(inputVal);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (commandHistory.length === 0) return;
      const nextIdx = Math.min(commandHistory.length - 1, historyIndex + 1);
      setHistoryIndex(nextIdx);
      setInputVal(commandHistory[nextIdx]);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex > 0) {
        const nextIdx = historyIndex - 1;
        setHistoryIndex(nextIdx);
        setInputVal(commandHistory[nextIdx]);
      } else if (historyIndex === 0) {
        setHistoryIndex(-1);
        setInputVal('');
      }
    }
  };

  // Filtro do Catálogo de IDs
  const filteredCatalog = useMemo(() => {
    let result = items;
    if (catalogCategory !== 'all') {
      result = result.filter(i => {
        if (catalogCategory === 'equippable') return i.type === 'equippable';
        if (catalogCategory === 'consumable') return i.type === 'consumable';
        return i.type !== 'equippable' && i.type !== 'consumable';
      });
    }
    if (catalogSearch.trim()) {
      const q = catalogSearch.toLowerCase();
      result = result.filter(i => 
        String(i.code).includes(q) ||
        i.name.toLowerCase().includes(q) ||
        i.rarity.toLowerCase().includes(q) ||
        (i.itemCategory && i.itemCategory.toLowerCase().includes(q))
      );
    }
    return result;
  }, [items, catalogCategory, catalogSearch]);

  if (!isAdmin || !isOpen) return null;

  return (
    <div 
      className="admin-console-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999999,
        background: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
        animation: 'fadeIn 0.15s ease-out'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) setIsOpen(false);
      }}
    >
      <div 
        className="admin-console-window"
        style={{
          width: '100%',
          maxWidth: isCatalogOpen ? '1100px' : '840px',
          height: '620px',
          maxHeight: '90vh',
          background: 'rgba(9, 13, 20, 0.96)',
          border: '1px solid rgba(16, 185, 129, 0.45)',
          borderRadius: '14px',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.9), 0 0 30px rgba(16, 185, 129, 0.15)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          transition: 'max-width 0.25s ease',
          position: 'relative'
        }}
      >
        {/* Cabeçalho do Console */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.65rem 1rem',
          background: 'rgba(15, 23, 42, 0.85)',
          borderBottom: '1px solid rgba(16, 185, 129, 0.25)',
          userSelect: 'none'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <Terminal size={18} color="#10b981" />
            <span style={{ fontFamily: 'monospace', fontWeight: 'bold', fontSize: '0.85rem', color: '#10b981', letterSpacing: '0.5px' }}>
              MATH MASTERY // ADMIN CONSOLE
            </span>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.3rem',
              fontSize: '0.65rem',
              fontWeight: 700,
              padding: '0.15rem 0.5rem',
              borderRadius: '12px',
              background: 'rgba(16, 185, 129, 0.15)',
              color: '#34d399',
              border: '1px solid rgba(16, 185, 129, 0.3)'
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', boxShadow: '0 0 6px #10b981' }} />
              ONLINE
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {/* Botão Relação de Itens / Catálogo */}
            <button
              onClick={() => setIsCatalogOpen(!isCatalogOpen)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                fontSize: '0.75rem',
                padding: '0.3rem 0.7rem',
                borderRadius: '6px',
                background: isCatalogOpen ? 'rgba(59, 130, 246, 0.25)' : 'rgba(255, 255, 255, 0.08)',
                color: isCatalogOpen ? '#60a5fa' : 'var(--text-secondary, #94a3b8)',
                border: isCatalogOpen ? '1px solid #3b82f6' : '1px solid rgba(255, 255, 255, 0.15)',
                cursor: 'pointer',
                transition: 'all 0.15s'
              }}
              title="Ver relação de códigos dos itens"
            >
              <Package size={14} />
              <span>Catálogo de IDs ({items.length})</span>
            </button>

            {/* Botão Ajuda */}
            <button
              onClick={() => handleExecuteCommand('/help')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.3rem',
                fontSize: '0.75rem',
                padding: '0.3rem 0.6rem',
                borderRadius: '6px',
                background: 'rgba(255, 255, 255, 0.08)',
                color: 'var(--text-secondary, #94a3b8)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                cursor: 'pointer'
              }}
            >
              <HelpCircle size={14} />
              <span>Ajuda</span>
            </button>

            {/* Botão Limpar */}
            <button
              onClick={() => setLines([])}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.3rem',
                fontSize: '0.75rem',
                padding: '0.3rem 0.6rem',
                borderRadius: '6px',
                background: 'rgba(255, 255, 255, 0.08)',
                color: 'var(--text-secondary, #94a3b8)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                cursor: 'pointer'
              }}
              title="Limpar tela"
            >
              <Trash2 size={14} />
            </button>

            {/* Fechar */}
            <button
              onClick={() => setIsOpen(false)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#94a3b8',
                cursor: 'pointer',
                padding: '0.2rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '4px'
              }}
              title="Fechar ( ' ou Esc )"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Corpo: Terminal + Gaveta Opcional de Catálogo */}
        <div style={{ flex: 1, display: 'flex', minHeight: 0, position: 'relative' }}>
          
          {/* Área Principal do Terminal */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            {/* Linhas de Saída */}
            <div 
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '1rem',
                fontFamily: "'Fira Code', Consolas, 'Courier New', monospace",
                fontSize: '0.85rem',
                lineHeight: '1.5',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.35rem'
              }}
            >
              {lines.map(line => {
                let color = '#e2e8f0';
                if (line.type === 'cmd') color = '#fbbf24';
                else if (line.type === 'success') color = '#34d399';
                else if (line.type === 'error') color = '#f87171';
                else if (line.type === 'info') color = '#38bdf8';

                return (
                  <div key={line.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', wordBreak: 'break-word', color }}>
                    <span style={{ opacity: 0.35, fontSize: '0.7rem', flexShrink: 0, userSelect: 'none' }}>[{line.timestamp}]</span>
                    <span style={{ flex: 1, whiteSpace: 'pre-wrap' }}>{line.text}</span>
                  </div>
                );
              })}
              <div ref={terminalEndRef} />
            </div>

            {/* Linha de Comando / Input */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.65rem 1rem',
              background: 'rgba(15, 23, 42, 0.95)',
              borderTop: '1px solid rgba(16, 185, 129, 0.25)'
            }}>
              <span style={{
                fontFamily: 'monospace',
                fontWeight: 'bold',
                fontSize: '0.9rem',
                color: '#10b981',
                flexShrink: 0,
                userSelect: 'none'
              }}>
                admin@math-mastery:~$
              </span>
              <input
                ref={inputRef}
                type="text"
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                onKeyDown={handleKeyDownInput}
                placeholder="Digite um comando (ex: /i 1 3 1) e pressione Enter..."
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: '#f8fafc',
                  fontFamily: 'monospace',
                  fontSize: '0.9rem'
                }}
              />
              <button
                onClick={() => handleExecuteCommand(inputVal)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.3rem',
                  padding: '0.4rem 0.8rem',
                  borderRadius: '6px',
                  background: '#10b981',
                  color: '#022c22',
                  fontWeight: 'bold',
                  fontSize: '0.8rem',
                  border: 'none',
                  cursor: 'pointer',
                  flexShrink: 0
                }}
              >
                <span>Executar</span>
                <CornerDownLeft size={14} />
              </button>
            </div>
          </div>

          {/* Gaveta Lateral: Relação de IDs dos Itens */}
          {isCatalogOpen && (
            <div style={{
              width: '380px',
              borderLeft: '1px solid rgba(16, 185, 129, 0.25)',
              background: 'rgba(12, 18, 30, 0.98)',
              display: 'flex',
              flexDirection: 'column',
              minHeight: 0
            }}>
              {/* Header do Catálogo */}
              <div style={{ padding: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <span style={{ fontWeight: 'bold', fontSize: '0.85rem', color: '#60a5fa', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <Package size={15} /> Relação de IDs ({filteredCatalog.length})
                  </span>
                  <button 
                    onClick={() => setIsCatalogOpen(false)}
                    style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
                  >
                    <X size={16} />
                  </button>
                </div>

                {/* Campo de Busca */}
                <div style={{ position: 'relative', marginBottom: '0.5rem' }}>
                  <Search size={14} color="#94a3b8" style={{ position: 'absolute', left: '0.5rem', top: '50%', transform: 'translateY(-50%)' }} />
                  <input
                    type="text"
                    value={catalogSearch}
                    onChange={(e) => setCatalogSearch(e.target.value)}
                    placeholder="Filtrar por nome ou ID..."
                    style={{
                      width: '100%',
                      padding: '0.35rem 0.5rem 0.35rem 1.8rem',
                      background: 'rgba(0,0,0,0.4)',
                      border: '1px solid rgba(255,255,255,0.15)',
                      borderRadius: '6px',
                      color: 'white',
                      fontSize: '0.8rem',
                      outline: 'none'
                    }}
                  />
                </div>

                {/* Filtros Rápidos */}
                <div style={{ display: 'flex', gap: '0.3rem' }}>
                  {[
                    { id: 'all', label: 'Todos' },
                    { id: 'equippable', label: 'Equip.' },
                    { id: 'consumable', label: 'Consum.' },
                    { id: 'other', label: 'Materiais' },
                  ].map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setCatalogCategory(tab.id as any)}
                      style={{
                        flex: 1,
                        padding: '0.2rem 0.4rem',
                        fontSize: '0.7rem',
                        borderRadius: '4px',
                        border: 'none',
                        cursor: 'pointer',
                        background: catalogCategory === tab.id ? 'var(--gold-primary, #fbbf24)' : 'rgba(255,255,255,0.08)',
                        color: catalogCategory === tab.id ? '#000' : 'var(--text-secondary, #94a3b8)',
                        fontWeight: catalogCategory === tab.id ? 'bold' : 'normal'
                      }}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Lista dos Itens */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {loadingItems ? (
                  <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>Carregando catálogo de itens...</div>
                ) : filteredCatalog.length === 0 ? (
                  <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>Nenhum item encontrado.</div>
                ) : (
                  filteredCatalog.map(it => {
                    const rColor = RARITY_COLORS[it.rarity] || '#9ca3af';
                    const isEq = it.type === 'equippable';

                    return (
                      <div
                        key={it.id + it.code}
                        style={{
                          background: 'rgba(255,255,255,0.03)',
                          border: `1px solid ${rColor}33`,
                          borderRadius: '8px',
                          padding: '0.5rem',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.6rem',
                          transition: 'all 0.15s'
                        }}
                      >
                        {/* Código Sequencial */}
                        <div style={{
                          minWidth: '34px',
                          textAlign: 'center',
                          padding: '0.2rem 0.3rem',
                          borderRadius: '4px',
                          background: 'rgba(16, 185, 129, 0.15)',
                          color: '#34d399',
                          fontWeight: 'bold',
                          fontFamily: 'monospace',
                          fontSize: '0.8rem',
                          border: '1px solid rgba(16, 185, 129, 0.3)'
                        }}>
                          #{it.code}
                        </div>

                        {/* Ícone */}
                        <div style={{
                          width: '34px',
                          height: '34px',
                          borderRadius: '6px',
                          background: 'rgba(0,0,0,0.5)',
                          border: `1px solid ${rColor}`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                          overflow: 'hidden'
                        }}>
                          {it.imageUrl ? (
                            <img src={it.imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                          ) : (
                            <Package size={16} color={rColor} />
                          )}
                        </div>

                        {/* Info */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <span style={{ fontSize: '0.82rem', fontWeight: 'bold', color: 'white', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={it.name}>
                              {it.name}
                            </span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '0.15rem' }}>
                            <span style={{ fontSize: '0.65rem', color: rColor, fontWeight: 'bold', textTransform: 'capitalize' }}>
                              {it.rarity}
                            </span>
                            <span style={{ fontSize: '0.65rem', color: '#94a3b8' }}>•</span>
                            <span style={{ fontSize: '0.65rem', color: '#94a3b8' }}>
                              {isEq ? 'Equipável' : (it.type === 'consumable' ? 'Consumível' : 'Material')}
                            </span>
                          </div>
                        </div>

                        {/* Ações Rápidas de Inserção */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', flexShrink: 0 }}>
                          {isEq ? (
                            <div style={{ display: 'flex', gap: '0.2rem' }}>
                              <button
                                onClick={() => handleExecuteCommand(`/i ${it.code} 0 1`)}
                                style={{ padding: '0.2rem 0.35rem', fontSize: '0.65rem', borderRadius: '4px', background: 'rgba(255,255,255,0.08)', color: '#cbd5e1', border: '1px solid rgba(255,255,255,0.2)', cursor: 'pointer' }}
                                title="Gerar +0"
                              >
                                +0
                              </button>
                              <button
                                onClick={() => handleExecuteCommand(`/i ${it.code} 3 1`)}
                                style={{ padding: '0.2rem 0.35rem', fontSize: '0.65rem', borderRadius: '4px', background: 'rgba(59,130,246,0.2)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.4)', cursor: 'pointer', fontWeight: 'bold' }}
                                title="Gerar +3"
                              >
                                +3
                              </button>
                              <button
                                onClick={() => handleExecuteCommand(`/i ${it.code} 9 1`)}
                                style={{ padding: '0.2rem 0.35rem', fontSize: '0.65rem', borderRadius: '4px', background: 'rgba(245,158,11,0.2)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.5)', cursor: 'pointer', fontWeight: 'bold' }}
                                title="Gerar +9 MÁXIMO"
                              >
                                +9
                              </button>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', gap: '0.2rem' }}>
                              <button
                                onClick={() => handleExecuteCommand(`/i ${it.code} 1`)}
                                style={{ padding: '0.2rem 0.35rem', fontSize: '0.65rem', borderRadius: '4px', background: 'rgba(255,255,255,0.08)', color: '#cbd5e1', border: '1px solid rgba(255,255,255,0.2)', cursor: 'pointer' }}
                                title="Gerar 1 unidade"
                              >
                                x1
                              </button>
                              <button
                                onClick={() => handleExecuteCommand(`/i ${it.code} 10`)}
                                style={{ padding: '0.2rem 0.35rem', fontSize: '0.65rem', borderRadius: '4px', background: 'rgba(16,185,129,0.2)', color: '#34d399', border: '1px solid rgba(16,185,129,0.4)', cursor: 'pointer', fontWeight: 'bold' }}
                                title="Gerar 10 unidades"
                              >
                                x10
                              </button>
                              <button
                                onClick={() => handleExecuteCommand(`/i ${it.code} 99`)}
                                style={{ padding: '0.2rem 0.35rem', fontSize: '0.65rem', borderRadius: '4px', background: 'rgba(245,158,11,0.2)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.5)', cursor: 'pointer', fontWeight: 'bold' }}
                                title="Gerar 99 unidades"
                              >
                                x99
                              </button>
                            </div>
                          )}

                          {/* Preenche no input do console */}
                          <button
                            onClick={() => {
                              setInputVal(`/i ${it.code} `);
                              inputRef.current?.focus();
                              setCopiedCode(it.code);
                              setTimeout(() => setCopiedCode(null), 1500);
                            }}
                            style={{
                              padding: '0.15rem 0.35rem',
                              fontSize: '0.65rem',
                              borderRadius: '4px',
                              background: 'transparent',
                              color: copiedCode === it.code ? '#10b981' : '#94a3b8',
                              border: 'none',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '0.2rem'
                            }}
                            title="Inserir comando no console"
                          >
                            {copiedCode === it.code ? <Check size={11} /> : <Copy size={11} />}
                            <span>{copiedCode === it.code ? 'Inserido' : `/i ${it.code}`}</span>
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
