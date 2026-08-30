/* ================================================================
   GRANADA E KIT MÉDICO POR GESTO CORPORAL — o radial perdeu o gatilho
   esquerdo para o ADS (Rodada 16, `42ebcc8`) e os quatro verbos que ele
   despachava (granada/kit médico/comer/troca de mira) ficaram sem botão.
   Pesquisa em docs/vr/referencia-interacao.md (Parte III) recomenda a MESMA
   receita já usada pelo pente (zona corporal fixa + grip da mão de apoio,
   sem botão novo): ombro esquerdo para granada, quadril esquerdo para o kit
   médico. Comer e troca de mira ficam de fora (sem precedente — dívida
   registrada, não implementada aqui).

   ÂNCORA INDEPENDENTE. O alvo de mundo é calculado no PRÓPRIO teste, a
   partir de `G.camera.getWorldPosition()` e `G.yawDaVista()` — as mesmas
   fontes públicas que qualquer consumidor de pose de cabeça usa neste
   repo (não é o offset PRIVADO do módulo: os offsets (`OMBRO_OFF` etc) são
   importados do próprio js/xr/xrweapon.js porque não há fonte externa que
   publique "onde fica o ombro em VR" — são ergonomia sem lastro, marcada
   como tal na Parte III da referência. O que este arquivo prova é que o
   MECANISMO (zona + grip → verbo) dispara e não dispara nos lugares certos,
   não que os 18 cm são os corretos.

   O QUE ESTE ARQUIVO MEDE:
     · aproximar a mão de apoio do ombro COM o grip apertado gasta uma
       granada (`inventory.nades`), e SÓ uma por aperto (rearme por saída
       da zona, não por frame);
     · o mesmo para o quadril e o kit médico (`inventory.medkits`, e a vida
       sobe de verdade);
     · longe das duas zonas, ou perto delas SEM grip, nenhum verbo dispara —
       do contrário levar a mão para qualquer lugar perto do corpo gastaria
       item sozinho, o que é o "comando de proximidade" que a Parte I deste
       porte já reprovou para o mundo (D3) e vale igual aqui;
     · as duas zonas são independentes: disparar uma não arma nem desarma a
       outra.

   PORTA 3868 (só deste arquivo).
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame } = require('./helpers/harness');
const { bootEmVR } = require('./helpers/iwer');

const PORT = 3868;

async function instalarSonda() {
  const G = window.__game, MP = window.__MP, T = MP.THREE;
  const mod = await import('/js/xr/xrweapon.js');

  /* Calcula o alvo de MUNDO da zona (ombro ou quadril) com as MESMAS fontes
     públicas que qualquer código fora de xrweapon.js já usa para pose de
     cabeça — não é o offset interno do módulo, que aqui é só importado
     porque não existe fonte externa para "onde fica o ombro". */
  function alvoDaZona(off) {
    const cabeca = G.camera.getWorldPosition(new T.Vector3());
    const yaw = G.yawDaVista();
    return new T.Vector3().fromArray(off)
      .applyAxisAngle(new T.Vector3(0, 1, 0), yaw).add(cabeca);
  }

  window.__VC = {
    OMBRO_RAIO: mod.OMBRO_RAIO, QUADRIL_RAIO: mod.QUADRIL_RAIO,
    PEITO_OFF: mod.PEITO_OFF, PEITO_RAIO: mod.PEITO_RAIO,
    zonas: () => ({
      peito: { off: mod.PEITO_OFF, raio: mod.PEITO_RAIO },
      ombro: { off: mod.OMBRO_OFF, raio: mod.OMBRO_RAIO },
      quadril: { off: mod.QUADRIL_OFF, raio: mod.QUADRIL_RAIO },
    }),
    /* Amostra `pedeRecarga()` por VÁRIOS frames reais (só LEITURA — nenhuma
       chamada a update()/aplicar() daqui, então não é o andaime-que-vira-
       produto que a skill vr-quest adverte). É pulso de UM frame só: uma
       leitura pontual depois de um `espera()` fixo pode acertar bem depois
       do pulso já ter voltado a `false` e mentir "não disparou". */
    pedeRecargaEmAlgumFrame: (frames = 40) => new Promise(res => {
      let visto = false, n = 0;
      (function tick() {
        if (G.XRArma.pedeRecarga()) visto = true;
        if (++n < frames) requestAnimationFrame(tick); else res(visto);
      })();
    }),
    inv: () => ({ nades: G.inventory.nades, medkits: G.inventory.medkits }),
    darItens: () => { G.inventory.nades = 3; G.inventory.medkits = 3; },
    vida: () => G.player.health,
    ferir: () => { MP.player.health = 30; },
    /* Leva a mão de apoio ao alvo de MUNDO por DELTA (o controle emulado é
       rig-local; escrever a coordenada de mundo direto erra pelo
       deslocamento do rig — a mesma lição de `maoEnoPoco` em
       xr-arma-recarga.test.js). `dist` desloca o alvo pra fora ao longo do
       raio olho→ombro/quadril, pra testar "perto mas fora da zona". */
    maoNaZona: async (off, dist = 0, passos = 5) => {
      const dev = window.__xrEmulado;
      const alvoBase = alvoDaZona(off);
      const cabeca = G.camera.getWorldPosition(new T.Vector3());
      const dir = alvoBase.clone().sub(cabeca).normalize();
      const alvo = alvoBase.clone().addScaledVector(dir, dist);
      for (let i = 0; i < passos; i++) {
        const maoObj = G.XR.punho('left') || G.XR.mao('left');
        if (!maoObj) break;
        maoObj.updateWorldMatrix(true, false);
        const atual = maoObj.getWorldPosition(new T.Vector3());
        const falta = alvo.clone().sub(atual);
        const p = dev.controllers.left.position;
        dev.controllers.left.position.set(p.x + falta.x, p.y + falta.y, p.z + falta.z);
        await new Promise(r => setTimeout(r, 130));
      }
      return { alvo: alvo.toArray() };
    },
    maoLonge: () => {
      const dev = window.__xrEmulado;
      dev.controllers.left.position.set(0.8, 1.2, -1.5);   // fora de qualquer zona
    },
    OMBRO_OFF: mod.OMBRO_OFF, QUADRIL_OFF: mod.QUADRIL_OFF,
  };
  return { ok: true, ombro: mod.OMBRO_OFF, quadril: mod.QUADRIL_OFF };
}

describe('granada e kit médico por gesto corporal (IWER, sessão imersiva real)',
  { skip: !CHROME && 'Chrome não encontrado' }, () => {
    let h;
    before(async () => {
      h = await bootEmVR(bootGame, { port: PORT });
      await h.play(instalarSonda);
      await h.play(async () => {
        window.__VC.darItens();
        window.__A.solta();
        await window.__A.espera(150);
      });
    });
    after(async () => { if (h) await h.close(); });

    it('mão de apoio no ombro, com o grip: gasta UMA granada', async () => {
      const r = await h.play(async () => {
        const antes = window.__VC.inv();
        await window.__VC.maoNaZona(window.__VC.OMBRO_OFF);
        window.__A.botao('left', 'squeeze', 1);
        await window.__A.espera(300);
        const depois1 = window.__VC.inv();
        // segurando: NÃO pode gastar uma segunda no mesmo aperto
        await window.__A.espera(300);
        const depois2 = window.__VC.inv();
        window.__A.botao('left', 'squeeze', 0);
        await window.__A.espera(150);
        return { antes, depois1, depois2 };
      });
      assert.equal(r.antes.nades, 3, 'setup: inventário não começou com 3 granadas');
      assert.equal(r.depois1.nades, 2,
        `granada não foi gasta no ombro com grip: ${JSON.stringify(r.depois1)}`);
      assert.equal(r.depois2.nades, 2,
        `segurar o grip no ombro gastou MAIS de uma granada no mesmo aperto: ${JSON.stringify(r.depois2)}`);
    });

    it('sair da zona e voltar (novo aperto) rearma — a SEGUNDA granada sai', async () => {
      const r = await h.play(async () => {
        window.__VC.maoLonge();
        await window.__A.espera(200);
        window.__A.botao('left', 'squeeze', 0);
        await window.__A.espera(150);
        await window.__VC.maoNaZona(window.__VC.OMBRO_OFF);
        window.__A.botao('left', 'squeeze', 1);
        await window.__A.espera(300);
        const depois = window.__VC.inv();
        window.__A.botao('left', 'squeeze', 0);
        return depois;
      });
      assert.equal(r.nades, 1, `segundo aperto na zona não gastou a 2ª granada: ${JSON.stringify(r)}`);
    });

    it('mão no ombro SEM grip: nenhuma granada sai (não é comando por proximidade)', async () => {
      const r = await h.play(async () => {
        window.__VC.maoLonge();
        await window.__A.espera(200);
        const antes = window.__VC.inv();
        await window.__VC.maoNaZona(window.__VC.OMBRO_OFF);
        await window.__A.espera(400);   // parado na zona, grip solto o tempo todo
        return { antes, depois: window.__VC.inv() };
      });
      assert.deepEqual(r.depois, r.antes,
        `mão parada no ombro sem grip gastou item: ${JSON.stringify(r)}`);
    });

    it('grip apertado LONGE do ombro (fora do raio): nenhuma granada sai', async () => {
      const r = await h.play(async () => {
        window.__VC.maoLonge();
        await window.__A.espera(200);
        const antes = window.__VC.inv();
        // perto mas 2x o raio da zona pra fora — não pode disparar
        await window.__VC.maoNaZona(window.__VC.OMBRO_OFF, window.__VC.OMBRO_RAIO * 2);
        window.__A.botao('left', 'squeeze', 1);
        await window.__A.espera(300);
        const depois = window.__VC.inv();
        window.__A.botao('left', 'squeeze', 0);
        return { antes, depois };
      });
      assert.deepEqual(r.depois, r.antes,
        `grip fora do raio do ombro gastou granada: ${JSON.stringify(r)}`);
    });

    it('mão de apoio no quadril, com o grip: usa UM kit médico e cura de verdade', async () => {
      const r = await h.play(async () => {
        window.__VC.maoLonge();
        await window.__A.espera(200);
        window.__VC.ferir();
        const antesInv = window.__VC.inv(), antesVida = window.__VC.vida();
        await window.__VC.maoNaZona(window.__VC.QUADRIL_OFF);
        window.__A.botao('left', 'squeeze', 1);
        await window.__A.espera(300);
        const depoisInv = window.__VC.inv(), depoisVida = window.__VC.vida();
        window.__A.botao('left', 'squeeze', 0);
        return { antesInv, antesVida, depoisInv, depoisVida };
      });
      assert.equal(r.antesVida, 30, 'setup: vida não ficou em 30 antes do kit');
      assert.equal(r.depoisInv.medkits, r.antesInv.medkits - 1,
        `kit médico não foi gasto no quadril com grip: ${JSON.stringify(r.depoisInv)}`);
      assert.ok(r.depoisVida > r.antesVida,
        `vida não subiu depois do kit médico: ${r.antesVida} → ${r.depoisVida}`);
    });

    /* ACHADO por validação independente (docs/vr/validacao-d59830e.md, §2):
       o centro do alvo do QUADRIL caía a 2,2 mm *dentro* do raio da zona do
       PEITO (recarga por gesto) — as duas checagens em xrweapon.js são
       totalmente independentes uma da outra, então alcançar o quadril
       também satisfazia `gripDPeito ≤ PEITO_RAIO` e podia pedir recarga e
       kit médico no MESMO aperto. Âncora INDEPENDENTE do código: geometria
       pura das constantes exportadas, não o comportamento que elas geram —
       se algum dia entrar uma quarta zona no mesmo grip, este caso continua
       valendo sem precisar saber o nome dela. */
    it('as zonas de gesto do grip de apoio não se sobrepõem (raio+raio < distância entre centros)', async () => {
      const r = await h.play(async () => {
        const zonas = window.__VC.zonas();
        const nomes = Object.keys(zonas);
        const pares = [];
        for (let i = 0; i < nomes.length; i++)
          for (let j = i + 1; j < nomes.length; j++) {
            const a = zonas[nomes[i]], b = zonas[nomes[j]];
            const distancia = Math.hypot(
              a.off[0] - b.off[0], a.off[1] - b.off[1], a.off[2] - b.off[2]);
            pares.push({ par: `${nomes[i]}↔${nomes[j]}`, distancia,
              somaRaios: a.raio + b.raio, folga: distancia - (a.raio + b.raio) });
          }
        return pares;
      });
      const colidindo = r.filter(p => p.folga <= 0);
      assert.deepEqual(colidindo, [],
        `zonas de gesto se sobrepõem — mesmo ponto dispara dois verbos: ${JSON.stringify(colidindo)}\n` +
        `(todas: ${JSON.stringify(r)})`);
    });

    it('mão de apoio no QUADRIL com grip não pede recarga junto (zonas não podem se sobrepor)', async () => {
      const r = await h.play(async () => {
        window.__VC.maoLonge();
        await window.__A.espera(200);
        window.__A.botao('left', 'squeeze', 0);
        await window.__A.espera(150);
        window.__VC.darItens();
        window.__VC.ferir();   // sem isto o kit recusa por vida cheia e não prova que o gesto exercitou
        const antes = window.__VC.inv();
        await window.__VC.maoNaZona(window.__VC.QUADRIL_OFF);
        window.__A.botao('left', 'squeeze', 1);
        const pediuRecarga = await window.__VC.pedeRecargaEmAlgumFrame();
        window.__A.botao('left', 'squeeze', 0);
        await window.__A.espera(150);
        return { pediuRecarga, antes, depois: window.__VC.inv() };
      });
      assert.equal(r.pediuRecarga, false,
        `mão no quadril também pediu recarga (as duas zonas se sobrepõem): ${JSON.stringify(r)}`);
      assert.equal(r.depois.medkits, r.antes.medkits - 1,
        `o kit médico não foi gasto — o caso não exercitou o quadril de verdade: ${JSON.stringify(r)}`);
    });

    it('ombro e quadril são independentes: gastar um não mexe no outro', async () => {
      const r = await h.play(async () => {
        window.__VC.maoLonge();
        await window.__A.espera(200);
        window.__VC.ferir();   // o caso anterior já curou — sem isto o kit recusa por vida cheia
        const antes = window.__VC.inv();
        await window.__VC.maoNaZona(window.__VC.QUADRIL_OFF);
        window.__A.botao('left', 'squeeze', 1);
        await window.__A.espera(300);
        window.__A.botao('left', 'squeeze', 0);
        return { antes, depois: window.__VC.inv() };
      });
      assert.equal(r.depois.medkits, r.antes.medkits - 1, 'quadril não gastou o próprio kit');
      assert.equal(r.depois.nades, r.antes.nades, 'usar o quadril mexeu na contagem de granadas');
    });
  });
