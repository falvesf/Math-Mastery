import { useState, useEffect } from 'react';
import { X, Search, UploadCloud, Settings, Save, Archive, Trash2, Loader2, Grid } from 'lucide-react';
import { ref, uploadBytesResumable, getDownloadURL, listAll, deleteObject } from 'firebase/storage';
import { storage, db } from '../lib/firebase';
import { useDialog } from '../contexts/DialogContext';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import TilesetPicker from './TilesetPicker';

interface ImageGalleryModalProps {
  onSelectImage: (url: string) => void;
  onClose: () => void;
  apiKey?: string;
}

export default function ImageGalleryModal({ onSelectImage, onClose, apiKey }: ImageGalleryModalProps) {
  const { showAlert, showConfirm } = useDialog();
  const [customUrl, setCustomUrl] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Tabs
  const [activeTab, setActiveTab] = useState<'pixabay' | 'saved' | 'tilesets'>('pixabay');
  const [savedImages, setSavedImages] = useState<{ url: string; refPath: string; name: string }[]>([]);
  const [loadingSaved, setLoadingSaved] = useState(false);
  
  const [savedTilesets, setSavedTilesets] = useState<{ url: string; refPath: string; name: string }[]>([]);
  const [loadingTilesets, setLoadingTilesets] = useState(false);
  const [selectedTileset, setSelectedTileset] = useState<{url: string, refPath: string} | null>(null);

  // Estados de Upload
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const [localApiKey, setLocalApiKey] = useState(apiKey || '');
  const [showApiSettings, setShowApiSettings] = useState(false);

  useEffect(() => {
    if (!apiKey) {
      const fetchKey = async () => {
        const snap = await getDoc(doc(db, 'settings', 'api'));
        if (snap.exists()) setLocalApiKey(snap.data().pixabayKey || '');
      };
      fetchKey();
    }
  }, [apiKey]);

  const activeApiKey = apiKey || localApiKey;

  const handleSavePixabayKey = async () => {
    await setDoc(doc(db, 'settings', 'api'), { pixabayKey: localApiKey }, { merge: true });
    setShowApiSettings(false);
  };

  const openGoogleImages = (query: string) => {
    window.open(`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(query)}`, '_blank');
  };

  const fetchSavedImages = async () => {
    setLoadingSaved(true);
    try {
      const folderRef = ref(storage, 'quests/');
      const result = await listAll(folderRef);
      const images = (await Promise.all(
        result.items
          .filter(itemRef => !itemRef.name.startsWith('tileset_'))
          .map(async (itemRef) => {
            const url = await getDownloadURL(itemRef);
            return { url, refPath: itemRef.fullPath, name: itemRef.name };
          })
      ));
      // Sort by newest first (assuming names have timestamps)
      images.sort((a, b) => b.name.localeCompare(a.name));
      setSavedImages(images);
    } catch (err) {
      console.error("Erro ao carregar imagens salvas:", err);
      showAlert("Não foi possível carregar as imagens salvas.");
    } finally {
      setLoadingSaved(false);
    }
  };

  const fetchSavedTilesets = async () => {
    setLoadingTilesets(true);
    try {
      const folderRef = ref(storage, 'quests/');
      const result = await listAll(folderRef);
      const images = (await Promise.all(
        result.items
          .filter(itemRef => itemRef.name.startsWith('tileset_'))
          .map(async (itemRef) => {
            const url = await getDownloadURL(itemRef);
            return { url, refPath: itemRef.fullPath, name: itemRef.name.replace('tileset_', '') };
          })
      ));
      images.sort((a, b) => b.name.localeCompare(a.name));
      setSavedTilesets(images);
    } catch (err) {
      console.error("Erro ao carregar tilesets:", err);
    } finally {
      setLoadingTilesets(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'saved') {
      fetchSavedImages();
    } else if (activeTab === 'tilesets') {
      fetchSavedTilesets();
    }
  }, [activeTab]);

  const handleDeleteSavedImage = async (e: React.MouseEvent, refPath: string) => {
    e.stopPropagation(); // prevent selecting the image
    const confirm = await showConfirm("Tem certeza que deseja apagar esta imagem? Se ela estiver sendo usada no jogo, ela ficará quebrada.");
    if (!confirm) return;

    try {
      const imageRef = ref(storage, refPath);
      await deleteObject(imageRef);
      setSavedImages(prev => prev.filter(img => img.refPath !== refPath));
      setSavedTilesets(prev => prev.filter(img => img.refPath !== refPath));
    } catch (err: any) {
      console.error("Erro ao apagar imagem:", err);
      // Se a imagem já não existir (por causa de cache fantasma do listAll),
      // apenas remova da tela como se tivesse dado certo.
      if (err.code === 'storage/object-not-found') {
        setSavedImages(prev => prev.filter(img => img.refPath !== refPath));
        setSavedTilesets(prev => prev.filter(img => img.refPath !== refPath));
      } else {
        showAlert("Não foi possível apagar a imagem.");
      }
    }
  };

  const handleConfirmUrl = () => {
    if (customUrl.trim()) {
      onSelectImage(customUrl.trim());
      onClose();
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Verificar se é imagem
    if (!file.type.startsWith('image/')) {
      showAlert('Por favor, selecione apenas arquivos de imagem.');
      return;
    }

    setUploading(true);
    setProgress(0);

    const prefix = activeTab === 'tilesets' ? 'tileset_' : '';
    const fileRef = ref(storage, `quests/${prefix}${Date.now()}_${file.name}`);
    const uploadTask = uploadBytesResumable(fileRef, file, { contentType: file.type });

    uploadTask.on('state_changed', 
      (snapshot) => {
        const p = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        setProgress(p);
      },
      (err) => {
        console.error(err);
        showAlert('Erro ao fazer upload da imagem.');
        setUploading(false);
      },
      async () => {
        const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
        if (activeTab === 'tilesets') {
          // Adiciona o tileset diretamente no estado para driblar o cache do listAll do Firebase
          setSavedTilesets(prev => [
            { url: downloadUrl, refPath: uploadTask.snapshot.ref.fullPath, name: uploadTask.snapshot.ref.name },
            ...prev
          ]);
        } else {
          onSelectImage(downloadUrl);
          onClose();
        }
        setUploading(false);
      }
    );
  };



  const handleSelectPixabayImage = async (url: string) => {
    try {
      setUploading(true);
      setProgress(0);
      
      // Baixa a imagem diretamente (Pixabay suporta CORS nativamente)
      const response = await fetch(url);
      
      if (!response.ok) throw new Error('Erro ao baixar imagem do Pixabay');
      
      const blob = await response.blob();
      
      // Upload para o Firebase Storage
      const fileRef = ref(storage, `quests/pixabay_${Date.now()}.jpg`);
      
      // Usando uploadBytesResumable para manter a coerência de progresso
      const uploadTask = uploadBytesResumable(fileRef, blob, { contentType: 'image/jpeg' });

      // Trava de segurança: Timeout de 10 segundos para não congelar a tela
      const timeoutId = setTimeout(() => {
        uploadTask.cancel();
        console.error('Upload expirou por tempo (Timeout).');
        showAlert('O Firebase não respondeu a tempo (possível bloqueio CORS ou Storage desativado). Usando o link original.');
        onSelectImage(url);
        setUploading(false);
        onClose();
      }, 10000);

      uploadTask.on('state_changed', 
        (snapshot) => {
          const p = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          setProgress(p);
        },
        (err) => {
          clearTimeout(timeoutId);
          console.error('Upload falhou:', err);
          showAlert('Erro no Firebase (Bloqueio). Usando link original.');
          onSelectImage(url);
          setUploading(false);
          onClose();
        },
        async () => {
          clearTimeout(timeoutId);
          const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
          onSelectImage(downloadUrl);
          setUploading(false);
          onClose();
        }
      );
    } catch (err) {
      console.error('Download falhou:', err);
      showAlert('Erro ao processar imagem. Usando link temporário.');
      onSelectImage(url);
      setUploading(false);
      onClose();
    }
  };

  const handlePixabaySearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeApiKey || !searchQuery.trim()) return;

    setLoading(true);
    setError('');
    
    try {
      // Adicionado lang=pt para buscar corretamente em português
      const response = await fetch(`https://pixabay.com/api/?key=${activeApiKey}&q=${encodeURIComponent(searchQuery)}&lang=pt&per_page=100&safesearch=true`);
      const data = await response.json();
      
      if (data.hits && data.hits.length > 0) {
        setSearchResults(data.hits);
      } else {
        setSearchResults([]);
        setError('Nenhuma imagem encontrada.');
      }
    } catch (err) {
      setError('Erro ao buscar imagens. Verifique sua chave API.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }}>
      <div className="glass-panel" style={{ width: '900px', maxWidth: '95vw', maxHeight: '90vh', padding: '2rem', display: 'flex', flexDirection: 'column', animation: 'slideUp 0.3s ease-out', background: 'var(--bg-dark)' }}>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--gold-primary)' }}>
            <Search color="var(--gold-primary)" /> Banco de Imagens do Jogo
          </h2>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer' }}>
            <X size={24} />
          </button>
        </div>

        <div style={{ display: 'flex', gap: '2rem', flex: 1, overflow: 'hidden' }}>
          
          {/* Lado Esquerdo: Pixabay Search e Imagens Salvas */}
          <div style={{ flex: 2, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border-glass)', marginBottom: '1rem' }}>
              <button
                onClick={() => setActiveTab('pixabay')}
                style={{ flex: 1, padding: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', background: 'transparent', border: 'none', borderBottom: activeTab === 'pixabay' ? '2px solid var(--gold-primary)' : '2px solid transparent', color: activeTab === 'pixabay' ? 'var(--gold-primary)' : 'var(--text-secondary)', cursor: 'pointer', fontWeight: 'bold', transition: 'all 0.2s' }}
              >
                <Search size={18} /> Busca (Pixabay)
              </button>
              <button
                onClick={() => setActiveTab('saved')}
                style={{ flex: 1, padding: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', background: 'transparent', border: 'none', borderBottom: activeTab === 'saved' ? '2px solid var(--gold-primary)' : '2px solid transparent', color: activeTab === 'saved' ? 'var(--gold-primary)' : 'var(--text-secondary)', cursor: 'pointer', fontWeight: 'bold', transition: 'all 0.2s' }}
              >
                <Archive size={18} /> Já Baixados
              </button>
              <button
                onClick={() => setActiveTab('tilesets')}
                style={{ flex: 1, padding: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', background: 'transparent', border: 'none', borderBottom: activeTab === 'tilesets' ? '2px solid var(--gold-primary)' : '2px solid transparent', color: activeTab === 'tilesets' ? 'var(--gold-primary)' : 'var(--text-secondary)', cursor: 'pointer', fontWeight: 'bold', transition: 'all 0.2s' }}
              >
                <Grid size={18} /> Tilesets
              </button>
            </div>

            {activeTab === 'pixabay' && (
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
                  <button 
                    onClick={() => setShowApiSettings(!showApiSettings)} 
                    style={{ background: showApiSettings ? 'rgba(59, 130, 246, 0.2)' : 'transparent', border: '1px solid var(--border-glass)', borderRadius: '6px', color: showApiSettings ? 'var(--accent-blue)' : 'var(--text-secondary)', cursor: 'pointer', padding: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                    title="Configurar Integração"
                  >
                    <Settings size={18} /> {showApiSettings ? 'Fechar' : 'Configurar API'}
                  </button>
                </div>

                {showApiSettings && (
                  <div style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', borderRadius: '8px', padding: '1rem', marginBottom: '1rem', animation: 'fadeIn 0.2s' }}>
                    <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Cole aqui sua API Key gratuita do Pixabay.com</p>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <input 
                        type="text" 
                        value={localApiKey}
                        onChange={e => setLocalApiKey(e.target.value)}
                        placeholder="Sua API Key..."
                        style={{ flex: 1, padding: '0.5rem', borderRadius: '6px', background: 'rgba(0,0,0,0.5)', border: '1px solid var(--border-glass)', color: 'white' }}
                      />
                      <button onClick={handleSavePixabayKey} style={{ background: 'var(--gold-primary)', color: 'var(--text-on-gold, #000000)', border: 'none', borderRadius: '6px', padding: '0 1rem', display: 'flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer' }}>
                        <Save size={16} /> Salvar
                      </button>
                    </div>
                  </div>
                )}
                
                {!activeApiKey && !showApiSettings ? (
                  <div style={{ background: 'rgba(59, 130, 246, 0.1)', padding: '1.5rem', borderRadius: '8px', border: '1px solid var(--accent-blue)' }}>
                    <p style={{ margin: '0 0 1rem 0', color: 'white' }}>
                      A busca direta de imagens gratuitas está desativada.
                    </p>
                    <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                      Para buscar imagens sem sair do sistema, clique na engrenagem acima e adicione a sua Chave de API gratuita do <strong>Pixabay</strong>.
                    </p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                    <form onSubmit={handlePixabaySearch} style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                      <input 
                        type="text" 
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        placeholder="Ex: rpg monster, wizard, math..."
                        style={{ flex: 1, padding: '0.75rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontFamily: 'inherit' }}
                      />
                      <button type="submit" className="login-btn" disabled={loading} style={{ background: 'var(--gold-primary)', color: 'var(--text-on-gold, #000000)', border: 'none' }}>
                        {loading ? 'Buscando...' : 'Pesquisar'}
                      </button>
                    </form>

                    {error && <p style={{ color: 'var(--accent-red)', margin: '0 0 1rem 0' }}>{error}</p>}

                    <div style={{ flex: 1, overflowY: 'auto', paddingRight: '0.5rem' }}>
                      {searchResults.length > 0 && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '1rem' }}>
                          {searchResults.map((img) => (
                            <div 
                              key={img.id}
                              onClick={() => handleSelectPixabayImage(img.largeImageURL || img.webformatURL)}
                              style={{ 
                                aspectRatio: '1', borderRadius: '8px', overflow: 'hidden', cursor: 'pointer', border: '2px solid transparent',
                                background: 'rgba(0,0,0,0.5)', transition: 'all 0.2s'
                              }}
                              onMouseEnter={(e) => e.currentTarget.style.border = '2px solid var(--gold-primary)'}
                              onMouseLeave={(e) => e.currentTarget.style.border = '2px solid transparent'}
                              title="Clique para usar esta imagem"
                            >
                              <img src={img.webformatURL} alt={img.tags} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            </div>
                          ))}
                        </div>
                      )}
                      {searchResults.length === 0 && !loading && !error && (
                        <p style={{ color: 'var(--text-secondary)', textAlign: 'center', marginTop: '2rem' }}>
                          Digite algo e pesquise para ver as imagens aqui.
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'saved' && (
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                {loadingSaved ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: 'var(--gold-primary)', gap: '0.5rem' }}>
                    <Loader2 className="spin" size={24} /> Carregando imagens...
                  </div>
                ) : savedImages.length === 0 ? (
                  <p style={{ color: 'var(--text-secondary)', textAlign: 'center', marginTop: '2rem' }}>
                    Nenhuma imagem baixada ou enviada ainda.
                  </p>
                ) : (
                  <div style={{ flex: 1, overflowY: 'auto', paddingRight: '0.5rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '1rem' }}>
                      {savedImages.map((img) => (
                        <div 
                          key={img.refPath}
                          style={{ 
                            position: 'relative', aspectRatio: '1', borderRadius: '8px', overflow: 'hidden', cursor: 'pointer', border: '2px solid transparent',
                            background: 'rgba(0,0,0,0.5)', transition: 'all 0.2s'
                          }}
                          className="saved-img-card"
                          onMouseEnter={(e) => e.currentTarget.style.border = '2px solid var(--gold-primary)'}
                          onMouseLeave={(e) => e.currentTarget.style.border = '2px solid transparent'}
                          onClick={() => {
                            onSelectImage(img.url);
                            onClose();
                          }}
                          title="Clique para usar esta imagem"
                        >
                          <img src={img.url} alt={img.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          <button
                            onClick={(e) => handleDeleteSavedImage(e, img.refPath)}
                            style={{
                              position: 'absolute', top: '5px', right: '5px', background: 'rgba(220, 38, 38, 0.9)', color: 'white', border: 'none', borderRadius: '50%', padding: '0.4rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
                            }}
                            title="Apagar imagem do banco de dados"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'tilesets' && (
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                <h3 style={{ margin: '0 0 1rem 0', color: 'white' }}>Seus Tilesets (Folhas de Sprites)</h3>
                <p style={{ margin: '0 0 1rem 0', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                  Faça upload de uma folha com vários ícones e selecione um quadradinho dela para usar.
                </p>
                {loadingTilesets ? (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
                    <Loader2 className="spin" size={32} color="var(--gold-primary)" />
                  </div>
                ) : (
                  <div style={{ flex: 1, overflowY: 'auto', paddingRight: '1rem' }}>
                    {savedTilesets.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '2rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
                        <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>Você ainda não enviou nenhum tileset.</p>
                      </div>
                    ) : (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '1rem' }}>
                        {savedTilesets.map((img) => (
                          <div 
                            key={img.refPath} 
                            style={{ 
                              position: 'relative', 
                              aspectRatio: '1', 
                              borderRadius: '8px', 
                              overflow: 'hidden', 
                              cursor: 'pointer',
                              border: '2px solid transparent',
                              transition: 'border 0.2s'
                            }}
                            onClick={() => setSelectedTileset({ url: img.url, refPath: img.refPath })}
                            onMouseOver={(e) => e.currentTarget.style.border = '2px solid var(--gold-primary)'}
                            onMouseOut={(e) => e.currentTarget.style.border = '2px solid transparent'}
                          >
                            <img src={img.url} alt={img.name} style={{ width: '100%', height: '100%', objectFit: 'contain', background: 'repeating-conic-gradient(#333 0% 25%, #222 0% 50%) 50% / 10px 10px', imageRendering: 'pixelated' }} />
                            <button
                              onClick={(e) => handleDeleteSavedImage(e, img.refPath)}
                              style={{
                                position: 'absolute', top: '5px', right: '5px', background: 'rgba(220, 38, 38, 0.9)', color: 'white', border: 'none', borderRadius: '50%', padding: '0.4rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
                              }}
                              title="Apagar tileset do banco de dados"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Lado Direito: Opções Alternativas (Upload, Google e URL) */}
          <div style={{ flex: 1, borderLeft: '1px solid var(--border-glass)', paddingLeft: '2rem', display: 'flex', flexDirection: 'column' }}>
            
            <div style={{ marginBottom: '2rem' }}>
              <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem' }}>Upload do Seu Computador</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1rem' }}>
                Tem a imagem salva aí? Faça o upload diretamente para o banco do jogo!
              </p>
              
              <div style={{ position: 'relative', overflow: 'hidden' }}>
                <input 
                  type="file" 
                  accept="image/*"
                  onChange={handleFileUpload}
                  disabled={uploading}
                  style={{ position: 'absolute', inset: 0, opacity: 0, cursor: uploading ? 'not-allowed' : 'pointer' }}
                />
                <div style={{ 
                  background: uploading ? 'rgba(0,0,0,0.5)' : 'rgba(59, 130, 246, 0.1)', 
                  border: `2px dashed ${uploading ? 'var(--text-secondary)' : 'var(--accent-blue)'}`, 
                  color: uploading ? 'var(--text-secondary)' : 'var(--accent-blue)', 
                  padding: '1.5rem', 
                  borderRadius: '8px', 
                  display: 'flex', 
                  flexDirection: 'column', 
                  alignItems: 'center', 
                  gap: '0.5rem',
                  transition: 'all 0.2s'
                }}>
                  <UploadCloud size={32} />
                  <span style={{ fontWeight: 'bold' }}>
                    {uploading ? `Enviando... ${Math.round(progress)}%` : 'Clique ou arraste a imagem aqui'}
                  </span>
                </div>
              </div>
            </div>

            <div style={{ marginBottom: '2rem' }}>
              <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem' }}>Colar Link Direto</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <input 
                  type="text" 
                  value={customUrl} 
                  onChange={e => setCustomUrl(e.target.value)} 
                  placeholder="https://..." 
                  style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-glass)', color: 'white', fontFamily: 'inherit' }} 
                />
                <button onClick={handleConfirmUrl} disabled={!customUrl.trim()} style={{ background: customUrl.trim() ? 'var(--gold-primary)' : 'rgba(255,255,255,0.1)', color: customUrl.trim() ? 'black' : 'var(--text-secondary)', border: 'none', padding: '0.75rem', borderRadius: '8px', cursor: customUrl.trim() ? 'pointer' : 'not-allowed', fontWeight: 'bold' }}>
                  Aplicar Link
                </button>
              </div>
            </div>

            <div>
              <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem' }}>Buscar no Google</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <button className="login-btn" onClick={() => openGoogleImages('rpg game monster 2d art safe for kids')} style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--accent-red)', border: '1px solid var(--accent-red)', justifyContent: 'center' }}>
                  Monstros
                </button>
                <button className="login-btn" onClick={() => openGoogleImages('rpg game dungeon background 2d art')} style={{ background: 'rgba(16, 185, 129, 0.1)', color: 'var(--accent-green)', border: '1px solid var(--accent-green)', justifyContent: 'center' }}>
                  Cenários
                </button>
              </div>
            </div>

          </div>
        </div>

      </div>

      {selectedTileset && (
        <TilesetPicker 
          tilesetUrl={selectedTileset.url} 
          tilesetRefPath={selectedTileset.refPath}
          onClose={() => setSelectedTileset(null)} 
          onTileSelected={(url) => {
            onSelectImage(url);
            setSelectedTileset(null);
            onClose();
          }} 
        />
      )}
    </div>
  );
}
