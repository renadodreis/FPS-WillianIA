/* ================================================================
   ÁRVORE — o colisor é o tronco que se VÊ.

   De perto (< 70 m) cada árvore é um GLB (game.js, `treeVariantMeshes`),
   e o tronco desses modelos NÃO fica no pivô: na retorcida ele está a
   ~1 m do centro; o bosquete tem três troncos em fila; o quarto modelo são
   duas mudas (folha, não madeira) a ±2,2 m com o meio vazio. O colisor era um círculo
   no pivô para todas — o jogador atravessava o tronco desenhado e batia num
   pilar invisível, a bala idem, e o bot (mesma lista, js/obstaculos.js) via
   e atirava através do tronco.

   ÂNCORA independente do colisor: a MALHA desenhada. Para cada árvore,
   varreduras de retas horizontais paralelas (5 cm entre elas) de oito
   lados, na faixa em que o modelo é só madeira (sem copa e acima das
   raízes, em coordenadas do modelo: até 1,8 m na gigante e na retorcida,
   até 1,35 m no bosquete, onde a folhagem do pinheiro começa). O `Raycaster` do three na
   malha instanciada dá a SILHUETA do tronco em cada varredura (trechos de
   retas que batem na madeira); o `rayBlockedAt` do produto (o do tiro) dá a
   silhueta do que barra a bala. Mede-se, trecho a trecho: tronco sem
   colisor, colisor sem tronco, erro do CENTRO e erro da LARGURA — não a
   contagem de retas, que na borda de um tronco afunilado vira ruído.
   Só contam retas sem parede, sem relevo e sem outro obstáculo (pedra,
   cacto, POI) no caminho. Na muda não há madeira: ali a bala não para.

   Porta 4150.
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame } = require('./helpers/harness.js');

const PORT = 4150;
const PASSO = 0.05;                        // m entre retas vizinhas
const POR_VARIANTE = 8;
const NOMES = ['gigante', 'retorcida', 'bosquete', 'mudas'];
const LARGURA = [1.6, 1.8, 4.2, 3.2];      // meia-largura da varredura (modelo, ×s)
const ALCANCE = [3, 3, 5, 4];              // a reta nasce fora do modelo (×s)
const FAIXAS = [[0.6, 1.0, 1.4, 1.8], [0.6, 1.0, 1.4, 1.8], [0.65, 1.0, 1.35], [0.7, 1.0]];

describe('árvore: o colisor é o tronco desenhado', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h, medidas;
  before(async () => {
    h = await bootGame({ port: PORT });
    await h.page.waitForFunction(() => {
      const g = window.__game;
      return g && g.treeVariantMeshes && g.treeSpots.length > 0;
    }, { timeout: 90000 });
    medidas = await h.play(async (nPorVar, passo, largura, alcances, faixas) => {
      const G = window.__game, MP = window.__MP, T = MP.THREE, QA = window.QA;
      const malhas = G.treeVariantMeshes;
      const vizinhos = (x, z, raio) => {
        const out = [];
        for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
          for (const o of G.obstaclesNear(x + i * 16, z + j * 16)) if (Math.hypot(o.x - x, o.z - z) < raio && !out.includes(o)) out.push(o);
        }
        return out;
      };
      const escolhidas = [[], [], [], []];
      for (const t of G.treeSpots) {
        const v = t.variant;
        if (v === undefined || escolhidas[v].length >= nPorVar) continue;
        if (G.Structures.sites.some(s => Math.hypot(s.x - t.x, s.z - t.z) < s.r + 12)) continue;
        if (vizinhos(t.x, t.z, 12).some(o => o.sourceId !== 'tree')) continue;
        if (MP.slopeAt(t.x, t.z) > 0.3) continue;
        escolhidas[v].push(t);
      }
      const rc = new T.Raycaster(), inv = new T.Matrix4(), loc = new T.Vector3();
      const o = new T.Vector3(), d = new T.Vector3();
      /* a primeira madeira na reta. Muda é folha (não conta, e a reta segue);
         copa e raiz na frente (fora da faixa só-madeira do modelo atingido,
         no espaço dele) deixam a reta ambígua: fora da conta */
      const TOPO = [1.9, 1.9, 1.45, 0];
      function madeira(len) {
        rc.set(o, d); rc.near = 0; rc.far = len;
        for (const hh of rc.intersectObjects(malhas, false)) {
          const mv = malhas.indexOf(hh.object);
          if (mv === 3) continue;
          hh.object.getMatrixAt(hh.instanceId, inv);
          loc.copy(hh.point).applyMatrix4(inv.invert());
          if (loc.y >= 0.5 && loc.y <= TOPO[mv]) return hh.distance;
          return NaN;
        }
        return Infinity;
      }
      /* diagnóstico: o ponto (lateral, profundidade) da varredura no espaço
         do modelo da árvore medida */
      const local = (t, ux, uz, alcance, lat, prof) => {
        const wx = t.x - ux * alcance - uz * lat + ux * prof, wz = t.z - uz * alcance + ux * lat + uz * prof;
        const c = Math.cos(t.rot), sn = Math.sin(t.rot), lx = (wx - t.x) / t.s, lz = (wz - t.z) / t.s;
        return [+(lx * c - lz * sn).toFixed(2), +(lx * sn + lz * c).toFixed(2)];
      };
      const res = [];
      for (let v = 0; v < 4; v++) {
        const r = { variante: v, arvores: escolhidas[v].length, varreduras: 0, trechosMalha: 0, trechosBala: 0,
          semColisor: [], semTronco: [], erroCentro: [], erroLargura: [] };
        for (const t of escolhidas[v]) {
          QA.reset(t.x + 14, t.z + 3);
          QA.tick(40);                                        // o LOD reparte (0,45 s)
          /* ARMADILHA DO THREE: o raycast da InstancedMesh testa primeiro a
             `boundingSphere`, calculada UMA vez e nunca invalidada — depois do
             LOD repartir as instâncias ela é a de outro lugar do mapa */
          for (const m of malhas) m.computeBoundingSphere();
          const alcance = alcances[v] * t.s, meia = largura[v] * t.s;
          for (let k = 0; k < 8; k++) {
            const a = k * Math.PI / 4 + 0.13, ux = Math.cos(a), uz = Math.sin(a);
            for (const ly of faixas[v]) {
              /* a altura da reta é a do MODELO (base da instância: chão do
                 pivô − 0,15 m), não a do chão local: em encosta, o tronco a
                 4 m do pivô tem o chão 0,3 m acima da base, e a reta a
                 "0,65 m do chão" cruzava a raiz dele */
              const ya = t.y - 0.15 + ly * t.s;
              const linha = [];
              for (let lat = -meia; lat <= meia + 1e-9; lat += passo) {
                const ax = t.x - ux * alcance - uz * lat, az = t.z - uz * alcance + ux * lat;
                const bx = t.x + ux * alcance - uz * lat, bz = t.z + uz * alcance + ux * lat;
                o.set(ax, ya, az); d.set(bx - ax, 0, bz - az);
                const len = d.length(); d.multiplyScalar(1 / len);
                let ok = true;
                for (let s = 0; s <= len && ok; s += 0.25) {
                  const folga = ya - MP.heightAt(ax + d.x * s, az + d.z * s);
                  if (folga < 0.2 || folga > 2.6) ok = false;
                }
                if (ok && G.Structures.rayHit(o, d, len) < len) ok = false;
                if (ok) for (const q of vizinhos((ax + bx) / 2, (az + bz) / 2, len)) {
                  if (q.sourceId === 'tree') continue;
                  const cx = q.x - ax, cz = q.z - az, tt = cx * d.x + cz * d.z;
                  if (Math.hypot(ax + d.x * tt - q.x, az + d.z * tt - q.z) < q.r + 0.3) { ok = false; break; }
                }
                const tM = ok ? madeira(len) : NaN;
                if (!ok || Number.isNaN(tM)) { linha.push(null); continue; }
                const rb = MP.rayBlockedAt(o, d, len);
                linha.push({ lat, tM, tB: rb < len - 1e-6 ? rb : Infinity });
              }
              r.varreduras++;
              /* trechos: retas vizinhas que batem (malha / bala) na MESMA
                 profundidade (±0,6 m) formam um tronco visto */
              const trechos = chave => {
                const out = [];
                let cur = null;
                for (const p of linha) {
                  const tt = p && p[chave];
                  if (p && Number.isFinite(tt) && cur && Math.abs(tt - cur.t) < 0.6) { cur.l1 = p.lat; cur.t = tt; continue; }
                  if (cur) out.push(cur);
                  cur = p && Number.isFinite(tt) ? { l0: p.lat, l1: p.lat, t: tt } : null;
                }
                if (cur) out.push(cur);
                return out;
              };
              const tm = trechos('tM'), tb = trechos('tB');
              r.trechosMalha += tm.length;
              r.trechosBala += tb.length;
              const usados = new Set();
              for (const m of tm) {
                let par = -1;
                for (let i = 0; i < tb.length; i++) {
                  if (usados.has(i)) continue;
                  if (tb[i].l1 >= m.l0 - 1e-9 && tb[i].l0 <= m.l1 + 1e-9 && Math.abs(tb[i].t - m.t) < 0.8) { par = i; break; }
                }
                const larg = m.l1 - m.l0 + passo;
                if (par < 0) { if (larg > 0.1 + 1e-9) r.semColisor.push({ larg: +larg.toFixed(2), arvore: [+t.x.toFixed(1), +t.z.toFixed(1)], k, ly, local: local(t, ux, uz, alcance, (m.l0 + m.l1) / 2, m.t) }); continue; }
                usados.add(par);
                const b = tb[par];
                r.erroCentro.push(Math.abs((b.l0 + b.l1) / 2 - (m.l0 + m.l1) / 2));
                r.erroLargura.push(Math.abs((b.l1 - b.l0) - (m.l1 - m.l0)));
              }
              tb.forEach((b, i) => {
                const larg = b.l1 - b.l0 + passo;
                if (!usados.has(i) && larg > 0.1 + 1e-9) r.semTronco.push({ larg: +larg.toFixed(2), arvore: [+t.x.toFixed(1), +t.z.toFixed(1)], k, ly, local: local(t, ux, uz, alcance, (b.l0 + b.l1) / 2, b.t) });
              });
            }
          }
        }
        res.push(r);
      }
      return res;
    }, POR_VARIANTE, PASSO, LARGURA, ALCANCE, FAIXAS);
  });
  after(async () => { if (h) await h.close(); });

  const p90 = l => { if (!l.length) return 0; const s = l.slice().sort((a, b) => a - b); return s[Math.floor(s.length * 0.9)]; };
  for (let v = 0; v < 3; v++) {
    it(`${NOMES[v]}: onde a madeira aparece a bala para, e onde não aparece ela passa`, t => {
      const r = medidas[v];
      const ec = p90(r.erroCentro), el = p90(r.erroLargura);
      t.diagnostic(`${NOMES[v]}: ${r.arvores} árvores, ${r.varreduras} varreduras, ${r.trechosMalha} troncos vistos; ` +
        `tronco sem colisor ${r.semColisor.length}, colisor sem tronco ${r.semTronco.length}; ` +
        `erro p90 do centro ${ec.toFixed(3)} m, da largura ${el.toFixed(3)} m` +
        (r.semColisor[0] ? ` — ex. sem colisor ${JSON.stringify(r.semColisor[0])}` : '') +
        (r.semTronco[0] ? ` — ex. sem tronco ${JSON.stringify(r.semTronco[0])}` : ''));
      assert.ok(r.arvores >= 3 && r.trechosMalha >= 40, `cenário não exercita o modelo ${NOMES[v]}: ${r.arvores} árvores, ${r.trechosMalha} troncos vistos`);
      assert.ok(r.semColisor.length <= r.trechosMalha * 0.03, `tronco desenhado sem colisor em ${r.semColisor.length} de ${r.trechosMalha} (a bala atravessa a madeira)`);
      assert.ok(r.semTronco.length <= r.trechosMalha * 0.03, `colisor sem tronco desenhado em ${r.semTronco.length} varreduras (a bala bate no ar)`);
      assert.ok(ec <= 0.12, `o colisor está deslocado do tronco: erro p90 do centro ${ec.toFixed(3)} m`);
      assert.ok(el <= 0.2, `o colisor tem outra largura que o tronco: erro p90 ${el.toFixed(3)} m`);
    });
  }

  it('mudas: folha não segura bala (nem o vazio entre as duas)', t => {
    const r = medidas[3];
    t.diagnostic(`mudas: ${r.arvores} árvores, ${r.varreduras} varreduras; trechos que barram a bala ${r.trechosBala}` +
      (r.semTronco[0] ? ` — ex. ${JSON.stringify(r.semTronco[0])}` : ''));
    assert.ok(r.arvores >= 3 && r.varreduras >= 40, `cenário não exercita as mudas: ${r.arvores} árvores, ${r.varreduras} varreduras`);
    assert.equal(r.trechosBala, 0, `a bala parou em ${r.trechosBala} trechos de muda`);
  });

  it('boot limpo: sem erro de página', () => {
    assert.deepEqual(h.pageErrors, []);
  });
});
