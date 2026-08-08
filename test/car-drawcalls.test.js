/* Orçamento de DRAW CALLS dos veículos e exatidão da fusão de peças.

   Contexto medido (viewport de celular 844x390, mundo novo): os veículos
   custavam 130 das 787 draw calls do frame (17 %) — CarBody 42 + 22 por
   canto de roda. A causa é o rig cortar carroceria e rodas por MATERIAL: o
   RX-7 sozinho gastava 41 draw calls (13 da carroceria + 7 por roda).

   A fusão (js/carwheels.js) junta peças que só diferem na COR difusa numa
   geometria só, com a cor por VÉRTICE. O pixel tem que continuar o mesmo —
   por isso os testes abaixo não olham "quantos materiais sobraram", e sim se
   cada cor de origem ainda chega EXATAMENTE nos mesmos triângulos. */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame } = require('./helpers/harness');

/* Cores dos materiais do RX-7 MEDIDAS ANTES da fusão (sonda sobre o GLB já
   normalizado). São a verdade externa: se a fusão perder ou trocar uma cor,
   esta lista denuncia. A lataria (02_-_Default) fica de fora porque é
   repintada por veículo (cfg.bodyTint). */
const RX7_CORES = ['454540', '5f5f5f', '616161', '6c6c6c', '808085', '9ba3b8',
  'a86262', 'b2b8c7', 'c8d0e0', 'dddddd', 'e08484', 'e3dcce', 'feb600'];

/* Teto de draw calls com o veículo INTEIRO no frame, medido pelo renderer.
   Entre parênteses, o valor medido ANTES da fusão.
   - RX-7:     1 carroceria fundida + 1 lataria (tint por veículo) + 4 rodas  (41)
   - caminhão: 3 da carroceria (mapas diferentes) + 4 rodas                    (7)
   - buggy:    9 da carroceria + 2 por roda, 5 texturas distintas: nada a
               fundir sem atlas novo (o asset é de outro dono). O 18º é o
               vidro transparente DoubleSide, que o three desenha em dois
               passes — e é justamente por isso que peça transparente NUNCA
               entra na fusão.                                                (18) */
const TETO = {
  'mazda-rx7.v2.glb': 6,
  'truck-drifter.optimized.glb': 7,
  'gumball-car.optimized.glb': 18,
};
const TETO_FROTA = 52; // 155 antes (18 + 3×41 + 2×7)

describe('Draw calls dos veículos', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h;
  before(async () => {
    // 3199: porta livre (3196 é do collision.test.js, 3194–3198 já usadas)
    h = await bootGame({ port: 3199, protocolTimeout: 600000 });
    await h.play(async () => {
      const MP = window.QA.MP, G = window.QA.G;
      await G.Car.ready;
      window.QA.tick(120);
      /* Desenha SÓ um veículo e devolve a contagem REAL do three
         (info.render.calls com autoReset desligado — técnica do
         js/perfhud.js). É medição, não contagem de malhas por procuração. */
      window.QA_drawVeiculo = idx => {
        const v = G.Car.vehicles[idx], THREE = MP.THREE;
        v.group.updateMatrixWorld(true);
        const ocultos = [];
        MP.scene.traverse(o => {
          if (!(o.isMesh || o.isPoints || o.isSprite || o.isLine) || !o.visible) return;
          let p = o, meu = false;
          while (p) { if (p === v.group) { meu = true; break; } p = p.parent; }
          if (!meu) { o.visible = false; ocultos.push(o); }
        });
        const box = new THREE.Box3().setFromObject(v.group);
        const alvo = box.getCenter(new THREE.Vector3());
        const raio = box.getSize(new THREE.Vector3()).length();
        MP.camera.position.copy(alvo).add(new THREE.Vector3(raio, raio * 0.6, raio));
        MP.camera.lookAt(alvo);
        MP.camera.updateMatrixWorld(true);
        const auto = MP.renderer.info.autoReset;
        MP.renderer.info.autoReset = false;
        MP.renderer.info.reset();
        MP.renderer.setRenderTarget(null);
        MP.renderer.render(MP.scene, MP.camera);
        const calls = MP.renderer.info.render.calls;
        MP.renderer.info.autoReset = auto;
        for (const o of ocultos) o.visible = true;
        let malhas = 0;
        v.group.traverse(o => { if (o.isMesh && o.visible) malhas++; });
        return { calls, malhas, url: v.cfg.modelUrl.replace(/^.*\//, ''), tipo: v.cfg.name };
      };
    });
  });
  after(async () => { if (h) await h.close(); });

  it('dado cada veículo inteiro no frame, então gasta draw calls dentro do orçamento', async () => {
    const r = await h.play(() => window.QA.G.Car.vehicles.map((_, i) => window.QA_drawVeiculo(i)));
    assert.ok(r.length >= 3, 'frota incompleta');
    const total = r.reduce((a, v) => a + v.calls, 0);
    for (const v of r) {
      const teto = TETO[v.url];
      assert.ok(teto !== undefined, `veículo desconhecido no orçamento: ${v.url}`);
      assert.ok(v.calls > 0, `${v.tipo} não desenhou nada — teste vazio`);
      assert.ok(v.calls <= teto,
        `${v.tipo} (${v.url}) gastou ${v.calls} draw calls (teto ${teto}; ${v.malhas} malhas)`);
    }
    assert.ok(total <= TETO_FROTA,
      `frota inteira gastou ${total} draw calls (teto ${TETO_FROTA}): ` +
      r.map(v => `${v.url}=${v.calls}`).join(' '));
  });

  it('dada a fusão, então cada cor de origem chega nos MESMOS triângulos (vertex color exato)', async () => {
    const r = await h.play(() => {
      const G = window.QA.G;
      const vistos = new Set();
      const out = [];
      for (const v of G.Car.vehicles) {
        if (vistos.has(v.cfg.modelUrl)) continue;
        vistos.add(v.cfg.modelUrl);
        const partes = [];
        v.group.traverse(o => {
          if (!o.isMesh || !o.userData.importedCarModel) return;
          const fontes = o.userData.carFontes;
          if (!fontes) { partes.push({ semManifesto: true, nome: o.material.name }); return; }
          if (fontes.length < 2) return;              // peça sozinha: nada a provar
          const g = o.geometry, cor = g.getAttribute('color');
          const idx = g.getIndex();
          const nTri = (idx ? idx.count : g.getAttribute('position').count) / 3;
          const conta = new Map();
          let misto = 0;
          if (cor) {
            for (let t = 0; t < nTri; t++) {
              let k = null, ok = true;
              for (let j = 0; j < 3; j++) {
                const vi = idx ? idx.getX(t * 3 + j) : t * 3 + j;
                const kk = `${cor.getX(vi).toFixed(4)},${cor.getY(vi).toFixed(4)},${cor.getZ(vi).toFixed(4)}`;
                if (k === null) k = kk; else if (k !== kk) ok = false;
              }
              if (!ok) { misto++; continue; }
              conta.set(k, (conta.get(k) || 0) + 1);
            }
          }
          partes.push({
            nome: o.material.name, misto, nTri,
            corMaterial: o.material.color.getHexString(),
            vertexColors: !!o.material.vertexColors,
            temAtributo: !!cor,
            coresDistintas: new Set(fontes.map(f => f.hex)).size,
            coresNaGeo: conta.size,
            fontes: fontes.map(f => ({
              nome: f.nome, hex: f.hex, tris: f.tris,
              trisNaGeo: conta.get(`${f.rgb[0].toFixed(4)},${f.rgb[1].toFixed(4)},${f.rgb[2].toFixed(4)}`) || 0,
            })),
          });
        });
        out.push({ url: v.cfg.modelUrl.replace(/^.*\//, ''), partes });
      }
      return out;
    });
    const fundidas = r.flatMap(m => m.partes.filter(p => !p.semManifesto));
    assert.ok(fundidas.length >= 5, `só ${fundidas.length} peças fundidas — a fusão não rodou`);
    for (const m of r) for (const p of m.partes) {
      assert.ok(!p.semManifesto, `${m.url}: malha importada sem manifesto de fusão (${p.nome})`);
      assert.equal(p.misto, 0,
        `${m.url}/${p.nome}: ${p.misto} triângulos com cor por vértice inconsistente`);
      if (p.coresDistintas > 1) {
        assert.equal(p.vertexColors, true, `${m.url}/${p.nome}: fundido sem vertexColors`);
        assert.equal(p.corMaterial, 'ffffff',
          `${m.url}/${p.nome}: material fundido tem cor ${p.corMaterial} (multiplicaria o vertex color)`);
        assert.ok(p.temAtributo, `${m.url}/${p.nome}: sem atributo color`);
        assert.equal(p.coresNaGeo, p.coresDistintas,
          `${m.url}/${p.nome}: ${p.coresNaGeo} cores na geometria para ${p.coresDistintas} cores de origem`);
        const somaFontes = p.fontes.reduce((a, f) => a + f.tris, 0);
        assert.equal(somaFontes, p.nTri,
          `${m.url}/${p.nome}: manifesto soma ${somaFontes} triângulos, geometria tem ${p.nTri}`);
        // cores repetidas entre fontes somam no mesmo balde da geometria
        const porCor = new Map();
        for (const f of p.fontes) porCor.set(f.hex, (porCor.get(f.hex) || 0) + f.tris);
        for (const f of p.fontes)
          assert.equal(f.trisNaGeo, porCor.get(f.hex),
            `${m.url}/${p.nome}: ${f.nome} (#${f.hex}) devia pintar ${porCor.get(f.hex)} triângulos e pintou ${f.trisNaGeo}`);
      }
    }
  });

  it('dado o RX-7, então TODAS as cores originais continuam sendo desenhadas', async () => {
    const r = await h.play(() => {
      const G = window.QA.G, THREE = window.QA.MP.THREE;
      const esportivos = G.Car.vehicles.filter(v => v.cfg.modelUrl.endsWith('mazda-rx7.v2.glb'));
      const C = new THREE.Color();
      return esportivos.map(v => {
        const cores = new Set(), latarias = new Set();
        v.group.traverse(o => {
          if (!o.isMesh || !o.userData.importedCarModel) return;
          const m = o.material;
          if (m.name === v.cfg.bodyMaterial) { latarias.add(m.color.getHexString()); return; }
          const cor = o.geometry.getAttribute('color');
          if (m.vertexColors && cor) {
            for (let i = 0; i < cor.count; i++)
              cores.add(C.setRGB(cor.getX(i), cor.getY(i), cor.getZ(i)).getHexString());
          } else cores.add(m.color.getHexString());
        });
        return { cores: [...cores].sort(), lataria: [...latarias] };
      });
    });
    assert.ok(r.length >= 2, 'menos de 2 RX-7 na frota');
    for (const v of r) {
      assert.equal(v.lataria.length, 1, `lataria do RX-7 não é uma cor só: ${v.lataria.join(',')}`);
      assert.deepEqual(v.cores, RX7_CORES, `cores do RX-7 mudaram: ${v.cores.join(',')}`);
    }
    const latarias = new Set(r.map(v => v.lataria[0]));
    assert.ok(latarias.size >= 2, `esportivos com a mesma lataria: ${[...latarias].join(',')}`);
  });

  it('dada a fusão das rodas, então o pivô continua centrado na roda física', async () => {
    const r = await h.play(() => {
      const G = window.QA.G, THREE = window.QA.MP.THREE;
      const box = new THREE.Box3(), c = new THREE.Vector3(), s = new THREE.Vector3();
      return G.Car.vehicles.map(v => ({
        tipo: v.cfg.name,
        rodas: (v.visualWheels || []).map((p, i) => {
          box.makeEmpty();
          p.traverse(o => {
            if (!o.isMesh) return;
            o.geometry.computeBoundingBox();
            box.union(o.geometry.boundingBox);
          });
          box.getCenter(c); box.getSize(s);
          return {
            malhas: p.children.length,
            desloc: +c.length().toFixed(4),
            raio: +(Math.max(s.x, s.y) / 2).toFixed(4),
            largura: +s.z.toFixed(4),
            fisico: v.vehicle.wheelInfos[i].radius,
            wCfg: v.cfg.wheelWVis,
          };
        }),
      }));
    });
    for (const v of r) for (const [i, w] of v.rodas.entries()) {
      assert.ok(w.malhas > 0, `${v.tipo} roda ${i}: pivô sem malha`);
      assert.ok(w.desloc < 0.02,
        `${v.tipo} roda ${i}: fusão descentrou a geometria em ${w.desloc}m`);
      assert.ok(Math.abs(w.raio - w.fisico) < w.fisico * 0.35,
        `${v.tipo} roda ${i}: raio visual ${w.raio} vs físico ${w.fisico}`);
      assert.ok(w.largura <= w.wCfg * 1.6 + 0.05,
        `${v.tipo} roda ${i}: largura ${w.largura} acima de ${w.wCfg}`);
    }
  });

  it('dados os materiais dos veículos, então nenhum entrou nas cascatas do CSM', async () => {
    const r = await h.play(() => {
      const G = window.QA.G;
      const maus = [];
      for (const v of G.Car.vehicles)
        v.group.traverse(o => {
          if (!o.isMesh) return;
          for (const m of Array.isArray(o.material) ? o.material : [o.material])
            if (m && (G.csmDebug.hasMaterial(m) || G.csmDebug.hasShader(m)))
              maus.push(`${v.cfg.name}/${m.name || m.type}`);
          if (o.castShadow) maus.push(`castShadow:${v.cfg.name}/${o.name || o.type}`);
        });
      return maus;
    });
    /* Fundir peça REGISTRADA no CSM forçaria refresh das 4 cascatas
       (+57 % de draw calls, medido na rodada de celular). O modelo importado
       nunca entrou lá — e continua sem entrar depois da fusão. */
    assert.deepEqual(r, [], `materiais/malhas de veículo no caminho de sombra: ${r.join(', ')}`);
  });
});
