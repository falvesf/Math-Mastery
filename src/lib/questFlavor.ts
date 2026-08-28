/**
 * Gerador de texto épico/educacional para as missões (a partir do título).
 * Funciona "escondido": nenhuma missão precisa de descrição manual — o texto
 * é elaborado automaticamente conforme o título, com foco RPG épico e pedagógico.
 *
 * Determinístico: o mesmo título sempre gera o mesmo texto (via hash), então
 * os cards não "mudam" de descrição a cada render.
 */

const OPENERS: ((t: string) => string)[] = [
  (t) => `A lenda de "${t}" ecoa pelos corredores da escola. Só os mais sábios desvendarão o segredo que ela guarda.`,
  (t) => `Prepare-se, herói! Em "${t}", cada acerto é um golpe certeiro contra a escuridão. O conhecimento será sua armadura.`,
  (t) => `Runas antigas revelam "${t}". Decifre os enigmas, domine os números e torne-se a lenda que sua turma precisa.`,
  (t) => `"${t}" é a prova de fogo do verdadeiro mestre. Resolva cada desafio e mostre que a matemática é sua espada.`,
  (t) => `O conselho da escola sussurra sobre "${t}". Sua mente é o grimório; cada resposta correta, um feitiço poderoso.`,
  (t) => `Em "${t}", a batalha se trava com lógica e coragem. Vença as provas e escreva seu nome na história.`,
  (t) => `Apenas quem domina os números ousa encarar "${t}". Prove seu valor, herói — a vitória espera os esforçados.`,
  (t) => `"${t}" não é para os fracos: é um desafio de mente e espírito. Responda com precisão e conquiste a glória.`,
  (t) => `O destino chama seu nome para "${t}". Estude, concentre-se e derrote a ignorância com o poder do saber.`,
  (t) => `Nas terras de "${t}", o conhecimento vale mais que ouro. Mostre sua sabedoria e avance rumo à lenda.`,
  (t) => `"${t}" ergue-se diante de você como a mais alta torre da escola. Cada resposta certa é um degrau até o topo.`,
  (t) => `Um chamado épico ecoa: "${t}". Vença com a mente afiada e leve sua turma à vitória.`,
];

const CLOSERS: string[] = [
  ' A vitória pertence aos que persistem.',
  ' Mostre que o saber é a sua maior força.',
  ' O troféu aguarda quem não desiste.',
  ' Que os números estejam ao seu favor.',
  ' Prepare-se para a batalha do conhecimento.',
  ' Sua lenda começa agora.',
];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

export function generateQuestFlavor(title?: string): string {
  const t = (title || '').trim();
  if (!t) return '';
  const h = hash(t);
  const opener = OPENERS[h % OPENERS.length](t);
  const closer = CLOSERS[Math.floor(h / OPENERS.length) % CLOSERS.length];
  return opener + closer;
}