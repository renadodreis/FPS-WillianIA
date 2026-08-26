/* ================================================================
   QA — A SENSAÇÃO DE ANDAR DENTRO DO HEADSET (critérios A3 e A4).

   PONTO DE PARTIDA, medido em sessão imersiva real no HEAD antes de
   escrever qualquer código (mesmo procedimento deste arquivo):

     andar 5,200 m/s · correr 8,600 m/s · agachado 2,600 · mirando 3,400
     rampa até 95 % ....... 270 ms      parada até 5 % ....... 293 ms

   Uma caminhada humana é ~1,4 m/s e uma corrida ~2,8 m/s (Meta,
   *Locomotion Comfort and Usability*). O jogo ANDA mais rápido do que um
   humano CORRE. No monitor isso é convenção de FPS; no headset, com o
   corpo parado, é fluxo óptico que o ouvido interno não confirma.

   O QUE ESTE ARQUIVO MEDE, E COMO

   - **A COISA, não a constante.** Velocidade estabilizada em m/s lida de
     `player.vel` dentro da sessão, tempo de rampa em ms amostrado por
     FRAME DE SESSÃO, e deslocamento com DIREÇÃO. Guarda de constante
     (`X > Y` com X e Y literais do próprio módulo) não pega defeito de
     fiação, e este arquivo tem os dois tipos separados por `describe`.
   - **Sem conduzir o produto.** Dentro da sessão quem chama o frame é a
     sessão. O amostrador registra um `requestAnimationFrame` PRÓPRIO na
     sessão e só LÊ — não chama `tick`, não cria instância de módulo, não
     escreve em `player.vel` fora do zeramento de condição inicial. Cada
     amostra carrega `renderer.info.render.frame` justamente para o teste
     não poder passar com a sessão congelada.
   - **A restauração saindo da sessão DE VERDADE.** `G.XR.exit()`, espera
     `presenting === false`, e cobra os quatro números do PC de volta —
     porque o preset de qualidade já perdeu o `restaurar()` uma vez dentro
     de um `else if` reescrito, e o sintoma foi mudo.

   POR QUE CADA ASSERÇÃO PODE FALHAR está escrito ACIMA DELA. Onde a
   resposta seria "não pode", o caso não existe.

   Referência, números e a divergência das fontes:
   docs/vr/referencia-velocidade.md
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame } = require('./helpers/harness');
const { bootEmVR } = require('./helpers/iwer');

const PORT = 3500;

/* As constantes do PC, como o game.js as declara. Repetidas aqui de
   propósito: se alguém mudar a velocidade do desktop, os casos de razão e
   de paridade abaixo ficam vermelhos e obrigam a decisão a ser consciente. */
const PC = { andar: 5.2, correr: 8.6, agachar: 2.6, mirar: 3.4, aceleraSolo: 11, aceleraAr: 2.6 };

/* Velocidade com que a borda do gás fecha, fase a fase, no plano clássico
   (`buildPlan`, server.js): raios [560,340,200,110,55,24] e encolhimentos
   [40,32,26,22,18] s. A fase 1 é a mais rápida — 5,50 m/s. */
const FUGA_FASE1 = (560 - 340) / 40;

/* Teto de rampa do critério de aceite (A4): 150 ms até 95 %. Com
   `damp`, t95 = ln(20)/k ≈ 3/k. */
const t95De = k => 3 / k;

/* ================================================================
   1. POLÍTICA PURA — sem navegador, sem sessão, sem three.
   ================================================================ */
describe('política de velocidade em XR (unidade)', () => {
  let M;
  before(async () => { M = await import('../js/xr/xrlocomotion.js'); });

  it('o perfil padrão pousa a CORRIDA na corrida humana que a Meta publica', () => {
    /* Falha se alguém trocar a âncora de `conforto` ou passar a escalar por
       um multiplicador solto: o número deixa de cair em 2,8. */
    const p = M.politicaDeVelocidade(PC, 'conforto');
    assert.equal(M.PADRAO.perfil, 'conforto');
    assert.ok(Math.abs(p.correr - 2.8) < 1e-9,
      `corrida do perfil de conforto: ${p.correr.toFixed(3)} m/s — a referência da Meta é 2,8`);
  });

  it('o padrão cabe no teto do critério: andar ≤ 2,0 e correr ≤ 4,0 m/s', () => {
    /* Falha se a âncora subir (ex.: alguém "só ajusta" conforto para 4,5 m/s
       porque o jogo ficou lento). É o critério A3 escrito como código. */
    const p = M.politicaDeVelocidade(PC, M.PADRAO.perfil);
    assert.ok(p.andar <= 2.0, `andar ${p.andar.toFixed(3)} m/s passa do teto de 2,0`);
    assert.ok(p.correr <= 4.0, `correr ${p.correr.toFixed(3)} m/s passa do teto de 4,0`);
  });

  it('os três perfis preservam as RAZÕES do jogo (mirar custa, agachar é lento)', () => {
    /* Falha no instante em que alguém ajustar um dos quatro números sozinho —
       por exemplo tirar a penalidade de mira "porque em VR mirar é físico".
       Mexer numa razão é mudar balanceamento, não conforto. */
    const razoes = o => [o.correr / o.andar, o.agachar / o.andar, o.mirar / o.andar];
    const base = razoes(PC);
    for (const nome of M.ORDEM) {
      const r = razoes(M.politicaDeVelocidade(PC, nome));
      for (let i = 0; i < 3; i++) {
        assert.ok(Math.abs(r[i] - base[i]) < 1e-9,
          `perfil ${nome}: razão ${i} virou ${r[i].toFixed(4)} (PC: ${base[i].toFixed(4)})`);
      }
    }
  });

  it('NENHUM perfil deixa o headset mais rápido que o monitor — em nenhum dos quatro', () => {
    /* Falha com qualquer escala > 1. É o invariante competitivo do projeto:
       o jogo é multijogador e vantagem de quem usa headset é defeito. */
    for (const nome of M.ORDEM) {
      const p = M.politicaDeVelocidade(PC, nome);
      for (const campo of ['andar', 'correr', 'agachar', 'mirar']) {
        assert.ok(p[campo] <= PC[campo] + 1e-9,
          `perfil ${nome}: ${campo} ${p[campo]} > ${PC[campo]} do PC`);
      }
    }
  });

  it('`paridade` é paridade INTEIRA: os quatro números E a rampa do PC', () => {
    /* Falha se `paridade` ganhar a aceleração instantânea. Velocidade de PC
       com rampa de 50 ms é MELHOR que o PC em duelo de canto — quem chega ao
       topo primeiro ganha a troca —, e isso é vantagem de headset. */
    const p = M.politicaDeVelocidade(PC, 'paridade');
    assert.equal(p.andar, PC.andar);
    assert.equal(p.correr, PC.correr);
    assert.equal(p.agachar, PC.agachar);
    assert.equal(p.mirar, PC.mirar);
    assert.equal(p.aceleraSolo, PC.aceleraSolo,
      'paridade com rampa instantânea é vantagem competitiva de headset');
  });

  it('`alcance` corre mais rápido que o gás da fase 1 — e `conforto` não', () => {
    /* Falha se a âncora de `alcance` cair abaixo da fuga, ou se `conforto`
       subir e o degrau do meio deixar de ter motivo para existir.
       O número 5,50 m/s sai do `buildPlan` do servidor, não daqui. */
    assert.ok(Math.abs(FUGA_FASE1 - 5.5) < 1e-9, `a fuga da fase 1 virou ${FUGA_FASE1}`);
    const alcance = M.politicaDeVelocidade(PC, 'alcance');
    const conforto = M.politicaDeVelocidade(PC, 'conforto');
    assert.ok(alcance.correr > FUGA_FASE1,
      `alcance corre ${alcance.correr.toFixed(2)} m/s e o gás fecha a ${FUGA_FASE1} m/s`);
    assert.ok(conforto.correr < FUGA_FASE1,
      'conforto passou a escapar do gás: o perfil do meio perdeu a razão de existir');
  });

  it('a rampa de XR cabe com folga no teto de 150 ms, e a do PC não cabia', () => {
    /* Falha se ACEL_XR_SOLO cair abaixo de 20 (t95 = 150 ms). O segundo
       assert é a linha de base: prova que o caso mede uma MUDANÇA. */
    assert.ok(t95De(M.ACEL_XR_SOLO) <= 0.15,
      `t95 em XR = ${(t95De(M.ACEL_XR_SOLO) * 1000).toFixed(0)} ms, teto 150`);
    assert.ok(t95De(PC.aceleraSolo) > 0.15,
      'a rampa do PC passou a caber no teto sozinha — este arquivo perdeu o motivo');
  });

  it('no AR a aceleração continua a do PC nos três perfis', () => {
    /* Falha se alguém "instantanear" o ar junto. Ali `k` não é rampa de
       locomoção, é controle aéreo: mexer muda a trajetória de todo pulo. */
    for (const nome of M.ORDEM) {
      assert.equal(M.politicaDeVelocidade(PC, nome).aceleraAr, PC.aceleraAr, `perfil ${nome}`);
    }
  });

  it('perfil desconhecido cai no padrão, sem NaN e sem Infinity', () => {
    /* Falha se a resolução de perfil deixar `undefined` virar aritmética.
       Preferência velha no localStorage é o caminho real para isto. */
    const p = M.politicaDeVelocidade(PC, 'turbo');
    assert.equal(p.perfil, M.PADRAO.perfil);
    for (const c of ['andar', 'correr', 'agachar', 'mirar', 'aceleraSolo', 'aceleraAr']) {
      assert.ok(Number.isFinite(p[c]), `${c} saiu ${p[c]}`);
    }
  });

  it('base degenerada não devolve Infinity — a âncora divide por `correr`', () => {
    /* Falha se a divisão da âncora ficar sem guarda. */
    const p = M.politicaDeVelocidade({ andar: 0, correr: 0, agachar: 0, mirar: 0 }, 'conforto');
    for (const c of ['andar', 'correr', 'escala']) assert.ok(Number.isFinite(p[c]), `${c} = ${p[c]}`);
  });

  it('ORDEM e ROTULOS cobrem exatamente os perfis que existem', () => {
    /* Falha se alguém acrescentar perfil e esquecer a lista, ou o contrário:
       o painel do headset cicla pela ORDEM, e perfil fora dela é código morto
       enquanto rótulo a mais é linha de painel que não faz nada. */
    const chaves = Object.keys(M.PERFIS).sort();
    assert.deepEqual([...M.ORDEM].sort(), chaves);
    assert.deepEqual(Object.keys(M.ROTULOS).sort(), chaves);
  });

  it('fora da sessão os quatro getters são os do PC, bit por bit', () => {
    /* Falha se a leitura passar a depender de `aplicar()` em vez de
       `apresentando()` — que é como um `restaurar()` perdido vaza para o PC. */
    let dentro = false;
    const L = M.criarLocomocaoXR({ base: PC, apresentando: () => dentro });
    assert.equal(L.andar, PC.andar);
    dentro = true;
    L.aplicar();
    assert.ok(L.andar < PC.andar, 'entrou em sessão e a velocidade não mudou');
    dentro = false;                       // a sessão acabou por fora: ninguém avisou
    assert.equal(L.andar, PC.andar, 'a sessão acabou por fora e a velocidade vazou pro PC');
    assert.equal(L.correr, PC.correr);
    assert.equal(L.agachar, PC.agachar);
    assert.equal(L.mirar, PC.mirar);
    assert.equal(L.aceleracao(true), PC.aceleraSolo);
  });

  it('`restaurar` distingue "desfez" de "nunca aplicou"', () => {
    /* Falha se `restaurar` passar a devolver `true` sempre — o que faria a
       fiação parecer certa mesmo sem nunca ter aplicado nada. */
    const L = M.criarLocomocaoXR({ base: PC, apresentando: () => true });
    assert.equal(L.restaurar(), false);
    L.aplicar();
    assert.equal(L.dentro, true);
    assert.equal(L.restaurar(), true);
    assert.equal(L.dentro, false);
    assert.equal(L.restaurar(), false);
  });

  it('a preferência PERSISTE e volta no boot seguinte', () => {
    /* Falha se `preferir` parar de gravar, ou se o construtor parar de ler:
       escolher velocidade toda vez que põe o headset é a queixa de sempre. */
    const dados = {};
    const armazem = {
      getItem: k => (k in dados ? dados[k] : null),
      setItem: (k, v) => { dados[k] = v; },
    };
    const a = M.criarLocomocaoXR({ base: PC, apresentando: () => true, armazem });
    a.preferir({ velocidade: 'paridade' });
    assert.equal(a.correr, PC.correr);
    const b = M.criarLocomocaoXR({ base: PC, apresentando: () => true, armazem });
    assert.equal(b.prefs.velocidade, 'paridade', 'a preferência não sobreviveu ao boot');
    /* e a chave é a MESMA das outras preferências de VR: gravar por cima
       apagaria o giro e a vinheta do jogador */
    assert.equal(M.CHAVE, 'callofai_vr');
    assert.ok(JSON.parse(dados[M.CHAVE]).velocidade === 'paridade');
  });

  it('armazém que LANÇA no acesso não derruba nada (iframe com sandbox)', () => {
    /* Falha se a leitura/gravação sair do try. Em iframe com sandbox o próprio
       acesso a localStorage lança — não é só "pode estar cheio". */
    const bomba = { getItem() { throw new Error('SecurityError'); },
      setItem() { throw new Error('SecurityError'); } };
    const L = M.criarLocomocaoXR({ base: PC, apresentando: () => true, armazem: bomba });
    assert.equal(L.prefs.velocidade, M.PADRAO.perfil);
    L.preferir({ velocidade: 'alcance' });
    assert.equal(L.prefs.velocidade, 'alcance');
  });

  it('`proximo()` cicla na ORDEM e dá a volta', () => {
    /* Falha se o ciclo pular perfil ou travar no último — é o gesto do painel. */
    const L = M.criarLocomocaoXR({ base: PC, apresentando: () => true });
    const vistos = [L.prefs.velocidade];
    for (let i = 0; i < M.ORDEM.length; i++) vistos.push(L.proximo().velocidade);
    assert.deepEqual(vistos.slice(0, M.ORDEM.length + 1),
      [...M.ORDEM.slice(M.ORDEM.indexOf(vistos[0])), ...M.ORDEM].slice(0, M.ORDEM.length + 1));
    assert.equal(vistos[M.ORDEM.length], vistos[0], 'o ciclo não deu a volta');
  });

  it('`apresentando` que LANÇA é tratado como "fora da sessão"', () => {
    /* Falha se a leitura de presença sair do try: `renderer.xr` pode sumir
       durante a derrubada da sessão, e velocidade não pode explodir por isso. */
    const L = M.criarLocomocaoXR({ base: PC, apresentando: () => { throw new Error('xr foi embora'); } });
    assert.equal(L.andar, PC.andar);
  });
});

/* ================================================================
   2. PRODUTO — dentro de uma sessão `immersive-vr` de verdade (IWER).

   Estes casos cobram a FIAÇÃO do game.js. Sem ela o jogo continua a
   5,2/8,6 m/s e este bloco fica vermelho, que é o ponto.
   ================================================================ */

/* Sonda instalada NA PÁGINA. Observador puro: registra um rAF próprio na
   sessão (a sessão já é quem chama o frame; um callback a mais só LÊ) e
   devolve [ms, m/s, nº do frame de render]. O terceiro campo existe para o
   teste não poder passar com a sessão parada. */
function instalarSonda() {
  const MP = window.__MP;
  const vel = () => Math.hypot(MP.player.vel.x, MP.player.vel.z);
  window.__VEL = {
    amostrar(ms) {
      const s = MP.renderer.xr.getSession();
      const out = [];
      const t0 = performance.now();
      return new Promise(res => {
        const passo = t => {
          out.push([+(t - t0).toFixed(1), +vel().toFixed(4), MP.renderer.info.render.frame]);
          if (t - t0 < ms) s.requestAnimationFrame(passo); else res(out);
        };
        s.requestAnimationFrame(passo);
      });
    },
    /* Zera a condição inicial e mede um comando até estabilizar. Zerar
       `player.vel` é condição inicial, não condução: nenhum frame é forçado. */
    async perfil(comandos, ms) {
      const A = window.__A;
      A.solta();
      await A.espera(350);
      MP.player.vel.x = 0; MP.player.vel.z = 0;
      for (const c of comandos) A[c[0]](...c.slice(1));
      const am = await window.__VEL.amostrar(ms);
      A.solta();
      return am;
    },
    vel,
  };
}

/* Velocidade em regime: média do último terço das amostras. Média de cauda,
   e não pico, porque pico pega jitter de um frame. */
const regime = am => {
  const corte = am[am.length - 1][0] * 0.66;
  const cauda = am.filter(x => x[0] >= corte).map(x => x[1]);
  return cauda.reduce((s, v) => s + v, 0) / cauda.length;
};
/* Instante em que a velocidade cruza 95 % do regime, em ms desde o comando. */
const t95 = am => {
  const v = regime(am);
  const hit = am.find(x => x[1] >= 0.95 * v);
  return hit ? hit[0] : Infinity;
};
const frames = am => am[am.length - 1][2] - am[0][2];

describe('andar dentro do headset (sessão imersiva real)', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h;
  before(async () => {
    h = await bootEmVR(bootGame, { port: PORT });
    await h.play(instalarSonda);
  });
  after(async () => { if (h) await h.close(); });

  it('a fiação existe: o jogo tem a política aplicada e o perfil é o de conforto', async () => {
    /* Falha enquanto o game.js não consultar o módulo (`aplicar()` no
       onEnter). É o caso que separa "módulo existe" de "módulo está no ar". */
    const r = await h.play(() => {
      const L = window.__game.XRAndar;
      return L ? { dentro: L.dentro, perfil: L.prefs.velocidade, plano: L.plano } : null;
    });
    assert.ok(r, 'o game.js não expõe XRAndar: a fiação não entrou');
    assert.equal(r.dentro, true, '`aplicar()` não foi chamado ao entrar na sessão');
    assert.equal(r.perfil, 'conforto');
    console.log(`      plano da sessão: andar ${r.plano.andar.toFixed(3)} · correr ` +
      `${r.plano.correr.toFixed(3)} · agachado ${r.plano.agachar.toFixed(3)} · ` +
      `mirando ${r.plano.mirar.toFixed(3)} m/s`);
  });

  it('ANDAR estabiliza em escala humana — não nos 5,20 m/s do monitor', async () => {
    /* Falha se a linha `let speed = WALK_SPEED` voltar, ou se o módulo
       parar de ser consultado: o regime volta a 5,20. */
    const am = await h.play(() => window.__VEL.perfil([['stick', 'left', 0, -1]], 1600));
    const v = regime(am);
    console.log(`      andar: ${v.toFixed(3)} m/s em ${frames(am)} frames de render`);
    assert.ok(frames(am) > 20, `só ${frames(am)} frames de render na janela: sessão parada`);
    assert.ok(Math.abs(v - 1.693) < 0.06,
      `andar em VR deu ${v.toFixed(3)} m/s (esperado ≈ 1,693; no HEAD era 5,200)`);
  });

  it('CORRER estabiliza na corrida humana da Meta', async () => {
    /* Falha se `RUN_SPEED` voltar à linha do sprint. 8,600 → 2,800. */
    const am = await h.play(() => window.__VEL.perfil(
      [['stick', 'left', 0, -1], ['botao', 'left', 'thumbstick', 1]], 1800));
    const v = regime(am);
    console.log(`      correr: ${v.toFixed(3)} m/s`);
    assert.ok(Math.abs(v - 2.8) < 0.08,
      `correr em VR deu ${v.toFixed(3)} m/s (esperado ≈ 2,800; no HEAD era 8,600)`);
  });

  it('AGACHADO e MIRANDO também escalam — os quatro números, não dois', async () => {
    /* Falha se a fiação trocar só `WALK_SPEED` e `RUN_SPEED` e esquecer
       `CROUCH_SPEED`/`ADS_SPEED`, que é o descuido natural: o jogador
       agachado ficaria mais rápido que andando. */
    const ag = await h.play(() => window.__VEL.perfil(
      [['stick', 'left', 0, -1], ['botao', 'left', 'squeeze', 1]], 1800));
    const mi = await h.play(() => window.__VEL.perfil(
      [['stick', 'left', 0, -1], ['botao', 'right', 'squeeze', 1]], 1800));
    const vAg = regime(ag), vMi = regime(mi);
    console.log(`      agachado: ${vAg.toFixed(3)} m/s · mirando: ${vMi.toFixed(3)} m/s`);
    assert.ok(Math.abs(vAg - 0.846) < 0.05,
      `agachado deu ${vAg.toFixed(3)} m/s (esperado ≈ 0,846; no HEAD 2,600)`);
    assert.ok(Math.abs(vMi - 1.107) < 0.05,
      `mirando deu ${vMi.toFixed(3)} m/s (esperado ≈ 1,107; no HEAD 3,400)`);
  });

  it('a RAMPA é praticamente instantânea: ≤ 150 ms até 95 %', async () => {
    /* Falha se `accelK` voltar a 11 no solo — os 270 ms medidos no HEAD.
       É a mudança com melhor lastro nas fontes: o vestibular sente
       aceleração, não velocidade constante. */
    const am = await h.play(() => window.__VEL.perfil([['stick', 'left', 0, -1]], 900));
    const t = t95(am);
    console.log(`      rampa: 95 % em ${t} ms (HEAD: 270 ms) · amostras ` +
      am.filter((_, i) => i < 6).map(x => `${x[0]}ms=${x[1]}`).join(' '));
    assert.ok(t <= 150, `a rampa levou ${t} ms até 95 % da velocidade (teto 150)`);
  });

  it('a PARADA também: soltar o analógico para em ≤ 150 ms', async () => {
    /* Falha pelo mesmo motivo — `damp` usa o MESMO k para subir e descer,
       e "slowing down or stopping" é aceleração igual (Oculus BPG p.6). */
    const r = await h.play(async () => {
      const A = window.__A;
      A.solta(); await A.espera(300);
      A.stick('left', 0, -1);
      await A.espera(900);                       // já em regime
      const v0 = window.__VEL.vel();
      /* O amostrador é registrado ANTES de soltar, e o `solta()` vem no mesmo
         turno síncrono: só assim `t = 0` é o instante do comando. Lendo a
         velocidade da PRIMEIRA amostra em vez daqui, a medição começaria um
         frame depois — e com a parada em ~50 ms isso é a metade dela. */
      const p = window.__VEL.amostrar(600);
      A.solta();
      return { v0, am: await p };
    });
    const parou = r.am.find(x => x[1] <= 0.05 * r.v0);
    const t = parou ? parou[0] : Infinity;
    console.log(`      parada: de ${r.v0.toFixed(3)} m/s a 5 % em ${t} ms (HEAD: 293 ms)`);
    assert.ok(r.v0 > 1.0, `a medição começou a ${r.v0.toFixed(3)} m/s: não havia o que parar`);
    assert.ok(t <= 150, `soltar o analógico levou ${t} ms para parar (teto 150)`);
  });

  it('mais devagar continua indo PRA FRENTE — velocidade não virou direção', async () => {
    /* Falha se a fiação tocar em `_v3`/`vistaMundo` por engano. Medir só
       magnitude deixaria passar movimento invertido, que é o defeito que já
       aconteceu aqui ("pra frente vai pra trás"). */
    const r = await h.play(async () => {
      const A = window.__A, G = window.__game, MP = window.__MP;
      A.solta(); await A.espera(300);
      const olhar = new MP.THREE.Vector3();
      G.camera.getWorldDirection(olhar); olhar.y = 0; olhar.normalize();
      MP.player.vel.x = 0; MP.player.vel.z = 0;
      const p0 = [MP.player.pos.x, MP.player.pos.z];
      A.stick('left', 0, -1);
      await A.espera(1200);
      A.solta();
      const dx = MP.player.pos.x - p0[0], dz = MP.player.pos.z - p0[1];
      const d = Math.hypot(dx, dz);
      return { d, alinhado: d < 0.05 ? 0 : (dx / d) * olhar.x + (dz / d) * olhar.z };
    });
    console.log(`      1,2 s de analógico: ${r.d.toFixed(2)} m, alinhamento ${r.alinhado.toFixed(3)}`);
    assert.ok(r.alinhado > 0.9, `alinhamento ${r.alinhado.toFixed(2)} (1 = pra frente, −1 = o bug)`);
    assert.ok(r.d > 1.0 && r.d < 3.0,
      `andou ${r.d.toFixed(2)} m em 1,2 s — fora da faixa de uma caminhada humana`);
  });

  it('a VINHETA continua fechando ao correr — o teto dela acompanhou a velocidade', async () => {
    /* Falha se a fiação passar `RUN_SPEED` (8,6) para `XR.conforto.update`
       em vez da corrida do perfil: correndo a 2,8 contra um teto de 8,6 a
       vinheta pararia em 0,32 e o jogador perderia a proteção periférica
       justamente onde ela existe. É o acoplamento escondido desta mudança. */
    const t = await h.play(async () => {
      const A = window.__A;
      A.solta(); await A.espera(300);
      A.stick('left', 0, -1);
      A.botao('left', 'thumbstick', 1);
      await A.espera(1400);
      const v = window.__game.XR.conforto.tunel;
      A.solta();
      return v;
    });
    console.log(`      periferia fechada correndo: ${(t * 100).toFixed(0)} %`);
    assert.ok(t > 0.4, `correndo, a periferia só fechou ${(t * 100).toFixed(0)} %`);
  });

  it('trocar para IGUAL AO PC devolve 8,60 m/s DENTRO da sessão', async () => {
    /* Falha se `preferir()` não invalidar o memo do plano, ou se a fiação ler
       o plano uma vez só na entrada: a escolha do jogador viraria enfeite.
       É também a opção que o critério A3 exige existir. */
    const r = await h.play(async () => {
      const L = window.__game.XRAndar;
      L.preferir({ velocidade: 'paridade' });
      const am = await window.__VEL.perfil(
        [['stick', 'left', 0, -1], ['botao', 'left', 'thumbstick', 1]], 1800);
      L.preferir({ velocidade: 'conforto' });
      return am;
    });
    const v = regime(r);
    console.log(`      perfil IGUAL AO PC, correndo: ${v.toFixed(3)} m/s`);
    assert.ok(Math.abs(v - 8.6) < 0.2,
      `com o perfil de paridade a corrida deu ${v.toFixed(3)} m/s, não 8,600`);
  });

  it('voltar ao conforto no mesmo instante: a escolha vale nos dois sentidos', async () => {
    /* Falha se `preferir` só souber descer. O caso anterior deixou o módulo
       de volta em `conforto` — este cobra que isso é verdade no PRODUTO. */
    const am = await h.play(() => window.__VEL.perfil(
      [['stick', 'left', 0, -1], ['botao', 'left', 'thumbstick', 1]], 1600));
    const v = regime(am);
    assert.ok(Math.abs(v - 2.8) < 0.08, `voltou ao conforto e correu ${v.toFixed(3)} m/s`);
  });
});

/* ================================================================
   3. SAIR DA SESSÃO DEVOLVE O MONITOR — em sessão de verdade.
   ================================================================ */
describe('sair do headset não pode mudar o PC', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h;
  before(async () => {
    h = await bootEmVR(bootGame, { port: PORT + 1 });
    await h.play(instalarSonda);
  });
  after(async () => { if (h) await h.close(); });

  it('encerrada a sessão, os quatro números voltam a ser os do desktop', async () => {
    /* Falha se a leitura passar a depender de um espelho local em vez de
       `renderer.xr.isPresenting`, OU se `restaurar()` sumir de um `else if`
       reescrito — que é literalmente o que aconteceu com o preset de
       qualidade, e o sintoma foi mudo. */
    const r = await h.play(async () => {
      const G = window.__game, L = G.XRAndar;
      const emSessao = { andar: L.andar, correr: L.correr, dentro: L.dentro };
      await G.XR.exit();
      for (let i = 0; i < 60 && G.XR.presenting; i++) await new Promise(res => setTimeout(res, 50));
      await new Promise(res => setTimeout(res, 300));
      return {
        emSessao,
        presenting: G.XR.presenting,
        depois: { andar: L.andar, correr: L.correr, agachar: L.agachar, mirar: L.mirar,
          acelSolo: L.aceleracao(true), acelAr: L.aceleracao(false), dentro: L.dentro },
      };
    });
    assert.ok(r.emSessao.andar < 2.0, `dentro da sessão o andar era ${r.emSessao.andar}: o caso não mediu troca`);
    assert.equal(r.presenting, false, 'a sessão não terminou — o caso não mediu a saída');
    assert.equal(r.depois.andar, PC.andar, `no monitor o andar ficou em ${r.depois.andar} m/s`);
    assert.equal(r.depois.correr, PC.correr);
    assert.equal(r.depois.agachar, PC.agachar);
    assert.equal(r.depois.mirar, PC.mirar);
    assert.equal(r.depois.acelSolo, PC.aceleraSolo, 'a rampa de VR vazou para o monitor');
    assert.equal(r.depois.acelAr, PC.aceleraAr);
    assert.equal(r.depois.dentro, false, '`restaurar()` não foi chamado ao sair da sessão');
  });

  it('e o jogador ANDA a 5,20 m/s no monitor depois de ter usado o headset', async () => {
    /* Constante certa e produto errado é possível: este caso mede o jogo
       rodando fora de XR, com o mesmo `damp` e as mesmas teclas. Falha se
       a fiação da linha de velocidade deixar de resolver para o PC. */
    const r = await h.play(async () => {
      const G = window.__game, MP = window.__MP;
      if (G.XR.presenting) return { erro: 'ainda em sessão' };
      G.keys['KeyW'] = false;
      MP.player.vel.set(0, 0, 0);
      G.keys['KeyW'] = true;
      await new Promise(res => setTimeout(res, 1200));
      const v = Math.hypot(MP.player.vel.x, MP.player.vel.z);
      G.keys['KeyW'] = false;
      await new Promise(res => setTimeout(res, 400));
      return { v, parado: Math.hypot(MP.player.vel.x, MP.player.vel.z) };
    });
    assert.ok(!r.erro, r.erro);
    console.log(`      no monitor, depois do headset: ${r.v.toFixed(3)} m/s`);
    assert.ok(Math.abs(r.v - PC.andar) < 0.15,
      `no monitor o jogador andou a ${r.v.toFixed(3)} m/s — o desktop é 5,200`);
  });
});

describe('a velocidade é ESCOLHÍVEL pelo painel — senão não existe', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  /* Os três perfis existiam e NENHUM tinha chamador em produção: o painel não
     tinha linha de velocidade, e `proximo()`/`preferir()` só eram tocados por
     teste. Isso não era "uma opção faltando" — era um defeito de jogabilidade
     com consequência medida: a zona de gás fecha a 5,50 / 4,38 / 3,46 m/s nas
     três primeiras fases e o perfil de conforto corre a 2,80. Quem jogava de
     headset não conseguia fugir do gás e não tinha como pedir mais velocidade.
     Opção sem caminho até ela é o mesmo que não existir. */
  let h;
  before(async () => { h = await bootEmVR(bootGame, { port: 3506 }); });
  after(async () => { if (h) await h.close(); });

  it('o painel oferece a linha de VELOCIDADE', async () => {
    const r = await h.play(async () => {
      const G = window.__game;
      G.XRUI.abrir('pausa');
      await new Promise(res => setTimeout(res, 400));
      const e = G.XRUI.estado();
      return { ids: e.linhas.map(l => l.id), linha: e.linhas.find(l => l.id === 'andarPerfil') || null };
    });
    assert.ok(r.linha, `o painel de pausa não tem linha de velocidade: ${r.ids.join(', ')}`);
    assert.equal(r.linha.tipo, 'escolha');
    assert.ok(r.linha.val && r.linha.val.length > 0, 'a linha não mostra o perfil em vigor');
  });

  it('acionar a linha CICLA o perfil e a velocidade muda de verdade', async () => {
    const r = await h.play(async () => {
      const G = window.__game;
      G.XRUI.abrir('pausa');
      await new Promise(res => setTimeout(res, 350));
      const vistos = [];
      for (let i = 0; i < 4; i++) {
        vistos.push({ perfil: G.XRAndar.plano.perfil, correr: +G.XRAndar.correr.toFixed(2) });
        G.XRUI.acionarPorId ? G.XRUI.acionarPorId('andarPerfil') : G.XRAndar.proximo();
        await new Promise(res => setTimeout(res, 250));
      }
      G.XRAndar.preferir({ velocidade: 'conforto' });
      return vistos;
    });
    const perfis = new Set(r.map(v => v.perfil));
    assert.ok(perfis.size >= 3, `o ciclo só alcançou ${[...perfis].join(', ')}`);
    const corridas = r.map(v => v.correr);
    assert.ok(Math.max(...corridas) >= 6.0,
      `a corrida mais rápida oferecida é ${Math.max(...corridas)} m/s — o gás fecha a 5,50 m/s ` +
      'nas primeiras fases, então o jogador de headset ficaria sem como fugir');
  });
});
