import { supabase } from './supabase';
import type { CharacterPose } from '../components/AvatarCharacter';

export interface SavedPose {
  id: string;
  name: string;
  pose: CharacterPose;
  updatedAt?: number;
}

/** Ação animada: sequência de frames (pose por frame) com loop e duração por frame */
export interface SavedAction {
  id: string;
  name: string;
  frames: CharacterPose[];
  loop?: boolean;
  durationPerFrame?: number; // segundos por frame
  updatedAt?: number;
}

const SETTINGS_COLLECTION = 'settings';
const SETTINGS_DOC = 'saved_poses';

/**
 * Busca as poses salvas da escola (banco compartilhado por tenant).
 */
export async function fetchSavedPoses(tenantId?: string | null): Promise<SavedPose[]> {
  try {
    const query = supabase
      .from('system_collections')
      .select('*')
      .eq('collection_name', SETTINGS_COLLECTION)
      .eq('doc_id', SETTINGS_DOC);

    if (tenantId) {
      query.eq('tenant_id', tenantId);
    } else {
      query.is('tenant_id', null);
    }

    const { data, error } = await query.order('id', { ascending: false }).limit(1).maybeSingle();
    if (error) {
      console.error('Erro ao buscar poses salvas:', error);
      return [];
    }
    const poses = data?.data?.poses;
    if (Array.isArray(poses)) return poses as SavedPose[];
    return [];
  } catch (e) {
    console.error('Erro ao buscar poses salvas:', e);
    return [];
  }
}

/**
 * Busca as AÇÕES salvas da escola (animações: sequência de frames).
 */
export async function fetchSavedActions(tenantId?: string | null): Promise<SavedAction[]> {
  try {
    const query = supabase
      .from('system_collections')
      .select('*')
      .eq('collection_name', SETTINGS_COLLECTION)
      .eq('doc_id', SETTINGS_DOC);

    if (tenantId) {
      query.eq('tenant_id', tenantId);
    } else {
      query.is('tenant_id', null);
    }

    const { data, error } = await query.order('id', { ascending: false }).limit(1).maybeSingle();
    if (error) {
      console.error('Erro ao buscar ações salvas:', error);
      return [];
    }
    const actions = data?.data?.actions;
    if (Array.isArray(actions)) return actions as SavedAction[];
    return [];
  } catch (e) {
    console.error('Erro ao buscar ações salvas:', e);
    return [];
  }
}

/**
 * Salva as poses E ações da escola (substitui o conjunto inteiro, preservando ambos).
 */
export async function saveSavedPoses(tenantId: string | null | undefined, poses: SavedPose[], actions: SavedAction[] = []): Promise<boolean> {
  try {
    const del = supabase
      .from('system_collections')
      .delete()
      .eq('collection_name', SETTINGS_COLLECTION)
      .eq('doc_id', SETTINGS_DOC);
    if (tenantId) {
      await del.eq('tenant_id', tenantId);
    } else {
      await del.is('tenant_id', null);
    }

    const { error } = await supabase.from('system_collections').insert({
      collection_name: SETTINGS_COLLECTION,
      doc_id: SETTINGS_DOC,
      tenant_id: tenantId || null,
      data: { poses, actions },
    });
    if (error) {
      console.error('Erro ao salvar poses/ações:', error);
      return false;
    }
    return true;
  } catch (e) {
    console.error('Erro ao salvar poses/ações:', e);
    return false;
  }
}

/** Salva apenas as AÇÕES (preservando as poses já existentes). */
export async function saveSavedActions(tenantId: string | null | undefined, actions: SavedAction[]): Promise<boolean> {
  try {
    const poses = await fetchSavedPoses(tenantId);
    return saveSavedPoses(tenantId, poses, actions);
  } catch (e) {
    console.error('Erro ao salvar ações:', e);
    return false;
  }
}