import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Award,
  ChevronLeft,
  ChevronRight,
  Eye,
  Grid,
  Maximize2,
  Minimize2,
  Music,
  Trophy,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useAuth, mapUserToClient, type UserData } from '../contexts/AuthContext';
import { useTenant } from '../contexts/TenantContext';
import { supabase } from '../lib/supabase';
import { initRanks, RANKS } from '../lib/ranks';
import {
  buildGalaSlides,
  createDefaultGalaConfig,
  createInitialsAvatarSvg,
  formatXpPtBr,
  loadGalaConfig,
  loadGalaLocalAudio,
  type GalaConfig,
  type GalaSlide,
} from '../lib/gala';
import { galaAudio } from '../lib/galaAudio';

function ensureGalaFonts() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('gala-google-fonts')) return;
  const link = document.createElement('link');
  link.id = 'gala-google-fonts';
  link.rel = 'stylesheet';
  link.href =
    'https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700;800&family=Dancing+Script:wght@600;700&family=Great+Vibes&family=Montserrat:wght@400;500;600;700;800&display=swap';
  document.head.appendChild(link);
}

const CLASS_FONT = '"Lucida Handwriting", "Dancing Script", cursive';

function LeftColoredWave({ color }: { color: string }) {
  return (
    <svg
      viewBox="0 0 360 1000"
      preserveAspectRatio="none"
      style={{
        position: 'fixed',
        left: 0,
        top: 0,
        height: '100vh',
        width: '23vw',
        zIndex: 1,
        pointerEvents: 'none',
      }}
    >
      <path
        d="M0,0 L315,75 C175,180 65,245 72,330 C79,420 355,660 355,845 C355,935 280,985 180,1000 L0,1000 Z"
        fill={color}
      />
    </svg>
  );
}

function getClassCrestSrc(className?: string): string {
  const lower = (className || '').toLowerCase();
  if (lower.includes('7')) return '/gala/image6.png';
  if (lower.includes('8')) return '/gala/image8.png';
  if (lower.includes('9')) return '/gala/image5.png';
  return '/gala/image7.png';
}

function BestOfYearMedalBadge({ medalLabel, schoolName }: { medalLabel?: string; schoolName?: string }) {
  const lower = (medalLabel || 'ouro').toLowerCase();
  const tier = lower.includes('diamant')
    ? 'diamante'
    : lower.includes('prata')
    ? 'prata'
    : lower.includes('bronze')
    ? 'bronze'
    : 'ouro';

  const palettes = {
    bronze: {
      c1: '#f3b07a',
      c2: '#b45309',
      c3: '#78350f',
      ring: '#d97706',
      text: '#fef3c7',
    },
    prata: {
      c1: '#f8fafc',
      c2: '#94a3b8',
      c3: '#475569',
      ring: '#cbd5e1',
      text: '#ffffff',
    },
    ouro: {
      c1: '#fef08a',
      c2: '#eab308',
      c3: '#a16207',
      ring: '#facc15',
      text: '#fef9c3',
    },
    diamante: {
      c1: '#bae6fd',
      c2: '#38bdf8',
      c3: '#0369a1',
      ring: '#7dd3fc',
      text: '#e0f2fe',
    },
  };
  const p = palettes[tier];

  // Gera iniciais da escola (ex: "E.A.I" para Colégio Adventista de Ibiúna)
  const initials = (schoolName || 'E.A.I')
    .replace(/^(a|o)\s+/i, '')
    .split(/\s+/)
    .filter(w => w.length > 2 || /^[A-Z]/.test(w))
    .slice(0, 3)
    .map(w => w[0].toUpperCase())
    .join('.') || 'E.A.I';

  const gradId = `medalGrad_${tier}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.35rem' }}>
      <svg width="168" height="176" viewBox="0 0 200 210" style={{ filter: 'drop-shadow(0 10px 22px rgba(0,0,0,0.65))' }}>
        <defs>
          <radialGradient id={gradId} cx="35%" cy="30%" r="70%">
            <stop offset="0%" stopColor={p.c1} />
            <stop offset="55%" stopColor={p.c2} />
            <stop offset="100%" stopColor={p.c3} />
          </radialGradient>
        </defs>

        {/* Fitas azuis inferiores */}
        <polygon points="75,148 56,204 82,190 96,204 100,152" fill="#1e3a8a" stroke="#60a5fa" strokeWidth="1.5" />
        <polygon points="125,148 144,204 118,190 104,204 100,152" fill="#1d4ed8" stroke="#60a5fa" strokeWidth="1.5" />

        {/* Coroa de louros estilizada */}
        {Array.from({ length: 11 }).map((_, idx) => {
          const angleL = (-135 + idx * 14) * (Math.PI / 180);
          const xL = 100 + Math.cos(angleL) * 74;
          const yL = 94 + Math.sin(angleL) * 74;
          const angleR = (-45 - idx * 14) * (Math.PI / 180);
          const xR = 100 + Math.cos(angleR) * 74;
          const yR = 94 + Math.sin(angleR) * 74;
          return (
            <g key={idx}>
              <ellipse cx={xL} cy={yL} rx="8" ry="4" transform={`rotate(${-45 + idx * 14}, ${xL}, ${yL})`} fill={p.ring} opacity="0.92" />
              <ellipse cx={xR} cy={yR} rx="8" ry="4" transform={`rotate(${45 - idx * 14}, ${xR}, ${yR})`} fill={p.ring} opacity="0.92" />
            </g>
          );
        })}

        {/* Disco metálico central */}
        <circle cx="100" cy="94" r="58" fill={`url(#${gradId})`} stroke={p.c1} strokeWidth="3" />
        <circle cx="100" cy="94" r="51" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.2" />

        {/* Logo A estilizado */}
        <image href="/gala/image3.png" x="80" y="45" width="40" height="40" opacity="0.95" />

        {/* Textos da medalha */}
        <text x="100" y="102" textAnchor="middle" fontFamily="Montserrat, sans-serif" fontSize="8.5" fontWeight="700" fill={p.text} letterSpacing="0.5">
          MELHORES DO ANO
        </text>
        <text x="100" y="122" textAnchor="middle" fontFamily="Montserrat, sans-serif" fontSize="15" fontWeight="800" fill={p.text} letterSpacing="1.2">
          {initials}
        </text>
      </svg>
    </div>
  );
}

export default function GalaPresentation() {
  const navigate = useNavigate();
  const { userData } = useAuth();
  const { tenantId, tenant } = useTenant();

  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<GalaConfig>(() =>
    createDefaultGalaConfig(tenant?.name || 'Colégio Adventista de Ibiúna', 10000)
  );
  const [slides, setSlides] = useState<GalaSlide[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [revealed, setRevealed] = useState(true);
  const [suspenseEnabled, setSuspenseEnabled] = useState(true);

  const [muted, setMuted] = useState(false);
  const [musicActive, setMusicActive] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showHud, setShowHud] = useState(true);
  const [showNavigator, setShowNavigator] = useState(false);
  const hudTimerRef = useRef<number | null>(null);

  useEffect(() => {
    ensureGalaFonts();
  }, []);

  useEffect(() => {
    let active = true;
    const loadAll = async () => {
      setLoading(true);
      try {
        await initRanks(tenantId || undefined);
        const legendRank = RANKS.find(r => r.name.toLowerCase().includes('lend'));
        const [cfg, localA1, localA2, classesRes, usersRes] = await Promise.all([
          loadGalaConfig(tenantId || '', tenant?.name || 'Colégio Adventista de Ibiúna', legendRank?.minXp || 10000),
          loadGalaLocalAudio('moment1'),
          loadGalaLocalAudio('moment2'),
          supabase.from('classes').select('*').eq('tenant_id', tenantId || ''),
          supabase.from('users').select('*').eq('tenant_id', tenantId || ''),
        ]);

        if (!active) return;
        setConfig(cfg);
        setSuspenseEnabled(cfg.suspenseMode);

        const classesList = (classesRes.data || []).map((c: any) => ({ id: c.id, name: c.name, color: c.color }));
        const usersList: UserData[] = (usersRes.data || []).map(mapUserToClient);

        const deck = buildGalaSlides(cfg, usersList, classesList, RANKS);
        setSlides(deck);
        setCurrentIdx(0);
        setRevealed(true);

        const url1 = localA1?.url || cfg.musicMoment1Url || null;
        const url2 = localA2?.url || cfg.musicMoment2Url || null;
        galaAudio.configureMusicTracks(url1, url2);
      } catch (err) {
        console.error('Erro ao carregar dados da Gala:', err);
      } finally {
        if (active) setLoading(false);
      }
    };

    loadAll();
    return () => {
      active = false;
      galaAudio.stopMusic();
    };
  }, [tenantId, tenant?.name]);

  const currentSlide = slides[currentIdx];

  useEffect(() => {
    if (!currentSlide) return;

    if (currentSlide.moment === 1 && currentIdx > 0) {
      galaAudio.playMomentMusic(1);
      setMusicActive(galaAudio.isMusicPlaying());
    } else if (currentSlide.moment === 2) {
      galaAudio.playMomentMusic(2);
      setMusicActive(galaAudio.isMusicPlaying());
    }

    const isStudentSlide = currentSlide.type === 'student_lendario' || currentSlide.type === 'student_melhor';
    setRevealed(!(isStudentSlide && suspenseEnabled));
  }, [currentIdx, currentSlide?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const goNext = useCallback(() => {
    if (!currentSlide) return;
    const isStudentSlide = currentSlide.type === 'student_lendario' || currentSlide.type === 'student_melhor';
    if (isStudentSlide && !revealed) {
      setRevealed(true);
      return;
    }
    if (currentIdx < slides.length - 1) {
      setCurrentIdx(i => i + 1);
    }
  }, [currentSlide, revealed, currentIdx, slides.length]);

  const goPrev = useCallback(() => {
    if (currentIdx > 0) {
      setCurrentIdx(i => i - 1);
    }
  }, [currentIdx]);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  }, []);

  const toggleMute = useCallback(() => {
    setMuted(prev => {
      const next = !prev;
      galaAudio.setMuted(next);
      return next;
    });
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (showNavigator && e.key === 'Escape') {
        setShowNavigator(false);
        return;
      }
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        goNext();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goPrev();
      } else if (e.key.toLowerCase() === 'f') {
        toggleFullscreen();
      } else if (e.key.toLowerCase() === 'm') {
        toggleMute();
      } else if (e.key.toLowerCase() === 's') {
        setSuspenseEnabled(v => !v);
      } else if (e.key.toLowerCase() === 'g') {
        setShowNavigator(v => !v);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [goNext, goPrev, toggleFullscreen, toggleMute, showNavigator]);

  const bumpHud = useCallback(() => {
    setShowHud(true);
    if (hudTimerRef.current) window.clearTimeout(hudTimerRef.current);
    hudTimerRef.current = window.setTimeout(() => setShowHud(false), 3200);
  }, []);

  useEffect(() => {
    bumpHud();
    return () => {
      if (hudTimerRef.current) window.clearTimeout(hudTimerRef.current);
    };
  }, [bumpHud]);

  const sectionMarkers = useMemo(() => {
    const list: { label: string; index: number }[] = [];
    slides.forEach((s, idx) => {
      if (s.type === 'intro_school') list.push({ label: 'Abertura', index: idx });
      else if (s.type === 'intro_lendarios') list.push({ label: 'Momento 1: Os Lendários', index: idx });
      else if (s.type === 'class_title_lendarios') list.push({ label: `Lendários — ${s.className}`, index: idx });
      else if (s.type === 'top_ranking_title') list.push({ label: 'Top Ranking Geral', index: idx });
      else if (s.type === 'special_medal_title') list.push({ label: 'Medalha Especial', index: idx });
      else if (s.type === 'intro_melhores') list.push({ label: 'Momento 2: Melhores do Ano', index: idx });
      else if (s.type === 'class_title_melhores') list.push({ label: `Melhores — ${s.className}`, index: idx });
      else if (s.type === 'closing_thanks') list.push({ label: 'Encerramento', index: idx });
    });
    return list;
  }, [slides]);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#050505', color: '#EFBD39', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: 'Montserrat, sans-serif' }}>
        <Trophy size={48} />
        <p style={{ marginTop: '1rem', fontSize: '1rem', letterSpacing: '0.18em' }}>CARREGANDO APRESENTAÇÃO...</p>
      </div>
    );
  }

  if (!currentSlide) {
    return (
      <div style={{ minHeight: '100vh', background: '#050505', color: 'white', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem', padding: '2rem', textAlign: 'center' }}>
        <Trophy size={48} color="#EFBD39" />
        <h2>Nenhum slide disponível</h2>
        <button onClick={() => navigate('/admin')} className="login-btn" style={{ padding: '0.75rem 1.5rem', background: '#EFBD39', color: '#000', fontWeight: 'bold' }}>
          Voltar ao Painel
        </button>
      </div>
    );
  }

  const isStageDark =
    currentSlide.type === 'intro_school' ||
    currentSlide.type === 'intro_lendarios';

  const isMelhoresDark =
    currentSlide.type === 'intro_melhores' ||
    currentSlide.type === 'class_title_melhores' ||
    currentSlide.type === 'student_melhor' ||
    currentSlide.type === 'closing_title' ||
    currentSlide.type === 'closing_thanks';

  const isLightMoment1 = !isStageDark && !isMelhoresDark;

  const activeClassColor = currentSlide.classColor || '#00449E';

  const isMoment1ContentSlide =
    currentSlide.type === 'student_lendario' ||
    currentSlide.type === 'class_highlights' ||
    currentSlide.type === 'top_ranking_summary' ||
    currentSlide.type === 'special_medal_list';

  return (
    <div
      onMouseMove={bumpHud}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('button')) return;
        if (!showNavigator) goNext();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        overflow: 'hidden',
        userSelect: 'none',
        cursor: showHud ? 'default' : 'none',
        fontFamily: 'Montserrat, sans-serif',
        background: isStageDark
          ? '#070503'
          : isMelhoresDark
          ? '#0b0b0c'
          : '#ffffff',
        color: isLightMoment1 ? '#2B2B2B' : '#FFFFFF',
      }}
    >
      {/* FUNDOS EXATOS DO POWERPOINT */}
      {isStageDark && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundImage: 'url(/gala/image2.jpg)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            zIndex: 0,
          }}
        />
      )}

      {isMelhoresDark && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundImage: 'url(/gala/image1.png)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            zIndex: 0,
          }}
        />
      )}

      {isLightMoment1 && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background:
              isMoment1ContentSlide
                ? 'url(/gala/image15.png) center/cover no-repeat, #ffffff'
                : `linear-gradient(90deg, ${activeClassColor} 0%, ${activeClassColor} 18%, #f6f6ac 66%, #ffffff 100%)`,
            zIndex: 0,
          }}
        />
      )}

      {/* ORNAMENTO ESQUERDO DO MOMENTO 1 (ONDA COLORIDA DA TURMA + FITA ATRÁS DO BRASÃO) */}
      {isMoment1ContentSlide && (
        <>
          <LeftColoredWave color={activeClassColor} />
          <img
            src="/gala/image11.png"
            alt=""
            style={{ position: 'fixed', left: '4.5vw', top: 0, height: '100vh', width: 'auto', zIndex: 2, pointerEvents: 'none' }}
          />
        </>
      )}

      {/* ORNAMENTO ESQUERDO DO MOMENTO 2 (ONDA PRETA + FITA DOURADA NA ESQUERDA, COMO NO MODELO) */}
      {currentSlide.type === 'student_melhor' && (
        <>
          <img
            src="/gala/image93.png"
            alt=""
            style={{ position: 'fixed', left: 0, top: 0, height: '100vh', width: 'auto', maxWidth: '24vw', objectFit: 'cover', zIndex: 1, pointerEvents: 'none' }}
          />
          <img
            src="/gala/image11.png"
            alt=""
            style={{ position: 'fixed', left: '4.5vw', top: 0, height: '100vh', width: 'auto', zIndex: 2, pointerEvents: 'none' }}
          />
        </>
      )}

      {/* CONTEÚDO DO SLIDE */}
      <div
        key={currentSlide.id}
        style={{
          position: 'relative',
          zIndex: 3,
          width: '100%',
          height: '100%',
        }}
      >
        {/* SLIDE 1: LOGO + A ESCOLA ADVENTISTA DE IBIÚNA APRESENTA */}
        {currentSlide.type === 'intro_school' && (
          <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4vw', textAlign: 'center', gap: '1.25rem' }}>
            <img
              src="/gala/image3.png"
              alt=""
              style={{
                width: 'clamp(90px, 11vw, 145px)',
                height: 'auto',
                animation: 'galaFadeIn 1.2s ease-out both',
              }}
            />
            <h1
              style={{
                margin: 0,
                fontSize: 'clamp(1.85rem, 3.8vw, 3.3rem)',
                fontWeight: 500,
                color: '#FFFFFF',
                letterSpacing: '0.02em',
                animation: 'galaFadeIn 1.2s ease-out 0.7s both',
              }}
            >
              A {currentSlide.schoolName}
            </h1>
            <p
              style={{
                margin: 0,
                fontSize: 'clamp(1.2rem, 2.2vw, 1.9rem)',
                fontWeight: 400,
                color: '#E2E8F0',
                animation: 'galaFadeIn 1.2s ease-out 1.4s both',
              }}
            >
              Apresenta
            </p>
          </div>
        )}

        {/* SLIDE 2: PROJETO MATH MASTERY -> OS LENDÁRIOS -> 4 BRASÕES */}
        {currentSlide.type === 'intro_lendarios' && (
          <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '3rem 5vw', textAlign: 'center', gap: '0.5rem' }}>
            <div style={{ fontSize: 'clamp(0.95rem, 1.5vw, 1.25rem)', letterSpacing: '0.32em', color: '#EFBD39', fontWeight: 600, animation: 'galaFadeIn 0.9s ease-out both' }}>
              PROJETO
            </div>
            <div style={{ fontSize: 'clamp(1.5rem, 2.8vw, 2.4rem)', letterSpacing: '0.16em', color: '#EFBD39', fontWeight: 700, animation: 'galaFadeIn 0.9s ease-out 0.4s both' }}>
              MATH MASTERY
            </div>
            <h1 style={{ margin: '0.7rem 0 1.4rem 0', fontSize: 'clamp(3rem, 6.8vw, 5.8rem)', fontWeight: 800, color: '#A97B34', letterSpacing: '0.06em', animation: 'galaZoomIn 1s cubic-bezier(0.22, 1, 0.36, 1) 1.1s both' }}>
              OS LENDÁRIOS
            </h1>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'clamp(1rem, 2.8vw, 2.4rem)', flexWrap: 'wrap' }}>
              {['/gala/image7.png', '/gala/image6.png', '/gala/image8.png', '/gala/image5.png'].map((src, i) => (
                <img
                  key={i}
                  src={src}
                  alt=""
                  style={{
                    width: 'clamp(80px, 10vw, 130px)',
                    height: 'auto',
                    filter: 'drop-shadow(0 8px 20px rgba(0,0,0,0.65))',
                    animation: `galaCrestFlip 0.8s cubic-bezier(0.22, 1, 0.36, 1) ${1.9 + i * 0.35}s both`,
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {/* SLIDE 3: TURMA (FUNDO DA COR DA TURMA -> CREME, FITA ATRÁS DO BRASÃO, NOME À ESQUERDA EM LUCIDA HANDWRITING) */}
        {currentSlide.type === 'class_title_lendarios' && (
          <div style={{ width: '100%', height: '100%', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <img
              src="/gala/image11.png"
              alt=""
              style={{ position: 'fixed', left: '38%', top: 0, height: '100vh', width: 'auto', zIndex: 1, pointerEvents: 'none', animation: 'galaFadeIn 0.8s ease-out both' }}
            />
            <h1
              style={{
                position: 'fixed',
                left: '11vw',
                top: '50%',
                transform: 'translateY(-50%)',
                margin: 0,
                zIndex: 3,
                fontFamily: CLASS_FONT,
                fontSize: 'clamp(2.4rem, 4.4vw, 3.8rem)',
                color: '#F7E99C',
                textShadow: '0 2px 10px rgba(0,0,0,0.3)',
                animation: 'galaFadeIn 0.8s ease-out 0.2s both',
              }}
            >
              {currentSlide.className}
            </h1>
            <img
              src={getClassCrestSrc(currentSlide.className)}
              alt=""
              style={{
                position: 'relative',
                zIndex: 3,
                width: 'clamp(190px, 23vw, 310px)',
                height: 'auto',
                filter: 'drop-shadow(0 12px 28px rgba(0,0,0,0.32))',
                animation: 'galaMorphIn 0.8s ease-out both',
              }}
            />
          </div>
        )}

        {/* SLIDE 4: ALUNO LENDÁRIO (100% FIEL AO MODELO) */}
        {currentSlide.type === 'student_lendario' && currentSlide.student && (
          <div style={{ width: '100%', height: '100%', position: 'relative', display: 'flex', alignItems: 'center' }}>
            {/* Brasão (na frente da fita) + Nome da Turma em Lucida Handwriting */}
            <div style={{ position: 'fixed', left: '2vw', top: '46%', transform: 'translateY(-50%)', width: '21vw', zIndex: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.6rem', textAlign: 'center' }}>
              <img
                src={getClassCrestSrc(currentSlide.className)}
                alt=""
                style={{ width: 'clamp(140px, 18vw, 250px)', height: 'auto', filter: 'drop-shadow(0 8px 20px rgba(0,0,0,0.4))' }}
              />
              <div style={{ fontFamily: CLASS_FONT, fontSize: 'clamp(1.7rem, 2.8vw, 2.5rem)', color: '#F7E99C', textShadow: '0 2px 8px rgba(0,0,0,0.45)' }}>
                {currentSlide.className}
              </div>
            </div>

            {/* Área Central/Direita (Fundo Branco) */}
            <div style={{ marginLeft: '26vw', marginRight: '4vw', flex: 1, height: '100%', position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
              {/* Foto no canto superior direito, como no vídeo */}
              {revealed && (
                <div style={{ position: 'absolute', top: '6vh', right: '2vw', animation: 'galaFadeIn 0.8s ease-out 0.35s both' }}>
                  <img
                    src={currentSlide.student.photoUrl}
                    alt={currentSlide.student.name}
                    onError={e => { e.currentTarget.src = createInitialsAvatarSvg(currentSlide.student!.name); }}
                    style={{
                      width: 'clamp(135px, 14vw, 195px)',
                      height: 'clamp(165px, 17vw, 235px)',
                      objectFit: 'cover',
                      borderRadius: '4px',
                      boxShadow: '0 10px 28px rgba(0,0,0,0.18)',
                      border: '2px solid #e2e8f0',
                      background: '#1e293b',
                    }}
                  />
                </div>
              )}

              {/* Parabéns! em Cinzel (sério/editorial) */}
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(2.4rem, 4.2vw, 3.8rem)', color: '#2B2B2B', fontWeight: 700, letterSpacing: '0.03em', animation: 'galaFadeIn 0.6s ease-out both' }}>
                Parabéns!
              </div>

              {revealed ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.85rem', marginTop: '0.6rem', maxWidth: '640px' }}>
                  {/* Nome do Aluno em Great Vibes cursiva */}
                  <h2 style={{ margin: 0, fontFamily: '"Great Vibes", cursive', fontSize: 'clamp(2.5rem, 4.5vw, 4rem)', fontWeight: 400, color: '#2B2B2B', lineHeight: 1.15, animation: 'galaFadeIn 0.7s ease-out 0.35s both' }}>
                    {currentSlide.student.name}
                  </h2>

                  <div style={{ fontSize: 'clamp(1.1rem, 1.7vw, 1.5rem)', color: '#A97B34', fontWeight: 500, marginTop: '0.2rem', animation: 'galaFadeIn 0.7s ease-out 0.75s both' }}>
                    Pelo seu desempenho
                  </div>

                  <p style={{ margin: 0, fontSize: 'clamp(0.92rem, 1.25vw, 1.12rem)', color: '#64748b', lineHeight: 1.55, animation: 'galaFadeIn 0.7s ease-out 1.05s both' }}>
                    Durante o ano letivo você atingiu a meta requerida para se tornar LENDÁRIO, conquistando o total de
                  </p>

                  <div style={{ marginTop: '0.6rem', fontSize: 'clamp(2rem, 3.6vw, 3rem)', fontWeight: 700, color: '#2B2B2B', animation: 'galaFadeIn 0.7s ease-out 1.45s both' }}>
                    {formatXpPtBr(currentSlide.student.xp)} XP
                  </div>
                </div>
              ) : (
                <div style={{ marginTop: '1.5rem', color: '#A97B34', fontSize: '1.15rem', fontWeight: 500, letterSpacing: '0.08em' }}>
                  Aguardando revelação...
                </div>
              )}
            </div>
          </div>
        )}

        {/* DESTAQUES DA TURMA (SLIDE 15) */}
        {currentSlide.type === 'class_highlights' && currentSlide.topStudents && (
          <div style={{ width: '100%', height: '100%', position: 'relative', display: 'flex', alignItems: 'center' }}>
            <div style={{ position: 'fixed', left: '2vw', top: '46%', transform: 'translateY(-50%)', width: '21vw', zIndex: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.6rem', textAlign: 'center' }}>
              <img src={getClassCrestSrc(currentSlide.className)} alt="" style={{ width: 'clamp(140px, 18vw, 250px)', height: 'auto', filter: 'drop-shadow(0 8px 20px rgba(0,0,0,0.4))' }} />
              <div style={{ fontFamily: CLASS_FONT, fontSize: 'clamp(1.7rem, 2.8vw, 2.5rem)', color: '#F7E99C', textShadow: '0 2px 8px rgba(0,0,0,0.45)' }}>
                {currentSlide.className}
              </div>
            </div>

            <div style={{ marginLeft: '26vw', marginRight: '4vw', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.8rem' }}>
              <div style={{ textAlign: 'center' }}>
                <h2 style={{ margin: 0, fontFamily: 'Cinzel, serif', fontSize: 'clamp(2.2rem, 4.2vw, 3.4rem)', fontWeight: 700, color: '#2B2B2B', letterSpacing: '0.06em' }}>
                  DESTAQUES
                </h2>
                <div style={{ fontSize: 'clamp(1rem, 1.6vw, 1.35rem)', color: '#A97B34', fontWeight: 500 }}>
                  Melhor desempenho
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(3, currentSlide.topStudents.length)}, minmax(170px, 230px))`, gap: '1.5rem', justifyContent: 'center', width: '100%' }}>
                {currentSlide.topStudents.map((st, idx) => (
                  <div
                    key={st.id}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '0.65rem',
                      textAlign: 'center',
                      background: 'rgba(255,255,255,0.9)',
                      padding: '1rem',
                      borderRadius: '10px',
                      border: idx === 0 ? '2px solid #A97B34' : '1px solid #e2e8f0',
                      boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
                      animation: `galaFadeIn 0.7s ease-out ${0.25 + idx * 0.25}s both`,
                    }}
                  >
                    <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#A97B34', letterSpacing: '0.1em' }}>
                      {idx + 1}º LUGAR
                    </div>
                    <img
                      src={st.photoUrl}
                      alt={st.name}
                      onError={e => { e.currentTarget.src = createInitialsAvatarSvg(st.name); }}
                      style={{ width: '130px', height: '160px', borderRadius: '4px', objectFit: 'cover', border: '2px solid #EFBD39', background: '#1e293b' }}
                    />
                    <div style={{ fontFamily: '"Great Vibes", cursive', fontSize: '1.35rem', color: '#2B2B2B', lineHeight: 1.15 }}>
                      {st.name}
                    </div>
                    <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#996600' }}>
                      {formatXpPtBr(st.xp)} XP
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TOP RANKING TÍTULO */}
        {currentSlide.type === 'top_ranking_title' && (
          <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 10vw', textAlign: 'center', gap: '0.8rem', animation: 'galaMorphIn 0.7s ease-out both' }}>
            <h1 style={{ margin: 0, fontSize: 'clamp(3rem, 6.5vw, 5.4rem)', fontWeight: 800, color: '#2B2B2B', letterSpacing: '0.1em' }}>
              TOP RANKING
            </h1>
            <div style={{ fontSize: 'clamp(1.4rem, 2.8vw, 2.3rem)', fontWeight: 700, color: '#A97B34', letterSpacing: '0.2em' }}>
              {currentSlide.subtitle}
            </div>
          </div>
        )}

        {/* TOP RANKING RESUMO (OS MELHORES DE CADA TURMA) */}
        {currentSlide.type === 'top_ranking_summary' && currentSlide.classTops && (
          <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem 4vw 2rem 26vw', gap: '1.25rem' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '0.95rem', letterSpacing: '0.28em', color: '#A97B34', fontWeight: 700 }}>
                TOP RANKING • {currentSlide.subtitle}
              </div>
              <h2 style={{ margin: '0.2rem 0 0 0', fontSize: 'clamp(1.8rem, 3.2vw, 2.7rem)', fontWeight: 800, color: '#2B2B2B' }}>
                OS MELHORES DE CADA TURMA
              </h2>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '0.9rem', width: '100%' }}>
              {currentSlide.classTops.map(ct => (
                <div key={ct.classId} style={{ padding: '0.9rem', borderRadius: '10px', border: '1px solid rgba(169,123,52,0.45)', background: 'rgba(255,255,255,0.9)', boxShadow: '0 6px 20px rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  <div style={{ textAlign: 'center', fontWeight: 800, color: '#996600', fontSize: '1.02rem', borderBottom: '1px solid rgba(169,123,52,0.25)', paddingBottom: '0.35rem' }}>
                    {ct.className}
                  </div>
                  {ct.topStudents.map((st, idx) => (
                    <div key={st.id} style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
                      <img
                        src={st.photoUrl}
                        alt={st.name}
                        onError={e => { e.currentTarget.src = createInitialsAvatarSvg(st.name); }}
                        style={{ width: '36px', height: '36px', borderRadius: '50%', objectFit: 'cover', border: '1px solid #A97B34', background: '#1e293b' }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#2B2B2B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {idx + 1}º {st.name}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#996600', fontWeight: 700 }}>
                          {formatXpPtBr(st.xp)} XP
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* MEDALHA ESPECIAL TÍTULO */}
        {currentSlide.type === 'special_medal_title' && (
          <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 10vw', textAlign: 'center', gap: '1rem', animation: 'galaMorphIn 0.7s ease-out both' }}>
            <h1 style={{ margin: 0, fontSize: 'clamp(2.8rem, 6vw, 5rem)', fontWeight: 800, color: '#2B2B2B', letterSpacing: '0.08em' }}>
              MEDALHA ESPECIAL
            </h1>
          </div>
        )}

        {/* MEDALHA ESPECIAL LISTA */}
        {currentSlide.type === 'special_medal_list' && currentSlide.specialMedals && (
          <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem 4vw 2rem 26vw', gap: '1.5rem' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '0.95rem', letterSpacing: '0.28em', color: '#A97B34', fontWeight: 700 }}>MEDALHA ESPECIAL</div>
              <h2 style={{ margin: '0.2rem 0 0 0', fontSize: 'clamp(2rem, 3.8vw, 3.2rem)', fontWeight: 800, color: '#2B2B2B' }}>
                SEMPRE NO TOPO
              </h2>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.9rem', width: '100%' }}>
              {currentSlide.specialMedals.map(item => (
                <div key={item.id} style={{ padding: '0.95rem', borderRadius: '10px', border: '1px solid rgba(169,123,52,0.5)', background: 'rgba(255,255,255,0.92)', display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                  {item.photoUrl ? (
                    <img
                      src={item.photoUrl}
                      alt={item.name}
                      onError={e => { e.currentTarget.src = createInitialsAvatarSvg(item.name); }}
                      style={{ width: '50px', height: '50px', borderRadius: '50%', objectFit: 'cover', border: '2px solid #A97B34' }}
                    />
                  ) : (
                    <div style={{ width: '50px', height: '50px', borderRadius: '50%', border: '2px solid #A97B34', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fbf7e3' }}>
                      <Award size={24} color="#A97B34" />
                    </div>
                  )}
                  <div>
                    <div style={{ fontFamily: 'Cinzel, serif', fontWeight: 700, fontSize: '1rem', color: '#2B2B2B' }}>{item.name}</div>
                    {item.subtitle && <div style={{ fontSize: '0.8rem', color: '#A97B34', fontWeight: 600 }}>{item.subtitle}</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* INTRO MOMENTO 2: OS MELHORES DO ANO (SLIDE 112) */}
        {currentSlide.type === 'intro_melhores' && (
          <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '0 6vw', animation: 'galaFadeIn 0.8s ease-out both' }}>
            <h1 style={{ margin: 0, fontSize: 'clamp(3rem, 6.8vw, 5.8rem)', fontWeight: 800, color: '#A97B34', letterSpacing: '0.08em', lineHeight: 1.1 }}>
              OS MELHORES<br />DO ANO
            </h1>
          </div>
        )}

        {/* TÍTULO DE TURMA (MELHORES DO ANO — CENTRALIZADO COMO NO MODELO) */}
        {currentSlide.type === 'class_title_melhores' && (
          <div style={{ width: '100%', height: '100%', position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <img
              src="/gala/image11.png"
              alt=""
              style={{ position: 'fixed', left: '38%', top: 0, height: '100vh', width: 'auto', zIndex: 1, pointerEvents: 'none', animation: 'galaFadeIn 0.8s ease-out both' }}
            />
            <div style={{ position: 'relative', zIndex: 3, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.1rem', animation: 'galaMorphIn 0.8s ease-out both' }}>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <img src="/gala/image13.png" alt="" style={{ width: 'clamp(220px, 26vw, 330px)', height: 'auto', filter: 'drop-shadow(0 12px 28px rgba(0,0,0,0.5))' }} />
                <div style={{ position: 'absolute', top: '40%', transform: 'translateY(-50%)', fontSize: 'clamp(1.1rem, 1.8vw, 1.55rem)', fontWeight: 700, color: '#996600', lineHeight: 1.25, textAlign: 'center' }}>
                  OS MELHORES<br />DO ANO
                </div>
              </div>
              <h1 style={{ margin: 0, fontFamily: CLASS_FONT, fontSize: 'clamp(2.2rem, 3.8vw, 3.2rem)', fontWeight: 400, color: '#F7E99C' }}>
                {currentSlide.className}
              </h1>
            </div>
          </div>
        )}

        {/* ALUNO MELHOR DO ANO (100% FIEL AO MODELO) */}
        {currentSlide.type === 'student_melhor' && currentSlide.student && (
          <div style={{ width: '100%', height: '100%', position: 'relative', display: 'flex', alignItems: 'center' }}>
            {/* Coluna esquerda: Selo Dourado "OS MELHORES DO ANO" (na frente da fita) + Turma em Lucida Handwriting */}
            <div style={{ position: 'fixed', left: '2vw', top: '48%', transform: 'translateY(-50%)', width: '21vw', zIndex: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.3rem', textAlign: 'center' }}>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <img src="/gala/image13.png" alt="" style={{ width: 'clamp(150px, 17vw, 230px)', height: 'auto', filter: 'drop-shadow(0 8px 20px rgba(0,0,0,0.5))' }} />
                <div style={{ position: 'absolute', top: '40%', transform: 'translateY(-50%)', fontSize: 'clamp(0.85rem, 1.15vw, 1.05rem)', fontWeight: 700, color: '#996600', lineHeight: 1.2 }}>
                  OS MELHORES<br />DO ANO
                </div>
              </div>
              <div style={{ fontFamily: CLASS_FONT, fontSize: 'clamp(1.7rem, 2.8vw, 2.4rem)', color: '#F7E99C' }}>
                {currentSlide.className}
              </div>
            </div>

            {/* Área Central/Direita (Fundo Preto Texturizado) */}
            <div style={{ marginLeft: '25vw', marginRight: '4vw', flex: 1, height: '100%', position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
              {/* Foto no canto superior direito */}
              {revealed && (
                <div style={{ position: 'absolute', top: '6vh', right: '2vw', animation: 'galaFadeIn 0.8s ease-out 0.35s both' }}>
                  <img
                    src={currentSlide.student.photoUrl}
                    alt={currentSlide.student.name}
                    onError={e => { e.currentTarget.src = createInitialsAvatarSvg(currentSlide.student!.name); }}
                    style={{
                      width: 'clamp(135px, 14vw, 195px)',
                      height: 'clamp(165px, 17vw, 235px)',
                      objectFit: 'cover',
                      borderRadius: '4px',
                      boxShadow: '0 10px 28px rgba(0,0,0,0.6)',
                      border: '2px solid #A97B34',
                      background: '#1e293b',
                    }}
                  />
                </div>
              )}

              {/* PARABÉNS! em Cinzel dourado claro */}
              <div style={{ fontFamily: 'Cinzel, serif', fontSize: 'clamp(2.4rem, 4.2vw, 3.8rem)', color: '#F7E99C', fontWeight: 700, letterSpacing: '0.04em', animation: 'galaFadeIn 0.6s ease-out both' }}>
                PARABÉNS!
              </div>

              {revealed ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.85rem', marginTop: '0.6rem', maxWidth: '640px' }}>
                  {/* Nome em Great Vibes cursiva branco */}
                  <h2 style={{ margin: 0, fontFamily: '"Great Vibes", cursive', fontSize: 'clamp(2.5rem, 4.5vw, 4rem)', fontWeight: 400, color: '#FFFFFF', lineHeight: 1.15, animation: 'galaFadeIn 0.7s ease-out 0.35s both' }}>
                    {currentSlide.student.name}
                  </h2>

                  <div style={{ fontSize: 'clamp(1.1rem, 1.7vw, 1.5rem)', color: '#A97B34', fontWeight: 500, marginTop: '0.2rem', animation: 'galaFadeIn 0.7s ease-out 0.75s both' }}>
                    Pelo seu desempenho
                  </div>

                  <p style={{ margin: 0, fontSize: 'clamp(0.92rem, 1.25vw, 1.12rem)', color: '#cbd5e1', lineHeight: 1.55, animation: 'galaFadeIn 0.7s ease-out 1.05s both' }}>
                    Durante o ano letivo você alcançou resultados que te colocaram entre os melhores alunos.
                  </p>

                  {/* Medalha Bronze / Prata / Ouro / Diamante exatamente como no PowerPoint */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem', marginTop: '0.6rem', animation: 'galaFadeIn 0.7s ease-out 1.45s both' }}>
                    <BestOfYearMedalBadge
                      medalLabel={currentSlide.student.medalLabel}
                      schoolName={config.schoolName}
                    />
                    {currentSlide.student.boletimAverage && (
                      <div style={{ padding: '0.35rem 1rem', borderRadius: '999px', border: '1px solid rgba(255,255,255,0.25)', color: '#e2e8f0', fontWeight: 600, fontSize: '0.95rem' }}>
                        Média: {currentSlide.student.boletimAverage}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div style={{ marginTop: '1.5rem', color: '#A97B34', fontSize: '1.15rem', fontWeight: 500, letterSpacing: '0.08em' }}>
                  Aguardando revelação...
                </div>
              )}
            </div>
          </div>
        )}

        {/* ENCERRAMENTO */}
        {currentSlide.type === 'closing_title' && (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', animation: 'galaFadeIn 0.8s ease-out both' }}>
            <h1 style={{ margin: 0, fontSize: 'clamp(3rem, 6.5vw, 5.5rem)', fontWeight: 800, color: '#A97B34', letterSpacing: '0.08em' }}>
              OS MELHORES<br />DO ANO
            </h1>
          </div>
        )}

        {currentSlide.type === 'closing_thanks' && (
          <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: '1rem', padding: '0 6vw', animation: 'galaFadeIn 0.9s ease-out both' }}>
            <h1 style={{ margin: 0, fontSize: 'clamp(2.4rem, 5.2vw, 4.4rem)', fontFamily: 'Cinzel, serif', fontWeight: 800, color: '#F7E99C', letterSpacing: '0.08em' }}>
              AGRADECEMOS A SUA PRESENÇA
            </h1>
            <div style={{ fontSize: '1.1rem', color: '#A97B34', letterSpacing: '0.2em', fontWeight: 600 }}>
              {config.schoolName} • {config.year}
            </div>
          </div>
        )}
      </div>

      {/* BARRA SUPERIOR DE CONTROLES (AUTO-OCULTA) */}
      <div
        style={{
          position: 'fixed',
          top: '18px',
          left: '24px',
          right: '24px',
          zIndex: 20,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          opacity: showHud ? 1 : 0,
          transition: 'opacity 0.35s ease',
          pointerEvents: showHud ? 'auto' : 'none',
        }}
      >
        <button
          onClick={() => navigate(userData?.role === 'student' ? '/dashboard' : '/admin')}
          style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 0.9rem', borderRadius: '10px', border: '1px solid rgba(169,123,52,0.55)', background: 'rgba(15,15,15,0.82)', color: '#F7E99C', cursor: 'pointer', fontSize: '0.85rem' }}
        >
          <ArrowLeft size={16} /> Sair da Gala
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(15,15,15,0.82)', padding: '0.35rem 0.65rem', borderRadius: '12px', border: '1px solid rgba(169,123,52,0.45)' }}>
          <button
            onClick={() => setShowNavigator(v => !v)}
            title="Navegar entre seções (G)"
            style={{ background: 'transparent', border: 'none', color: '#F7E99C', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.82rem', padding: '0.3rem 0.5rem' }}
          >
            <Grid size={15} /> {currentIdx + 1} / {slides.length}
          </button>

          <button
            onClick={() => setSuspenseEnabled(v => !v)}
            title="Alternar Modo Suspense (S)"
            style={{ background: suspenseEnabled ? 'rgba(239,189,57,0.2)' : 'transparent', border: 'none', color: suspenseEnabled ? '#EFBD39' : '#94a3b8', cursor: 'pointer', padding: '0.35rem 0.55rem', borderRadius: '8px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
          >
            <Eye size={15} /> Suspense {suspenseEnabled ? 'ON' : 'OFF'}
          </button>

          <button
            onClick={() => {
              const playing = galaAudio.toggleMusic();
              setMusicActive(playing);
            }}
            title="Tocar / Pausar Música de Fundo"
            style={{ background: musicActive ? 'rgba(239,189,57,0.2)' : 'transparent', border: 'none', color: musicActive ? '#EFBD39' : '#94a3b8', cursor: 'pointer', padding: '0.35rem' }}
          >
            <Music size={16} />
          </button>

          <button onClick={toggleMute} title="Silenciar música (M)" style={{ background: 'transparent', border: 'none', color: muted ? '#ef4444' : '#F7E99C', cursor: 'pointer', padding: '0.35rem' }}>
            {muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
          </button>

          <button onClick={toggleFullscreen} title="Tela Cheia (F)" style={{ background: 'transparent', border: 'none', color: '#F7E99C', cursor: 'pointer', padding: '0.35rem' }}>
            {isFullscreen ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
          </button>
        </div>
      </div>

      {/* CONTROLES INFERIORES */}
      <div
        style={{
          position: 'fixed',
          bottom: '22px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 20,
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          opacity: showHud ? 1 : 0,
          transition: 'opacity 0.35s ease',
          pointerEvents: showHud ? 'auto' : 'none',
        }}
      >
        <button
          onClick={goPrev}
          disabled={currentIdx === 0}
          style={{ padding: '0.55rem 0.9rem', borderRadius: '999px', border: '1px solid rgba(169,123,52,0.5)', background: 'rgba(15,15,15,0.82)', color: currentIdx === 0 ? '#666' : '#F7E99C', cursor: currentIdx === 0 ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
        >
          <ChevronLeft size={18} /> Anterior
        </button>

        <button
          onClick={goNext}
          style={{ padding: '0.55rem 1.25rem', borderRadius: '999px', border: 'none', background: 'linear-gradient(135deg, #EFBD39, #A97B34)', color: '#000', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.35rem', boxShadow: '0 4px 16px rgba(0,0,0,0.35)' }}
        >
          {!revealed ? 'Revelar Aluno' : currentIdx === slides.length - 1 ? 'Fim' : 'Próximo'} <ChevronRight size={18} />
        </button>
      </div>

      {/* DRAWER NAVEGADOR DE SEÇÕES */}
      {showNavigator && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.75)',
            backdropFilter: 'blur(6px)',
            zIndex: 30,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2rem',
          }}
          onClick={() => setShowNavigator(false)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              maxWidth: '720px',
              width: '100%',
              maxHeight: '80vh',
              overflowY: 'auto',
              background: '#11100d',
              border: '1px solid rgba(239,189,57,0.45)',
              borderRadius: '16px',
              padding: '1.5rem',
              color: '#fff',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0, color: '#EFBD39' }}>Pular para Seção da Cerimônia</h3>
              <button onClick={() => setShowNavigator(false)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: '0.6rem' }}>
              {sectionMarkers.map(m => (
                <button
                  key={m.index}
                  onClick={() => {
                    setCurrentIdx(m.index);
                    setShowNavigator(false);
                  }}
                  style={{
                    padding: '0.7rem 0.9rem',
                    borderRadius: '10px',
                    border: currentIdx === m.index ? '1px solid #EFBD39' : '1px solid rgba(255,255,255,0.12)',
                    background: currentIdx === m.index ? 'rgba(239,189,57,0.2)' : 'rgba(255,255,255,0.04)',
                    color: '#F7E99C',
                    textAlign: 'left',
                    cursor: 'pointer',
                    fontSize: '0.86rem',
                    fontWeight: 600,
                  }}
                >
                  <div>{m.label}</div>
                  <div style={{ fontSize: '0.72rem', color: '#A6A6A6' }}>Slide {m.index + 1}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes galaFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes galaMorphIn {
          from { opacity: 0; transform: scale(0.96); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes galaZoomIn {
          from { opacity: 0; transform: scale(0.88); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes galaCrestFlip {
          from { opacity: 0; transform: perspective(600px) rotateY(85deg) scale(0.9); }
          to { opacity: 1; transform: perspective(600px) rotateY(0deg) scale(1); }
        }
      `}</style>
    </div>
  );
}
