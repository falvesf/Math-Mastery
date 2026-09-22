# Math-Mastery — Referência Completa do Projeto

> Documento de continuidade para agentes de IA. **Responder sempre em PT-BR.**
> **Regra de deploy: SÓ fazer commit/push quando o usuário pedir explicitamente** ("faça commit", "faça o commit/push", "deploy"). Nunca commitar por conta própria.
> Contexto atual: o projeto está na **Fase B** — cena 3D unificada (jogador + monstro DENTRO do `VoxelArena3D`). O modo 3D agora é o PADRÃO.

---

## 1. Visão geral

- **Nome:** Math-Mastery (projeto pedagógico gamificado de matemática, multi-tenant).
- **Stack:** React 19 + TypeScript + Vite 8, react-router-dom v7, **Supabase** (auth/banco/Storage/Realtime), PWA (Service Worker).
- **Render 3D:** Three.js **0.156 de `skinview3d/node_modules/three`** (bonecos + arena) e `three` 0.185 (viewers R3F). O `@react-three/fiber`/`@react-three/drei` estão no package.json, mas a arena 3D **não** usa R3F — é Three puro com `requestAnimationFrame`.
- **IA:** Groq (`getGrokConfig`) para biografia/falas do monstro e lore de missão.
- **Rotas relevantes:** `/quest/:questId` → `QuestGameplayMobile` (página de combate canônica). **`QuestGameplay.tsx` (desktop) NÃO está mais roteado.**

## 2. Comandos (importantes)

- Build de produção: `node node_modules\vite\bin\vite.js build` (na raiz, `workdir` do projeto).
- Typecheck: `npx tsc --noEmit`.
- Lint: `npm run lint` (oxlint).
- Deploy: `git push origin main` → host (Vercel/Netlify) rebuilda automaticamente. Domínio: `math-mastery.com.br`.
- **PWA/Service Worker:** só cacheia imagens do Supabase/Firebase Storage (não cacheia JS da app). Para testar mudanças no celular: **Ctrl+Shift+R** (hard reload) ou limpar dados do site. Se o usuário testar e "não aparecer", quase sempre é cache — mas verificar se a mudança realmente foi commitada/pushada.

## 3. Estrutura

- `src/pages/` — LandingPage, Dashboard (aluno), AdminDashboard (professor/admin), LiveQuestAdmin, LiveQuestStudent, PvpPage, QuestGameplay (desktop, não roteado), QuestGameplayMobile (principal).
- `src/components/` — 83 componentes (avatars, arena, loja, forja, chat, modais, editores, efeitos).
- `src/lib/` — 48 libs (combate, itens, economia, forja, ranks, IA, áudio, chat, PvP, utilidades).
- `src/contexts/` — AuthContext, TenantContext, DialogContext.
- `src/App.tsx` — rotas e providers. `src/index.css` — 2912 linhas (variáveis `--gold-primary:#fbbf24`, `.glass-panel`, animações de combate, etc.).

---

## 4. Contextos (src/contexts)

- **AuthContext** (`AuthContext.tsx`): `UserRole`, `UserData` (perfil: uid, name, role, xp, coins, hp, rank, avatarConfig, etc.), `fetchUserData` (cria usuário se não existir; promoção superadmin por email `fabio.feitoza@eaportal.org`), Realtime de `users`, presença online, `startImpersonation`/`exitImpersonation` (modo suporte), `toggleStudentView`.
- **TenantContext** (`TenantContext.tsx`): multi-escola. `Tenant`, `switchTenant`, `createTenant` (cria turmas padrão), `isSuperAdmin`, `tenantId`. Dados isolados por `tenant_id`.
- **DialogContext** (`DialogContext.tsx`): `showAlert`, `showConfirm`, `showConfirmWithCheckbox`, `showPrompt`, `showToast` (baseados em Promise).

## 5. Supabase (src/lib/supabase.ts)

- URL: `https://irpmeockteksidxnpznb.supabase.co`; chave anon hardcoded; `global.fetch` com `cache:'no-store'`.
- **Tabelas:** `users`, `tenants`, `tenant_users`, `classes`, `quests`, `quest_attempts`, `live_quests`, `user_items`, `store_items`, `system_collections` (settings/economy/rankings/arena_debug/ai_config/player_battle_quotes/forge_sounds/gradebook/teacher_visit/blacksmith_achievements/spectate_rewards/quest_damage_rankings), `preset_skins`, `3d_models`, `question_bank`, `user_roles`, `role_permissions`, `custom_ranks`, `user_themes`, `enrollment_requests`, `pre_authorized_students`, `xp_logs`, `coin_logs`, `chat_messages`, `chat_conversations`, `pvp_matches`, `audio_bank`, `item_transforms`, `live_quests`.
- **RPCs:** `apply_quest_reward`, `collect_combat_coin`, `verify_local_login`, `change_local_password`, `create_local_account_profile`, `reset_local_password`, `delete_local_account`, `forge_item`, `transmute_item`, `pvp_escrow_bets`, `pvp_pay_bets`, `pvp_join_spectator`, `pvp_leave_spectator`, `pvp_send_emoji`, `award_spectate_coins`, `drop_user_item`, `buy_hidden_store_item`.
- **Storage:** bucket `uploads` (avatar, imagens de questão, fundos, GLB).

---

## 6. Combate (lib + QuestGameplayMobile)

- **`lib/combatDamage.ts`** (618 linhas):
  - `MonsterCombatStats` `{ level, attack, defense, evasion, critChance, xp?, fleeChanceTable? }`.
  - `calculatePlayerHitDamage(attack, defense, evasion, isCritical)` — absorção `100/(100+def*1.5)`, crítico 2x, evasão → dano 0.
  - `calculateMonsterHitDamage(monsterAttack, playerDefense, isCritical)` — mesma absorção, sem esquiva.
  - `calculateMonsterHealFromDamage(dmg, level)` — cura do monstro (25% nv1 → 100% nv16+).
  - `evolveMonsterOnPlayerDefeat(...)` — monstro evolui ao derrotar o jogador (ganha 5% do XP da missão; +6 pontos aleatórios por nível).
  - `rollStatusDurationMs(stats)` — duração de efeito **do monstro no jogador**: base = `attack+defense+evasion+critChance` (máx em segundos, mín = 10% do máx, sorteia). Golem nv1 (86+48+5+5=144) → 14,4s–144s.
  - `rollMonsterStatusDurationMs(stats)` — duração de efeito **do jogador no monstro**: base = `attack+defense+vitality+fortitude+persuasion`.
  - Ranking de dano mensal: `saveQuestDamageRecord`, `fetchQuestDamageRanking`, `checkAndClaimMonthlyDamageRewards`, pote base 200 moedas, Top 10.
- **`getMonsterFleeChance`** está em **`QuestGameplayMobile.tsx:107`** (NÃO em combatDamage.ts): usa `fleeChanceTable` se configurada (maior degrau com `minHearts <= restantes`); senão curva padrão por nº de questões.
- **`lib/monsterAttacks.ts`**: `MonsterAttacksConfig` (melee/ranged/special/heal/support, `aiStyle`, `primaryAttack`). Cada golpe tem `enabled`, `minLevel`, `animation` (nome da animação GLB), `effect`, `effectEnabled`, `effectMinLevel`, `effectChance`, `effectChancePerLevel`. `decideMonsterAttackAction(attacks, monsterHpRatio, isRaged, level)` — IA tática (suporte ≤ threshold de vida; fúria prioriza especial; estilos hybrid/ranger/berserker/mage/random). `rollMonsterEffectProc`, `normalizeMonsterAttacks`. `MonsterProceduralMove`: `jump_slam`/`spin_tornado`/`rush_charge`/`dance_transform`/`roar_shockwave`.
- **`lib/damageEffects.ts`**: `EffectAddType` = `burn|freeze|impact|electric|poison|bleed|transform|heal`. `FREEZE_HITS_TO_FREEZE = 2`. `getEquippedDamageEffect(items)` (da arma equipada), `getEquippedWeaponFatality`, `orderEffectFirst`, `enhanceEffectAdd` (pergaminho: 90% ganha, 10% perde).
- **`lib/transformEffects.ts`**: `TransformAnimal` = `sapo|coelho|porco|rato`, `TRANSFORM_TURNS=3`. Sapo dá 0,5 coração sempre (nunca fatal); Porco enfurecido dá 2; Coelho reduz tempo de resposta em 30%; Rato aplica sangramento cumulativo. `computeMonsterDamageToPlayer`, `rollBleedWound`, `getTransformModelUrl` (`/models/monster/<animal>.glb`).
- **Fluxo no `QuestGameplayMobile.tsx`** (4996 linhas): `startGame` (sorteia ataque surpresa), `handleAnswer` (crítico, dano RPG, efeitos), `triggerFatality`, `triggerFlee` (vitória sem baú), `finishGame` (XP, baú, `apply_quest_reward` RPC), `applyMonsterEffectToPlayer` (status do jogador com duração por tempo), dano contínuo por efeito (poison/burn/electric/bleed), power-ups consumíveis.

### Estado dos efeitos de status no jogador/monstro (Fase B — implementado)
- **Jogador:** `playerStatusUntil`/`playerStatusTotal` (Record<string, number>) + `playerPoisonTurns`/`playerBurnTurns`/`playerElectricTurns`/`playerBleeds`/`playerFrozenAt`. Barras 3D acima da cabeça esvaziam conforme o tempo. Duração calculada com `rollStatusDurationMs(monsterCombatStats)`.
- **Monstro:** `monsterStatusUntil`/`monsterStatusTotal`/`monsterStatusType` + `effectLevel`/`monsterStatusTurns`. Barras acima do nome. Duração com `rollMonsterStatusDurationMs(totalEquippedStats)`.
- Expiração por intervalo (200ms) em `QuestGameplayMobile` que zera o efeito quando o tempo acaba. Cura de consumíveis (`cure_poison`/`cure_burn`/`cure_electric`/cure_freeze/bandagem) limpa o status + o timestamp.

---

## 7. Arena 3D (Fase B) — `src/components/VoxelArena3D.tsx` (2770 linhas)

**Este é o coração do trabalho recente.** Cena 3D unificada: jogador + monstro renderizados DENTRO da cena.

### Imports/Three
- `import * as THREE from 'skinview3d/node_modules/three'` (Three 0.156). GLTFLoader/DRACOLoader/SkeletonUtils também de `skinview3d/node_modules/three/...`. Dois Three coexistem (0.156 e 0.185) — warning esperado.

### Constantes
- `UNIFIED_ENTITY_HEIGHT = 2.5` (altura-alvo dos bonecos em unidades de mundo).
- `UNIFIED_LUNGE = 5.2` (avanço do ataque: monstro parte de +3.6 → ~-1.6).
- `computeWorldBox` (bbox por geometrias), `fitEntityToGround` (escala + ancora pés em y=0).
- `HEARTS_PER_ROW = 6`, `LUCIDE_HEART_PATH` (path do ícone lucide Heart), `HEART_BBOX` (bbox real do path p/ desenhar sem cortes).

### Props principais (`VoxelArena3DProps`)
- Monstro: `monsterModelUrl`, `monsterSkinUrl`, `monsterConfig`, `monsterAnim`, `monsterProceduralAnim`, `monsterSpecialAnim`, `monsterTransformModelUrl/RotY`, `monsterBodyThrow`, `monsterDamageEffect`, `monsterEffectLevel`, `monsterSlowFactor`, `monsterFrozen`, `monsterFreezeMelt`, `iceBreakTick`, `monsterZoom`, `monsterRotY`, `monsterEnraged`, `monsterEffectTint`, `monsterName`, `monsterHearts`, `monsterHeartFrac`, `monsterStatuses`.
- Jogador: `playerConfig`, `playerModelUrl`, `playerSkinUrl`, `playerEquippedItems`, `playerAnim`, `playerName`, `playerStatuses`, `playerBruiseLevel`, `playerBleeding`, `playerStressLevel`, `playerEffectTint`, `playerEffectTintAmount`, `playerEffectTintStrength`, `playerRecoil`.
- Câmera/cena: `deviceMode`, `biome`, `cameraPitch/Dist/TargetY`, `attackDist`, `onStageSizeChange`, `unified3D`.

### Como o HUD 3D funciona (nome, corações, barras, hematomas)
- **`makeNameSprite(text)`** — sprite de nome billboard (`depthTest:false, depthWrite:false, sizeAttenuation:true`), fonte 40px, escala 0.38.
- **`makeHeartsSprite(hearts, frac)`** — corações no padrão do HUD 2D (ícone lucide Heart), gradiente `#ff7a7a→#ef4444→#dc2626`, coração parcial enche de baixo p/ cima via `clip()` (frações 1/4, 1/3, 1/2), quebra em linhas de 6, `depthTest:false`, escala 0.62, `colorSpace: SRGBColorSpace`.
- **`makeStatusBarsSprite(statuses)`** — barras de condições (poison/burn/bleed/electric/freeze) com ícone/cor, esvaziam conforme `pct`.
- **`makeBruiseTexture`/`attachBruisesAndBlood(player, bruiseLevel, bleeding)`** — hematomas (pixels roxos/vermelhos) anexados aos OSSOS do skinview3d (`player.skin.head/body/leftArm/rightArm/leftLeg/rightLeg`); quantidade = `bruiseLevel * 14`.
- **`getBloodDripTexture`** (gota de sangue) e **`getSweatTexture`** (gota de suor) — pingos animados no loop (sangue quando `playerBleeding`, suor quando `playerStressLevel > 0.2`).
- **`makeNativeAnimation(name)`** — animação procedural do boneco nativo:
  - `hurt` = recoil; `exhausted` = cabeça baixa/braços caídos (SEM rotacionar tronco — itens são filhos dos ossos e balançariam); `attack*` = braço golpeia; `idle-victory` = apreensão; `victory*` = comemoração (hard/easy/stressed); `death*` = noop; idle = chin erguido (olha p/ câmera).
  - **IMPORTANTE:** nenhuma animação pode deslocar/rotacionar `body.position`/`body.rotation` com bounce, senão os itens equipados (filhos dos ossos) saem do lugar.
- **`attachEquippedItemsToPlayer(player, config, items, loader)`** — itens no boneco nativo (forja, glint, sparkles, `resolveModelTransform`, imagem 2.5D e GLB com `skeletonClone`).

### Loop de animação (`animate`)
- Atualiza mixers, avança anim nativa, derretimento por fogo (`scale.y`), tweens (`updateMoveTween` dash 0.18s + teleporte por opacidade, `applyDeathTween`, `applySpecialTween`, `applyThrowTween`), fuga do monstro (pula fora), vitória mantém posição, **sync dos sprites HUD por frame** (recria textura quando a chave muda), projeção das sombras CSS (`--shadow-monster-x` etc.), respiração procedural, pingos de sangue/suor, gelo/poça/estilhaçamento, nuvens, câmera.

### Posicionamento do HUD acima da cabeça
- `monsterHeadTopRef` guarda a **altura REAL do topo do modelo** (medida via `computeWorldBox(root).max.y` após `fitEntityToGround`). O name group é posicionado em `g.position.y + monsterHeadTopRef.current + 0.38`. Isso garante que nome/corações fiquem acima da cabeça em qualquer modelo (golem, etc.).

### Efeitos de reação (useEffects)
- **Expressões faciais por estresse:** `playerStressLevel >= 0.6 ? 'sad' : >= 0.3 ? 'serious' : 'normal'`; recarrega a skin no viewer nativo com `mouthStyle` (sad/neutral) e reaplica itens/hematomas. Ignorado se `playerSkinUrl` (skin custom).
- Gelo 3D (5 cubos + gotas + poça), transformação em animal, quebra do gelo (`iceBreakTick`), fuga/vitória, recoil, tint/fúria.

### Detalhes críticos de regressão (aprender com bugs passados)
1. **Itens balançando na vitória:** era causado por `body.position.y`/`body.rotation.x` com bounce nas animações. JÁ CORRIGIDO — não reintroduzir.
2. **Comemoração:** o jogador deve **manter a posição do golpe final** (não voltar ao nascimento, não ir ao centro). `idle-victory` e `victory-*` usam tween `hold` com posição atual. O jogador só anda ao centro quando o **monstro foge** (`playerAnim === 'walk'` explícito, não `exhausted`).
3. **HP crítico NÃO move o jogador ao centro.** O bug antigo era `walking = playerAnim === 'walk' || playerAnim === 'exhausted'` — `exhausted` (HP<50%) fazia caminhar ao centro. Corrigido: só `walk`.
4. **Corações cortados:** o path do coração não é centrado em (12,12) — mapear `HEART_BBOX` real (x:3.16–20.84, y:4.61–21.23). Não usar `scale(heartW/24, heartSize/24)` direto com `translate(x,y)`.
5. **HUD atrás da cabeça:** usar `depthTest:false` nos sprites de nome/corações/barras.
6. **Edições "não aplicadas":** várias edições anteriores reportaram sucesso mas não foram gravadas (provavelmente conflito de `oldString`). SEMPRE confirmar com `grep`/`read` que a edição realmente entrou no arquivo, e rodar typecheck+build.

---

## 8. Avatar 2D/3D — `src/components/AvatarCharacter.tsx` (3534 linhas)

- `AvatarConfig` (todas as opções de skin), `safeParseAvatarConfig`, `EquippedItem`, `ModelTransform`, `resolveModelTransform` (mescla transform do item + global `getGlobalModelTransforms`).
- **Forja visual:** `applyForgeGlowToModel(model, level)` (metalness/roughness/emissive por nível), `applyForgeGlint(mat, tier, style)` (emissiveMap deslizante: `circles` armas, `reflect` armaduras), `attachForgeSparkles(model, tier, boxScale, countMul, sizeScale)` (estrelas de forja por tier +7/8/9). `startForgeGlint()`/`stopForgeGlint()`/`stopForgeSparkles()` são RAFs globais.
- **Expressões:** `generateSkins()` gera `normal/happy/serious/sad` (via `mouthStyle`) com variantes `base`/`blink`; blink automático (3.5s+rand). `expression` prop: normal|serious|sad|happy|smile.
- **Itens:** anexa por `avatarPart` (mãos→braço, head→cabeça, legs/feet→corpo), suporta imagem 2.5D (`generateVoxelItemFromImage`), GLB (com `extractMeshName`, `modelTextureUrl`, `detectSide`, `skeletonClone`), cabeça Minecraft (base64 → proxy mc-heads.net).
- **Animações:** `applyPose`/`applyInterpolatedPose`, poses por ação, `victory-easy/mid/hard`, `cheer`, `raise-hand`, `attack` com timing por variante, `death-fall`/`death-explode`.
- **Addons 3D:** ponytail/spiky/long hair, bow/flower/headband.

---

## 9. Itens, Economia, Forja, Ranks, Gacha

- **`lib/gacha.ts`:** `calculateTotalStats(equippedItems, distributedStats)` → `{ attack, defense, xp, coins, vitality, fortitude, persuasion }`. `rollItemAdds`, `rollExactAttributes`, `AttributeType`.
- **`lib/forge.ts`:** `MAX_FORGE_LEVEL = 9`, `forgeStrengthFraction` (+0=0.10 … +9=1.00), `forgeAttributeValue`, `nextForgeCost`, `forgeSuccessChance` (90%→10%), `forgeMaterialsForLevel`, `forgeItemName`.
- **`lib/ranks.ts`:** 15 patentes (`RANKS`), `getRankForXp`, `initRanks` (patentes por escola em `custom_ranks`), `ensureGlobalRanks`, `getMaxAddsLimit`.
- **`lib/economy.ts`:** `currencyType: 'coins'|'xp'`, `coinToXPRatio`, `fetchEconomySettings`.
- **`lib/equipAura.ts`:** aura de conjunto (4 peças +9 mesma raridade).
- **`lib/consumableEffects.ts`:** presets visuais de consumíveis (`aura_rosy`, `aura_gold`, `eat_food`, `tea_strike`, `shield_burst`, `hourglass_spin`, `cleanse_cure`, `custom_aura`), `resolveConsumableEffect`.
- **`lib/bazar.ts`:** mercado entre alunos (licença `bazar_sale_permit`, `processExpiredSales`, `getSellerSpace`).
- **`lib/pvp.ts` (1085 linhas):** PvP completo — apostas em custódia (RPC `pvp_escrow_bets`/`pvp_pay_bets`), desafio/aceite, `resolveAndAdvance` (com efeitos de arma, transform, cura), espectadores + recompensas (`awardSpectateRewards`: 1ª vez +100 moedas + Caixa de Presente), emojis, `ranksWithinTwo`, `maxCoinsBetFor`.
- **`lib/equippedItems.ts`:** cache de itens equipados por usuário, `invalidateEquippedItems`.
- **`lib/itemTransforms.ts`:** registro global de transforms de itens (Debug 3D), `loadGlobalItemTransforms`, `getGlobalModelTransforms`.

---

## 10. IA (Groq)

- **`lib/aiConfig.ts`:** `getGrokConfig()` → `{ apiKey, model }` (tabela `system_collections`/`ai_config`/`grok`, fallback localStorage). Modelos: `qwen/qwen3.8-27b` (default), `groq/compound-mini`, etc.
- **`lib/questAi.ts`:** `fetchAiQuestFlavor(questId, title, description)` — lore curto da missão (≤15 palavras), persiste em `ai_quest_flavors`.
- **`lib/monsterAiBiography.ts`:** `generateMonsterBiographyWithAI(ctx)` (biografia 3 parágrafos), `generateProceduralMonsterBio` (fallback), `buildDynamicStudentBiography` (adapta por aluno), **`generateMonsterQuotesWithAI(ctx)`** → `MonsterQuotesResult { hp100_80, hp79_50, hp49_25, hp24_0, defeat }` (JSON estrito, onomatopeia, tom crescente de desespero) + `generateProceduralMonsterQuotes` (fallback). Botões de geração no `MonsterAttributesEditor` (aba Falas e Lore).

---

## 11. Áudio

- **`lib/audioBank.ts`:** `playSound(url, vol)` (one-shot), `fadeOutAllSounds(durationMs)`, `fetchAudioBank(tenantId)`, sons sintetizados via Web Audio (`playCoinBlip`, `playTransformPuffSound`, `playPotionDrinkSound`, `playElixirChimeSound`, `playEatFoodSound`, `playTeaDrinkSound`, `playMagicZapSound`, `playImpactShatterSound`, `playConsumableSound(soundType, customUrl)`).
- **`lib/audio.ts`:** `playChestAudio(url, rate, startSec, durationSec)`.
- **`lib/forgeSounds.ts`:** `fetchForgeSounds`/`saveForgeSounds` (música/sons da forja por escola).
- Música de batalha é LOCAL nas páginas (`QuestGameplayMobile.tsx` ~L532/L687, `PvpBattle.tsx` L92) com `musicAudioRef`/`fadeOutMusic`.

---

## 12. Componentes principais (para retomar trabalho)

- **`BlacksmithView.tsx`** — forja (RPC `forge_item`) e transmutação (RPC `transmute_item`, exige +9 e patente ≥11). Consolida pilhas.
- **`StudentStore.tsx`** — loja (gacha na compra de equipáveis, desconto por Persuasão, presentes, itens ocultos só staff, Bazar).
- **`StudentInventory.tsx`** — inventário (equipar, consumíveis, pergaminhos `add_attribute`/`reroll_attributes` via drag&drop, venda no Bazar, drop via RPC).
- **`CustomModelViewer.tsx`** — viewer GLB standalone (props: modelUrl, textureUrl, animation, role player/monster, zoom, configRotY, effectTint, enraged, slowFactor, shatteredCount, preserveDrawingBuffer, onCanvasReady). `computeEntityFit` auto-enquadra.
- **`MonsterAttacksEditor.tsx`** — editor de golpes do monstro (melee/ranged/special/support/IA), `inspectGlbAnimations` (lê animações do GLB via download completo + regex + GLTFLoader), animação GLB por golpe.
- **`MonsterAttributesEditor.tsx`** — stats/atributos (com `fleeChanceTable` editável: linhas "Mín. ♥ → Chance %"), sons, falas (geração IA), drops, lore.
- **`AvatarCustomizationModal.tsx`** — customização do avatar/monstro. `handleSave` preserva `fleeChanceTable`; salva em `preset_skins`; sincroniza `quests` por monsterName; `handleExport3D` (GLB do avatar).
- **`PvpBattle.tsx`** — batalha PvP (fonte de verdade `PvpMatch`, animações de lunge/hurt, fatal determinístico por hash, efeitos de arma, espectadores).
- **`ChatWidget.tsx`** — chat com contatos online, amizade, anti-spam, PvP integrado (desafio/espectador).
- **`QuestConfigModal.tsx`/`QuestQuestionsEditor.tsx`/`QuestionBankModal.tsx`/`ItemBankModal.tsx`** — editores de missão/perguntas/itens.
- **`PoseStudioModal.tsx`** — poses frame-a-frame (max 100 frames), itens nas mãos, ações.
- Efeitos: `DamageEffectOverlay`, `MonsterProjectileView`, `IceRockView`, `FloatingDamageNumber`, `MonsterHealAura`, `LootBeamDrop`, `ChestReveal`, `BattleTransition`.

---

## 13. Páginas principais

- **`Dashboard.tsx`** (4010 linhas) — painel do aluno (abas: quests, profile, ranking, store, forge). Clique em missão → `/quest/:id` (clássico) ou `/live/:id`.
- **`AdminDashboard.tsx`** (4849 linhas) — painel do professor/admin (abas: geral/quests/store/economy/aprovações/entidades/cenários). CRUD de missões, aprovações.
- **`LiveQuestAdmin.tsx`** — professor conduz missão ao vivo (sessão em `live_quests`, HP do monstro = `ceil(players * questões * 0.8)`).
- **`LiveQuestStudent.tsx`** — aluno em missão ao vivo.
- **`PvpPage.tsx`** — wrapper do `PvpBattle`.

---

## 14. Estado atual da Fase B e trabalho recente

Últimos commits (ordem cronológica, mais recente no topo):
- `0f3e78b` Mapa Exploravel (POC): cenario 3D exploravel com monstros, portas com perguntas, baus, moedas, picareta, quebra de blocos, visao 1a pessoa (`MapExplorerPoC`).
- `834f816` Arena 3D: modo 3D padrão; corações no padrão do HUD 2D (lucide Heart) com frações e linhas.
- `6d7e2d3` Arena 3D: barras de status por tempo, hematomas/sangue/suor, expressões por estresse e correções de animação.
- `fa56f7f` Chance de fuga configurável por monstro.
- `808d5af` Arena 3D: nome do jogador sobre a cabeça; corrige recarga em loop dos itens; monstro congelado não foge no golpe final; tint de dano e pose de hurt.
- `8d71d25` Arena 3D: renderiza o jogador como boneco NATIVO do skinview3d.
- `7bca498` Arena 3D: migra para Three 0.156.

**Ainda falta migrar/implementar para o 3D (pendências do usuário):**
1. Barras de status com duração por tempo — jogador e monstro JÁ funcionam, mas o usuário reportou que a barra do monstro às vezes não aparecia (bugs de prop não aplicada foram corrigidos). Validar em vários monstros/resoluções.
2. Aparência dos corações 3D — iterar até ficar igual ao 2D (cor viva, sem cortes, tamanho proporcional, acima da cabeça). Trabalho em andamento.
3. Migrar lógica de estresse (expressões faciais, suor, postura) — parcialmente feita; falta validar.
4. Todos os recursos do modo antigo (2D) que ainda não foram migrados ao 3D embutido — o usuário pede para manter o 2D ativo até completar a migração.

**Regras de trabalho para continuidade:**
- Responder sempre em PT-BR.
- Só commit/push quando o usuário pedir explicitamente.
- A página canônica de combate é `QuestGameplayMobile.tsx`.
- Confirmar edições com `read`/`grep` antes de seguir (edições às vezes "não pegam").
- Rodar `npx tsc --noEmit` e o build do Vite após mudanças.
- Testar no celular com Ctrl+Shift+R (cache do SW não guarda JS).