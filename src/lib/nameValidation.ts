const FORBIDDEN_WORDS: string[] = [
  // Português - termos racistas, ofensivos, nazistas
  'nazista', 'nazi', 'hitler', 'heil', 'racista', 'racismo',
  'preto', 'macaco', 'macaca', 'crioulo', 'crioula', 'escravo', 'escrava',
  'viado', 'viada', 'bicha', 'bicha', 'sapatao', 'sapatão',
  'puta', 'putaria', 'putinha', 'prostituta', 'vagabunda', 'vagabundo',
  'fdp', 'fodase', 'foder', 'fodasse', 'caralho', 'cu ', 'buceta', 'piranha',
  'merda', 'bosta', 'cuzao', 'cuzão', 'arrombado', 'arrombada',
  'otario', 'otária', 'otario', 'idiota', 'imbecil', 'retardado', 'retardada',
  'burro', 'burra', 'mongol', 'mongoloide',
  'corno', 'corna', 'traidor', 'traidora',
  'terrorista', 'terrorismo', 'bomba', 'assassino', 'assassina',
  'pedofilo', 'pedófilo', 'pedofilia',
  'estuprador', 'estupradora', 'estupro',
  'drogas', 'maconha', 'cocaina', 'crack', 'heroina',
  'kkk', 'ku klux', 'supremacista',
  'sieg', 'heil', 'swastika', 'suastica',
  
  // English - offensive terms
  'nigger', 'nigga', 'negro', 'coon', 'darkie', 'spic', 'wetback',
  'faggot', 'fag', 'dyke', 'tranny', 'homo',
  'whore', 'slut', 'bitch', 'cunt', 'pussy', 'dick', 'cock',
  'asshole', 'bastard', 'motherfucker', 'fuck', 'shit', 'damn',
  'nazi', 'hitler', 'heil', 'whitepower', 'white power',
  'terrorist', 'pedo', 'pedophile', 'rapist',
  'retard', 'retarded', 'cripple', 'spastic',
  'kkk', 'klu klux', 'aryan', 'supremacist',
  'kill', 'murder', 'suicide', 'hang', 'lynch',
  
  // L33t speak / substituições comuns
  'fck', 'fuk', 'fuc', 'sht', 'btch', 'cnt', 'dck',
  'n1gg', 'n1g', 'f4g', 'f@g', 'sh1t',
];

function normalizeL33t(name: string): string {
  const map: Record<string, string> = {
    '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '9': 'g',
    '@': 'a', '$': 's', '!': 'i', '+': 't',
  };
  return name.toLowerCase().split('').map(c => map[c] || c).join('');
}

function containsForbidden(normalizedName: string): boolean {
  for (const word of FORBIDDEN_WORDS) {
    const w = word.toLowerCase().trim();
    if (!w) continue;
    if (normalizedName.includes(w)) return true;
  }
  return false;
}

export interface NameValidationResult {
  valid: boolean;
  error?: string;
}

export function validateCharacterName(name: string): NameValidationResult {
  const trimmed = name.trim();
  
  if (!trimmed) {
    return { valid: false, error: 'Digite um nome para o personagem.' };
  }
  
  if (trimmed.length > 12) {
    return { valid: false, error: 'O nome pode ter no máximo 12 caracteres.' };
  }
  
  if (!/^[a-zA-Z0-9]+$/.test(trimmed)) {
    return { valid: false, error: 'Use apenas letras (sem acento) e números, sem espaços ou símbolos.' };
  }
  
  const lower = trimmed.toLowerCase();
  if (containsForbidden(lower)) {
    return { valid: false, error: 'Este nome não é permitido. Escolha outro nome.' };
  }
  
  const normalized = normalizeL33t(lower);
  if (normalized !== lower && containsForbidden(normalized)) {
    return { valid: false, error: 'Este nome não é permitido. Escolha outro nome.' };
  }
  
  return { valid: true };
}

export function normalizeForComparison(name: string): string {
  return normalizeL33t(name.toLowerCase().trim());
}

export function normalizeNameForMatch(name: string): string {
  return (name || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '');
}

export function formatFirstAndLastName(fullName: string): string {
  if (!fullName) return '';
  const parts = fullName.trim().split(/\s+/);
  if (parts.length > 1) {
    return `${parts[0]} ${parts[parts.length - 1]}`;
  }
  return fullName;
}

