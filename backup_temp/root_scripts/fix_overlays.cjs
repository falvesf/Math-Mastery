const fs = require('fs');

const files_to_check = [
    'src/pages/LiveQuestStudent.tsx',
    'src/pages/QuestGameplay.tsx'
];

for (const filepath of files_to_check) {
    if (!fs.existsSync(filepath)) continue;
    
    let content = fs.readFileSync(filepath, 'utf8');
    const original_content = content;
    
    content = content.replace(/rgba\(15, 23, 42, 0\.5\)/g, 'rgba(0, 0, 0, 0.5)');
    content = content.replace(/rgba\(15, 23, 42, 0\.85\)/g, 'rgba(0, 0, 0, 0.85)');
    
    if (content !== original_content) {
        fs.writeFileSync(filepath, content, 'utf8');
        console.log(`Updated ${filepath}`);
    }
}
