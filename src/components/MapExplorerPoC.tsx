import React, { useEffect, useRef, useState, useCallback } from 'react';
import { SkinViewer, IdleAnimation, WalkingAnimation, HitAnimation, PlayerAnimation } from 'skinview3d';
// @ts-ignore - Three do skinview3d (mesma versão do boneco)
import * as THREE from 'skinview3d/node_modules/three';
// @ts-ignore
import { GLTFLoader } from 'skinview3d/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import { generateMinecraftSkinUrl } from '../lib/SkinGenerator';
import { generateVoxelItemFromImage } from '../lib/VoxelItemGenerator';
import { applyForgeGlowToModel, applyForgeGlint, resolveModelTransform, type AvatarConfig, type EquippedItem } from './AvatarCharacter';
import { useAuth } from '../contexts/AuthContext';
import { fetchEquippedItems } from '../lib/equippedItems';
import { supabase } from '../lib/supabase';
import { calculateTotalStats } from '../lib/gacha';
import { RANKS, getRankForXp } from '../lib/ranks';
import { fetchActiveCoin, fetchActiveChest, isImageUrl } from '../lib/model3d';
import { calculatePlayerHitDamage } from '../lib/combatDamage';
import { getEquippedDamageEffectInfo } from '../lib/damageEffects';
import { resolveConsumableEffect } from '../lib/consumableEffects';
import { playConsumableSound } from '../lib/audioBank';
import { fetchPlayerBattleQuotes, pickPlayerBattleQuote, type PlayerBattleQuotes } from '../lib/playerQuotes';
import ConsumableAnimationOverlay from './ConsumableAnimationOverlay';

// Tocador de efeitos ROBUSTO (WebAudio): desbloqueia no 1º gesto e pré-decodifica os
// áudios, para tocarem SEM depender do autoplay do HTMLAudio (que às vezes é bloqueado).
const sfx = (() => {
  let ctx: AudioContext | null = null;
  const cache = new Map<string, AudioBuffer>();
  let lastError = '';
  const ensure = (): AudioContext | null => { if (!ctx) { try { ctx = new ((window as any).AudioContext || (window as any).webkitAudioContext)(); } catch (e: any) { lastError = 'ctx:' + (e?.message || e); ctx = null; } } return ctx; };
  const preload = async (url: string) => {
    if (!url || cache.has(url)) return;
    const c = ensure(); if (!c) return;
    try { const r = await fetch(url); const ab = await r.arrayBuffer(); const buf = await c.decodeAudioData(ab); cache.set(url, buf); } catch (e: any) { lastError = 'decode:' + (e?.message || e); }
  };
  return {
    unlock() { const c = ensure(); if (c && c.state === 'suspended') c.resume().catch((e: any) => { lastError = 'resume:' + (e?.message || e); }); },
    preload,
    play(url: string, vol = 0.8) {
      if (!url) { lastError = 'no-url'; return; }
      const c = ensure(); if (!c) return;
      if (c.state === 'suspended') c.resume().catch((e: any) => { lastError = 'resume:' + (e?.message || e); });
      const buf = cache.get(url);
      if (buf) { try { const s = c.createBufferSource(); s.buffer = buf; const g = c.createGain(); g.gain.value = vol; s.connect(g); g.connect(c.destination); s.start(); return; } catch (e: any) { lastError = 'buf:' + (e?.message || e); } }
      try { const a = new Audio(url); a.volume = vol; a.play().catch((e: any) => { lastError = 'html5:' + (e?.name || e?.message || e); }); } catch (e: any) { lastError = 'new:' + (e?.message || e); }
      preload(url);
    },
    status() { const c = ensure(); return { state: c ? c.state : 'none', buffers: cache.size, error: lastError }; },
    // Tom SINTETIZADO (sem arquivo) — para testar a saída de áudio do dispositivo.
    beep(vol = 0.35) {
      const c = ensure(); if (!c) return;
      if (c.state === 'suspended') c.resume().catch((e: any) => { lastError = 'resume:' + (e?.message || e); });
      try {
        const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = 660;
        const g = c.createGain(); g.gain.value = vol;
        o.connect(g); g.connect(c.destination); o.start(); o.stop(c.currentTime + 0.8);
      } catch (e: any) { lastError = 'beep:' + (e?.message || e); }
    },
  };
})();

// Efeitos de consumível ÚTEIS no cenário de exploração (cura HP e cura de efeitos).
// Ex.: "calmante" e outros sem serventia aqui NÃO entram no inventário.
const USEFUL_CONSUMABLE_EFFECTS = new Set(['restore_hp', 'heal_1_hp', 'cure_freeze', 'cure_burn', 'cure_poison', 'cure_bleed', 'cure_electric', 'cure_stun']);

/* ============================================================
   MAP EXPLORER POC (Three puro) — personagem 3D REAL no mapa,
   câmera 3ª pessoa, corpo gira ao andar, colisão e NÉVOA de
   exploração (áreas não exploradas cobertas por película preta).
   ============================================================ */

type ThemeKey = 'plains' | 'desert' | 'nether' | 'tundra' | 'end';

const THEMES: Record<ThemeKey, {
  label: string; ground: string; wall: string; sky: string; fog: string;
  hazardLabel: string; hazardColor: string; hazardOn: boolean; fatal?: boolean;
}> = {
  plains: { label: '🌿 Planície Verdejante', ground: '#6ab04c', wall: '#2f6b22', sky: '#7ec8ee', fog: '#aee3b8', hazardLabel: '—', hazardColor: '#ffffff', hazardOn: false },
  desert: { label: '🏜️ Deserto', ground: '#e0b063', wall: '#a9742f', sky: '#f8d99b', fog: '#f0cf94', hazardLabel: '🌵 Cacto (sangra)', hazardColor: '#2f9e44', hazardOn: true },
  nether: { label: '🌋 Nether Vulcânico', ground: '#4a2323', wall: '#8a4433', sky: '#2a0d0d', fog: '#4a1a1a', hazardLabel: '🌋 Lava (fogo)', hazardColor: '#ff8c00', hazardOn: true, fatal: true },
  tundra: { label: '❄️ Tundra Congelada', ground: '#cfe3f2', wall: '#8fb6dd', sky: '#a9cde8', fog: '#d7e8f5', hazardLabel: '🧊 Frio (congela)', hazardColor: '#8fc0ff', hazardOn: true },
  end: { label: '🟣 O Fim (apocalíptico)', ground: '#4a4657', wall: '#241f2f', sky: '#100f16', fog: '#1c1a26', hazardLabel: '💥 Solo instável', hazardColor: '#b06bff', hazardOn: true, fatal: true },
};

const COLS = 48, ROWS = 18;
const REVEAL_RADIUS = 5;
// Resistência dos quebráveis (picareta precisa vencer a DEFESA; o excedente + ataque vira dano).
const WALL_HP = 1000, WALL_DEF = 250;
const ROCK_DEF = 5, HAZARD_DEF = 5, DOOR_HP = 600, DOOR_DEF = 120;
// Dano da picareta de DEBUG (item muito forte, para testar paredes/portas).
const DEBUG_PICKAXE_DMG = 300;
// Detecta dispositivo de toque (mobile) para adaptar as dicas de interação.
const IS_TOUCH = typeof window !== 'undefined' && (('ontouchstart' in window) || (navigator.maxTouchPoints || 0) > 0);

// Animação de ataque: sobe o braço e DESCE com força (corte completo), como na batalha.
function makeAttack(): any {
  return new (class extends PlayerAnimation {
    animate(player: any) {
      const t = Math.min(1, (this as any).progress);
      // 0 → 0.35: levanta o braço; 0.35 → 1: desce com força (corte)
      const swing = t < 0.35 ? (t / 0.35) : (1 - (t - 0.35) / 0.65);
      const a = Math.max(0, Math.min(1, swing));
      const ra = player.skin.rightArm; const la = player.skin.leftArm;
      if (ra) { ra.rotation.x = -Math.PI * 0.95 * a; ra.rotation.z = -0.25 * a; }
      if (la) { la.rotation.x = Math.PI * 0.2 * a; la.rotation.z = Math.PI * 0.02; }
      if (player.skin.body) player.skin.body.rotation.x = -0.12 * a;
    }
  })();
}

interface Grid { wall: boolean[][]; start: { x: number; z: number }; end: { x: number; z: number }; doorCells: { x: number; z: number }[] }

function generateGrid(): Grid {
  const isWallCell = (wall: boolean[][], x: number, z: number) => x < 0 || x >= COLS || z < 0 || z >= ROWS || wall[z][x];
  const reachable = (wall: boolean[][], start: { x: number; z: number }) => {
    const seen = new Set<string>([`${start.x},${start.z}`]); const q = [start];
    while (q.length) { const c = q.shift()!; for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = c.x + dx, nz = c.z + dz; if (isWallCell(wall, nx, nz)) continue; const k = `${nx},${nz}`; if (!seen.has(k)) { seen.add(k); q.push({ x: nx, z: nz }); } } }
    return seen;
  };
  const DOOR_COLS = [Math.floor(COLS * 0.42), Math.floor(COLS * 0.72)];
  for (let attempt = 0; attempt < 80; attempt++) {
    const wall: boolean[][] = [];
    for (let z = 0; z < ROWS; z++) { const row: boolean[] = []; for (let x = 0; x < COLS; x++) row.push(Math.random() < 0.26); wall.push(row); }
    // Borda fechada: evita "cantos" acessíveis nas extremidades.
    for (let x = 0; x < COLS; x++) { wall[0][x] = true; wall[ROWS - 1][x] = true; }
    for (let z = 0; z < ROWS; z++) { wall[z][0] = true; wall[z][COLS - 1] = true; }
    const start = { x: 1, z: Math.floor(ROWS / 2) };
    const end = { x: COLS - 2, z: Math.floor(ROWS / 2) };
    wall[start.z][start.x] = false; wall[end.z][end.x] = false;
    // DIVISÓRIAS: cada coluna de porta vira parede inteira, exceto UMA célula (a porta).
    // Assim, é impossível chegar ao outro lado sem atravessar a porta (não dá pra burlar).
    const doorCells: { x: number; z: number }[] = [];
    for (const xd of DOOR_COLS) {
      const freeCol: number[] = [];
      for (let z = 0; z < ROWS; z++) if (!wall[z][xd]) freeCol.push(z);
      const zc = freeCol.length ? freeCol[Math.floor(Math.random() * freeCol.length)] : Math.floor(ROWS / 2);
      for (let z = 0; z < ROWS; z++) wall[z][xd] = (z !== zc);
      doorCells.push({ x: xd, z: zc });
    }
    const seen = reachable(wall, start);
    if (!seen.has(`${end.x},${end.z}`)) continue;
    // Fecha BOLSÕES inacessíveis (viram parede) → todo o chão restante é alcançável.
    for (let z = 0; z < ROWS; z++) for (let x = 0; x < COLS; x++) {
      if (!wall[z][x] && !seen.has(`${x},${z}`)) wall[z][x] = true;
    }
    // As portas precisam continuar acessíveis (não viraram parede).
    if (doorCells.some(d => wall[d.z][d.x])) continue;
    return { wall, start, end, doorCells };
  }
  const wall = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => false));
  return { wall, start: { x: 1, z: Math.floor(ROWS / 2) }, end: { x: COLS - 2, z: Math.floor(ROWS / 2) }, doorCells: [] };
}

export default function MapExplorerPoC({ onExit, config: configProp, equippedItems: itemsProp }: { onExit?: () => void; config?: AvatarConfig | null; equippedItems?: EquippedItem[] }) {
  const { userData } = useAuth();
  const [themeKey, setThemeKey] = useState<ThemeKey>('plains');
  const [seed, setSeed] = useState(0);
  const [msg, setMsg] = useState('WASD/Setas para andar · ESPAÇO para atacar (vigor) · E para abrir baú · Explore até o BOSS à direita.');
  const [coins, setCoins] = useState(0);
  const [dead, setDead] = useState(false);
  const [bossTouched, setBossTouched] = useState(false);
  const [playerHearts, setPlayerHearts] = useState<number>((userData as any)?.hp ?? 3);
  const [playerItems, setPlayerItems] = useState<EquippedItem[]>(itemsProp || []);
  const [consumables, setConsumables] = useState<any[]>([]);
  const [itemsReady, setItemsReady] = useState(!!itemsProp);
  const [stamina, setStamina] = useState(100);
  const [damagePops, setDamagePops] = useState<any[]>([]);
  const [activeConsumableAnim, setActiveConsumableAnim] = useState<any>(null);
  const [sfxOn, setSfxOn] = useState(false);
  const [sfxDiag, setSfxDiag] = useState('');
  const playerScreenRef = useRef({ x: 0, y: 0 });
  const animAnchorRef = useRef<'feet' | 'head'>('feet');
  const animWrapRef = useRef<HTMLDivElement>(null);
  const dragIdxRef = useRef<number | null>(null);
  const [doorQuestion, setDoorQuestion] = useState<any>(null);
  const [doorBusy, setDoorBusy] = useState(false);
  const [doorTarget, setDoorTarget] = useState<any>(null);
  const [puffs, setPuffs] = useState<any[]>([]);
  const [hint, setHint] = useState('');
  const mountRef = useRef<HTMLDivElement>(null);
  const theme = THEMES[themeKey];
  // HP em CORAÇÕES (estilo Zelda) IGUAL AO PERFIL: 3 + patente + vitalidade.
  // O que sobrar aqui é o que entra na batalha contra o chefe.
  const totalEquippedStats = calculateTotalStats(playerItems as any[], (userData as any)?.distributedStats);
  const currentRankObj = getRankForXp((userData as any)?.xp || 0, (userData as any)?.classId);
  const rankIndex = Math.max(0, RANKS.findIndex(r => r.name === currentRankObj.name));
  const maxHearts = Math.max(3, 3 + Math.floor(rankIndex / 2)) + Math.floor((totalEquippedStats.vitality || 0) / 30);
  const profileHp = (userData as any)?.hp;
  const startHearts = (profileHp !== undefined && profileHp !== null) ? Math.min(maxHearts, Number(profileHp)) : maxHearts;
  // Valores "vivos" lidos pelo loop Three (evita reiniciar o jogo a cada render).
  const statsRef = useRef({ maxHearts, startHearts, attack: totalEquippedStats.attack, critChance: 5 });
  statsRef.current = {
    maxHearts, startHearts,
    attack: Math.max(1, totalEquippedStats.attack),
    critChance: Math.min(50, 5 + (totalEquippedStats.persuasion || 0) + Math.floor((totalEquippedStats.fortitude || 0) / 2)),
  };
  // Config do avatar lida por REF (o AuthContext atualiza o userData em visibilitychange/focus,
  // mudando a identidade do objeto — se ficasse nas deps do efeito, o mapa regenerava sozinho).
  const cfgRef = useRef<any>(null);
  cfgRef.current = configProp || (userData as any)?.avatarConfig || null;
  // Portas: ponte entre a UI (React) e o loop Three (declarado cedo por causa do TDZ).
  const askDoorRef = useRef<(x: number, z: number) => void>(() => {});
  const openDoorRef = useRef<(x: number, z: number) => void>(() => {});
  const spawnMonstersRef = useRef<(x: number, z: number, n: number) => void>(() => {});
  const doorWrongRef = useRef<(x: number, z: number) => void>(() => {});
  const gamePausedRef = useRef(false);
  const interactRef = useRef<() => void>(() => {});
  const pickaxeToggleRef = useRef<() => void>(() => {});

  // Callback para o POC "usar" um consumível (curar HP) — acionado pela UI.
  const useConsumableRef = useRef<(heal: number) => void>(() => {});
  const healPlayer = useCallback((amount: number) => { useConsumableRef.current(amount); }, []);

  // Usa o item de um slot (clique, toque ou tecla 1-0): cura + animação de uso.
  const consumeAtRef = useRef<(i: number) => void>(() => {});
  const consumeAt = useCallback((i: number) => {
    const c = consumables[i];
    if (!c) return;
    const heal = c.effect === 'restore_hp' ? maxHearts : (c.effect === 'heal_1_hp' ? 1 : (c.heal || 0));
    if (heal > 0 && playerHearts >= maxHearts) return;
    if (heal > 0) healPlayer(heal);
    const cfg = resolveConsumableEffect({ ...c, gameEffect: c.effect });
    animAnchorRef.current = cfg.category === 'eating' ? 'head' : 'feet';
    try { playConsumableSound(cfg.soundType, cfg.customSoundUrl); } catch { /* noop */ }
    setActiveConsumableAnim({
      id: String(Date.now()) + '_' + Math.random().toString(36).slice(2), presetId: cfg.presetId, category: cfg.category,
      primaryColor: cfg.primaryColor, secondaryColor: cfg.secondaryColor, glowColor: cfg.glowColor,
      scale: cfg.scale, itemTitle: cfg.itemTitle, itemImageUrl: cfg.itemImageUrl,
    });
    setConsumables(prev => prev.map((x, j) => j === i ? { ...x, qty: x.qty - 1 } : x).filter(x => x.qty > 0));
  }, [consumables, playerHearts, maxHearts, healPlayer]);
  consumeAtRef.current = consumeAt;

  // ---- Perguntas das PORTAS: filtradas pela SÉRIE do jogador (via turma) ----
  const gradeCacheRef = useRef<string | null>(null);
  const getStudentGrade = useCallback(async (): Promise<string> => {
    if (gradeCacheRef.current !== null) return gradeCacheRef.current;
    const cid = (userData as any)?.class_id || (userData as any)?.classId;
    if (!cid) { gradeCacheRef.current = ''; return ''; }
    try {
      const { data } = await supabase.from('classes').select('name').eq('id', cid).maybeSingle();
      const m = String((data as any)?.name || '').match(/(\d+)/);
      gradeCacheRef.current = m ? m[1] : '';
    } catch { gradeCacheRef.current = ''; }
    return gradeCacheRef.current;
  }, [userData]);

  const pickDoorQuestion = useCallback(async () => {
    const tenantId = (userData as any)?.tenantId || null;
    let query = supabase.from('question_bank').select('*');
    if (tenantId) query = query.or(`tenant_id.is.null,tenant_id.eq.${tenantId}`);
    const { data } = await query;
    const all = ((data as any[]) || []).filter((q: any) => Array.isArray(q.options) && q.options.length >= 2 && q.options.length <= 4 && Number.isInteger(q.correct_index));
    if (!all.length) return null;
    const grade = await getStudentGrade();
    let pool = all;
    if (grade) {
      const g = all.filter((q: any) => (q.tags || []).some((t: any) => String(t || '').toLowerCase().includes(grade)));
      if (g.length) pool = g;
    }
    const q = pool[Math.floor(Math.random() * pool.length)];
    const opts = (q.options as any[]).map((o, i) => ({ ...o, _i: i }));
    for (let i = opts.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [opts[i], opts[j]] = [opts[j], opts[i]]; }
    return { title: q.title, imageUrl: q.image_url, options: opts, correctIndex: opts.findIndex((o: any) => o._i === q.correct_index) };
  }, [userData, getStudentGrade]);

  askDoorRef.current = (x: number, z: number) => {
    setDoorTarget({ x, z }); setDoorBusy(true);
    pickDoorQuestion().then(q => {
      setDoorBusy(false);
      if (!q) { setMsg('Sem perguntas cadastradas para a sua série ainda.'); setDoorTarget(null); return; }
      setDoorQuestion(q);
    }).catch(() => { setDoorBusy(false); setDoorTarget(null); });
  };
  const answerDoor = (idx: number) => {
    const q = doorQuestion; const t = doorTarget;
    setDoorQuestion(null); setDoorTarget(null);
    if (!q || !t) return;
    if (idx === q.correctIndex) { setMsg('✅ Resposta correta! A porta se abriu.'); openDoorRef.current(t.x, t.z); }
    else { setMsg('❌ Resposta errada! Monstros surgiram perto da porta.'); doorWrongRef.current(t.x, t.z); }
  };
  // Pausa o cenário enquanto a pergunta da porta está aberta.
  gamePausedRef.current = !!doorQuestion || doorBusy;

  // Busca os itens equipados (para o personagem 3D), consumíveis e modelos padrão (moeda/baú).
  useEffect(() => {
    const uid = userData?.uid;
    if (itemsProp || !uid) { setItemsReady(true); return; }
    let cancelled = false;
    const tenantId = (userData as any)?.tenantId || null;

    // Molde da moeda/baú: PNG (plano) ou GLB. Guardado para clonar no mapa.
    const buildTemplate = async (model: any, kind: 'coin' | 'chest'): Promise<any> => {
      if (!model) return null;
      const url = model.url || model.open_url || '';
      if (!url) return null;
      try {
        if (isImageUrl(url)) {
          const tex = await new THREE.TextureLoader().loadAsync(url);
          (tex as any).colorSpace = (THREE as any).SRGBColorSpace;
          if (kind === 'coin') {
            // Moeda com ESPESSURA (profundidade 3D; não "some" ao girar de lado).
            const g = new THREE.Group();
            const faceMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
            const m1 = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), faceMat); m1.position.z = 0.06;
            const m2 = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), faceMat.clone()); m2.rotation.y = Math.PI; m2.position.z = -0.06;
            const edge = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.12, 24, 1, true), new THREE.MeshStandardMaterial({ color: 0xf2c14e, metalness: 0.6, roughness: 0.35, side: THREE.DoubleSide }));
            edge.rotation.x = Math.PI / 2;
            g.add(edge); g.add(m1); g.add(m2);
            return g;
          }
          return new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide }));
        }
        const g = await new GLTFLoader().loadAsync(url);
        return g.scene as any;
      } catch { return null; }
    };

    const loadItems = fetchEquippedItems(uid).then(rows => {
      const mapped = (rows || []).map((d: any) => {
        const data = d.data || {};
        return {
          docId: d.id, itemId: d.item_id || data.itemId, imageUrl: data.itemImageUrl, avatarPart: data.avatarPart,
          itemTitle: data.itemTitle, itemCategory: data.itemCategory, baseAttributeType: data.baseAttributeType,
          baseAttributeValue: data.baseAttributeValue, adds: data.adds, fixedAttributes: data.fixedAttributes,
          forgeConfig: data.forgeConfig, damageEffect: data.damageEffect,
          battleSoundUrl: data.battleSoundUrl, criticalSoundUrl: data.criticalSoundUrl, gameModelUrl: data.gameModelUrl,
          modelTextureUrl: data.modelTextureUrl, minecraftHeadValue: data.minecraftHeadValue,
          modelTransforms: data.modelTransforms, backColor: data.backColor || '', forgeLevel: data.forgeLevel || 0
        } as EquippedItem;
      });
      if (!cancelled) setPlayerItems(mapped);
    }).catch(() => {});

    // Consumíveis ÚTEIS (cura de HP / cura de efeitos), AGRUPADOS por item (pilha, como na batalha).
    const loadConsumables = supabase.from('user_items').select('*').eq('student_id', uid).then(({ data }) => {
      const groups = new Map<string, any>();
      (data || []).forEach((d: any) => {
        const da = d.data || {};
        if (da.itemType !== 'consumable' || d.equipped || !USEFUL_CONSUMABLE_EFFECTS.has(da.gameEffect)) return;
        const key = d.item_id || da.itemId || da.itemTitle || d.id;
        const heal = da.gameEffect === 'restore_hp' ? 5 : da.gameEffect === 'heal_1_hp' ? 1 : 0;
        const existing = groups.get(key);
        if (existing) existing.qty += (da.quantity || 1);
        else groups.set(key, { key, title: da.itemTitle || 'Item', imageUrl: da.itemImageUrl, heal, effect: da.gameEffect, qty: da.quantity || 1, consumableAnimPreset: da.consumableAnimPreset, consumableEffectColor: da.consumableEffectColor, useSoundUrl: da.useSoundUrl });
      });
      if (!cancelled) setConsumables([...groups.values()]);
    }).catch(() => {});

    // Moeda/baú PADRÃO ativos do tenant (arte do cenário).
    const loadModels = Promise.all([fetchActiveCoin(tenantId), fetchActiveChest(tenantId)]).then(async ([coinM, chestM]) => {
      const c = await buildTemplate(coinM, 'coin');
      const ch = await buildTemplate(chestM, 'chest');
      if (!cancelled) { coinTemplateRef.current = c; chestTemplateRef.current = ch; coinConfigRef.current = coinM; chestConfigRef.current = chestM; }
      // Pré-carrega os SONS de moeda/baú configurados na edição.
      if (coinM?.coinSoundUrl) sfx.preload(coinM.coinSoundUrl);
      if (chestM?.chestAudioUrl) sfx.preload(chestM.chestAudioUrl);
    }).catch(() => {});

    Promise.all([loadItems, loadConsumables, loadModels]).finally(() => { if (!cancelled) setItemsReady(true); });
    return () => { cancelled = true; };
  }, [userData?.uid, itemsProp]);

  // Estado mutável compartilhado com o loop Three
  const callbacks = useRef({ setMsg, setCoins, setDead, setBossTouched, setPlayerHearts, setStamina, setHint: (_t: string) => {}, addPotion: () => {}, pingSfx: () => {} });
  callbacks.current = {
    setMsg, setCoins, setDead, setBossTouched, setPlayerHearts, setStamina,
    setHint: (t: string) => setHint(prev => (prev === t ? prev : t)),
    addPotion: () => setConsumables(prev => {
      const ex = prev.find(c => c.key === 'loot_potion');
      if (ex) return prev.map(c => c.key === 'loot_potion' ? { ...c, qty: c.qty + 1 } : c);
      return [...prev, { key: 'loot_potion', title: 'Poção de Cura (drop)', imageUrl: '', heal: 1, effect: 'heal_1_hp', qty: 1 }];
    }),
    pingSfx: () => { setSfxOn(true); window.setTimeout(() => setSfxOn(false), 400); },
  };
  // Modelos 3D (moeda/baú padrão ativo) pré-carregados para clonar no mapa.
  const coinTemplateRef = useRef<any>(null);
  const chestTemplateRef = useRef<any>(null);
  const coinConfigRef = useRef<any>(null);
  const chestConfigRef = useRef<any>(null);

  // Áudio: sons de batalha (espada/soco) e de dano do personagem (por gênero).
  const battleSoundsRef = useRef<{ punch: string; fatalEvaporate: string }>({ punch: '', fatalEvaporate: '' });
  const playerDamageSoundsRef = useRef<{ male: string; female: string }>({ male: '', female: '' });
  // Sons das portas (configuráveis no admin, doc "door_sounds").
  const doorSoundsRef = useRef<{ open: string; locked: string }>({ open: '', locked: '' });
  // Falas do jogador (balões de diálogo no cenário, em 3D).
  const quotesRef = useRef<PlayerBattleQuotes | null>(null);
  useEffect(() => {
    let active = true;
    supabase.from('system_collections').select('data').eq('collection_name', 'audio').eq('doc_id', 'battle_sounds').then(({ data }) => {
      if (!active) return; let b: any = {}; (data || []).forEach((r: any) => b = { ...b, ...(r.data || {}) });
      battleSoundsRef.current = { punch: b.punch || b.punch_sound || '', fatalEvaporate: b.fatalEvaporate || b.fatal_evaporate || '' };
      if (battleSoundsRef.current.punch) sfx.preload(battleSoundsRef.current.punch);
      if (battleSoundsRef.current.fatalEvaporate) sfx.preload(battleSoundsRef.current.fatalEvaporate);
    });
    supabase.from('system_collections').select('data').eq('collection_name', 'audio').eq('doc_id', 'player_damage_sounds').then(({ data }) => {
      if (!active) return; let d: any = {}; (data || []).forEach((r: any) => d = { ...d, ...(r.data || {}) });
      playerDamageSoundsRef.current = { male: d.male || '', female: d.female || '' };
      if (playerDamageSoundsRef.current.male) sfx.preload(playerDamageSoundsRef.current.male);
      if (playerDamageSoundsRef.current.female) sfx.preload(playerDamageSoundsRef.current.female);
    });
    supabase.from('system_collections').select('data').eq('collection_name', 'audio').eq('doc_id', 'door_sounds').then(({ data }) => {
      if (!active) return; let d: any = {}; (data || []).forEach((r: any) => d = { ...d, ...(r.data || {}) });
      doorSoundsRef.current = { open: d.open || d.doorOpen || '', locked: d.locked || d.doorLocked || '' };
      if (doorSoundsRef.current.open) sfx.preload(doorSoundsRef.current.open);
      if (doorSoundsRef.current.locked) sfx.preload(doorSoundsRef.current.locked);
    });
    return () => { active = false; };
  }, []);

  // Busca as falas configuradas do jogador (balões de diálogo).
  useEffect(() => {
    let active = true;
    fetchPlayerBattleQuotes((userData as any)?.tenantId || null).then(q => { if (active && q) quotesRef.current = q; }).catch(() => {});
    return () => { active = false; };
  }, [userData?.uid]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const grid = generateGrid();
    let disposed = false;
    const cleanups: Array<() => void> = [];

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(theme.sky);
    scene.fog = new THREE.Fog(new THREE.Color(theme.fog), 14, 42);
    scene.add(new THREE.AmbientLight(0xffffff, 0.9));
    const dir = new THREE.DirectionalLight(0xffffff, 0.9);
    dir.position.set(14, 26, 10); dir.castShadow = true;
    dir.shadow.mapSize.set(1024, 1024);
    dir.shadow.camera.left = -40; dir.shadow.camera.right = 40; dir.shadow.camera.top = 40; dir.shadow.camera.bottom = -40;
    scene.add(dir);

    const camera = new THREE.PerspectiveCamera(55, mount.clientWidth / mount.clientHeight, 0.1, 400);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.shadowMap.enabled = true;
    mount.appendChild(renderer.domElement);

    // Viewmodel de 1ª pessoa (aparece ao atacar) + câmera no grafo da cena.
    const viewModel = new THREE.Group();
    {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.6, 0.04), new THREE.MeshStandardMaterial({ color: 0xcfd8e3, metalness: 0.8, roughness: 0.25 }));
      blade.position.y = 0.3; viewModel.add(blade);
      const guard = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.03, 0.04), new THREE.MeshStandardMaterial({ color: 0x8a5a2b }));
      guard.position.y = 0.02; viewModel.add(guard);
      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.05), new THREE.MeshStandardMaterial({ color: 0x5a3a1b }));
      grip.position.y = -0.07; viewModel.add(grip);
      viewModel.position.set(0.32, -0.52, -0.5);
      viewModel.rotation.set(-0.2, -0.15, 0.12);
      viewModel.visible = false;
    }
    camera.add(viewModel);
    scene.add(camera);

    const wx = (x: number) => (x - (COLS - 1) / 2);
    const wz = (z: number) => (z - (ROWS - 1) / 2);

    // ---- Texturas procedurais (grama com textura + pedra mesclada) ----
    const makeTex = (size: number, draw: (g: CanvasRenderingContext2D) => void): any => {
      const cv = document.createElement('canvas'); cv.width = cv.height = size;
      const g = cv.getContext('2d')!; draw(g);
      const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
    };
    const grassTex = makeTex(64, (g) => {
      g.fillStyle = theme.ground; g.fillRect(0, 0, 64, 64);
      for (let i = 0; i < 2600; i++) { const shade = Math.random(); g.fillStyle = shade < 0.5 ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.12)'; g.fillRect(Math.random() * 64, Math.random() * 64, 1, 1); }
      for (let i = 0; i < 60; i++) { g.fillStyle = Math.random() < 0.5 ? 'rgba(15,55,10,0.28)' : 'rgba(120,190,80,0.22)'; g.fillRect(Math.random() * 64, Math.random() * 64, 2, 2); }
    });
    grassTex.repeat.set(26, 26);
    // Textura de PEDRA com estágios de TRINCA (0=inteira ... 3=muito rachada).
    const makeStoneTex = (crackLevel: number) => {
      const t = makeTex(64, (g) => {
        g.fillStyle = theme.wall; g.fillRect(0, 0, 64, 64);
        g.strokeStyle = 'rgba(0,0,0,0.4)'; g.lineWidth = 2;
        for (let y = 0; y < 64; y += 16) for (let x = 0; x < 64; x += 16) {
          if (((x / 16 + y / 16) % 2) === 0) { g.fillStyle = 'rgba(255,255,255,0.07)'; g.fillRect(x + 1, y + 1, 14, 14); }
          g.strokeRect(x + 0.5, y + 0.5, 15, 15);
        }
        for (let i = 0; i < 900; i++) { g.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,0.14)' : 'rgba(255,255,255,0.10)'; g.fillRect(Math.random() * 64, Math.random() * 64, 1, 1); }
        const n = [0, 3, 8, 16][crackLevel] || 0;
        g.strokeStyle = 'rgba(8,4,0,0.85)'; g.lineWidth = 1.6;
        for (let i = 0; i < n; i++) { g.beginPath(); let x = Math.random() * 64, y = Math.random() * 64; g.moveTo(x, y); for (let j = 0; j < 3; j++) { x += (Math.random() - 0.5) * 22; y += (Math.random() - 0.5) * 22; g.lineTo(x, y); } g.stroke(); }
      });
      t.repeat.set(1, 2); return t;
    };
    const wallMats = [0, 1, 2, 3].map(l => new THREE.MeshStandardMaterial({ map: makeStoneTex(l) }));

    // Textura de PORTA (tábuas + painéis + maçaneta).
    const doorTex = makeTex(64, (g) => {
      g.fillStyle = '#7a4a22'; g.fillRect(0, 0, 64, 64);
      g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 2;
      for (let x = 0; x <= 64; x += 16) { g.beginPath(); g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, 64); g.stroke(); }
      g.strokeRect(6, 6, 20, 24); g.strokeRect(38, 6, 20, 24);
      g.strokeRect(6, 36, 20, 22); g.strokeRect(38, 36, 20, 22);
      g.fillStyle = 'rgba(255,255,255,0.07)'; g.fillRect(7, 7, 18, 22); g.fillRect(39, 7, 18, 22);
      g.fillStyle = '#e6c34a'; g.beginPath(); g.arc(50, 34, 3, 0, Math.PI * 2); g.fill();
      for (let i = 0; i < 500; i++) { g.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.06)'; g.fillRect(Math.random() * 64, Math.random() * 64, 1, 1); }
    });

    // ---- Chão GRANDE (com textura) + base temática abaixo (evita z-fighting) ----
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), new THREE.MeshStandardMaterial({ map: grassTex }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = 0; ground.receiveShadow = true; scene.add(ground);
    const base = new THREE.Mesh(new THREE.BoxGeometry(COLS + 6, 1.4, ROWS + 6), new THREE.MeshStandardMaterial({ color: theme.wall }));
    base.position.set(0, -0.92, 0); base.receiveShadow = true; scene.add(base);

    // ---- Paredes SÓLIDAS (altas) e QUEBRÁVEIS (HP + defesa + trincas) ----
    const wallGeo = new THREE.BoxGeometry(1, 3.4, 1);
    const wallCells = new Map<string, { mesh: THREE.Mesh; hp: number; maxHp: number; def: number }>();
    for (let z = 0; z < ROWS; z++) for (let x = 0; x < COLS; x++) {
      if (!grid.wall[z][x]) continue;
      const m = new THREE.Mesh(wallGeo, wallMats[0]);
      m.position.set(wx(x), 1.7, wz(z)); m.castShadow = true; m.receiveShadow = true; scene.add(m);
      wallCells.set(`${x},${z}`, { mesh: m, hp: WALL_HP, maxHp: WALL_HP, def: WALL_DEF });
    }

    // ---- Névoa de exploração (BLOCOS pretos altos — cobrem também as laterais) ----
    const explored = new Set<string>();
    const fogGroup = new THREE.Group();
    const fogMat = new THREE.MeshBasicMaterial({ color: 0x02040a, transparent: true, opacity: 0.98, depthWrite: false, side: THREE.DoubleSide });
    // Bloco ALTO (3,8) para não deixar ver o terreno atrás/lateralmente.
    const fogGeo = new THREE.BoxGeometry(1.04, 3.8, 1.04);
    const fogCells = new Map<string, THREE.Mesh>();
    for (let z = 0; z < ROWS; z++) for (let x = 0; x < COLS; x++) {
      const f = new THREE.Mesh(fogGeo, fogMat);
      f.position.set(wx(x), 1.9, wz(z));
      fogGroup.add(f); fogCells.set(`${x},${z}`, f);
    }
    scene.add(fogGroup);

    // ---- Estilhaços (quebra de blocos) ----
    const debrisGroup = new THREE.Group(); scene.add(debrisGroup);
    const debris: { mesh: THREE.Mesh; vx: number; vy: number; vz: number; life: number; spin: number }[] = [];
    const spawnShatter = (gx: number, gz: number, color: number, count = 14) => {
      for (let i = 0; i < count; i++) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.12), new THREE.MeshStandardMaterial({ color }));
        m.position.set(wx(gx) + (Math.random() - 0.5) * 0.6, 1.0 + Math.random() * 1.4, wz(gz) + (Math.random() - 0.5) * 0.6);
        debrisGroup.add(m);
        debris.push({ mesh: m, vx: (Math.random() - 0.5) * 3.5, vy: 2 + Math.random() * 3.5, vz: (Math.random() - 0.5) * 3.5, life: 0.9, spin: (Math.random() - 0.5) * 0.5 });
      }
      playFx(battleSoundsRef.current.punch, 0.6);
    };

    // ---- Itens aleatórios ----
    const coinsList: { x: number; z: number; mesh: THREE.Object3D; value: number }[] = [];
    type Slime = { x: number; z: number; root: THREE.Group; mesh: THREE.Mesh; tx: number; tz: number; t: number; hp: number; maxHp: number; vision: number; defense: number; evasion: number; bar: THREE.Group; fg: THREE.Mesh; attackCd: number; poison: number; bleed: number; pathT: number; pnx: number; pnz: number; lunge: number; lungeHit: boolean; kb: number; kbx: number; kbz: number };
    const slimes: Slime[] = [];
    const rocks: { x: number; z: number; mesh: THREE.Mesh; hp: number; maxHp: number; def: number }[] = [];
    const hazards: { x: number; z: number; mesh: THREE.Mesh; hp: number; maxHp: number; def: number }[] = [];
    const chests: { x: number; z: number; mesh: THREE.Object3D }[] = [];
    const doors: { x: number; z: number; mesh: THREE.Mesh; open: boolean; hp: number; maxHp: number; def: number }[] = [];
    const coinGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.08, 16);
    const coinMat = new THREE.MeshStandardMaterial({ color: 0xffd34d, emissive: 0xffaa00, emissiveIntensity: 0.6 });
    const slimeGeo = new THREE.SphereGeometry(0.4, 14, 12);
    const rockGeo = new THREE.DodecahedronGeometry(0.4, 0); const rockMat = new THREE.MeshStandardMaterial({ color: 0x9c8a7a, roughness: 0.9 });
    const hzGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.22, 12); const hzMat = new THREE.MeshStandardMaterial({ color: theme.hazardColor, emissive: theme.hazardColor, emissiveIntensity: 0.6 });
    const chestGeo = new THREE.BoxGeometry(0.5, 0.44, 0.4); const chestMat = new THREE.MeshStandardMaterial({ color: 0xb07d3a });
    const barBgGeo = new THREE.PlaneGeometry(1.0, 0.16);
    const barFgGeo = new THREE.PlaneGeometry(1.0, 0.16);
    const wallAt = (x: number, z: number) => x < 0 || x >= COLS || z < 0 || z >= ROWS || grid.wall[z][x];
    const freeNeighbors = (x: number, z: number) => { let n = 0; for (const [ddx, ddz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) if (!wallAt(x + ddx, z + ddz)) n++; return n; };

    // Visual da moeda/baú: clona o MOLDE (arte padrão ativa) ou usa o fallback geométrico.
    const fitScale = (obj: THREE.Object3D, size: number) => { const box = new THREE.Box3().setFromObject(obj); const s = Math.max(0.001, Math.max(box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z)); return size / s; };
    const makeCoinVisual = (): THREE.Object3D => {
      const g = new THREE.Group();
      if (coinTemplateRef.current) { const c = coinTemplateRef.current.clone(true); c.scale.setScalar(fitScale(c, 0.5)); g.add(c); }
      else { const m = new THREE.Mesh(coinGeo, coinMat); m.rotation.x = Math.PI / 2; g.add(m); }
      return g;
    };
    const visibleBox = (obj: THREE.Object3D) => {
      const box = new THREE.Box3(); obj.updateMatrixWorld(true);
      obj.traverse((ch: any) => { if (ch.isMesh && ch.visible) { const b = new THREE.Box3().setFromObject(ch); if (!b.isEmpty()) box.union(b); } });
      return box;
    };
    const makeFallbackChest = (): THREE.Group => {
      const g = new THREE.Group();
      const wood = new THREE.MeshStandardMaterial({ color: 0x8a5a2b, roughness: 0.85 });
      const dark = new THREE.MeshStandardMaterial({ color: 0x5a3a1b, roughness: 0.85 });
      const gold = new THREE.MeshStandardMaterial({ color: 0xd9b24a, metalness: 0.6, roughness: 0.3 });
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.4, 0.46), wood); body.position.y = 0.2; body.castShadow = true; g.add(body);
      const lid = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.16, 0.48), dark); lid.position.y = 0.48; lid.castShadow = true; g.add(lid);
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.44, 0.08), dark); band.position.y = 0.24; g.add(band);
      const latch = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.14, 0.06), gold); latch.position.set(0, 0.3, 0.25); g.add(latch);
      return g;
    };
    const USE_CHEST_GLB = false; // GLB do baú (Sketchfab, dois estados) está problemático → usar fallback
    const makeChestVisual = (): THREE.Object3D => {
      const g = new THREE.Group();
      if (!USE_CHEST_GLB || !chestTemplateRef.current) { g.add(makeFallbackChest()); return g; }
      const tmpl = chestTemplateRef.current;
      try {
        const cfg: any = chestConfigRef.current || {};
        const swap = !!cfg.chestSwapSides;
        const c = tmpl.clone(true);
        c.updateMatrixWorld(true);
        // GLB de baú (export Sketchfab) costuma ter DUAS cópias sobrepostas (fechado/aberto).
        // Mantém só a PRIMEIRA ocorrência de cada geometria (a do estado FECHADO) e esconde as duplicatas.
        const seenSig = new Set<string>();
        c.traverse((ch: any) => {
          if (!ch.isMesh) return;
          const b = new THREE.Box3().setFromObject(ch);
          const sig = [b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z].map(v => (Math.round(v * 10) / 10)).join(',');
          if (seenSig.has(sig)) ch.visible = false; else seenSig.add(sig);
        });
        c.updateMatrixWorld(true);
        const kb = visibleBox(c);
        if (!kb.isEmpty()) c.position.x -= (kb.min.x + kb.max.x) / 2;
        const holder = new THREE.Group(); holder.add(c);
        holder.rotation.y = Math.PI + (((Number(cfg.chestRotY) || 0) % 360) * Math.PI) / 180;
        holder.updateMatrixWorld(true);
        const kb2 = visibleBox(c);
        const maxDim = Math.max(0.001, Math.max(kb2.max.x - kb2.min.x, kb2.max.y - kb2.min.y, kb2.max.z - kb2.min.z));
        const zoom = Math.max(0.1, Math.min(5, Number(cfg.chestZoom) || 1));
        const scale = (0.75 / maxDim) * zoom;
        holder.scale.setScalar(scale);
        holder.position.y = -kb2.min.y * scale;
        g.add(holder);
      } catch { g.add(new THREE.Mesh(chestGeo, chestMat)); }
      return g;
    };

    // Cria um monstro numa célula (fallback até plugarmos os monstros reais).
    const addMonster = (gx: number, gz: number, visionOverride?: number) => {
      const hp = 100 + Math.floor(Math.random() * 401);
      const root = new THREE.Group(); root.position.set(wx(gx), 0, wz(gz));
      const m = new THREE.Mesh(slimeGeo, new THREE.MeshStandardMaterial({ color: 0x7ee06f }));
      m.position.set(0, 0.4, 0); m.castShadow = true; root.add(m); scene.add(root);
      const bar = new THREE.Group();
      const bg = new THREE.Mesh(barBgGeo, new THREE.MeshBasicMaterial({ color: 0x1a0505 }));
      const fg = new THREE.Mesh(barFgGeo, new THREE.MeshBasicMaterial({ color: 0x33dd55 }));
      fg.position.z = 0.01; bar.add(bg); bar.add(fg); bar.position.set(wx(gx), 1.15, wz(gz)); scene.add(bar);
      slimes.push({ x: gx, z: gz, root, mesh: m, tx: wx(gx), tz: wz(gz), t: 0, hp, maxHp: hp, vision: visionOverride ?? (5 + Math.random() * 4), defense: 5 + Math.floor(Math.random() * 16), evasion: Math.floor(Math.random() * 8), bar, fg, attackCd: 0, poison: 0, bleed: 0, pathT: 0, pnx: NaN, pnz: NaN, lunge: 0, lungeHit: false, kb: 0, kbx: 0, kbz: 0 });
    };

    for (let z = 0; z < ROWS; z++) for (let x = 0; x < COLS; x++) {
      if (grid.wall[z][x]) continue;
      if (x === grid.start.x && z === grid.start.z) continue;
      if (x === grid.end.x && z === grid.end.z) continue;
      const r = Math.random();
      if (r < 0.10) { const m = makeCoinVisual(); m.position.set(wx(x), 0.5, wz(z)); scene.add(m); coinsList.push({ x, z, mesh: m, value: 1 + Math.floor(Math.random() * 10) }); }
      else if (r < 0.14) {
        // Área inicial SEGURA: não spawna monstros perto do nascimento do jogador.
        const nstart = (x - grid.start.x) ** 2 + (z - grid.start.z) ** 2;
        if (nstart < 81) { /* pula — zona segura */ }
        else { addMonster(x, z); }
      }
      else if (r < 0.19 && theme.hazardOn) { const m = new THREE.Mesh(hzGeo, hzMat); m.position.set(wx(x), 0.2, wz(z)); scene.add(m); const hhp = 30 + Math.floor(Math.random() * 40); hazards.push({ x, z, mesh: m, hp: hhp, maxHp: hhp, def: HAZARD_DEF }); }
    }

    // ---- Rochas ESTRATÉGICAS: bloqueiam corredores estreitos → exigem a PICARETA ----
    for (let z = 0; z < ROWS; z++) for (let x = 0; x < COLS; x++) {
      if (grid.wall[z][x]) continue;
      if ((x - grid.start.x) ** 2 + (z - grid.start.z) ** 2 < 100) continue;
      if (x === grid.end.x && z === grid.end.z) continue;
      if (grid.doorCells.some(dd => dd.x === x && dd.z === z)) continue;
      const l = wallAt(x - 1, z), rr = wallAt(x + 1, z), u = wallAt(x, z - 1), d = wallAt(x, z + 1);
      const corridor = (l && rr && !u && !d) || (u && d && !l && !rr);
      if (!corridor || Math.random() > 0.55) continue;
      const hp = 40 + Math.floor(Math.random() * 60);
      const m = new THREE.Mesh(rockGeo, rockMat); m.position.set(wx(x), 0.42, wz(z)); m.castShadow = true; scene.add(m);
      rocks.push({ x, z, mesh: m, hp, maxHp: hp, def: ROCK_DEF });
    }

    // ---- Baús RAROS e ESTRATÉGICOS (em becos TRANCADOS por uma rocha na entrada) ----
    const chestCandidates: { x: number; z: number; entrance: { x: number; z: number } }[] = [];
    for (let z = 0; z < ROWS; z++) for (let x = 0; x < COLS; x++) {
      if (wallAt(x, z)) continue;
      if (x === grid.start.x && z === grid.start.z) continue;
      if (x === grid.end.x && z === grid.end.z) continue;
      if (rocks.some(rk => rk.x === x && rk.z === z)) continue;
      if (grid.doorCells.some(dd => dd.x === x && dd.z === z)) continue;
      if (freeNeighbors(x, z) !== 1) continue; // só BECOS (pouco acesso)
      const nb = ([[1, 0], [-1, 0], [0, 1], [0, -1]] as const).find(([dx, dz]) => !wallAt(x + dx, z + dz));
      if (!nb) continue;
      const ex = x + nb[0], ez = z + nb[1];
      if (grid.doorCells.some(dd => dd.x === ex && dd.z === ez)) continue;
      if (x === grid.start.x || x === grid.end.x) continue;
      chestCandidates.push({ x, z, entrance: { x: ex, z: ez } });
    }
    chestCandidates.sort(() => Math.random() - 0.5);
    for (const cc of chestCandidates.slice(0, 3)) {
      if (!rocks.some(rk => rk.x === cc.entrance.x && rk.z === cc.entrance.z)) {
        const hp = 50 + Math.floor(Math.random() * 70);
        const rm = new THREE.Mesh(rockGeo, rockMat); rm.position.set(wx(cc.entrance.x), 0.42, wz(cc.entrance.z)); rm.castShadow = true; scene.add(rm);
        rocks.push({ x: cc.entrance.x, z: cc.entrance.z, mesh: rm, hp, maxHp: hp, def: ROCK_DEF });
      }
      const m = makeChestVisual(); m.position.set(wx(cc.x), 0.38, wz(cc.z)); m.castShadow = true; scene.add(m);
      chests.push({ x: cc.x, z: cc.z, mesh: m });
    }

    // ---- PORTAS (divisórias): é preciso responder uma PERGUNTA para abrir ----
    const doorMat = new THREE.MeshStandardMaterial({ map: doorTex, roughness: 0.85 });
    for (const dc of grid.doorCells) {
      // A divisória é a coluna x=xd (plano ao longo de Z) → a porta é fina em X e larga em Z.
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.8, 0.94), doorMat);
      m.position.set(wx(dc.x), 0.9, wz(dc.z)); m.castShadow = true; scene.add(m);
      doors.push({ x: dc.x, z: dc.z, mesh: m, open: false, hp: DOOR_HP, maxHp: DOOR_HP, def: DOOR_DEF });
    }
    // Abre (some) uma porta respondida corretamente.
    openDoorRef.current = (gx: number, gz: number) => {
      const d = doors.find(dd => dd.x === gx && dd.z === gz);
      if (d) { d.open = true; d.mesh.visible = false; scene.remove(d.mesh); playFx(doorSoundsRef.current.open || battleSoundsRef.current.punch, 0.85); }
    };
    // Spawna monstros ao redor de uma célula (resposta errada na porta).
    spawnMonstersRef.current = (gx: number, gz: number, n: number) => {
      let placed = 0;
      for (let rad = 1; rad <= 4 && placed < n; rad++) {
        for (let dz = -rad; dz <= rad && placed < n; dz++) for (let dx = -rad; dx <= rad && placed < n; dx++) {
          if (Math.abs(dx) !== rad && Math.abs(dz) !== rad) continue;
          const cx = gx + dx, cz = gz + dz;
          if (wallAt(cx, cz)) continue;
          if (rocks.some(r => r.x === cx && r.z === cz)) continue;
          if (doors.some(d => d.x === cx && d.z === cz && d.mesh.visible)) continue;
          addMonster(cx, cz, 9); placed++;
        }
      }
    };
    // "PUFF" na porta (animação já existente) e SÓ ENTÃO spawna os monstros.
    doorWrongRef.current = (gx: number, gz: number) => {
      const v = new THREE.Vector3(wx(gx), 1.0, wz(gz)).project(camera);
      const id = Math.random().toString(36).slice(2);
      setPuffs(prev => [...prev, { id, left: (v.x * 0.5 + 0.5) * 100, top: (-v.y * 0.5 + 0.5) * 100 }]);
      playFx(battleSoundsRef.current.fatalEvaporate || battleSoundsRef.current.punch, 0.85);
      window.setTimeout(() => {
        spawnMonstersRef.current(gx, gz, 3);
        setPuffs(prev => prev.filter(p => p.id !== id));
      }, 900);
    };
    // ---- BOSS (extremo oposto) ----
    const bossMesh = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.9, 6), new THREE.MeshStandardMaterial({ color: 0xf87171, emissive: 0xef4444, emissiveIntensity: 0.7 }));
    bossMesh.position.set(wx(grid.end.x), 1.1, wz(grid.end.z)); bossMesh.castShadow = true; scene.add(bossMesh);

    // ---- MURALHA ao redor do labirinto (não deixa ver o céu do jogo nas laterais) ----
    const ringH = 3.0;
    const ringMat = new THREE.MeshStandardMaterial({ color: theme.wall });
    const addRing = (px: number, pz: number) => { const m = new THREE.Mesh(wallGeo, ringMat); m.position.set(px, ringH / 2, pz); m.scale.y = ringH / 3.4; scene.add(m); };
    for (let x = -COLS / 2 - 2; x <= COLS / 2 + 2; x++) { addRing(x, -ROWS / 2 - 2); addRing(x, ROWS / 2 + 2); }
    for (let z = -ROWS / 2 - 1; z <= ROWS / 2 + 1; z++) { addRing(-COLS / 2 - 2, z); addRing(COLS / 2 + 2, z); }

    // ---- CENÁRIO TEMÁTICO ao redor (fora do labirinto): planaltos, pirâmides, vulcões, etc. ----
    const rnd = (a: number, b: number) => a + Math.random() * (b - a);
    const mkScenery = (x: number, z: number) => {
      if (themeKey === 'desert') {
        const h = rnd(2, 6), r = rnd(1.6, 3.2);
        const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 4), new THREE.MeshStandardMaterial({ color: 0xd9b26a, flatShading: true }));
        m.position.set(x, h / 2, z); m.rotation.y = Math.random() * Math.PI; scene.add(m);
      } else if (themeKey === 'nether') {
        const h = rnd(4, 9), r = rnd(1.4, 3);
        const v = new THREE.Mesh(new THREE.ConeGeometry(r, h, 8), new THREE.MeshStandardMaterial({ color: 0x3b2323, flatShading: true }));
        v.position.set(x, h / 2, z); scene.add(v);
        const lava = new THREE.Mesh(new THREE.ConeGeometry(r * 0.4, h * 0.22, 8), new THREE.MeshStandardMaterial({ color: 0xff6a00, emissive: 0xff3b00, emissiveIntensity: 1.2 }));
        lava.position.set(x, h - h * 0.08, z); scene.add(lava);
      } else if (themeKey === 'tundra') {
        const h = rnd(3, 8), r = rnd(1.3, 3);
        const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 5), new THREE.MeshStandardMaterial({ color: 0xeaf4ff, flatShading: true }));
        m.position.set(x, h / 2, z); scene.add(m);
      } else if (themeKey === 'end') {
        const h = rnd(5, 12), w = rnd(0.8, 1.8);
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), new THREE.MeshStandardMaterial({ color: 0x2a2530 }));
        m.position.set(x, h / 2, z); scene.add(m);
      } else {
        const h = rnd(0.8, 3.4), w = rnd(2, 6);
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), new THREE.MeshStandardMaterial({ color: 0x4f9c3a }));
        m.position.set(x, h / 2, z); scene.add(m);
      }
    };
    for (let i = 0; i < 90; i++) {
      const x = rnd(-64, 64), z = rnd(-64, 64);
      if (Math.abs(x) < COLS / 2 + 3 && Math.abs(z) < ROWS / 2 + 3) continue; // dentro do labirinto
      mkScenery(x, z);
    }

    // ---- Personagem 3D REAL (skinview3d) ----
    const playerRoot = new THREE.Group();
    const playerPos = { x: grid.start.x, z: grid.start.z };
    playerRoot.position.set(wx(playerPos.x), 0, wz(playerPos.z));
    scene.add(playerRoot);

    // ---- BALÃO DE DIÁLOGO 3D (sprite com texto das falas configuradas) ----
    const makeBubbleTexture = (text: string) => {
      const cv = document.createElement('canvas'); const g = cv.getContext('2d')!;
      const fs = 22; g.font = `bold ${fs}px sans-serif`;
      const tw = Math.ceil(g.measureText(text).width);
      cv.width = Math.min(300, Math.max(110, tw + 26)); cv.height = 64;
      const c = cv.getContext('2d')!;
      const rr = (x: number, y: number, w: number, h: number, r: number) => { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); };
      c.fillStyle = 'rgba(255,255,255,0.97)'; rr(3, 3, cv.width - 6, 40, 10); c.fill();
      c.beginPath(); c.moveTo(cv.width / 2 - 8, 42); c.lineTo(cv.width / 2 + 8, 42); c.lineTo(cv.width / 2, 56); c.closePath(); c.fill();
      c.fillStyle = '#0b1220'; c.font = `bold ${fs}px sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(text, cv.width / 2, 23, cv.width - 18);
      const tex = new THREE.CanvasTexture(cv); (tex as any).colorSpace = (THREE as any).SRGBColorSpace; return { tex, w: cv.width, h: cv.height };
    };
    const bubble = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false }));
    bubble.position.set(0, 3.2, 0); bubble.visible = false; bubble.renderOrder = 999; playerRoot.add(bubble);
    let bubbleUntil = 0;
    const speakBubble = (text: string) => {
      try {
        const { tex, w, h } = makeBubbleTexture(text);
        (bubble.material as any).map = tex; (bubble.material as any).needsUpdate = true;
        bubble.scale.set(w / 150, h / 150, 1);
        bubble.visible = true; bubbleUntil = performance.now() + 2800;
      } catch { /* noop */ }
    };
    const viewer = new SkinViewer({ width: 200, height: 320, renderPaused: true });
    viewer.loadSkin('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=').catch(() => {});
    const loader = new GLTFLoader();
    const playerAnim = { current: new IdleAnimation() as any, name: 'idle' };
    // PICARETA DE DEBUG (tecla P): alterna espada/escudo ↔ picareta (25 de dano).
    let debugPickaxe = false;
    let debugPickaxeObj: any = null;
    const handModels: { model: any; part: string }[] = [];
    let attackUntil = 0;
    const setPlayerAnim = (name: 'idle' | 'walk' | 'attack' | 'hurt') => {
      if (playerAnim.name === name) return;
      playerAnim.name = name;
      if (name === 'walk') { const a = new WalkingAnimation(); a.speed = 1.8; playerAnim.current = a; }
      else if (name === 'attack') { const a = makeAttack(); a.speed = 2.6; playerAnim.current = a; }
      else if (name === 'hurt') { const a = new HitAnimation(); a.speed = 1.4; playerAnim.current = a; }
      else { const a = new IdleAnimation(); a.speed = 1; playerAnim.current = a; }
    };
    (async () => {
      try {
        const cfg = (cfgRef.current || {}) as AvatarConfig;
        const items = playerItems;
        const skinUrl = (cfg as any).customSkinUrl || await generateMinecraftSkinUrl(cfg as any);
        await viewer.loadSkin(skinUrl, { model: (cfg as any).gender === 'female' ? 'slim' : 'default' });
        if (disposed) return;
        const player = viewer.playerObject as any;
        // escala/altura do boneco e ancoragem no chão
        player.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(player);
        const h = Math.max(0.001, box.max.y - box.min.y);
        player.scale.setScalar(1.9 / h);
        player.position.y -= box.min.y * (1.9 / h);
        player.rotation.y = 0;
        playerRoot.add(player);
        // anexa itens equipados (mesma lógica do AvatarCharacter)
        const isLeftHanded = (cfg as any).handedness === 'left'; const inv = isLeftHanded ? -1 : 1;
        const IMG_EXT_RE = /\.(png|gif|jpe?g|webp|avif)$/i;
        // Normaliza o caminho: itens cadastrados só com o nome do arquivo
        // (ex.: "gold_elmo.glb") passam a apontar para /models/<arquivo>.
        const resolveItemUrl = (u: string) => {
          const s = (u || '').replace(/\\/g, '/').trim();
          if (!s) return s;
          if (/^(https?:|data:|\/)/i.test(s)) return s;
          return `${import.meta.env.BASE_URL}models/${s.replace(/^\.?\//, '')}`;
        };
        const attach = (model: any, item: EquippedItem) => {
          model.traverse((c: any) => { if (c.isMesh) c.frustumCulled = false; });
          try { applyForgeGlowToModel(model, (item as any).forgeLevel || 0); } catch { /* noop */ }
          try {
            const tier = ((item as any).forgeLevel || 0) >= 9 ? 3 : ((item as any).forgeLevel || 0) >= 8 ? 2 : ((item as any).forgeLevel || 0) >= 7 ? 1 : 0;
            if (tier > 0) model.traverse((c: any) => { if (c.isMesh) (Array.isArray(c.material) ? c.material : [c.material]).forEach((mm: any) => applyForgeGlint(mm, tier, 'reflect' as any)); });
          } catch { /* noop */ }
          const transform = resolveModelTransform(item, (cfg as any).gender, (cfg as any).handedness, false) || (item as any).modelTransforms?.common;
          const p = String(item.avatarPart);
          const addTo = (parent: any, defPos: [number, number, number], defRot: [number, number, number], defScale: number) => {
            const s = transform?.scale ?? defScale;
            model.scale.set(s, s, s * (transform?.thickness ?? 1));
            if (transform) { model.position.set(transform.posX, transform.posY, transform.posZ); model.rotation.set(transform.rotX, transform.rotY, transform.rotZ); model.translateY(transform.slide || 0); }
            else { model.position.set(...defPos); model.rotation.set(...defRot); }
            parent.add(model);
          };
          if (['rightHand', 'leftHand', 'hand', 'two_handed'].includes(String(item.avatarPart))) handModels.push({ model, part: String(item.avatarPart) });
          if (['rightHand', 'leftHand', 'hand', 'two_handed'].includes(p)) {
            const arm = item.itemCategory === 'defense' ? (isLeftHanded ? player.skin.rightArm : player.skin.leftArm) : (isLeftHanded ? player.skin.leftArm : player.skin.rightArm);
            addTo(arm, [0, -12, 0], [Math.PI / 2, 0, 0], 10);
          } else if (p === 'head' || p === 'face') addTo(player.skin.head, [0, 0, 0], [0, Math.PI, 0], item.minecraftHeadValue ? 9.2 : 16);
          else if (p === 'legs' || p === 'feet') addTo(player.skin.body, [0, -15, 0], [0, 0, 0], 16);
          else addTo(player.skin.body, [0, -6, 0], [0, 0, 0], 16);
        };
        for (const item of items) {
          if (!item.gameModelUrl) continue;
          const raw = resolveItemUrl(item.gameModelUrl);
          try {
            if (IMG_EXT_RE.test(raw.split('?')[0])) { const t = resolveModelTransform(item, (cfg as any).gender, (cfg as any).handedness, false); const m = await generateVoxelItemFromImage(raw, item.backColor, t?.curveX || 0, t?.curveY || 0, undefined, 0.12 * (t?.thickness ?? 1)); attach(m, item); }
            else await new Promise<void>(res => loader.load(raw, (g: any) => { attach(g.scene, item); res(); }, undefined, () => res()));
          } catch { /* noop */ }
        }
        callbacks.current.setMsg('✅ Personagem 3D carregado! Explore o mapa até o BOSS.');
      } catch (e) { console.warn('[MapPoC] player:', e); }
    })();

    // ---- Teclado ----
    const keys = new Set<string>();
    // Arma principal equipada → efeito especial (ex.: veneno/sangramento) e dano.
    const weapon: any = playerItems.find(i => ['rightHand', 'leftHand', 'hand', 'two_handed'].includes(String(i.avatarPart)) && i.itemCategory !== 'defense');
    // Efeito especial da ARMA equipada (via ADD de efeito, como na batalha — não o campo legado).
    const weaponEffectInfo = getEquippedDamageEffectInfo(playerItems as any[]);
    const weaponEffect: string | null = weaponEffectInfo.effect && weaponEffectInfo.effect !== 'none' ? weaponEffectInfo.effect : null;
    const weaponEffectChance = (weaponEffectInfo.chance || 0) / 100;
    // PICARETA equipada (quebra rochas). Força = atributo base dela (ou o ataque do jogador).
    const pickaxe: any = playerItems.find(i => /picareta|pickaxe/i.test(String(i.itemTitle || '')) || ['tool', 'pickaxe'].includes(String(i.itemCategory)));
    const pickaxePower = pickaxe ? Math.max(1, Number(pickaxe.baseAttributeValue) || statsRef.current.attack) : 0;
    // Pré-decodifica os sons da arma (ataque e crítico).
    if (weapon?.battleSoundUrl) sfx.preload(weapon.battleSoundUrl);
    if (weapon?.criticalSoundUrl) sfx.preload(weapon.criticalSoundUrl);

    // ---- PICARETA DE DEBUG (tecla P): modelo procedural (unidades do skin), 25 de dano ----
    const makeDebugPickaxe = () => {
      const g = new THREE.Group();
      // Autorado ao longo de +Y (como as armas .glb): após rotX=PI/2 aponta para FRENTE.
      const handle = new THREE.Mesh(new THREE.BoxGeometry(1.6, 14, 1.6), new THREE.MeshStandardMaterial({ color: 0x8a5a2b }));
      handle.position.y = 6; g.add(handle);
      const head = new THREE.Mesh(new THREE.BoxGeometry(12, 2.4, 2.4), new THREE.MeshStandardMaterial({ color: 0xcfd8e3, metalness: 0.7, roughness: 0.3 }));
      head.position.y = 13.2; g.add(head);
      return g;
    };
    const setDebugPickaxe = (on: boolean) => {
      debugPickaxe = on;
      for (const h of handModels) h.model.visible = !on;
      const playerObj = viewer.playerObject as any;
      if (on) {
        if (!debugPickaxeObj) debugPickaxeObj = makeDebugPickaxe();
        const arm = playerObj?.skin?.rightArm; if (!arm) return;
        // Na MÃO (fim do braço) e apontando para frente, como a arma equipada.
        debugPickaxeObj.position.set(0, -12, 0); debugPickaxeObj.rotation.set(Math.PI / 2, 0, 0); debugPickaxeObj.scale.setScalar(1);
        arm.add(debugPickaxeObj);
        callbacks.current.setMsg('⛏️ Picareta de DEBUG equipada (25 de dano). Pressione P para voltar.');
      } else {
        if (debugPickaxeObj && debugPickaxeObj.parent) debugPickaxeObj.parent.remove(debugPickaxeObj);
        callbacks.current.setMsg('⚔️ Voltou para a espada e o escudo.');
      }
      // Reconstroi o item da 1ª pessoa (espada ↔ picareta).
      if (firstPerson) buildFpWeapon(true);
    };
    // Força efetiva da picareta (debug = 300, sempre ≥ ataque).
    const pickaxeActivePower = () => (debugPickaxe ? DEBUG_PICKAXE_DMG : pickaxePower);
    // Dano da picareta equipada (0 = sem picareta).
    const pickDamage = () => (debugPickaxe ? DEBUG_PICKAXE_DMG : pickaxePower);
    // Dano a um QUEBRÁVEL: precisa vencer a defesa; o excedente + poder de ataque vira dano.
    const breakDamage = (def: number): number => {
      const pd = pickDamage();
      if (pd <= def) return 0;
      return (pd - def) + statsRef.current.attack;
    };
    // LOOT ao quebrar (provisório; depois configurável por missão/cenário).
    const dropLoot = (gx: number, gz: number) => {
      const r = Math.random();
      const world = new THREE.Vector3(wx(gx), 1.2, wz(gz));
      if (r < 0.45) { const v = 1 + Math.floor(Math.random() * 10); callbacks.current.setCoins(n => n + v); spawnPop(world, `+${v} 🪙`, false, 'coin'); }
      else if (r < 0.62) { useConsumableRef.current(1); callbacks.current.setMsg('❤️ O bloco guardava um coração!'); }
      else if (r < 0.74) { callbacks.current.addPotion(); callbacks.current.setMsg('🧪 O bloco guardava uma poção de cura!'); }
      else { callbacks.current.setMsg('… o bloco não guardava nada.'); }
    };
    let playerBleedUntil = 0; let playerBleedTick = 0;
    let playerHurtUntil = 0;
    let playerHeartsRun = statsRef.current.startHearts;
    // Balões de diálogo: fala conforme HP/eventos, usando os textos configurados.
    const maybeSpeak = (event?: 'critical' | 'hurt' | 'victory') => {
      const q = quotesRef.current; if (!q) return;
      const hpPct = statsRef.current.maxHearts ? (playerHeartsRun / statsRef.current.maxHearts) * 100 : 100;
      const text = pickPlayerBattleQuote(q, hpPct, 0.35, event || null);
      if (text) speakBubble(text);
    };
    let nextIdleTalk = performance.now() + 11000;
    const ATTACK_COST = 20;
    const ATTACK_MS = 320;
    let staminaRun = 100;
    let nextAttackAt = 0;
    let camYaw = 0; // rotação HORIZONTAL da câmera (não permite giro vertical/livre)
    let firstPerson = false; // visão em 1ª pessoa (tecla V)
    let camPitch = 0; // inclinação da câmera (SOMENTE na 1ª pessoa, para teste)
    callbacks.current.setStamina(staminaRun);

    // Números de dano/moeda flutuantes (DOM) projetando a posição 3D na tela.
    const spawnPop = (world: THREE.Vector3, text: string, crit: boolean, kind: 'dmg' | 'miss' | 'coin' = 'dmg') => {
      const v = world.clone().project(camera);
      const left = (v.x * 0.5 + 0.5) * 100, top = (-v.y * 0.5 + 0.5) * 100;
      const id = Math.random().toString(36).slice(2);
      setDamagePops(prev => [...prev, { id, text, crit, kind, left, top }]);
      setTimeout(() => setDamagePops(prev => prev.filter(p => p.id !== id)), 1100);
    };
    // Reinicia o corte a CADA aperto do Espaço (senão o early-return não repetia o movimento).
    const restartAttack = () => { playerAnim.name = 'attack'; const a = makeAttack(); a.speed = 3.2; playerAnim.current = a; attackUntil = performance.now() + ATTACK_MS; };

    // --- Sons e TINT vermelho de dano (jogador e monstros) ---
    // Fallback sintetizado (WebAudio) garantindo o "assobio" do corte mesmo sem URL configurada.
    let swingCtx: AudioContext | null = null;
    const swingFallback = () => {
      try {
        swingCtx = swingCtx || new ((window as any).AudioContext || (window as any).webkitAudioContext)();
        const ctx = swingCtx; const dur = 0.16;
        const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) { const t = i / d.length; d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 2.5); }
        const src = ctx.createBufferSource(); src.buffer = buf;
        const flt = ctx.createBiquadFilter(); flt.type = 'bandpass'; flt.frequency.value = 1500; flt.Q.value = 0.9;
        const g = ctx.createGain(); g.gain.value = 0.28;
        src.connect(flt); flt.connect(g); g.connect(ctx.destination); src.start();
      } catch { /* noop */ }
    };
    const playFx = (url: string, vol = 0.8) => { sfx.play(url, vol); callbacks.current.pingSfx(); };
    const playSword = (isCrit: boolean) => {
      const url = isCrit && weapon?.criticalSoundUrl ? weapon.criticalSoundUrl : (weapon?.battleSoundUrl || battleSoundsRef.current.punch);
      if (url) playFx(url, 0.8); else { swingFallback(); callbacks.current.pingSfx(); }
    };
    const playMonsterHurtSound = () => playFx(battleSoundsRef.current.punch, 0.8);
    const playerGender = (cfgRef.current as any)?.gender;
    const playPlayerHurtSound = () => playFx(playerGender === 'female' ? playerDamageSoundsRef.current.female : playerDamageSoundsRef.current.male, 0.8);
    const RED = new THREE.Color('#ff2b2b');
    const flashMonster = (s: any) => {
      const mat: any = s.mesh.material; if (!mat || !mat.color) return;
      if (!mat.userData._orig) mat.userData._orig = mat.color.clone();
      mat.color.copy(mat.userData._orig).lerp(RED, 0.85);
      setTimeout(() => { try { mat.color.copy(mat.userData._orig); } catch { /* noop */ } }, 220);
    };
    const flashPlayer = () => {
      try {
        (viewer.playerObject as any).traverse((c: any) => {
          if (!c.isMesh) return;
          (Array.isArray(c.material) ? c.material : [c.material]).forEach((mm: any) => {
            if (mm && mm.color) {
              if (!mm.userData._orig) mm.userData._orig = mm.color.clone();
              mm.color.copy(mm.userData._orig).lerp(RED, 0.6);
              setTimeout(() => { try { mm.color.copy(mm.userData._orig); } catch { /* noop */ } }, 260);
            }
          });
        });
      } catch { /* noop */ }
    };
    // Dano recebido pelo JOGADOR → hurt + som + tint vermelho.
    const hurtPlayer = (hearts: number, message: string) => {
      playerHeartsRun = Math.max(0, playerHeartsRun - hearts);
      callbacks.current.setPlayerHearts(playerHeartsRun);
      playerHurtUntil = performance.now() + 650;
      flashPlayer(); playPlayerHurtSound();
      maybeSpeak('hurt');
      callbacks.current.setMsg(message);
      if (playerHeartsRun <= 0) { callbacks.current.setDead(true); disposed = true; }
    };

    // Item da 1ª pessoa: usa a MESMA arte (.glb/.png) da arma equipada (ou a picareta de debug).
    let fpBuilt = false;
    const addFpModel = (src: any) => {
      const c = src.clone(true);
      c.position.set(0, 0, 0); c.rotation.set(0, 0, 0); c.scale.setScalar(1);
      c.traverse((ch: any) => { ch.visible = true; });
      c.updateMatrixWorld(true);
      let b = new THREE.Box3().setFromObject(c);
      const dx = b.max.x - b.min.x, dy = b.max.y - b.min.y, dz = b.max.z - b.min.z;
      // Alinha o EIXO MAIS LONGO da arma com +Y (lâmina/picareta "para cima"), como na mão.
      if (dx >= dy && dx >= dz) c.rotation.z = Math.PI / 2;
      else if (dz >= dy && dz >= dx) c.rotation.x = -Math.PI / 2;
      c.updateMatrixWorld(true);
      b = new THREE.Box3().setFromObject(c);
      const maxDim = Math.max(0.001, Math.max(b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z));
      c.scale.multiplyScalar(0.75 / maxDim);
      c.updateMatrixWorld(true);
      b = new THREE.Box3().setFromObject(c);
      // Pivô na EMPUNHADURA (base): o giro do golpe acontece a partir da mão, não do centro.
      c.position.sub(new THREE.Vector3((b.min.x + b.max.x) / 2, b.min.y, (b.min.z + b.max.z) / 2));
      viewModel.add(c);
    };
    const buildFpWeapon = (force = false) => {
      if (fpBuilt && !force) return; fpBuilt = true;
      while (viewModel.children.length) viewModel.remove(viewModel.children[0]);
      if (debugPickaxe && debugPickaxeObj) { addFpModel(debugPickaxeObj); return; }
      const wm = handModels.find(h => ['rightHand', 'hand', 'two_handed'].includes(h.part)) || handModels[0];
      if (wm?.model) { try { addFpModel(wm.model); return; } catch { /* noop */ } }
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.7, 0.05), new THREE.MeshStandardMaterial({ color: 0xcfd8e3, metalness: 0.8, roughness: 0.25 }));
      blade.position.y = 0.35; viewModel.add(blade);
    };

    // Botão/slot de picareta (desktop e mobile) alterna arma ↔ picareta.
    pickaxeToggleRef.current = () => setDebugPickaxe(!debugPickaxe);

    // Interação por TOQUE/CLIQUE (mobile): porta/baú ou alterna a picareta.
    interactRef.current = () => {
      const gx = Math.round(playerPos.x), gz = Math.round(playerPos.z);
      const door = doors.find(d => d.mesh.visible && Math.abs(d.x - gx) + Math.abs(d.z - gz) <= 1);
      if (door) { playFx(doorSoundsRef.current.locked || battleSoundsRef.current.punch, 0.8); askDoorRef.current(door.x, door.z); return; }
      const chest = chests.find(c => c.mesh.visible && Math.abs(c.x - gx) + Math.abs(c.z - gz) <= 1);
      if (chest) {
        const value = 1 + Math.floor(Math.random() * 10);
        chest.mesh.visible = false; scene.remove(chest.mesh);
        playFx(chestConfigRef.current?.chestAudioUrl || battleSoundsRef.current.punch, 0.85);
        callbacks.current.setCoins(n => n + value);
        spawnPop(new THREE.Vector3(wx(chest.x), 1.0, wz(chest.z)), `+${value} 🪙`, false, 'coin');
        callbacks.current.setMsg(`🎁 Baú aberto! +${value} 🪙`);
        return;
      }
      const breakNear = rocks.some(r => r.hp > 0 && r.mesh.visible && Math.hypot(wx(r.x) - wx(gx), wz(r.z) - wz(gz)) <= 1.4)
        || hazards.some(h => h.hp > 0 && h.mesh.visible && Math.hypot(wx(h.x) - wx(gx), wz(h.z) - wz(gz)) <= 1.4)
        || doors.some(d => d.hp > 0 && d.mesh.visible && Math.hypot(wx(d.x) - wx(gx), wz(d.z) - wz(gz)) <= 1.4);
      if (breakNear || IS_TOUCH) setDebugPickaxe(!debugPickaxe);
    };

    const onDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase(); keys.add(k);
      sfx.unlock(); // 1º gesto (tecla) destrava o áudio
      // Teclas 1-0 → usam o item do slot correspondente do inventário.
      if (k.length === 1) { const slot = '1234567890'.indexOf(k); if (slot >= 0) { consumeAtRef.current(slot); return; } }
      // Rotação horizontal da câmera (`,` e `.`).
      if (k === ',') { camYaw += 0.22; return; }
      if (k === '.') { camYaw -= 0.22; return; }
      // P: alterna espada/escudo ↔ picareta de debug.
      if (k === 'p') { setDebugPickaxe(!debugPickaxe); return; }
      // V: alterna 3ª ↔ 1ª pessoa.
      if (k === 'v') { firstPerson = !firstPerson; if (firstPerson) buildFpWeapon(); callbacks.current.setMsg(firstPerson ? '👁️ Visão em 1ª pessoa (V para voltar).' : '🎥 Visão em 3ª pessoa.'); return; }
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
      if (k === ' ') {
        const now = performance.now();
        // Um ataque por ciclo. Segurar o Espaço dispara auto-repeat: sem este gate a
        // animação reiniciava a cada ~30ms (parecia travada) e só drenava o vigor.
        if (now < nextAttackAt) return;
        if (staminaRun < ATTACK_COST) { callbacks.current.setMsg('😮‍💨 Exausto! Pare um instante para recuperar o vigor.'); return; }
        nextAttackAt = now + ATTACK_MS;
        staminaRun = Math.max(0, staminaRun - ATTACK_COST);
        callbacks.current.setStamina(staminaRun);
        restartAttack();
        playSword(false); // som da espada em TODO ataque (mesmo errando)
        const pwx = wx(playerPos.x), pwz = wz(playerPos.z);
        // 1) Monstro mais próximo no alcance, COM LINHA DE VISÃO (não acerta através de paredes).
        const pgx = Math.round(playerPos.x), pgz = Math.round(playerPos.z);
        let target: any = null; let best = 1.9;
        for (const s of slimes) {
          if (s.hp <= 0) continue;
          const dd = Math.hypot(s.root.position.x - pwx, s.root.position.z - pwz);
          if (dd >= best) continue;
          const sgx = Math.round(s.root.position.x + (COLS - 1) / 2), sgz = Math.round(s.root.position.z + (ROWS - 1) / 2);
          if (!losClear(pgx, pgz, sgx, sgz)) continue;
          best = dd; target = s;
        }
        if (target) {
          const isCrit = Math.random() * 100 < statsRef.current.critChance;
          if (isCrit) playSword(true);
          const roll = calculatePlayerHitDamage(statsRef.current.attack, target.defense, target.evasion, isCrit);
          if (roll.isEvasion) { spawnPop(new THREE.Vector3(target.root.position.x, target.root.position.y + 1.5, target.root.position.z), 'Esquiva!', false, 'miss'); callbacks.current.setMsg('💨 O monstro esquivou do seu golpe!'); return; }
          target.hp -= roll.damage;
          flashMonster(target); playMonsterHurtSound();
          // RECUO do monstro (animação de hurt indo para trás, afastando do jogador).
          { const kdx = target.root.position.x - pwx, kdz = target.root.position.z - pwz; const kd = Math.hypot(kdx, kdz) || 1; target.kb = 0.2; target.kbx = kdx / kd; target.kbz = kdz / kd; }
          if (weaponEffect && !debugPickaxe && Math.random() < weaponEffectChance) { if (weaponEffect === 'poison') target.poison = 3; else if (weaponEffect === 'bleed') target.bleed = 3; }
          spawnPop(new THREE.Vector3(target.root.position.x, target.root.position.y + 1.5, target.root.position.z), `-${roll.damage}`, roll.isCritical);
          maybeSpeak(roll.isCritical ? 'critical' : undefined);
          callbacks.current.setMsg(`${roll.isCritical ? '💥 CRÍTICO! ' : '⚔️ '}Acertou o monstro! -${roll.damage} HP${weaponEffect ? ` (${weaponEffect})` : ''}`);
          if (target.hp <= 0) { callbacks.current.setMsg('💥 Monstro derrotado!'); callbacks.current.setCoins(n => n + 5); target.root.visible = false; }
          return;
        }
        // 2) Quebráveis (rocha / cacto / parede / porta) mais próximo COM VISÃO.
        const pgx2 = Math.round(playerPos.x), pgz2 = Math.round(playerPos.z);
        type Cand = { obj: any; kind: 'rock' | 'hazard' | 'wall' | 'door'; gx: number; gz: number; dist: number; color: number; key?: string };
        const cands: Cand[] = [];
        for (const rk of rocks) { if (rk.hp <= 0 || !rk.mesh.visible) continue; const dd = Math.hypot(wx(rk.x) - pwx, wz(rk.z) - pwz); if (dd < 1.95 && losClear(pgx2, pgz2, rk.x, rk.z)) cands.push({ obj: rk, kind: 'rock', gx: rk.x, gz: rk.z, dist: dd, color: 0x9c8a7a }); }
        for (const hz of hazards) { if (hz.hp <= 0 || !hz.mesh.visible) continue; const dd = Math.hypot(wx(hz.x) - pwx, wz(hz.z) - pwz); if (dd < 1.95 && losClear(pgx2, pgz2, hz.x, hz.z)) cands.push({ obj: hz, kind: 'hazard', gx: hz.x, gz: hz.z, dist: dd, color: 0x2f9e44 }); }
        for (const d of doors) { if (d.hp <= 0 || !d.mesh.visible) continue; const dd = Math.hypot(wx(d.x) - pwx, wz(d.z) - pwz); if (dd < 1.95 && losClear(pgx2, pgz2, d.x, d.z)) cands.push({ obj: d, kind: 'door', gx: d.x, gz: d.z, dist: dd, color: 0x8b5a2b }); }
        for (const [wk, wc] of wallCells) { if (wc.hp <= 0) continue; const [wxg, wzg] = wk.split(',').map(Number); const dd = Math.hypot(wx(wxg) - pwx, wz(wzg) - pwz); if (dd < 1.95 && losClear(pgx2, pgz2, wxg, wzg)) cands.push({ obj: wc, kind: 'wall', gx: wxg, gz: wzg, dist: dd, color: parseInt(theme.wall.replace('#', ''), 16), key: wk }); }
        cands.sort((a, b) => a.dist - b.dist);
        const tgt = cands[0];
        if (tgt) {
          if (!pickaxeActivePower()) { callbacks.current.setMsg('⛏️ Você precisa equipar uma PICARETA para quebrar isso (tecla P).'); return; }
          const dmg = breakDamage(tgt.obj.def);
          if (dmg <= 0) { callbacks.current.setMsg(`⛏️ Sua picareta é fraca demais (precisa vencer ${tgt.obj.def} de defesa).`); return; }
          tgt.obj.hp = Math.max(0, tgt.obj.hp - dmg);
          playFx(battleSoundsRef.current.punch, 0.7);
          spawnPop(new THREE.Vector3(wx(tgt.gx), 1.2, wz(tgt.gz)), `-${dmg}`, false);
          if (tgt.obj.hp <= 0) {
            if (tgt.kind === 'wall') { grid.wall[tgt.gz][tgt.gx] = false; wallCells.delete(tgt.key!); scene.remove(tgt.obj.mesh); }
            else if (tgt.kind === 'door') { tgt.obj.mesh.visible = false; scene.remove(tgt.obj.mesh); }
            else if (tgt.kind === 'hazard' || tgt.kind === 'rock') { tgt.obj.mesh.visible = false; }
            spawnShatter(tgt.gx, tgt.gz, tgt.color);
            dropLoot(tgt.gx, tgt.gz);
            callbacks.current.setMsg('💥 Bloco quebrado!');
          } else {
            if (tgt.kind === 'wall') { const ratio = tgt.obj.hp / tgt.obj.maxHp; tgt.obj.mesh.material = wallMats[ratio < 0.4 ? 3 : ratio < 0.7 ? 2 : 1]; }
            callbacks.current.setMsg(`⛏️ Rachou! -${dmg} (resta ${Math.round(tgt.obj.hp)}/${Math.round(tgt.obj.maxHp)})`);
          }
          return;
        }
        return;
      }
      // Tecla E: abre uma PORTA (pergunta) ou um baú próximos.
      if (k === 'e') {
        const gx = Math.round(playerPos.x), gz = Math.round(playerPos.z);
        const door = doors.find(d => d.mesh.visible && Math.abs(d.x - gx) + Math.abs(d.z - gz) <= 1);
        if (door) { playFx(doorSoundsRef.current.locked || battleSoundsRef.current.punch, 0.8); askDoorRef.current(door.x, door.z); return; }
        const chest = chests.find(c => c.mesh.visible && Math.abs(c.x - gx) + Math.abs(c.z - gz) <= 1);
        if (chest) {
          const value = 1 + Math.floor(Math.random() * 10);
          chest.mesh.visible = false; scene.remove(chest.mesh);
          playFx(chestConfigRef.current?.chestAudioUrl || battleSoundsRef.current.punch, 0.85);
          callbacks.current.setCoins(n => n + value);
          spawnPop(new THREE.Vector3(wx(chest.x), 1.0, wz(chest.z)), `+${value} 🪙`, false, 'coin');
          callbacks.current.setMsg(`🎁 Baú aberto! +${value} 🪙`);
        }
        else callbacks.current.setMsg('Nenhum baú por perto. Chegue mais perto e pressione E.');
      }
    };
    const onUp = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());
    window.addEventListener('keydown', onDown); window.addEventListener('keyup', onUp);
    cleanups.push(() => { window.removeEventListener('keydown', onDown); window.removeEventListener('keyup', onUp); });

    // Girar a câmera HORIZONTALMENTE arrastando o mouse (sem giro vertical/livre).
    let dragging = false; let lastPX = 0; let lastPY = 0; let downX = 0; let downY = 0; let moved = false;
    const onPD = (ev: PointerEvent) => { dragging = true; lastPX = ev.clientX; lastPY = ev.clientY; downX = ev.clientX; downY = ev.clientY; moved = false; };
    const onPM = (ev: PointerEvent) => {
      if (!dragging) return;
      if (Math.abs(ev.clientX - downX) + Math.abs(ev.clientY - downY) > 8) moved = true;
      camYaw -= (ev.clientX - lastPX) * 0.006; lastPX = ev.clientX;
      if (firstPerson) camPitch = Math.max(-1.35, Math.min(1.35, camPitch - (ev.clientY - lastPY) * 0.006));
      lastPY = ev.clientY;
    };
    const onPU = () => { if (dragging && !moved) interactRef.current(); dragging = false; };
    renderer.domElement.addEventListener('pointerdown', onPD);
    window.addEventListener('pointermove', onPM);
    window.addEventListener('pointerup', onPU);
    cleanups.push(() => { renderer.domElement.removeEventListener('pointerdown', onPD); window.removeEventListener('pointermove', onPM); window.removeEventListener('pointerup', onPU); });

    const isWall = (x: number, z: number) => x < 0 || x >= COLS || z < 0 || z >= ROWS || grid.wall[z][x];
    // Os monstros andam em coordenadas de MUNDO; convertemos para GRADE (0..COLS/ROWS).
    const toGridX = (w: number) => Math.round(w + (COLS - 1) / 2);
    const toGridZ = (w: number) => Math.round(w + (ROWS - 1) / 2);
    // Colisão dos MONSTROS: não passam por paredes/pedras/baús, nem por outros monstros,
    // e não entram na célula do jogador (ficam só AO REDOR atacando).
    const mBlocked = (self: any, x: number, z: number) => {
      const cx = toGridX(x), cz = toGridZ(z);
      if (isWall(cx, cz)) return true;
      if (rocks.some(r => r.x === cx && r.z === cz && r.mesh.visible)) return true;
      if (chests.some(c => c.x === cx && c.z === cz && c.mesh.visible)) return true;
      if (doors.some(d => d.mesh.visible && d.x === cx && d.z === cz)) return true; // porta fechada bloqueia
      if (slimes.some(o => o !== self && o.hp > 0 && o.root.visible && Math.round(o.root.position.x) === cx && Math.round(o.root.position.z) === cz)) return true;
      if (cx === Math.round(playerPos.x) && cz === Math.round(playerPos.z)) return true;
      return false;
    };
    const DIRS: ReadonlyArray<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    // BFS (grade) até a célula do jogador, contornando paredes/pedras/baús. Retorna o PRÓXIMO passo.
    const bfsStep = (sx: number, sz: number, tx: number, tz: number): { x: number; z: number } | null => {
      if (sx === tx && sz === tz) return null;
      const prev = new Map<string, string>();
      const seen = new Set<string>([`${sx},${sz}`]);
      const q: Array<[number, number]> = [[sx, sz]];
      let found = false;
      while (q.length) {
        const [cx, cz] = q.shift()!;
        if (cx === tx && cz === tz) { found = true; break; }
        for (const [ddx, ddz] of DIRS) {
          const nx = cx + ddx, nz = cz + ddz; const kk = `${nx},${nz}`;
          if (seen.has(kk) || isWall(nx, nz)) continue;
          if (rocks.some(r => r.x === nx && r.z === nz && r.mesh.visible)) continue;
          if (chests.some(c => c.x === nx && c.z === nz && c.mesh.visible)) continue;
          seen.add(kk); prev.set(kk, `${cx},${cz}`); q.push([nx, nz]);
        }
      }
      if (!found) return null;
      let cur = `${tx},${tz}`;
      while (prev.get(cur) !== `${sx},${sz}`) { const p = prev.get(cur); if (!p) return null; cur = p; }
      const [cx, cz] = cur.split(',').map(Number);
      return { x: cx, z: cz };
    };
    // Linha de VISÃO na grade (Bresenham): `false` se parede/rocha/porta bloqueia a reta.
    // Trata também a "quina": em passo DIAGONAL, as duas células ortogonais precisam estar livres.
    const blockedSight = (x: number, z: number) => {
      if (isWall(x, z)) return true;
      if (rocks.some(r => r.x === x && r.z === z && r.mesh.visible)) return true;
      if (doors.some(d => d.mesh.visible && d.x === x && d.z === z)) return true;
      return false;
    };
    const losClear = (x0: number, z0: number, x1: number, z1: number): boolean => {
      let cx = x0, cz = z0;
      const dx = Math.abs(x1 - x0), dz = Math.abs(z1 - z0);
      const sx = x0 < x1 ? 1 : -1, sz = z0 < z1 ? 1 : -1;
      let err = dx - dz; let guard = 0;
      while (guard++ < 200) {
        if (cx === x1 && cz === z1) return true;
        const e2 = 2 * err;
        const nx = cx + (e2 > -dz ? sx : 0);
        const nz = cz + (e2 < dx ? sz : 0);
        if (e2 > -dz) err -= dz;
        if (e2 < dx) err += dx;
        if (nx !== cx && nz !== cz) { // passo diagonal → não deixa "atirar pela quina"
          if (blockedSight(cx + sx, cz)) return false;
          if (blockedSight(cx, cz + sz)) return false;
        }
        cx = nx; cz = nz;
        if (cx === x1 && cz === z1) return true;
        if (blockedSight(cx, cz)) return false;
      }
      return true;
    };
    const revealedKeys = new Set<string>();

    const clock = new THREE.Clock();
    // Começa com o MESMO HP do perfil (corações). O que sobrar entra na batalha do chefe.
    callbacks.current.setPlayerHearts(playerHeartsRun);
    // "Usar consumível" → cura CORAÇÕES (atualiza o HP do loop + HUD).
    useConsumableRef.current = (heal: number) => {
      playerHeartsRun = Math.min(statsRef.current.maxHearts, playerHeartsRun + heal);
      callbacks.current.setPlayerHearts(playerHeartsRun);
      callbacks.current.setMsg(`🧪 Você usou o item e recuperou +${heal} ❤️!`);
    };
    let raf = 0;
    const loop = () => {
      if (disposed) return;
      const dt = Math.min(0.05, clock.getDelta());
      // Enquanto a pergunta da porta está aberta, o cenário fica PAUSADO.
      if (gamePausedRef.current) { renderer.render(scene, camera); raf = requestAnimationFrame(loop); return; }
      // movimento (suave) com colisão
      // Movimento RELATIVO à CÂMERA: W anda para onde a câmera olha (girar não inverte o WASD).
      const fw = (keys.has('w') || keys.has('arrowup') ? 1 : 0) - (keys.has('s') || keys.has('arrowdown') ? 1 : 0);
      const st = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
      const moving = fw !== 0 || st !== 0;
      let dx = 0, dz = 0;
      if (moving) {
        const fX = -Math.sin(camYaw), fZ = -Math.cos(camYaw); // frente da câmera (no chão)
        const rX = Math.cos(camYaw), rZ = -Math.sin(camYaw);  // direita da câmera
        dx = fw * fX + st * rX; dz = fw * fZ + st * rZ;
        const len = Math.hypot(dx, dz) || 1; dx /= len; dz /= len;
        const speed = 4.2;
        const nx = playerPos.x + dx * speed * dt;
        const nz = playerPos.z + dz * speed * dt;
        // colisão por célula (paredes + OBJETOS: baús e monstros), com "deslize" por eixo
        // Colisão do JOGADOR: apenas paredes e objetos fixos. Monstros NÃO bloqueiam
        // (evitava "obstáculos invisíveis" quando um monstro ocupava a célula).
        const cellBlocked = (x: number, z: number) => {
          if (isWall(x, z)) return true;
          if (chests.some(c => c.x === x && c.z === z && c.mesh.visible)) return true;
          if (rocks.some(r => r.x === x && r.z === z && r.mesh.visible)) return true;
          if (doors.some(d => d.x === x && d.z === z && d.mesh.visible)) return true;
          return false;
        };
        if (!cellBlocked(Math.round(nx), Math.round(playerPos.z))) playerPos.x = nx;
        if (!cellBlocked(Math.round(playerPos.x), Math.round(nz))) playerPos.z = nz;
        // gira o CORPO para o sentido do movimento
        playerRoot.rotation.y = Math.atan2(dx, dz);
        // coleta / eventos de célula
        const gx = Math.round(playerPos.x), gz = Math.round(playerPos.z);
        const ck = `${gx},${gz}`;
        const coin = coinsList.find(c => c.x === gx && c.z === gz && c.mesh.visible);
        if (coin) {
          coin.mesh.visible = false;
          callbacks.current.setCoins(n => n + coin.value);
          playFx(coinConfigRef.current?.coinSoundUrl || battleSoundsRef.current.punch, 0.7);
          spawnPop(new THREE.Vector3(wx(gx), 1.3, wz(gz)), `+${coin.value} 🪙`, false, 'coin');
          callbacks.current.setMsg(`🪙 +${coin.value} moeda(s)!`);
        }
        // (Baús NÃO abrem mais ao passar por cima — abrem com a tecla E.)
        const hz = hazards.find(h => h.x === gx && h.z === gz);
        if (hz && explored.has(ck)) { callbacks.current.setMsg(`💥 Perigo: ${theme.hazardLabel}!`); if (theme.fatal) { callbacks.current.setDead(true); disposed = true; } }
        if (gx === grid.end.x && gz === grid.end.z) { callbacks.current.setBossTouched(true); disposed = true; }
      }
      // Animação: ataque (espaço) > hurt > andar > parado
      if (performance.now() < attackUntil) setPlayerAnim('attack');
      else if (performance.now() < playerHurtUntil) setPlayerAnim('hurt');
      else if (moving) setPlayerAnim('walk');
      else setPlayerAnim('idle');
      playerRoot.position.set(wx(playerPos.x), 0, wz(playerPos.z));
      // Balão de diálogo: esconde ao expirar e fala ociosa de tempos em tempos.
      if (bubble.visible && performance.now() > bubbleUntil) bubble.visible = false;
      if (performance.now() > nextIdleTalk) { nextIdleTalk = performance.now() + 11000 + Math.random() * 9000; if (!moving) maybeSpeak(); }
      // VIGOR (barra de exaustão): regenera quando parado/não atacando (enche aos poucos).
      if (performance.now() >= attackUntil && staminaRun < 100) {
        staminaRun = Math.min(100, staminaRun + dt * 22);
        callbacks.current.setStamina(staminaRun);
      }
      // As moedas giram (mostrando a arte da moeda padrão ativa).
      for (const c of coinsList) if (c.mesh.visible) c.mesh.rotation.y += dt * 2.4;
      // Monstros: IA (visão → persegue por CAMINHO → bote) + barras de HP
      for (const s of slimes) {
        if (s.hp <= 0) { s.root.visible = false; s.bar.visible = false; continue; }
        const dxp = wx(playerPos.x) - s.root.position.x;
        const dzp = wz(playerPos.z) - s.root.position.z;
        const dist = Math.hypot(dxp, dzp);
        // O monstro só AGGRO o jogador com LINHA DE VISÃO (nada de ver através de portas/muros).
        const sg0x = Math.round(s.root.position.x + (COLS - 1) / 2), sg0z = Math.round(s.root.position.z + (ROWS - 1) / 2);
        const canSee = dist < s.vision && losClear(sg0x, sg0z, Math.round(playerPos.x), Math.round(playerPos.z));
        if (canSee) {
          // Guarda uma DISTÂNCIA (~1,9) para dar o bote — não cola no jogador.
          if (dist > 1.9) {
            s.pathT -= dt;
            if (s.pathT <= 0) {
              s.pathT = 0.35;
              const step = bfsStep(
                Math.round(s.root.position.x + (COLS - 1) / 2), Math.round(s.root.position.z + (ROWS - 1) / 2),
                Math.round(playerPos.x), Math.round(playerPos.z)
              );
              s.pnx = step ? wx(step.x) : wx(playerPos.x);
              s.pnz = step ? wz(step.z) : wz(playerPos.z);
            }
            const tgtX = isNaN(s.pnx) ? wx(playerPos.x) : s.pnx;
            const tgtZ = isNaN(s.pnz) ? wz(playerPos.z) : s.pnz;
            const ddx = tgtX - s.root.position.x, ddz = tgtZ - s.root.position.z;
            const dd = Math.hypot(ddx, ddz) || 1;
            const sp = 3.0;
            const mx = s.root.position.x + (ddx / dd) * sp * dt;
            if (!mBlocked(s, mx, s.root.position.z)) s.root.position.x = mx;
            const mz = s.root.position.z + (ddz / dd) * sp * dt;
            if (!mBlocked(s, s.root.position.x, mz)) s.root.position.z = mz;
          }
          // BOTE (pulo): ataca SALtando em direção ao jogador (não por contato).
          s.attackCd -= dt;
          if (dist >= 0.6 && dist <= 2.6 && s.attackCd <= 0 && s.lunge <= 0) {
            const sgx = Math.round(s.root.position.x + (COLS - 1) / 2), sgz = Math.round(s.root.position.z + (ROWS - 1) / 2);
            if (losClear(sgx, sgz, Math.round(playerPos.x), Math.round(playerPos.z))) { s.lunge = 0.42; s.lungeHit = false; }
          }
        } else {
          s.t -= dt;
          if (s.t <= 0) { s.t = 1.5 + Math.random() * 2.5; s.tx = wx(s.x) + (Math.random() - 0.5) * 4; s.tz = wz(s.z) + (Math.random() - 0.5) * 4; }
          const mx = s.root.position.x + (s.tx - s.root.position.x) * Math.min(1, dt * 1.6);
          if (!mBlocked(s, mx, s.root.position.z)) s.root.position.x = mx; else s.t = 0;
          const mz = s.root.position.z + (s.tz - s.root.position.z) * Math.min(1, dt * 1.6);
          if (!mBlocked(s, s.root.position.x, mz)) s.root.position.z = mz; else s.t = 0;
        }
        // BOTE (pulo) + RECUO de hurt: offset visual do corpo.
        let oX = 0, oY = 0.4, oZ = 0;
        if (s.lunge > 0) {
          s.lunge = Math.max(0, s.lunge - dt);
          const pr = 1 - s.lunge / 0.42;
          const hop = Math.sin(Math.min(1, pr) * Math.PI);
          const dirX = dxp / (dist || 1), dirZ = dzp / (dist || 1);
          oX += dirX * hop * 1.0; oY += hop * 0.7; oZ += dirZ * hop * 1.0;
          if (!s.lungeHit && pr >= 0.5) {
            s.lungeHit = true;
            s.attackCd = 1.8;
            playFx(battleSoundsRef.current.punch, 0.8);
            if (Math.random() < 0.3) { playerBleedUntil = performance.now() + 4000; hurtPlayer(1, '🩸 O monstro te feriu! -1 ❤️ e você está SANGRANDO!'); }
            else hurtPlayer(1, '👾 O monstro te atacou! -1 ❤️');
          }
        }
        if (s.kb > 0) { s.kb = Math.max(0, s.kb - dt); const kk = s.kb / 0.2; oX += s.kbx * kk * 0.55; oZ += s.kbz * kk * 0.55; }
        s.mesh.position.set(oX, oY, oZ);
        // barra de HP (billboard, encolhe à esquerda) + efeito (poison/bleed) DoT
        s.bar.position.set(s.root.position.x, 1.15, s.root.position.z);
        s.bar.lookAt(camera.position);
        const frac = Math.max(0, s.hp / s.maxHp);
        s.fg.scale.x = frac; s.fg.position.x = -(1 - frac) * 0.5;
        if (s.poison > 0 || s.bleed > 0) {
          const tick = (s.poison + s.bleed) * dt * 6;
          s.hp = Math.max(0, s.hp - tick);
          if (s.hp <= 0) callbacks.current.setMsg('💥 O monstro sucumbiu ao efeito!');
        }
      }
      // Sangramento no JOGADOR (DoT) causado pelos monstros
      if (performance.now() < playerBleedUntil) {
        playerBleedTick -= dt;
        if (playerBleedTick <= 0) {
          playerBleedTick = 1;
          playerHeartsRun = Math.max(0, playerHeartsRun - 0.5);
          callbacks.current.setPlayerHearts(playerHeartsRun);
          flashPlayer();
          if (playerHeartsRun <= 0) { callbacks.current.setDead(true); disposed = true; }
        }
      }
      // Estilhaços (quebra de blocos): física simples.
      for (let i = debris.length - 1; i >= 0; i--) {
        const d = debris[i]; d.vy -= 9 * dt;
        d.mesh.position.x += d.vx * dt; d.mesh.position.y += d.vy * dt; d.mesh.position.z += d.vz * dt;
        d.mesh.rotation.x += d.spin; d.mesh.rotation.y += d.spin;
        d.life -= dt;
        if (d.life <= 0) { debrisGroup.remove(d.mesh); d.mesh.geometry.dispose(); (d.mesh.material as any).dispose(); debris.splice(i, 1); }
      }
      // DICA contextual de interação (porta/baú → E; quebrável → P/slot).
      {
        const ago = 1.4;
        const nearby = (lx: number, lz: number) => Math.hypot(lx - playerPos.x, lz - playerPos.z) <= ago;
        const doorNear = doors.some(d => d.mesh.visible && nearby(d.x, d.z));
        const chestNear = chests.some(c => c.mesh.visible && nearby(c.x, c.z));
        const breakNear = rocks.some(r => r.hp > 0 && r.mesh.visible && nearby(r.x, r.z))
          || hazards.some(h => h.hp > 0 && h.mesh.visible && nearby(h.x, h.z))
          || doors.some(d => d.hp > 0 && d.mesh.visible && nearby(d.x, d.z));
        let h = '';
        if (doorNear) h = IS_TOUCH ? '🚪 Toque para interagir.' : '🚪 Pressione E para interagir.';
        else if (chestNear) h = IS_TOUCH ? '🎁 Toque no baú para abrir.' : '🎁 Pressione E para abrir o baú.';
        else if (breakNear) h = IS_TOUCH ? '⛏️ Toque no slot para equipar a picareta.' : '⛏️ Pressione P para equipar a picareta.';
        callbacks.current.setHint(h);
      }
      // névoa: revela ao redor do jogador
      const pgx = Math.round(playerPos.x), pgz = Math.round(playerPos.z);
      for (let z = pgz - REVEAL_RADIUS; z <= pgz + REVEAL_RADIUS; z++) for (let x = pgx - REVEAL_RADIUS; x <= pgx + REVEAL_RADIUS; x++) {
        if (x < 0 || x >= COLS || z < 0 || z >= ROWS) continue;
        if ((x - pgx) ** 2 + (z - pgz) ** 2 > REVEAL_RADIUS * REVEAL_RADIUS) continue;
        const k = `${x},${z}`;
        if (revealedKeys.has(k)) continue;
        revealedKeys.add(k); explored.add(k);
        const f = fogCells.get(k); if (f) f.visible = false;
      }
      // animação do boneco
      const player = (viewer.playerObject as any);
      if (player) { try { playerAnim.current.update(player, dt); } catch { /* noop */ } }
      // Câmera: 3ª pessoa (padrão) ou 1ª pessoa (V), com rotação HORIZONTAL (yaw).
      if (firstPerson) {
        if (player) player.visible = false;
        const hx = wx(playerPos.x), hz = wz(playerPos.z);
        camera.position.set(hx, 1.55, hz);
        const cp = Math.cos(camPitch), sp = Math.sin(camPitch);
        camera.lookAt(hx - Math.sin(camYaw) * cp, 1.55 + sp, hz - Math.cos(camYaw) * cp);
        // Item na mão: só aparece ao ATACAR (golpe de CIMA para BAIXO).
        const attacking = performance.now() < attackUntil;
        viewModel.visible = attacking;
        if (attacking) {
          const p = 1 - Math.max(0, (attackUntil - performance.now()) / ATTACK_MS);
          const chop = p < 0.35 ? -1.1 + (p / 0.35) * 0.4 : -0.7 + ((p - 0.35) / 0.65) * 1.95;
          viewModel.rotation.set(chop, -0.15, 0.12);
          viewModel.position.set(0.32, -0.52, -0.5);
        }
      } else {
        if (player) player.visible = true;
        viewModel.visible = false;
        const camOff = new THREE.Vector3(0, 7.2, 8.5).applyAxisAngle(new THREE.Vector3(0, 1, 0), camYaw);
        camera.position.set(wx(playerPos.x) + camOff.x, camOff.y, wz(playerPos.z) + camOff.z);
        camera.lookAt(wx(playerPos.x), 1.2, wz(playerPos.z));
      }
      camera.updateMatrixWorld();
      // Ancora a animação de uso: nos PÉS (aura) ou na BOCA (comida); na 1ª pessoa, na tela.
      let fx: number, fy: number;
      if (firstPerson) { fx = mount.clientWidth / 2; fy = mount.clientHeight * 0.82; }
      else {
        const anchorY = animAnchorRef.current === 'head' ? 1.5 : 0.0;
        const pr = new THREE.Vector3(wx(playerPos.x), anchorY, wz(playerPos.z)).project(camera);
        fx = (pr.x * 0.5 + 0.5) * mount.clientWidth; fy = (-pr.y * 0.5 + 0.5) * mount.clientHeight;
      }
      playerScreenRef.current = { x: fx, y: fy };
      if (animWrapRef.current) animWrapRef.current.style.transform = `translate(${fx}px, ${fy}px)`;
      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    const onResize = () => { if (!mount) return; camera.aspect = mount.clientWidth / mount.clientHeight; camera.updateProjectionMatrix(); renderer.setSize(mount.clientWidth, mount.clientHeight); };
    window.addEventListener('resize', onResize);
    cleanups.push(() => window.removeEventListener('resize', onResize));

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      cleanups.forEach(c => c());
      try { renderer.dispose(); } catch { /* noop */ }
      try { viewer.dispose(); } catch { /* noop */ }
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [themeKey, seed, itemsReady]);

  const regenerate = useCallback(() => { setSeed(s => s + 1); setDead(false); setBossTouched(false); setCoins(0); setMsg('Mapa regenerado! Explore novamente.'); }, []);

  return (
    <div style={{ position: 'relative', flex: 1, minHeight: 0, width: '100%', background: theme.sky, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: 8, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', background: 'rgba(0,0,0,0.4)', zIndex: 5 }}>
        <strong style={{ color: '#fff', textShadow: '0 1px 2px #000' }}>🗺️ Mapa Explorável (POC)</strong>
        {(Object.keys(THEMES) as ThemeKey[]).map((tk) => (
          <button key={tk} onClick={() => { setThemeKey(tk); regenerate(); }}
            style={{ padding: '4px 10px', borderRadius: 6, border: tk === themeKey ? '2px solid #fbbf24' : '1px solid rgba(255,255,255,0.4)', background: tk === themeKey ? 'rgba(251,191,36,0.3)' : 'rgba(0,0,0,0.45)', color: '#fff', cursor: 'pointer', fontSize: '0.75rem' }}>
            {THEMES[tk].label}
          </button>
        ))}
        <button onClick={regenerate} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #4ade80', background: 'rgba(74,222,128,0.25)', color: '#fff', cursor: 'pointer', fontSize: '0.75rem' }}>🎲 Regenerar</button>
        {onExit && <button onClick={onExit} style={{ marginLeft: 'auto', padding: '4px 10px', borderRadius: 6, border: '1px solid #f87171', background: 'rgba(248,113,113,0.25)', color: '#fff', cursor: 'pointer', fontSize: '0.75rem' }}>✖ Sair</button>}
      </div>
      <div style={{ padding: '6px 10px', color: '#fff', background: 'rgba(0,0,0,0.5)', fontSize: '0.78rem', zIndex: 5, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {Array.from({ length: maxHearts }).map((_, i) => {
            const full = playerHearts >= i + 1;
            const half = !full && playerHearts >= i + 0.5;
            return <span key={i} style={{ fontSize: '1.15rem', lineHeight: 1, filter: (full || half) ? 'none' : 'grayscale(1) brightness(0.45)', opacity: (full || half) ? 1 : 0.6 }}>{half ? '💔' : '❤️'}</span>;
          })}
          <b style={{ marginLeft: 4 }}>{Math.round(playerHearts * 10) / 10}/{maxHearts} ❤️</b>
        </span>
        {/* Barra de EXAUSTÃO/VIGOR: drena ao atacar, enche parado. */}
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }} title="Vigor: drena a cada ataque e regenera parado">
          <span style={{ width: 130, height: 12, background: '#1e293b', borderRadius: 7, overflow: 'hidden', display: 'inline-block', border: '1px solid rgba(255,255,255,0.2)' }}>
            <span style={{ display: 'block', width: `${Math.max(0, stamina)}%`, height: '100%', background: stamina > 40 ? '#38bdf8' : stamina > 15 ? '#fbbf24' : '#ef4444', transition: 'width 0.1s' }} />
          </span>
          <b style={{ color: stamina < 20 ? '#f87171' : '#e2e8f0' }}>⚡ {Math.round(stamina)}%</b>
        </span>
        <span>· 🪙 {coins} · Perigo: {theme.hazardLabel}</span>
        <button onClick={() => { sfx.unlock(); sfx.beep(); sfx.play(battleSoundsRef.current.punch, 0.8); setSfxOn(true); window.setTimeout(() => setSfxOn(false), 400); const st = sfx.status(); setSfxDiag(`audio:${st.state}/buf${st.buffers}${st.error ? '/' + st.error : ''}`); }}
          title="Testa o áudio do navegador (se não tocar nem aqui, o som está bloqueado no dispositivo)"
          style={{ padding: '2px 8px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.3)', background: sfxOn ? 'rgba(74,222,128,0.45)' : 'rgba(0,0,0,0.35)', color: '#fff', cursor: 'pointer', fontSize: '0.72rem' }}>
          🔊 Testar som
        </button>
        {sfxDiag && <span style={{ fontSize: '0.68rem', color: '#fbbf24' }}>{sfxDiag}</span>}
        <button onClick={() => pickaxeToggleRef.current()}
          title="Equipar/guardar a picareta (tecla P) — quebra rochas, cactos, paredes e portas"
          style={{ padding: '2px 10px', borderRadius: 6, border: '1px solid #fbbf24', background: 'rgba(251,191,36,0.25)', color: '#fff', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 700 }}>
          ⛏️ Picareta (P)
        </button>
      </div>
      <div style={{ padding: '6px 10px', color: '#fff', background: 'rgba(0,0,0,0.5)', fontSize: '0.78rem', zIndex: 5 }}>
        {msg}
      </div>
      {hint && (
        <div style={{ padding: '6px 10px', color: '#fde047', background: 'rgba(0,0,0,0.62)', fontSize: '0.82rem', fontWeight: 700, zIndex: 5 }}>
          {hint}
        </div>
      )}
      <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
        <div ref={mountRef} style={{ position: 'absolute', inset: 0 }} />
        {/* Números de dano flutuantes (como na batalha) */}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 12 }}>
          {damagePops.map(p => (
            <span key={p.id} style={{
              position: 'absolute', left: `${p.left}%`, top: `${p.top}%`, transform: 'translate(-50%, -50%)',
              fontWeight: 800, fontSize: p.crit ? '2.1rem' : '1.5rem',
              color: p.kind === 'coin' ? '#fde047' : p.kind === 'miss' ? '#cbd5e1' : p.crit ? '#f59e0b' : '#fca5a5',
              textShadow: p.crit ? '0 0 12px rgba(245,158,11,0.95), 0 2px 2px #000' : '0 2px 3px #000',
              animation: 'dmgFloat 1.05s ease-out forwards', whiteSpace: 'nowrap'
            }}>
              {p.crit ? `💥 CRÍTICO ${p.text}` : p.text}
            </span>
          ))}
        </div>
        {/* Inventário de consumíveis ÚTEIS (cura HP / cura de efeitos) */}
        {consumables.length > 0 && (
          <div style={{ position: 'absolute', left: '50%', bottom: 10, transform: 'translateX(-50%)', zIndex: 10, display: 'flex', gap: 8, background: 'rgba(0,0,0,0.55)', padding: 8, borderRadius: 10, border: '1px solid rgba(255,255,255,0.15)' }}>
            <span style={{ color: '#fff', fontSize: '0.7rem', alignSelf: 'center', marginRight: 4 }}>Mochila:</span>
            {consumables.map((c, i) => (
              <button key={c.key} draggable
                onDragStart={() => { dragIdxRef.current = i; }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  const from = dragIdxRef.current;
                  if (from == null || from === i) return;
                  setConsumables(prev => { const arr = [...prev]; const [m] = arr.splice(from, 1); arr.splice(i, 0, m); return arr; });
                  dragIdxRef.current = null;
                }}
                onClick={() => consumeAt(i)}
                title={`${c.title}${c.heal ? ` (+${c.heal} ❤️)` : ''} — x${c.qty} · tecla ${(i + 1) % 10}`}
                style={{ position: 'relative', width: 50, height: 50, borderRadius: 8, border: '1px solid rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.08)', cursor: (c.heal || 0) > 0 ? 'pointer' : 'default', padding: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: (c.heal || 0) > 0 ? 1 : 0.55 }}>
                {c.imageUrl ? <img src={c.imageUrl} alt="" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : '🧪'}
                <span style={{ position: 'absolute', left: 2, top: 0, fontSize: '0.58rem', color: '#fde047', fontWeight: 800, textShadow: '0 1px 2px #000' }}>{(i + 1) % 10}</span>
                {c.qty > 1 && <span style={{ position: 'absolute', right: 1, bottom: 0, background: 'rgba(0,0,0,0.8)', color: '#fff', fontSize: '0.62rem', fontWeight: 700, padding: '0 4px', borderRadius: 6, lineHeight: '1.25' }}>{c.qty}</span>}
              </button>
            ))}
          </div>
        )}
        {/* "Puff" de fumaça na porta (resposta errada). */}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 13 }}>
          {puffs.map(p => (
            <span key={p.id} style={{
              position: 'absolute', left: `${p.left}%`, top: `${p.top}%`, width: 90, height: 90, marginLeft: -45, marginTop: -45,
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(230,230,240,0.95) 0%, rgba(170,170,185,0.65) 40%, rgba(200,200,215,0) 72%)',
              animation: 'puffPop 0.9s ease-out forwards',
            }} />
          ))}
        </div>
        {(dead || bossTouched) && (
          <div style={{ position: 'absolute', inset: 0, zIndex: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.65)', color: '#fff', fontSize: '1.2rem', fontWeight: 'bold', textAlign: 'center', flexDirection: 'column', gap: 12 }}>
            {bossTouched ? (<>⚔️ BOSS ENCONTRADO!<br /><span style={{ fontSize: '0.85rem', fontWeight: 'normal', color: '#fbbf24' }}>(aqui entraria a batalha da missão)</span></>) : (<>💀 Derrotado pelos perigos do mapa!</>)}
            <button onClick={regenerate} style={{ padding: '8px 16px', borderRadius: 8, background: '#fbbf24', color: '#000', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>Jogar de novo</button>
          </div>
        )}
        {/* Pergunta da PORTA (mesmo critério da batalha). */}
        {(doorQuestion || doorBusy) && (
          <div style={{ position: 'absolute', inset: 0, zIndex: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.72)', padding: 16 }}>
            <div style={{ maxWidth: 560, width: '100%', background: '#0f172a', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 12, padding: 18, color: '#fff' }}>
              {doorBusy ? (
                <div style={{ textAlign: 'center', padding: 20 }}>⏳ Preparando a pergunta da porta…</div>
              ) : (
                <>
                  <div style={{ fontSize: '0.78rem', color: '#fbbf24', marginBottom: 8 }}>🚪 A porta está trancada — responda para passar:</div>
                  {doorQuestion.imageUrl && <img src={doorQuestion.imageUrl} alt="" style={{ maxHeight: 120, display: 'block', margin: '0 auto 10px' }} />}
                  <div style={{ fontWeight: 700, fontSize: '1.05rem', marginBottom: 12 }} dangerouslySetInnerHTML={{ __html: doorQuestion.title || '' }} />
                  <div style={{ display: 'grid', gap: 8 }}>
                    {doorQuestion.options.map((o: any, i: number) => (
                      <button key={i} onClick={() => answerDoor(i)}
                        style={{ textAlign: 'left', padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.25)', background: 'rgba(255,255,255,0.06)', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>
                        {o.imageUrl ? <img src={o.imageUrl} alt="" style={{ height: 26, verticalAlign: 'middle', marginRight: 8 }} /> : null}
                        <span dangerouslySetInnerHTML={{ __html: o.text || '' }} />
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
        {/* Animação de uso do consumível, seguindo o BONECO (transform atualizado no loop).
            Wrapper 0x0: a aura (ancorada no rodapé) fica exatamente sobre o personagem. */}
        <div ref={animWrapRef} style={{ position: 'absolute', left: 0, top: 0, width: 0, height: 0, pointerEvents: 'none' }}>
          <ConsumableAnimationOverlay anim={activeConsumableAnim} onComplete={() => setActiveConsumableAnim(null)} />
        </div>
      </div>
    </div>
  );
}