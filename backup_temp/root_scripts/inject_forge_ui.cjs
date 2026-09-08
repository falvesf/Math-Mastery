const fs = require('fs');
let content = fs.readFileSync('src/components/AdminStoreManager.tsx', 'utf8');

const injection = `
            {formData.type === 'equippable' && (
              <div style={{ background: 'rgba(239, 68, 68, 0.05)', padding: '1.25rem', borderRadius: '12px', marginBottom: '1.5rem', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                <h4 style={{ margin: '0 0 1rem 0', color: 'var(--accent-red)', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  🔥 Forja e Transmutação
                </h4>
                
                <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'white', cursor: 'pointer' }}>
                    <input type="checkbox" checked={formData.isForgeable || false} onChange={e => setFormData({...formData, isForgeable: e.target.checked})} style={{ width: '20px', height: '20px' }} />
                    Item Forjável (Permite upgrades até +9)
                  </label>
                </div>

                {formData.isForgeable && (
                  <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-glass)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                      <strong style={{ color: 'var(--text-secondary)' }}>Evolução de Status e Custos</strong>
                      <button 
                        type="button"
                        onClick={() => {
                          if (confirm("Isto irá apagar as configurações atuais de forja e gerar uma progressão baseada no Atributo Base e Custo em Moedas. Continuar?")) {
                            const baseStat = formData.baseAttributeValue || 10;
                            const baseCost = formData.price || 100;
                            const statsPerLevel = Array(10).fill(0);
                            const coinsCostPerLevel = Array(10).fill(0);
                            const successChancePerLevel = Array(10).fill(100);
                            
                            // +9 = 100% of baseStat. +0 = 10% of baseStat.
                            for(let i=0; i<=9; i++) {
                              statsPerLevel[i] = Math.max(1, Math.floor(baseStat * ((i+1)/10)));
                              
                              if (i > 0) {
                                // coins: +1 = baseCost + 10%, +2 = prev + 20%, etc.
                                coinsCostPerLevel[i] = Math.floor((i === 1 ? baseCost : coinsCostPerLevel[i-1]) * (1 + (i*0.1)));
                                
                                // chances: decreases progressively
                                successChancePerLevel[i] = Math.max(10, 100 - (i * 10)); 
                              }
                            }
                            
                            setFormData({
                              ...formData,
                              forgeConfig: {
                                ...formData.forgeConfig,
                                statsPerLevel,
                                coinsCostPerLevel,
                                successChancePerLevel
                              }
                            });
                          }
                        }}
                        style={{ padding: '0.5rem 1rem', background: 'rgba(245, 158, 11, 0.2)', border: '1px solid #f59e0b', color: '#f59e0b', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold' }}
                      >
                        ⚡ Gerar Progressão Automática
                      </button>
                    </div>

                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', minWidth: '600px', textAlign: 'left', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid var(--border-glass)' }}>
                            <th style={{ padding: '0.5rem', color: 'var(--text-secondary)' }}>Nível</th>
                            <th style={{ padding: '0.5rem', color: 'var(--text-secondary)' }}>Poder do Atributo</th>
                            <th style={{ padding: '0.5rem', color: 'var(--text-secondary)' }}>Custo (Para upar)</th>
                            <th style={{ padding: '0.5rem', color: 'var(--text-secondary)' }}>Chance (Para upar)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(level => (
                            <tr key={level} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                              <td style={{ padding: '0.5rem', fontWeight: 'bold', color: level === 9 ? 'var(--accent-red)' : 'white' }}>+{level}</td>
                              <td style={{ padding: '0.5rem' }}>
                                <input 
                                  type="number" 
                                  value={formData.forgeConfig?.statsPerLevel?.[level] || 0}
                                  onChange={e => {
                                    const cfg = {...(formData.forgeConfig || {})};
                                    cfg.statsPerLevel = [...(cfg.statsPerLevel || Array(10).fill(0))];
                                    cfg.statsPerLevel[level] = Number(e.target.value);
                                    setFormData({...formData, forgeConfig: cfg});
                                  }}
                                  style={{ width: '80px', padding: '0.4rem', borderRadius: '4px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'white' }}
                                />
                              </td>
                              <td style={{ padding: '0.5rem' }}>
                                {level > 0 ? (
                                  <input 
                                    type="number" 
                                    value={formData.forgeConfig?.coinsCostPerLevel?.[level] || 0}
                                    onChange={e => {
                                      const cfg = {...(formData.forgeConfig || {})};
                                      cfg.coinsCostPerLevel = [...(cfg.coinsCostPerLevel || Array(10).fill(0))];
                                      cfg.coinsCostPerLevel[level] = Number(e.target.value);
                                      setFormData({...formData, forgeConfig: cfg});
                                    }}
                                    style={{ width: '80px', padding: '0.4rem', borderRadius: '4px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'white' }}
                                  />
                                ) : <span style={{ color: '#666' }}>-</span>}
                              </td>
                              <td style={{ padding: '0.5rem' }}>
                                {level > 0 ? (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                                    <input 
                                      type="number" 
                                      min="1" max="100"
                                      value={formData.forgeConfig?.successChancePerLevel?.[level] || 0}
                                      onChange={e => {
                                        const cfg = {...(formData.forgeConfig || {})};
                                        cfg.successChancePerLevel = [...(cfg.successChancePerLevel || Array(10).fill(100))];
                                        cfg.successChancePerLevel[level] = Number(e.target.value);
                                        setFormData({...formData, forgeConfig: cfg});
                                      }}
                                      style={{ width: '60px', padding: '0.4rem', borderRadius: '4px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'white' }}
                                    /> %
                                  </div>
                                ) : <span style={{ color: '#666' }}>-</span>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', gap: '1rem', margin: '1.5rem 0 1rem 0' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'white', cursor: 'pointer' }}>
                    <input type="checkbox" checked={formData.isTransmutable || false} onChange={e => setFormData({...formData, isTransmutable: e.target.checked})} style={{ width: '20px', height: '20px' }} />
                    Item Transmutável (Requer que ele chegue ao +9)
                  </label>
                </div>

                {formData.isTransmutable && (
                  <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-glass)' }}>
                    <div className="responsive-grid">
                      <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Item Resultado (O que ele vira?)</label>
                        <select 
                          value={formData.transmuteConfig?.resultItemId || ''} 
                          onChange={e => setFormData({...formData, transmuteConfig: {...formData.transmuteConfig, resultItemId: e.target.value}})} 
                          style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)' }}
                        >
                          <option value="">Selecione um Item...</option>
                          {availableItems.map(i => <option key={i.id} value={i.id}>{i.title}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Chance de Sucesso (%)</label>
                        <input 
                          type="number" min="1" max="100"
                          value={formData.transmuteConfig?.successChance || 25} 
                          onChange={e => setFormData({...formData, transmuteConfig: {...formData.transmuteConfig, successChance: Number(e.target.value)}})} 
                          style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)' }}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
`;

content = content.replace(
  "            <div style={{ marginBottom: '1.5rem' }}>\n              <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Descrição (Lore do Item)</label>",
  injection + "\n            <div style={{ marginBottom: '1.5rem' }}>\n              <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Descrição (Lore do Item)</label>"
);

fs.writeFileSync('src/components/AdminStoreManager.tsx', content);
