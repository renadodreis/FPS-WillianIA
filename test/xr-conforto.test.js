/* ================================================================
   QA — A CATEGORIA DE CONFORTO INTEIRA (critérios A3, A4, A5 e o A6 do
   caminho de conforto), num arquivo só.

   POR QUE ESTE ARQUIVO EXISTE, E POR QUE ELE É POR CATEGORIA E NÃO POR
   MÓDULO

   O critério A6 ficou vermelho QUATRO rodadas seguidas mudando de CAUSA a
   cada uma, e nas duas últimas o que derrubou a categoria não foi um
   defeito de conforto: foi uma correção de outra frente. A velocidade
   escolhível — que resolveu o jogador de headset não conseguir fugir do
   gás — trouxe junto a rampa do PC (A4 caiu: 281,1 ms contra teto de 150)
   e um fluxo óptico maior (A5 caiu: 0,01148 e 0,01361 contra teto de
   0,0100). Ninguém errou. O perfil novo não tinha como saber que
   alimentava a vinheta e o critério de aceleração, porque não havia um
   lugar onde isso estivesse escrito, nem um teste que perguntasse.

   Daí o desenho deste arquivo:

   - **A auditoria varre TODO perfil que existir** (`ORDEM` de
     js/xr/xrlocomotion.js), não os três de hoje. Perfil novo que quebre
     conforto nasce vermelho, com nome e número, sem ninguém precisar
     lembrar de acrescentar um caso aqui. É esse laço que impede a quinta
     reincidência — não a lista de asserções.
   - **A régua é uma só** (`LIMITES` de js/xr/xrcomfort.js) e as exceções
     são DECLARADAS, com dono, motivo e condição de validade. Exceção que
     não se pode ler é ambiguidade; ambiguidade foi o que deixou A4 cair.
   - **A aritmética da auditoria é a MESMA do produto.** `auditar()` roda a
     receita do §12 com a função que a vinheta usa em cada frame. Auditoria
     com conta própria vira uma segunda verdade que diverge em silêncio.

   O QUE CADA BLOCO MEDE

   1. O CONTRATO (puro): a auditoria morde, e as exceções são só as
      declaradas.
   2. A VINHETA (three de verdade, sem dublê): que ela CHEGA A ZERO — que é
      o defeito de raiz do A5 — e que continua fechando, que é o jeito
      errado de deixar A5 verde.
   3. O PRODUTO (sessão `immersive-vr` real, IWER): a receita literal do
      §12 no PIOR perfil, lida da instância do jogo, com contagem de frames
      de render para o caso não poder passar com a sessão parada.

   POR QUE CADA ASSERÇÃO PODE FALHAR está escrito ACIMA DELA, e todas foram
   provadas por mutação (a prova está no relatório da rodada).
   ================================================================ */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { CHROME, bootGame } = require('./helpers/harness');
const { bootEmVR } = require('./helpers/iwer');

const PORT = 3502;

/* As constantes do PC, como o game.js as declara. Repetidas aqui de
   propósito, como em test/xr-locomotion.test.js: se o desktop mudar, a
   auditoria abaixo passa a medir outra coisa e alguém tem que olhar. */
const PC = { andar: 5.2, correr: 8.6, agachar: 2.6, mirar: 3.4, aceleraSolo: 11, aceleraAr: 2.6 };

const DT = 1 / 72;   // um frame do Quest 3; condição declarada das simulações

/* ================================================================
   1. O CONTRATO DE CONFORTO — puro, sem navegador, sem three.
   ================================================================ */
describe('o contrato de conforto vale para TODO perfil que existir', () => {
  let C, L, TRES;
  before(async () => {
    C = await import('../js/xr/xrcomfort.js');
    L = await import('../js/xr/xrlocomotion.js');
    TRES = await import('three');
  });

  it('a auditoria aprova os perfis de hoje — e diz por qual exceção, quando há', () => {
    /* ESTE É O GUARDA DA CATEGORIA. Falha no instante em que alguém
       acrescentar um perfil de velocidade que estoure a vinheta parada ou a
       rampa sem declarar exceção — que é exatamente como A4 e A5 caíram na
       rodada passada, sem ninguém perceber até a validação. O laço é sobre
       `ORDEM`, então perfil novo entra aqui sozinho. */
    const relatorio = [];
    for (const nome of L.ORDEM) {
      const plano = L.politicaDeVelocidade(PC, nome);
      const r = C.auditar(plano);
      relatorio.push(`${nome}: t95 ${(r.t95 * 1000).toFixed(0)} ms · pico ` +
        `${r.pico.toFixed(4)} · parado ${r.residuo.toFixed(5)}` +
        (r.excecoes.length ? ` · exceção ${r.excecoes.map(e => e.criterio).join('+')}` : ''));
      assert.equal(r.ok, true,
        `perfil ${nome} reprova em conforto: ` +
        r.faltas.map(f => `${f.criterio} ${f.limite} = ${f.medido} (teto ${f.teto})`).join('; '));
    }
    console.log('      ' + relatorio.join('\n      '));
  });

  it('a auditoria MORDE: perfil com a rampa do PC e sem exceção reprova em A4', () => {
    /* Sem este caso o anterior poderia estar verde por a auditoria não
       reprovar nada. Aqui a mesma função recebe o perfil que a rodada
       passada produziu sem querer — velocidade e rampa do PC, com um nome
       que não tem exceção — e tem que reprovar. */
    const r = C.auditar({ perfil: 'turbo', escala: 1, ...PC });
    assert.equal(r.ok, false, 'um perfil com a rampa do PC passou na auditoria');
    assert.deepEqual(r.faltas.map(f => f.criterio), ['A4']);
    assert.ok(Math.abs(r.faltas[0].medido - 3 / PC.aceleraSolo) < 1e-9,
      `a falta de A4 relatou t95 = ${r.faltas[0].medido}`);
  });

  it('a auditoria MORDE em A3: o perfil PADRÃO responde pelos tetos de velocidade', () => {
    /* A3 é o único critério deste contrato com cláusula de padrão — o
       critério oferece a velocidade de PC como opção declarada, então cobrar
       o teto de quem escolheu a opção seria proibir a opção. Falha se a
       cláusula for aplicada larga demais (ninguém responde) ou apertada
       demais (a opção deixa de poder existir). */
    const nome = L.PADRAO.perfil;
    assert.equal(C.auditar({ perfil: nome, escala: 1, ...PC }).faltas
      .filter(f => f.criterio === 'A3').length, 2, 'o perfil padrão não responde por A3');
    assert.equal(C.auditar({ perfil: 'alcance', escala: 1, ...PC }).faltas
      .some(f => f.criterio === 'A3'), false, 'A3 foi cobrado de um perfil que não é o padrão');
  });

  it('a auditoria roda a MESMA vinheta do produto, não uma cópia da conta', () => {
    /* A5 não é mais função da velocidade — a abertura passou a terminar, e é
       por isso que nenhum perfil reprova nela. O que sobra é uma armadilha
       para a CURVA: se `passoTunel` voltar a ser exponencial pura, este
       número deixa de ser zero. Só que isso só vale se a auditoria rodar a
       função do produto; auditoria com aritmética própria é uma segunda
       verdade que diverge em silêncio. Este caso cobra que os dois números
       (o da auditoria e o da instância que o jogo usa) sejam o MESMO. */
    const THREE = TRES;
    for (const nome of L.ORDEM) {
      const plano = L.politicaDeVelocidade(PC, nome);
      const r = C.auditar(plano);
      const c = C.createXrComfort({ THREE, camera: new THREE.PerspectiveCamera() });
      c.anexar();
      for (let t = 0; t < 2; t += DT) c.update(DT, plano.andar, plano.correr, 0);
      const picoReal = c.tunel;
      for (let t = 0; t < 1.5; t += DT) c.update(DT, 0, plano.correr, 0);
      assert.ok(Math.abs(r.pico - picoReal) < 1e-12,
        `${nome}: a auditoria diz pico ${r.pico} e a vinheta faz ${picoReal}`);
      assert.equal(r.residuo, c.tunel, `${nome}: resíduo auditado ${r.residuo} ≠ ${c.tunel} do produto`);
      assert.equal(r.residuo, 0, `${nome}: a receita do §12 deixou ${r.residuo} de vinheta`);
    }
  });

  it('a exceção de A4 é do `paridade`, e só vale enquanto ele for paridade INTEIRA', () => {
    /* Falha se a exceção virar um cheque em branco. Um perfil "rápido mas
       não idêntico ao PC" não tem o argumento de equilíbrio competitivo que
       sustenta a exceção — ele é só uma rampa longa —, então a exceção não
       pode alcançá-lo. */
    const paridade = L.politicaDeVelocidade(PC, 'paridade');
    assert.equal(C.auditar(paridade).ok, true);
    assert.equal(C.auditar(paridade).excecoes[0].criterio, 'A4');
    const quaseParidade = { ...paridade, escala: 0.9, andar: PC.andar * 0.9 };
    const r = C.auditar(quaseParidade);
    assert.equal(r.ok, false, 'a exceção de paridade cobriu um perfil que não é paridade');
    assert.ok(r.faltas.some(f => f.criterio === 'A4'), 'a falta de A4 sumiu junto com a paridade');
  });

  it('a amarra da exceção confere as CINCO condições — e o perfil FORJADO reprova', () => {
    /* ESTE É O CASO QUE FALTAVA, e ele é literal: o objeto abaixo é o que o
       validador da rodada 10 passou para o `auditar()` do próprio módulo e
       recebeu de volta `ok: true`, `t95: 0,7500 s` (CINCO vezes o teto) e a
       exceção de A4 carimbada. O motivo era que `vale` conferia uma das cinco
       condições que a exceção declara ("escala 1 e os quatro números do PC
       bit por bit"): só a escala.

       Uma exceção que carimba isso não é amarra, é cheque em branco para o
       próximo perfil que alguém chamar de `paridade`. Falha se a amarra
       voltar a olhar menos do que declara, ou se o plano deixar de carregar a
       base do PC (`pc`), que é o que torna as outras quatro checáveis. */
    const forjado = { perfil: 'paridade', escala: 1, andar: 12, correr: 25, aceleraSolo: 4 };
    const r = C.auditar(forjado);
    assert.equal(r.ok, false,
      `o perfil forjado passou com t95 de ${(r.t95 * 1000).toFixed(0)} ms e exceção ` +
      `${r.excecoes.map(e => e.criterio).join('+') || 'nenhuma'}`);
    assert.equal(r.excecoes.length, 0, 'a exceção cobriu um perfil que não prova ser paridade');
    assert.ok(r.faltas.some(f => f.criterio === 'A4'), 'a falta de A4 não apareceu no forjado');

    /* E cada uma das cinco condições, sozinha, derruba a exceção: um perfil
       que é paridade em tudo MENOS num campo não é paridade inteira. */
    const bom = L.politicaDeVelocidade(PC, 'paridade');
    assert.equal(C.auditar(bom).excecoes.length, 1, 'a paridade de verdade perdeu a exceção');
    for (const campo of ['andar', 'correr', 'agachar', 'mirar']) {
      const torto = { ...bom, [campo]: bom[campo] * 0.5 };
      assert.equal(C.auditar(torto).ok, false,
        `perfil com ${campo} diferente do PC ainda recebeu a exceção de paridade`);
    }
    assert.equal(C.auditar({ ...bom, escala: 0.99 }).ok, false, 'escala ≠ 1 recebeu a exceção');
    const semBase = { ...bom }; delete semBase.pc;
    assert.equal(C.auditar(semBase).ok, false,
      'plano sem a base do PC recebeu a exceção — sem base não há como PROVAR paridade');
  });

  it('o mecanismo de exceção morde por lista, não por confiança no nome', () => {
    /* A lista real tem uma entrada só, e um dia pode ter zero. Testar o
       mecanismo apenas com a lista real deixaria este caso vazio no instante
       em que ela mudasse — por isso a lista entra por parâmetro. Falha se
       `auditar` passar a ignorar exceções, ou a aceitar uma cuja condição de
       validade diz não. */
    const paridade = L.politicaDeVelocidade(PC, 'paridade');
    const nunca = [{ criterio: 'A4', limite: 'rampa95S', perfil: 'paridade',
      porque: 'exceção sintética deste teste', custo: 'nenhum', vale: () => false }];
    assert.equal(C.auditar(paridade, nunca).ok, false,
      'a exceção foi aplicada mesmo com a condição de validade dizendo não');
    assert.equal(C.auditar(paridade, []).ok, false, 'com a lista vazia a rampa longa passou');
    assert.equal(C.auditar(paridade).ok, true, 'a lista real deixou de cobrir a paridade');
  });

  it('a exceção declara MOTIVO e CUSTO — exceção sem texto é ambiguidade', () => {
    /* Falha se alguém acrescentar uma exceção só com o nome do perfil. A
       rodada que derrubou A4 tinha a decisão certa tomada e NÃO ESCRITA:
       o custo existia, ninguém tinha registrado, e a validação o encontrou
       como se fosse defeito. */
    for (const e of C.EXCECOES) {
      assert.ok(e.criterio && e.limite && e.perfil, `exceção incompleta: ${JSON.stringify(e)}`);
      assert.ok(typeof e.porque === 'string' && e.porque.length > 80,
        `exceção de ${e.criterio}/${e.perfil} sem motivo escrito`);
      assert.ok(typeof e.custo === 'string' && e.custo.length > 40,
        `exceção de ${e.criterio}/${e.perfil} sem o custo declarado`);
    }
  });

  it('A5 não tem exceção nenhuma, e o perfil PADRÃO não tem exceção nenhuma', () => {
    /* Falha se a saída fácil for tomada: dar exceção à vinheta em vez de
       fazê-la zerar, ou isentar o padrão de A3. A vinheta parada é o único
       número deste contrato que vale igual para todo mundo — o jogador não
       escolheu ficar com a periferia fechada, ele só parou de andar. */
    for (const e of C.EXCECOES) {
      assert.notEqual(e.criterio, 'A5', 'apareceu exceção para a vinheta parada');
      assert.notEqual(e.perfil, L.PADRAO.perfil,
        `o perfil padrão (${L.PADRAO.perfil}) ganhou exceção de ${e.criterio}`);
    }
  });

  it('a régua é a do critério de aceite, e cobre os tetos que a auditoria emite', () => {
    /* Falha se alguém afrouxar um teto para ficar verde — que é o movimento
       que o próprio validador recusou fazer ("não vou mover a régua para
       preservar um verde"). E falha se a auditoria passar a emitir um
       limite que não existe no contrato, que é como um teto vira número
       solto no meio do código. */
    assert.equal(C.LIMITES.vinhetaParado, 0.01);
    assert.equal(C.LIMITES.rampa95S, 0.15);
    const r = C.auditar({ perfil: 'turbo', escala: 1, ...PC });
    for (const f of r.faltas) {
      assert.ok(f.limite in C.LIMITES, `a auditoria emitiu o limite '${f.limite}', que não está em LIMITES`);
      assert.equal(f.teto, C.LIMITES[f.limite]);
    }
  });
});

/* ================================================================
   2. A VINHETA — com o three de verdade, não com dublê.

   O defeito de raiz do A5: a abertura é uma exponencial, e exponencial
   NÃO CHEGA. `res/pico` medido em 0,0212 nos três perfis — a mesma taxa,
   o pico é que subia. Quem "consertou" A5 na rodada passada consertou o
   pico (a velocidade caiu junto); o rabo continuou lá e voltou a reprovar
   assim que o jogador ganhou de volta a velocidade.
   ================================================================ */
describe('a vinheta de túnel chega a ZERO', () => {
  let C, THREE;
  before(async () => {
    C = await import('../js/xr/xrcomfort.js');
    THREE = await import('three');
  });

  const novo = () => {
    const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 100);
    const c = C.createXrComfort({ THREE, camera });
    c.anexar();
    return { c, camera };
  };
  const rodar = (c, s, vel, vmax, giro = 0) => {
    for (let t = 0; t < s; t += DT) c.update(DT, vel, vmax, giro);
    return c.tunel;
  };

  it('a receita literal do §12 zera a periferia em TODO perfil — inclusive no mais rápido', () => {
    /* Andar 2 s, parar 1,5 s, ler. Falha com a abertura exponencial pura,
       que era o HEAD: 0,00654 · 0,01074 · 0,01148 (conforto · alcance ·
       paridade), os dois últimos acima do teto de 0,0100. */
    const perfis = { conforto: 2.8 / 8.6, alcance: 6.0 / 8.6, paridade: 1 };
    for (const [nome, k] of Object.entries(perfis)) {
      const { c } = novo();
      const pico = rodar(c, 2, PC.andar * k, PC.correr * k);
      const res = rodar(c, 1.5, 0, PC.correr * k);
      console.log(`      ${nome.padEnd(9)} pico ${pico.toFixed(4)} · parado 1,5 s ${res.toFixed(5)}`);
      assert.ok(pico > 0.25, `${nome}: pico ${pico.toFixed(4)} — a vinheta nem chegou a fechar`);
      assert.ok(res <= C.LIMITES.vinhetaParado,
        `${nome}: parado a periferia ainda está ${res.toFixed(5)} fechada (teto ${C.LIMITES.vinhetaParado})`);
    }
  });

  it('o túnel CHEIO abre até ZERO EXATO, e dentro do tempo declarado', () => {
    /* O caso que ataca a raiz em vez do sintoma: qualquer que seja o pico,
       a periferia volta INTEIRA — `=== 0`, não "quase". Falha na exponencial
       pura por dois motivos ao mesmo tempo: ela nunca é zero e, saindo de
       1,0, ainda está em 0,0025 depois de 1 s. */
    const { c } = novo();
    const pico = rodar(c, 2, 100, 8.6);          // batente: túnel cheio
    assert.ok(pico > 0.99, `o túnel só chegou a ${pico.toFixed(4)}: o caso não mediu abertura cheia`);
    let t = 0;
    while (c.tunel > 0 && t < 5) { c.update(DT, 0, 8.6, 0); t += DT; }
    console.log(`      túnel cheio → zero em ${(t * 1000).toFixed(0)} ms`);
    assert.equal(c.tunel, 0, `a vinheta parou em ${c.tunel} em vez de zerar`);
    assert.ok(t <= C.LIMITES.aberturaS,
      `levou ${t.toFixed(3)} s para abrir (contrato ${C.LIMITES.aberturaS} s)`);
  });

  it('girar no ajuste de FÁBRICA (180 °/s) também zera — e é a ação mais frequente do jogo', () => {
    /* A receita do §12 só anda, então este buraco nunca apareceu numa
       validação: parar de GIRAR deixava 0,01805 de resíduo, acima do teto,
       no modo e na velocidade que vêm de fábrica. Falha se a abertura voltar
       a ser exponencial pura. */
    const { c } = novo();
    const pico = rodar(c, 2, 0, 2.8, 180 * Math.PI / 180);
    const res = rodar(c, 1.5, 0, 2.8, 0);
    console.log(`      giro 180 °/s: pico ${pico.toFixed(4)} · parado 1,5 s ${res.toFixed(5)}`);
    assert.ok(pico > 0.8, `girando no padrão a vinheta só fechou ${pico.toFixed(2)}`);
    assert.ok(res <= C.LIMITES.vinhetaParado,
      `parou de girar e a periferia continua ${res.toFixed(5)} fechada`);
  });

  it('e continua FECHANDO — o jeito errado de deixar A5 verde é desligar a vinheta', () => {
    /* Falha se alguém zerar a vinheta baixando o teto, alargando a zona
       morta de velocidade ou simplesmente parando de fechar. A proteção
       periférica é o motivo de o módulo existir; A5 cobra que ela ABRA, não
       que ela suma. */
    const { c } = novo();
    const correndo = rodar(c, 2, 2.8, 2.8);
    assert.ok(correndo > 0.9, `correndo a periferia só fechou ${(correndo * 100).toFixed(0)} %`);
  });

  it('desligar e religar não devolve o túnel velho', () => {
    /* Falha com o estado congelado em `soltar()`: correr, abrir o painel,
       desligar a vinheta, parar, religar — e a periferia voltava fechada no
       valor de quando o jogador corria. Vinheta "presa ligada" é o que a
       literatura mostra AUMENTANDO o enjoo. */
    const { c } = novo();
    rodar(c, 2, 2.8, 2.8);
    assert.ok(c.tunel > 0.9);
    c.soltar();
    c.anexar();
    c.update(DT, 0, 2.8, 0);
    assert.equal(c.tunel, 0, `religou com a periferia ${c.tunel.toFixed(3)} fechada`);
  });

  it('terceiro que esconde a malha não congela o estado (a cinemática da cidade faz isso)', () => {
    /* `city-destruction-client.js:154-157` salva `camera.children[i].visible`
       e restaura POR ÍNDICE; a vinheta é filha da câmera. Falha se `update`
       voltar a desistir quando a malha está invisível: o túnel ficava parado
       no valor de antes da cinemática e voltava FECHADO. */
    const { c } = novo();
    rodar(c, 2, 2.8, 2.8);
    c.malha.visible = false;                       // a cinemática, sem avisar ninguém
    rodar(c, 1.5, 0, 2.8);
    assert.equal(c.tunel, 0, `escondida, a vinheta congelou em ${c.tunel.toFixed(4)}`);
    assert.equal(c.malha.visible, true, 'a visibilidade da vinheta não é decidida pelo módulo');
  });

  it('a vinheta é filha da CÂMERA e não escreve NADA nela — nem fov (A6)', () => {
    /* A6 proíbe nominalmente "mudar o campo de visão" e "mudar a orientação
       ou posição da câmera sem entrada do usuário". Vinheta por FOV animado é
       o atalho clássico e é exatamente o que A6 recusa. Falha se o módulo
       passar a escrever na câmera; e falha se a esfera for pendurada em outro
       pai, porque aí ela escorrega quando o jogador vira a cabeça.

       A MEDIÇÃO É POR FRAME, e isso não é preciosismo: a primeira versão
       deste caso lia o fov só no fim, depois de o túnel já ter voltado a
       zero. Uma vinheta por FOV proporcional ao túnel devolve o fov original
       junto com a periferia — o mutante `camera.fov = 75 − tunel·10` passava
       no caso inteiro. Um valor igual no fim não prova nada sobre o meio. */
    const { c, camera } = novo();
    const antes = { fov: camera.fov, p: camera.position.clone(), q: camera.quaternion.clone() };
    let piorFov = 0, piorPos = 0, piorQuat = 0, tunelMax = 0;
    const frame = (vel, giro) => {
      c.update(DT, vel, 2.8, giro);
      piorFov = Math.max(piorFov, Math.abs(camera.fov - antes.fov));
      piorPos = Math.max(piorPos, camera.position.distanceTo(antes.p));
      piorQuat = Math.max(piorQuat, camera.quaternion.angleTo(antes.q));
      tunelMax = Math.max(tunelMax, c.tunel);
    };
    for (let t = 0; t < 1; t += DT) frame(2.8, 3);
    c.piscar();
    for (let t = 0; t < 1; t += DT) frame(0, 0);
    assert.ok(tunelMax > 0.8, `o túnel só chegou a ${tunelMax.toFixed(3)}: nada estava trabalhando`);
    assert.equal(c.malha.parent, camera, 'a vinheta não é filha da câmera');
    assert.equal(piorFov, 0, `a vinheta mexeu no fov em algum frame (pior desvio ${piorFov})`);
    assert.equal(piorPos, 0, 'a vinheta empurrou a câmera');
    assert.equal(piorQuat, 0, 'a vinheta girou a câmera');
  });

  it('a piscada do passo termina, e não some a vinheta junto', () => {
    /* Falha se a piscada passar a decair pela mesma via do túnel (e virar
       exponencial que não acaba) ou se `piscar()` deixar de existir: o passo
       de 45° sem piscada lê como "a tela girou sozinha". */
    const { c } = novo();
    c.piscar();
    assert.equal(c.piscando, 1);
    let t = 0;
    while (c.piscando > 0 && t < 1) { c.update(DT, 0, 2.8, 0); t += DT; }
    console.log(`      piscada dura ${(t * 1000).toFixed(0)} ms`);
    assert.equal(c.piscando, 0);
    assert.ok(t >= 0.05 && t <= 0.15, `piscada de ${(t * 1000).toFixed(0)} ms (faixa útil 60–100 ms)`);
  });
});

/* ================================================================
   3. O PRODUTO — dentro de uma sessão `immersive-vr` de verdade (IWER).

   O bloco 2 mede o módulo. Este mede o JOGO: a instância que o game.js
   conduz (`XR.conforto`), com a velocidade que o painel escolheu, pelo
   analógico. Nenhum frame é forçado aqui — quem chama o frame é a sessão,
   e cada leitura carrega `renderer.info.render.frame` para o caso não
   poder passar com a sessão congelada.
   ================================================================ */
describe('a periferia volta inteira dentro do headset', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h;
  before(async () => { h = await bootEmVR(bootGame, { port: PORT }); });
  after(async () => { if (h) await h.close(); });

  it('receita do §12 no PIOR perfil (IGUAL AO PC): parado, a vinheta é zero', async () => {
    /* É o caso que a validação reprovou com 0,01361. Falha se a abertura
       voltar a ser exponencial pura, e falha se a fiação parar de alimentar
       a vinheta com a corrida do perfil em vigor. O perfil é devolvido ao
       padrão no fim para não vazar para os outros casos. */
    const r = await h.play(async () => {
      const G = window.__game, MP = window.__MP, A = window.__A;
      const f = () => MP.renderer.info.render.frame;
      G.XRAndar.preferir({ velocidade: 'paridade' });
      A.solta(); await A.espera(400);
      const f0 = f();
      A.stick('left', 0, -1);
      await A.espera(2000);
      const pico = G.XR.conforto.tunel;
      const vel = Math.hypot(MP.player.vel.x, MP.player.vel.z);
      A.solta();
      await A.espera(1500);
      const parado = G.XR.conforto.tunel;
      G.XRAndar.preferir({ velocidade: 'conforto' });
      return { pico, parado, vel, frames: f() - f0 };
    });
    console.log(`      andou a ${r.vel.toFixed(2)} m/s · pico ${r.pico.toFixed(4)} · ` +
      `parado 1,5 s ${r.parado.toFixed(5)} · ${r.frames} frames de render`);
    assert.ok(r.frames > 100, `só ${r.frames} frames de render na janela: sessão parada`);
    assert.ok(r.vel > 4.5, `andou a ${r.vel.toFixed(2)} m/s — o perfil de paridade não entrou`);
    assert.ok(r.pico > 0.4, `a vinheta só fechou ${r.pico.toFixed(3)} andando a 5,2 m/s`);
    assert.equal(r.parado, 0, `parado, a periferia continua ${r.parado.toFixed(5)} fechada`);
  });

  it('e o fov do jogador não muda enquanto a vinheta trabalha (A6)', async () => {
    /* A6, no caminho de conforto: nada além do pescoço move a vista. Falha
       se alguém trocar a esfera por vinheta de FOV, que é o atalho que a
       lista de "coisas ruins" da Meta cita nominalmente. */
    const r = await h.play(async () => {
      const G = window.__game, MP = window.__MP, A = window.__A;
      const fov0 = MP.camera.fov;
      const f0 = MP.renderer.info.render.frame;
      A.solta(); await A.espera(300);
      A.stick('left', 0, -1);
      A.stick('right', 1, 0);                     // andando E girando: os dois canais
      await A.espera(1200);
      const durante = { fov: MP.camera.fov, tunel: G.XR.conforto.tunel };
      A.solta();
      await A.espera(600);
      return { fov0, durante, fovDepois: MP.camera.fov, frames: MP.renderer.info.render.frame - f0 };
    });
    console.log(`      fov ${r.fov0} → ${r.durante.fov} → ${r.fovDepois} · ` +
      `túnel ${r.durante.tunel.toFixed(3)} · ${r.frames} frames`);
    assert.ok(r.frames > 40, `só ${r.frames} frames de render: sessão parada`);
    assert.ok(r.durante.tunel > 0.2, `o túnel ficou em ${r.durante.tunel.toFixed(3)}: nada estava trabalhando`);
    assert.equal(r.durante.fov, r.fov0, 'o fov mudou durante a locomoção');
    assert.equal(r.fovDepois, r.fov0, 'o fov não voltou');
  });
});
