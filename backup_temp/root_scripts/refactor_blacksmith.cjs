const fs = require('fs');

const file = 'src/components/BlacksmithView.tsx';
let content = fs.readFileSync(file, 'utf8');

// 5. Build 4-slot Transmutation UI and hide Sketchfab when in Transmute
// Find the Sketchfab Embed block:
const sketchfabEmbedRegex = /\{\/\* Sketchfab Embed \*\/\}([\s\S]*?)<\/div>\s*<\/div>/;
const sketchfabEmbedMatch = content.match(sketchfabEmbedRegex);
let originalSketchfab = '';
if (sketchfabEmbedMatch) {
  originalSketchfab = sketchfabEmbedMatch[0];
  const newSketchfab = `{activeTab === 'forge' && (
              ${originalSketchfab}
            )}`;
  content = content.replace(originalSketchfab, newSketchfab);
}

// Now replace the right-side Action Panel for transmute with the 4-slot UI
const transmuteContentRegex = /\{activeTab === 'transmute' && \([\s\S]*?\)\}/;
const transmuteContentMatch = content.match(transmuteContentRegex);

if (transmuteContentMatch) {
  const newTransmuteUI = `{activeTab === 'transmute' && (
              <>
                <h3 style={{ color: 'var(--gold-primary)', fontSize: '1.5rem', marginBottom: '1rem', borderBottom: '1px solid var(--border-glass)', paddingBottom: '0.5rem' }}>Altar de Transmutação</h3>
                
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '2rem' }}>
                  
                  {/* The 4 Slots Container */}
                  <div style={{ position: 'relative', width: '250px', height: '250px', background: 'radial-gradient(circle, rgba(139,92,246,0.2) 0%, transparent 70%)', display: 'flex', justifyContent: 'center', alignItems: 'center', borderRadius: '50%', border: '2px dashed rgba(139, 92, 246, 0.4)', boxShadow: '0 0 50px rgba(139, 92, 246, 0.1)' }}>
                    
                    {/* Center Slot - Main Item */}
                    <div style={{ position: 'absolute', width: '90px', height: '90px', background: 'rgba(0,0,0,0.8)', border: '2px solid var(--gold-primary)', borderRadius: '12px', display: 'flex', justifyContent: 'center', alignItems: 'center', boxShadow: '0 0 20px rgba(255, 215, 0, 0.5)', zIndex: 2 }}>
                      {selectedTransmuteItem ? (
                         <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                           <img src={selectedTransmuteItem.itemImageUrl} alt={selectedTransmuteItem.itemTitle} style={{ width: '70px', height: '70px', objectFit: 'contain' }} />
                           <div style={{ position: 'absolute', top: '-10px', right: '-10px', background: 'var(--accent-red)', color: 'white', fontSize: '0.8rem', fontWeight: 'bold', padding: '2px 4px', borderRadius: '4px' }}>+9</div>
                         </div>
                      ) : (
                         <span style={{ color: '#aaa', fontSize: '0.7rem', textAlign: 'center', padding: '0.5rem' }}>Equip. +9</span>
                      )}
                    </div>
                    
                    {/* Top Slot */}
                    <div style={{ position: 'absolute', top: '-10px', width: '60px', height: '60px', background: 'rgba(0,0,0,0.6)', border: '1px solid #8b5cf6', borderRadius: '8px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                      <span style={{ color: '#8b5cf6', fontSize: '0.6rem' }}>Ingrediente</span>
                    </div>

                    {/* Bottom Left Slot */}
                    <div style={{ position: 'absolute', bottom: '10px', left: '-10px', width: '60px', height: '60px', background: 'rgba(0,0,0,0.6)', border: '1px solid #8b5cf6', borderRadius: '8px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                      <span style={{ color: '#8b5cf6', fontSize: '0.6rem' }}>Ingrediente</span>
                    </div>

                    {/* Bottom Right Slot */}
                    <div style={{ position: 'absolute', bottom: '10px', right: '-10px', width: '60px', height: '60px', background: 'rgba(0,0,0,0.6)', border: '1px solid #8b5cf6', borderRadius: '8px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                      <span style={{ color: '#8b5cf6', fontSize: '0.6rem' }}>Ingrediente</span>
                    </div>
                    
                  </div>

                  {!selectedTransmuteItem ? (
                    <p style={{ color: 'var(--text-secondary)', textAlign: 'center' }}>Selecione um equipamento +9 no inventário para transmutar.</p>
                  ) : (
                    <div style={{ width: '100%', maxWidth: '400px' }}>
                      <div style={{ background: 'rgba(0,0,0,0.3)', padding: '1.5rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)', marginBottom: '1.5rem' }}>
                        <h4 style={{ color: 'white', margin: '0 0 0.5rem 0', fontSize: '1.2rem', textAlign: 'center' }}>{selectedTransmuteItem.itemTitle}</h4>
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#aaa', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                          <span>Custo:</span>
                          <span style={{ color: 'var(--gold-primary)', fontWeight: 'bold' }}>{selectedTransmuteItem.transmuteConfig?.coinsCost || 0} Moedas</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#aaa', fontSize: '0.9rem' }}>
                          <span>Chance de Sucesso:</span>
                          <span style={{ color: '#10B981', fontWeight: 'bold' }}>{selectedTransmuteItem.transmuteConfig?.successChance || 25}%</span>
                        </div>
                      </div>

                      <button 
                        onClick={handleTransmute}
                        disabled={isForging || userData.coins < (selectedTransmuteItem.transmuteConfig?.coinsCost || 0)}
                        style={{ width: '100%', padding: '1.2rem', background: 'linear-gradient(to right, #8b5cf6, #c084fc)', color: 'white', border: 'none', borderRadius: '12px', fontSize: '1.2rem', fontWeight: 'bold', cursor: isForging ? 'not-allowed' : 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', boxShadow: '0 4px 15px rgba(139, 92, 246, 0.3)', opacity: isForging ? 0.5 : 1 }}
                      >
                        <Sparkles size={24} className={isForging ? "animate-pulse" : ""} /> {isForging ? 'TRANSMUTANDO...' : 'INICIAR RITUAL'}
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}`;
  content = content.replace(transmuteContentMatch[0], newTransmuteUI);
}

fs.writeFileSync(file, content);
console.log('BlacksmithView updated');
