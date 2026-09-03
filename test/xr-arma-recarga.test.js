/* ================================================================
   A RECARGA VIRA GESTO VISÍVEL — e para de mentir no headset.

   Medido no produto antes desta rodada: a MECÂNICA funcionava (Y esquerdo
   inicia, termina em ~2 s, reserva 150→121). O que estava quebrado era o que
   o jogador VÊ. A coreografia do game.js escreve em três lugares, e em XR
   um deles era apagado e os outros dois viravam mentira:

     · o `tilt` ia para `weaponRoot.quaternion` e era SOBRESCRITO por
       `XRArma.aplicar()` no frame seguinte — o gesto simplesmente não existia;
     · o pente caía e voltava SOZINHO, no relógio;
     · e uma mão esquerda de MENTIRA fazia o gesto na arma, enquanto a mão
       esquerda real do jogador estava parada em outro lugar.

   O QUE ESTE ARQUIVO MEDE, e em que unidade:
     · o ÂNGULO, em graus, entre o cano e o eixo do controle — parado e no auge
       da recarga. É o gesto existindo ou não, em número;
     · a distância `gripR`↔palma, em metros, DURANTE a inclinação: girar a arma
       não pode desgrudá-la da mão (B1);
     · a distância, em metros, entre a mão esquerda do MODELO e o controle
       esquerdo REAL, durante a recarga;
     · a distância CONGELADA, em metros, entre a mão de apoio e o poço do
       carregador no frame exato da transição — e por qual `via` ela veio;
     · munição em pente e reserva, e a contagem de pulsos hápticos por mão.

   ÂNCORAS INDEPENDENTES. A direção do cano vem de `__game.direcaoDoCano()`
   (o nó `muzzle` do modelo desenhado); o eixo de referência vem do controle
   entregue pelo runtime; o poço vem do nó `mag` do modelo. Nenhum dos três é
   gerado por js/xr/xrweapon.js, que é o código sob teste.

   PORTA 3674 (só deste arquivo).
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const { CHROME, bootGame } = require('./helpers/harness');
const { bootEmVR } = require('./helpers/iwer');

const PORT = 3674;
const f3 = v => (typeof v === 'number' && Number.isFinite(v) ? v.toFixed(3) : '?');

function instalarSonda() {
  const G = window.__game, MP = window.__MP, T = MP.THREE;
  let amostra = null;

  /* ================================================================
     O DIÁRIO DE PULSOS. O registro do IWER guarda só o ÚLTIMO pulso por
     atuador, e uma recarga tem quatro etapas em dois segundos — ler o último
     mediria a última, não a sequência. Então o `pulse` do atuador é embrulhado
     para ACUMULAR. Isto é observação, não condução: o embrulho não chama nada,
     não decide nada e não substitui nada; ele anota o que o jogo mandou e
     repassa ao runtime. A diferença importa — um andaime que CHAMA o que o
     game.js deveria chamar já fez o giro contar duas vezes nesta frente.
     ================================================================ */
  const diario = [];
  function embrulhar() {
    const s = MP.renderer.xr.getSession && MP.renderer.xr.getSession();
    if (!s) return 0;
    let n = 0;
    for (const f of Array.from(s.inputSources)) {
      const a = f.gamepad && f.gamepad.hapticActuators && f.gamepad.hapticActuators[0];
      if (!a || a.__espiado) continue;
      const orig = a.pulse.bind(a);
      a.pulse = (v, d) => {
        diario.push({ mao: f.handedness, v, d, t: performance.now() });
        return orig(v, d);
      };
      a.__espiado = true;
      n++;
    }
    return n;
  }

  const rOrig = MP.renderer.render.bind(MP.renderer);
  MP.renderer.render = (cena, cam) => {
    const v = rOrig(cena, cam);
    const e = G.XRArma.estado();
    const rec = G.XRArma.recarga();
    const gun = G.arsenal[G.gunIndex];

    /* O CANO, do modelo desenhado — e o EIXO DO CONTROLE, do runtime. */
    const cano = new T.Vector3().fromArray(G.direcaoDoCano());
    const raio = G.XR.mao('right');
    let angCanoControle = null;
    if (raio) {
      raio.updateWorldMatrix(true, false);
      const eixo = new T.Vector3(0, 0, -1)
        .applyQuaternion(raio.getWorldQuaternion(new T.Quaternion()));
      angCanoControle = Math.acos(Math.max(-1, Math.min(1, cano.dot(eixo)))) * 180 / Math.PI;
    }

    const gripR = gun && gun.parts && gun.parts.handR
      ? gun.parts.handR.getWorldPosition(new T.Vector3()) : null;
    const punho = G.XR.punho('right');
    let gripNaPalma = null;
    if (punho && gripR) {
      punho.updateWorldMatrix(true, false);
      gripNaPalma = punho.getWorldPosition(new T.Vector3()).distanceTo(gripR);
    }

    /* A MÃO ESQUERDA DO MODELO contra o CONTROLE ESQUERDO REAL. */
    const maoE = G.XR.punho('left') || G.XR.mao('left');
    let handLReal = null, magwellMao = null;
    if (maoE) {
      maoE.updateWorldMatrix(true, false);
      const real = maoE.getWorldPosition(new T.Vector3());
      if (gun && gun.parts && gun.parts.handL) {
        handLReal = gun.parts.handL.getWorldPosition(new T.Vector3()).distanceTo(real);
      }
      if (gun && gun.parts && gun.parts.mag) {
        magwellMao = gun.parts.mag.getWorldPosition(new T.Vector3()).distanceTo(real);
      }
    }

    /* O pente-fantasma: está no grafo da cena? (nunca `visible` sozinho) */
    let penteNoGrafo = false, penteNaMaoEsq = false;
    const varrer = o => {
      if (o.name === 'xrPenteFantasma') {
        for (let n = o; n; n = n.parent) if (n === MP.scene) penteNoGrafo = true;
        for (let n = o; n; n = n.parent) if (n === maoE) penteNaMaoEsq = true;
      }
      for (const c of o.children) varrer(c);
    };
    varrer(MP.scene);

    amostra = {
      ads: e.ads, recarga: rec.estado, via: rec.via, penteNaMao: rec.penteNaMao, origem: rec.origem,
      recarregando: !!(gun && gun.reloading),
      mag: gun ? gun.mag : null, reserve: gun ? gun.reserve : null,
      magSize: gun ? gun.magSize : null,
      angCanoControle, gripNaPalma, handLReal, magwellMao,
      penteNoGrafo, penteNaMaoEsq,
      evento: G.XRArma.recargaEventos(),
    };
    return v;
  };

  window.__AR = {
    ler: () => amostra,
    embrulhar,
    diario: () => diario.slice(),
    limparDiario: () => { diario.length = 0; },
    mao: (x, y, z) => {
      const d = window.__xrEmulado;
      d.controllers.right.position.set(x, y, z);
      d.controllers.right.quaternion.set(0, 0, 0, 1);
    },
    maoE: (x, y, z) => {
      const d = window.__xrEmulado;
      d.controllers.left.position.set(x, y, z);
      d.controllers.left.quaternion.set(0, 0, 0, 1);
    },
    /* Leva a mão esquerda a uma distância PEDIDA do poço do carregador.

       POR DELTA, e isto não é estilo: `dev.controllers.left.position` está no
       ESPAÇO DE REFERÊNCIA da sessão (rig-local), e o poço está no MUNDO. A
       primeira versão deste ajudante escrevia a coordenada de mundo direto no
       controle e errava pelo deslocamento do rig — medido, 3,9 m de engano, e
       os dois casos que dependiam dele falharam apontando para o produto
       quando o defeito era da régua. Lendo a posição de MUNDO do objeto do
       controle e somando só o que FALTA, o deslocamento do rig se cancela. */
    maoEnoPoco: async (alvoDist, passos = 6) => {
      const dev = window.__xrEmulado;
      const gun = G.arsenal[G.gunIndex];
      for (let i = 0; i < passos; i++) {
        if (!gun.parts || !gun.parts.mag) break;
        const maoObj = G.XR.punho('left') || G.XR.mao('left');
        if (!maoObj) break;
        maoObj.updateWorldMatrix(true, false);
        const atual = maoObj.getWorldPosition(new T.Vector3());
        const poco = gun.parts.mag.getWorldPosition(new T.Vector3());
        const dir = new T.Vector3().subVectors(atual, poco);
        if (dir.lengthSq() < 1e-8) dir.set(0, -1, 0);
        dir.normalize();
        const alvo = poco.clone().addScaledVector(dir, alvoDist);
        const falta = alvo.sub(atual);
        const p = dev.controllers.left.position;
        dev.controllers.left.position.set(p.x + falta.x, p.y + falta.y, p.z + falta.z);
        await new Promise(r => setTimeout(r, 130));
      }
    },
    cabeca: (y = 1.70) => {
      const d = window.__xrEmulado;
      d.position.set(0, y, 0);
      d.quaternion.set(0, 0, 0, 1);
    },
    espera: ms => window.__A.espera(ms),
    municao: (mag, reserve) => {
      const g = G.arsenal[G.gunIndex];
      if (!g) return;
      if (mag !== undefined) g.mag = mag;
      if (reserve !== undefined) g.reserve = reserve;
    },
    recarregar: async () => {
      window.__A.botao('left', 'y-button', 1);
      await window.__A.espera(120);
      window.__A.botao('left', 'y-button', 0);
    },
    /* RECARGA POR GESTO: a mão de apoio no PEITO (`PEITO_OFF` = 0,45 m abaixo
       e 0,15 m à frente do olho, raio 0,25) com o grip esquerdo apertado.
       É o único caminho que planta o pente-fantasma na mão (2026-09-03): por
       BOTÃO a arma recarrega sozinha. Cabeça em (0; 1,70; 0) olhando -Z. */
    recarregarPorGesto: async () => {
      const dev = window.__xrEmulado;
      dev.controllers.left.position.set(0.0, 1.25, -0.15);
      dev.controllers.left.quaternion.set(0, 0, 0, 1);
      await window.__A.espera(120);
      window.__A.botao('left', 'squeeze', 1);
      await window.__A.espera(140);
      window.__A.botao('left', 'squeeze', 0);
      await window.__A.espera(80);
    },
    gatilho: async () => {
      window.__A.botao('right', 'trigger', 1);
      await window.__A.espera(90);
      window.__A.botao('right', 'trigger', 0);
      await window.__A.espera(320);   // acima do gate de 0,25 s do clique seco
    },
  };
  return true;
}

describe('a recarga é um gesto visível no headset',
  { skip: !CHROME && 'Chrome não encontrado' }, () => {
    let h;
    before(async () => {
      h = await bootEmVR(bootGame, { port: PORT });
      await h.play(instalarSonda);
      await h.play(() => window.__A.espera(900));
      const n = await h.play(() => window.__AR.embrulhar());
      assert.ok(n >= 2,
        `o diário de pulsos não conseguiu observar os dois atuadores (achou ${n}):` +
        ' sem instrumento calibrado nenhuma asserção de háptico vale');
    });
    after(async () => { if (h) await h.close(); });

    it('a INCLINAÇÃO da recarga existe na tela — e a arma não sai da mão', async () => {
      const r = await h.play(async () => {
        window.__AR.cabeca(1.70);
        window.__AR.mao(0.25, 1.20, -0.25);
        window.__AR.maoE(-0.30, 1.15, -0.20);
        window.__AR.municao(1, 150);
        await window.__AR.espera(500);
        const parado = window.__AR.ler();
        await window.__AR.recarregar();
        /* auge da inclinação: a coreografia sobe até ~0,16 de reloadK e cai a
           partir de 0,80; com reloadTime ~2 s, ~0,7 s está no platô */
        await window.__AR.espera(700);
        const auge = window.__AR.ler();
        await window.__AR.espera(2600);
        const depois = window.__AR.ler();
        return { parado, auge, depois };
      });
      const delta = r.auge.angCanoControle - r.parado.angCanoControle;
      console.log(`  parado → cano×controle ${f3(r.parado.angCanoControle)}°` +
        ` · gripR↔palma ${f3(r.parado.gripNaPalma)} m`);
      console.log(`  AUGE   → cano×controle ${f3(r.auge.angCanoControle)}°` +
        ` (Δ ${delta >= 0 ? '+' : ''}${f3(delta)}°) · gripR↔palma ${f3(r.auge.gripNaPalma)} m` +
        ` · estado ${r.auge.recarga}`);
      console.log(`  depois → cano×controle ${f3(r.depois.angCanoControle)}°` +
        ` · recarregando ${r.depois.recarregando} · mag ${r.depois.mag}/${r.depois.reserve}`);
      assert.equal(r.auge.recarregando, true, 'o cenário não chegou a recarregar');
      /* O NÚMERO QUE IMPORTA: antes desta rodada o `tilt` era apagado por
         `aplicar()` e este delta era ZERO — o gesto não existia no headset. */
      assert.ok(delta >= 5,
        `a inclinação da recarga tinha de aparecer na tela: o cano só mudou ${f3(delta)}°` +
        ` em relação ao controle (piso 5°)`);
      /* B1 NÃO PODE SER PAGO PELO GESTO: a inclinação é em torno da PALMA. */
      assert.ok(r.auge.gripNaPalma <= 0.03,
        `a inclinação desgrudou a arma da mão: gripR↔palma deu ${f3(r.auge.gripNaPalma)} m` +
        ` no auge (teto 0,030)`);
      /* e volta ao normal quando acaba */
      assert.ok(Math.abs(r.depois.angCanoControle - r.parado.angCanoControle) <= 1.0,
        `terminada a recarga o cano tinha de voltar: ${f3(r.parado.angCanoControle)}° →` +
        ` ${f3(r.depois.angCanoControle)}°`);
    });

    it('M6 — o pente NÃO encaixa com a mão longe: a `via` denuncia', async () => {
      const r = await h.play(async () => {
        window.__AR.cabeca(1.70);
        window.__AR.mao(0.25, 1.20, -0.25);
        window.__AR.municao(1, 150);
        await window.__AR.espera(400);
        await window.__AR.recarregarPorGesto();    // pede no PEITO: é o caminho do pente na mão
        await window.__AR.maoEnoPoco(1.00);        // a um metro do poço
        await window.__AR.espera(300);
        /* segura a mão longe durante a recarga inteira */
        for (let i = 0; i < 12; i++) { await window.__AR.maoEnoPoco(1.00, 1); }
        await window.__AR.espera(900);
        const durante = window.__AR.ler();
        await window.__AR.espera(2200);
        return { durante, evento: durante.evento };
      });
      console.log(`  mão a 1,00 m → estado ${r.durante.recarga} · via ${r.durante.via}` +
        ` · mão↔poço ${f3(r.durante.magwellMao)} m`);
      console.log(`  evento congelado → ${JSON.stringify(r.evento)}`);
      assert.ok(r.evento, 'nenhuma transição foi registrada: o cenário não mediu nada');
      assert.equal(r.evento.via, 'tempo',
        `com a mão a ${f3(r.durante.magwellMao)} m do poço o pente NÃO podia entrar por gesto,` +
        ` e a via registrada foi '${r.evento.via}'`);
      assert.ok(r.evento.distancia > 0.5,
        `a distância congelada na transição tinha de ser grande: deu ${f3(r.evento.distancia)} m`);
    });

    it('M6 — com a mão NO poço, o pente entra por GESTO, e a distância prova', async () => {
      const r = await h.play(async () => {
        window.__AR.cabeca(1.70);
        window.__AR.mao(0.25, 1.20, -0.25);
        window.__AR.municao(1, 150);
        await window.__AR.espera(400);
        await window.__AR.recarregarPorGesto();
        /* 2 passos (≈0,26 s): a janela `aguardando-pente` vai de 18 % a 70 %
           da recarga, e a mão precisa estar a 0,60 m ANTES de ela fechar */
        await window.__AR.maoEnoPoco(0.60, 2);
        await window.__AR.espera(200);
        const esperando = window.__AR.ler();
        /* o jogador leva a mão ao poço */
        for (let i = 0; i < 8; i++) await window.__AR.maoEnoPoco(0.08, 1);
        await window.__AR.espera(400);
        const dep = window.__AR.ler();
        await window.__AR.espera(2200);
        return { esperando, dep, evento: dep.evento };
      });
      console.log(`  esperando → estado ${r.esperando.recarga} · origem ${r.esperando.origem} · pente na mão` +
        ` ${r.esperando.penteNaMao} · no grafo ${r.esperando.penteNoGrafo}` +
        ` · preso à mão esquerda ${r.esperando.penteNaMaoEsq}`);
      console.log(`  encaixou  → estado ${r.dep.recarga} · via ${r.dep.via}` +
        ` · mão↔poço ${f3(r.dep.magwellMao)} m`);
      console.log(`  evento congelado → ${JSON.stringify(r.evento)}`);
      assert.equal(r.esperando.recarga, 'aguardando-pente',
        `o cenário não chegou à espera do pente (estado ${r.esperando.recarga})`);
      assert.ok(r.esperando.penteNoGrafo,
        'o pente-fantasma tinha de estar no GRAFO DA CENA enquanto o jogador o carrega');
      assert.ok(r.esperando.penteNaMaoEsq,
        'o pente-fantasma tinha de estar preso à MÃO DE APOIO, não flutuando');
      assert.ok(r.evento, 'nenhuma transição foi registrada');
      assert.equal(r.evento.via, 'gesto',
        `com a mão no poço o pente tinha de entrar por GESTO: veio por '${r.evento.via}'`);
      assert.ok(r.evento.distancia <= 0.12,
        `a distância CONGELADA na transição tinha de ser ≤ 0,12 m: deu ${f3(r.evento.distancia)} m`);
    });

    it('a mão esquerda do MODELO segue o controle real, e não a arma', async () => {
      const r = await h.play(async () => {
        window.__AR.cabeca(1.70);
        window.__AR.mao(0.25, 1.20, -0.25);
        window.__AR.municao(1, 150);
        await window.__AR.espera(400);
        await window.__AR.recarregarPorGesto();
        await window.__AR.maoEnoPoco(0.45, 2);
        await window.__AR.espera(250);
        const durante = window.__AR.ler();
        await window.__AR.espera(2600);
        return { durante };
      });
      console.log(`  durante a recarga → mão do MODELO ↔ controle REAL` +
        ` ${f3(r.durante.handLReal)} m · estado ${r.durante.recarga}`);
      assert.equal(r.durante.recarga, 'aguardando-pente',
        `o cenário não chegou à fase em que a mão carrega o pente (${r.durante.recarga})`);
      assert.ok(r.durante.handLReal !== null, 'sem mão do modelo não há o que medir');
      /* Antes desta rodada a mão do modelo ficava colada no guarda-mão, e a
         mão real do jogador estava a ~0,45 m dali. */
      assert.ok(r.durante.handLReal <= 0.10,
        `a mão esquerda do modelo tinha de estar EM CIMA do controle real:` +
        ` ficou a ${f3(r.durante.handLReal)} m`);
    });

    it('CASO RUIM — atirar sem munição não vira tiro, e o pulso é o do vazio', async () => {
      const r = await h.play(async () => {
        window.__AR.cabeca(1.70);
        window.__AR.mao(0.25, 1.20, -0.25);
        /* reserva ZERO: sem ela o clique seco dispara uma recarga e o cenário
           mediria outra coisa */
        window.__AR.municao(3, 0);
        await window.__AR.espera(500);
        window.__AR.limparDiario();
        const antes = window.__AR.ler();
        for (let i = 0; i < 8; i++) await window.__AR.gatilho();
        await window.__AR.espera(300);
        return { antes, dep: window.__AR.ler(), diario: window.__AR.diario() };
      });
      const vazios = r.diario.filter(p => Math.abs(p.v - 0.20) < 0.005 && p.d === 12);
      const tiros = r.diario.filter(p => p.v > 0.24 && p.d > 12);
      console.log(`  antes → mag ${r.antes.mag}/${r.antes.reserve} · depois → mag` +
        ` ${r.dep.mag}/${r.dep.reserve}`);
      console.log(`  pulsos: ${r.diario.length} no total · tiro ${tiros.length}` +
        ` · vazio ${vazios.length} · mãos ${JSON.stringify(r.diario.map(p => p.mao))}`);
      /* A MEDIDA DA CAUSA, imune a qualquer coisa que eu tenha escrito: `mag`
         só cai dentro de `fire()`, e é o game.js quem o escreve. Oito cliques
         com três balas têm de gastar três, nunca oito, e nunca menos que zero. */
      assert.equal(r.dep.mag, 0,
        `oito cliques com 3 balas tinham de terminar em 0 no pente: deu ${r.dep.mag}`);
      assert.equal(r.dep.reserve, 0, 'a reserva não podia aparecer do nada');
      assert.equal(tiros.length, 3,
        `só as 3 balas do pente podiam virar tiro: saíram ${tiros.length} pulsos de tiro`);
      assert.equal(vazios.length, 5,
        `os 5 cliques sem bala tinham de dar 5 cliques secos: saíram ${vazios.length}`);
      /* e o pulso do vazio é mais fraco que o do tiro mais fraco — confundir os
         dois faria o jogador continuar puxando o gatilho achando que atira */
      const menorTiro = Math.min(...tiros.map(p => p.v));
      assert.ok(0.20 < menorTiro,
        `o clique seco (0,20) tinha de ser mais fraco que o tiro mais leve (${f3(menorTiro)})`);
      assert.ok(vazios.every(p => p.mao === 'right'),
        `o clique seco é sentido pela mão da ARMA: saiu em ${JSON.stringify(vazios.map(p => p.mao))}`);
    });

    it('recarga por BOTÃO não planta pente na mão — a arma recarrega sozinha (o "cartucho fora do lugar")', async () => {
      /* O dono, no aparelho (2026-09-03): "o cartucho da arma fora do lugar".
         Fotografado no kit: Y recém-apertado, estado `aguardando-pente`,
         `xrPenteFantasma` no grafo preso à mão esquerda, pente do modelo
         19 cm abaixo do poço. Por botão nada pode aparecer na mão; a recarga
         termina pelo relógio e a munição entra. Reinjetando
         `recPenteNaMao = true` sem olhar a origem, este caso morre. */
      const r = await h.play(async () => {
        window.__AR.cabeca(1.70);
        window.__AR.mao(0.25, 1.20, -0.25);
        window.__AR.maoE(-0.25, 1.20, -0.25);      // mão de apoio longe do peito
        window.__AR.municao(1, 150);
        await window.__AR.espera(400);
        await window.__AR.recarregar();            // Y
        await window.__AR.espera(700);             // além de FASE_PENTE_FORA
        const durante = window.__AR.ler();
        await window.__AR.espera(2600);
        return { durante, fim: window.__AR.ler() };
      });
      console.log(`  botão → estado ${r.durante.recarga} · origem ${r.durante.origem}` +
        ` · pente na mão ${r.durante.penteNaMao} · no grafo ${r.durante.penteNoGrafo}`);
      console.log(`  fim   → mag ${r.fim.mag}/${r.fim.reserve} · recarregando ${r.fim.recarregando}`);
      assert.equal(r.durante.recarregando, true, 'o cenário não chegou a recarregar');
      assert.equal(r.durante.origem, 'botao', `a origem tinha de ser botão: veio '${r.durante.origem}'`);
      assert.equal(r.durante.penteNaMao, false, 'a recarga por BOTÃO plantou um pente na mão de apoio');
      assert.equal(r.durante.penteNoGrafo, false, 'o pente-fantasma apareceu no grafo numa recarga por botão');
      assert.equal(r.fim.recarregando, false, 'a recarga por botão não terminou');
      assert.ok(r.fim.mag > 1, `a munição não entrou: pente ${r.fim.mag}`);
    });

    it('o háptico da recarga toca as DUAS mãos, cada uma no seu papel (B6)', async () => {
      const r = await h.play(async () => {
        window.__AR.cabeca(1.70);
        window.__AR.mao(0.25, 1.20, -0.25);
        window.__AR.municao(1, 150);
        await window.__AR.espera(400);
        window.__AR.limparDiario();
        await window.__AR.recarregarPorGesto();
        await window.__AR.maoEnoPoco(0.60);
        await window.__AR.espera(500);
        for (let i = 0; i < 8; i++) await window.__AR.maoEnoPoco(0.08, 1);
        await window.__AR.espera(2400);
        return { diario: window.__AR.diario(), fim: window.__AR.ler() };
      });
      const esq = r.diario.filter(p => p.mao === 'left');
      const dir = r.diario.filter(p => p.mao === 'right');
      console.log(`  pulsos na recarga: ${r.diario.map(p =>
        `${p.mao}/${p.v.toFixed(2)}/${p.d}ms`).join('  ')}`);
      console.log(`  fim → mag ${r.fim.mag}/${r.fim.reserve} · estado ${r.fim.recarga}`);
      assert.ok(esq.length >= 1,
        'a mão de APOIO é quem busca e leva o pente: ela tinha de sentir pelo menos um pulso');
      assert.ok(dir.length >= 1,
        'a mão da ARMA sente o pente assentando e o ferrolho: tinha de sentir pelo menos um pulso');
      /* Meta: "avoid long or overlapping haptic effects". Dois pulsos na MESMA
         mão não podem se sobrepor no tempo. */
      for (const mao of ['left', 'right']) {
        const seq = r.diario.filter(p => p.mao === mao).sort((a, b) => a.t - b.t);
        for (let i = 1; i < seq.length; i++) {
          const folga = seq[i].t - (seq[i - 1].t + seq[i - 1].d);
          assert.ok(folga >= 0,
            `dois pulsos se sobrepuseram na mão ${mao}: o de ${seq[i - 1].d} ms foi cortado` +
            ` ${f3(-folga / 1000)} s antes do fim`);
        }
      }
      assert.ok(r.diario.every(p => p.d >= 8 && p.d <= 250),
        `toda duração tinha de ficar em [8, 250] ms: ${JSON.stringify(r.diario.map(p => p.d))}`);
    });
  });
