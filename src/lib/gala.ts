import { supabase } from './supabase';
import type { UserData } from '../contexts/AuthContext';
import type { RankDef } from './ranks';

export type GalaOrderMode = 'alpha' | 'xp_desc';

export interface GalaBestStudentEntry {
  studentId: string;
  medalLabel: string; // Ex: "Medalha de Ouro", "Troféu Destaque", etc.
  boletimAverage?: string; // Ex: "9,5" ou "9.5" (opcional)
  customPhotoUrl?: string;
}

export interface GalaSpecialMedalEntry {
  id: string;
  studentId?: string;
  name: string;
  subtitle?: string; // Ex: "9º ano"
  photoUrl?: string;
}

export interface GalaConfig {
  schoolName: string;
  year: string;
  topRankingSubtitle: string;
  legendaryMinXp: number; // 0 = usar o minXp da patente "Lendário"
  orderMode: GalaOrderMode;
  suspenseMode: boolean;
  includedClassIds: string[]; // vazio = todas as turmas
  excludedLegendaryIds: string[]; // alunos excluídos manualmente do momento 1
  extraLegendaryIds: string[]; // alunos incluídos manualmente no momento 1
  customPhotos: Record<string, string>; // studentId -> url/dataUrl customizada
  specialMedals: GalaSpecialMedalEntry[];
  bestOfYear: Record<string, GalaBestStudentEntry>; // studentId -> entry
  musicMoment1Url?: string;
  musicMoment2Url?: string;
  updatedAt?: string;
}

export const DEFAULT_MEDAL_OPTIONS = [
  'Medalha de Bronze',
  'Medalha de Prata',
  'Medalha de Ouro',
  'Medalha de Diamante',
];

export function createDefaultGalaConfig(schoolName = 'Escola Adventista de Ibiúna', legendaryMinXp = 10000): GalaConfig {
  return {
    schoolName,
    year: String(new Date().getFullYear()),
    topRankingSubtitle: '6º AO 9º ANO',
    legendaryMinXp,
    orderMode: 'alpha',
    suspenseMode: true,
    includedClassIds: [],
    excludedLegendaryIds: [],
    extraLegendaryIds: [],
    customPhotos: {},
    specialMedals: [],
    bestOfYear: {},
    musicMoment1Url: '',
    musicMoment2Url: '',
  };
}

export type GalaSlideType =
  | 'intro_school'
  | 'intro_lendarios'
  | 'class_title_lendarios'
  | 'student_lendario'
  | 'class_highlights'
  | 'top_ranking_title'
  | 'top_ranking_summary'
  | 'special_medal_title'
  | 'special_medal_list'
  | 'intro_melhores'
  | 'class_title_melhores'
  | 'student_melhor'
  | 'closing_title'
  | 'closing_thanks';

export interface GalaStudentItem {
  id: string;
  name: string;
  photoUrl: string;
  xp: number;
  classId: string;
  className: string;
  medalLabel?: string;
  boletimAverage?: string;
  avatarConfig?: any;
}

export interface GalaClassTopItem {
  classId: string;
  className: string;
  topStudents: GalaStudentItem[];
}

export interface GalaSlide {
  id: string;
  index: number;
  type: GalaSlideType;
  moment: 1 | 2; // 1 = Lendários, 2 = Melhores do Ano
  transition: 'warp' | 'morph' | 'fade';
  classId?: string;
  className?: string;
  classColor?: string;
  schoolName?: string;
  subtitle?: string;
  student?: GalaStudentItem;
  topStudents?: GalaStudentItem[];
  classTops?: GalaClassTopItem[];
  specialMedals?: GalaSpecialMedalEntry[];
}

const LOCAL_STORAGE_KEY_PREFIX = 'math_mastery_gala_config_';

export async function loadGalaConfig(tenantId: string, defaultSchoolName?: string, defaultMinXp?: number): Promise<GalaConfig> {
  const fallback = createDefaultGalaConfig(defaultSchoolName || 'Escola Adventista de Ibiúna', defaultMinXp || 10000);
  if (!tenantId) return fallback;

  const docId = `gala_${tenantId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
  try {
    const { data, error } = await supabase
      .from('system_collections')
      .select('data')
      .eq('collection_name', 'gala_config')
      .eq('doc_id', docId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (!error && data?.data) {
      const remote = { ...fallback, ...(data.data as Partial<GalaConfig>) };
      try {
        const cachedRaw = localStorage.getItem(`${LOCAL_STORAGE_KEY_PREFIX}${tenantId}`);
        if (cachedRaw) {
          const cached = JSON.parse(cachedRaw) as Partial<GalaConfig>;
          if (cached.updatedAt && (!remote.updatedAt || cached.updatedAt > remote.updatedAt)) {
            return { ...fallback, ...cached };
          }
        }
        localStorage.setItem(`${LOCAL_STORAGE_KEY_PREFIX}${tenantId}`, JSON.stringify(remote));
      } catch {}
      return remote;
    }
  } catch (err) {
    console.warn('Erro ao carregar configuração da Gala do Supabase:', err);
  }

  try {
    const cached = localStorage.getItem(`${LOCAL_STORAGE_KEY_PREFIX}${tenantId}`);
    if (cached) {
      return { ...fallback, ...JSON.parse(cached) };
    }
  } catch {}

  return fallback;
}

export async function saveGalaConfig(tenantId: string, config: GalaConfig): Promise<boolean> {
  if (!tenantId) return false;
  const payload: GalaConfig = { ...config, updatedAt: new Date().toISOString() };

  try {
    localStorage.setItem(`${LOCAL_STORAGE_KEY_PREFIX}${tenantId}`, JSON.stringify(payload));
  } catch {}

  const docId = `gala_${tenantId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
  try {
    const syncToSupabase = async (): Promise<boolean> => {
      const { data: existing } = await supabase
        .from('system_collections')
        .select('id')
        .eq('collection_name', 'gala_config')
        .eq('doc_id', docId)
        .maybeSingle();

      if (existing?.id) {
        const { error } = await supabase
          .from('system_collections')
          .update({ data: payload, tenant_id: tenantId })
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('system_collections')
          .insert({
            collection_name: 'gala_config',
            doc_id: docId,
            tenant_id: tenantId,
            data: payload,
          });
        if (error) throw error;
      }
      return true;
    };

    const timeout = new Promise<boolean>(resolve => window.setTimeout(() => resolve(false), 6000));
    return await Promise.race([syncToSupabase(), timeout]);
  } catch (err) {
    console.error('Erro ao salvar configuração da Gala no Supabase:', err);
    return false;
  }
}

// ============================================================================
// IndexedDB para áudios locais da Gala (evita pesar no Git ou no banco)
// ============================================================================
const IDB_NAME = 'math_mastery_gala_audio';
const IDB_STORE = 'audio_files';

function openAudioDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(IDB_STORE)) {
        req.result.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveGalaLocalAudio(key: 'moment1' | 'moment2', file: File): Promise<string> {
  const db = await openAudioDb();
  const buffer = await file.arrayBuffer();
  const record = { name: file.name, type: file.type || 'audio/mpeg', buffer };
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(record, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  return file.name;
}

export async function loadGalaLocalAudio(key: 'moment1' | 'moment2'): Promise<{ name: string; url: string } | null> {
  try {
    const db = await openAudioDb();
    const record = await new Promise<any>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
    if (!record || !record.buffer) return null;
    const blob = new Blob([record.buffer], { type: record.type || 'audio/mpeg' });
    return { name: record.name || `${key}.mp3`, url: URL.createObjectURL(blob) };
  } catch {
    return null;
  }
}

export async function deleteGalaLocalAudio(key: 'moment1' | 'moment2'): Promise<void> {
  try {
    const db = await openAudioDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {}
}

// ============================================================================
// Resolução da meta de XP para Lendário e construção dos slides
// ============================================================================
export function resolveLegendaryMinXp(_config: GalaConfig, ranks: RankDef[]): number {
  const legendaryRank = ranks.find(r => r.name.toLowerCase().includes('lend'));
  if (legendaryRank && legendaryRank.minXp > 0) return legendaryRank.minXp;
  if (_config.legendaryMinXp && _config.legendaryMinXp > 0) return _config.legendaryMinXp;
  return 10000;
}

export function formatXpPtBr(xp: number): string {
  return Math.round(xp).toLocaleString('pt-BR');
}

function sortClassesNaturally<T extends { name: string }>(classes: T[]): T[] {
  return [...classes].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { numeric: true, sensitivity: 'base' }));
}

export function isStudentLegendary(student: UserData, minXp: number, config: GalaConfig): boolean {
  if (config.excludedLegendaryIds?.includes(student.uid)) return false;
  if (config.extraLegendaryIds?.includes(student.uid)) return true;
  const xp = student.xp || 0;
  const rankStr = (student.rank || '').toLowerCase();
  return xp >= minXp || rankStr.includes('lend');
}

export function createInitialsAvatarSvg(name: string): string {
  const parts = (name || 'A').trim().split(/\s+/);
  const initials = (parts.length >= 2 ? parts[0][0] + parts[parts.length - 1][0] : parts[0].slice(0, 2)).toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><rect width="256" height="256" fill="#1e293b"/><circle cx="128" cy="128" r="120" fill="none" stroke="#A97B34" stroke-width="6"/><text x="128" y="146" text-anchor="middle" font-family="Montserrat, Arial, sans-serif" font-size="86" font-weight="700" fill="#F7E99C">${initials}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function resolveStudentPhoto(student: UserData, config: GalaConfig): string {
  const custom = config.customPhotos?.[student.uid];
  if (custom) return custom;
  const bestCustom = config.bestOfYear?.[student.uid]?.customPhotoUrl;
  if (bestCustom) return bestCustom;
  if (student.photoURL) return student.photoURL;
  return createInitialsAvatarSvg(student.name || 'Aluno');
}

export function resolveClassColor(className: string, dbColor?: string): string {
  if (dbColor && dbColor.trim()) return dbColor;
  const lower = (className || '').toLowerCase();
  if (lower.includes('7')) return '#C81E1E';
  if (lower.includes('8')) return '#059669';
  if (lower.includes('9')) return '#111111';
  return '#00449E';
}

export function buildGalaSlides(
  config: GalaConfig,
  allUsers: UserData[],
  schoolClasses: { id: string; name: string; color?: string }[],
  ranks: RankDef[]
): GalaSlide[] {
  const slides: GalaSlide[] = [];
  const minXp = resolveLegendaryMinXp(config, ranks);

  const studentsOnly = allUsers.filter(u => u.role === 'student');
  const activeClasses = sortClassesNaturally(
    config.includedClassIds.length > 0
      ? schoolClasses.filter(c => config.includedClassIds.includes(c.id))
      : schoolClasses
  );

  const toItem = (u: UserData, className: string): GalaStudentItem => ({
    id: u.uid,
    name: u.name || 'Aluno',
    photoUrl: resolveStudentPhoto(u, config),
    xp: u.xp || 0,
    classId: u.classId || '',
    className,
    avatarConfig: u.avatarConfig,
  });

  const sortStudents = (list: GalaStudentItem[]) => {
    if (config.orderMode === 'xp_desc') {
      return [...list].sort((a, b) => b.xp - a.xp || a.name.localeCompare(b.name, 'pt-BR'));
    }
    return [...list].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  };

  // 1. Abertura Institucional
  slides.push({
    id: 'intro_school',
    index: 0,
    type: 'intro_school',
    moment: 1,
    transition: 'fade',
    schoolName: config.schoolName || 'Escola Adventista de Ibiúna',
    subtitle: 'Apresenta',
  });

  // 2. Introdução Momento 1: OS LENDÁRIOS
  slides.push({
    id: 'intro_lendarios',
    index: 0,
    type: 'intro_lendarios',
    moment: 1,
    transition: 'warp',
    subtitle: 'OS LENDÁRIOS',
  });

  const classTops: GalaClassTopItem[] = [];

  // 3. Por turma: Título -> Alunos Lendários -> Destaques (Top 3)
  for (const cls of activeClasses) {
    const classStudents = studentsOnly.filter(s => s.classId === cls.id || s.classId === cls.name);
    const legendaries = sortStudents(
      classStudents
        .filter(s => isStudentLegendary(s, minXp, config))
        .map(s => toItem(s, cls.name))
    );

    const top3 = [...classStudents]
      .filter(s => (s.xp || 0) > 0)
      .sort((a, b) => (b.xp || 0) - (a.xp || 0))
      .slice(0, 3)
      .map(s => toItem(s, cls.name));

    if (legendaries.length === 0 && top3.length === 0) continue;

    if (top3.length > 0) {
      classTops.push({
        classId: cls.id,
        className: cls.name,
        topStudents: top3,
      });
    }

    const clsColor = resolveClassColor(cls.name, cls.color);

    slides.push({
      id: `class_lend_${cls.id}`,
      index: 0,
      type: 'class_title_lendarios',
      moment: 1,
      transition: 'morph',
      classId: cls.id,
      className: cls.name,
      classColor: clsColor,
    });

    for (const st of legendaries) {
      slides.push({
        id: `lend_${cls.id}_${st.id}`,
        index: 0,
        type: 'student_lendario',
        moment: 1,
        transition: 'fade',
        classId: cls.id,
        className: cls.name,
        classColor: clsColor,
        student: st,
      });
    }

    if (top3.length > 0) {
      slides.push({
        id: `highlights_${cls.id}`,
        index: 0,
        type: 'class_highlights',
        moment: 1,
        transition: 'morph',
        classId: cls.id,
        className: cls.name,
        classColor: clsColor,
        topStudents: top3,
      });
    }
  }

  // 4. Top Ranking Geral (6º ao 9º ano)
  if (classTops.length > 0) {
    slides.push({
      id: 'top_ranking_title',
      index: 0,
      type: 'top_ranking_title',
      moment: 1,
      transition: 'morph',
      subtitle: config.topRankingSubtitle || '6º AO 9º ANO',
    });

    slides.push({
      id: 'top_ranking_summary',
      index: 0,
      type: 'top_ranking_summary',
      moment: 1,
      transition: 'morph',
      subtitle: config.topRankingSubtitle || '6º AO 9º ANO',
      classTops,
    });
  }

  // 5. Medalha Especial ("Sempre no Topo")
  if (config.specialMedals && config.specialMedals.length > 0) {
    slides.push({
      id: 'special_medal_title',
      index: 0,
      type: 'special_medal_title',
      moment: 1,
      transition: 'morph',
    });

    slides.push({
      id: 'special_medal_list',
      index: 0,
      type: 'special_medal_list',
      moment: 1,
      transition: 'morph',
      specialMedals: config.specialMedals,
    });
  }

  // 6. Momento 2: OS MELHORES DO ANO
  const bestEntries = config.bestOfYear || {};
  const hasAnyBest = Object.keys(bestEntries).length > 0;

  if (hasAnyBest) {
    slides.push({
      id: 'intro_melhores',
      index: 0,
      type: 'intro_melhores',
      moment: 2,
      transition: 'fade',
    });

    for (const cls of activeClasses) {
      const classBestStudents = studentsOnly
        .filter(s => (s.classId === cls.id || s.classId === cls.name) && bestEntries[s.uid])
        .map(s => {
          const entry = bestEntries[s.uid];
          return {
            ...toItem(s, cls.name),
            medalLabel: entry.medalLabel || 'Medalha de Ouro',
            boletimAverage: entry.boletimAverage || '',
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

      if (classBestStudents.length === 0) continue;

      slides.push({
        id: `class_melhores_${cls.id}`,
        index: 0,
        type: 'class_title_melhores',
        moment: 2,
        transition: 'morph',
        classId: cls.id,
        className: cls.name,
      });

      for (const st of classBestStudents) {
        slides.push({
          id: `melhor_${cls.id}_${st.id}`,
          index: 0,
          type: 'student_melhor',
          moment: 2,
          transition: 'morph',
          classId: cls.id,
          className: cls.name,
          student: st,
        });
      }
    }

    slides.push({
      id: 'closing_title',
      index: 0,
      type: 'closing_title',
      moment: 2,
      transition: 'morph',
    });
  }

  // 7. Encerramento
  slides.push({
    id: 'closing_thanks',
    index: 0,
    type: 'closing_thanks',
    moment: 2,
    transition: 'morph',
  });

  return slides.map((s, i) => ({ ...s, index: i }));
}
