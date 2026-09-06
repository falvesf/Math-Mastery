const { createClient } = require('@supabase/supabase-js');

const url = 'https://irpmeockteksidxnpznb.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlycG1lb2NrdGVrc2lkeG5wem5iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3NjA4NjUsImV4cCI6MjEwMjMzNjg2NX0.H0tBYFKtvX5B9fSGZmfEf5HNmZ3tVpwUEp-DLyeifZ0';

const supabase = createClient(url, key);

async function run() {
  const { data: userItemsSnap } = await supabase
    .from('user_items')
    .select('id, equipped, data')
    .eq('student_id', 'a98f797d-deec-46ce-ad4e-e47854619d85'); // Wait, I don't know the student ID!
    // Let me just fetch ANY 10 items
  const { data: all } = await supabase.from('user_items').select('id, equipped, data').limit(10);
  
  if (all) {
    all.forEach(row => {
      const itemData = row.data;
      const forgeLevel = itemData.forgeLevel || 0;
      const isEq = itemData?.type === 'equipment' || itemData?.itemType === 'equippable';
      const isEnabled = itemData?.isForgeable !== false;
      
      console.log(itemData.itemTitle, '->', { 
        type: itemData.type, 
        itemType: itemData.itemType, 
        isEq, 
        isEnabled, 
        isForgeable: itemData.isForgeable,
        equipped: row.equipped, 
        forgeLevel 
      });
    });
  }
}
run();
