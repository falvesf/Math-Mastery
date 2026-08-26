import { useEffect, useRef, useState } from 'react';
import { Plus, Trash2, Edit2, Save, X, Globe, Building2, Volume2, Music } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '../lib/supabase';
import { useTenant } from '../contexts/TenantContext';
import { useDialog } from '../contexts/DialogContext';
import DirectUploadButton from './DirectUploadButton';
import AudioBankPicker from './AudioBankPicker';
import { fetchAudioBank, AUDIO_CATEGORIES, type AudioBankEntry } from '../lib/audioBank';
import { sessionCache, CACHE_KEYS } from '../lib/sessionCache';

export default function AudioBankManager() {
  const { tenantId, isSuperAdmin } = useTenant();
  const { showAlert, showConfirm } = useDialog();
  const [entries, setEntries] = useState<AudioBankEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // Player de teste: guarda o áudio atual e a URL tocando (toggle play/stop)
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const [playingUrl, setPlayingUrl] = useState('');

  // Para o áudio ao desmontar
  useEffect(() => {
    return () => { if (previewAudioRef.current) { previewAudioRef.current.pause(); previewAudioRef.current = null; } };
  }, []);

  // Editor
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [category, setCategory] = useState('effect');
  const [gender, setGender] = useState('');

  // Sons de dano do personagem (global, por gênero)
  const [playerDamageMale, setPlayerDamageMale] = useState('');
  const [playerDamageFemale, setPlayerDamageFemale] = useState('');
  const [damagePickerFor, setDamagePickerFor] = useState<'male' | 'female' | null>(null);

  // Sons globais de batalha
  const [victorySound, setVictorySound] = useState('');
  const [deathMaleSound, setDeathMaleSound] = useState('');
  const [deathFemaleSound, setDeathFemaleSound] = useState('');
  const [failSound, setFailSound] = useState('');
  const [punchSound, setPunchSound] = useState('');
  const [fatalFallSound, setFatalFallSound] = useState('');
  const [fatalEvaporateSound, setFatalEvaporateSound] = useState('');
  const [fatalSliceSound, setFatalSliceSound] = useState('');
  const [fatalExplodeSound, setFatalExplodeSound] = useState('');
  const [battlePickerFor, setBattlePickerFor] = useState<'victory' | 'deathMale' | 'deathFemale' | 'fail' | 'punch' | 'fatalFall' | 'fatalEvaporate' | 'fatalSlice' | 'fatalExplode' | null>(null);

  const load = async () => {
    setLoading(true);
    const list = await fetchAudioBank(tenantId);
    setEntries(list);
    // Sons globais de dano do personagem (mescla duplicatas antigas, a última sobrescreve)
    const { data } = await supabase.from('system_collections').select('data').eq('collection_name', 'audio').eq('doc_id', 'player_damage_sounds');
    let d: any = {};
    (data || []).forEach(r => d = { ...d, ...(r.data || {}) });
    setPlayerDamageMale(d.male || '');
    setPlayerDamageFemale(d.female || '');
    // Sons globais de batalha (mescla duplicatas antigas)
    const { data: battleData } = await supabase.from('system_collections').select('data').eq('collection_name', 'audio').eq('doc_id', 'battle_sounds');
    let b: any = {};
    (battleData || []).forEach(r => b = { ...b, ...(r.data || {}) });
    setVictorySound(b.victory || '');
    setDeathMaleSound(b.deathMale || '');
    setDeathFemaleSound(b.deathFemale || '');
    setFailSound(b.fail || '');
    setPunchSound(b.punch || '');
    setFatalFallSound(b.fatalFall || '');
    setFatalEvaporateSound(b.fatalEvaporate || '');
    setFatalSliceSound(b.fatalSlice || '');
    setFatalExplodeSound(b.fatalExplode || '');
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [tenantId]);

  const openNew = () => {
    setEditingId(null); setName(''); setUrl(''); setCategory('effect'); setGender('');
    setIsEditing(true);
  };
  const openEdit = (e: AudioBankEntry) => {
    setEditingId(e.id); setName(e.name); setUrl(e.url); setCategory(e.category || 'effect'); setGender(e.gender || '');
    setIsEditing(true);
  };

  const saveEntry = async () => {
    let finalName = name.trim();
    if (!url.trim()) { showAlert('Preencha a URL do áudio.'); return; }
    // Se o nome estiver vazio, deriva do nome do arquivo na URL
    if (!finalName) {
      try {
        const seg = url.trim().split('/').pop() || '';
        finalName = decodeURIComponent(seg).replace(/\.[^.]+$/, '') || 'Áudio';
      } catch (e) { finalName = 'Áudio'; }
    }
    if (!finalName) { showAlert('Preencha o nome do áudio.'); return; }
    const data: any = {
      name: finalName,
      url: url.trim(),
      category,
      gender: gender || null,
      tenant_id: tenantId || null,
      is_global: false,
    };
    if (editingId) {
      const editing = entries.find(e => e.id === editingId);
      if (editing?._isGlobal && !isSuperAdmin) { showAlert('Áudios globais só podem ser editados pelo superadmin.'); return; }
      const { error } = await supabase.from('audio_bank').update(data).eq('id', editingId);
      if (error) { console.error(error); showAlert('Erro ao atualizar: ' + error.message); return; }
    } else {
      const { error } = await supabase.from('audio_bank').insert({ id: uuidv4(), ...data });
      if (error) { console.error(error); showAlert('Erro ao salvar: ' + error.message); return; }
    }
    sessionCache.invalidate(CACHE_KEYS.audioBank(tenantId));
    setIsEditing(false);
    await load();
  };

  const deleteEntry = async (entry: AudioBankEntry) => {
    if (entry._isGlobal && !isSuperAdmin) { showAlert('Áudios globais só podem ser excluídos pelo superadmin.'); return; }
    if (await showConfirm(`Excluir o áudio "${entry.name}"?`)) {
      await supabase.from('audio_bank').delete().eq('id', entry.id);
      sessionCache.invalidate(CACHE_KEYS.audioBank(tenantId));
      await load();
    }
  };

  const savePlayerDamageSounds = async () => {
    const existing = await supabase.from('system_collections').select('id').eq('collection_name', 'audio').eq('doc_id', 'player_damage_sounds').limit(1);
    const payload = { collection_name: 'audio', doc_id: 'player_damage_sounds', data: { male: playerDamageMale || null, female: playerDamageFemale || null }, tenant_id: null };
    const { error } = existing.data && existing.data.length > 0
      ? await supabase.from('system_collections').update({ data: payload.data }).eq('id', existing.data[0].id)
      : await supabase.from('system_collections').insert(payload);
    if (error) { console.error(error); showAlert('Erro ao salvar: ' + error.message); return; }
    // Remove duplicatas antigas (do upsert sem conflito)
    await supabase.from('system_collections').delete().eq('collection_name', 'audio').eq('doc_id', 'player_damage_sounds').neq('id', existing.data && existing.data.length > 0 ? existing.data[0].id : '-1');
    showAlert('Sons de dano do personagem salvos!');
  };

  const saveBattleSounds = async () => {
    const existing = await supabase.from('system_collections').select('id').eq('collection_name', 'audio').eq('doc_id', 'battle_sounds').limit(1);
    const payload = {
      collection_name: 'audio',
      doc_id: 'battle_sounds',
      data: {
        victory: victorySound || null,
        deathMale: deathMaleSound || null,
        deathFemale: deathFemaleSound || null,
        fail: failSound || null,
        punch: punchSound || null,
        fatalFall: fatalFallSound || null,
        fatalEvaporate: fatalEvaporateSound || null,
        fatalSlice: fatalSliceSound || null,
        fatalExplode: fatalExplodeSound || null,
      },
      tenant_id: null,
    };
    const { error } = existing.data && existing.data.length > 0
      ? await supabase.from('system_collections').update({ data: payload.data }).eq('id', existing.data[0].id)
      : await supabase.from('system_collections').insert(payload);
    if (error) { console.error(error); showAlert('Erro ao salvar: ' + error.message); return; }
    // Remove duplicatas antigas (do upsert sem conflito)
    await supabase.from('system_collections').delete().eq('collection_name', 'audio').eq('doc_id', 'battle_sounds').neq('id', existing.data && existing.data.length > 0 ? existing.data[0].id : '-1');
    showAlert('Sons de batalha salvos!');
  };

const togglePlay = (u: string) => {
    // Se já está tocando este, para
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current = null;
      setPlayingUrl('');
      return;
    }
    if (!u) return;
    try {
      const a = new Audio(u);
      a.volume = 0.8;
      const done = () => { if (previewAudioRef.current === a) { previewAudioRef.current = null; setPlayingUrl(''); } };
      a.addEventListener('ended', done);
      a.addEventListener('error', done);
      previewAudioRef.current = a;
      setPlayingUrl(u);
      a.play().catch(() => done());
    } catch (e) {}
  };

  const genderBadge = (g: string) => g === 'male' ? '♂' : g === 'female' ? '♀' : '';

  return (
    <div className="glass-panel" style={{ padding: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Volume2 color="var(--gold-primary)" /> Banco de Áudio</h3>
          <p style={{ margin: '0.25rem 0 0 0', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Áudios globais (🌐) são somente leitura. Categorias: música, efeito, voz (com gênero).</p>
        </div>
        <button onClick={openNew} className="login-btn" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--gold-primary)', color: 'var(--text-on-gold, #000000)', border: 'none' }}><Plus size={18} /> Novo Áudio</button>
      </div>

      {isEditing && (
        <div style={{ background: 'rgba(0,0,0,0.25)', padding: '1rem', borderRadius: '10px', border: '1px solid var(--border-glass)', marginBottom: '1rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Nome (ex: Ataque Espada)" style={{ padding: '0.6rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', color: 'white' }} />
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <select value={category} onChange={e => setCategory(e.target.value)} style={{ padding: '0.6rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', color: 'white' }}>
                {AUDIO_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
              <select value={gender} onChange={e => setGender(e.target.value)} style={{ padding: '0.6rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', color: 'white' }}>
                <option value="">Gênero (neutro)</option>
                <option value="male">Masculino ♂</option>
                <option value="female">Feminino ♀</option>
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <input value={url} onChange={e => setUrl(e.target.value)} placeholder="URL do áudio..." style={{ flex: 1, padding: '0.6rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', color: 'white' }} />
            <DirectUploadButton folder="audio" accept="audio/*" onUploadComplete={setUrl} buttonStyle={{ minHeight: '100%', padding: '0 0.75rem' }} />
          </div>
          {url && <audio controls src={url} style={{ width: '100%', height: '40px', marginBottom: '0.75rem' }} />}
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
            <button onClick={() => setIsEditing(false)} style={{ padding: '0.5rem 1rem', borderRadius: '8px', cursor: 'pointer', background: 'transparent', border: '1px solid var(--border-glass)', color: 'var(--text-primary)' }}>Cancelar</button>
            <button onClick={saveEntry} style={{ padding: '0.5rem 1rem', borderRadius: '8px', cursor: 'pointer', background: 'var(--gold-primary)', color: '#000', border: 'none', fontWeight: 'bold' }}><Save size={16} /> Salvar</button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '1.5rem' }}>
        {loading ? (
          <p style={{ color: 'var(--text-secondary)' }}>Carregando...</p>
        ) : entries.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>Nenhum áudio cadastrado ainda.</p>
        ) : entries.map(entry => (
          <div key={entry.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0.75rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', border: '1px solid var(--border-glass)' }}>
            <Music size={16} color="var(--gold-primary)" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontWeight: 'bold' }}>{entry.name}</span>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginLeft: '0.5rem' }}>
                {AUDIO_CATEGORIES.find(c => c.value === entry.category)?.label || entry.category} {genderBadge(entry.gender || '')}
                {entry._isGlobal ? <Globe size={11} style={{ marginLeft: '0.4rem' }} /> : <Building2 size={11} style={{ marginLeft: '0.4rem' }} />}
              </span>
            </div>
<button onClick={() => togglePlay(entry.url)} style={{ padding: '0.3rem 0.6rem', background: playingUrl === entry.url ? 'rgba(245,158,11,0.3)' : 'var(--btn-bg)', border: '1px solid var(--border-glass)', borderRadius: '6px', cursor: 'pointer', color: playingUrl === entry.url ? 'var(--gold-primary)' : 'var(--text-primary)' }}>{playingUrl === entry.url ? '⏹' : '▶'}</button>
            <button onClick={() => openEdit(entry)} disabled={entry._isGlobal && !isSuperAdmin} style={{ padding: '0.3rem', background: 'transparent', border: 'none', color: '#60a5fa', cursor: 'pointer', opacity: entry._isGlobal && !isSuperAdmin ? 0.4 : 1 }}><Edit2 size={16} /></button>
            <button onClick={() => deleteEntry(entry)} disabled={entry._isGlobal && !isSuperAdmin} style={{ padding: '0.3rem', background: 'transparent', border: 'none', color: '#f87171', cursor: 'pointer', opacity: entry._isGlobal && !isSuperAdmin ? 0.4 : 1 }}><Trash2 size={16} /></button>
          </div>
        ))}
      </div>

      {/* Sons globais de dano do personagem por gênero */}
      <div style={{ borderTop: '1px solid var(--border-glass)', paddingTop: '1rem' }}>
        <h4 style={{ margin: '0 0 0.25rem 0', color: 'var(--gold-primary)' }}>Sons de Dano do Personagem (global)</h4>
        <p style={{ margin: '0 0 0.75rem 0', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
          Toca quando o jogador RECEBE dano na batalha, conforme o gênero do avatar. Aplica a todas as escolas.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
          {(['male', 'female'] as const).map(g => {
            const val = g === 'male' ? playerDamageMale : playerDamageFemale;
            const setVal = g === 'male' ? setPlayerDamageMale : setPlayerDamageFemale;
            return (
              <div key={g}>
                <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: '0.8rem', marginBottom: '0.3rem' }}>{g === 'male' ? 'Masculino ♂' : 'Feminino ♀'}</label>
                <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                  <input value={val} onChange={e => setVal(e.target.value)} placeholder="URL..." style={{ flex: 1, padding: '0.5rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', color: 'white' }} />
<button onClick={() => togglePlay(val)} disabled={!val} style={{ padding: '0.4rem 0.6rem', background: playingUrl === val ? 'rgba(245,158,11,0.3)' : 'var(--btn-bg)', border: '1px solid var(--border-glass)', borderRadius: '6px', cursor: val ? 'pointer' : 'not-allowed', opacity: val ? 1 : 0.4, color: playingUrl === val ? 'var(--gold-primary)' : 'var(--text-primary)' }} title="Ouvir">{playingUrl === val ? '⏹' : '▶'}</button>
                  <DirectUploadButton folder="audio" accept="audio/*" onUploadComplete={setVal} buttonStyle={{ padding: '0.35rem 0.6rem', background: 'rgba(139,92,246,0.15)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.4)', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 'bold' }}>Upload</DirectUploadButton>
                  <button onClick={() => setDamagePickerFor(g)} style={{ padding: '0.4rem 0.7rem', background: 'rgba(16,185,129,0.15)', color: '#10b981', border: '1px solid rgba(16,185,129,0.4)', borderRadius: '6px', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 'bold', whiteSpace: 'nowrap' }}>Banco</button>
                </div>
              </div>
            );
          })}
        </div>
        <button onClick={savePlayerDamageSounds} className="login-btn" style={{ background: 'var(--btn-bg)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', padding: '0.5rem 1.25rem' }}><Save size={16} /> Salvar Sons Globais</button>
      </div>

      {/* Sons globais de batalha */}
      <div style={{ borderTop: '1px solid var(--border-glass)', paddingTop: '1rem', marginTop: '1.5rem' }}>
        <h4 style={{ margin: '0 0 0.25rem 0', color: 'var(--gold-primary)' }}>Sons de Batalha (global)</h4>
        <p style={{ margin: '0 0 0.75rem 0', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
          Vitória (monstro derrotado), morte do jogador (golpe fatal) e falha da missão. Aplica a todas as escolas.
        </p>
        {([
          ['victory', '🎉 Som de Vitória', victorySound, setVictorySound, ''],
          ['deathMale', '💀 Morte do Jogador ♂', deathMaleSound, setDeathMaleSound, 'male'],
          ['deathFemale', '💀 Morte do Jogador ♀', deathFemaleSound, setDeathFemaleSound, 'female'],
          ['fail', '❌ Falha da Missão', failSound, setFailSound, ''],
          ['punch', '👊 Soco (sem arma)', punchSound, setPunchSound, ''],
          ['fatalFall', '💀 Fatalidade — Queda', fatalFallSound, setFatalFallSound, ''],
          ['fatalEvaporate', '💀 Fatalidade — Evaporar', fatalEvaporateSound, setFatalEvaporateSound, ''],
          ['fatalSlice', '💀 Fatalidade — Corte', fatalSliceSound, setFatalSliceSound, ''],
          ['fatalExplode', '💀 Fatalidade — Explosão', fatalExplodeSound, setFatalExplodeSound, ''],
        ] as const).map(([key, label, val, setVal, gender]) => (
          <div key={key} style={{ display: 'flex', gap: '0.35rem', alignItems: 'center', marginBottom: '0.5rem' }}>
            <label style={{ width: '180px', color: 'var(--text-secondary)', fontSize: '0.8rem', flexShrink: 0 }}>{label}</label>
            <input value={val} onChange={e => setVal(e.target.value)} placeholder="URL..." style={{ flex: 1, padding: '0.45rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', color: 'white' }} />
<button onClick={() => togglePlay(val)} disabled={!val} style={{ padding: '0.35rem 0.55rem', background: playingUrl === val ? 'rgba(245,158,11,0.3)' : 'var(--btn-bg)', border: '1px solid var(--border-glass)', borderRadius: '6px', cursor: val ? 'pointer' : 'not-allowed', opacity: val ? 1 : 0.4, color: playingUrl === val ? 'var(--gold-primary)' : 'var(--text-primary)' }}>{playingUrl === val ? '⏹' : '▶'}</button>
            <DirectUploadButton folder="audio" accept="audio/*" onUploadComplete={setVal as (v: string) => void} buttonStyle={{ padding: '0.3rem 0.55rem', background: 'rgba(139,92,246,0.15)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.4)', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 'bold' }}>Upload</DirectUploadButton>
            <button onClick={() => setBattlePickerFor(key as any)} style={{ padding: '0.35rem 0.65rem', background: 'rgba(16,185,129,0.15)', color: '#10b981', border: '1px solid rgba(16,185,129,0.4)', borderRadius: '6px', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 'bold', whiteSpace: 'nowrap' }}>Banco</button>
          </div>
        ))}
        <button onClick={saveBattleSounds} className="login-btn" style={{ background: 'var(--btn-bg)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', padding: '0.5rem 1.25rem' }}><Save size={16} /> Salvar Sons de Batalha</button>
      </div>

      <AudioBankPicker
        open={damagePickerFor !== null}
        onClose={() => setDamagePickerFor(null)}
        onSelect={(url) => {
          if (damagePickerFor === 'male') setPlayerDamageMale(url);
          else if (damagePickerFor === 'female') setPlayerDamageFemale(url);
          setDamagePickerFor(null);
        }}
        categoryFilter="voice"
        genderFilter={damagePickerFor || ''}
        title={`Banco de Áudio — Som de Dano (${damagePickerFor === 'male' ? 'Masculino' : 'Feminino'})`}
      />

      <AudioBankPicker
        open={battlePickerFor !== null}
        onClose={() => setBattlePickerFor(null)}
        onSelect={(url) => {
          if (battlePickerFor === 'victory') setVictorySound(url);
          else if (battlePickerFor === 'deathMale') setDeathMaleSound(url);
          else if (battlePickerFor === 'deathFemale') setDeathFemaleSound(url);
          else if (battlePickerFor === 'fail') setFailSound(url);
          else if (battlePickerFor === 'punch') setPunchSound(url);
          else if (battlePickerFor === 'fatalFall') setFatalFallSound(url);
          else if (battlePickerFor === 'fatalEvaporate') setFatalEvaporateSound(url);
          else if (battlePickerFor === 'fatalSlice') setFatalSliceSound(url);
          else if (battlePickerFor === 'fatalExplode') setFatalExplodeSound(url);
          setBattlePickerFor(null);
        }}
        categoryFilter={battlePickerFor === 'victory' || battlePickerFor === 'fail' ? '' : 'voice'}
        genderFilter={battlePickerFor === 'deathMale' ? 'male' : battlePickerFor === 'deathFemale' ? 'female' : ''}
        title="Banco de Áudio — Som de Batalha"
      />
    </div>
  );
}