import * as THREE from 'three';

function testPublicProfile(size, hasHelmet, userZoom) {
  const fov = 50;
  const fit = 58;
  const tanHalfFov = Math.tan((fov / 180 * Math.PI) / 2);
  const headTopY = hasHelmet ? 14.5 : 12.2;
  const targetHeadNDC = 0.51;

  const zoom = 0.9 * userZoom;
  const camZ = fit / zoom;
  const lookAtY = headTopY - targetHeadNDC * camZ * tanHalfFov;
  const camY = lookAtY + 4;

  const camera = new THREE.PerspectiveCamera(fov, 1 / 1.8, 10, 256);
  camera.position.set(0, camY, camZ);
  camera.lookAt(0, lookAtY, 0);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();

  const canvasH = size * 1.8;
  const circleRadius = 110; // circle is always 220x220 (radius 110)

  function project(y) {
    const v = new THREE.Vector3(0, y, 0);
    v.project(camera);
    const px = v.y * (canvasH / 2);
    return px;
  }

  const topPx = project(headTopY);
  const feetPx = project(-16);
  console.log(`size=${size}, zoom=${userZoom}, hasHelmet=${hasHelmet}:`);
  console.log(`  Head top: ${topPx.toFixed(1)}px (circle top: 110px, gap: ${(110 - topPx).toFixed(1)}px)`);
  console.log(`  Feet: ${feetPx.toFixed(1)}px (circle bottom: -110px, below circle by: ${(-110 - feetPx).toFixed(1)}px)`);
}

console.log('--- size = 185 ---');
testPublicProfile(185, true, 1.3);
testPublicProfile(185, false, 1.0);

console.log('--- size = 200 ---');
testPublicProfile(200, true, 1.3);
testPublicProfile(200, false, 1.0);

console.log('--- size = 220 ---');
testPublicProfile(220, true, 1.3);
testPublicProfile(220, false, 1.0);
