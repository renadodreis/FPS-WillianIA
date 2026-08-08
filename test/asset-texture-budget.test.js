/* ================================================================
   QA — orçamento de textura dos modelos servidos.

   O custo de um .glb no celular não é o byte no fio: é o texel na GPU. Um
   WebP de 30 KB a 1024² vira 4 MB de RGBA8 (5,3 MB com mipmap) no instante em
   que o three sobe a textura. Em 2026-08-08 o inventário achou 194,6 MB de
   RGBA8 vindos de 7,7 MB comprimidos — o teto real de memória da aba num
   celular de gama média, muito antes de qualquer questão de fill-rate.

   Este teste é a trava: mede o RGBA8 de cada modelo VERSIONADO em
   assets/models (as fontes autorais gitignored não chegam ao cliente) e falha
   se alguém devolver uma textura grande demais. Node puro, sem Chrome.

   Se um asset novo entrar, o teste manda rodar `npm run assets:plan` — a
   escolha de tamanho é medida (fração de texels que TROCAM DE COR ao
   reduzir), não chutada. Ver scripts/build-model-textures.js.
   ================================================================ */
'use strict';
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

/* Teto do inventário inteiro. Medido em 54,0 MB depois da redução (era
   194,6 MB); a folga cobre um asset novo pequeno sem virar carta branca. */
const MAX_RGBA8_MB = 58;
/* Nenhum modelo servido sozinho pode passar disto. A bazuca — 27 mapas de
   1024² num viewmodel de 4.524 triângulos — era 108 MB, hoje 10,1 MB. */
const MAX_PER_FILE_MB = 11;
/* Lado máximo: 1024² só sobrevive onde a redução comprovadamente sangra cor
   entre ilhas de UV (atlas de cor chapada). Acima disso, nunca. */
const MAX_SIDE = 1024;

function imageSize(buffer) {
  if (buffer.length > 24 && buffer.readUInt32BE(0) === 0x89504e47)
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    for (let offset = 2; offset + 9 < buffer.length;) {
      if (buffer[offset] !== 0xff) { offset++; continue; }
      const marker = buffer[offset + 1];
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc)
        return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
      offset += 2 + buffer.readUInt16BE(offset + 2);
    }
  }
  if (buffer.slice(0, 4).toString('ascii') === 'RIFF' && buffer.slice(8, 12).toString('ascii') === 'WEBP') {
    const fourcc = buffer.slice(12, 16).toString('ascii');
    if (fourcc === 'VP8X')
      return { width: (buffer.readUIntLE(24, 3) & 0xffffff) + 1, height: (buffer.readUIntLE(27, 3) & 0xffffff) + 1 };
    if (fourcc === 'VP8L')
      return { width: (buffer.readUInt32LE(21) & 0x3fff) + 1, height: ((buffer.readUInt32LE(21) >> 14) & 0x3fff) + 1 };
    if (fourcc === 'VP8 ')
      return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
  }
  return null;
}

function trackedGlb() {
  return execFileSync('git', ['-c', 'core.quotepath=false', 'ls-files', '--', 'assets/models'],
    { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter(line => line.toLowerCase().endsWith('.glb'));
}

describe('Orçamento de textura (assets/models)', () => {
  let io;
  const perFile = [];

  before(async () => {
    const { Logger, NodeIO, Verbosity } = await import('@gltf-transform/core');
    const { ALL_EXTENSIONS } = await import('@gltf-transform/extensions');
    io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
    io.setLogger(new Logger(Verbosity.ERROR));

    for (const file of trackedGlb()) {
      const document = await io.read(path.join(ROOT, file));
      const root = document.getRoot();
      /* Em uso = tem pai no grafo além da Root. Perguntar só pelos slots PBR
         perderia textura apontada por extensão (o alien usa a specularTexture
         do KHR_materials_specular) e subestimaria a VRAM. */
      const used = root.listTextures().filter(texture => {
        const parents = typeof texture.listParents === 'function' ? texture.listParents() : null;
        return !parents || parents.some(parent => parent.propertyType !== 'Root');
      });
      /* conta por IMAGEM única: o mesmo binário costuma servir dois slots
         (metallicRoughness + occlusion) e contar por material duplicaria. */
      const seen = new Map();
      for (const texture of used) {
        const image = Buffer.from(texture.getImage() || []);
        if (!image.length) continue;
        const key = require('node:crypto').createHash('sha1').update(image).digest('hex');
        if (!seen.has(key)) seen.set(key, imageSize(image));
      }
      let bytes = 0;
      const sides = [];
      for (const size of seen.values()) {
        assert.ok(size, `${file}: imagem com cabeçalho ilegível`);
        bytes += size.width * size.height * 4;
        sides.push(Math.max(size.width, size.height));
      }
      perFile.push({ file, bytes, images: seen.size, sides, disk: fs.statSync(path.join(ROOT, file)).size });
    }
  });

  it('dado o inventário servido, então o RGBA8 total cabe no orçamento do celular', () => {
    const total = perFile.reduce((sum, entry) => sum + entry.bytes, 0) / (1024 * 1024);
    const detalhe = perFile
      .filter(entry => entry.bytes > 0)
      .sort((a, b) => b.bytes - a.bytes)
      .map(entry => `${entry.file} ${(entry.bytes / 1048576).toFixed(1)} MB`)
      .join('\n  ');
    assert.ok(total <= MAX_RGBA8_MB,
      `RGBA8 total ${total.toFixed(1)} MB > ${MAX_RGBA8_MB} MB. Rode "npm run assets:plan".\n  ${detalhe}`);
  });

  it('dado cada modelo, então nenhum sozinho estoura o orçamento nem passa de 1024²', () => {
    for (const entry of perFile) {
      const mb = entry.bytes / (1024 * 1024);
      assert.ok(mb <= MAX_PER_FILE_MB,
        `${entry.file}: ${mb.toFixed(1)} MB de RGBA8 (limite ${MAX_PER_FILE_MB} MB)`);
      for (const side of entry.sides)
        assert.ok(side <= MAX_SIDE, `${entry.file}: textura de ${side}px (limite ${MAX_SIDE})`);
    }
  });

  it('dado o plano pinado, então os arquivos no repo já estão aplicados (build idempotente)', () => {
    const out = execFileSync(process.execPath,
      [path.join(ROOT, 'scripts', 'build-model-textures.js'), '--check'],
      { cwd: ROOT, encoding: 'utf8' });
    assert.match(out, /orçamento de textura: OK/,
      'assets fora do plano — rode "npm run build:assets"');
  });
});
