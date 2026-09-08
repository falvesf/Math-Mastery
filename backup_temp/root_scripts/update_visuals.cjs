const fs = require('fs');

// 1. Update ItemTooltip.tsx
let tooltip = fs.readFileSync('src/components/ItemTooltip.tsx', 'utf8');

tooltip = tooltip.replace(
  "id: string;",
  "id: string;\n  forgeLevel?: number;"
);

tooltip = tooltip.replace(
  "type: item.type || item.itemType,",
  "type: item.type || item.itemType,\n    forgeLevel: item.forgeLevel,"
);

const forgeTitle = `
        <h4 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--gold-primary)' }}>
          {item.title}
          {item.forgeLevel > 0 && (
            <span style={{ marginLeft: '0.4rem', color: item.forgeLevel >= 9 ? 'var(--accent-red)' : item.forgeLevel >= 7 ? '#f97316' : 'var(--gold-primary)' }}>
              +{item.forgeLevel}
            </span>
          )}
        </h4>
`;

tooltip = tooltip.replace(
  /<h4 style=\{\{ margin: 0, fontSize: '0\.95rem', color: 'var\(--gold-primary\)' \}\}>\{item\.title\}<\/h4>/,
  forgeTitle
);

fs.writeFileSync('src/components/ItemTooltip.tsx', tooltip);

// 2. Update AvatarCharacter.tsx
let avatar = fs.readFileSync('src/components/AvatarCharacter.tsx', 'utf8');

const getHighestForge = `
  const highestForgeLevel = equippedItems.length > 0 ? Math.max(...equippedItems.map(i => i.forgeLevel || 0), 0) : 0;
  let auraStyle: React.CSSProperties = { position: 'absolute', top: '-20%', left: '-20%', right: '-20%', bottom: '-20%', pointerEvents: 'none', zIndex: -1, borderRadius: '50%' };
  if (highestForgeLevel >= 9) {
    auraStyle.background = 'radial-gradient(circle, rgba(239, 68, 68, 0.5) 0%, transparent 70%)';
    auraStyle.animation = 'pulse 2s infinite alternate';
  } else if (highestForgeLevel >= 7) {
    auraStyle.background = 'radial-gradient(circle, rgba(245, 158, 11, 0.4) 0%, transparent 70%)';
    auraStyle.animation = 'pulse 3s infinite alternate';
  } else {
    auraStyle.display = 'none';
  }
`;

avatar = avatar.replace(
  "  const bgItems = equippedItems.filter(i => i.avatarPart === 'background');",
  getHighestForge + "\n  const bgItems = equippedItems.filter(i => i.avatarPart === 'background');"
);

const renderAura = `
      <div style={auraStyle} className="forge-aura"></div>
      <canvas
`;

avatar = avatar.replace(
  "      <canvas",
  renderAura
);

fs.writeFileSync('src/components/AvatarCharacter.tsx', avatar);
