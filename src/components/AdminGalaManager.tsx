import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Award,
  Check,
  Crown,
  Film,
  Image as ImageIcon,
  Music,
  Play,
  Plus,
  Save,
  Search,
  Sparkles,
  Trash2,
  Trophy,
  Upload,
  Users,
  Volume2,
} from 'lucide-react';
import type { UserData } from '../contexts/AuthContext';
import { useTenant } from '../contexts/TenantContext';
import { useDialog } from '../contexts/DialogContext';
import { RANKS } from '../lib/ranks';
import {
  buildGalaSlides,
  createDefaultGalaConfig,
  createInitialsAvatarSvg,
  DEFAULT_MEDAL_OPTIONS,
  deleteGalaLocalAudio,
  formatXpPtBr,
  isStudentLegendary,
  loadGalaConfig,
  loadGalaLocalAudio,
  resolveLegendaryMinXp,
  resolveStudentPhoto,
  saveGalaConfig,
  saveGalaLocalAudio,
  type GalaConfig,
} from '../lib/gala';

interface AdminGalaManagerProps {
  students: UserData[];
  schoolClasses: { id: string; name: string }[];
}

type SubSection = 'geral' | 'lendarios' | 'especial' | 'melhores';

export default function AdminGalaManager({ students, schoolClasses }: AdminGalaManagerProps) {
  const navigate = useNavigate();
  const { tenantId, tenant } = useTenant();
  const { showAlert } = useDialog();

  const [subSection, setSubSection] = useState<SubSection>('geral');
  const [config, setConfig] = useState<GalaConfig>(() =>
    createDefaultGalaConfig(tenant?.name || 'Colégio Adventista de Ibiúna', 10000)
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'local'>('saved');
  const hasLoadedRef = React.useRef(false);
  const latestConfigRef = React.useRef(config);
  const latestTenantRef = React.useRef(tenantId || '');
  latestConfigRef.current = config;
  latestTenantRef.current = tenantId || '';

  // Áudios locais no IndexedDB
  const [localAudio1Name, setLocalAudio1Name] = useState<string>('');
  const [localAudio2Name, setLocalAudio2Name] = useState<string>('');

  // Filtros
  const [selectedClassFilter, setSelectedClassFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Form Medalha Especial
  const [specialStudentId, setSpecialStudentId] = useState<string>('');
  const [specialCustomName, setSpecialCustomName] = useState<string>('');
  const [specialSubtitle, setSpecialSubtitle] = useState<string>('');

  const defaultLegendaryXp = useMemo(() => {
    const r = RANKS.find(rk => rk.name.toLowerCase().includes('lend'));
    return r ? r.minXp : 10000;
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([
      loadGalaConfig(tenantId || '', tenant?.name || 'Colégio Adventista de Ibiúna', defaultLegendaryXp),
      loadGalaLocalAudio('moment1'),
      loadGalaLocalAudio('moment2'),
    ])
      .then(([loadedCfg, a1, a2]) => {
        if (!active) return;
        setConfig(loadedCfg);
        setLocalAudio1Name(a1?.name || '');
        setLocalAudio2Name(a2?.name || '');
        hasLoadedRef.current = true;
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [tenantId, tenant?.name, defaultLegendaryXp]);

  const studentsOnly = useMemo(() => students.filter(u => u.role === 'student'), [students]);
  const effectiveMinXp = useMemo(() => resolveLegendaryMinXp(config, RANKS), [config]);

  const sortedClasses = useMemo(
    () => [...schoolClasses].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { numeric: true, sensitivity: 'base' })),
    [schoolClasses]
  );

  const slidesPreview = useMemo(
    () => buildGalaSlides(config, students, schoolClasses, RANKS),
    [config, students, schoolClasses]
  );

  const legendaryCount = useMemo(
    () => slidesPreview.filter(s => s.type === 'student_lendario').length,
    [slidesPreview]
  );
  const bestCount = useMemo(
    () => slidesPreview.filter(s => s.type === 'student_melhor').length,
    [slidesPreview]
  );

  // Salvamento automático (debounced) sempre que houver qualquer alteração
  useEffect(() => {
    if (loading || !hasLoadedRef.current) return;
    setSaveStatus('saving');
    const timer = window.setTimeout(async () => {
      const ok = await saveGalaConfig(latestTenantRef.current, latestConfigRef.current);
      setSaveStatus(ok ? 'saved' : 'local');
    }, 500);
    return () => window.clearTimeout(timer);
  }, [config, loading]);

  // Garante que qualquer alteração pendente seja salva ao trocar de aba no Painel
  useEffect(() => {
    return () => {
      if (hasLoadedRef.current && latestTenantRef.current) {
        saveGalaConfig(latestTenantRef.current, latestConfigRef.current);
      }
    };
  }, []);

  const handleSave = async (silent = false) => {
    setSaving(true);
    setSaveStatus('saving');
    try {
      const ok = await saveGalaConfig(tenantId || '', config);
      setSaveStatus(ok ? 'saved' : 'local');
      if (!silent) {
        if (ok) {
          await showAlert('Configuração Salva', 'Os dados da Premiação de Gala foram salvos com sucesso!');
        } else {
          await showAlert('Salvo Localmente', 'A configuração foi salva no navegador (cache local).');
        }
      }
    } finally {
      setSaving(false);
    }
  };

  const handleStartPresentation = () => {
    // Salva em segundo plano e abre a apresentação imediatamente sem travar
    void saveGalaConfig(tenantId || '', config);
    navigate('/gala');
  };

  const handleAudioUpload = async (key: 'moment1' | 'moment2', file?: File | null) => {
    if (!file) return;
    const name = await saveGalaLocalAudio(key, file);
    if (key === 'moment1') setLocalAudio1Name(name);
    else setLocalAudio2Name(name);
  };

  const handleClearAudio = async (key: 'moment1' | 'moment2') => {
    await deleteGalaLocalAudio(key);
    if (key === 'moment1') {
      setLocalAudio1Name('');
      setConfig(prev => ({ ...prev, musicMoment1Url: '' }));
    } else {
      setLocalAudio2Name('');
      setConfig(prev => ({ ...prev, musicMoment2Url: '' }));
    }
  };

  const handleCustomPhotoUpload = (studentId: string, file?: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxSide = 320;
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.72);
          setConfig(prev => {
            const next = {
              ...prev,
              customPhotos: { ...prev.customPhotos, [studentId]: dataUrl },
            };
            setSaveStatus('saving');
            saveGalaConfig(latestTenantRef.current, next)
              .then(ok => setSaveStatus(ok ? 'saved' : 'local'))
              .catch(() => setSaveStatus('local'));
            return next;
          });
        }
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const toggleClassIncluded = (classId: string) => {
    setConfig(prev => {
      const allIds = sortedClasses.map(c => c.id);
      const current = prev.includedClassIds.length === 0 ? allIds : prev.includedClassIds;
      const exists = current.includes(classId);
      const next = exists ? current.filter(id => id !== classId) : [...current, classId];
      return {
        ...prev,
        includedClassIds: next.length === allIds.length ? [] : next,
      };
    });
  };

  const toggleLegendaryOverride = (student: UserData) => {
    const currentlyIncluded = isStudentLegendary(student, effectiveMinXp, config);
    setConfig(prev => {
      const excluded = new Set(prev.excludedLegendaryIds || []);
      const extra = new Set(prev.extraLegendaryIds || []);
      if (currentlyIncluded) {
        extra.delete(student.uid);
        excluded.add(student.uid);
      } else {
        excluded.delete(student.uid);
        extra.add(student.uid);
      }
      return {
        ...prev,
        excludedLegendaryIds: Array.from(excluded),
        extraLegendaryIds: Array.from(extra),
      };
    });
  };

  const toggleBestOfYear = (student: UserData) => {
    setConfig(prev => {
      const next = { ...prev.bestOfYear };
      if (next[student.uid]) {
        delete next[student.uid];
      } else {
        next[student.uid] = {
          studentId: student.uid,
          medalLabel: 'Medalha de Ouro',
          boletimAverage: '',
        };
      }
      return { ...prev, bestOfYear: next };
    });
  };

  const updateBestEntry = (studentId: string, patch: { medalLabel?: string; boletimAverage?: string }) => {
    setConfig(prev => {
      const current = prev.bestOfYear[studentId];
      if (!current) return prev;
      return {
        ...prev,
        bestOfYear: {
          ...prev.bestOfYear,
          [studentId]: { ...current, ...patch },
        },
      };
    });
  };

  const addSpecialMedal = () => {
    const selectedStudent = studentsOnly.find(s => s.uid === specialStudentId);
    const name = selectedStudent ? selectedStudent.name : specialCustomName.trim();
    if (!name) return;

    const className = selectedStudent
      ? sortedClasses.find(c => c.id === selectedStudent.classId || c.name === selectedStudent.classId)?.name || selectedStudent.classId || ''
      : '';

    setConfig(prev => ({
      ...prev,
      specialMedals: [
        ...prev.specialMedals,
        {
          id: `sm_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          studentId: selectedStudent?.uid,
          name,
          subtitle: specialSubtitle.trim() || className,
          photoUrl: selectedStudent ? resolveStudentPhoto(selectedStudent, prev) : undefined,
        },
      ],
    }));

    setSpecialStudentId('');
    setSpecialCustomName('');
    setSpecialSubtitle('');
  };

  const removeSpecialMedal = (id: string) => {
    setConfig(prev => ({
      ...prev,
      specialMedals: prev.specialMedals.filter(m => m.id !== id),
    }));
  };

  const classOrderMap = useMemo(() => {
    const map = new Map<string, number>();
    sortedClasses.forEach((c, idx) => {
      map.set(c.id, idx);
      map.set(c.name, idx);
    });
    return map;
  }, [sortedClasses]);

  const classCounts = useMemo(() => {
    const leg: Record<string, number> = {};
    const best: Record<string, number> = {};
    for (const cls of sortedClasses) {
      const inCls = studentsOnly.filter(s => s.classId === cls.id || s.classId === cls.name);
      leg[cls.id] = inCls.filter(s => isStudentLegendary(s, effectiveMinXp, config)).length;
      best[cls.id] = inCls.filter(s => !!config.bestOfYear[s.uid]).length;
    }
    return { leg, best };
  }, [sortedClasses, studentsOnly, effectiveMinXp, config]);

  const filteredStudents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const selectedCls = sortedClasses.find(c => c.id === selectedClassFilter);
    return studentsOnly
      .filter(s => {
        if (selectedClassFilter === 'all') return true;
        return s.classId === selectedClassFilter || (selectedCls ? s.classId === selectedCls.name : false);
      })
      .filter(s => !q || (s.name || '').toLowerCase().includes(q))
      .sort((a, b) => {
        const orderA = classOrderMap.get(a.classId || '') ?? 9999;
        const orderB = classOrderMap.get(b.classId || '') ?? 9999;
        if (orderA !== orderB) return orderA - orderB;
        return (a.name || '').localeCompare(b.name || '', 'pt-BR');
      });
  }, [studentsOnly, selectedClassFilter, searchQuery, sortedClasses, classOrderMap]);

  if (loading) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
        Carregando configurador da Premiação de Gala...
      </div>
    );
  }

  return (
    <div style={{ animation: 'fadeIn 0.3s ease-out', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Header da Gala */}
      <div
        className="glass-panel"
        style={{
          padding: '1.35rem 1.5rem',
          border: '1px solid rgba(239, 189, 57, 0.45)',
          background: 'linear-gradient(135deg, rgba(239, 189, 57, 0.12), rgba(15, 23, 42, 0.6))',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: '1.45rem', display: 'flex', alignItems: 'center', gap: '0.6rem', color: '#EFBD39' }}>
            <Trophy size={26} />
            Premiação de Gala — Fim de Ano
          </h2>
          <p style={{ margin: '0.35rem 0 0 0', color: 'var(--text-secondary)', fontSize: '0.92rem' }}>
            Apresentação cinematográfica no padrão do evento: <strong>Momento 1 (Os Lendários)</strong> + <strong>Top Ranking</strong> + <strong>Medalha Especial</strong> + <strong>Momento 2 (Os Melhores do Ano)</strong>.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <span
            style={{
              fontSize: '0.82rem',
              padding: '0.35rem 0.7rem',
              borderRadius: '999px',
              background: saveStatus === 'saving' ? 'rgba(239, 189, 57, 0.15)' : 'rgba(34, 197, 94, 0.14)',
              color: saveStatus === 'saving' ? '#EFBD39' : '#4ade80',
              border: saveStatus === 'saving' ? '1px solid rgba(239,189,57,0.4)' : '1px solid rgba(34,197,94,0.35)',
            }}
          >
            {saveStatus === 'saving' ? 'Salvando...' : saveStatus === 'saved' ? '✓ Salvo no banco' : '✓ Salvo localmente'}
          </span>

          <button
            className="login-btn"
            onClick={() => handleSave(false)}
            disabled={saving}
            style={{
              padding: '0.65rem 1.15rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              border: '1px solid var(--border-glass)',
              background: 'var(--bg-card)',
            }}
          >
            <Save size={17} />
            {saving ? 'Salvando...' : 'Salvar Configuração'}
          </button>

          <button
            className="login-btn"
            onClick={handleStartPresentation}
            style={{
              padding: '0.7rem 1.4rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              background: 'linear-gradient(135deg, #EFBD39, #A97B34)',
              color: '#000',
              fontWeight: 'bold',
              border: 'none',
              boxShadow: '0 4px 18px rgba(239, 189, 57, 0.35)',
            }}
          >
            <Play size={18} fill="#000" />
            Iniciar Apresentação de Gala ({slidesPreview.length} slides)
          </button>
        </div>
      </div>

      {/* Cards de resumo rápido */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.75rem' }}>
        <div className="glass-panel" style={{ padding: '0.9rem 1.1rem' }}>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Total de Slides</div>
          <div style={{ fontSize: '1.45rem', fontWeight: 'bold', color: '#EFBD39', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Film size={18} /> {slidesPreview.length}
          </div>
        </div>
        <div className="glass-panel" style={{ padding: '0.9rem 1.1rem' }}>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Lendários (Meta {formatXpPtBr(effectiveMinXp)} XP)</div>
          <div style={{ fontSize: '1.45rem', fontWeight: 'bold', color: '#a855f7', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Crown size={18} /> {legendaryCount}
          </div>
        </div>
        <div className="glass-panel" style={{ padding: '0.9rem 1.1rem' }}>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Medalha Especial</div>
          <div style={{ fontSize: '1.45rem', fontWeight: 'bold', color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Sparkles size={18} /> {config.specialMedals.length}
          </div>
        </div>
        <div className="glass-panel" style={{ padding: '0.9rem 1.1rem' }}>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Melhores do Ano</div>
          <div style={{ fontSize: '1.45rem', fontWeight: 'bold', color: '#22c55e', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Award size={18} /> {bestCount}
          </div>
        </div>
      </div>

      {/* Sub-abas do configurador */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        {[
          { key: 'geral', label: '1. Geral, Turmas & Músicas', icon: <Music size={16} /> },
          { key: 'lendarios', label: `2. Momento 1: Os Lendários (${legendaryCount})`, icon: <Crown size={16} /> },
          { key: 'especial', label: `3. Medalha Especial (${config.specialMedals.length})`, icon: <Sparkles size={16} /> },
          { key: 'melhores', label: `4. Momento 2: Melhores do Ano (${bestCount})`, icon: <Award size={16} /> },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setSubSection(tab.key as SubSection)}
            className="login-btn"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              padding: '0.6rem 1rem',
              borderRadius: '10px',
              background: subSection === tab.key ? 'rgba(239, 189, 57, 0.2)' : 'var(--bg-card)',
              border: subSection === tab.key ? '1px solid #EFBD39' : '1px solid var(--border-glass)',
              color: subSection === tab.key ? '#EFBD39' : 'var(--text-primary)',
              fontWeight: subSection === tab.key ? 'bold' : 'normal',
            }}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* SEÇÃO 1: GERAL, TURMAS & MÚSICAS */}
      {subSection === 'geral' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem' }}>
          <div className="glass-panel" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
            <h3 style={{ margin: 0, fontSize: '1.08rem', color: '#EFBD39' }}>Identidade & Regras da Cerimônia</h3>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
                Nome da Escola (Slide de Abertura)
              </label>
              <input
                type="text"
                value={config.schoolName}
                onChange={e => setConfig(prev => ({ ...prev, schoolName: e.target.value }))}
                placeholder="Ex: Escola Adventista de Ibiúna"
                style={{ width: '100%', padding: '0.6rem 0.8rem', borderRadius: '8px', border: '1px solid var(--border-glass)', background: 'rgba(0,0,0,0.25)', color: 'white' }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
                  Subtítulo Top Ranking
                </label>
                <input
                  type="text"
                  value={config.topRankingSubtitle}
                  onChange={e => setConfig(prev => ({ ...prev, topRankingSubtitle: e.target.value }))}
                  placeholder="6º AO 9º ANO"
                  style={{ width: '100%', padding: '0.6rem 0.8rem', borderRadius: '8px', border: '1px solid var(--border-glass)', background: 'rgba(0,0,0,0.25)', color: 'white' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
                  Meta XP Lendário (Patentes)
                </label>
                <div style={{ padding: '0.6rem 0.8rem', borderRadius: '8px', border: '1px solid var(--border-glass)', background: 'rgba(239,189,57,0.08)', color: '#EFBD39', fontWeight: 'bold', fontSize: '0.92rem' }}>
                  {formatXpPtBr(effectiveMinXp)} XP (automático)
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
                  Ordem dos Alunos por Turma
                </label>
                <select
                  value={config.orderMode}
                  onChange={e => setConfig(prev => ({ ...prev, orderMode: e.target.value as 'alpha' | 'xp_desc' }))}
                  style={{ width: '100%', padding: '0.6rem 0.8rem', borderRadius: '8px', border: '1px solid var(--border-glass)', background: 'rgba(0,0,0,0.4)', color: 'white' }}
                >
                  <option value="alpha">Ordem Alfabética (padrão PowerPoint)</option>
                  <option value="xp_desc">Maior Pontuação (XP)</option>
                </select>
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', cursor: 'pointer', padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border-glass)', width: '100%', background: 'rgba(239,189,57,0.06)' }}>
                  <input
                    type="checkbox"
                    checked={config.suspenseMode}
                    onChange={e => setConfig(prev => ({ ...prev, suspenseMode: e.target.checked }))}
                  />
                  <span style={{ fontSize: '0.88rem' }}>Modo Suspense (revelar nome/foto no 2º clique)</span>
                </label>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
                Turmas Participantes ({config.includedClassIds.length === 0 ? 'Todas' : config.includedClassIds.length})
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem' }}>
                {sortedClasses.map(cls => {
                  const active = config.includedClassIds.length === 0 || config.includedClassIds.includes(cls.id);
                  return (
                    <button
                      key={cls.id}
                      type="button"
                      onClick={() => toggleClassIncluded(cls.id)}
                      style={{
                        padding: '0.4rem 0.75rem',
                        borderRadius: '8px',
                        border: active ? '1px solid #EFBD39' : '1px solid var(--border-glass)',
                        background: active ? 'rgba(239, 189, 57, 0.18)' : 'transparent',
                        color: active ? '#EFBD39' : 'var(--text-secondary)',
                        cursor: 'pointer',
                        fontSize: '0.85rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                      }}
                    >
                      {active && <Check size={14} />} {cls.name}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="glass-panel" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
            <h3 style={{ margin: 0, fontSize: '1.08rem', color: '#EFBD39', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <Volume2 size={19} /> Trilha Sonora & Efeitos de Suspense
            </h3>
            <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Selecione os arquivos MP3 oficiais da cerimônia (ex: música dos Lendários e <em>Chariots of Fire</em> para os Melhores do Ano). Eles ficam salvos localmente neste navegador, sem pesar no Git, e fazem transição automática entre o Momento 1 e o Momento 2.
            </p>

            {/* Música Momento 1 */}
            <div style={{ padding: '0.85rem', borderRadius: '10px', border: '1px solid var(--border-glass)', background: 'rgba(0,0,0,0.2)' }}>
              <div style={{ fontWeight: 'bold', fontSize: '0.9rem', marginBottom: '0.4rem', color: '#FAC966' }}>
                Música Momento 1 — Os Lendários
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <label className="login-btn" style={{ padding: '0.45rem 0.85rem', fontSize: '0.83rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                  <Upload size={14} /> Escolher MP3 do PC
                  <input
                    type="file"
                    accept="audio/*"
                    style={{ display: 'none' }}
                    onChange={e => handleAudioUpload('moment1', e.target.files?.[0])}
                  />
                </label>
                {localAudio1Name && (
                  <span style={{ fontSize: '0.82rem', color: '#22c55e' }}>✓ {localAudio1Name}</span>
                )}
                {(localAudio1Name || config.musicMoment1Url) && (
                  <button
                    type="button"
                    onClick={() => handleClearAudio('moment1')}
                    style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.8rem' }}
                  >
                    Remover
                  </button>
                )}
              </div>
              <input
                type="url"
                value={config.musicMoment1Url || ''}
                onChange={e => setConfig(prev => ({ ...prev, musicMoment1Url: e.target.value }))}
                placeholder="Ou cole uma URL de áudio MP3 (opcional)"
                style={{ marginTop: '0.5rem', width: '100%', padding: '0.45rem 0.7rem', borderRadius: '6px', border: '1px solid var(--border-glass)', background: 'rgba(0,0,0,0.25)', color: 'white', fontSize: '0.82rem' }}
              />
            </div>

            {/* Música Momento 2 */}
            <div style={{ padding: '0.85rem', borderRadius: '10px', border: '1px solid var(--border-glass)', background: 'rgba(0,0,0,0.2)' }}>
              <div style={{ fontWeight: 'bold', fontSize: '0.9rem', marginBottom: '0.4rem', color: '#FAC966' }}>
                Música Momento 2 — Os Melhores do Ano
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <label className="login-btn" style={{ padding: '0.45rem 0.85rem', fontSize: '0.83rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                  <Upload size={14} /> Escolher MP3 do PC
                  <input
                    type="file"
                    accept="audio/*"
                    style={{ display: 'none' }}
                    onChange={e => handleAudioUpload('moment2', e.target.files?.[0])}
                  />
                </label>
                {localAudio2Name && (
                  <span style={{ fontSize: '0.82rem', color: '#22c55e' }}>✓ {localAudio2Name}</span>
                )}
                {(localAudio2Name || config.musicMoment2Url) && (
                  <button
                    type="button"
                    onClick={() => handleClearAudio('moment2')}
                    style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.8rem' }}
                  >
                    Remover
                  </button>
                )}
              </div>
              <input
                type="url"
                value={config.musicMoment2Url || ''}
                onChange={e => setConfig(prev => ({ ...prev, musicMoment2Url: e.target.value }))}
                placeholder="Ou cole uma URL de áudio MP3 (opcional)"
                style={{ marginTop: '0.5rem', width: '100%', padding: '0.45rem 0.7rem', borderRadius: '6px', border: '1px solid var(--border-glass)', background: 'rgba(0,0,0,0.25)', color: 'white', fontSize: '0.82rem' }}
              />
            </div>

          </div>
        </div>
      )}

      {/* BARRA DE BUSCA + GUIAS POR SÉRIE PARA LENDÁRIOS E MELHORES */}
      {(subSection === 'lendarios' || subSection === 'melhores') && (
        <div className="glass-panel" style={{ padding: '0.85rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', background: 'rgba(0,0,0,0.25)', padding: '0.45rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border-glass)' }}>
            <Search size={16} color="var(--text-secondary)" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Buscar aluno por nome..."
              style={{ background: 'transparent', border: 'none', color: 'white', width: '100%', outline: 'none' }}
            />
          </div>

          <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => setSelectedClassFilter('all')}
              style={{
                padding: '0.42rem 0.85rem',
                borderRadius: '8px',
                border: selectedClassFilter === 'all' ? '1px solid #EFBD39' : '1px solid var(--border-glass)',
                background: selectedClassFilter === 'all' ? '#EFBD39' : 'rgba(255,255,255,0.04)',
                color: selectedClassFilter === 'all' ? '#000' : 'var(--text-primary)',
                fontWeight: selectedClassFilter === 'all' ? 'bold' : 'normal',
                cursor: 'pointer',
                fontSize: '0.84rem',
              }}
            >
              Todas ({subSection === 'lendarios' ? legendaryCount : bestCount})
            </button>

            {sortedClasses.map(c => {
              const count = subSection === 'lendarios' ? (classCounts.leg[c.id] || 0) : (classCounts.best[c.id] || 0);
              const active = selectedClassFilter === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedClassFilter(c.id)}
                  style={{
                    padding: '0.42rem 0.85rem',
                    borderRadius: '8px',
                    border: active ? '1px solid #EFBD39' : '1px solid var(--border-glass)',
                    background: active ? '#EFBD39' : 'rgba(255,255,255,0.04)',
                    color: active ? '#000' : 'var(--text-primary)',
                    fontWeight: active ? 'bold' : 'normal',
                    cursor: 'pointer',
                    fontSize: '0.84rem',
                  }}
                >
                  {c.name} ({count})
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* SEÇÃO 2: MOMENTO 1 — OS LENDÁRIOS */}
      {subSection === 'lendarios' && (
        <div className="glass-panel" style={{ padding: '1.1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div>
              <h3 style={{ margin: 0, color: '#EFBD39' }}>Alunos Lendários (Automático por XP + Ajustes Manuais)</h3>
              <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.84rem', color: 'var(--text-secondary)' }}>
                Todo aluno com <strong>{formatXpPtBr(effectiveMinXp)} XP</strong> ou patente Lendário entra automaticamente. Você pode ajustar a inclusão ou enviar uma foto especial de gala aqui.
              </p>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: '0.75rem', maxHeight: '520px', overflowY: 'auto', paddingRight: '0.25rem' }}>
            {filteredStudents.map(st => {
              const included = isStudentLegendary(st, effectiveMinXp, config);
              const clsName = sortedClasses.find(c => c.id === st.classId || c.name === st.classId)?.name || st.classId || 'Sem turma';
              const photo = resolveStudentPhoto(st, config);
              return (
                <div
                  key={st.uid}
                  style={{
                    padding: '0.75rem',
                    borderRadius: '10px',
                    border: included ? '1px solid rgba(239, 189, 57, 0.6)' : '1px solid var(--border-glass)',
                    background: included ? 'rgba(239, 189, 57, 0.08)' : 'rgba(255,255,255,0.02)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                  }}
                >
                  <img
                    src={photo}
                    alt={st.name}
                    onError={e => { e.currentTarget.src = createInitialsAvatarSvg(st.name || 'Aluno'); }}
                    style={{ width: '48px', height: '48px', borderRadius: '50%', objectFit: 'cover', border: included ? '2px solid #EFBD39' : '1px solid var(--border-glass)' }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 'bold', fontSize: '0.92rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {st.name}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                      {clsName} • <strong style={{ color: '#EFBD39' }}>{formatXpPtBr(st.xp || 0)} XP</strong>
                    </div>
                    <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.35rem', alignItems: 'center' }}>
                      <label style={{ fontSize: '0.74rem', color: '#38bdf8', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                        <ImageIcon size={12} /> Foto Gala
                        <input
                          type="file"
                          accept="image/*"
                          style={{ display: 'none' }}
                          onChange={e => handleCustomPhotoUpload(st.uid, e.target.files?.[0])}
                        />
                      </label>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleLegendaryOverride(st)}
                    style={{
                      padding: '0.4rem 0.65rem',
                      borderRadius: '8px',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '0.78rem',
                      fontWeight: 'bold',
                      background: included ? '#EFBD39' : 'rgba(255,255,255,0.08)',
                      color: included ? '#000' : 'var(--text-secondary)',
                    }}
                  >
                    {included ? 'Lendário ✓' : 'Incluir'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SEÇÃO 3: MEDALHA ESPECIAL */}
      {subSection === 'especial' && (
        <div className="glass-panel" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <h3 style={{ margin: 0, color: '#EFBD39' }}>Medalha Especial — "Sempre no Topo"</h3>
            <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Homenagem especial exibida logo após o Top Ranking (como no slide 110–111 do PowerPoint).
            </p>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', alignItems: 'flex-end' }}>
            <div style={{ flex: '1 1 220px' }}>
              <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                Selecionar aluno do sistema
              </label>
              <select
                value={specialStudentId}
                onChange={e => {
                  setSpecialStudentId(e.target.value);
                  if (e.target.value) setSpecialCustomName('');
                }}
                style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border-glass)', background: 'rgba(0,0,0,0.35)', color: 'white' }}
              >
                <option value="">-- Ou digite o nome ao lado --</option>
                {studentsOnly.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt-BR')).map(s => (
                  <option key={s.uid} value={s.uid}>
                    {s.name} ({sortedClasses.find(c => c.id === s.classId || c.name === s.classId)?.name || s.classId || 'Sem turma'})
                  </option>
                ))}
              </select>
            </div>

            <div style={{ flex: '1 1 200px' }}>
              <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                Ou nome manual
              </label>
              <input
                type="text"
                value={specialCustomName}
                onChange={e => {
                  setSpecialCustomName(e.target.value);
                  if (e.target.value) setSpecialStudentId('');
                }}
                placeholder="Nome do homenageado"
                style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border-glass)', background: 'rgba(0,0,0,0.25)', color: 'white' }}
              />
            </div>

            <div style={{ flex: '0 1 160px' }}>
              <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
                Turma / Ano (opcional)
              </label>
              <input
                type="text"
                value={specialSubtitle}
                onChange={e => setSpecialSubtitle(e.target.value)}
                placeholder="Ex: 9º ano"
                style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border-glass)', background: 'rgba(0,0,0,0.25)', color: 'white' }}
              />
            </div>

            <button
              type="button"
              onClick={addSpecialMedal}
              className="login-btn"
              style={{ padding: '0.58rem 1rem', background: '#EFBD39', color: '#000', fontWeight: 'bold', border: 'none', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
            >
              <Plus size={16} /> Adicionar
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '0.65rem' }}>
            {config.specialMedals.length === 0 ? (
              <div style={{ gridColumn: '1 / -1', padding: '1.5rem', textAlign: 'center', color: 'var(--text-secondary)', border: '1px dashed var(--border-glass)', borderRadius: '10px' }}>
                Nenhum aluno adicionado à Medalha Especial ainda. Se ficar vazio, essa seção é pulada automaticamente na apresentação.
              </div>
            ) : (
              config.specialMedals.map(item => (
                <div key={item.id} style={{ padding: '0.75rem', borderRadius: '10px', border: '1px solid rgba(239,189,57,0.45)', background: 'rgba(239,189,57,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.6rem' }}>
                  <div>
                    <div style={{ fontWeight: 'bold', color: '#FAC966' }}>{item.name}</div>
                    {item.subtitle && <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{item.subtitle}</div>}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeSpecialMedal(item.id)}
                    style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer' }}
                    title="Remover"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* SEÇÃO 4: MOMENTO 2 — MELHORES DO ANO */}
      {subSection === 'melhores' && (
        <div className="glass-panel" style={{ padding: '1.1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div>
            <h3 style={{ margin: 0, color: '#EFBD39' }}>Momento 2 — Os Melhores do Ano (Boletim & Medalhas)</h3>
            <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.84rem', color: 'var(--text-secondary)' }}>
              Marque os alunos que se destacaram no boletim, informe opcionalmente a média final e escolha a medalha ou troféu que cada um irá receber no palco.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '0.75rem', maxHeight: '540px', overflowY: 'auto', paddingRight: '0.25rem' }}>
            {filteredStudents.map(st => {
              const entry = config.bestOfYear[st.uid];
              const isSelected = !!entry;
              const clsName = sortedClasses.find(c => c.id === st.classId || c.name === st.classId)?.name || st.classId || 'Sem turma';
              const photo = resolveStudentPhoto(st, config);

              return (
                <div
                  key={st.uid}
                  style={{
                    padding: '0.8rem',
                    borderRadius: '10px',
                    border: isSelected ? '1px solid #22c55e' : '1px solid var(--border-glass)',
                    background: isSelected ? 'rgba(34, 197, 94, 0.08)' : 'rgba(255,255,255,0.02)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.6rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem' }}>
                    <img
                      src={photo}
                      alt={st.name}
                      onError={e => { e.currentTarget.src = createInitialsAvatarSvg(st.name || 'Aluno'); }}
                      style={{ width: '44px', height: '44px', borderRadius: '50%', objectFit: 'cover', border: isSelected ? '2px solid #22c55e' : '1px solid var(--border-glass)' }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 'bold', fontSize: '0.92rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {st.name}
                      </div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                        <Users size={11} style={{ verticalAlign: 'middle' }} /> {clsName}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleBestOfYear(st)}
                      style={{
                        padding: '0.4rem 0.75rem',
                        borderRadius: '8px',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '0.78rem',
                        fontWeight: 'bold',
                        background: isSelected ? '#22c55e' : 'rgba(255,255,255,0.08)',
                        color: isSelected ? '#000' : 'var(--text-secondary)',
                      }}
                    >
                      {isSelected ? 'Selecionado ✓' : 'Marcar'}
                    </button>
                  </div>

                  {isSelected && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px', gap: '0.5rem', paddingTop: '0.4rem', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                      <select
                        value={DEFAULT_MEDAL_OPTIONS.includes(entry.medalLabel) ? entry.medalLabel : '__custom__'}
                        onChange={e => {
                          if (e.target.value !== '__custom__') {
                            updateBestEntry(st.uid, { medalLabel: e.target.value });
                          }
                        }}
                        style={{ padding: '0.4rem 0.5rem', borderRadius: '6px', border: '1px solid var(--border-glass)', background: 'rgba(0,0,0,0.35)', color: 'white', fontSize: '0.8rem' }}
                      >
                        {DEFAULT_MEDAL_OPTIONS.map(opt => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>

                      <input
                        type="text"
                        value={entry.boletimAverage || ''}
                        onChange={e => updateBestEntry(st.uid, { boletimAverage: e.target.value })}
                        placeholder="Média (opc.)"
                        style={{ padding: '0.4rem 0.5rem', borderRadius: '6px', border: '1px solid var(--border-glass)', background: 'rgba(0,0,0,0.35)', color: 'white', fontSize: '0.8rem', textAlign: 'center' }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
