const fs = require('fs');
let file = 'src/components/StudentStore.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/background: canAfford \? 'rgba\\(0,0,0,0\\.[68]\\)'/g, "background: canAfford ? 'var(--bg-badge)'");
content = content.replace(/background: canAfford \? 'rgba\\(0,0,0,0\\.5\\)'/g, "background: canAfford ? 'var(--bg-badge)'");

fs.writeFileSync(file, content);
console.log('done');
