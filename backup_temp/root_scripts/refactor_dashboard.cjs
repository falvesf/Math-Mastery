const fs = require('fs');

const file = 'src/pages/Dashboard.tsx';
let content = fs.readFileSync(file, 'utf8');

// 1. Rename import
content = content.replace(
  /import BlacksmithModal from '\.\.\/components\/BlacksmithModal';/g,
  "import BlacksmithView from '../components/BlacksmithView';"
);

// 2. Add 'forge' tab button in the navigation. The user might have a navigation section.
// Let's search for the navigation buttons. We have 'rankings', 'store', etc.
const navRegex = /<button[\s\S]*?onClick=\{\(\) => setActiveTab\('store'\)\}[\s\S]*?<\/button>/;
const navMatch = content.match(navRegex);
if (navMatch) {
  const newBtn = `
            <button
              onClick={() => setActiveTab('forge')}
              style={{ borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', background: activeTab === 'forge' ? 'var(--gold-primary)' : 'var(--bg-card)', color: activeTab === 'forge' ? 'var(--text-on-gold, #000000)' : 'var(--text-primary)', border: 'none', cursor: 'pointer', fontWeight: 'bold', transition: 'all 0.2s', padding: '0.75rem 1rem', whiteSpace: 'nowrap' }}
              className="hover-brightness"
            >
              <Hammer size={18} /> A Forja
            </button>`;
  // Insert the new button right after the Store button
  content = content.replace(navMatch[0], navMatch[0] + newBtn);
}

// Mobile nav has a bottom bar.
const mobileNavRegex = /<button[\s\S]*?onClick=\{\(\) => setActiveTab\('store'\)\}[\s\S]*?Loja[\s\S]*?<\/button>/g;
let mobileNavMatch;
let lastMobileNavMatch;
while ((mobileNavMatch = mobileNavRegex.exec(content)) !== null) {
  lastMobileNavMatch = mobileNavMatch[0];
}

if (lastMobileNavMatch) {
  // Insert bottom nav button for Forge
  const newMobileBtn = `
        <button
          onClick={() => setActiveTab('forge')}
          style={{ background: 'transparent', border: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.2rem', color: activeTab === 'forge' ? 'var(--gold-primary)' : 'var(--text-secondary)', padding: '0.5rem', flex: 1, minWidth: 0 }}
        >
          <Hammer size={20} color={activeTab === 'forge' ? 'var(--gold-primary)' : 'var(--text-secondary)'} />
          <span style={{ fontSize: '0.65rem', fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%', textAlign: 'center' }}>Forja</span>
        </button>`;
  content = content.replace(lastMobileNavMatch, lastMobileNavMatch + newMobileBtn);
}

// 3. Remove the old conditional render of the modal
const oldRenderRegex = /\{showBlacksmithModal && userData && \([\s\S]*?<\/BlacksmithModal>[\s\S]*?\)\}/;
content = content.replace(oldRenderRegex, '');

// 4. Add the new conditional render based on activeTab
const newRender = `
        {activeTab === 'forge' && userData && (
          <BlacksmithView
            userData={userData}
            currentRankIndex={RANKS.findIndex(r => r.name === currentRank.name)}
            onClose={() => {}}
            onSuccess={() => { window.location.reload(); }}
          />
        )}`;

// Insert this near StudentStore render
const storeRenderRegex = /\{activeTab === 'store' && userData && \([\s\S]*?<\/StudentStore>[\s\S]*?\)\}/;
const storeRenderMatch = content.match(storeRenderRegex);
if (storeRenderMatch) {
  content = content.replace(storeRenderMatch[0], storeRenderMatch[0] + '\n' + newRender);
}

// 5. Ensure Hammer is imported from lucide-react if not already
if (!content.includes('Hammer,')) {
  content = content.replace(/import \{([\s\S]*?)\} from 'lucide-react';/, "import { Hammer, $1 } from 'lucide-react';");
}

fs.writeFileSync(file, content);
console.log('Dashboard updated');
