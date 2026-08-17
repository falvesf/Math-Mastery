const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const serviceAccount = require('./firebase-key.json.json');
initializeApp({ 
    credential: cert(serviceAccount),
    storageBucket: 'math-mastery-db.firebasestorage.app'
});
const fbDb = getFirestore();
const fbBucket = getStorage().bucket();

const SUPABASE_URL = 'https://irpmeockteksidxnpznb.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlycG1lb2NrdGVrc2lkeG5wem5iIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4Njc2MDg2NSwiZXhwIjoyMTAyMzM2ODY1fQ.Zhy4PP_vwQhd7Gef-1_7fSiLs7qJH38zIN0FT4KR40E';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const TARGET_TABLES = [
    'classes', '3d_models', 'preset_skins', 'custom_ranks', 
    'themes', 'tileset_configs', 'monsters', 'store_items', 'live_quests'
];

function replaceFirebaseUrls(obj) {
    if (!obj) return obj;
    if (typeof obj === 'string') {
        const fbPrefix = 'https://firebasestorage.googleapis.com/v0/b/math-mastery-db.firebasestorage.app/o/';
        if (obj.includes(fbPrefix)) {
            // parse out the path
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

async function migrateData() {
    console.log("--- MIGRATING FIRESTORE DATA ---");
    const collections = await fbDb.listCollections();
    
    for (let collection of collections) {
        if (!TARGET_TABLES.includes(collection.id)) continue;
        console.log(`Migrating ${collection.id}...`);
        
        const snap = await collection.get();
        for (let doc of snap.docs) {
            let data = doc.data();
            data = replaceFirebaseUrls(data);
            
            // For tables where 'data' is NOT a jsonb column but the object itself is flattened
            let row = { id: doc.id, ...data };
            
            // Handle specific tables where schema might be slightly different
            if (collection.id === '3d_models') {
                row = { id: doc.id, name: data.name, url: data.url, defaultTransforms: data.defaultTransforms };
            } else if (collection.id === 'preset_skins') {
                row = { id: doc.id, name: data.name, url: data.url, transforms: data.transforms, price: data.price, currencyType: data.currencyType };
            } else if (collection.id === 'custom_ranks') {
                row = { id: doc.id, name: data.name, minXp: data.minXp, imageUrl: data.imageUrl };
            } else if (collection.id === 'themes') {
                row = { id: doc.id, name: data.name, primaryColor: data.primaryColor, secondaryColor: data.secondaryColor, backgroundColor: data.backgroundColor, surfaceColor: data.surfaceColor, textPrimary: data.textPrimary, textSecondary: data.textSecondary, accentColor: data.accentColor };
            } else if (collection.id === 'tileset_configs') {
                row = { id: doc.id, name: data.name, imageUrl: data.imageUrl, gridSize: data.gridSize, solidTiles: data.solidTiles, hazardTiles: data.hazardTiles, itemSpawns: data.itemSpawns, monsterSpawns: data.monsterSpawns };
            } else if (collection.id === 'monsters') {
                row = { id: doc.id, name: data.name, modelUrl: data.modelUrl, hp: data.hp, damage: data.damage, modelTransforms: data.modelTransforms };
            } else if (collection.id === 'store_items') {
                // store_items is flat in Supabase!
                row = { id: doc.id, ...data };
                // remove specific nested fields if they cause issues, but Supabase will ignore extra columns usually
            } else if (collection.id === 'live_quests') {
                row = { id: doc.id, status: data.status, players: data.players, monsterHp: data.monsterHp };
            } else if (collection.id === 'classes') {
                row = { id: doc.id, name: data.name, color: data.color };
            }
            
            const { error } = await supabase.from(collection.id).upsert(row);
            if (error) {
                console.error(`Error migrating ${collection.id}/${doc.id}:`, error.message);
            }
        }
    }
}

async function migrateStorage() {
    console.log("--- MIGRATING STORAGE FILES ---");
    const [files] = await fbBucket.getFiles();
    console.log(`Found ${files.length} files in Firebase Storage.`);
    
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.name.endsWith('/')) continue; // skip directories
        
        console.log(`[${i+1}/${files.length}] Uploading ${file.name}...`);
        
        try {
            const [buffer] = await file.download();
            const { error } = await supabase.storage.from('uploads').upload(file.name, buffer, {
                contentType: file.metadata.contentType,
                upsert: true
            });
            if (error) {
                console.error(`Error uploading ${file.name}:`, error.message);
            }
        } catch (e) {
            console.error(`Failed to download ${file.name}:`, e.message);
        }
    }
}

async function fixCode() {
    console.log("--- FIXING REACT CODE ---");
    // Just replace the lingering firebase references
    const fixFile = (fp, replacePairs) => {
        if (!fs.existsSync(fp)) return;
        let content = fs.readFileSync(fp, 'utf-8');
        let original = content;
        for (let [search, replacement] of replacePairs) {
            content = content.replace(search, replacement);
        }
        if (content !== original) {
            fs.writeFileSync(fp, content);
            console.log(`Fixed ${fp}`);
        }
    };
    
    // In ImageGalleryModal.tsx, they get pixabayKey
    fixFile('src/components/ImageGalleryModal.tsx', [
        [/import \{[^}]+\} from 'firebase\/firestore';\n/g, ''],
        [/import \{[^}]+\} from 'firebase\/storage';\n/g, ''],
        [/import \{ db, storage \} from '\.\.\/lib\/firebase';/g, ''],
        [/import \{[^}]+\} from '\.\.\/lib\/firebase';/g, ''],
        [/const snap = await getDoc\(doc\(db, 'settings', 'api'\)\);/g, "const { data: snap } = await supabase.from('system_collections').select('data').eq('type', 'api').single();"],
        [/if \(snap\.exists\(\)\)/g, 'if (snap)'],
        [/setApiKey\(snap\.data\(\)\.pixabayKey\);/g, 'setApiKey(snap.data?.pixabayKey);'],
        [/await setDoc\(doc\(db, 'settings', 'api'\), \{ pixabayKey: localApiKey \}, \{ merge: true \}\);/g, "await supabase.from('system_collections').upsert({ type: 'api', data: { pixabayKey: localApiKey } });"]
    ]);
}

async function run() {
    try {
        await migrateData();
        await migrateStorage();
        await fixCode();
        console.log("DEEP MIGRATION COMPLETE!");
    } catch (e) {
        console.error("Fatal Error:", e);
    }
    process.exit(0);
}

run();
