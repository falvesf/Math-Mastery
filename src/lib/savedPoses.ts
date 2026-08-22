import { supabase } from './supabase';
import type { CharacterPose } from '../components/AvatarCharacter';

export interface SavedPose {
  id: string;
  name: string;
  pose: CharacterPose;
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
 * Salva as poses da escola (substitui o conjunto inteiro).
 */
export async function saveSavedPoses(tenantId: string | null | undefined, poses: SavedPose[]): Promise<boolean> {
  try {
    // Remover linhas antigas para não acumular duplicatas
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
      data: { poses },
    });
    if (error) {
      console.error('Erro ao salvar poses:', error);
      return false;
    }
    return true;
  } catch (e) {
    console.error('Erro ao salvar poses:', e);
    return false;
  }
}