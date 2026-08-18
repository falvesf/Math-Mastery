

interface SkinBuffIconProps {
  skinUrl: string;
  durationDays?: number;
  size?: number;
}

export default function SkinBuffIcon({ skinUrl, durationDays, size = 64 }: SkinBuffIconProps) {
  // A cabeça no Minecraft fica em x: 8, y: 8, w: 8, h: 8.
  // O capacete (overlay) fica em x: 40, y: 8, w: 8, h: 8.
  // Sendo a imagem original 64px de largura, 8px é 1/8.
  // Então a imagem interna terá 800% da largura do contêiner.

  return (
    <div style={{
      width: size,
      height: size,
      borderRadius: '50%',
      background: 'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.2) 0%, rgba(0,0,0,0.4) 100%)',
      border: '2px solid rgba(255,255,255,0.3)',
      boxShadow: 'inset 0 0 15px rgba(255,255,255,0.1), 0 4px 10px rgba(0,0,0,0.5)',
      position: 'relative',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      flexShrink: 0
    }}>
      {/* Brilho do vidro */}
      <div style={{
        position: 'absolute',
        top: '5%',
        left: '15%',
        width: '40%',
        height: '20%',
        background: 'rgba(255,255,255,0.3)',
        borderRadius: '50%',
        transform: 'rotate(-25deg)',
        pointerEvents: 'none'
      }} />

      {/* Recipiente da Cabeça */}
      <div style={{
        width: size * 0.5,
        height: size * 0.5,
        overflow: 'hidden',
        position: 'relative',
        borderRadius: '4px',
        marginTop: '-15%',
        boxShadow: '0 4px 8px rgba(0,0,0,0.5)',
        backgroundColor: '#000'
      }}>
        {/* Base Head */}
        <img src={skinUrl} alt="" style={{
          position: 'absolute',
          width: '800%',
          maxWidth: 'none', // Override any global max-width
          left: '-100%',
          top: '-100%',
          imageRendering: 'pixelated'
        }} />
        {/* Helmet Overlay */}
        <img src={skinUrl} alt="" style={{
          position: 'absolute',
          width: '800%',
          maxWidth: 'none',
          left: '-500%',
          top: '-100%',
          imageRendering: 'pixelated'
        }} />
      </div>

      {/* Duração Badge */}
      {durationDays && (
        <div style={{
          position: 'absolute',
          bottom: '8%',
          background: 'rgba(0, 0, 0, 0.8)',
          border: '1px solid rgba(255,255,255,0.2)',
          color: '#fbbf24', // Gold
          fontSize: size * 0.22,
          padding: '2px 8px',
          borderRadius: '12px',
          fontWeight: 'bold',
          whiteSpace: 'nowrap',
          textShadow: '0 1px 2px rgba(0,0,0,0.8)'
        }}>
          {durationDays}d
        </div>
      )}
    </div>
  );
}