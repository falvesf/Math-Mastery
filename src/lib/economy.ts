import { supabase } from './supabase';

export interface EconomySettings {
  currencyType: 'coins' | 'xp';
  coinsDropInCombat: boolean;
  coinsLostInCombat: boolean;
  coinsCanBuyItems: boolean;
  coinToXPRatio: number;
  rankUpChestEnabled: boolean;
  rankUpChestItems: { itemId: string; quantity: number }[];
}

export const DEFAULT_ECONOMY: EconomySettings = {
  currencyType: 'coins',
  coinsDropInCombat: false,
  coinsLostInCombat: false,
  coinsCanBuyItems: true,
  coinToXPRatio: 10,
  rankUpChestEnabled: false,
  rankUpChestItems: [],
};

/**
 * Busca as configurações de economia de uma escola específica.
 * Se não encontrar configurações da escola, retorna o padrão.
 */
export async function fetchEconomySettings(tenantId?: string | null): Promise<EconomySettings> {
  try {
    let query = supabase
      .from('system_collections')
      .select('*')
      .eq('collection_name', 'settings')
      .eq('doc_id', 'economy');

    if (tenantId) {
      query = query.eq('tenant_id', tenantId);
    } else {
      query = query.is('tenant_id', null);
    }

    // Pega apenas a mais recente para nunca falhar com múltiplas linhas
    const { data, error } = await query.order('id', { ascending: false }).limit(1).maybeSingle();

    if (error) {
      console.error('Erro ao buscar economia:', error);
      return DEFAULT_ECONOMY;
    }

    if (data?.data) {
      const d = data.data;
      return {
        currencyType: d.currencyType || 'coins',
        coinsDropInCombat: d.coinsDropInCombat ?? false,
        coinsLostInCombat: d.coinsLostInCombat ?? false,
        coinsCanBuyItems: d.coinsCanBuyItems ?? true,
        coinToXPRatio: d.coinToXPRatio ?? 10,
        rankUpChestEnabled: d.rankUpChestEnabled ?? false,
        rankUpChestItems: d.rankUpChestItems ?? [],
      };
    }

    return DEFAULT_ECONOMY;
  } catch (err) {
    console.error('Erro ao buscar economia:', err);
    return DEFAULT_ECONOMY;
  }
}

/**
 * Salva as configurações de economia de uma escola específica.
 * Quando há tenantId usa upsert com conflito; quando é null,
 * limpa as linhas globais antigas para não gerar duplicatas.
 */
export async function saveEconomySettings(tenantId: string | null | undefined, settings: EconomySettings): Promise<boolean> {
  try {
    if (tenantId) {
      const { error } = await supabase
        .from('system_collections')
        .upsert(
          {
            collection_name: 'settings',
            doc_id: 'economy',
            tenant_id: tenantId,
            data: settings,
          },
          { onConflict: 'collection_name,doc_id,tenant_id' }
        );

      if (error) {
        console.error('Erro ao salvar economia:', error);
        return false;
      }
      return true;
    }

    // Sem tenant (global) - limpar linhas null antigas para evitar duplicatas
    await supabase
      .from('system_collections')
      .delete()
      .eq('collection_name', 'settings')
      .eq('doc_id', 'economy')
      .is('tenant_id', null);

    const { error } = await supabase
      .from('system_collections')
      .insert({
        collection_name: 'settings',
        doc_id: 'economy',
        tenant_id: null,
        data: settings,
      });

    if (error) {
      console.error('Erro ao salvar economia:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Erro ao salvar economia:', err);
    return false;
  }
}

/**
 * Busca apenas o tipo de economia (moedas/XP) de uma escola.
 */
export async function fetchEconomyType(tenantId?: string | null): Promise<'coins' | 'xp'> {
  const settings = await fetchEconomySettings(tenantId);
  return settings.currencyType;
}