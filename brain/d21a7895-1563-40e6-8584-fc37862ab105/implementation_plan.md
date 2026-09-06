# Implementação: Sistema de Forja e Transmutação

Este documento detalha o plano de implementação para o novo sistema de Forja, Transmutação, regras de inventário e limites de Adds.

## User Review Required

Por favor, revise os pontos abaixo e confirme se a abordagem atende à sua visão.
> [!IMPORTANT]
> **1. Patente "Prata Elite"**: No sistema atual, as patentes padrão são "Prata I", "Prata II" e "Prata III". Você mencionou "Prata Elite" para o limite de Adds. Devemos considerar "Prata Elite" como sendo a patente "Prata III" ou você adicionou "Prata Elite" customizada no seu banco de dados?
> **2. Valores Padrão**: Como a configuração das porcentagens e custos será manual por item (no painel Admin), precisaremos de valores padrão para facilitar a criação? (ex: +1 custa 100 moedas e tem 90% de chance, etc).
> **3. Itens Comprados**: Você mencionou "Os itens comprados na loja seriam todos +0". Isso significa que qualquer item que caia de baús de missão também deve começar no +0? Sim, todo item novo entrará como +0.
> **4. Falha na Transmutação**: "Se falhar, o item que foi utilizado para a transmutação perderá um nível". Isso significa que um item +9 que falha na transmutação volta a ser +8, certo? E qual é a chance de sucesso da transmutação? Ela será 100% ou também precisará ser configurada no painel admin?

## Proposed Changes

### 1. Atualização de Interfaces e Banco (Types)
- **`UserItem`**: Adicionar a propriedade `forgeLevel?: number` (padrão 0) em todos os arquivos que definem `UserItem`.
- **`StoreItem`**: Adicionar as propriedades de configuração:
  - `isForgeable`: boolean.
  - `forgeConfig`: Custos de moeda, taxas de sucesso, itens necessários e multiplicadores de atributos para os níveis 0 a 9.
  - `isTransmutable`: boolean.
  - `transmuteConfig`: ID do item resultado, lista de itens materiais exigidos, e (se aplicável) taxa de sucesso da transmutação.

### 2. Lógica de Capacidade da Mochila e Adds
#### [MODIFY] `src/components/StudentInventory.tsx`, `src/components/StudentStore.tsx`, `src/lib/bazar.ts`
- Alterar o tamanho base da mochila de 6 para **12**.
- Alterar o bônus de Fortitude de `Math.floor(fortitude / 4)` para `Math.floor(fortitude / 1)` (1 slot por ponto de fortitude).

#### [MODIFY] `src/components/AdminStoreManager.tsx` e `src/lib/gacha.ts`
- Aplicar a restrição de Adds: itens que exigem patente até "Prata Elite" (ou equivalente) só poderão receber no máximo **2 Adds**. Itens de patentes superiores poderão receber mais.

### 3. Painel Admin (Configuração de Forja e Transmutação)
#### [MODIFY] `src/components/AdminStoreManager.tsx`
- Na tela de edição de itens equipáveis, adicionar uma nova seção "Configurações de Forja".
  - Tabela/Inputs para preencher as chances de sucesso, custo em moedas e materiais necessários para ir do +1 ao +9.
  - Campos para definir qual é a força/status do item em cada nível.
- Adicionar uma seção "Configuração de Transmutação".
  - Checkbox "Item Transmutável (requer +9)".
  - Seleção dos 2 itens materiais consumíveis necessários.
  - Seleção do Item Resultado (que o jogador receberá no nível +0).

### 4. Interface do Aluno (Ferreiro)
#### [MODIFY] `src/pages/Dashboard.tsx`
- Adicionar um novo botão "Ferreiro / Forja" no menu de abas principal.
- Esse botão só estará clicável se o aluno for patente "Prata I" ou superior. Caso contrário, exibirá um ícone de cadeado.

#### [NEW] `src/components/BlacksmithModal.tsx`
- Modal que conterá as abas **Forja** e **Transmutação**.
- **Aba Transmutação**: Oculta/bloqueada até o rank **Diamante I**.
- **Mochila Integrada**: O modal renderizará uma versão compacta da mochila do aluno na parte inferior, permitindo arrastar os itens (Drag and Drop).
- **Aba Forja**:
  - Renderiza o `iframe` do Sketchfab do ferreiro 3D.
  - Balões de fala flutuantes gerados aleatoriamente (ex: "Traga-me minérios e farei milagres!").
  - 1 Slot central para o equipamento base.
  - Exibição das estatísticas: "Chance de Sucesso: X%", "Custo: Y moedas", "Materiais: [lista]".
  - Botão "Forjar". Em caso de sucesso, o item ganha +1 `forgeLevel`. Em caso de falha, o item é **destruído** (deletado).
- **Aba Transmutação**:
  - Layout com Slot Esquerdo (Equipamento +9), 2 Slots Direitos (Materiais) e Slot Superior Central (Resultado).
  - Animação de sucesso/falha ao clicar em "Transmutar".
  - Se falhar, o equipamento no slot esquerdo cai para +8 e os materiais da direita são destruídos.

### 5. Visuais de Aura e Tooltip
#### [MODIFY] `src/components/ItemTooltip.tsx`
- Exibir o nível da forja ao lado do nome do item (ex: `Espada Longa +7`).
- Calcular e exibir os atributos reais do item baseados no seu `forgeLevel`.

#### [MODIFY] `src/components/AvatarCharacter.tsx`
- Identificar se algum item equipado possui `forgeLevel >= 7`.
- Se sim, injetar uma animação CSS de brilho/aura intensa ao redor do slot do equipamento ou do próprio avatar, simbolizando alto nível de forja.

## Verification Plan
1. Criar um item teste e configurar seus status de forja e transmutação pelo painel Admin.
2. Comprar o item (ele deve vir no nível +0).
3. Testar a mecânica de Forja, simulando acertos (subindo de nível até o +7 para checar a Aura) e falhas (checando se o item quebra).
4. Subir o item até o +9 e testar a Transmutação com sucesso e falha.
5. Garantir que a capacidade da mochila inicie em 12 e escale +1 por cada ponto de fortitude.
