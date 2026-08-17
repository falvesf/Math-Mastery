const { createClient } = require('@supabase/supabase-js');
const SUPABASE_URL = 'https://irpmeockteksidxnpznb.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlycG1lb2NrdGVrc2lkeG5wem5iIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4Njc2MDg2NSwiZXhwIjoyMTAyMzM2ODY1fQ.Zhy4PP_vwQhd7Gef-1_7fSiLs7qJH38zIN0FT4KR40E';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function run() {
    console.log('Fetching all users...');
    const { data: users } = await supabase.from('users').select('id, name');
    
    for (const user of users) {
        const { data: items } = await supabase.from('user_items').select('id, data, equipped').eq('student_id', user.id).eq('equipped', true);
        if (!items || items.length <= 1) continue;
        
        const equippedByPart = {};
        
        for (const item of items) {
            if (!item.data || !item.data.avatarPart) continue;
            const part = item.data.avatarPart;
            
            if (part === 'hand') {
                const category = item.data.itemCategory || 'unknown';
                const key = `hand_${category}`; // e.g. hand_attack, hand_defense
                if (!equippedByPart[key]) {
                    equippedByPart[key] = [];
                }
                equippedByPart[key].push(item);
            } else {
                if (!equippedByPart[part]) {
                    equippedByPart[part] = [];
                }
                equippedByPart[part].push(item);
            }
        }
        
        // Check for two-handed
        const hasTwoHanded = items.some(i => i.data && i.data.avatarPart === 'two_handed');
        
        for (const [key, eqItems] of Object.entries(equippedByPart)) {
            if (user.name.includes('Fabio')) {
                console.log(`Fabio part ${key} has ${eqItems.length} items.`);
            }
            if (hasTwoHanded && key.startsWith('hand_')) {
                // If they have two-handed, they shouldn't have ANY hands equipped
                for (const item of eqItems) {
                    console.log(`Unequipping ${item.data.itemTitle} for ${user.name} (has two_handed)`);
                    await supabase.from('user_items').update({ equipped: false }).eq('id', item.id);
                }
            } else if (eqItems.length > 1) {
                // Keep the first one, unequip the rest
                for (let i = 1; i < eqItems.length; i++) {
                    const itemToUnequip = eqItems[i];
                    console.log(`Unequipping duplicate ${itemToUnequip.data.itemTitle} for ${user.name}`);
                    await supabase.from('user_items').update({ equipped: false }).eq('id', itemToUnequip.id);
                }
            }
        }
        
        // Also if they have multiple two_handed
        if (equippedByPart['two_handed'] && equippedByPart['two_handed'].length > 1) {
            for (let i = 1; i < equippedByPart['two_handed'].length; i++) {
                const itemToUnequip = equippedByPart['two_handed'][i];
                console.log(`Unequipping duplicate ${itemToUnequip.data.itemTitle} for ${user.name}`);
                await supabase.from('user_items').update({ equipped: false }).eq('id', itemToUnequip.id);
            }
        }
    }
    console.log('Done fixing equipped items.');
}

run();
