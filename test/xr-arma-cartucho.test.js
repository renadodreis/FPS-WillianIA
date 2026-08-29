/* ================================================================
   A ESCOPETA CARREGA CARTUCHO A CARTUCHO — COM A MÃO, NÃO COM O RELÓGIO.

   O DEFEITO, medido no produto antes desta rodada: a rodada anterior entregou
   a recarga por GESTO para as armas de pente (mão de apoio ao peito, pente
   levado ao poço), e a ESCOPETA ficou de fora. Ela carrega cartucho a cartucho
   por `gun.reloadPerShell`, e esse caminho é puro relógio: o `updateReload` do
   game.js credita um cartucho a cada `reloadPerShell` segundos, aconteça o que
   acontecer com as mãos do jogador. No headset isso é um pente-fantasma sem
   porta de carregamento — o jogador vê cartuchos entrando sozinhos, com a mão
   de apoio parada a um metro da arma.

   O QUE ESTE ARQUIVO MEDE, e em que unidade:
     · a MUNIÇÃO (`mag`, `reserve`) depois de três recargas inteiras de relógio
       com a mão de apoio a 1,00 m da porta de carregamento — é o defeito, em
       número de cartuchos;
     · a distância CONGELADA, em metros, entre a mão de apoio e a PORTA DE
       CARREGAMENTO no frame exato em que cada cartucho é creditado;
     · o INTERVALO, em segundos, entre dois cartuchos consecutivos, contra
       `gun.reloadPerShell` — o gesto não pode ser mais rápido que o relógio,
       senão VR vira vantagem competitiva (referência §4.1 D5);
     · a munição no cancelamento: o parcial FICA, e o débito de `reserve` bate
       exatamente com os cartuchos creditados;
     · o háptico por cartucho: mão, intensidade e duração de cada pulso.

   ÂNCORA INDEPENDENTE. A porta de carregamento é a âncora `ejection` do perfil
   da arma (js/weaponrig.js), que é geometria do MODELO DESENHADO — na escopeta
   procedural ela é literalmente a caixinha preta que buildShotgun desenha em
   (0.04, -0.01, 0.04) e chama de "porta de carregamento". Ela não é gerada por
   js/xr/xrweapon.js, que é o código sob teste. A régua e a leitura não saem da
   mesma caneta.

   POR QUE NÃO PASSA POR ACIDENTE (lista do CLAUDE.md):
     · formato 9 (cenário que não exercita o limiar): cada caso de bloqueio vem
       colado com o COMPLEMENTAR — mesma arma, mesma munição, mesmos segundos,
       só que com a mão CHEGANDO à porta. Um mede que o relógio não carrega
       sozinho, o outro mede que o gesto carrega.
     · formato 1 (asserção que não pode falhar): as grandezas são munição e
       distância, e as duas podem cair para qualquer lado. O caso do intervalo
       compara com `gun.reloadPerShell`, que é do game.js, não deste módulo.
     · formato 4 (o teste dirigir o produto): nada aqui chama `updateReload`
       nem credita munição. O teste move CONTROLE e aperta BOTÃO; quem decide é
       o jogo, e o que se lê é `gun.mag`/`gun.reserve`.

   PORTA 3676 (só deste arquivo).
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const { CHROME, bootGame } = require('./helpers/harness');
const { bootEmVR } = require('./helpers/iwer');

const PORT = 3676;
const ESCOPETA = 1;                 // ESCOPETA "TROVÃO": magSize 6, reloadTime 2,3 s
const f3 = v => (typeof v === 'number' && Number.isFinite(v) ? v.toFixed(3) : '?');

function instalarSonda() {
  const G = window.__game, MP = window.__MP, T = MP.THREE;
  let amostra = null;

  /* DIÁRIO DE PULSOS — o registro do IWER guarda só o ÚLTIMO por atuador, e
     uma recarga de escopeta tem CINCO eventos. Ler o último mediria o último,
     não a sequência. O embrulho ANOTA e repassa: não chama nada, não decide
     nada, não substitui nada. */
  const diario = [];
  function embrulhar() {
    const s = MP.renderer.xr.getSession && MP.renderer.xr.getSession();
    if (!s) return 0;
    let n = 0;
    for (const f of Array.from(s.inputSources)) {
      const a = f.gamepad && f.gamepad.hapticActuators && f.gamepad.hapticActuators[0];
      if (!a || a.__espiado) continue;
      const orig = a.pulse.bind(a);
      a.pulse = (v, d) => { diario.push({ mao: f.handedness, v, d, t: performance.now() }); return orig(v, d); };
      a.__espiado = true;
      n++;
    }
    return n;
  }

  /* A PORTA DE CARREGAMENTO, do PERFIL DA ARMA (modelo desenhado). */
  function portaMundo() {
    const gun = G.arsenal[G.gunIndex];
    const p = G.WeaponRig.inspect ? G.WeaponRig.inspect(G.gunIndex) : null;
    const a = p && p.anchors && p.anchors.ejection;
    if (!gun || !gun.group || !a) return null;
    gun.group.updateWorldMatrix(true, false);
    return gun.group.localToWorld(new T.Vector3(a[0], a[1], a[2]));
  }

  function maoEsqObj() { return G.XR.punho('left') || G.XR.mao('left'); }
  function maoEsqMundo() {
    const o = maoEsqObj();
    if (!o) return null;
    o.updateWorldMatrix(true, false);
    return o.getWorldPosition(new T.Vector3());
  }

  /* O DIÁRIO DE MUNIÇÃO. Um cartucho creditado é uma BORDA de `gun.mag`, e a
     72 Hz ela escapa de qualquer amostragem externa: por isso ele é gravado
     DENTRO do laço de render, no frame em que acontece, com a distância da mão
     à porta CONGELADA nesse mesmo instante. */
  const cartuchos = [];
  let magAntes = null, gunAntes = null;

  const rOrig = MP.renderer.render.bind(MP.renderer);
  MP.renderer.render = (cena, cam) => {
    const v = rOrig(cena, cam);
    const gun = G.arsenal[G.gunIndex];
    const rec = G.XRArma.recarga ? G.XRArma.recarga() : {};
    const porta = portaMundo();
    const mao = maoEsqMundo();
    const dPorta = (porta && mao) ? mao.distanceTo(porta) : null;

    if (gun !== gunAntes) { gunAntes = gun; magAntes = gun ? gun.mag : null; }
    if (gun && magAntes !== null && gun.mag > magAntes) {
      cartuchos.push({
        n: cartuchos.length + 1, mag: gun.mag, reserve: gun.reserve,
        dPorta, t: performance.now() / 1000,
        estado: rec.estado || null, origem: rec.origem || null,
      });
    }
    if (gun) magAntes = gun.mag;

    amostra = {
      arma: G.gunIndex,
      mag: gun ? gun.mag : null, reserve: gun ? gun.reserve : null,
      magSize: gun ? gun.magSize : null,
      recarregando: !!(gun && gun.reloading),
      reloadPerShell: gun ? (gun.reloadPerShell || null) : null,
      reloadTime: gun ? gun.reloadTime : null,
      temPump: !!(gun && gun.parts && gun.parts.pump),
      dPorta, portaOk: !!porta,
      recarga: rec.estado || null, via: rec.via || null,
      origem: rec.origem || null,
      porCartucho: rec.porCartucho === undefined ? null : rec.porCartucho,
      cartuchosMod: rec.cartuchos === undefined ? null : rec.cartuchos,
      frames: (amostra ? amostra.frames : 0) + 1,
    };
    return v;
  };

  window.__AC = {
    ler: () => amostra,
    embrulhar,
    diario: () => diario.slice(),
    limparDiario: () => { diario.length = 0; },
    cartuchos: () => cartuchos.slice(),
    limparCartuchos: () => { cartuchos.length = 0; },
    espera: ms => window.__A.espera(ms),
    /* espera por CONDIÇÃO com teto — sob a carga da suíte o boot não chega ao
       limiar em tempo fixo, e isso já classificou dois arquivos como regressão */
    ate: async (cond, tetoMs = 8000) => {
      const t0 = performance.now();
      while (performance.now() - t0 < tetoMs) {
        if (cond()) return true;
        await window.__A.espera(50);
      }
      return false;
    },
    cabeca: (y = 1.70) => {
      const d = window.__xrEmulado;
      d.position.set(0, y, 0);
      d.quaternion.set(0, 0, 0, 1);
    },
    mao: (x, y, z) => {
      const d = window.__xrEmulado;
      d.controllers.right.position.set(x, y, z);
      d.controllers.right.quaternion.set(0, 0, 0, 1);
    },
    /* LEVA A MÃO ESQUERDA A UM PONTO DE MUNDO, POR DELTA.
       `dev.controllers.left.position` está no espaço de referência da SESSÃO
       (rig-local) e o alvo está no MUNDO: escrever a coordenada direto erra
       pelo deslocamento do rig — 3,9 m de engano medidos numa versão anterior
       deste ajudante, com dois casos falhando contra o produto por defeito da
       régua. Lendo a posição de MUNDO do objeto e somando só o que FALTA, o
       deslocamento se cancela. */
    levarE: async (alvoFn, passos = 3, ms = 70) => {
      const dev = window.__xrEmulado;
      for (let i = 0; i < passos; i++) {
        const alvo = alvoFn();
        const atual = maoEsqMundo();
        if (!alvo || !atual) break;
        const falta = alvo.clone().sub(atual);
        const p = dev.controllers.left.position;
        dev.controllers.left.position.set(p.x + falta.x, p.y + falta.y, p.z + falta.z);
        await window.__A.espera(ms);
      }
      return amostra ? amostra.dPorta : null;
    },
    /* a MÃO na porta de carregamento, a `d` metros dela, na direção de quem
       está de pé ao lado da arma (para baixo e para fora) */
    naPorta: (d) => () => {
      const porta = portaMundo();
      if (!porta) return null;
      return porta.clone().add(new T.Vector3(0.4, -0.6, 0.2).normalize().multiplyScalar(d));
    },
    /* a MÃO no peito: é a zona que PEDE a recarga (js/xr/xrweapon.js PEITO_OFF) */
    noPeito: () => {
      const cab = new T.Vector3().setFromMatrixPosition(MP.camera.matrixWorld);
      const yaw = G.yawDaVista();
      return new T.Vector3(0, -0.45, -0.15).applyAxisAngle(new T.Vector3(0, 1, 0), yaw).add(cab);
    },
    grip: (v) => window.__A.botao('left', 'squeeze', v),
    botaoY: async () => {
      window.__A.botao('left', 'y-button', 1);
      await window.__A.espera(120);
      window.__A.botao('left', 'y-button', 0);
    },
    gatilho: async () => {
      window.__A.botao('right', 'trigger', 1);
      await window.__A.espera(90);
      window.__A.botao('right', 'trigger', 0);
      await window.__A.espera(320);
    },
    /* PREPARO, não medição: arma, munição e botões num estado conhecido. */
    preparar: async (mag = 1, reserve = 30) => {
      window.__A.botao('left', 'squeeze', 0);
      window.__A.botao('left', 'y-button', 0);
      window.__A.botao('right', 'trigger', 0);
      G.switchWeapon(1);   // ESCOPETA "TROVÃO" (o índice é literal: esta função roda na PÁGINA)
      const g = G.arsenal[G.gunIndex];
      g.reloading = false;
      g.mag = mag; g.reserve = reserve;
      cartuchos.length = 0; diario.length = 0;
      await window.__A.espera(260);
    },
  };
  return true;
}

describe('a escopeta carrega cartucho a cartucho COM A MÃO, não com o relógio',
  { skip: !CHROME && 'Chrome não encontrado' }, () => {
    let h;
    before(async () => {
      h = await bootEmVR(bootGame, { port: PORT });
      await h.play(instalarSonda);
      /* cena viva por CONDIÇÃO, nunca por tempo fixo */
      const vivo = await h.play(() => window.__AC.ate(
        () => window.__AC.ler() && window.__AC.ler().frames > 30, 20000));
      assert.ok(vivo, 'a cena não chegou a 30 frames: nada do que este arquivo mede existe ainda');
      const n = await h.play(() => window.__AC.embrulhar());
      assert.ok(n >= 2,
        `o diário de pulsos não observou os dois atuadores (achou ${n}): ` +
        'sem instrumento calibrado nenhuma asserção de háptico vale');
      const arma = await h.play(async () => {
        window.__AC.cabeca(1.70);
        window.__AC.mao(0.25, 1.20, -0.25);
        await window.__AC.preparar(1, 30);
        return window.__AC.ler();
      });
      assert.equal(arma.arma, ESCOPETA, `a arma na mão não é a escopeta (${arma.arma})`);
      assert.ok(arma.temPump, 'a arma escolhida não tem `parts.pump`: não é a que recarrega por cartucho');
      assert.ok(arma.portaOk, 'a âncora `ejection` do perfil não foi encontrada: a régua deste arquivo não existe');
    });
    after(async () => { if (h) await h.close(); });

    it('com a mão A UM METRO da porta, NENHUM cartucho entra sozinho', async () => {
      const r = await h.play(async () => {
        await window.__AC.preparar(1, 30);
        await window.__AC.levarE(window.__AC.naPorta(1.00), 4);
        const antes = window.__AC.ler();
        /* pede a recarga pelo BOTÃO do peito: a mão vai ao peito, aperta o
           grip, e VOLTA para longe da porta. É o gesto de abrir a arma. */
        await window.__AC.levarE(window.__AC.noPeito, 3);
        window.__AC.grip(1);
        await window.__AC.espera(160);
        window.__AC.grip(0);
        await window.__AC.levarE(window.__AC.naPorta(1.00), 4);
        const inicio = window.__AC.ler();
        /* TRÊS recargas inteiras de relógio (3 × 2,3 s) e uma folga */
        await window.__AC.espera(7500);
        const fim = window.__AC.ler();
        return { antes, inicio, fim, cartuchos: window.__AC.cartuchos() };
      });
      assert.ok(r.inicio.recarregando || r.fim.recarregando || r.cartuchos.length,
        'a recarga nem começou: o cenário não exercita o limiar (formato 9), nada a medir');
      const entraram = r.fim.mag - r.antes.mag;
      assert.equal(entraram, 0,
        `com a mão de apoio a ${f3(r.inicio.dPorta)} m da porta de carregamento, ` +
        `${entraram} cartucho(s) entraram sozinhos em 7,5 s (mag ${r.antes.mag}→${r.fim.mag}, ` +
        `reserve ${r.antes.reserve}→${r.fim.reserve}). A recarga da escopeta é RELÓGIO, não gesto — ` +
        `o jogador vê cartuchos entrando com a mão parada a um metro da arma.`);
      assert.equal(r.fim.reserve, r.antes.reserve,
        `a reserva foi debitada sem gesto nenhum: ${r.antes.reserve}→${r.fim.reserve}`);
    });

    it('e o COMPLEMENTAR: a mão CHEGANDO à porta carrega um cartucho por chegada', async () => {
      /* Sem este caso o de cima passaria com a recarga da escopeta inteira
         quebrada — asserção que não pode falhar, formato 1 da lista. */
      const r = await h.play(async () => {
        await window.__AC.preparar(1, 30);
        await window.__AC.levarE(window.__AC.noPeito, 3);
        window.__AC.grip(1);
        await window.__AC.espera(160);
        window.__AC.grip(0);
        const inicio = window.__AC.ler();
        window.__AC.limparCartuchos();
        /* TRÊS chegadas à porta, com a mão SAINDO entre elas (é o rearme: sem
           sair, ficar na porta a 72 Hz pediria um cartucho por frame) */
        for (let i = 0; i < 3; i++) {
          await window.__AC.levarE(window.__AC.naPorta(0.05), 3);
          await window.__AC.espera(300);
          await window.__AC.levarE(window.__AC.naPorta(0.45), 3);
          await window.__AC.espera(300);
        }
        const fim = window.__AC.ler();
        return { inicio, fim, cartuchos: window.__AC.cartuchos() };
      });
      assert.ok(r.cartuchos.length >= 3,
        `três chegadas à porta creditaram ${r.cartuchos.length} cartucho(s) ` +
        `(mag ${r.inicio.mag}→${r.fim.mag}): o gesto não carrega`);
      for (const c of r.cartuchos.slice(0, 3)) {
        assert.ok(c.dPorta !== null && c.dPorta <= 0.14,
          `o cartucho ${c.n} foi creditado com a mão a ${f3(c.dPorta)} m da porta ` +
          '— acima do limiar, ou seja, o gesto não é exigido');
      }
    });

    it('a mão PARADA na porta carrega UM cartucho, não a escopeta inteira', async () => {
      /* É o que o rearme por histerese compra, e sem ele o gesto some: descansar
         a mão na porta encheria o tubo sozinho, que é o MESMO defeito do
         relógio com um passo a mais. O piso de cadência não segura este caso —
         ele limita a TAXA, não o número de chegadas. */
      const r = await h.play(async () => {
        await window.__AC.preparar(1, 30);
        await window.__AC.levarE(window.__AC.noPeito, 3);
        window.__AC.grip(1);
        await window.__AC.espera(160);
        window.__AC.grip(0);
        window.__AC.limparCartuchos();
        await window.__AC.levarE(window.__AC.naPorta(0.05), 3);
        /* PARADA na porta por 3,0 s — mais que a recarga inteira (2,3 s) e
           mais de seis pisos de cadência (0,46 s) */
        await window.__AC.espera(3000);
        const fim = window.__AC.ler();
        return { fim, cartuchos: window.__AC.cartuchos() };
      });
      assert.equal(r.cartuchos.length, 1,
        `a mão parada a ${f3(r.fim.dPorta)} m da porta carregou ${r.cartuchos.length} cartucho(s) ` +
        `em 3,0 s (mag ${r.fim.mag}/${r.fim.magSize}): sem rearme, descansar a mão na porta ` +
        'enche a escopeta sozinho — é o relógio de novo, com um passo a mais');
    });

    it('o gesto NÃO é mais rápido que o relógio (VR não pode virar vantagem)', async () => {
      const r = await h.play(async () => {
        await window.__AC.preparar(1, 30);
        await window.__AC.levarE(window.__AC.noPeito, 3);
        window.__AC.grip(1);
        await window.__AC.espera(160);
        window.__AC.grip(0);
        window.__AC.limparCartuchos();
        /* martelando a porta o mais rápido que o ajudante consegue */
        for (let i = 0; i < 12; i++) {
          await window.__AC.levarE(window.__AC.naPorta(0.05), 2, 40);
          await window.__AC.levarE(window.__AC.naPorta(0.40), 2, 40);
        }
        const fim = window.__AC.ler();
        return { fim, cartuchos: window.__AC.cartuchos() };
      });
      assert.ok(r.cartuchos.length >= 2,
        `só ${r.cartuchos.length} cartucho(s) creditados: sem dois não há intervalo para medir`);
      const piso = r.fim.reloadPerShell || (r.fim.reloadTime / 5);
      for (let i = 1; i < r.cartuchos.length; i++) {
        const dt = r.cartuchos[i].t - r.cartuchos[i - 1].t;
        assert.ok(dt >= piso * 0.9,
          `cartuchos ${i} e ${i + 1} entraram com ${f3(dt)} s de intervalo, ` +
          `abaixo do piso de ${f3(piso)} s (gun.reloadPerShell) — martelar a porta recarrega ` +
          'mais rápido que o desktop, e isso é vantagem competitiva em VR');
      }
    });

    it('cancelar no meio MANTÉM o parcial, e a reserva bate com os cartuchos', async () => {
      const r = await h.play(async () => {
        await window.__AC.preparar(1, 30);
        const antes = window.__AC.ler();
        await window.__AC.levarE(window.__AC.noPeito, 3);
        window.__AC.grip(1);
        await window.__AC.espera(160);
        window.__AC.grip(0);
        window.__AC.limparCartuchos();
        for (let i = 0; i < 2; i++) {
          await window.__AC.levarE(window.__AC.naPorta(0.05), 3);
          await window.__AC.espera(300);
          await window.__AC.levarE(window.__AC.naPorta(0.45), 3);
          await window.__AC.espera(300);
        }
        const meio = window.__AC.ler();
        await window.__AC.gatilho();          // atirar CANCELA a recarga (mantém o parcial)
        await window.__AC.espera(400);
        const depois = window.__AC.ler();
        return { antes, meio, depois, cartuchos: window.__AC.cartuchos() };
      });
      const n = r.cartuchos.length;
      assert.ok(n >= 1, 'nenhum cartucho entrou: nada a cancelar');
      assert.equal(r.meio.mag, r.antes.mag + n,
        `mag deveria ser ${r.antes.mag} + ${n} = ${r.antes.mag + n}, veio ${r.meio.mag}`);
      assert.equal(r.meio.reserve, r.antes.reserve - n,
        `reserve deveria ser ${r.antes.reserve} − ${n} = ${r.antes.reserve - n}, veio ${r.meio.reserve}`);
      assert.equal(r.depois.recarregando, false,
        'atirar não cancelou a recarga da escopeta');
      assert.equal(r.depois.mag, r.meio.mag - 1,
        `o parcial não sobreviveu ao cancelamento: mag ${r.meio.mag}→${r.depois.mag} ` +
        '(o tiro come UM, o cancelamento não pode comer o resto)');
    });

    it('cada cartucho tem HÁPTICO próprio, na mão de apoio', async () => {
      const r = await h.play(async () => {
        await window.__AC.preparar(1, 30);
        await window.__AC.levarE(window.__AC.noPeito, 3);
        window.__AC.grip(1);
        await window.__AC.espera(160);
        window.__AC.grip(0);
        window.__AC.limparCartuchos();
        window.__AC.limparDiario();
        for (let i = 0; i < 3; i++) {
          await window.__AC.levarE(window.__AC.naPorta(0.05), 3);
          await window.__AC.espera(300);
          await window.__AC.levarE(window.__AC.naPorta(0.45), 3);
          await window.__AC.espera(300);
        }
        return { cartuchos: window.__AC.cartuchos(), diario: window.__AC.diario() };
      });
      const n = r.cartuchos.length;
      assert.ok(n >= 2, `só ${n} cartucho(s): sem sequência não há háptico por cartucho para medir`);
      /* o pulso do cartucho é o da mão de APOIO (esquerda): é ela que leva o
         cartucho à porta. Ver a tabela de js/xr/xrhaptics.js. */
      const esq = r.diario.filter(p => p.mao === 'left');
      assert.ok(esq.length >= n,
        `${n} cartuchos creditados e só ${esq.length} pulso(s) na mão de apoio: ` +
        `cartucho sem háptico é cartucho invisível (diário: ${JSON.stringify(r.diario.slice(0, 12))})`);
      for (const p of esq) {
        assert.ok(p.d >= 8 && p.d <= 250,
          `pulso de ${p.d} ms fora da faixa [8, 250] do vocabulário`);
        assert.ok(p.v > 0 && p.v <= 1, `intensidade ${p.v} fora de (0, 1]`);
      }
    });

    it('o BOTÃO continua carregando pelo relógio — acessibilidade não perde corrida', async () => {
      /* Referência §4.1 D5: os três caminhos gastam o MESMO tempo. Quem não
         consegue fazer o gesto aperta Y e a escopeta enche na cadência de
         sempre; o que não pode é o gesto ser mais rápido (caso acima). */
      const r = await h.play(async () => {
        await window.__AC.preparar(1, 30);
        await window.__AC.levarE(window.__AC.naPorta(1.00), 4);
        const antes = window.__AC.ler();
        await window.__AC.botaoY();
        await window.__AC.espera(3000);
        const fim = window.__AC.ler();
        return { antes, fim };
      });
      assert.ok(r.fim.mag > r.antes.mag,
        `o caminho do BOTÃO parou de carregar a escopeta (mag ${r.antes.mag}→${r.fim.mag} ` +
        `com a mão a ${f3(r.antes.dPorta)} m): a correção do gesto comeu a acessibilidade`);
    });
  });
