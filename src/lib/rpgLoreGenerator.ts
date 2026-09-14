/**
 * Gerador de Lore Procedural de RPG para Itens e Equipamentos
 * Produz descrições ultracurtas e suscintas (entre 5 e 10 palavras),
 * perfeitas para não quebrar o layout dos tooltips no inventário e na loja.
 * 
 * Exemplos de referência:
 * - "Uma espada afiada e perigosa."
 * - "Um martelo forjado nas profundezas de uma masmorra esquecida."
 * - "Espada imbuída no veneno de uma serpente mortal."
 * - "Um material muito raro para forjar armas supremas."
 */

export interface ItemLoreParams {
  title: string;
  rarity?: string;
  itemCategory?: string;
  avatarPart?: string;
  damageEffect?: string;
  baseAttributeType?: string;
  baseAttributeValue?: number;
  gameEffect?: string;
}

export function generateProceduralItemLore(params: ItemLoreParams): string {
  const title = (params.title || '').trim();
  const lowerTitle = title.toLowerCase();
  const lowerEffect = (params.damageEffect || '').toLowerCase();
  const lowerCat = (params.itemCategory || '').toLowerCase();

  // 1. Materiais e Minérios (ex: Barra de Netherite, Pó de Redstone, Fragmento)
  if (
    lowerCat.includes('material') ||
    lowerCat.includes('other') ||
    lowerTitle.includes('barra') ||
    lowerTitle.includes('lingote') ||
    lowerTitle.includes('minério') ||
    lowerTitle.includes('minerio') ||
    lowerTitle.includes('cristal') ||
    lowerTitle.includes('fragmento') ||
    lowerTitle.includes('pó') ||
    lowerTitle.includes('po de') ||
    lowerTitle.includes('gema') ||
    lowerTitle.includes('pedra')
  ) {
    const materialLores = [
      'Um material muito raro para forjar armas supremas.',
      'Minério nobre altamente cobiçado por mestres ferreiros.',
      'Componente místico essencial para forja e aprimoramento.',
      'Material ancestral extraído das profundezas de masmorras antigas.',
      'Matéria-prima lendária que canaliza poderes elementais puros.',
      'Minério refinado com densidade e resistência incomparáveis.'
    ];
    return materialLores[Math.floor(Math.random() * materialLores.length)];
  }

  // 2. Martelos e Maças (Mace, Martelo)
  if (lowerTitle.includes('mace') || lowerTitle.includes('martelo') || lowerTitle.includes('marreta')) {
    const maceLores = [
      'Um martelo forjado nas profundezas de uma masmorra esquecida.',
      'Arma pesada capaz de esmagar armaduras resistentes.',
      'Martelo colossal que causa impactos sísmicos devastadores.',
      'Forjado em aço bruto para desferir golpes avassaladores.'
    ];
    return maceLores[Math.floor(Math.random() * maceLores.length)];
  }

  // 3. Machados
  if (lowerTitle.includes('machado') || lowerTitle.includes('axe')) {
    const axeLores = [
      'Machado de batalha equilibrado para combates implacáveis.',
      'Lâmina pesada talhada para rachar escudos resistentes.',
      'Machado de guerra forjado com aço temperado em brasas.',
      'Arma brutal capaz de decapitar inimigos com facilidade.'
    ];
    return axeLores[Math.floor(Math.random() * axeLores.length)];
  }

  // 4. Arcos e Armas de Longo Alcance
  if (lowerTitle.includes('arco') || lowerTitle.includes('bow') || lowerTitle.includes('besta')) {
    const bowLores = [
      'Arco flexível talhado na madeira de árvores ancestrais.',
      'Dispara flechas velozes com precisão mortal a distância.',
      'Arma de precisão afinada para atingir pontos vitais.',
      'Arco encantado que corta o ar com silêncio letal.'
    ];
    return bowLores[Math.floor(Math.random() * bowLores.length)];
  }

  // 5. Armaduras, Escudos, Capacetes e Calçados
  if (
    lowerCat.includes('armor') ||
    lowerTitle.includes('armadura') ||
    lowerTitle.includes('peitoral') ||
    lowerTitle.includes('escudo') ||
    lowerTitle.includes('capacete') ||
    lowerTitle.includes('elmo') ||
    lowerTitle.includes('bota') ||
    lowerTitle.includes('calça') ||
    lowerTitle.includes('cintura')
  ) {
    if (lowerTitle.includes('escudo') || lowerTitle.includes('shield')) {
      const shieldLores = [
        'Escudo resistente capaz de suportar investidas colossais.',
        'Barreira sólida forjada para repelir ataques hostis.',
        'Escudo ancestral que protege contra impactos mortais.'
      ];
      return shieldLores[Math.floor(Math.random() * shieldLores.length)];
    }
    const armorLores = [
      'Forjada com ligas reforçadas para proteção em combate.',
      'Armadura robusta temperada para suportar golpes pesados.',
      'Equipamento sólido que reduz o impacto de ataques fatais.',
      'Forjada para resistir às masmorras mais inóspitas.'
    ];
    return armorLores[Math.floor(Math.random() * armorLores.length)];
  }

  // 6. Elementais específicos (Veneno, Fogo, Gelo, Raio, Trevas, Sagrado)
  if (
    lowerEffect.includes('poison') ||
    lowerTitle.includes('venen') ||
    lowerTitle.includes('serpente') ||
    lowerTitle.includes('tóx')
  ) {
    const poisonLores = [
      'Espada imbuída no veneno de uma serpente mortal.',
      'Lâmina banhada em toxinas letais das profundezas.',
      'Arma peçonhenta que drena o vigor do adversário.',
      'Lâmina corrosiva que debilita qualquer criatura viva.'
    ];
    return poisonLores[Math.floor(Math.random() * poisonLores.length)];
  }

  if (
    lowerEffect.includes('fire') ||
    lowerTitle.includes('fogo') ||
    lowerTitle.includes('flam') ||
    lowerTitle.includes('bras') ||
    lowerTitle.includes('inferno') ||
    lowerTitle.includes('ruby')
  ) {
    const fireLores = [
      'Lâmina em brasa forjada em fornalhas vulcânicas.',
      'Arma ardente que queima os inimigos ao menor contato.',
      'Lâmina incandescente que corta com chamas vorazes.',
      'Forjada no calor eterno de brasas primordiais.'
    ];
    return fireLores[Math.floor(Math.random() * fireLores.length)];
  }

  if (
    lowerEffect.includes('ice') ||
    lowerTitle.includes('gelo') ||
    lowerTitle.includes('neve') ||
    lowerTitle.includes('geada') ||
    lowerTitle.includes('boreal')
  ) {
    const iceLores = [
      'Lâmina gélida lapidada em geleiras eternas.',
      'Arma congelante com o rigor do vento boreal.',
      'Forjada em gelo místico que nunca derrete.',
      'Toque congelante capaz de entorpecer qualquer oponente.'
    ];
    return iceLores[Math.floor(Math.random() * iceLores.length)];
  }

  if (
    lowerEffect.includes('lightn') ||
    lowerTitle.includes('raio') ||
    lowerTitle.includes('trov') ||
    lowerTitle.includes('elétr') ||
    lowerTitle.includes('tempestade')
  ) {
    const lightningLores = [
      'Arma eletrizante que estala com faíscas azuis.',
      'Lâmina veloz carregada com o poder do trovão.',
      'Forjada sob tempestades elétricas de imenso poder.',
      'Golpeia com a velocidade implacável de um raio.'
    ];
    return lightningLores[Math.floor(Math.random() * lightningLores.length)];
  }

  if (
    lowerEffect.includes('shadow') ||
    lowerTitle.includes('sombra') ||
    lowerTitle.includes('trev') ||
    lowerTitle.includes('abissal') ||
    lowerTitle.includes('vazio')
  ) {
    const shadowLores = [
      'Arma sombria forjada no silêncio do abismo.',
      'Lâmina envolta em penumbra que devora a luz.',
      'Forjada nas trevas para ataques silenciosos e letais.',
      'Canaliza o poder oculto das noites sem luar.'
    ];
    return shadowLores[Math.floor(Math.random() * shadowLores.length)];
  }

  if (
    lowerEffect.includes('holy') ||
    lowerTitle.includes('sagrad') ||
    lowerTitle.includes('luz') ||
    lowerTitle.includes('divin')
  ) {
    const holyLores = [
      'Lâmina sagrada abençoada pela luz divina.',
      'Arma radiante consagrada para purificar o mal.',
      'Forjada com ligas celestiais que repelem trevas.',
      'Emite um brilho sereno de pura justiça.'
    ];
    return holyLores[Math.floor(Math.random() * holyLores.length)];
  }

  // 7. Espadas e Lâminas genéricas / Serrilhadas
  if (lowerTitle.includes('serrilhad')) {
    const serratedLores = [
      'Lâmina serrilhada projetada para dilacerar armaduras com ferocidade.',
      'Espada denteada forjada para causar cortes devastadores.',
      'Arma afiada e cruel de fio serrilhado impiedoso.',
      'Forjada em aço denteado para combates sangrentos.'
    ];
    return serratedLores[Math.floor(Math.random() * serratedLores.length)];
  }

  const defaultSwordLores = [
    'Uma espada afiada e perigosa.',
    'Lâmina veloz forjada com aço ancestral.',
    'Espada equilibrada capaz de cortes precisos e letais.',
    'Forjada nas profundezas de uma masmorra esquecida.',
    'Arma afiada, leve e letal em combate cerrado.',
    'Lâmina reluzente temperada por mestres ferreiros.'
  ];

  return defaultSwordLores[Math.floor(Math.random() * defaultSwordLores.length)];
}
