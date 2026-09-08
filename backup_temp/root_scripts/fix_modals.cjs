const fs = require('fs');

let content = fs.readFileSync('src/components/OnboardingModal.tsx', 'utf-8');

// Replace imports
content = content.replace("import { collection, getDocs } from 'firebase/firestore';\n", "");
content = content.replace("import { db } from '../lib/firebase';\n", "import { supabase } from '../lib/supabase';\n");

const oldFetchStr = `      const querySnapshot = await getDocs(collection(db, 'users'));
      let rankCount = 1;
      querySnapshot.forEach((doc) => {
        if (doc.data().role === 'admin' || doc.data().role === 'coordinator') {
          rankCount++;
        }
      });`;

const newFetchStr = `      const { count } = await supabase.from('users').select('*', { count: 'exact', head: true }).in('role', ['admin', 'coordinator']);
      let rankCount = 1 + (count || 0);`;

content = content.replace(oldFetchStr, newFetchStr);
fs.writeFileSync('src/components/OnboardingModal.tsx', content, 'utf-8');
console.log('Fixed OnboardingModal');


let profileContent = fs.readFileSync('src/components/PublicProfileModal.tsx', 'utf-8');
profileContent = profileContent.replace("import { db } from '../lib/firebase';\n", "import { supabase } from '../lib/supabase';\n");
profileContent = profileContent.replace("import { collection, query, where, getDocs } from 'firebase/firestore';\n", "");

const oldProfFetchStr = `        const q = query(collection(db, 'users'), where('uid', '==', uid));
        const snapshot = await getDocs(q);
        
        if (!snapshot.empty) {
          setProfileData(snapshot.docs[0].data());
        } else {
          setProfileData(null);
        }`;
const newProfFetchStr = `        const { data } = await supabase.from('users').select('*').eq('id', uid).single();
        if (data) {
          setProfileData(data);
        } else {
          setProfileData(null);
        }`;

profileContent = profileContent.replace(oldProfFetchStr, newProfFetchStr);
fs.writeFileSync('src/components/PublicProfileModal.tsx', profileContent, 'utf-8');
console.log('Fixed PublicProfileModal');
