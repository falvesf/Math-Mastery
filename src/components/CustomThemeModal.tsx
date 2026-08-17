import { useState, useEffect } from 'react';
import { X, Save, Image as ImageIcon } from 'lucide-react';
import ImageGalleryModal from './ImageGalleryModal';

export interface CustomTheme {
  id: string;
  name: string;
  isGlobal?: boolean;
  colors: {
    bgDark: string;
    bgDarkOpacity?: number;
    bgPanel: string;
    bgPanelOpacity?: number;
    bgCard: string;
    bgCardOpacity: number;
    btnBg: string;
    btnBgOpacity: number;
    btnHover: string;
    btnHoverOpacity: number;
    textPrimary: string;
    textPrimaryOpacity?: number;
    textSecondary: string;
    textSecondaryOpacity?: number;
    textOnGold?: string;
    textOnGoldOpacity?: number;
    bgBadge?: string;
    bgBadgeOpacity?: number;
    goldPrimary: string;
    goldPrimaryOpacity?: number;
    goldGlow: string;
    goldGlowOpacity: number;
    borderGlass: string;
    borderGlassOpacity: number;
    shadowGlass: string;
    shadowGlassOpacity: number;
  };
  backgroundImageUrl: string;
  backgroundOpacity: number;
}

export const DEFAULT_FANTASY_THEME: CustomTheme = {
  id: 'custom_local',
  name: 'Meu Tema',
  colors: {
    bgDark: '#0c4a6e',
    bgDarkOpacity: 1,
    bgPanel: '#0284c7',
    bgPanelOpacity: 1,
    bgCard: '#0284c7',
    bgCardOpacity: 0.7,
    btnBg: '#ffffff',
    btnBgOpacity: 0.1,
    btnHover: '#ffffff',
    btnHoverOpacity: 0.2,
    textPrimary: '#f0f9ff',
    textPrimaryOpacity: 1,
    textSecondary: '#bae6fd',
    textSecondaryOpacity: 1,
    textOnGold: '#000000',
    textOnGoldOpacity: 1,
    bgBadge: '#000000',
    bgBadgeOpacity: 0.5,
    goldPrimary: '#7dd3fc',
    goldPrimaryOpacity: 1,
    goldGlow: '#7dd3fc',
    goldGlowOpacity: 0.3,
    borderGlass: '#ffffff',
    borderGlassOpacity: 0.15,
    shadowGlass: '#000000',
    shadowGlassOpacity: 0.4,
  },
  backgroundImageUrl: 'https://images.unsplash.com/photo-1514809280145-2e118944a956?q=80&w=2000&auto=format&fit=crop',
  backgroundOpacity: 0.85,
};

interface CustomThemeModalProps {
  initialTheme?: CustomTheme;
  isAdmin: boolean;
  onSave: (theme: CustomTheme) => void;
  onClose: () => void;
  onPreview: (theme: CustomTheme) => void;
}

export default function CustomThemeModal({ initialTheme, isAdmin, onSave, onClose, onPreview }: CustomThemeModalProps) {
  const [theme, setTheme] = useState<CustomTheme>(initialTheme || DEFAULT_FANTASY_THEME);
  const [showGallery, setShowGallery] = useState(false);

  // Update preview live whenever theme changes
  useEffect(() => {
    onPreview(theme);
  }, [theme, onPreview]);

  const handleColorChange = (key: keyof CustomTheme['colors'], value: string | number) => {
    setTheme(prev => ({
      ...prev,
      colors: {
        ...prev.colors,
        [key]: value
      }
    }));
  };

  const renderColorInput = (label: string, colorKey: keyof CustomTheme['colors'], opacityKey?: keyof CustomTheme['colors']) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', padding: '0.5rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
      <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{label}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <input 
          type="color" 
          value={(theme.colors[colorKey] as string) || '#000000'} 
          onChange={(e) => handleColorChange(colorKey, e.target.value)}
          style={{ width: '40px', height: '30px', padding: 0, border: '1px solid var(--border-glass)', borderRadius: '4px', cursor: 'pointer', background: 'transparent' }}
        />
        <span style={{ fontSize: '0.9rem', color: 'var(--text-primary)', width: '70px' }}>
          {((theme.colors[colorKey] as string) || '#000000').toUpperCase()}
        </span>
        
        {opacityKey && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, marginLeft: '0.5rem' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Opacidade:</span>
            <input 
              type="range" 
              min="0" 
              max="1" 
              step="0.05" 
              value={theme.colors[opacityKey] !== undefined ? theme.colors[opacityKey] as number : 1}
              onChange={(e) => handleColorChange(opacityKey, parseFloat(e.target.value))}
              style={{ flex: 1 }}
            />
            <span style={{ fontSize: '0.8rem', width: '30px', textAlign: 'right' }}>
              {Math.round((theme.colors[opacityKey] !== undefined ? theme.colors[opacityKey] as number : 1) * 100)}%
            </span>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', zIndex: 999999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div className="glass-panel" style={{ width: '100%', maxWidth: '800px', maxHeight: '90vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.5rem', position: 'relative' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
            Personalizar Tema
          </h2>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
            <X size={24} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <label style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Nome do Tema</label>
          <input 
            type="text" 
            value={theme.name}
            onChange={(e) => setTheme({...theme, name: e.target.value})}
            className="login-input"
            placeholder="Ex: Tema das Trevas"
          />
        </div>

        {isAdmin && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(251, 191, 36, 0.1)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--gold-primary)' }}>
            <input 
              type="checkbox" 
              id="isGlobal"
              checked={theme.isGlobal}
              onChange={(e) => setTheme({...theme, isGlobal: e.target.checked})}
              style={{ width: '18px', height: '18px', cursor: 'pointer' }}
            />
            <label htmlFor="isGlobal" style={{ cursor: 'pointer', color: 'var(--gold-primary)', fontWeight: 'bold' }}>
              Salvar como Tema Global (Disponível para todos os alunos)
            </label>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <h3 style={{ fontSize: '1.1rem', margin: '0 0 0.5rem 0', color: 'var(--gold-primary)' }}>Cores Principais</h3>
            {renderColorInput("Fundo da Tela (Background)", "bgDark", "bgDarkOpacity")}
            {renderColorInput("Painéis Sólidos", "bgPanel", "bgPanelOpacity")}
            {renderColorInput("Texto Principal", "textPrimary", "textPrimaryOpacity")}
            {renderColorInput("Texto Secundário", "textSecondary", "textSecondaryOpacity")}
            {renderColorInput("Texto em Destaque (Botões)", "textOnGold", "textOnGoldOpacity")}
            {renderColorInput("Cor de Destaque (Ações/Ouro)", "goldPrimary", "goldPrimaryOpacity")}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <h3 style={{ fontSize: '1.1rem', margin: '0 0 0.5rem 0', color: 'var(--gold-primary)' }}>Elementos Translúcidos</h3>
            {renderColorInput("Cartões", "bgCard", "bgCardOpacity")}
            {renderColorInput("Fundo de Botões/Campos", "btnBg", "btnBgOpacity")}
            {renderColorInput("Fundo de Tags/Emblemas", "bgBadge", "bgBadgeOpacity")}
            {renderColorInput("Hover de Botões/Campos", "btnHover", "btnHoverOpacity")}
            {renderColorInput("Brilho de Destaque", "goldGlow", "goldGlowOpacity")}
            {renderColorInput("Bordas de Vidro", "borderGlass", "borderGlassOpacity")}
            {renderColorInput("Sombra dos Painéis", "shadowGlass", "shadowGlassOpacity")}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem', padding: '1rem', background: 'rgba(0,0,0,0.3)', borderRadius: '12px' }}>
          <h3 style={{ fontSize: '1.1rem', margin: 0, color: 'var(--gold-primary)' }}>Papel de Parede (Background)</h3>
          
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <div style={{ width: '120px', height: '80px', borderRadius: '8px', overflow: 'hidden', border: '2px solid var(--border-glass)', background: 'var(--bg-dark)' }}>
              {theme.backgroundImageUrl ? (
                <img src={theme.backgroundImageUrl} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <ImageIcon size={24} color="var(--text-secondary)" />
                </div>
              )}
            </div>
            
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input 
                  type="text" 
                  value={theme.backgroundImageUrl}
                  onChange={(e) => setTheme({...theme, backgroundImageUrl: e.target.value})}
                  className="login-input"
                  placeholder="URL da Imagem..."
                  style={{ flex: 1 }}
                />
                <button 
                  onClick={() => setShowGallery(true)}
                  className="login-btn hover-brightness"
                  style={{ background: 'var(--gold-primary)', color: 'var(--text-on-gold, #000000)', border: 'none', padding: '0 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                >
                  <ImageIcon size={18} /> Galeria
                </button>
              </div>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(0,0,0,0.2)', padding: '0.5rem', borderRadius: '8px' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', minWidth: '150px' }}>Escurecimento do Fundo:</span>
                <input 
                  type="range" 
                  min="0" 
                  max="1" 
                  step="0.05" 
                  value={theme.backgroundOpacity}
                  onChange={(e) => setTheme({...theme, backgroundOpacity: parseFloat(e.target.value)})}
                  style={{ flex: 1 }}
                />
                <span style={{ fontSize: '0.85rem', width: '40px', textAlign: 'right' }}>
                  {Math.round(theme.backgroundOpacity * 100)}%
                </span>
              </div>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: 0 }}>
                * Quanto maior o escurecimento, mais forte a "Cor de Fundo da Tela" aparecerá sobre a imagem, melhorando a leitura.
              </p>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1rem' }}>
          <button 
            onClick={onClose}
            style={{ padding: '0.75rem 1.5rem', background: 'transparent', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', borderRadius: '8px', cursor: 'pointer' }}
          >
            Cancelar
          </button>
          <button 
            onClick={() => onSave(theme)}
            className="hover-brightness"
            style={{ padding: '0.75rem 1.5rem', background: 'var(--gold-primary)', border: 'none', color: 'var(--text-on-gold, #000000)', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <Save size={18} /> Salvar Tema
          </button>
        </div>
      </div>

      {showGallery && (
        <ImageGalleryModal
          onClose={() => setShowGallery(false)}
          onSelectImage={(url) => {
            setTheme({...theme, backgroundImageUrl: url});
            setShowGallery(false);
          }}
        />
      )}
    </div>
  );
}
