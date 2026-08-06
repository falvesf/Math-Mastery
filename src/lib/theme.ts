import type { CustomTheme } from '../components/CustomThemeModal';

export const applyCustomTheme = (theme: CustomTheme | null) => {
  if (!theme) {
    // Limpar variáveis customizadas para voltar aos temas padrões do CSS
    const vars = [
      '--bg-dark', '--bg-panel', '--bg-card', '--btn-bg', '--btn-hover', 
      '--text-primary', '--text-secondary', '--text-on-gold', '--bg-badge', '--gold-primary', '--gold-glow', 
      '--border-glass', '--shadow-glass'
    ];
    vars.forEach(v => document.body.style.removeProperty(v));
    document.body.style.removeProperty('background-image');
    return;
  }

  // Converter HEX para RGBA
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
    const opBottom = Math.min(1, op + 0.15); // Ligeiramente mais escuro embaixo
    
    document.body.style.setProperty(
      'background-image', 
      `linear-gradient(rgba(${r}, ${g}, ${b}, ${op}), rgba(${r}, ${g}, ${b}, ${opBottom})), url('${backgroundImageUrl}')`
    );
  } else {
    document.body.style.removeProperty('background-image');
  }
};
