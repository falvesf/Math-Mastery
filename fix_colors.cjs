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
    content = content.replace(/style=\{\{(.*?)\}\}/g, (match, inner) => {
        if (inner.includes('var(--gold-primary)') && (inner.includes("'black'") || inner.includes('"black"'))) {
            changed = true;
            return 'style={{' + inner.replace(/color:\s*['"]black['"]/, "color: 'var(--text-on-gold, #000000)'") + '}}';
        }
        return match;
    });
    if(changed) {
        fs.writeFileSync(f, content);
        c++;
    }
});
console.log('Modified ' + c + ' files');
