import { RANKS, getRankForXp } from './ranks';
import type { UserData } from '../contexts/AuthContext';
import type { AvatarConfig } from '../components/AvatarCharacter';

export function getProfileAvatarState(userData: Partial<UserData> | null, customConfig?: AvatarConfig) {
  if (!userData) {
    return {
      animation: 'idle',
      expression: 'normal',
      damageOpacity: 0
    };
  }

  const now = Date.now();
  const currentRank = getRankForXp(userData.xp || 0);
  const rankIndex = Math.max(0, RANKS.findIndex(r => r.name === currentRank.name));
  const maxHearts = Math.max(3, 3 + Math.floor(rankIndex / 2));
  const isAdminOrTeacher = userData.role === 'admin' || userData.role === 'teacher';
  const currentHearts = isAdminOrTeacher ? maxHearts : (userData.hearts ?? maxHearts);
  const hpPercentage = (currentHearts / maxHearts) * 100;
  const damageOpacity = Math.max(0, Math.min(1, (maxHearts - currentHearts) / maxHearts));

  const configToUse = customConfig || userData.avatarConfig;
  let profileAnim = (configToUse?.animationState as any) || 'idle';
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
  if (hpPercentage >= 50) {
    // Keep customized animation, face is normal or serious based on HP
    profileAnim = configToUse?.animationState || 'idle';
    profileExp = hpPercentage >= 75 ? 'normal' : 'serious';
  } else if (hpPercentage > 0) {
    // Below 50% but alive: still keep customized animation, but look sad
    profileAnim = configToUse?.animationState || 'idle';
    profileExp = 'sad';
  } else {
    // Dead (0 HP): Force exhausted/stopped
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
