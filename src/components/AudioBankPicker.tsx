import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Search, Music, Volume2, Globe, Building2 } from 'lucide-react';
import { useTenant } from '../contexts/TenantContext';
import { fetchAudioBank, AUDIO_CATEGORIES, type AudioBankEntry } from '../lib/audioBank';

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
  const [category, setCategory] = useState(categoryFilter);

  useEffect(() => {
    if (!open) return;
    fetchAudioBank(tenantId).then(setEntries);
    setCategory(categoryFilter);
  }, [open, tenantId, categoryFilter]);

  useEffect(() => {
    if (!open) { setPlayingUrl(''); return; }
    return () => { setPlayingUrl(''); };
  }, [open]);

  const filtered = entries.filter(e => {
    const matchesCat = !category || !e.category || e.category === category;
    const matchesGender = !genderFilter || !e.gender || e.gender === genderFilter;
    const matchesSearch = !search || e.name.toLowerCase().includes(search.toLowerCase());
    return matchesCat && matchesGender && matchesSearch;
  });

  if (!open) return null;

  const togglePlay = (url: string) => {
    if (playingUrl === url) {
      setPlayingUrl('');
      return;
    }
    setPlayingUrl(url);
    try {
      const a = new Audio(url);
      a.volume = 0.8;
      a.play().catch(() => {});
      a.onended = () => setPlayingUrl('');
    } catch (e) {}
  };

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300000, padding: '1rem' }}>
      <div className="glass-panel" style={{ width: '700px', maxWidth: '95vw', maxHeight: '90vh', padding: '1.5rem', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.4rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--gold-primary)' }}>
            <Volume2 /> {title}
          </h2>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer' }}><X size={24} /></button>
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