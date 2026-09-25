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
import { fetchActiveCoin, fetchActiveChest, fetchActiveDoor, fetchModelsByCategory, fetchSceneryModels, fetchAnimalModels, isImageUrl } from '../lib/model3d';
import { calculatePlayerHitDamage } from '../lib/combatDamage';
import { getEquippedDamageEffectInfo } from '../lib/damageEffects';
import { resolveConsumableEffect } from '../lib/consumableEffects';
import { playConsumableSound, resolveAudioUrl } from '../lib/audioBank';
import { fetchPlayerBattleQuotes, pickPlayerBattleQuote, type PlayerBattleQuotes } from '../lib/playerQuotes';
import ConsumableAnimationOverlay from './ConsumableAnimationOverlay';

// Ordem personalizada da MOCHILA do mapa (persistida por aluno para não se perder).
const consumableOrderKey = (uid?: string) => `map_consumable_order_${uid || 'anon'}`;
const loadConsumableOrder = (uid?: string): string[] => {
  try { const raw = localStorage.getItem(consumableOrderKey(uid)); if (raw) { const arr = JSON.parse(raw); return Array.isArray(arr) ? arr.filter(x => typeof x === 'string') : []; } } catch { /* noop */ }
  return [];
};
const saveConsumableOrder = (uid?: string, list: any[] = []) => {
  try { localStorage.setItem(consumableOrderKey(uid), JSON.stringify(list.map(c => c.key).filter(Boolean))); } catch { /* noop */ }
};

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

const DEF_COLS = 48, DEF_ROWS = 18;
const DEF_REVEAL_RADIUS = 7;
// Resistência dos quebráveis (picareta precisa vencer a DEFESA; o excedente + ataque vira dano).
const WALL_HP = 1000, WALL_DEF = 250;
const ROCK_DEF = 5, HAZARD_DEF = 5, DOOR_HP = 600, DOOR_DEF = 120;
// Dano da picareta de DEBUG (item muito forte, para testar paredes/portas).
const DEBUG_PICKAXE_DMG = 300;
// Cores dos status negativos (mesma paleta da batalha) para o TINT do monstro.
const STATUS_COLORS: Record<string, string> = { poison: '#44ff66', burn: '#ff8833', electric: '#ffe94a', bleed: '#ff3333', freeze: '#9fd8ff' };
const STATUS_DUR_MS = 3000;
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

// Layout PINTADO no editor: cada string é uma linha. '.'=livre, '#'=parede, 'D'=porta, 'S'=início, 'E'=fim.
function gridFromLayout(layout: string[]): Grid | null {
  const rows = layout.length; if (!rows) return null;
  const cols = layout[0].length;
  if (cols < 3 || layout.some(r => r.length !== cols)) return null;
  const wall: boolean[][] = [];
  const doorCells: { x: number; z: number }[] = [];
  let start = { x: 1, z: Math.floor(rows / 2) };
  let end = { x: cols - 2, z: Math.floor(rows / 2) };
  let hasStart = false, hasEnd = false;
  for (let z = 0; z < rows; z++) {
    const row: boolean[] = [];
    for (let x = 0; x < cols; x++) {
      const ch = layout[z][x];
      if (ch === '#') { row.push(true); continue; }
      row.push(false);
      if (ch === 'D') doorCells.push({ x, z });
      else if (ch === 'S') { start = { x, z }; hasStart = true; }
      else if (ch === 'E') { end = { x, z }; hasEnd = true; }
    }
    wall.push(row);
  }
  if (!hasStart) wall[start.z][start.x] = false;
  if (!hasEnd) wall[end.z][end.x] = false;
  return { wall, start, end, doorCells };
}

function generateGrid(cols: number, rows: number, opts?: { wallDensity?: number; doorCount?: number }): Grid {
  const wallDensity = Math.max(0.05, Math.min(0.7, opts?.wallDensity ?? 0.26));
  const doorCount = Math.max(1, Math.min(6, opts?.doorCount ?? 2));
  const isWallCell = (wall: boolean[][], x: number, z: number) => x < 0 || x >= cols || z < 0 || z >= rows || wall[z][x];
  const reachable = (wall: boolean[][], start: { x: number; z: number }) => {
    const seen = new Set<string>([`${start.x},${start.z}`]); const q = [start];
    while (q.length) { const c = q.shift()!; for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = c.x + dx, nz = c.z + dz; if (isWallCell(wall, nx, nz)) continue; const k = `${nx},${nz}`; if (!seen.has(k)) { seen.add(k); q.push({ x: nx, z: nz }); } } }
    return seen;
  };
  // Colunas de portas distribuídas uniformemente.
  const DOOR_COLS: number[] = [];
  for (let i = 1; i <= doorCount; i++) DOOR_COLS.push(Math.floor(cols * (i / (doorCount + 1))));
  for (let attempt = 0; attempt < 80; attempt++) {
    const wall: boolean[][] = [];
    for (let z = 0; z < rows; z++) { const row: boolean[] = []; for (let x = 0; x < cols; x++) row.push(Math.random() < wallDensity); wall.push(row); }
    // Borda fechada: evita "cantos" acessíveis nas extremidades.
    for (let x = 0; x < cols; x++) { wall[0][x] = true; wall[rows - 1][x] = true; }
    for (let z = 0; z < rows; z++) { wall[z][0] = true; wall[z][cols - 1] = true; }
    const start = { x: 1, z: Math.floor(rows / 2) };
    const end = { x: cols - 2, z: Math.floor(rows / 2) };
    wall[start.z][start.x] = false; wall[end.z][end.x] = false;
    // DIVISÓRIAS: cada coluna de porta vira parede inteira, exceto UMA célula (a porta).
    const doorCells: { x: number; z: number }[] = [];
    for (const xd of DOOR_COLS) {
      const freeCol: number[] = [];
      for (let z = 0; z < rows; z++) if (!wall[z][xd]) freeCol.push(z);
      const zc = freeCol.length ? freeCol[Math.floor(Math.random() * freeCol.length)] : Math.floor(rows / 2);
      for (let z = 0; z < rows; z++) wall[z][xd] = (z !== zc);
      doorCells.push({ x: xd, z: zc });
    }
    const seen = reachable(wall, start);
    if (!seen.has(`${end.x},${end.z}`)) continue;
    for (let z = 0; z < rows; z++) for (let x = 0; x < cols; x++) {
      if (!wall[z][x] && !seen.has(`${x},${z}`)) wall[z][x] = true;
    }
    if (doorCells.some(d => wall[d.z][d.x])) continue;
    return { wall, start, end, doorCells };
  }
  const wall = Array.from({ length: rows }, () => Array.from({ length: cols }, () => false));
  return { wall, start: { x: 1, z: Math.floor(rows / 2) }, end: { x: cols - 2, z: Math.floor(rows / 2) }, doorCells: [] };
}

// Bal�o de fala 3D (sprite com texto) � usado pelo jogador e pelos monstros no mapa.
function makeBubbleTexture(text: string): { tex: any; w: number; h: number } {
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
}
// Falas gen�ricas dos monstros do mapa (ataque / dano / derrota).
const MONSTER_LINES = {
  attack: ['GRRR!', 'RAAA!', 'Te peguei!', 'Vem!', 'Ugh!'],
  hurt: ['Ai!', 'Grrk!', 'Argh!', 'Ouch!'],
  defeat: ['Ugh...', 'Grr...', 'Nao...', '...'],
};
export default function MapExplorerPoC({ onExit, config: configProp, equippedItems: itemsProp, scenarioConfig, playerMode = false, scenarioTheme, bossOverride, onBossTouched }: { onExit?: () => void; config?: AvatarConfig | null; equippedItems?: EquippedItem[]; scenarioConfig?: any; playerMode?: boolean; scenarioTheme?: ThemeKey; bossOverride?: { name?: string; config?: any }; onBossTouched?: (remainingHp: number) => void }) {
const { userData } = useAuth();
  const [themeKey, setThemeKey] = useState<ThemeKey>(scenarioTheme || 'plains');
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
  const [heldKeysCount, setHeldKeysCount] = useState(0);
  const [damagePops, setDamagePops] = useState<any[]>([]);
  const [activeConsumableAnim, setActiveConsumableAnim] = useState<any>(null);
const [sfxOn, setSfxOn] = useState(false);
  const [sfxDiag, setSfxDiag] = useState('');
  // Tutorial de 1ª visita: instruções de controles; monstros ficam PASSIVOS até terminar.
  // Persistido no PERFIL do aluno (users.inventory_preferences) → vale em qualquer dispositivo.
  const [tutorialStep, setTutorialStep] = useState<number>(() => {
    return (userData as any)?.inventoryPreferences?.mapTutorialDone ? -1 : 0;
  });
  const tutorialActiveRef = useRef(tutorialStep >= 0);
  tutorialActiveRef.current = tutorialStep >= 0;
  const finishTutorial = () => {
    const uid = userData?.uid;
    if (uid) {
      const prefs = { ...((userData as any)?.inventoryPreferences || {}), mapTutorialDone: true };
      supabase.from('users').update({ inventory_preferences: prefs }).eq('id', uid).then(() => {}).catch((e: any) => console.warn('[MapPoC] falha ao marcar tutorial como visto:', e));
    }
    setTutorialStep(-1);
  };
  const tutorialSteps = IS_TOUCH ? [
    { icon: '🚶', title: 'Andar', text: 'Use o joystick (canto inferior esquerdo) para se mover.' },
    { icon: '🎥', title: 'Girar a câmera', text: 'Arraste o dedo na tela para girar a câmera.' },
    { icon: '⚔️', title: 'Atacar', text: 'Toque no botão ⚔️ (canto inferior direito) para atacar.' },
    { icon: '⛏️', title: 'Picareta', text: 'Toque no botão ⛏️ para alternar entre arma/escudo e a picareta.' },
    { icon: '👁️', title: 'Primeira pessoa', text: 'Toque no botão 👁️ para alternar entre 3ª e 1ª pessoa.' },
    { icon: '🔑', title: 'Interagir', text: 'Toque em portas e baús para interagir com eles.' },
  ] : [
    { icon: '🚶', title: 'Andar', text: 'Use WASD ou as setas para andar pelo mapa.' },
    { icon: '🎥', title: 'Girar a câmera', text: 'Arraste o mouse (ou use as teclas , e .) para girar a câmera.' },
    { icon: '⚔️', title: 'Atacar', text: 'Pressione ESPAÇO para atacar (o vigor drena e regenera parado).' },
    { icon: '⛏️', title: 'Picareta', text: 'Pressione P para equipar a picareta e quebrar rochas.' },
    { icon: '👁️', title: 'Primeira pessoa', text: 'Pressione V para alternar entre 3ª e 1ª pessoa.' },
    { icon: '🔑', title: 'Interagir', text: 'Pressione E em portas e baús para interagir com eles.' },
  ];
  const playerScreenRef = useRef({ x: 0, y: 0 });
  const animAnchorRef = useRef<'feet' | 'head'>('feet');
  const animWrapRef = useRef<HTMLDivElement>(null);
  const dragIdxRef = useRef<number | null>(null);
  // Controles MOBILE: joystick virtual + botões de ataque / 1ª pessoa.
  const joyRef = useRef({ x: 0, y: 0 });
  const joyBaseRef = useRef<HTMLDivElement>(null);
  const joyKnobRef = useRef<HTMLDivElement>(null);
  const attackActionRef = useRef<() => void>(() => {});
  const fpToggleRef = useRef<() => void>(() => {});
  // Atualiza o joystick virtual (mobile): direção normalizada + knob.
  const updateJoy = (clientX: number, clientY: number) => {
    const rect = joyBaseRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
    let dx = (clientX - cx) / (rect.width / 2);
    let dy = (clientY - cy) / (rect.height / 2);
    const len = Math.hypot(dx, dy);
    if (len > 1) { dx /= len; dy /= len; }
    joyRef.current = { x: dx, y: -dy };
    if (joyKnobRef.current) joyKnobRef.current.style.transform = `translate(${dx * 28}px, ${-dy * 28}px)`;
  };
  const resetJoy = () => {
    joyRef.current = { x: 0, y: 0 };
    if (joyKnobRef.current) joyKnobRef.current.style.transform = 'translate(0px, 0px)';
  };
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
  // Picareta REAL no inventário (para o HUD saber se usa o item ou a debug de fallback).
  const hasRealPickaxeItem = (playerItems || []).some(i => String(i.avatarPart) === 'pickaxe' || /picareta|pickaxe/i.test(String(i.itemTitle || '')) || ['tool', 'pickaxe'].includes(String(i.itemCategory)));
  // A picareta de DEBUG só existe para STAFF (admin/superadmin/coordinator/teacher), nunca para alunos.
  const canDebugPickaxe = userData?.role === 'admin' || userData?.role === 'superadmin' || userData?.role === 'coordinator' || userData?.role === 'teacher';
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
  // DEDUZ o item da mochila do aluno (user_items) — não é só "efeito visual".
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
    // Deduz UMA unidade da pilha real (user_items): atualiza quantity ou apaga se zerar.
    const stacks: { id: string; qty: number }[] = c.stacks || [];
    const stack = stacks.find(s => s.qty > 0);
    if (stack) {
      stack.qty -= 1;
      if (stack.qty <= 0) {
        supabase.from('user_items').delete().eq('id', stack.id).then(() => {}).catch(() => {});
      } else {
        supabase.from('user_items').select('data').eq('id', stack.id).maybeSingle()
          .then(({ data: row }) => {
            if (row && row.data) {
              supabase.from('user_items').update({ data: { ...row.data, quantity: stack.qty } }).eq('id', stack.id).then(() => {}).catch(() => {});
            }
          }).catch(() => {});
      }
    }
    setConsumables(prev => prev.map((x, j) => j === i ? { ...x, qty: x.qty - 1, stacks } : x).filter(x => x.qty > 0));
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
    const buildTemplate = async (model: any, kind: 'coin' | 'chest' | 'door' | 'scenery' | 'animal'): Promise<any> => {
      if (!model) return null;
      const url = model.url || model.open_url || '';
      if (!url) return null;
      try {
        if (isImageUrl(url)) {
          const tex = await new THREE.TextureLoader().loadAsync(url);
          (tex as any).colorSpace = (THREE as any).SRGBColorSpace;
          if (kind === 'scenery' || kind === 'animal') {
            // Imagem 2D → billboard (sempre de frente para a câmera).
            const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
            spr.scale.set(1, 1, 1);
            return spr;
          }
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
        if (d.item_id) ownedItemIdsRef.current.add(String(d.item_id));
        if (da.itemId) ownedItemIdsRef.current.add(String(da.itemId));
        // Coleta itens de MÃO (armas, escudos e picaretas) para os slots de equipamento do cenário.
        const part = String(da.avatarPart || '');
        if (['hand', 'rightHand', 'leftHand', 'two_handed', 'pickaxe'].includes(part) && (da.gameModelUrl || da.itemImageUrl || da.minecraftHeadValue)) {
          handInventoryRef.current.push({
            docId: d.id, itemId: d.item_id || da.itemId || d.id, imageUrl: da.itemImageUrl, avatarPart: da.avatarPart,
            itemTitle: da.itemTitle, itemCategory: da.itemCategory, baseAttributeType: da.baseAttributeType,
            baseAttributeValue: da.baseAttributeValue, adds: da.adds, fixedAttributes: da.fixedAttributes, forgeConfig: da.forgeConfig,
            damageEffect: da.damageEffect, battleSoundUrl: da.battleSoundUrl, criticalSoundUrl: da.criticalSoundUrl,
            gameModelUrl: da.gameModelUrl, modelTextureUrl: da.modelTextureUrl, minecraftHeadValue: da.minecraftHeadValue,
            modelTransforms: da.modelTransforms, backColor: da.backColor || '', forgeLevel: da.forgeLevel || 0,
          } as EquippedItem);
        }
        if (da.itemType !== 'consumable' || d.equipped || !USEFUL_CONSUMABLE_EFFECTS.has(da.gameEffect)) return;
        const key = d.item_id || da.itemId || da.itemTitle || d.id;
        const heal = da.gameEffect === 'restore_hp' ? 5 : da.gameEffect === 'heal_1_hp' ? 1 : 0;
        // Cada pilha real do banco (id + quantidade) para DEDUZIR de verdade na mochila.
        const stack = { id: d.id, qty: da.quantity || 1 };
        const existing = groups.get(key);
        if (existing) { existing.qty += stack.qty; existing.stacks.push(stack); }
        else groups.set(key, { key, title: da.itemTitle || 'Item', imageUrl: da.itemImageUrl, heal, effect: da.gameEffect, qty: stack.qty, stacks: [stack], consumableAnimPreset: da.consumableAnimPreset, consumableEffectColor: da.consumableEffectColor, useSoundUrl: da.useSoundUrl });
      });
if (!cancelled) {
        const ordered = [...groups.values()];
        const saved = loadConsumableOrder(uid);
        if (saved.length > 0) {
          ordered.sort((a, b) => {
            const ia = saved.indexOf(a.key), ib = saved.indexOf(b.key);
            if (ia === -1 && ib === -1) return 0;
            if (ia === -1) return 1;
            if (ib === -1) return -1;
            return ia - ib;
          });
        }
        setConsumables(ordered);
      }
    }).catch(() => {});

    // Moeda/baú PADRÃO ativos do tenant (arte do cenário).
    const loadModels = Promise.all([fetchActiveCoin(tenantId), fetchActiveChest(tenantId), fetchActiveDoor(tenantId)]).then(async ([coinM, chestM, doorM]) => {
      const c = await buildTemplate(coinM, 'coin');
      const ch = await buildTemplate(chestM, 'chest');
      const dr = await buildTemplate(doorM, 'door');
      if (!cancelled) { coinTemplateRef.current = c; chestTemplateRef.current = ch; doorTemplateRef.current = dr; coinConfigRef.current = coinM; chestConfigRef.current = chestM; }
      // Modelos de PORTA por ID (categoria 'door') — cada tipo de porta usa o SEU modelo.
      const allDoorModels = await fetchModelsByCategory('door', tenantId).catch(() => []);
      const doorMap = new Map<string, any>();
      for (const dm of (allDoorModels || [])) { const t = await buildTemplate(dm, 'door'); if (t) doorMap.set((dm as any).id, t); }
      if (!cancelled) doorTemplatesRef.current = doorMap;
      // CENÁRIO configurável (árvores/arbustos/flores/pedras/água/chão) por tipo.
      const sceneryModels = await fetchSceneryModels(tenantId).catch(() => []);
      const sceneryMap = new Map<string, any[]>();
      for (const sm of (sceneryModels || [])) {
        const t = await buildTemplate(sm, 'scenery'); if (!t) continue;
        const kind = String((sm as any).kind || 'tree');
        const arr = sceneryMap.get(kind) || [];
        arr.push({ id: (sm as any).id, template: t, scale: Number((sm as any).renderScale) || 1, height: Number((sm as any).renderHeight) || 1, soundUrl: (sm as any).soundUrl || '' });
        sceneryMap.set(kind, arr);
      }
      if (!cancelled) sceneryByKindRef.current = sceneryMap;
      // ANIMAIS configuráveis (modelo + som + falas em balão).
      const animalModels = await fetchAnimalModels(tenantId).catch(() => []);
      const animalList: any[] = [];
      for (const am of (animalModels || [])) {
        const t = await buildTemplate(am, 'animal'); if (!t) continue;
        animalList.push({ id: (am as any).id, template: t, url: (am as any).url || '', name: (am as any).name || 'Animal', config: (am as any).config || {}, scale: Number((am as any).renderScale) || 1, soundUrl: (am as any).soundUrl || '', lines: String((am as any).lines || '').split(';').map((s: string) => s.trim()).filter(Boolean) });
        if ((am as any).soundUrl) sfx.preload((am as any).soundUrl);
      }
      if (!cancelled) animalsRef.current = animalList;
      // Pré-carrega os SONS de moeda/baú configurados na edição.
      if (coinM?.coinSoundUrl) sfx.preload(coinM.coinSoundUrl);
      if (chestM?.chestAudioUrl) sfx.preload(chestM.chestAudioUrl);
    }).catch(() => {});

    // Cenário ativo (tipos de parede, portas, loot). Sem tabela/config → usa os padrões.
    // Se uma `scenarioConfig` veio por prop (preview no editor), usa ela direto.
    const loadScenario = scenarioRef.current ? Promise.resolve()
      : supabase.from('scenarios').select('config').eq('is_active', true).order('created_at', { ascending: true }).limit(1).then(({ data }) => {
        if (!cancelled && data && data.length) scenarioRef.current = (data[0] as any).config || {};
      }).catch(() => {});

    // Catálogo de itens (store_items) para o loot ligado ao catálogo.
    const loadCatalog = supabase.from('store_items').select('*').eq('active', true).then(({ data }) => {
      (data || []).forEach((r: any) => {
        const d = typeof r.data === 'string' ? JSON.parse(r.data) : (r.data || {});
        itemCatalogRef.current.set(String(r.id), {
          id: r.id,
          title: r.name || r.title || d.title || r.id,
          imageUrl: r.image_url || r.imageUrl || d.imageUrl || d.image_url || '',
          gameEffect: r.gameEffect || d.gameEffect || 'none',
          type: r.type || d.type || 'item',
        });
      });
    }).catch(() => {});

    // Catálogo de monstros (preset_skins type=monster) para povoar o mapa e o boss.
    const loadMonsters = supabase.from('preset_skins').select('*').eq('type', 'monster').then(({ data }) => {
      (data || []).forEach((r: any) => {
        const d = typeof r.config === 'string' ? JSON.parse(r.config) : (r.config || {});
        monsterCatalogRef.current.set(String(r.id), { id: r.id, name: r.name || d.name || r.id, config: d });
      });
    }).catch(() => {});

    Promise.all([loadItems, loadConsumables, loadModels, loadScenario, loadCatalog, loadMonsters]).finally(() => { if (!cancelled) setItemsReady(true); });
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
  const doorTemplateRef = useRef<any>(null);
  // Modelos 3D de porta POR ID (associados a cada tipo de porta no cenário).
  const doorTemplatesRef = useRef<Map<string, any>>(new Map());
  // Cenário configurável: modelos por TIPO (tree/bush/flower/rock/water/floor).
  const sceneryByKindRef = useRef<Map<string, any[]>>(new Map());
  // Animais configuráveis (modelo + som + falas).
  const animalsRef = useRef<any[]>([]);
  const scenarioRef = useRef<any>(scenarioConfig || null);
  // Catálogo de itens (store_items) por id — usado no loot ao quebrar blocos.
  const itemCatalogRef = useRef<Map<string, any>>(new Map());
  // Catálogo de monstros (preset_skins type=monster) por id — povoam o mapa e o boss.
  const monsterCatalogRef = useRef<Map<string, any>>(new Map());
  const ownedItemIdsRef = useRef<Set<string>>(new Set());
  // Itens de MÃO do jogador (armas, escudos e PICARETAS) — para os slots de equipamento.
  const handInventoryRef = useRef<EquippedItem[]>([]);
  const equipHandRef = useRef<(itemId: string | null) => void>(() => {});
  const [handOptions, setHandOptions] = useState<{ id: string; title: string; imageUrl?: string; isPickaxe: boolean }[]>([]);
  const [handActiveId, setHandActiveId] = useState<string | null>(null);
  const [handViewPickaxes, setHandViewPickaxes] = useState(false);

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
    // Dimensões e raio de visão vindos da config do cenário (com fallback).
    const sc0: any = scenarioRef.current || {};
    const layout: string[] | null = (Array.isArray(sc0.layout) && sc0.layout.length && typeof sc0.layout[0] === 'string') ? sc0.layout as string[] : null;
    const ROWS = layout ? layout.length : Math.max(8, Math.min(80, Number(sc0.rows) || DEF_ROWS));
    const COLS = layout ? layout[0].length : Math.max(10, Math.min(120, Number(sc0.cols) || DEF_COLS));
    const REVEAL_RADIUS = Math.max(2, Math.min(15, Number(sc0.revealRadius) || DEF_REVEAL_RADIUS));
    // Parâmetros de geração (densidade de paredes, elaboração estratégica, chave do boss).
    const cfgWallDensity = Math.max(0.05, Math.min(0.7, Number(sc0.wallDensity) ?? 0.26));
    const cfgElaboration = Math.max(0, Math.min(1, Number(sc0.elaboration) ?? 0.5));
    const cfgGenDoors = Math.max(0, Number(sc0.genDoors) || 0);
    const cfgGenChests = Math.max(0, Number(sc0.genChests) || 0);
    const cfgMonsterChance = Number(sc0.genMonsterChance) > 0 ? Math.min(1, Number(sc0.genMonsterChance)) : (0.03 + cfgElaboration * 0.06);
    const cfgBossKeyMode = sc0.bossKeyMode || 'none';
    const cfgMapType: 'closed' | 'open' = sc0.mapType === 'open' ? 'open' : 'closed';
    // Mapa ABERTO: menos paredes e sem anel de borda (vira campo com obstáculos).
    const genWallDensity = cfgMapType === 'open' ? cfgWallDensity * 0.5 : cfgWallDensity;
    const grid = (layout ? gridFromLayout(layout) : null) || generateGrid(COLS, ROWS, { wallDensity: genWallDensity, doorCount: cfgGenDoors > 0 ? Math.round(cfgGenDoors) : (2 + Math.round(cfgElaboration * 2)) });
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
    // Base NEUTRA (cinza) para o material.cor tingir por tipo de parede.
    const makeStoneTex = (crackLevel: number) => {
      const t = makeTex(64, (g) => {
        g.fillStyle = '#c9c9c9'; g.fillRect(0, 0, 64, 64);
        g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 2;
        for (let y = 0; y < 64; y += 16) for (let x = 0; x < 64; x += 16) {
          if (((x / 16 + y / 16) % 2) === 0) { g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(x + 1, y + 1, 14, 14); }
          g.strokeRect(x + 0.5, y + 0.5, 15, 15);
        }
        const n = [0, 3, 8, 16][crackLevel] || 0;
        g.strokeStyle = 'rgba(10,5,0,0.8)'; g.lineWidth = 1.6;
        for (let i = 0; i < n; i++) { g.beginPath(); let x = Math.random() * 64, y = Math.random() * 64; g.moveTo(x, y); for (let j = 0; j < 3; j++) { x += (Math.random() - 0.5) * 22; y += (Math.random() - 0.5) * 22; g.lineTo(x, y); } g.stroke(); }
      });
      t.repeat.set(1, 2); return t;
    };
    const stoneCrackTex = [0, 1, 2, 3].map(l => makeStoneTex(l));

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

    // ---- CONFIG DO CENÁRIO (tabela `scenarios`) — tipos de parede, portas, loot ----
    const sc: any = scenarioRef.current || {};
    const cfgWallTypes: any[] = (Array.isArray(sc.wallTypes) && sc.wallTypes.length) ? sc.wallTypes
      : [{ id: 'stone', name: 'Pedra', hp: WALL_HP, def: WALL_DEF, breakable: true, chance: 1, color: theme.wall }];
    const cfgLoot: any[] = (Array.isArray(sc.lootTable) && sc.lootTable.length) ? sc.lootTable
      : [{ kind: 'coins', weight: 45, min: 1, max: 10 }, { kind: 'heart', weight: 17 }, { kind: 'potion', weight: 14 }, { kind: 'nothing', weight: 24 }];
    const cfgDoor: any = (Array.isArray(sc.doorTypes) && sc.doorTypes[0]) || { hp: DOOR_HP, def: DOOR_DEF, color: '#8b5a2b', openMode: 'challenge', challengeChance: 1 };
    const cfgDoorTypes: any[] = (Array.isArray(sc.doorTypes) && sc.doorTypes.length) ? sc.doorTypes : [cfgDoor];
    const cfgDefaultDoor: any = cfgDoorTypes.find((t: any) => t.id === sc.defaultDoorType) || cfgDoorTypes[0];
    // Tipos específicos por célula (pintados no editor: "x,z" → id do tipo).
    const cfgWallTypeCells: Record<string, string> = (sc.wallTypeCells && typeof sc.wallTypeCells === 'object') ? sc.wallTypeCells : {};
    const cfgDoorTypeCells: Record<string, string> = (sc.doorTypeCells && typeof sc.doorTypeCells === 'object') ? sc.doorTypeCells : {};
    // Chaves do cenário (para portas "chave" e loot de chave).
    const cfgKeys: any[] = (Array.isArray(sc.keys) && sc.keys.length) ? sc.keys : [];
    // Loot configurável dos BAÚS (por cenário). Sem config → moedas 1..10 (comportamento antigo).
    const cfgChestConfig: any = (sc && typeof sc.chestConfig === 'object') ? sc.chestConfig : {};
    // População de monstros do cenário (catálogo + células pintadas + regiões + boss).
    const cfgMonster: any = sc.monsterConfig || {};
    const cfgMonsterIds: string[] = Array.isArray(cfgMonster.monsters) ? cfgMonster.monsters : [];
    const cfgMonsterRegions: any[] = Array.isArray(cfgMonster.regions) ? cfgMonster.regions : [];
    const cfgMonsterCells: Record<string, string> = (sc.monsterCells && typeof sc.monsterCells === 'object') ? sc.monsterCells : {};
    const cfgBossMonsterId: string = String(cfgMonster.bossMonsterId || '');
    const cfgGlobalTrap = Math.max(0, Math.min(1, Number(sc.wallTrapChance) || 0));

    // Música de fundo do cenário (banco de sons): toca em loop. Autoplay costuma ser
    // bloqueado → inicia no 1º gesto do jogador (pointerdown/keydown).
    const musicUrl = sc.musicUrl || '';
    let musicEl: HTMLAudioElement | null = null;
    if (musicUrl) {
      musicEl = new Audio(resolveAudioUrl(musicUrl));
      musicEl.loop = true;
      const musicVol = Number(sc.musicVolume);
      musicEl.volume = Number.isFinite(musicVol) ? Math.max(0, Math.min(1, musicVol)) : 0.5;
      const startMusic = () => { if (musicEl && musicEl.paused) { musicEl.play().catch(() => {}); } };
      window.addEventListener('pointerdown', startMusic, { once: true });
      window.addEventListener('keydown', startMusic, { once: true });
    }
    // Encerra a música do cenário de forma SUAVE (usada ao encontrar o chefe, para a
    // música do boss começar).
    const fadeOutMapMusic = (duration = 1600) => {
      if (!musicEl) return;
      const initial = musicEl.volume;
      const start = performance.now();
      const iv = window.setInterval(() => {
        const t = (performance.now() - start) / duration;
        if (!musicEl) { window.clearInterval(iv); return; }
        if (t >= 1) {
          window.clearInterval(iv);
          musicEl.volume = 0;
          musicEl.pause();
        } else {
          musicEl.volume = Math.max(0, initial * (1 - t));
        }
      }, 50);
    };
    // Batalha (o boss assume a partir daqui). Em modo embutido (dentro da missão),
    // avisa o pai para fazer a transição FF, levando o HP restante do cenário.
    const triggerBossBattle = () => {
      if (disposed) return;
      if (onBossTouched) {
        onBossTouched(playerHeartsRun);
        disposed = true;
        return;
      }
      callbacks.current.setBossTouched(true);
      disposed = true;
    };
    // Chefe toca o jogador: toca o GRUNIDO do chefe e SÓ DEPOIS inicia a batalha.
    const bossGruntThenBattle = (gruntUrl: string) => {
      fadeOutMapMusic();
      if (gruntUrl) {
        const au = new Audio(resolveAudioUrl(gruntUrl));
        au.volume = 0.9;
        au.play().catch(() => {});
        au.addEventListener('ended', triggerBossBattle);
        au.addEventListener('error', triggerBossBattle);
        window.setTimeout(triggerBossBattle, 2500); // fallback de segurança
      } else {
        window.setTimeout(triggerBossBattle, 400);
      }
    };
    // Materiais por TIPO de parede (4 estágios de trinca), tingidos pela cor do tipo.
    const wallTypeMats: Record<string, any[]> = {};
    const wallTypeTex: Record<string, any> = {};
    const wallTexLoader = new THREE.TextureLoader();
    // Aplica o material (textura custom ou trinca) a uma parede, conforme o estágio de dano.
    const applyWallMaterial = (mesh: THREE.Mesh, wt: any, stage: number) => {
      const color = new THREE.Color(wt.color || '#6b7280');
      const tex = wallTypeTex[wt.id];
      if (tex) { (mesh as any).material = new THREE.MeshStandardMaterial({ map: tex, color, roughness: 0.9 }); return; }
      const mats = wallTypeMats[wt.id] || [];
      (mesh as any).material = mats[stage] || new THREE.MeshStandardMaterial({ map: stoneCrackTex[stage] || stoneCrackTex[0], color });
    };
    // Referência preenchida depois que as paredes existirem (para recarregar com a textura).
    const refreshWallsRef: { fn?: (typeId: string) => void } = {};
    for (const wt of cfgWallTypes) {
      const col = new THREE.Color(wt.color || '#6b7280');
      wallTypeMats[wt.id] = stoneCrackTex.map(tex => new THREE.MeshStandardMaterial({ map: tex, color: col }));
      if (wt.textureUrl) {
        wallTexLoader.load(wt.textureUrl, (tex: any) => {
          tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
          tex.repeat.set(1, 1);
          tex.colorSpace = THREE.SRGBColorSpace;
          wallTypeTex[wt.id] = tex;
          refreshWallsRef.fn?.(wt.id);
        }, undefined, () => { /* fallback: mantém textura de trinca */ });
      }
    }
    const pickWallType = (): any => {
      const weights = cfgWallTypes.map(w => Math.max(0, Number(w.chance) || 0));
      const total = weights.reduce((s, v) => s + v, 0);
      if (total <= 0) return cfgWallTypes[Math.floor(Math.random() * cfgWallTypes.length)];
      let r = Math.random() * total;
      for (let i = 0; i < cfgWallTypes.length; i++) { r -= weights[i]; if (r <= 0) return cfgWallTypes[i]; }
      return cfgWallTypes[cfgWallTypes.length - 1];
    };
    const unbreakableWall = cfgWallTypes.find(w => w.breakable === false) || cfgWallTypes[0];
    const wallTypeById = (id: string) => cfgWallTypes.find(w => w.id === id) || cfgWallTypes[0];

    // ---- Paredes SÓLIDAS (altas) e QUEBRÁVEIS (tipo/HP/defesa/armadilha por config) ----
    const cfgWallHeight = Math.max(1, Math.min(10, Number(sc0.wallHeight) || 3.4));
    const wallGeo = new THREE.BoxGeometry(1, cfgWallHeight, 1);
    type WallCell = { mesh: THREE.Mesh; hp: number; maxHp: number; def: number; typeId: string; breakable: boolean; trap: number; stage?: number };
    const wallCells = new Map<string, WallCell>();
    for (let z = 0; z < ROWS; z++) for (let x = 0; x < COLS; x++) {
      if (!grid.wall[z][x]) continue;
      // Borda = tipo INDESTRUTÍVEL (não deixa o jogador cavar para fora do mapa). No mapa ABERTO não há anel de borda.
      const isBorder = cfgMapType === 'closed' && (x === 0 || x === COLS - 1 || z === 0 || z === ROWS - 1);
      const cellKey = `${x},${z}`;
      let wt = isBorder ? unbreakableWall : pickWallType();
      if (!isBorder && cfgWallTypeCells[cellKey]) wt = wallTypeById(cfgWallTypeCells[cellKey]) || wt;
      const m = new THREE.Mesh(wallGeo, new THREE.MeshStandardMaterial({ color: new THREE.Color(wt.color || '#6b7280') }));
      applyWallMaterial(m, wt, 0);
      m.position.set(wx(x), cfgWallHeight / 2, wz(z)); m.castShadow = true; m.receiveShadow = true; scene.add(m);
      wallCells.set(cellKey, {
        mesh: m, hp: Number(wt.hp) || WALL_HP, maxHp: Number(wt.hp) || WALL_HP, def: Number(wt.def) || 0,
        typeId: wt.id, breakable: wt.breakable !== false, trap: Number(wt.trapChance ?? cfgGlobalTrap) || 0, stage: 0,
      });
    }
    // Quando uma textura de parede carrega, reaplica nos blocos já criados desse tipo.
    refreshWallsRef.fn = (typeId: string) => {
      const wt = wallTypeById(typeId);
      for (const [, cell] of wallCells.entries()) if (cell.typeId === typeId) applyWallMaterial(cell.mesh, wt, cell.stage || 0);
    };

    // ---- Névoa de exploração (BLOCOS pretos altos — cobrem também as laterais) ----
    const explored = new Set<string>();
    const fogGroup = new THREE.Group();
    const fogMat = new THREE.MeshBasicMaterial({ color: 0x02040a, transparent: true, opacity: 0.98, depthWrite: false, side: THREE.DoubleSide });
    // Bloco ALTO (mín. 3,8) para não deixar ver o terreno atrás/lateralmente.
    const fogHeight = Math.max(3.8, cfgWallHeight + 0.4);
    const fogGeo = new THREE.BoxGeometry(1.04, fogHeight, 1.04);
    const fogCells = new Map<string, THREE.Mesh>();
    for (let z = 0; z < ROWS; z++) for (let x = 0; x < COLS; x++) {
      const f = new THREE.Mesh(fogGeo, fogMat);
      f.position.set(wx(x), fogHeight / 2, wz(z));
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
    type Slime = { x: number; z: number; root: THREE.Group; mesh: THREE.Mesh; tx: number; tz: number; t: number; hp: number; maxHp: number; vision: number; defense: number; evasion: number; bar: THREE.Group; fg: THREE.Mesh; attackCd: number; pathT: number; pnx: number; pnz: number; lunge: number; lungeHit: boolean; kb: number; kbx: number; kbz: number; name?: string; monsterId?: string; isKeyHolder?: boolean; isBoss?: boolean; gruntUrl?: string; grunting?: boolean; attackSound?: string; damageSound?: string; hasGruntted?: boolean; visual?: THREE.Object3D; visualRestY?: number; level?: number; drops?: any[]; isAnimal?: boolean; hostile?: boolean; hostileChance?: number; damageEffect?: string; label?: THREE.Sprite; labelY?: number; status?: { type: 'poison' | 'bleed' | 'burn' | 'electric' | 'freeze'; until: number; total: number }; statusBar?: { g: THREE.Group; fg: THREE.Mesh }; tintedType?: string; bubble?: THREE.Sprite; bubbleUntil?: number; bubbleY?: number };
    const slimes: Slime[] = [];
    const rocks: { x: number; z: number; mesh: THREE.Object3D; hp: number; maxHp: number; def: number }[] = [];
    const hazards: { x: number; z: number; mesh: THREE.Mesh; hp: number; maxHp: number; def: number }[] = [];
    const chests: { x: number; z: number; mesh: THREE.Object3D }[] = [];
    const doors: { x: number; z: number; mesh: THREE.Object3D; open: boolean; hp: number; maxHp: number; def: number; typeId: string }[] = [];
    const coinGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.08, 16);
    const coinMat = new THREE.MeshStandardMaterial({ color: 0xffd34d, emissive: 0xffaa00, emissiveIntensity: 0.6 });
    const slimeGeo = new THREE.SphereGeometry(0.4, 14, 12);
    const rockGeo = new THREE.DodecahedronGeometry(0.4, 0); const rockMat = new THREE.MeshStandardMaterial({ color: 0x9c8a7a, roughness: 0.9 });
    // Rocha: usa o .glb do cenário (tipo 'rock') se houver; senão fallback VARIADO (formas/tamanhos).
    const mkRock = (x: number, z: number): THREE.Object3D => {
      const tmpls = sceneryByKindRef.current.get('rock') || [];
      let obj: THREE.Object3D;
      if (tmpls.length) {
        const pick = tmpls[Math.floor(Math.random() * tmpls.length)];
        obj = pick.template.clone(true);
        obj.scale.setScalar((pick.scale || 1) * (0.85 + Math.random() * 0.5));
        obj.rotation.y = Math.random() * Math.PI * 2;
        obj.position.set(wx(x), 0, wz(z));
      } else {
        const geos = [new THREE.DodecahedronGeometry(0.42, 0), new THREE.IcosahedronGeometry(0.44, 0), new THREE.DodecahedronGeometry(0.5, 0), new THREE.IcosahedronGeometry(0.34, 0)];
        const geo = geos[Math.floor(Math.random() * geos.length)];
        const m = new THREE.Mesh(geo, rockMat);
        m.scale.set(0.8 + Math.random() * 0.8, 0.7 + Math.random() * 1.0, 0.8 + Math.random() * 0.8);
        m.rotation.set(Math.random() * 0.6, Math.random() * Math.PI * 2, Math.random() * 0.6);
        m.position.set(wx(x), 0.42, wz(z)); m.castShadow = true;
        obj = m;
      }
      scene.add(obj);
      return obj;
    };
    const hzGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.22, 12); const hzMat = new THREE.MeshStandardMaterial({ color: theme.hazardColor, emissive: theme.hazardColor, emissiveIntensity: 0.6 });
    const chestGeo = new THREE.BoxGeometry(0.5, 0.44, 0.4); const chestMat = new THREE.MeshStandardMaterial({ color: 0xb07d3a });
const barBgGeo = new THREE.PlaneGeometry(1.0, 0.16);
    const barFgGeo = new THREE.PlaneGeometry(1.0, 0.16);
    // Barra pequena de DURAÇÃO de status (acima do HP).
    const stBgGeo = new THREE.PlaneGeometry(0.7, 0.1);
    const stFgGeo = new THREE.PlaneGeometry(0.7, 0.1);
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

    // Rótulo 3D "Nv.X Nome" (sprite com texto) exibido acima da barra de HP.
    const makeLabelSprite = (text: string): THREE.Sprite => {
      const c = document.createElement('canvas');
      const font = 34; const pad = 10;
      const g0 = c.getContext('2d')!;
      g0.font = `bold ${font}px sans-serif`;
      c.width = Math.max(64, Math.ceil(g0.measureText(text).width) + pad * 2); c.height = font + pad * 2;
      const g = c.getContext('2d')!;
      g.font = `bold ${font}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = 6; g.strokeStyle = 'rgba(0,0,0,0.85)'; g.strokeText(text, c.width / 2, c.height / 2);
      g.fillStyle = '#ffffff'; g.fillText(text, c.width / 2, c.height / 2);
      const tex = new THREE.CanvasTexture(c);
      (tex as any).colorSpace = (THREE as any).SRGBColorSpace;
      const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
      spr.renderOrder = 998;
      spr.scale.set(c.width * 0.006, c.height * 0.006, 1);
      return spr;
    };
// Cria um monstro numa célula. Se `monsterId` (catálogo preset_skins) for dado,
    // usa stats/visual do monstro cadastrado; senão cai no slime genérico.
    const addMonster = (gx: number, gz: number, visionOverride?: number, monsterId?: string, monsterOverride?: { name?: string; config?: any }) => {
      let monster: any = monsterOverride || null;
      if (!monster && monsterId) monster = monsterCatalogRef.current.get(String(monsterId));
      if (!monster && cfgMonsterIds.length) monster = monsterCatalogRef.current.get(String(cfgMonsterIds[Math.floor(Math.random() * cfgMonsterIds.length)]));
      const st = monster?.config?.stats || {};
      const level = Number(st.level) || 1;
      // HP configurado no monstro; vazio → automático pelo nível.
      const hp = (Number(st.hp) > 0) ? Math.round(Number(st.hp)) : Math.max(40, Math.round(40 + level * 35));
      const defense = Number(st.defense) || (5 + Math.floor(Math.random() * 16));
      const evasion = Number(st.evasion) || Math.floor(Math.random() * 8);
      const root = new THREE.Group(); root.position.set(wx(gx), 0, wz(gz));
      const m = new THREE.Mesh(slimeGeo, new THREE.MeshStandardMaterial({ color: 0x7ee06f }));
      m.position.set(0, 0.4, 0); m.castShadow = true; root.add(m); scene.add(root);
      // Se o monstro tem modelo 3D, troca o visual do slime quando o GLB carregar.
      const modelUrl = monster?.config?.customModelUrl;
      if (modelUrl) {
        new GLTFLoader().load(modelUrl, (gltf: any) => {
          if (disposed) return;
          const model = gltf.scene as any;
          const box = new THREE.Box3().setFromObject(model);
          const h = Math.max(0.001, box.max.y - box.min.y);
          // Escala: usa o TAMANHO definido na edição de monstros (customZoom), padrão 1.
          const zoom = Math.max(0.6, Math.min(1.5, Number(monster?.config?.customZoom) || 1));
          const scale = (1.25 / h) * zoom;
          model.scale.setScalar(scale);
          model.position.y = 0;
          // Aplica a SKIN/textura do monstro ao GLB (mesma lógica do CustomModelViewer),
          // senão aparece só o "esqueleto" do modelo.
          const texUrl = monster?.config?.customSkinUrl || monster?.config?.modelTextureUrl;
          if (texUrl) {
            const tl = new THREE.TextureLoader();
            tl.crossOrigin = 'anonymous';
            tl.load(texUrl, (texture) => {
              if (disposed) return;
              texture.flipY = false;
              texture.magFilter = THREE.NearestFilter;
              texture.minFilter = THREE.NearestFilter;
              model.traverse((child: any) => {
                if (!child.isMesh || !child.material) return;
                const newMat = (child.material as THREE.Material).clone() as any;
                newMat.map = texture;
                newMat.transparent = false;
                newMat.alphaTest = 0.5;
                newMat.needsUpdate = true;
                child.material = newMat;
              });
            }, undefined, () => { /* mantém material original do GLB */ });
          }
          root.remove(m);
          root.add(model);
          // O modelo passa a ser o VISUAL que recebe o bote (lunge) na IA.
          slime.visual = model;
          slime.visualRestY = 0;
        }, undefined, () => { /* mantém slime */ });
      }
      const bar = new THREE.Group();
      const bg = new THREE.Mesh(barBgGeo, new THREE.MeshBasicMaterial({ color: 0x1a0505 }));
      // Monstro/hostil = VERMELHO; animal pacífico = VERDE.
      const isAnimal = !!(monster as any)?.isAnimal;
      const fg = new THREE.Mesh(barFgGeo, new THREE.MeshBasicMaterial({ color: isAnimal ? 0x44dd55 : 0xdd3333 }));
      fg.position.z = 0.01; bar.add(bg); bar.add(fg); bar.position.set(wx(gx), 1.15, wz(gz)); scene.add(bar);
      // Rótulo "Nv.X Nome" acima da barra de HP.
      const label = makeLabelSprite(`Nv.${level} ${monster?.name || (isAnimal ? 'Animal' : 'Monstro')}`);
      label.position.set(wx(gx), modelUrl ? 2.62 : 2.25, wz(gz)); scene.add(label);
      const labelY = modelUrl ? 2.62 : 2.25;
      // Barra de DURAÇÃO de status negativo (acima do HP), igual à batalha.
      const stBar = new THREE.Group();
      const stBg = new THREE.Mesh(stBgGeo, new THREE.MeshBasicMaterial({ color: 0x1a0505 }));
      const stFg = new THREE.Mesh(stFgGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
      stFg.position.z = 0.01; stBar.add(stBg); stBar.add(stFg);
      stBar.visible = false; scene.add(stBar);
      // Balão de fala 3D do monstro (sprite na cena, acima da cabeça — independe do zoom).
      const bubble = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false, depthWrite: false }));
      bubble.visible = false; bubble.renderOrder = 999; scene.add(bubble);
      const bubbleY = modelUrl ? 2.3 : 1.95;
      const slime: Slime = { x: gx, z: gz, root, mesh: m, tx: wx(gx), tz: wz(gz), t: 0, hp, maxHp: hp, vision: visionOverride ?? 8, defense, evasion, bar, fg, attackCd: 0, pathT: 0, pnx: NaN, pnz: NaN, lunge: 0, lungeHit: false, kb: 0, kbx: 0, kbz: 0, name: monster?.name, monsterId: monster?.id, isKeyHolder: false, gruntUrl: monster?.config?.gruntSound || '', attackSound: monster?.config?.attackSound || '', damageSound: monster?.config?.damageSound || '', hasGruntted: false, level: Number((monster as any)?.config?.stats?.level ?? (monster as any)?.config?.level ?? 1) || 1, drops: monster?.config?.drops || [], statusBar: { g: stBar, fg: stFg }, bubble, bubbleUntil: 0, bubbleY, isAnimal: !!isAnimal, hostile: !isAnimal, hostileChance: Number((monster as any)?.config?.stats?.hostileChance) || 0, damageEffect: (monster as any)?.config?.stats?.damageEffect || 'none', label, labelY };
      slimes.push(slime);
      return slime;
    };
    // Registra a derrota de um monstro do catálogo no Mapa Explorável → Bestiário/Conquistas.
    const recordMonsterKill = (s: { name?: string; monsterId?: string }) => {
      if ((s as any)?.isAnimal) return; // animais não entram no bestiário de monstros
      const studentId = userData?.uid;
      if (!studentId || !s?.name) return;
      supabase.from('monster_encounters').insert({
        student_id: studentId,
        monster_name: s.name,
        monster_id: s.monsterId || null,
        status: 'completed',
        source: 'map',
      }).then(() => {}).catch((e: any) => console.warn('[MapPoC] não registrou encontro (tabela monster_encounters existe?):', e));
    };
    // ROLLA os DROPS configurados do monstro quando ele morre no mapa.
    const rollMonsterDrops = (s: Slime) => {
      const drops = s.drops || [];
      // O NÍVEL do monstro aumenta a chance de cada drop (até o teto de 100%).
      const lvl = Math.max(1, Number(s.level) || 1);
      const levelMult = 1 + (lvl - 1) * 0.12;
      for (const d of drops) {
        const base = Math.min(100, Math.max(0, Number(d.dropChance) || 0)) / 100;
        const chance = Math.min(1, base * levelMult);
        if (Math.random() >= chance) continue;
        const item = itemCatalogRef.current.get(String(d.itemId));
        if (!item) continue;
        // Cai onde o monstro/animal morreu (posição atual em células). Qtde min..max.
        const gx = Math.round(s.root.position.x + (COLS - 1) / 2);
        const gz = Math.round(s.root.position.z + (ROWS - 1) / 2);
        const min = Math.max(1, Number((d as any).min) || 1);
        const max = Math.max(min, Number((d as any).max) || min);
        const qty = min + Math.floor(Math.random() * (max - min + 1));
        for (let i = 0; i < qty; i++) spawnLootPickup(gx, gz, 'item', item);
      }
    };
    // Aplica o TINT do status no visual (modelo GLB ou slime), como na batalha.
    const applyMonsterTint = (s: Slime, type: string | null) => {
      s.tintedType = type || undefined;
      const color = type ? new THREE.Color(STATUS_COLORS[type] || '#ffffff') : null;
      if (s.visual) {
        s.visual.traverse((ch: any) => {
          if (!ch.isMesh || !ch.material) return;
          const mats = Array.isArray(ch.material) ? ch.material : [ch.material];
          mats.forEach((mat: any) => {
            if (color) {
              if (!mat.userData._origEmissive) mat.userData._origEmissive = (mat.emissive || new THREE.Color(0x000000)).clone();
              mat.emissive = color.clone();
              mat.emissiveIntensity = 0.45;
            } else if (mat.userData._origEmissive) {
              mat.emissive = mat.userData._origEmissive.clone();
              mat.emissiveIntensity = 0;
            }
            mat.needsUpdate = true;
          });
        });
      } else {
        const mat = s.mesh.material as any;
        if (color) {
          if (!mat.userData._origEmissive) mat.userData._origEmissive = (mat.emissive || new THREE.Color(0x000000)).clone();
          mat.emissive = color.clone();
          mat.emissiveIntensity = 0.5;
        } else if (mat.userData._origEmissive) {
          mat.emissive = mat.userData._origEmissive.clone();
          mat.emissiveIntensity = 0;
        }
      }
    };
    // Aplica um STATUS negativo (com duração) num monstro do cenário.
    const applyStatus = (s: Slime, type: 'poison' | 'bleed' | 'burn' | 'electric' | 'freeze') => {
      const dur = type === 'freeze' ? 2000 : STATUS_DUR_MS;
      s.status = { type, until: performance.now() + dur, total: dur };
      applyMonsterTint(s, type);
      if (s.statusBar) s.statusBar.g.visible = true;
    };

for (let z = 0; z < ROWS; z++) for (let x = 0; x < COLS; x++) {
      if (grid.wall[z][x]) continue;
      if (x === grid.start.x && z === grid.start.z) continue;
      if (x === grid.end.x && z === grid.end.z) continue;
      const r = Math.random();
      // Escala com a ELABORAÇÃO: mais moedas/perigos conforme o cenário é mais elaborado.
      const coinChance = 0.06 + cfgElaboration * 0.08;
      const hazardChance = theme.hazardOn ? (0.05 + cfgElaboration * 0.10) : 0;
      if (r < coinChance) { const m = makeCoinVisual(); m.position.set(wx(x), 0.5, wz(z)); scene.add(m); coinsList.push({ x, z, mesh: m, value: 1 + Math.floor(Math.random() * 10) }); }
      else if (theme.hazardOn && r < coinChance + hazardChance) { const m = new THREE.Mesh(hzGeo, hzMat); m.position.set(wx(x), 0.2, wz(z)); scene.add(m); const hhp = 30 + Math.floor(Math.random() * 40); hazards.push({ x, z, mesh: m, hp: hhp, maxHp: hhp, def: HAZARD_DEF }); }
    }

    // ---- MONSTROS do catálogo: células pintadas OU regiões OU lista padrão OU slime genérico ----
    const safeFromStart = (x: number, z: number) => (x - grid.start.x) ** 2 + (z - grid.start.z) ** 2 >= 81;
    const monsterCellKeys = Object.keys(cfgMonsterCells);
    if (monsterCellKeys.length > 0) {
      // Células PINTADAS no editor: cada célula tem o monstro exato escolhido.
      for (const ck of monsterCellKeys) {
        const [x, z] = ck.split(',').map(Number);
        const mid = cfgMonsterCells[ck];
        if (!mid) continue;
        if (x < 0 || x >= COLS || z < 0 || z >= ROWS || grid.wall[z][x]) continue;
        if (x === grid.start.x && z === grid.start.z) continue;
        if (x === grid.end.x && z === grid.end.z) continue;
        addMonster(x, z, undefined, mid);
      }
    } else if (cfgMonsterRegions.length > 0) {
      // Regiões retangulares: cada uma só spawna os monstros escolhidos (por densidade).
      for (const rg of cfgMonsterRegions) {
        const x1 = Math.max(1, Math.min(rg.x1, rg.x2)), x2 = Math.min(COLS - 2, Math.max(rg.x1, rg.x2));
        const z1 = Math.max(1, Math.min(rg.z1, rg.z2)), z2 = Math.min(ROWS - 2, Math.max(rg.z1, rg.z2));
        for (let z = z1; z <= z2; z++) for (let x = x1; x <= x2; x++) {
          if (grid.wall[z][x]) continue;
          if (x === grid.start.x && z === grid.start.z) continue;
          if (x === grid.end.x && z === grid.end.z) continue;
          if (Math.random() > Math.min(1, Math.max(0, Number(rg.density) || 0.2))) continue;
          const ids = Array.isArray(rg.monsters) && rg.monsters.length ? rg.monsters : cfgMonsterIds;
          const mid = ids.length ? ids[Math.floor(Math.random() * ids.length)] : '';
          addMonster(x, z, undefined, mid);
        }
      }
    } else if (cfgMonsterIds.length > 0) {
      // Lista padrão: espalha os monstros escolhidos (fora da zona segura do início).
      for (let z = 0; z < ROWS; z++) for (let x = 0; x < COLS; x++) {
        if (grid.wall[z][x]) continue;
        if (x === grid.start.x && z === grid.start.z) continue;
        if (x === grid.end.x && z === grid.end.z) continue;
        if (!safeFromStart(x, z) || Math.random() >= cfgMonsterChance) continue;
        addMonster(x, z, undefined, cfgMonsterIds[Math.floor(Math.random() * cfgMonsterIds.length)]);
      }
    } else {
      // Sem config de monstros: slimes genéricos como antes.
      for (let z = 0; z < ROWS; z++) for (let x = 0; x < COLS; x++) {
        if (grid.wall[z][x]) continue;
        if (x === grid.start.x && z === grid.start.z) continue;
        if (x === grid.end.x && z === grid.end.z) continue;
        if (!safeFromStart(x, z) || Math.random() >= cfgMonsterChance) continue;
        addMonster(x, z);
      }
    }

    // ---- CHAVE DO BOSS (modo "monster_drop"): um monstro do mapa carrega a chave ----
    if (cfgBossKeyMode === 'monster_drop' && slimes.length > 0) {
      // Prefere um monstro do catálogo; senão o primeiro do mapa.
      const holder = slimes.find(s => s.name) || slimes[0];
      holder.isKeyHolder = true;
      // Indicador visual: pequeno orbe dourado flutuando acima do monstro.
      const khGeo = new THREE.SphereGeometry(0.14, 12, 10);
      const khMat = new THREE.MeshStandardMaterial({ color: 0xffd700, emissive: 0xcaa000, emissiveIntensity: 1.2 });
      const khOrb = new THREE.Mesh(khGeo, khMat);
      khOrb.position.set(0, 1.25, 0);
      holder.root.add(khOrb);
      callbacks.current.setMsg('🔑 Um dos monstros carrega a CHAVE do BOSS! Derrote-o para pegá-la.');
    }

    // ---- Rochas ESTRATÉGICAS: bloqueiam corredores estreitos → exigem a PICARETA ----
    for (let z = 0; z < ROWS; z++) for (let x = 0; x < COLS; x++) {
      if (grid.wall[z][x]) continue;
      if ((x - grid.start.x) ** 2 + (z - grid.start.z) ** 2 < 100) continue;
      if (x === grid.end.x && z === grid.end.z) continue;
      if (grid.doorCells.some(dd => dd.x === x && dd.z === z)) continue;
const l = wallAt(x - 1, z), rr = wallAt(x + 1, z), u = wallAt(x, z - 1), d = wallAt(x, z + 1);
      const corridor = (l && rr && !u && !d) || (u && d && !l && !rr);
      if (!corridor || Math.random() > (0.35 + cfgElaboration * 0.45)) continue;
      const hp = 40 + Math.floor(Math.random() * 60);
      const m = mkRock(x, z);
      rocks.push({ x, z, mesh: m, hp, maxHp: hp, def: ROCK_DEF });
    }

    // ---- Baús: se o cenário tem chestCells (Gerar mapa), usa EXATAMENTE essas células ----
    const cfgChestCellsMap: Record<string, string> = (sc0.chestCells && typeof sc0.chestCells === 'object') ? sc0.chestCells : {};
    const chestCellKeys = Object.keys(cfgChestCellsMap);
    if (chestCellKeys.length) {
      for (const key of chestCellKeys) {
        const [xs, zs] = key.split(',').map(Number);
        if (!Number.isFinite(xs) || !Number.isFinite(zs)) continue;
        if (wallAt(xs, zs)) continue;
        if (xs === grid.start.x && zs === grid.start.z) continue;
        if (xs === grid.end.x && zs === grid.end.z) continue;
        const m = makeChestVisual(); m.position.set(wx(xs), 0.38, wz(zs)); m.castShadow = true; scene.add(m);
        chests.push({ x: xs, z: zs, mesh: m });
      }
    } else {
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
const chestCap = cfgGenChests > 0 ? Math.round(cfgGenChests) : Math.max(1, Math.round(1 + cfgElaboration * 3));
    chestCandidates.sort(() => Math.random() - 0.5);
    for (const cc of chestCandidates.slice(0, chestCap)) {
      if (!rocks.some(rk => rk.x === cc.entrance.x && rk.z === cc.entrance.z)) {
        const hp = 50 + Math.floor(Math.random() * 70);
        const rm = mkRock(cc.entrance.x, cc.entrance.z);
        rocks.push({ x: cc.entrance.x, z: cc.entrance.z, mesh: rm, hp, maxHp: hp, def: ROCK_DEF });
      }
      const m = makeChestVisual(); m.position.set(wx(cc.x), 0.38, wz(cc.z)); m.castShadow = true; scene.add(m);
      chests.push({ x: cc.x, z: cc.z, mesh: m });
    }
    }

// ---- PORTAS (divisórias): é preciso responder uma PERGUNTA para abrir ----
    // Material por TIPO de porta (textura custom ou procedural), tingido pela cor.
    const doorTexByType: Record<string, any> = {};
    const doorTexLoader = new THREE.TextureLoader();
    const makeDoorMaterial = (type: any) => {
      const color = new THREE.Color(type.color || '#8b5a2b');
      const tex = doorTexByType[type.id];
      return new THREE.MeshStandardMaterial({ map: tex || doorTex, roughness: 0.85, color });
    };
    // Cria a porta: usa o MODELO 3D ativo (categoria 'door'), se houver; senão a caixa procedural.
    const makeDoorMesh = (type: any): THREE.Object3D => {
      // Prioridade: MODELO do TIPO escolhido → modelo de porta ativo (global) → procedural.
      const tmpl = (type?.modelId && doorTemplatesRef.current.get(String(type.modelId))) || doorTemplateRef.current;
      if (tmpl) {
        try {
          const clone = tmpl.clone(true);
          clone.rotation.y = Math.PI / 2; // painel da divisória (fino em X)
          clone.updateMatrixWorld(true);
          const bb = new THREE.Box3().setFromObject(clone);
          const maxDim = Math.max(0.001, Math.max(bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z));
          const s = 1.8 / maxDim;
          clone.scale.setScalar(s);
          clone.position.y = -bb.min.y * s;
          const holder = new THREE.Group(); holder.add(clone);
          return holder;
        } catch { /* fallback abaixo */ }
      }
      const geo = new THREE.BoxGeometry(0.3, 1.8, 0.94); geo.translate(0, 0.9, 0);
      const m = new THREE.Mesh(geo, makeDoorMaterial(type)); m.castShadow = true;
      return m;
    };
    for (const dc of grid.doorCells) {
      const dt = (cfgDoorTypeCells[`${dc.x},${dc.z}`] && cfgDoorTypes.find((t: any) => t.id === cfgDoorTypeCells[`${dc.x},${dc.z}`])) || cfgDefaultDoor;
      const type = dt || cfgDoor;
      const m = makeDoorMesh(type);
      m.position.set(wx(dc.x), 0, wz(dc.z)); scene.add(m);
      doors.push({ x: dc.x, z: dc.z, mesh: m, open: false, hp: Number(type.hp) || DOOR_HP, maxHp: Number(type.hp) || DOOR_HP, def: Number(type.def) || 0, typeId: type.id });
    }
    // Quando uma textura de porta carrega, reaplica nos objetos já criados desse tipo.
    for (const dt of cfgDoorTypes) if (dt.textureUrl) {
      doorTexLoader.load(dt.textureUrl, (tex: any) => {
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.colorSpace = THREE.SRGBColorSpace;
        doorTexByType[dt.id] = tex;
        for (const d of doors) if (d.typeId === dt.id && (d.mesh as any).isMesh) (d.mesh as any).material = makeDoorMaterial(dt);
      }, undefined, () => { /* fallback: textura procedural */ });
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
      // Monstros próprios do TIPO de porta (se configurado); senão 3 aleatórios.
      const doorType: any = cfgDoorTypes.find((t: any) => t.id === doors.find((dd: any) => dd.x === gx && dd.z === gz)?.typeId);
      const mids: string[] = Array.isArray(doorType?.wrongMonsterIds) ? doorType.wrongMonsterIds.filter(Boolean) : [];
      window.setTimeout(() => {
        if (mids.length) {
          let placed = 0;
          for (let rad = 1; rad <= 3 && placed < mids.length; rad++) {
            for (let dz = -rad; dz <= rad && placed < mids.length; dz++) for (let dx = -rad; dx <= rad && placed < mids.length; dx++) {
              if (Math.abs(dx) !== rad && Math.abs(dz) !== rad) continue;
              const cx = gx + dx, cz = gz + dz;
              if (wallAt(cx, cz)) continue;
              if (rocks.some(rr => rr.x === cx && rr.z === cz)) continue;
              if (doors.some(dd => dd.x === cx && dd.z === cz && dd.mesh.visible)) continue;
              addMonster(cx, cz, undefined, mids[placed]); placed++;
            }
          }
        } else {
          spawnMonstersRef.current(gx, gz, 3);
        }
        setPuffs(prev => prev.filter(p => p.id !== id));
      }, 900);
    };
// ---- BOSS (extremo oposto) ----
    // Prioridade: monstro da MISSÃO (bossOverride) > boss do cenário > monstro padrão > fallback.
    const bossOverrideMonster = bossOverride && (bossOverride.config || bossOverride.name) ? bossOverride : null;
    const bossMonsterInfo = bossOverrideMonster || (cfgBossMonsterId ? monsterCatalogRef.current.get(String(cfgBossMonsterId)) : null);
    const bossSlime = addMonster(grid.end.x, grid.end.z, 12, bossOverrideMonster ? undefined : (cfgBossMonsterId || (cfgMonsterIds.length ? cfgMonsterIds[0] : '')), bossOverrideMonster || undefined);
    if (bossSlime) {
      bossSlime.isBoss = true;
      bossSlime.vision = 14;
      bossSlime.root.scale.setScalar(1.9);
      bossSlime.gruntUrl = (bossOverrideMonster?.config?.gruntSound) || (bossMonsterInfo?.config?.gruntSound) || '';
      // Aura vermelha do chefe (identifica o perseguidor).
      const aura = new THREE.Mesh(new THREE.SphereGeometry(0.85, 14, 12), new THREE.MeshStandardMaterial({ color: 0xff3333, emissive: 0xcc0000, emissiveIntensity: 0.55, transparent: true, opacity: 0.35 }));
      aura.position.y = 0.6;
      bossSlime.root.add(aura);
    }

    // ---- PORTA DO BOSS (modo "monster_drop"): bloqueia o acesso ao chefe até ter a chave ----
    if (cfgBossKeyMode === 'monster_drop') {
      const bossDoorCell = (() => {
        const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
        for (const [dx, dz] of dirs) {
          const nx = grid.end.x + dx, nz = grid.end.z + dz;
          if (nx < 0 || nx >= COLS || nz < 0 || nz >= ROWS || grid.wall[nz][nx]) continue;
          if (nx === grid.start.x && nz === grid.start.z) continue;
          return { x: nx, z: nz };
        }
        return null;
      })();
      if (bossDoorCell) {
        const dm = makeDoorMesh({ id: 'boss_door', color: '#a16207' });
        dm.position.set(wx(bossDoorCell.x), 0, wz(bossDoorCell.z)); scene.add(dm);
        doors.push({ x: bossDoorCell.x, z: bossDoorCell.z, mesh: dm, open: false, hp: 999999, maxHp: 999999, def: 999999, typeId: 'boss_door' });
      }
    }

// ---- MURALHA ao redor do labirinto (não deixa ver o céu do jogo nas laterais) ----
    const ringH = Math.max(3.0, cfgWallHeight);
    const ringMat = new THREE.MeshStandardMaterial({ color: theme.wall });
    const addRing = (px: number, pz: number) => { const m = new THREE.Mesh(wallGeo, ringMat); m.position.set(px, ringH / 2, pz); m.scale.y = ringH / cfgWallHeight; scene.add(m); };
    for (let x = -COLS / 2 - 2; x <= COLS / 2 + 2; x++) { addRing(x, -ROWS / 2 - 2); addRing(x, ROWS / 2 + 2); }
    for (let z = -ROWS / 2 - 1; z <= ROWS / 2 + 1; z++) { addRing(-COLS / 2 - 2, z); addRing(COLS / 2 + 2, z); }

    // ---- CENÁRIO TEMÁTICO ao redor (fora do labirinto): florestas, pirâmides, vulcões, vilarejos... ----
    const rnd = (a: number, b: number) => a + Math.random() * (b - a);
    const propMat = (color: number, flat = true) => new THREE.MeshStandardMaterial({ color, flatShading: flat });
    const mkTree = (x: number, z: number, leafColor: number, snowy = false) => {
      const g = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 1.6, 6), propMat(0x6b4423, false));
      trunk.position.y = 0.8; g.add(trunk);
      const leaves = new THREE.Mesh(new THREE.ConeGeometry(1.0, 2.2, 7), propMat(leafColor));
      leaves.position.y = 2.2; g.add(leaves);
      if (snowy) { const cap = new THREE.Mesh(new THREE.ConeGeometry(0.85, 1.1, 7), propMat(0xf4faff)); cap.position.y = 2.6; g.add(cap); }
      g.position.set(x, 0, z); g.rotation.y = Math.random() * Math.PI; scene.add(g); return g;
    };
    // Cenário configurável: usa o .glb/imagem do tipo cadastrado em Moldes 3D → Cenário; senão o fallback.
    const placeScenery = (kind: string, x: number, z: number, fallback: () => THREE.Object3D): THREE.Object3D => {
      const tmpls = sceneryByKindRef.current.get(kind) || [];
      if (tmpls.length) {
        const pick = tmpls[Math.floor(Math.random() * tmpls.length)];
        const obj = pick.template.clone(true) as THREE.Object3D;
        obj.position.set(x, 0, z);
        obj.rotation.y = Math.random() * Math.PI * 2;
        const s = (pick.scale || 1) * (0.9 + Math.random() * 0.25);
        if ((obj as any).isSprite) obj.scale.set(s, s, 1); else obj.scale.setScalar(s);
        scene.add(obj);
        return obj;
      }
      return fallback();
    };
    const mkPillar = (x: number, z: number, color: number, h: number, w: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), propMat(color));
      m.position.set(x, h / 2, z); scene.add(m); return m;
    };
    const mkPyramid = (cx: number, cz: number) => {
      const h = rnd(6, 10); const m = new THREE.Mesh(new THREE.ConeGeometry(rnd(5, 7), h, 4), propMat(0xd9b26a));
      m.position.set(cx, h / 2, cz); m.rotation.y = Math.PI / 4; scene.add(m); return m;
    };
    const mkVillage = (cx: number, cz: number) => {
      const g = new THREE.Group();
      for (let i = 0; i < 4; i++) {
        const hx = cx + rnd(-5, 5), hz = cz + rnd(-5, 5), w = rnd(2.4, 3.6), hh = rnd(2, 3);
        const body = new THREE.Mesh(new THREE.BoxGeometry(w, hh, w), propMat(0xcaa472, false)); body.position.set(hx, hh / 2, hz); g.add(body);
        const roof = new THREE.Mesh(new THREE.ConeGeometry(w * 0.85, 1.4, 4), propMat(0x8b3a2b)); roof.position.set(hx, hh + 0.7, hz); roof.rotation.y = Math.PI / 4; g.add(roof);
      }
      scene.add(g); return g;
    };
    const mkScenery = (x: number, z: number) => {
      if (themeKey === 'desert') {
        if (Math.random() < 0.22) mkPillar(x, z, 0xd9b26a, rnd(2, 6), rnd(1.6, 3.2));
        else { const h = rnd(1.2, 2.6); const cactus = new THREE.Group(); const b = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, h, 6), propMat(0x3f8f3a)); b.position.y = h / 2; cactus.add(b); for (let a = 0; a < 2; a++) { const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, h * 0.5, 6), propMat(0x3f8f3a)); arm.position.set((a ? 1 : -1) * 0.34, h * 0.6, 0); arm.rotation.z = (a ? -1 : 1) * Math.PI / 3; cactus.add(arm); } cactus.position.set(x, 0, z); scene.add(cactus); }
      } else if (themeKey === 'nether') {
        const h = rnd(4, 9), r = rnd(1.4, 3);
        const v = new THREE.Mesh(new THREE.ConeGeometry(r, h, 8), propMat(0x3b2323)); v.position.set(x, h / 2, z); scene.add(v);
        const lava = new THREE.Mesh(new THREE.ConeGeometry(r * 0.4, h * 0.22, 8), new THREE.MeshStandardMaterial({ color: 0xff6a00, emissive: 0xff3b00, emissiveIntensity: 1.2 })); lava.position.set(x, h - h * 0.08, z); scene.add(lava);
      } else if (themeKey === 'tundra') {
        if (Math.random() < 0.65) placeScenery('tree', x, z, () => mkTree(x, z, 0x2f5d3a, true));
        else { const h = rnd(3, 8); const m = new THREE.Mesh(new THREE.ConeGeometry(rnd(1.3, 3), h, 5), propMat(0xeaf4ff)); m.position.set(x, h / 2, z); scene.add(m); }
      } else if (themeKey === 'end') {
        mkPillar(x, z, 0x2a2530, rnd(5, 12), rnd(0.8, 1.8));
      } else {
        if (Math.random() < 0.7) placeScenery('tree', x, z, () => mkTree(x, z, Math.random() < 0.5 ? 0x3e8f34 : 0x2f7a2a, false));
        else { const h = rnd(0.8, 2.0), w = rnd(1.4, 3); const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), propMat(0x4f9c3a)); m.position.set(x, h / 2, z); scene.add(m); }
      }
    };
    for (let i = 0; i < 140; i++) {
      const x = rnd(-70, 70), z = rnd(-70, 70);
      if (Math.abs(x) < COLS / 2 + 3 && Math.abs(z) < ROWS / 2 + 3) continue; // dentro do labirinto
      mkScenery(x, z);
    }
    // Estruturas marcantes por tema (pirâmides / vulcões / vilarejos / floresta densa / pilares).
    const ringR = Math.max(COLS, ROWS) / 2 + 13;
    if (themeKey === 'desert') { mkPyramid(-ringR, 0); mkPyramid(0, ringR); mkPyramid(ringR, -ringR * 0.5); }
    else if (themeKey === 'nether') { for (let k = 0; k < 4; k++) mkScenery(-60 + k * 40, ringR); }
    else if (themeKey === 'plains') { mkVillage(-(COLS / 2 + 15), -(ROWS / 2 + 15)); mkVillage(COLS / 2 + 17, ROWS / 2 + 11); }
    else if (themeKey === 'tundra') { for (let k = 0; k < 28; k++) mkTree(rnd(-72, 72), rnd(-72, 72), 0x2f5d3a, true); }
    else if (themeKey === 'end') { for (let k = 0; k < 16; k++) mkPillar(rnd(-72, 72), rnd(-72, 72), 0x2a2530, rnd(6, 14), rnd(1, 2.2)); }

    // ---- FLORA & PROPS INTERNOS (não bloqueiam; só em células livres) ----
    const occupiedCell = (gx: number, gz: number) => {
      if (gx < 1 || gz < 1 || gx >= COLS - 1 || gz >= ROWS - 1) return true;
      if (grid.wall[gz]?.[gx]) return true;
      if (gx === grid.start.x && gz === grid.start.z) return true;
      if (gx === grid.end.x && gz === grid.end.z) return true;
      if (rocks.some(r => r.x === gx && r.z === gz)) return true;
      if (chests.some((c: any) => c.x === gx && c.z === gz)) return true;
      if (slimes.some(s => s.x === gx && s.z === gz)) return true;
      if (doors.some((d: any) => d.x === gx && d.z === gz)) return true;
      return false;
    };
    const leafForTheme = themeKey === 'desert' ? 0x3f8f3a : themeKey === 'nether' ? 0x7a3b2a : themeKey === 'tundra' ? 0x2f5d3a : themeKey === 'end' ? 0x2a2530 : 0x3e8f34;
    const innerDensity = Math.min(0.22, 0.06 + cfgElaboration * 0.16);
    // Água (rio/lago): BLOCO inteiro (não é pintura no chão). Usa o .glb 'water' se houver.
    const waterTmpls = sceneryByKindRef.current.get('water') || [];
    const floorTmpls = sceneryByKindRef.current.get('floor') || [];
    const waterBlockH = waterTmpls[0]?.height || 1;
    const fillCellWith = (tmpl: any, gx: number, gz: number, hBlocks: number) => {
      const obj = tmpl.template.clone(true) as THREE.Object3D;
      const box = new THREE.Box3().setFromObject(obj); const size = new THREE.Vector3(); box.getSize(size);
      obj.scale.set(0.98 / Math.max(0.001, size.x), (hBlocks * 0.98) / Math.max(0.001, size.y), 0.98 / Math.max(0.001, size.z));
      obj.position.set(wx(gx), 0, wz(gz)); scene.add(obj);
    };
    const placeWaterBlock = (gx: number, gz: number) => {
      // Leito (modelo 'floor' cadastrado, se houver).
      if (floorTmpls.length) fillCellWith(floorTmpls[0], gx, gz, waterBlockH || 1);
      if (waterTmpls.length) { fillCellWith(waterTmpls[0], gx, gz, waterBlockH); return; }
      const w = new THREE.Mesh(new THREE.BoxGeometry(0.98, waterBlockH, 0.98), new THREE.MeshStandardMaterial({ color: 0x2b6cff, transparent: true, opacity: 0.6, emissive: 0x123a80, emissiveIntensity: 0.25, depthWrite: false }));
      w.position.set(wx(gx), (waterBlockH * 0.98) / 2, wz(gz)); scene.add(w);
    };
    if (themeKey === 'plains' || themeKey === 'tundra') {
      for (let z = 2; z < ROWS - 2; z += 1) {
        const riverX = Math.round(COLS / 2 + Math.sin(z * 0.6) * 3);
        for (let dx = -1; dx <= 1; dx++) {
          const gx = riverX + dx; if (gx < 1 || gx >= COLS - 1) continue;
          if (grid.wall[z]?.[gx]) continue;
          placeWaterBlock(gx, z);
        }
      }
    }
    // FLORA interna (árvore/arbusto/flor) — usa o .glb do tipo se cadastrado; senão fallback.
    const mkBushFallback = (cxw: number, czw: number, leafColor: number) => { const b = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), propMat(leafColor)); b.position.set(cxw, 0.28, czw); scene.add(b); return b; };
    const mkFlowerFallback = (cxw: number, czw: number) => { const fl = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 5), new THREE.MeshStandardMaterial({ color: [0xffd166, 0xff6b6b, 0x9b6bff, 0xffffff][Math.floor(Math.random() * 4)] })); fl.position.set(cxw + rnd(-0.3, 0.3), 0.12, czw + rnd(-0.3, 0.3)); scene.add(fl); return fl; };
    for (let z = 1; z < ROWS - 1; z++) for (let x = 1; x < COLS - 1; x++) {
      if (occupiedCell(x, z)) continue;
      if (Math.random() > innerDensity) continue;
      const cxw = wx(x), czw = wz(z), pick = Math.random();
      if (pick < 0.35) placeScenery('tree', cxw, czw, () => mkTree(cxw, czw, leafForTheme, themeKey === 'tundra'));
      else if (pick < 0.72) placeScenery('bush', cxw, czw, () => mkBushFallback(cxw, czw, leafForTheme));
      else placeScenery('flower', cxw, czw, () => mkFlowerFallback(cxw, czw));
    }

    // ---- FAUNA / ANIMAIS (entidades VIVAS: HP, hostilidade, fuga, drops) ----
    const animalTmpls = animalsRef.current || [];
    const critters: any[] = []; // (legado visual — agora os animais são entidades com IA)
    const spawnOneAnimal = (x: number, z: number) => {
      const a = animalTmpls.length ? animalTmpls[Math.floor(Math.random() * animalTmpls.length)] : null;
      const pseudo = {
        name: a?.name || 'Animal',
        isAnimal: true,
        config: {
          ...(a?.config || {}),
          customModelUrl: a?.url || '',
          customZoom: a?.scale || 1,
          gruntSound: a?.soundUrl || '',
          quotes: (a?.lines && a.lines.length) ? { hp100_80: a.lines[0], defeat: a.lines[a.lines.length - 1] } : undefined,
        },
      };
      addMonster(x, z, 6, undefined, pseudo);
    };
    let critPlaced = 0;
    for (let tries = 0; tries < 500 && critPlaced < 10; tries++) {
      const x = Math.floor(rnd(1, COLS - 1)), z = Math.floor(rnd(1, ROWS - 1));
      if (occupiedCell(x, z)) continue; spawnOneAnimal(x, z); critPlaced++;
    }

    // ---- Personagem 3D REAL (skinview3d) ----
    const playerRoot = new THREE.Group();
    const playerPos = { x: grid.start.x, z: grid.start.z };
    playerRoot.position.set(wx(playerPos.x), 0, wz(playerPos.z));
    scene.add(playerRoot);

    // ---- BALÃO DE DIÁLOGO 3D (usa o makeBubbleTexture do módulo) ----
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
    // Fala do MONSTRO (balão 3D acima da cabeça dele).
    const speakMonster = (s: any, kind: 'attack' | 'hurt' | 'defeat') => {
      if (!s || !s.bubble) return;
      try {
        const arr = MONSTER_LINES[kind];
        const text = arr[Math.floor(Math.random() * arr.length)];
        const { tex, w, h } = makeBubbleTexture(text);
        (s.bubble.material as any).map = tex; (s.bubble.material as any).needsUpdate = true;
        s.bubble.scale.set(w / 150, h / 150, 1);
        s.bubble.visible = true;
        s.bubbleUntil = performance.now() + (kind === 'defeat' ? 3500 : 1600);
      } catch { /* noop */ }
    };
    const viewer = new SkinViewer({ width: 200, height: 320, renderPaused: true });
    viewer.loadSkin('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=').catch(() => {});
    const loader = new GLTFLoader();
    const playerAnim = { current: new IdleAnimation() as any, name: 'idle' };
    // PICARETA DE DEBUG (tecla P): alterna espada/escudo ↔ picareta (25 de dano).
    let debugPickaxe = false;
    let debugPickaxeObj: any = null;
    const handModels: { model: any; part: string; isPickaxe: boolean }[] = [];
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
        // Normaliza a URL do skin (igual ao AvatarCharacter): sem esquema → https://.
        const rawSkin = (cfg as any).customSkinUrl || await generateMinecraftSkinUrl(cfg as any);
        const skinUrl = (rawSkin && !/^(https?:|data:|blob:)/i.test(rawSkin)) ? `https://${rawSkin}` : rawSkin;
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
        // Mapa id do item → modelo anexado à mão (para os slots trocarem corretamente).
        const handModelById = new Map<string, any>();
        const attach = (model: any, item: EquippedItem, record = true) => {
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
          if (['rightHand', 'leftHand', 'hand', 'two_handed', 'pickaxe'].includes(p)) {
            if (record) {
              const _isPick = String(item.avatarPart) === 'pickaxe' || /picareta|pickaxe/i.test(String((item as any).itemTitle || '')) || ['tool', 'pickaxe'].includes(String((item as any).itemCategory));
              handModels.push({ model, part: p, isPickaxe: _isPick }); handModelById.set(String((item as any).itemId || (item as any).docId || ''), model);
            }
          }
          if (['rightHand', 'leftHand', 'hand', 'two_handed', 'pickaxe'].includes(p)) {
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
        // ---- SLOTS DE MÃO: picaretas disponíveis (do PERFIL e da MOCHILA) ----
        {
          // Detecção AMPLA (igual ao resto do POC): avatarPart OU título/categoria.
          const isPick = (i: any) => String(i.avatarPart) === 'pickaxe' || /picareta|pickaxe/i.test(String(i.itemTitle || '')) || ['tool', 'pickaxe'].includes(String(i.itemCategory));
          const itemKey = (i: any) => String(i.itemId || i.docId || i.itemTitle || '');
          const profilePickaxe = items.find(isPick) || null;
          let profilePickaxeId = profilePickaxe ? itemKey(profilePickaxe) : '';
          let profilePickaxeModel = profilePickaxeId ? (handModelById.get(profilePickaxeId) || null) : null;
          // Se o perfil tem picareta mas o modelo não foi anexado (ex.: só imagem), anexa agora.
          if (profilePickaxe && !profilePickaxeModel) {
            const src = (profilePickaxe as any).gameModelUrl || profilePickaxe.imageUrl || '';
            const raw = src ? resolveItemUrl(src) : '';
            if (raw) {
              try {
                if (IMG_EXT_RE.test(raw.split('?')[0])) {
                  const t = resolveModelTransform(profilePickaxe, (cfg as any).gender, (cfg as any).handedness, false);
                  const m = await generateVoxelItemFromImage(raw, profilePickaxe.backColor, t?.curveX || 0, t?.curveY || 0, undefined, 0.12 * (t?.thickness ?? 1));
                  attach(m, profilePickaxe, true); profilePickaxeModel = m;
                } else {
                  await new Promise<void>((res) => loader.load(raw, (g: any) => { attach(g.scene, profilePickaxe, true); profilePickaxeModel = g.scene; res(); }, undefined, () => res()));
                }
              } catch { /* noop */ }
            }
          }
          // Sem modelo real do perfil, não oferece a picareta do perfil no slot.
          if (profilePickaxe && !profilePickaxeModel) profilePickaxeId = '';
          const bagPickaxes = handInventoryRef.current.filter(i => isPick(i) && itemKey(i) !== profilePickaxeId);
          const bagModels = new Map<string, any>();
          const opts: any[] = [];
          const pushOpt = (item: any) => opts.push({ id: itemKey(item), title: item.itemTitle || 'Picareta', imageUrl: item.imageUrl, isPickaxe: true, value: Math.max(1, Number(item.baseAttributeValue) || statsRef.current.attack) });
          if (profilePickaxe && profilePickaxeModel) pushOpt(profilePickaxe);
          for (const item of bagPickaxes) {
            const id = itemKey(item);
            if (!opts.some(o => o.id === id)) pushOpt(item);
            const src = item.gameModelUrl || item.imageUrl || '';
            const raw = src ? resolveItemUrl(src) : '';
            if (!raw) continue;
            try {
              if (IMG_EXT_RE.test(raw.split('?')[0])) {
                const t = resolveModelTransform(item, (cfg as any).gender, (cfg as any).handedness, false);
                const m = await generateVoxelItemFromImage(raw, item.backColor, t?.curveX || 0, t?.curveY || 0, undefined, 0.12 * (t?.thickness ?? 1));
                attach(m, item, false); m.visible = false; bagModels.set(id, m);
              } else {
                await new Promise<void>((res) => loader.load(raw, (g: any) => { const m = g.scene; attach(m, item, false); m.visible = false; bagModels.set(id, m); res(); }, undefined, () => res()));
              }
            } catch { /* noop */ }
          }
          handPickaxeOptions = opts;
          setHandOptions(opts);
          // Estado inicial COERENTE: se o perfil veio com picareta equipada, mostra a picareta e esconde a arma.
          if (profilePickaxe && profilePickaxeModel) {
            activePickaxeId = profilePickaxeId;
            activePickaxeValue = Math.max(1, Number((profilePickaxe as any).baseAttributeValue) || statsRef.current.attack);
            activePickaxeModel = profilePickaxeModel;
            setHandActiveId(profilePickaxeId);
            for (const h of handModels) h.model.visible = (h.model === profilePickaxeModel);
          }
          equipHandRef.current = (id: string | null) => {
            const picking = !!id;
            // Picareta é item de DUAS MÃOS: no modo picareta esconde arma E escudo do perfil.
            for (const h of handModels) h.model.visible = picking ? (h.isPickaxe && h.model === profilePickaxeModel) : !h.isPickaxe;
            if (picking && profilePickaxeModel && id === profilePickaxeId) profilePickaxeModel.visible = true;
            bagModels.forEach((m, mid) => { m.visible = picking && mid === id; });
            activePickaxeId = picking ? id : null;
            activePickaxeValue = picking ? (opts.find(o => o.id === id)?.value || 0) : 0;
            activePickaxeModel = picking ? ((id === profilePickaxeId ? profilePickaxeModel : bagModels.get(id as string)) || null) : null;
            debugPickaxe = false;
            setHandActiveId(id);
            callbacks.current.setMsg(picking ? `⛏️ Equipou: ${opts.find(o => o.id === id)?.title || 'picareta'}` : '⚔️ Voltou para a arma.');
            if (firstPerson) buildFpWeapon(true);
          };
        }
        callbacks.current.setMsg('✅ Personagem 3D carregado! Explore o mapa até o BOSS.');
      } catch (e) { console.warn('[MapPoC] player:', e); }
    })();

    // ---- Teclado ----
    const keys = new Set<string>();
    // Arma principal equipada → efeito especial (ex.: veneno/sangramento) e dano.
    const weapon: any = playerItems.find(i => ['rightHand', 'leftHand', 'hand', 'two_handed'].includes(String(i.avatarPart)) && String(i.avatarPart) !== 'pickaxe' && i.itemCategory !== 'defense');
    // Efeito especial da ARMA equipada (via ADD de efeito, como na batalha — não o campo legado).
    const weaponEffectInfo = getEquippedDamageEffectInfo(playerItems as any[]);
    const weaponEffect: string | null = weaponEffectInfo.effect && weaponEffectInfo.effect !== 'none' ? weaponEffectInfo.effect : null;
    const weaponEffectChance = (weaponEffectInfo.chance || 0) / 100;
// PICARETA equipada (quebra rochas). Força = atributo base dela (ou o ataque do jogador).
    const pickaxe: any = playerItems.find(i => String(i.avatarPart) === 'pickaxe' || /picareta|pickaxe/i.test(String(i.itemTitle || '')) || ['tool', 'pickaxe'].includes(String(i.itemCategory)));
    const pickaxePower = pickaxe ? Math.max(1, Number(pickaxe.baseAttributeValue) || statsRef.current.attack) : 0;
    // A picareta REAL (item do inventário) tem prioridade; a DEBUG é só fallback p/ testar sem item.
    const hasRealPickaxe = pickaxePower > 0;
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
      // Picareta de DEBUG é EXCLUSIVA de staff: alunos nunca usam.
      if (!canDebugPickaxe || hasRealPickaxe) on = false;
      debugPickaxe = on;
      for (const h of handModels) h.model.visible = !on;
      const playerObj = viewer.playerObject as any;
      if (on) {
        if (!debugPickaxeObj) debugPickaxeObj = makeDebugPickaxe();
        activePickaxeModel = debugPickaxeObj;
        const arm = playerObj?.skin?.rightArm; if (!arm) return;
        // Na MÃO (fim do braço) e apontando para frente, como a arma equipada.
        debugPickaxeObj.position.set(0, -12, 0); debugPickaxeObj.rotation.set(Math.PI / 2, 0, 0); debugPickaxeObj.scale.setScalar(1);
        arm.add(debugPickaxeObj);
        callbacks.current.setMsg('⛏️ Picareta de DEBUG equipada (fallback — você não tem picareta no inventário).');
      } else {
        if (debugPickaxeObj && debugPickaxeObj.parent) debugPickaxeObj.parent.remove(debugPickaxeObj);
        if (!activePickaxeId) activePickaxeModel = null;
        callbacks.current.setMsg(hasRealPickaxe ? '⛏️ Picareta do inventário equipada.' : '⚔️ Voltou para a espada e o escudo.');
      }
      // Reconstroi o item da 1ª pessoa (espada ↔ picareta).
      if (firstPerson) buildFpWeapon(true);
    };
    // Força efetiva: PICARETA real ATIVA (perfil/mochila) tem prioridade; debug só p/ staff sem picareta.
    let activePickaxeValue = hasRealPickaxe ? pickaxePower : 0;
    let activePickaxeId: string | null = null;
    let activePickaxeModel: any = null;
    let handPickaxeOptions: any[] = [];
    const pickaxeActivePower = () => (activePickaxeValue > 0 ? activePickaxeValue : ((canDebugPickaxe && debugPickaxe) ? DEBUG_PICKAXE_DMG : 0));
    const pickDamage = () => pickaxeActivePower();
    // Dano a um QUEBRÁVEL: precisa vencer a defesa; o excedente + poder de ataque vira dano.
    const breakDamage = (def: number): number => {
      const pd = pickDamage();
      if (pd <= def) return 0;
      return (pd - def) + statsRef.current.attack;
    };
    // Pickups de ITEM do catálogo / CHAVE do cenário (passar por cima coleta).
    type LootPickup = { x: number; z: number; spr: THREE.Sprite; kind: 'item' | 'key'; data: any; taken: boolean; born: number; highlight: boolean };
    const lootPickups: LootPickup[] = [];
    // Anéis de destaque (loot que sai do baú) — pulsam no chão e desaparecem.
    const lootRings: { mesh: THREE.Mesh; born: number }[] = [];
    const spawnHighlightRing = (wpos: THREE.Vector3) => {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false });
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.72, 28), mat);
      ring.rotation.x = -Math.PI / 2; ring.position.set(wpos.x, 0.06, wpos.z); scene.add(ring);
      lootRings.push({ mesh: ring, born: performance.now() });
    };
    // Chaves coletadas nesta exploração (abrem portas "chave").
    const heldKeys = new Set<string>();
    const spawnLootPickup = (gx: number, gz: number, kind: 'item' | 'key', data: any, fallbackColor = 0xffd34d, highlight = false) => {
      const mat = new THREE.SpriteMaterial({ color: 0xffffff, transparent: true });
      if (data.imageUrl) {
        new THREE.TextureLoader().load(data.imageUrl, (t) => {
          t.colorSpace = THREE.SRGBColorSpace;
          mat.map = t; mat.needsUpdate = true;
        }, undefined, () => { mat.color.set(fallbackColor); });
      } else mat.color.set(fallbackColor);
      const spr = new THREE.Sprite(mat);
      spr.scale.set(0.65, 0.65, 1);
      spr.position.set(wx(gx), 0.75, wz(gz));
      scene.add(spr);
      lootPickups.push({ x: gx, z: gz, spr, kind, data, taken: false, born: performance.now(), highlight });
      if (highlight) spawnHighlightRing(spr.position);
    };
    const collectPickup = (p: LootPickup) => {
      const world = new THREE.Vector3(wx(p.x), 0.8, wz(p.z));
      if (p.kind === 'key') {
        heldKeys.add(String(p.data.id));
        setHeldKeysCount(heldKeys.size);
        spawnPop(world, '🔑', false);
        callbacks.current.setMsg(`🔑 Chave coletada: ${p.data.name}!`);
        return;
      }
      const eff = p.data.gameEffect || 'none';
      if (eff === 'heal_1_hp' || eff === 'restore_hp') {
        const amt = eff === 'restore_hp' ? Math.max(1, Number(p.data.healAmount) || 5) : 1;
        useConsumableRef.current(amt);
        spawnPop(world, `+${amt} ❤️`, false);
        callbacks.current.setMsg(`💖 ${p.data.title} restaurou ${amt} ❤️!`);
      } else {
        const studentId = userData?.uid;
        spawnPop(world, p.data.title || 'Item', false);
        if (studentId) {
          supabase.from('user_items').insert({ student_id: studentId, item_id: p.data.id, equipped: false, data: {} })
            .then(() => callbacks.current.setMsg(`🎒 Item coletado: ${p.data.title}!`))
            .catch(() => callbacks.current.setMsg(`🎒 ${p.data.title} coletado!`));
        } else callbacks.current.setMsg(`🎒 ${p.data.title} coletado!`);
      }
    };
    // LOOT ao quebrar (linkado ao catálogo + moeda ativa + chaves do cenário).
    const dropLoot = (gx: number, gz: number, typeId?: string) => {
      const world = new THREE.Vector3(wx(gx), 1.2, wz(gz));
      // Drops próprios do TIPO de parede (se configurado); senão a tabela do cenário.
      const wt: any = typeId ? cfgWallTypes.find((w: any) => w.id === typeId) : null;
      const table: any[] = (wt?.drops && wt.drops.length) ? wt.drops : cfgLoot;
      const total = table.reduce((s, e) => s + Math.max(0, Number(e.weight) || 0), 0);
      let r = Math.random() * (total || 1);
      let drop = table[table.length - 1];
      for (const e of table) { r -= Math.max(0, Number(e.weight) || 0); if (r <= 0) { drop = e; break; } }
      if (drop.kind === 'coins') { const min = Number(drop.min) || 1, max = Number(drop.max) || 10; const v = min + Math.floor(Math.random() * (max - min + 1)); callbacks.current.setCoins(n => n + v); spawnPop(world, `+${v} 🪙`, false, 'coin'); }
      else if (drop.kind === 'item') {
        const item = itemCatalogRef.current.get(String(drop.itemId || ''));
        if (!item) { callbacks.current.setMsg('… o bloco não guardava nada.'); return; }
        spawnLootPickup(gx, gz, 'item', item);
        callbacks.current.setMsg(`💥 O bloco soltou: ${item.title}!`);
      }
      else if (drop.kind === 'key') {
        const key = cfgKeys.find((k: any) => k.id === drop.keyId);
        if (!key) { callbacks.current.setMsg('… o bloco não guardava nada.'); return; }
        spawnLootPickup(gx, gz, 'key', key, 0xfbbf24);
        callbacks.current.setMsg(`💥 O bloco soltou uma chave: ${key.name}!`);
      }
      else callbacks.current.setMsg('… o bloco não guardava nada.');
      // Monstros que ESTE tipo de parede solta ao ser quebrada.
      const mids: string[] = Array.isArray(wt?.spawnMonsterIds) ? wt.spawnMonsterIds.filter(Boolean) : [];
      if (mids.length) {
        let placed = 0;
        for (let rad = 1; rad <= 3 && placed < mids.length; rad++) {
          for (let dz = -rad; dz <= rad && placed < mids.length; dz++) for (let dx = -rad; dx <= rad && placed < mids.length; dx++) {
            if (Math.abs(dx) !== rad && Math.abs(dz) !== rad) continue;
            const cx = gx + dx, cz = gz + dz;
            if (wallAt(cx, cz)) continue;
            if (rocks.some(rr => rr.x === cx && rr.z === cz)) continue;
            if (doors.some(dd => dd.x === cx && dd.z === cz && dd.mesh.visible)) continue;
            addMonster(cx, cz, undefined, mids[placed]); placed++;
          }
        }
        callbacks.current.setMsg('💥 O bloco estava oco… e soltou monstros!');
      }
    };
    // Solta a CHAVE DO BOSS quando o monstro portador morre.
    const spawnBossKey = (s: { x: number; z: number }) => {
      spawnLootPickup(s.x, s.z, 'key', { id: 'boss_key', name: 'Chave do Boss', imageUrl: '' }, 0xfbbf24);
      callbacks.current.setMsg('🔑 A Chave do BOSS caiu! Pegue e abra a porta do chefe!');
    };
    let playerBleedUntil = 0; let playerBleedTick = 0;
    let playerHurtUntil = 0;
    let playerHeartsRun = statsRef.current.startHearts;
    // Estresse do personagem (0-1): sobe ao sofrer dano e cai com o tempo parado.
    // Usado para escolher falas coerentes — fora de ação o estresse zera e o
    // personagem para de falar como se ainda estivesse em batalha.
    let stressRun = 0;
    // Balões de diálogo: fala SÓ em momentos com nexo (dano, crítico, derrota de
    // monstro). Em golpes normais, respeita o estresse atual (que decai parado).
    const maybeSpeak = (event?: 'critical' | 'hurt' | 'victory') => {
      const q = quotesRef.current; if (!q) return;
      const hpPct = statsRef.current.maxHearts ? (playerHeartsRun / statsRef.current.maxHearts) * 100 : 100;
      const text = pickPlayerBattleQuote(q, hpPct, Math.max(0, Math.min(1, stressRun)), event || null);
      if (text) speakBubble(text);
    };
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
    const playMonsterHurtSound = (s?: any) => playFx((s && (s.damageSound || '')) || battleSoundsRef.current.punch, 0.8);
    const playerGender = (cfgRef.current as any)?.gender;
    const playPlayerHurtSound = () => playFx(playerGender === 'female' ? playerDamageSoundsRef.current.female : playerDamageSoundsRef.current.male, 0.8);
    // Abre/interage com uma PORTA conforme o modo configurado (livre / chave / desafio).
    const handleDoor = (door: any) => {
      // Porta do BOSS: exige a chave que cai de um monstro do mapa.
      if (door.typeId === 'boss_door') {
        if (heldKeys.has('boss_key')) {
          heldKeys.delete('boss_key');
          setHeldKeysCount(heldKeys.size);
          openDoorRef.current(door.x, door.z);
          callbacks.current.setMsg('🔑 A Chave do Boss abriu a porta! Encare o chefe!');
        } else callbacks.current.setMsg('🔑 Porta do BOSS TRANCADA! Derrote o monstro que carrega a chave.');
        return;
      }
      const type = cfgDoorTypes.find((t: any) => t.id === door.typeId) || cfgDoor;
      const mode = type.openMode || 'challenge';
      const challengeChance = type.challengeChance === undefined ? 1 : Number(type.challengeChance);
      if (mode === 'free') { openDoorRef.current(door.x, door.z); callbacks.current.setMsg('🚪 A porta abriu!'); return; }
      if (mode === 'key') {
        const keyId = String(type.keyItemId || '');
        if (keyId && heldKeys.has(keyId)) {
          heldKeys.delete(keyId);
          setHeldKeysCount(heldKeys.size);
          openDoorRef.current(door.x, door.z);
          callbacks.current.setMsg('🔑 Você usou a chave e a porta abriu!');
        } else if (keyId && ownedItemIdsRef.current.has(keyId)) {
          openDoorRef.current(door.x, door.z);
          callbacks.current.setMsg('🔑 Você usou a chave e a porta abriu!');
        } else callbacks.current.setMsg(`🔑 Esta porta precisa da chave "${keyId}" que você ainda não possui.`);
        return;
      }
      if (Math.random() >= challengeChance) { openDoorRef.current(door.x, door.z); callbacks.current.setMsg('🚪 A porta cedeu sem desafio!'); return; }
      playFx(doorSoundsRef.current.locked || battleSoundsRef.current.punch, 0.8);
      askDoorRef.current(door.x, door.z);
    };
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
      stressRun = Math.min(1, stressRun + 0.4);
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
      // Picareta ATIVA (perfil/mochila) tem prioridade na 1ª pessoa.
      if (activePickaxeModel) { try { addFpModel(activePickaxeModel); return; } catch { /* noop */ } }
      // Senão, a arma da mão (excluindo picaretas).
      const wm = handModels.find(h => !h.isPickaxe && ['rightHand', 'leftHand', 'hand', 'two_handed'].includes(h.part)) || handModels.find(h => !h.isPickaxe) || null;
      if (wm?.model) { try { addFpModel(wm.model); return; } catch { /* noop */ } }
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.7, 0.05), new THREE.MeshStandardMaterial({ color: 0xcfd8e3, metalness: 0.8, roughness: 0.25 }));
      blade.position.y = 0.35; viewModel.add(blade);
    };

    // Botão/slot de picareta (desktop e mobile) alterna arma ↔ picareta.
    pickaxeToggleRef.current = () => {
      // Preferência: PICARETA real (perfil/mochila). Sem nenhuma → fallback de debug (só staff).
      if (handPickaxeOptions.length > 0) { equipHandRef.current(activePickaxeId ? null : handPickaxeOptions[0].id); return; }
      setDebugPickaxe(!debugPickaxe);
    };

    // Abre um BAÚ aplicando o LOOT configurado no cenário (ou moedas 1..10 no padrão).
    const rollEntry = (table: any[]) => {
      const total = table.reduce((s, e) => s + Math.max(0, Number(e.weight) || 0), 0) || 1;
      let r = Math.random() * total; let pick = table[table.length - 1];
      for (const e of table) { r -= Math.max(0, Number(e.weight) || 0); if (r <= 0) { pick = e; break; } }
      return pick;
    };
    const applyEntry = (entry: any, world: THREE.Vector3, highlight = false): string => {
      const kind = entry?.kind;
      if (kind === 'coins') { const min = Number(entry.min) || 1, max = Number(entry.max) || 10; const v = min + Math.floor(Math.random() * (max - min + 1)); callbacks.current.setCoins(n => n + v); spawnPop(world, `+${v} 🪙`, false, 'coin'); if (highlight) spawnHighlightRing(world); return `+${v} 🪙`; }
      if (kind === 'item') { const item = itemCatalogRef.current.get(String(entry.itemId)) || Array.from(itemCatalogRef.current.values())[0]; if (item) { spawnLootPickup(Math.round(playerPos.x), Math.round(playerPos.z), 'item', item, 0xffd34d, highlight); return `📦 ${item.title || 'item'}`; } return '📦 item'; }
      return '';
    };
    const openChest = (chest: any) => {
      chest.mesh.visible = false; scene.remove(chest.mesh);
      playFx(chestConfigRef.current?.chestAudioUrl || battleSoundsRef.current.punch, 0.85);
      const world = new THREE.Vector3(wx(chest.x), 1.0, wz(chest.z));
      const table = (Array.isArray(cfgChestConfig.loot) && cfgChestConfig.loot.length) ? cfgChestConfig.loot : null;
      if (table) { const got = applyEntry(rollEntry(table), world, true); callbacks.current.setMsg(`🎁 Baú aberto! ${got}`.trim()); }
      else { const v = 1 + Math.floor(Math.random() * 10); callbacks.current.setCoins(n => n + v); spawnPop(world, `+${v} 🪙`, false, 'coin'); spawnHighlightRing(world); callbacks.current.setMsg(`🎁 Baú aberto! +${v} 🪙`); }
    };

    // Interação por TOQUE/CLIQUE (mobile): porta/baú ou alterna a picareta.
    interactRef.current = () => {
      const gx = Math.round(playerPos.x), gz = Math.round(playerPos.z);
      const door = doors.find(d => d.mesh.visible && Math.abs(d.x - gx) + Math.abs(d.z - gz) <= 1);
      if (door) { handleDoor(door); return; }
      const chest = chests.find(c => c.mesh.visible && Math.abs(c.x - gx) + Math.abs(c.z - gz) <= 1);
      if (chest) { openChest(chest); return; }
      const breakNear = rocks.some(r => r.hp > 0 && r.mesh.visible && Math.hypot(wx(r.x) - wx(gx), wz(r.z) - wz(gz)) <= 1.4)
        || hazards.some(h => h.hp > 0 && h.mesh.visible && Math.hypot(wx(h.x) - wx(gx), wz(h.z) - wz(gz)) <= 1.4)
        || doors.some(d => d.hp > 0 && d.mesh.visible && Math.hypot(wx(d.x) - wx(gx), wz(d.z) - wz(gz)) <= 1.4);
        if (breakNear || IS_TOUCH) pickaxeToggleRef.current();
    };

    // Ataque (Espaço no desktop, botão ⚔️ no mobile). Um ataque por ciclo.
    const doAttack = () => {
      const now = performance.now();
      if (now < nextAttackAt) return;
      if (staminaRun < ATTACK_COST) { callbacks.current.setMsg('😮‍💨 Exausto! Pare um instante para recuperar o vigor.'); return; }
      nextAttackAt = now + ATTACK_MS;
      staminaRun = Math.max(0, staminaRun - ATTACK_COST);
      callbacks.current.setStamina(staminaRun);
      restartAttack();
      playSword(false); // som da espada em TODO ataque (mesmo errando)
      const pwx = wx(playerPos.x), pwz = wz(playerPos.z);
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
        if ((target as any).isBoss) {
          playMonsterHurtSound(target);
          spawnPop(new THREE.Vector3(target.root.position.x, target.root.position.y + 1.5, target.root.position.z), 'BLOQUEADO!', false);
          callbacks.current.setMsg('⚔️ O chefe é implacável — ele não cai por golpes. Deixe-o te alcançar para iniciar a batalha!');
          return;
        }
        target.hp -= roll.damage;
        flashMonster(target); playMonsterHurtSound(target); speakMonster(target, 'hurt');
        { const kdx = target.root.position.x - pwx, kdz = target.root.position.z - pwz; const kd = Math.hypot(kdx, kdz) || 1; target.kb = 0.2; target.kbx = kdx / kd; target.kbz = kdz / kd; }
        if (weaponEffect && !debugPickaxe && Math.random() < weaponEffectChance) {
          if (['poison', 'bleed', 'burn', 'electric', 'freeze'].includes(weaponEffect)) applyStatus(target, weaponEffect as any);
        }
        spawnPop(new THREE.Vector3(target.root.position.x, target.root.position.y + 1.5, target.root.position.z), `-${roll.damage}`, roll.isCritical);
        maybeSpeak(roll.isCritical ? 'critical' : undefined);
        callbacks.current.setMsg(`${roll.isCritical ? '💥 CRÍTICO! ' : '⚔️ '}Acertou o monstro! -${roll.damage} HP${weaponEffect ? ` (${weaponEffect})` : ''}`);
        if (target.hp <= 0) { callbacks.current.setMsg(target.isAnimal ? '💥 Animal abatido!' : '💥 Monstro derrotado!'); callbacks.current.setCoins(n => n + 5); target.root.visible = false; if (target.label) target.label.visible = false; recordMonsterKill(target); rollMonsterDrops(target); if ((target as any).isKeyHolder) spawnBossKey(target); maybeSpeak('victory'); }
        return;
      }
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
        if (tgt.kind === 'wall' && tgt.obj.breakable === false) { callbacks.current.setMsg('🧱 Este tipo de parede é INDESTRUTÍVEL.'); return; }
        if (!pickaxeActivePower()) { callbacks.current.setMsg(hasRealPickaxe ? '⛏️ Sua picareta é fraca demais para quebrar isso.' : '⛏️ Você precisa equipar uma PICARETA para quebrar isso (tecla P).'); return; }
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
          dropLoot(tgt.gx, tgt.gz, (tgt.obj as any)?.typeId);
          callbacks.current.setMsg('💥 Bloco quebrado!');
          if (tgt.kind === 'wall' && Math.random() < (Number(tgt.obj.trap) || 0)) {
            if (Math.random() < 0.5) { const fb = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), new THREE.MeshStandardMaterial({ color: parseInt(theme.wall.replace('#', ''), 16) })); fb.position.set(wx(Math.round(playerPos.x)), 6, wz(Math.round(playerPos.z))); debrisGroup.add(fb); debris.push({ mesh: fb, vx: 0, vy: -2, vz: 0, life: 1.1, spin: 0.15 }); hurtPlayer(1, '🪨 A parede desabou sobre você! -1 ❤️'); }
            else { addMonster(tgt.gx, tgt.gz, 10); callbacks.current.setMsg('👾 Um monstro emergiu da parede!'); }
          }
        } else {
          if (tgt.kind === 'wall') {
            const ratio = tgt.obj.hp / tgt.obj.maxHp;
            applyWallMaterial(tgt.obj.mesh, wallTypeById(tgt.obj.typeId), ratio < 0.4 ? 3 : ratio < 0.7 ? 2 : 1);
          }
          callbacks.current.setMsg(`⛏️ Rachou! -${dmg} (resta ${Math.round(tgt.obj.hp)}/${Math.round(tgt.obj.maxHp)})`);
        }
        return;
      }
    };
    attackActionRef.current = doAttack;
    fpToggleRef.current = () => {
      firstPerson = !firstPerson;
      if (firstPerson) buildFpWeapon();
      callbacks.current.setMsg(firstPerson ? '👁️ Visão em 1ª pessoa (botão novamente para voltar).' : '🎥 Visão em 3ª pessoa.');
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
      if (k === 'p') { pickaxeToggleRef.current(); return; }
      // V: alterna 3ª ↔ 1ª pessoa.
      if (k === 'v') { firstPerson = !firstPerson; if (firstPerson) buildFpWeapon(); callbacks.current.setMsg(firstPerson ? '👁️ Visão em 1ª pessoa (V para voltar).' : '🎥 Visão em 3ª pessoa.'); return; }
if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
      // O ataque agora vive em `doAttack` (compartilhado com o botão mobile).
      if (k === ' ') { doAttack(); }
      else if (false) {
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
          // CHEFE não cai por golpes: só o CONTATO inicia a batalha.
if ((target as any).isBoss) {
            playMonsterHurtSound(target);
            spawnPop(new THREE.Vector3(target.root.position.x, target.root.position.y + 1.5, target.root.position.z), 'BLOQUEADO!', false);
            callbacks.current.setMsg('⚔️ O chefe é implacável — ele não cai por golpes. Deixe-o te alcançar para iniciar a batalha!');
            return;
          }
          target.hp -= roll.damage;
          flashMonster(target); playMonsterHurtSound(target);
          // RECUO do monstro (animação de hurt indo para trás, afastando do jogador).
          { const kdx = target.root.position.x - pwx, kdz = target.root.position.z - pwz; const kd = Math.hypot(kdx, kdz) || 1; target.kb = 0.2; target.kbx = kdx / kd; target.kbz = kdz / kd; }
          if (weaponEffect && !debugPickaxe && Math.random() < weaponEffectChance) {
            if (['poison', 'bleed', 'burn', 'electric', 'freeze'].includes(weaponEffect)) applyStatus(target, weaponEffect as any);
          }
        // Animal atacado: chance de FICAR HOSTIL (a barra vira vermelha e ele revida).
        if (target.isAnimal && !target.hostile) {
          const hc = Number(target.hostileChance) || 0;
          if (Math.random() < hc) {
            target.hostile = true;
            (target.fg.material as THREE.MeshBasicMaterial).color.set(0xdd3333);
            callbacks.current.setMsg(`😠 O ${target.name || 'animal'} ficou HOSTIL!`);
          }
        }
        spawnPop(new THREE.Vector3(target.root.position.x, target.root.position.y + 1.5, target.root.position.z), `-${roll.damage}`, roll.isCritical);
          maybeSpeak(roll.isCritical ? 'critical' : undefined);
          callbacks.current.setMsg(`${roll.isCritical ? '💥 CRÍTICO! ' : '⚔️ '}Acertou o monstro! -${roll.damage} HP${weaponEffect ? ` (${weaponEffect})` : ''}`);
        if (target.hp <= 0) { callbacks.current.setMsg('💥 Monstro derrotado!'); callbacks.current.setCoins(n => n + 5); speakMonster(target, 'defeat'); target.root.visible = false; recordMonsterKill(target); rollMonsterDrops(target); if ((target as any).isKeyHolder) spawnBossKey(target); maybeSpeak('victory'); }
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
          if (tgt.kind === 'wall' && tgt.obj.breakable === false) { callbacks.current.setMsg('🧱 Este tipo de parede é INDESTRUTÍVEL.'); return; }
          if (!pickaxeActivePower()) { callbacks.current.setMsg(hasRealPickaxe ? '⛏️ Sua picareta é fraca demais para quebrar isso.' : '⛏️ Você precisa equipar uma PICARETA para quebrar isso (tecla P).'); return; }
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
            dropLoot(tgt.gx, tgt.gz, (tgt.obj as any)?.typeId);
            callbacks.current.setMsg('💥 Bloco quebrado!');
            // ARMADILHA: chance de a parede "revidar" ao ser quebrada.
            if (tgt.kind === 'wall' && Math.random() < (Number(tgt.obj.trap) || 0)) {
              if (Math.random() < 0.5) { const fb = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), new THREE.MeshStandardMaterial({ color: parseInt(theme.wall.replace('#', ''), 16) })); fb.position.set(wx(Math.round(playerPos.x)), 6, wz(Math.round(playerPos.z))); debrisGroup.add(fb); debris.push({ mesh: fb, vx: 0, vy: -2, vz: 0, life: 1.1, spin: 0.15 }); hurtPlayer(1, '🪨 A parede desabou sobre você! -1 ❤️'); }
              else { addMonster(tgt.gx, tgt.gz, 10); callbacks.current.setMsg('👾 Um monstro emergiu da parede!'); }
            }
          } else {
            if (tgt.kind === 'wall') {
              const ratio = tgt.obj.hp / tgt.obj.maxHp;
              applyWallMaterial(tgt.obj.mesh, wallTypeById(tgt.obj.typeId), ratio < 0.4 ? 3 : ratio < 0.7 ? 2 : 1);
            }
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
        if (door) { handleDoor(door); return; }
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
      // O joystick virtual (mobile) soma no mesmo eixo.
      const joyV = joyRef.current;
      const fw = ((keys.has('w') || keys.has('arrowup') ? 1 : 0) - (keys.has('s') || keys.has('arrowdown') ? 1 : 0)) + (joyV.y || 0);
      const st = ((keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0)) + (joyV.x || 0);
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
// Pickup de item do catálogo: passar por cima coleta (cura se for item de cura).
        for (const p of lootPickups) {
          if (p.taken) continue;
          if (p.x === gx && p.z === gz) { p.taken = true; scene.remove(p.spr); collectPickup(p); }
        }
        // (Baús NÃO abrem mais ao passar por cima — abrem com a tecla E.)
const hz = hazards.find(h => h.x === gx && h.z === gz);
        if (hz && explored.has(ck)) { callbacks.current.setMsg(`💥 Perigo: ${theme.hazardLabel}!`); if (theme.fatal) { callbacks.current.setDead(true); disposed = true; } }
      }
      // Animação: ataque (espaço) > hurt > andar > parado
      if (performance.now() < attackUntil) setPlayerAnim('attack');
      else if (performance.now() < playerHurtUntil) setPlayerAnim('hurt');
      else if (moving) setPlayerAnim('walk');
      else setPlayerAnim('idle');
      playerRoot.position.set(wx(playerPos.x), 0, wz(playerPos.z));
      // Balão de diálogo: esconde ao expirar. SEM fala ociosa aleatória (evita balões sem
      // nexo com o personagem parado). O estresse decai com o tempo fora de ação.
      if (bubble.visible && performance.now() > bubbleUntil) bubble.visible = false;
      stressRun = Math.max(0, stressRun - dt * 0.06);
      // VIGOR (barra de exaustão): regenera quando parado/não atacando (enche aos poucos).
      if (performance.now() >= attackUntil && staminaRun < 100) {
        staminaRun = Math.min(100, staminaRun + dt * 22);
        callbacks.current.setStamina(staminaRun);
      }
      // As moedas giram (mostrando a arte da moeda padrão ativa).
      for (const c of coinsList) if (c.mesh.visible) c.mesh.rotation.y += dt * 2.4;
// Monstros: IA (visão → persegue por CAMINHO → bote) + barras de HP
      // Durante o TUTORIAL de 1ª visita, os monstros ficam PASSIVOS (só vagam, não atacam).
      const tutorialBlock = tutorialActiveRef.current;
      for (const s of slimes) {
        // Balão de fala do monstro (posiciona acima da cabeça e some ao expirar).
        if (s.bubble) {
          if (performance.now() < (s.bubbleUntil || 0)) { s.bubble.position.set(s.root.position.x, s.bubbleY || 1.95, s.root.position.z); s.bubble.visible = true; }
          else if (s.bubble.visible) s.bubble.visible = false;
        }
        if (s.hp <= 0) { s.root.visible = false; s.bar.visible = false; if (s.statusBar) s.statusBar.g.visible = false; if (s.label) s.label.visible = false; continue; }
        if (s.label) s.label.position.set(s.root.position.x, s.labelY || 2.25, s.root.position.z);
        // Animal pacífico NÃO ataca: vagueia e foge do perto; só fica hostil se for atacado.
        const isPeacefulAnimal = !!s.isAnimal && !s.hostile;
        const dxp = wx(playerPos.x) - s.root.position.x;
        const dzp = wz(playerPos.z) - s.root.position.z;
        const dist = Math.hypot(dxp, dzp);
        const nowMs = performance.now();
        const frozenNow = s.status?.type === 'freeze' && nowMs < s.status.until;
        // O monstro só AGGRO o jogador com LINHA DE VISÃO (nada de ver através de portas/muros).
        const sg0x = Math.round(s.root.position.x + (COLS - 1) / 2), sg0z = Math.round(s.root.position.z + (ROWS - 1) / 2);
const canSee = dist < s.vision && losClear(sg0x, sg0z, Math.round(playerPos.x), Math.round(playerPos.z));
        if (!tutorialBlock && canSee && !isPeacefulAnimal) {
          // GRUNIDO: toca o som configurado do monstro na 1ª vez que ele vê o jogador.
          if (!s.hasGruntted && s.gruntUrl) { s.hasGruntted = true; playFx(s.gruntUrl, 0.8); }
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
            const sp = 3.0 * (frozenNow ? 0.25 : 1); // congelado → muito mais lento
            const mx = s.root.position.x + (ddx / dd) * sp * dt;
            if (!mBlocked(s, mx, s.root.position.z)) s.root.position.x = mx;
            const mz = s.root.position.z + (ddz / dd) * sp * dt;
            if (!mBlocked(s, s.root.position.x, mz)) s.root.position.z = mz;
          }
// BOTE (pulo): ataca SALtando em direção ao jogador (não por contato).
          s.attackCd -= dt;
          if (!frozenNow && dist >= 0.6 && dist <= 2.6 && s.attackCd <= 0 && s.lunge <= 0) {
            const sgx = Math.round(s.root.position.x + (COLS - 1) / 2), sgz = Math.round(s.root.position.z + (ROWS - 1) / 2);
            if (losClear(sgx, sgz, Math.round(playerPos.x), Math.round(playerPos.z))) { s.lunge = 0.42; s.lungeHit = false; }
          }
        } else if (isPeacefulAnimal && dist < 3.4) {
          // Animal pacífico FOGE quando o jogador chega perto.
          const dirX = -dxp / (dist || 1), dirZ = -dzp / (dist || 1);
          const sp = 2.4 * (frozenNow ? 0.25 : 1);
          const mx = s.root.position.x + dirX * sp * dt;
          if (!mBlocked(s, mx, s.root.position.z)) s.root.position.x = mx;
          const mz = s.root.position.z + dirZ * sp * dt;
          if (!mBlocked(s, s.root.position.x, mz)) s.root.position.z = mz;
        } else {
          s.t -= dt;
          if (s.t <= 0) { s.t = 1.5 + Math.random() * 2.5; s.tx = wx(s.x) + (Math.random() - 0.5) * 4; s.tz = wz(s.z) + (Math.random() - 0.5) * 4; }
          const mx = s.root.position.x + (s.tx - s.root.position.x) * Math.min(1, dt * 1.6);
          if (!mBlocked(s, mx, s.root.position.z)) s.root.position.x = mx; else s.t = 0;
          const mz = s.root.position.z + (s.tz - s.root.position.z) * Math.min(1, dt * 1.6);
          if (!mBlocked(s, s.root.position.x, mz)) s.root.position.z = mz; else s.t = 0;
        }
// BOTE (pulo) + RECUO de hurt: offset visual do corpo.
        let oX = 0, oY = 0, oZ = 0;
        if (s.lunge > 0) {
          s.lunge = Math.max(0, s.lunge - dt);
          const pr = 1 - s.lunge / 0.42;
          const hop = Math.sin(Math.min(1, pr) * Math.PI);
          const dirX = dxp / (dist || 1), dirZ = dzp / (dist || 1);
          oX += dirX * hop * 1.0; oY += hop * 0.7; oZ += dirZ * hop * 1.0;
if (!s.lungeHit && pr >= 0.5) {
            s.lungeHit = true;
            s.attackCd = 1.8;
            playFx(s.attackSound || battleSoundsRef.current.punch, 0.8);
            speakMonster(s, 'attack');
            // CHEFE tocou o jogador → grunido e só depois a batalha (mapa encerra).
            if (s.isBoss) {
              if (!s.grunting) { s.grunting = true; bossGruntThenBattle(s.gruntUrl || ''); }
            } else {
              const who = s.isAnimal ? 'O animal' : 'O monstro';
              const eff = s.damageEffect && s.damageEffect !== 'none' ? s.damageEffect : null;
              if (eff && Math.random() < 0.4) {
                if (eff === 'bleed' || eff === 'poison') playerBleedUntil = performance.now() + 4000;
                hurtPlayer(1, `☠️ ${who} te atacou com ${eff}! -1 ❤️`);
              } else if (!eff && Math.random() < 0.3) {
                playerBleedUntil = performance.now() + 4000;
                hurtPlayer(1, `🩸 ${who} te feriu! -1 ❤️ e você está SANGRANDO!`);
              } else {
                hurtPlayer(1, `👾 ${who} te atacou! -1 ❤️`);
              }
            }
          }
        }
if (s.kb > 0) { s.kb = Math.max(0, s.kb - dt); const kk = s.kb / 0.2; oX += s.kbx * kk * 0.55; oZ += s.kbz * kk * 0.55; }
        // Aplica o bote/recuo no VISUAL (modelo GLB ou slime), respeitando a altura de repouso.
        const visObj = s.visual || s.mesh;
        visObj.position.set(oX, (s.visualRestY ?? 0.4) + oY, oZ);
        // barra de HP (billboard, encolhe à esquerda)
        s.bar.position.set(s.root.position.x, 1.15, s.root.position.z);
        s.bar.lookAt(camera.position);
        const frac = Math.max(0, s.hp / s.maxHp);
        s.fg.scale.x = frac; s.fg.position.x = -(1 - frac) * 0.5;
        // STATUS negativo: DoT (perde vida aos poucos), tint e barra de duração acima do HP.
        const st = s.status;
        if (st) {
          if (nowMs >= st.until) {
            // Expirou: limpa o status, o tint e a barra.
            s.status = undefined;
            if (s.tintedType) applyMonsterTint(s, null);
            if (s.statusBar) s.statusBar.g.visible = false;
          } else {
            // Dano contínuo do efeito (como na batalha).
            const dps = st.type === 'burn' ? 22 : st.type === 'bleed' ? 18 : st.type === 'electric' ? 16 : st.type === 'poison' ? 15 : 0;
            s.hp = Math.max(0, s.hp - dps * dt);
            if (s.hp <= 0) { callbacks.current.setMsg('💥 O monstro sucumbiu ao efeito!'); recordMonsterKill(s); rollMonsterDrops(s); if (s.isKeyHolder) spawnBossKey(s); }
            // Barra de duração: cor pelo status, esvazia conforme o tempo.
            if (s.statusBar) {
              const sb = s.statusBar;
              const pct = Math.max(0, Math.min(1, (st.until - nowMs) / st.total));
              (sb.fg.material as THREE.MeshBasicMaterial).color.set(STATUS_COLORS[st.type] || '#ffffff');
              sb.fg.scale.x = pct; sb.fg.position.x = -(1 - pct) * 0.35;
              sb.g.position.set(s.root.position.x, 1.35, s.root.position.z);
              sb.g.lookAt(camera.position);
            }
          }
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
      // névoa: limpa a área VISITADA e deixa-a visível PERMANENTEMENTE (não "re-acende").
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
      // Destaque do loot: o sprite flutua/pulsa e o anel no chão expande e some.
      const nowMs = performance.now();
      for (const p of lootPickups) {
        if (p.taken || !p.highlight) continue;
        const age = nowMs - p.born;
        if (age < 6000) { const bob = Math.abs(Math.sin(age / 200)); p.spr.position.y = 0.75 + bob * 0.35; const sc = 0.65 + Math.abs(Math.sin(age / 150)) * 0.14; p.spr.scale.set(sc, sc, 1); }
      }
      for (let i = lootRings.length - 1; i >= 0; i--) {
        const r = lootRings[i]; const age = nowMs - r.born;
        if (age > 6000) { scene.remove(r.mesh); (r.mesh.material as any)?.dispose?.(); r.mesh.geometry.dispose?.(); lootRings.splice(i, 1); continue; }
        const ph = (age % 900) / 900;
        r.mesh.scale.setScalar(0.6 + ph * 1.7);
        (r.mesh.material as any).opacity = 0.9 * (1 - ph);
        r.mesh.position.y = 0.06 + ph * 0.12;
      }
      // Fauna: bichinhos vagam devagar (visual) + som/fala em balão.
      for (const cr of critters) {
        cr.t -= 0.016;
        if (cr.t <= 0) { cr.t = 1.5 + Math.random() * 2.5; cr.vx = (Math.random() - 0.5) * 1.2; cr.vz = (Math.random() - 0.5) * 1.2; }
        cr.root.position.x += cr.vx * 0.016; cr.root.position.z += cr.vz * 0.016;
        cr.root.position.y = Math.abs(Math.sin(nowMs / 250)) * 0.06;
        if (Math.abs(cr.vx) + Math.abs(cr.vz) > 0.05) cr.root.rotation.y = Math.atan2(cr.vx, cr.vz);
        if (nowMs > cr.nextVoice) {
          cr.nextVoice = nowMs + 6000 + Math.random() * 12000;
          if (cr.soundUrl) sfx.play(cr.soundUrl, 0.6);
          if (cr.lines && cr.lines.length && cr.bubble) {
            try {
              const { tex, w, h } = makeBubbleTexture(cr.lines[Math.floor(Math.random() * cr.lines.length)]);
              (cr.bubble.material as any).map = tex; (cr.bubble.material as any).needsUpdate = true;
              cr.bubble.scale.set(w / 150, h / 150, 1); cr.bubble.visible = true; cr.bubbleUntil = nowMs + 2200;
            } catch { /* noop */ }
          }
        }
        if (cr.bubble && cr.bubble.visible && nowMs > cr.bubbleUntil) cr.bubble.visible = false;
      }
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
      if (musicEl) { try { musicEl.pause(); musicEl.src = ''; } catch { /* noop */ } musicEl = null; }
      try { renderer.dispose(); } catch { /* noop */ }
      try { viewer.dispose(); } catch { /* noop */ }
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [themeKey, seed, itemsReady]);

  const regenerate = useCallback(() => { setSeed(s => s + 1); setDead(false); setBossTouched(false); setCoins(0); setMsg('Mapa regenerado! Explore novamente.'); }, []);

  return (
<div style={{ position: 'relative', flex: 1, minHeight: 0, width: '100%', background: theme.sky, display: 'flex', flexDirection: 'column' }}>
      {/* TUTORIAL de 1ª visita: instruções de controles; monstros passivos até terminar. */}
      {tutorialStep >= 0 && tutorialStep < tutorialSteps.length && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'auto' }}>
          <div style={{ maxWidth: 440, width: 'calc(100% - 2rem)', background: 'rgba(15,23,42,0.96)', border: '1px solid var(--border-glass)', borderRadius: 16, padding: '1.5rem', textAlign: 'center', boxShadow: '0 12px 40px rgba(0,0,0,0.6)' }}>
            <div style={{ fontSize: '2.6rem', marginBottom: '0.4rem' }}>{tutorialSteps[tutorialStep].icon}</div>
            <h3 style={{ margin: '0 0 0.5rem', color: 'var(--gold-primary)', fontSize: '1.3rem' }}>{tutorialSteps[tutorialStep].title}</h3>
            <p style={{ color: '#e2e8f0', fontSize: '0.95rem', lineHeight: 1.5, margin: 0 }}>{tutorialSteps[tutorialStep].text}</p>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.2rem', gap: '0.5rem' }}>
              {tutorialStep > 0
                ? <button onClick={() => setTutorialStep(s => s - 1)} style={{ padding: '0.5rem 1rem', borderRadius: 8, background: 'rgba(255,255,255,0.08)', border: '1px solid var(--border-glass)', color: '#cbd5e1', cursor: 'pointer', fontSize: '0.8rem' }}>Voltar</button>
                : <span />}
              {tutorialStep < tutorialSteps.length - 1
                ? <button onClick={() => setTutorialStep(s => s + 1)} style={{ padding: '0.6rem 1.4rem', borderRadius: 8, background: 'var(--gold-primary)', border: 'none', color: '#0f172a', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 800 }}>Próximo →</button>
                : <button onClick={finishTutorial} style={{ padding: '0.6rem 1.4rem', borderRadius: 8, background: 'var(--accent-green, #10b981)', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 800 }}>Entendido, vou explorar! ⚔️</button>}
            </div>
            <div style={{ color: '#94a3b8', fontSize: '0.75rem', marginTop: '0.6rem' }}>{tutorialStep + 1} / {tutorialSteps.length}</div>
          </div>
        </div>
      )}
<div style={{ padding: 8, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', background: 'rgba(0,0,0,0.4)', zIndex: 5 }}>
        {playerMode ? (
          <strong style={{ color: '#fff', textShadow: '0 1px 2px #000' }}>🗺️ Explore o mapa até o chefe!</strong>
        ) : (
          <>
            <strong style={{ color: '#fff', textShadow: '0 1px 2px #000' }}>🗺️ Mapa Explorável (POC)</strong>
            {(Object.keys(THEMES) as ThemeKey[]).map((tk) => (
              <button key={tk} onClick={() => { setThemeKey(tk); regenerate(); }}
                style={{ padding: '4px 10px', borderRadius: 6, border: tk === themeKey ? '2px solid #fbbf24' : '1px solid rgba(255,255,255,0.4)', background: tk === themeKey ? 'rgba(251,191,36,0.3)' : 'rgba(0,0,0,0.45)', color: '#fff', cursor: 'pointer', fontSize: '0.75rem' }}>
                {THEMES[tk].label}
              </button>
            ))}
            <button onClick={regenerate} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #4ade80', background: 'rgba(74,222,128,0.25)', color: '#fff', cursor: 'pointer', fontSize: '0.75rem' }}>🎲 Regenerar</button>
          </>
        )}
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
<span>· 🪙 {coins}{heldKeysCount > 0 && <> · 🔑 {heldKeysCount}</>} · Perigo: {theme.hazardLabel}</span>
        {!playerMode && (
          <button onClick={() => { sfx.unlock(); sfx.beep(); sfx.play(battleSoundsRef.current.punch, 0.8); setSfxOn(true); window.setTimeout(() => setSfxOn(false), 400); const st = sfx.status(); setSfxDiag(`audio:${st.state}/buf${st.buffers}${st.error ? '/' + st.error : ''}`); }}
            title="Testa o áudio do navegador (se não tocar nem aqui, o som está bloqueado no dispositivo)"
            style={{ padding: '2px 8px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.3)', background: sfxOn ? 'rgba(74,222,128,0.45)' : 'rgba(0,0,0,0.35)', color: '#fff', cursor: 'pointer', fontSize: '0.72rem' }}>
            🔊 Testar som
          </button>
        )}
        {!playerMode && sfxDiag && <span style={{ fontSize: '0.68rem', color: '#fbbf24' }}>{sfxDiag}</span>}
        <button onClick={() => pickaxeToggleRef.current()}
          title={hasRealPickaxeItem ? 'Picareta do inventário equipada — quebra rochas, cactos, paredes e portas' : (canDebugPickaxe ? 'Equipar picareta de DEBUG (fallback — sem item no inventário). Tecla P.' : 'Você não tem uma picareta no inventário para quebrar rochas.')}
          style={{ padding: '2px 10px', borderRadius: 6, border: '1px solid #fbbf24', background: 'rgba(251,191,36,0.25)', color: '#fff', cursor: (hasRealPickaxeItem || canDebugPickaxe) ? 'pointer' : 'not-allowed', fontSize: '0.72rem', fontWeight: 700, opacity: (hasRealPickaxeItem || canDebugPickaxe) ? 1 : 0.45 }}>
          ⛏️ {hasRealPickaxeItem ? 'Picareta' : (canDebugPickaxe ? 'Picareta (P)' : 'Picareta')}
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
        {/* SLOTS DE MÃO: picaretas disponíveis (perfil/mochila). Tecla P alterna/equipa. */}
        {handOptions.length > 0 && (
          <div style={{ position: 'absolute', left: '50%', bottom: 70, transform: 'translateX(-50%)', zIndex: 10, display: 'flex', gap: 8, background: 'rgba(0,0,0,0.6)', padding: 8, borderRadius: 10, border: '1px solid rgba(255,255,255,0.15)' }}>
            <span style={{ color: '#fff', fontSize: '0.7rem', alignSelf: 'center', marginRight: 4 }}>⛏️ Mão (P):</span>
            {handOptions.map((o, i) => (
              <button key={i} title={`${o.title} — clique para equipar/guardar`} onClick={() => equipHandRef.current(handActiveId === o.id ? null : o.id)}
                style={{ width: 48, height: 48, borderRadius: 8, border: handActiveId === o.id ? '2px solid #fbbf24' : '1px solid rgba(255,255,255,0.3)', background: handActiveId === o.id ? 'rgba(251,191,36,0.25)' : 'rgba(255,255,255,0.08)', padding: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                {o.imageUrl ? <img src={o.imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : '⛏️'}
              </button>
            ))}
          </div>
        )}
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
                  setConsumables(prev => {
                    const arr = [...prev];
                    const [m] = arr.splice(from, 1);
                    arr.splice(i, 0, m);
                    saveConsumableOrder(userData?.uid, arr);
                    return arr;
                  });
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
