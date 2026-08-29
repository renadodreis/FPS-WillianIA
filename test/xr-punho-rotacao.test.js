/* ================================================================
   QA — O PUNHO ESQUERDO DO BONECO GIRA COM A MÃO DO JOGADOR, NÃO COM A ARMA.

   O QUE FICOU DA RODADA PASSADA. A POSIÇÃO da mão esquerda já vai para o
   `gripSpace` do controle (resíduo 0,0000 m, `test/xr-mao-controle.test.js`) e
   o cotovelo deixou de travar esticado. A ROTAÇÃO não: `js/fpbody.js` monta
   `dirL` com `TUNE.fingersL` aplicado ao quaternion de `gun.group`, e depois
   `alignHand` rola o punho em `TUNE.rollL`. Ou seja, com a mão do jogador
   solta ao lado do corpo, o punho do boneco continua orientado como se
   abraçasse o guarda-mão de uma arma que está longe dali.

   A GRANDEZA QUE SE MEDE, e ela precede tudo. "Aparência" não entra em teste;
   o que entra é o punho ser RÍGIDO NA MÃO. A spec do WebXR define o
   `gripSpace` como o espaço em que "if the user was holding a straight rod in
   their hand, it would be aligned with the negative Z axis and the origin
   rests at their palm", com a origem "at the centroid — the center of mass —
   of the user's fist". Se o punho é a mão, então

       Q_rel = q_punhoDoControle⁻¹ · q_ossoDoPunhoDoBoneco

   é uma CONSTANTE enquanto a mão está livre: girar o controle tem de girar o
   osso do punho exatamente o mesmo tanto. Este arquivo mede `Q_rel` em duas
   rotações do controle e cobra o ângulo entre elas, em GRAUS.

   POR QUE ESTA RÉGUA NÃO PASSA POR ACIDENTE:
   · É DIFERENCIAL. Não depende de convenção de eixo nenhuma (nem da minha
     leitura da spec sobre qual eixo do grip é o dedo): compara a MESMA
     grandeza consigo mesma em dois instantes, com o controle girado no meio.
     Com o defeito no lugar o osso não acompanha e o ângulo vale o giro
     inteiro.
   · Cada caso confere ANTES que o controle girou de verdade (o ângulo de
     `q_grip` entre as duas amostras) — senão "o punho acompanhou" seria dois
     objetos parados.
   · E confere o ESTADO: `XRArma.duasMaos()` tem de ser `false` no caso da mão
     livre e `true` no caso da mão na arma. Sem isso os dois casos poderiam
     estar medindo o mesmo estado, e um deles passaria de graça.

   O CASO COMPLEMENTAR É OBRIGATÓRIO. Mão de apoio NA ARMA é outro contrato: o
   punho tem de continuar acomodado à empunhadura (o jogador está segurando um
   guarda-mão, não o ar). Esse caso mede o ângulo entre o eixo dos dedos do
   boneco e a direção de empunhadura no espaço DA ARMA — que é onde
   `js/fpbody.js` sempre resolveu, e não pode regredir.

   COMO SE MEDE O "EIXO DOS DEDOS" SEM PERGUNTAR AO CÓDIGO SOB TESTE: pela
   GEOMETRIA DO MODELO. Os ossos das falanges base são filhos do osso da mão e
   a posição de repouso deles é do GLB desenhado — a média dessas posições é o
   eixo punho→nós dos dedos. `js/fpbody.js` calcula o mesmo eixo, mas o teste
   não o lê de lá: lê do rig, que é a âncora independente.

   NUNCA `Box3` (a caixa de um `SkinnedMesh` é congelada na primeira pose
   pedida) e SEMPRE no `renderer.render`, que é o único instante em que a arma
   já está no punho do jogador.

   PORTA 3640 — faixa exclusiva desta frente.
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame } = require('./helpers/harness');
const { bootEmVR } = require('./helpers/iwer');

const PORT = 3640;

/* O punho é RÍGIDO na mão: girar o controle gira o osso o mesmo tanto. A folga
   cobre a suavização de pose e o servo anti-olho de js/fpbody.js. */
const RIGIDO_MAX = 12;     // graus
/* Mão NA ARMA: o eixo dos dedos continua na direção de empunhadura da arma. */
const NA_ARMA_MAX = 8;     // graus

async function esperarCorpo() {
  const G = window.__game;
  for (let i = 0; i < 300 && !(G.FpBody.ready || G.FpBody.failed); i++) {
    await new Promise(r => setTimeout(r, 100));
  }
  if (!G.FpBody.ready) throw new Error('FpBody não carregou o GLB');
}

function instalarSonda() {
  const G = window.__game, MP = window.__MP, T = MP.THREE;
  const raiz = G.FpBody.bodyRoot, B = G.FpBody.bones;

  /* EIXO DOS DEDOS PELA GEOMETRIA DO GLB, não pelo campo interno do módulo:
     média das posições de repouso das falanges base que são filhas da mão. */
  const eixoLocal = (mao) => {
    const acc = new T.Vector3();
    for (const f of mao.children) {
      if (f.isBone && /^Finger/.test(f.name)) acc.add(f.position);
    }
    return acc.lengthSq() > 1e-8 ? acc.normalize() : new T.Vector3(0, 1, 0);
  };
  const eixoL = eixoLocal(B.haL), eixoR = eixoLocal(B.haR);

  const wq = o => o.getWorldQuaternion(new T.Quaternion());
  const wp = o => o.getWorldPosition(new T.Vector3());
  const dedosMundo = (mao, eixo) =>
    eixo.clone().transformDirection(mao.matrixWorld).normalize();
  const graus = (a, b) =>
    Math.acos(Math.min(1, Math.max(-1, a.dot(b)))) * 180 / Math.PI;

  function amostrar() {
    raiz.updateWorldMatrix(true, true);
    const g = G.arsenal[G.gunIndex];
    const emXR = !!(G.XR && G.XR.presenting);
    const punhoL = emXR ? (G.XR.punho('left') || G.XR.mao('left')) : null;
    const punhoR = emXR ? (G.XR.punho('right') || G.XR.mao('right')) : null;
    if (punhoL) punhoL.updateWorldMatrix(true, false);
    if (punhoR) punhoR.updateWorldMatrix(true, false);

    const qPunhoL = punhoL ? wq(punhoL) : null;
    const qOssoL = wq(B.haL);
    /* Q_rel: a pose do osso do punho DENTRO da mão do jogador. Constante = o
       punho é rígido na mão. */
    const relL = qPunhoL ? qPunhoL.clone().invert().multiply(qOssoL) : null;

    const dedosL = dedosMundo(B.haL, eixoL);
    const dedosR = dedosMundo(B.haR, eixoR);

    /* a direção de empunhadura que js/fpbody.js usa quando a mão está na arma:
       TUNE.fingersL no espaço DA ARMA. É a régua do caso "mão na arma". */
    let alvoArma = null;
    if (g && g.group) {
      const t = G.FpBody.TUNE.fingersL;
      alvoArma = new T.Vector3(t[0], t[1], t[2]).normalize()
        .applyQuaternion(wq(g.group));
    }

    /* antebraço → mão: o desvio do punho tem limite humano, e é uma régua
       ANATÔMICA, independente de qualquer convenção de eixo do grip */
    const ante = wp(B.haL).sub(wp(B.foL));
    const desvio = ante.lengthSq() > 1e-9
      ? graus(ante.normalize(), dedosL) : null;

    return {
      arma: g ? (g.name || String(G.gunIndex)) : null,
      duasMaos: !!(G.XRArma && G.XRArma.duasMaos && G.XRArma.duasMaos()),
      escala: raiz.scale.x || 1, visivel: raiz.visible,
      qPunhoL: qPunhoL ? qPunhoL.toArray() : null,
      qOssoL: qOssoL.toArray(),
      relL: relL ? relL.toArray() : null,
      dedosL: dedosL.toArray(), dedosR: dedosR.toArray(),
      angDedosArma: alvoArma ? graus(dedosL, alvoArma) : null,
      /* ÂNCORA INDEPENDENTE: o CANO, que é geometria do modelo desenhado (o
         mesmo motivo pelo qual `direcaoDoCano()` existe para a mira). */
      angDedosCano: graus(dedosL, new T.Vector3().fromArray(G.direcaoDoCano())),
      desvioPunho: desvio,
      /* eixo do bastão (grip −Z, a spec do WebXR) e o quanto os dedos do
         boneco se inclinam em relação a ele */
      angDedosBastao: qPunhoL
        ? graus(dedosL, new T.Vector3(0, 0, -1).applyQuaternion(qPunhoL)) : null,
      /* A DEDUÇÃO DO PUNHO CONFERIDA CONTRA A MÃO DIREITA. O punho direito
         segura a arma por outro caminho de código inteiro (âncoras autorais +
         `fingersR`/`rollR`), e a arma mora rigidamente no `gripSpace` direito.
         Então `q_gripR⁻¹·q_ossoR` é uma medida INDEPENDENTE de "punho fechado
         em volta de um cilindro" — e comparar com o offset deduzido do polegar
         do GLB é o que pega uma palma virada 180° para o lado errado. */
      relVsDeduzido: (() => {
        const off = G.FpBody.punhoOffset;
        if (!punhoR || !off || !off.r) return null;
        const rel = wq(punhoR).invert().multiply(wq(B.haR));
        const d = Math.abs(rel.x * off.r.x + rel.y * off.r.y + rel.z * off.r.z
          + rel.w * off.r.w);
        return 2 * Math.acos(Math.min(1, d)) * 180 / Math.PI;
      })(),
      punhoLW: punhoL ? wp(punhoL).toArray() : null,
      maoLW: wp(B.haL).toArray(),
      maoNoControle: punhoL ? wp(B.haL).distanceTo(wp(punhoL)) : null,
      ancEsq: g && g.parts && g.parts.handL ? wp(g.parts.handL).toArray() : null,
    };
  }

  window.__M = { amostra: null, erro: null, quero: false };
  const origRender = MP.renderer.render.bind(MP.renderer);
  MP.renderer.render = function (cena, cam) {
    if (window.__M.quero) {
      try { window.__M.amostra = amostrar(); } catch (e) { window.__M.erro = String((e && e.stack) || e); }
      window.__M.quero = false;
    }
    return origRender(cena, cam);
  };
  window.__M.ler = async () => {
    window.__M.quero = true;
    for (let i = 0; i < 150 && window.__M.quero; i++) await new Promise(r => setTimeout(r, 30));
    if (window.__M.erro) throw new Error('sonda: ' + window.__M.erro);
    return window.__M.amostra;
  };
  return { ok: !!(B.haL && B.foL && B.haR) };
}

/* Colocação do PUNHO (gripSpace) num ponto de mundo, por iteração sobre o erro
   medido: o IWER aceita a pose do `targetRay` e o grip do Touch fica 45,4° e
   ~5 cm dela. Mesma técnica de test/xr-mao-controle.test.js. */
function instalarControles() {
  const G = window.__game, MP = window.__MP, T = MP.THREE;
  window.__C = {
    async porPunho(qual, alvoMundo, voltas = 8) {
      const dev = window.__xrEmulado, rig = G.XR.rig;
      const alvo = new T.Vector3().fromArray(alvoMundo);
      for (let i = 0; i < voltas; i++) {
        const p = G.XR.punho(qual) || G.XR.mao(qual);
        const err = new T.Vector3();
        if (p) { p.updateWorldMatrix(true, false); err.copy(alvo).sub(p.getWorldPosition(new T.Vector3())); }
        rig.updateWorldMatrix(true, false);
        const eRig = err.applyQuaternion(rig.getWorldQuaternion(new T.Quaternion()).invert());
        const v = new T.Vector3().copy(dev.controllers[qual].position).add(eRig);
        dev.controllers[qual].position.set(v.x, v.y, v.z);
        await new Promise(r => setTimeout(r, 110));
      }
    },
    /* gira um controle `g` graus em volta de um eixo de MUNDO */
    girar(qual, eixo, g) {
      const dev = window.__xrEmulado;
      const q = new T.Quaternion().setFromAxisAngle(
        new T.Vector3().fromArray(eixo).normalize(), g * Math.PI / 180);
      const atual = new T.Quaternion().copy(dev.controllers[qual].quaternion);
      const novo = q.multiply(atual);
      dev.controllers[qual].quaternion.set(novo.x, novo.y, novo.z, novo.w);
    },
    nivelar() {
      window.__xrEmulado.controllers.right.quaternion.set(0, 0, 0, 1);
      window.__xrEmulado.controllers.left.quaternion.set(0, 0, 0, 1);
    },
    cabeca() {
      G.camera.updateWorldMatrix(true, false);
      return G.camera.getWorldPosition(new T.Vector3()).toArray();
    },
  };
  void MP;
  return true;
}

/* ângulo, em graus, entre duas rotações dadas como arrays [x,y,z,w] */
function anguloEntre(a, b) {
  const dot = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]);
  return 2 * Math.acos(Math.min(1, dot)) * 180 / Math.PI;
}
const f2 = v => (v === null || v === undefined ? 'n/d' : v.toFixed(2));
const f4 = v => (v === null || v === undefined ? 'n/d' : v.toFixed(4));

describe('em VR o punho esquerdo do boneco gira com a MÃO, não com a arma',
  { skip: !CHROME && 'Chrome não encontrado' }, () => {
    let h;
    before(async () => {
      h = await bootEmVR(bootGame, { port: PORT });
      await h.play(esperarCorpo);
      const r = await h.play(instalarSonda);
      assert.equal(r.ok, true, 'ossos da mão/antebraço não encontrados no rig');
      await h.play(instalarControles);
      await h.play(async () => {
        const dev = window.__xrEmulado;
        dev.position.set(0, 1.70, 0);
        dev.quaternion.set(0, 0, 0, 1);
        await new Promise(r2 => setTimeout(r2, 2500));
      });
    });
    after(async () => { if (h) await h.close(); });

    const SOLTA = [-0.34, -0.55, -0.12];   // mão livre, ao lado do corpo
    /* Mão de apoio SOBRE A LINHA DO CANO — é ela que engata as duas mãos
       (`APOIO_PEGA` = 0,20 m de distância PERPENDICULAR ao eixo
       `gripR → muzzle`, js/xr/xrweapon.js). Uma mão "à frente do peito" mas
       0,38 m ao lado do cano não engata nada, e o caso mediria o estado
       errado — o `assert` de `duasMaos` no `condicao` é o que denuncia isso. */
    const APOIO = [0.06, -0.30, -0.50];
    const PUNHO_DIR = [0.16, -0.32, -0.30];

    /* Põe as duas mãos e devolve a amostra. As rotações (graus, eixo de MUNDO)
       são aplicadas ANTES de posicionar os punhos, porque girar o controle move
       o grip (ele fica ~5 cm e 45,4° do targetRay). E tudo parte de `nivelar()`,
       senão a rotação de um caso vaza para o seguinte. */
    const pose = async (offL, giroL, giroR) => await h.play(async (oL, gL, gR) => {
      window.__C.nivelar();
      if (gL) window.__C.girar('left', gL.eixo, gL.graus);
      if (gR) window.__C.girar('right', gR.eixo, gR.graus);
      const c = window.__C.cabeca();
      await window.__C.porPunho('right', [c[0] + 0.16, c[1] - 0.32, c[2] - 0.30]);
      await window.__C.porPunho('left', [c[0] + oL[0], c[1] + oL[1], c[2] + oL[2]]);
      await new Promise(r => setTimeout(r, 700));
      const m = await window.__M.ler();
      m.alvoL = [c[0] + oL[0], c[1] + oL[1], c[2] + oL[2]];
      return m;
    }, offL, giroL || null, giroR || null);
    void PUNHO_DIR;

    const condicao = (m, alvoDuasMaos) => {
      assert.ok(m.visivel, 'o boneco não está visível — não há o que medir');
      assert.ok(m.escala < 0.99,
        `a raiz do boneco está em escala ${f4(m.escala)}: sem escala de VR este ` +
        'arquivo não está medindo o produto');
      const e = Math.hypot(m.punhoLW[0] - m.alvoL[0], m.punhoLW[1] - m.alvoL[1],
        m.punhoLW[2] - m.alvoL[2]);
      assert.ok(e < 0.04,
        `o controle esquerdo não chegou onde o caso pediu (${f4(e)} m): o resto ` +
        'da medida não vale');
      assert.equal(m.duasMaos, alvoDuasMaos,
        `o caso precisa de duasMaos=${alvoDuasMaos} e o jogo está em ` +
        `${m.duasMaos}: sem isso os dois casos deste arquivo medem o mesmo estado`);
    };

    it('MÃO LIVRE: girar o controle gira o punho do boneco o mesmo tanto', async () => {
      /* A RÉGUA. Com a mão fora da arma, `q_grip⁻¹·q_osso` é o punho dentro da
         mão — e tem de ser o MESMO com o controle em duas rotações. */
      const a = await pose(SOLTA, null, null);
      condicao(a, false);
      const b = await pose(SOLTA, { eixo: [0, 0, 1], graus: 75 }, null);
      condicao(b, false);
      const girouControle = anguloEntre(a.qPunhoL, b.qPunhoL);
      const girouOsso = anguloEntre(a.qOssoL, b.qOssoL);
      const rigidez = anguloEntre(a.relL, b.relL);
      console.log(`    [mão livre] controle girou ${f2(girouControle)}° · osso do ` +
        `punho girou ${f2(girouOsso)}° · Q_rel mudou ${f2(rigidez)}° · dedos↔bastão ` +
        `${f2(a.angDedosBastao)}°→${f2(b.angDedosBastao)}° · desvio punho ` +
        `${f2(a.desvioPunho)}°→${f2(b.desvioPunho)}° · mão→controle ` +
        `${f4(a.maoNoControle)} m`);
      assert.ok(girouControle > 60,
        `o controle esquerdo girou só ${f2(girouControle)}°: o caso não exercita ` +
        'nada, e "o punho acompanhou" seriam dois objetos parados');
      assert.ok(rigidez < RIGIDO_MAX,
        `com a mão do jogador LIVRE, girar o controle ${f2(girouControle)}° mudou a ` +
        `pose do punho dentro da mão em ${f2(rigidez)}° (o osso girou ` +
        `${f2(girouOsso)}°). O punho não é rígido na mão: ele está sendo orientado ` +
        'pelo quaternion de `gun.group`, ou seja, abraça um guarda-mão que não ' +
        'está ali');
    });

    it('MÃO LIVRE: girar a ARMA não gira o punho esquerdo', async () => {
      /* O DEFEITO DITO DO OUTRO LADO, e é o caso mais direto que existe: com a
         mão do jogador PARADA (mesmo controle esquerdo, mesma pose), girar a
         ARMA — que em XR é a mão DIREITA — não pode mexer no punho esquerdo. Se
         mexer, a orientação está saindo de `gun.group`.

         O ângulo é medido no OSSO, no mundo, e o caso confere antes que a arma
         girou de verdade e que a mão esquerda não se mexeu. */
      const a = await pose(SOLTA, null, null);
      condicao(a, false);
      const b = await pose(SOLTA, null, { eixo: [1, 0, 0], graus: 55 });
      condicao(b, false);
      const armaGirou = anguloEntre(a.dedosR, b.dedosR) || null;
      const dirArma = Math.acos(Math.min(1, Math.max(-1,
        a.dedosR[0] * b.dedosR[0] + a.dedosR[1] * b.dedosR[1] + a.dedosR[2] * b.dedosR[2],
      ))) * 180 / Math.PI;
      const maoParada = anguloEntre(a.qPunhoL, b.qPunhoL);
      const ossoGirou = anguloEntre(a.qOssoL, b.qOssoL);
      console.log(`    [arma girada] mão direita do boneco girou ${f2(dirArma)}° · ` +
        `controle esquerdo girou ${f2(maoParada)}° · osso do punho ESQUERDO girou ` +
        `${f2(ossoGirou)}° · desvio punho ${f2(a.desvioPunho)}°→${f2(b.desvioPunho)}°`);
      void armaGirou;
      assert.ok(dirArma > 25,
        `a arma girou só ${f2(dirArma)}° (medido na mão DIREITA do boneco, que a ` +
        'segue): o caso não exercita nada');
      assert.ok(maoParada < 8,
        `o controle esquerdo girou ${f2(maoParada)}° entre as duas amostras: era ` +
        'para ele estar parado, e o resto da medida não vale');
      assert.ok(ossoGirou < RIGIDO_MAX,
        `com a mão do jogador PARADA, girar a arma ${f2(dirArma)}° girou o punho ` +
        `ESQUERDO do boneco ${f2(ossoGirou)}°. O punho está pendurado em ` +
        '`gun.group`, não na mão do jogador');
    });

    it('a pose de punho deduzida do GLB bate com a mão DIREITA, que já segura certo', async () => {
      /* O CASO QUE PEGA A PALMA VIRADA. A orientação do punho livre é deduzida
         da geometria do modelo (dedos × polegar = +X do grip, a definição da
         spec). Se eu tivesse errado QUAL osso é o polegar, a palma sairia
         girada ~180° em volta do eixo dos dedos — e nenhum dos casos de
         rigidez veria isso, porque rigidez é diferencial.

         A âncora independente é a mão DIREITA: ela segura a arma pelas âncoras
         autorais (`gripR` + `fingersR`/`rollR`), e a arma mora rigidamente no
         `gripSpace` direito. `q_gripR⁻¹·q_ossoR` é, portanto, "punho fechado em
         volta de um cilindro" medido por um caminho de código que não passa por
         `qPunho`. Empunhadura de pistola e cabo de Touch não são o mesmo
         cilindro, então o teto é largo — mas 180° não cabe nele. */
      const m = await pose(SOLTA, null, null);
      condicao(m, false);
      console.log(`    [dedução] punho DIREITO medido × offset deduzido do GLB: ` +
        `${f2(m.relVsDeduzido)}°`);
      assert.ok(m.relVsDeduzido !== null && m.relVsDeduzido < 90,
        `o offset deduzido do polegar do GLB está a ${f2(m.relVsDeduzido)}° da pose ` +
        'que a mão DIREITA realmente usa para segurar um cilindro: a palma do ' +
        'boneco está virada para o lado errado do controle');
    });

    it('MÃO NA ARMA: os dedos CRUZAM o cano, não apontam ao longo dele', async () => {
      /* O OUTRO CONTRATO, medido contra uma âncora INDEPENDENTE: a direção do
         CANO (`direcaoDoCano()`, geometria do modelo desenhado). Comparar o eixo
         dos dedos com `TUNE.fingersL` aplicado a `gun.group` seria comparar uma
         reta com ela mesma — é literalmente a conta que js/fpbody.js faz, e dá
         0,00° por álgebra (medido: 0,00° com o defeito no lugar).

         Uma mão que segura um guarda-mão CRUZA o cilindro: o eixo dos dedos
         fica perto da perpendicular ao cano. O número de projeto é 65,0°
         (`fingersL` normalizado tem 0,423 de componente no cano). */
      const m = await pose(APOIO, null, null);
      condicao(m, true);
      console.log(`    [mão na arma] dedos↔cano ${f2(m.angDedosCano)}° · ` +
        `dedos↔"empunhadura" ${f2(m.angDedosArma)}° (esta é a conta do próprio ` +
        `produto: 0,00° por álgebra) · mão→controle ${f4(m.maoNoControle)} m`);
      assert.ok(m.angDedosCano > 40 && m.angDedosCano < 120,
        `com a mão de apoio NA ARMA, o eixo dos dedos ficou a ${f2(m.angDedosCano)}° ` +
        'do cano: a palma deixou de cruzar o guarda-mão');
      assert.ok(m.angDedosArma < NA_ARMA_MAX,
        `o eixo dos dedos ficou a ${f2(m.angDedosArma)}° da direção de empunhadura ` +
        'que o produto calcula');
    });

    it('MÃO NA ARMA: girar o controle NÃO gira o punho — quem manda é a arma', async () => {
      /* E o complementar do primeiro caso, MEDIDO NO OSSO. No estado de apoio a
         rigidez em relação ao CONTROLE deixa de ser o contrato: a mão está
         agarrada a um guarda-mão, e girar o pulso em volta dele não é o que o
         boneco faz. Sem este caso, "punho rígido na mão" seria satisfeito
         colando o punho ao controle nos DOIS estados — que é a correção fácil e
         errada. */
      const a = await pose(APOIO, null, null);
      condicao(a, true);
      const b = await pose(APOIO, { eixo: [0, 0, 1], graus: 40 }, null);
      condicao(b, true);
      const controleGirou = anguloEntre(a.qPunhoL, b.qPunhoL);
      const ossoGirou = anguloEntre(a.qOssoL, b.qOssoL);
      console.log(`    [apoio girado] controle girou ${f2(controleGirou)}° · osso do ` +
        `punho girou ${f2(ossoGirou)}° · dedos↔cano ${f2(a.angDedosCano)}°→` +
        `${f2(b.angDedosCano)}°`);
      assert.ok(controleGirou > 25,
        `o controle girou só ${f2(controleGirou)}°: o caso não exercita nada`);
      assert.ok(ossoGirou < RIGIDO_MAX,
        `com a mão APOIADA na arma, girar o controle ${f2(controleGirou)}° girou o ` +
        `punho do boneco ${f2(ossoGirou)}°: a mão soltou o guarda-mão e virou junto ` +
        'com o pulso do jogador');
    });
  });
