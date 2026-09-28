/* ================================================================
   QA — FUSÃO DO CORPO DOS ANIMAIS (draw calls)

   O cervo era montado com 12 `new THREE.Mesh` soltos e o lobo com 10, e cada
   um é UMA draw call. Medido no viewport de celular (844×390 @2, `?mobile=1`,
   WORLD_SEED=424242, câmera onde o forceStart deixa), os 13 animais custavam
   44 das 365 draw calls do frame — 12 %. Diferente dos executivos da Torre
   Nexus (0 a 248 conforme o enquadramento), esse custo é PERMANENTE: os
   animais estão espalhados pelo mapa inteiro e sempre há alguns no frustum.

   js/animals.js chama js/meshutils.js:fuseBody, que junta as peças em uma
   malha por (material, castShadow) usando as PERNAS como ossos rígidos de
   peso 1 — mesmo caminho da fusão dos inimigos (d06609f). Este arquivo é a
   rede de proteção do que NÃO pode mudar junto:

     1. draw calls caem de verdade (medição pelo renderer, não contagem de
        malhas por procuração);
     2. a silhueta de CADA material, na pose de caminhada de amplitude máxima,
        é a mesma casa decimal por casa decimal;
     3. a silhueta que projeta sombra é a mesma — e continua sendo UMA peça
        (o corpo), porque o resto do animal nunca projetou;
     4. os materiais continuam todos registrados no CSM;
     5. a esfera delimitadora do SkinnedMesh cobre TODA a faixa de pose que o
        código produz (armadilha do three r185: ela não acompanha os ossos) e
        não sobra muito além dela, senão a fusão engorda o culling;
     6. o acerto continua sendo esfera analítica (hitSpheres), não malha;
     7. o contrato do `Math.random` seedado não andou — fundir cria objetos
        THREE novos e cada UUID come 4 sorteios do stream do worldgen.

   Os dourados abaixo foram colhidos em HEAD (13b3552), WORLD_SEED=424242,
   ANTES de a fusão existir — e recapturados em 2026-09-28, quando o layout
   da seed mudou, validados contra aqueles (ver o comentário do OURO).
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame } = require('./helpers/harness');

/* Amplitude máxima do balanço das pernas em js/animals.js:
   sw = sin(...) * 0.55 * clamp(spd/4, 0.12, 1)  =>  |sw| <= 0.55.
   A pose aplicada é a MESMA que o update produz: legs[0]=legs[3]=sw,
   legs[1]=legs[2]=-sw, e só em rotation.x. */
const SW = 0.55;

/* Teto de draw calls de COR por animal, depois da fusão. Uma malha por
   (material, castShadow):
     - lobo:  corpo (castShadow) + resto                      = 2  (era 10)
     - cervo: corpo (castShadow) + resto + 2 chifres          = 4  (era 12)
   Cada chifre nasce com material PRÓPRIO (js/animals.js cria o material
   dentro do laço dos dois chifres), então cai em balde separado. Unificar
   isso mexeria em quantos materiais o worldgen cria, ou seja, no contrato do
   `Math.random` seedado — fora do escopo desta rodada. */
const TETO = { cervo: 4, lobo: 2 };
const TETO_TOTAL = 42; // 8 cervos × 4 + 5 lobos × 2 (146 antes)
/* O passe de sombra é medido à parte: só o corpo projeta, antes e depois, e
   é UMA peça — então continua custando 1 draw por cascata que atualizar. */
const TETO_SOMBRA = 1;

/* Sobra máxima, EM METROS, entre o raio da esfera delimitadora e o vértice
   mais distante em TODA a varredura de pose. É o custo de culling que o
   boundsFactor compra: cada centímetro é um animal que continua sendo
   desenhado logo depois de sair da tela.

   Em metros de propósito, e não como fator: quem decide o raio de partida é
   js/meshutils.js:fuseBody (arquivo de outro dono, e a receita dele mudou no
   meio desta rodada — já foi meia-diagonal da caixa, hoje é a maior distância
   real a um vértice). O que este teste garante é o RESULTADO, independente da
   receita. A fusão dos inimigos precisou de fator 1,5 porque o braço de mira
   sai muito do repouso; a perna do animal balança ±0,55 rad em torno do
   quadril e mal sai — os números medidos estão no comentário de
   js/animals.js. */
const SOBRA_MAX = 0.30;

/* Dourados por índice de animal (a lista nasce com 8 cervos e depois
   5 lobos; o tamanho de cada cervo é sorteado, por isso as caixas diferem).
   Chave do material = cor|rugosidade|metalicidade; valor = caixa [min, max]
   que os vértices DAQUELE material ocupam com o grupo na origem e as pernas
   na pose acima. `caixaSombra` é a caixa só das peças com castShadow.

   RECAPTURADOS em 2026-09-28: as construções passaram a sortear num PRNG
   próprio (js/paredes.js) e o stream seedado depois delas encurtou — os
   8 cervos nasceram com OUTROS tamanhos, e caixa/esfera escalam com o
   tamanho. Os de HEAD 13b3552 (antes da fusão) estão no histórico deste
   arquivo, e foram eles que validaram os novos SEM passar pelo código atual:
   um modelo afim por coordenada (a + b·tamanho) ajustado nos 8 cervos
   pré-fusão prevê cada caixa nova a ≤ 0,00093 m (a tolerância aqui é
   0,002); as esferas batem com 0,55/0,62/0,24/0,85 × tamanho (os
   coeficientes que os dourados pré-fusão dão) a ≤ 0,00009 m; os 5 lobos
   (tamanho fixo) saíram idênticos aos pré-fusão. */
const OURO = [
  { size: 0.9287, predador: false,
    caixaSombra: [[-0.52, 0.334, -0.23], [0.52, 0.817, 0.23]],
    hitSpheres: [{ r: 0.5108, part: 'body', dy: 0.5758 }, { r: 0.2229, part: 'head', dy: 0.7894 }],
    porMaterial: {
      '9a6b42|r0.8|m0': [[-0.573, 0.049, -0.404], [0.724, 0.994, 0.404]],
      '9a7e54|r0.7|m0': [[0.323, 0.901, -0.159], [0.453, 1.177, 0.161]],
    } },
  { size: 0.9671, predador: false,
    caixaSombra: [[-0.542, 0.348, -0.239], [0.542, 0.851, 0.239]],
    hitSpheres: [{ r: 0.5319, part: 'body', dy: 0.5996 }, { r: 0.2321, part: 'head', dy: 0.822 }],
    porMaterial: {
      '9a6b42|r0.8|m0': [[-0.596, 0.051, -0.421], [0.754, 1.035, 0.421]],
      '9a7e54|r0.7|m0': [[0.339, 0.944, -0.162], [0.469, 1.22, 0.164]],
    } },
  { size: 0.9958, predador: false,
    caixaSombra: [[-0.558, 0.358, -0.246], [0.558, 0.876, 0.246]],
    hitSpheres: [{ r: 0.5477, part: 'body', dy: 0.6174 }, { r: 0.239, part: 'head', dy: 0.8464 }],
    porMaterial: {
      '9a6b42|r0.8|m0': [[-0.614, 0.053, -0.434], [0.777, 1.065, 0.434]],
      '9a7e54|r0.7|m0': [[0.351, 0.976, -0.164], [0.481, 1.252, 0.166]],
    } },
  { size: 1.1298, predador: false,
    caixaSombra: [[-0.633, 0.407, -0.279], [0.633, 0.994, 0.279]],
    hitSpheres: [{ r: 0.6214, part: 'body', dy: 0.7005 }, { r: 0.2712, part: 'head', dy: 0.9604 }],
    porMaterial: {
      '9a6b42|r0.8|m0': [[-0.697, 0.06, -0.492], [0.881, 1.209, 0.492]],
      '9a7e54|r0.7|m0': [[0.407, 1.126, -0.175], [0.537, 1.402, 0.177]],
    } },
  { size: 1.1333, predador: false,
    caixaSombra: [[-0.635, 0.408, -0.28], [0.635, 0.997, 0.28]],
    hitSpheres: [{ r: 0.6233, part: 'body', dy: 0.7027 }, { r: 0.272, part: 'head', dy: 0.9633 }],
    porMaterial: {
      '9a6b42|r0.8|m0': [[-0.699, 0.06, -0.494], [0.884, 1.213, 0.494]],
      '9a7e54|r0.7|m0': [[0.409, 1.13, -0.175], [0.539, 1.406, 0.177]],
    } },
  { size: 1.0754, predador: false,
    caixaSombra: [[-0.602, 0.387, -0.266], [0.602, 0.946, 0.266]],
    hitSpheres: [{ r: 0.5915, part: 'body', dy: 0.6667 }, { r: 0.2581, part: 'head', dy: 0.9141 }],
    porMaterial: {
      '9a6b42|r0.8|m0': [[-0.663, 0.057, -0.468], [0.839, 1.151, 0.468]],
      '9a7e54|r0.7|m0': [[0.385, 1.065, -0.171], [0.514, 1.341, 0.172]],
    } },
  { size: 1.0907, predador: false,
    caixaSombra: [[-0.611, 0.393, -0.27], [0.611, 0.96, 0.27]],
    hitSpheres: [{ r: 0.5999, part: 'body', dy: 0.6762 }, { r: 0.2618, part: 'head', dy: 0.9271 }],
    porMaterial: {
      '9a6b42|r0.8|m0': [[-0.672, 0.058, -0.475], [0.851, 1.167, 0.475]],
      '9a7e54|r0.7|m0': [[0.391, 1.082, -0.172], [0.521, 1.358, 0.174]],
    } },
  { size: 1.142, predador: false,
    caixaSombra: [[-0.64, 0.411, -0.282], [0.64, 1.005, 0.282]],
    hitSpheres: [{ r: 0.6281, part: 'body', dy: 0.7081 }, { r: 0.2741, part: 'head', dy: 0.9707 }],
    porMaterial: {
      '9a6b42|r0.8|m0': [[-0.704, 0.06, -0.497], [0.891, 1.222, 0.497]],
      '9a7e54|r0.7|m0': [[0.413, 1.14, -0.176], [0.542, 1.416, 0.178]],
    } },
  { size: 0.85, predador: true,
    caixaSombra: [[-0.476, 0.306, -0.21], [0.476, 0.748, 0.21]],
    hitSpheres: [{ r: 0.4675, part: 'body', dy: 0.527 }, { r: 0.204, part: 'head', dy: 0.7225 }],
    porMaterial: { '4a4a52|r0.8|m0': [[-0.524, 0.045, -0.37], [0.663, 0.91, 0.37]] } },
  { size: 0.85, predador: true,
    caixaSombra: [[-0.476, 0.306, -0.21], [0.476, 0.748, 0.21]],
    hitSpheres: [{ r: 0.4675, part: 'body', dy: 0.527 }, { r: 0.204, part: 'head', dy: 0.7225 }],
    porMaterial: { '4a4a52|r0.8|m0': [[-0.524, 0.045, -0.37], [0.663, 0.91, 0.37]] } },
  { size: 0.85, predador: true,
    caixaSombra: [[-0.476, 0.306, -0.21], [0.476, 0.748, 0.21]],
    hitSpheres: [{ r: 0.4675, part: 'body', dy: 0.527 }, { r: 0.204, part: 'head', dy: 0.7225 }],
    porMaterial: { '4a4a52|r0.8|m0': [[-0.524, 0.045, -0.37], [0.663, 0.91, 0.37]] } },
  { size: 0.85, predador: true,
    caixaSombra: [[-0.476, 0.306, -0.21], [0.476, 0.748, 0.21]],
    hitSpheres: [{ r: 0.4675, part: 'body', dy: 0.527 }, { r: 0.204, part: 'head', dy: 0.7225 }],
    porMaterial: { '4a4a52|r0.8|m0': [[-0.524, 0.045, -0.37], [0.663, 0.91, 0.37]] } },
  { size: 0.85, predador: true,
    caixaSombra: [[-0.476, 0.306, -0.21], [0.476, 0.748, 0.21]],
    hitSpheres: [{ r: 0.4675, part: 'body', dy: 0.527 }, { r: 0.204, part: 'head', dy: 0.7225 }],
    porMaterial: { '4a4a52|r0.8|m0': [[-0.524, 0.045, -0.37], [0.663, 0.91, 0.37]] } },
];

/* Canários do stream seedado, todos IMUTÁVEIS depois do worldgen — nada de
   posição de bicho vivo aqui: o harness mata os animais no boot, eles
   renascem em `spawnPos()` a cada 5 s e a posição vira relógio, não semente.

   - `tamanhos`: `rand(0.9, 1.15)` sorteado DENTRO do laço que cria os 13
     animais. Se a fusão consumir um sorteio a mais/menos, o 2º cervo em
     diante já sai diferente. É o canário de dentro.
   - `alien`: js/alien.js:9 sorteia ângulo e raio da cratera, e o
     createAlien roda DEPOIS do createAnimals em game.js. É o canário de
     jusante: pega qualquer desalinhamento que sobre.
   - `inimigosCasa`: controle a MONTANTE (createEnemies vem antes). Tem que
     ficar parado aconteça o que acontecer — se ele mexer, o teste é que
     está errado, não a fusão.
   Recapturados em 2026-09-28 (sorteio próprio das construções: o stream
   depois delas encurtou 5.923 sorteios na seed 424242 — o controle a
   montante andou junto, como esperado; ver o comentário do OURO). */
const OURO_SEED = {
  tamanhos: [0.9287, 0.9671, 0.9958, 1.1298, 1.1333, 1.0754, 1.0907, 1.142,
    0.85, 0.85, 0.85, 0.85, 0.85],
  alien: [-117.1521, 143.293],
  inimigosCasa: [[-166.0315, 8.9694], [247.7313, 358.1112], [296.002, 172.695]],
};

describe('Animais — corpo fundido sem mudar o que aparece',
  { skip: !CHROME && 'Chrome não encontrado' }, () => {
    let h, r;
    before(async () => {
      h = await bootGame({ port: 3249, protocolTimeout: 600000 });
      r = await h.play(SW => {
        const G = window.__game, MP = window.__MP, THREE = MP.THREE, R = MP.renderer;
        const rd = v => +v.toFixed(3);

        /* semente colhida ANTES de mexer em qualquer animal */
        const xz = p => [+p.x.toFixed(4), +p.z.toFixed(4)];
        const semente = {
          tamanhos: G.Animals.list.map(a => +a.size.toFixed(4)),
          alien: xz(G.Alien.pos()),
          inimigosCasa: G.Enemies.list.slice(0, 3).map(e => [+e.home.x.toFixed(4), +e.home.z.toFixed(4)]),
        };

        const pose = (a, sw) => {
          const g = a.group;
          g.position.set(0, 0, 0); g.rotation.set(0, 0, 0); g.scale.setScalar(1);
          a.legs[0].rotation.set(sw, 0, 0); a.legs[3].rotation.set(sw, 0, 0);
          a.legs[1].rotation.set(-sw, 0, 0); a.legs[2].rotation.set(-sw, 0, 0);
          g.updateMatrixWorld(true);
          if (a.skeleton) a.skeleton.update();
          a.group.traverse(o => {
            if (o.isSkinnedMesh && o.skeleton) o.skeleton.update();
          });
        };
        const vertsLocal = (mesh, cb) => {
          const v = new THREE.Vector3();
          const pos = mesh.geometry.attributes.position;
          for (let i = 0; i < pos.count; i++) {
            if (mesh.isSkinnedMesh) mesh.getVertexPosition(i, v);
            else v.fromBufferAttribute(pos, i);
            cb(v);
          }
        };

        /* Draw calls REAIS: só este animal visível na cena, renderer.info com
           autoReset desligado (técnica do js/perfhud.js) — é medição, não
           contagem de malhas por procuração. Três renders separam o custo:
           com tudo, com o castShadow do animal desligado e com o animal
           escondido. Assim a conta de COR não fica escondida atrás do passe de
           sombra, e o passe de sombra vira um número próprio. */
        const draws = a => {
          const ocultos = [];
          MP.scene.traverse(o => {
            if (!(o.isMesh || o.isSkinnedMesh || o.isPoints || o.isSprite || o.isLine) || !o.visible) return;
            let p = o, meu = false;
            while (p) { if (p === a.group) { meu = true; break; } p = p.parent; }
            if (!meu) { o.visible = false; ocultos.push(o); }
          });
          MP.camera.position.set(0, 0.9, 3.4);
          MP.camera.lookAt(0, 0.6, 0);
          MP.camera.updateMatrixWorld(true);
          const auto = R.info.autoReset;
          R.info.autoReset = false;
          const conta = () => {
            MP.scene.updateMatrixWorld(true);
            R.setRenderTarget(null);
            R.render(MP.scene, MP.camera); // aquece
            R.info.reset();
            R.render(MP.scene, MP.camera);
            return R.info.render.calls;
          };
          const cheio = conta();              // cor + sombra do animal
          const projetavam = [];
          a.group.traverse(o => { if (o.castShadow) { o.castShadow = false; projetavam.push(o); } });
          const semSombra = conta();          // só cor
          a.group.visible = false;            // fundo do palco (céu) sozinho
          const vazio = conta();
          a.group.visible = true;
          for (const o of projetavam) o.castShadow = true;
          R.info.autoReset = auto;
          for (const o of ocultos) o.visible = true;
          return { cor: semSombra - vazio, sombra: cheio - semSombra };
        };

        const perfis = G.Animals.list.map(a => {
          a.alive = true; a.enabled = true; a.group.visible = true;
          pose(a, SW);
          const porMat = {}, caixaSombra = new THREE.Box3();
          let malhas = 0, sombras = 0, fundidas = 0;
          const semCsm = [];
          const w = new THREE.Vector3();
          a.group.traverse(o => {
            if (!(o.isMesh || o.isSkinnedMesh) || !o.visible) return;
            malhas++;
            if (o.castShadow) sombras++;
            if (o.isSkinnedMesh) fundidas++;
            const m = o.material;
            const key = `${m.color.getHexString()}|r${m.roughness}|m${m.metalness}`;
            const box = porMat[key] ? new THREE.Box3(
              new THREE.Vector3(...porMat[key][0]), new THREE.Vector3(...porMat[key][1])) : new THREE.Box3();
            vertsLocal(o, v => {
              w.copy(v).applyMatrix4(o.matrixWorld);
              box.expandByPoint(w);
              if (o.castShadow) caixaSombra.expandByPoint(w);
            });
            porMat[key] = [box.min.toArray().map(rd), box.max.toArray().map(rd)];
            if (m.isMeshStandardMaterial && !G.csmDebug.hasMaterial(m)) semCsm.push(key);
          });

          /* ESFERA (r185): fuseBody dá a MESMA esfera às malhas de um animal
             (o bicho é uma unidade de culling só) e a monta como
             "maior distância real a um vértice em repouso × boundsFactor".
             Mede o que decide o fator:
               - `foraDaEsfera`: vértice fora dela em QUALQUER pose que o
                 update produz — se sobrar um, o animal some da tela andando;
               - `raioRepouso`: a distância máxima em REPOUSO, isto é, o raio
                 com fator 1;
               - `maxDist`: a mesma distância varrendo toda a faixa de pose. A
                 razão entre as duas é o fator MÍNIMO que cobre a caminhada;
               - `sobra`: quanto o raio passa de `maxDist`, em metros — o custo
                 de culling que o fator escolhido compra. */
          let foraDaEsfera = 0, raio = 0, maxDist = 0, raioRepouso = 0, semEsfera = 0;
          const fundidasList = [];
          a.group.traverse(o => { if (o.isSkinnedMesh) fundidasList.push(o); });
          for (const o of fundidasList) {
            if (!o.boundingSphere) semEsfera++;
            else raio = Math.max(raio, o.boundingSphere.radius);
          }
          for (let k = 0; k <= 12; k++) {
            const sw = -SW + (2 * SW * k) / 12;
            pose(a, sw);
            for (const o of fundidasList) {
              if (!o.boundingSphere) continue;
              const c = o.boundingSphere.center, rr = o.boundingSphere.radius;
              vertsLocal(o, v => {
                const d = v.distanceTo(c);
                if (d > maxDist) maxDist = d;
                if (Math.abs(sw) < 1e-9 && d > raioRepouso) raioRepouso = d;
                if (d > rr + 1e-4) foraDaEsfera++;
              });
            }
          }
          pose(a, SW);

          return { malhas, sombras, fundidas, semEsfera, foraDaEsfera,
            raio: +raio.toFixed(4), raioRepouso: +raioRepouso.toFixed(4),
            fatorMinimo: +(maxDist / Math.max(raioRepouso, 1e-6)).toFixed(4),
            sobra: +(raio - maxDist).toFixed(4),
            semCsm: [...new Set(semCsm)].sort(),
            caixaSombra: [caixaSombra.min.toArray().map(rd), caixaSombra.max.toArray().map(rd)],
            porMaterial: porMat,
            pernas: a.legs.length,
            pernasGiram: a.legs.map(l => +l.rotation.x.toFixed(3)),
            size: +a.size.toFixed(4), predador: a.predator,
            hitSpheres: a.hitSpheres().map(s => ({ r: +s.r.toFixed(4), part: s.part,
              dy: +(s.c.y - a.group.position.y).toFixed(4) })),
            ...draws(a) };
        });
        return { semente, perfis };
      }, SW);
    });
    after(async () => { if (h) await h.close(); });

    it('dado cada animal no frame, então gasta draw calls dentro do orçamento', () => {
      const p = r.perfis;
      assert.equal(p.length, OURO.length, 'a lista de animais mudou de tamanho');
      let total = 0;
      for (const [i, a] of p.entries()) {
        const teto = a.predador ? TETO.lobo : TETO.cervo;
        assert.ok(a.cor > 0, `animal ${i} não desenhou nada — teste vazio`);
        assert.ok(a.cor <= teto,
          `animal ${i} (${a.predador ? 'lobo' : 'cervo'}) gastou ${a.cor} draw calls de cor ` +
          `(teto ${teto}, eram ${a.predador ? 10 : 12}); ${a.malhas} malhas`);
        assert.equal(a.malhas, a.cor, `animal ${i}: malha visível que não vira draw call`);
        assert.equal(a.sombra, TETO_SOMBRA,
          `animal ${i}: ${a.sombra} draw calls de sombra (só o corpo projeta, era ${TETO_SOMBRA})`);
        total += a.cor;
      }
      assert.ok(total <= TETO_TOTAL,
        `os 13 animais gastam ${total} draw calls de cor (teto ${TETO_TOTAL}, eram 146)`);
    });

    for (const [i, ouro] of OURO.entries()) {
      it(`animal ${i} (${ouro.predador ? 'lobo' : 'cervo'}): cada material ocupa o MESMO volume na pose animada`, () => {
        const a = r.perfis[i];
        assert.equal(a.size, ouro.size, 'o tamanho sorteado mudou (contrato do PRNG)');
        assert.deepEqual(Object.keys(a.porMaterial).sort(), Object.keys(ouro.porMaterial).sort(),
          'a fusão perdeu ou inventou um material');
        const dif = [];
        for (const [k, cx] of Object.entries(ouro.porMaterial)) {
          const agora = a.porMaterial[k];
          for (let x = 0; x < 2; x++) for (let y = 0; y < 3; y++)
            if (Math.abs(agora[x][y] - cx[x][y]) > 0.002)
              dif.push(`${k} [${x}][${y}]: ouro ${cx[x][y]} agora ${agora[x][y]}`);
        }
        assert.deepEqual(dif, [], `silhueta por material mudou:\n${dif.join('\n')}`);
      });
    }

    it('dada a fusão, então a silhueta que projeta sombra é a mesma peça', () => {
      const dif = [];
      for (const [i, ouro] of OURO.entries()) {
        const a = r.perfis[i];
        assert.equal(a.sombras, 1,
          `animal ${i}: ${a.sombras} malhas com castShadow (só o corpo projetava)`);
        for (let x = 0; x < 2; x++) for (let y = 0; y < 3; y++)
          if (Math.abs(a.caixaSombra[x][y] - ouro.caixaSombra[x][y]) > 0.002)
            dif.push(`animal ${i} caixa de sombra [${x}][${y}]: ouro ${ouro.caixaSombra[x][y]} agora ${a.caixaSombra[x][y]}`);
      }
      assert.deepEqual(dif, [], dif.join('\n'));
    });

    it('dados os materiais dos animais, então todos continuam nas cascatas do CSM', () => {
      const maus = r.perfis.flatMap((a, i) => a.semCsm.map(k => `animal ${i}: ${k}`));
      assert.deepEqual(maus, [], `material de animal fora do CSM: ${maus.join(', ')}`);
    });

    it('dada a pose animada, então a esfera delimitadora cobre o animal (r185)', () => {
      const soltos = [];
      for (const [i, a] of r.perfis.entries()) {
        assert.ok(a.fundidas > 0, `animal ${i}: nenhuma malha fundida (SkinnedMesh)`);
        assert.equal(a.semEsfera, 0, `animal ${i}: SkinnedMesh sem boundingSphere própria`);
        if (a.foraDaEsfera) soltos.push(`animal ${i}: ${a.foraDaEsfera} vértices fora`);
      }
      assert.deepEqual(soltos, [],
        `vértice fora da bounding sphere: o animal some da tela ao andar\n${soltos.join('\n')}`);
    });

    it('dado o boundsFactor escolhido, então a esfera não engrossa o culling', () => {
      const folgados = [];
      for (const [i, a] of r.perfis.entries())
        if (a.sobra > SOBRA_MAX)
          folgados.push(`animal ${i}: ${a.sobra} m de sobra (raio ${a.raio} m, ` +
            `mínimo que cobre a pose ${a.fatorMinimo}× o repouso)`);
      assert.deepEqual(folgados, [],
        `sobra acima de ${SOBRA_MAX} m (o inimigo levou 1,6–2,1 m com fator generoso; não repetir):\n${folgados.join('\n')}`);
    });

    it('dada a fusão, então a hitbox analítica e as quatro pernas continuam iguais', () => {
      for (const [i, ouro] of OURO.entries()) {
        const a = r.perfis[i];
        assert.equal(a.pernas, 4, `animal ${i} perdeu perna`);
        assert.deepEqual(a.pernasGiram, [SW, -SW, -SW, SW],
          `animal ${i}: a perna não guarda mais a rotação que o update escreve`);
        assert.deepEqual(a.hitSpheres, ouro.hitSpheres, `animal ${i}: hitbox mudou`);
      }
    });

    it('dado o mesmo seed, então o stream do worldgen não andou', () => {
      assert.deepEqual(r.semente.inimigosCasa, OURO_SEED.inimigosCasa,
        'controle a montante mexeu: o teste é que está errado');
      assert.deepEqual(r.semente.tamanhos, OURO_SEED.tamanhos,
        'a criação dos animais consumiu um sorteio a mais/menos');
      assert.deepEqual(r.semente.alien, OURO_SEED.alien,
        'o worldgen a jusante dos animais andou');
    });
  });

describe('Animais — tiro depois da fusão', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h;
  before(async () => { h = await bootGame({ port: 3250, protocolTimeout: 600000 }); });
  after(async () => { if (h) await h.close(); });

  it('dado um tiro mirado na esfera da cabeça, então o animal toma dano', async () => {
    const r = await h.play(() => {
      const QA = window.QA, G = QA.G, MP = QA.MP;
      QA.reset(30, 30);
      // esqueletos e demais alvos fora do caminho do raio
      for (const sk of G.Skeletons.list) { sk.alive = false; sk.group.visible = false; }
      for (const a of G.Animals.list) { a.alive = false; a.enabled = false; }
      const alvo = G.Animals.list.find(a => a.predator);
      alvo.alive = true; alvo.enabled = true; alvo.group.visible = true;
      alvo.hp = 70;
      const P = MP.player.pos;
      alvo.group.position.set(P.x, MP.groundAt(P.x, P.z + 8, 999), P.z + 8);
      alvo.yaw = Math.PI; alvo.group.rotation.y = alvo.yaw - Math.PI / 2;
      const cabeca = alvo.hitSpheres().find(s => s.part === 'head');
      const antes = alvo.hp;
      QA.aimAt(cabeca.c.x, cabeca.c.y, cabeca.c.z);
      G.mouse.clicked = true; G.mouse.shooting = true;
      QA.tick(2);
      G.mouse.clicked = false; G.mouse.shooting = false;
      return { antes, depois: alvo.hp };
    });
    assert.ok(r.depois < r.antes,
      `tiro mirado na esfera da cabeça não tirou vida (${r.antes} -> ${r.depois})`);
  });
});
