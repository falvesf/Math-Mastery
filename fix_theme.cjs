const fs = require('fs');
const path = require('path');

const files_to_check = [
    'src/pages/AdminDashboard.tsx',
    'src/pages/Dashboard.tsx',
    'src/pages/QuestGameplay.tsx',
    'src/components/AdminRankManager.tsx',
    'src/components/AdminStoreManager.tsx',
    'src/components/GachaConfigModal.tsx',
    'src/components/PublicProfileModal.tsx',
    'src/components/StudentInventory.tsx',
    'src/components/StudentStore.tsx',
    'src/components/TilesetPicker.tsx',
    'src/components/ImageGalleryModal.tsx',
    'src/components/OnboardingModal.tsx'
];

for (const filepath of files_to_check) {
    if (!fs.existsSync(filepath)) continue;
    
    let content = fs.readFileSync(filepath, 'utf8');
    const original_content = content;
    
    content = content.replace(/'rgba\(30, 41, 59, 0\.95\)'/g, "'var(--bg-card)'");
    content = content.replace(/background:\s*'rgba\(255,255,255,0\.1\)',\s*border:\s*'none',\s*color:\s*'white'/g, "background: 'var(--btn-bg)', border: 'none', color: 'var(--text-primary)'");
    content = content.replace(/background:\s*'transparent',\s*border:\s*'1px solid var\(--border-glass\)',\s*color:\s*'white'/g, "background: 'transparent', border: '1px solid var(--border-glass)', color: 'var(--text-primary)'");
    content = content.replace(/background:\s*'transparent',\s*border:\s*'1px solid var\(--border-glass\)',\s*borderRadius:\s*'8px',\s*color:\s*'white'/g, "background: 'transparent', border: '1px solid var(--border-glass)', borderRadius: '8px', color: 'var(--text-primary)'");
    content = content.replace(/background:\s*'transparent',\s*border:\s*'none',\s*color:\s*'white'/g, "background: 'transparent', border: 'none', color: 'var(--text-primary)'");
    content = content.replace(/background:\s*'rgba\(0,0,0,0\.3\)',\s*border:\s*'1px solid var\(--border-glass\)',\s*color:\s*'white'/g, "background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)'");
    content = content.replace(/background:\s*'rgba\(0,0,0,0\.4\)',\s*border:\s*'1px solid rgba\(255,255,255,0\.1\)',\s*color:\s*'white'/g, "background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)'");
    content = content.replace(/color:\s*'white',\s*flex:\s*1,\s*outline:\s*'none'/g, "color: 'var(--text-primary)', flex: 1, outline: 'none'");
    content = content.replace(/background:\s*'transparent',\s*border:\s*'none',\s*color:\s*'white',\s*outline:\s*'none'/g, "background: 'transparent', border: 'none', color: 'var(--text-primary)', outline: 'none'");
    content = content.replace(/background:\s*'rgba\(255,255,255,0\.1\)',\s*border:\s*'none',\s*color:\s*'white',\s*cursor:\s*'pointer'/g, "background: 'var(--btn-bg)', border: 'none', color: 'var(--text-primary)', cursor: 'pointer'");
    content = content.replace(/color:\s*'white',\s*minHeight:/g, "color: 'var(--text-primary)', minHeight:");
    content = content.replace(/background:\s*'rgba\(255,255,255,0\.1\)',\s*color:\s*'white'/g, "background: 'var(--btn-bg)', color: 'var(--text-primary)'");
    content = content.replace(/background:\s*'transparent',\s*border:\s*'none',\s*color:\s*'white',\s*cursor:\s*'pointer'/g, "background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer'");

    
    if (content !== original_content) {
        fs.writeFileSync(filepath, content, 'utf8');
        console.log(`Updated ${filepath}`);
    }
}
