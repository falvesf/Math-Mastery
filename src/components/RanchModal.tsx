import { useEffect, useMemo, useState } from 'react';
import { X, Heart, Droplet, Smile, Dumbbell, Trophy, BookOpen, Utensils, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { fetchAnimalModels } from '../lib/model3d';
import {
  fetchPets, savePet, fetchRanch, upsertRanch, fetchRanchItems, computePet, feedPet,
  withHistory, relationshipName, RELATIONSHIP_LEVELS, type Pet,
} from '../lib/pets';
import Ranch3D, { type RanchPetView } from './Ranch3D';

interface RanchModalProps {
  isOpen: boolean;
  onClose: () => void;
  userData: any;
}

const BARS = [
  { key: 'hunger', label: 'Fome', color: '#ef4444', Icon: Utensils },
  { key: 'thirst', label: 'Sede', color: '#3b82f6', Icon: Droplet },
  { key: 'interaction', label: 'Interação', color: '#eab308', Icon: Smile },
  { key: 'training', label: 'Treinamento', color: '#22c55e', Icon: Dumbbell },
] as const;

export default function RanchModal({ isOpen, onClose, userData }: RanchModalProps) {
  const [pets, setPets] = useState<Pet[]>([]);
  const [models, setModels] = useState<any[]>([]);
  const [ranch, setRanch] = useState<{ water_level: number; water_updated_at: string } | null>(null);
  const [ranchItems, setRanchItems] = useState<{ id: string; kind: string; level: number }[]>([]);
  const [feedItems, setFeedItems] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  const uid = userData?.uid;
  const tenantId = userData?.tenantId || null;

  const load = async () => {
    if (!uid) return;
    setLoading(true);
    try {
      const [p, m, r, ri] = await Promise.all([
        fetchPets(uid),
        fetchAnimalModels(tenantId).catch(() => []),
        fetchRanch(uid),
        fetchRanchItems(uid),
      ]);
      setPets(p); setModels(m); setRanch(r); setRanchItems(ri);
      // Itens de RAÇÃO do jogador (pet_feed)
      const { data: inv } = await supabase.from('user_items').select('id, item_id, data, quantity').eq('student_id', uid).eq('equipped', false);
      const storeIds = Array.from(new Set((inv || []).map((i: any) => i.item_id).filter(Boolean)));
      let feedStore: any[] = [];
      if (storeIds.length) {
        const { data: store } = await supabase.from('store_items').select('id, name, data').in('id', storeIds);
        feedStore = (store || []).filter((s: any) => (s.data?.gameEffect) === 'pet_feed');
      }
      const feed = (inv || []).map((i: any) => {
        const st = feedStore.find((s: any) => s.id === i.item_id);
        if (!st) return null;
        return { userItemId: i.id, itemId: i.item_id, title: st.name || st.data?.title || i.item_id, feedHours: Number(st.data?.feedHours) || 1, imageUrl: st.data?.imageUrl || '' };
      }).filter(Boolean);
      setFeedItems(feed);
      if (!selectedId && p.length) setSelectedId(p[0].id);
    } finally { setLoading(false); }
  };

  useEffect(() => { if (isOpen) load(); /* eslint-disable-next-line */ }, [isOpen, uid]);

  const now = Date.now();
  const computed = useMemo(() => {
    const map = new Map<string, ReturnType<typeof computePet>>();
    for (const p of pets) map.set(p.id, computePet(p, now));
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pets]);

  const modelById = useMemo(() => {
    const m = new Map<string, any>();
    for (const mm of models) m.set(String(mm.id), mm);
    return m;
  }, [models]);

  const petViews: RanchPetView[] = pets.filter(p => p.state !== 'ran_away').map(p => {
    const mm = p.animal_model_id ? modelById.get(String(p.animal_model_id)) : null;
    const isModel = (u?: string) => !!u && /\.(glb|gltf)(\?|$)/i.test(u);
    const modelUrl = (mm?.url && isModel(mm.url)) ? mm.url : '';
    const cfg = mm?.config || {};
    const skinUrl = [cfg.customSkinUrl, mm?.url].find((u: string) => u && !isModel(u)) || '';
    const c = computed.get(p.id);
    return {
      id: p.id, name: p.name || p.species_name || 'Pet',
      modelUrl, skinUrl, slim: cfg.gender === 'female',
      state: p.state, angry: c?.suggested === 'angry', sad: c?.suggested === 'sad', selected: p.id === selectedId,
    };
  });

  const selected = pets.find(p => p.id === selectedId) || null;
  const sc = selected ? computed.get(selected.id) : null;

  const basicRanch = ranchItems.some(r => r.kind === 'food_trough') && ranchItems.some(r => r.kind === 'water_trough') && ranchItems.some(r => r.kind === 'hay');
  const waterLevel = ranch?.water_level ?? 100;

  const doFeed = async (feed: any) => {
    if (!selected) return;
    const fed = feedPet(selected, feed.feedHours, Date.now());
    const withH = withHistory(fed, 'record', `Alimentado com ${feed.title} (+${feed.feedHours}h de saciedade).`);
    setPets(prev => prev.map(p => p.id === selected.id ? withH : p));
    await savePet(withH);
    // Consome 1 unidade da ração
    try {
      const { data: row } = await supabase.from('user_items').select('quantity').eq('id', feed.userItemId).maybeSingle();
      const q = Math.max(0, (Number(row?.quantity) || 1) - 1);
      if (q <= 0) await supabase.from('user_items').delete().eq('id', feed.userItemId);
      else await supabase.from('user_items').update({ quantity: q }).eq('id', feed.userItemId);
    } catch { /* noop */ }
    setMsg(`🍖 ${selected.name || 'Pet'} comeu ${feed.title}.`);
    load();
  };

  const doWater = async () => {
    if (!selected || !sc) return;
    const p = { ...selected, thirst: 100, thirst_updated_at: new Date().toISOString() };
    const withH = withHistory(p, 'record', 'Bebeu água no bebedouro.');
    setPets(prev => prev.map(x => x.id === selected.id ? withH : x));
    await savePet(withH);
    await upsertRanch(uid, tenantId, { water_level: Math.max(0, waterLevel - 15), water_updated_at: new Date().toISOString() });
    setMsg(`💧 ${selected.name || 'Pet'} bebeu água.`);
    load();
  };

  const doInteract = async () => {
    if (!selected) return;
    const p = { ...selected, interaction: 100, interaction_updated_at: new Date().toISOString() };
    const withH = withHistory(p, 'record', 'Interagiu com o dono.');
    setPets(prev => prev.map(x => x.id === selected.id ? withH : x));
    await savePet(withH);
    setMsg(`😊 Você interagiu com ${selected.name || 'o pet'}.`);
    load();
  };

  if (!isOpen) return null;

  const heartBar = (value: number, color: string, Icon: any, label: string) => (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: 2 }}>
        <Icon size={13} color={color} /> {label} <span style={{ marginLeft: 'auto', color: 'var(--text-primary)', fontWeight: 600 }}>{Math.round(value)}%</span>
      </div>
      <div style={{ height: 10, background: 'rgba(255,255,255,0.08)', borderRadius: 6, overflow: 'hidden' }}>
        <div style={{ width: `${Math.max(0, Math.min(100, value))}%`, height: '100%', background: color, transition: 'width .3s' }} />
      </div>
    </div>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: 'min(1080px, 100%)', maxHeight: '94vh', overflow: 'auto', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 14, padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <h3 style={{ margin: 0, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>🐴 Rancho / Fazenda <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>({petViews.length} animais)</span></h3>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}><X size={20} /></button>
        </div>

        {!basicRanch && (
          <div style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 8, padding: '0.6rem', marginBottom: 10, color: '#fca5a5', fontSize: '0.82rem' }}>
            ⚠️ Rancho sem condições básicas (cocho de comida, bebedouro e palha). Sem isso você <b>não consegue domesticar</b> novos animais. Nível de água do bebedouro: <b>{Math.round(waterLevel)}%</b>.
          </div>
        )}

        {/* Cena 3D do rancho */}
        <Ranch3D pets={petViews} waterLevel={waterLevel} hasFood={ranchItems.some(r => r.kind === 'food_trough')} hasWater={ranchItems.some(r => r.kind === 'water_trough')} hasHay={ranchItems.some(r => r.kind === 'hay')} onSelectPet={setSelectedId} height={360} />

        {msg && <div style={{ marginTop: 8, color: '#86efac', fontSize: '0.82rem' }}>{msg}</div>}

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 280px) 1fr', gap: 14, marginTop: 14 }}>
          {/* Lista de pets */}
          <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 10, padding: 10, maxHeight: 360, overflowY: 'auto' }}>
            {loading ? <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Carregando…</div>
              : pets.length === 0 ? <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Nenhum animal domesticado ainda. Domesticar animais no mapa ainda virá na próxima fase.</div>
              : pets.map(p => {
                const c = computed.get(p.id);
                const on = p.id === selectedId;
                return (
                  <button key={p.id} onClick={() => setSelectedId(p.id)} style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8, padding: '0.5rem', borderRadius: 8, marginBottom: 6, cursor: 'pointer', border: on ? '1px solid var(--accent-primary)' : '1px solid var(--border-glass)', background: on ? 'rgba(59,130,246,0.15)' : 'transparent', color: 'var(--text-primary)' }}>
                    <span style={{ fontSize: '0.9rem', fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name || p.species_name || 'Pet'}</span>
                    <span style={{ fontSize: '0.66rem', color: 'var(--text-secondary)' }}>Nv.{p.level}</span>
                    {p.state === 'dead' && <span title="Morto">💀</span>}
                    {c?.suggested === 'angry' && <span title="Irritado">😠</span>}
                    {c?.suggested === 'sad' && <span title="Triste">😢</span>}
                    {c?.suggested === 'flee' && <span title="Pode fugir">🏃</span>}
                  </button>
                );
              })}
          </div>

          {/* Detalhes do pet selecionado */}
          <div>
            {!selected ? <div style={{ color: 'var(--text-secondary)' }}>Selecione um animal.</div> : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <h4 style={{ margin: '0 0 8px', color: 'var(--text-primary)' }}>{selected.name || selected.species_name} <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>({selected.species_name})</span></h4>
                  {/* Relacionamento */}
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: 2 }}>
                      <Heart size={13} color="#ec4899" /> Relacionamento <span style={{ marginLeft: 'auto', color: '#ec4899', fontWeight: 700 }}>Nv.{selected.relationship} · {relationshipName(selected.relationship)}</span>
                    </div>
                    <div style={{ height: 10, background: 'rgba(255,255,255,0.08)', borderRadius: 6, overflow: 'hidden' }}>
                      <div style={{ width: `${(selected.relationship / 5) * 100}%`, height: '100%', background: '#ec4899' }} />
                    </div>
                  </div>
                  {sc && heartBar(sc.hunger, '#ef4444', Utensils, 'Fome')}
                  {sc && heartBar(sc.thirst, '#3b82f6', Droplet, 'Sede')}
                  {sc && heartBar(sc.interaction, '#eab308', Smile, 'Interação')}
                  {heartBar(selected.training || 0, '#22c55e', Dumbbell, 'Treinamento')}

                  {/* Atributos */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 10, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                    <div>❤️ HP: <b style={{ color: 'var(--text-primary)' }}>{selected.stats?.hp ?? '-'}</b></div>
                    <div>⚔️ Ataque: <b style={{ color: 'var(--text-primary)' }}>{selected.stats?.attack ?? '-'}</b></div>
                    <div>🛡️ Defesa: <b style={{ color: 'var(--text-primary)' }}>{selected.stats?.defense ?? '-'}</b></div>
                    <div>💨 Evasão: <b style={{ color: 'var(--text-primary)' }}>{selected.stats?.evasion ?? '-'}</b></div>
                    <div>💥 Crítico: <b style={{ color: 'var(--text-primary)' }}>{selected.stats?.critChance ?? '-'}%</b></div>
                    <div>⚡ Vel. ataque: <b style={{ color: 'var(--text-primary)' }}>{selected.stats?.attackSpeed ?? '-'}</b></div>
                    <div>🏃 Vel. corrida: <b style={{ color: 'var(--text-primary)' }}>{selected.stats?.speed ?? '-'}</b></div>
                    <div>⭐ Nível: <b style={{ color: 'var(--text-primary)' }}>{selected.level}</b></div>
                  </div>

                  {/* Ações */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                    {feedItems.length > 0 ? feedItems.slice(0, 6).map((f: any) => (
                      <button key={f.userItemId} onClick={() => doFeed(f)} title={`${f.title} (+${f.feedHours}h)`} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0.4rem 0.7rem', borderRadius: 8, background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.4)', color: '#86efac', cursor: 'pointer', fontSize: '0.78rem' }}>
                        <Utensils size={14} /> Alimentar ({f.title})
                      </button>
                    )) : <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Sem ração no inventário.</span>}
                    <button onClick={doWater} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0.4rem 0.7rem', borderRadius: 8, background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.4)', color: '#93c5fd', cursor: 'pointer', fontSize: '0.78rem' }}><Droplet size={14} /> Dar água</button>
                    <button onClick={doInteract} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0.4rem 0.7rem', borderRadius: 8, background: 'rgba(234,179,8,0.15)', border: '1px solid rgba(234,179,8,0.4)', color: '#fde68a', cursor: 'pointer', fontSize: '0.78rem' }}><Smile size={14} /> Interagir</button>
                  </div>
                </div>

                {/* Histórico */}
                <div>
                  <h4 style={{ margin: '0 0 8px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}><BookOpen size={16} /> Histórico</h4>
                  <div style={{ maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {(selected.history || []).slice().reverse().map((h, i) => (
                      <div key={i} style={{ display: 'flex', gap: 6, fontSize: '0.76rem', color: 'var(--text-secondary)', background: h.type === 'achievement' ? 'rgba(251,191,36,0.10)' : 'rgba(255,255,255,0.04)', border: h.type === 'achievement' ? '1px solid rgba(251,191,36,0.35)' : '1px solid var(--border-glass)', borderRadius: 8, padding: '0.4rem 0.6rem' }}>
                        {h.type === 'achievement' ? <Trophy size={14} color="#fbbf24" style={{ flexShrink: 0, marginTop: 1 }} /> : <Check size={14} color="#86efac" style={{ flexShrink: 0, marginTop: 1 }} />}
                        <div>
                          <div style={{ color: h.type === 'achievement' ? '#fbbf24' : 'var(--text-primary)' }}>{h.text}</div>
                          <div style={{ fontSize: '0.66rem', opacity: 0.7 }}>{new Date(h.at).toLocaleString('pt-BR')}</div>
                        </div>
                      </div>
                    ))}
                    {(!selected.history || selected.history.length === 0) && <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Sem registros ainda.</div>}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
