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
  const C = window.__CORPOQA && window.__CORPOQA.corpo;
  return {
    chao: XR.rig ? XR.rig.position.y : MP.player.pos.y,
    pes: caixa.min.y, topo: caixa.max.y,
    perna,
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
    assert.ok(m.pes - m.chao > -0.06,
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
    dev.recenter();
    await A.espera(700);
    const depois = [MP.player.pos.x, MP.player.pos.z];
    return {
      andou: Math.hypot(depois[0] - antes[0], depois[1] - antes[1]),
      distancia: Math.hypot(x, z),
      yaw: G.XR.giro.yaw,
    };
  };

  it('recentrar a 0,78 m do centro não desloca o jogador', async () => {
    const r = await h.play(recentrarDe, 0.55, -0.55);
    assert.ok(r.andou < 0.02,
      `recentrar de ${r.distancia.toFixed(2)} m deslocou o jogador ${r.andou.toFixed(4)} m — ` +
      'mudar a origem não é andar');
  });

  it('recentrar a 1,41 m também não desloca — e o erro crescia com a distância', async () => {
    const r = await h.play(recentrarDe, 1.0, -1.0);
    assert.ok(r.andou < 0.02,
      `recentrar de ${r.distancia.toFixed(2)} m deslocou ${r.andou.toFixed(4)} m: ` +
      'o deslocamento acompanhava a distância ao centro, que é a assinatura do defeito');
  });
});
