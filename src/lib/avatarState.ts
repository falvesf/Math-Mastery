import { RANKS } from './ranks';
import type { UserData } from '../contexts/AuthContext';

export function getProfileAvatarState(userData: Partial<UserData> | null) {
  if (!userData) {
    return {
      animation: 'idle',
      expression: 'normal',
      damageOpacity: 0
    };
  }

  const now = Date.now();
  const rankIndex = Math.max(0, RANKS.findIndex(r => r.name === userData.lastSeenRank));
  const maxHearts = Math.max(3, 3 + Math.floor(rankIndex / 2));
  const currentHearts = userData.hearts ?? maxHearts;
  const hpPercentage = (currentHearts / maxHearts) * 100;
  const damageOpacity = Math.max(0, Math.min(1, (maxHearts - currentHearts) / maxHearts));

  let profileAnim = (userData.avatarConfig?.animationState as any) || 'idle';
  let profileExp = 'normal';

  if (userData.stunnedUntil && userData.stunnedUntil > now) {
    // 10 minute stun debuff
    profileAnim = 'hurt';
    profileExp = 'sad';
  } else if (userData.happyBuffUntil && userData.happyBuffUntil > now) {
    // Flawless victory buff
    profileAnim = 'cheer';
    profileExp = 'normal';
  } else {
    // Base logic on HP
    if (hpPercentage >= 75) {
      // Keep customized animation if 100% or healthy
      profileAnim = userData.avatarConfig?.animationState || 'idle';
      profileExp = 'normal';
    } else if (hpPercentage >= 50) {
      profileAnim = 'idle';
      profileExp = 'serious';
    } else if (hpPercentage >= 25) {
      profileAnim = 'exhausted';
      profileExp = 'serious';
    } else {
      profileAnim = 'exhausted';
      profileExp = 'sad';
    }
  }

  return {
    animation: profileAnim,
    expression: profileExp,
    damageOpacity
  };
}

// Basic Profanity Filter for Custom Status
const BANNED_WORDS = [
  'merda', 'porra', 'caralho', 'buceta', 'cuzão', 'cu', 'puta', 'puto',
  'viado', 'corno', 'arrombado', 'foda', 'foda-se', 'fodase', 'desgraça', 
  'vadia', 'piranha', 'corno', 'chupa', 'cacete'
];

export function hasProfanity(text: string): boolean {
  if (!text) return false;
  const normalizedText = text.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // remove accents
    .replace(/[^\w\s]/gi, ''); // remove punctuation

  const words = normalizedText.split(/\s+/);
  
  for (const word of words) {
    if (BANNED_WORDS.includes(word)) {
      return true;
    }
    for (const banned of BANNED_WORDS) {
      if (word.includes(banned) && banned.length >= 4) { // only substring match longer words
        return true;
      }
    }
  }
  return false;
}
