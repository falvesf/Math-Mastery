const fs = require('fs');

let content = fs.readFileSync('src/pages/QuestGameplay.tsx', 'utf-8');

// Regex matches the line, removing the whole line including whitespace
content = content.replace(/.*const userRef = doc\(db, 'users', userData!\.uid\);.*\n/g, "");
content = content.replace(/.*const userRef = doc\(db, 'users', userData\.uid\);.*\n/g, "");
content = content.replace(/.*const \[coinsToRescue, setCoinsToRescue\].*\n/g, "");
content = content.replace(/.*const \[lostCoinsDisplay, setLostCoinsDisplay\].*\n/g, "");

fs.writeFileSync('src/pages/QuestGameplay.tsx', content, 'utf-8');
console.log('Fixed QuestGameplay2');
