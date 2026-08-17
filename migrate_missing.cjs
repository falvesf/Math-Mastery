const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { createClient } = require('@supabase/supabase-js');
const { v5: uuidv5 } = require('uuid');

const NAMESPACE = '1b671a64-40d5-491e-99b0-da01ff1f3341';
function toUuid(str) {
    if (!str) return str;
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str)) return str;
    return uuidv5(str, NAMESPACE);
}

const serviceAccount = require('./firebase-key.json.json');
initializeApp({ credential: cert(serviceAccount) });
const fbDb = getFirestore();

const SUPABASE_URL = 'https://irpmeockteksidxnpznb.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlycG1lb2NrdGVrc2lkeG5wem5iIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4Njc2MDg2NSwiZXhwIjoyMTAyMzM2ODY1fQ.Zhy4PP_vwQhd7Gef-1_7fSiLs7qJH38zIN0FT4KR40E';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function replaceFirebaseUrls(obj) {
    if (!obj) return obj;
    if (typeof obj === 'string') {
        const fbPrefix = 'https://firebasestorage.googleapis.com/v0/b/math-mastery-db.firebasestorage.app/o/';
        if (obj.includes(fbPrefix)) {
            const afterO = obj.split(fbPrefix)[1];
            if (afterO) {
                const filePathEncoded = afterO.split('?')[0];
                const filePath = decodeURIComponent(filePathEncoded);
                return `${SUPABASE_URL}/storage/v1/object/public/uploads/${filePath}`;
            }
        }
        return obj;
    }
    if (Array.isArray(obj)) {
        return obj.map(item => replaceFirebaseUrls(item));
    }
    if (typeof obj === 'object') {
        const newObj = {};
        for (const [k, v] of Object.entries(obj)) {
            newObj[k] = replaceFirebaseUrls(v);
        }
        return newObj;
    }
    return obj;
}

const TARGETS = [
    'classes', '3d_models', 'preset_skins', 'custom_ranks', 
    'themes', 'tileset_configs', 'monsters', 'live_quests'
];

async function run() {
    console.log("Starting missing data injection...");

    for (const col of TARGETS) {
        console.log(`Migrating ${col}...`);
        const snap = await fbDb.collection(col).get();
        for (let doc of snap.docs) {
            let data = doc.data();
            data = replaceFirebaseUrls(data);
            
            // Just map everything directly, preserving exact schema since we added all columns
            const row = { id: doc.id, ...data };
            
            const { error } = await supabase.from(col).upsert(row);
            if (error) console.error(`Error in ${col}/${doc.id}:`, error.message);
        }
    }

    console.log("Migrating quests...");
    const questsSnap = await fbDb.collection('quests').get();
    for (let doc of questsSnap.docs) {
        let data = doc.data();
        data = replaceFirebaseUrls(data);
        const newId = toUuid(doc.id);
        const row = {
            id: newId,
            ...data
        };
        const { error } = await supabase.from('quests').upsert(row);
        if (error) console.error(`Error in quests/${doc.id}:`, error.message);
    }
    
    console.log("Migrating gallery and API settings from system_collections...");
    // Since Firebase had 'settings/api', 'settings/gallery' etc.
    // They were already migrated into system_collections in my FIRST phase.
    // Let's verify they exist in system_collections
    const settingsSnap = await fbDb.collection('settings').get();
    for (let doc of settingsSnap.docs) {
        let data = doc.data();
        data = replaceFirebaseUrls(data);
        const { error } = await supabase.from('system_collections').upsert({
            id: doc.id === 'api' ? 100 : (doc.id === 'gallery' ? 101 : 102), // Arbitrary numeric IDs to satisfy primary key if needed, wait system_collections has text ID?
            collection_name: 'settings',
            doc_id: doc.id,
            data: data
        });
        if (error) {
            // It might fail if system_collections ID is numeric. 
            // In my first phase, system_collections was id(uuid), collection_name, doc_id, data
            // Let's just use UUIDv5 for consistent ID
            const newId = toUuid('system_collections_' + doc.id);
            await supabase.from('system_collections').upsert({
                id: newId,
                collection_name: 'settings',
                doc_id: doc.id,
                data: data
            });
        }
    }

    console.log("ALL DONE!");
}

run();
