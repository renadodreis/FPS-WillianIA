/* ================================================================
   QA — SEGREDOS DO MAPA (núcleo puro).

   Três armas do arsenal (FACA "AURORA" idx 5, SNIPER "AGULHA" idx 6 e
   ESCOPETA "RAJADA" idx 7) nascem `locked: true` em js/weapons.js e NÃO
   tinham NENHUMA fonte de desbloqueio no modo solo — conteúdo pronto e
   inalcançável. Aqui cada uma vira prêmio de um segredo descobrível:
   pista → busca → recompensa.

   O que este teste trava é a parte que dá pra quebrar sem perceber:
   a escolha determinística dos lugares e a máquina da melodia.
   ================================================================ */
'use strict';
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');

let S;
before(async () => { S = await import('../js/secrets-core.js'); });

describe('Prêmios', () => {
  it('cobre exatamente as 3 armas órfãs do solo (5, 6 e 7)', () => {
    const idx = S.SECRETS.map(s => s.weapon).sort((a, b) => a - b);
    assert.deepEqual(idx, [5, 6, 7]);
  });

  it('cada segredo declara pista, lugar e recompensa', () => {
    for (const sec of S.SECRETS) {
      assert.ok(sec.id && typeof sec.id === 'string');
      assert.ok(sec.hint && sec.hint.length > 8, `segredo ${sec.id} sem pista legível`);
      assert.ok(sec.name && sec.name.length > 3);
    }
    assert.equal(new Set(S.SECRETS.map(s => s.id)).size, S.SECRETS.length, 'id repetido');
  });
});

describe('Ninho do Atirador — escolha da torre', () => {
  const sites = [
    { type: 'torre', x: 10, z: 10 }, { type: 'cabana', x: 500, z: 500 },
    { type: 'torre', x: -300, z: 200 }, { type: 'torre', x: 100, z: -50 },
  ];
  it('escolhe a torre mais LONGE do centro (prêmio de quem explora)', () => {
    const t = S.pickNestTower(sites);
    assert.deepEqual([t.x, t.z], [-300, 200]);
  });
  it('ignora o que não é torre', () => {
    assert.notEqual(S.pickNestTower(sites).x, 500);
  });
  it('é determinístico e não depende da ordem da lista', () => {
    const a = S.pickNestTower(sites);
    const b = S.pickNestTower(sites.slice().reverse());
    assert.deepEqual(a, b);
  });
  it('devolve null sem torres (chamador não pode quebrar)', () => {
    assert.equal(S.pickNestTower([{ type: 'cabana', x: 1, z: 1 }]), null);
    assert.equal(S.pickNestTower([]), null);
  });
});

describe('Cofre Lacrado — escolha do prédio', () => {
  const its = [
    { bx: -300, bz: 130, lot: { ox: 40, oz: 0 } },
    { bx: -380, bz: 90, lot: { ox: -40, oz: -40 } },
    { bx: -345, bz: 135, lot: { ox: 5, oz: 5 } },
  ];
  it('escolhe o prédio mais fundo na cidade (mais longe da Torre Nexus)', () => {
    const v = S.pickVaultInterior(its, { x: -340, z: 130 });
    assert.equal(v.bx, -380);
  });
  it('é determinístico e independe da ordem', () => {
    const a = S.pickVaultInterior(its, { x: -340, z: 130 });
    const b = S.pickVaultInterior(its.slice().reverse(), { x: -340, z: 130 });
    assert.deepEqual(a, b);
  });
  it('devolve null sem interiores', () => {
    assert.equal(S.pickVaultInterior([], { x: 0, z: 0 }), null);
  });
});

describe('A Melodia — máquina de estados', () => {
  it('a sequência usa placas válidas do xilofone (8 placas) e não é trivial', () => {
    assert.ok(S.MELODY.length >= 4 && S.MELODY.length <= 6, `melodia de ${S.MELODY.length} notas`);
    for (const i of S.MELODY) assert.ok(Number.isInteger(i) && i >= 0 && i < 8, `placa ${i} inválida`);
    const crescente = S.MELODY.every((v, i) => i === 0 || v > S.MELODY[i - 1]);
    assert.ok(!crescente, 'melodia é só a escala subindo — o jogador acerta sem procurar a pista');
  });

  it('tocar a sequência certa resolve', () => {
    const t = S.createMelodyTracker();
    let r = null;
    for (const i of S.MELODY) r = t.step(i);
    assert.equal(r.solved, true);
    assert.equal(t.progress, 0, 'resolveu e não zerou o progresso');
  });

  it('nota errada zera o progresso (sem punir: dá pra recomeçar na hora)', () => {
    const t = S.createMelodyTracker();
    t.step(S.MELODY[0]);
    t.step(S.MELODY[1]);
    const errada = [0, 1, 2, 3, 4, 5, 6, 7].find(i => i !== S.MELODY[2] && i !== S.MELODY[0]);
    const r = t.step(errada);
    assert.equal(r.solved, false);
    assert.equal(t.progress, 0);
    // e a sequência inteira ainda resolve logo em seguida
    let last = null;
    for (const i of S.MELODY) last = t.step(i);
    assert.equal(last.solved, true);
  });

  it('errar TOCANDO a primeira nota já reconta como início', () => {
    const t = S.createMelodyTracker();
    t.step(S.MELODY[0]);
    t.step(S.MELODY[1]);
    t.step(S.MELODY[0]); // erro que por acaso é a nota 1
    assert.equal(t.progress, 1, 'não aproveitou o recomeço — o jogador precisaria sair e voltar');
  });

  it('repetir a mesma placa não avança sozinho', () => {
    const t = S.createMelodyTracker();
    const r1 = t.step(S.MELODY[0]);
    assert.equal(r1.hit, true);
    const antes = t.progress;
    // repetir a nota 0 quando a esperada é a 1 (a menos que a melodia repita)
    if (S.MELODY[1] !== S.MELODY[0]) {
      t.step(S.MELODY[0]);
      assert.ok(t.progress <= antes);
    }
  });

  it('já resolvido, resolver de novo continua funcionando (idempotente pro chamador)', () => {
    const t = S.createMelodyTracker();
    for (const i of S.MELODY) t.step(i);
    let r = null;
    for (const i of S.MELODY) r = t.step(i);
    assert.equal(r.solved, true);
  });

  it('não consome Math.random', () => {
    const R = Math.random;
    let n = 0;
    Math.random = () => { n++; return R(); };
    try {
      const t = S.createMelodyTracker();
      for (const i of S.MELODY) t.step(i);
      S.pickNestTower([{ type: 'torre', x: 1, z: 1 }]);
      S.pickVaultInterior([{ bx: 1, bz: 1 }], { x: 0, z: 0 });
    } finally { Math.random = R; }
    assert.equal(n, 0, `núcleo dos segredos consumiu ${n} Math.random`);
  });
});
