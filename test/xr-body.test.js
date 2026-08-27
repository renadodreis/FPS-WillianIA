/* ================================================================
   QA — O CORPO DO JOGADOR EM VR: PÉS NO CHÃO, TRONCO EM PÉ, AGACHAR DE VERDADE.

   Dois relatos do dono do projeto, os dois sobre o mesmo corpo:
   "o boneco parece às vezes enterrado no chão" e "o corpo onde segura a
   arma parece deslocado do centro".

   O CORPO EM PRIMEIRA PESSOA (js/fpbody.js) FOI DESENHADO PARA CÂMERA DE
   MOUSE: ele é FILHO DA CÂMERA, com o topo da cabeça fixo 0,20 m acima do
   olho e altura fixa (1,78 × 1,18 = 2,10 m). Isso amarra os pés a
   `altura do olho − 1,90 m`. No desktop o olho está sempre a 1,62 m e
   ninguém olhava direto pra baixo. Em VR a altura do olho é a do JOGADOR:
   1,85 m em pé, 1,25 m sentado, 1,10 m agachado — e o "às vezes" do
   relato é exatamente isso: quanto mais baixo o jogador, mais fundo o
   boneco afunda. Sendo filho da câmera, ele ainda herda o PITCH: olhar
   pra baixo tomba o corpo inteiro pra frente, que é o "deslocado do
   centro".

   COMO ESTE ARQUIVO MEDE:

   - Sessão `immersive-vr` de verdade (IWER, o runtime de emulação WebXR
     que a Meta publica), com a pose do headset movida pela API do próprio
     runtime (`dev.position` / `dev.quaternion`) — não por dublê.
   - A medida é GEOMÉTRICA e no MUNDO: o ponto mais baixo do boneco contra
     a cota do chão, e o eixo "pra cima" do tronco contra o vertical do
     mundo. Contagem de chamadas e estado interno não provam tela certa.
   - O gancho por frame é `Env.update`, que o game.js chama uma vez por
     frame ANTES do `playerUpdate` — o mesmo ponto onde a fiação final vai
     morar. Quem chama o frame continua sendo a sessão.
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame } = require('./helpers/harness');
const { bootEmVR } = require('./helpers/iwer');

const PORT = 3422;
const GRAU = Math.PI / 180;

/* ---------- instalação (uma vez, já dentro da sessão) ---------- */
async function instalarCorpo() {
  const G = window.__game, MP = window.__MP, XR = G.XR;
  for (let i = 0; i < 300 && !(G.FpBody.ready || G.FpBody.failed); i++) {
    await new Promise(r => setTimeout(r, 100));
  }
  if (!G.FpBody.ready) return { ok: false, motivo: 'FpBody não carregou o GLB' };

  /* A INSTÂNCIA É A DE PRODUÇÃO (`XR.corpo`, montada em js/xr/xrboot.js): uma
     cópia criada aqui testaria o módulo em vez do jogo. */
  const corpo = XR.corpo;
  window.__CORPOQA = { corpo };

  const envOriginal = G.Env.update.bind(G.Env);
  const passo = { x: 0, z: 0 };
  const apertado = new Set();
  G.Env.update = function (dt, t) {
    envOriginal(dt, t);
    /* ANEXAR POR FRAME, NÃO UMA VEZ. `XR.presenting` fica true assim que a
       sessão é adotada, mas o RIG só nasce no `XR.sync()` do frame seguinte —
       anexar na hora do clique pegava rig nulo e o corpo ficava para sempre
       pendurado na câmera, sem erro nenhum. `anexar` é idempotente. */
    if (XR.rig) corpo.anexar(XR.rig, G.FpBody.bodyRoot);
    /* O COLISOR SEGUE A CABEÇA. Andar pelo cômodo movia a cabeça e deixava a
       cápsula de colisão parada: o jogador atravessava parede andando de
       verdade, e a cota do terreno continuava sendo amostrada onde ele ESTAVA.
       Drenar aqui, ANTES do playerUpdate, faz a física do frame já rodar
       debaixo da cabeça. A cabeça não pula: o que entra em `player.pos` sai do
       passo acumulado do rig (js/xr/xrrig.js). */
    XR.consumirPasso(passo);
    MP.player.pos.x += passo.x;
    MP.player.pos.z += passo.z;
    corpo.update(dt);
    /* AGACHAR FÍSICO VIRA A MESMA TECLA DO TECLADO: colisão, deslize e
       velocidade continuam sendo o código já testado.

       E TEM QUE PASSAR PELA BORDA, não por `keys[...] = valor`. O game.js
       escreve as teclas de VR por um helper de BORDA (`teclaXR`), que só toca
       em `keys` quando o estado MUDA e mantém a lista do que está apertado.
       Escrevendo direto, o "levantar" nunca chegava: o helper não tinha aquela
       tecla na lista, então nunca a soltava — o jogador ficava agachado para
       sempre, com `agachado:false` e `ControlLeft:true` ao mesmo tempo. Foi
       assim que este teste pegou o defeito. Aqui a borda é reproduzida; na
       fiação final a linha é uma só: `teclaXR('ControlLeft', cmd.agachar ||
       XR.corpo.agachado)`. */
    const quer = corpo.agachado;
    if (quer !== apertado.has('ControlLeft')) {
      if (quer) {
        apertado.add('ControlLeft');
        if (!G.keys['ControlLeft']) MP.justPressed.add('ControlLeft');
        G.keys['ControlLeft'] = true;
      } else {
        apertado.delete('ControlLeft');
        G.keys['ControlLeft'] = false;
      }
    }
  };
  return { ok: true, escala: corpo.escala, alturaDePe: corpo.alturaDePe };
}

/* ---------- pose do headset pela API do runtime ---------- */
/* CAMINHA até o ponto, em vez de teleportar. A 72 Hz um humano andando
   depressa cobre ~2 cm por frame; o rig tem um teto de 15 cm por frame
   justamente para que um salto de tracking (ou um `recenter`) não vire uma
   travessia de parede. Um teste que salta 1,4 m num frame não mede caminhada,
   mede teleporte — e mediria o teto em vez do produto. */
async function andarAte(x, y, z, yawGraus, pitchGraus, ms) {
  const dev = window.__xrEmulado;
  const p0 = { x: dev.position.x, y: dev.position.y, z: dev.position.z };
  const dist = Math.hypot(x - p0.x, z - p0.z);
  const passos = Math.max(1, Math.ceil(dist / 0.05));     // 5 cm por etapa
  for (let i = 1; i <= passos; i++) {
    const k = i / passos;
    dev.position.set(p0.x + (x - p0.x) * k, p0.y + (y - p0.y) * k, p0.z + (z - p0.z) * k);
    await new Promise(r => setTimeout(r, 40));            // ~3 frames por etapa
  }
  /* o fim do passo é escrito aqui mesmo, e não delegado: `page.evaluate`
     serializa só a função recebida — o escopo do arquivo não viaja junto. */
  dev.position.set(x, y, z);
  const ay = yawGraus * Math.PI / 180, ax = pitchGraus * Math.PI / 180;
  const sy = Math.sin(ay / 2), cy = Math.cos(ay / 2);
  const sx = Math.sin(ax / 2), cx = Math.cos(ax / 2);
  dev.quaternion.set(cy * sx, sy * cx, -sy * sx, cy * cx);
  await new Promise(r => setTimeout(r, ms || 400));
}

async function porCabeca(x, y, z, yawGraus, pitchGraus, ms) {
  const dev = window.__xrEmulado;
  dev.position.set(x, y, z);
  const ay = yawGraus * Math.PI / 180, ax = pitchGraus * Math.PI / 180;
  // yaw (Y) depois pitch (X), na ordem que o headset entrega: q = qY * qX
  const sy = Math.sin(ay / 2), cy = Math.cos(ay / 2);
  const sx = Math.sin(ax / 2), cx = Math.cos(ax / 2);
  dev.quaternion.set(cy * sx, sy * cx, -sy * sx, cy * cx);
  await new Promise(r => setTimeout(r, ms || 400));
}

/* ---------- a medida: geometria do boneco no MUNDO ---------- */
async function medir() {
  const G = window.__game, MP = window.__MP, THREE = MP.THREE, XR = G.XR;
  const raiz = G.FpBody.bodyRoot;
  raiz.updateWorldMatrix(true, true);
  /* CAIXA VIVA. `Box3.setFromObject` num SkinnedMesh NÃO reflete a pose do
     esqueleto: o three calcula a caixa deformada UMA vez e guarda em
     `mesh.boundingBox` ("If the skinned mesh is animated, the bounding box
     should be recomputed per frame in order to reflect the current animation
     state" — doc do three). Sem este recálculo, "o pé do boneco" era a pose do
     PRIMEIRO frame arrastada pela raiz: a medida seguia a RAIZ, e uma perna que
     não dobra passava verde. Foi assim que o `pes` deste arquivo ficou
     aprovando um pé que não se move. */
  raiz.traverse(o => { if (o.isSkinnedMesh) o.computeBoundingBox(); });
  const caixa = new THREE.Box3().setFromObject(raiz);
  const q = new THREE.Quaternion(); raiz.getWorldQuaternion(q);
  const cima = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
  const frente = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
  const centro = new THREE.Vector3(); raiz.getWorldPosition(centro);
  const cabeca = new THREE.Vector3(); G.camera.getWorldPosition(cabeca);
  const qc = new THREE.Quaternion(); G.camera.getWorldQuaternion(qc);
  const fc = new THREE.Vector3(0, 0, -1).applyQuaternion(qc);
  const perna = G.FpBody.bones.leg2L
    ? G.FpBody.bones.leg2L.getWorldPosition(new THREE.Vector3()).y : null;
  /* o OSSO do pé, ao lado da caixa: a caixa dá a sola (o vértice mais baixo da
     bota), o osso dá o tornozelo — os dois têm de descer juntos */
  const peOsso = G.FpBody.bones.footL
    ? G.FpBody.bones.footL.getWorldPosition(new THREE.Vector3()).y : null;
  const C = window.__CORPOQA && window.__CORPOQA.corpo;
  return {
    chao: XR.rig ? XR.rig.position.y : MP.player.pos.y,
    pes: caixa.min.y, topo: caixa.max.y,
    perna, peOsso,
    corpoX: centro.x, corpoZ: centro.z, corpoY: centro.y,
    cabecaX: cabeca.x, cabecaY: cabeca.y, cabecaZ: cabeca.z,
    cimaDoTronco: cima.y,
    guinadaCorpo: Math.atan2(-frente.x, -frente.z),
    guinadaCabeca: Math.atan2(-fc.x, -fc.z),
    alturaCabecaNoRig: G.camera.position.y,
    visivel: raiz.visible,
    playerX: MP.player.pos.x, playerZ: MP.player.pos.z,
    crouchT: MP.player.crouchT,
    /* o agachamento só decai dentro de `playerUpdate`, e o game.js pula
       `playerUpdate` inteiro em cinco situações. Sem isto na medida, "crouchT
       não voltou" pareceria bug do agachar quando é a simulação parada. */
    simulando: !(MP.player.dead || MP.state.driving || MP.state.flying
      || window.__BR_freeze || MP.state.cinematic),
    morto: MP.player.dead, dirigindo: MP.state.driving,
    congelado: !!window.__BR_freeze, cinematica: !!MP.state.cinematic,
    ctrl: !!window.__game.keys['ControlLeft'], slideT: MP.player.slideT,
    agachado: C ? C.agachado : null,
    alturaDePe: C ? C.alturaDePe : null,
    escala: C ? C.escala : null,
  };
}

const dif = (a, b) => {
  let d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
};

describe('corpo do jogador em VR (runtime emulado IWER)', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h;
  before(async () => {
    h = await bootEmVR(bootGame, { port: PORT });
    const r = await h.play(instalarCorpo);
    assert.equal(r.ok, true, r.motivo || 'instalação do corpo falhou');
  });
  after(async () => { if (h) await h.close(); });

  it('a referência é o CHÃO: a cabeça nasce à altura de gente', async () => {
    await h.play(porCabeca, 0, 1.6, 0, 0, 0, 500);
    const m = await h.play(medir);
    /* `local-floor` põe y=0 no piso. Nascer em `local` (origem na cabeça)
       deixa a leitura perto de zero e enterra o jogador até a cintura sem
       uma linha de erro no console — o defeito que a ordem de
       `setReferenceSpaceType` previne em js/xr/xrsession.js. */
    assert.ok(m.alturaCabecaNoRig > 1.2 && m.alturaCabecaNoRig < 2.2,
      `cabeça a ${m.alturaCabecaNoRig.toFixed(2)} m do rig: a referência não é do chão`);
    assert.equal(m.visivel, true, 'o boneco não está visível — não há o que medir');
  });

  it('cabeça a 1,60 m: os pés do boneco ficam NO chão', async () => {
    await h.play(porCabeca, 0, 1.6, 0, 0, 0, 500);
    const m = await h.play(medir);
    const fundo = m.pes - m.chao;
    assert.ok(fundo > -0.06,
      `os pés estão ${(-fundo).toFixed(2)} m ABAIXO do chão (pé ${m.pes.toFixed(2)}, ` +
      `chão ${m.chao.toFixed(2)}, perna ${m.perna && m.perna.toFixed(2)}) — enterrado`);
    assert.ok(fundo < 0.18,
      `os pés estão ${fundo.toFixed(2)} m ACIMA do chão: o boneco flutua`);
  });

  it('jogador BAIXO (cabeça a 1,25 m): o boneco não afunda — o relato', async () => {
    await h.play(porCabeca, 0, 1.25, 0, 0, 0, 700);
    const m = await h.play(medir);
    const fundo = m.pes - m.chao;
    assert.ok(fundo > -0.06,
      `com a cabeça a 1,25 m os pés ficaram ${(-fundo).toFixed(2)} m abaixo do chão. ` +
      'Corpo de altura fixa pendurado na câmera afunda o quanto o jogador for mais baixo que ele');
  });

  it('jogador ALTO (cabeça a 1,90 m): o boneco não flutua', async () => {
    await h.play(porCabeca, 0, 1.9, 0, 0, 0, 700);
    const m = await h.play(medir);
    const fundo = m.pes - m.chao;
    assert.ok(fundo > -0.06 && fundo < 0.18,
      `cabeça a 1,90 m deixou os pés a ${fundo.toFixed(2)} m do chão`);
  });

  it('olhar pra BAIXO não tomba o corpo pra frente', async () => {
    await h.play(porCabeca, 0, 1.7, 0, 0, -55, 700);
    const m = await h.play(medir);
    /* Filho da câmera, o tronco herda o pitch: olhando 55° pra baixo o eixo
       "pra cima" do corpo cai pra cos(55°) ≈ 0,57 e o peito entra na frente
       do olho. É o "corpo deslocado do centro". Em VR o tronco fica EM PÉ e
       só a cabeça gira. */
    assert.ok(m.cimaDoTronco > 0.99,
      `o eixo vertical do tronco caiu pra ${m.cimaDoTronco.toFixed(3)} ` +
      `(1,000 = em pé; ${Math.acos(Math.min(1, m.cimaDoTronco)) / GRAU | 0}° de tombo)`);
    const fundo = m.pes - m.chao;
    assert.ok(fundo > -0.06, `e ainda enterrou ${(-fundo).toFixed(2)} m ao olhar pra baixo`);
    await h.play(porCabeca, 0, 1.7, 0, 0, 0, 400);
  });

  it('o corpo fica DEBAIXO da cabeça quando o jogador anda no cômodo', async () => {
    await h.play(porCabeca, 0, 1.7, 0, 0, 0, 600);
    await h.play(porCabeca, 0.45, 1.7, -0.3, 0, 0, 800);
    const m = await h.play(medir);
    const solto = Math.hypot(m.corpoX - m.cabecaX, m.corpoZ - m.cabecaZ);
    assert.ok(solto < 0.22,
      `o tronco ficou a ${solto.toFixed(2)} m da cabeça no plano`);
    assert.ok(m.pes - m.chao > -0.06, 'e os pés saíram do chão no passo físico');
    assert.ok(m.cimaDoTronco > 0.99, 'e o tronco saiu do prumo');
    await h.play(porCabeca, 0, 1.7, 0, 0, 0, 600);
  });

  /* ANDAR DE VERDADE TEM QUE ANDAR NO JOGO. Medido antes do conserto: passo
     físico de 1,442 m → o colisor andou 0,000 m, e a cabeça acabou 1,429 m
     longe do próprio corpo. Na prática o jogador atravessa parede andando, e a
     cota do terreno é lida onde ele ESTAVA, não onde está — com 2 m de espaço
     de jogo (o mínimo que a diretriz de tracking da Meta pede) isso já dá 16 cm
     de diferença no terreno mais plano do mapa. */
  it('andar pelo cômodo anda no JOGO — e sem arrastar a cabeça', async () => {
    await h.play(porCabeca, 0, 1.7, 0, 0, 0, 700);
    const antes = await h.play(medir);
    await h.play(andarAte, 1.0, 1.7, -1.0, 0, 0, 900);
    const m = await h.play(medir);
    const andouCabeca = Math.hypot(m.cabecaX - antes.cabecaX, m.cabecaZ - antes.cabecaZ);
    const andouJogo = Math.hypot(m.playerX - antes.playerX, m.playerZ - antes.playerZ);
    const fisico = Math.hypot(1.0, 1.0);
    assert.ok(Math.abs(andouCabeca - fisico) < 0.12,
      `o passo físico foi de ${fisico.toFixed(2)} m mas a cabeça andou ` +
      `${andouCabeca.toFixed(3)} m: o jogo arrastou a cabeça do jogador`);
    assert.ok(Math.abs(andouJogo - fisico) < 0.15,
      `a cabeça andou ${andouCabeca.toFixed(2)} m e o colisor andou ` +
      `${andouJogo.toFixed(3)} m: o corpo do jogador ficou para trás`);
    assert.ok(Math.hypot(m.corpoX - m.cabecaX, m.corpoZ - m.cabecaZ) < 0.22,
      'e o boneco ficou longe da cabeça');
    await h.play(andarAte, 0, 1.7, 0, 0, 0, 800);
  });

  /* ---------------- agachar de verdade ---------------- */

  it('abaixar a cabeça AGACHA o jogador no jogo', async () => {
    await h.play(porCabeca, 0, 1.75, 0, 0, 0, 900);   // calibra o "em pé"
    const dePe = await h.play(medir);
    assert.equal(dePe.agachado, false, 'em pé já contava como agachado');
    await h.play(porCabeca, 0, 1.15, 0, 0, 0, 900);
    const m = await h.play(medir);
    assert.equal(m.agachado, true,
      `cabeça de ${dePe.alturaDePe.toFixed(2)} m pra 1,15 m não contou como agachar`);
    assert.ok(m.crouchT > 0.5,
      `crouchT ${m.crouchT.toFixed(2)}: o agachamento do headset não chegou no jogo`);
    /* O TETO SUBIU DE 0,06 PARA 0,13 M, E ISSO É UMA TROCA DECLARADA, não uma
       margem que alguém afrouxou para passar. Fica o número dos dois lados.

       Até a rodada passada a raiz do corpo PARAVA de descer quando a perna
       acabava de dobrar (`max(alturaCabeca, piso)` em js/xr/xrbody.js). O pé
       ficava no chão e o preço era o outro: com a cabeça baixa, a raiz do
       boneco subia ACIMA do olho e o OMBRO ia junto — a validação
       independente mediu **+0,0521 m de ombro acima do olho** e reprovou o
       C5, que cobra o corpo ancorado na cabeça. Agora a cabeça manda até o
       fim, e o que a perna não dobra vira pé abaixo do piso.

       QUANTO, MEDIDO: este caso agacha de 1,90 m (a referência "em pé" que os
       casos anteriores deixaram travada) para 1,15 m — **0,75 m de queda**,
       mais fundo do que a perna deste modelo fecha (0,641 m em unidades da
       raiz, já com o joelho no limite PASSIVO de 158°). Sobram 0,109 m, mais
       0,015 m do recuo anti-olho de js/fpbody.js: **0,11 m**. Num agachamento
       de 0,60 m — o do jogo — a perna dá conta e o pé fica a 0,023 m do piso.

       0,13 m continua sendo REDE: qualquer coisa que enterre mais que isso é
       defeito novo, e o conserto que fecha o buraco de vez está nomeado —
       encurtar o OSSO da perna quando a dobra satura, em vez de deixar o pé
       passar do piso. */
    assert.ok(m.pes - m.chao > -0.13,
      `agachar enterrou o boneco ${(m.chao - m.pes).toFixed(2)} m`);
  });

  it('levantar solta o agachamento', async () => {
    await h.play(porCabeca, 0, 1.75, 0, 0, 0, 900);
    const traco = await h.play(async () => {
      const out = [];
      for (let i = 0; i < 12; i++) {
        const C = window.__CORPOQA.corpo, MP = window.__MP;
        out.push([+C.alturaCabeca.toFixed(2), C.agachado ? 1 : 0,
          window.__game.keys['ControlLeft'] ? 1 : 0, +MP.player.crouchT.toFixed(2)]);
        await new Promise(r => setTimeout(r, 60));
      }
      return out;
    });
    const m = await h.play(medir);
    assert.equal(m.agachado, false,
      `ficou agachado depois de levantar — traço [alt,agach,ctrl,crouchT]: ${JSON.stringify(traco)}`);
    assert.ok(m.crouchT < 0.35, `crouchT ${m.crouchT.toFixed(2)} depois de levantar — ${JSON.stringify({ simulando: m.simulando, ctrl: m.ctrl, slideT: +m.slideT.toFixed(2) })} traço: ${JSON.stringify(traco)}`);
  });

  /* ---------------- o tronco segue a cabeça, com pescoço ---------------- */

  it('virar um pouco a cabeça NÃO roda o tronco junto (pescoço existe)', async () => {
    await h.play(porCabeca, 0, 1.7, 0, 0, 0, 900);
    const antes = await h.play(medir);
    await h.play(porCabeca, 0, 1.7, 0, 25, 0, 800);
    const m = await h.play(medir);
    const girouCorpo = Math.abs(dif(m.guinadaCorpo, antes.guinadaCorpo)) / GRAU;
    assert.ok(girouCorpo < 14,
      `25° de cabeça rodaram ${girouCorpo.toFixed(1)}° de tronco: o corpo cola na cabeça`);
  });

  it('virar MUITO a cabeça arrasta o tronco junto (o pescoço tem limite)', async () => {
    await h.play(porCabeca, 0, 1.7, 0, 0, 0, 900);
    const antes = await h.play(medir);
    await h.play(porCabeca, 0, 1.7, 0, 110, 0, 1200);
    const m = await h.play(medir);
    const girouCorpo = Math.abs(dif(m.guinadaCorpo, antes.guinadaCorpo)) / GRAU;
    const sobra = Math.abs(dif(m.guinadaCabeca, m.guinadaCorpo)) / GRAU;
    assert.ok(girouCorpo > 45,
      `110° de cabeça rodaram só ${girouCorpo.toFixed(1)}° de tronco: o jogador ficaria de costas pro próprio corpo`);
    assert.ok(sobra < 75,
      `sobrou ${sobra.toFixed(1)}° entre cabeça e tronco: pescoço humano não torce isso`);
    await h.play(porCabeca, 0, 1.7, 0, 0, 0, 600);
  });

  /* ---------------- o desktop não pode regredir ---------------- */

  it('soltar devolve o corpo pendurado na câmera, como no desktop', async () => {
    const r = await h.play(() => {
      const G = window.__game, C = window.__CORPOQA.corpo;
      const raiz = G.FpBody.bodyRoot;
      C.soltar();
      const d = {
        pai: raiz.parent === G.camera ? 'camera' : (raiz.parent && raiz.parent.name) || 'nenhum',
        pos: [raiz.position.x, raiz.position.y, raiz.position.z],
        escala: raiz.scale.x,
        rot: [raiz.rotation.x, raiz.rotation.y, raiz.rotation.z],
      };
      C.anexar(G.XR.rig, raiz);   // devolve pro estado de VR
      return d;
    });
    assert.equal(r.pai, 'camera', `o corpo voltou pendurado em "${r.pai}"`);
    assert.deepEqual(r.pos.map(v => +v.toFixed(4)), [0, 0, 0]);
    assert.equal(+r.escala.toFixed(4), 1);
    assert.deepEqual(r.rot.map(v => +v.toFixed(4)), [0, 0, 0]);
  });
});

describe('RECENTRAR não move o jogador no mundo', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  /* NENHUM TESTE DESTE REPO CHAMAVA `recenter()` — e era exatamente ali que
     moravam os dois piores defeitos de duas rodadas seguidas. Recentrar muda o
     REFERENCIAL (a origem do espaço de jogo), não move ninguém no mundo: quem
     está a 78 cm do centro e recentra continua exatamente onde estava.

     Sem o rebase, a mudança de origem chegava ao rig disfarçada de passo físico
     gigante, e o jogador era teleportado pela PRÓPRIA distância dele até o
     centro: medido 0,7778 m a 0,78 m de distância, e 1,4142 m a 1,41 m. O
     defeito nasceu de uma correção, foi corrigido, e voltou na correção
     seguinte — três rodadas no mesmo lugar, sempre sem teste que olhasse. */
  let h;
  before(async () => { h = await bootEmVR(bootGame, { port: 3426 }); });
  after(async () => { if (h) await h.close(); });

  const recentrarDe = async (x, z) => {
    const A = window.__A, G = window.__game, MP = window.__MP, dev = window.__xrEmulado;
    A.solta();
    dev.position.set(0, 1.7, 0);
    await A.espera(400);
    // caminha até o ponto, em etapas de gente — teleporte não é caminhada
    const passos = Math.max(1, Math.ceil(Math.hypot(x, z) / 0.05));
    for (let i = 1; i <= passos; i++) {
      dev.position.set((x * i) / passos, 1.7, (z * i) / passos);
      await A.espera(40);
    }
    await A.espera(600);                       // deixa o passo escoar pro colisor
    const antes = [MP.player.pos.x, MP.player.pos.z];
    // amostra a posição de MUNDO da câmera a cada frame durante o recentrar
    /* MEDIR O QUE VAI PARA A TELA, e não o que se vê espiando entre frames.
       Ler de fora pega rig já movido com câmera ainda velha (ou o contrário) e
       inventa um salto que ninguém enxerga: o three escreve a pose da cabeça,
       depois o jogo posiciona o rig, e só então desenha. A amostra tem que
       cair DEPOIS do rig ser posto no lugar — que é exatamente o instante em
       que o quadro é composto.

       Isto OBSERVA: envolve `place` para ler o efeito dele, sem chamar nada e
       sem mudar o que o jogo faz. */
    /* E A AMOSTRA SAI DA CÂMERA DE OLHO, não de `camera.getWorldPosition()` —
       este teste PASSAVA POR ACIDENTE por causa disso, enquanto a validação
       independente media 0,7778 m de tranco no mesmo cenário.

       O motivo é circular: `camera` é justamente o objeto sob conserto. O three
       só escreve o transform dela dentro de `render()`, no FIM do tick, então
       durante o frame ela carrega a pose do frame ANTERIOR — a MESMA pose que
       o `place()` defeituoso lia. Compor rig(N) × pose(N−1) devolvia os dois
       erros multiplicados um pelo outro, e o salto se cancelava exato: a sonda
       independente mediu 0,0000 m por este caminho e 0,7778 m pelo caminho de
       baixo, no mesmo frame.

       O que o headset recebe é `rig.matrixWorld × cameraXR.cameras[0].matrix`:
       a sub-câmera de olho, com a pose que `onAnimationFrame` JÁ escreveu para
       ESTE frame. Tem que ser `.matrix` (o transform no espaço de referência):
       o `.matrixWorld` dela é escrito direto pelo `WebXRManager` lá no render e
       aqui ainda está velho, e `getWorldPosition()` nela recalcularia a matriz
       a partir do transform local — a armadilha documentada em docs/vr/perf-xr.md.
       Que a origem seja o olho e não o meio dos olhos não muda nada: o olho é
       rígido com a cabeça, e o que se mede aqui é SALTO, não posição absoluta. */
    const olho = new MP.THREE.Vector3();
    const _m = new MP.THREE.Matrix4();
    const xrCam = MP.renderer.xr.getCamera();
    const placeOrig = G.XR.place.bind(G.XR);
    let ant = null, maxSalto = 0;
    G.XR.place = (...args) => {
      const r = placeOrig(...args);
      G.XR.rig.updateMatrixWorld(true);
      _m.multiplyMatrices(G.XR.rig.matrixWorld, xrCam.cameras[0].matrix);
      olho.setFromMatrixPosition(_m);
      const agora = [olho.x, olho.z];
      if (ant) maxSalto = Math.max(maxSalto, Math.hypot(agora[0] - ant[0], agora[1] - ant[1]));
      ant = agora;
      return r;
    };
    await A.espera(200);
    maxSalto = 0;                       // ignora o aquecimento da amostragem
    dev.recenter();
    await A.espera(800);
    G.XR.place = placeOrig;
    const depois = [MP.player.pos.x, MP.player.pos.z];
    return {
      andou: Math.hypot(depois[0] - antes[0], depois[1] - antes[1]),
      distancia: Math.hypot(x, z),
      yaw: G.XR.giro.yaw,
      /* A VISTA, e não só o colisor. Os dois casos deste bloco liam apenas
         `player.pos` — e o defeito que sobrou depois da primeira correção era
         justamente um salto da CÂMERA por um frame, com o colisor parado. Ler
         só o colisor é ficar cego para metade do problema. */
      saltoDaVista: maxSalto,
    };
  };

  it('recentrar a 0,78 m do centro não desloca o jogador', async () => {
    const r = await h.play(recentrarDe, 0.55, -0.55);
    assert.ok(r.andou < 0.02,
      `recentrar de ${r.distancia.toFixed(2)} m deslocou o jogador ${r.andou.toFixed(4)} m — ` +
      'mudar a origem não é andar');
    assert.ok(r.saltoDaVista < 0.10,
      `a VISTA saltou ${r.saltoDaVista.toFixed(4)} m num frame ao recentrar: o colisor ficou ` +
      'parado e a câmera pulou, que é a metade do defeito que ler só o colisor não enxerga');
  });

  it('recentrar a 1,41 m também não desloca — e o erro crescia com a distância', async () => {
    const r = await h.play(recentrarDe, 1.0, -1.0);
    assert.ok(r.andou < 0.02,
      `recentrar de ${r.distancia.toFixed(2)} m deslocou ${r.andou.toFixed(4)} m: ` +
      'o deslocamento acompanhava a distância ao centro, que é a assinatura do defeito');
    assert.ok(r.saltoDaVista < 0.10,
      `a VISTA saltou ${r.saltoDaVista.toFixed(4)} m num frame ao recentrar`);
  });
});

describe('parede não come o rastreio: a vista acompanha o corpo', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  /* CAUSA (c) DO A6, viva desde a terceira rodada. O jogo soma o passo físico
     em `player.pos` ANTES da física; quando a colisão empurrava o jogador de
     volta, o acumulado do rig já tinha sido reduzido e a CABEÇA era arrastada
     junto. Medido antes: 3,0 m de passo físico contra um sólido moviam a vista
     0,560 m — o mundo travava enquanto o jogador andava de verdade no quarto.

     O certo é o colisor parar na parede e a cabeça continuar onde o corpo do
     jogador está. Ela fica ADIANTE do colisor, e isso não é defeito: quem anda
     contra uma parede virtual atravessa, porque ela não existe no quarto dele.
     O que não pode é o jogo puxar a vista de volta. */
  let h;
  before(async () => { h = await bootEmVR(bootGame, { port: 3428 }); });
  after(async () => { if (h) await h.close(); });

  it('andar contra um sólido move a VISTA o tanto que o corpo andou', async () => {
    const r = await h.play(async () => {
      const A = window.__A, G = window.__game, MP = window.__MP, dev = window.__xrEmulado;
      A.solta(); dev.position.set(0, 1.7, 0); await A.espera(500);

      /* Planta o jogador colado num sólido: o carro é o mais simples de achar
         e é exatamente o caso que a validação mediu. */
      const carro = G.Car.vehicles[0];
      const vp = carro.group.position;
      MP.player.pos.set(vp.x, MP.groundAt(vp.x, vp.z + 2.4, 999), vp.z + 2.4);
      MP.player.vel.set(0, 0, 0);
      await A.espera(500);

      const olho = new MP.THREE.Vector3();
      const lerOlho = () => { G.XR.rig.updateMatrixWorld(true); G.camera.getWorldPosition(olho); return [olho.x, olho.z]; };
      const o0 = lerOlho();
      const p0 = [MP.player.pos.x, MP.player.pos.z];

      // caminha 1,2 m NA DIREÇÃO do carro, em etapas de gente
      const passos = 24;
      for (let i = 1; i <= passos; i++) {
        dev.position.set(0, 1.7, -1.2 * i / passos);
        await A.espera(40);
      }
      await A.espera(700);
      const o1 = lerOlho();
      return {
        vista: Math.hypot(o1[0] - o0[0], o1[1] - o0[1]),
        colisor: Math.hypot(MP.player.pos.x - p0[0], MP.player.pos.z - p0[1]),
        fisico: 1.2,
      };
    });
    assert.ok(r.vista > r.fisico * 0.85,
      `o jogador andou ${r.fisico} m de verdade e a vista moveu ${r.vista.toFixed(3)} m: ` +
      'o mundo travou enquanto ele andava no quarto — é a parede comendo o rastreio');
  });
});

describe('a pose que o rig lê é a DESTE frame', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  /* CAUSA (a) DO A6, e a razão de três correções seguidas errarem o alvo.

     A ordem do three (r185) num frame de XR:

       `WebXRManager.onAnimationFrame` pega a pose nova e escreve as
       sub-câmeras de OLHO  →  chama o callback do jogo (o tick)  →  o tick
       termina em `render()`, e é SÓ ALI que `xr.updateCamera(camera)` escreve
       `camera.position` (three.module.js:17637).

     Ou seja, `camera.position` lido durante o tick é a pose que o `render()`
     do frame ANTERIOR deixou, e o rig era posicionado todo frame para uma
     cabeça que já tinha saído dali. Andando são ~2 cm; num recentrar, num
     piso redefinido ou numa perda de rastreio é o offset inteiro, e a vista
     leva um tranco por um frame com o jogador parado. Quem trabalha com a
     pose do frame passado está sempre consertando o passado.

     ESTE BLOCO MEDE AS DUAS PONTAS, na sessão, sem conduzir nada: a
     DEFASAGEM (o que o tick tem em mãos contra a pose que este frame desenha)
     e a VISTA (rig deste frame × olho deste frame, que é o quadro que chega no
     headset). Só translação: girando a cabeça, olho e centro dos olhos se
     movem de formas diferentes e a comparação deixaria de ser exata. */
  let h;
  before(async () => { h = await bootEmVR(bootGame, { port: 3424 }); });
  after(async () => { if (h) await h.close(); });

  /* Salta a pose da cabeça `dx` metros num frame e devolve o que o jogo viu.
     Envolver `place` OBSERVA: chama o original e lê o efeito. */
  const saltarPose = async (dx, dz) => {
    const G = window.__game, MP = window.__MP, A = window.__A, dev = window.__xrEmulado;
    const THREE = MP.THREE, xrCam = MP.renderer.xr.getCamera();
    A.solta();
    dev.position.set(0, 1.7, 0);
    await A.espera(900);

    const placeOrig = G.XR.place.bind(G.XR);
    const lido = new THREE.Vector3(), pose = new THREE.Vector3(), vista = new THREE.Vector3();
    const _m = new THREE.Matrix4();
    let antLido = null, antPose = null, antVista = null;
    let defasagem = 0, saltoVista = 0;
    G.XR.place = (...args) => {
      /* O QUE O TICK TEM EM MÃOS quando o rig é posicionado. */
      lido.copy(G.camera.position);
      /* A POSE QUE ESTE FRAME VAI DESENHAR: `.matrix` da sub-câmera de olho, já
         escrita por `onAnimationFrame`. Não `.matrixWorld` (o `WebXRManager` só
         a escreve no render) nem `getWorldPosition()` nela (recalcularia a
         matriz do transform local — a armadilha de docs/vr/perf-xr.md). */
      pose.setFromMatrixPosition(xrCam.cameras[0].matrix);
      const r = placeOrig(...args);
      G.XR.rig.updateMatrixWorld(true);
      _m.multiplyMatrices(G.XR.rig.matrixWorld, xrCam.cameras[0].matrix);
      vista.setFromMatrixPosition(_m);
      if (antLido) {
        /* Defasagem = o quanto o tick DEIXOU DE VER do movimento deste frame.
           Com pose puramente transladada, o deslocamento do olho e o da cabeça
           são o MESMO vetor: se o tick está em dia, os dois deltas coincidem. */
        defasagem = Math.max(defasagem, Math.hypot(
          (lido.x - antLido[0]) - (pose.x - antPose[0]),
          (lido.z - antLido[1]) - (pose.z - antPose[1])));
        saltoVista = Math.max(saltoVista,
          Math.hypot(vista.x - antVista[0], vista.z - antVista[1]));
      }
      antLido = [lido.x, lido.z]; antPose = [pose.x, pose.z]; antVista = [vista.x, vista.z];
      return r;
    };
    await A.espera(300);
    defasagem = 0; saltoVista = 0;        // ignora o aquecimento da amostragem
    const colisorAntes = [MP.player.pos.x, MP.player.pos.z];
    dev.position.set(dx, 1.7, dz);        // o salto, num frame só
    await A.espera(900);
    G.XR.place = placeOrig;
    return {
      salto: Math.hypot(dx, dz),
      defasagem,
      saltoVista,
      andou: Math.hypot(MP.player.pos.x - colisorAntes[0], MP.player.pos.z - colisorAntes[1]),
    };
  };

  it('o que o rig lê acompanha a pose do frame, mesmo num salto de 1 m', async () => {
    const r = await h.play(saltarPose, 1.0, 0);
    assert.ok(r.defasagem < 0.05,
      `no frame do salto de ${r.salto.toFixed(2)} m o tick ainda tinha uma pose ` +
      `${r.defasagem.toFixed(4)} m atrasada: o rig é posicionado para o frame anterior`);
  });

  it('e um salto de pose de 1 m NÃO desloca a vista por frame nenhum', async () => {
    /* O sintoma que sobrou depois de três correções: o limiar de passo humano
       impedia que virasse passo permanente (o colisor não anda, e isso continua
       valendo aqui), mas a vista aparecia deslocada do tamanho inteiro do salto
       por um frame. Medido pela validação independente: 1,0000 m. */
    const r = await h.play(saltarPose, 1.0, 0);
    assert.ok(r.saltoVista < 0.05,
      `a VISTA pulou ${r.saltoVista.toFixed(4)} m num frame com o jogador parado no lugar`);
    assert.ok(r.andou < 0.05,
      `e o colisor andou ${r.andou.toFixed(4)} m: um salto de pose não é caminhada`);
  });

  it('um salto pequeno, de 0,30 m, também não pode aparecer como tranco', async () => {
    /* Abaixo do limiar o delta é ACEITO como passo, e aí a vista tem que
       acompanhar a cabeça de mansinho — não pular. É a cerca do outro lado: um
       conserto que só tratasse o caso rejeitado deixaria este passar. */
    const r = await h.play(saltarPose, 0.30, 0);
    assert.ok(r.defasagem < 0.05,
      `salto de 0,30 m com o tick ${r.defasagem.toFixed(4)} m atrasado`);
    assert.ok(r.saltoVista <= 0.32,
      `a vista pulou ${r.saltoVista.toFixed(4)} m para 0,30 m de pose: ` +
      'o movimento foi contado duas vezes no mesmo frame');
  });
});
