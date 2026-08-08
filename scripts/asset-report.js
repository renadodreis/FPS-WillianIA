#!/usr/bin/env node
/* Inventário de peso dos modelos servidos ao cliente.
   Para cada .glb versionado em assets/models/ lista: bytes no disco, imagens
   ÚNICAS do grafo (não por material — isso duplicaria), resolução, mime, quantas
   vezes cada imagem é referenciada e o footprint de VRAM em RGBA8 (o formato que
   o three.js usa ao subir um PNG/JPEG decodificado), com e sem mipmap.

   Uso:
     node scripts/asset-report.js                 # tabela resumo
     node scripts/asset-report.js --detail        # + uma linha por imagem
     node scripts/asset-report.js --json          # saída JSON (baseline)
     node scripts/asset-report.js caminho.glb ... # arquivos avulsos
*/
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

/* Slots de textura de um material glTF/three. Um mesmo Texture pode aparecer em
   vários slots e vários materiais; o que pesa na GPU é a IMAGEM única. */
const SLOTS = [
  ['baseColor', m => m.getBaseColorTexture()],
  ['metallicRoughness', m => m.getMetallicRoughnessTexture()],
  ['normal', m => m.getNormalTexture()],
  ['occlusion', m => m.getOcclusionTexture()],
  ['emissive', m => m.getEmissiveTexture()],
];

/* Só os .glb VERSIONADOS contam: as fontes autorais (bazooka_rocket_launcher,
   low_poly_alien_character_rigged, boss-castle.v1) são gitignored/bloqueadas e
   nunca chegam ao cliente — incluí-las inflaria o inventário pela metade. */
function trackedGlb() {
  const out = require('node:child_process')
    .execFileSync('git', ['-c', 'core.quotepath=false', 'ls-files', '--', 'assets/models'],
      { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter(line => line.toLowerCase().endsWith('.glb'))
    .map(line => path.join(ROOT, line));
  if (!out.length) throw new Error('nenhum .glb versionado em assets/models');
  return out;
}

function mb(bytes) {
  return bytes / (1024 * 1024);
}

/* PNG/JPEG/WebP/KTX2: dimensões pelo cabeçalho, sem decodificar o pixel. */
function imageSize(buffer, mime) {
  if (!buffer || buffer.length < 16) return null;
  if (buffer.readUInt32BE(0) === 0x89504e47)
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) { offset++; continue; }
      const marker = buffer[offset + 1];
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc)
        return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
      offset += 2 + buffer.readUInt16BE(offset + 2);
    }
    return null;
  }
  if (buffer.slice(0, 4).toString('ascii') === 'RIFF' && buffer.slice(8, 12).toString('ascii') === 'WEBP') {
    const fourcc = buffer.slice(12, 16).toString('ascii');
    if (fourcc === 'VP8X')
      return { width: (buffer.readUIntLE(24, 3) & 0xffffff) + 1, height: (buffer.readUIntLE(27, 3) & 0xffffff) + 1 };
    if (fourcc === 'VP8L')
      return { width: (buffer.readUInt32LE(21) & 0x3fff) + 1, height: ((buffer.readUInt32LE(21) >> 14) & 0x3fff) + 1 };
    if (fourcc === 'VP8 ')
      return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
    return null;
  }
  if (buffer.slice(0, 12).toString('binary').startsWith('\xabKTX 20'))
    return { width: buffer.readUInt32LE(20), height: buffer.readUInt32LE(24), ktx2: true };
  return null;
}

/* Bytes na GPU. RGBA8 = 4 B/texel; a cadeia completa de mipmaps soma ~4/3.
   Basis/UASTC transcodifica pra BC7/ASTC/ETC2 — 1 B/texel em UASTC->BC7/ASTC,
   0,5 B/texel em ETC1S. Usamos 1 B/texel (o caso desktop/BC7, conservador). */
function gpuBytes(width, height, ktx2) {
  const texels = width * height;
  const base = ktx2 ? texels : texels * 4;
  return { base, mipped: Math.round(base * 4 / 3) };
}

function triangles(primitive) {
  const indices = primitive.getIndices() || primitive.getAttribute('POSITION');
  if (!indices) return 0;
  const count = indices.getCount();
  const mode = primitive.getMode();
  if (mode === 4) return count / 3;
  if (mode === 5 || mode === 6) return Math.max(0, count - 2);
  return 0;
}

async function inspect(file, io) {
  const bytes = fs.statSync(file).size;
  const document = await io.read(file);
  const root = document.getRoot();

  /* refs por TEXTURA (objeto do grafo) e depois por IMAGEM (bytes únicos):
     dois Texture podem apontar pro mesmo binário se o arquivo tiver duplicatas.

     Quem está EM USO é decidido pelo grafo (listParents), não pela lista de
     slots PBR: material aponta textura por extensão também (o alien usa
     KHR_materials_specular). Os slots abaixo só rotulam o que dá pra nomear;
     o resto entra como "ext". */
  const perTexture = new Map();
  const touch = (texture, slot, material) => {
    const entry = perTexture.get(texture) || { refs: 0, slots: new Set(), materials: new Set() };
    entry.refs++;
    entry.slots.add(slot);
    if (material) entry.materials.add(material.getName() || '(sem nome)');
    perTexture.set(texture, entry);
  };
  for (const material of root.listMaterials())
    for (const [slot, get] of SLOTS) {
      const texture = get(material);
      if (texture) touch(texture, slot, material);
    }
  for (const texture of root.listTextures()) {
    if (perTexture.has(texture)) continue;
    const parents = typeof texture.listParents === 'function' ? texture.listParents() : [];
    if (parents.some(parent => parent.propertyType !== 'Root')) touch(texture, 'ext', null);
  }

  const images = new Map(); // hash do binário -> registro
  for (const [texture, entry] of perTexture) {
    const data = texture.getImage();
    const mime = texture.getMimeType() || '?';
    const key = require('node:crypto').createHash('sha1').update(data || Buffer.alloc(0)).digest('hex');
    const size = imageSize(Buffer.from(data || []), mime);
    const record = images.get(key) || {
      name: texture.getName() || '(sem nome)',
      mime,
      bytes: data ? data.byteLength : 0,
      width: size ? size.width : 0,
      height: size ? size.height : 0,
      ktx2: !!(size && size.ktx2),
      refs: 0,
      textures: 0,
      slots: new Set(),
      materials: new Set(),
    };
    record.refs += entry.refs;
    record.textures++;
    for (const s of entry.slots) record.slots.add(s);
    for (const m of entry.materials) record.materials.add(m);
    images.set(key, record);
  }

  /* imagens presentes no arquivo mas SEM material apontando: peso de rede, não de GPU */
  const orphanBytes = root.listTextures()
    .filter(texture => !perTexture.has(texture))
    .reduce((total, texture) => total + (texture.getImage() ? texture.getImage().byteLength : 0), 0);
  const orphanCount = root.listTextures().length - perTexture.size;

  let base = 0;
  let mipped = 0;
  let imageBytes = 0;
  for (const record of images.values()) {
    const gpu = gpuBytes(record.width, record.height, record.ktx2);
    record.gpuBase = gpu.base;
    record.gpuMipped = gpu.mipped;
    base += gpu.base;
    mipped += gpu.mipped;
    imageBytes += record.bytes;
  }

  const primitives = root.listMeshes().flatMap(mesh => mesh.listPrimitives());
  return {
    file: path.relative(ROOT, file),
    bytes,
    materials: root.listMaterials().length,
    textureSlots: [...perTexture.values()].reduce((total, entry) => total + entry.refs, 0),
    uniqueImages: images.size,
    orphanImages: orphanCount,
    orphanBytes,
    imageBytes,
    gpuBase: base,
    gpuMipped: mipped,
    triangles: Math.round(primitives.reduce((total, p) => total + triangles(p), 0)),
    primitives: primitives.length,
    animations: root.listAnimations().length,
    images: [...images.values()].map(record => ({
      name: record.name,
      mime: record.mime,
      bytes: record.bytes,
      width: record.width,
      height: record.height,
      ktx2: record.ktx2,
      refs: record.refs,
      slots: [...record.slots].join('+'),
      materials: [...record.materials],
      gpuBase: record.gpuBase,
      gpuMipped: record.gpuMipped,
    })).sort((a, b) => b.gpuBase - a.gpuBase),
  };
}

async function main() {
  const args = process.argv.slice(2);
  const detail = args.includes('--detail');
  const asJson = args.includes('--json');
  const files = args.filter(a => !a.startsWith('--'));
  const targets = files.length ? files.map(f => path.resolve(f)) : trackedGlb().sort();

  const { Logger, NodeIO, Verbosity } = await import('@gltf-transform/core');
  const { ALL_EXTENSIONS } = await import('@gltf-transform/extensions');
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const logger = new Logger(Verbosity.ERROR);

  const rows = [];
  for (const file of targets) {
    try {
      const report = await inspect(file, io);
      rows.push(report);
    } catch (error) {
      rows.push({ file: path.relative(ROOT, file), error: error.message });
    }
  }
  void logger;

  if (asJson) {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }

  const ok = rows.filter(r => !r.error).sort((a, b) => b.gpuBase - a.gpuBase);
  const pad = (value, width, right = true) =>
    right ? String(value).padStart(width) : String(value).padEnd(width);

  console.log('arquivo                                              disco  mats  slots  imgs  imgbytes   RGBA8  +mip   tris');
  console.log('-'.repeat(118));
  for (const r of ok) {
    console.log([
      pad(r.file.replace('assets/models/', ''), 48, false),
      pad(mb(r.bytes).toFixed(2), 7),
      pad(r.materials, 5),
      pad(r.textureSlots, 6),
      pad(r.uniqueImages + (r.orphanImages ? `+${r.orphanImages}` : ''), 6),
      pad(mb(r.imageBytes).toFixed(2), 9),
      pad(mb(r.gpuBase).toFixed(1), 7),
      pad(mb(r.gpuMipped).toFixed(1), 6),
      pad(r.triangles, 7),
    ].join(''));
  }
  console.log('-'.repeat(118));
  const total = ok.reduce((acc, r) => ({
    bytes: acc.bytes + r.bytes,
    imageBytes: acc.imageBytes + r.imageBytes,
    gpuBase: acc.gpuBase + r.gpuBase,
    gpuMipped: acc.gpuMipped + r.gpuMipped,
    images: acc.images + r.uniqueImages,
    triangles: acc.triangles + r.triangles,
  }), { bytes: 0, imageBytes: 0, gpuBase: 0, gpuMipped: 0, images: 0, triangles: 0 });
  console.log([
    pad(`TOTAL (${ok.length} arquivos)`, 48, false),
    pad(mb(total.bytes).toFixed(2), 7),
    pad('', 5),
    pad('', 6),
    pad(total.images, 6),
    pad(mb(total.imageBytes).toFixed(2), 9),
    pad(mb(total.gpuBase).toFixed(1), 7),
    pad(mb(total.gpuMipped).toFixed(1), 6),
    pad(total.triangles, 7),
  ].join(''));

  if (detail) {
    for (const r of ok) {
      if (!r.uniqueImages) continue;
      console.log(`\n=== ${r.file} — ${r.uniqueImages} imagens únicas, ${r.textureSlots} referências de material`);
      for (const img of r.images) {
        console.log(`  ${String(img.width).padStart(5)}x${String(img.height).padEnd(5)} ${img.mime.replace('image/', '').padEnd(5)} ` +
          `${(img.bytes / 1024).toFixed(0).padStart(6)} KB  refs=${String(img.refs).padStart(2)}  ` +
          `${(img.gpuBase / 1048576).toFixed(2).padStart(6)} MB  [${img.slots}]  ${img.name}`);
      }
    }
  }

  for (const r of rows.filter(x => x.error)) console.log(`ERRO ${r.file}: ${r.error}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
