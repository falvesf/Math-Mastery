import os
import re

files_to_check = [
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
]

for filepath in files_to_check:
    if not os.path.exists(filepath): continue
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    original_content = content
    # Replace rgba(30, 41, 59, 0.95) with var(--bg-card)
    content = content.replace("'rgba(30, 41, 59, 0.95)'", "'var(--bg-card)'")
    # Replace background: 'rgba(255,255,255,0.1)', color: 'white' -> background: 'var(--btn-bg)', color: 'var(--text-primary)'
    content = re.sub(r"background:\s*'rgba\(255,255,255,0\.1\)',\s*border:\s*'none',\s*color:\s*'white'", "background: 'var(--btn-bg)', border: 'none', color: 'var(--text-primary)'", content)
    content = re.sub(r"background:\s*'transparent',\s*border:\s*'1px solid var\(--border-glass\)',\s*(?:borderRadius:\s*'8px',\s*)?color:\s*'white'", "background: 'transparent', border: '1px solid var(--border-glass)', borderRadius: '8px', color: 'var(--text-primary)'", content)
    content = re.sub(r"background:\s*'transparent',\s*border:\s*'none',\s*color:\s*'white'", "background: 'transparent', border: 'none', color: 'var(--text-primary)'", content)
    content = re.sub(r"background:\s*'rgba\(0,0,0,0\.3\)',\s*border:\s*'1px solid var\(--border-glass\)',\s*color:\s*'white'", "background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)'", content)
    content = re.sub(r"background:\s*'rgba\(0,0,0,0\.4\)',\s*border:\s*'1px solid rgba\(255,255,255,0\.1\)',\s*color:\s*'white'", "background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)'", content)
    content = re.sub(r"color:\s*'white',\s*flex:\s*1,\s*outline:\s*'none'", "color: 'var(--text-primary)', flex: 1, outline: 'none'", content)
    content = re.sub(r"background:\s*'transparent',\s*border:\s*'none',\s*color:\s*'white',\s*outline:\s*'none'", "background: 'transparent', border: 'none', color: 'var(--text-primary)', outline: 'none'", content)
    content = re.sub(r"background:\s*'rgba\(255,255,255,0\.1\)',\s*border:\s*'none',\s*color:\s*'white',\s*cursor:\s*'pointer'", "background: 'var(--btn-bg)', border: 'none', color: 'var(--text-primary)', cursor: 'pointer'", content)
    content = re.sub(r"color:\s*'white',\s*minHeight:", "color: 'var(--text-primary)', minHeight:", content)
    content = re.sub(r"background:\s*'rgba\(255,255,255,0\.1\)',\s*color:\s*'white'", "background: 'var(--btn-bg)', color: 'var(--text-primary)'", content)

    if content != original_content:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Updated {filepath}")
