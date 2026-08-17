const fs = require('fs');

let content = fs.readFileSync('src/pages/QuestGameplay.tsx', 'utf-8');

// Fix 655
content = content.replace(/\.catch\(e => console\.error\(e\)\);/g, ".then(({error}) => { if(error) console.error(error); });");

// Fix 881 and 904
content = content.replace(/const userRef = doc\(db, 'users', userData!\.uid\);\n/g, "");
content = content.replace(/const userRef = doc\(db, 'users', userData\.uid\);\n/g, "");

// Fix 82 and 83 (unused state variables)
// const [coinsToRescue, setCoinsToRescue] = useState<number | null>(null);
// const [lostCoinsDisplay, setLostCoinsDisplay] = useState<number | null>(null);
content = content.replace(/  const \[coinsToRescue, setCoinsToRescue\] = useState<number \| null>\(null\);\n/g, "");
content = content.replace(/  const \[lostCoinsDisplay, setLostCoinsDisplay\] = useState<number \| null>\(null\);\n/g, "");

fs.writeFileSync('src/pages/QuestGameplay.tsx', content, 'utf-8');
console.log('Fixed QuestGameplay');
