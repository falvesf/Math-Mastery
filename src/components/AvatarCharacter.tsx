import { useEffect, useRef, useState } from 'react';
import { SkinViewer, IdleAnimation, WalkingAnimation, RunningAnimation } from 'skinview3d';
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
  animation?: 'idle' | 'walk' | 'run' | 'cheer';
  interactive?: boolean;
  showSlots?: boolean;
}

export default function AvatarCharacter({ config, equippedItems = [], size = 120, animation = 'idle', interactive = true, showSlots = false }: AvatarCharacterProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewerRef = useRef<SkinViewer | null>(null);
  const [hoveredSlot, setHoveredSlot] = useState<string | null>(null);

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
    let blinkInterval: any;
    
    const loadSkins = async () => {
        if (!config || !viewerRef.current) return;
        try {
            const normalUrl = await generateMinecraftSkinUrl(config, false);
            const blinkUrl = await generateMinecraftSkinUrl(config, true);
            
            if (!isMounted) return;
            await viewerRef.current.loadSkin(normalUrl);
            if (!isMounted) return;
            
            blinkInterval = setInterval(() => {
                if (!viewerRef.current) return;
                viewerRef.current.loadSkin(blinkUrl);
                setTimeout(() => {
                    if (viewerRef.current && isMounted) viewerRef.current.loadSkin(normalUrl);
                }, 150);
            }, 3500 + Math.random() * 2000);
            
        } catch (e) {
            console.error("Error loading 3D skin", e);
        }
    };

    loadSkins();

    return () => {
        isMounted = false;
        if (blinkInterval) clearInterval(blinkInterval);
    };
  }, [config, size]);

  useEffect(() => {
    if (!viewerRef.current) return;
    if (animation === 'walk') {
      viewerRef.current.animation = new WalkingAnimation();
    } else if (animation === 'run') {
      viewerRef.current.animation = new RunningAnimation();
    } else if (animation === 'cheer') {
      viewerRef.current.animation = {
        progress: 0,
        paused: false,
        speed: 1,
        play(player: any, time: number) {
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
        }
      } as any;
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
