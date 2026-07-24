import { useEffect, useState, useRef } from 'react';
import { getAvatarPrint } from '../lib/AvatarPrintQueue';
import type { EquippedItem } from './AvatarCharacter';
import { Loader2 } from 'lucide-react';

interface AvatarPrintProps {
  config: any;
  equippedItems?: EquippedItem[];
  size?: number;
}

export default function AvatarPrint({ config, equippedItems = [], size = 60 }: AvatarPrintProps) {
  const [imgUrl, setImgUrl] = useState<string | null>(null);

  const depsString = JSON.stringify({ config, equippedItems });

  useEffect(() => {
    if (!config) return;
    let isMounted = true;
    
    // Reset to loading state only when actual dependencies change
    setImgUrl(null); 

    getAvatarPrint(config, equippedItems).then(url => {
      if (isMounted) setImgUrl(url);
    });

    return () => { isMounted = false; };
  }, [depsString]);

  if (!imgUrl) {
    return (
      <div style={{ width: size, height: size * 1.5, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader2 className="animate-spin" size={size/2} color="var(--accent-blue)" />
      </div>
    );
  }

  return (
    <img 
      src={imgUrl} 
      alt="Avatar Print" 
      style={{ 
        width: size, 
        height: size * 1.5, 
        objectFit: 'contain',
        filter: 'drop-shadow(0px 4px 4px rgba(0,0,0,0.5))'
      }} 
    />
  );
}
