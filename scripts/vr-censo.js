/* ================================================================
   CENSO DA CENA — de ONDE vêm os draw calls, os materiais e os meshes.

   O baseline (docs/vr/baseline.md) diz QUANTO: 413 draw calls e 499
   materiais únicos no Quest, contra teto de 180 e 60. Este script diz
   DE QUEM. Sem isso, a Fase 2 vira caça a esmo — e caça a esmo em
   worldgen é o jeito documentado de quebrar este jogo (a ordem de
   consumo do `rand` seedado é contrato).

   Duas perguntas, e a segunda é a que decide o trabalho:

   1. QUEM é o dono. Cada objeto é atribuído ao ancestral que é filho
      direto da cena — é o nível em que os módulos `createX()` penduram
      as coisas, então o relatório sai na linguagem do código.

   2. QUANTOS materiais são REALMENTE diferentes. 499 objetos
      `Material` distintos não querem dizer 499 aparências distintas:
      cada `createX()` monta o seu à mão, e dois `MeshStandardMaterial`
      com a mesma cor, o mesmo mapa e os mesmos parâmetros desenham
      igual. A assinatura abaixo agrupa por APARÊNCIA. A diferença
      entre as duas contagens é o ganho que a deduplicação paga sem
      mexer num pixel do que se vê.

   Uso: node scripts/vr-censo.js [--port=3273] [--out=arquivo.json]
   ================================================================ */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { bootGame } = require('../test/helpers/harness.js');

const ROOT = path.join(__dirname, '..');

function parseArgs(argv) {
  const out = { port: 3273, out: '' };
  for (const a of argv) {
    const m = /^--([a-z]+)=(.*)$/.exec(a);
    if (!m) continue;
    if (m[1] === 'port') out.port = +m[2];
    else if (m[1] in out) out[m[1]] = m[2];
  }
  return out;
}

(async () => {
  const cfg = parseArgs(process.argv.slice(2));
  const h = await bootGame({ port: cfg.port });
  let dados;
  try {
    dados = await h.play(() => {
      const MP = window.__MP;

      /* Dono = ancestral NOMEADO mais próximo. Subir direto até o filho da
         cena não serve: quase todos são `Group` anônimo, e o relatório sai
         dizendo "Group: 209 materiais", que não aponta pra lugar nenhum do
         código. Subindo até quem tem nome, o número cai no módulo que criou
         a coisa. Sem nome em toda a linhagem, o rótulo diz onde ela pendura. */
      const raizes = new Map();  // objeto filho-da-cena -> rótulo
      {
        const G = window.__game;
        const marcar = (obj, rotulo) => {
          if (obj && obj.isObject3D) raizes.set(obj, rotulo);
        };
        marcar(MP.camera, 'arma FP (filha da câmera)');
        for (const [rotulo, mod] of Object.entries({
          Grass: G.Grass, Structures: G.Structures, Enemies: G.Enemies, Skeletons: G.Skeletons,
          Animals: G.Animals, Pickups: G.Pickups, Car: G.Car, Heli: G.Heli, Boss: G.Boss,
          Alien: G.Alien, Volcano: G.Volcano, Env: G.Env, Cannon: G.Cannon, MapToys: G.MapToys,
          Secrets: G.Secrets, Grenades: G.Grenades, Rockets: G.Rockets, FpBody: G.FpBody,
        })) {
          if (!mod) continue;
          for (const campo of ['group', 'root', 'mesh', 'g', 'container'])
            if (mod[campo] && mod[campo].isObject3D) marcar(mod[campo], rotulo);
          if (Array.isArray(mod.list))
            for (const it of mod.list) marcar(it && (it.group || it.g || it.root), rotulo);
        }
      }

      function dono(o) {
        let n = o, semNome = null;
        while (n) {
          if (raizes.has(n)) return raizes.get(n);
          if (n.name && !semNome) semNome = n.name;
          if (n.parent === MP.scene || !n.parent) break;
          n = n.parent;
        }
        return semNome || `(anônimo em ${n && n.type ? n.type : 'cena'})`;
      }

      /* Assinatura de APARÊNCIA: o que faz dois materiais desenharem
         igual. Se duas entradas caem aqui, elas podem virar UM material
         compartilhado sem mudar um pixel. */
      function assinatura(m) {
        const hex = c => (c && c.getHexString ? c.getHexString() : '-');
        const tex = t => (t && t.uuid ? t.uuid.slice(0, 8) : '-');
        return [
          m.type, hex(m.color), tex(m.map), tex(m.normalMap), tex(m.roughnessMap),
          tex(m.emissiveMap), tex(m.alphaMap), hex(m.emissive),
          m.emissiveIntensity, m.roughness, m.metalness, m.opacity, m.transparent,
          m.alphaTest, m.side, m.flatShading, m.vertexColors, m.depthWrite,
          m.blending, m.wireframe, m.fog, m.toneMapped,
          // shaders customizados nunca são intercambiáveis por aparência
          m.isShaderMaterial ? (m.vertexShader || '').length + ':' + (m.fragmentShader || '').length : '-',
          // o CSM injeta define por material: quem tem, tem sombra em cascata
          m.defines && m.defines.USE_CSM ? 'csm' : '-',
        ].join('|');
      }

      const porDono = new Map();
      const assinaturas = new Map();
      const materiais = new Set();
      let meshes = 0, instanced = 0, instancias = 0, skinned = 0, trisTotal = 0;

      const somaDono = (k, campo, v = 1) => {
        if (!porDono.has(k)) {
          porDono.set(k, { dono: k, meshes: 0, instanced: 0, instancias: 0,
            skinned: 0, materiais: new Set(), geometrias: new Set(), tris: 0 });
        }
        const d = porDono.get(k);
        if (campo === 'materiais' || campo === 'geometrias') d[campo].add(v);
        else d[campo] += v;
      };

      MP.scene.traverse(o => {
        if (!o.isMesh && !o.isPoints && !o.isLine && !o.isSprite) return;
        const k = dono(o);
        const n = o.isInstancedMesh ? o.count : 1;
        if (o.isInstancedMesh) { instanced++; instancias += o.count; somaDono(k, 'instanced'); somaDono(k, 'instancias', o.count); }
        else if (o.isSkinnedMesh) { skinned++; somaDono(k, 'skinned'); }
        else { meshes++; somaDono(k, 'meshes'); }

        const g = o.geometry;
        if (g) {
          somaDono(k, 'geometrias', g.uuid);
          const idx = g.index ? g.index.count : (g.attributes.position ? g.attributes.position.count : 0);
          const tris = (idx / 3) * n;
          trisTotal += tris;
          somaDono(k, 'tris', tris);
        }
        const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
        for (const m of mats) {
          materiais.add(m.uuid);
          somaDono(k, 'materiais', m.uuid);
          const sig = assinatura(m);
          if (!assinaturas.has(sig)) assinaturas.set(sig, { sig, n: 0, tipo: m.type, donos: new Set() });
          const a = assinaturas.get(sig);
          a.n++;
          a.donos.add(k);
        }
      });

      const donos = [...porDono.values()].map(d => ({
        dono: d.dono, meshes: d.meshes, instanced: d.instanced, instancias: d.instancias,
        skinned: d.skinned, materiais: d.materiais.size, geometrias: d.geometrias.size,
        tris: Math.round(d.tris),
      })).sort((a, b) => (b.materiais - a.materiais) || (b.meshes + b.skinned - a.meshes - a.skinned));

      const sigs = [...assinaturas.values()]
        .map(a => ({ n: a.n, tipo: a.tipo, donos: [...a.donos].slice(0, 4) }))
        .sort((a, b) => b.n - a.n);

      /* ---- ATRIBUIÇÃO DE DRAW CALL POR SUBTRAÇÃO ----
         Censo de cena conta o que EXISTE; frame paga o que é DESENHADO. Para
         saber quem custa, esconde um filho da cena por vez e mede a diferença
         em `renderer.info.render.calls`. `G.tick(0)` antes de cada medição
         prepara frusta e escalonador exatamente como a produção (mesmo
         caminho do scripts/perf-probe.js), e o `autoReset = false` impede que
         o próprio `render()` zere o contador no meio. */
      function medirDrawCalls() {
        const G = window.__game, R = MP.renderer;
        const salvoAuto = R.info.autoReset;
        const salvoSombra = R.shadowMap.enabled;
        R.info.autoReset = false;
        const frame = () => {
          G.tick(0);
          R.info.reset();
          R.render(MP.scene, MP.camera);
          return { calls: R.info.render.calls, tris: R.info.render.triangles };
        };
        frame(); frame();                       // aquece: shader e stream

        /* SOMBRA FORA DURANTE A ATRIBUIÇÃO. O CSM escalona uma cascata
           diferente por frame, então dois frames seguidos não são
           comparáveis: a subtração mediria o escalonador, não o objeto (o
           primeiro corte deste script dava 8 linhas de ~50 calls somando
           mais que o frame inteiro). Com sombra desligada o frame é estável
           e a diferença descreve só quem some. O custo da sombra vira um
           número à parte, que é como o orçamento de VR trata: 1 cascata. */
        const comSombra = frame();
        R.shadowMap.enabled = false;
        frame();
        const semSombra = frame();

        const porRotulo = new Map();
        for (const filho of MP.scene.children) {
          if (!filho.visible) continue;
          filho.visible = false;
          const sem = frame();
          filho.visible = true;
          const dCalls = semSombra.calls - sem.calls;
          const dTris = semSombra.tris - sem.tris;
          if (dCalls <= 0 && dTris <= 0) continue;
          const rot = raizes.get(filho) || filho.name || `(${filho.type})`;
          if (!porRotulo.has(rot)) porRotulo.set(rot, { dono: rot, calls: 0, tris: 0, nos: 0 });
          const a = porRotulo.get(rot);
          a.calls += dCalls; a.tris += dTris; a.nos++;
        }
        R.shadowMap.enabled = salvoSombra;
        R.info.autoReset = salvoAuto;
        return {
          base: semSombra,
          custoDaSombra: { calls: comSombra.calls - semSombra.calls, tris: comSombra.tris - semSombra.tris },
          linhas: [...porRotulo.values()].sort((a, b) => b.calls - a.calls),
        };
      }

      const drawCalls = medirDrawCalls();

      return {
        drawCalls,
        total: {
          materiaisUnicos: materiais.size,
          aparenciasDistintas: assinaturas.size,
          meshes, instancedMeshes: instanced, instancias, skinnedMeshes: skinned,
          trisNaCena: Math.round(trisTotal),
        },
        donos, assinaturasTop: sigs.slice(0, 25),
        // quantas cópias de material existem além da primeira de cada aparência
        materiaisRedundantes: materiais.size - assinaturas.size,
      };
    });
  } finally {
    await h.close();
  }

  const destino = cfg.out || path.join(ROOT, 'output', 'vr', 'censo.json');
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, JSON.stringify(dados, null, 2));

  const t = dados.total;
  console.log('\n=== CENSO DA CENA ===');
  console.log(`materiais: ${t.materiaisUnicos} objetos · ${t.aparenciasDistintas} APARÊNCIAS distintas · ` +
    `${dados.materiaisRedundantes} redundantes (${(dados.materiaisRedundantes / t.materiaisUnicos * 100).toFixed(0)}%)`);
  console.log(`meshes ${t.meshes} · instanced ${t.instancedMeshes} (${t.instancias} instâncias) · ` +
    `skinned ${t.skinnedMeshes} · ${(t.trisNaCena / 1e6).toFixed(2)}M tris na cena`);
  console.log('\ndono                       mats  meshes  skin  inst   geo      tris');
  for (const d of dados.donos.slice(0, 18)) {
    console.log(`${d.dono.slice(0, 24).padEnd(24)} ${String(d.materiais).padStart(6)} ` +
      `${String(d.meshes).padStart(7)} ${String(d.skinned).padStart(5)} ` +
      `${String(d.instanced).padStart(5)} ${String(d.geometrias).padStart(5)} ` +
      `${String(Math.round(d.tris / 1000) + 'k').padStart(9)}`);
  }
  if (dados.drawCalls) {
    const dc = dados.drawCalls;
    console.log(`\nframe SEM sombra: ${dc.base.calls} draw calls · ${(dc.base.tris / 1e6).toFixed(2)}M tris`);
    console.log(`custo da sombra (4 cascatas CSM): +${dc.custoDaSombra.calls} draw calls · ` +
      `+${(dc.custoDaSombra.tris / 1e6).toFixed(2)}M tris`);
    console.log('\nquem paga o frame (por subtração)   calls      tris   nós');
    for (const l of dc.linhas.slice(0, 14))
      console.log(`${String(l.dono).slice(0, 32).padEnd(32)} ${String(l.calls).padStart(6)} ` +
        `${String(Math.round(l.tris / 1000) + 'k').padStart(9)} ${String(l.nos).padStart(5)}`);
  }
  console.log('\naparências mais repetidas (candidatas a material compartilhado):');
  for (const a of dados.assinaturasTop.slice(0, 8))
    console.log(`  ${String(a.n).padStart(4)}x ${a.tipo.padEnd(22)} ${a.donos.join(', ').slice(0, 60)}`);
  console.log(`\n→ ${path.relative(ROOT, destino)}`);
})().catch(e => { console.error(e); process.exit(1); });
