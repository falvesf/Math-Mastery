import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase';
import { useTenant } from '../contexts/TenantContext';
import { useDialog } from '../contexts/DialogContext';
import ImageGalleryModal from './ImageGalleryModal';
import ItemSelectDropdown, { type ItemSelectOption } from './ItemSelectDropdown';
import MapExplorerPoC from './MapExplorerPoC';
import AudioBankPicker from './AudioBankPicker';

/**
 * Editor de CENÁRIOS (mapas de exploração).
 * Define os parâmetros que o MapExplorerPoC consome: dimensões, tipos de parede
 * (HP/defesa/quebrável/armadilha), portas (HP/defesa/modo de abertura) e tabela de loot.
 */

const THEME_OPTIONS = [
  { value: 'plains', label: '🌿 Planície' },
  { value: 'desert', label: '🏜️ Deserto' },
  { value: 'nether', label: '🌋 Nether' },
  { value: 'tundra', label: '❄️ Tundra' },
  { value: 'end', label: '🟣 O Fim' },
];

interface WallType { id: string; name: string; color: string; textureUrl?: string; hp: number; def: number; breakable: boolean; chance: number; trapChance: number; drops?: LootEntry[]; spawnMonsterIds?: string[] }
interface DoorType { id: string; name: string; color: string; textureUrl?: string; modelId?: string; hp: number; def: number; openMode: 'challenge' | 'free' | 'key'; challengeChance: number; keyItemId?: string; wrongMonsterIds?: string[] }
interface KeyType { id: string; name: string; imageUrl?: string }
interface LootEntry { kind: 'coins' | 'item' | 'key' | 'heart' | 'potion' | 'nothing'; weight: number; min?: number; max?: number; itemId?: string; keyId?: string }
interface MonsterSpawnRegion { x1: number; z1: number; x2: number; z2: number; monsters: string[]; density: number }
interface ScenarioConfig {
  cols: number; rows: number; revealRadius: number; wallTrapChance: number;
  defaultWallType: string; defaultDoorType: string; wallTypes: WallType[]; doorTypes: DoorType[]; lootTable: LootEntry[];
  /** Música de fundo do cenário (URL do banco de sons) + volume (0-1). */
  musicUrl?: string;
  musicVolume?: number;
  /** Densidade de paredes na geração aleatória (0-1; 0.26 = padrão). */
  wallDensity?: number;
  /** Tipo de mapa: 'closed' = labirinto murado; 'open' = campo aberto com obstáculos. */
  mapType?: 'closed' | 'open';
  /** Altura das paredes do mapa em unidades de mundo (padrão 3.4). */
  wallHeight?: number;
  /** Elaboração estratégica da geração (0-1): mais baús/monstros/portas/rochas/perigos. */
  elaboration?: number;
  /** Critérios explícitos da geração (opcionais; se 0/undefined usa a elaboração). */
  genDoors?: number;
  genChests?: number;
  /** Chance de monstro por célula livre (0-1). */
  genMonsterChance?: number;
  /** Quantidade EXATA de monstros a gerar (0=auto). Tem prioridade sobre genMonsterChance. */
  genMonsterCount?: number;
  /** Cristais de geração por elemento: -1 = nenhum, 0/undefined = auto, >0 = quantidade exata. */
  genRocks?: number;
  genTrees?: number;
  genFlowers?: number;
  genAnimals?: number;
  /** Animais: 'varied' = sorteia do catálogo; 'specific' = só os de animalIds. */
  animalMode?: 'varied' | 'specific';
  animalIds?: string[];
  /** Como a porta do BOSS é aberta: 'none' (sem chave) ou 'monster_drop' (chave cai de um monstro). */
  bossKeyMode?: 'none' | 'monster_drop';
  keys?: KeyType[];
  /** População de monstros (ids de preset_skins type=monster) e boss do mapa. */
  monsterConfig?: {
    /** Monstros padrão do mapa (usados quando não há regiões). */
    monsters?: string[];
    /** Regiões de spawn: retângulos do grid com lista própria de monstros + densidade. */
    regions?: MonsterSpawnRegion[];
    /** Id do monstro BOSS (fica no grid.end). Vazio = fallback padrão. */
    bossMonsterId?: string;
  };
  layout?: string[];
  /** Células pintadas com um TIPO de parede específico ("x,z" → id do tipo). */
  wallTypeCells?: Record<string, string>;
  /** Células pintadas com um TIPO de porta específico ("x,z" → id do tipo). */
  doorTypeCells?: Record<string, string>;
  /** Células pintadas com um MONSTRO específico ("x,z" → id do monstro do catálogo). */
  monsterCells?: Record<string, string>;
  /** Células com BAÚ ("x,z" → '1'). Geradas pelo "Gerar mapa" e usadas pelo runtime. */
  chestCells?: Record<string, string>;
  /** Loot dos BAÚS (por sorteio ponderado). Sem config → moedas 1..10 (comportamento antigo). */
  chestConfig?: { loot?: LootEntry[] };
}
interface Scenario { id?: string; tenant_id?: string | null; name: string; theme: string; is_active: boolean; config: ScenarioConfig }

const DEFAULT_CONFIG: ScenarioConfig = {
  cols: 48, rows: 18, revealRadius: 7, wallTrapChance: 0.12,
  defaultWallType: 'stone', defaultDoorType: 'wood',
    wallDensity: 0.26, elaboration: 0.5, bossKeyMode: 'none', mapType: 'closed',
  wallHeight: 3.4,
  musicVolume: 0.5,
  chestConfig: { loot: [
    { kind: 'coins', weight: 45, min: 5, max: 20 },
    { kind: 'heart', weight: 10 },
    { kind: 'potion', weight: 15 },
    { kind: 'nothing', weight: 30 },
  ] },
  wallTypes: [
    { id: 'stone', name: 'Pedra', color: '#6b7280', hp: 1000, def: 250, breakable: true, chance: 0.72, trapChance: 0.12 },
    { id: 'bedrock', name: 'Rocha-mãe', color: '#374151', hp: 999999, def: 999999, breakable: false, chance: 0.28, trapChance: 0 },
  ],
  doorTypes: [
    { id: 'wood', name: 'Porta de Madeira', color: '#8b5a2b', hp: 600, def: 120, openMode: 'challenge', challengeChance: 0.7 },
    { id: 'steel', name: 'Porta de Aço', color: '#9aa4b2', hp: 3000, def: 900, openMode: 'challenge', challengeChance: 1 },
  ],
  lootTable: [
    { kind: 'coins', weight: 40, min: 1, max: 10 },
    { kind: 'item', weight: 20, itemId: '' },
    { kind: 'key', weight: 10, keyId: 'chave_bronze' },
    { kind: 'nothing', weight: 30 },
  ],
  keys: [
    { id: 'chave_bronze', name: 'Chave de Bronze', imageUrl: '' },
  ],
};

const blankScenario = (tenantId: string | null): Scenario => ({
  tenant_id: tenantId || null, name: 'Novo Cenário', theme: 'plains', is_active: false,
  config: JSON.parse(JSON.stringify(DEFAULT_CONFIG)),
});

const inputStyle: CSSProperties = { width: '100%', padding: '0.5rem', borderRadius: 8, background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontSize: '0.85rem' };
const labelStyle: CSSProperties = { display: 'block', marginBottom: 4, color: 'var(--text-secondary)', fontSize: '0.72rem' };
const btn = (bg: string): CSSProperties => ({ padding: '0.45rem 0.8rem', borderRadius: 8, border: '1px solid var(--border-glass)', background: bg, color: '#fff', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 });
const card: CSSProperties = { background: 'rgba(0,0,0,0.18)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '0.9rem', marginBottom: '0.9rem' };
// Cores das regiões de spawn desenhadas no mapa (por índice).
const REGION_COLORS = ['#f59e0b', '#8b5cf6', '#06b6d4', '#ec4899', '#22c55e', '#ef4444'];
// Temas com perigo (cacto/lava/frio/solo instável) — alinhado com o MapExplorerPoC.
const HAZARD_THEMES = new Set(['desert', 'nether', 'tundra', 'end']);
// Hash determinístico por célula (estável entre renders) para simular a distribuição.
const cellRand = (x: number, z: number) => {
  let n = (x * 374761393 + z * 668265263) ^ 0x85ebca6b;
  n = (n ^ (n >>> 13)) * 1274126177;
  n = n ^ (n >>> 16);
  return ((n >>> 0) % 1000) / 1000;
};
// Posições dos "pontos" dentro de uma célula (até 5 por célula).
const DOT_POSITIONS = [{ x: '25%', y: '25%' }, { x: '75%', y: '25%' }, { x: '25%', y: '75%' }, { x: '75%', y: '75%' }, { x: '50%', y: '50%' }];
// Cores dos marcadores de elementos (legenda).
const MARKER_LABELS: { key: string; color: string; label: string }[] = [
  { key: 'monster', color: '#ec4899', label: '👹 Monstro (pintado)' },
  { key: 'coin', color: '#ffd34d', label: '💰 Moeda (est.)' },
  { key: 'rock', color: '#9c8a7a', label: '⛏️ Rocha / quebrável (est.)' },
  { key: 'hazard', color: '#ef4444', label: '⚠️ Perigo (cacto/lava/frio) (est.)' },
  { key: 'chest', color: '#b07d3a', label: '🎁 Baú (est.)' },
  { key: 'door', color: '#8b5a2b', label: '🚪 Porta (pintada)' },
  { key: 'start', color: '#10b981', label: '🟢 Início' },
  { key: 'end', color: '#ef4444', label: '🏁 Fim / Boss' },
];

// Constrói a grade de paredes/início/fim a partir do layout pintado.
function buildWallGrid(layout: string[]) {
  const rows = layout.length, cols = layout[0].length;
  const wall: boolean[][] = Array.from({ length: rows }, () => Array(cols).fill(false));
  let start = { x: 1, z: Math.floor(rows / 2) }, end = { x: cols - 2, z: Math.floor(rows / 2) };
  for (let z = 0; z < rows; z++) for (let x = 0; x < cols; x++) {
    const ch = layout[z][x];
    if (ch === '#') wall[z][x] = true;
    else if (ch === 'S') start = { x, z };
    else if (ch === 'E') end = { x, z };
  }
  return { wall, start, end };
}

export default function AdminScenarioManager() {
  const { tenantId } = useTenant();
  const { showAlert, showConfirm } = useDialog();
  const [list, setList] = useState<Scenario[]>([]);
  const [current, setCurrent] = useState<Scenario | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // Abas do editor (organização): Mapa / Paredes / Portas & Chaves / Loot & Baús / Monstros.
  const [editorTab, setEditorTab] = useState<'map' | 'walls' | 'doors' | 'loot' | 'monsters'>('map');
  const [tool, setTool] = useState<'wall' | 'door' | 'monster' | 'start' | 'end' | 'erase'>('wall');
  const [painting, setPainting] = useState(false);
  // Tipo de parede/porta selecionado para PINTAR (por célula).
  const [paintWallType, setPaintWallType] = useState('');
  const [paintDoorType, setPaintDoorType] = useState('');
  // Monstro selecionado para PINTAR (por célula) na ferramenta "👹 Monstro".
  const [paintMonsterId, setPaintMonsterId] = useState('');
  // Galeria de imagens aberta para definir textura de uma parede/porta.
  const [galleryFor, setGalleryFor] = useState<{ kind: 'wall' | 'door' | 'key'; index: number } | null>(null);
  // Preview 3D do cenário (MapExplorerPoC) usando a config atual (mesmo sem salvar).
  const [testOpen, setTestOpen] = useState(false);
  // Seletor de música do cenário (banco de sons).
  const [musicPickerOpen, setMusicPickerOpen] = useState(false);
  // Catálogo de itens (store_items) para o Loot ligado ao catálogo.
  const [catalogItems, setCatalogItems] = useState<any[]>([]);

  useEffect(() => {
    let q = supabase.from('store_items').select('*').eq('active', true);
    if (tenantId) q = q.or(`tenant_id.is.null,tenant_id.eq.${tenantId}`);
    q.then(({ data }) => {
      const rows = ((data as any[]) || []).map(r => {
        const d = typeof r.data === 'string' ? JSON.parse(r.data) : (r.data || {});
        return {
          id: r.id,
          title: r.name || r.title || d.title || r.id,
          imageUrl: r.image_url || r.imageUrl || d.imageUrl || d.image_url || '',
          rarity: r.rarity || d.rarity || 'common',
          typeLabel: r.type === 'equippable' || d.type === 'equippable' ? 'Equipável' : r.type === 'consumable' || d.type === 'consumable' ? 'Consumível' : 'Item',
        };
      });
      setCatalogItems(rows);
    }).catch(() => {});
    /* eslint-disable-next-line */
  }, [tenantId]);

  const catalogOptions: ItemSelectOption[] = catalogItems.map(it => ({
    id: it.id, title: it.title, imageUrl: it.imageUrl, rarity: it.rarity, typeLabel: it.typeLabel,
  }));

  // Catálogo de monstros (preset_skins type=monster) para povoar o mapa e escolher o boss.
  const [monsterCatalog, setMonsterCatalog] = useState<any[]>([]);
  // Modelos 3D de PORTA (categoria 'door') para associar a cada tipo de porta.
  const [doorModels, setDoorModels] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    let active = true;
    let q = supabase.from('3d_models').select('id,name').eq('category', 'door');
    if (tenantId) q = q.or(`is_global.eq.true,tenant_id.eq.${tenantId}`);
    q.then(({ data }) => { if (active && data) setDoorModels((data as any[]).map(m => ({ id: m.id, name: m.name || m.id }))); }).catch(() => {});
    return () => { active = false; };
  }, [tenantId]);
  useEffect(() => {
    let q = supabase.from('preset_skins').select('*').eq('type', 'monster');
    if (tenantId) q = q.or(`tenant_id.is.null,tenant_id.eq.${tenantId}`);
    q.then(({ data }) => {
      const rows = ((data as any[]) || []).map(r => {
        const d = typeof r.config === 'string' ? JSON.parse(r.config) : (r.config || {});
        return { id: r.id, name: r.name || d.name || r.id, config: d };
      });
      setMonsterCatalog(rows);
    }).catch(() => {});
    /* eslint-disable-next-line */
  }, [tenantId]);

  const patchMonster = (patch: any) => setCurrent(c => c ? { ...c, config: { ...c.config, monsterConfig: { ...(c.config.monsterConfig || {}), ...patch } } } : c);
  // Regiões de spawn (retângulos com monstros e densidade próprios).
  const patchRegion = (i: number, patch: Partial<MonsterSpawnRegion>) => setCurrent(c => {
    if (!c) return c;
    const mc = { ...(c.config.monsterConfig || {}) };
    const regions = (Array.isArray(mc.regions) ? mc.regions : []).map((r, j) => j === i ? { ...r, ...patch } : r);
    return { ...c, config: { ...c.config, monsterConfig: { ...mc, regions } } };
  });
  const toggleRegionMonster = (i: number, id: string) => setCurrent(c => {
    if (!c) return c;
    const mc = { ...(c.config.monsterConfig || {}) };
    const regions = (Array.isArray(mc.regions) ? mc.regions : []).map((r, j) => {
      if (j !== i) return r;
      const cur = Array.isArray(r.monsters) ? r.monsters : [];
      return { ...r, monsters: cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id] };
    });
    return { ...c, config: { ...c.config, monsterConfig: { ...mc, regions } } };
  });
  const toggleMonsterId = (id: string) => setCurrent(c => {
    if (!c) return c;
    const mc = { ...(c.config.monsterConfig || {}) };
    const cur = Array.isArray(mc.monsters) ? mc.monsters : [];
    mc.monsters = cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id];
    return { ...c, config: { ...c.config, monsterConfig: mc } };
  });
  // Limpa as células pintadas de um monstro (ou todas).
  const clearMonsterCells = (monsterId?: string) => setCurrent(c => {
    if (!c) return c;
    const cells = { ...(c.config.monsterCells || {}) };
    if (!monsterId) return { ...c, config: { ...c.config, monsterCells: {} } };
    for (const k of Object.keys(cells)) if (cells[k] === monsterId) delete cells[k];
    return { ...c, config: { ...c.config, monsterCells: cells } };
  });
  const renderMonsterChips = (selected: string[], onToggle: (id: string) => void) => {
    if (monsterCatalog.length === 0) return <div style={{ color: 'var(--text-secondary)', fontSize: '0.72rem' }}>Nenhum monstro cadastrado (galeria de monstros).</div>;
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {monsterCatalog.map(m => {
          const on = selected.includes(m.id);
          return (
            <button key={m.id} type="button" onClick={() => onToggle(m.id)}
              style={{ padding: '0.3rem 0.55rem', borderRadius: 20, cursor: 'pointer', fontSize: '0.7rem', fontWeight: 700, border: on ? '1px solid var(--accent-green, #10b981)' : '1px solid var(--border-glass)', background: on ? 'rgba(16,185,129,0.25)' : 'rgba(255,255,255,0.04)', color: on ? '#34d399' : 'var(--text-secondary)' }}>
              {on ? '✓ ' : ''}{m.name}
            </button>
          );
        })}
      </div>
    );
  };

  // ---- Layout pintado ----
  const blankLayout = (cols: number, rows: number): string[] => {
    const out: string[] = [];
    for (let z = 0; z < rows; z++) {
      let line = '';
      for (let x = 0; x < cols; x++) {
        const border = x === 0 || x === cols - 1 || z === 0 || z === rows - 1;
        line += border ? '#' : '.';
      }
      out.push(line);
    }
    // Início e fim padrão
    const mz = Math.floor(rows / 2);
    out[mz] = out[mz].substring(0, 1) + 'S' + out[mz].substring(2);
    out[mz] = out[mz].substring(0, cols - 2) + 'E' + out[mz].substring(cols - 1);
    return out;
  };
  const getLayout = (c: Scenario): string[] => {
    const { cols, rows } = c.config;
    if (c.config.layout && c.config.layout.length === rows && c.config.layout.every(r => r.length === cols)) return c.config.layout;
    return blankLayout(cols, rows);
  };
  const setLayout = (layout: string[]) => setCurrent(c => c ? { ...c, config: { ...c.config, layout } } : c);
  const applyDims = () => setCurrent(c => { if (!c) return c; return { ...c, config: { ...c.config, layout: blankLayout(c.config.cols, c.config.rows), wallTypeCells: {}, doorTypeCells: {} } }; });
  // Geração por CRITÉRIOS (tipo fechado/aberto, nº de portas, monstros e baús).
  // Preenche layout + doorTypeCells/monsterCells/chestCells para que a PRÉVIA do mapa
  // pintado reflita o que a simulação vai criar.
  const generateScenarioLayout = () => setCurrent(c => {
    if (!c) return c;
    const { cols, rows } = c.config;
    const mapType: 'closed' | 'open' = c.config.mapType === 'open' ? 'open' : 'closed';
    const elab = Math.max(0, Math.min(1, Number(c.config.elaboration) ?? 0.5));
    const genDoorsRaw = Number(c.config.genDoors);
    const wantDoors = (Number.isFinite(genDoorsRaw) && c.config.genDoors !== undefined && c.config.genDoors !== null && c.config.genDoors !== '') ? Math.round(genDoorsRaw) : 0;
    // -1 = nenhuma porta (labirinto totalmente conectado); 0 = auto; >0 = quantidade.
    const doors = wantDoors === -1 ? 0 : (wantDoors > 0 ? wantDoors : (mapType === 'closed' ? (2 + Math.round(elab * 2)) : 0));
    const monList: string[] = Array.isArray(c.config.monsterConfig?.monsters) ? (c.config.monsterConfig!.monsters as string[]) : [];
    const chestTarget = Math.max(0, Math.round(Number(c.config.genChests) || 0)) || Math.max(1, Math.round(1 + elab * 3));
    const doorTypeId = () => c.config.doorTypes?.[0]?.id || c.config.defaultDoorType || 'wood';

    function shuffleArr<T>(a: T[]): T[] { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

    const g: string[][] = Array.from({ length: rows }, () => Array(cols).fill('.'));
    if (mapType === 'closed') {
      // Labirinto REAL (recursive backtracker) — conectado e fechado pela borda.
      for (let z = 0; z < rows; z++) for (let x = 0; x < cols; x++) g[z][x] = '#';
      const stack: [number, number][] = [[1, 1]]; g[1][1] = '.';
      const dirs: [number, number][] = [[2, 0], [-2, 0], [0, 2], [0, -2]];
      while (stack.length) {
        const [cx, cz] = stack[stack.length - 1];
        const opts: [number, number, number, number][] = [];
        for (const [dx, dz] of dirs) {
          const nx = cx + dx, nz = cz + dz;
          if (nx > 0 && nz > 0 && nx < cols - 1 && nz < rows - 1 && g[nz][nx] === '#') opts.push([nx, nz, cx + dx / 2, cz + dz / 2]);
        }
        if (!opts.length) { stack.pop(); continue; }
        const [nx, nz, wx, wz] = opts[Math.floor(Math.random() * opts.length)];
        g[wz][wx] = '.'; g[nz][nx] = '.'; stack.push([nx, nz]);
      }
    }
    // Borda SEMPRE fechada (contenção).
    for (let x = 0; x < cols; x++) { g[0][x] = '#'; g[rows - 1][x] = '#'; }
    for (let z = 0; z < rows; z++) { g[z][0] = '#'; g[z][cols - 1] = '#'; }

    const doorTypeCells: Record<string, string> = {};
    const freeFor = (x: number, z: number) => x > 0 && z > 0 && x < cols - 1 && z < rows - 1;

    // --- Setores / sala do boss (definidos ANTES de escolher S/E, para variar as posições) ---
    let room: { x1: number; z1: number; x2: number; z2: number } | null = null;
    let cuts: { axis: 'v' | 'h'; pos: number }[] = [];

    if (doors > 0 && mapType === 'open') {
      if (doors === 1) {
        // Sala do BOSS num CANTO ALEATÓRIO do mapa.
        const rw = Math.min(12, cols - 2), rh = Math.min(12, rows - 2);
        const corner = Math.floor(Math.random() * 4);
        const x1 = (corner === 1 || corner === 3) ? cols - 1 - rw : 1;
        const z1 = (corner >= 2) ? rows - 1 - rh : 1;
        const x2 = Math.min(cols - 2, x1 + rw - 1), z2 = Math.min(rows - 2, z1 + rh - 1);
        const rx1 = Math.max(1, Math.min(x1, x2)), rz1 = Math.max(1, Math.min(z1, z2));
        for (let x = rx1; x <= x2; x++) { g[rz1][x] = '#'; g[z2][x] = '#'; }
        for (let z = rz1; z <= z2; z++) { g[z][rx1] = '#'; g[z][x2] = '#'; }
        // Porta no lado da sala mais próximo do CENTRO do mapa (fácil de achar, mas gated).
        const cxm = Math.round(cols / 2), czm = Math.round(rows / 2);
        const sides = [
          { x: rx1, z: Math.round((rz1 + z2) / 2) },
          { x: x2, z: Math.round((rz1 + z2) / 2) },
          { x: Math.round((rx1 + x2) / 2), z: rz1 },
          { x: Math.round((rx1 + x2) / 2), z: z2 },
        ];
        sides.sort((a, b) => (Math.abs(a.x - cxm) + Math.abs(a.z - czm)) - (Math.abs(b.x - cxm) + Math.abs(b.z - czm)));
        const d = sides[0]; g[d.z][d.x] = 'D'; doorTypeCells[`${d.x},${d.z}`] = doorTypeId();
        room = { x1: rx1, z1: rz1, x2, z2 };
      } else {
        const axis: 'v' | 'h' = Math.random() < 0.5 ? 'v' : 'h';
        for (let b = 1; b <= doors; b++) {
          const total = (axis === 'v' ? cols : rows) - 1;
          const pos = Math.max(1, Math.min((axis === 'v' ? cols : rows) - 2, Math.round(total * b / (doors + 1))));
          if (axis === 'v') { for (let z = 1; z < rows - 1; z++) g[z][pos] = '#'; const dz = 1 + Math.floor(Math.random() * (rows - 2)); g[dz][pos] = 'D'; doorTypeCells[`${pos},${dz}`] = doorTypeId(); }
          else { for (let x = 1; x < cols - 1; x++) g[pos][x] = '#'; const dx = 1 + Math.floor(Math.random() * (cols - 2)); g[pos][dx] = 'D'; doorTypeCells[`${dx},${pos}`] = doorTypeId(); }
          cuts.push({ axis, pos });
        }
      }
    } else if (doors > 0 && mapType === 'closed') {
      // Setores no labirinto: cortes (V ou H) com uma passagem virada em porta.
      const axis: 'v' | 'h' = Math.random() < 0.5 ? 'v' : 'h';
      for (let b = 1; b <= doors; b++) {
        const total = (axis === 'v' ? cols : rows) - 1;
        const pos = Math.max(1, Math.min((axis === 'v' ? cols : rows) - 2, Math.round(total * b / (doors + 1))));
        if (axis === 'v') {
          const openings: number[] = []; for (let z = 1; z < rows - 1; z++) if (g[z][pos] === '.') openings.push(z);
          for (let z = 1; z < rows - 1; z++) g[z][pos] = '#';
          const dz = openings.length ? openings[Math.floor(Math.random() * openings.length)] : 1 + Math.floor(Math.random() * (rows - 2));
          g[dz][pos] = 'D'; doorTypeCells[`${pos},${dz}`] = doorTypeId();
        } else {
          const openings: number[] = []; for (let x = 1; x < cols - 1; x++) if (g[pos][x] === '.') openings.push(x);
          for (let x = 1; x < cols - 1; x++) g[pos][x] = '#';
          const dx = openings.length ? openings[Math.floor(Math.random() * openings.length)] : 1 + Math.floor(Math.random() * (cols - 2));
          g[pos][dx] = 'D'; doorTypeCells[`${dx},${pos}`] = doorTypeId();
        }
        cuts.push({ axis, pos });
      }
    }

    // --- INÍCIO aleatório (fora da sala do boss / no primeiro setor) e FIM no ponto MAIS DISTANTE ---
    const isOpen = (x: number, z: number) => freeFor(x, z) && g[z][x] !== '#';
    const inRoom = (x: number, z: number) => !!room && x >= room.x1 && x <= room.x2 && z >= room.z1 && z <= room.z2;
    const inFirstBand = (x: number, z: number) => { if (!cuts.length) return true; const f = cuts[0]; return f.axis === 'v' ? x < f.pos : z < f.pos; };
    const inLastBand = (x: number, z: number) => { if (!cuts.length) return true; const last = cuts[cuts.length - 1]; return last.axis === 'v' ? x > last.pos : z > last.pos; };

    const allOpen: [number, number][] = [];
    for (let z = 1; z < rows - 1; z++) for (let x = 1; x < cols - 1; x++) if (isOpen(x, z)) allOpen.push([x, z]);
    const startPool = allOpen.filter(([x, z]) => (!room || !inRoom(x, z)) && inFirstBand(x, z));
    const poolS = startPool.length ? startPool : allOpen.filter(([x, z]) => !room || !inRoom(x, z));
    const sPick = poolS.length ? poolS[Math.floor(Math.random() * poolS.length)] : (allOpen[0] || [1, 1]);
    const [sx, sz] = sPick;

    const dist = Array.from({ length: rows }, () => Array(cols).fill(-1));
    const queue: [number, number][] = [[sx, sz]]; dist[sz][sx] = 0;
    for (let qi = 0; qi < queue.length; qi++) {
      const [x, z] = queue[qi];
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx, nz = z + dz;
        if (nx < 0 || nz < 0 || nx >= cols || nz >= rows || g[nz][nx] === '#' || dist[nz][nx] >= 0) continue;
        dist[nz][nx] = dist[z][x] + 1; queue.push([nx, nz]);
      }
    }
    // FIM: o mais distante, com preferência pela sala do boss / último setor.
    let best: [number, number] = [sx, sz]; let bestD = -1;
    for (const [x, z] of allOpen) {
      if (dist[z][x] < 0) continue;
      const pref = room ? inRoom(x, z) : (cuts.length ? inLastBand(x, z) : true);
      const d = dist[z][x] + (pref ? 1e6 : 0);
      if (d > bestD) { bestD = d; best = [x, z]; }
    }
    const [ex, ez] = best;
    g[sz][sx] = 'S'; g[ez][ex] = 'E';

    // GARANTIA DE CONECTIVIDADE: nenhuma área sem acesso (a não ser por PORTA).
    // Flood fill do início tratando '.' e 'D' (porta) como atravessáveis; células
    // livres não alcançadas viram PAREDE (evita "beco selado" que exige quebrar parede).
    {
      const seen = new Set<string>([`${sx},${sz}`]);
      const q: [number, number][] = [[sx, sz]];
      while (q.length) {
        const [cx, cz] = q.shift()!;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const nx = cx + dx, nz = cz + dz;
          if (!freeFor(nx, nz)) continue;
          if (g[nz][nx] === '#') continue;
          const k = `${nx},${nz}`;
          if (seen.has(k)) continue;
          seen.add(k); q.push([nx, nz]);
        }
      }
      for (let z = 1; z < rows - 1; z++) for (let x = 1; x < cols - 1; x++) {
        const ch = g[z][x];
        if (ch === '.' || ch === 'D' || ch === 'S' || ch === 'E') {
          if (!seen.has(`${x},${z}`)) g[z][x] = '#';
        }
      }
    }

    // Monstros: QUANTIDADE EXATA (genMonsterCount) ou automática. Fora da zona inicial.
    const monsterCells: Record<string, string> = {};
    const eligibleMon: [number, number][] = [];
    for (let z = 1; z < rows - 1; z++) for (let x = 1; x < cols - 1; x++) {
      if (g[z][x] !== '.') continue;
      if (dist[z][x] >= 0 && dist[z][x] < 5) continue;
      eligibleMon.push([x, z]);
    }
    shuffleArr(eligibleMon);
    const autoMon = Math.max(3, Math.round(eligibleMon.length * (0.008 + elab * 0.012)));
    const monCount = Math.max(0, Math.round(Number(c.config.genMonsterCount) || 0)) || autoMon;
    for (const [x, z] of eligibleMon.slice(0, monCount)) {
      monsterCells[`${x},${z}`] = monList.length ? monList[Math.floor(Math.random() * monList.length)] : 'default';
    }
    // Baús: becos primeiro, depois células livres.
    const chestCells: Record<string, string> = {};
    const freeAt = (x: number, z: number) => x > 0 && z > 0 && x < cols - 1 && z < rows - 1 && g[z][x] === '.';
    const deadEnds: [number, number][] = []; const openC: [number, number][] = [];
    for (let z = 1; z < rows - 1; z++) for (let x = 1; x < cols - 1; x++) {
      if (g[z][x] !== '.') continue;
      let n = 0; for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) if (freeAt(x + dx, z + dz)) n++;
      openC.push([x, z]); if (n === 1) deadEnds.push([x, z]);
    }
    shuffleArr(deadEnds); shuffleArr(openC);
    const deadSet = new Set(deadEnds.map(d => `${d[0]},${d[1]}`));
    const spots = deadEnds.concat(openC.filter(oc => !deadSet.has(`${oc[0]},${oc[1]}`)));
    for (const [x, z] of spots) {
      if (Object.keys(chestCells).length >= chestTarget) break;
      const key = `${x},${z}`;
      if (monsterCells[key]) continue;
      chestCells[key] = '1';
    }

    return { ...c, config: { ...c.config, layout: g.map(r => r.join('')), wallTypeCells: {}, doorTypeCells, monsterCells, chestCells } };
  });
  const paintAt = (x: number, z: number) => setCurrent(c => {
    if (!c) return c;
    const { cols, rows } = c.config;
    const l = getLayout(c).map(r => r);
    const ch = tool === 'wall' ? '#' : tool === 'door' ? 'D' : tool === 'start' ? 'S' : tool === 'end' ? 'E' : '.';
    // Só um início/fim
    if (ch === 'S' || ch === 'E') { for (let zz = 0; zz < rows; zz++) for (let xx = 0; xx < cols; xx++) if (l[zz][xx] === ch) l[zz] = l[zz].substring(0, xx) + '.' + l[zz].substring(xx + 1); }
    l[z] = l[z].substring(0, x) + ch + l[z].substring(x + 1);
    const key = `${x},${z}`;
    const wallTypeCells = { ...(c.config.wallTypeCells || {}) };
    const doorTypeCells = { ...(c.config.doorTypeCells || {}) };
    const monsterCells = { ...(c.config.monsterCells || {}) };
    if (tool === 'wall') { wallTypeCells[key] = paintWallType || c.config.defaultWallType || c.config.wallTypes[0]?.id; delete doorTypeCells[key]; delete monsterCells[key]; }
    else if (tool === 'door') { doorTypeCells[key] = paintDoorType || c.config.defaultDoorType || c.config.doorTypes[0]?.id; delete wallTypeCells[key]; delete monsterCells[key]; }
    else if (tool === 'monster') { if (paintMonsterId) { monsterCells[key] = paintMonsterId; delete wallTypeCells[key]; delete doorTypeCells[key]; } }
    else { delete wallTypeCells[key]; delete doorTypeCells[key]; delete monsterCells[key]; }
    return { ...c, config: { ...c.config, layout: l, wallTypeCells, doorTypeCells, monsterCells } };
  });

  // --- Resumo do mapa (contagens) e plano de marcadores (pontos coloridos) ---
  const computeMapStats = () => {
    const c = current as Scenario;
    const { cols, rows } = c.config;
    const density = Math.max(0, Math.min(1, Number(c.config.wallDensity) ?? 0.26));
    const elab = Math.max(0, Math.min(1, Number(c.config.elaboration) ?? 0.5));
    const hazardOn = HAZARD_THEMES.has(c.theme || 'plains');
    const hasLayout = !!c.config.layout;
    const layout = getLayout(c);
    const { wall, start, end } = buildWallGrid(layout);
    const wallAt = (x: number, z: number) => x < 0 || x >= cols || z < 0 || z >= rows || wall[z][x];
    const freeNeighbors = (x: number, z: number) => { let n = 0; for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) if (!wallAt(x + dx, z + dz)) n++; return n; };
    let walls = 0, doors = 0, free = 0, corridors = 0, deadEnds = 0;
    if (hasLayout) {
      for (let z = 0; z < rows; z++) for (let x = 0; x < cols; x++) {
        const ch = layout[z][x];
        if (ch === '#') { walls++; continue; }
        if (ch === 'D') { doors++; free++; continue; }
        if ((x === start.x && z === start.z) || (x === end.x && z === end.z)) continue;
        free++;
        const fn = freeNeighbors(x, z);
        if (fn === 1) deadEnds++;
        const l = wallAt(x - 1, z), r = wallAt(x + 1, z), u = wallAt(x, z - 1), d = wallAt(x, z + 1);
        if ((l && r && !u && !d) || (u && d && !l && !r)) corridors++;
      }
    } else {
      walls = Math.round(cols * rows * density);
      free = Math.round(cols * rows * (1 - density));
      doors = 2 + Math.round(elab * 2);
      corridors = Math.round(free * 0.2);
      deadEnds = Math.round(free * 0.06);
    }
    const paintedMonsters = Object.keys(c.config.monsterCells || {}).length;
    const genCount = Math.max(0, Math.round(Number(c.config.genMonsterCount) || 0));
    let monsters = paintedMonsters || genCount;
    const cfg = c.config.monsterConfig || {};
    if (monsters === 0 && Array.isArray(cfg.monsters) && cfg.monsters.length > 0) monsters = Math.round(free * (0.008 + elab * 0.012));
    else if (monsters === 0 && Array.isArray(cfg.regions) && cfg.regions.length > 0) {
      monsters = cfg.regions.reduce((s, rg) => {
        const x1 = Math.max(1, Math.min(rg.x1, rg.x2)), x2 = Math.min(cols - 2, Math.max(rg.x1, rg.x2));
        const z1 = Math.max(1, Math.min(rg.z1, rg.z2)), z2 = Math.min(rows - 2, Math.max(rg.z1, rg.z2));
        const area = Math.max(0, (x2 - x1 + 1) * (z2 - z1 + 1));
        return s + Math.round(area * Math.min(1, Math.max(0, Number(rg.density) || 0.2)));
      }, 0);
    }
    const chestCap = Math.max(1, Math.round(1 + elab * 3));
    const lootKeys = (c.config.lootTable || []).filter(l => l.kind === 'key').length;
    const lootItems = (c.config.lootTable || []).filter(l => l.kind === 'item').length;
    return {
      walls, doors,
      monsters,
      coins: Math.round(free * (0.06 + elab * 0.08)),
      hazards: hazardOn ? Math.round(free * (0.05 + elab * 0.10)) : 0,
      rocks: Math.round(corridors * (0.35 + elab * 0.45)) + Math.min(chestCap, deadEnds),
      chests: Math.min(chestCap, deadEnds),
      keys: lootKeys, items: lootItems,
      boss: cfg.bossMonsterId ? 1 : 0,
      free,
    };
  };
  const buildMarkerPlan = () => {
    const c = current as Scenario;
    const { cols, rows } = c.config;
    const elab = Math.max(0, Math.min(1, Number(c.config.elaboration) ?? 0.5));
    const layout = getLayout(c);
    const { wall, start, end } = buildWallGrid(layout);
    const hazardOn = HAZARD_THEMES.has(c.theme || 'plains');
    const wallAt = (x: number, z: number) => x < 0 || x >= cols || z < 0 || z >= rows || wall[z][x];
    const freeNeighbors = (x: number, z: number) => { let n = 0; for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) if (!wallAt(x + dx, z + dz)) n++; return n; };
    const plan = new Map<string, string[]>();
    const chestCap = Math.max(1, Math.round(1 + elab * 3));
    // Baús: becos (1 vizinho livre), até chestCap por varredura determinística.
    let chestCount = 0;
    for (let z = 0; z < rows; z++) for (let x = 0; x < cols; x++) {
      const ch = layout[z][x];
      if (ch === '#' || ch === 'D') continue;
      if ((x === start.x && z === start.z) || (x === end.x && z === end.z)) continue;
      if (freeNeighbors(x, z) === 1 && chestCount < chestCap) { plan.set(`${x},${z}`, ['chest']); chestCount++; }
    }
    for (let z = 0; z < rows; z++) for (let x = 0; x < cols; x++) {
      const ch = layout[z][x];
      if (ch === '#' || ch === 'D') continue;
      if ((x === start.x && z === start.z) || (x === end.x && z === end.z)) continue;
      const key = `${x},${z}`;
      const existing = plan.get(key);
      const marks = existing ? existing.slice() : [];
      const rnd = cellRand(x, z);
      const coinChance = 0.06 + elab * 0.08;
      if (rnd < coinChance) marks.push('coin');
      else if (hazardOn && rnd < coinChance + (0.05 + elab * 0.10)) marks.push('hazard');
      const l = wallAt(x - 1, z), r = wallAt(x + 1, z), u = wallAt(x, z - 1), d = wallAt(x, z + 1);
      const corridor = (l && r && !u && !d) || (u && d && !l && !r);
      if (corridor && cellRand(x + 1000, z) < (0.35 + elab * 0.45)) marks.push('rock');
      const mId = c.config.monsterCells?.[key];
      if (mId) marks.push('monster');
      if (marks.length) plan.set(key, marks);
    }
    // Baús gerados pelo "Gerar mapa" (chestCells) têm prioridade sobre a heurística de becos.
    if (c.config.chestCells) {
      for (const key of Object.keys(c.config.chestCells)) {
        const marks = plan.get(key) || [];
        if (!marks.includes('chest')) marks.unshift('chest');
        plan.set(key, marks);
      }
    }
    return plan;
  };

  const load = async () => {
    setLoading(true);
    try {
      let q = supabase.from('scenarios').select('*').order('created_at', { ascending: true });
      if (tenantId) q = q.or(`tenant_id.is.null,tenant_id.eq.${tenantId}`);
      const { data, error } = await q;
      if (error) throw error;
      const rows = ((data as any[]) || []).map(r => ({
        id: r.id, tenant_id: r.tenant_id, name: r.name, theme: r.theme || 'plains',
        is_active: !!r.is_active, config: { ...DEFAULT_CONFIG, ...(r.config || {}) },
      }));
      setList(rows);
      setCurrent(prev => prev ? (rows.find(r => r.id === prev.id) || prev) : null);
    } catch (e: any) {
      showAlert('Não foi possível carregar os cenários. A tabela scenarios existe? (' + (e?.message || e) + ')', 'Erro');
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [tenantId]);

  const patchConfig = (patch: Partial<ScenarioConfig>) => setCurrent(c => c ? { ...c, config: { ...c.config, ...patch } } : c);
  const patchWall = (i: number, patch: Partial<WallType>) => setCurrent(c => { if (!c) return c; const wt = c.config.wallTypes.map((w, j) => j === i ? { ...w, ...patch } : w); return { ...c, config: { ...c.config, wallTypes: wt } }; });
  const patchWallDrops = (i: number, drops: LootEntry[]) => patchWall(i, { drops });
  const patchWallDrop = (i: number, j: number, patch: Partial<LootEntry>) => setCurrent(c => { if (!c) return c; const wt = c.config.wallTypes.map((w, wi) => wi === i ? { ...w, drops: (w.drops || []).map((l, li) => li === j ? { ...l, ...patch } : l) } : w); return { ...c, config: { ...c.config, wallTypes: wt } }; });
  const patchDoor = (i: number, patch: Partial<DoorType>) => setCurrent(c => { if (!c) return c; const dt = c.config.doorTypes.map((d, j) => j === i ? { ...d, ...patch } : d); return { ...c, config: { ...c.config, doorTypes: dt } }; });
  const patchLoot = (i: number, patch: Partial<LootEntry>) => setCurrent(c => { if (!c) return c; const lt = c.config.lootTable.map((l, j) => j === i ? { ...l, ...patch } : l); return { ...c, config: { ...c.config, lootTable: lt } }; });
  const patchKey = (i: number, patch: Partial<KeyType>) => setCurrent(c => { if (!c) return c; const kt = (c.config.keys || []).map((k, j) => j === i ? { ...k, ...patch } : k); return { ...c, config: { ...c.config, keys: kt } }; });
  const patchChestLoot = (i: number, patch: Partial<LootEntry>) => setCurrent(c => { if (!c) return c; const lt = (c.config.chestConfig?.loot || []).map((l, j) => j === i ? { ...l, ...patch } : l); return { ...c, config: { ...c.config, chestConfig: { ...(c.config.chestConfig || {}), loot: lt } } }; });

  const save = async () => {
    if (!current) return;
    if (!current.name.trim()) { showAlert('Dê um nome ao cenário.', 'Atenção'); return; }
    setSaving(true);
    try {
      // Se ativar, desativa os demais do mesmo escopo.
      if (current.is_active) {
        let q = supabase.from('scenarios').update({ is_active: false }).neq('id', current.id || '00000000-0000-0000-0000-000000000000');
        q = tenantId ? q.eq('tenant_id', tenantId) : q.is('tenant_id', null);
        await q;
      }
      const payload = { name: current.name, theme: current.theme, is_active: current.is_active, config: current.config, tenant_id: current.tenant_id ?? (tenantId || null) };
      if (current.id) {
        const { error } = await supabase.from('scenarios').update(payload).eq('id', current.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('scenarios').insert(payload).select('id').limit(1);
        if (error) throw error;
        if (data && data[0]) current.id = (data[0] as any).id;
      }
      showAlert('Cenário salvo!', 'Sucesso');
      await load();
    } catch (e: any) {
      showAlert('Falha ao salvar: ' + (e?.message || e), 'Erro');
    } finally { setSaving(false); }
  };

  const removeScenario = async () => {
    if (!current?.id) return;
    if (!(await showConfirm(`Excluir "${current.name}"?`, 'Excluir cenário'))) return;
    try {
      const { error } = await supabase.from('scenarios').delete().eq('id', current.id);
      if (error) throw error;
      setCurrent(null); await load();
    } catch (e: any) { showAlert('Falha ao excluir: ' + (e?.message || e), 'Erro'); }
  };

  if (loading) return <div style={{ padding: '1rem', color: 'var(--text-secondary)' }}>Carregando cenários…</div>;

  const stats = current ? computeMapStats() : null;
  const markerPlan = current ? buildMarkerPlan() : null;
  const markerColor = (type: string) => MARKER_LABELS.find(m => m.key === type)?.color || '#ffffff';

  return (
    <>
    <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
      {/* Lista */}
      <div style={{ ...card, width: 260, flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <strong style={{ color: 'var(--text-primary)' }}>Cenários</strong>
          <button style={btn('var(--accent-green, #10b981)')} onClick={() => setCurrent(blankScenario(tenantId))}>+ Novo</button>
        </div>
        {list.length === 0 && <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Nenhum cenário. Rode a migration `migration_scenarios.sql`.</div>}
        {list.map(s => (
          <button key={s.id} onClick={() => setCurrent(JSON.parse(JSON.stringify(s)))}
            style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: 6, padding: '0.5rem 0.6rem', borderRadius: 8, cursor: 'pointer', background: current?.id === s.id ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.04)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontSize: '0.82rem' }}>
            {s.is_active ? '🟢 ' : ''}{s.name}
            <span style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.68rem' }}>{THEME_OPTIONS.find(t => t.value === s.theme)?.label || s.theme} · {s.tenant_id ? 'escola' : 'global'}</span>
          </button>
        ))}
      </div>

      {/* Editor */}
      <div style={{ flex: 1, minWidth: 380 }}>
        {!current && <div style={{ ...card, color: 'var(--text-secondary)' }}>Selecione um cenário à esquerda ou crie um novo.</div>}
        {current && (
          <>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <strong style={{ color: 'var(--text-primary)' }}>{current.id ? 'Editar cenário' : 'Novo cenário'}</strong>
              <div style={{ display: 'flex', gap: 8 }}>
                {current.id && <button style={btn('rgba(255,255,255,0.08)')} onClick={() => setCurrent({ ...JSON.parse(JSON.stringify(current)), id: undefined, name: current.name + ' (cópia)', is_active: false })}>Duplicar</button>}
                {current.id && <button style={btn('rgba(239,68,68,0.25)')} onClick={removeScenario}>Excluir</button>}
                <button style={btn('rgba(16,185,129,0.35)')} onClick={() => setTestOpen(true)} title="Abre o Mapa Explorável 3D com esta configuração (mesmo sem salvar)">▶️ Testar 3D</button>
                <button style={btn('var(--accent-blue, #3b82f6)')} disabled={saving} onClick={save}>{saving ? 'Salvando…' : 'Salvar'}</button>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
              {([['map', '🗺️ Mapa'], ['walls', '🧱 Paredes'], ['doors', '🚪 Portas & Chaves'], ['loot', '🎁 Loot & Baús'], ['monsters', '🐉 Monstros']] as const).map(([id, lbl]) => (
                <button key={id} onClick={() => setEditorTab(id)} style={{ ...btn(editorTab === id ? 'var(--accent-blue, #3b82f6)' : 'rgba(255,255,255,0.06)'), fontWeight: editorTab === id ? 800 : 600 }}>{lbl}</button>
              ))}
            </div>
            <div style={{ ...card, display: editorTab === 'map' ? undefined : 'none' }}>
              <strong style={{ display: 'block', color: 'var(--text-primary)', marginBottom: 10 }}>🗺️ Mapa & Geral</strong>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
                <div><label style={labelStyle}>Nome</label><input style={inputStyle} value={current.name} onChange={e => setCurrent({ ...current, name: e.target.value })} /></div>
                <div><label style={labelStyle}>Tema</label>
                  <select style={inputStyle} value={current.theme} onChange={e => setCurrent({ ...current, theme: e.target.value })}>
                    {THEME_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div><label style={labelStyle}>Colunas</label><input type="number" min={10} max={120} style={inputStyle} value={current.config.cols} onChange={e => patchConfig({ cols: Math.max(10, Math.min(120, parseInt(e.target.value) || 48)) })} /></div>
                <div><label style={labelStyle}>Linhas</label><input type="number" min={8} max={80} style={inputStyle} value={current.config.rows} onChange={e => patchConfig({ rows: Math.max(8, Math.min(80, parseInt(e.target.value) || 18)) })} /></div>
                <div><label style={labelStyle}>Altura das paredes</label><input type="number" min={1} max={10} step={0.1} style={inputStyle} value={current.config.wallHeight ?? 3.4} onChange={e => patchConfig({ wallHeight: Math.max(1, Math.min(10, parseFloat(e.target.value) || 3.4)) })} /></div>
                <div><label style={labelStyle}>Raio de visão (fog)</label><input type="number" min={2} max={15} style={inputStyle} value={current.config.revealRadius} onChange={e => patchConfig({ revealRadius: Math.max(2, Math.min(15, parseInt(e.target.value) || 7)) })} /></div>
                <div><label style={labelStyle}>Chance de armadilha na parede (%)</label><input type="number" min={0} max={100} style={inputStyle} value={Math.round((current.config.wallTrapChance || 0) * 100)} onChange={e => patchConfig({ wallTrapChance: Math.max(0, Math.min(100, parseInt(e.target.value) || 0)) / 100 })} /></div>
                <div style={{ gridColumn: 'span 2' }}>
                  <label style={labelStyle}>🎵 Música do cenário (banco de sons)</label>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    <input style={{ ...inputStyle, flex: '1 1 220px' }} value={current.config.musicUrl || ''} onChange={e => patchConfig({ musicUrl: e.target.value })} placeholder="URL da música..." />
                    <button style={btn('rgba(245,158,11,0.2)')} onClick={() => setMusicPickerOpen(true)}>🎵 Banco</button>
                    {current.config.musicUrl && (
                      <button style={btn('rgba(239,68,68,0.2)')} onClick={() => patchConfig({ musicUrl: undefined })}>✕</button>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Volume: {Math.round((current.config.musicVolume ?? 0.5) * 100)}%</span>
                    <input type="range" min={0} max={1} step={0.05} value={current.config.musicVolume ?? 0.5} onChange={e => patchConfig({ musicVolume: parseFloat(e.target.value) })} style={{ flex: 1, accentColor: 'var(--gold-primary)' }} />
                  </div>
                </div>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, color: 'var(--text-primary)', fontSize: '0.85rem' }}>
                <input type="checkbox" checked={!!current.is_active} onChange={e => setCurrent({ ...current, is_active: e.target.checked })} /> Cenário ATIVO (usado no cenário explorável)
              </label>
            </div>

            {/* Tipos de parede */}
            <div style={{ ...card, display: editorTab === 'walls' ? undefined : 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <strong style={{ color: 'var(--text-primary)' }}>🧱 Tipos de Parede</strong>
                <button style={btn('var(--accent-green, #10b981)')} onClick={() => setCurrent({ ...current, config: { ...current.config, wallTypes: [...current.config.wallTypes, { id: 'tipo' + (current.config.wallTypes.length + 1), name: 'Nova Parede', color: '#8b5a2b', hp: 1000, def: 250, breakable: true, chance: 0.2, trapChance: 0.1 }] } })}>+ Tipo</button>
              </div>
              {current.config.wallTypes.map((w, i) => (
                <div key={i} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 8, padding: '0.55rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 8 }}>
                  <div style={{ minWidth: 90, flex: '1 1 90px' }}><label style={labelStyle}>ID</label><input style={inputStyle} value={w.id} onChange={e => patchWall(i, { id: e.target.value })} /></div>
                  <div style={{ minWidth: 180, flex: '2 1 180px' }}><label style={labelStyle}>Nome</label><input style={inputStyle} value={w.name} onChange={e => patchWall(i, { name: e.target.value })} /></div>
                  <div style={{ width: 74 }}><label style={labelStyle}>Cor</label><input type="color" style={{ ...inputStyle, padding: 2, height: 34 }} value={w.color} onChange={e => patchWall(i, { color: e.target.value })} /></div>
                  <div style={{ width: 122 }}><label style={labelStyle}>Textura</label>
                    <button type="button" style={{ ...btn('rgba(59,130,246,0.2)'), width: '100%', padding: '0.38rem 0.4rem', fontSize: '0.72rem' }} onClick={() => setGalleryFor({ kind: 'wall', index: i })}>{w.textureUrl ? '🖼️ Trocar' : '🖼️ Escolher'}</button>
                    {w.textureUrl && <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 3 }}>
                      <img src={w.textureUrl} alt="" style={{ width: 26, height: 26, objectFit: 'cover', borderRadius: 4, border: '1px solid var(--border-glass)' }} />
                      <button type="button" title="Remover textura" style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: '0.7rem' }} onClick={() => patchWall(i, { textureUrl: undefined })}>✕</button>
                    </div>}
                  </div>
                  <div style={{ width: 92 }}><label style={labelStyle}>HP</label><input type="number" style={inputStyle} value={w.hp} onChange={e => patchWall(i, { hp: parseInt(e.target.value) || 0 })} /></div>
                  <div style={{ width: 92 }}><label style={labelStyle}>Defesa</label><input type="number" style={inputStyle} value={w.def} onChange={e => patchWall(i, { def: parseInt(e.target.value) || 0 })} /></div>
                  <div style={{ width: 92 }}><label style={labelStyle}>Chance %</label><input type="number" style={inputStyle} value={Math.round((w.chance || 0) * 100)} onChange={e => patchWall(i, { chance: Math.max(0, Math.min(100, parseInt(e.target.value) || 0)) / 100 })} /></div>
                  <div style={{ width: 92 }}><label style={labelStyle}>Armad. %</label><input type="number" style={inputStyle} value={Math.round((w.trapChance || 0) * 100)} onChange={e => patchWall(i, { trapChance: Math.max(0, Math.min(100, parseInt(e.target.value) || 0)) / 100 })} /></div>
                  <div style={{ width: 120 }}><label style={labelStyle}>Quebrável</label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', color: 'var(--text-primary)', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', borderRadius: 8, padding: '0.5rem' }}>
                      <input type="checkbox" checked={w.breakable} onChange={e => patchWall(i, { breakable: e.target.checked })} /> Sim
                    </label>
                  </div>
                  <button title="Remover" style={{ ...btn('rgba(239,68,68,0.25)'), padding: '0.45rem 0.5rem', marginLeft: 'auto' }} onClick={() => setCurrent({ ...current, config: { ...current.config, wallTypes: current.config.wallTypes.filter((_, j) => j !== i) } })}>✕</button>
                  <div style={{ flexBasis: '100%', marginTop: 2 }}>
                    <details>
                      <summary style={{ cursor: 'pointer', fontSize: '0.76rem', color: 'var(--text-secondary)' }}>🎁 Solta ao quebrar ({(w.drops || []).length} loot{(w.spawnMonsterIds || []).length ? ` · ${(w.spawnMonsterIds || []).length} monstro(s)` : ''})</summary>
                      <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {(w.drops || []).map((l, j) => (
                          <div key={j} style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                            <select style={{ ...inputStyle, width: 120 }} value={l.kind} onChange={e => patchWallDrop(i, j, { kind: e.target.value as any })}>
                              <option value="coins">🪙 Moedas</option>
                              <option value="item">📦 Item</option>
                              <option value="nothing">— Nada</option>
                            </select>
                            <input type="number" title="Peso" style={{ ...inputStyle, width: 70 }} value={l.weight} onChange={e => patchWallDrop(i, j, { weight: parseInt(e.target.value) || 0 })} />
                            {l.kind === 'coins' && <>
                              <input type="number" title="Mín" style={{ ...inputStyle, width: 64 }} value={l.min ?? 1} onChange={e => patchWallDrop(i, j, { min: parseInt(e.target.value) || 0 })} />
                              <input type="number" title="Máx" style={{ ...inputStyle, width: 64 }} value={l.max ?? 10} onChange={e => patchWallDrop(i, j, { max: parseInt(e.target.value) || 0 })} />
                            </>}
                            {l.kind === 'item' && <div style={{ flex: '1 1 220px' }}><ItemSelectDropdown items={catalogOptions} value={l.itemId || ''} onChange={id => patchWallDrop(i, j, { itemId: id })} placeholder="Item do catálogo..." /></div>}
                            <button title="Remover" style={{ ...btn('rgba(239,68,68,0.25)'), padding: '0.4rem 0.5rem' }} onClick={() => patchWallDrops(i, (w.drops || []).filter((_, k) => k !== j))}>✕</button>
                          </div>
                        ))}
                        <div><button style={btn('rgba(16,185,129,0.3)')} onClick={() => patchWallDrops(i, [...(w.drops || []), { kind: 'coins', weight: 10, min: 1, max: 5 }])}>+ Loot</button></div>
                        <div>
                          <label style={labelStyle}>Monstros que solta (Ctrl p/ vários)</label>
                          <select multiple size={3} style={{ ...inputStyle, height: 'auto', padding: 4 }} value={w.spawnMonsterIds || []} onChange={e => patchWall(i, { spawnMonsterIds: Array.from(e.target.selectedOptions).map(o => (o as HTMLOptionElement).value) })}>
                            {monsterCatalog.map((m: any) => <option key={m.id} value={m.id}>{m.name || m.id}</option>)}
                          </select>
                        </div>
                      </div>
                    </details>
                  </div>
                </div>
              ))}
            </div>

            {/* Chaves do cenário */}
            <div style={{ ...card, display: editorTab === 'doors' ? undefined : 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <strong style={{ color: 'var(--text-primary)' }}>🔑 Chaves do Cenário</strong>
                <button style={btn('var(--accent-green, #10b981)')} onClick={() => setCurrent({ ...current, config: { ...current.config, keys: [...(current.config.keys || []), { id: 'chave' + ((current.config.keys || []).length + 1), name: 'Nova Chave', imageUrl: '' }] } })}>+ Chave</button>
              </div>
              {(current.config.keys || []).length === 0 && (
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>Nenhuma chave cadastrada. Chaves são usadas por portas com abertura "Chave (item)" e podem cair como loot ao quebrar blocos.</div>
              )}
              {(current.config.keys || []).map((k, i) => (
                <div key={i} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 8, padding: '0.55rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 8 }}>
                  <div style={{ minWidth: 110, flex: '1 1 110px' }}><label style={labelStyle}>ID</label><input style={inputStyle} value={k.id} onChange={e => patchKey(i, { id: e.target.value })} /></div>
                  <div style={{ minWidth: 180, flex: '2 1 180px' }}><label style={labelStyle}>Nome</label><input style={inputStyle} value={k.name} onChange={e => patchKey(i, { name: e.target.value })} /></div>
                  <div style={{ width: 122 }}><label style={labelStyle}>Ícone</label>
                    <button type="button" style={{ ...btn('rgba(59,130,246,0.2)'), width: '100%', padding: '0.38rem 0.4rem', fontSize: '0.72rem' }} onClick={() => setGalleryFor({ kind: 'key', index: i })}>{k.imageUrl ? '🖼️ Trocar' : '🖼️ Escolher'}</button>
                    {k.imageUrl && <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 3 }}>
                      <img src={k.imageUrl} alt="" style={{ width: 26, height: 26, objectFit: 'cover', borderRadius: 4, border: '1px solid var(--border-glass)' }} />
                      <button type="button" title="Remover ícone" style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: '0.7rem' }} onClick={() => patchKey(i, { imageUrl: undefined })}>✕</button>
                    </div>}
                  </div>
                  <button title="Remover" style={{ ...btn('rgba(239,68,68,0.25)'), padding: '0.45rem 0.5rem', marginLeft: 'auto' }} onClick={() => setCurrent({ ...current, config: { ...current.config, keys: (current.config.keys || []).filter((_, j) => j !== i) } })}>✕</button>
                </div>
              ))}
            </div>

            {/* Tipos de porta */}
            <div style={{ ...card, display: editorTab === 'doors' ? undefined : 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <strong style={{ color: 'var(--text-primary)' }}>🚪 Tipos de Porta</strong>
                <button style={btn('var(--accent-green, #10b981)')} onClick={() => setCurrent({ ...current, config: { ...current.config, doorTypes: [...current.config.doorTypes, { id: 'porta' + (current.config.doorTypes.length + 1), name: 'Nova Porta', color: '#8b5a2b', hp: 600, def: 120, openMode: 'challenge', challengeChance: 0.7 }] } })}>+ Tipo</button>
              </div>
              {current.config.doorTypes.map((d, i) => (
                <div key={i} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 8, padding: '0.55rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 8 }}>
                  <div style={{ minWidth: 90, flex: '1 1 90px' }}><label style={labelStyle}>ID</label><input style={inputStyle} value={d.id} onChange={e => patchDoor(i, { id: e.target.value })} /></div>
                  <div style={{ minWidth: 180, flex: '2 1 180px' }}><label style={labelStyle}>Nome</label><input style={inputStyle} value={d.name} onChange={e => patchDoor(i, { name: e.target.value })} /></div>
                  <div style={{ width: 74 }}><label style={labelStyle}>Cor</label><input type="color" style={{ ...inputStyle, padding: 2, height: 34 }} value={d.color} onChange={e => patchDoor(i, { color: e.target.value })} /></div>
                  <div style={{ width: 122 }}><label style={labelStyle}>Textura</label>
                    <button type="button" style={{ ...btn('rgba(59,130,246,0.2)'), width: '100%', padding: '0.38rem 0.4rem', fontSize: '0.72rem' }} onClick={() => setGalleryFor({ kind: 'door', index: i })}>{d.textureUrl ? '🖼️ Trocar' : '🖼️ Escolher'}</button>
                    {d.textureUrl && <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 3 }}>
                      <img src={d.textureUrl} alt="" style={{ width: 26, height: 26, objectFit: 'cover', borderRadius: 4, border: '1px solid var(--border-glass)' }} />
                      <button type="button" title="Remover textura" style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: '0.7rem' }} onClick={() => patchDoor(i, { textureUrl: undefined })}>✕</button>
                    </div>}
                  </div>
                  <div style={{ minWidth: 170, flex: '2 1 170px' }}><label style={labelStyle}>Modelo 3D (Portas)</label>
                    <select style={inputStyle} value={d.modelId || ''} onChange={e => patchDoor(i, { modelId: e.target.value || undefined })}>
                      <option value="">— (usar cor/textura acima)</option>
                      {doorModels.map(m => <option key={m.id} value={m.id}>🚪 {m.name}</option>)}
                      {d.modelId && !doorModels.some(m => m.id === d.modelId) && <option value={d.modelId}>(modelo atual)</option>}
                    </select>
                  </div>
                  <div style={{ width: 92 }}><label style={labelStyle}>HP</label><input type="number" style={inputStyle} value={d.hp} onChange={e => patchDoor(i, { hp: parseInt(e.target.value) || 0 })} /></div>
                  <div style={{ width: 92 }}><label style={labelStyle}>Defesa</label><input type="number" style={inputStyle} value={d.def} onChange={e => patchDoor(i, { def: parseInt(e.target.value) || 0 })} /></div>
                  <div style={{ width: 190 }}><label style={labelStyle}>Abertura</label>
                    <select style={inputStyle} value={d.openMode} onChange={e => patchDoor(i, { openMode: e.target.value as any })}>
                      <option value="challenge">Desafio (pergunta)</option>
                      <option value="free">Livre (abre direto)</option>
                      <option value="key">Chave (item)</option>
                    </select>
                  </div>
                  <div style={{ width: 120 }}><label style={labelStyle}>Chance desafio %</label><input type="number" style={inputStyle} value={Math.round((d.challengeChance || 0) * 100)} onChange={e => patchDoor(i, { challengeChance: Math.max(0, Math.min(100, parseInt(e.target.value) || 0)) / 100 })} /></div>
                  <div style={{ minWidth: 200, flex: '0 1 220px' }}>
                    <label style={labelStyle}>Monstros ao errar (Ctrl p/ vários)</label>
                    <select multiple size={2} style={{ ...inputStyle, height: 'auto', padding: 4 }} value={d.wrongMonsterIds || []} onChange={e => patchDoor(i, { wrongMonsterIds: Array.from(e.target.selectedOptions).map(o => (o as HTMLOptionElement).value) })}>
                      {monsterCatalog.map((m: any) => <option key={m.id} value={m.id}>{m.name || m.id}</option>)}
                    </select>
                  </div>
                  <div style={{ minWidth: 200, flex: '1 1 200px' }}><label style={labelStyle}>Chave necessária</label>
                    <select style={inputStyle} value={d.keyItemId || ''} onChange={e => patchDoor(i, { keyItemId: e.target.value || undefined })}>
                      <option value="">— (nenhuma)</option>
                      {(current.config.keys || []).map(k => <option key={k.id} value={k.id}>🔑 {k.name} ({k.id})</option>)}
                      <option value="boss_key">👑 Chave do BOSS (drop de monstro)</option>
                      {d.keyItemId && !(current.config.keys || []).some(k => k.id === d.keyItemId) && d.keyItemId !== 'boss_key' && <option value={d.keyItemId}>{d.keyItemId} (id direto)</option>}
                    </select>
                    {(current.config.keys || []).length === 0 && current.config.bossKeyMode !== 'monster_drop' && <div style={{ color: 'var(--text-secondary)', fontSize: '0.68rem', marginTop: 2 }}>Cadastre chaves na seção acima.</div>}
                    {current.config.bossKeyMode === 'monster_drop' && <div style={{ color: 'var(--text-secondary)', fontSize: '0.68rem', marginTop: 2 }}>A "Chave do BOSS" cai de um monstro — escolha-a nas portas que quiser trancar.</div>}
                  </div>
                  <button title="Remover" style={{ ...btn('rgba(239,68,68,0.25)'), padding: '0.45rem 0.5rem', marginLeft: 'auto' }} onClick={() => setCurrent({ ...current, config: { ...current.config, doorTypes: current.config.doorTypes.filter((_, j) => j !== i) } })}>✕</button>
                </div>
              ))}
            </div>

            {/* Loot */}
            <div style={{ ...card, display: editorTab === 'loot' ? undefined : 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <strong style={{ color: 'var(--text-primary)' }}>🎁 Loot ao quebrar blocos</strong>
                <button style={btn('var(--accent-green, #10b981)')} onClick={() => setCurrent({ ...current, config: { ...current.config, lootTable: [...current.config.lootTable, { kind: 'item', weight: 10, itemId: '' }] } })}>+ Item</button>
              </div>
              {current.config.lootTable.map((l, i) => (
                <div key={i} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 8, padding: '0.55rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 8 }}>
                  <div style={{ width: 170 }}><label style={labelStyle}>Tipo</label>
                    <select style={inputStyle} value={l.kind} onChange={e => patchLoot(i, { kind: e.target.value as any })}>
                      <option value="coins">🪙 Moedas</option>
                      <option value="item">🎒 Item do Catálogo</option>
                      <option value="nothing">— Nada</option>
                    </select>
                  </div>
                  <div style={{ width: 100 }}><label style={labelStyle}>Peso</label><input type="number" style={inputStyle} value={l.weight} onChange={e => patchLoot(i, { weight: parseInt(e.target.value) || 0 })} /></div>
                  {l.kind === 'coins' && (
                    <>
                      <div style={{ width: 90 }}><label style={labelStyle}>Mín</label><input type="number" style={inputStyle} value={l.min ?? ''} onChange={e => patchLoot(i, { min: parseInt(e.target.value) || 0 })} /></div>
                      <div style={{ width: 90 }}><label style={labelStyle}>Máx</label><input type="number" style={inputStyle} value={l.max ?? ''} onChange={e => patchLoot(i, { max: parseInt(e.target.value) || 0 })} /></div>
                    </>
                  )}
                  {l.kind === 'item' && (
                    <div style={{ flex: '1 1 280px' }}><label style={labelStyle}>Item (catálogo)</label>
                      <ItemSelectDropdown items={catalogOptions} value={l.itemId || ''} onChange={id => patchLoot(i, { itemId: id })} placeholder="Selecione um item do catálogo..." />
                    </div>
                  )}
                  {l.kind === 'key' && (
                    <div style={{ flex: '1 1 280px' }}><label style={labelStyle}>Chave (cenário)</label>
                      <select style={inputStyle} value={l.keyId || ''} onChange={e => patchLoot(i, { keyId: e.target.value || undefined })}>
                        <option value="">— (selecionar chave)</option>
                        {(current.config.keys || []).map(k => <option key={k.id} value={k.id}>🔑 {k.name} ({k.id})</option>)}
                      </select>
                    </div>
                  )}
                  <button title="Remover" style={{ ...btn('rgba(239,68,68,0.25)'), padding: '0.45rem 0.5rem', marginLeft: 'auto' }} onClick={() => setCurrent({ ...current, config: { ...current.config, lootTable: current.config.lootTable.filter((_, j) => j !== i) } })}>✕</button>
                </div>
              ))}
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.72rem', marginTop: 4 }}>
                Peso = chance relativa. Moedas usam Mín/Máx. Itens caem como pickup com o ícone do catálogo — itens de cura (heal_1_hp / restore_hp) curam ao passar por cima. "Coração/Poção (legado)" são entradas antigas; troque por Item sempre que possível.
              </div>
            </div>

            {/* Loot dos BAÚS */}
            <div style={{ ...card, display: editorTab === 'loot' ? undefined : 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <strong style={{ color: 'var(--text-primary)' }}>🎁 Loot dos Baús</strong>
                <button style={btn('var(--accent-green, #10b981)')} onClick={() => setCurrent({ ...current, config: { ...current.config, chestConfig: { ...(current.config.chestConfig || {}), loot: [...(current.config.chestConfig?.loot || []), { kind: 'coins', weight: 10, min: 5, max: 20 }] } } })}>+ Item</button>
              </div>
              {(current.config.chestConfig?.loot || []).map((l, i) => (
                <div key={i} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 8, padding: '0.55rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 8 }}>
                  <div style={{ width: 170 }}><label style={labelStyle}>Tipo</label>
                    <select style={inputStyle} value={l.kind} onChange={e => patchChestLoot(i, { kind: e.target.value as any })}>
                      <option value="coins">🪙 Moedas</option>
                      <option value="item">🎒 Item do Catálogo</option>
                      <option value="nothing">— Nada</option>
                    </select>
                  </div>
                  <div style={{ width: 100 }}><label style={labelStyle}>Peso</label><input type="number" style={inputStyle} value={l.weight} onChange={e => patchChestLoot(i, { weight: parseInt(e.target.value) || 0 })} /></div>
                  {l.kind === 'coins' && (
                    <>
                      <div style={{ width: 90 }}><label style={labelStyle}>Mín</label><input type="number" style={inputStyle} value={l.min ?? ''} onChange={e => patchChestLoot(i, { min: parseInt(e.target.value) || 0 })} /></div>
                      <div style={{ width: 90 }}><label style={labelStyle}>Máx</label><input type="number" style={inputStyle} value={l.max ?? ''} onChange={e => patchChestLoot(i, { max: parseInt(e.target.value) || 0 })} /></div>
                    </>
                  )}
                  {l.kind === 'item' && (
                    <div style={{ flex: '1 1 280px' }}><label style={labelStyle}>Item (catálogo)</label>
                      <ItemSelectDropdown items={catalogOptions} value={l.itemId || ''} onChange={id => patchChestLoot(i, { itemId: id })} placeholder="Selecione um item do catálogo..." />
                    </div>
                  )}
                  {l.kind === 'key' && (
                    <div style={{ flex: '1 1 280px' }}><label style={labelStyle}>Chave (cenário)</label>
                      <select style={inputStyle} value={l.keyId || ''} onChange={e => patchChestLoot(i, { keyId: e.target.value || undefined })}>
                        <option value="">— (selecionar chave)</option>
                        {(current.config.keys || []).map(k => <option key={k.id} value={k.id}>🔑 {k.name} ({k.id})</option>)}
                      </select>
                    </div>
                  )}
                  <button title="Remover" style={{ ...btn('rgba(239,68,68,0.25)'), padding: '0.45rem 0.5rem', marginLeft: 'auto' }} onClick={() => setCurrent({ ...current, config: { ...current.config, chestConfig: { ...(current.config.chestConfig || {}), loot: (current.config.chestConfig?.loot || []).filter((_, j) => j !== i) } } })}>✕</button>
                </div>
              ))}
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.72rem', marginTop: 4 }}>
                Cada baú sorteia <b>um</b> resultado pela tabela acima. Sem config → moedas 1..10.
              </div>
            </div>

            {/* Mapa pintado */}
            <div style={{ ...card, display: editorTab === 'map' ? undefined : 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
                <strong style={{ color: 'var(--text-primary)' }}>🗺️ Mapa (pintar)</strong>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {(['wall', 'door', 'monster', 'start', 'end', 'erase'] as const).map(t => (
                    <button key={t} onClick={() => setTool(t)} style={{ ...btn(tool === t ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.06)'), padding: '0.35rem 0.6rem' }}>
                      {t === 'wall' ? '🧱 Parede' : t === 'door' ? '🚪 Porta' : t === 'monster' ? '👹 Monstro' : t === 'start' ? '🟢 Início' : t === 'end' ? '🏁 Fim' : '🧽 Apagar'}
                    </button>
                  ))}
                  <button style={btn('rgba(255,255,255,0.06)')} onClick={applyDims}>Aplicar dimensões</button>
                  <button style={btn('rgba(255,255,255,0.06)')} onClick={generateScenarioLayout}>Gerar aleatório</button>
                  <button style={btn('rgba(239,68,68,0.2)')} onClick={() => setCurrent(c => c ? { ...c, config: { ...c.config, layout: undefined } } : c)}>Voltar ao procedural</button>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end', marginTop: 8, padding: '0.5rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8 }}>
                  <strong style={{ fontSize: '0.78rem', color: 'var(--text-primary)', alignSelf: 'center' }}>⚙️ Critérios da geração</strong>
                  <div style={{ width: 150 }}><label style={labelStyle}>Tipo de mapa</label>
                    <select style={inputStyle} value={current.config.mapType || 'closed'} onChange={e => patchConfig({ mapType: e.target.value as any })}>
                      <option value="closed">🧱 Fechado (labirinto)</option>
                      <option value="open">🌾 Aberto (campo)</option>
                    </select>
                  </div>
                  <div style={{ width: 130 }}><label style={labelStyle}>Portas (-1=sem, 0=auto)</label><input type="number" min={-1} style={inputStyle} value={current.config.genDoors ?? 0} onChange={e => patchConfig({ genDoors: Math.max(-1, parseInt(e.target.value) || 0) })} /></div>
                  <div style={{ width: 110 }}><label style={labelStyle}>Baús (0=auto)</label><input type="number" min={0} style={inputStyle} value={current.config.genChests ?? 0} onChange={e => patchConfig({ genChests: parseInt(e.target.value) || 0 })} /></div>
                  <div style={{ width: 130 }}><label style={labelStyle}>Monstros (0=auto)</label><input type="number" min={0} style={inputStyle} value={current.config.genMonsterCount ?? 0} onChange={e => patchConfig({ genMonsterCount: Math.max(0, parseInt(e.target.value) || 0) })} /></div>
                  <div style={{ width: 150 }}><label style={labelStyle}>Rochas (-1=sem, 0=auto)</label><input type="number" min={-1} style={inputStyle} value={current.config.genRocks ?? 0} onChange={e => patchConfig({ genRocks: Math.max(-1, parseInt(e.target.value) || 0) })} /></div>
                  <div style={{ width: 150 }}><label style={labelStyle}>Árvores (-1=sem, 0=auto)</label><input type="number" min={-1} style={inputStyle} value={current.config.genTrees ?? 0} onChange={e => patchConfig({ genTrees: Math.max(-1, parseInt(e.target.value) || 0) })} /></div>
                  <div style={{ width: 150 }}><label style={labelStyle}>Flores (-1=sem, 0=auto)</label><input type="number" min={-1} style={inputStyle} value={current.config.genFlowers ?? 0} onChange={e => patchConfig({ genFlowers: Math.max(-1, parseInt(e.target.value) || 0) })} /></div>
                  <div style={{ width: 150 }}><label style={labelStyle}>Animais (-1=sem, 0=auto)</label><input type="number" min={-1} style={inputStyle} value={current.config.genAnimals ?? 0} onChange={e => patchConfig({ genAnimals: Math.max(-1, parseInt(e.target.value) || 0) })} /></div>
                  <div style={{ width: 170 }}><label style={labelStyle}>Animais</label>
                    <select style={inputStyle} value={current.config.animalMode || 'varied'} onChange={e => patchConfig({ animalMode: e.target.value as any })}>
                      <option value="varied">🎲 Variados (catálogo)</option>
                      <option value="specific">🎯 Específicos (por id)</option>
                    </select>
                  </div>
                  {current.config.animalMode === 'specific' && (
                    <div style={{ minWidth: 260, flex: '1 1 260px' }}><label style={labelStyle}>Ids dos animais (separe por vírgula)</label>
                      <input style={inputStyle} placeholder="ex: animal-id-1, animal-id-2" value={(current.config.animalIds || []).join(', ')} onChange={e => patchConfig({ animalIds: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} />
                    </div>
                  )}
                </div>
              </div>
              {tool === 'wall' && current.config.wallTypes.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>🧱 Pintar parede:</span>
                  <select style={{ ...inputStyle, width: 220 }} value={paintWallType || current.config.defaultWallType || current.config.wallTypes[0].id} onChange={e => setPaintWallType(e.target.value)}>
                    {current.config.wallTypes.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                </div>
              )}
              {tool === 'door' && current.config.doorTypes.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>🚪 Pintar porta:</span>
                  <select style={{ ...inputStyle, width: 220 }} value={paintDoorType || current.config.defaultDoorType || current.config.doorTypes[0].id} onChange={e => setPaintDoorType(e.target.value)}>
                    {current.config.doorTypes.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
              )}
              {tool === 'monster' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>👹 Pintar monstro:</span>
                  <select style={{ ...inputStyle, width: 240 }} value={paintMonsterId} onChange={e => setPaintMonsterId(e.target.value)}>
                    <option value="">— selecione o monstro —</option>
                    {monsterCatalog.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Clique/arraste no mapa para colocar esse monstro na célula.</span>
                </div>
              )}
              <div style={{ overflow: 'auto', maxHeight: 420, border: '1px solid var(--border-glass)', borderRadius: 8, padding: 4, background: '#000' }}
                onPointerUp={() => setPainting(false)} onPointerLeave={() => setPainting(false)}>
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${current.config.cols}, 14px)`, gap: 1, width: 'max-content' }}>
                  {getLayout(current).flatMap((row, z) => row.split('').map((ch, x) => {
                    const key = `${x},${z}`;
                    let bg = '#1f2937';
                    if (ch === '#') { const wt = current.config.wallTypes.find(w => w.id === (current.config.wallTypeCells?.[key] || current.config.defaultWallType)); bg = wt?.color || '#6b7280'; }
                    else if (ch === 'D') { const dt = current.config.doorTypes.find(d => d.id === (current.config.doorTypeCells?.[key] || current.config.defaultDoorType)); bg = dt?.color || '#8b5a2b'; }
                    else if (ch === 'S') bg = '#10b981';
                    else if (ch === 'E') bg = '#ef4444';
                    // Pontos coloridos dos elementos (monstro/baú/rocha/perigo/moeda).
                    const marks = markerPlan?.get(key) || [];
                    const mId = current.config.monsterCells?.[key];
                    const markStyle: any = {};
                    if (marks.length) {
                      const dots = marks.map((t, i) => {
                        const pos = DOT_POSITIONS[i % DOT_POSITIONS.length];
                        return `radial-gradient(circle 2.5px at ${pos.x} ${pos.y}, ${markerColor(t)} 0 100%, transparent 100%)`;
                      });
                      markStyle.backgroundImage = dots.join(', ');
                      markStyle.boxShadow = 'inset 0 0 0 9999px rgba(0,0,0,0.25)';
                    }
                    const titleParts = [`(${x},${z})`];
                    if (mId) titleParts.push(`👹 ${monsterCatalog.find(mm => mm.id === mId)?.name || mId}`);
                    marks.forEach(t => { const m = MARKER_LABELS.find(mm => mm.key === t); if (m) titleParts.push(m.label); });
                    return (
                      <div key={`${x},${z}`} title={titleParts.join(' · ')}
                        onPointerDown={(e) => { e.preventDefault(); setPainting(true); paintAt(x, z); }}
                        onPointerEnter={() => { if (painting) paintAt(x, z); }}
                        style={{ width: 14, height: 14, backgroundColor: bg, cursor: 'pointer', border: '1px solid rgba(255,255,255,0.05)', ...markStyle }} />
                    );
                  }))}
                </div>
              </div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.72rem', marginTop: 6 }}>
                Clique/arraste para pintar. "Parede"/"Porta"/"Monstro" escolhem o tipo na caixa acima (cada célula guarda o que foi pintado). Sem layout pintado, o mapa é gerado automaticamente.
                {!current.config.layout && <> <b>(atualmente: procedural)</b></>}
              </div>
            </div>

            {/* Resumo & Legenda */}
            <div style={{ ...card, display: editorTab === 'map' ? undefined : 'none' }}>
              <strong style={{ color: 'var(--text-primary)' }}>📊 Resumo do Mapa & Legenda</strong>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.72rem', margin: '4px 0 10px' }}>
                Contagens exatas do que você pintou + estimativa do que é gerado aleatoriamente (moedas, rochas, perigos, baús). Os pontos coloridos aparecem no mapa acima.
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8, marginBottom: 12 }}>
                {stats && [
                  { k: 'paredes', icon: '🧱', label: 'Paredes', v: stats.walls, exact: true },
                  { k: 'portas', icon: '🚪', label: 'Portas', v: stats.doors, exact: true },
                  { k: 'monstros', icon: '👹', label: 'Monstros', v: stats.monsters, exact: Object.keys(current.config.monsterCells || {}).length > 0 },
                  { k: 'baús', icon: '🎁', label: 'Baús', v: stats.chests, exact: false },
                  { k: 'rochas', icon: '⛏️', label: 'Rochas/quebráveis', v: stats.rocks, exact: false },
                  { k: 'perigos', icon: '⚠️', label: 'Perigos (cacto/lava/frio)', v: stats.hazards, exact: false },
                  { k: 'moedas', icon: '💰', label: 'Moedas (espalhadas)', v: stats.coins, exact: false },
                  { k: 'chaves', icon: '🔑', label: 'Chaves no loot', v: stats.keys, exact: true },
                  { k: 'itens', icon: '🎒', label: 'Itens no loot', v: stats.items, exact: true },
                  { k: 'boss', icon: '👑', label: 'Boss', v: stats.boss, exact: true },
                ].map(it => (
                  <div key={it.k} style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '0.5rem 0.65rem' }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{it.icon} {it.label}</div>
                    <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                      {it.v}{!it.exact && <span style={{ fontSize: '0.62rem', fontWeight: 400, color: 'var(--text-secondary)' }}> ~est.</span>}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 8 }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>🎨 Legenda das cores</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px' }}>
                  {MARKER_LABELS.map(m => (
                    <span key={m.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      <span style={{ width: 12, height: 12, borderRadius: '50%', background: m.color, border: '1px solid rgba(255,255,255,0.3)', display: 'inline-block' }} />
                      {m.label}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Monstros & Boss */}
            <div style={{ ...card, display: editorTab === 'monsters' ? undefined : 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
                <strong style={{ color: 'var(--text-primary)' }}>👹 Monstros & Boss</strong>
              </div>

              <div style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '0.7rem', marginBottom: 12, background: 'rgba(0,0,0,0.15)' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>⚙️ Geração do mapa</div>
                <div style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                    <span style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>🧱 Densidade de paredes: <b>{Math.round((current.config.wallDensity ?? 0.26) * 100)}%</b></span>
                  </div>
                  <input type="range" min={5} max={70} value={Math.round((current.config.wallDensity ?? 0.26) * 100)} onChange={e => patchConfig({ wallDensity: Math.max(0, Math.min(1, (parseInt(e.target.value) || 26) / 100)) })} style={{ width: '100%', accentColor: '#8b5cf6', cursor: 'pointer' }} />
                </div>
                <div style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                    <span style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>✨ Elaboração (estratégia: baús, monstros, portas, perigos): <b>{Math.round((current.config.elaboration ?? 0.5) * 100)}%</b></span>
                  </div>
                  <input type="range" min={0} max={100} value={Math.round((current.config.elaboration ?? 0.5) * 100)} onChange={e => patchConfig({ elaboration: Math.max(0, Math.min(1, (parseInt(e.target.value) || 50) / 100)) })} style={{ width: '100%', accentColor: 'var(--gold-primary)', cursor: 'pointer' }} />
                </div>
                <div style={{ maxWidth: 380 }}>
                  <label style={labelStyle}>🔑 Chave do BOSS</label>
                  <select style={inputStyle} value={current.config.bossKeyMode || 'none'} onChange={e => patchConfig({ bossKeyMode: e.target.value as any })}>
                    <option value="none">Sem chave (porta do boss abre por outra estratégia)</option>
                    <option value="monster_drop">Cai de um monstro aleatório do mapa</option>
                  </select>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.7rem', marginTop: 3 }}>
                    Em "Cai de um monstro": um monstro do mapa carrega a chave; só ao derrotá-lo a chave do boss aparece e a porta do boss é destravada.
                  </div>
                </div>
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={labelStyle}>Monstros padrão do mapa (quando não há células pintadas)</label>
                {renderMonsterChips(current.config.monsterConfig?.monsters || [], toggleMonsterId)}
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={labelStyle}>Boss do mapa (fica na célula "Fim")</label>
                <select style={inputStyle} value={current.config.monsterConfig?.bossMonsterId || ''} onChange={e => patchMonster({ bossMonsterId: e.target.value || undefined })}>
                  <option value="">— (fallback padrão do jogo)</option>
                  {monsterCatalog.map(m => <option key={m.id} value={m.id}>👑 {m.name}</option>)}
                </select>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.7rem', marginTop: 3 }}>
                  Em missões, o boss definido na missão assume como boss; aqui é o fallback do mapa explorável.
                </div>
              </div>

              <div style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <label style={{ ...labelStyle, marginBottom: 0 }}>🗺️ Regiões de spawn (retângulos do grid)</label>
                  <button style={btn('var(--accent-green, #10b981)')} onClick={() => { const mc = current.config.monsterConfig || {}; const regions = [...(mc.regions || []), { x1: 1, z1: 1, x2: Math.min(current.config.cols - 2, 12), z2: Math.min(current.config.rows - 2, 6), monsters: [], density: 0.25 }]; patchMonster({ regions }); }}>+ Região</button>
                </div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.7rem', marginBottom: 8 }}>
                  Se houver regiões, elas têm prioridade sobre os "monstros padrão". Cada região gera monstros na densidade indicada. Coordenadas (x,z) começam em 0.
                </div>
                {(current.config.monsterConfig?.regions || []).length === 0 ? (
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>Nenhuma região — usa os monstros padrão/aleatórios.</div>
                ) : (current.config.monsterConfig?.regions || []).map((rg, i) => (
                  <div key={i} style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '0.6rem', marginBottom: 8, background: 'rgba(0,0,0,0.15)' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end', marginBottom: 6 }}>
                      {(['x1', 'z1', 'x2', 'z2'] as const).map(k => (
                        <div key={k} style={{ width: 70 }}><label style={labelStyle}>{k.toUpperCase()}</label><input type="number" style={inputStyle} value={rg[k]} onChange={e => patchRegion(i, { [k]: parseInt(e.target.value) || 0 } as any)} /></div>
                      ))}
                      <div style={{ width: 150 }}><label style={labelStyle}>Densidade ({Math.round((rg.density ?? 0.25) * 100)}%)</label><input type="range" min={0} max={100} value={Math.round((rg.density ?? 0.25) * 100)} onChange={e => patchRegion(i, { density: Math.max(0, Math.min(1, (parseInt(e.target.value) || 0) / 100)) })} style={{ width: '100%', accentColor: '#8b5cf6' }} /></div>
                      <button style={{ ...btn('rgba(239,68,68,0.25)'), marginLeft: 'auto' }} onClick={() => patchMonster({ regions: (current.config.monsterConfig?.regions || []).filter((_, j) => j !== i) })}>✕ Remover</button>
                    </div>
                    <label style={labelStyle}>Monstros desta região</label>
                    {renderMonsterChips(rg.monsters || [], (id) => toggleRegionMonster(i, id))}
                  </div>
                ))}
              </div>

              <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 10 }}>
                <label style={{ ...labelStyle, fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)' }}>Monstros pintados no mapa</label>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.7rem', marginBottom: 8 }}>
                  No pintor acima, use a ferramenta <b>👹 Monstro</b>: escolha o monstro na caixa e <b>clique/arraste no mapa</b> exatamente onde ele deve aparecer (cada célula ganha um pingo colorido). Depois pode usar <b>🧽 Apagar</b> para remover.
                </div>
                {Object.keys(current.config.monsterCells || {}).length === 0 ? (
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>Nenhuma célula pintada — use a ferramenta "Monstro" no mapa.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {monsterCatalog.map(m => {
                      const count = Object.values(current.config.monsterCells || {}).filter(v => v === m.id).length;
                      if (count === 0) return null;
                      return (
                        <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0.4rem 0.6rem', background: 'rgba(255,255,255,0.03)', borderRadius: 8 }}>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-primary)', flex: 1 }}>👹 {m.name} · <strong>{count}</strong> célula{count > 1 ? 's' : ''}</span>
                          <button style={btn('rgba(239,68,68,0.2)')} onClick={() => clearMonsterCells(m.id)}>Limpar</button>
                        </div>
                      );
                    })}
                    {Object.keys(current.config.monsterCells || {}).length > 0 && (
                      <button style={{ ...btn('rgba(239,68,68,0.3)'), alignSelf: 'flex-start', marginTop: 4 }} onClick={() => clearMonsterCells()}>🗑️ Limpar todos os monstros</button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
    {galleryFor && createPortal(
      <ImageGalleryModal
        onClose={() => setGalleryFor(null)}
        onSelectImage={(url) => {
          if (galleryFor.kind === 'wall') patchWall(galleryFor.index, { textureUrl: url });
          else if (galleryFor.kind === 'door') patchDoor(galleryFor.index, { textureUrl: url });
          else patchKey(galleryFor.index, { imageUrl: url });
          setGalleryFor(null);
        }}
      />,
      document.body
    )}
    {musicPickerOpen && createPortal(
      <AudioBankPicker
        open={musicPickerOpen}
        onClose={() => setMusicPickerOpen(false)}
        onSelect={(url) => { patchConfig({ musicUrl: url }); setMusicPickerOpen(false); }}
        categoryFilter="music"
        title="Banco de Áudio — Música do Cenário"
      />,
      document.body
    )}
    {testOpen && current && createPortal(
      <div style={{ position: 'fixed', inset: 0, background: '#000', zIndex: 999999, display: 'flex', flexDirection: 'column' }}>
        <MapExplorerPoC onExit={() => setTestOpen(false)} scenarioConfig={current.config} scenarioTheme={(current.theme || 'plains') as any} />
      </div>,
      document.body
    )}
    </>
  );
}
