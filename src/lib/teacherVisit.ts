import { supabase } from './supabase';

/**
 * Sistema de VISITAS DO PROFESSOR — coordenado por estado central no banco.
 *
 * A lógica anterior usava "slots por relógio" (hash do uid), o que fazia o
 * professor aparecer em DUAS telas ao mesmo tempo quando os slots colidiam.
 *
 * Agora há um único estado por escola (system_collections) indicando QUEM está
 * sendo visitado agora. O "motor" roda no cliente do PROFESSOR (AuthContext) e:
 *   1. Sorteia UM aluno online
 *   2. Grava no banco (teacher_uid, target_uid, started_at)
 *   3. Espera ~60s
 *   4. Sorteia OUTRO (excluindo o último visitado)
 *   5. Repete — o professor NUNCA para, e só UMA tela por vez mostra o passeio.
 */

const COLLECTION = 'settings';
const DOC = 'teacher_visit';

export interface TeacherVisit {
  teacherUid: string;
  teacherName: string;
  targetUid: string;
  startedAt: number; // epoch ms
}

const VISIT_DURATION_MS = 60 * 1000;

/** Lê o estado atual da visita desta escola */
export async function getTeacherVisit(tenantId?: string | null): Promise<TeacherVisit | null> {
  try {
    const q = supabase
      .from('system_collections')
      .select('*')
      .eq('collection_name', COLLECTION)
      .eq('doc_id', DOC);
    if (tenantId) {
      q.eq('tenant_id', tenantId);
    } else {
      q.is('tenant_id', null);
    }
    const { data, error } = await q.order('id', { ascending: false }).limit(1).maybeSingle();
    if (error || !data?.data) return null;
    return data.data as TeacherVisit;
  } catch (e) {
    return null;
  }
}

/** Grava (ou atualiza) a visita atual */
export async function setTeacherVisit(tenantId: string | null | undefined, visit: TeacherVisit): Promise<void> {
  try {
    // Remove linhas antigas para não acumular
    const del = supabase.from('system_collections').delete().eq('collection_name', COLLECTION).eq('doc_id', DOC);
    if (tenantId) {
      await del.eq('tenant_id', tenantId);
    } else {
      await del.is('tenant_id', null);
    }
    await supabase.from('system_collections').insert({
      collection_name: COLLECTION,
      doc_id: DOC,
      tenant_id: tenantId || null,
      data: visit,
    });
  } catch (e) {
    console.error('Erro ao gravar visita:', e);
  }
}

/**
 * "Motor" de visitas — roda no cliente do professor (qualquer tela).
 * Sorteia um aluno online e grava. Se a visita atual ainda está ativa (<60s),
 * não sorteia de novo (evita sobrescrever antes da hora).
 */
export async function runVisitEngine(
  teacherUid: string,
  teacherName: string,
  tenantId?: string | null,
): Promise<void> {
  try {
    const current = await getTeacherVisit(tenantId);

    // Se há uma visita ativa iniciada há menos de 60s, mantém (não sorteia)
    if (current && current.teacherUid === teacherUid && Date.now() - current.startedAt < VISIT_DURATION_MS) {
      return;
    }

    // Buscar alunos online da escola
    const cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: students } = await supabase
      .from('users')
      .select('id, name')
      .eq('tenant_id', tenantId)
      .eq('role', 'student')
      .gte('last_seen_at', cutoff);

    const online = (students || []).filter((s: any) => s.id !== teacherUid);
    if (online.length === 0) {
      // Ninguém online para visitar: limpa a visita
      await setTeacherVisit(tenantId, { teacherUid, teacherName, targetUid: '', startedAt: Date.now() });
      return;
    }

    // Sortear um alvo — evitar repetir o último imediatamente
    let candidates = online;
    if (current && current.targetUid) {
      const withoutLast = online.filter((s: any) => s.id !== current.targetUid);
      if (withoutLast.length > 0) candidates = withoutLast;
    }

    const chosen = candidates[Math.floor(Math.random() * candidates.length)] as any;
    await setTeacherVisit(tenantId, {
      teacherUid,
      teacherName,
      targetUid: chosen.id,
      startedAt: Date.now(),
    });
  } catch (e) {
    console.error('Erro no motor de visitas:', e);
  }
}