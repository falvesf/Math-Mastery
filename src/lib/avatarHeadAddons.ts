import * as THREE from 'skinview3d/node_modules/three';

const ADDONS_GROUP_NAME = 'customHeadAddons';

export interface HeadAddonConfig {
  gender?: string;
  hairStyle?: string;
  hairColor?: string;
  hairTieColor?: string;
  shirtColor?: string;
  ponytailLength?: number;
  ponytailThickness?: number;
  ponytailAngle?: number;
  hairAccessories?: string[];
  hairAccessory?: string;
  accessoryColor?: string;
  accessoryColors?: string[];
  hiddenSlots?: string[];
}

/**
 * Constrói e anexa cabelos 3D (`ponytail`, `spiky`, `long`) e adornos de cabeça
 * (`bow`, `flower`, `headband`/tiara) em `player.skin.head`.
 * Oculta automaticamente quando há um capacete visível equipado no slot `head`.
 */
export function attachHeadAddonsToPlayer(
  player: any,
  config?: HeadAddonConfig | null,
  equippedItems: any[] = [],
  ignoreHiddenSlots = false
): THREE.Group | null {
  const head = player?.skin?.head;
  if (!head) return null;

  const existing = head.getObjectByName(ADDONS_GROUP_NAME);
  if (existing) head.remove(existing);

  if (!config) return null;

  const hasHelmet = (equippedItems || []).some(
    (i: any) => i?.avatarPart === 'head' && (ignoreHiddenSlots || !config.hiddenSlots?.includes('head'))
  );
  if (hasHelmet) return null;

  const addonsGroup = new THREE.Group();
  addonsGroup.name = ADDONS_GROUP_NAME;
  let hasAddons = false;

  if (config.hairStyle === 'ponytail') {
    const hairColor = config.hairColor || '#4a3000';
    const hairMaterial = new THREE.MeshBasicMaterial({ color: hairColor });
    const tieColor = config.hairTieColor || config.shirtColor || '#d63074';
    const tieMaterial = new THREE.MeshBasicMaterial({ color: tieColor });

    const length = config.ponytailLength ?? 7;
    const thickness = config.ponytailThickness ?? 3.5;
    const angle = (config.ponytailAngle ?? 15) * (Math.PI / 180);

    const tailGeo = new THREE.BoxGeometry(thickness, length, thickness - 1);
    const tailMesh = new THREE.Mesh(tailGeo, hairMaterial);
    tailMesh.position.set(0, -(length / 2), -5.25);
    tailMesh.rotation.x = angle;

    const tieGeo = new THREE.BoxGeometry(thickness + 1, 1.5, thickness);
    const tieMesh = new THREE.Mesh(tieGeo, tieMaterial);
    tieMesh.position.set(0, 0, -4.5);
    tieMesh.rotation.x = angle;

    addonsGroup.add(tailMesh, tieMesh);
    hasAddons = true;
  }

  if (config.hairStyle === 'spiky') {
    const hairColor = config.hairColor || '#4a3000';
    const hairMaterial = new THREE.MeshBasicMaterial({ color: hairColor });
    const createSpike = (x: number, y: number, z: number, rotX: number, rotZ: number, scale = 1) => {
      const spikeGeo = new THREE.ConeGeometry(1.6 * scale, 3.5 * scale, 4);
      const spikeMesh = new THREE.Mesh(spikeGeo, hairMaterial);
      spikeMesh.position.set(x, y, z);
      spikeMesh.rotation.set(rotX, Math.PI / 4, rotZ);
      return spikeMesh;
    };

    addonsGroup.add(createSpike(0, 9.2, 0, 0, 0, 1.3));
    addonsGroup.add(createSpike(-2, 8.5, 2.5, -0.4, 0.3, 0.9));
    addonsGroup.add(createSpike(2, 8.5, 2.5, -0.4, -0.3, 1.0));
    addonsGroup.add(createSpike(0, 8.5, 3.5, -0.6, 0, 0.8));
    addonsGroup.add(createSpike(-2.5, 8.5, -2.5, 0.4, 0.3, 0.8));
    addonsGroup.add(createSpike(2.5, 8.5, -2.5, 0.4, -0.3, 0.9));
    addonsGroup.add(createSpike(0, 8.3, -3.5, 0.6, 0, 0.7));
    addonsGroup.add(createSpike(-3.5, 8.3, 0, 0, 0.6, 0.8));
    addonsGroup.add(createSpike(3.5, 8.3, 0, 0, -0.6, 0.8));
    hasAddons = true;
  }

  if (config.hairStyle === 'long' && config.gender !== 'male') {
    const hairColor = config.hairColor || '#4a3000';
    const hairMaterial = new THREE.MeshBasicMaterial({ color: hairColor });

    const backMesh = new THREE.Mesh(new THREE.BoxGeometry(8.5, 12, 1.5), hairMaterial);
    backMesh.position.set(0, -2, -4.2);
    backMesh.rotation.x = 0.08;

    const leftFrontMesh = new THREE.Mesh(new THREE.BoxGeometry(2.5, 12, 1.5), hairMaterial);
    leftFrontMesh.position.set(-4.5, -2, 1);
    leftFrontMesh.rotation.x = -0.05;
    leftFrontMesh.rotation.z = 0.08;

    const rightFrontMesh = new THREE.Mesh(new THREE.BoxGeometry(2.5, 12, 1.5), hairMaterial);
    rightFrontMesh.position.set(4.5, -2, 1);
    rightFrontMesh.rotation.x = -0.05;
    rightFrontMesh.rotation.z = -0.08;

    addonsGroup.add(backMesh, leftFrontMesh, rightFrontMesh);
    hasAddons = true;
  }

  const accsToRender = config.hairAccessories || [config.hairAccessory || 'none'];
  const fallbackColor = config.accessoryColor || '#ff0000';

  accsToRender.forEach((acc, index) => {
    const accColor = config.accessoryColors?.[index] || fallbackColor;
    if (acc === 'bow') {
      const bowMaterial = new THREE.MeshBasicMaterial({ color: accColor });
      const loopGeo = new THREE.BoxGeometry(1.6, 1.6, 0.4);
      const knotGeo = new THREE.BoxGeometry(0.8, 0.8, 0.6);

      const leftLoop = new THREE.Mesh(loopGeo, bowMaterial);
      leftLoop.position.set(-1, 0, 0);
      leftLoop.rotation.z = Math.PI / 8;

      const rightLoop = new THREE.Mesh(loopGeo, bowMaterial);
      rightLoop.position.set(1, 0, 0);
      rightLoop.rotation.z = -Math.PI / 8;

      const knot = new THREE.Mesh(knotGeo, bowMaterial);
      knot.position.set(0, 0, 0.1);

      const bowGroup = new THREE.Group();
      bowGroup.add(leftLoop, rightLoop, knot);
      bowGroup.position.set(-3.5, 8.4, 4.6);
      bowGroup.rotation.set(-Math.PI / 10, -Math.PI / 8, Math.PI / 12);

      addonsGroup.add(bowGroup);
      hasAddons = true;
    } else if (acc === 'flower') {
      const flowerGroup = new THREE.Group();
      const petals = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 0.4), new THREE.MeshBasicMaterial({ color: accColor }));
      const center = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 0.6), new THREE.MeshBasicMaterial({ color: '#f1c40f' }));
      center.position.set(0, 0, 0.1);

      flowerGroup.add(petals, center);
      flowerGroup.position.set(-3.5, 8.4, 4.6);
      flowerGroup.rotation.set(-Math.PI / 10, -Math.PI / 8, Math.PI / 12);

      addonsGroup.add(flowerGroup);
      hasAddons = true;
    } else if (acc === 'headband') {
      const mat = new THREE.MeshBasicMaterial({ color: accColor });
      const headbandGroup = new THREE.Group();

      const top = new THREE.Mesh(new THREE.BoxGeometry(9.4, 0.4, 1.5), mat);
      top.position.set(0, 8.7, 1);

      const sideGeo = new THREE.BoxGeometry(0.4, 5, 1.5);
      const leftSide = new THREE.Mesh(sideGeo, mat);
      leftSide.position.set(-4.5, 6.4, 1);

      const rightSide = new THREE.Mesh(sideGeo, mat);
      rightSide.position.set(4.5, 6.4, 1);

      headbandGroup.add(top, leftSide, rightSide);
      addonsGroup.add(headbandGroup);
      hasAddons = true;
    }
  });

  if (!hasAddons) return null;

  addonsGroup.traverse((c: any) => { if (c.isMesh) c.frustumCulled = false; });
  head.add(addonsGroup);
  return addonsGroup;
}
