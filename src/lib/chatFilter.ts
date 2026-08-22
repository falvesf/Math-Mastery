// Filtro de mensagens do chat:
// - Remove links e HTML (evita phishing e quebra de layout)
// - Detecta e substitui palavras impróprias/ódio/discriminação

const BLOCKED_WORDS: { re: RegExp; replacement: string }[] = [
  { re: /\bnazi\w*/gi, replacement: '****' },
  { re: /\bfascist\w*/gi, replacement: '****' },
  { re: /\bporn\w*/gi, replacement: '****' },
  { re: /\bput[aá]r\w*/gi, replacement: '****' },
  { re: /\b(?:f[o0]d[ei][o0]|f[o0]der)\w*/gi, replacement: '****' },
  { re: /\bv[aá]gabund\w*/gi, replacement: '****' },
  { re: /\bv[aá]gina\w*/gi, replacement: '****' },
  { re: /\bp[eé]n[i1]s\w*/gi, replacement: '****' },
  { re: /\bc[aá]r[aá]lh[o0]/gi, replacement: '****' },
  { re: /\bc[o0]r[o0]n[o0]/gi, replacement: '****' },
  { re: /\bmerd\w*/gi, replacement: '****' },
  { re: /\bb[o0]st[o0]/gi, replacement: '****' },
  { re: /\bc[o0]c[o0]/gi, replacement: '****' },
  { re: /\bb[o0]c[eê]t[o0]/gi, replacement: '****' },
  { re: /\bs[aá]f[aá]d[o0]/gi, replacement: '****' },
  { re: /\bimbecil\w*/gi, replacement: '****' },
  { re: /\bid[i1]ot\w*/gi, replacement: '****' },
  { re: /\bburr\w*/gi, replacement: '****' },
  { re: /\bre[tr]ardad\w*/gi, replacement: '****' },
  { re: /\bbab[aá]c\w*/gi, replacement: '****' },
  { re: /\bviad[o0]/gi, replacement: '****' },
  { re: /\bbicha\w*/gi, replacement: '****' },
  { re: /\bsapat[o0]\w*/gi, replacement: '****' },
  { re: /\bf[o0]lha\w*/gi, replacement: '****' },
  { re: /\bneg[o0]/gi, replacement: '****' },
  { re: /\bmac[aá]c[o0]/gi, replacement: '****' },
  { re: /\bcr[ie][o0]l[o0]\w*/gi, replacement: '****' },
  { re: /\bp[o0]rqu[o0]/gi, replacement: '****' },
  { re: /\bmulata\w*/gi, replacement: '****' },
  { re: /\bch[o0]ta\w*/gi, replacement: '****' },
  { re: /\bc[o0]m[o0]di\w*/gi, replacement: '****' },
  { re: /\bfilh\w* da puta/gi, replacement: '****' },
  { re: /\bdesgraçad\w*/gi, replacement: '****' },
  { re: /\bmal[ei]c[ií]o\w*/gi, replacement: '****' },
  { re: /\bcanalh\w*/gi, replacement: '****' },
  { re: /\bs[o0]rn\w*/gi, replacement: '****' },
  { re: /\bpancad\w*/gi, replacement: '****' },
  { re: /\bchifrud\w*/gi, replacement: '****' },
  { re: /\btrouxa\w*/gi, replacement: '****' },
  { re: /\bpalha[cç][o0]\w*/gi, replacement: '****' },
  { re: /\bc[o0]rn[o0]/gi, replacement: '****' },
  { re: /\bc[o0]rna\w*/gi, replacement: '****' },
];

const URL_RE = /(https?:\/\/|www\.)[^\s]+|([a-z0-9-]+\.)+[a-z]{2,}(:\d+)?(\/[^\s]*)?/gi;
const HTML_RE = /<[^>]*>/g;
const NEWLINE_RE = /\r?\n/g;

export function sanitizeMessage(input: string): { text: string; containsBlocked: boolean } {
  if (!input) return { text: '', containsBlocked: false };

  let text = input;

  // 1. Remover HTML (evita injeção/quebra de layout)
  text = text.replace(HTML_RE, '');

  // 2. Remover links (evita phishing/direcionamento externo)
  text = text.replace(URL_RE, '[link bloqueado]');

  // 3. Detectar palavras bloqueadas (antes da substituição)
  let containsBlocked = false;
  for (const { re } of BLOCKED_WORDS) {
    if (re.test(text)) {
      containsBlocked = true;
      break;
    }
  }

  // 4. Substituir palavras bloqueadas (com l33t resistente: 0/o, 1/i, etc.)
  for (const { re, replacement } of BLOCKED_WORDS) {
    text = text.replace(re, replacement);
  }

  // 5. Remover excesso de quebras de linha (máx 8 linhas para o campo multi-linha)
  const lines = text.split(NEWLINE_RE);
  if (lines.length > 8) {
    text = lines.slice(0, 8).join('\n');
  }

  return { text: text.trim(), containsBlocked };
}

export function containsProfanity(input: string): boolean {
  return sanitizeMessage(input).containsBlocked;
}