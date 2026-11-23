import * as THREE from 'skinview3d/node_modules/three';

/** Classifica o lado (esquerda/direita) de uma malha pelo NOME (dela e dos ancestrais). */
function classifySide(node: any): 'left' | 'right' | 'none' {
  let name = String(node?.name || '').toLowerCase();
  let par = node?.parent;
  while (par && par.type !== 'Scene') { name += ' ' + String(par.name || '').toLowerCase(); par = par.parent; }
  const isL = /\b(left|esq|esquerda)\b/.test(name) || /(left_leg|boot_left|leg_left|leggings_left|left_pants|left_boot|left_shoe)/.test(name);
  const isR = /\b(right|dir|direita)\b/.test(name) || /(right_leg|boot_right|leg_right|leggings_right|right_pants|right_boot|right_shoe)/.test(name);
  if (isL && !isR) return 'left';
  if (isR && !isL) return 'right';
  const aL = /([_\.\-]l)($|[^a-z])/.test(name) || /\bl[_\.\-]/.test(name);
  const aR = /([_\.\-]r)($|[^a-z])/.test(name) || /\br[_\.\-]/.test(name);
  if (aL && !aR) return 'left';
  if (aR && !aL) return 'right';
  return 'none';
}

/** Clona um Object3D ignorando referências circulares em `userData` (ex.: `forgeModel` de partículas). */
function safeClone(src: THREE.Object3D): THREE.Object3D {
  const saved: { node: any; data: any }[] = [];
  src.traverse((n: any) => {
    if (n.userData && Object.keys(n.userData).length > 0) {
      const clean: Record<string, any> = {};
      let hadNonPlain = false;
      for (const [k, v] of Object.entries(n.userData)) {
        if (k === 'forgeModel' || (v && typeof v === 'object' && (v as any).isObject3D)) {
          hadNonPlain = true;
        } else {
          clean[k] = v;
        }
      }
      if (hadNonPlain) {
        saved.push({ node: n, data: n.userData });
        n.userData = clean;
      }
    }
  });
  try {
    const cloned = src.clone(true);
    // Remove eventuais grupos de partículas da forja clonados para evitar sprites congelados em escala 1:1
    const toRemove: THREE.Object3D[] = [];
    cloned.traverse((n: any) => {
      if (n.isSprite || n.userData?.forgeSparkSize !== undefined) toRemove.push(n);
    });
    toRemove.forEach((n) => n.parent?.remove(n));
    return cloned;
  } finally {
    for (const s of saved) s.node.userData = s.data;
  }
}

/**
 * Divide um modelo de CALÇA/BOTA (ou malhas sem lado) em metades ESQUERDA/DIREITA.
 * Projeta os triângulos para o espaço do corpo (aplicando matrizes locais e rotação do
 * modelTransform) e separa em relação ao eixo X do personagem (`+X` = esquerda, `-X` = direita).
 */
function splitLegsByAxis(
  src: THREE.Object3D,
  transform: any,
  shouldSplitNode?: (node: any) => boolean
): { left: THREE.Object3D; right: THREE.Object3D } {
  src.position.set(0, 0, 0);
  src.rotation.set(0, 0, 0);
  src.scale.set(1, 1, 1);
  src.updateMatrixWorld(true);

  const rotEuler = new THREE.Euler(transform?.rotX || 0, transform?.rotY || 0, transform?.rotZ || 0);
  const rotMat = new THREE.Matrix4().makeRotationFromEuler(rotEuler);
  const nodeToBody = new THREE.Matrix4();
  const v = new THREE.Vector3();

  let minX = Infinity;
  let maxX = -Infinity;
  src.traverse((node: any) => {
    if (!node.isMesh || !node.geometry) return;
    if (shouldSplitNode && !shouldSplitNode(node)) return;
    const pos = node.geometry.attributes.position;
    if (!pos) return;
    nodeToBody.multiplyMatrices(rotMat, node.matrixWorld);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(nodeToBody);
      if (v.x < minX) minX = v.x;
      if (v.x > maxX) maxX = v.x;
    }
  });
  const centerX = Number.isFinite(minX) && Number.isFinite(maxX) ? (minX + maxX) / 2 : 0;

  const mkHalf = (keepLeft: boolean) => {
    const clone = safeClone(src);
    clone.position.set(0, 0, 0);
    clone.rotation.set(0, 0, 0);
    clone.scale.set(1, 1, 1);
    clone.updateMatrixWorld(true);
    clone.traverse((node: any) => {
      if (!node.isMesh || !node.geometry) return;
      if (shouldSplitNode && !shouldSplitNode(node)) return;
      try {
        const geo = node.geometry.index ? node.geometry.toNonIndexed() : node.geometry;
        const pos = geo.attributes.position;
        if (!pos) { node.visible = keepLeft; return; }
        nodeToBody.multiplyMatrices(rotMat, node.matrixWorld);
        const triCount = Math.floor(pos.count / 3);
        const idxArr: number[] = [];
        for (let t = 0; t < triCount; t++) {
          let cx = 0;
          for (let k = 0; k < 3; k++) {
            v.fromBufferAttribute(pos, t * 3 + k).applyMatrix4(nodeToBody);
            cx += v.x;
          }
          cx /= 3;
          // Em skinview3d: leftLeg fica em +X e rightLeg fica em -X
          const isLeftTri = cx >= centerX;
          if (isLeftTri === keepLeft) {
            const base = t * 3;
            idxArr.push(base, base + 1, base + 2);
          }
        }
        if (idxArr.length < 3) { node.visible = false; return; }
        const newGeo = new THREE.BufferGeometry();
        for (const key of Object.keys(geo.attributes)) newGeo.setAttribute(key, (geo.attributes as any)[key].clone());
        newGeo.setIndex(idxArr);
        node.geometry = newGeo;
        node.visible = true;
      } catch { node.visible = keepLeft; }
    });
    return clone;
  };
  return { left: mkHalf(true), right: mkHalf(false) };
}

/** Prende um objeto em uma perna preservando exatamente a posição calibrada em relação ao `body`. */
function attachToLeg(obj: THREE.Object3D, leg: any, player: any, side: number, transform: any, defaultPosY = -15) {
  const scale = transform?.scale ?? 16;
  const thickness = transform?.thickness ?? 1;
  obj.scale.set(scale, scale, scale * thickness);
  if (transform) {
    obj.position.set(transform.posX ?? 0, transform.posY ?? 0, transform.posZ ?? 0);
    obj.rotation.set(transform.rotX || 0, transform.rotY || 0, transform.rotZ || 0);
    if (transform.slide) obj.translateY(transform.slide);
  } else {
    obj.rotation.set(0, 0, 0);
    obj.position.set(0, defaultPosY, 0);
  }
  const bodyPos = player?.skin?.body?.position;
  const legPos = leg?.position;
  const wrapper = new THREE.Group();
  wrapper.position.set(
    (bodyPos?.x ?? 0) - (legPos?.x ?? side * 1.9),
    (bodyPos?.y ?? -6) - (legPos?.y ?? -12),
    (bodyPos?.z ?? 0) - (legPos?.z ?? -0.1)
  );
  wrapper.add(obj);
  leg.add(wrapper);
}

/** Converte eventuais SkinnedMesh em Mesh estática na pose padrão para permitir dividir e mover com as pernas. */
function bakeSkinnedMeshesToStatic(root: THREE.Object3D): void {
  const skinned: any[] = [];
  root.traverse((n: any) => { if (n.isSkinnedMesh && n.geometry) skinned.push(n); });
  if (skinned.length === 0) return;

  root.updateMatrixWorld(true);
  const v = new THREE.Vector3();
  skinned.forEach((sm: any) => {
    try {
      sm.skeleton?.update?.();
      const geo = sm.geometry.clone();
      const pos = geo.attributes.position;
      if (pos && typeof sm.applyBoneTransform === 'function') {
        for (let i = 0; i < pos.count; i++) {
          v.fromBufferAttribute(pos, i);
          sm.applyBoneTransform(i, v);
          pos.setXYZ(i, v.x, v.y, v.z);
        }
        pos.needsUpdate = true;
        geo.computeVertexNormals();
        geo.computeBoundingBox();
        geo.computeBoundingSphere();
      }
      delete (geo.attributes as any).skinIndex;
      delete (geo.attributes as any).skinWeight;
      const staticMesh = new THREE.Mesh(geo, sm.material);
      staticMesh.name = sm.name;
      staticMesh.position.copy(sm.position);
      staticMesh.rotation.copy(sm.rotation);
      staticMesh.scale.copy(sm.scale);
      staticMesh.visible = sm.visible;
      if (sm.parent) {
        sm.parent.add(staticMesh);
        sm.parent.remove(sm);
      }
    } catch { /* mantém nó original se falhar */ }
  });
}

/**
 * Anexa uma CALÇA/BOTA ao personagem prendendo cada lado na PERNA correspondente, para acompanhar
 * o andar/correr. Usa primeiro os NOMES das malhas (left/right); se não houver, corta pela geometria.
 * Retorna true se tratou como pernas; false se o modelo não pôde ser dividido.
 */
export function attachLegsToBones(model: THREE.Object3D, player: any, transform: any, defaultPosY = -15): boolean {
  if (!player?.skin?.leftLeg || !player?.skin?.rightLeg) return false;
  // Converte eventual SkinnedMesh (pacotes de botas/calças) em Mesh comum na pose de repouso
  // para que cada lado acompanhe o movimento de andar/chutar em leftLeg/rightLeg.
  bakeSkinnedMeshesToStatic(model);

  let hasL = false, hasR = false;
  model.traverse((n: any) => { if (n.isMesh) { const sd = classifySide(n); if (sd === 'left') hasL = true; if (sd === 'right') hasR = true; } });
  if (hasL || hasR) {
    // Malhas nomeadas usam visibilidade direta; malhas centrais ('none', ex: cintura/cinto) são divididas por eixo
    const splitUnclassified = splitLegsByAxis(model, transform, (n) => classifySide(n) === 'none');
    const applyNamedVisibility = (root: THREE.Object3D, keep: 'left' | 'right') => {
      root.traverse((n: any) => {
        if (!n.isMesh) return;
        const sd = classifySide(n);
        if (sd !== 'none') n.visible = sd === keep;
      });
      return root;
    };
    attachToLeg(applyNamedVisibility(splitUnclassified.left, 'left'), player.skin.leftLeg, player, 1, transform, defaultPosY);
    attachToLeg(applyNamedVisibility(splitUnclassified.right, 'right'), player.skin.rightLeg, player, -1, transform, defaultPosY);
  } else {
    const halves = splitLegsByAxis(model, transform);
    attachToLeg(halves.left, player.skin.leftLeg, player, 1, transform, defaultPosY);
    attachToLeg(halves.right, player.skin.rightLeg, player, -1, transform, defaultPosY);
  }
  return true;
}
