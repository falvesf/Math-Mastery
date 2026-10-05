# Math-Mastery — Referência Completa do Projeto

> Documento de continuidade e orientação técnica para agentes de IA. **Responder sempre em PT-BR.**  
> **Regra de deploy: SÓ fazer commit/push quando o usuário pedir explicitamente** ("faça commit", "faça o commit/push", "deploy"). Nunca commitar por conta própria.  
> **Estado atual do projeto:** **Fase B Consolidada** — Cena 3D unificada padrão, Cenários 3D exploráveis com baús e portas matemáticas, Sistema de Rancho 3D com pets treináveis e forja avançada com preservação PBR.

---

## 1. Visão Geral

- **Nome do Projeto:** Math-Mastery (plataforma pedagógica gamificada de matemática, multi-tenant).
- **Stack Principal:** React 19 + TypeScript (strict) + Vite 8, `react-router-dom` v7, **Supabase** (PostgreSQL, Auth, Storage, Realtime, RPCs), PWA (Service Worker para cache de assets).
- **Motores 3D:** Three.js **0.156 integrado em `skinview3d/node_modules/three`** (utilizado pela Arena 3D, Cenários 3D, Rancho e bonecos) e Three **0.185** (utilitários de conversão e exportação). A arena e os cenários utilizam Three puro com loops otimizados em `requestAnimationFrame`.
- **Inteligência Artificial:** Groq API (`getGrokConfig`) para geração de biografias, lore de missões e falas situacionais de monstros.
- **Roteamento Canônico:**
  - `/quest/:questId` → `QuestGameplayMobile.tsx` (interface canônica de combate).
  - `/dashboard` → `Dashboard.tsx` (área do estudante).
  - `/admin` → `AdminDashboard.tsx` (painel pedagógico e administrativo).
  - `/live/:questId` → `LiveQuestStudent.tsx` (missões ao vivo em sala de aula).

---

## 2. Comandos Operacionais Críticos

- **Build de Produção:** `npm run build` ou `node node_modules\vite\bin\vite.js build`.
- **Verificação de Tipos (Typecheck):** `npx tsc -b --noEmit` ou `npx tsc --noEmit -p tsconfig.app.json`.
- **Linter:** `npm run lint` (oxlint).
- **Deploy:** Host conectado à branch `main` (Vercel/Netlify com rebuild automático). Domínio: `math-mastery.com.br`.
- **Cache e PWA no Mobile:** O Service Worker cacheia prioritariamente assets do Supabase/Storage. Para testar modificações no navegador móvel: **Ctrl+Shift+R** (hard reload) ou limpar cache do navegador.

---

## 3. Arquitetura e Contextos Globais (`src/contexts`)

1. **`AuthContext.tsx`**:
   - Estados de usuário (`UserData`): UID, role, moedas, XP, vida, patente, `avatarConfig`, status online.
   - Suporte a login Supabase e credenciais locais da escola.
   - Sistema de *impersonation* (`startImpersonation`/`exitImpersonation`) para suporte a alunos e professores.
   - Alternância de visão rápida do aluno no painel do professor (`toggleStudentView`).
2. **`TenantContext.tsx`**:
   - Isolamento multi-tenant por escola (`tenantId`).
   - Provisionamento automático de turmas e parâmetros padrão ao cadastrar uma escola.
3. **`DialogContext.tsx`**:
   - Modais assíncronos (`showAlert`, `showConfirm`, `showConfirmWithCheckbox`, `showPrompt`, `showToast`).

---

## 4. Cenários 3D e Exploração (`src/components/MapExplorerPoC.tsx`)

O módulo de cenários 3D permite exploração de masmorras e vilas em primeira ou terceira pessoa:
- **Portas com Desafios Matemáticos**: Obstáculos de passagem que abrem apenas com a resolução correta da pergunta matemática apresentada ao jogador.
- **Baús de Tesouro 3D**:
  - **Escala Customizável**: Suporte a escalas de 10% a 500% (`chestScale`), configuráveis no `Admin3DModelsManager` e no `AdminScenarioManager`.
  - **Modelos GLB Duplos**: Suporte a modelos GLB com geometria dupla lado a lado (fechado inicial / aberto após interação) ou animação de rotação de tampa.
  - **Trancas e Chaves**: Baús podem ser marcados como trancados (`isLocked`). A chave é sorteada e vinculada dinamicamente a monstros comuns da fase (nunca ao Boss).
  - **Mensagem Padrão de Bloqueio**: `"Trancado. Necessita de uma chave."`.
  - **Persistência Visual de Abertura**: Baús abertos permanecem abertos visualmente durante toda a sessão no cenário.
- **Monstros do Mapa & Combate**:
  - IA de patrulha e aproximação rápida ao detectar o jogador (aggro).
  - **Esquiva 3D Realista**: Quando o monstro se esquiva do ataque do jogador, ele executa uma animação tridimensional de desvio lateral/recuo rápido em vez de apenas exibir um texto.
  - **Falas Estritas**: Monstros sem falas customizadas cadastradas no `MonsterAttributesEditor` permanecem em silêncio durante todo o encontro (sem falas ou pensamentos de fallback genéricos).
- **Mineração e Quebra de Blocos**: Coleta de moedas e minérios através de interação direta com picareta.
- **Drops Confiáveis**: Baús e monstros inserem no inventário o item completo com todos os dados do catálogo (`store_items`), prevenindo erros de "Item Desconhecido".

---

## 5. Arena 3D Unificada (`src/components/VoxelArena3D.tsx`)

Padrão consolidado de combate da **Fase B**:
- **Três.js Unificado (Three 0.156)**: Jogador e monstro coexistem na mesma cena com iluminação direcional, pontos de luz e sombras projetadas.
- **Boneco Nativo do Jogador**: Instanciado a partir do `skinview3d` com suporte completo a capas, expressividade facial, tintura de dano e itens equipados nos ossos.
- **HUD 3D Billboard Completo**:
  - Nomes flutuantes renderizados acima da cabeça do modelo, ajustando-se automaticamente à altura real medida (`monsterHeadTopRef`).
  - Corações tridimensionais desenhados com o caminho SVG exato do Lucide Heart, com preenchimento fracionado suave e empilhamento em linhas de 6 corações.
  - Barras de status (veneno, fogo, eletricidade, sangramento, congelamento) sincronizadas por tempo real com contagem regressiva.
- **Física e Detalhes de Dano**:
  - Expressões de estresse dinâmicas (`serious`, `sad`, `normal`) conforme a saúde do jogador.
  - Gotas de suor e pingos de sangue animados proceduralmente no Three.js.
  - Hematomas (`bruises`) mapeados nos ossos do personagem proporcionalmente ao dano sofrido.
  - Efeito de congelamento tridimensional com cubos geométricos, poça de água ao derreter e estilhaçamento (`iceBreakTick`).
  - Animação e recuo em esquivas de monstros.
- **Chance de Fuga Parametrizada (`fleeChanceTable`)**: O monstro pode fugir da batalha baseado na tabela de vida restante configurada, acionando vitória sem baú.

---

## 6. Sistema de Rancho e Pets 3D (`src/components/Ranch3D.tsx` & `RanchModal.tsx`)

Módulo completo de fazenda e companheiros:
- **Cenário 3D Interativo**: Cercado tridimensional onde os animais perambulam livremente. Seleção por clique direto via *raycasting* com cálculo de coordenadas refinado.
- **Ciclo de Vida do Animal**:
  - Atributos vitais: Fome (`hunger`), Sede (`thirst`), Interação (`interaction`) e Treinamento (`training`).
  - Estados: Ativo, Faminto, Triste (`sad`), Irritado (`angry`), Fugitivo (`ran_away`) ou Morto (`dead`).
- **Níveis de Relacionamento (`RELATIONSHIP_LEVELS`)**:
  - Níveis 1 a 5 (Selvagem, Doméstico, Companheiro, Aliado Fiel, Melhor Amigo).
  - Determina a duração das barras (de 12h a 24h) e o tempo de espera antes de fugir ou morrer.
- **Minigame Matemático de Treinamento**:
  - O treino dispara 3 perguntas de matemática adaptadas ao nível do animal.
  - A comida predileta do pet só é consumida se o jogador acertar **todas as 3 questões**.
  - O aumento de nível desbloqueia habilidades de batalha (`trainingHabilities`).
- **Equipamentos do Rancho**:
  - Cocho de comida, Bebedouro (`water_trough`), Feno (`hay`) e Bomba d'Água (`water_pump`).
  - A Bomba d'Água restaura o bebedouro para 100%.
  - Licença do Rancho disponível na Loja e oculta automaticamente após comprada.
- **Pets em Batalha**: Pets podem ser equipados para conceder bônus e receber XP em missões.

---

## 7. Mochila e Inventário Inteligente (`src/lib/inventorySlots.ts`)

- **Controle de Capacidade Real**: A mochila calcula os slots disponíveis para o aluno e bloqueia slots excedentes com cadeado visual.
- **Sincronia entre Guias**: Ao filtrar por Armas, Armaduras, Consumíveis ou Acessórios, os itens bloqueados mantêm fidelidade à sua posição real na grade geral (`realSlotIndex`).
- **Expansão de Espaço**: Consumíveis com efeito `inventory_space` ampliam a quantidade de slots utilizáveis da mochila.
- **Prevenção de Perdas**: Bloqueia recebimento de novos itens quando a mochila estiver no limite máximo de capacidade.

---

## 8. Forja, Transmutação e Modelos 3D (`src/lib/forge.ts` & `BlacksmithView.tsx`)

- **Preservação PBR (`keepMetal`)**: Configuração individual no item que preserva a reflexão e textura metálica original do modelo GLB sem aplicar a película opaca da forja.
- **Resolução Híbrida de Materiais**: As receitas de forja e transmutação aceitam materiais tanto pelo ID quanto pelo **nome normalizado** (ex: "Carvão", "Ferro"), garantindo total compatibilidade entre diferentes escolas.
- **Efeitos Visuais de Forja**:
  - Níveis +1 a +9 com emissivo progressivo.
  - Níveis +7, +8 e +9 exibem *glint* deslizante e partículas estreladas (*sparkles*).
- **Transmutação**: Converte equipamentos +9 de alunos com patente ≥ 11 em itens lendários.

---

## 9. Estúdio de Poses e Animações (`src/components/PoseStudioModal.tsx`)

- **Modo Estático**: Edição de rotações e translações de ossos e salvamento de pose em 1 frame.
- **Modo Animação Multi-Frame**: Criação de ações dinâmicas com até 100 frames, ajuste de taxa de quadros (FPS) e pré-visualização contínua.
- **Associação a Itens e Estados**: Vinculação de animações customizadas a itens específicos e estados do personagem (idle, walk, attack, hurt, victory).

---

## 10. Inteligência Artificial (Groq)

- **`lib/aiConfig.ts`**: Configuração centralizada de chaves e modelos (`qwen/qwen-2.5-32b`, `compound-mini`).
- **`lib/monsterAiBiography.ts`**:
  - Geração de biografias em 3 parágrafos adaptadas ao contexto pedagógico.
  - Geração de falas situacionais em JSON estrito para cada faixa de HP (`hp100_80`, `hp79_50`, `hp49_25`, `hp24_0`, `defeat`).
- **`lib/questAi.ts`**: Geração de lore e narrativa introdutória para missões.

---

## 11. Diretrizes de Qualidade e Boas Práticas de Código

1. **Nunca Excluir Declarações Sem Certeza**:
   - Variáveis, referências (`ref`) e constantes de arquitetura (como as da Fase B, eventos 3D e enums de relacionamento) **não devem ser apagadas**.
   - Se dispararem o aviso `ts(6133)` ("valor nunca é lido"), devem ser utilizadas na lógica ou anotadas com `// @ts-ignore` ou prefixo `_` (em parâmetros).
2. **Validação Obrigatória de Build**:
   - Sempre executar `npm run build` após alterações substanciais para garantir integridade dos bundles e ausência de quebras de compilação.
3. **Deploy Controlado**:
   - Somente realizar `git commit` e `git push` sob comando expresso do usuário.