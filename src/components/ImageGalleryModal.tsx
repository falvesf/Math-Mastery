import { useState, useEffect, useCallback } from 'react';
import { X, Search, UploadCloud, Settings, Save, Archive, Trash2, Loader2, Grid, Star, Image as ImageIcon, Palette } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { sanitizeFileName } from '../lib/utils';
import { useDialog } from '../contexts/DialogContext';
import TilesetPicker from './TilesetPicker';

type TabType = 'pixabay' | 'saved' | 'tilesets' | 'arenas' | 'icons' | 'favorites';

interface ImageGalleryModalProps {
  onSelectImage: (url: string) => void;
  onClose: () => void;
  apiKey?: string;
}

interface GalleryImage {
  url: string;
  refPath: string;
  name: string;
}

export default function ImageGalleryModal({ onSelectImage, onClose, apiKey }: ImageGalleryModalProps) {
  const { showAlert, showConfirm, showToast } = useDialog();
  const [customUrl, setCustomUrl] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Tabs
  const [activeTab, setActiveTab] = useState<TabType>('pixabay');
  const [savedImages, setSavedImages] = useState<GalleryImage[]>([]);
  const [loadingSaved, setLoadingSaved] = useState(false);
  
  const [savedTilesets, setSavedTilesets] = useState<GalleryImage[]>([]);
  const [loadingTilesets, setLoadingTilesets] = useState(false);
  const [selectedTileset, setSelectedTileset] = useState<{url: string, refPath: string} | null>(null);

  // Arenas
  const [savedArenas, setSavedArenas] = useState<GalleryImage[]>([]);
  const [loadingArenas, setLoadingArenas] = useState(false);

  // Icons
  const [savedIcons, setSavedIcons] = useState<GalleryImage[]>([]);
  const [loadingIcons, setLoadingIcons] = useState(false);

  // Favorites
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

  // Estados de Upload
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const [localApiKey, setLocalApiKey] = useState(apiKey || '');
  const [showApiSettings, setShowApiSettings] = useState(false);

  useEffect(() => {
    if (!apiKey) {
      const fetchKey = async () => {
        const { data: snap } = await supabase.from('system_collections').select('data').eq('collection_name', 'settings').eq('doc_id', 'api').single();
        if (snap && snap.data) setLocalApiKey((snap.data as any).pixabayKey || '');
      };
      fetchKey();
    }
    // Load favorites from localStorage
    const savedFavs = localStorage.getItem('gallery_favorites');
    if (savedFavs) {
      try {
        setFavorites(new Set(JSON.parse(savedFavs)));
      } catch {}
    }
  }, [apiKey]);

  const activeApiKey = apiKey || localApiKey;

  const saveFavorites = (favs: Set<string>) => {
    localStorage.setItem('gallery_favorites', JSON.stringify([...favs]));
  };

  const toggleFavorite = (e: React.MouseEvent, url: string) => {
    e.stopPropagation();
    setFavorites(prev => {
      const next = new Set(prev);
      if (next.has(url)) {
        next.delete(url);
      } else {
        next.add(url);
      }
      saveFavorites(next);
      return next;
    });
  };

  const isFavorite = (url: string) => favorites.has(url);

  const handleSavePixabayKey = async () => {
    await supabase.from('system_collections').update({ data: { pixabayKey: localApiKey } }).eq('collection_name', 'settings').eq('doc_id', 'api');
    setShowApiSettings(false);
  };

  const fetchSavedImages = async () => {
    setLoadingSaved(true);
    try {
      const { data, error } = await supabase.storage.from('uploads').list('quests/', {
        limit: 100,
        offset: 0,
        sortBy: { column: 'name', order: 'desc' },
      });
      if (error) throw error;
      if (data) {
        const images = data
          .filter(item => !item.name.startsWith('tileset_') && !item.name.startsWith('arena_') && !item.name.startsWith('icon_'))
          .map(item => {
            const { data: urlData } = supabase.storage.from('uploads').getPublicUrl(`quests/${item.name}`);
            return { url: urlData.publicUrl, refPath: `quests/${item.name}`, name: item.name };
          });
        setSavedImages(images);
      }
    } catch (err) {
      console.error("Erro ao carregar imagens salvas:", err);
    } finally {
      setLoadingSaved(false);
    }
  };

  const fetchSavedTilesets = async () => {
    setLoadingTilesets(true);
    try {
      const { data, error } = await supabase.storage.from('uploads').list('quests/', {
        limit: 100,
        offset: 0,
        sortBy: { column: 'name', order: 'desc' },
      });
      if (error) throw error;
      if (data) {
        const images = data
          .filter(item => item.name.startsWith('tileset_'))
          .map(item => {
            const { data: urlData } = supabase.storage.from('uploads').getPublicUrl(`quests/${item.name}`);
            return { url: urlData.publicUrl, refPath: `quests/${item.name}`, name: item.name.replace('tileset_', '') };
          });
        setSavedTilesets(images);
      }
    } catch (err) {
      console.error("Erro ao carregar tilesets:", err);
    } finally {
      setLoadingTilesets(false);
    }
  };

  const fetchSavedArenas = async () => {
    setLoadingArenas(true);
    try {
      const { data, error } = await supabase.storage.from('uploads').list('arena-backgrounds/', {
        limit: 100,
        offset: 0,
        sortBy: { column: 'name', order: 'desc' },
      });
      if (error) throw error;
      if (data) {
        const images = data.map(item => {
          const { data: urlData } = supabase.storage.from('uploads').getPublicUrl(`arena-backgrounds/${item.name}`);
          return { url: urlData.publicUrl, refPath: `arena-backgrounds/${item.name}`, name: item.name };
        });
        setSavedArenas(images);
      }
    } catch (err) {
      console.error("Erro ao carregar arenas:", err);
    } finally {
      setLoadingArenas(false);
    }
  };

  const fetchSavedIcons = async () => {
    setLoadingIcons(true);
    try {
      // Fetch from store_items to get item icons
      const { data: storeSnap, error } = await supabase.from('store_items').select('data').eq('active', true);
      if (error) throw error;
      if (storeSnap) {
        const icons: GalleryImage[] = [];
        storeSnap.forEach((item: any) => {
          const d = item.data;
          if (d?.itemImageUrl) {
            icons.push({
              url: d.itemImageUrl,
              refPath: `store-icon-${item.id}`,
              name: d.title || 'Item sem nome'
            });
          }
        });
        setSavedIcons(icons);
      }
    } catch (err) {
      console.error("Erro ao carregar ícones:", err);
    } finally {
      setLoadingIcons(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'saved') fetchSavedImages();
    else if (activeTab === 'tilesets') fetchSavedTilesets();
    else if (activeTab === 'arenas') fetchSavedArenas();
    else if (activeTab === 'icons') fetchSavedIcons();
  }, [activeTab]);

  const handleDeleteSavedImage = async (e: React.MouseEvent, refPath: string) => {
    e.stopPropagation();
    const confirm = await showConfirm("Tem certeza que deseja apagar esta imagem?");
    if (!confirm) return;

    try {
      const { error } = await supabase.storage.from('uploads').remove([refPath]);
      if (error) throw error;
      setSavedImages(prev => prev.filter(img => img.refPath !== refPath));
      setSavedTilesets(prev => prev.filter(img => img.refPath !== refPath));
      setSavedArenas(prev => prev.filter(img => img.refPath !== refPath));
    } catch (err: any) {
      console.error("Erro ao apagar imagem:", err);
      showAlert("Não foi possível apagar a imagem.");
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showAlert('Por favor, selecione apenas arquivos de imagem.');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      showAlert(`Não é possível subir arquivos maiores que 2 MB. Este arquivo tem ${(file.size / (1024 * 1024)).toFixed(1)} MB.`);
      return;
    }

    setUploading(true);
    setProgress(50);

    try {
      let prefix = '';
      let folder = 'quests';
      
      if (activeTab === 'tilesets') {
        prefix = 'tileset_';
      } else if (activeTab === 'arenas') {
        prefix = 'arena_';
        folder = 'arena-backgrounds';
      }

      const fileName = `${prefix}${Date.now()}_${sanitizeFileName(file.name)}`;
      const filePath = `${folder}/${fileName}`;
      
      const { error } = await supabase.storage.from('uploads').upload(filePath, file, { contentType: file.type });
      
      if (error) throw error;
      setProgress(100);

      const { data: urlData } = supabase.storage.from('uploads').getPublicUrl(filePath);
      const downloadUrl = urlData.publicUrl;

      if (activeTab === 'tilesets') {
        setSavedTilesets(prev => [{ url: downloadUrl, refPath: filePath, name: fileName }, ...prev]);
      } else if (activeTab === 'arenas') {
        setSavedArenas(prev => [{ url: downloadUrl, refPath: filePath, name: fileName }, ...prev]);
      } else {
        onSelectImage(downloadUrl);
        onClose();
      }
    } catch (err) {
      console.error(err);
      showAlert('Erro ao fazer upload da imagem.');
    } finally {
      setUploading(false);
    }
  };

  const handleSelectPixabayImage = async (url: string) => {
    try {
      setUploading(true);
      setProgress(0);
      
      const response = await fetch(url);
      if (!response.ok) throw new Error('Erro ao baixar imagem do Pixabay');
      
      const blob = await response.blob();

      if (blob.size > 2 * 1024 * 1024) {
        showToast('O arquivo não pode exceder 2 MB. Usando o link original.', 'error');
        onSelectImage(url);
        setUploading(false);
        onClose();
        return;
      }

      const filePath = `quests/pixabay_${Date.now()}.jpg`;
      const progressInterval = setInterval(() => setProgress(p => Math.min(p + 10, 90)), 200);

      supabase.storage.from('uploads').upload(filePath, blob, { contentType: 'image/jpeg', cacheControl: '3600', upsert: false })
        .then(({ data, error }) => {
          clearInterval(progressInterval);
          setProgress(100);
          if (error) {
            console.error('Upload falhou:', error);
            showAlert('Erro no Storage. Usando link original.');
            onSelectImage(url);
          } else if (data) {
            const { data: publicData } = supabase.storage.from('uploads').getPublicUrl(filePath);
            onSelectImage(publicData.publicUrl);
          }
        })
        .catch(err => {
          clearInterval(progressInterval);
          console.error('Download falhou:', err);
          showAlert('Erro ao processar imagem. Usando link temporário.');
          onSelectImage(url);
        })
        .finally(() => {
          setUploading(false);
          onClose();
        });
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

  const renderImageGrid = (images: GalleryImage[], showDelete: boolean = true, deletePath?: string, openTilesetPicker: boolean = false) => {
    if (images.length === 0) {
      return (
        <p style={{ color: 'var(--text-secondary)', textAlign: 'center', marginTop: '2rem' }}>
          Nenhuma imagem encontrada.
        </p>
      );
    }

    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '1rem' }}>
        {images.map((img) => (
          <div 
            key={img.refPath}
            style={{ 
              position: 'relative', aspectRatio: '1', borderRadius: '8px', overflow: 'hidden', cursor: 'pointer', border: '2px solid transparent',
              background: 'rgba(0,0,0,0.5)', transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.border = '2px solid var(--gold-primary)'}
            onMouseLeave={(e) => e.currentTarget.style.border = '2px solid transparent'}
            onClick={() => {
              if (openTilesetPicker) {
                setSelectedTileset({ url: img.url, refPath: img.refPath });
              } else {
                onSelectImage(img.url);
                onClose();
              }
            }}
            title={img.name}
          >
            <img src={img.url} alt={img.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            
            {/* Favorite star */}
            <button
              onClick={(e) => toggleFavorite(e, img.url)}
              style={{
                position: 'absolute', top: '5px', left: '5px',
                background: 'rgba(0,0,0,0.6)', border: 'none', borderRadius: '50%',
                padding: '0.3rem', cursor: 'pointer', display: 'flex',
                transition: 'transform 0.2s'
              }}
              title={isFavorite(img.url) ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
            >
              <Star 
                size={16} 
                fill={isFavorite(img.url) ? '#f59e0b' : 'transparent'} 
                color={isFavorite(img.url) ? '#f59e0b' : 'rgba(255,255,255,0.5)'} 
              />
            </button>

            {/* Delete button */}
            {showDelete && img.refPath.startsWith('quests/') || img.refPath.startsWith('arena-backgrounds/') ? (
              <button
                onClick={(e) => handleDeleteSavedImage(e, img.refPath)}
                style={{
                  position: 'absolute', top: '5px', right: '5px', background: 'rgba(220, 38, 38, 0.9)', color: 'white', border: 'none', borderRadius: '50%', padding: '0.4rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}
                title="Apagar imagem"
              >
                <Trash2 size={14} />
              </button>
            ) : null}
          </div>
        ))}
      </div>
    );
  };

  const getTabLabel = (tab: TabType): string => {
    switch(tab) {
      case 'pixabay': return 'Busca (Pixabay)';
      case 'saved': return 'Já Baixados';
      case 'tilesets': return 'Tilesets';
      case 'arenas': return 'Arenas';
      case 'icons': return 'Ícones';
      case 'favorites': return 'Favoritos';
    }
  };

  const getTabIcon = (tab: TabType) => {
    switch(tab) {
      case 'pixabay': return <Search size={16} />;
      case 'saved': return <Archive size={16} />;
      case 'tilesets': return <Grid size={16} />;
      case 'arenas': return <ImageIcon size={16} />;
      case 'icons': return <Palette size={16} />;
      case 'favorites': return <Star size={16} fill={activeTab === 'favorites' ? '#f59e0b' : 'none'} />;
    }
  };

  const allTabs: TabType[] = ['pixabay', 'saved', 'tilesets', 'arenas', 'icons', 'favorites'];

  // Collect all images for favorites
  const allImages = [
    ...savedImages,
    ...savedTilesets,
    ...savedArenas,
    ...savedIcons,
    ...searchResults.map((img: any) => ({ url: img.webformatURL, refPath: `pixabay-${img.id}`, name: img.tags || 'Pixabay' }))
  ];
  const favoriteImages = allImages.filter(img => isFavorite(img.url));

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200000 }}>
      <div className="glass-panel" style={{ width: '1000px', maxWidth: '95vw', maxHeight: '90vh', padding: '2rem', display: 'flex', flexDirection: 'column', animation: 'slideUp 0.3s ease-out', background: 'var(--bg-dark)' }}>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--gold-primary)' }}>
            <Search color="var(--gold-primary)" /> Banco de Imagens do Jogo
          </h2>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer' }}>
            <X size={24} />
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border-glass)', marginBottom: '1rem', overflowX: 'auto', gap: '0.25rem' }}>
          {allTabs.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{ 
                padding: '0.6rem 1rem', 
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', 
                background: activeTab === tab ? 'rgba(245, 158, 11, 0.1)' : 'transparent', 
                border: 'none', 
                borderBottom: activeTab === tab ? '2px solid var(--gold-primary)' : '2px solid transparent', 
                color: activeTab === tab ? 'var(--gold-primary)' : 'var(--text-secondary)', 
                cursor: 'pointer', 
                fontWeight: activeTab === tab ? 'bold' : 'normal',
                fontSize: '0.85rem',
                transition: 'all 0.2s',
                whiteSpace: 'nowrap',
                borderRadius: '6px 6px 0 0'
              }}
            >
              {getTabIcon(tab)} {getTabLabel(tab)}
              {tab === 'favorites' && favoriteImages.length > 0 && (
                <span style={{ 
                  background: 'var(--gold-primary)', color: '#000', 
                  borderRadius: '10px', padding: '0.1rem 0.4rem', 
                  fontSize: '0.7rem', fontWeight: 'bold', marginLeft: '0.25rem' 
                }}>
                  {favoriteImages.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          
          {/* Pixabay Tab */}
          {activeTab === 'pixabay' && (
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.75rem' }}>
                <button 
                  onClick={() => setShowApiSettings(!showApiSettings)} 
                  style={{ background: showApiSettings ? 'rgba(59, 130, 246, 0.2)' : 'transparent', border: '1px solid var(--border-glass)', borderRadius: '6px', color: showApiSettings ? 'var(--accent-blue)' : 'var(--text-secondary)', cursor: 'pointer', padding: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem' }}
                  title="Configurar Integração"
                >
                  <Settings size={16} /> {showApiSettings ? 'Fechar' : 'Configurar API'}
                </button>
              </div>

              {showApiSettings && (
                <div style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border-glass)', borderRadius: '8px', padding: '1rem', marginBottom: '1rem', animation: 'fadeIn 0.2s' }}>
                  <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Cole aqui sua API Key gratuita do Pixabay.com</p>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <input 
                      type="text" 
                      value={localApiKey}
                      onChange={e => setLocalApiKey(e.target.value)}
                      placeholder="Sua API Key..."
                      style={{ flex: 1, padding: '0.5rem', borderRadius: '6px', background: 'rgba(0,0,0,0.5)', border: '1px solid var(--border-glass)', color: 'white', fontSize: '0.85rem' }}
                    />
                    <button onClick={handleSavePixabayKey} style={{ background: 'var(--gold-primary)', color: 'var(--text-on-gold, #000000)', border: 'none', borderRadius: '6px', padding: '0 1rem', display: 'flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer', fontSize: '0.85rem' }}>
                      <Save size={14} /> Salvar
                    </button>
                  </div>
                </div>
              )}
              
              {!activeApiKey && !showApiSettings ? (
                <div style={{ background: 'rgba(59, 130, 246, 0.1)', padding: '1.5rem', borderRadius: '8px', border: '1px solid var(--accent-blue)' }}>
                  <p style={{ margin: '0 0 0.5rem 0', color: 'white', fontSize: '0.9rem' }}>A busca direta de imagens gratuitas está desativada.</p>
                  <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                    Para buscar imagens sem sair do sistema, clique na engrenagem acima e adicione a sua Chave de API gratuita do <strong>Pixabay</strong>.
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                  <form onSubmit={handlePixabaySearch} style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
                    <input 
                      type="text" 
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      placeholder="Ex: rpg monster, wizard, math..."
                      style={{ flex: 1, padding: '0.75rem', borderRadius: '8px', background: 'var(--bg-dark)', border: '1px solid var(--border-glass)', color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: '0.9rem' }}
                    />
                    <button type="submit" disabled={loading} style={{ background: 'var(--gold-primary)', color: 'var(--text-on-gold, #000000)', border: 'none', padding: '0.75rem 1.5rem', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.9rem' }}>
                      {loading ? 'Buscando...' : 'Pesquisar'}
                    </button>
                  </form>

                  {error && <p style={{ color: 'var(--accent-red)', margin: '0 0 1rem 0', fontSize: '0.85rem' }}>{error}</p>}

                  <div style={{ flex: 1, overflowY: 'auto', paddingRight: '0.5rem' }}>
                    {searchResults.length > 0 && renderImageGrid(
                      searchResults.map((img: any) => ({ url: img.webformatURL, refPath: `pixabay-${img.id}`, name: img.tags || 'Pixabay' })),
                      false
                    )}
                    {searchResults.length === 0 && !loading && !error && (
                      <p style={{ color: 'var(--text-secondary)', textAlign: 'center', marginTop: '2rem', fontSize: '0.9rem' }}>
                        Digite algo e pesquise para ver as imagens aqui.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Saved Tab */}
          {activeTab === 'saved' && (
            <div style={{ flex: 1, overflowY: 'auto', paddingRight: '0.5rem' }}>
              {loadingSaved ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3rem', color: 'var(--gold-primary)', gap: '0.5rem' }}>
                  <Loader2 className="spin" size={24} /> Carregando imagens...
                </div>
              ) : (
                renderImageGrid(savedImages)
              )}
            </div>
          )}

          {/* Tilesets Tab */}
          {activeTab === 'tilesets' && (
            <div style={{ flex: 1, overflowY: 'auto', paddingRight: '0.5rem' }}>
              <p style={{ margin: '0 0 1rem 0', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                Faça upload de uma folha com vários ícones e selecione um quadradinho dela para usar.
              </p>
              {loadingTilesets ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
                  <Loader2 className="spin" size={32} color="var(--gold-primary)" />
                </div>
              ) : (
                renderImageGrid(savedTilesets, true, undefined, true)
              )}
            </div>
          )}

          {/* Arenas Tab */}
          {activeTab === 'arenas' && (
            <div style={{ flex: 1, overflowY: 'auto', paddingRight: '0.5rem' }}>
              <p style={{ margin: '0 0 1rem 0', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                Imagens de fundo para a arena de batalha. Faça upload de novas imagens aqui.
              </p>
              {loadingArenas ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3rem', color: 'var(--gold-primary)', gap: '0.5rem' }}>
                  <Loader2 className="spin" size={24} /> Carregando arenas...
                </div>
              ) : (
                renderImageGrid(savedArenas)
              )}
            </div>
          )}

          {/* Icons Tab */}
          {activeTab === 'icons' && (
            <div style={{ flex: 1, overflowY: 'auto', paddingRight: '0.5rem' }}>
              <p style={{ margin: '0 0 1rem 0', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                Ícones dos itens da loja. Selecione para usar em outras finalidades.
              </p>
              {loadingIcons ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3rem', color: 'var(--gold-primary)', gap: '0.5rem' }}>
                  <Loader2 className="spin" size={24} /> Carregando ícones...
                </div>
              ) : (
                renderImageGrid(savedIcons, false)
              )}
            </div>
          )}

          {/* Favorites Tab */}
          {activeTab === 'favorites' && (
            <div style={{ flex: 1, overflowY: 'auto', paddingRight: '0.5rem' }}>
              {favoriteImages.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem' }}>
                  <Star size={48} color="var(--text-secondary)" style={{ opacity: 0.3, marginBottom: '1rem' }} />
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                    Nenhuma imagem favoritada ainda.
                  </p>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', opacity: 0.7 }}>
                    Clique na estrela em qualquer imagem para adicioná-la aos favoritos.
                  </p>
                </div>
              ) : (
                renderImageGrid(favoriteImages, false)
              )}
            </div>
          )}
        </div>

        {/* Upload Area - Always visible at bottom */}
        <div style={{ marginTop: '1rem', borderTop: '1px solid var(--border-glass)', paddingTop: '1rem' }}>
          <div style={{ position: 'relative', overflow: 'hidden' }}>
            <input 
              type="file" 
              accept="image/*"
              onChange={handleFileUpload}
              disabled={uploading}
              style={{ position: 'absolute', inset: 0, opacity: 0, cursor: uploading ? 'not-allowed' : 'pointer', zIndex: 2 }}
            />
            <div style={{ 
              background: uploading ? 'rgba(0,0,0,0.5)' : 'rgba(59, 130, 246, 0.1)', 
              border: `2px dashed ${uploading ? 'var(--text-secondary)' : 'var(--accent-blue)'}`, 
              color: uploading ? 'var(--text-secondary)' : 'var(--accent-blue)', 
              padding: '1rem', 
              borderRadius: '8px', 
              display: 'flex', 
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.75rem',
              transition: 'all 0.2s'
            }}>
              <UploadCloud size={24} />
              <span style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>
                {uploading ? `Enviando... ${Math.round(progress)}%` : 'Clique ou arraste uma imagem para fazer upload'}
              </span>
              {activeTab === 'arenas' && (
                <span style={{ fontSize: '0.75rem', opacity: 0.7, marginLeft: '0.5rem' }}>(Será salva na aba Arenas)</span>
              )}
              {activeTab === 'tilesets' && (
                <span style={{ fontSize: '0.75rem', opacity: 0.7, marginLeft: '0.5rem' }}>(Será salva na aba Tilesets)</span>
              )}
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
