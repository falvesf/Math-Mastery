const fs = require('fs');
const content = `
export function getMaxAddsLimit(value: number | string | null | undefined): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const name = DEFAULT_RANKS[value]?.name;
    if (name) {
      const rank = RANKS.find(r => r.name === name);
      return rank?.maxAddsLimit;
    }
  }
  if (typeof value === 'string' && value) {
    const rank = RANKS.find(r => r.name === value);
    return rank?.maxAddsLimit;
  }
  return undefined;
}
`;
fs.appendFileSync('src/lib/ranks.ts', content);
