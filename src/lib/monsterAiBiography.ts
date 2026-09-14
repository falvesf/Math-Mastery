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
  const hasSpecial = ctx.attacks?.special?.enabled;
  const hasRanged = ctx.attacks?.ranged?.enabled;
  const hasRage = ctx.attacks?.support?.enabled || ctx.attacks?.heal?.enabled;
  const dropCount = ctx.drops?.length || 0;

  const intros = [
    `Uma lenda ancestral ecoa pelos corredores das masmorras sobre ${name}, uma entidade temida até mesmo pelos guerreiros mais experientes.`,
    `Das profundezas sombrias do reino surge ${name}, uma criatura cuja simples presença faz estremecer o ar ao redor.`,
    `Poucos são os que ousaram cruzar o caminho de ${name} e viveram para contar seus segredos. Sua força é implacável e sua fúria, insaciável.`,
  ];

  const tactics = [
    `Em combate, avança sem hesitar, desferindo investidas brutais que desafiam qualquer defesa convencional.`,
    `Seus instintos predatórios o tornam imprevisível na arena, esperando o momento exato para contra-atacar seus adversários.`,
  ];

  let specialTactic = '';
  if (hasSpecial) {
    specialTactic = ` Quando pressionado, canaliza uma energia oculta para desferir golpes especiais devastadores capazes de mudar o rumo da batalha.`;
  }
  if (hasRanged) {
    specialTactic += ` Não hesite em manter distância cautelosa, pois é capaz de atacar de longe com projéteis mortais.`;
  }
  if (hasRage) {
    specialTactic += ` Ao sentir o peso dos ferimentos, sua determinação entra em frenesi, amplificando seu poder com vigor renovado.`;
  }

  let spoils = '';
  if (dropCount > 0) {
    spoils = ` Relatos de aventureiros sugerem que ${name} resguarda até ${dropCount} relíquias raras e tesouros ocultos em seus domínios, ansiando por guerreiros dignos de reivindicá-los.`;
  } else {
    spoils = ` Dizem que derrotá-lo concede honra suprema e o respeito inabalável de toda a guilda.`;
  }

  const intro = intros[Math.floor(Math.random() * intros.length)];
  const tactic = tactics[Math.floor(Math.random() * tactics.length)];

  return `${intro}\n\n${tactic}${specialTactic}\n\n${spoils}`;
}

/**
 * Gera a biografia completa e imersiva do monstro usando a IA (Groq/Llama) com fallback procedural
 */
export async function generateMonsterBiographyWithAI(ctx: MonsterLoreContext): Promise<string> {
  const cfg = await getGrokConfig();

  if (cfg?.apiKey) {
    try {
      const attackDetails: string[] = [];
      if (ctx.attacks?.primaryAttack) attackDetails.push(`Ataque primário: ${ctx.attacks.primaryAttack}`);
      if (ctx.attacks?.ranged?.enabled) attackDetails.push(`Projéteis de longo alcance: ${ctx.attacks.ranged.projectileType || 'pedra'}`);
      if (ctx.attacks?.special?.enabled) attackDetails.push(`Golpe especial devastador: ${ctx.attacks.special.proceduralType || 'impacto'}`);
      if (ctx.attacks?.support?.enabled || ctx.attacks?.heal?.enabled) attackDetails.push('Habilidade de fúria/regeneração');

      const dropsDetails = (ctx.drops || []).map(d => d.itemTitle || 'Item misterioso').join(', ');

      const systemPrompt = `Você é um sábio cronista e mestre de RPG medieval clássico. Escreva a biografia oficial de uma criatura para o Bestiário Oficial do jogo.
O texto deve ser atmosférico, épico e dividido em 3 parágrafos curtos:
1. Origem e lenda da criatura.
2. Comportamento e perigos em combate (mencionando suas táticas e ataques).
3. Mistério sobre as relíquias e tesouros raros que ela guarda.
Mantenha o texto imersivo, direto, em português do Brasil e sem formatações estranhas ou emojis excessivos.`;

      const userPrompt = `Nome do Monstro: "${ctx.monsterName}"
Gênero: ${ctx.gender || 'indefinido'}
Nível Estimado: ${ctx.level || 1}
Táticas de Ataque: ${attackDetails.join('; ') || 'Combate corpo a corpo voraz'}
Possíveis Espólios/Drops: ${dropsDetails || 'Relíquias raras desconhecidas'}
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
      p3 = `🔍 Espólios Secretos: Rumores indicam que esta criatura guarda ${totalDrops} item(ns) especial(is), mas você ainda não conseguiu extrair nenhum drop de suas garras.`;
    } else if (discoveredCount < totalDrops) {
      const remaining = totalDrops - discoveredCount;
      p3 = `🎁 Espólios Descobertos: Você já obteve ${encounters.discoveredDropTitles.join(', ')}. No entanto, seus arquivos indicam que ainda existem ${remaining} drop(s) misterioso(s) a serem conquistados!`;
    } else {
      p3 = `👑 Mestre do Bestiário: Você decifrou todos os ${totalDrops} espólios possíveis de ${ctx.monsterName}! Não restam mais segredos nesta criatura.`;
    }
  }

  return [p1, p2, p3].filter(Boolean).join('\n\n');
}
