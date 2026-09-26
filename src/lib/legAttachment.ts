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

/**
 * Divide um modelo de CALÇA/BOTA (malha única, sem nomes de lado) em metades ESQUERDA/DIREITA.
 * Escolhe o eixo de corte em que as metades ficam MAIS LARGAS (perna é mais larga que a espessura
 * de uma placa frente/trás) — assim separa esquerda/direita e nunca frente/trás.
 */
function splitLegsByAxis(src: THREE.Object3D): { left: THREE.Object3D; right: THREE.Object3D } {
  const v = new THREE.Vector3();
  const tris: { x: number; z: number }[] = [];
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  src.traverse((node: any) => {
    if (!node.isMesh || !node.geometry) return;
    const pos = node.geometry.attributes.position;
    if (!pos) return;
    const n = Math.floor(pos.count / 3);
    for (let t = 0; t < n; t++) {
      let x = 0, z = 0;
      for (let k = 0; k < 3; k++) { const i = t * 3 + k; x += pos.getX(i); z += pos.getZ(i); }
      x /= 3; z /= 3;
      tris.push({ x, z });
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
  });
  const evalAxis = (useX: boolean) => {
    const center = useX ? (minX + maxX) / 2 : (minZ + maxZ) / 2;
    let aMin = Infinity, aMax = -Infinity, bMin = Infinity, bMax = -Infinity;
    for (const t of tris) { const a = useX ? t.x : t.z; if (a < center) { if (a < aMin) aMin = a; if (a > aMax) aMax = a; } else { if (a < bMin) bMin = a; if (a > bMax) bMax = a; } }
    return { center, score: Math.max((aMax - aMin) || 0, (bMax - bMin) || 0) };
  };
  const ex = evalAxis(true), ez = evalAxis(false);
  const useX = ex.score >= ez.score;
  const center = useX ? ex.center : ez.center;
  const mkHalf = (keepLeft: boolean) => {
    const clone = src.clone(true);
    clone.traverse((node: any) => {
      if (!node.isMesh || !node.geometry) return;
      try {
        const geo = node.geometry.index ? node.geometry.toNonIndexed() : node.geometry;
        const pos = geo.attributes.position;
        if (!pos) { node.visible = keepLeft; return; }
        const triCount = Math.floor(pos.count / 3);
        const keepTri: boolean[] = new Array(triCount).fill(false);
        for (let t = 0; t < triCount; t++) {
          let c = 0;
          for (let k = 0; k < 3; k++) { const i = t * 3 + k; c += useX ? pos.getX(i) : pos.getZ(i); }
          c /= 3;
          if ((c < center) === keepLeft) keepTri[t] = true;
        }
        const idxArr: number[] = [];
        const remap = new Map<number, number>();
        for (let t = 0; t < triCount; t++) {
          if (!keepTri[t]) continue;
          for (let k = 0; k < 3; k++) {
            const vi = t * 3 + k;
            let ni = remap.get(vi);
            if (ni === undefined) { ni = remap.size; remap.set(vi, ni); }
            idxArr.push(ni);
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

/** Prende um objeto em uma perna, cancelando o pivot do osso da perna. */
function attachToLeg(obj: THREE.Object3D, leg: any, side: number, transform: any) {
  const scale = transform?.scale ?? 16;
  const thickness = transform?.thickness ?? 1;
  obj.scale.set(scale, scale, scale * thickness);
  if (transform) obj.rotation.set(transform.rotX || 0, transform.rotY || 0, transform.rotZ || 0);
  else obj.rotation.set(0, 0, 0);
  obj.position.set(0, -16, 0);
  const wrapper = new THREE.Group();
  wrapper.position.set(side * 2, 4, 0);
  wrapper.add(obj);
  leg.add(wrapper);
}

/**
 * Anexa uma CALÇA/BOTA ao personagem prendendo cada lado na PERNA correspondente, para acompanhar
 * o andar/correr. Usa primeiro os NOMES das malhas (left/right); se não houver, corta pela geometria.
 * Retorna true se tratou como pernas; false se o modelo não pôde ser dividido.
 */
export function attachLegsToBones(model: THREE.Object3D, player: any, transform: any): boolean {
  if (!player?.skin?.leftLeg || !player?.skin?.rightLeg) return false;
  let hasL = false, hasR = false;
  model.traverse((n: any) => { if (n.isMesh) { const sd = classifySide(n); if (sd === 'left') hasL = true; if (sd === 'right') hasR = true; } });
  if (hasL || hasR) {
    const mkSide = (keep: 'left' | 'right') => {
      const clone = model.clone(true);
      clone.traverse((n: any) => { if (n.isMesh) n.visible = classifySide(n) === keep; });
      return clone;
    };
    attachToLeg(mkSide('left'), player.skin.leftLeg, 1, transform);
    attachToLeg(mkSide('right'), player.skin.rightLeg, -1, transform);
  } else {
    const halves = splitLegsByAxis(model);
    attachToLeg(halves.left, player.skin.leftLeg, 1, transform);
    attachToLeg(halves.right, player.skin.rightLeg, -1, transform);
  }
  return true;
}
