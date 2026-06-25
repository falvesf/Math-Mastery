export interface RankDef {
  name: string;
  minXp: number;
  color: string;
}

export const RANKS: RankDef[] = [
  { name: 'Sem Patente', minXp: 0, color: '#94a3b8' },
  { name: 'Bronze I', minXp: 600, color: '#cd7f32' },
  { name: 'Bronze II', minXp: 1200, color: '#cd7f32' },
  { name: 'Bronze III', minXp: 1800, color: '#cd7f32' },
  { name: 'Bronze IV', minXp: 2400, color: '#cd7f32' },
  { name: 'Prata I', minXp: 3000, color: '#cbd5e1' },
  { name: 'Prata II', minXp: 3600, color: '#cbd5e1' },
  { name: 'Prata III', minXp: 4200, color: '#cbd5e1' },
  { name: 'Ouro I', minXp: 4800, color: '#fbbf24' },
  { name: 'Ouro II', minXp: 5400, color: '#fbbf24' },
  { name: 'Ouro III', minXp: 6000, color: '#fbbf24' },
  { name: 'Diamante I', minXp: 6600, color: '#38bdf8' },
  { name: 'Diamante II', minXp: 7200, color: '#38bdf8' },
  { name: 'Mestre', minXp: 8000, color: '#f43f5e' },
  { name: 'Lendário', minXp: 10000, color: '#a855f7' },
];

export function getRankForXp(xp: number): RankDef {
  let currentRank = RANKS[0];
  for (const rank of RANKS) {
    if (xp >= rank.minXp) {
      currentRank = rank;
    } else {
      break;
    }
  }
  return currentRank;
}
