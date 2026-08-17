const { initializeApp, cert } = require('firebase-admin/app');
const { getStorage } = require('firebase-admin/storage');
const serviceAccount = require('./firebase-key.json.json');

initializeApp({ credential: cert(serviceAccount) });

async function run() {
    try {
        const bucket = getStorage().bucket('math-mastery-db.firebasestorage.app');
        const [files] = await bucket.getFiles({ maxResults: 1 });
        console.log(`Success! Found ${files.length} files in firebasestorage.app.`);
        if (files.length > 0) console.log(files[0].name);
    } catch (e) {
        console.error("firebasestorage.app error:", e.message);
        try {
            const bucket2 = getStorage().bucket('math-mastery-db.appspot.com');
            const [files2] = await bucket2.getFiles({ maxResults: 1 });
            console.log(`Success! Found ${files2.length} files in appspot.com.`);
        } catch (e2) {
            console.error("appspot.com error:", e2.message);
        }
    }
}
run();
