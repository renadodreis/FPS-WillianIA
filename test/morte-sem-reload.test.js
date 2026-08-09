'use strict';
/* ================================================================
   QA — MORTE SEM RECARREGAR A PÁGINA (etapa 4).

   Contrato: docs/2026-08-09-menu-unico.md (itens 5, 6 e 7).

   O que existia antes desta etapa:

   · A morte no SOLO só saía por `location.reload()` (game.js), e era a
     única das quatro chamadas de reload do projeto SEM hook — logo,
     inalcançável por teste. O harness ainda forçava
     `__MP_active = __BR_active = true` em TODA chamada de bootGame(),
     o que tornava a branch de morte solo matematicamente impossível de
     alcançar em CI. Fechado com a opção `online` (aditiva, default
     byte-idêntico ao histórico).
   · `.show` do #deathScreen era removido em UM lugar do repo inteiro
     (br-game.js, fluxo BR). No solo NADA removia: o reset era o reload.
   · #deathScreen (z 200) cobre o #overlay (z 100) e não declara
     pointer-events. Morrer com o menu aberto deixava um menu
     interativo, invisível e inalcançável atrás da tela de morte.
   · `reloadBlocked()` e o gate de tiro checavam `player.dead`; o gate
     de `playerUpdate` NÃO. Com o ponteiro ainda travado (nada soltava o
     pointer lock na morte), o jogador andava, pulava e olhava por 3,6 s
     com "VOCÊ MORREU" na tela.

   O RISCO CENTRAL da etapa, e por isso ele tem teste próprio aqui:
   reiniciar a partida no solo NÃO pode virar caminho de reset de estado
   em BR. Ninguém pode usar "JOGAR DE NOVO" pra se curar, reaparecer ou
   zerar cooldown numa partida online — a partida é do servidor.
   ================================================================ */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { CHROME, bootGame } = require('./helpers/harness');

const raiz = path.join(__dirname, '..');
const leia = f => fs.readFileSync(path.join(raiz, f), 'utf8');
const espera = ms => new Promise(r => setTimeout(r, ms));

describe('morte sem reload (fontes)', () => {
  const game = leia('game.js');
  const html = leia('index.html');
  const mpc = leia('multiplayer-client.js');
  const br = leia('br-game.js');

  it('dado game.js, então a morte no solo não recarrega mais a página', () => {
    /* O ÚNICO location.reload que pode sobrar em game.js é o da seed
       divergente (o mundo mudou de verdade — reconstruir é o caminho
       limpo), e mesmo esse é hookável por __MP_reload. */
    // só CÓDIGO: os comentários citam o reload de propósito (é a história)
    const codigo = game.replace(/\/\*[\s\S]*?\*\//g, '').split('\n')
      .filter(l => !/^\s*\/\//.test(l));
    const reloads = codigo.filter(l => l.includes('location.reload()'));
    assert.equal(reloads.length, 1,
      `game.js tem ${reloads.length} chamadas de location.reload():\n${reloads.join('\n')}`);
    assert.ok(reloads[0].includes('window.__MP_reload || (() => location.reload())'),
      `o reload que sobrou em game.js não é hookável: ${reloads[0].trim()}`);
    // e o agendamento de 3,6 s da morte solo não existe mais
    assert.ok(!/setTimeout\(\(\) => location\.reload\(\), 3600\)/.test(game),
      'o reload de 3,6 s da morte solo continua agendado');
  });

  it('dado game.js, então o gate de playerUpdate concorda com reloadBlocked() e com o gate de tiro', () => {
    const at = game.indexOf('playerUpdate(dt, t);');
    assert.ok(at > 0, 'a chamada de playerUpdate sumiu do tick');
    const linha = game.slice(game.lastIndexOf('\n', at) + 1, at + 20);
    assert.match(linha, /player\.dead/,
      `o gate de playerUpdate ainda não checa player.dead: ${linha.trim()}`);
    // as outras duas listas seguem checando (é com elas que a de cima alinha)
    assert.match(game.slice(game.indexOf('function reloadBlocked()'), game.indexOf('function reloadBlocked()') + 220),
      /player\.dead/, 'reloadBlocked() deixou de checar player.dead');
  });

  it('dado index.html, então a tela de morte tem JOGAR DE NOVO e VOLTAR AO MENU', () => {
    const at = html.indexOf('id="deathScreen"');
    assert.ok(at > 0, '#deathScreen sumiu do index.html');
    const bloco = html.slice(at, html.indexOf('id="touchUI"'));
    for (const id of ['deathBtns', 'btnRetry', 'btnDeathMenu'])
      assert.ok(bloco.includes(`id="${id}"`), `#${id} não existe dentro do #deathScreen`);
    // nascem escondidos: no BR o desfecho é do servidor (recap → espectador)
    assert.match(bloco, /id="deathBtns"[^>]*\shidden/,
      '#deathBtns não nasce escondido — no BR ele apareceria por cima do recap');
  });

  it('dado multiplayer-client.js, então o tapa-buraco do #deathScreen foi removido', () => {
    const at = mpc.indexOf('overlay(html) {');
    assert.ok(at > 0, 'LOBBY.overlay sumiu');
    const corpo = mpc.slice(at, at + 900);
    assert.ok(!/deathScreen/.test(corpo),
      'LOBBY.overlay ainda tira o .show do #deathScreen na mão — o setPaused já faz isso');
  });

  it('dado br-game.js, então nextMatch continua recarregando a página (mapa novo = mundo novo)', () => {
    /* DECISÃO REGISTRADA: a próxima partida vem com SEED NOVA (o próprio
       painel de resultado diz "próxima partida (mapa novo)"). O worldgen
       roda no carregamento do módulo; reusar o reinício de partida do solo
       deixaria o cliente com o mapa VELHO e o servidor com o novo. */
    assert.match(br, /socket\.on\('nextMatch'[^\n]*location\.reload\(\)/,
      'nextMatch deixou de recarregar — o mapa novo do servidor não chegaria ao cliente');
    assert.ok(!/nextMatch[^\n]*restartMatch/.test(br),
      'nextMatch passou a reusar o reinício de partida do solo — o mundo dessincroniza');
  });

  it('dado br-game.js, então o espectador limpa a morte pelo dono da tela', () => {
    /* O `.show` do #deathScreen era removido em UM lugar do repo inteiro (aqui)
       e em nenhum no solo. Agora quem sabe o que é "sair do estado MORTO" é o
       game.js — inclusive esconder os botões do solo, que o classList sozinho
       deixaria pendurados. */
    assert.match(br, /G\.Morte\.esconder\(\)/,
      'o espectador do BR não usa mais o dono da tela de morte');
    assert.ok(!/deathScreen/.test(br),
      'br-game.js ainda mexe no #deathScreen na mão (estado meio-limpo)');
  });

  it('dado game.js, então o reinício de partida recusa quando a partida é do servidor', () => {
    const at = game.indexOf('function restartMatch(');
    assert.ok(at > 0, 'restartMatch() não existe');
    const corpo = game.slice(at, at + 700);
    assert.match(corpo, /__BR_active/,
      'restartMatch() não checa __BR_active — vira caminho de reset de estado em BR');
    assert.match(corpo, /__MP_active/, 'restartMatch() não checa __MP_active');
  });
});

describe('morte solo no navegador (Chrome headless)', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h;
  const PORT = 3304;
  before(async () => {
    /* online: false é o gancho novo do harness. Sem ele o harness força
       __MP_active = __BR_active = true e a branch de morte SOLO é
       matematicamente inalcançável em CI. */
    h = await bootGame({ port: PORT, online: false });
    await h.play(() => { window.QA.MP.player.invulnUntil = Infinity; });
  });
  after(async () => { if (h) await h.close(); });

  const matar = () => h.play(() => {
    const MP = window.QA.MP;
    MP.player.invulnUntil = 0;
    MP.player.dead = false;
    MP.player.armor = 0;
    MP.player.health = 40;
    MP.playerDamage(999, null, { type: 'test' });
    return MP.player.dead;
  });

  it('dada a morte no solo, então a tela de morte aparece COM saída — e nada recarrega', async () => {
    const morreu = await matar();
    assert.ok(morreu, 'o dano letal não matou o jogador');
    await espera(1100); // a tela entra 600 ms depois da morte
    const r = await h.play(() => {
      const ds = document.getElementById('deathScreen');
      const btns = document.getElementById('deathBtns');
      return {
        naTela: ds.classList.contains('show'),
        display: getComputedStyle(ds).display,
        comSaida: !!btns && !btns.hidden,
        sub: (document.getElementById('deathSub').textContent || '').trim(),
        pausado: window.QA.MP.state.paused,
        overlay: getComputedStyle(document.getElementById('overlay')).display,
        travado: !!document.pointerLockElement,
      };
    });
    assert.ok(r.naTela, 'a tela de morte não apareceu');
    assert.notEqual(r.display, 'none', 'a tela de morte ficou com display:none');
    assert.ok(r.comSaida, 'a tela de morte apareceu sem saída (era o reload que reiniciava)');
    assert.ok(!/reiniciando/i.test(r.sub), `o subtítulo ainda promete reload: "${r.sub}"`);
    assert.equal(r.overlay, 'none', 'o menu subiu por trás da tela de morte (z 100 sob z 200)');
    assert.equal(r.travado, false, 'o ponteiro continuou travado com o jogador morto');
  });

  it('dada a tela de morte, então os botões recebem o ponteiro (e o dedo no celular)', async () => {
    const r = await h.play(() => {
      const medir = id => {
        const b = document.getElementById(id);
        const q = b.getBoundingClientRect();
        const em = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2);
        return { largura: q.width, altura: q.height, alvo: em ? (em.id || em.className) : null,
          clicavel: !!(em && em.closest('#' + id)) };
      };
      return {
        ponteiroDaTela: getComputedStyle(document.getElementById('deathScreen')).pointerEvents,
        retry: medir('btnRetry'), menu: medir('btnDeathMenu'),
      };
    });
    assert.notEqual(r.ponteiroDaTela, 'none',
      'o #deathScreen deixou de receber ponteiro — no celular não sobra saída nenhuma');
    assert.ok(r.retry.clicavel, `JOGAR DE NOVO está coberto por ${r.retry.alvo}`);
    assert.ok(r.menu.clicavel, `VOLTAR AO MENU está coberto por ${r.menu.alvo}`);
    // alvo de toque de verdade (o celular não tem ESC nem mouse)
    assert.ok(r.retry.altura >= 30, `alvo de toque pequeno demais: ${r.retry.altura}px`);
  });

  it('dada a morte na tela, então pausar não deixa um menu invisível atrás dela', async () => {
    const r = await h.play(() => {
      const MP = window.QA.MP;
      MP.setPaused(true); // caminho do ESC (e do unlock do pointer lock)
      const ov = document.getElementById('overlay');
      const ds = document.getElementById('deathScreen');
      const q = document.getElementById('btnNew').getBoundingClientRect();
      const em = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2);
      return {
        pausado: MP.state.paused,
        overlay: getComputedStyle(ov).display,
        morteNaTela: ds.classList.contains('show'),
        alvoNoMenu: em ? (em.id || em.className) : null,
      };
    });
    assert.equal(r.pausado, false,
      'pausou com a tela de morte na frente: o menu ficou interativo, invisível e inalcançável');
    assert.equal(r.overlay, 'none', 'o #overlay subiu atrás da tela de morte');
    assert.ok(r.morteNaTela, 'pausar apagou a tela de morte e deixou o jogador sem saída');
    assert.ok(!/btnNew/.test(String(r.alvoNoMenu)),
      'o botão do menu está recebendo ponteiro por trás da tela de morte');
  });

  it('dado o jogador morto, então ele não anda, não pula e não olha mais', async () => {
    const r = await h.play(() => {
      const { G, MP } = window.QA;
      const antes = [MP.player.pos.x, MP.player.pos.y, MP.player.pos.z];
      G.keys['KeyW'] = true;
      MP.justPressed.add('Space');
      for (let i = 0; i < 40; i++) G.tick(1 / 60);
      G.keys['KeyW'] = false;
      const dep = [MP.player.pos.x, MP.player.pos.y, MP.player.pos.z];
      return { dead: MP.player.dead, andou: Math.hypot(dep[0] - antes[0], dep[2] - antes[2]) };
    });
    assert.ok(r.dead, 'cenário inválido: o jogador não estava morto');
    assert.ok(r.andou < 0.05,
      `o jogador morto andou ${r.andou.toFixed(2)} m com "VOCÊ MORREU" na tela`);
  });

  it('dado JOGAR DE NOVO, então a PARTIDA reinicia sem tocar no mundo nem no rand seedado', async () => {
    const r = await h.play(() => {
      const { G, MP } = window.QA;
      /* ASSINATURA DO MUNDO: o que o worldgen desenhou a partir da seed.
         Árvores/pedras/cactos entram pelo registro de obstáculos, varrido
         numa grade grossa; estruturas, baús e carros pelas listas do
         próprio worldgen; e os spawns dos inimigos pelo `home` de cada um. */
      const assinatura = () => {
        const S = G.Structures;
        const obst = [];
        for (let x = -420; x <= 420; x += 60)
          for (let z = -420; z <= 420; z += 60)
            for (const o of G.obstaclesNear(x, z))
              obst.push(`${o.x.toFixed(3)},${o.z.toFixed(3)},${o.r.toFixed(3)}`);
        return JSON.stringify({
          obstaculos: obst.sort(),
          sites: S.sites.map(s => `${s.type}:${s.x.toFixed(3)},${s.z.toFixed(3)}`),
          baus: S.chestSpots.map(c => `${c.x.toFixed(3)},${c.z.toFixed(3)}`),
          carros: S.carSpots.map(c => `${c.x.toFixed(3)},${c.z.toFixed(3)}`),
          campos: S.enemyCamps.map(c => `${c.x.toFixed(3)},${c.z.toFixed(3)}`),
          spawns: G.Enemies.list.map(e => `${e.home.x.toFixed(3)},${e.home.z.toFixed(3)}`),
        });
      };
      // CONTADOR DO STREAM SEEDADO: envolver preserva a ordem de consumo e
      // conta. Zero consumo = o mundo não pode ter se deslocado.
      const puro = Math.random;
      let consumo = 0;
      Math.random = () => { consumo++; return puro(); };

      const antes = assinatura();
      // sujeira típica de partida jogada: pontos, munição gasta, inimigo morto
      G.Enemies.list[0].alive = false;
      G.Enemies.list[0].health = 0;
      G.inventory.medkits = 0;
      G.inventory.nades = 0;
      G.gun.mag = 0;
      G.gun.reserve = 3;
      const pontosAntes = document.getElementById('scoreVal').textContent;

      const ok1 = G.restartMatch();
      const consumo1 = consumo;
      const meio = assinatura();
      const depoisDoPrimeiro = {
        vida: MP.player.health, morto: MP.player.dead, pausado: MP.state.paused,
        morteNaTela: document.getElementById('deathScreen').classList.contains('show'),
        inimigoVivo: G.Enemies.list[0].alive,
        kits: G.inventory.medkits, nades: G.inventory.nades,
        mag: G.gun.mag, reserva: G.gun.reserve,
        pontos: document.getElementById('scoreVal').textContent,
        abates: document.getElementById('killsVal').textContent,
        pos: [MP.player.pos.x, MP.player.pos.z],
      };
      // ...e de novo, seguido: dois reinícios não podem deslocar o stream
      const ok2 = G.restartMatch();
      const consumo2 = consumo;
      const fim = assinatura();

      Math.random = puro;
      MP.player.invulnUntil = Infinity;
      return { ok1, ok2, consumo1, consumo2, antes, meio, fim, pontosAntes, depoisDoPrimeiro };
    });
    assert.ok(r.ok1 && r.ok2, 'restartMatch() recusou no modo solo');
    assert.equal(r.consumo1, 0,
      `o reinício consumiu ${r.consumo1} números do Math.random seedado — o stream do worldgen é contrato`);
    assert.equal(r.consumo2, 0,
      `o SEGUNDO reinício consumiu ${r.consumo2 - r.consumo1} números do rand seedado`);
    assert.equal(r.meio, r.antes, 'o mundo mudou depois do primeiro reinício');
    assert.equal(r.fim, r.antes, 'o mundo mudou depois do segundo reinício');
    const d = r.depoisDoPrimeiro;
    assert.equal(d.morto, false, 'o jogador continuou morto depois de JOGAR DE NOVO');
    assert.ok(d.vida > 99, `a vida não voltou cheia: ${d.vida}`);
    assert.equal(d.pausado, false, 'o reinício deixou o jogo pausado');
    assert.equal(d.morteNaTela, false, 'a tela de morte continuou na frente depois do reinício');
    assert.ok(d.inimigoVivo, 'os inimigos não voltaram');
    assert.ok(d.kits > 0 && d.nades > 0, `o inventário não voltou: ${d.kits} kits / ${d.nades} granadas`);
    assert.ok(d.mag > 0 && d.reserva > 3, `a munição não voltou: ${d.mag} / ${d.reserva}`);
    assert.equal(d.pontos, '0', `os pontos não zeraram: ${d.pontos}`);
    assert.equal(d.abates, '0', `os abates não zeraram: ${d.abates}`);
    assert.ok(Math.hypot(d.pos[0] - 0, d.pos[1] - 4) < 1.5,
      `o jogador não voltou pro spawn: ${JSON.stringify(d.pos)}`);
  });

  it('dado VOLTAR AO MENU, então o menu volta e dá pra começar de novo', async () => {
    const r = await h.play(() => {
      const { G, MP } = window.QA;
      G.voltarAoMenu();
      const ov = document.getElementById('overlay');
      const btn = document.getElementById('btnNew');
      const meio = {
        started: MP.state.started, pausado: MP.state.paused,
        overlay: getComputedStyle(ov).display,
        travado: btn.classList.contains('disabled'),
        morteNaTela: document.getElementById('deathScreen').classList.contains('show'),
      };
      btn.click();
      return { meio, started: MP.state.started, pausado: MP.state.paused,
        overlay: getComputedStyle(ov).display };
    });
    assert.equal(r.meio.started, false, 'VOLTAR AO MENU não saiu da partida');
    assert.equal(r.meio.pausado, true, 'VOLTAR AO MENU não trouxe o menu');
    assert.notEqual(r.meio.overlay, 'none', 'o menu não apareceu');
    assert.equal(r.meio.morteNaTela, false, 'a tela de morte ficou por cima do menu');
    assert.equal(r.meio.travado, false, 'o botão de jogar voltou travado — sem saída do menu');
    assert.ok(r.started, 'o clique em JOGAR não recomeçou a partida');
    assert.equal(r.pausado, false, 'a partida recomeçou pausada');
    assert.equal(r.overlay, 'none', 'o menu ficou na frente da partida nova');
  });
});

describe('o reinício de partida não vaza pro BR (Chrome headless)', { skip: !CHROME && 'Chrome não encontrado' }, () => {
  let h;
  const PORT = 3305;
  // default do harness: __MP_active = __BR_active = true (partida do servidor)
  before(async () => { h = await bootGame({ port: PORT }); });
  after(async () => { if (h) await h.close(); });

  it('dado o BR ativo, então JOGAR DE NOVO recusa e NÃO cura, NÃO reaparece e NÃO zera nada', async () => {
    const r = await h.play(() => {
      const { G, MP } = window.QA;
      MP.player.invulnUntil = 0;
      MP.player.dead = false;
      MP.player.armor = 0;
      MP.player.health = 100;
      MP.setPaused(false);
      MP.playerDamage(61, null, { type: 'player', attackerId: 'inimigo', weapon: 'FUZIL' });
      const vidaAntes = MP.player.health;
      const posAntes = [MP.player.pos.x, MP.player.pos.z];
      G.gun.mag = 0;
      const ok = G.restartMatch();
      return {
        ok, vidaAntes, vidaDepois: MP.player.health,
        andou: Math.hypot(MP.player.pos.x - posAntes[0], MP.player.pos.z - posAntes[1]),
        mag: G.gun.mag,
        causa: MP.player.lastDamageCause ? MP.player.lastDamageCause.type : null,
      };
    });
    assert.equal(r.ok, false, 'restartMatch() ACEITOU rodar numa partida do servidor');
    assert.ok(r.vidaAntes < 100, 'cenário inválido: o dano não entrou');
    assert.equal(r.vidaDepois, r.vidaAntes,
      `JOGAR DE NOVO curou o jogador no BR: ${r.vidaAntes} → ${r.vidaDepois}`);
    assert.ok(r.andou < 0.01, `JOGAR DE NOVO teleportou o jogador no BR (${r.andou.toFixed(2)} m)`);
    assert.equal(r.mag, 0, 'JOGAR DE NOVO recarregou a arma no BR');
    assert.equal(r.causa, 'player', 'JOGAR DE NOVO apagou o autor do golpe (crédito de kill)');
  });

  it('dada a morte no BR, então a tela de morte nasce SEM os botões do solo', async () => {
    const r = await h.play(() => {
      const { G, MP } = window.QA;
      MP.player.dead = false;
      MP.player.health = 100;
      MP.player.invulnUntil = 0;
      G.Morte.mostrar();
      const btns = document.getElementById('deathBtns');
      return {
        naTela: document.getElementById('deathScreen').classList.contains('show'),
        comSaida: !!btns && !btns.hidden,
        // é o que o enterSpectator do br-game.js chama (nenhum teste passa por lá)
        temEsconder: typeof G.Morte.esconder === 'function',
      };
    });
    assert.ok(r.temEsconder, 'G.Morte.esconder() não existe — o espectador do BR quebraria');
    assert.ok(r.naTela, 'a tela de morte não apareceu no BR');
    assert.equal(r.comSaida, false,
      'a tela de morte do BR ofereceu JOGAR DE NOVO — o desfecho lá é do servidor');
  });

  it('dado o recap do servidor, então a tela de morte sai da frente sozinha (sem tapa-buraco)', async () => {
    const r = await h.play(() => {
      const { MP } = window.QA;
      const ds = document.getElementById('deathScreen');
      ds.classList.add('show'); // estado real 600 ms depois da morte
      MP.setPaused(true);        // é o que MENU.mostrar() faz pelo recap
      const out = {
        pausado: MP.state.paused,
        overlay: getComputedStyle(document.getElementById('overlay')).display,
        morteNaTela: ds.classList.contains('show'),
      };
      MP.setPaused(false);
      return out;
    });
    assert.equal(r.pausado, true, 'o recap não conseguiu trazer o menu pra frente no BR');
    assert.notEqual(r.overlay, 'none', 'o menu do recap ficou invisível');
    assert.equal(r.morteNaTela, false,
      'o "VOCÊ MORREU" (z 200) continuou cobrindo o recap (z 100)');
  });
});
