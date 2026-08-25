import type { CustomTheme } from '../components/CustomThemeModal';

const FONT_PRESETS: Record<string, { heading: string; body: string }> = {
  'default': { heading: "'Cinzel', serif", body: "'Outfit', system-ui, sans-serif" },
  'classic': { heading: "'Playfair Display', serif", body: "'Lora', serif" },
  'scifi': { heading: "'Orbitron', sans-serif", body: "'Roboto', sans-serif" },
  'casual': { heading: "'Fredoka', sans-serif", body: "'Nunito', sans-serif" },
  'retro': { heading: "'Press Start 2P', cursive", body: "'VT323', monospace" },
  'clean': { heading: "'Oswald', sans-serif", body: "'Open Sans', sans-serif" },
};

// Correção de escala para fontes que renderizam maiores (pixel art, etc.):
// evita que a fonte "empurre" botões e textos — em vez disso, reduz um pouco
// o tamanho base. 1 = sem correção.
const FONT_CORRECTIONS: Record<string, number> = {
  'retro': 0.82,
};

export const applyFontPreset = (fontId: string) => {
  const selected = FONT_PRESETS[fontId] || FONT_PRESETS['default'];
  document.documentElement.style.setProperty('--font-heading', selected.heading);
  document.documentElement.style.setProperty('--font-body', selected.body);
};

/** Aplica a escala base, combinando a escala do tema com a correção da fonte. */
export const applyFontScale = (fontId?: string, themeScale: number = 1) => {
  const correction = FONT_CORRECTIONS[fontId || 'default'] || 1;
  const scale = themeScale * correction;
  document.documentElement.style.setProperty('--font-scale', scale.toString());
  document.documentElement.style.fontSize = `${scale * 100}%`;
};

export const applyCustomTheme = (theme: CustomTheme | null) => {
  if (!theme) {
    const vars = [
      '--bg-dark', '--bg-panel', '--bg-card', '--btn-bg', '--btn-hover', 
      '--text-primary', '--text-secondary', '--text-on-gold', '--bg-badge', '--gold-primary', '--gold-glow', 
      '--border-glass', '--shadow-glass'
    ];
    vars.forEach(v => document.body.style.removeProperty(v));
    document.body.style.removeProperty('background-image');
    return;
  }

  const hexToRgba = (hex: string, alpha: number) => {
    let r = 0, g = 0, b = 0;
    if (hex.length === 4) {
      r = parseInt(hex[1] + hex[1], 16);
      g = parseInt(hex[2] + hex[2], 16);
      b = parseInt(hex[3] + hex[3], 16);
    } else if (hex.length === 7) {
      r = parseInt(hex.substring(1, 3), 16);
      g = parseInt(hex.substring(3, 5), 16);
      b = parseInt(hex.substring(5, 7), 16);
    }
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  const { colors, backgroundImageUrl, backgroundOpacity } = theme;
  
  document.body.style.setProperty('--bg-dark', hexToRgba(colors.bgDark, colors.bgDarkOpacity !== undefined ? colors.bgDarkOpacity : 1));
  document.body.style.setProperty('--bg-panel', hexToRgba(colors.bgPanel, colors.bgPanelOpacity !== undefined ? colors.bgPanelOpacity : 1));
  document.body.style.setProperty('--bg-card', hexToRgba(colors.bgCard, colors.bgCardOpacity));
  document.body.style.setProperty('--btn-bg', hexToRgba(colors.btnBg, colors.btnBgOpacity));
  document.body.style.setProperty('--btn-hover', hexToRgba(colors.btnHover, colors.btnHoverOpacity));
  document.body.style.setProperty('--text-primary', hexToRgba(colors.textPrimary, colors.textPrimaryOpacity !== undefined ? colors.textPrimaryOpacity : 1));
  document.body.style.setProperty('--text-secondary', hexToRgba(colors.textSecondary, colors.textSecondaryOpacity !== undefined ? colors.textSecondaryOpacity : 1));
  document.body.style.setProperty('--text-on-gold', hexToRgba(colors.textOnGold || '#000000', colors.textOnGoldOpacity !== undefined ? colors.textOnGoldOpacity : 1));
  document.body.style.setProperty('--bg-badge', hexToRgba(colors.bgBadge || '#000000', colors.bgBadgeOpacity !== undefined ? colors.bgBadgeOpacity : 0.5));
  document.body.style.setProperty('--gold-primary', hexToRgba(colors.goldPrimary, colors.goldPrimaryOpacity !== undefined ? colors.goldPrimaryOpacity : 1));
  document.body.style.setProperty('--gold-glow', hexToRgba(colors.goldGlow, colors.goldGlowOpacity));
  document.body.style.setProperty('--border-glass', hexToRgba(colors.borderGlass, colors.borderGlassOpacity));
  document.body.style.setProperty('--shadow-glass', `0 8px 32px 0 ${hexToRgba(colors.shadowGlass, colors.shadowGlassOpacity)}`);

  if (backgroundImageUrl) {
    const r = parseInt(colors.bgDark.substring(1, 3), 16) || 0;
    const g = parseInt(colors.bgDark.substring(3, 5), 16) || 0;
    const b = parseInt(colors.bgDark.substring(5, 7), 16) || 0;
    const op = backgroundOpacity;
    const opBottom = Math.min(1, op + 0.15);
    
    document.body.style.setProperty(
      'background-image', 
      `linear-gradient(rgba(${r}, ${g}, ${b}, ${op}), rgba(${r}, ${g}, ${b}, ${opBottom})), url('${backgroundImageUrl}')`
    );
  } else {
    document.body.style.removeProperty('background-image');
  }

  // Fonte do tema: aplica apenas se houver; a escolha EXPLÍCITA do usuário
  // (appFonts no Dashboard) continua prevalecendo quando ele selecionou outra fonte.
  // Não apaga mais a escolha do usuário no localStorage (antes isso fazia a
  // fonte do tema "sumir" e voltar ao padrão em alguns fluxos).
  if (theme.fontFamily) {
    applyFontPreset(theme.fontFamily);
  }
  applyFontScale(theme.fontFamily, theme.fontScale ?? 1);
};
