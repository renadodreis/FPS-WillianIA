#!/usr/bin/env node
/* ================================================================
   ORÇAMENTO DE TEXTURA DOS MODELOS SERVIDOS

   Por que existe: o custo de um .glb no celular não é o byte no fio, é o
   texel na GPU. Um PNG/WebP de 30 KB a 1024² vira 4 MB de RGBA8 (5,3 MB com
   a cadeia de mipmap) no instante em que o three sobe a textura. O
   inventário medido em 2026-08-08 (npm run assets:report) achou 194,6 MB de
   RGBA8 vindos de 7,80 MB comprimidos — com a bazuca sozinha respondendo por
   108 MB (27 mapas de 1024² num viewmodel de 4.5k triângulos).

   Como o alvo de cada imagem foi escolhido (npm run assets:plan): reduz-se a
   imagem e reconstrói-se no tamanho original, medindo DOIS estragos
   diferentes, porque reduzir textura erra de duas maneiras distintas.

   1) BORRÃO — reconstrução com lanczos3, erro RMS. Pega perda de detalhe
      legível: a pichação "KABOOM" do cano da bazuca, o letreiro do mercado.
   2) SANGRIA DE ILHA — reconstrução com NEAREST, fração de texels que TROCAM
      DE COR: f48 (erro > 48/255 em algum canal) e f96 (> 96/255, troca
      franca). Pega o estrago do atlas de cor CHAPADA, o padrão low-poly em
      que ilhas de UV de 2 px ficam coladas: reduzir mistura a ilha vizinha e
      a arma sai pintada errada — coisa que o RMS sozinho não distingue de
      "menos detalhe".

   As duas medidas são no PIOR LADRILHO de 64x64, não na imagem toda — custou
   uma regressão pra aprender: o baseColor do punho da bazuca é 99% de cinza
   chapado com um motivo minúsculo de dentes brancos sobre faixa vermelha; a
   média global passava folgada (f96 0,7%) enquanto o motivo virava um borrão
   marrom no modelo. Estrago concentrado precisa de métrica local.

   E o limite depende do SLOT, porque nem toda textura erra igual:
     baseColor  — carrega a IDENTIDADE (a pichação, os dentes do punho, a
                  faixa vermelha). Errar aqui muda o que o objeto é. Limite
                  apertado.
     resto      — metallicRoughness, occlusion, normal, emissive só modulam
                  brilho e relevo. Errar aqui muda o acabamento, não o
                  desenho. Medido: o metallicRoughness da luneta a 128²
                  (f96 14%) passou despercebido no render lado a lado,
                  enquanto o baseColor do punho a 128² (f96 13%) destruiu o
                  motivo. Limite folgado.

   Em cima disso, um crédito de uma metade: cortar 1024² pra 512² remove
   exatamente o mip 0, o nível que a GPU só amostra quando o objeto cobre
   mais tela do que a textura tem texel. Barato — mas NÃO de graça, e isso
   também custou uma medição: o normal map do alien perde RMS 14,8 só na
   metade (micro-relevo da armadura é campo de derivada, borrar achata o
   sombreado) e o bicho passou a parecer plástico molhado no render lado a
   lado. Por isso a metade tem teto próprio, mais frouxo (RMS <= 12), além do
   veto de sangria catastrófica. Abaixo da metade é preciso provar: RMS <= 8
   (~30 dB de PSNR) e a sangria dentro do limite do slot.

   O alvo é então o MENOR tamanho da escada [128, 256, 512] que passa: se for
   a metade, RMS <= 12 e f96 dentro do limite de metade do slot; se for mais
   fundo, RMS <= 8 e f48/f96 dentro do limite profundo do slot. Imagem que não
   passa em nenhum fica no tamanho original — decisão medida, não
   esquecimento.

   Imagens com dimensão máxima < 512 nunca entram: não sobra ganho (<= 256 KB
   de VRAM) e é exatamente onde moram as tiras de paleta (PaletteBaseColor,
   256x4) que uma redução destruiria.

   O PLANO abaixo é FIXO. `--plan` recalcula e imprime a recomendação a
   partir dos arquivos atuais (útil pra revisar ou pra assets novos), mas a
   execução normal aplica só a tabela pinada — assim o build é determinístico
   e idempotente (rodar duas vezes dá o mesmo byte) mesmo que a versão do
   sharp/libvips mude o resample.

   Uso:
     npm run build:assets            aplica o plano (idempotente)
     npm run build:assets -- --check só verifica, não escreve (sai 1 se fora)
     npm run assets:plan             recalcula a recomendação e imprime
   ================================================================ */
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');

/* Só entram imagens com lado >= este valor: abaixo disso o ganho é <= 256 KB
   e o risco (tiras de paleta) é alto. */
const MIN_SIDE = 512;
const LADDER = [128, 256, 512];
const MAX_RMS = 8.0;          // /255 — ~30 dB de PSNR, o piso do "não dá pra ver"
const MAX_RMS_HALVING = 12.0; // teto mais frouxo do corte de uma metade
const TILE = 64;              // lado do ladrilho onde a sangria é medida
/* limites de sangria por slot, no pior ladrilho. `halving` é o que basta pra
   liberar o corte de uma metade; `deep` é o que se exige abaixo dela. */
const LIMITS = {
  baseColor: { halving: { f96: 5 }, deep: { f48: 8, f96: 1.5 } },
  shading: { halving: { f96: 20 }, deep: { f48: 100, f96: 15 } },
};

/* PLANO PINADO — chave: caminho relativo; valor: alvo do lado maior por
   índice de textura no grafo glTF (null = preservar como está).
   Preenchido por `npm run assets:plan` em 2026-08-08; cada `null` é uma
   decisão MEDIDA de não mexer, não um esquecimento. */
const PLAN = {
  // nenhum módulo do jogo carrega este (grep em js/ e game.js): não chega a
  // GPU nenhuma. Fica como está — mexer só geraria churn num asset que
  // ninguém pede.
  'assets/models/Armas/ak-47_reddot.glb': [null],
  // 27 mapas de 1024² num viewmodel de 4.524 triângulos. Os normal/AO caem
  // pra 128²; os baseColor que carregam desenho — pichação "KABOOM" do cano,
  // dentes do punho — seguram 512².
  'assets/models/Armas/bazooka.optimized.glb': [
    512, 128, 128, 256, 128, 128, 512, 128, 128, 128, 512, 128, 512, 256,
    128, 256, 128, 128, 512, 256, 128, 512, 256, 128, 512, 512, 128,
  ],
  // atlas de cor chapada (432 cores, ilhas de 2 px): reduzir o baseColor
  // pinta a arma errada. O metallicRoughness aceita a metade.
  'assets/models/Armas/low-poly_Arma_do_Alien.glb': [null, null],
  'assets/models/Armas/low-poly_Sniper_lenta_forte.glb': [null, 128, 128],
  // pior atlas do repo: 9,0% de troca de cor franca já a 512. Intocável sem
  // reempacotar UV. É o maior alvo restante (4 MB) — ver relatório.
  'assets/models/Armas/low-poly_sniper_Rápida_Fraca.glb': [null],
  'assets/models/Armas/shotgun_Shotgun_lenta_forte.glb': [512],
  'assets/models/Cenários/low_poly_tree_house.glb': [null],
  'assets/models/Cenários/low_poly_tree_log_and_stump.glb': [null],
  'assets/models/Cenários/low_poly_tree_with_twisting_branches.glb': [null, null],
  'assets/models/Cenários/mercado.glb': [null],
  'assets/models/Cenários/wooden_barrel.glb': [128, 512, 512],
  'assets/models/Personagens/Guardiao.glb': [null],
  'assets/models/Personagens/alien.optimized.glb': [128, null, 128, 512, null],
  'assets/models/Personagens/low_poly_helldiver_rig.glb': [null, null, 256, 256],
  'assets/models/Veículos/gumball-car.optimized.glb': [256, 128, 128, 256, 256, 256, null, null],
  'assets/models/Veículos/low_poly_helicopter.glb': [512],
  'assets/models/Veículos/truck-drifter.optimized.glb': [null],
  'assets/models/skeleton.v1.glb': [256, 256, 256, 256],
  'assets/models/volcano.v1.glb': [512],
};

const SLOTS = [
  m => m.getBaseColorTexture(),
  m => m.getMetallicRoughnessTexture(),
  m => m.getNormalTexture(),
  m => m.getOcclusionTexture(),
  m => m.getEmissiveTexture(),
];

function trackedGlb() {
  return execFileSync('git', ['-c', 'core.quotepath=false', 'ls-files', '--', 'assets/models'],
    { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter(line => line.toLowerCase().endsWith('.glb'));
}

/* Texturas que alguém realmente usa. A pergunta é feita ao GRAFO
   (listParents), não a uma lista de slots conhecidos: material aponta textura
   por extensão também. Custou um erro descobrir — a specularTexture do
   KHR_materials_specular do alien não estava na lista de slots, foi
   classificada como órfã, apagada, e a armadura virou plástico brilhante no
   render lado a lado. Órfã de verdade (sem pai além da Root) é peso de rede
   morto e sai fora. */
function referenced(root) {
  return root.listTextures().filter(texture => {
    const parents = typeof texture.listParents === 'function' ? texture.listParents() : null;
    if (!parents) return true; // sem como perguntar: preserva
    return parents.some(parent => parent.propertyType !== 'Root');
  });
}

/* baseColor manda: uma imagem que serve de baseColor em qualquer material
   entra no limite apertado. Textura usada por um slot que não conhecemos
   (extensão: specular, clearcoat, sheen...) também entra no apertado — não
   dá pra afirmar que só modula acabamento. */
function slotOf(root, texture) {
  let onlyShading = false;
  for (const material of root.listMaterials()) {
    if (material.getBaseColorTexture() === texture) return 'baseColor';
    for (const get of SLOTS.slice(1)) if (get(material) === texture) onlyShading = true;
  }
  return onlyShading ? 'shading' : 'baseColor';
}

async function meta(sharp, image) {
  const info = await sharp(image).metadata();
  return { width: info.width, height: info.height };
}

/* Estrago de reduzir para `target`: RMS (borrão, reconstrução suave) e
   f48/f96 (sangria de ilha, reconstrução por vizinho mais próximo). */
async function damage(sharp, image, width, height, target) {
  const scale = target / Math.max(width, height);
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const { data, info } = await sharp(image).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const small = await sharp(image).resize(w, h, { kernel: 'lanczos3' }).png().toBuffer();
  const soft = await sharp(small).resize(width, height, { kernel: 'lanczos3' }).removeAlpha().raw().toBuffer();
  const hard = await sharp(small).resize(width, height, { kernel: 'nearest' }).removeAlpha().raw().toBuffer();
  const texels = info.width * info.height;
  const cols = Math.ceil(info.width / TILE);
  const rows = Math.ceil(info.height / TILE);
  const tile48 = new Uint32Array(cols * rows);
  const tile96 = new Uint32Array(cols * rows);
  const tileN = new Uint32Array(cols * rows);
  let squares = 0;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const p = y * info.width + x;
      let worst = 0;
      for (let c = 0; c < info.channels; c++) {
        const at = p * info.channels + c;
        const blur = data[at] - soft[at];
        squares += blur * blur;
        const bleed = Math.abs(data[at] - hard[at]);
        if (bleed > worst) worst = bleed;
      }
      const tile = Math.floor(y / TILE) * cols + Math.floor(x / TILE);
      tileN[tile]++;
      if (worst > 48) tile48[tile]++;
      if (worst > 96) tile96[tile]++;
    }
  }
  let f48 = 0;
  let f96 = 0;
  for (let t = 0; t < tileN.length; t++) {
    if (!tileN[t]) continue;
    f48 = Math.max(f48, (100 * tile48[t]) / tileN[t]);
    f96 = Math.max(f96, (100 * tile96[t]) / tileN[t]);
  }
  return { rms: Math.sqrt(squares / (texels * info.channels)), f48, f96 };
}

async function resized(sharp, image, mime, width, height, target) {
  const scale = target / Math.max(width, height);
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const pipe = () => sharp(image).resize(w, h, { kernel: 'lanczos3' });
  /* mime preservado: trocar o formato mudaria o caminho de decode do
     navegador (e o EXT_texture_webp do arquivo) sem ganho de VRAM. */
  if (mime === 'image/png') return pipe().png({ compressionLevel: 9, effort: 10 }).toBuffer();
  if (mime === 'image/jpeg') return pipe().jpeg({ quality: 92, chromaSubsampling: '4:4:4' }).toBuffer();
  if (mime === 'image/webp') {
    /* WebP lossless numa imagem reduzida às vezes fica MAIOR que o lossy
       original (aconteceu com o vulcão e o esqueleto: +96 KB e +34 KB).
       Encoda os dois e fica com o menor — a VRAM é a mesma, o fio não. */
    const [lossless, lossy] = await Promise.all([
      pipe().webp({ lossless: true, effort: 6 }).toBuffer(),
      pipe().webp({ quality: 90, effort: 6 }).toBuffer(),
    ]);
    return lossless.length <= lossy.length ? lossless : lossy;
  }
  throw new Error(`mime sem receita de reencode: ${mime}`);
}

function rgba8(width, height) {
  return width * height * 4;
}

async function plan(sharp, io) {
  const out = {};
  for (const file of trackedGlb()) {
    const document = await io.read(path.join(ROOT, file));
    const root = document.getRoot();
    const textures = referenced(root);
    if (!textures.length) continue;
    const targets = [];
    const notes = [];
    for (const texture of textures) {
      const image = Buffer.from(texture.getImage() || []);
      if (!image.length) { targets.push(null); notes.push('sem imagem'); continue; }
      const { width, height } = await meta(sharp, image);
      const side = Math.max(width, height);
      if (side < MIN_SIDE) { targets.push(null); notes.push(`${side} < ${MIN_SIDE}`); continue; }
      const slot = slotOf(root, texture);
      const limit = LIMITS[slot];
      let chosen = null;
      const measured = [];
      for (const target of LADDER) {
        if (target >= side) break;
        const { rms, f48, f96 } = await damage(sharp, image, width, height, target);
        measured.push(`${target}:RMS ${rms.toFixed(1)} f48 ${f48.toFixed(1)}% f96 ${f96.toFixed(1)}%`);
        const halving = target * 2 >= side; // só tira o mip 0
        const ok = halving
          ? rms <= MAX_RMS_HALVING && f96 <= limit.halving.f96
          : rms <= MAX_RMS && f48 <= limit.deep.f48 && f96 <= limit.deep.f96;
        if (ok) { chosen = target; break; }
      }
      targets.push(chosen);
      notes.push(`${slot} ${side}→${chosen || 'MANTÉM'} (${measured.join(' | ')})`);
    }
    out[file] = targets;
    console.log(`\n'${file}': [${targets.map(t => t === null ? 'null' : t).join(', ')}],`);
    notes.forEach((note, index) => console.log(`   #${index} ${note}`));
  }
  return out;
}

async function apply(sharp, io, { check }) {
  let changedFiles = 0;
  let vramBefore = 0;
  let vramAfter = 0;
  const problems = [];
  /* contabiliza por IMAGEM única: o GLTFLoader cacheia por índice de imagem,
     então dois `texture` apontando pro mesmo binário viram UMA textura na GPU.
     Contar por slot de material inflaria o total. */
  const counted = new Set();

  for (const file of trackedGlb()) {
    const targets = PLAN[file];
    const absolute = path.join(ROOT, file);
    const document = await io.read(absolute);
    const root = document.getRoot();
    const textures = referenced(root);
    if (!textures.length) continue;
    if (!targets) {
      problems.push(`${file}: tem textura e não está no PLANO — rode "npm run assets:plan"`);
      continue;
    }
    if (targets.length !== textures.length) {
      problems.push(`${file}: PLANO tem ${targets.length} alvos, arquivo tem ${textures.length} texturas`);
      continue;
    }

    let touched = false;
    /* imagem que nenhum material cita: some. Idempotente — na segunda rodada
       não existe mais nenhuma. */
    const alive = new Set(textures);
    for (const texture of root.listTextures()) {
      if (alive.has(texture)) continue;
      if (check) problems.push(`${file}: textura órfã ${texture.getName() || '(sem nome)'} ainda no arquivo`);
      else { texture.dispose(); touched = true; }
    }
    for (let index = 0; index < textures.length; index++) {
      const texture = textures[index];
      const target = targets[index];
      const image = Buffer.from(texture.getImage() || []);
      if (!image.length) continue;
      const { width, height } = await meta(sharp, image);
      const digest = `${file}:${crypto.createHash('sha1').update(image).digest('hex')}`;
      if (!counted.has(digest)) {
        counted.add(digest);
        vramBefore += rgba8(width, height);
        const side = target ? Math.min(target, Math.max(width, height)) : Math.max(width, height);
        const scale = side / Math.max(width, height);
        vramAfter += rgba8(Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale)));
      }
      if (target === null) continue;
      const side = Math.max(width, height);
      if (side <= target) continue; // já no alvo: no-op idempotente
      if (check) {
        problems.push(`${file} #${index}: ${width}x${height} acima do alvo ${target}`);
        continue;
      }
      const mime = texture.getMimeType();
      texture.setImage(await resized(sharp, image, mime, width, height, target));
      touched = true;
    }

    if (touched && !check) {
      const temporary = `${absolute}.tmp-${process.pid}.glb`;
      try {
        await io.write(temporary, document);
        fs.renameSync(temporary, absolute);
      } finally {
        if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
      }
      changedFiles++;
      const bytes = fs.statSync(absolute).size;
      console.log(`${file}: reescrito, ${(bytes / 1024).toFixed(0)} KB, ` +
        `SHA-256 ${crypto.createHash('sha256').update(fs.readFileSync(absolute)).digest('hex').slice(0, 16)}`);
    }
  }

  const mb = value => (value / (1024 * 1024)).toFixed(1);
  console.log(`\nVRAM RGBA8 dos modelos servidos: ${mb(vramBefore)} MB → ${mb(vramAfter)} MB ` +
    `(${mb(vramBefore * 4 / 3)} → ${mb(vramAfter * 4 / 3)} MB com mipmap)`);
  if (!check) console.log(`arquivos reescritos: ${changedFiles}`);
  if (problems.length) {
    for (const problem of problems) console.error(`FORA DO ORÇAMENTO: ${problem}`);
    process.exitCode = 1;
  } else if (check) {
    console.log('orçamento de textura: OK');
  }
}

async function main() {
  const args = process.argv.slice(2);
  const sharp = require('sharp');
  const { Logger, NodeIO, Verbosity } = await import('@gltf-transform/core');
  const { ALL_EXTENSIONS } = await import('@gltf-transform/extensions');
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  io.setLogger(new Logger(Verbosity.ERROR));
  if (args.includes('--plan')) await plan(sharp, io);
  else await apply(sharp, io, { check: args.includes('--check') });
}

main().catch(error => {
  console.error(`Falha no orçamento de textura: ${error.message}`);
  process.exitCode = 1;
});
