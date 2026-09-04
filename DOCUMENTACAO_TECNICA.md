# Documentação Técnica: Math-Mastery

## 1. Visão Geral do Sistema
O **Math-Mastery** é uma plataforma educacional gamificada desenvolvida em **React**, projetada para engajar estudantes em atividades matemáticas (Quests, PvP) e recompensá-los com itens virtuais, experiência (XP) e personalização de avatares 3D. O sistema tem suporte a *multitenancy* (múltiplas escolas/inquilinos) e é gerenciado por professores e coordenadores via um painel de administração (Admin Dashboard).

## 2. Stack Tecnológica
- **Framework Frontend**: React 19 + Vite.
- **Roteamento**: `react-router-dom`.
- **Backend & Banco de Dados**: Supabase (PostgreSQL), `firebase-admin`.
- **Renderização 3D**: `@react-three/fiber`, `@react-three/drei`, `three.js`, e `skinview3d`.
- **Estilização**: Arquivos CSS nativos (`App.css`, `index.css`) com suporte a temas dinâmicos via propriedades customizadas no `:root`.
- **Build & Linters**: Vite, TypeScript (`tsc`), Oxlint.

## 3. Arquitetura e Contextos Principais
O aplicativo (`src/App.tsx`) envolve a aplicação em provedores (Providers) que gerenciam estados globais:
- **`AuthProvider` (`src/contexts/AuthContext.tsx`)**: Gerencia o estado de autenticação do usuário, persistência de sessão e dados de perfil (papel/role, UID).
- **`TenantProvider` (`src/contexts/TenantContext.tsx`)**: Responsável por isolar dados para diferentes escolas/ambientes (Multitenancy).
- **`DialogProvider` (`src/contexts/DialogContext.tsx`)**: Controla a exibição de modais e diálogos globais na aplicação.

## 4. Estrutura de Diretórios
- **`src/components/`**: Contém a maioria dos componentes React, desde interfaces de sistema (ex: `Admin3DModelsManager`, `AvatarCustomizationModal`, `StudentStore`) até overlays e itens reutilizáveis (ex: `ItemIcon`, `ChatWidget`).
- **`src/pages/`**: Componentes que representam rotas completas:
  - `LandingPage`: Página inicial de login/registro.
  - `Dashboard`: Área do aluno (Visão do jogador).
  - `AdminDashboard`: Área do professor/admin (Painel Mestre).
  - `LiveQuestAdmin` & `LiveQuestStudent`: Telas para as missões ao vivo (Sessões gamificadas em tempo real).
  - `PvpPage`: Tela de batalha PvP.
- **`src/lib/`**: Lógica de negócios, serviços externos e utilitários globais:
  - `supabase.ts`: Instância e configuração do cliente Supabase.
  - `pvp.ts`, `gacha.ts`, `economy.ts`: Regras de negócio para as batalhas, caixas de loot, e economia.
  - `model3d.ts`, `itemTransforms.ts`: Gerenciamento de entidades 3D e posicionamento.
  - `audioBank.ts`: Gerenciador de efeitos sonoros.

## 5. Fluxos Principais
### 5.1. Acesso e Rotas (`PrivateRoute`)
A navegação é estrita. Alunos acessam o `/dashboard`, professores/staff acessam `/admin`. Usuários que se cadastram recebem papéis temporários (`pending_student` ou `pending_teacher`) até serem aprovados no Admin.

### 5.2. Personalização do Avatar
Realizada no componente `AvatarCustomizationModal.tsx`, utilizando Three.js para renderizar os modelos equipados pelo aluno (`src/lib/equippedItems.ts`). O aluno compra itens na loja (`StudentStore.tsx`) que modifica seu inventário no Supabase.

### 5.3. Sistema de Quests (Missões)
Professores configuram perguntas e desafios usando o `QuestConfigModal.tsx` e iniciam sessões em `LiveQuestAdmin.tsx`. Os alunos acessam as missões em `LiveQuestStudent.tsx` ou `QuestGameplayMobile.tsx`. O avanço fornece XP e Moedas.

## 6. Lógica de Temas
O aplicativo permite customização visual de interface via `user_themes` e `system_collections`. A configuração é injetada globalmente via `src/lib/theme.ts` no evento de carga inicial no `App.tsx`.

## 7. Manutenção
- Para rodar verificações estritas de tipo e garantir estabilidade, deve-se usar: `npx tsc --noEmit -p tsconfig.app.json` e `npx oxlint`.
- Cuidado ao modificar o Supabase Client, pois o multitenancy (isolamento RLS) se baseia pesadamente nas policies do BD.

## 8. Catálogo de Limpeza de TypeScript (Agosto/2026)
Visando limpar logs do compilador TypeScript (`tsc`), algumas remoções precisas e ajustes de interface foram planejados para não afetar as regras de negócio:

### 8.1. Extensão de Interfaces (Evitar perda de propriedades)
Para garantir que dados retornados do Banco de Dados não acusem erro no TypeScript, as interfaces foram expandidas:
- **`EquippedItem`** (`src/components/AvatarCharacter.tsx`): 
  - Adicionado `damageEffect?: string;` (Preserva os efeitos de dano configurados nas missões).
  - Adicionado `battleSoundUrl?: string;` (Preserva o som de batalha personalizado das armas e pets).

### 8.2. Variáveis Declaradas e Nunca Lidas (Remoção Limpa)
Conforme análise (`TS6133`), os seguintes resíduos lógicos sem utilidade foram mapeados para remoção:
- **`STUDENT_BACKUP_ID`** (`src/lib/debugSwap.ts`): Constante de backup de mock não utilizada no ambiente atual.
- **`isSuperAdmin`** (`src/lib/permissions.ts`): Variável declarada durante verificação de super admin mas que não era repassada no retorno do fluxo.
- **`tenantId`** (`src/lib/pvp.ts`): Declarado na linha 185 mas não utilizado pela função interna do cálculo PvP correspondente.
- **`DEFAULT_FANTASY_THEME`** (`src/pages/Dashboard.tsx`): Constante declarada na linha 28, substituída pela lógica atual de `currentTheme`.

### 8.3. Variáveis Funcionais Preservadas (Supressão de Avisos)
Algumas variáveis e hooks foram alertadas pelo TypeScript, mas **foram intencionalmente mantidas** pois estão diretamente ligadas a configurações funcionais do painel administrativo (como sons de monstros e falhas):
- **`coinDoom`, `playMonsterGruntSound`, `playFailSound`** (`src/pages/QuestGameplay.tsx`): Estão ativas e conectadas aos sons e efeitos programados nas missões (como o Som de Ataque e Dano do Monstro Global). Suprimimos apenas o alerta do compilador sem excluir o código.

### 8.3. Resolução de Conflitos e Backups
- O arquivo **`AdminDashboard-FABIO_GAMER.tsx`** foi identificado como desatualizado em relação a **`AdminDashboard.tsx`** (25/08 vs 03/09). Ele foi renomeado para **`AdminDashboard-FABIO_GAMER.tsx.backup`** para preservar o histórico sem gerar falhas de linter em massa durante o build do compilador.
