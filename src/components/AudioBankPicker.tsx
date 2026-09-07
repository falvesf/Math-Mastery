import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Search, Music, Volume2, Globe, Building2, Loader2, Plus } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '../lib/supabase';
import { useTenant } from '../contexts/TenantContext';
import { fetchAudioBank, AUDIO_CATEGORIES, type AudioBankEntry } from '../lib/audioBank';
import { sessionCache, CACHE_KEYS } from '../lib/sessionCache';
import DirectUploadButton from './DirectUploadButton';

interface AudioBankPickerProps {
  open: boolean;
  onClose: () => void;
  onSelect: (url: string, name: string) => void;
  categoryFilter?: string; // 'music' | 'effect' | 'voice' | ''
  genderFilter?: string;   // 'male' | 'female' | ''
  title?: string;
}

export default function AudioBankPicker({ open, onClose, onSelect, categoryFilter = '', genderFilter = '', title = 'Banco de Áudio' }: AudioBankPickerProps) {
  const { tenantId } = useTenant();
  const [entries, setEntries] = useState<AudioBankEntry[]>([]);
  const [search, setSearch] = useState('');
  const [playingUrl, setPlayingUrl] = useState('');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [category, setCategory] = useState(categoryFilter);
  // Cadastro rápido de um áudio NOVO (sem sair do picker)
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newCategory, setNewCategory] = useState(categoryFilter || 'effect');
  const [newGender, setNewGender] = useState('');
  const [newSaving, setNewSaving] = useState(false);
  const [newError, setNewError] = useState('');

  useEffect(() => {
    if (!open) return;
    fetchAudioBank(tenantId).then(setEntries);
    setCategory(categoryFilter);
  }, [open, tenantId, categoryFilter]);

  useEffect(() => {
    const stop = () => { if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; } };
    if (!open) { stop(); setPlayingUrl(''); return; }
    return () => { stop(); setPlayingUrl(''); };
  }, [open]);

  const filtered = entries.filter(e => {
    const matchesCat = !category || !e.category || e.category === category;
    const matchesGender = !genderFilter || !e.gender || e.gender === genderFilter;
    const matchesSearch = !search || e.name.toLowerCase().includes(search.toLowerCase());
    return matchesCat && matchesGender && matchesSearch;
  });

  if (!open) return null;

  const togglePlay = (url: string) => {
    // Para qualquer áudio em reprodução (evita sobreposição)
    const stopCurrent = () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
    if (playingUrl === url) {
      stopCurrent();
      setPlayingUrl('');
      return;
    }
    stopCurrent();
    setPlayingUrl(url);
    try {
      const a = new Audio(url);
      a.volume = 0.8;
      a.onended = () => { setPlayingUrl(''); if (audioRef.current === a) audioRef.current = null; };
      a.onerror = () => { setPlayingUrl(''); if (audioRef.current === a) audioRef.current = null; };
      audioRef.current = a;
      a.play().catch(() => { setPlayingUrl(''); audioRef.current = null; });
    } catch (e) {}
  };

  const saveNewAudio = async () => {
    let finalName = newName.trim();
    if (!newUrl.trim()) { setNewError('Envie o arquivo de áudio (Upload) antes de salvar.'); return; }
    if (!finalName) {
      try {
        const seg = newUrl.trim().split('/').pop() || '';
        finalName = decodeURIComponent(seg).replace(/\.[^.]+$/, '') || 'Áudio';
      } catch (e) { finalName = 'Áudio'; }
    }
    if (!finalName.trim()) { setNewError('Preencha o nome do áudio.'); return; }
    setNewSaving(true);
    setNewError('');
    const data = {
      id: uuidv4(),
      name: finalName.trim(),
      url: newUrl.trim(),
      category: newCategory,
      gender: newGender || null,
      tenant_id: tenantId || null,
      is_global: false,
    };
    try {
      const { error } = await supabase.from('audio_bank').insert(data);
      if (error) { console.error(error); setNewError('Erro ao salvar: ' + error.message); setNewSaving(false); return; }
      sessionCache.invalidate(CACHE_KEYS.audioBank(tenantId));
      const fresh = await fetchAudioBank(tenantId);
      setEntries(fresh);
      setShowNewForm(false);
      setNewName(''); setNewUrl(''); setNewGender('');
      onSelect(newUrl.trim(), data.name);
    } catch (e: any) {
      console.error(e);
      setNewError('Erro ao salvar: ' + (e?.message || 'erro desconhecido'));
    } finally {
      setNewSaving(false);
    }
  };

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000000, padding: '1rem' }}>
      <div className="glass-panel" style={{ width: '700px', maxWidth: '95vw', maxHeight: '90vh', padding: '1.5rem', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.4rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--gold-primary)' }}>
            <Volume2 /> {title}
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button
              onClick={() => { setShowNewForm(v => !v); setNewError(''); }}
              style={{ padding: '0.45rem 0.8rem', background: 'rgba(139,92,246,0.2)', color: '#c084fc', border: '1px solid rgba(139,92,246,0.5)', borderRadius: '8px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '0.35rem', whiteSpace: 'nowrap' }}
            >
              <Plus size={16} /> {showNewForm ? 'Fechar' : 'Novo Áudio'}
            </button>
            <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer' }}><X size={24} /></button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'rgba(0,0,0,0.3)', padding: '0.4rem 0.7rem', borderRadius: '8px', border: '1px solid var(--border-glass)' }}>
            <Search size={16} color="var(--text-secondary)" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar áudio..." style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'white' }} />
          </div>
          <select value={category} onChange={e => setCategory(e.target.value)} style={{ padding: '0.4rem 0.7rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', color: 'white' }}>
            <option value="">Todas as categorias</option>
            {AUDIO_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>

        {showNewForm && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '1rem', padding: '0.75rem', background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.4)', borderRadius: '10px' }}>
            <div style={{ fontWeight: 'bold', color: '#c084fc', fontSize: '0.9rem' }}>Cadastrar novo áudio</div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nome (vazio = nome do arquivo)" style={{ flex: '1 1 200px', padding: '0.45rem 0.6rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', color: 'white' }} />
              <select value={newCategory} onChange={e => setNewCategory(e.target.value)} style={{ padding: '0.45rem 0.6rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', color: 'white' }}>
                {AUDIO_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
              <select value={newGender} onChange={e => setNewGender(e.target.value)} style={{ padding: '0.45rem 0.6rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', color: 'white' }}>
                <option value="">Gênero: Qualquer</option>
                <option value="male">♂ Masculino</option>
                <option value="female">♀ Feminino</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <input value={newUrl} onChange={e => setNewUrl(e.target.value)} placeholder="URL do áudio (ou use Upload)" style={{ flex: 1, minWidth: '160px', padding: '0.45rem 0.6rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', color: 'white' }} />
              <DirectUploadButton folder="audio" accept="audio/*" onUploadComplete={setNewUrl} buttonStyle={{ padding: '0.4rem 0.7rem', background: 'rgba(139,92,246,0.2)', color: '#c084fc', border: '1px solid rgba(139,92,246,0.5)', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 'bold' }}>Upload</DirectUploadButton>
              <button onClick={() => togglePlay(newUrl)} disabled={!newUrl} style={{ padding: '0.4rem 0.6rem', background: 'var(--btn-bg)', border: '1px solid var(--border-glass)', borderRadius: '6px', cursor: newUrl ? 'pointer' : 'not-allowed', opacity: newUrl ? 1 : 0.4, color: 'white' }} title="Ouvir">{playingUrl === newUrl ? '⏹' : '▶'}</button>
            </div>
            {newError && <div style={{ color: '#ef4444', fontSize: '0.78rem' }}>{newError}</div>}
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowNewForm(false); setNewError(''); }} style={{ padding: '0.45rem 1rem', background: 'transparent', border: '1px solid var(--border-glass)', borderRadius: '8px', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.8rem' }}>Cancelar</button>
              <button onClick={saveNewAudio} disabled={newSaving} style={{ padding: '0.45rem 1.2rem', background: 'rgba(139,92,246,0.35)', color: '#fff', border: '1px solid #8b5cf6', borderRadius: '8px', cursor: newSaving ? 'not-allowed' : 'pointer', fontWeight: 'bold', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.35rem', opacity: newSaving ? 0.6 : 1 }}>
                {newSaving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} {newSaving ? 'Salvando...' : 'Salvar e Usar'}
              </button>
            </div>
          </div>
        )}

        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {filtered.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)', fontStyle: 'italic', textAlign: 'center', padding: '2rem' }}>Nenhum áudio encontrado no banco.</p>
          ) : filtered.map(entry => (
            <div key={entry.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.6rem 0.8rem', background: 'rgba(0,0,0,0.25)', borderRadius: '8px', border: '1px solid var(--border-glass)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
                <Music size={18} color="var(--gold-primary)" style={{ flexShrink: 0 }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{entry.name}</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    {entry.category && <span>{AUDIO_CATEGORIES.find(c => c.value === entry.category)?.label || entry.category}</span>}
                    {entry.gender && <span>{entry.gender === 'male' ? '♂' : '♀'}</span>}
                    {entry._isGlobal ? <span title="Global"><Globe size={11} /></span> : <span title="Local"><Building2 size={11} /></span>}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.4rem', flexShrink: 0 }}>
                <button onClick={() => togglePlay(entry.url)} style={{ padding: '0.4rem 0.6rem', background: playingUrl === entry.url ? 'rgba(245,158,11,0.3)' : 'var(--btn-bg)', border: '1px solid var(--border-glass)', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem' }}>{playingUrl === entry.url ? '⏹' : '▶'}</button>
                <button onClick={() => onSelect(entry.url, entry.name)} style={{ padding: '0.4rem 0.8rem', background: 'rgba(16,185,129,0.2)', color: '#10b981', border: '1px solid rgba(16,185,129,0.5)', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold' }}>Usar</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}