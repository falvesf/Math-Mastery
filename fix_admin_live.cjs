const fs = require('fs');

let admin = fs.readFileSync('src/pages/LiveQuestAdmin.tsx', 'utf-8');

// Add import if missing
if (!admin.includes("import { supabase }")) {
    admin = admin.replace(/import \{ useAuth \} from '\.\.\/contexts\/AuthContext';\n/, "import { useAuth } from '../contexts/AuthContext';\nimport { supabase } from '../lib/supabase';\n");
}

// Replace serverTimestamp
admin = admin.replace(/serverTimestamp\(\)/g, "new Date().toISOString()");

// Fix the typo of xp_logs missing timestamp handling by removing timestamp or renaming
admin = admin.replace(/timestamp: new Date\(\)\.toISOString\(\)/g, "created_at: new Date().toISOString()");

// Wait, looking at xp_logs inserts:
admin = admin.replace(/timestamp: serverTimestamp\(\)/g, "created_at: new Date().toISOString()");

fs.writeFileSync('src/pages/LiveQuestAdmin.tsx', admin, 'utf-8');
console.log('done');
