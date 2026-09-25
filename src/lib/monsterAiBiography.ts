import { getGrokConfig } from './aiConfig';

export interface MonsterLoreContext {
  monsterName: string;
  gender?: string;
  level?: number;
  attacks?: any;
  drops?: Array<{ itemId: string; itemTitle?: string }>;
  quotes?: any;
  /** Estatísticas do aluno contra o monstro */
  studentEncounters?: {
    wins: number;
    defeats: number;
    discoveredDropTitles: string[];
  };
}

/**
 * Fallback procedural épico de RPG para biografia do monstro caso a IA esteja offline ou sem API key
 */
function generateProceduralMonsterBio(ctx: MonsterLoreContext): string {
  const name = ctx.monsterName || 'A Criatura';

  const intros = [
    `Uma lenda ancestral ecoa pelos corredores das masmorras sobre ${name}, uma entidade temida até mesmo pelos guerreiros mais experientes.`,
    `Das profundezas sombrias do reino surge ${name}, uma criatura cuja simples presença faz estremecer o ar ao redor.`,
    `Poucos são os que ousaram cruzar o caminho de ${name} e viveram para contar seus segredos. Sua força é implacável e sua fúria, insaciável.`,
  ];

  const tactics = [
    `Em combate, avança sem hesitar, desferindo investidas brutais que desafiam qualquer defesa convencional — mas seus golpes exatos são um mistério que só se revela a quem resiste tempo suficiente.`,
    `Seus instintos predatórios o tornam imprevisível na arena, e cada ataque guarda um segredo que poucos aventureiros viveram para descrever.`,
  ];

  const spoils = `Dizem que, em seus domínios, repousam relíquias cobiçadas por toda a guilda — porém o verdadeiro tesouro que ${name} guarda permanece oculto, à espera de quem o derrote para descobri-lo.`;

  const intro = intros[Math.floor(Math.random() * intros.length)];
  const tactic = tactics[Math.floor(Math.random() * tactics.length)];

  return `${intro}\n\n${tactic}\n\n${spoils}`;
}

/**
 * Gera a biografia completa e imersiva do monstro usando a IA (Groq/Llama) com fallback procedural
 */
export async function generateMonsterBiographyWithAI(ctx: MonsterLoreContext): Promise<string> {
  const cfg = await getGrokConfig();

  if (cfg?.apiKey) {
    try {
      const systemPrompt = `Você é um sábio cronista e mestre de RPG medieval clássico. Escreva a biografia oficial de uma criatura para o Bestiário Oficial do jogo.
O texto deve ser atmosférico, épico e dividido em 3 parágrafos curtos:
1. Origem e lenda da criatura.
2. Comportamento e perigos em combate (perigo GERAL, sem citar nomes de golpes/ataques específicos).
3. Mistério sobre as relíquias e tesouros que ela guarda (sem revelar quais itens são nem quantos exatamente).
REGRA IMPORTANTE: NÃO revele os golpes/ataques exatos nem os drops/espólios exatos — apenas insinue mistério, pois o aluno deve descobri-los enfrentando a criatura. Mantenha o texto imersivo, direto, em português do Brasil e sem formatações estranhas ou emojis excessivos.`;

      const userPrompt = `Nome do Monstro: "${ctx.monsterName}"
Gênero: ${ctx.gender || 'indefinido'}
Nível Estimado: ${ctx.level || 1}
Falas do Monstro: "${ctx.quotes?.defeat || '...'}"`;

      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${cfg.apiKey}`,
        },
        body: JSON.stringify({
          model: cfg.model || 'qwen/qwen3.8-27b',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.75,
          max_tokens: 450
        })
      });

      if (res.ok) {
        const json = await res.json();
        const content = json.choices?.[0]?.message?.content?.trim();
        if (content && content.length > 50) {
          return content;
        }
      }
    } catch (e) {
      console.warn('[monsterAiBiography] Falha ao chamar Groq, usando gerador procedural:', e);
    }
  }

  return generateProceduralMonsterBio(ctx);
}

/**
 * Gera a Biografia Dinâmica Progressiva para o aluno no Bestiário.
 * Adapta o texto canônico conforme os encontros, derrotas e descobertas do aluno.
 */
export function buildDynamicStudentBiography(baseBiography: string, ctx: MonsterLoreContext): string {
  const encounters = ctx.studentEncounters || { wins: 0, defeats: 0, discoveredDropTitles: [] };
  const paragraphs = (baseBiography || '').split('\n\n').filter(p => p.trim().length > 0);

  // Parágrafo 1: Sempre revelado (Aparência & Lenda Básica)
  const p1 = paragraphs[0] || `Pouco se sabe sobre ${ctx.monsterName}, exceto que sua presença foi confirmada nos desafios do reino.`;

  // Parágrafo 2: Comportamento em combate adaptado às derrotas sofridas pelo aluno
  let p2 = paragraphs[1] || '';
  if (encounters.defeats > 0) {
    p2 += `\n\n⚠️ Registro de Campo: Você já sentiu a ferocidade de ${ctx.monsterName} na pele (${encounters.defeats} derrota(s) registrada(s)). Seus golpes exigem precisão matemática para serem superados!`;
  } else if (encounters.wins > 0) {
    p2 += `\n\n⚔️ Registro de Campo: Você demonstrou coragem e conquistou a vitória em ${encounters.wins} batalha(s), desvendando as brechas em sua postura de ataque.`;
  }

  // Parágrafo 3: Relíquias & Espólios adaptados aos drops já encontrados
  const totalDrops = ctx.drops?.length || 0;
  const discoveredCount = encounters.discoveredDropTitles.length;
  let p3 = paragraphs[2] || '';

  if (totalDrops > 0) {
    if (discoveredCount === 0) {
      p3 = `🔍 Espólios Secretos: Rumores indicam que esta criatura guarda relíquias raras, mas você ainda não conseguiu extrair nenhum drop de suas garras.`;
    } else if (discoveredCount < totalDrops) {
      p3 = `🎁 Espólios Descobertos: Você já obteve ${encounters.discoveredDropTitles.join(', ')}. No entanto, seus arquivos indicam que ainda há drops misteriosos a serem conquistados!`;
    } else {
      p3 = `👑 Mestre do Bestiário: Você decifrou todos os ${totalDrops} espólios possíveis de ${ctx.monsterName}! Não restam mais segredos nesta criatura.`;
    }
  }

  return [p1, p2, p3].filter(Boolean).join('\n\n');
}

export interface MonsterQuotesResult {
  hp100_80: string;
  hp79_50: string;
  hp49_25: string;
  hp24_0: string;
  defeat: string;
  /** Fala do monstro ao derrotar o jogador. */
  win?: string;
}

/**
 * Fallback procedural de falas em onomatopeia/grunhido baseado na saúde e no nome do monstro.
 */
function generateProceduralMonsterQuotes(ctx: MonsterLoreContext): MonsterQuotesResult {
  const name = ctx.monsterName || 'A Criatura';
  const first = (name.split(' ')[0] || name).trim();

  const base = [
    'Grrr', 'Grrr...', 'Grrraaah', 'Rrrgh', 'Mrawr', 'Hsss', 'Bwarr', 'Raaar', 'Grrr!', 'Ughh',
    'Rrrgh!', 'Oooogh', 'Mrmmrgh', 'Snnrrl', 'Rrroar', 'Growl', 'Hrrrn', 'Krrr', 'Rrrrh', 'Wraaah',
  ];

  const withName = [
    `${first} GRRRR!`, `GRRR... ${name}!`, `${first.toUpperCase()}! RRRGH!`,
    `RRRGGGH! Eu sou ${name}!`, `${name.toUpperCase()}!`, `Grrrr... ${name} vence!`,
  ];

  const wounded = [
    'GRRRR...', 'UUUURGH!', 'Rrrgh... dói!', 'HSSSS!', 'GRRAAAH!', 'Nnngh...',
    'RRRGH!!', 'Aaaarrrgh!', 'GRRRRR!!', 'Ughh... ainda luto!', 'Grrr... sua vez!',
  ];

  const critical = [
    'GRAAAAH!!', 'NÃAAAO!', 'Rrrrgh... fraco...', 'HHRRRNN!', 'UUUUGH!!',
    'Não... não!', 'GRRR... morrendo...', 'Aaaah...', 'Como...?', 'Grr... maldição...',
  ];

  const defeat = [
    'GRAAAAH...', 'Fui... derrotado...', 'AHHHH!', 'Nãããooo...', 'Grrr...',
    'Meu... fim...', 'Aaaaargh...', 'Impossível...', 'Perdi...', 'Grrr...',
  ];

  const win = [
    'Você é fraco!', `${name} vence!`, 'Não é páreo para mim!', 'Desista!', 'Acabou!',
  ];

  const pick = (arr: string[], extra?: string) => {
    const pool = extra ? [...arr, extra] : arr;
    return pool[Math.floor(Math.random() * pool.length)];
  };

  return {
    hp100_80: pick([...base], withName[Math.floor(Math.random() * withName.length)]),
    hp79_50: pick(wounded, withName[Math.floor(Math.random() * withName.length)]),
    hp49_25: pick(wounded, `${name} NÃO DESISTE!`),
    hp24_0: pick(critical, `GRRRR... ${name} ainda luta!`),
    defeat: pick(defeat, `Maldito ${'você'}...`),
    win: pick(win),
  };
}

/**
 * Gera as 5 falas do monstro (por faixa de HP) usando a IA (Groq/Llama), em formato de
 * onomatopeia/grunhido coerente com o nome/biografia e com a condição de saúde. Fallback procedural.
 */
export async function generateMonsterQuotesWithAI(ctx: MonsterLoreContext): Promise<MonsterQuotesResult> {
  const cfg = await getGrokConfig();

  if (cfg?.apiKey) {
    try {
      const bioExcerpt = (ctx.biography || '').split('\n')[0].slice(0, 220);

      const systemPrompt = `Você é um designer de diálogos de batalha de um RPG educativo. Gere as falas de um monstro para 5 faixas de vida, EM PORTUGUÊS DO BRASIL.
Cada fala deve ser uma ONOMATOPEIA ou grunhido curto (1 a 2 palavras, no máximo ~5 palavras), terminando sem pontuação exagerada, com tom crescente de desespero conforme a vida cai.
Retorne APENAS JSON válido, sem markdown, no formato exato:
{"hp100_80":"...","hp79_50":"...","hp49_25":"...","hp24_0":"...","defeat":"..."}`;

      const userPrompt = `Nome do Monstro: "${ctx.monsterName}"
Gênero: ${ctx.gender || 'indefinido'}
Biografia/Contexto: "${bioExcerpt || ctx.monsterName || 'uma criatura misteriosa'}"
Nível: ${ctx.level || 1}`;

      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${cfg.apiKey}`,
        },
        body: JSON.stringify({
          model: cfg.model || 'qwen/qwen3.8-27b',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.85,
          max_tokens: 180,
          response_format: { type: 'json_object' },
        })
      });

      if (res.ok) {
        const json = await res.json();
        const content = json.choices?.[0]?.message?.content?.trim();
        if (content) {
          const match = content.match(/\{[\s\S]*\}/);
          if (match) {
            const parsed = JSON.parse(match[0]);
            const result: MonsterQuotesResult = {
              hp100_80: String(parsed.hp100_80 || '').trim(),
              hp79_50: String(parsed.hp79_50 || '').trim(),
              hp49_25: String(parsed.hp49_25 || '').trim(),
              hp24_0: String(parsed.hp24_0 || '').trim(),
              defeat: String(parsed.defeat || '').trim(),
            };
            if (result.hp100_80 && result.defeat) {
              return result;
            }
          }
        }
      }
    } catch (e) {
      console.warn('[monsterAiBiography] Falha ao chamar Groq para falas, usando gerador procedural:', e);
    }
  }

  return generateProceduralMonsterQuotes(ctx);
}
