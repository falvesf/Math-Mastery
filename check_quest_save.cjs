const fs = require('fs');
const content = fs.readFileSync('src/pages/AdminDashboard.tsx', 'utf-8');
const lines = content.split('\n');
lines.forEach((line, index) => {
    if (line.includes('quests') && line.includes('supabase.from')) {
        console.log(`Line ${index + 1}: ${line}`);
    }
    if (line.includes('handleSave')) {
        console.log(`Line ${index + 1}: ${line}`);
    }
});
