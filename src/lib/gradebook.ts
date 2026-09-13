import { supabase } from './supabase';
import { getRankForXp } from './ranks';
// @ts-ignore
import { RANKS, DEFAULT_RANKS, type RankDef } from './ranks';
import * as XLSX from 'xlsx';

export interface BimesterGrades {
  p1?: number | string | null;
  p2?: number | string | null;
  tb1?: number | string | null;
  tb2?: number | string | null;
  extra?: number | string | null;
}

export interface StudentGradeRecord {
  studentId: string;
  studentName: string;
  b1?: BimesterGrades;
  b2?: BimesterGrades;
  b3?: BimesterGrades;
  b4?: BimesterGrades;
  baseXp?: number | string | null; // XP pré-existente ou bônus para não perder o histórico
  notes?: string;
}

export interface GradebookWeights {
  pesoProva: number;
  pesoTrabalho: number;
  pesoExtra: number;
}

export interface ClassGradebook {
  classId: string;
  className: string;
  tenantId: string;
  updatedAt: string;
  updatedBy?: string;
  weights: GradebookWeights;
  syncMode?: 'additive' | 'replace'; // 'additive': soma bimestres ao XP base | 'replace': substitui total
  grades: Record<string, StudentGradeRecord>;
}

export interface UserBackupData {
  backupId: string;
  tenantId: string;
  createdAt: string;
  createdBy?: string;
  trigger: string;
  userCount: number;
  users: any[];
}

export interface SyncPreviewRow {
  studentId: string;
  studentName: string;
  currentXp: number;
  currentRank: string;
  calculatedXp: number;
  newRank: string;
  diffXp: number;
  hasGrades: boolean;
  selected: boolean;
}

// Valores padrão de pesos
export const DEFAULT_WEIGHTS: GradebookWeights = {
  pesoProva: 100,
  pesoTrabalho: 100,
  pesoExtra: 100,
};

/**
 * Normaliza um valor de nota vindo do formulário/tabela para número seguro
 */
export function parseGradeValue(val: number | string | null | undefined): number {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  const cleaned = String(val).replace(',', '.').trim();
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

/**
 * Verifica se o aluno tem ao menos uma nota preenchida no bimestre
 */
export function hasBimesterGrades(grades?: BimesterGrades | null): boolean {
  if (!grades) return false;
  const fields = [grades.p1, grades.p2, grades.tb1, grades.tb2, grades.extra];
  return fields.some(f => f !== null && f !== undefined && String(f).trim() !== '');
}

/**
 * Verifica se o aluno tem ao menos uma nota preenchida em qualquer um dos 4 bimestres
 */
export function hasAnyGradesInYear(record?: StudentGradeRecord | null): boolean {
  if (!record) return false;
  return (
    hasBimesterGrades(record.b1) ||
    hasBimesterGrades(record.b2) ||
    hasBimesterGrades(record.b3) ||
    hasBimesterGrades(record.b4)
  );
}

/**
 * Calcula o XP de um bimestre específico seguindo a fórmula da planilha:
 * XP = (P1 + P2) * pesoProva + (TB1 + TB2) * pesoTrabalho + Extra * pesoExtra
 */
export function calculateBimesterXp(
  grades?: BimesterGrades | null,
  weights: GradebookWeights = DEFAULT_WEIGHTS
): number {
  if (!grades) return 0;
  const p1 = parseGradeValue(grades.p1);
  const p2 = parseGradeValue(grades.p2);
  const tb1 = parseGradeValue(grades.tb1);
  const tb2 = parseGradeValue(grades.tb2);
  const extra = parseGradeValue(grades.extra);

  const provaTotal = (p1 + p2) * (weights.pesoProva ?? 100);
  const trabalhoTotal = (tb1 + tb2) * (weights.pesoTrabalho ?? 100);
  const extraTotal = extra * (weights.pesoExtra ?? 100);

  return Math.round(provaTotal + trabalhoTotal + extraTotal);
}

/**
 * Calcula o XP total dos 4 bimestres
 */
export function calculateBimestersSum(
  record?: StudentGradeRecord | null,
  weights: GradebookWeights = DEFAULT_WEIGHTS
): number {
  if (!record) return 0;
  return (
    calculateBimesterXp(record.b1, weights) +
    calculateBimesterXp(record.b2, weights) +
    calculateBimesterXp(record.b3, weights) +
    calculateBimesterXp(record.b4, weights)
  );
}

/**
 * Calcula o XP Total do aluno, considerando ou não o XP Base
 */
export function calculateStudentTotalXp(
  record?: StudentGradeRecord | null,
  weights: GradebookWeights = DEFAULT_WEIGHTS,
  includeBaseXp: boolean = true
): number {
  if (!record) return 0;
  const bimSum = calculateBimestersSum(record, weights);
  if (includeBaseXp) {
    const baseXp = parseGradeValue(record.baseXp);
    return Math.round(bimSum + baseXp);
  }
  return bimSum;
}

/**
 * Carrega os pesos configurados na aba "Avaliação" do painel
 */
export async function loadEvaluationWeights(): Promise<GradebookWeights> {
  try {
    const { data: snap } = await supabase
      .from('system_collections')
      .select('*')
      .eq('collection_name', 'settings')
      .eq('doc_id', 'evaluations')
      .single();

    if (snap && snap.data && Array.isArray((snap.data as any).types)) {
      const types = (snap.data as any).types;
      const prova = types.find((t: any) => t.id === 'prova')?.weight;
      const trabalho = types.find((t: any) => t.id === 'trabalho')?.weight;
      const extra = types.find((t: any) => t.id === 'participacao' || t.id === 'desafio' || t.id === 'extra')?.weight;

      return {
        pesoProva: typeof prova === 'number' ? prova : 100,
        pesoTrabalho: typeof trabalho === 'number' ? trabalho : 100,
        pesoExtra: typeof extra === 'number' ? extra : 100,
      };
    }
  } catch (err) {
    console.warn('Erro ao carregar pesos da Avaliação, usando padrões:', err);
  }
  return { ...DEFAULT_WEIGHTS };
}

/**
 * Carrega a planilha de notas salva da turma
 */
export async function loadClassGradebook(
  tenantId: string,
  classId: string
): Promise<ClassGradebook | null> {
  if (!tenantId || !classId) return null;
  try {
    const docId = `gb_${tenantId}_${classId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
    const { data, error } = await supabase
      .from('system_collections')
      .select('*')
      .eq('collection_name', 'gradebook')
      .eq('doc_id', docId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (error) {
      console.error('Erro ao buscar gradebook:', error);
      return null;
    }

    if (data && data.data) {
      return data.data as ClassGradebook;
    }
  } catch (err) {
    console.error('Erro ao ler gradebook:', err);
  }
  return null;
}

/**
 * Salva a planilha de notas da turma
 */
export async function saveClassGradebook(
  tenantId: string,
  classId: string,
  gradebook: ClassGradebook
): Promise<boolean> {
  if (!tenantId || !classId) return false;
  try {
    const docId = `gb_${tenantId}_${classId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
    const updatedData = {
      ...gradebook,
      updatedAt: new Date().toISOString(),
    };

    const { data: existing } = await supabase
      .from('system_collections')
      .select('id')
      .eq('collection_name', 'gradebook')
      .eq('doc_id', docId)
      .limit(1);

    if (existing && existing.length > 0) {
      const { error } = await supabase
        .from('system_collections')
        .update({
          tenant_id: tenantId,
          data: updatedData,
        })
        .eq('id', existing[0].id);

      if (error) {
        console.error('Erro ao atualizar gradebook:', error);
        return false;
      }
    } else {
      const { error } = await supabase
        .from('system_collections')
        .insert({
          collection_name: 'gradebook',
          doc_id: docId,
          tenant_id: tenantId,
          data: updatedData,
        });

      if (error) {
        console.error('Erro ao inserir gradebook:', error);
        return false;
      }
    }
    return true;
  } catch (err) {
    console.error('Exceção ao salvar gradebook:', err);
    return false;
  }
}

/**
 * Chave de armazenamento local de preferências de colunas
 */
const getColPrefsLocalKey = (userId: string) => `math_mastery_gb_hidden_cols_${userId}`;

/**
 * Carrega as colunas ocultas da planilha salvas para o usuário atual
 */
export async function loadUserGradebookColumnPreferences(userId: string): Promise<string[]> {
  if (!userId) return [];

  // Tenta carregar do Supabase (system_collections)
  try {
    const docId = `cols_${userId}`;
    const { data, error } = await supabase
      .from('system_collections')
      .select('data')
      .eq('collection_name', 'gradebook_prefs')
      .eq('doc_id', docId)
      .maybeSingle();

    if (!error && data && data.data && Array.isArray(data.data.hiddenColumns)) {
      const list = data.data.hiddenColumns as string[];
      try {
        localStorage.setItem(getColPrefsLocalKey(userId), JSON.stringify(list));
      } catch (e) {}
      return list;
    }
  } catch (err) {
    console.warn('Erro ao carregar preferências de colunas do Supabase:', err);
  }

  // Fallback para localStorage
  try {
    const local = localStorage.getItem(getColPrefsLocalKey(userId));
    if (local) return JSON.parse(local);
  } catch (e) {}

  return [];
}

/**
 * Salva as colunas ocultas da planilha para o usuário atual no Supabase e localStorage
 */
export async function saveUserGradebookColumnPreferences(
  userId: string,
  hiddenColumns: string[],
  tenantId?: string
): Promise<boolean> {
  if (!userId) return false;

  // Atualiza cache local imediatamente
  try {
    localStorage.setItem(getColPrefsLocalKey(userId), JSON.stringify(hiddenColumns));
  } catch (e) {}

  // Salva no Supabase (system_collections) de forma persistente
  try {
    const docId = `cols_${userId}`;
    const { data: existing } = await supabase
      .from('system_collections')
      .select('id')
      .eq('collection_name', 'gradebook_prefs')
      .eq('doc_id', docId)
      .limit(1);

    const payload = {
      hiddenColumns,
      updatedAt: new Date().toISOString(),
    };

    if (existing && existing.length > 0) {
      await supabase
        .from('system_collections')
        .update({
          data: payload,
          tenant_id: tenantId || null,
        })
        .eq('id', existing[0].id);
    } else {
      await supabase.from('system_collections').insert({
        collection_name: 'gradebook_prefs',
        doc_id: docId,
        data: payload,
        tenant_id: tenantId || null,
      });
    }
    return true;
  } catch (err) {
    console.error('Erro ao salvar preferências de colunas no Supabase:', err);
    return false;
  }
}

/**
 * Cria um backup em JSON de todos os usuários do tenant atual
 */
export async function createTenantUsersBackup(
  tenantId: string,
  triggerDescription: string,
  createdBy?: string
): Promise<UserBackupData | null> {
  if (!tenantId) return null;
  try {
    // 1. Buscar membros do tenant
    const { data: memberRows } = await supabase
      .from('tenant_users')
      .select('user_id')
      .eq('tenant_id', tenantId);

    const memberIds = (memberRows || []).map(r => r.user_id).filter(Boolean);

    let usersQuery = supabase.from('users').select('*');
    if (memberIds.length > 0) {
      usersQuery = usersQuery.or(`tenant_id.eq.${tenantId},id.in.(${memberIds.join(',')})`);
    } else {
      usersQuery = usersQuery.eq('tenant_id', tenantId);
    }

    const { data: users, error } = await usersQuery;
    if (error) {
      console.error('Erro ao coletar usuários para backup:', error);
      return null;
    }

    const backupId = `backup_${Date.now()}`;
    const backup: UserBackupData = {
      backupId,
      tenantId,
      createdAt: new Date().toISOString(),
      createdBy: createdBy || 'Sistema',
      trigger: triggerDescription,
      userCount: (users || []).length,
      users: users || [],
    };

    // Salva na coleção do banco para histórico
    const docId = `backup_${tenantId}_${backupId}`;
    const { data: existing } = await supabase
      .from('system_collections')
      .select('id')
      .eq('collection_name', 'user_backups')
      .eq('doc_id', docId)
      .limit(1);

    if (existing && existing.length > 0) {
      await supabase
        .from('system_collections')
        .update({
          tenant_id: tenantId,
          data: backup,
        })
        .eq('id', existing[0].id);
    } else {
      await supabase
        .from('system_collections')
        .insert({
          collection_name: 'user_backups',
          doc_id: docId,
          tenant_id: tenantId,
          data: backup,
        });
    }

    return backup;
  } catch (err) {
    console.error('Erro ao criar backup:', err);
    return null;
  }
}

/**
 * Lista todos os backups já feitos para o tenant
 */
export async function listTenantUsersBackups(tenantId: string): Promise<UserBackupData[]> {
  if (!tenantId) return [];
  try {
    const { data, error } = await supabase
      .from('system_collections')
      .select('*')
      .eq('collection_name', 'user_backups')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    if (error || !data) return [];
    return data.map(d => d.data as UserBackupData).sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  } catch (err) {
    console.error('Erro ao listar backups:', err);
    return [];
  }
}

/**
 * Faz download direto do JSON de backup para a máquina do usuário
 */
export function downloadJsonBackup(backup: UserBackupData | { tenantId: string; users: any[] }, filenamePrefix = 'backup_usuarios') {
  try {
    const jsonStr = JSON.stringify(backup, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    a.href = url;
    a.download = `${filenamePrefix}_${dateStr}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error('Erro ao baixar arquivo de backup:', err);
  }
}

/**
 * Restaura usuários a partir de uma lista de backup
 */
export async function restoreTenantUsersBackup(
  tenantId: string,
  backupUsers: any[]
): Promise<{ success: boolean; restoredCount: number; error?: string }> {
  if (!tenantId || !backupUsers || backupUsers.length === 0) {
    return { success: false, restoredCount: 0, error: 'Lista de usuários vazia ou inválida.' };
  }

  try {
    let restoredCount = 0;
    for (const u of backupUsers) {
      if (!u.id) continue;
      // Atualiza os dados críticos de progresso do aluno
      const { error } = await supabase
        .from('users')
        .update({
          xp: u.xp ?? 0,
          coins: u.coins ?? 0,
          rank: u.rank ?? null,
          class_id: u.class_id ?? null,
        })
        .eq('id', u.id);

      if (!error) {
        restoredCount++;
      }
    }

    return { success: true, restoredCount };
  } catch (err: any) {
    return { success: false, restoredCount: 0, error: err?.message || 'Falha ao restaurar dados.' };
  }
}

/**
 * Gera as linhas de preview para a sincronização com o Gerenciamento de Usuários
 */
export function generateSyncPreview(
  students: any[],
  gradebook: ClassGradebook,
  syncMode: 'additive' | 'replace' | 'only_with_grades'
): SyncPreviewRow[] {
  const rows: SyncPreviewRow[] = [];

  for (const student of students) {
    const studentId = student.uid || student.id;
    const record = gradebook.grades[studentId];
    const hasGrades = hasAnyGradesInYear(record);

    const currentXp = Number(student.xp) || 0;
    const currentRankDef = getRankForXp(currentXp, student.classId);
    const currentRank = currentRankDef?.name || 'Sem Patente';

    let calculatedXp = currentXp;

    if (syncMode === 'additive') {
      // Soma os bimestres lançados ao XP Base registrado ou ao XP prévio
      const bimSum = calculateBimestersSum(record, gradebook.weights);
      const baseXp = parseGradeValue(record?.baseXp);
      calculatedXp = Math.round(baseXp + bimSum);
    } else if (syncMode === 'replace') {
      // Substitui integralmente pelo total calculado na planilha
      calculatedXp = calculateStudentTotalXp(record, gradebook.weights, false);
    } else if (syncMode === 'only_with_grades') {
      // Se não tiver notas, preserva o atual
      if (hasGrades) {
        calculatedXp = calculateStudentTotalXp(record, gradebook.weights, true);
      } else {
        calculatedXp = currentXp;
      }
    }

    const newRankDef = getRankForXp(calculatedXp, student.classId);
    const newRank = newRankDef?.name || 'Sem Patente';
    const diffXp = calculatedXp - currentXp;

    // Se o modo for 'only_with_grades' e o aluno não tiver notas, desseleciona por padrão
    const isSelected = syncMode === 'only_with_grades' ? hasGrades : true;

    rows.push({
      studentId,
      studentName: student.name,
      currentXp,
      currentRank,
      calculatedXp,
      newRank,
      diffXp,
      hasGrades,
      selected: isSelected,
    });
  }

  return rows;
}

/**
 * Executa a sincronização em lote dos novos XPs para a tabela `users`
 */
export async function executeGradebookSync(
  // @ts-ignore
  tenantId: string,
  previewRows: SyncPreviewRow[],
  // @ts-ignore
  teacherEmail?: string
): Promise<{ success: boolean; updatedCount: number; error?: string }> {
  try {
    const selectedRows = previewRows.filter(r => r.selected);
    if (selectedRows.length === 0) {
      return { success: true, updatedCount: 0 };
    }

    let updatedCount = 0;

    for (const row of selectedRows) {
      let query = supabase
        .from('users')
        .update({
          xp: row.calculatedXp,
          rank: row.newRank,
        })
        .eq('id', row.studentId);

      if (tenantId) {
        query = query.eq('tenant_id', tenantId);
      }

      const { error: userError } = await query;

      if (!userError) {
        updatedCount++;
        // Se houve alteração de XP, registra no histórico xp_logs para auditoria do professor
        if (row.diffXp !== 0) {
          try {
            await supabase.from('xp_logs').insert({
              student_id: row.studentId,
              amount: row.diffXp,
              reason: `Planilha de Notas | Sincronização Bimestral (${row.diffXp > 0 ? '+' : ''}${row.diffXp} XP)${teacherEmail ? ` por ${teacherEmail}` : ''}`,
            });
          } catch (logErr) {
            console.warn('Não foi possível gravar xp_log:', logErr);
          }
        }
      }
    }

    return { success: true, updatedCount };
  } catch (err: any) {
    console.error('Erro na sincronização de notas:', err);
    return { success: false, updatedCount: 0, error: err?.message || 'Erro ao sincronizar.' };
  }
}

/**
 * Exporta a planilha da turma para formato XLSX real idêntico ao modelo
 */
export function exportGradebookToExcel(
  className: string,
  students: any[],
  gradebook: ClassGradebook
) {
  const wb = XLSX.utils.book_new();

  // Cabeçalhos
  const headers = [
    'Nº', 'Nome do Aluno',
    '1º Bim - P1', '1º Bim - P2', '1º Bim - TB1', '1º Bim - TB2', '1º Bim - Extra', '1º Bim - Total XP',
    '2º Bim - P1', '2º Bim - P2', '2º Bim - TB1', '2º Bim - TB2', '2º Bim - Extra', '2º Bim - Total XP',
    '3º Bim - P1', '3º Bim - P2', '3º Bim - TB1', '3º Bim - TB2', '3º Bim - Extra', '3º Bim - Total XP',
    '4º Bim - P1', '4º Bim - P2', '4º Bim - TB1', '4º Bim - TB2', '4º Bim - Extra', '4º Bim - Total XP',
    'XP Base / Anterior', 'XP Total Anual', 'Patente'
  ];

  const rows: any[][] = [headers];

  students.forEach((student, idx) => {
    const studentId = student.uid || student.id;
    const rec: StudentGradeRecord = gradebook.grades[studentId] || {
      studentId,
      studentName: student.name,
      b1: {},
      b2: {},
      b3: {},
      b4: {},
      baseXp: 0
    };
    const b1 = rec.b1 || {};
    const b2 = rec.b2 || {};
    const b3 = rec.b3 || {};
    const b4 = rec.b4 || {};

    const b1Xp = calculateBimesterXp(b1, gradebook.weights);
    const b2Xp = calculateBimesterXp(b2, gradebook.weights);
    const b3Xp = calculateBimesterXp(b3, gradebook.weights);
    const b4Xp = calculateBimesterXp(b4, gradebook.weights);
    const totalXp = calculateStudentTotalXp(rec, gradebook.weights, true);
    const rankDef = getRankForXp(totalXp, student.classId);

    rows.push([
      idx + 1,
      student.name,
      b1.p1 ?? '', b1.p2 ?? '', b1.tb1 ?? '', b1.tb2 ?? '', b1.extra ?? '', b1Xp,
      b2.p1 ?? '', b2.p2 ?? '', b2.tb1 ?? '', b2.tb2 ?? '', b2.extra ?? '', b2Xp,
      b3.p1 ?? '', b3.p2 ?? '', b3.tb1 ?? '', b3.tb2 ?? '', b3.extra ?? '', b3Xp,
      b4.p1 ?? '', b4.p2 ?? '', b4.tb1 ?? '', b4.tb2 ?? '', b4.extra ?? '', b4Xp,
      rec.baseXp ?? 0,
      totalXp,
      rankDef?.name || 'Sem Patente'
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(rows);

  // Ajuste de largura das colunas
  ws['!cols'] = [
    { wch: 4 },  // Nº
    { wch: 28 }, // Nome
    { wch: 11 }, { wch: 11 }, { wch: 11 }, { wch: 11 }, { wch: 12 }, { wch: 14 }, // B1
    { wch: 11 }, { wch: 11 }, { wch: 11 }, { wch: 11 }, { wch: 12 }, { wch: 14 }, // B2
    { wch: 11 }, { wch: 11 }, { wch: 11 }, { wch: 11 }, { wch: 12 }, { wch: 14 }, // B3
    { wch: 11 }, { wch: 11 }, { wch: 11 }, { wch: 11 }, { wch: 12 }, { wch: 14 }, // B4
    { wch: 16 }, { wch: 15 }, { wch: 18 } // Totais
  ];

  XLSX.utils.book_append_sheet(wb, ws, className.slice(0, 31) || 'Notas');
  XLSX.writeFile(wb, `Planilha_Notas_${className.replace(/[^a-zA-Z0-9_-]/g, '_')}.xlsx`);
}
