const fs = require('fs');
function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        file = dir + '/' + file;
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) { 
            results = results.concat(walk(file));
        } else { 
            if(file.endsWith('.tsx') || file.endsWith('.css')) results.push(file);
        }
    });
    return results;
}
const files = walk('src');
let c = 0;
files.forEach(f => {
    let content = fs.readFileSync(f, 'utf8');
    let changed = false;
    content = content.replace(/style=\{\{(.*?)\}\}/gs, (match, inner) => {
        if (inner.includes("'black'") || inner.includes('"black"')) {
            // Ignore if background is silver, bronze, white or #fbbf24 (hardcoded amber)
            if (inner.includes('silver') || inner.includes('#cd7f32') || inner.includes('white') || inner.includes('#fbbf24')) {
                return match;
            }
            
            const updated = inner
                .replace(/\?\s*['"]black['"]\s*:/g, "? 'var(--text-on-gold, #000000)' :")
                .replace(/:\s*['"]black['"]\s*([,}])/g, ": 'var(--text-on-gold, #000000)'$1");
                
            if (inner !== updated) {
                changed = true;
                return 'style={{' + updated + '}}';
            }
        }
        return match;
    });
    if(changed) {
        fs.writeFileSync(f, content);
        c++;
    }
});
console.log('Modified ' + c + ' files');
