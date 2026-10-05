# Documentação Técnica: Math-Mastery

> **Versão do Sistema:** 2.0 (Fase B — Outubro de 2026)  
> **Status:** Produção / Multi-tenant Educacional Gamificado

---

## 1. Visão Geral do Sistema

O **Math-Mastery** é uma plataforma educacional gamificada de alto desempenho desenvolvida em **React 19**, projetada para transformar o aprendizado de matemática em uma experiência imersiva de RPG. 

O sistema integra:
- **Missões Matemáticas (Quests & Live Quests)** com combate RPG por turnos contra monstros.
- **Cenários 3D Exploráveis (Map Explorer)** com navegação em 1ª/3ª pessoa, portas com enigmas matemáticos, mineração de blocos com picareta e baús de tesouro.
- **Arena de Batalha 3D Unificada** onde jogador e monstros duelam na mesma cena Three.js com suporte a itens forjados, efeitos elementais e HUD billboard 3D.
- **Rancho 3D & Sistema de Pets** com ciclo de vida, alimentação, minigames matemáticos de treinamento e benefícios em combate.
- **Personalização de Avatares Voxel/GLB** com guarda-roupa completo, poses customizadas e estúdio de animação.
- **Economia Completa**: Loja escolar, Bazar entre alunos, Forja e Transmutação de equipamentos, Sistema de Gacha e Ranks de Patente.
- **Arquitetura Multi-tenant**: Isolamento estrito de escolas, turmas e dados via Supabase PostgreSQL com Row Level Security (RLS).

---

## 2. Stack Tecnológica

| Camada | Tecnologias Utilizadas |
| :--- | :--- |
| **Frontend Framework** | React 19 + TypeScript (strict mode) |
| **Build & Bundler** | Vite 8 + Rolldown/Rollup |
| **Roteamento** | `react-router-dom` v7 |
| **Renderização 3D** | Three.js (0.156 integrado via `skinview3d` para Arena, Cenários e Rancho; 0.185 para utilitários e viewers complementares) |
| **Backend & Banco de Dados** | Supabase (PostgreSQL 15+, Auth, Realtime, Storage, RPCs) |
| **Inteligência Artificial** | Groq API (`qwen/qwen-2.5-32b`, `compound-mini`) para biografias, falas de monstros e lore de missões |
| **Estilização** | CSS Nativo modular com temas dinâmicos via propriedades customizadas no `:root` (`App.css`, `index.css`) |
| **Qualidade & Linting** | TypeScript (`tsc`), Oxlint |
| **Mobile & PWA** | Suporte a PWA com Service Worker dedicado a cache inteligente de assets multimídia |

---

## 3. Arquitetura e Contextos Principais

A raiz da aplicação (`src/App.tsx`) encapsula os provedores que sustentam o estado global:

1. **`AuthProvider` (`src/contexts/AuthContext.tsx`)**:
   - Controle de sessão Supabase, login local por matrícula ou credenciais.
   - Perfil de usuário em tempo real (`UserData`: moedas, XP, vida, patente, avatarConfig).
   - Presença online e rastreamento de atividade.
   - Suporte a impersonation (`startImpersonation`/`exitImpersonation`) para coordenadores e suporte pedagógico.
   - Alternância rápida para visão do aluno (`toggleStudentView`).

2. **`TenantProvider` (`src/contexts/TenantContext.tsx`)**:
   - Gerencia a identificação e isolamento por escola/inquilino (`tenantId`).
   - Criação automática de turmas e dados padrão no provisionamento de uma nova escola.
   - Filtros de banco baseados em `tenant_id` em consultas e operações críticas.

3. **`DialogProvider` (`src/contexts/DialogContext.tsx`)**:
   - Diálogos globais baseados em Promises (`showAlert`, `showConfirm`, `showConfirmWithCheckbox`, `showPrompt`, `showToast`).

---

## 4. Módulos e Sistemas Funcionais

### 4.1. Cenários 3D e Exploração (`MapExplorerPoC.tsx` & `AdminScenarioManager.tsx`)
- **Exploração Tridimensional**: Navegação em 1ª e 3ª pessoa com controles de teclado, mouse e joysticks virtuais para dispositivos móveis (`MapVirtualControls.tsx`).
- **Portas com Enigmas Matemáticos**: Portais que barram o caminho do jogador até que ele resolva corretamente perguntas configuradas na missão.
- **Monstros do Mapa & Combate Dinâmico**:
  - Monstros perambulam pelo mapa com IA de patrulha e detecção de proximidade (aggro).
  - Ao entrar em combate, o monstro reage em tempo real.
  - **Animação de Esquiva 3D**: Quando o monstro desvia de um ataque, ele executa uma animação de recuo/desvio procedural em 3D, superando simples rótulos visuais.
  - **Falas Estritas dos Monstros**: Se o monstro não possuir falas customizadas cadastradas no `MonsterAttributesEditor`, ele permanece em silêncio (sem exibição de balões ou falas genéricas de fallback).
- **Baús de Tesouro 3D**:
  - **Escala Configurável**: Suporte a redimensionamento do baú de 10% até 500% via `chestScale` nos editores administrativos.
  - **Modelos GLB Duplos**: Compatibilidade tanto com baús de animação contínua quanto baús com duas malhas lado a lado no mesmo GLB (fechado inicial / aberto após interação).
  - **Sistema de Trancas e Chaves**: Baús podem ser marcados como trancados (`isLocked: true`). A chave necessária é sorteada e vinculada dinamicamente a monstros comuns do mapa (nunca ao Boss).
  - **Feedback Imediato**: Tentativas de abrir um baú trancado exibem a notificação: `"Trancado. Necessita de uma chave."`.
- **Mineração e Quebra de Blocos**: Interação de mineração com picareta em blocos destrutíveis, coletando moedas e materiais.
- **Drops Confiáveis**: Toda coleta de baú ou monstro grava a carga completa do item do catálogo `store_items`, eliminando problemas de "Item Desconhecido".

---

### 4.2. Arena de Batalha 3D Unificada (`VoxelArena3D.tsx` & `QuestGameplayMobile.tsx`)
- **Cena 3D Unificada (Fase B)**: Jogador e monstros coexistem no mesmo espaço de coordenadas Three.js sob iluminação e sombras integradas.
- **Avatar Nativo Integrado**: O jogador é renderizado através do objeto do `skinview3d` diretamente na cena da arena, garantindo compatibilidade com expressões, tinturas, capas e acessórios.
- **HUD 3D Billboard**:
  - Nomes flutuantes que acompanham a cabeça das entidades independentemente da altura do modelo (`monsterHeadTopRef`).
  - Corações tridimensionais fieis ao design 2D (caminho SVG Lucide Heart, preenchimento parcial proporcional em frações e quebra em linhas de 6).
  - Barras de status (veneno, fogo, eletricidade, gelo, sangramento) com contadores regressivos em tempo real.
- **Efeitos de Combate e Estresse**:
  - Gotas de suor animadas quando o nível de estresse ultrapassa os limiares configurados.
  - Sangramento com gotas físicas e acúmulo de hematomas (`bruises`) mapeados nos ossos do modelo 3D.
  - Expressões faciais reativas (`serious`, `sad`, `normal`) de acordo com a pressão da batalha.
- **Efeitos Elementais**:
  - Congelamento com 5 cubos de gelo geométricos, poça de degelo e estilhaçamento (`iceBreakTick`).
  - Fogo com derretimento de altura de modelo e tint emissivo.
  - Transformação em animais (Sapo, Coelho, Porco, Rato) com regras de combate adaptadas (`transformEffects.ts`).
- **Fuga Parametrizada**: Monstros podem fugir com base na tabela de probabilidade por corações restantes (`fleeChanceTable`), dispensando animação de derrota.

---

### 4.3. Rancho 3D & Sistema de Pets (`Ranch3D.tsx`, `RanchModal.tsx`, `pets.ts`)
- **Cenário do Rancho 3D**: Renderização do cercado, bebedouro de água, cochos de alimentação e fardos de feno com órbita suave de câmera e seleção de animais por clique no espaço tridimensional.
- **Ciclo de Vida e Estados Emocionais**:
  - Pets possuem 4 atributos de manutenção: Fome (`hunger`), Sede (`thirst`), Interação (`interaction`) e Treinamento (`training`).
  - Podem assumir estados: Saudável, Triste (`sad`), Irritado (`angry`), Fugitivo (`ran_away`) ou Morto (`dead`).
- **Níveis de Relacionamento (`RELATIONSHIP_LEVELS`)**:
  - Do nível 1 (Selvagem) ao 5 (Melhor Amigo).
  - Cada nível amplia a duração das barras (de 12h até 24h) e o tempo de tolerância antes de fugir ou morrer.
- **Mini-Desafio Matemático de Treinamento**:
  - Treinar o animal dispara um minigame com 3 questões matemáticas adaptadas ao nível do pet (adição, subtração e multiplicação).
  - A comida predileta do animal é consumida **apenas se o jogador acertar todas as 3 perguntas**.
  - O treinamento desbloqueia habilidades passivas de combate (`trainingHabilities`).
- **Equipamentos e Manutenção do Rancho**:
  - Instalação e melhoria de Cocho de Comida, Bebedouro (`water_trough`), Feno (`hay`) e Bomba d'Água (`water_pump`).
  - A Bomba d'Água reabastece o bebedouro para 100% de capacidade.
  - Licença do Rancho disponível na Loja e ocultada automaticamente após a aquisição.
- **Pets em Combate**: Animais domesticados podem ser equipados para acompanhar o jogador nas missões, concedendo bônus e acumulando XP.

---

### 4.4. Mochila e Inventário Inteligente (`StudentInventory.tsx`, `inventorySlots.ts`)
- **Capacidade e Slots Bloqueados**: O inventário calcula dinamicamente a capacidade máxima de itens do aluno. Slots excedentes exibem cadeado visual de bloqueio.
- **Navegação Consistente em Guias**: As guias de categorias (Todos, Armas, Armaduras, Acessórios, Consumíveis) exibem visualização limpa mantendo a sincronia de bloqueio através do índice real (`realSlotIndex`).
- **Expansão de Espaço**: Consumíveis com efeito `inventory_space` concedem aumento temporário ou definitivo da capacidade da mochila.
- **Proteção de Drop**: Bloqueio de recebimento de itens excedentes com aviso explícito de mochila lotada, impedindo perdas involuntárias.

---

### 4.5. Forja, Transmutação e Modelos 3D (`BlacksmithView.tsx`, `forge.ts`, `itemTransforms.ts`)
- **Progressão de Equipamentos**: Melhoria de itens de +0 a +9 com cálculo de custo exponencial, materiais requeridos e probabilidade de sucesso (90% no início a 10% no nível máximo).
- **Preservação de PBR (`keepMetal`)**: Flag individual no editor de itens que preserva o material metálico e reflexivo original do modelo GLB sem aplicar a película opaca da forja.
- **Resolução de Materiais Híbrida**: A receita da forja busca materiais tanto por `item_id` quanto por nome normalizado (ex: "Carvão"), garantindo que escolas diferentes compartilhem receitas de forja perfeitamente.
- **Efeitos Visuais de Forja**:
  - Níveis superiores ganham iluminação emissiva personalizada.
  - Níveis +7, +8 e +9 emitem glint reflexivo dinâmico e partículas estreladas (`sparkles`).
- **Transmutação**: Disponível para itens no nível +9 e alunos com patente mínima 11, permitindo converter o item em relíquias de nível superior.

---

### 4.6. Estúdio de Poses e Animações (`PoseStudioModal.tsx`)
- **Captura de Poses**: Edição de rotações e translações de ossos em tempo real com exportação de pose estática (1 frame).
- **Animações Multi-Frame**: Criação de sequências animadas completas com até 100 frames, ajuste de FPS e interpolação de posições.
- **Associação a Ações e Itens**: Vinculação de animações customizadas a estados específicos do jogador (idle, andar, golpear, comemorar).

---

## 5. Estrutura de Diretórios Atualizada

```
src/
├── components/          # 87 componentes modulares
│   ├── Admin3DModelsManager.tsx    # Gerenciador de GLBs, escalas e animações
│   ├── AdminScenarioManager.tsx    # Editor de cenários, tilesets, spawns e baús
│   ├── AvatarCharacter.tsx         # Renderizador do avatar (Three.js/skinview3d)
│   ├── BlacksmithView.tsx          # Interface de Forja e Transmutação
│   ├── MapExplorerPoC.tsx          # Cenário 3D explorável em tempo real
│   ├── MonsterAttacksEditor.tsx    # Editor de golpes e IA tática de monstros
│   ├── MonsterAttributesEditor.tsx # Editor de stats, falas e drops de monstros
│   ├── PoseStudioModal.tsx         # Estúdio de poses e animações 3D
│   ├── Ranch3D.tsx                 # Visualizador 3D do rancho de pets
│   ├── RanchModal.tsx              # Gestor completo do rancho e animais
│   ├── StudentInventory.tsx        # Inventário do aluno com slots bloqueados
│   ├── StudentStore.tsx            # Loja com gacha e descontos pedagógicos
│   └── VoxelArena3D.tsx            # Arena 3D de combate unificada
├── contexts/            # Provedores de estado global
│   ├── AuthContext.tsx             # Autenticação, sessão e perfil
│   ├── DialogContext.tsx           # Modais e diálogos baseados em Promises
│   └── TenantContext.tsx           # Isolamento multi-tenant por escola
├── lib/                 # 55 bibliotecas de lógica de negócios
│   ├── aiConfig.ts                 # Configuração dos modelos Groq
│   ├── audioBank.ts                # Banco de efeitos sonoros Web Audio
│   ├── combatDamage.ts             # Cálculos de dano, evasão, crítico e rankings
│   ├── forge.ts                    # Regras e tabelas de probabilidade da forja
│   ├── inventorySlots.ts           # Lógica de capacidade e slots de mochila
│   ├── monsterAttacks.ts           # IA de seleção de golpes e efeitos de monstros
│   ├── pets.ts                     # Regras do rancho, ciclo de vida e relacionamentos
│   ├── pvp.ts                      # Sistema de duelos PvP, apostas e espectadores
│   ├── ranks.ts                    # Sistema de patentes e requisitos de XP
│   └── supabase.ts                 # Cliente Supabase e configurações de fetch
└── pages/               # Telas e rotas principais
    ├── AdminDashboard.tsx          # Painel do Professor / Administrador
    ├── Dashboard.tsx               # Painel Principal do Aluno
    ├── LiveQuestAdmin.tsx          # Condução de missões ao vivo pelo professor
    ├── LiveQuestStudent.tsx        # Participação do aluno em missões ao vivo
    ├── PvpPage.tsx                 # Arena de duelos entre alunos
    └── QuestGameplayMobile.tsx     # Página canônica de combate e missões
```

---

## 6. Governança de Código e Limpeza TypeScript

O projeto adota regras estritas de tipagem (`noUnusedLocals: true`, `noUnusedParameters: true`) no `tsconfig.app.json`. 

### Diretrizes de Manutenção:
1. **Preservação Arquitetural**: Nenhuma variável, parâmetro ou referência (`ref`) estruturada para expansões futuras (como entidades unificadas da Fase B, coordenadas de eventos ou enums de relacionamento) deve ser deletada sumariamente.
2. **Tratamento de TS6133 ("declarado, mas nunca lido")**:
   - Para callbacks de eventos (`onUp`, `onDown`), utilizar os parâmetros diretamente para enriquecer a precisão das coordenadas ou adotar convenção de underscore (`_e`).
   - Para referências e constantes preparadas para recursos em evolução, aplicar `// @ts-ignore` imediatamente acima da declaração, mantendo a documentação do código limpa e sem falhas no compilador.
   - Para parâmetros opcionais de retrocompatibilidade de RPC/API, utilizar prefixo com underscore (`_tenantId`).

### Validação Contínua:
- Build de validação obrigatório: `npm run build`
- Typecheck estrutural: `npx tsc -b --noEmit`
- Linter rápido: `npm run lint`
