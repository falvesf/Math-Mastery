export interface EvaluationType {
  id: string;
  name: string;
  weight: number;
}

// Por enquanto deixaremos fixo no código. 
// No futuro, isso poderá ser carregado/editado do banco de dados na aba de Configurações.
export const DEFAULT_EVALUATIONS: EvaluationType[] = [
  { id: 'prova', name: 'Prova Regular', weight: 100 },
  { id: 'trabalho', name: 'Trabalho / Projeto', weight: 100 },
  { id: 'desafio', name: 'Desafio Matemático Semanal', weight: 50 },
  { id: 'participacao', name: 'Participação Extra', weight: 10 },
];
