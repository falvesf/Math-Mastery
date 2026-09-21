import React, { useEffect, useRef, useState } from 'react';
// @ts-ignore - Three do skinview3d (0.156): MESMA versão dos bonecos (skinview3d), então
// o PlayerObject pode ser inserido direto na cena sem conflito de versões.
import * as THREE from 'skinview3d/node_modules/three';
// @ts-ignore
import { GLTFLoader } from 'skinview3d/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
// @ts-ignore
import { DRACOLoader } from 'skinview3d/node_modules/three/examples/jsm/loaders/DRACOLoader.js';
// @ts-ignore - clone preservando esqueleto (itens com SkinnedMesh, ex.: armaduras)
import { clone as skeletonClone } from 'skinview3d/node_modules/three/examples/jsm/utils/SkeletonUtils.js';
import { PlayerObject } from 'skinview3d';
import { IdleAnimation, WalkingAnimation, RunningAnimation, HitAnimation, FunctionAnimation, PlayerAnimation } from 'skinview3d';
import { generateMinecraftSkinUrl } from '../lib/SkinGenerator';
import { generateVoxelItemFromImage } from '../lib/VoxelItemGenerator';
import { resolveModelTransform, applyForgeGlowToModel, applyForgeGlint, attachForgeSparkles, type EquippedItem } from './AvatarCharacter';
import { getSafeUrl } from '../lib/utils';
import {
  getStoneBricksTexture,
  getGrassTopTexture,
  getGrassSideTexture,
  getDirtTexture,
  getSunTexture,
  getNetherBricksTexture,
  getNetherrackTexture,
  getSandstoneTexture,
  getSandTexture,
  getSnowTopTexture,
  getSnowSideTexture,
  getIceStoneTexture,
  getEndStoneTexture,
  getPurpurTexture,
  type VoxelBiomeType,
} from '../lib/voxelTextures';

// A partir de agora a arena e os bonecos usam a MESMA versão do Three (0.156), então o
// polyfill de determinantAffine (necessário quando haviam 0.185 x 0.156) não é mais preciso.

// =====================================================================
// FASE B (teste): helpers de renderização UNIFICADA de entidades GLB.
// =====================================================================

// Altura-alvo (em unidades de mundo) dos bonecos na cena unificada. ~2.5 deixa os
// personagens mais imponentes/chamativos (comparável ao modelo 2D anterior).
const UNIFIED_ENTITY_HEIGHT = 2.5;

// Calcula a bounding box em espaço de mundo pelas GEOMETRIAS (robusto para malhas
// skinned/GLB onde Box3.setFromObject pode falhar e devolver caixa vazia/errada).
function computeWorldBox(obj: THREE.Object3D): THREE.Box3 {
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3();
  obj.traverse((child) => {
    const mesh = child as THREE.Mesh;
    const geo = (mesh as any)?.geometry;
    if (mesh.isMesh && geo) {
      if (!geo.boundingBox) geo.computeBoundingBox();
      if (geo.boundingBox) box.union(geo.boundingBox.clone().applyMatrix4(mesh.matrixWorld));
    }
  });
  return box;
}

// Escala o objeto para a altura-alvo e ancora os pés em y=0 (relativo ao pai).
function fitEntityToGround(obj: THREE.Object3D, targetHeight: number) {
  const box = computeWorldBox(obj);
  if (box.isEmpty()) return;
  const h = box.max.y - box.min.y;
  if (h <= 0) return;
  obj.scale.setScalar(targetHeight / h);
  const box2 = computeWorldBox(obj);
  obj.position.y -= box2.min.y;
}

// ===== Sprite 3D de NOME acima da cabeça (billboard que acompanha o boneco) =====
// Renderizado DENTRO da cena 3D → o nome fica exatamente sobre a cabeça do modelo em
// qualquer resolução (sem depender de projeção CSS que desalinha conforme o zoom/altura).
const _nameTextureCache = new Map<string, THREE.CanvasTexture>();
function makeNameSprite(text: string, opts?: { color?: string; scale?: number }): THREE.Sprite {
  const color = opts?.color || '#ffffff';
  const cacheKey = `${text}|${color}`;
  let tex = _nameTextureCache.get(cacheKey);
  if (!tex) {
    const font = '400 40px "Segoe UI", Arial, sans-serif';
    const c = document.createElement('canvas');
    const g = c.getContext('2d')!;
    g.font = font;
    const tw = g.measureText(text).width;
    const w = Math.max(80, Math.ceil(tw) + 40);
    const h = 56;
    c.width = w; c.height = h;
    const g2 = c.getContext('2d')!;
    g2.clearRect(0, 0, w, h);
    g2.shadowColor = 'rgba(0,0,0,0.9)';
    g2.shadowBlur = 6;
    g2.shadowOffsetY = 2;
    g2.font = font;
    g2.textAlign = 'center';
    g2.textBaseline = 'middle';
    g2.fillStyle = 'rgba(0,0,0,0.55)';
    const pad = 10;
    const bw = tw + pad * 2;
    g2.beginPath();
    g2.roundRect((w - bw) / 2, h / 2 - 20, bw, 40, 8);
    g2.fill();
    g2.shadowBlur = 0;
    g2.fillStyle = color;
    g2.fillText(text, w / 2, h / 2 + 2);
    tex = new THREE.CanvasTexture(c);
    tex.anisotropy = 4;
    _nameTextureCache.set(cacheKey, tex);
  }
  const scale = opts?.scale ?? 1;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: true });
  const sprite = new THREE.Sprite(mat);
  const aspect = tex.image.width / tex.image.height;
  sprite.scale.set(0.38 * aspect * scale, 0.38 * scale, 1);
  return sprite;
}

// Cria um "grupo de nome" que fica ACIMA da cabeça do boneco e herda a posição (mas
// NÃO a rotação Y de combate) do grupo do personagem. Retorna o grupo pai a anexar.
function makeNameGroup(): THREE.Group {
  const g = new THREE.Group();
  g.position.set(0, UNIFIED_ENTITY_HEIGHT + 0.34, 0);
  return g;
}

// ===== Sprite 3D de CORAÇÕES (sob o nome, acompanha o boneco) =====
// Desenha o MESMO coração do HUD 2D (ícone lucide "Heart"): fundo vermelho-claro com
// contorno vivo + preenchimento em gradiente. Coração parcial (1/4, 1/3, 1/2) enche de
// baixo para cima (mantém o formato). Muitos corações quebram em LINHAS (máx. 6/linha).
// O path do coração tem bbox ~x:[3.16,20.84] y:[4.61,21.23] (não centrado em 12x12) —
// por isso mapeamos o bbox REAL para o retângulo do coração (evita cortes nas bordas).
const LUCIDE_HEART_PATH = 'M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z';
const HEART_BBOX = { minX: 3.16, minY: 4.61, maxX: 20.84, maxY: 21.23 };
const HEARTS_PER_ROW = 6;
const _heartsTextureCache = new Map<string, THREE.CanvasTexture>();
function makeHeartsSprite(hearts: number, frac: number, opts?: { scale?: number }): THREE.Sprite {
  const n = Math.max(0, Math.min(30, Math.floor(hearts)));
  const key = `${n}_${Math.round(frac * 100)}`;
  let tex = _heartsTextureCache.get(key);
  if (!tex) {
    const heartSize = 52;      // altura do coração (px no canvas)
    const heartW = 52;
    const gap = 12;
    const pad = 18;
    const rows = Math.max(1, Math.ceil(n / HEARTS_PER_ROW));
    const cols = Math.min(HEARTS_PER_ROW, n === 0 ? 1 : n);
    const w = cols * heartW + (cols - 1) * gap + pad * 2;
    const h = rows * heartSize + (rows - 1) * gap + pad * 2;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, w, h);
    const heartPath = new Path2D(LUCIDE_HEART_PATH);
    const drawHeart = (px: number, py: number, fillStyle: string | CanvasGradient, strokeStyle: string, strokeW = 1.5, blur = 0) => {
      g.save();
      // Mapeia o bbox REAL do path para o retângulo centrado em (px, py)
      const sx = heartW / (HEART_BBOX.maxX - HEART_BBOX.minX);
      const sy = heartSize / (HEART_BBOX.maxY - HEART_BBOX.minY);
      g.translate(px, py);
      g.scale(sx, sy);
      g.translate(-(HEART_BBOX.minX + HEART_BBOX.maxX) / 2, -(HEART_BBOX.minY + HEART_BBOX.maxY) / 2);
      if (blur > 0) {
        g.shadowColor = 'rgba(255,70,70,0.9)';
        g.shadowBlur = blur;
      }
      g.fillStyle = fillStyle;
      g.fill(heartPath);
      g.shadowBlur = 0;
      if (strokeStyle !== 'none') {
        g.strokeStyle = strokeStyle;
        g.lineWidth = strokeW;
        g.lineJoin = 'round';
        g.lineCap = 'round';
        g.stroke(heartPath);
      }
      g.restore();
    };
    for (let i = 0; i < n; i++) {
      const row = Math.floor(i / HEARTS_PER_ROW);
      const col = i % HEARTS_PER_ROW;
      const x = col * (heartW + gap) + heartW / 2 + pad;
      const y = row * (heartSize + gap) + heartSize / 2 + pad;
      // Gradiente alinhado a ESTE coração (coordenadas do canvas antes do translate)
      const grad = g.createLinearGradient(x, y - heartSize / 2, x, y + heartSize / 2);
      grad.addColorStop(0, '#ff7a7a');
      grad.addColorStop(0.5, '#ef4444');
      grad.addColorStop(1, '#dc2626');
      // 1. Fundo (coração vazio): mesmo do HUD 2D do jogador
      drawHeart(x, y, 'rgba(239,68,68,0.18)', '#ef4444', 1.5, 2);
      // 2. Preenchimento — cheio ou PARCIAL (enche de baixo para cima com a fração)
      const fillPct = i === n - 1 ? Math.max(0.08, Math.min(1, frac)) : 1;
      if (fillPct < 1) {
        g.save();
        g.beginPath();
        g.rect(x - heartW / 2, y - heartSize / 2 + heartSize * (1 - fillPct), heartW, heartSize * fillPct);
        g.clip();
        drawHeart(x, y, grad, 'none', 1.2, 4);
        g.restore();
      } else {
        drawHeart(x, y, grad, '#ef4444', 1.2, 4);
      }
    }
    tex = new THREE.CanvasTexture(c);
    tex.anisotropy = 4;
    (tex as any).colorSpace = THREE.SRGBColorSpace;
    _heartsTextureCache.set(key, tex);
  }
  const scale = opts?.scale ?? 1;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: true });
  const sprite = new THREE.Sprite(mat);
  const aspect = tex.image.width / tex.image.height;
  // Altura ~0.62 unidades (dobro do 0.34 anterior); largura proporcional.
  sprite.scale.set(0.62 * aspect * scale, 0.62 * scale, 1);
  return sprite;
}

// ===== Sprite 3D das BARRAS de condições negativas do jogador =====
// Uma barra por condição (veneno/fogo/sangramento/raio), cada uma com ícone próprio,
// empilhadas acima da cabeça — esvaziam conforme o tempo restante (pct 0-1).
const _statusTexCache = new Map<string, THREE.CanvasTexture>();
const STATUS_META: Record<string, { label: string; color: string; icon: string }> = {
  poison: { label: 'Veneno', color: '#4ade80', icon: '☠' },
  burn: { label: 'Fogo', color: '#fb923c', icon: '🔥' },
  bleed: { label: 'Sangramento', color: '#f87171', icon: '🩸' },
  electric: { label: 'Raio', color: '#fde047', icon: '⚡' },
  freeze: { label: 'Gelo', color: '#7dd3fc', icon: '❄' },
};
function makeStatusBarsSprite(statuses: { type: string; pct: number }[]): THREE.Sprite {
  const active = (statuses || []).filter(s => s && s.pct > 0 && STATUS_META[s.type]);
  const n = active.length;
  const key = n === 0 ? 'none' : active.map(s => `${s.type}:${Math.round((s.pct || 0) * 100)}`).join('|');
  let tex = _statusTexCache.get(key);
  if (!tex) {
    const barW = 120, barH = 12, iconSize = 14, gap = 3, padX = 6;
    const w = Math.max(30, barW + iconSize + gap + padX * 2);
    const h = Math.max(16, n * (barH + 2) + 6);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, w, h);
    active.forEach((s, i) => {
      const y = 4 + i * (barH + 3);
      const meta = STATUS_META[s.type];
      // Ícone
      g.font = `${iconSize}px sans-serif`;
      g.textBaseline = 'middle';
      g.textAlign = 'center';
      g.fillText(meta.icon, iconSize / 2 + padX, y + barH / 2);
      // Fundo da barra
      const bx = padX + iconSize + gap;
      const bw = barW;
      g.fillStyle = 'rgba(0,0,0,0.6)';
      g.fillRect(bx, y, bw, barH);
      g.strokeStyle = meta.color;
      g.lineWidth = 1;
      g.strokeRect(bx - 0.5, y - 0.5, bw + 1, barH + 1);
      // Preenchimento (esvazia conforme pct)
      const pct = Math.max(0, Math.min(1, s.pct));
      g.fillStyle = meta.color;
      g.fillRect(bx, y, Math.max(2, bw * pct), barH);
    });
    tex = new THREE.CanvasTexture(c);
    tex.anisotropy = 4;
    _statusTexCache.set(key, tex);
  }
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: true });
  const sprite = new THREE.Sprite(mat);
  const aspect = tex.image.width / tex.image.height;
  const scale = 0.5;
  sprite.scale.set(scale * aspect * 0.45, scale, 1);
  return sprite;
}

// ===== HEMATOMAS e SANGRAMENTO no boneco (jogador nativo) =====
// Hematomas: pixels roxos/avermelhados anexados AOS OSSOS do corpo (head/body/arms/legs),
// então acompanham o boneco e ficam sempre "sobre" o corpo (não vazam para fora).
// Sangramento: pingos finos que caem do corpo enquanto o jogador sangra.
const _bruiseTex = new Map<string, THREE.CanvasTexture>();
function makeBruiseTexture(color: string): THREE.CanvasTexture {
  let t = _bruiseTex.get(color);
  if (!t) {
    const S = 32;
    const c = document.createElement('canvas');
    c.width = S; c.height = S;
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, S, S);
    const rad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    rad.addColorStop(0, color);
    rad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rad;
    g.beginPath(); g.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2); g.fill();
    t = new THREE.CanvasTexture(c);
    _bruiseTex.set(color, t);
  }
  return t;
}

let _bloodDripTexCache: THREE.CanvasTexture | null = null;
function getBloodDripTexture(): THREE.CanvasTexture {
  if (_bloodDripTexCache) return _bloodDripTexCache;
  const S = 16;
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, S, S);
  g.fillStyle = 'rgba(220,30,30,0.95)';
  g.beginPath();
  g.ellipse(S / 2, S / 2, 2.4, 6, 0, 0, Math.PI * 2);
  g.fill();
  const tex = new THREE.CanvasTexture(c);
  (tex as any).userData = { name: 'bloodDrip' };
  _bloodDripTexCache = tex;
  return tex;
}

// Textura de gota de SUOR (pequena, azul-clara translúcida).
let _sweatTexCache: THREE.CanvasTexture | null = null;
function getSweatTexture(): THREE.CanvasTexture {
  if (_sweatTexCache) return _sweatTexCache;
  const S = 16;
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, S, S);
  g.fillStyle = 'rgba(180,220,255,0.9)';
  g.beginPath();
  g.ellipse(S / 2, S / 2, 2.6, 3.4, 0, 0, Math.PI * 2);
  g.fill();
  const tex = new THREE.CanvasTexture(c);
  (tex as any).userData = { name: 'sweat' };
  _sweatTexCache = tex;
  return tex;
}

const _bruiseSprites: { grp: THREE.Group; bone: string }[] = [];

// Retorna um dos ossos do playerObject do skinview3d pelo nome.
function getSkinBone(player: any, name: string): THREE.Object3D | null {
  return player?.skin?.[name] || null;
}

// Anexa/atualiza hematomas + pingos de sangue ao boneco nativo.
// bruiseLevel 0-1: quantidade de hematomas. bleeding: ativa pingos.
function attachBruisesAndBlood(player: any, bruiseLevel: number, bleeding: boolean) {
  if (!player) return;
  const BONES = ['head', 'body', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'];
  const targetCount = Math.round(Math.max(0, Math.min(1, bruiseLevel)) * 14);
  // Atualiza os hematomas existentes (recria se a quantidade mudou).
  while (_bruiseSprites.length > targetCount) {
    const s = _bruiseSprites.pop()!;
    s.grp.parent?.remove(s.grp);
    s.grp.traverse((c) => { (c as any).material?.dispose?.(); (c as any).material?.map?.dispose?.(); });
  }
  for (let i = _bruiseSprites.length; i < targetCount; i++) {
    const bone = BONES[Math.floor(Math.random() * BONES.length)];
    const boneObj = getSkinBone(player, bone);
    if (!boneObj) continue;
    const color = Math.random() < 0.4 ? 'rgba(120,40,140,0.55)' : 'rgba(160,30,30,0.5)';
    const tex = makeBruiseTexture(color);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: true, depthWrite: false, opacity: 0.55 + Math.random() * 0.4 });
    const spr = new THREE.Sprite(mat);
    const sz = 0.05 + Math.random() * 0.07;
    spr.scale.set(sz, sz, 1);
    // Posição aleatória sobre a superfície do osso (encosta no corpo).
    spr.position.set(
      (Math.random() * 2 - 1) * 0.14,
      (Math.random() * 2 - 1) * 0.25,
      0.02 + Math.random() * 0.03
    );
    const grp = new THREE.Group();
    grp.add(spr);
    boneObj.add(grp);
    _bruiseSprites.push({ grp, bone });
  }
  // Sangramento: pingos caindo de pontos do corpo enquanto bleeding.
  // (Implementação simples: sprites de gota pendurados na frente do corpo com oscilação
  // de queda — gerenciados no loop de animação global.)
  (player as any).userData = (player as any).userData || {};
  (player as any).userData.bleeding = bleeding;
}

// Limpa os hematomas/sangue anexados (chamado ao recriar o boneco).
function clearBruisesAndBlood() {
  _bruiseSprites.forEach(s => { s.grp.parent?.remove(s.grp); s.grp.traverse((c) => { (c as any).material?.dispose?.(); (c as any).material?.map?.dispose?.(); }); });
  _bruiseSprites.length = 0;
}

// Toca uma animação por nome (com fallback para idle / primeira disponível).
function playEntityAnimByName(
  actions: Record<string, THREE.AnimationAction>,
  mixer: THREE.AnimationMixer | null,
  animName: string
) {
  if (!mixer) return;
  const name = animName || 'idle';
  if (name === 'none') { mixer.stopAllAction(); return; }
  const keys = Object.keys(actions);
  if (keys.length === 0) return;
  const candidates = [
    name, name.toLowerCase(), name.toUpperCase(),
    `animation.${name}`, `animation.${name.toLowerCase()}`,
    `Armature|${name}`, `Armature|${name.toLowerCase()}`,
  ];
  let action: THREE.AnimationAction | null = null;
  for (const c of candidates) { if (actions[c]) { action = actions[c]; break; } }
  if (!action) {
    const idle = keys.find((k) => /idle/i.test(k));
    action = idle ? actions[idle] : actions[keys[0]];
  }
  if (action) {
    mixer.stopAllAction();
    action.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).fadeIn(0.2).play();
  }
}

// ===== Animação procedural do jogador NATIVO (skinview3d) =====
// Constrói uma PlayerAnimation a partir do nome de animação da arena.
function makeNativeAnimation(name: string): PlayerAnimation {
  const n = (name || 'idle').toLowerCase();
  if (n === 'walk') return new WalkingAnimation();
  if (n === 'run') return new RunningAnimation();
  if (n === 'hurt') {
    // Pose clara de "levar dano": corpo inclina para trás e cabeça joga para trás,
    // braços caem. (O HitAnimation do skinview3d ergue o braço e parece um ataque.)
    return new FunctionAnimation((player: any, progress: number) => {
      const p = Math.min(1, progress);
      const recoil = Math.sin(p * Math.PI);
      if (player.skin.body) { player.skin.body.rotation.x = -0.25 * recoil; player.skin.body.rotation.y = 0.12 * recoil; }
      if (player.skin.head) { player.skin.head.rotation.x = -0.3 * recoil; }
      const la = player.skin.leftArm; const ra = player.skin.rightArm;
      if (la) { la.rotation.x = 0.25 * recoil; la.rotation.z = 0.1; }
      if (ra) { ra.rotation.x = 0.25 * recoil; ra.rotation.z = -0.1; }
    });
  }
  if (n === 'exhausted') {
    // EXAUSTÃO (HP crítico / fadiga): cabeça baixa e braços caídos (respiração pesada
    // na cabeça). NÃO rotaciona o tronco — os itens equipados são filhos dos ossos e
    // balançariam saindo do lugar.
    return new FunctionAnimation((player: any, progress: number) => {
      const slow = Math.sin(progress * Math.PI * 1.2);
      if (player.skin.head) { player.skin.head.rotation.x = 0.22 + slow * 0.04; }
      const la = player.skin.leftArm; const ra = player.skin.rightArm;
      if (la) { la.rotation.x = 0.45; la.rotation.z = 0.08; }
      if (ra) { ra.rotation.x = 0.45; ra.rotation.z = -0.08; }
    });
  }
  if (n.startsWith('attack')) {
    // Ataque: braço dominante levanta e golpeia para frente.
    return new FunctionAnimation((player: any, progress: number) => {
      const swing = Math.sin(Math.min(1, progress) * Math.PI);
      const ra = player.skin.rightArm; const la = player.skin.leftArm;
      if (ra) { ra.rotation.x = -Math.PI / 2 * swing; ra.rotation.z = 0; }
      if (la) { la.rotation.x = Math.PI * 0.15 * swing; la.rotation.z = Math.PI * 0.02; }
    });
  }
  if (n === 'idle-victory') {
    // Apreensão antes da comemoração: braços baixos, cabeça erguida, leve tremor.
    // NÃO rotaciona o tronco (body) — os itens equipados são filhos dos ossos e
    // balançariam para frente/trás, saindo do lugar.
    return new FunctionAnimation((player: any) => {
      const la = player.skin.leftArm; const ra = player.skin.rightArm;
      if (la) { la.rotation.x = 0.12; la.rotation.z = 0.04; }
      if (ra) { ra.rotation.x = 0.12; ra.rotation.z = -0.04; }
      if (player.skin.head) player.skin.head.rotation.x = -0.12;
    });
  }
  if (n.startsWith('victory') || n === 'cheer') {
    // Comemoração: braços para cima, variações por condição.
    // victory-hard = vitória apertada (HP baixo) → comemoração exausta;
    // victory-easy = sobrou muita vida → mais animado; victory-mid = moderada.
    const hard = n.includes('hard');
    const easy = n.includes('easy');
    const stressed = hard || n.includes('stressed') || n.includes('lowhp') || n.includes('tired');
    const amp = easy ? 1 : hard ? 0.6 : 0.85;
    return new FunctionAnimation((player: any) => {
      const la = player.skin.leftArm; const ra = player.skin.rightArm;
      if (la) { la.rotation.x = -Math.PI * (stressed ? 0.5 : 0.9) * amp; la.rotation.z = stressed ? 0.1 : 0.25; }
      if (ra) { ra.rotation.x = -Math.PI * (stressed ? 0.5 : 0.9) * amp; ra.rotation.z = stressed ? -0.1 : -0.25; }
      if (player.skin.head && !stressed) player.skin.head.rotation.x = -0.08;
    });
  }
  if (n.startsWith('death')) {
    return new FunctionAnimation(() => { /* queda tratada pelo tween de grupo */ });
  }
  // Idle: levanta levemente a cabeça para olhar para a câmera/tela (o idle nativo do
  // skinview3d tende a deixar o boneco "cabisbaixo"). Aplica só se a cabeça não estiver
  // sendo animada por outra animação (aqui o nome não é attack/hurt/victory).
  return new FunctionAnimation((player: any, progress: number) => {
    if (player.skin?.head) {
      // Correção suave de "olhar para a câmera": leve rotação negativa em X (chin erguido).
      const target = -0.06;
      const current = player.skin.head.rotation.x;
      player.skin.head.rotation.x = current + (target - current) * 0.1;
    }
  });
}

// Anexa os itens equipados ao boneco nativo (skinview3d) — mesma lógica do AvatarCharacter.
function attachEquippedItemsToPlayer(player: any, config: any, items: any[], loader: any) {
  if (!player || !items?.length) return;
  console.log('[ARENA-ITEM] total de itens recebidos:', items.length, items.map((i: any) => `${i.avatarPart}:${i.itemTitle}`));
  const isLeftHanded = config?.handedness === 'left';
  const inv = isLeftHanded ? -1 : 1;
  const IMG_EXT_RE = /\.(png|gif|jpe?g|webp|avif)$/i;

  const attach = (model: any, item: any) => {
    model.traverse((c: any) => { if (c.isMesh) c.frustumCulled = false; });
    try { applyForgeGlowToModel(model, item.forgeLevel || 0); } catch { /* noop */ }
    try {
      const lvl = item.forgeLevel || 0;
      const tier = lvl >= 9 ? 3 : lvl >= 8 ? 2 : lvl >= 7 ? 1 : 0;
      const isWeaponSlot = ['hand', 'two_handed', 'rightHand', 'leftHand'].includes(String(item.avatarPart));
      const isGear = ['head', 'body', 'legs', 'feet', 'hand', 'two_handed', 'rightHand', 'leftHand'].includes(String(item.avatarPart));
      if (tier > 0 && isGear) {
        const style = (isWeaponSlot && item.itemCategory !== 'defense') ? 'circles' : 'reflect';
        model.traverse((c: any) => {
          if (!c.isMesh) return;
          const mats = Array.isArray(c.material) ? c.material : [c.material];
          mats.forEach((mm: any) => applyForgeGlint(mm, tier, style as any));
        });
      }
    } catch { /* noop */ }
    try {
      const sparkLvl = item.forgeLevel || 0;
      const sparkTier = sparkLvl >= 9 ? 3 : sparkLvl >= 8 ? 2 : sparkLvl >= 7 ? 1 : 0;
      if (sparkTier > 0) {
        const isWeaponSlot = ['hand', 'two_handed', 'rightHand', 'leftHand'].includes(String(item.avatarPart));
        const isShield = isWeaponSlot && item.itemCategory === 'defense';
        const sparkScale = (isWeaponSlot && !isShield) ? 0.98 : (isShield ? 1.22 : 1.3);
        const sparkMul = (isWeaponSlot && !isShield) ? 1 : (isShield ? 1.5 : 2);
        // No boneco nativo o player é escalado para 1.9 (fitEntityToGround) — as sparkles
        // compensam pelo worldScale e ficariam gigantes (~63% do personagem). Ajusta o
        // tamanho proporcionalmente à escala do boneco (AvatarCharacter não escala, ~30u).
        const nativeScale = player?.scale?.x || 1;
        attachForgeSparkles(model, sparkTier, sparkScale, sparkMul, nativeScale);
      }
    } catch { /* noop */ }

    const transform = resolveModelTransform(item, config?.gender, config?.handedness, false) || item.modelTransforms?.common;
    const p = String(item.avatarPart);
    if (['rightHand', 'leftHand', 'hand', 'two_handed'].includes(p)) {
      const isDefense = item.itemCategory === 'defense';
      const dominantArm = isLeftHanded ? player.skin.leftArm : player.skin.rightArm;
      const nonDominantArm = isLeftHanded ? player.skin.rightArm : player.skin.leftArm;
      const targetArm = isDefense ? nonDominantArm : dominantArm;
      if (transform) {
        model.scale.set(transform.scale ?? 10, transform.scale ?? 10, (transform.scale ?? 10) * (transform.thickness ?? 1));
        model.position.set(transform.posX * inv, transform.posY, transform.posZ);
        model.rotation.set(transform.rotX, transform.rotY * inv, transform.rotZ * inv);
        model.translateY(transform.slide);
      } else {
        model.scale.set(10, 10, 10);
        model.position.set(0, -12, 0);
        model.rotation.set(Math.PI / 2, 0, 0);
      }
      targetArm.add(model);
    } else if (p === 'head' || p === 'face') {
      const s = item.minecraftHeadValue ? 9.2 : 16;
      model.scale.set(transform?.scale ?? s, transform?.scale ?? s, (transform?.scale ?? s) * (transform?.thickness ?? 1));
      if (transform) { model.position.set(transform.posX, transform.posY, transform.posZ); model.rotation.set(transform.rotX, transform.rotY, transform.rotZ); model.translateY(transform.slide); }
      else { model.position.set(0, 0, 0); model.rotation.set(0, Math.PI, 0); }
      player.skin.head.add(model);
    } else if (p === 'legs' || p === 'feet') {
      model.scale.set(transform?.scale ?? 16, transform?.scale ?? 16, (transform?.scale ?? 16) * (transform?.thickness ?? 1));
      if (transform) { model.position.set(transform.posX ?? 0, transform.posY ?? 0, transform.posZ ?? 0); model.rotation.set(transform.rotX, transform.rotY, transform.rotZ); model.translateY(transform.slide ?? 0); }
      else model.position.set(0, p === 'feet' ? -22 : -15, 0);
      player.skin.body.add(model);
    } else {
      model.scale.set(transform?.scale ?? 16, transform?.scale ?? 16, (transform?.scale ?? 16) * (transform?.thickness ?? 1));
      if (transform) { model.position.set(transform.posX, transform.posY, transform.posZ); model.rotation.set(transform.rotX, transform.rotY, transform.rotZ); model.translateY(transform.slide); }
      else model.position.set(0, -6, 0);
      player.skin.body.add(model);
    }
  };

  for (const item of items) {
    if (!item?.gameModelUrl) continue;
    const raw = item.gameModelUrl;
    // Resolve a URL como no AvatarCharacter: prefixa /models/ quando relativo, adiciona
    // BASE_URL e codifica espaços (ex.: "cintura diamante.glb"). Sem isso o loader busca
    // o index.html e falha ("Unexpected token '<'").
    let finalUrl = String(raw).replace(/\\/g, '/');
    if (!finalUrl.startsWith('http') && !finalUrl.startsWith('/')) {
      if (!finalUrl.startsWith('models/')) finalUrl = `models/${finalUrl}`;
      finalUrl = `/${finalUrl}`;
    } else if (finalUrl.startsWith('/') && !finalUrl.startsWith('/models/')) {
      finalUrl = `/models${finalUrl}`;
    }
    if (finalUrl.startsWith('/')) finalUrl = import.meta.env.BASE_URL + finalUrl.substring(1);
    finalUrl = finalUrl.startsWith('http') ? finalUrl : encodeURI(finalUrl);
    try {
      console.log('[ARENA-ITEM] carregando:', item.avatarPart, item.itemTitle, finalUrl);
      if (IMG_EXT_RE.test(finalUrl.split('?')[0])) {
        const transform = resolveModelTransform(item, config?.gender, config?.handedness, false) || item.modelTransforms?.common;
        generateVoxelItemFromImage(finalUrl, item.backColor, transform?.curveX || 0, transform?.curveY || 0, undefined, 0.12 * (transform?.thickness ?? 1))
          .then((m: any) => attach(m, item))
          .catch((e: any) => console.warn('[ARENA-ITEM] falha voxel:', item.itemTitle, e));
      } else {
        loader.load(finalUrl, (gltf: any) => {
          let model = gltf.scene;
          // Itens com SkinnedMesh (ex.: armaduras/elmo/botas de packs) NÃO renderizam ao
          // serem reparentados sem clonar o esqueleto. Clona com SkeletonUtils.
          let hasSkin = false;
          model.traverse((n: any) => { if (n.isSkinnedMesh) hasSkin = true; });
          if (hasSkin) {
            try { model = skeletonClone(model); } catch { /* mantém o original */ }
          }
          console.log('[ARENA-ITEM] GLB ok:', item.avatarPart, item.itemTitle, 'skinned:', hasSkin);
          attach(model, item);
        }, undefined, (err: any) => console.warn('[ARENA-ITEM] falha GLB:', item.itemTitle, finalUrl, err));
      }
    } catch (e) { console.warn('[VoxelArena3D] falha ao anexar item nativo:', e); }
  }
}

// Aplica a SKIN (textura) nos materiais do modelo GLB, igual ao CustomModelViewer.
function applySkinTexture(root: THREE.Object3D, skinUrl: string | null | undefined, done: () => void) {
  if (!skinUrl) { done(); return; }
  const texLoader = new THREE.TextureLoader();
  texLoader.crossOrigin = 'anonymous';
  texLoader.load(getSafeUrl(skinUrl), (texture) => {
    texture.flipY = false;
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    root.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh && mesh.material) {
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        mats.forEach((mat: any) => {
          const newMat = mat.clone();
          newMat.map = texture;
          newMat.transparent = false;
          newMat.alphaTest = 0.5;
          newMat.needsUpdate = true;
          mesh.material = newMat;
        });
      }
    });
    done();
  }, undefined, () => { done(); });
}

// Aplica tint de efeito (dano/veneno/fogo) e fúria nos materiais de uma entidade.
// `amount` (0-1) permite tint parcial (ex.: azul do gelo esmaecendo ao descongelar).
function applyEntityTint(root: THREE.Object3D | null, tint: string | null, enraged: boolean, amount: number = 1, strength: number = 0.35) {
  if (!root) return;
  root.traverse((c) => {
    const mesh = c as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    mats.forEach((mat: any) => {
      if (!mat.color) return;
      if (!mat._origColor) {
        mat._origColor = mat.color.clone();
        mat._origEmissive = mat.emissive ? mat.emissive.clone() : null;
      }
      if (enraged) {
        mat.color.copy(mat._origColor).lerp(new THREE.Color('#ff1111'), 0.7);
        if (mat.emissive) mat.emissive.setRGB(0.6, 0.02, 0.02);
      } else if (tint && amount > 0.001) {
        const c = new THREE.Color(tint);
        mat.color.copy(mat._origColor).lerp(c, strength * amount);
        if (mat.emissive) mat.emissive.copy(c).multiplyScalar(0.25 * amount);
      } else {
        mat.color.copy(mat._origColor);
        if (mat.emissive) {
          if (mat._origEmissive) mat.emissive.copy(mat._origEmissive);
          else mat.emissive.setRGB(0, 0, 0);
        }
      }
      mat.needsUpdate = true;
    });
  });
}

// Rotação base dos bonecos na arena: repouso olha para a câmera (+z → Math.PI para
// modelos Blockbench), combate vira para o oponente (jogador vira +x, monstro vira -x).
function isCombatAnim(anim?: string): boolean {
  return !!anim && (anim.startsWith('attack') || anim === 'hurt' || anim === 'attack-fatal' || anim === 'attack-fatal-slow' || anim.startsWith('death') || anim.startsWith('victory'));
}

// Avanço do ataque corpo a corpo em unidades de mundo. O monstro parte de x=+3.6 e
// alcança ~-1.6 (perto do jogador); o jogador o espelho. Ajustável para calibrar.
const UNIFIED_LUNGE = 5.2;

const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// Atualiza o avanço (tween de posição X) de um boneco no loop de animação.
// mode 'go': avança 0.6s, segura 0.3s, volta 0.6s. mode 'hold': avança e fica (fatal/vitória).
function updateMoveTween(
  moveRef: React.MutableRefObject<{ fromX: number; toX: number; restX: number; start: number; mode: 'go' | 'hold'; teleport?: boolean } | null>,
  group: THREE.Group | null,
  nowMs: number
) {
  const m = moveRef.current;
  if (!m || !group) return;
  const elapsed = (nowMs - m.start) / 1000;
  if (m.mode === 'go') {
    let x = m.fromX;
    // Dash ágil: avança rápido (0.18s, easeOut = arranque), segura 0.2s e volta (0.42s).
    if (elapsed < 0.18) {
      const t = clamp01(elapsed / 0.18);
      x = lerp(m.fromX, m.toX, 1 - Math.pow(1 - t, 3)); // easeOutCubic (dash)
    } else if (elapsed < 0.38) {
      x = m.toX;
    } else if (elapsed < 0.8) {
      x = lerp(m.toX, m.restX, easeInOut(clamp01((elapsed - 0.38) / 0.42)));
    } else {
      x = m.restX;
      moveRef.current = null;
    }
    group.position.x = x;
    // Teletransporte: no arranque o boneco "some" e reaparece no alvo (flash rápido).
    if (m.teleport) {
      const o = elapsed < 0.08 ? 1 - (elapsed / 0.08) : elapsed < 0.16 ? (elapsed - 0.08) / 0.08 : 1;
      setGroupOpacity(group, clamp01(o) * 0.85 + 0.15);
    }
  } else {
    // Hold (fatal/vitória): avanço com dash e permanece no alvo.
    const t = clamp01(elapsed / 0.18);
    group.position.x = elapsed < 0.18 ? lerp(m.fromX, m.toX, 1 - Math.pow(1 - t, 3)) : m.toX;
    if (m.teleport) {
      const o = elapsed < 0.08 ? 1 - (elapsed / 0.08) : elapsed < 0.16 ? (elapsed - 0.08) / 0.08 : 1;
      setGroupOpacity(group, clamp01(o) * 0.85 + 0.15);
    }
  }
}

// Ajusta a opacidade de todos os materiais de um grupo (para evaporar/explodir).
function setGroupOpacity(group: THREE.Object3D, opacity: number) {
  group.traverse((c) => {
    const mesh = c as THREE.Mesh;
    if (mesh.isMesh && mesh.material) {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mats.forEach((mat: any) => {
        mat.transparent = true;
        mat.opacity = opacity;
        mat.needsUpdate = true;
      });
    }
  });
}

// Aplica a animação de MORTE (fatality) no grupo, conforme o tipo.
// death-fall: cai para frente e deita. death-explode: cresce e some.
// death-evaporate: cresce, sobe e desintegra. death-slice: cai (fallback simples).
function applyDeathTween(
  deathRef: React.MutableRefObject<{ type: string; start: number } | null>,
  group: THREE.Group | null,
  nowMs: number
) {
  const d = deathRef.current;
  if (!d || !group) return;
  const el = (nowMs - d.start) / 1000;
  if (el < 0.05) console.log('[FASEB applyDeath]', d.type, 'group=', !!group, 'el=', el.toFixed(3));
  if (d.type === 'death-explode') {
    const t = clamp01(el / 0.9);
    group.scale.setScalar(1 + easeInOut(t) * 0.6);
    setGroupOpacity(group, 1 - t);
  } else if (d.type === 'death-evaporate') {
    const t = clamp01(el / 1.2);
    group.scale.setScalar(1 + easeInOut(t) * 0.3);
    group.position.y = 0.51 + easeInOut(t) * 0.4;
    setGroupOpacity(group, 1 - t);
  } else {
    // death-fall / death-slice: cai para a frente e deita no chão.
    const t = clamp01(el / 1.2);
    group.rotation.x = easeInOut(t) * 1.5;
    group.position.y = 0.51 - easeInOut(t) * 0.25;
  }
}

// Aplica um GOLPE ESPECIAL procedural (pulo/giro/investida/rugido) no grupo.
// O monstro deve REALMENTE se mover até o alvo e agir (não só o efeito).
function applySpecialTween(
  specialRef: React.MutableRefObject<{ type: string; start: number } | null>,
  group: THREE.Group | null,
  nowMs: number,
  isMonster: boolean
) {
  const s = specialRef.current;
  if (!s || !group) return;
  const el = (nowMs - s.start) / 1000;
  const dir = isMonster ? 1 : -1; // monstro em +x avança para -x; jogador em -x avança para +x
  const restX = isMonster ? 3.6 : -3.6;
  if (s.type === 'jump_slam') {
    // Arco: avança até o jogador (~0.75s, dano) e volta (~1.5s), subindo e caindo.
    const t = clamp01(el / 1.5);
    const out = easeInOut(clamp01(t / 0.5));
    const back = easeInOut(clamp01((t - 0.5) / 0.5));
    const xPhase = t < 0.5 ? out : 1 - back;
    group.position.x = restX - dir * xPhase * 5.0;
    group.position.y = 0.51 + (t < 0.5 ? Math.sin(clamp01(t / 0.5) * Math.PI) * 2.2 : 0);
    group.rotation.x = xPhase * 0.6; // inclina ao cair
  } else if (s.type === 'spin_tornado') {
    // Gira e AVANÇA até o alvo (~0.7s, dano) e volta (~1.4s).
    group.rotation.y += 0.6;
    const t = clamp01(el / 1.4);
    group.position.x = restX - dir * Math.sin(t * Math.PI) * 5.0;
  } else if (s.type === 'rush_charge') {
    // Investida: avança na diagonal (x + leve rotação de inclinação) até o alvo e volta.
    const t = clamp01(el / 1.2);
    group.position.x = restX - dir * Math.sin(t * Math.PI) * 5.0;
    group.rotation.x = Math.sin(t * Math.PI) * 0.35;
  } else if (s.type === 'roar_shockwave') {
    const t = clamp01(el / 1.2);
    group.scale.setScalar(1 + Math.sin(t * Math.PI) * 0.18);
  } else {
    // dance_transform e outros: balanço suave.
    group.rotation.z = Math.sin(el * 6) * 0.12;
  }
}

// Pose de ARREMESSO (ranged): inclina para trás e lança para frente (projétil).
function applyThrowTween(
  throwStartRef: React.MutableRefObject<number | null>,
  group: THREE.Group | null,
  nowMs: number
) {
  const start = throwStartRef.current;
  if (start == null || !group) return;
  const el = (nowMs - start) / 1000;
  let rx = 0;
  if (el < 0.25) rx = -easeInOut(clamp01(el / 0.25)) * 0.35; // inclina p/ trás
  else if (el < 0.6) rx = lerp(-0.35, 0.25, easeInOut(clamp01((el - 0.25) / 0.35))); // lança p/ frente
  else rx = lerp(0.25, 0, easeInOut(clamp01((el - 0.6) / 0.4))); // recupera
  group.rotation.x = rx;
}



export interface VoxelArena3DProps {
  /** Força o perfil de câmera e enquadramento para calibração ('desktop' | 'mobile') */
  deviceMode?: 'desktop' | 'mobile';
  /** Animação atual do monstro para efeitos de luz dinâmicos */
  monsterAnim?: string;
  /** Animação procedural de golpe especial do monstro (jump_slam, spin_tornado, ...) */
  monsterProceduralAnim?: string;
  /** Nome da animação GLB do golpe especial (prioritária sobre monsterAnim) */
  monsterSpecialAnim?: string;
  /** URL do GLB do animal da transformação (sapo/rato/porco/coelho). Vazio = forma normal. */
  monsterTransformModelUrl?: string;
  /** Rotação (graus) do animal da transformação (corrige modelos virados, ex.: porco 180). */
  monsterTransformRotY?: number;
  /** Se o monstro está arremessando o projétil (throw) */
  monsterBodyThrow?: boolean;
  /** Efeito de dano ativo no monstro (burn/freeze/poison/bleed/impact/electric) */
  monsterDamageEffect?: string;
  /** Nível do efeito de dano (0 = sem efeito) */
  monsterEffectLevel?: number;
  /** Fator de lentidão do monstro (gelo): 1 = normal, <1 = mais lento */
  monsterSlowFactor?: number;
  /** Monstro congelado sólido (rocha de gelo ao redor) */
  monsterFrozen?: boolean;
  /** Intensidade do tint (0-1) — ex.: azul do gelo esmaecendo ao descongelar */
  monsterEffectTintAmount?: number;
  /** Tint de efeito de status no JOGADOR (veneno/fogo/raio/sangramento/gelo/cura) */
  playerEffectTint?: string | null;
  /** Intensidade do tint do jogador (0-1) */
  playerEffectTintAmount?: number;
  /** Força do blend do tint do jogador (0-1). Flash de dano usa valor alto p/ ficar evidente. */
  playerEffectTintStrength?: number;
  /** Fator de derretimento do gelo (1 = cheio, menor = derretendo) */
  monsterFreezeMelt?: number;
  /** Contador que incrementa quando o gelo é quebrado por golpe (estilhaça) */
  iceBreakTick?: number;
  /** Recuo do jogador ao bater no gelo (bate em algo duro e volta) */
  playerRecoil?: boolean;
  /** Se o monstro está no pulso de cura verde água */
  healActive?: boolean;
  /** Terremoto/abalo na arena */
  arenaQuake?: boolean;
  /** Distância configurada do golpe corpo a corpo (em px). Se omitido ou 0, usa a distância calculada automaticamente */
  attackDist?: number;
  /** Bioma do cenário 3D: planície, nether, deserto, tundra/neve ou the end */
  biome?: VoxelBiomeType;

  // --- Jogador (3D) ---
  playerConfig?: any;
  playerModelUrl?: string | null;
  playerSkinUrl?: string | null;
  playerEquippedItems?: any[];
  playerAnim?: string;
  /** Nome exibido em sprite 3D acima da cabeça do jogador (acompanha o modelo). */
  playerName?: string;

  // --- Monstro (3D) ---
  monsterModelUrl?: string | null;
  monsterSkinUrl?: string | null;
  monsterConfig?: any;
  /** Nome exibido em sprite 3D acima da cabeça do monstro (acompanha o modelo). */
  monsterName?: string;
  /** Corações restantes do monstro (renderizados em sprite 3D sob o nome). */
  monsterHearts?: number;
  /** Fração do coração atual (0-1) — ex.: crítico danificou parcialmente. */
  monsterHeartFrac?: number;
  /** Efeitos de dano ativos no monstro (barras 3D acima do nome, esvaziando). */
  monsterStatuses?: { type: string; pct: number }[];
  /**
   * Condições negativas ativas no JOGADOR, para barras 3D acima da cabeça.
   * type: poison | burn | bleed | electric | freeze. pct = tempo restante (0-1).
   */
  playerStatuses?: { type: string; pct: number }[];
  /** Nível de dano do jogador (0-1) — controla a quantidade de hematomas no corpo. */
  playerBruiseLevel?: number;
  /** Se o jogador está sangrando — ativa pingos de sangue no corpo. */
  playerBleeding?: boolean;
  /** Nível de estresse do jogador (0-1) — controla postura de cansaço e suor. */
  playerStressLevel?: number;
  monsterZoom?: number;
  monsterRotY?: number;
  monsterEnraged?: boolean;
  monsterEffectTint?: string | null;

  // --- Calibração de Câmera & Profundidade 3D ---
  cameraPitch?: number;
  cameraDist?: number;
  cameraTargetY?: number;

  /** Reporta o tamanho (em px) do stage 3D sempre que ele é medido/redimensionado. */
  onStageSizeChange?: (size: { w: number; h: number }) => void;

  /** TESTE (Fase B): renderiza jogador + monstro DENTRO da cena (unificada), sem overlays. */
  unified3D?: boolean;
}

/**
 * VoxelArena3D
 * Cenário 3D Único e Integrado em tempo real estilo Minecraft:
 * - Plataforma central temática (Stone Bricks, Nether Bricks, Sandstone, Ice Stone, Purpur)
 * - Chão circundante infinito com blocos do bioma
 * - Céu, névoa e iluminação específicos de cada dimensão
 * - Efeitos atmosféricos e partículas procedurais (nuvens, brasas vulcânicas, neve, partículas do Ender)
 * - Personagem 3D do Jogador renderizado DIRETAMENTE na cena sobre a plataforma
 * - Personagem 3D do Monstro renderizado DIRETAMENTE na cena sobre a plataforma
 * - Câmera adaptativa com proporções perfeitas para desktop e mobile
 * - Animações de combate (avanço de ataque, impacto, recuo, cura e vitória)
 */
export const VoxelArena3D: React.FC<VoxelArena3DProps> = ({
  deviceMode,
  healActive = false,
  arenaQuake = false,
  attackDist,
  biome = 'plains',
  // @ts-ignore
  playerConfig,
  // @ts-ignore
  playerModelUrl,
  // @ts-ignore
  playerSkinUrl,
  // @ts-ignore
  playerEquippedItems = [],
  playerAnim = 'idle',
  playerName,
  // @ts-ignore
  monsterModelUrl,
  // @ts-ignore
  monsterSkinUrl,
  // @ts-ignore
  monsterConfig,
  monsterName,
  monsterHearts = 0,
  monsterHeartFrac = 1,
  monsterStatuses = [],
  playerStatuses = [],
  playerBruiseLevel = 0,
  playerBleeding = false,
  playerStressLevel = 0,
  monsterAnim = 'idle',
  monsterProceduralAnim,
  monsterSpecialAnim,
  monsterTransformModelUrl,
  monsterTransformRotY = 0,
  monsterBodyThrow = false,
  monsterDamageEffect,
  monsterEffectLevel = 0,
  monsterSlowFactor = 1,
  monsterFrozen = false,
  monsterFreezeMelt = 1,
  monsterEffectTintAmount = 1,
  playerEffectTint = null,
  playerEffectTintAmount = 1,
  playerEffectTintStrength = 0.35,
  iceBreakTick = 0,
  playerRecoil = false,
  // @ts-ignore
  monsterZoom = 1,
  // @ts-ignore
  monsterRotY = 0,
  // @ts-ignore
  monsterEnraged = false,
  // @ts-ignore
  monsterEffectTint = null,
  cameraPitch = 0,
  cameraDist = 0,
  cameraTargetY = 0,
  onStageSizeChange,
  unified3D = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const outerRef = useRef<HTMLDivElement>(null);

  // Proporção FIXA por modo: 9:16 (mobile) / 16:9 (desktop). O stage 3D mantém essa
  // proporção e é centralizado; devices fora do padrão ganham só margem.
  const isMobileMode = deviceMode ? (deviceMode === 'mobile') : (typeof window !== 'undefined' ? window.innerWidth <= 768 : false);
  const STAGE_ASPECT = isMobileMode ? (9 / 16) : (16 / 9);
  const [stageSize, setStageSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  // Incrementa quando o grupo do monstro é (re)criado, para o efeito do gelo recriar
  // o gelo/poça caso o monstro já esteja congelado (ex.: após re-render/resize).
  const [monsterEpoch, setMonsterEpoch] = useState(0);

  // Refs Three.js desacoplados do ciclo de vida da cena
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const healLightRef = useRef<THREE.PointLight | null>(null);
  const cloudsGroupRef = useRef<THREE.Group | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Refs das entidades unificadas (Fase B): jogador + monstro dentro da cena
  const unifiedMonsterGroupRef = useRef<THREE.Group | null>(null);
  const unifiedPlayerGroupRef = useRef<THREE.Group | null>(null);
  const unifiedMonsterMixerRef = useRef<THREE.AnimationMixer | null>(null);
  const unifiedPlayerMixerRef = useRef<THREE.AnimationMixer | null>(null);
  const unifiedMonsterActionsRef = useRef<Record<string, THREE.AnimationAction>>({});
  const unifiedPlayerActionsRef = useRef<Record<string, THREE.AnimationAction>>({});
  // Guarda o modelo cru (sem tint) para restaurar materiais a cada mudança de efeito
  const unifiedMonsterRootRef = useRef<THREE.Object3D | null>(null);
  const unifiedPlayerRootRef = useRef<THREE.Object3D | null>(null);
  const unifiedMonsterOriginalMatsRef = useRef<Map<string, { color: THREE.Color; emissive?: THREE.Color }>>(new Map());
  const unifiedPlayerOriginalMatsRef = useRef<Map<string, { color: THREE.Color; emissive?: THREE.Color }>>(new Map());
  // Sprites 3D dos nomes acima das cabeças (billboard que acompanha o modelo).
  const playerNameSpriteRef = useRef<THREE.Sprite | null>(null);
  const monsterNameSpriteRef = useRef<THREE.Sprite | null>(null);
  const playerNameGroupRef = useRef<THREE.Group | null>(null);
  const monsterNameGroupRef = useRef<THREE.Group | null>(null);
  const monsterHeartsSpriteRef = useRef<THREE.Sprite | null>(null);
  const monsterStatusSpriteRef = useRef<THREE.Sprite | null>(null);
  const monsterStatusDrawnRef = useRef<string>('');
  const playerStatusSpriteRef = useRef<THREE.Sprite | null>(null);
  const playerStatusGroupRef = useRef<THREE.Group | null>(null);
  const playerStatusDrawnRef = useRef<string>('');
  // Jogador nativo (skinview3d): quando não há GLB customizado, o boneco é o próprio
  // PlayerObject do skinview3d, inserido direto na cena — fidelidade total (expressões,
  // glint, sparkles, animações), já que agora usamos a mesma versão do Three (0.156).
  const nativePlayerRef = useRef<{
    viewer: any;
    player: any;
    skinViewer: any;
    currentAnim: string;
    anim: any;
  } | null>(null);
  // Tweens de avanço (ataque corpo a corpo) das entidades unificadas
  const monsterMoveRef = useRef<{ fromX: number; toX: number; restX: number; start: number; mode: 'go' | 'hold' } | null>(null);
  const playerMoveRef = useRef<{ fromX: number; toX: number; restX: number; start: number; mode: 'go' | 'hold' } | null>(null);
  // Tweens de morte (fatality)
  const monsterDeathRef = useRef<{ type: string; start: number } | null>(null);
  const playerDeathRef = useRef<{ type: string; start: number } | null>(null);
  // Última animação tratada (para detectar transições, não re-runs do efeito)
  const prevMonsterAnimRef = useRef(monsterAnim);
  const prevPlayerAnimRef = useRef(playerAnim);
  // Golpe especial procedural (jump_slam, spin_tornado, ...)
  const monsterSpecialRef = useRef<{ type: string; start: number } | null>(null);
  const playerSpecialRef = useRef<{ type: string; start: number } | null>(null);
  // Arremesso de projétil (ranged): quando monsterBodyThrow liga, marca o início
  const monsterThrowStartRef = useRef<number | null>(null);
  // Lentidão (gelo) e escala base (para derretimento ao queimar)
  const monsterSlowFactorRef = useRef(monsterSlowFactor);
  monsterSlowFactorRef.current = monsterSlowFactor;
  const monsterDamageEffectRef = useRef(monsterDamageEffect);
  monsterDamageEffectRef.current = monsterDamageEffect;
  const monsterEffectLevelRef = useRef(monsterEffectLevel);
  monsterEffectLevelRef.current = monsterEffectLevel;
  const unifiedMonsterBaseScaleRef = useRef(1);
  // Altura REAL do topo do modelo do monstro (medida após fit) — usada para posicionar
  // nome/corações ACIMA da cabeça em qualquer modelo (golem, etc.).
  const monsterHeadTopRef = useRef(UNIFIED_ENTITY_HEIGHT);
  // Rocha de gelo 3D (quando congelado)
  const iceGroupRef = useRef<THREE.Group | null>(null);
  const monsterFrozenRef = useRef(monsterFrozen);
  monsterFrozenRef.current = monsterFrozen;
  const monsterFreezeMeltRef = useRef(monsterFreezeMelt);
  monsterFreezeMeltRef.current = monsterFreezeMelt;
  const monsterHeartsRef = useRef(monsterHearts);
  monsterHeartsRef.current = monsterHearts;
  const monsterHeartFracRef = useRef(monsterHeartFrac);
  monsterHeartFracRef.current = monsterHeartFrac;
  const playerStatusesRef = useRef(playerStatuses);
  playerStatusesRef.current = playerStatuses;
  const monsterStatusesRef = useRef(monsterStatuses);
  monsterStatusesRef.current = monsterStatuses;
  const playerEquippedItemsRef = useRef(playerEquippedItems);
  playerEquippedItemsRef.current = playerEquippedItems;
  const playerConfigRef = useRef(playerConfig);
  playerConfigRef.current = playerConfig;
  const playerBruiseLevelRef = useRef(playerBruiseLevel);
  playerBruiseLevelRef.current = playerBruiseLevel;
  const playerBleedingRef = useRef(playerBleeding);
  playerBleedingRef.current = playerBleeding;
  const playerStressLevelRef = useRef(playerStressLevel);
  playerStressLevelRef.current = playerStressLevel;
  // Gotas de suor em queda (estresse alto).
  const sweatDropsRef = useRef<{ spr: THREE.Sprite; start: number; x: number; y: number; dur: number }[]>([]);
  // Gotas de sangue em queda (sprites anexados ao jogador nativo quando sangra).
  const bloodDropsRef = useRef<{ spr: THREE.Sprite; start: number; x: number; y: number; dur: number }[]>([]);
  // Última "chave" dos corações renderizada (para atualizar o sprite sem re-render)
  const monsterHeartsDrawnRef = useRef<string>('');
  // Estilhaçamento do gelo no fatality (quando o monstro morre congelado)
  const iceShatterRef = useRef<number | null>(null);
  // Poça de água que cresce conforme o gelo derrete
  const puddleRef = useRef<THREE.Mesh | null>(null);
  // Animal da transformação (sapo/rato/porco/coelho) renderizado na cena
  const transformAnimalRef = useRef<THREE.Object3D | null>(null);
  // Fuga no golpe final (monstro pula para fora) e caminhada do jogador ao centro
  const monsterFleeStartRef = useRef<number | null>(null);
  const playerWalkStartRef = useRef<number | null>(null);
  const playerWalkStartXRef = useRef(-3.6);
  // Recuo do jogador ao bater no gelo
  const playerRecoilStartRef = useRef<number | null>(null);
  const playerRecoilStartXRef = useRef(0);
  // Métricas do stage (w/h/offsets) para projetar a posição atual das entidades por frame
  const stageMetricsRef = useRef({ w: 0, h: 0, offsetX: 0, offsetBottom: 0 });

  // Ref para atualizar posições de overlay sem reconstruir o renderer
  const updateOverlayPositionsRef = useRef<(() => void) | null>(null);

  // Mantém o valor ATUAL do slider de distância de ataque acessível aos closures
  // antigos (updateOverlayPositions é criado no mount; sem isso ele usaria o valor
  // inicial e reverteria --attack-dist para o automático em resize/câmera).
  const attackDistRef = useRef<number | undefined>(attackDist);
  attackDistRef.current = attackDist;

  // 2. Câmera Isométrica com Profundidade 3D Rica em Desktop e Mobile (função desacoplada)
  const computeCameraConfig = (currAspect: number, pMode?: 'desktop' | 'mobile', pPitch = 0, pDist = 0, pTargetY = 0) => {
    const isMobile = pMode ? (pMode === 'mobile') : (typeof window !== 'undefined' ? (window.innerWidth <= 768 || currAspect < 1.35) : false);

    // Distância base em Z: mantém ambos os combatentes (-3.6 a +3.6) no campo de visão
    let baseZ = 12.5;
    if (isMobile) {
      // No mobile (vertical), calcula Z para cobrir os 7.2m de combate com margem elegante
      const targetVisibleWidth = 9.2;
      const requiredZ = targetVisibleWidth / (0.768 * Math.max(0.48, currAspect));
      baseZ = Math.max(12.5, Math.min(16.8, requiredZ));
    }

    // Aplica offset de distância configurável (zoom)
    const effectiveDist = baseZ + (pDist || 0);

    // Ponto focal vertical (centro de interesse no topo da plataforma)
    const baseLookAtY = 0.4 + (pTargetY || 0);

    // Inclinação para manter o ângulo isométrico idêntico ao desktop (~15.6°)
    const pitchDeg = 15.6 + (pPitch || 0);
    const pitchRad = (pitchDeg * Math.PI) / 180;
    const effectiveCamY = baseLookAtY + (effectiveDist * Math.tan(pitchRad));

    return {
      camY: effectiveCamY,
      camZ: effectiveDist,
      lookAtY: baseLookAtY,
    };
  };

  // Atualiza a câmera e projeção matematicamente em tempo real SEM descartar o WebGL
  useEffect(() => {
    const camera = cameraRef.current;
    const container = containerRef.current;
    if (!camera || !container) return;
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w === 0 || h === 0) return;

    const currAspect = w / h;
    const camCfg = computeCameraConfig(currAspect, deviceMode, cameraPitch, cameraDist, cameraTargetY);
    camera.aspect = currAspect;
    camera.position.set(0, camCfg.camY, camCfg.camZ);
    camera.lookAt(0, camCfg.lookAtY, 0);
    camera.updateProjectionMatrix();

    updateOverlayPositionsRef.current?.();
  }, [cameraPitch, cameraDist, cameraTargetY, deviceMode]);

  // Mede o espaço disponível e calcula o "stage" com a proporção fixa (letterbox)
  useEffect(() => {
    const outer = outerRef.current;
    if (!outer) return;
    const measure = () => {
      const aw = outer.clientWidth;
      const ah = outer.clientHeight;
      if (aw === 0 || ah === 0) return;
      const areaAspect = aw / ah;
      let w: number, h: number;
      if (areaAspect > STAGE_ASPECT) {
        // Área mais larga que o alvo → limita pela altura, margem nas laterais
        h = ah;
        w = Math.round(ah * STAGE_ASPECT);
      } else {
        // Área mais alta que o alvo → limita pela largura, margem em cima/baixo
        w = aw;
        h = Math.round(aw / STAGE_ASPECT);
      }
      setStageSize(prev => (prev.w === w && prev.h === h ? prev : { w, h }));
      onStageSizeChange?.({ w, h });
    };
    measure();
    const ro = new ResizeObserver(() => measure());
    ro.observe(outer);
    window.addEventListener('resize', measure);
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); };
  }, [STAGE_ASPECT]);

  // Refs de estado de animação para transições suaves da sombra
  const playerAnimRef = useRef(playerAnim);
  const monsterAnimRef = useRef(monsterAnim);
  const playerAttackStartRef = useRef<number | null>(null);
  const monsterAttackStartRef = useRef<number | null>(null);

  // Atualiza refs ao alterar props de animação
  useEffect(() => {
    if (playerAnim !== playerAnimRef.current) {
      if (playerAnim.startsWith('attack')) {
        playerAttackStartRef.current = performance.now() / 1000;
      }
      playerAnimRef.current = playerAnim;
    }
  }, [playerAnim]);

  useEffect(() => {
    if (monsterAnim !== monsterAnimRef.current) {
      if (monsterAnim.startsWith('attack')) {
        monsterAttackStartRef.current = performance.now() / 1000;
      }
      monsterAnimRef.current = monsterAnim;
    }
  }, [monsterAnim]);

  // Efeito dinâmico de cura na luz da cena 3D
  useEffect(() => {
    if (!healLightRef.current) return;
    if (healActive) {
      healLightRef.current.intensity = 3.5;
      healLightRef.current.color.set('#2dd4bf');
    } else {
      healLightRef.current.intensity = 0;
    }
  }, [healActive]);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    // @ts-ignore
    let isDisposed = false;
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 450;
    const aspect = width / height;

    // 1. Configurações Temáticas por Bioma
    const isPlains = biome === 'plains';
    const isNether = biome === 'nether';
    const isDesert = biome === 'desert';
    const isSnow = biome === 'snow';
    const isEnd = biome === 'end';

    let skyHex = '#78a7ff';
    let fogHex = '#78a7ff';
    let fogDensity = 0.022;

    if (isNether) {
      skyHex = '#1c0508';
      fogHex = '#2d0a0e';
      fogDensity = 0.032;
    } else if (isDesert) {
      skyHex = '#6eb6ff';
      fogHex = '#bde0fe';
      fogDensity = 0.016;
    } else if (isSnow) {
      skyHex = '#8faec9';
      fogHex = '#a9c2d6';
      fogDensity = 0.026;
    } else if (isEnd) {
      skyHex = '#0a0514';
      fogHex = '#130924';
      fogDensity = 0.028;
    }

    const scene = new THREE.Scene();
    sceneRef.current = scene;
    const skyColor = new THREE.Color(skyHex);
    scene.background = skyColor;
    scene.fog = new THREE.FogExp2(new THREE.Color(fogHex), fogDensity);

    const initialCam = computeCameraConfig(aspect, deviceMode, cameraPitch, cameraDist, cameraTargetY);
    const camera = new THREE.PerspectiveCamera(42, aspect, 0.1, 150);
    camera.position.set(0, initialCam.camY, initialCam.camZ);
    camera.lookAt(0, initialCam.lookAtY, 0);
    cameraRef.current = camera;

    // 3. Renderer Three.js
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = isNether ? 1.25 : (isEnd ? 1.2 : 1.1);

    // 4. Luzes da Arena adaptadas ao bioma
    let hemiSky = '#b8d5ff';
    let hemiGround = '#4d6932';
    let dirColor = '#fff4e0';
    let dirIntensity = 1.6;
    let ambColor = '#a0b8d8';
    let ambIntensity = 0.4;

    if (isNether) {
      hemiSky = '#ff4d2d';
      hemiGround = '#22080a';
      dirColor = '#ff6622';
      dirIntensity = 1.8;
      ambColor = '#661118';
      ambIntensity = 0.55;
    } else if (isDesert) {
      hemiSky = '#dbeafe';
      hemiGround = '#b48c4a';
      dirColor = '#fff5d0';
      dirIntensity = 2.0;
      ambColor = '#ffe8ba';
      ambIntensity = 0.45;
    } else if (isSnow) {
      hemiSky = '#f1f5f9';
      hemiGround = '#64748b';
      dirColor = '#e0f2fe';
      dirIntensity = 1.5;
      ambColor = '#cbd5e1';
      ambIntensity = 0.5;
    } else if (isEnd) {
      hemiSky = '#c084fc';
      hemiGround = '#1e1b4b';
      dirColor = '#d8b4fe';
      dirIntensity = 1.4;
      ambColor = '#3b0764';
      ambIntensity = 0.6;
    }

    const hemiLight = new THREE.HemisphereLight(hemiSky, hemiGround, 0.85);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(dirColor, dirIntensity);
    sunLight.position.set(8, 16, 10);
    scene.add(sunLight);

    const ambientLight = new THREE.AmbientLight(ambColor, ambIntensity);
    scene.add(ambientLight);

    const healLight = new THREE.PointLight('#2dd4bf', 0, 10, 1.5);
    healLight.position.set(3.5, 1.2, 0);
    scene.add(healLight);
    healLightRef.current = healLight;

    // 5. Texturas e Materiais dos Blocos por Bioma
    let platformTex = getStoneBricksTexture();
    if (isNether) platformTex = getNetherBricksTexture();
    else if (isDesert) platformTex = getSandstoneTexture();
    else if (isSnow) platformTex = getIceStoneTexture();
    else if (isEnd) platformTex = getPurpurTexture();

    const boxGeo = new THREE.BoxGeometry(1, 1, 1);

    const platformMaterial = new THREE.MeshStandardMaterial({
      map: platformTex,
      roughness: isSnow ? 0.7 : 0.85,
      metalness: isSnow ? 0.1 : 0.05,
    });

    let groundMaterials: THREE.MeshStandardMaterial | THREE.MeshStandardMaterial[];
    if (isNether) {
      groundMaterials = new THREE.MeshStandardMaterial({ map: getNetherrackTexture(), roughness: 0.92 });
    } else if (isDesert) {
      groundMaterials = new THREE.MeshStandardMaterial({ map: getSandTexture(), roughness: 0.95 });
    } else if (isSnow) {
      const snowTop = getSnowTopTexture();
      const snowSide = getSnowSideTexture();
      const dirtTex = getDirtTexture();
      groundMaterials = [
        new THREE.MeshStandardMaterial({ map: snowSide, roughness: 0.9 }),
        new THREE.MeshStandardMaterial({ map: snowSide, roughness: 0.9 }),
        new THREE.MeshStandardMaterial({ map: snowTop, roughness: 0.85 }),
        new THREE.MeshStandardMaterial({ map: dirtTex, roughness: 0.95 }),
        new THREE.MeshStandardMaterial({ map: snowSide, roughness: 0.9 }),
        new THREE.MeshStandardMaterial({ map: snowSide, roughness: 0.9 }),
      ];
    } else if (isEnd) {
      groundMaterials = new THREE.MeshStandardMaterial({ map: getEndStoneTexture(), roughness: 0.88 });
    } else {
      // plains
      const grassTopTex = getGrassTopTexture();
      const grassSideTex = getGrassSideTexture();
      const dirtTex = getDirtTexture();
      groundMaterials = [
        new THREE.MeshStandardMaterial({ map: grassSideTex, roughness: 0.9 }),
        new THREE.MeshStandardMaterial({ map: grassSideTex, roughness: 0.9 }),
        new THREE.MeshStandardMaterial({ map: grassTopTex, roughness: 0.85 }),
        new THREE.MeshStandardMaterial({ map: dirtTex, roughness: 0.95 }),
        new THREE.MeshStandardMaterial({ map: grassSideTex, roughness: 0.9 }),
        new THREE.MeshStandardMaterial({ map: grassSideTex, roughness: 0.9 }),
      ];
    }

    // 6. Plataforma de Luta
    const platW = 14;
    const platD = 8;
    const platCount = platW * platD;
    const platformMesh = new THREE.InstancedMesh(boxGeo, platformMaterial, platCount);

    const dummy = new THREE.Object3D();
    let idx = 0;
    const halfW = platW / 2;
    const halfD = platD / 2;

    for (let x = 0; x < platW; x++) {
      for (let z = 0; z < platD; z++) {
        const posX = x - halfW + 0.5;
        const posZ = z - halfD + 0.5;
        dummy.position.set(posX, 0, posZ);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        platformMesh.setMatrixAt(idx++, dummy.matrix);
      }
    }
    platformMesh.instanceMatrix.needsUpdate = true;
    scene.add(platformMesh);

    // 7. Chão Circundante do Bioma
    const grassW = 42;
    const grassD = 38;
    const totalGrass = grassW * grassD;
    const grassMesh = new THREE.InstancedMesh(boxGeo, groundMaterials, totalGrass);

    let gIdx = 0;
    const gHalfW = grassW / 2;
    const gHalfD = grassD / 2;
    const grassCenterZOffset = 5;

    for (let x = 0; x < grassW; x++) {
      for (let z = 0; z < grassD; z++) {
        const posX = x - gHalfW + 0.5;
        const posZ = (z - gHalfD + 0.5) + grassCenterZOffset;
        dummy.position.set(posX, -2, posZ);
        dummy.scale.set(1, 3, 1);
        dummy.updateMatrix();
        grassMesh.setMatrixAt(gIdx++, dummy.matrix);
      }
    }
    grassMesh.instanceMatrix.needsUpdate = true;
    scene.add(grassMesh);

    // 8. Astro Celeste (Sol / Fenda Infernal / Vórtice Ender)
    let sunGeo: THREE.BufferGeometry | null = null;
    let sunMat: THREE.Material | null = null;
    let sunMesh: THREE.Mesh | null = null;

    if (isPlains || isDesert || isSnow) {
      const sunTex = getSunTexture();
      sunGeo = new THREE.PlaneGeometry(isDesert ? 7.5 : (isSnow ? 5.5 : 6), isDesert ? 7.5 : (isSnow ? 5.5 : 6));
      sunMat = new THREE.MeshBasicMaterial({
        map: sunTex,
        transparent: true,
        depthWrite: false,
        color: isSnow ? '#e0f2fe' : (isDesert ? '#fff8db' : '#ffffff'),
      });
      sunMesh = new THREE.Mesh(sunGeo, sunMat);
      sunMesh.position.set(14, 18, -25);
      sunMesh.lookAt(0, 5, 0);
      scene.add(sunMesh);
    } else if (isEnd) {
      // Vórtice cósmico roxo do Ender
      sunGeo = new THREE.PlaneGeometry(8, 8);
      const canvasVortex = document.createElement('canvas');
      canvasVortex.width = 32;
      canvasVortex.height = 32;
      const vCtx = canvasVortex.getContext('2d')!;
      const vGrad = vCtx.createRadialGradient(16, 16, 2, 16, 16, 15);
      vGrad.addColorStop(0, '#ffffff');
      vGrad.addColorStop(0.3, '#c084fc');
      vGrad.addColorStop(0.7, '#6b21a8');
      vGrad.addColorStop(1, 'rgba(0,0,0,0)');
      vCtx.fillStyle = vGrad;
      vCtx.fillRect(0, 0, 32, 32);
      const vortexTex = new THREE.CanvasTexture(canvasVortex);
      sunMat = new THREE.MeshBasicMaterial({
        map: vortexTex,
        transparent: true,
        depthWrite: false,
      });
      sunMesh = new THREE.Mesh(sunGeo, sunMat);
      sunMesh.position.set(14, 18, -25);
      sunMesh.lookAt(0, 5, 0);
      scene.add(sunMesh);
    }

    // 9. Nuvens Cúbicas (Plains, Desert e Snow)
    let cloudMat: THREE.MeshBasicMaterial | null = null;
    let cloudsGroup: THREE.Group | null = null;
    if (isPlains || isDesert || isSnow) {
      cloudsGroup = new THREE.Group();
      cloudsGroupRef.current = cloudsGroup;
      cloudMat = new THREE.MeshBasicMaterial({
        color: isDesert ? '#fff7ed' : '#ffffff',
        transparent: true,
        opacity: isDesert ? 0.6 : (isSnow ? 0.75 : 0.85),
      });

      const cloudDefs = [
        { x: -18, y: 14, z: -18, w: 12, h: 2, d: 8 },
        { x: -5, y: 15, z: -25, w: 16, h: 2, d: 10 },
        { x: 12, y: 14.5, z: -20, w: 14, h: 2, d: 7 },
        { x: 26, y: 15, z: -15, w: 10, h: 2, d: 6 },
        { x: -28, y: 15.5, z: -12, w: 15, h: 2, d: 9 },
      ];

      cloudDefs.forEach((c) => {
        const cGeo = new THREE.BoxGeometry(c.w, c.h, c.d);
        const cMesh = new THREE.Mesh(cGeo, cloudMat!);
        cMesh.position.set(c.x, c.y, c.z);
        cloudsGroup!.add(cMesh);
      });
      scene.add(cloudsGroup);
    }

    // 10. Partículas Ambientais em 3D (Nether brasas, Snow neve, End partículas)
    const particleCount = (isNether || isSnow || isEnd) ? 45 : 0;
    let particleMesh: THREE.InstancedMesh | null = null;
    let particlePositions: { x: number; y: number; z: number; speed: number; rotSpeed: number }[] = [];
    let particleGeo: THREE.BoxGeometry | null = null;
    let particleMat: THREE.MeshBasicMaterial | null = null;

    if (particleCount > 0) {
      const pSize = isSnow ? 0.16 : (isNether ? 0.18 : 0.22);
      particleGeo = new THREE.BoxGeometry(pSize, pSize, pSize);
      const pColor = isNether ? '#ff6622' : (isSnow ? '#ffffff' : '#c084fc');
      particleMat = new THREE.MeshBasicMaterial({ color: pColor, transparent: true, opacity: isSnow ? 0.85 : 0.75 });
      particleMesh = new THREE.InstancedMesh(particleGeo, particleMat, particleCount);

      for (let i = 0; i < particleCount; i++) {
        particlePositions.push({
          x: (Math.random() - 0.5) * 26,
          y: Math.random() * 14,
          z: (Math.random() - 0.5) * 18,
          speed: isNether ? (0.8 + Math.random() * 1.2) : (isSnow ? -(0.9 + Math.random() * 1.1) : (0.3 + Math.random() * 0.5)),
          rotSpeed: (Math.random() - 0.5) * 2,
        });
      }
      scene.add(particleMesh);
    }

    // 10. Marcadores de Referência dos Personagens na Plataforma (Sombras Base)
    const shadowTexCanvas = document.createElement('canvas');
    shadowTexCanvas.width = 32;
    shadowTexCanvas.height = 32;
    const sCtx = shadowTexCanvas.getContext('2d')!;
    const grad = sCtx.createRadialGradient(16, 16, 2, 16, 16, 15);
    grad.addColorStop(0, 'rgba(0, 0, 0, 0.45)');
    grad.addColorStop(0.5, 'rgba(0, 0, 0, 0.22)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    sCtx.fillStyle = grad;
    sCtx.fillRect(0, 0, 32, 32);

    const shadowTex = new THREE.CanvasTexture(shadowTexCanvas);
    const shadowGeo = new THREE.PlaneGeometry(2.4, 1.5);
    const shadowMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
    });

    const playerShadow = new THREE.Mesh(shadowGeo, shadowMat);
    playerShadow.rotation.x = -Math.PI / 2;
    playerShadow.position.set(-3.6, 0.51, 0.2);
    scene.add(playerShadow);

    const monsterShadow = new THREE.Mesh(shadowGeo, shadowMat);
    monsterShadow.rotation.x = -Math.PI / 2;
    monsterShadow.position.set(3.6, 0.51, 0.2);
    scene.add(monsterShadow);

    // 11. Sincronização de Projeção para Elevação e Posição X dos Personagens na Plataforma
    const updateOverlayPositions = () => {
      if (!container || !camera) return;
      const h = container.clientHeight;
      const w = container.clientWidth;
      if (h === 0 || w === 0) return;

      camera.updateMatrixWorld();

      // Ponto na superfície da plataforma de pedra sob o jogador
      const pGround = new THREE.Vector3(-3.6, 0.51, 0.2);
      pGround.project(camera);
      const pLeftPx = (pGround.x * 0.5 + 0.5) * w;
      const pBottomPx = (pGround.y * 0.5 + 0.5) * h;

      // Ponto na superfície da plataforma de pedra sob o monstro
      const mGround = new THREE.Vector3(3.6, 0.51, 0.2);
      mGround.project(camera);
      const mLeftPx = (mGround.x * 0.5 + 0.5) * w;
      const mBottomPx = (mGround.y * 0.5 + 0.5) * h;

      // Compensa o padding inferior da arena (60px no desktop, 16px no mobile)
      const isMobile = deviceMode ? (deviceMode === 'mobile') : (window.innerWidth <= 768);
      const bottomPadding = isMobile ? 16 : 60;
      const pLift = Math.max(0, pBottomPx - bottomPadding);
      const mLift = Math.max(0, mBottomPx - bottomPadding);
      const attackDistPx = Math.max(50, Math.round(mLeftPx - pLeftPx));
      // Usa a distância configurada pelo slider quando > 0 (lido do ref = valor ATUAL)
      const configuredDist = attackDistRef.current;
      const finalAttackDist = (configuredDist && configuredDist > 0) ? configuredDist : attackDistPx;

      // As posições projetadas são relativas ao STAGE (letterbox). O wrapper do jogador/
      // monstro/projétil usa coordenadas relativas à ARENA, então somamos o deslocamento
      // do stage dentro da arena (centralização). As vars vão para a ARENA (ancestral comum).
      const outer = outerRef.current;
      const arenaEl = (outer?.parentElement || container.parentElement) as HTMLElement | null;
      let stageOffsetX = 0;
      let stageOffsetBottom = 0;
      if (outer && arenaEl) {
        const outerRect = outer.getBoundingClientRect();
        const arenaRect = arenaEl.getBoundingClientRect();
        stageOffsetX = outerRect.left - arenaRect.left;
        // `bottom` é medido a partir da base da arena:
        stageOffsetBottom = arenaRect.bottom - outerRect.bottom;
      }
      const pBottomArena = pBottomPx + stageOffsetBottom;
      const mBottomArena = mBottomPx + stageOffsetBottom;
      // Guarda métricas para projeção por frame (nome/corações seguem o avanço)
      stageMetricsRef.current = { w, h, offsetX: stageOffsetX, offsetBottom: stageOffsetBottom };

      // Fase B (unificado): projeta a CABEÇA dos bonecos 3D para ancorar nome/corações.
      // Em modo unificado o corpo é renderizado na cena (altura = UNIFIED_ENTITY_HEIGHT),
      // então escrevemos a altura em px (dos pés ao topo da cabeça) nas variáveis
      // --shadow-*-head-lift. Sem unificado, a UI usa a altura natural do overlay.
      let mHeadLift = 0;
      let pHeadLift = 0;
      if (unified3DRef.current) {
        const mHeadY = 0.51 + UNIFIED_ENTITY_HEIGHT * Math.max(0.2, monsterZoomRef.current || 1);
        const pHeadY = 0.51 + UNIFIED_ENTITY_HEIGHT;
        const mHead = new THREE.Vector3(3.6, mHeadY, 0.2).project(camera);
        const pHead = new THREE.Vector3(-3.6, pHeadY, 0.2).project(camera);
        const mHeadTop = (mHead.y * 0.5 + 0.5) * h + stageOffsetBottom;
        const pHeadTop = (pHead.y * 0.5 + 0.5) * h + stageOffsetBottom;
        mHeadLift = Math.max(0, Math.round(mHeadTop - mBottomArena));
        pHeadLift = Math.max(0, Math.round(pHeadTop - pBottomArena));
      }

      if (arenaEl) {
        arenaEl.style.setProperty('--shadow-player-lift', `${Math.round(pLift)}px`);
        arenaEl.style.setProperty('--shadow-monster-lift', `${Math.round(mLift)}px`);
        arenaEl.style.setProperty('--shadow-player-bottom', `${Math.round(pBottomArena)}px`);
        arenaEl.style.setProperty('--shadow-monster-bottom', `${Math.round(mBottomArena)}px`);
        arenaEl.style.setProperty('--shadow-player-x', `${Math.round(pLeftPx + stageOffsetX)}px`);
        arenaEl.style.setProperty('--shadow-monster-x', `${Math.round(mLeftPx + stageOffsetX)}px`);
        arenaEl.style.setProperty('--shadow-monster-head-lift', `${mHeadLift}px`);
        arenaEl.style.setProperty('--shadow-player-head-lift', `${pHeadLift}px`);
        arenaEl.style.setProperty('--shadow-attack-dist', `${attackDistPx}px`);
        arenaEl.style.setProperty('--attack-dist', `${finalAttackDist}px`);
      }
    };
    updateOverlayPositionsRef.current = updateOverlayPositions;
    updateOverlayPositions();

    // 12. Loop de Animação e Renderização
    const clock = new THREE.Clock();

    const animate = () => {
      if (isDisposed) return;
      animFrameRef.current = requestAnimationFrame(animate);
      // IMPORTANTE: getDelta() deve ser chamado UMA vez por frame. getElapsedTime() também
      // consome o delta internamente, então lemos clock.elapsedTime (já atualizado).
      const delta = clock.getDelta();
      const elapsedTime = clock.elapsedTime;

      // Atualiza os mixers de animação das entidades unificadas (Fase B)
      if (unifiedMonsterMixerRef.current) {
        unifiedMonsterMixerRef.current.timeScale = monsterSlowFactorRef.current;
        unifiedMonsterMixerRef.current.update(delta);
      }
      if (unifiedPlayerMixerRef.current) unifiedPlayerMixerRef.current.update(delta);
      // Jogador NATIVO (skinview3d): avança a PlayerAnimation manualmente.
      if (nativePlayerRef.current) {
        try { nativePlayerRef.current.anim?.update?.(nativePlayerRef.current.player, delta); } catch { /* noop */ }
      }
      // Derretimento ao queimar: encolhe verticalmente (scaleY) conforme o nível do fogo.
      if (unifiedMonsterRootRef.current && monsterDamageEffectRef.current === 'burn' && monsterEffectLevelRef.current > 0) {
        const meltPct = Math.max(0.55, 1 - monsterEffectLevelRef.current * 0.09);
        unifiedMonsterRootRef.current.scale.y = unifiedMonsterBaseScaleRef.current * meltPct;
      } else if (unifiedMonsterRootRef.current && unifiedMonsterRootRef.current.scale.y !== unifiedMonsterBaseScaleRef.current) {
        unifiedMonsterRootRef.current.scale.y = unifiedMonsterBaseScaleRef.current;
      }
      // Avanço do ataque corpo a corpo (tween de X) no loop
      const nowMs = performance.now();
      const monSpecialActive = !!monsterSpecialRef.current;
      const playSpecialActive = !!playerSpecialRef.current;
      if (!monSpecialActive) updateMoveTween(monsterMoveRef, unifiedMonsterGroupRef.current, nowMs);
      if (!playSpecialActive) updateMoveTween(playerMoveRef, unifiedPlayerGroupRef.current, nowMs);
      // Recuo do jogador ao bater no gelo: volta para trás (seno) e retorna (~0.5s).
      if (unifiedPlayerGroupRef.current && playerRecoilStartRef.current != null) {
        const rel = (nowMs - playerRecoilStartRef.current) / 1000;
        if (rel < 0.5) {
          unifiedPlayerGroupRef.current.position.x = playerRecoilStartXRef.current - Math.sin((rel / 0.5) * Math.PI) * 1.3;
        } else {
          playerRecoilStartRef.current = null;
        }
      }
      // Fuga do monstro no golpe final: vira para o lado oposto, pula e some da arena.
      if (unifiedMonsterGroupRef.current && monsterFleeStartRef.current != null) {
        const el = (nowMs - monsterFleeStartRef.current) / 1000;
        const t = clamp01(el / 1.6);
        const g = unifiedMonsterGroupRef.current;
        g.rotation.y = -Math.PI / 2; // encara o lado oposto ao jogador
        g.position.x = 3.6 + easeInOut(t) * 11; // pula para fora da arena
        g.position.y = 0.51 + Math.sin(clamp01(el / 1.6) * Math.PI) * 2.6; // arco do pulo
        g.scale.setScalar(Math.max(0.35, 1 - t * 0.45));
        if (t >= 1) g.visible = false;
      }
      // Jogador caminha calmamente até o centro e lamenta (vitória sem baú).
      if (unifiedPlayerGroupRef.current && playerWalkStartRef.current != null) {
        const el = (nowMs - playerWalkStartRef.current) / 1000;
        const g = unifiedPlayerGroupRef.current;
        const walkT = clamp01(el / 1.8);
        g.position.x = playerWalkStartXRef.current * (1 - easeInOut(walkT));
        // Olha para onde o monstro fugiu (+x). Base de combate difere por tipo de boneco.
        g.rotation.y = (nativePlayerRef.current ? Math.PI / 2 : -Math.PI / 2) + THREE.MathUtils.degToRad(playerRotYRef.current);
      }
      // Fatality (morte) no loop
      applyDeathTween(monsterDeathRef, unifiedMonsterGroupRef.current, nowMs);
      applyDeathTween(playerDeathRef, unifiedPlayerGroupRef.current, nowMs);
      // Golpe especial procedural no loop
      applySpecialTween(monsterSpecialRef, unifiedMonsterGroupRef.current, nowMs, true);
      applySpecialTween(playerSpecialRef, unifiedPlayerGroupRef.current, nowMs, false);
      // Pose de arremesso do projétil (ranged)
      applyThrowTween(monsterThrowStartRef, unifiedMonsterGroupRef.current, nowMs);

      // Sincroniza os nomes 3D (sprites) com a posição dos bonecos, e os oculta
      // quando o boneco some da arena (fuga/morte).
      if (monsterNameGroupRef.current && unifiedMonsterGroupRef.current) {
        const g = unifiedMonsterGroupRef.current;
        monsterNameGroupRef.current.position.set(g.position.x, g.position.y + monsterHeadTopRef.current + 0.38, g.position.z + 0.01);
        // Some quando o monstro morre (death-*), foge ou está congelado.
        const monsterDead = String(monsterAnimRef.current || '').startsWith('death-');
        monsterNameGroupRef.current.visible = g.visible && !monsterFrozenRef.current && !monsterDead;
      }
      if (playerNameGroupRef.current && unifiedPlayerGroupRef.current) {
        const g = unifiedPlayerGroupRef.current;
        playerNameGroupRef.current.position.set(g.position.x, g.position.y + UNIFIED_ENTITY_HEIGHT + 0.34, g.position.z + 0.01);
        playerNameGroupRef.current.visible = g.visible;
      }
      // Barras de condições do jogador: seguem o boneco e atualizam a textura por frame.
      if (playerStatusGroupRef.current && unifiedPlayerGroupRef.current) {
        const g = unifiedPlayerGroupRef.current;
        playerStatusGroupRef.current.position.set(g.position.x, g.position.y + UNIFIED_ENTITY_HEIGHT + 0.34 + 0.28, g.position.z + 0.02);
        playerStatusGroupRef.current.visible = g.visible;
        const statuses = playerStatusesRef.current || [];
        const key = statuses.length === 0 ? 'none' : statuses.map(s => `${s.type}:${Math.round((s.pct || 0) * 100)}`).join('|');
        if (key !== playerStatusDrawnRef.current) {
          playerStatusDrawnRef.current = key;
          const current = playerStatusSpriteRef.current;
          if (current) {
            current.material.map?.dispose?.();
            const next = makeStatusBarsSprite(statuses);
            next.visible = statuses.length > 0;
            current.parent?.add(next);
            current.parent?.remove(current);
            playerStatusSpriteRef.current = next;
          }
        }
      }
      // Atualiza o sprite 3D de corações quando o número/fração muda (sem re-render).
      if (monsterHeartsSpriteRef.current) {
        const hearts = Math.max(0, Math.floor(monsterHeartsRef.current));
        const key = `${hearts}_${Math.round(monsterHeartFracRef.current * 100)}`;
        if (key !== monsterHeartsDrawnRef.current) {
          monsterHeartsDrawnRef.current = key;
          const current = monsterHeartsSpriteRef.current;
          current.material.map?.dispose?.();
          const next = makeHeartsSprite(hearts, monsterHeartFracRef.current);
          next.position.copy(current.position);
          next.visible = hearts > 0;
          current.parent?.add(next);
          current.parent?.remove(current);
          monsterHeartsSpriteRef.current = next;
        }
      }
      // Barras de efeito do monstro (acima do nome): atualiza a textura por frame.
      if (monsterStatusSpriteRef.current) {
        const statuses = monsterStatusesRef.current || [];
        const key = statuses.length === 0 ? 'none' : statuses.map(s => `${s.type}:${Math.round((s.pct || 0) * 100)}`).join('|');
        if (key !== monsterStatusDrawnRef.current) {
          monsterStatusDrawnRef.current = key;
          const current = monsterStatusSpriteRef.current;
          current.material.map?.dispose?.();
          const next = makeStatusBarsSprite(statuses);
          next.position.copy(current.position);
          next.visible = statuses.length > 0;
          current.parent?.add(next);
          current.parent?.remove(current);
          monsterStatusSpriteRef.current = next;
        }
      }

      // Projeta a posição ATUAL do monstro/jogador (para nome/corações seguirem o avanço
      // e os golpes). Só quando há movimento ativo (tween de ataque/especial/morte).
      const cam = cameraRef.current;
      const mets = stageMetricsRef.current;
      const arenaEl = (outerRef.current?.parentElement || containerRef.current?.parentElement) as HTMLElement | null;
      if (cam && mets.w > 0 && (monsterMoveRef.current || monsterSpecialRef.current || monsterDeathRef.current) && unifiedMonsterGroupRef.current) {
        const g = unifiedMonsterGroupRef.current.position;
        const mp = new THREE.Vector3(g.x, g.y, 0.2).project(cam);
        const mX = (mp.x * 0.5 + 0.5) * mets.w + mets.offsetX;
        const mB = (mp.y * 0.5 + 0.5) * mets.h + mets.offsetBottom;
        arenaEl?.style.setProperty('--shadow-monster-x', `${Math.round(mX)}px`);
        arenaEl?.style.setProperty('--shadow-monster-bottom', `${Math.round(mB)}px`);
      }
      if (cam && mets.w > 0 && (playerMoveRef.current || playerSpecialRef.current || playerDeathRef.current) && unifiedPlayerGroupRef.current) {
        const g = unifiedPlayerGroupRef.current.position;
        const pp = new THREE.Vector3(g.x, g.y, 0.2).project(cam);
        const pX = (pp.x * 0.5 + 0.5) * mets.w + mets.offsetX;
        const pB = (pp.y * 0.5 + 0.5) * mets.h + mets.offsetBottom;
        arenaEl?.style.setProperty('--shadow-player-x', `${Math.round(pX)}px`);
        arenaEl?.style.setProperty('--shadow-player-bottom', `${Math.round(pB)}px`);
      }
      // Respiração procedural no idle (o GLB pode não ter animação de idle própria):
      // leve escala oscilando (~1.5%) — os pés ficam fixos pois o grupo escala a partir da base.
      if (unifiedMonsterGroupRef.current && !isCombatAnim(monsterAnimRef.current) && !monSpecialActive && !monsterFrozenRef.current && monsterFleeStartRef.current == null) {
        unifiedMonsterGroupRef.current.scale.setScalar(1 + Math.sin(elapsedTime * 2.4) * 0.015);
      }
      // Congelado: sem respiração e permanece virado para o JOGADOR (última posição antes do golpe).
      if (unifiedMonsterGroupRef.current && monsterFrozenRef.current) {
        unifiedMonsterGroupRef.current.rotation.y = Math.PI / 2 + THREE.MathUtils.degToRad(monsterRotYRef.current);
      }
      if (unifiedPlayerGroupRef.current && !isCombatAnim(playerAnimRef.current) && !playSpecialActive) {
        unifiedPlayerGroupRef.current.scale.setScalar(1 + Math.sin(elapsedTime * 2.4 + 0.6) * 0.015);
      }
      // Pingos de sangue: criados enquanto o jogador sangra e caem com gravidade.
      const nativePl = nativePlayerRef.current?.player;
      if (nativePl && playerBleedingRef.current) {
        const drops = bloodDropsRef.current;
        const spawnRate = 0.04;
        if (Math.random() < spawnRate && drops.length < 14) {
          const tex = getBloodDripTexture();
          const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: true, depthWrite: false, sizeAttenuation: true });
          const spr = new THREE.Sprite(mat);
          const sz = 0.02 + Math.random() * 0.025;
          spr.scale.set(sz, sz * 2.2, 1);
          // Começa em um ponto aleatório da metade superior do corpo.
          spr.position.set((Math.random() * 2 - 1) * 0.25, 0.3 + Math.random() * 1.2, 0.05);
          nativePl.add(spr);
          drops.push({ spr, start: performance.now(), x: spr.position.x, y: spr.position.y, dur: 0.7 + Math.random() * 0.4 });
        }
        for (let i = drops.length - 1; i >= 0; i--) {
          const d = drops[i];
          const t = (nowMs - d.start) / 1000;
          if (t >= d.dur || !d.spr.parent) {
            d.spr.parent?.remove(d.spr);
            d.spr.material.dispose();
            drops.splice(i, 1);
            continue;
          }
          const prog = t / d.dur;
          d.spr.position.y = d.y - easeInOut(prog) * 1.2;
          d.spr.position.x = d.x + Math.sin(t * 8) * 0.004;
          (d.spr.material as THREE.SpriteMaterial).opacity = 1 - prog;
        }
      } else if (bloodDropsRef.current.length) {
        bloodDropsRef.current.forEach(d => { d.spr.parent?.remove(d.spr); d.spr.material.dispose(); });
        bloodDropsRef.current = [];
      }
      // SUOR (estresse): gotas pequenas brotam na cabeça e escorrem conforme o estresse.
      const stress = Math.max(0, Math.min(1, playerStressLevelRef.current));
      const sweatDrops = sweatDropsRef.current;
      if (nativePl && stress > 0.2) {
        const spawnRate = 0.02 + stress * 0.05;
        if (Math.random() < spawnRate && sweatDrops.length < 3 + Math.round(stress * 4)) {
          const tex = getSweatTexture();
          const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: true, depthWrite: false, sizeAttenuation: true, opacity: 0.85 });
          const spr = new THREE.Sprite(mat);
          const sz = 0.02 + Math.random() * 0.015;
          spr.scale.set(sz, sz, 1);
          spr.position.set((Math.random() * 2 - 1) * 0.12, 1.6 + Math.random() * 0.35, 0.3);
          nativePl.add(spr);
          sweatDrops.push({ spr, start: performance.now(), x: spr.position.x, y: spr.position.y, dur: 1.2 + Math.random() * 0.8 });
        }
        for (let i = sweatDrops.length - 1; i >= 0; i--) {
          const d = sweatDrops[i];
          const t = (nowMs - d.start) / 1000;
          if (t >= d.dur || !d.spr.parent) {
            d.spr.parent?.remove(d.spr);
            d.spr.material.dispose();
            sweatDrops.splice(i, 1);
            continue;
          }
          const prog = t / d.dur;
          d.spr.position.y = d.y - easeInOut(prog) * 0.6;
          d.spr.position.x = d.x + Math.sin(t * 3) * 0.008;
          (d.spr.material as THREE.SpriteMaterial).opacity = 0.85 * (1 - prog * 0.7);
        }
      } else if (sweatDrops.length) {
        sweatDrops.forEach(d => { d.spr.parent?.remove(d.spr); d.spr.material.dispose(); });
        sweatDropsRef.current = [];
      }
      // Recuo ao levar dano (hurt): inclina para trás; restaura quando não há outro
      // tween de rotação-X (especial/morte/arremesso) controlando o monstro.
      if (unifiedMonsterGroupRef.current) {
        const monBusy = monsterSpecialRef.current || monsterDeathRef.current || monsterThrowStartRef.current;
        if (monsterAnimRef.current === 'hurt') {
          unifiedMonsterGroupRef.current.rotation.x = -0.17;
        } else if (!monBusy) {
          unifiedMonsterGroupRef.current.rotation.x = 0;
        }
      }
      // Rocha de gelo derretendo: escala e opacidade acompanham o freezeMelt, com
      // transição SUAVE (damp) para não "perder o topo" de forma brusca.
      if (iceGroupRef.current) {
        const target = Math.max(0.15, monsterFreezeMeltRef.current ?? 1);
        const cur = iceGroupRef.current.scale.x || target;
        const next = THREE.MathUtils.damp(cur, target, 2.5, delta);
        iceGroupRef.current.scale.setScalar(next);
        iceGroupRef.current.traverse((c) => {
          const mesh = c as THREE.Mesh;
          if (mesh.isMesh && (mesh.material as any)?.opacity !== undefined) {
            (mesh.material as any).opacity = 0.55 * next;
          }
        });
      }
      // Gotas de água escorrendo pelas BORDAS do gelo (caem rápido, visíveis).
      if (iceGroupRef.current) {
        const meltVal = iceGroupRef.current.scale.x || 1;
        const meltIntensity = Math.max(0, Math.min(1, 1 - meltVal));
        iceGroupRef.current.traverse((c) => {
          const mesh = c as THREE.Mesh;
          if (mesh.isMesh && mesh.userData?.isDroplet) {
            mesh.position.y -= (mesh.userData.speed as number) * delta * (2.2 + meltIntensity * 2.0);
            if (mesh.position.y < 0.12) mesh.position.y = mesh.userData.baseY as number;
            // Compensa a escala do gelo: as gotas mantêm o MESMO tamanho (não encolhem).
            mesh.scale.setScalar(1 / Math.max(0.2, meltVal));
            if ((mesh.material as any)?.opacity !== undefined) {
              (mesh.material as any).opacity = 0.6 + meltIntensity * 0.35;
            }
          }
        });
      }
      // Poça de água: visível desde o início (além do gelo), cresce conforme derrete.
      if (puddleRef.current) {
        const meltVal = iceGroupRef.current?.scale.x || 1;
        const puddleAmt = Math.max(0, Math.min(1, 1 - meltVal));
        const cur = puddleRef.current.scale.x || 1.5;
        const next = THREE.MathUtils.damp(cur, 1.5 + puddleAmt * 2.6, 2, delta);
        puddleRef.current.scale.setScalar(next);
        (puddleRef.current.material as any).opacity = 0.28 + puddleAmt * 0.4;
      }

      // Estilhaçamento do gelo (Three): cada bloco voa para fora e some.
      if (iceShatterRef.current != null && iceGroupRef.current) {
        const el = (nowMs - iceShatterRef.current) / 1000;
        const t = clamp01(el / 0.9);
        iceGroupRef.current.children.forEach((child, i) => {
          const mesh = child as THREE.Mesh;
          if (!mesh.userData.shatterStartX) {
            mesh.userData.shatterStartX = mesh.position.x;
            mesh.userData.shatterStartY = mesh.position.y;
            mesh.userData.shatterStartZ = mesh.position.z;
          }
          const dx = (i % 2 === 0 ? 1 : -1) * (1.2 + (i % 3) * 0.9);
          const dy = 0.7 + (i % 4) * 0.6;
          const dz = (i % 3 === 0 ? 1 : -1) * 1.1;
          const ease = easeInOut(t);
          mesh.position.x = mesh.userData.shatterStartX + dx * ease;
          mesh.position.y = mesh.userData.shatterStartY + dy * ease;
          mesh.position.z = mesh.userData.shatterStartZ + dz * ease;
          mesh.rotation.x = t * 1.8;
          mesh.rotation.z = t * 1.4;
          if ((mesh.material as any)?.opacity !== undefined) {
            (mesh.material as any).opacity = 0.55 * (1 - t);
          }
        });
        if (el >= 0.9) {
          const g = unifiedMonsterGroupRef.current;
          if (g && iceGroupRef.current) g.remove(iceGroupRef.current);
          iceGroupRef.current = null;
          if (g && puddleRef.current) g.remove(puddleRef.current);
          puddleRef.current = null;
          iceShatterRef.current = null;
        }
      }

      // Nuvens se deslocam suavemente pelo céu
      if (cloudsGroupRef.current) {
        cloudsGroupRef.current.position.x = (elapsedTime * 0.4) % 60;
      }

      // Partículas flutuantes em tempo real (Nether brasas, Snow neve, End partículas)
      if (particleMesh && particlePositions.length > 0) {
        const pDummy = new THREE.Object3D();
        for (let i = 0; i < particlePositions.length; i++) {
          const p = particlePositions[i];
          p.y += p.speed * 0.016;
          if (isNether && p.y > 15) {
            p.y = 0;
            p.x = (Math.random() - 0.5) * 26;
            p.z = (Math.random() - 0.5) * 18;
          } else if (isSnow && p.y < -1) {
            p.y = 14;
            p.x = (Math.random() - 0.5) * 26;
            p.z = (Math.random() - 0.5) * 18;
          } else if (isEnd && p.y > 14) {
            p.y = 0;
            p.x = (Math.random() - 0.5) * 26;
            p.z = (Math.random() - 0.5) * 18;
          }

          pDummy.position.set(p.x, p.y, p.z);
          pDummy.rotation.x += p.rotSpeed * 0.016;
          pDummy.rotation.y += p.rotSpeed * 0.016;
          pDummy.updateMatrix();
          particleMesh.setMatrixAt(i, pDummy.matrix);
        }
        particleMesh.instanceMatrix.needsUpdate = true;
      }

      // Câmera estável com suave balanço horizontal de respiração
      if (cameraRef.current) {
        const sway = Math.sin(elapsedTime * 0.4) * 0.04;
        cameraRef.current.position.x = sway;
      }

      try {
        renderer.render(scene, camera);
      } catch (renderErr) {
        console.error('[VoxelArena3D] Erro na renderização Three.js:', renderErr);
      }
    };

    animate();

    // 15. Redimensionamento Responsivo e Câmera Adaptativa
    const handleResize = () => {
      if (!container || !renderer || !camera) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w === 0 || h === 0) return;

      const newAspect = w / h;
      camera.aspect = newAspect;

      // Câmera adaptativa para manter visão proporcional em telas verticais/mobile
      const newCam = computeCameraConfig(newAspect, deviceMode, cameraPitch, cameraDist, cameraTargetY);
      camera.position.set(0, newCam.camY, newCam.camZ);
      camera.lookAt(0, newCam.lookAtY, 0);
      camera.updateProjectionMatrix();

      renderer.setSize(w, h);
      updateOverlayPositions();
    };

    window.addEventListener('resize', handleResize);
    const resizeObserver = new ResizeObserver(() => {
      handleResize();
    });
    resizeObserver.observe(container);

    return () => {
      isDisposed = true;
      updateOverlayPositionsRef.current = null;
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
      renderer.dispose();
      boxGeo.dispose();
      platformMaterial.dispose();
      if (Array.isArray(groundMaterials)) {
        groundMaterials.forEach((m) => m.dispose());
      } else if (groundMaterials) {
        (groundMaterials as THREE.Material).dispose();
      }
      if (sunGeo) sunGeo.dispose();
      if (sunMat) sunMat.dispose();
      if (cloudMat) cloudMat.dispose();
      if (particleGeo) particleGeo.dispose();
      if (particleMat) particleMat.dispose();
      shadowGeo.dispose();
      shadowMat.dispose();
    };
  }, [biome]);

  // =====================================================================
  // FASE B (TESTE): renderização UNIFICADA — jogador e monstro GLB dentro
  // da MESMA cena 3D (sem overlays CSS). As posições ficam em coordenadas
  // de mundo e a projeção da câmera resolve automaticamente (sem offsets).
  // =====================================================================

  // Guarda os valores atuais para os callbacks de load assíncrono
  const monsterZoomRef = useRef(monsterZoom);
  monsterZoomRef.current = monsterZoom;
  const monsterRotYRef = useRef(monsterRotY);
  monsterRotYRef.current = monsterRotY;
  const monsterEffectTintRef = useRef(monsterEffectTint);
  monsterEffectTintRef.current = monsterEffectTint;
  const monsterEffectTintAmountRef = useRef(monsterEffectTintAmount);
  monsterEffectTintAmountRef.current = monsterEffectTintAmount;
  const playerEffectTintRef = useRef(playerEffectTint);
  playerEffectTintRef.current = playerEffectTint;
  const playerEffectTintAmountRef = useRef(playerEffectTintAmount);
  playerEffectTintAmountRef.current = playerEffectTintAmount;
  const playerEffectTintStrengthRef = useRef(playerEffectTintStrength);
  playerEffectTintStrengthRef.current = playerEffectTintStrength;
  const monsterEnragedRef = useRef(monsterEnraged);
  monsterEnragedRef.current = monsterEnraged;
  // Rotação extra (graus) do modelo GLB do jogador (config.customRotY)
  const playerRotYRef = useRef(Number((playerConfig as any)?.customRotY ?? 0) || 0);
  playerRotYRef.current = Number((playerConfig as any)?.customRotY ?? 0) || 0;
  // Flag de cena unificada para o closure do updateOverlayPositions (criado uma vez)
  const unified3DRef = useRef(unified3D);
  unified3DRef.current = unified3D;

  // Chaves serializadas: as props `playerConfig`/`playerEquippedItems` costumam chegar
  // como novas REFERÊNCIAS a cada render. Usá-las direto nas deps fazia o efeito de carga
  // rodar em loop (piscava a arena e recarregava os itens 3D sem parar).
  const playerConfigKey = JSON.stringify(playerConfig ?? null);
  const playerEquippedItemsKey = JSON.stringify(playerEquippedItems ?? []);

  // Carrega jogador + monstro GLB e insere na cena.
  useEffect(() => {
    if (!unified3D) return;
    const scene = sceneRef.current;
    if (!scene) return;

    let disposed = false;
    const loader = new GLTFLoader();
    const draco = new DRACOLoader();
    draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
    loader.setDRACOLoader(draco);

    const loadEntity = (
      url: string | null | undefined,
      skinUrl: string | null | undefined,
      x: number,
      zoom: number,
      rotYDeg: number,
      onReady: (group: THREE.Group, root: THREE.Object3D, mixer: THREE.AnimationMixer, actions: Record<string, THREE.AnimationAction>) => void
    ) => {
      if (!url) return;
      const safe = getSafeUrl(url);
      loader.load(safe, (gltf) => {
        if (disposed) return;
        const group = new THREE.Group();
        const root = gltf.scene;
        fitEntityToGround(root, UNIFIED_ENTITY_HEIGHT * Math.max(0.2, zoom || 1));
        group.add(root);
        group.position.set(x, 0.51, 0.2);
        // Rotação inicial de REPOUSO: olham para a câmera (+z), levemente inclinados na
        // direção do oponente para parecerem se encarar. Modelos Blockbench nascem
        // virados para -z, então +Math.PI os vira para a câmera (padrão do jogo atual).
        group.rotation.y = Math.PI - 0.42 + THREE.MathUtils.degToRad(rotYDeg || 0);
        scene.add(group);
        const mixer = new THREE.AnimationMixer(root);
        const actions: Record<string, THREE.AnimationAction> = {};
        gltf.animations.forEach((clip) => { actions[clip.name] = mixer.clipAction(clip); });
        // Aplica a SKIN (se houver) ANTES de concluir (tint + animação).
        applySkinTexture(root, skinUrl, () => {
          if (disposed) return;
          onReady(group, root, mixer, actions);
        });
      }, undefined, (err) => {
        console.warn('[VoxelArena3D] Falha ao carregar GLB unificado:', safe, err);
      });
    };

    // Monstro (GLB)
    loadEntity(monsterModelUrl, monsterSkinUrl, 3.6, monsterZoomRef.current, monsterRotYRef.current, (group, root, mixer, actions) => {
      unifiedMonsterGroupRef.current = group;
      unifiedMonsterRootRef.current = root;
      unifiedMonsterMixerRef.current = mixer;
      unifiedMonsterActionsRef.current = actions;
      unifiedMonsterBaseScaleRef.current = root.scale.x || 1;
      applyEntityTint(root, monsterEffectTintRef.current, monsterEnragedRef.current, monsterEffectTintAmountRef.current);
      playEntityAnimByName(actions, mixer, monsterAnimRef.current);
      // Mede a altura REAL do modelo (após fit) para posicionar o HUD acima da cabeça.
      try {
        const box = computeWorldBox(root);
        if (!box.isEmpty()) monsterHeadTopRef.current = box.max.y;
      } catch { /* usa o fallback */ }
      // Nome acima da cabeça (sprite 3D que acompanha o boneco).
      if (monsterName) {
        const nameGroup = makeNameGroup();
        nameGroup.position.set(0, monsterHeadTopRef.current + 0.38, 0);
        nameGroup.add(makeNameSprite(monsterName, { color: '#ff5a5a' }));
        // Barras de efeito ativo ACIMA do nome (esvaziam por segundo).
        const statusSprite = makeStatusBarsSprite(monsterStatusesRef.current);
        statusSprite.position.y = 0.34;
        statusSprite.visible = monsterStatusesRef.current.length > 0;
        nameGroup.add(statusSprite);
        monsterStatusSpriteRef.current = statusSprite;
        // Corações abaixo do nome (usa as refs — valor atual no load assíncrono).
        const heartsSprite = makeHeartsSprite(monsterHeartsRef.current, monsterHeartFracRef.current);
        heartsSprite.position.y = -0.42;
        heartsSprite.visible = monsterHeartsRef.current > 0;
        nameGroup.add(heartsSprite);
        monsterHeartsSpriteRef.current = heartsSprite;
        scene.add(nameGroup);
        monsterNameGroupRef.current = nameGroup;
      }
      // Sinaliza que o grupo do monstro está pronto (recria gelo/poça se congelado).
      setMonsterEpoch((e) => e + 1);
    });

    // Jogador: se houver GLB customizado, usa o fluxo GLB; senão, carrega o boneco
    // NATIVO do skinview3d (fidelidade total: expressões, glint, itens, animações).
    if (playerModelUrl) {
      loadEntity(playerModelUrl, playerSkinUrl, -3.6, 1, playerRotYRef.current, (group, root, mixer, actions) => {
        unifiedPlayerGroupRef.current = group;
        unifiedPlayerRootRef.current = root;
        unifiedPlayerMixerRef.current = mixer;
        unifiedPlayerActionsRef.current = actions;
        playEntityAnimByName(actions, mixer, playerAnimRef.current);
        // Nome acima da cabeça (sprite 3D que acompanha o boneco).
        if (playerName) {
          const nameGroup = makeNameGroup();
          nameGroup.add(makeNameSprite(playerName, { color: '#ffffff' }));
          scene.add(nameGroup);
          playerNameGroupRef.current = nameGroup;
        }
        // Grupo das barras de condições (acima do nome, empilhadas).
        const statusGroup = new THREE.Group();
        statusGroup.position.set(0, UNIFIED_ENTITY_HEIGHT + 0.34 + 0.28, 0);
        const statusSprite = makeStatusBarsSprite(playerStatusesRef.current);
        statusSprite.visible = playerStatusesRef.current.length > 0;
        statusGroup.add(statusSprite);
        playerStatusSpriteRef.current = statusSprite;
        scene.add(statusGroup);
        playerStatusGroupRef.current = statusGroup;
      });
    } else {
      // ---- Boneco NATIVO do skinview3d ----
      const buildNativePlayer = async () => {
        try {
          const { SkinViewer } = await import('skinview3d');
          const skinUrl = playerSkinUrl || await generateMinecraftSkinUrl(playerConfig || ({} as any));
          const viewer = new SkinViewer({ width: 150, height: 250, renderPaused: true });
          await viewer.loadSkin(skinUrl, { model: playerConfig?.gender === 'female' ? 'slim' : 'default' });
          if (disposed) { try { viewer.dispose(); } catch { /* noop */ } return; }

          const player = (viewer as any).playerObject;
          fitEntityToGround(player, UNIFIED_ENTITY_HEIGHT);

          const group = new THREE.Group();
          group.add(player);
          group.position.set(-3.6, 0.51, 0.2);
          // O boneco nativo do skinview3d já nasce virado para +z (câmera) → base 0,
          // levemente girado na direção do monstro (+x) para parecerem se encarar.
          group.rotation.y = 0.42 + THREE.MathUtils.degToRad(playerRotYRef.current || 0);
          scene.add(group);

          // Nome acima da cabeça (sprite 3D que acompanha o boneco).
          if (playerName) {
            const nameGroup = makeNameGroup();
            nameGroup.add(makeNameSprite(playerName, { color: '#ffffff' }));
            scene.add(nameGroup);
            playerNameGroupRef.current = nameGroup;
          }

          // Grupo das barras de condições (acima do nome, empilhadas).
          const statusGroup = new THREE.Group();
          statusGroup.position.set(0, UNIFIED_ENTITY_HEIGHT + 0.34 + 0.28, 0);
          const statusSprite = makeStatusBarsSprite(playerStatusesRef.current);
          statusSprite.visible = playerStatusesRef.current.length > 0;
          statusGroup.add(statusSprite);
          playerStatusSpriteRef.current = statusSprite;
          scene.add(statusGroup);
          playerStatusGroupRef.current = statusGroup;

          // Anexa os itens equipados (mesma lógica do AvatarCharacter).
          attachEquippedItemsToPlayer(player, playerConfig, playerEquippedItems, loader);

          // Hematomas no corpo (pixels roxos/vermelhos) conforme o dano sofrido.
          attachBruisesAndBlood(player, playerBruiseLevelRef.current, playerBleedingRef.current);

          nativePlayerRef.current = {
            viewer,
            player,
            skinViewer: viewer,
            currentAnim: '',
            anim: new IdleAnimation(),
          };
          unifiedPlayerGroupRef.current = group;
          unifiedPlayerRootRef.current = player;

          // Aplica a animação atual.
          const animName = playerAnimRef.current || 'idle';
          nativePlayerRef.current.anim = makeNativeAnimation(animName);
          nativePlayerRef.current.currentAnim = animName;
          // Reaplica o tint atual (o efeito pode ter rodado antes do boneco existir).
          applyEntityTint(player, playerEffectTintRef.current, false, playerEffectTintAmountRef.current, playerEffectTintStrengthRef.current);
        } catch (e) {
          console.warn('[VoxelArena3D] Falha ao carregar boneco nativo (skinview3d):', e);
        }
      };
      buildNativePlayer();
    }

    return () => {
      disposed = true;
      [unifiedMonsterGroupRef, unifiedPlayerGroupRef].forEach((ref) => {
        if (ref.current) {
          scene.remove(ref.current);
          ref.current.traverse((c) => {
            const mesh = c as THREE.Mesh;
            if (mesh.isMesh) {
              mesh.geometry?.dispose();
              const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
              mats.forEach((m: any) => m?.dispose?.());
            }
          });
        }
      });
      unifiedMonsterMixerRef.current?.stopAllAction();
      unifiedPlayerMixerRef.current?.stopAllAction();
      try { nativePlayerRef.current?.viewer?.dispose?.(); } catch { /* noop */ }
      nativePlayerRef.current = null;
      clearBruisesAndBlood();
      bloodDropsRef.current = [];
      sweatDropsRef.current.forEach(d => { d.spr.parent?.remove(d.spr); d.spr.material.dispose(); });
      sweatDropsRef.current = [];
      // O grupo do monstro é destruído aqui; o gelo e a poça iam junto, mas as refs
      // continuavam apontando para eles → o gelo não era recriado (sumia ao re-render/
      // resize). Reseta para o efeito do gelo poder recriar quando ainda congelado.
      iceGroupRef.current = null;
      puddleRef.current = null;
      iceShatterRef.current = null;
      unifiedMonsterGroupRef.current = null;
      unifiedPlayerGroupRef.current = null;
      unifiedMonsterRootRef.current = null;
      unifiedPlayerRootRef.current = null;
      unifiedMonsterMixerRef.current = null;
      unifiedPlayerMixerRef.current = null;
      unifiedMonsterActionsRef.current = {};
      unifiedPlayerActionsRef.current = {};
      // Remove os sprites de nome 3D.
      [playerNameGroupRef, monsterNameGroupRef].forEach((ref) => {
        if (ref.current) { scene.remove(ref.current); ref.current.traverse((c) => { (c as any).material?.map?.dispose?.(); (c as any).material?.dispose?.(); }); ref.current = null; }
      });
      if (playerStatusGroupRef.current) {
        scene.remove(playerStatusGroupRef.current);
        playerStatusGroupRef.current.traverse((c) => { (c as any).material?.map?.dispose?.(); (c as any).material?.dispose?.(); });
        playerStatusGroupRef.current = null;
        playerStatusSpriteRef.current = null;
      }
      draco.dispose();
    };
  }, [unified3D, biome, monsterModelUrl, monsterSkinUrl, playerModelUrl, playerSkinUrl, playerConfigKey, playerEquippedItemsKey, monsterZoom, monsterRotY, playerName, monsterName]);

  // Reaplica hematomas no boneco nativo quando o dano sofrido muda.
  useEffect(() => {
    if (!unified3D || !nativePlayerRef.current?.player) return;
    attachBruisesAndBlood(nativePlayerRef.current.player, playerBruiseLevel, playerBleeding);
  }, [unified3D, playerBruiseLevel, playerBleeding]);

  // Expressão facial (normal/serious/sad) conforme o estresse: recarrega a skin no
  // viewer nativo com o mouthStyle correspondente (mesma lógica do AvatarCharacter).
  const lastNativeExpRef = useRef<string>('');
  useEffect(() => {
    if (!unified3D) return;
    const viewer = nativePlayerRef.current?.viewer;
    if (!viewer || playerSkinUrl) return; // skin customizada não tem expressões
    const exp = playerStressLevel >= 0.6 ? 'sad' : playerStressLevel >= 0.3 ? 'serious' : 'normal';
    if (exp === lastNativeExpRef.current) return;
    lastNativeExpRef.current = exp;
    let cancelled = false;
    (async () => {
      try {
        const base = playerConfigRef.current || ({} as any);
        const cfg = { ...base };
        if (exp === 'sad') cfg.mouthStyle = 'sad';
        else if (exp === 'serious') cfg.mouthStyle = 'neutral';
        const url = await generateMinecraftSkinUrl(cfg as any);
        if (cancelled || !nativePlayerRef.current?.viewer) return;
        await nativePlayerRef.current.viewer.loadSkin(url, { model: playerConfig?.gender === 'female' ? 'slim' : 'default' });
        // Reaplica itens/tint/hematomas (a skin nova recria o corpo).
        attachEquippedItemsToPlayer(nativePlayerRef.current.player, playerConfigRef.current, playerEquippedItemsRef.current, new GLTFLoader());
        attachBruisesAndBlood(nativePlayerRef.current.player, playerBruiseLevel, playerBleeding);
      } catch { /* expressão falhou */ }
    })();
    return () => { cancelled = true; };
  }, [unified3D, playerStressLevel, playerSkinUrl]);

  // Aplica a animação (por nome) e a rotação (repouso = câmera, combate = oponente).
  useEffect(() => {
    if (!unified3D) return;
    const monChanged = monsterAnim !== prevMonsterAnimRef.current;
    const playChanged = playerAnim !== prevPlayerAnimRef.current;
    prevMonsterAnimRef.current = monsterAnim;
    prevPlayerAnimRef.current = playerAnim;

    const monCombat = isCombatAnim(monsterAnim);
    if (unifiedMonsterGroupRef.current && !monsterSpecialRef.current && !monsterThrowStartRef.current) {
      // Monstro (direita) vira -x (jogador) em combate; em repouso olha para a câmera
      // mas levemente inclinado na direção do jogador (parecem se encarar).
      const monRest = Math.PI - 0.42;
      unifiedMonsterGroupRef.current.rotation.y = (monCombat ? Math.PI / 2 : monRest) + THREE.MathUtils.degToRad(monsterRotYRef.current);
      // Reset de escala só na TRANSIÇÃO para combate (evita interromper o tween de morte).
      if (monChanged && monCombat) unifiedMonsterGroupRef.current.scale.setScalar(1);
    }
    // Morte do monstro (fatality) — inicia SÓ quando a morte é nova (re-runs não reiniciam).
    if (monsterAnim.startsWith('death')) {
      if (!monsterDeathRef.current || monsterDeathRef.current.type !== monsterAnim) {
        monsterDeathRef.current = { type: monsterAnim, start: performance.now() };
        // Fatality especial: se morreu congelado, o gelo se despedaça em pedaços.
        if (monsterFrozenRef.current && iceGroupRef.current) {
          iceShatterRef.current = performance.now();
        }
      }
    } else if (monsterDeathRef.current) {
      monsterDeathRef.current = null;
      if (unifiedMonsterGroupRef.current) {
        unifiedMonsterGroupRef.current.rotation.x = 0;
        unifiedMonsterGroupRef.current.position.y = 0.51;
        unifiedMonsterGroupRef.current.scale.setScalar(1);
        setGroupOpacity(unifiedMonsterGroupRef.current, 1);
      }
    }
    const playCombat = isCombatAnim(playerAnim);
    if (unifiedPlayerGroupRef.current && !playerSpecialRef.current) {
      // Jogador (esquerda) vira +x (monstro) em combate; repouso olha para a câmera.
      // O boneco NATIVO do skinview3d já nasce virado para +z (câmera), então usa base 0;
      // modelos GLB/Blockbench nascem para -z e precisam da base PI e do lado oposto.
      const native = !!nativePlayerRef.current;
      const restBase = native ? 0 : Math.PI;
      const combatBase = native ? Math.PI / 2 : -Math.PI / 2;
      // Em repouso, gira levemente na direção do monstro (+x) para parecerem se encarar.
      const restFaceOffset = native ? 0.42 : -0.42;
      const restWithOffset = restBase + restFaceOffset;
      // O jogador continua olhando para o monstro durante o ataque fatal e a apreensão
      // (idle-victory); só vira para a CÂMERA na comemoração (victory-*).
      const faceCamera = playerAnim.startsWith('victory');
      const stayCombat = playerAnim === 'idle-victory';
      unifiedPlayerGroupRef.current.rotation.y = ((playCombat || stayCombat) && !faceCamera ? combatBase : restWithOffset) + THREE.MathUtils.degToRad(playerRotYRef.current);
      if (playChanged && playCombat) unifiedPlayerGroupRef.current.scale.setScalar(1);
    }
    if (playerAnim.startsWith('death')) {
      if (!playerDeathRef.current || playerDeathRef.current.type !== playerAnim) {
        playerDeathRef.current = { type: playerAnim, start: performance.now() };
      }
    } else if (playerDeathRef.current) {
      playerDeathRef.current = null;
      if (unifiedPlayerGroupRef.current) {
        unifiedPlayerGroupRef.current.rotation.x = 0;
        unifiedPlayerGroupRef.current.position.y = 0.51;
        unifiedPlayerGroupRef.current.scale.setScalar(1);
        setGroupOpacity(unifiedPlayerGroupRef.current, 1);
      }
    }
    playEntityAnimByName(unifiedMonsterActionsRef.current, unifiedMonsterMixerRef.current, monsterSpecialAnim || monsterAnim);
      if (nativePlayerRef.current) {
        // Jogador NATIVO: troca a PlayerAnimation do skinview3d conforme o nome.
        if (nativePlayerRef.current.currentAnim !== playerAnim) {
          // Reseta a pose antes de trocar: animações procedurais só escrevem os ossos que
          // controlam; sem reset, um braço erguido no ataque ficaria "preso".
          const pl = nativePlayerRef.current.player;
          ['head', 'body', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'].forEach((b) => {
            const node = pl?.skin?.[b];
            if (node) { node.rotation.set(0, 0, 0); }
          });
          // Restaura posições padrão dos braços (o HitAnimation altera leftArm.position).
          if (pl?.skin?.leftArm) pl.skin.leftArm.position.set(5, -2, 0);
          if (pl?.skin?.rightArm) pl.skin.rightArm.position.set(-5, -2, 0);
          nativePlayerRef.current.anim = makeNativeAnimation(playerAnim);
          nativePlayerRef.current.currentAnim = playerAnim;
        }
      } else {
        playEntityAnimByName(unifiedPlayerActionsRef.current, unifiedPlayerMixerRef.current, playerAnim);
    }
  }, [unified3D, monsterAnim, playerAnim, monsterSpecialAnim, monsterModelUrl, playerModelUrl, monsterRotY]);

  // Golpe especial procedural: inicia quando monsterProceduralAnim muda; reseta ao limpar.
  useEffect(() => {
    if (!unified3D) return;
    if (monsterProceduralAnim && monsterProceduralAnim !== '') {
      monsterSpecialRef.current = { type: monsterProceduralAnim, start: performance.now() };
      if (unifiedMonsterGroupRef.current) {
        // Vira para o jogador ao iniciar o golpe especial.
        unifiedMonsterGroupRef.current.rotation.y = Math.PI / 2 + THREE.MathUtils.degToRad(monsterRotYRef.current);
      }
    } else if (monsterSpecialRef.current) {
      monsterSpecialRef.current = null;
      if (unifiedMonsterGroupRef.current) {
        unifiedMonsterGroupRef.current.position.y = 0.51;
        unifiedMonsterGroupRef.current.position.x = 3.6;
        unifiedMonsterGroupRef.current.rotation.z = 0;
        unifiedMonsterGroupRef.current.rotation.y = Math.PI + THREE.MathUtils.degToRad(monsterRotYRef.current);
        unifiedMonsterGroupRef.current.scale.setScalar(1);
      }
    }
  }, [unified3D, monsterProceduralAnim]);

  // Arremesso de projétil (ranged): marca o início, vira para o alvo; ao limpar, restaura.
  useEffect(() => {
    if (!unified3D) return;
    if (monsterBodyThrow) {
      monsterThrowStartRef.current = performance.now();
      if (unifiedMonsterGroupRef.current) {
        unifiedMonsterGroupRef.current.rotation.y = Math.PI / 2 + THREE.MathUtils.degToRad(monsterRotYRef.current);
      }
    } else if (monsterThrowStartRef.current != null) {
      monsterThrowStartRef.current = null;
      if (unifiedMonsterGroupRef.current) {
        unifiedMonsterGroupRef.current.rotation.x = 0;
        unifiedMonsterGroupRef.current.rotation.y = Math.PI + THREE.MathUtils.degToRad(monsterRotYRef.current);
      }
    }
  }, [unified3D, monsterBodyThrow]);

  // Rocha de gelo 3D ao redor do monstro quando congelado (segue o grupo).
  useEffect(() => {
    if (!unified3D) return;
    const group = unifiedMonsterGroupRef.current;
    if (monsterFrozen && group && !iceGroupRef.current) {
      const ice = new THREE.Group();
      const iceMat = new THREE.MeshStandardMaterial({ color: '#9fd8ff', transparent: true, opacity: 0.55, roughness: 0.25, metalness: 0.1 });
      // O gelo acompanha a ALTURA real do monstro (escala pelo monsterZoom), para o
      // cubo não "perder o topo" quando o modelo é maior que o gelo padrão.
      const z = Math.max(0.2, monsterZoomRef.current || 1);
      const sizes = [
        { w: 1.7, h: 2.1, d: 1.7, x: 0, y: 1.0, z: 0 },
        { w: 1.0, h: 1.2, d: 1.0, x: 0.95, y: 0.6, z: 0.4 },
        { w: 1.0, h: 1.1, d: 1.0, x: -0.9, y: 0.65, z: -0.3 },
        { w: 0.9, h: 1.3, d: 0.9, x: 0.3, y: 0.75, z: -1.0 },
        { w: 0.9, h: 1.2, d: 0.9, x: -0.35, y: 0.8, z: 1.0 },
      ];
      sizes.forEach((s) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(s.w * z, s.h * z, s.d * z), iceMat);
        m.position.set(s.x * z, s.y * z, s.z * z);
        ice.add(m);
      });
      // Gotas de água escorrendo pelas BORDAS do gelo (visíveis de fora).
      const dropletMat = new THREE.MeshStandardMaterial({ color: '#0ea5e9', transparent: true, opacity: 0.9, roughness: 0.1, metalness: 0.1, emissive: '#0ea5e9', emissiveIntensity: 0.35 });
      for (let i = 0; i < 8; i++) {
        const ang = (i / 8) * Math.PI * 2;
        const rad = 1.05 * z;
        const dr = new THREE.Mesh(new THREE.BoxGeometry(0.03 * z, 0.13 * z, 0.03 * z), dropletMat);
        dr.position.set(Math.cos(ang) * rad, 1.95 * z, Math.sin(ang) * rad + 0.2);
        dr.userData.isDroplet = true;
        dr.userData.baseY = dr.position.y;
        dr.userData.speed = 0.9 + Math.random() * 0.9;
        ice.add(dr);
      }
      group.add(ice);
      iceGroupRef.current = ice;
      // Poça de água que cresce conforme o gelo derrete (no chão, aparecendo além do gelo).
      const puddleMat = new THREE.MeshBasicMaterial({ color: '#38bdf8', transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide });
      const puddle = new THREE.Mesh(new THREE.CircleGeometry(1.0, 32), puddleMat);
      puddle.rotation.x = -Math.PI / 2;
      puddle.position.set(0, 0.04, 0.2);
      puddle.userData.isPuddle = true;
      group.add(puddle);
      puddleRef.current = puddle;
    } else if (!monsterFrozen && (iceGroupRef.current || puddleRef.current) && group) {
      if (iceGroupRef.current) {
        group.remove(iceGroupRef.current);
        iceGroupRef.current = null;
      }
      if (puddleRef.current) {
        group.remove(puddleRef.current);
        puddleRef.current = null;
      }
    }
  }, [unified3D, monsterFrozen, monsterModelUrl, monsterEpoch]);

  // TRANSFORMAÇÃO: quando vira animal, carrega o GLB do animal na cena e esconde o monstro.
  useEffect(() => {
    if (!unified3D) return;
    const group = unifiedMonsterGroupRef.current;
    const root = unifiedMonsterRootRef.current;
    if (!group) return;
    const animalUrl = (monsterTransformModelUrl || '').trim();
    if (animalUrl) {
      let disposed = false;
      const loader = new GLTFLoader();
      loader.load(getSafeUrl(animalUrl), (gltf) => {
        if (disposed) return;
        const animal = gltf.scene;
        fitEntityToGround(animal, UNIFIED_ENTITY_HEIGHT * Math.max(0.2, monsterZoomRef.current || 1) * 0.55);
        animal.rotation.y = THREE.MathUtils.degToRad(monsterTransformRotY || 0);
        group.add(animal);
        transformAnimalRef.current = animal;
        if (root) root.visible = false;
      }, undefined, (err) => {
        console.warn('[VoxelArena3D] Falha ao carregar GLB da transformação:', animalUrl, err);
      });
      return () => {
        disposed = true;
        if (transformAnimalRef.current) {
          group.remove(transformAnimalRef.current);
          transformAnimalRef.current = null;
        }
        if (root) root.visible = true;
      };
    }
    // Sem transformação: garante o monstro visível.
    if (transformAnimalRef.current) {
      group.remove(transformAnimalRef.current);
      transformAnimalRef.current = null;
    }
    if (root) root.visible = true;
  }, [unified3D, monsterTransformModelUrl, monsterModelUrl, monsterZoom]);

  // Quebra do gelo por GOLPE: quando iceBreakTick muda, estilhaça o gelo (pedaços voam).
  useEffect(() => {
    if (!unified3D || iceBreakTick === 0) return;
    if (iceGroupRef.current) {
      iceShatterRef.current = performance.now();
    }
  }, [unified3D, iceBreakTick]);

  // Fuga no golpe final: marca o início da fuga (monstro) e da caminhada (jogador).
  useEffect(() => {
    if (!unified3D) return;
    const fleeing = monsterAnim === 'flee' || monsterAnim === 'flee-jump';
    if (fleeing) {
      if (monsterFleeStartRef.current == null) monsterFleeStartRef.current = performance.now();
    } else if (monsterAnim === 'idle' && playerAnim === 'idle') {
      // Estado normal (nova batalha): restaura monstro/jogador.
      monsterFleeStartRef.current = null;
      playerWalkStartRef.current = null;
      if (unifiedMonsterGroupRef.current) {
        unifiedMonsterGroupRef.current.visible = true;
        unifiedMonsterGroupRef.current.position.x = 3.6;
      }
    }
    // Só a caminhada EXPLÍCITA (monstro fugiu / vitória sem baú) leva o jogador ao
    // centro. 'exhausted' (HP crítico) é apenas uma pose de cansaço — NÃO desloca.
    const walking = playerAnim === 'walk';
    if (walking && playerWalkStartRef.current == null) {
      playerWalkStartRef.current = performance.now();
      playerWalkStartXRef.current = unifiedPlayerGroupRef.current?.position.x ?? -3.6;
    } else if (!walking && playerWalkStartRef.current != null) {
      // Saiu do modo de caminhada (não é mais 'walk'): para o deslocamento ao centro.
      playerWalkStartRef.current = null;
    }
  }, [unified3D, monsterAnim, playerAnim]);

  // Recuo do jogador ao bater no gelo: marca o início (a animação roda no loop).
  useEffect(() => {
    if (!unified3D) return;
    if (playerRecoil) {
      playerRecoilStartRef.current = performance.now();
      playerRecoilStartXRef.current = unifiedPlayerGroupRef.current?.position.x ?? -3.6;
    }
  }, [unified3D, playerRecoil]);

  // Avanço corpo a corpo: quando entra em ataque/fatal/vitória, lança o tween de X.
  useEffect(() => {
    if (!unified3D) return;
    const now = performance.now();
    const monGroup = unifiedMonsterGroupRef.current;
    if (monGroup) {
      const isAttack = monsterAnim?.startsWith('attack');
      const isVictory = monsterAnim?.startsWith('victory');
      if (isAttack || isVictory) {
        const isFatal = monsterAnim === 'attack-fatal' || monsterAnim === 'attack-fatal-slow';
        monsterMoveRef.current = { fromX: monGroup.position.x, toX: 3.6 - UNIFIED_LUNGE, restX: 3.6, start: now, mode: (isVictory || isFatal) ? 'hold' : 'go', teleport: isAttack };
      } else {
        monsterMoveRef.current = { fromX: monGroup.position.x, toX: 3.6, restX: 3.6, start: now, mode: 'go' };
      }
    }
    const playGroup = unifiedPlayerGroupRef.current;
    if (playGroup) {
      const isAttack = playerAnim?.startsWith('attack');
      const isVictory = playerAnim?.startsWith('victory');
      const isIdleVictory = playerAnim === 'idle-victory';
      if (isAttack) {
        const isFatal = playerAnim === 'attack-fatal' || playerAnim === 'attack-fatal-slow';
        playerMoveRef.current = { fromX: playGroup.position.x, toX: -3.6 + UNIFIED_LUNGE, restX: -3.6, start: now, mode: isFatal ? 'hold' : 'go', teleport: true };
      } else if (isVictory || isIdleVictory) {
        // Após derrotar o monstro (apreensão E comemoração): MANTER a posição atual
        // (onde o golpe final aconteceu). Não volta ao nascimento nem anda ao centro.
        playerMoveRef.current = { fromX: playGroup.position.x, toX: playGroup.position.x, restX: playGroup.position.x, start: now, mode: 'hold' };
      } else {
        playerMoveRef.current = { fromX: playGroup.position.x, toX: -3.6, restX: -3.6, start: now, mode: 'go' };
      }
    }
  }, [unified3D, monsterAnim, playerAnim]);

  // Reaplica tint/fúria quando os efeitos mudam.
  useEffect(() => {
    if (!unified3D) return;
    applyEntityTint(unifiedMonsterRootRef.current, monsterEffectTint, monsterEnraged, monsterEffectTintAmount);
  }, [unified3D, monsterEffectTint, monsterEnraged, monsterEffectTintAmount, monsterModelUrl]);

  // Reaplica tint de status no JOGADOR (veneno/fogo/raio/sangramento/gelo/cura).
  useEffect(() => {
    if (!unified3D) return;
    applyEntityTint(unifiedPlayerRootRef.current, playerEffectTint, false, playerEffectTintAmount, playerEffectTintStrength);
  }, [unified3D, playerAnim, playerEffectTint, playerEffectTintAmount, playerEffectTintStrength, playerModelUrl]);

  // Recalcula a projeção da cabeça quando a cena unificada liga/desliga ou o zoom muda.
  useEffect(() => {
    updateOverlayPositionsRef.current?.();
  }, [unified3D, monsterZoom, playerConfigKey]);

  // Atualiza --attack-dist imediatamente quando o slider mudar (sem esperar resize)
  useEffect(() => {
    const outer = outerRef.current;
    const arenaEl = (outer?.parentElement || containerRef.current?.parentElement) as HTMLElement | null;
    if (!arenaEl) return;
    if (attackDist && attackDist > 0) {
      arenaEl.style.setProperty('--attack-dist', `${attackDist}px`);
    } else {
      // Ao zerar o slider, restaura a distância calculada automaticamente
      const auto = arenaEl.style.getPropertyValue('--shadow-attack-dist');
      if (auto) arenaEl.style.setProperty('--attack-dist', auto);
    }
  }, [attackDist]);

  return (
    <div
      className={`voxel-arena-3d-root ${arenaQuake ? 'arena-quake-3d' : ''}`}
      ref={outerRef}
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        zIndex: 0,
        pointerEvents: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* "Stage" com PROPORÇÃO FIXA por modo (9:16 mobile / 16:9 desktop): garante o
          MESMO enquadramento em qualquer device do mesmo modo. Fora do padrão (iPhone,
          Android alto, tablet), sobra apenas margem — o fundo do jogo preenche atrás. */}
      <div
        ref={containerRef}
        style={{
          position: 'relative',
          width: stageSize.w || '100%',
          height: stageSize.h || '100%',
          flexShrink: 0,
        }}
      >
        <canvas
          ref={canvasRef}
          style={{
            width: '100%',
            height: '100%',
            display: 'block',
          }}
        />
      </div>
    </div>
  );
};

export default VoxelArena3D;

