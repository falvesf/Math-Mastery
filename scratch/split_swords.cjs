const fs = require('fs');
const path = require('path');

const srcPath = path.resolve('./public/models/swords_minecraft_dungeons.glb');
const bakPath = path.resolve('./public/models/swords_minecraft_dungeons.glb.bak');

if (!fs.existsSync(bakPath)) {
  fs.copyFileSync(srcPath, bakPath);
  console.log('Created backup:', bakPath);
}

const glbBuffer = fs.readFileSync(srcPath);
const chunk0Length = glbBuffer.readUInt32LE(12);
const origJson = JSON.parse(glbBuffer.toString('utf8', 20, 20 + chunk0Length));
const binOffset = 20 + chunk0Length;
const binLength = glbBuffer.readUInt32LE(binOffset);
const origBin = glbBuffer.subarray(binOffset + 8, binOffset + 8 + binLength);

function getAccessorData(json, bin, accIdx) {
  const acc = json.accessors[accIdx];
  const bv = json.bufferViews[acc.bufferView];
  const offset = (bv.byteOffset || 0) + (acc.byteOffset || 0);
  if (acc.componentType === 5123) return new Uint16Array(bin.buffer, bin.byteOffset + offset, acc.count);
  if (acc.componentType === 5125) return new Uint32Array(bin.buffer, bin.byteOffset + offset, acc.count);
  if (acc.componentType === 5126) return new Float32Array(bin.buffer, bin.byteOffset + offset, acc.count * 3);
  throw new Error('Unsupported componentType ' + acc.componentType);
}

const posAcc = origJson.accessors[origJson.meshes[0].primitives[0].attributes.POSITION];
const normAcc = origJson.accessors[origJson.meshes[0].primitives[0].attributes.NORMAL];
const uvAcc = origJson.accessors[origJson.meshes[0].primitives[0].attributes.TEXCOORD_0];
const idxAcc = origJson.accessors[origJson.meshes[0].primitives[0].indices];

const positions = getAccessorData(origJson, origBin, origJson.meshes[0].primitives[0].attributes.POSITION);
const normals = getAccessorData(origJson, origBin, origJson.meshes[0].primitives[0].attributes.NORMAL);
const uvs = new Float32Array(
  origBin.buffer,
  origBin.byteOffset + (origJson.bufferViews[uvAcc.bufferView].byteOffset || 0) + (uvAcc.byteOffset || 0),
  uvAcc.count * 2
);
const indices = getAccessorData(origJson, origBin, origJson.meshes[0].primitives[0].indices);

// 1. Cluster triangles by connected vertex positions
const parent = new Int32Array(posAcc.count);
for (let i = 0; i < parent.length; i++) parent[i] = i;
function find(i) { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; }
function union(i, j) { const ri = find(i), rj = find(j); if (ri !== rj) parent[ri] = rj; }

for (let i = 0; i < indices.length; i += 3) {
  union(indices[i], indices[i+1]);
  union(indices[i+1], indices[i+2]);
}
const posMap = new Map();
for (let i = 0; i < parent.length; i++) {
  const key = positions[i*3].toFixed(3) + '_' + positions[i*3+1].toFixed(3) + '_' + positions[i*3+2].toFixed(3);
  if (posMap.has(key)) union(i, posMap.get(key));
  else posMap.set(key, i);
}

const triangleClusters = new Map();
for (let i = 0; i < indices.length; i += 3) {
  const root = find(indices[i]);
  if (!triangleClusters.has(root)) triangleClusters.set(root, []);
  triangleClusters.get(root).push(indices[i], indices[i+1], indices[i+2]);
}

const clusters = [];
for (const [root, triIndices] of triangleClusters.entries()) {
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;
  for (let k = 0; k < triIndices.length; k++) {
    const v = triIndices[k];
    const x = positions[v*3], y = positions[v*3+1], z = positions[v*3+2];
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }
  clusters.push({ root, triIndices, minX, maxX, minY, maxY, minZ, maxZ });
}
clusters.sort((a, b) => a.minX - b.minX);

const swordDefs = [
  { name: 'Espada_Serrilhada', friendly: 'Espada de Pedra Serrilhada', filename: 'espada_dungeons_serrilhada.glb' },
  { name: 'Espada_Diamante', friendly: 'Espada de Diamante Dungeons', filename: 'espada_dungeons_diamante.glb' },
  { name: 'Espada_Katana', friendly: 'Espada Katana Mestre', filename: 'espada_dungeons_katana.glb' },
  { name: 'Espada_Foice', friendly: 'Espada Foice Curva', filename: 'espada_dungeons_foice.glb' },
  { name: 'Espada_Vermelha', friendly: 'Espada Sombria Escarlate', filename: 'espada_dungeons_vermelha.glb' }
];

console.log('Found', clusters.length, 'sword clusters.');

// Helper to assemble GLB
function buildGlb(jsonObj, binBuffer) {
  // Pad binBuffer to 4-byte boundary
  let paddedBin = binBuffer;
  const binRemainder = binBuffer.length % 4;
  if (binRemainder !== 0) {
    const pad = 4 - binRemainder;
    paddedBin = Buffer.concat([binBuffer, Buffer.alloc(pad, 0)]);
  }

  let jsonStr = JSON.stringify(jsonObj);
  let jsonBuffer = Buffer.from(jsonStr, 'utf8');
  const jsonRemainder = jsonBuffer.length % 4;
  if (jsonRemainder !== 0) {
    const pad = 4 - jsonRemainder;
    jsonBuffer = Buffer.concat([jsonBuffer, Buffer.from(' '.repeat(pad), 'utf8')]);
  }

  const totalLength = 12 + 8 + jsonBuffer.length + 8 + paddedBin.length;
  const outGlb = Buffer.alloc(totalLength);

  // Header
  outGlb.writeUInt32LE(0x46546C67, 0); // 'glTF'
  outGlb.writeUInt32LE(2, 4); // version 2
  outGlb.writeUInt32LE(totalLength, 8);

  // Chunk 0: JSON
  outGlb.writeUInt32LE(jsonBuffer.length, 12);
  outGlb.writeUInt32LE(0x4E4F534A, 16); // 'JSON'
  jsonBuffer.copy(outGlb, 20);

  // Chunk 1: BIN
  const binChunkOffset = 20 + jsonBuffer.length;
  outGlb.writeUInt32LE(paddedBin.length, binChunkOffset);
  outGlb.writeUInt32LE(0x004E4942, binChunkOffset + 4); // 'BIN\0'
  paddedBin.copy(outGlb, binChunkOffset + 8);

  return outGlb;
}

// -------------------------------------------------------------
// PART 1: Update swords_minecraft_dungeons.glb to have 5 separate meshes!
// -------------------------------------------------------------
{
  // We keep the exact vertex buffers, but replace the 1 combined index buffer with 5 separate index buffers
  const newJson = JSON.parse(JSON.stringify(origJson));
  
  // Buffer 0 will store:
  // - Original buffer views for Normal, Position, UV, Image
  // - PLUS 5 new buffer views for the 5 clusters' indices!
  
  // Keep original bufferViews 0 (normals), 1 (positions), 2 (texcoords), 4 (image PNG)
  // Let's copy the non-index data from origBin
  // In origJson:
  // bv 0: normals (byteOffset: 0, byteLength: 48048)
  // bv 1: positions (byteOffset: 48048, byteLength: 48048)
  // bv 2: texcoords (byteOffset: 96096, byteLength: 32032)
  // bv 3: indices (byteOffset: 128128, byteLength: 13704)
  // bv 4: image (byteOffset: 141832, byteLength: 16049)

  const imageBv = origJson.bufferViews[origJson.images[0].bufferView];
  const imageData = origBin.subarray(imageBv.byteOffset, imageBv.byteOffset + imageBv.byteLength);

  const binParts = [];
  let currentOffset = 0;

  function addBufferSlice(data, target = 34962) {
    // Pad data to 4-byte boundary
    let d = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    const rem = d.length % 4;
    if (rem !== 0) d = Buffer.concat([d, Buffer.alloc(4 - rem, 0)]);

    const bvIndex = newBufferViews.length;
    newBufferViews.push({
      buffer: 0,
      byteOffset: currentOffset,
      byteLength: data.byteLength,
      target: target
    });
    binParts.push(d);
    currentOffset += d.length;
    return bvIndex;
  }

  const newBufferViews = [];
  const bvNormals = addBufferSlice(normals, 34962);
  const bvPositions = addBufferSlice(positions, 34962);
  const bvTexcoords = addBufferSlice(uvs, 34962);

  const newAccessors = [
    {
      bufferView: bvNormals,
      byteOffset: 0,
      componentType: 5126,
      count: normAcc.count,
      type: 'VEC3',
      min: normAcc.min,
      max: normAcc.max
    },
    {
      bufferView: bvPositions,
      byteOffset: 0,
      componentType: 5126,
      count: posAcc.count,
      type: 'VEC3',
      min: posAcc.min,
      max: posAcc.max
    },
    {
      bufferView: bvTexcoords,
      byteOffset: 0,
      componentType: 5126,
      count: uvAcc.count,
      type: 'VEC2',
      min: uvAcc.min,
      max: uvAcc.max
    }
  ];

  // Add indices for each cluster
  const clusterIndexAccessors = [];
  clusters.forEach((c, i) => {
    const idxArray = new Uint16Array(c.triIndices);
    const bvIdx = addBufferSlice(idxArray, 34963);
    const accIdx = newAccessors.length;
    newAccessors.push({
      bufferView: bvIdx,
      byteOffset: 0,
      componentType: 5123, // UNSIGNED_SHORT
      count: idxArray.length,
      type: 'SCALAR',
      min: [Math.min(...idxArray)],
      max: [Math.max(...idxArray)]
    });
    clusterIndexAccessors.push(accIdx);
  });

  // Add image buffer view
  const bvImage = addBufferSlice(imageData, undefined);

  // Meshes: 5 separate meshes
  const newMeshes = swordDefs.map((def, i) => {
    return {
      name: def.name,
      primitives: [
        {
          attributes: {
            NORMAL: 0,
            POSITION: 1,
            TEXCOORD_0: 2
          },
          indices: 3 + i,
          material: 0
        }
      ]
    };
  });

  // Nodes: 1 root parent with 5 children
  const newNodes = [
    {
      name: 'Swords_Minecraft_Dungeons',
      children: [1, 2, 3, 4, 5]
    },
    ...swordDefs.map((def, i) => ({
      name: def.name,
      mesh: i
    }))
  ];

  newJson.bufferViews = newBufferViews;
  newJson.accessors = newAccessors;
  newJson.meshes = newMeshes;
  newJson.nodes = newNodes;
  newJson.scenes[0].nodes = [0];
  newJson.images[0].bufferView = bvImage;
  newJson.buffers = [{ byteLength: currentOffset }];

  const combinedBin = Buffer.concat(binParts);
  const newGlbBuffer = buildGlb(newJson, combinedBin);
  fs.writeFileSync(srcPath, newGlbBuffer);
  console.log('Successfully updated swords_minecraft_dungeons.glb with 5 separate meshes! Size:', newGlbBuffer.length);
}

// -------------------------------------------------------------
// PART 2: Export 5 individual standalone centered .glb files!
// -------------------------------------------------------------
clusters.forEach((c, i) => {
  const def = swordDefs[i];
  const outFilePath = path.resolve('./public/models', def.filename);

  // Map used vertices to new compact vertex buffer and center geometry around (0, 0, 0)
  const oldToNewIndex = new Map();
  const newPos = [];
  const newNorm = [];
  const newUv = [];
  const newIndices = [];

  // Compute center of this sword
  const centerX = (c.minX + c.maxX) / 2;
  const centerY = (c.minY + c.maxY) / 2;
  const centerZ = (c.minZ + c.maxZ) / 2;

  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;

  for (let k = 0; k < c.triIndices.length; k++) {
    const oldV = c.triIndices[k];
    if (!oldToNewIndex.has(oldV)) {
      const newV = newPos.length / 3;
      oldToNewIndex.set(oldV, newV);

      // Centered coordinates!
      const px = positions[oldV * 3] - centerX;
      const py = positions[oldV * 3 + 1] - centerY;
      const pz = positions[oldV * 3 + 2] - centerZ;

      if (px < minX) minX = px; if (px > maxX) maxX = px;
      if (py < minY) minY = py; if (py > maxY) maxY = py;
      if (pz < minZ) minZ = pz; if (pz > maxZ) maxZ = pz;

      newPos.push(px, py, pz);
      newNorm.push(normals[oldV * 3], normals[oldV * 3 + 1], normals[oldV * 3 + 2]);
      newUv.push(uvs[oldV * 2], uvs[oldV * 2 + 1]);
    }
    newIndices.push(oldToNewIndex.get(oldV));
  }

  const posArray = new Float32Array(newPos);
  const normArray = new Float32Array(newNorm);
  const uvArray = new Float32Array(newUv);
  const idxArray = new Uint16Array(newIndices);

  const imageBv = origJson.bufferViews[origJson.images[0].bufferView];
  const imageData = origBin.subarray(imageBv.byteOffset, imageBv.byteOffset + imageBv.byteLength);

  const binParts = [];
  const bufferViews = [];
  let currentOffset = 0;

  function addSlice(data, target = 34962) {
    let d = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    const rem = d.length % 4;
    if (rem !== 0) d = Buffer.concat([d, Buffer.alloc(4 - rem, 0)]);

    const bvIndex = bufferViews.length;
    bufferViews.push({
      buffer: 0,
      byteOffset: currentOffset,
      byteLength: data.byteLength,
      target: target
    });
    binParts.push(d);
    currentOffset += d.length;
    return bvIndex;
  }

  const bvNorm = addSlice(normArray, 34962);
  const bvPos = addSlice(posArray, 34962);
  const bvUv = addSlice(uvArray, 34962);
  const bvIdx = addSlice(idxArray, 34963);
  const bvImg = addSlice(imageData, undefined);

  const accessors = [
    {
      bufferView: bvNorm,
      byteOffset: 0,
      componentType: 5126,
      count: normArray.length / 3,
      type: 'VEC3'
    },
    {
      bufferView: bvPos,
      byteOffset: 0,
      componentType: 5126,
      count: posArray.length / 3,
      type: 'VEC3',
      min: [minX, minY, minZ],
      max: [maxX, maxY, maxZ]
    },
    {
      bufferView: bvUv,
      byteOffset: 0,
      componentType: 5126,
      count: uvArray.length / 2,
      type: 'VEC2'
    },
    {
      bufferView: bvIdx,
      byteOffset: 0,
      componentType: 5123,
      count: idxArray.length,
      type: 'SCALAR',
      min: [0],
      max: [posArray.length / 3 - 1]
    }
  ];

  const singleJson = {
    asset: { version: '2.0', generator: 'Math-Mastery GLB Splitter' },
    scenes: [{ nodes: [0] }],
    scene: 0,
    nodes: [
      {
        name: def.name,
        mesh: 0
      }
    ],
    meshes: [
      {
        name: def.name,
        primitives: [
          {
            attributes: {
              NORMAL: 0,
              POSITION: 1,
              TEXCOORD_0: 2
            },
            indices: 3,
            material: 0
          }
        ]
      }
    ],
    materials: origJson.materials,
    textures: origJson.textures,
    images: [{ bufferView: bvImg, mimeType: origJson.images[0].mimeType }],
    samplers: origJson.samplers,
    accessors: accessors,
    bufferViews: bufferViews,
    buffers: [{ byteLength: currentOffset }]
  };

  const binBuf = Buffer.concat(binParts);
  const singleGlb = buildGlb(singleJson, binBuf);
  fs.writeFileSync(outFilePath, singleGlb);
  console.log(`Saved individual centered model: ${def.filename} (${singleGlb.length} bytes, ${idxArray.length/3} tris)`);
});
