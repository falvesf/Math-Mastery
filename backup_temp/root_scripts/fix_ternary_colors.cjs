const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
    fs.readdirSync(dir).forEach(f => {
        const dirPath = path.join(dir, f);
        const isDirectory = fs.statSync(dirPath).isDirectory();
        isDirectory ? walkDir(dirPath, callback) : callback(path.join(dir, f));
    });
}

walkDir('./src', (filePath) => {
    if (!filePath.endsWith('.tsx') && !filePath.endsWith('.ts')) return;
    
    let content = fs.readFileSync(filePath, 'utf8');
    const originalContent = content;
    
    // Fix Dashboard and AdminDashboard specific backgrounds
    content = content.replace(/'rgba\(255,255,255,0\.05\)'/g, "'var(--btn-bg)'");
    
    // Fix ternary color assignments returning 'white'
    content = content.replace(/color:\s*([^?]+)\s*\?\s*([^:]+)\s*:\s*'white'/g, "color: $1 ? $2 : 'var(--text-primary)'");
    
    // Fix ternary color assignments where 'white' is the true condition (unlikely but just in case)
    content = content.replace(/color:\s*([^?]+)\s*\?\s*'white'\s*:\s*([^,}]+)/g, "color: $1 ? 'var(--text-primary)' : $2");

    // Also replace the rgba(0,0,0,0.3) for the StudentStore sub-tabs
    content = content.replace(/background:\s*officialCategoryTab\s*===\s*'([^']+)'\s*\?\s*'var\(--gold-primary\)'\s*:\s*'rgba\(0,0,0,0\.3\)'/g, "background: officialCategoryTab === '$1' ? 'var(--gold-primary)' : 'var(--btn-bg)'");

    if (content !== originalContent) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`Updated ${filePath}`);
    }
});
