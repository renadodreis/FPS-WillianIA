/* ================================================================
   TORRE NEXUS — o que a TELA mostra (relato do dono, jogando):
     "na entrada percebi que o chão buga"
     "percebi que tem luz na escada"
     "(os seguranças) não morrem e atiram pela parede"

   Chrome headless com o jogo real. As medidas leem o que está DESENHADO
   (os triângulos das malhas que estão no grafo da cena e visíveis) e o
   comparam com o que o jogo usa para andar (groundAt) e para a bala
   (Structures.rayHit / rayBlockedAt, o `fire()` de verdade). Nada aqui
   lê a lista de ops de js/paredes.js para decidir o que é certo: a faixa
   dos degraus sai dos números de NEXUS_INTERIOR.

   Porta 4136 (faixa desta frente: 4130–4139).
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame } = require('./helpers/harness');

const PORT = 4136;

/* Superfícies VIRADAS PARA CIMA de tudo que está desenhado numa caixa do
   mundo (terreno incluído). Roda na página. */
function instalarLeitorDeChao() {
  const G = window.__game, MP = window.__MP, THREE = MP.THREE;
  const visivel = o => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
  window.__chao = (caixa) => {
    const tris = [];
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), n = new THREE.Vector3();
    MP.scene.updateMatrixWorld(true);
    MP.scene.traverse(o => {
      if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || !visivel(o)) return;
      const g = o.geometry, pos = g && g.attributes.position;
      if (!pos) return;
      if (!g.boundingBox) g.computeBoundingBox();
      const bb = g.boundingBox.clone().applyMatrix4(o.matrixWorld);
      if (bb.max.x < caixa.x0 || bb.min.x > caixa.x1 || bb.max.z < caixa.z0 || bb.min.z > caixa.z1 ||
          bb.max.y < caixa.y0 || bb.min.y > caixa.y1) return;
      const idx = g.index, col = g.attributes.color, N = idx ? idx.count : pos.count;
      for (let i = 0; i < N; i += 3) {
        const ia = idx ? idx.getX(i) : i, ib = idx ? idx.getX(i + 1) : i + 1, ic = idx ? idx.getX(i + 2) : i + 2;
        a.fromBufferAttribute(pos, ia).applyMatrix4(o.matrixWorld);
        b.fromBufferAttribute(pos, ib).applyMatrix4(o.matrixWorld);
        c.fromBufferAttribute(pos, ic).applyMatrix4(o.matrixWorld);
        if (Math.max(a.x, b.x, c.x) < caixa.x0 || Math.min(a.x, b.x, c.x) > caixa.x1 ||
            Math.max(a.z, b.z, c.z) < caixa.z0 || Math.min(a.z, b.z, c.z) > caixa.z1 ||
            Math.max(a.y, b.y, c.y) < caixa.y0 || Math.min(a.y, b.y, c.y) > caixa.y1) continue;
        n.crossVectors(e1.subVectors(b, a), e2.subVectors(c, a));
        const len = n.length();
        if (len < 1e-9) continue;
        // lado desenhado: FrontSide (o padrão) só mostra a face cuja normal sobe
        if (n.y / len < 0.9) continue;
        const cor = col ? [col.getX(ia), col.getY(ia), col.getZ(ia)].map(v => Math.round(v * 255)).join(',') : '';
        tris.push({ a: [a.x, a.y, a.z], b: [b.x, b.y, b.z], c: [c.x, c.y, c.z], fonte: (o.name || o.uuid.slice(0, 8)) + '|' + cor,
          terreno: o === G.terrainMesh });
      }
    });
    return tris;
  };
  /* alturas desenhadas num ponto (x,z): todas, da mais alta para baixo */
  window.__alturas = (tris, x, z) => {
    const out = [];
    for (const t of tris) {
      const [ax, , az] = t.a, [bx, , bz] = t.b, [cx, , cz] = t.c;
      const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
      if (Math.abs(d) < 1e-12) continue;
      const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d;
      const l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d;
      const l3 = 1 - l1 - l2;
      if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) continue;
      out.push({ y: l1 * t.a[1] + l2 * t.b[1] + l3 * t.c[1], fonte: t.fonte, terreno: t.terreno });
    }
    return out.sort((p, q) => q.y - p.y);
  };
}

describe('Torre Nexus — a tela', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h;
  before(async () => {
    h = await bootGame({ port: PORT });
    await h.play(instalarLeitorDeChao);
  });
  after(async () => { if (h) await h.close(); });
  const play = (fn, ...args) => h.play(fn, ...args);

  it('entrada e saguão: um chão só (sem z-fighting), terreno não fura, e o pé pisa o chão desenhado', async () => {
    const r = await play(() => {
      const G = window.__game, MP = window.__MP, S = G.Structures, NI = S.NEXUS_INTERIOR;
      const C = S.city.center, gy = NI.gy;
      const tris = window.__chao({ x0: C.x - 9.5, x1: C.x + 9.5, z0: C.z - 9.5, z1: C.z + 11.5, y0: gy - 1.5, y1: gy + 0.6 });
      const poco = (lx, lz) => lx < NI.well.x1 + 0.1 && lz < NI.zBot + 0.1;
      let pontos = 0, zfight = 0, terrenoFura = 0, piorPe = 0, ondePe = null;
      const exZ = [];
      const amostra = (lx, lz, pe) => {
        const hs = window.__alturas(tris, C.x + lx, C.z + lz);
        if (!hs.length) return;
        pontos++;
        const [p, q] = hs;
        if (q && p.y - q.y < 0.002 && p.fonte !== q.fonte) { zfight++; if (exZ.length < 4) exZ.push([lx, lz, p.fonte, q.fonte, +(p.y - gy).toFixed(3)]); }
        if (p.terreno) terrenoFura++;
        if (pe) {
          const pisa = MP.groundAt(C.x + lx, C.z + lz, p.y + 0.3);
          const d = Math.abs(pisa - p.y);
          if (d > piorPe) { piorPe = d; ondePe = [lx, lz, +(pisa - gy).toFixed(3), +(p.y - gy).toFixed(3)]; }
        }
      };
      for (let lx = -8.55; lx <= 8.55; lx += 0.3) for (let lz = -8.55; lz <= 8.55; lz += 0.3)
        if (!poco(lx, lz)) amostra(lx, lz, true);
      for (let lx = -1.9; lx <= 1.9; lx += 0.2) for (let lz = 8.6; lz <= 9.25; lz += 0.1) amostra(lx, lz, true); // soleira
      return { pontos, zfight, terrenoFura, piorPe: +piorPe.toFixed(3), ondePe, exZ };
    });
    assert.ok(r.pontos > 2500, `pré-condição: o leitor achou chão desenhado em ${r.pontos} pontos`);
    assert.equal(r.zfight, 0, `${r.zfight} pontos do saguão/soleira com DUAS superfícies no mesmo plano (z-fighting): ${JSON.stringify(r.exZ)}`);
    assert.equal(r.terrenoFura, 0, `o terreno aparece por cima do piso em ${r.terrenoFura} pontos`);
    assert.ok(r.piorPe <= 0.05, `o pé fica ${r.piorPe} m fora do chão desenhado em ${JSON.stringify(r.ondePe)} (x, z, pé, piso)`);
  });

  it('entrar pela porta andando: sem degrau (altura do pé por quadro) e dentro o pé no piso do saguão', async () => {
    const r = await play(() => {
      const G = window.__game, MP = window.__MP, S = G.Structures, NI = S.NEXUS_INTERIOR, P = MP.player;
      const C = S.city.center, gy = NI.gy;
      // anda por pontos de passagem com o controle real (câmera + KeyW), medindo o pé quadro a quadro
      const andar = (pontos) => {
        window.QA.clearInput();
        const [de, ...resto] = pontos;
        P.pos.set(C.x + de[0], MP.groundAt(C.x + de[0], C.z + de[1], 999), C.z + de[1]); P.vel.set(0, 0, 0); P.onGround = true;
        window.QA.tick(3);
        let pior = 0, onde = null, ultimo = P.pos.y, chegou = true;
        for (const para of resto) {
          let i = 0;
          for (; i < 600; i++) {
            const dx = C.x + para[0] - P.pos.x, dz = C.z + para[1] - P.pos.z;
            if (Math.hypot(dx, dz) < 0.3) break;
            MP.camera.lookAt(P.pos.x + dx, P.pos.y + 1.4, P.pos.z + dz);
            G.keys.KeyW = true; G.tick(1 / 60);
            const d = Math.abs(P.pos.y - ultimo);
            if (d > pior) { pior = d; onde = [+(P.pos.x - C.x).toFixed(2), +(P.pos.z - C.z).toFixed(2)]; }
            ultimo = P.pos.y;
          }
          if (i === 600) chegou = false;
        }
        G.keys.KeyW = false;
        return { pior: +pior.toFixed(4), onde, chegou, fim: [+(P.pos.x - C.x).toFixed(2), +(P.pos.y - gy).toFixed(3), +(P.pos.z - C.z).toFixed(2)] };
      };
      const R = NI.rampaPorta;
      const reto = andar([[0, 16], [0, 2]]);
      // vindo colado na fachada: contorna a mureta e entra pela frente da rampa
      const rente = andar([[6, 9.8], [2.9, R.z1 + 0.7], [0, R.z1 + 0.7], [0, 5]]);
      // e o que a mureta impede: cortar pela borda da rampa, rente à fachada
      const corte = andar([[6, 9.8], [0.5, 9.8]]);
      return { reto, rente, corte, lobby: +(NI.lobbyY - gy).toFixed(3) };
    });
    assert.ok(Math.abs(r.reto.fim[2] - 2) < 0.5, `pré-condição: entrou no saguão (${JSON.stringify(r.reto.fim)})`);
    assert.ok(r.reto.pior <= 0.02, `degrau de ${r.reto.pior} m num quadro entrando pela porta, em ${JSON.stringify(r.reto.onde)}`);
    assert.ok(Math.abs(r.reto.fim[1] - r.lobby) < 0.005, `dentro, o pé ficou em ${r.reto.fim[1]} e o piso do saguão está em ${r.lobby}`);
    assert.ok(r.rente.chegou, `pré-condição: contornou a mureta e entrou (${JSON.stringify(r.rente.fim)})`);
    assert.ok(r.rente.pior <= 0.02, `vindo pela fachada: degrau de ${r.rente.pior} m num quadro em ${JSON.stringify(r.rente.onde)}`);
    assert.ok(r.corte.pior <= 0.02, `cortando rente à fachada: degrau de ${r.corte.pior} m num quadro em ${JSON.stringify(r.corte.onde)}`);
  });

  it('calçada e meio-fio não entram em prédio (saguão da torre e salas dos térreos ocos)', async () => {
    const r = await play(() => {
      const G = window.__game, MP = window.__MP, S = G.Structures, NI = S.NEXUS_INTERIOR;
      const C = S.city.center, gy = NI.gy;
      const malhaDe = f => f.split('|')[0];
      // a malha do PAVIMENTO é a que desenha a praça (disco em volta da torre), longe de rua
      const praca = window.__alturas(window.__chao({ x0: C.x + 15, x1: C.x + 17, z0: C.z + 1, z1: C.z + 3, y0: gy - 1.5, y1: gy + 0.5 }),
        C.x + 16, C.z + 2).filter(h => !h.terreno);
      if (!praca.length) return { erro: 'pré-condição: praça desenhada não encontrada' };
      const pav = malhaDe(praca[0].fonte);
      const salas = [{ nome: 'torre', x0: C.x - 8.7, x1: C.x + 8.7, z0: C.z - 8.7, z1: C.z + 8.7, torre: true }];
      for (const it of S.cityInteriors) {
        const T = 0.45, w = it.lot.w, d = it.d;
        salas.push({ nome: 'lote ' + it.lot.ox + ',' + it.lot.oz, x0: it.bx - w / 2 + T + 0.05, x1: it.bx + w / 2 - T - 0.05,
          z0: it.bz - d / 2 + T + 0.05, z1: it.bz + d / 2 - T - 0.05 });
      }
      const achados = [];
      for (const s of salas) {
        const tris = window.__chao({ x0: s.x0, x1: s.x1, z0: s.z0, z1: s.z1, y0: gy - 1.5, y1: gy + 0.5 });
        let pts = 0;
        for (let x = s.x0; x <= s.x1; x += 0.25) for (let z = s.z0; z <= s.z1; z += 0.25) {
          const hs = window.__alturas(tris, x, z);
          // o piso da sala: na torre, o piso do saguão (o que não é rua nem terreno); no térreo oco, o terreno
          const piso = s.torre ? hs.find(h => !h.terreno && malhaDe(h.fonte) !== pav) : { y: MP.heightAt(x, z) };
          if (!piso) continue;
          if (hs.some(h => malhaDe(h.fonte) === pav && h.y > piso.y + 0.005)) pts++;
        }
        if (pts) achados.push(`${s.nome}: ${pts} pontos (${(pts * 0.0625).toFixed(1)} m²)`);
      }
      return { achados, salas: salas.length };
    });
    assert.ok(!r.erro, r.erro);
    assert.ok(r.salas >= 5, 'pré-condição: torre + 4 térreos ocos');
    assert.deepEqual(r.achados, [], 'pavimento de rua por cima do piso de sala: ' + r.achados.join('; '));
  });

  it('luz da escada: toda luminária da torre fica acima da cabeça de quem anda embaixo dela', async () => {
    const r = await play(() => {
      const G = window.__game, MP = window.__MP, S = G.Structures, NI = S.NEXUS_INTERIOR;
      const C = S.city.center;
      let malha = null;
      MP.scene.traverse(o => { if (o.name === 'cityInteriorLampMesh') malha = o; });
      if (!malha || !malha.visible || !malha.parent) return { erro: 'luminárias fora da cena' };
      const pos = malha.geometry.attributes.position;
      const lampadas = [];
      for (let i = 0; i + 24 <= pos.count; i += 24) { // BoxGeometry: 24 vértices por caixa, na ordem do merge
        let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
        for (let k = i; k < i + 24; k++) {
          x0 = Math.min(x0, pos.getX(k)); x1 = Math.max(x1, pos.getX(k));
          y0 = Math.min(y0, pos.getY(k)); y1 = Math.max(y1, pos.getY(k));
          z0 = Math.min(z0, pos.getZ(k)); z1 = Math.max(z1, pos.getZ(k));
        }
        if (Math.abs((x0 + x1) / 2 - C.x) > NI.half || Math.abs((z0 + z1) / 2 - C.z) > NI.half) continue;
        lampadas.push({ x0, x1, y0, y1, z0, z1 });
      }
      let pior = Infinity, onde = null, ruins = 0;
      for (const L of lampadas) {
        let chao = -Infinity;
        for (let u = 0; u <= 4; u++) for (let v = 0; v <= 4; v++) {
          const x = L.x0 + (L.x1 - L.x0) * u / 4, z = L.z0 + (L.z1 - L.z0) * v / 4;
          // o chão EMBAIXO da luminária: groundAt aceita degrau de até 0,65 m acima de curY
          chao = Math.max(chao, MP.groundAt(x, z, L.y0 - 0.66));
        }
        const folga = L.y0 - chao;
        if (folga < 2.0) ruins++;
        if (folga < pior) { pior = folga; onde = [L.x0 - C.x, L.y0 - NI.gy, L.z0 - C.z].map(n => +n.toFixed(2)); }
      }
      return { n: lampadas.length, pior: +pior.toFixed(3), onde, ruins };
    });
    assert.ok(!r.erro, r.erro);
    assert.ok(r.n >= 10, `pré-condição: ${r.n} luminárias na torre`);
    assert.equal(r.ruins, 0, `${r.ruins} luminárias com menos de 2 m de folga sobre o chão; a pior fica a ${r.pior} m do degrau/piso (x, y, z: ${JSON.stringify(r.onde)})`);
  });

  it('tiro do jogador passa pela grade do poço e derruba o executivo (os três caminhos da bala)', async () => {
    const r = await play(() => {
      const G = window.__game, MP = window.__MP, S = G.Structures, NI = S.NEXUS_INTERIOR, THREE = MP.THREE, P = MP.player;
      const C = S.city.center, gy = NI.gy, Y2 = gy + 2 * NI.fh;
      window.QA.clearInput();
      // jogador no meio do lance B que chega no andar da placa 3
      const xB = C.x + (NI.xB0 + NI.xB1) / 2, zJ = C.z - 5.5;
      P.pos.set(xB, MP.groundAt(xB, zJ, Y2 - 0.5), zJ); P.vel.set(0, 0, 0); P.onGround = true;
      P.health = P.maxHealth; P.dead = false;
      const e = G.Enemies.list.find(x => x.suit && Math.abs(x.plan.floorY - Y2) < 0.01);
      e.alive = true; e.health = e.maxHp; e.group.visible = true;
      e.group.position.set(C.x - 3.5, Y2, C.z - 5.6); e.group.rotation.set(0, 0, 0);
      const olho = new THREE.Vector3(P.pos.x, P.pos.y + 1.62, P.pos.z);
      const peito = e.hitSpheres()[1].c.clone();
      // âncora: a reta cruza a caixa do guarda-corpo, ENTRE as barras e longe dos montantes
      const fx = (C.x + NI.well.x1 - olho.x) / (peito.x - olho.x);
      const altura = olho.y + (peito.y - olho.y) * fx - Y2, zc = olho.z + (peito.z - olho.z) * fx - C.z;
      const dir = peito.clone().sub(olho), len = dir.length(); dir.normalize();
      const rh = S.rayHit(olho, dir, len), rb = MP.rayBlockedAt(olho, dir, len);
      const caminhos = { rayHitLivre: rh === Infinity, rayHit: Number.isFinite(rh) ? +rh.toFixed(2) : 'livre',
        rayBlockedAtLivre: !(rb < len), rayBlockedAt: Number.isFinite(rb) ? +rb.toFixed(2) : 'livre' };
      // fire() de verdade: fuzil, mirando o peito
      G.switchWeapon(0);
      const w = G.arsenal[0]; w.mag = w.magSize; w.reloading = false; w.locked = false;
      const hp0 = e.health; let quadros = 0;
      for (let i = 0; i < 90 && e.alive; i++) {
        P.pos.x = xB; P.pos.z = zJ; P.vel.set(0, 0, 0);
        const c = e.hitSpheres()[1].c; MP.camera.lookAt(c.x, c.y, c.z);
        G.mouse.shooting = true; G.tick(1 / 60); quadros++;
        P.health = P.maxHealth;
      }
      G.mouse.shooting = false;
      return { altura: +altura.toFixed(3), zc: +zc.toFixed(3), len: +len.toFixed(2), caminhos, hp0, hp: e.health, morreu: !e.alive, quadros,
        arma: G.gunIndex };
    });
    assert.ok(r.altura > 0.55 && r.altura < 0.93, `pré-condição: a reta cruza a grade entre as barras (${r.altura} m)`);
    assert.ok(Number.isFinite(r.len) && r.len > 2, 'pré-condição: alvo a distância de tiro');
    assert.ok(r.hp < r.hp0, `o fuzil não tirou vida do executivo atrás da grade (${r.hp0} → ${r.hp}, ${r.quadros} quadros atirando)`);
    assert.ok(r.caminhos.rayHitLivre, `Structures.rayHit (foguete) parou a ${r.caminhos.rayHit} m, na grade`);
    assert.ok(r.caminhos.rayBlockedAtLivre, `rayBlockedAt (hitscan e projétil do BR) parou a ${r.caminhos.rayBlockedAt} m de ${r.len}`);
  });

  it('bala e tela concordam no poço da escada: nada atravessa degrau desenhado, nada para em grade vazada', async () => {
    const r = await play(() => {
      const G = window.__game, MP = window.__MP, S = G.Structures, NI = S.NEXUS_INTERIOR, THREE = MP.THREE;
      const C = S.city.center, gy = NI.gy, fh = NI.fh, Y2 = gy + 2 * fh;
      const vis = [];
      MP.scene.traverse(o => { if (o.isMesh && (/^cityInterior/.test(o.name) || o.material === S.cityMat)) vis.push(o); });
      const rc = new THREE.Raycaster();
      // faixa DESENHADA de um lance, só pelos números
      const naFaixa = p => {
        const lx = p.x - C.x, lz = p.z - C.z, y = p.y - gy;
        if (lz < NI.zMid - 0.02 || lz > NI.zBot + 0.02) return false;
        const t = Math.min(0.999, Math.max(0, (lz - NI.zMid) / (NI.zBot - NI.zMid)));
        const tc = (Math.floor(t * NI.riserCount) + 0.5) / NI.riserCount;
        for (let k = 1; k <= NI.floors; k++) {
          const yb = (k - 1) * fh, ym = yb + fh / 2, yt = k * fh;
          if (lx >= NI.xA0 - 0.02 && lx <= NI.xA1 + 0.02) { const s = ym + (yb - ym) * tc; if (y <= s + 0.01 && y >= s - 0.35) return true; }
          if (lx >= NI.xB0 - 0.02 && lx <= NI.xB1 + 0.02) { const s = ym + (yt - ym) * tc; if (y <= s + 0.01 && y >= s - 0.35) return true; }
        }
        return false;
      };
      const EX = [];
      for (let x = -4.35; x <= 0; x += 1.1) for (let z = -8.2; z <= 0.5; z += 1.1) EX.push(new THREE.Vector3(C.x + x, Y2 + 1.42, C.z + z));
      for (let x = -8.4; x <= -5; x += 1.1) EX.push(new THREE.Vector3(C.x + x, Y2 + 1.42, C.z + NI.zBot + 0.3));
      const JG = [];
      const xA = C.x + (NI.xA0 + NI.xA1) / 2, xB = C.x + (NI.xB0 + NI.xB1) / 2;
      for (const k of [2, 3]) for (let i = 0; i <= 6; i++) {
        const z = C.z + NI.zMid + (NI.zBot - NI.zMid) * i / 6;
        const yA = gy + (k - 1) * fh + fh / 2 * (1 - i / 6), yB = gy + (k - 1) * fh + fh / 2 + fh / 2 * i / 6;
        for (const [x, yr] of [[xA, yA], [xB, yB]]) {
          const y = MP.groundAt(x, z, yr + 0.3);
          JG.push(new THREE.Vector3(x, y + 1.5, z), new THREE.Vector3(x, y + 0.95, z));
        }
      }
      let pares = 0, passaDegrau = 0, paraNoVazio = 0; const ex = [];
      for (const a of EX) for (const b of JG) {
        const d = b.clone().sub(a), L = d.length(); d.normalize();
        pares++;
        const bala = S.rayHit(a, d, L); // Infinity = passa
        rc.set(a, d); rc.near = 0.02; rc.far = L - 0.02;
        const hs = rc.intersectObjects(vis, false);
        const tela = hs.length ? hs[0] : null;
        if (bala === Infinity && tela && naFaixa(tela.point)) {
          passaDegrau++; if (ex.length < 3) ex.push(['passa', [a.x - C.x, a.y - gy, a.z - C.z], [b.x - C.x, b.y - gy, b.z - C.z]].flat(2).map(v => typeof v === 'number' ? +v.toFixed(2) : v));
        }
        if (bala < L - 0.05 && !tela) {
          paraNoVazio++; if (ex.length < 6) ex.push(['para', +bala.toFixed(2), [a.x - C.x, a.y - gy, a.z - C.z], [b.x - C.x, b.y - gy, b.z - C.z]].flat(2).map(v => typeof v === 'number' ? +v.toFixed(2) : v));
        }
      }
      return { pares, passaDegrau, paraNoVazio, ex, nVis: vis.length };
    });
    assert.ok(r.nVis >= 2 && r.pares > 1000, `pré-condição: ${r.pares} pares, ${r.nVis} malhas`);
    assert.equal(r.passaDegrau, 0, `${r.passaDegrau} de ${r.pares} tiros ATRAVESSAM degrau desenhado: ${JSON.stringify(r.ex)}`);
    assert.equal(r.paraNoVazio, 0, `${r.paraNoVazio} de ${r.pares} tiros param onde a tela não mostra nada: ${JSON.stringify(r.ex)}`);
  });
});
