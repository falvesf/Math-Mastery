const fs = require('fs');

const files = ['src/pages/QuestGameplay.tsx', 'src/pages/QuestGameplayMobile.tsx'];

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');

  // Replace push for chestConfig
  content = content.replace(
    /wonSlots\.push\(\{ id: itemId, quantity: quest\.chestConfig\.itemQuantities\?\.\[i\] \|\| 1 \}\);/g,
    "wonSlots.push({ id: itemId, quantity: quest.chestConfig.itemQuantities?.[i] || 1, forgeLevel: quest.chestConfig.itemForgeLevels?.[i] || 0 });"
  );
  
  // Replace push for liveChest
  content = content.replace(
    /wonSlots\.push\(\{ id: itemId, quantity: targetChest\.itemQuantities\?\.\[i\] \|\| 1 \}\);/g,
    "wonSlots.push({ id: itemId, quantity: targetChest.itemQuantities?.[i] || 1, forgeLevel: targetChest.itemForgeLevels?.[i] || 0 });"
  );

  // Add forgeLevel to the itemData created from chest slots
  content = content.replace(
    /minSalePrice: item\.minSalePrice \|\| 0(\s*)\}/g,
    "minSalePrice: item.minSalePrice || 0,\n                  forgeLevel: slot.forgeLevel || 0$1}"
  );

  // Add forgeLevel to monster drops
  content = content.replace(
    /adds: item\.type === 'equippable' \? rollItemAdds\(.*\) : \[\](\s*)\}/g,
    "adds: item.type === 'equippable' ? rollItemAdds(item.gachaConfig, item.fixedAttributes, (item.useGlobalGacha ?? true) ? globalGachaConfig : undefined, getMaxAddsLimit(item.minRankRequired)) : [],\n              forgeLevel: drop.forgeLevel || 0$1}"
  );

  fs.writeFileSync(file, content);
}

// Now update AdminDashboard.tsx to include the input for forgeLevel
let adminContent = fs.readFileSync('src/pages/AdminDashboard.tsx', 'utf8');

const forgeLevelInput = `
                {selectedItem?.type === 'equippable' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Nível da Forja:</span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--gold-primary)', fontWeight: 'bold' }}>+</span>
                    <input 
                      type="number" min="0" max="9"
                      value={chestConfig?.itemForgeLevels?.[slot] || 0}
                      onChange={e => {
                        const newForge = [...(chestConfig?.itemForgeLevels || [])];
                        newForge[slot] = Math.max(0, parseInt(e.target.value) || 0);
                        setChestConfig({ ...chestConfig, itemForgeLevels: newForge });
                      }}
                      style={{ width: '50px', padding: '0.5rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontFamily: 'inherit' }}
                    />
                  </div>
                )}
`;

adminContent = adminContent.replace(
  /(\s*)\{isConsumable && \(\s*<div style=\{\{ display: 'flex', alignItems: 'center', gap: '0\\.5rem' \}\}>\s*<span/,
  forgeLevelInput + "$1{isConsumable && (\n                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>\n                    <span"
);

// Also need to add forgeLevel to monsterDrops UI
const monsterDropForgeInput = `
                      {availableStoreItems.find(i => i.id === drop.itemId)?.type === 'equippable' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Forja: +</span>
                          <input 
                            type="number" min="0" max="9"
                            value={drop.forgeLevel || 0}
                            onChange={e => {
                              const newDrops = [...questMonsterDrops];
                              newDrops[index].forgeLevel = parseInt(e.target.value) || 0;
                              setQuestMonsterDrops(newDrops);
                            }}
                            style={{ width: '50px', padding: '0.5rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontFamily: 'inherit' }}
                          />
                        </div>
                      )}
`;

adminContent = adminContent.replace(
  /(\s*)<button\s*onClick=\{([^}]*)\}\s*style=\{\{ background: 'transparent', border: 'none', color: 'var\(--accent-red\)', cursor: 'pointer', padding: '0\.5rem' \}\}>\s*<Trash2 size=\{20\} \/>\s*<\/button>/g,
  monsterDropForgeInput + "$1<button onClick={$2} style={{ background: 'transparent', border: 'none', color: 'var(--accent-red)', cursor: 'pointer', padding: '0.5rem' }}>\n                              <Trash2 size={20} />\n                            </button>"
);

fs.writeFileSync('src/pages/AdminDashboard.tsx', adminContent);
console.log("Updated chest and drops logic!");
