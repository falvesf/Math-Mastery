const fs = require('fs');

let content = fs.readFileSync('src/pages/Dashboard.tsx', 'utf8');

// Import
content = content.replace(
  "import StudentStore from '../components/StudentStore';",
  "import StudentStore from '../components/StudentStore';\nimport BlacksmithModal from '../components/BlacksmithModal';"
);

// State
content = content.replace(
  "const [showLevelUp, setShowLevelUp] = useState(false);",
  "const [showLevelUp, setShowLevelUp] = useState(false);\n  const [showBlacksmithModal, setShowBlacksmithModal] = useState(false);"
);

// Find patent index to check Prata I
// Prata I usually means rank >= 5 (since Sem Patente=0, Bronze=1-4, Prata I=5)
const tabButton = `
          {canView('store', 'view') && (RANKS.findIndex(r => r.name === currentRank.name) >= 5) && (
            <button
              onClick={() => setShowBlacksmithModal(true)}
              title="A Forja"
              style={{ borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', background: showBlacksmithModal ? 'var(--gold-primary)' : 'var(--bg-card)', color: showBlacksmithModal ? 'var(--text-on-gold, #000000)' : 'var(--text-primary)', border: 'none', cursor: 'pointer', fontWeight: 'bold', transition: 'all 0.2s', padding: '0.75rem 1rem', whiteSpace: 'nowrap' }}
            >
              <Hammer size={20} /> <span className="tab-text">A Forja</span>
            </button>
          )}
`;

content = content.replace(
  /(\s*)\{canView\('store', 'view'\) && \(\s*<button\s*onClick=\{([^}]*)\}\s*title="Mercado"([\s\S]*?)<\/button>\s*\)\}/,
  "$1{canView('store', 'view') && (\n            <button\n              onClick={$2}\n              title=\"Mercado\"$3</button>\n          )}" + tabButton
);

// Add the modal rendering
const modalRender = `
      {showBlacksmithModal && userData && (
        <BlacksmithModal
          userData={userData}
          currentRankIndex={RANKS.findIndex(r => r.name === currentRank.name)}
          onClose={() => setShowBlacksmithModal(false)}
          onSuccess={() => {
            fetchUserData(user!.uid);
          }}
        />
      )}
`;

content = content.replace(
  "      {showCustomThemeModal && userData && (",
  modalRender + "\n      {showCustomThemeModal && userData && ("
);

// I might need to import Hammer from lucide-react if not there.
if (!content.includes("Hammer,")) {
  content = content.replace("Star,", "Star, Hammer,");
}

fs.writeFileSync('src/pages/Dashboard.tsx', content);
