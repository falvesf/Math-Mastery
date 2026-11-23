// @ts-ignore
import * as THREE from 'skinview3d/node_modules/three';

export type ArcadeWeaponKind = 'knife' | 'sword' | 'pipe';

export const WEAPON_META: Record<ArcadeWeaponKind, { label: string; dmgBonus: number; reachBonus: number; uses: number; color: string }> = {
  knife: { label: '🔪 Faca', dmgBonus: 18, reachBonus: 0.25, uses: 5, color: '#e2e8f0' },
  sword: { label: '⚔️ Espada', dmgBonus: 32, reachBonus: 0.75, uses: 7, color: '#38bdf8' },
  pipe: { label: '🔩 Barra de Cano', dmgBonus: 26, reachBonus: 0.65, uses: 8, color: '#94a3b8' },
};

/** Constrói a malha 3D de Faca, Espada ou Barra de Cano para o chão e mão dos personagens. */
export function buildArcadeWeaponMesh(kind: ArcadeWeaponKind, forHand = false): THREE.Group {
  const g = new THREE.Group();
  g.name = 'arcadeHeldWeapon';

  if (kind === 'knife') {
    const handle = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.24, 0.1),
      new THREE.MeshStandardMaterial({ color: 0x3b2f2f, roughness: 0.8 })
    );
    handle.position.y = 0.1;
    const blade = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.42, 0.14),
      new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.85, roughness: 0.2 })
    );
    blade.position.y = 0.42;
    g.add(handle, blade);
  } else if (kind === 'sword') {
    const handle = new THREE.Mesh(
      new THREE.BoxGeometry(0.11, 0.28, 0.11),
      new THREE.MeshStandardMaterial({ color: 0x451a03 })
    );
    handle.position.y = 0.12;
    const guard = new THREE.Mesh(
      new THREE.BoxGeometry(0.38, 0.08, 0.14),
      new THREE.MeshStandardMaterial({ color: 0xfacc15, metalness: 0.7 })
    );
    guard.position.y = 0.28;
    const blade = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.92, 0.06),
      new THREE.MeshStandardMaterial({ color: 0xbae6fd, metalness: 0.85, roughness: 0.2 })
    );
    blade.position.y = 0.78;
    g.add(handle, guard, blade);
  } else {
    // Barra de Cano metálica estilo Final Fight!
    const pipe = new THREE.Mesh(
      new THREE.CylinderGeometry(0.075, 0.075, 1.05, 10),
      new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.8, roughness: 0.35 })
    );
    pipe.position.y = 0.5;
    const tape = new THREE.Mesh(
      new THREE.CylinderGeometry(0.085, 0.085, 0.22, 10),
      new THREE.MeshStandardMaterial({ color: 0x1e293b })
    );
    tape.position.y = 0.14;
    g.add(pipe, tape);
  }

  if (forHand) {
    // Em PlayerObject (skinview3d), rightArm tem escala ~16x maior em relação ao mundo!
    g.scale.setScalar(14);
    g.rotation.x = Math.PI / 2;
    g.position.set(0, -10, 2);
  } else {
    g.rotation.z = Math.PI / 3;
  }
  return g;
}

export function attachArcadeWeaponToPlayerObj(playerObj: any, kind: ArcadeWeaponKind | null) {
  const arm = playerObj?.skin?.rightArm;
  if (!arm) return;
  const old = arm.getObjectByName('arcadeHeldWeapon');
  if (old) arm.remove(old);
  if (!kind) return;
  const w = buildArcadeWeaponMesh(kind, true);
  w.userData.arcadeTempWeapon = true;
  arm.add(w);
}

/**
 * Guarda a arma principal do jogador nas costas ao equipar uma arma do chão (faca/espada/cano),
 * e restaura para a mão dominante quando a arma temporária acabar.
 */
export function sheathPlayerMainWeapon(playerObj: any, isLeftHanded: boolean, sheath: boolean) {
  const skin = playerObj?.skin;
  if (!skin?.body) return;
  const domArm = isLeftHanded ? skin.leftArm : skin.rightArm;
  if (!domArm) return;

  if (sheath) {
    // Índice 0 de domArm é sempre o pivot nativo do braço no skinview3d; os demais filhos são armas equipadas
    const equippedNodes = domArm.children.slice(1).filter((c: any) =>
      c.name !== 'arcadeHeldWeapon' && !c.userData?.arcadeTempWeapon
    );
    equippedNodes.forEach((node: any) => {
      if (node.userData.__sheathedFromArm) return;
      node.userData.__sheathedFromArm = domArm;
      node.userData.__origPos = node.position.clone();
      node.userData.__origRot = node.rotation.clone();
      node.userData.__origScale = node.scale.clone();
      domArm.remove(node);
      node.position.set(0, -5, -2.7);
      node.rotation.set(0, Math.PI, Math.PI / 4);
      node.scale.setScalar(9.5);
      skin.body.add(node);
    });
  } else {
    const backNodes = skin.body.children.filter((c: any) => c.userData?.__sheathedFromArm === domArm);
    backNodes.forEach((node: any) => {
      skin.body.remove(node);
      if (node.userData.__origPos) node.position.copy(node.userData.__origPos);
      if (node.userData.__origRot) node.rotation.copy(node.userData.__origRot);
      if (node.userData.__origScale) node.scale.copy(node.userData.__origScale);
      delete node.userData.__sheathedFromArm;
      domArm.add(node);
    });
  }
}
