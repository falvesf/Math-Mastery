# 🔨 A Forja - Reformulada!

Realizei a reestruturação arquitetural completa que você solicitou. A Forja agora é uma tela principal (aba) do jogo, separando visualmente o processo de Forja e o de Transmutação, corrigindo os bugs de exibição de itens e refinando o modelo 3D.

## O que foi alterado:

### 1. Novo Componente: `BlacksmithView`
- O antigo `BlacksmithModal` foi renomeado e refatorado para `BlacksmithView.tsx`.
- Removi toda a camada escura, botão "X" e o tamanho fixo de pop-up. Ele agora preenche a tela inteira do jogo igual à Loja ou aba de Missões.
- Foi integrado no `Dashboard.tsx` como a aba ativa `activeTab === 'forge'`, adicionando um novo botão "A Forja" tanto no menu lateral de desktop quanto no menu inferior de mobile.

### 2. O Erro da Mochila Vazia (Corrigido)
- Descobri por que seus itens não estavam aparecendo! O sistema verificava se `item.itemData.type === 'equipment'`, mas nos registros antigos do seu banco de dados, os equipamentos usavam a chave `itemType: 'equippable'`. Adicionei o suporte a essa regra antiga e agora todos os seus equipamentos elegíveis vão encher a lista lateral imediatamente!

### 3. Ajuste do Sketchfab
- Removi a opção `transparent: 1` que injetava um fundo branco/invisível por trás do ferreiro. 
- Agora, a "Forja" terá o fundo oficial (cinza escuro da sala) embutido no modelo original.

### 4. Nova Tela de Transmutação (4 Slots)
- Ao clicar na aba **Transmutação**, o modelo 3D do ferreiro é **escondido** (já que são funções diferentes).
- Em seu lugar, criei o **Altar de Transmutação**, apresentando um layout com **4 slots** dispostos em um formato circular/místico:
  - 1 Slot Central maior (reservado para receber o equipamento +9).
  - 3 Slots periféricos (Top, Bottom-Left, Bottom-Right) desenhados pontilhados para os futuros "ingredientes".
- O botão "INICIAR RITUAL" já está logo abaixo desse novo Altar.

Pode recarregar o jogo, abrir a aba "A Forja" pela barra lateral, e me dizer o que achou da nova disposição visual! 🚀
