const fs = require('fs');

const files = ['src/pages/QuestGameplay.tsx', 'src/pages/QuestGameplayMobile.tsx'];

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');

  // Replace wonSlots definition
  content = content.replace(
    /const wonSlots: \{ id: string, quantity: number \}\[\] = \[\];/g,
    "const wonSlots: { id: string, quantity: number, forgeLevel?: number }[] = [];"
  );
  
  // Replace liveChest wonSlots definition
  // Wait, does liveChest also use the same `wonSlots` type?
  // Let's replace any instance of `{ id: string, quantity: number }[]`
  content = content.replace(
    /\{ id: string, quantity: number \}\[\]/g,
    "{ id: string, quantity: number, forgeLevel?: number }[]"
  );

  fs.writeFileSync(file, content);
}

// Also update state variables in AdminDashboard.tsx which might complain:
let adminContent = fs.readFileSync('src/pages/AdminDashboard.tsx', 'utf8');

adminContent = adminContent.replace(
  /useState<\{maxCoins\?: number, itemIds\?: string\[\], itemQuantities\?: number\[\], slotChances\?: number\[\], dropChance\?: number, chestModelId\?: string\}>/g,
  "useState<{maxCoins?: number, itemIds?: string[], itemQuantities?: number[], itemForgeLevels?: number[], slotChances?: number[], dropChance?: number, chestModelId?: string}>"
);

adminContent = adminContent.replace(
  /useState<\{maxCoins\?: number, itemIds\?: string\[\], itemQuantities\?: number\[\]\}>/g,
  "useState<{maxCoins?: number, itemIds?: string[], itemQuantities?: number[], itemForgeLevels?: number[]}>"
);

fs.writeFileSync('src/pages/AdminDashboard.tsx', adminContent);
