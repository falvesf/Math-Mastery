import { useEffect, useRef, useState } from 'react';
import { SkinViewer, IdleAnimation, WalkingAnimation, RunningAnimation, FunctionAnimation } from 'skinview3d';
import { generateMinecraftSkinUrl } from '../lib/SkinGenerator';
import { ATTRIBUTE_LABELS, type ItemAdd, type ItemCategory, type AttributeType } from '../lib/gacha';

export interface AvatarConfig {
  gender?: 'male' | 'female';
  skinColor?: string;
  hairColor?: string;
  eyeColor?: string;
  hairStyle?: string;
  mouthStyle?: string;
  eyeStyle?: string;
  shirtColor?: string;
  pantsColor?: string;
  handedness?: 'right' | 'left';
  animationState?: 'idle' | 'walk' | 'run';
  customSkinUrl?: string;
}

export interface EquippedItem {
  imageUrl: string;
  avatarPart: 'head' | 'face' | 'body' | 'legs' | 'feet' | 'hand' | 'accessory' | 'background' | 'pet';
  itemTitle?: string;
  itemCategory?: ItemCategory;
  baseAttributeType?: AttributeType;
  baseAttributeValue?: number;
  adds?: ItemAdd[];
}

export interface AvatarCharacterProps {
  config: AvatarConfig | null;
  equippedItems?: EquippedItem[];
  size?: number; // largura base
  animation?: 'idle' | 'walk' | 'run' | 'cheer' | 'attack' | 'hurt' | 'death-fall' | 'death-explode';
  interactive?: boolean;
  showSlots?: boolean;
}

export default function AvatarCharacter({ config, equippedItems = [], size = 120, animation = 'idle', interactive = true, showSlots = false }: AvatarCharacterProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewerRef = useRef<SkinViewer | null>(null);
  const [hoveredSlot, setHoveredSlot] = useState<string | null>(null);

  // States to hold generated skin URLs
  const [skinUrls, setSkinUrls] = useState<{ normal: string; blink: string; hurt: string } | null>(null);

  const bgItems = equippedItems.filter(i => i.avatarPart === 'background');

  useEffect(() => {
    if (!canvasRef.current) return;
    
    if (!viewerRef.current) {
        const viewer = new SkinViewer({
            canvas: canvasRef.current,
            width: size,
            height: size * 1.8,
            skin: "" // We will set this dynamically
        });
        viewer.animation = new IdleAnimation();

        viewer.controls.enableZoom = interactive;
        viewer.controls.enableRotate = interactive;
        viewer.controls.enablePan = interactive;
        
        viewerRef.current = viewer;
        
        // Em versões recentes do skinview3d, setar a cor de fundo como transparente no renderer:
        if (viewerRef.current.renderer) {
            viewerRef.current.renderer.setClearColor(0x000000, 0);
        }
        
        // Move camera to frame it nicely
        viewerRef.current.camera.position.set(0, 10, 60);
    } else {
        viewerRef.current.width = size;
        viewerRef.current.height = size * 1.8;
    }

    let isMounted = true;

    const generateSkins = async () => {
        if (!config) return;
        try {
            if (config.customSkinUrl) {
                setSkinUrls({ normal: config.customSkinUrl, blink: config.customSkinUrl, hurt: config.customSkinUrl });
            } else {
                const normalUrl = await generateMinecraftSkinUrl(config, false);
                const blinkUrl = await generateMinecraftSkinUrl(config, true);
                const hurtConfig = { ...config, mouthStyle: 'sad' };
                const hurtUrl = await generateMinecraftSkinUrl(hurtConfig, true);
                if (isMounted) setSkinUrls({ normal: normalUrl, blink: blinkUrl, hurt: hurtUrl });
            }
        } catch (e) {
            console.error("Error generating 3D skins", e);
        }
    };

    generateSkins();

    return () => {
        isMounted = false;
    };
  }, [config, size]);

  // Handle Skin Application & Blinking
  useEffect(() => {
      if (!viewerRef.current || !skinUrls) return;
      let isMounted = true;
      let blinkInterval: any;

      const applySkins = async () => {
          if (animation === 'hurt') {
              if (blinkInterval) clearInterval(blinkInterval);
              await viewerRef.current!.loadSkin(skinUrls.hurt);
          } else {
              await viewerRef.current!.loadSkin(skinUrls.normal);
              
              blinkInterval = setInterval(() => {
                  if (!viewerRef.current) return;
                  viewerRef.current.loadSkin(skinUrls.blink);
                  setTimeout(() => {
                      if (viewerRef.current && isMounted) viewerRef.current.loadSkin(skinUrls.normal);
                  }, 150);
              }, 3500 + Math.random() * 2000);
          }
      };

      applySkins();

      return () => {
          isMounted = false;
          if (blinkInterval) clearInterval(blinkInterval);
      };
  }, [skinUrls, animation]);

  useEffect(() => {
    if (!viewerRef.current) return;
    const player = viewerRef.current.playerObject;

    // Função para resetar posições e rotações alteradas por mortes/ataques
    const resetBones = () => {
      if (!player || !player.skin) return;
      player.position.set(0, 0, 0);
      player.rotation.set(0, 0, 0);
      player.skin.head.position.set(0, 8, 0);
      player.skin.head.rotation.set(0, 0, 0);
      player.skin.body.position.set(0, 0, 0);
      player.skin.body.rotation.set(0, 0, 0);
      
      const isSlim = viewerRef.current?.animation?.constructor.name.includes("Slim"); 
      // Approximate reset
      player.skin.leftArm.position.set(-6, 4, 0);
      player.skin.leftArm.rotation.set(0, 0, 0);
      player.skin.rightArm.position.set(6, 4, 0);
      player.skin.rightArm.rotation.set(0, 0, 0);
      player.skin.leftLeg.position.set(-2, -4, 0);
      player.skin.leftLeg.rotation.set(0, 0, 0);
      player.skin.rightLeg.position.set(2, -4, 0);
      player.skin.rightLeg.rotation.set(0, 0, 0);
    };

    resetBones();

    if (animation === 'walk') {
      viewerRef.current.animation = new WalkingAnimation();
    } else if (animation === 'run') {
      viewerRef.current.animation = new RunningAnimation();
    } else if (animation === 'cheer') {
      viewerRef.current.animation = new FunctionAnimation((player: any, time: number) => {
        player.position.y = Math.abs(Math.sin(time * 5)) * 6;
        player.skin.leftArm.rotation.x = Math.PI;
        player.skin.rightArm.rotation.x = Math.PI;
        player.skin.leftArm.rotation.z = 0.2 + Math.sin(time * 10) * 0.1;
        player.skin.rightArm.rotation.z = -0.2 - Math.sin(time * 10) * 0.1;
        player.skin.head.rotation.x = -0.2;
        player.skin.leftLeg.rotation.x = 0;
        player.skin.rightLeg.rotation.x = 0;
        player.skin.leftLeg.rotation.z = -0.1;
        player.skin.rightLeg.rotation.z = 0.1;
      });
    } else if (animation === 'attack') {
      viewerRef.current.animation = new FunctionAnimation((player: any, time: number) => {
        // Movimento rápido de ataque com braço direito e pequeno avanço
        player.skin.rightArm.rotation.x = Math.sin(time * 15) * 2;
        player.position.z = Math.sin(time * 10) * 2;
      });
    } else if (animation === 'hurt') {
      viewerRef.current.animation = new FunctionAnimation((player: any, time: number) => {
        // Jogado para trás, braços abertos
        player.skin.head.rotation.x = -0.5;
        player.skin.leftArm.rotation.x = -Math.PI / 4;
        player.skin.rightArm.rotation.x = -Math.PI / 4;
        player.skin.leftArm.rotation.z = 0.5;
        player.skin.rightArm.rotation.z = -0.5;
        player.position.z = Math.abs(Math.sin(time * 10)) * -3;
      });
    } else if (animation === 'death-fall') {
      viewerRef.current.animation = new FunctionAnimation((player: any, time: number) => {
        const fall = Math.min(time * 3, Math.PI / 2);
        player.rotation.x = -fall;
        player.position.y = -fall * 10;
        player.position.z = -fall * 5;
        player.skin.leftArm.rotation.z = fall * 0.5;
        player.skin.rightArm.rotation.z = -fall * 0.5;
      });
    } else if (animation === 'death-explode') {
      viewerRef.current.animation = new FunctionAnimation((player: any, time: number) => {
        const scatter = Math.min(time * 8, 30);
        player.skin.head.position.y = 8 + scatter * 1.5;
        player.skin.head.rotation.y = time * 5;
        
        player.skin.leftArm.position.x = -6 - scatter;
        player.skin.leftArm.position.y = 4 + scatter * 0.5;
        player.skin.leftArm.rotation.z = time * -10;

        player.skin.rightArm.position.x = 6 + scatter;
        player.skin.rightArm.position.y = 4 + scatter * 0.5;
        player.skin.rightArm.rotation.z = time * 10;

        player.skin.leftLeg.position.x = -2 - scatter * 0.5;
        player.skin.leftLeg.position.y = -4 - scatter;
        player.skin.leftLeg.rotation.x = time * -5;

        player.skin.rightLeg.position.x = 2 + scatter * 0.5;
        player.skin.rightLeg.position.y = -4 - scatter;
        player.skin.rightLeg.rotation.x = time * 5;

        player.skin.body.position.z = -scatter;
        player.skin.body.rotation.x = time * 3;
      });
    } else {
      viewerRef.current.animation = new IdleAnimation();
    }
  }, [animation]);

  const handItems = equippedItems.filter(i => i.avatarPart === 'hand');
  let leftScreenHandItem = null; // Character's right hand
  let rightScreenHandItem = null; // Character's left hand

  if (config?.handedness === 'left') {
    rightScreenHandItem = handItems[0];
    leftScreenHandItem = handItems[1];
  } else {
    leftScreenHandItem = handItems[0];
    rightScreenHandItem = handItems[1];
  }

  const getEquippedForSlot = (slotId: string) => {
    if (slotId === 'hand1') return rightScreenHandItem;
    if (slotId === 'hand2') return leftScreenHandItem;
    return equippedItems.find(i => i.avatarPart === slotId);
  };

  const ALL_SLOTS = [
    { id: 'head', label: 'Elmo / Cabeça', pos: { top: '-15%', left: '50%', transform: 'translateX(-50%)' } },
    { id: 'face', label: 'Rosto / Óculos', pos: { top: '5%', right: '-35%' } },
    { id: 'accessory', label: 'Acessório', pos: { top: '5%', left: '-35%' } },
    { id: 'hand1', label: 'Mão (Esquerda do Personagem)', pos: { top: '40%', right: '-50%', transform: 'translateY(-50%)' } },
    { id: 'hand2', label: 'Mão (Direita do Personagem)', pos: { top: '40%', left: '-50%', transform: 'translateY(-50%)' } },
    { id: 'body', label: 'Armadura / Corpo', pos: { bottom: '20%', right: '-40%' } },
    { id: 'legs', label: 'Calças / Pernas', pos: { bottom: '20%', left: '-40%' } },
    { id: 'feet', label: 'Botas / Pés', pos: { bottom: '-5%', left: '50%', transform: 'translateX(-50%)' } },
    { id: 'pet', label: 'Mascote', pos: { bottom: '5%', left: '-70%' } },
  ];

  return (
    <div style={{
      position: 'relative',
      width: size,
      height: size * 1.8,
      display: 'inline-block',
    }}>
      
      {/* Background Items */}
      {bgItems.map((item, idx) => (
        <img 
          key={`bg-${idx}`}
          src={item.imageUrl}
          alt="Background"
          style={{
            position: 'absolute',
            top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '150%', height: '150%',
            objectFit: 'contain',
            zIndex: 0,
            pointerEvents: 'none'
          }}
        />
      ))}

      {/* 3D Canvas */}
      <canvas 
        ref={canvasRef} 
        style={{ 
          display: 'block', 
          position: 'relative',
          zIndex: 1,
          outline: 'none',
          pointerEvents: 'auto'
        }} 
      />
      {/* Slots de Equipamento Externos */}
      {showSlots && ALL_SLOTS.map(slot => {
        const item = getEquippedForSlot(slot.id);
        const slotSize = size * 0.40; // 40% da largura do canvas
        return (
          <div 
            key={slot.id} 
            onMouseEnter={() => setHoveredSlot(slot.id)}
            onMouseLeave={() => setHoveredSlot(null)}
            style={{
              position: 'absolute',
              ...slot.pos,
              width: slotSize,
              height: slotSize,
              borderRadius: '50%',
              background: item ? 'var(--bg-dark)' : 'rgba(255,255,255,0.03)',
              border: item ? '2px solid var(--gold-primary)' : '1px dashed rgba(255,255,255,0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 10,
              boxShadow: item ? '0 0 10px rgba(251, 191, 36, 0.4)' : 'none',
              overflow: 'visible'
          }}>
            {/* Imagem do Item centralizada e cortada (hidden) num circulo interior para não quebrar a borda visivel caso coloquemos o tooltip por fora */}
            <div style={{ width: '100%', height: '100%', borderRadius: '50%', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {item && <img src={item.imageUrl} alt="" style={{ width: '80%', height: '80%', objectFit: 'contain' }} />}
            </div>
            
            {/* Tooltip Estilo RPG */}
            {hoveredSlot === slot.id && (
               <div style={{
                 position: 'absolute',
                 top: '110%',
                 left: '50%',
                 transform: 'translateX(-50%)',
                 background: 'rgba(15, 23, 42, 0.95)',
                 border: '1px solid var(--border-glass)',
                 borderRadius: '8px',
                 padding: '1rem',
                 width: 'max-content',
                 minWidth: '200px',
                 zIndex: 50,
                 boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
                 backdropFilter: 'blur(10px)',
                 pointerEvents: 'none',
                 color: 'white',
                 textAlign: 'left'
               }}>
                 {item ? (
                   <>
                     <h4 style={{ margin: '0 0 0.5rem 0', color: 'var(--gold-primary)' }}>{item.itemTitle || 'Item Desconhecido'}</h4>
                     
                     {item.baseAttributeType && item.baseAttributeType !== 'none' && ATTRIBUTE_LABELS[item.baseAttributeType] && (
                       <div style={{ marginBottom: '0.5rem', fontSize: '0.9rem', color: 'white' }}>
                         {ATTRIBUTE_LABELS[item.baseAttributeType].icon} {ATTRIBUTE_LABELS[item.baseAttributeType].label}: +{item.baseAttributeValue}{['xp','coins','vitality','fortitude','persuasion'].includes(item.baseAttributeType) ? '%' : ''}
                       </div>
                     )}
                     
                     {item.adds && item.adds.length > 0 && (
                       <div style={{ fontSize: '0.9rem' }}>
                         <strong style={{ color: '#D8B4FE' }}>✨ Atributos Adicionais:</strong>
                         <ul style={{ margin: '0.25rem 0 0 0', paddingLeft: '1.2rem' }}>
                           {item.adds.map((add: ItemAdd, i: number) => {
                             const lbl = ATTRIBUTE_LABELS[add.type];
                             if (!lbl) return null;
                             return (
                               <li key={i} style={{ color: lbl.color, marginBottom: '0.25rem' }}>
                                 {lbl.icon} {lbl.label}: +{add.value}%
                               </li>
                             );
                           })}
                         </ul>
                       </div>
                     )}
                   </>
                 ) : (
                   <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                     {slot.label}<br/>
                     <span style={{ fontSize: '0.8rem', opacity: 0.7 }}>Nenhum item equipado</span>
                   </p>
                 )}
               </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
