/* ================================================================
   QA — NÚCLEO DA ASSISTÊNCIA DE MIRA DO TOQUE (js/aimassist.js).

   O núcleo é PURO: sem three, sem DOM, sem `Math.random`. Recebe a vista
   (olho, yaw, pitch, FOV), o giro que o jogador PEDIU neste frame e as listas
   de alvos (mesmo contrato `hitSpheres()` do tiro), e devolve o giro que a
   câmera deve fazer. Visibilidade e chão chegam por função injetada — no
   jogo são o MESMO `rayBlockedAt` do tiro e o `heightAt` do terreno.

   Toda expectativa aqui é calculada da GEOMETRIA do cenário (posição do alvo,
   distância, raio da esfera) e dos números da referência
   (docs/mobile/referencia-mira-toque.md §6), nunca lida de volta da saída do
   próprio módulo. Um teste que compara a saída consigo mesma não pode falhar.
   ================================================================ */
'use strict';
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');

let createAimAssist, weaponClass, tanRatio, isRendered, AIM, WEAPON_ASSIST;
before(async () => {
  ({ createAimAssist, weaponClass, tanRatio, isRendered, AIM, WEAPON_ASSIST } =
    await import('../js/aimassist.js'));
});

const DEG = Math.PI / 180;
const ROOT = { visible: true, parent: null };

/* boneco com o MESMO desenho de esferas do jogador remoto (br-game.js):
   cabeça r 0,28 a +1,66, tronco r 0,42 a +1,10, pernas r 0,34 a +0,42 */
function boneco(x, z, y = 0, opts = {}) {
  const group = { visible: opts.visible !== false, parent: opts.parent === undefined ? ROOT : opts.parent,
    position: { x, y, z } };
  const partes = opts.partes || [[1.66, 0.28, 'head'], [1.10, 0.42, 'body'], [0.42, 0.34, 'body']];
  const sph = partes.map(([h, r, part]) => ({ c: { x: 0, y: 0, z: 0 }, r, part, h }));
  return {
    alive: true, group,
    hitSpheres() {
      const p = this.group.position;
      for (const s of sph) { s.c.x = p.x; s.c.y = p.y + s.h; s.c.z = p.z; }
      return sph;
    },
    damage() { return false; },
  };
}

/* alvo a `dist` metros do olho, `a` graus à ESQUERDA (yaw positivo = esquerda,
   Euler YXZ do three: a câmera olha -Z com yaw 0) */
function bonecoEm(dist, aDeg = 0, opts) {
  const a = aDeg * DEG;
  return boneco(-dist * Math.sin(a), -dist * Math.cos(a), 0, opts);
}

/* olho na altura do CENTRO DA CABEÇA: o desvio vertical até a cabeça é zero
   por construção, e a conta esperada fica só no eixo que o caso mede */
const OLHO_Y = 1.66;

function quadro(alvos, o = {}) {
  return Object.assign({
    dt: 1 / 60, eye: { x: 0, y: OLHO_Y, z: 0 }, yaw: 0, pitch: 0, fov: 75, aspect: 844 / 390,
    inYaw: 0, inPitch: 0, strafe: 0, ads: 0, weapon: 'rifle',
    assist: true, autoFire: false, canFire: true, maxRange: Infinity,
    lists: [alvos],
  }, o);
}

function nucleo(o = {}) {
  let chamadas = 0;
  const livre = o.livre || (() => true);
  const aa = createAimAssist({
    root: ROOT,
    heightAt: o.heightAt || (() => 0),
    grassTop: o.grassTop === undefined ? 1.33 : o.grassTop,
    los: (e, c, r) => { chamadas++; return livre(e, c, r); },
  });
  return { aa, chamadas: () => chamadas, zera: () => { chamadas = 0; } };
}

/* roda N quadros com o mesmo pedido de giro e devolve a última saída
   (a força entra por interpolação exponencial: 60/s na subida) */
function assenta(aa, f, n = 30) {
  let r = null;
  for (let i = 0; i < n; i++) r = aa.step(f);
  return { yaw: r.yaw, pitch: r.pitch, fire: r.fire, target: r.target, zone: r.zone };
}

describe('assistência de mira — classe de arma (o arsenal real)', () => {
  it('dado cada perfil do arsenal, então a classe decide força e tiro automático', () => {
    // os MESMOS campos de js/weapons.js — o classificador não lê nome
    const casos = [
      [{ auto: true, pellets: 1 }, 'rifle'],                       // FUZIL "VAGALUME"
      [{ auto: false, pellets: 8 }, 'shotgun'],                    // ESCOPETA "TROVÃO"
      [{ auto: false, pellets: 1 }, 'marksman'],                   // DMR "FALCÃO"
      [{ auto: false, pellets: 1, rocket: true }, 'launcher'],     // BAZUCA
      [{ auto: true, pellets: 1, laser: true }, 'plasma'],         // PLASMA
      [{ auto: false, pellets: 1, melee: true }, 'melee'],         // FACA
      [{ auto: true, pellets: 7 }, 'shotgun'],                     // ESCOPETA "RAJADA"
    ];
    for (const [gun, cls] of casos) assert.equal(weaponClass(gun), cls, JSON.stringify(gun));
    assert.equal(WEAPON_ASSIST.launcher.k, 0, 'bazuca não pode ter assistência');
    assert.equal(WEAPON_ASSIST.melee.k, 0, 'faca não pode ter assistência');
    assert.equal(WEAPON_ASSIST.marksman.k, 0.5, 'sniper/DMR: −50 % (Insomniac, luneta 6x)');
    for (const c of ['rifle', 'shotgun', 'plasma']) assert.equal(WEAPON_ASSIST[c].auto, true, c);
    for (const c of ['marksman', 'launcher', 'melee']) assert.equal(WEAPON_ASSIST[c].auto, false, c);
  });

  it('dada a razão das tangentes, então bate com a tabela da referência (§3.3)', () => {
    // base 75° vertical; os números são os da tabela do documento
    const tabela = [[62, 0.783], [58, 0.722], [55, 0.678], [48, 0.580], [36, 0.423], [30, 0.349], [26, 0.301]];
    for (const [fov, ideal] of tabela)
      assert.ok(Math.abs(tanRatio(fov, 75) - ideal) < 0.0015, `${fov}°: ${tanRatio(fov, 75)} ≠ ${ideal}`);
    assert.equal(tanRatio(75, 75), 1);
  });
});

describe('assistência de mira — só com o jogador mexendo', () => {
  it('dado um alvo andando de lado sob a mira e NENHUMA entrada, então a vista não mexe', () => {
    const { aa } = nucleo();
    const t = bonecoEm(20);
    let maior = 0;
    for (let i = 0; i < 60; i++) {
      t.group.position.x += 5 / 60;          // 5 m/s pra direita
      const r = aa.step(quadro([t]));
      maior = Math.max(maior, Math.abs(r.yaw), Math.abs(r.pitch));
    }
    assert.equal(maior, 0, `sem entrada a vista girou ${maior} rad`);
  });

  it('dado nenhuma entrada e tiro automático desligado, então nem consulta a linha de visada', () => {
    const n = nucleo();
    const t = bonecoEm(20);
    for (let i = 0; i < 30; i++) n.aa.step(quadro([t]));
    assert.equal(n.chamadas(), 0, 'raycast sem ninguém pedindo: custo por frame no celular');
  });
});

describe('assistência de mira — SLOW (atrito sobre o alvo)', () => {
  it('dado a mira dentro do alvo e o dedo arrastando pra FORA, então o giro cai 30 % (metade do Lyra)', () => {
    const { aa } = nucleo();
    const t = bonecoEm(30);                         // cruz no centro da cabeça
    const r = assenta(aa, quadro([t], { inYaw: -0.01 }));
    assert.ok(Math.abs(r.yaw - (-0.01 * (1 - 0.30))) < 1e-6,
      `slow interno do quadril devia deixar ${-0.007}, deixou ${r.yaw}`);
    assert.equal(r.zone, 2, 'a cruz está dentro da silhueta: zona INTERNA');
  });

  it('dado o ADS, então a zona interna é mais forte (0,35 contra 0,30)', () => {
    const { aa } = nucleo();
    const t = bonecoEm(30);
    const r = assenta(aa, quadro([t], { inYaw: -0.01, ads: 1, fov: 55 }));
    assert.ok(Math.abs(r.yaw - (-0.01 * (1 - 0.35))) < 1e-6, `ADS: ${r.yaw}`);
  });

  it('dado o dedo indo PARA o alvo, então o slow não freia (não trava quem persegue)', () => {
    const { aa } = nucleo();
    const t = bonecoEm(30, 0.3);                     // 0,3° à esquerda, cabeça na altura do olho
    const r = assenta(aa, quadro([t], { inYaw: +0.001 }));
    assert.ok(Math.abs(r.yaw - 0.001) < 1e-9, `perseguindo o alvo o giro caiu para ${r.yaw}`);
    // e o slow nunca ACELERA: indo pra fora cai, nunca sobe
    const n2 = nucleo();
    const r2 = assenta(n2.aa, quadro([bonecoEm(30, 0.3)], { inYaw: -0.001 }));
    assert.ok(Math.abs(r2.yaw) < 0.001 && r2.yaw < 0, `indo pra fora: ${r2.yaw}`);
  });

  it('dado o dedo só na VERTICAL e o alvo na diagonal, então o slow não cria giro horizontal', () => {
    /* Achado pelo test/touch-controls.test.js: decompor o arrasto em "rumo ao
       alvo" + resto e frear só o resto faz sobrar uma componente HORIZONTAL
       que o jogador não pediu — é um puxão disfarçado de atrito, e o slow
       "nunca deixa mais rápido que o normal" (Lyra l. 741-743) em eixo nenhum.
       Cabeça 0,4° à esquerda e 0,4° acima da cruz: zona interna, diagonal.
       O dedo sobe (RUMO à cabeça, no eixo vertical) sem mexer de lado. */
    const t = bonecoEm(30, 0.4);
    const { aa } = nucleo();
    const f = quadro([t], { inYaw: 0, inPitch: 0.004, pitch: -0.4 * DEG });
    const r = assenta(aa, f);
    assert.equal(r.zone, 2, 'cenário: a cruz devia estar na zona interna');
    assert.equal(r.yaw, 0, `arrasto vertical virou ${r.yaw} rad de giro horizontal`);
    // e nenhum eixo sai MAIOR do que entrou (dedo pra direita = longe; pra cima = rumo)
    const n2 = nucleo();
    const r2 = assenta(n2.aa, quadro([bonecoEm(30, 0.4)], { inYaw: -0.003, inPitch: 0.004, pitch: -0.4 * DEG }));
    assert.ok(Math.abs(r2.yaw) <= 0.003 + 1e-12 && Math.abs(r2.pitch) <= 0.004 + 1e-12,
      `o slow acelerou um eixo: (${r2.yaw}, ${r2.pitch})`);
  });

  it('dado a mira na zona EXTERNA, então a força desce em rampa até zero na borda', () => {
    // cabeça a 30 m: raio angular = max(asin(0,28/30), piso 0,6°) = 0,6°.
    // Com o alvo a 2,35° da cruz, a folga até a silhueta é 1,75°: o meio exato
    // da rampa entre a margem interna (0,5°) e a externa (3,0°) -> peso 0,5.
    const raio = Math.max(Math.asin(0.28 / 30) / DEG, AIM.FLOOR_DEG);
    const a = raio + (AIM.INNER_DEG + AIM.OUTER_DEG) / 2;
    const { aa } = nucleo();
    const r = assenta(aa, quadro([bonecoEm(30, a)], { inYaw: -0.002 }));   // pra fora do alvo
    const esperado = -0.002 * (1 - 0.25 * 0.5);
    assert.ok(Math.abs(r.yaw - esperado) < 1e-6, `rampa externa: ${r.yaw} ≠ ${esperado}`);
    assert.equal(r.zone, 1);
    // fora da margem externa: nada
    const n2 = nucleo();
    const r2 = assenta(n2.aa, quadro([bonecoEm(30, raio + AIM.OUTER_DEG + 0.2)], { inYaw: -0.002 }));
    assert.equal(r2.yaw, -0.002, 'fora da zona externa ainda freou');
    assert.equal(r2.zone, 0);
  });

  it('dado um alvo LONGE, então a silhueta tem piso (a zona não some a 100 m)', () => {
    // a 90 m a cabeça tem 0,178° de raio; o piso de 0,6° é que segura a zona
    const { aa } = nucleo();
    const r = assenta(aa, quadro([bonecoEm(90, 0.9)], { inYaw: -0.002 }));
    assert.equal(r.zone, 2, `a 0,9° de um alvo a 90 m devia ser zona interna (piso), veio ${r.zone}`);
  });

  it('dado um alvo perto, então a força cai em rampa até 40 % a 3 m (não zera)', () => {
    for (const [dist, k] of [[3, 0.4], [9, 0.7], [15, 1], [40, 1]]) {
      const { aa } = nucleo();
      const r = assenta(aa, quadro([bonecoEm(dist)], { inYaw: -0.01 }));
      const esperado = -0.01 * (1 - 0.30 * k);
      assert.ok(Math.abs(r.yaw - esperado) < 1e-6, `${dist} m: ${r.yaw} ≠ ${esperado}`);
    }
  });
});

describe('assistência de mira — PULL (acompanha o movimento RELATIVO)', () => {
  /* alvo a 20 m andando 5 m/s de lado: a cada frame a direção dele muda
     Δψ = atan(x1/20) − atan(x0/20). O pull devolve 30 % disso (hip, interno).
     A VISTA acompanha o alvo (o cenário põe a cruz nele a cada frame, como um
     jogador que rastreia perfeito): sem isso ele sai da zona em ~5 frames e o
     caso deixa de medir o pull interno. */
  function rastreia(o) {
    const { aa } = nucleo();
    const t = bonecoEm(20);
    const saidas = [], deltas = [];
    for (let i = 0; i < 40; i++) {
      const x0 = t.group.position.x;
      t.group.position.x += 5 / 60;
      const x1 = t.group.position.x;
      deltas.push(Math.atan2(-x1, 20) - Math.atan2(-x0, 20));
      saidas.push(aa.step(quadro([t], Object.assign({ yaw: Math.atan2(-x1, 20) }, o))));
    }
    return { yaw: saidas.at(-1).yaw, delta: deltas.at(-1) };
  }

  it('dado o dedo mexendo e o alvo andando pra DIREITA, então a vista vira pra direita 30 % do necessário', () => {
    // entrada vertical minúscula = "dedo mexendo"; o eixo medido é o yaw
    const r = rastreia({ inPitch: 1e-9 });
    assert.ok(r.delta < 0, 'cenário: andar pra direita diminui o yaw do alvo');
    const esperado = 0.30 * r.delta;
    assert.ok(Math.abs(r.yaw - esperado) < Math.abs(esperado) * 0.02,
      `pull: ${r.yaw} rad/frame, esperado ${esperado} (30 % de ${r.delta})`);
  });

  it('dado SÓ o analógico de lado (sem olhar), então o pull cai para |strafe| × 0,75', () => {
    const r = rastreia({ strafe: 1 });
    const esperado = 0.30 * 0.75 * r.delta;
    assert.ok(Math.abs(r.yaw - esperado) < Math.abs(esperado) * 0.02, `strafe: ${r.yaw} ≠ ${esperado}`);
    const meio = rastreia({ strafe: -0.5 });
    const esperadoMeio = 0.30 * 0.75 * 0.5 * meio.delta;
    assert.ok(Math.abs(meio.yaw - esperadoMeio) < Math.abs(esperadoMeio) * 0.02, `meio strafe: ${meio.yaw}`);
  });

  it('dado o alvo PARADO e o jogador olhando, então o pull é zero (não é ímã pro centro)', () => {
    const { aa } = nucleo();
    const t = bonecoEm(20, 1.2);
    const r = assenta(aa, quadro([t], { inPitch: 1e-9 }));
    assert.ok(Math.abs(r.yaw) < 1e-12, `alvo parado puxou a vista ${r.yaw} rad`);
  });
});

describe('assistência de mira — NUNCA em quem o jogador não vê', () => {
  it('dada a linha de visada bloqueada, então nada muda (nem slow, nem pull)', () => {
    const { aa } = nucleo({ livre: () => false });
    const t = bonecoEm(20);
    let maior = 0;
    for (let i = 0; i < 40; i++) {
      t.group.position.x += 5 / 60;
      const r = aa.step(quadro([t], { inYaw: -0.004 }));
      maior = Math.max(maior, Math.abs(r.yaw - (-0.004)));
    }
    assert.equal(maior, 0, `alvo atrás de parede alterou a vista em ${maior} rad`);
  });

  it('dado o alvo fora da cena ou invisível (dentro de carro), então nada muda', () => {
    for (const opts of [{ visible: false }, { parent: null }, { parent: { visible: false, parent: ROOT } }]) {
      const { aa } = nucleo();
      const r = assenta(aa, quadro([bonecoEm(20, 0, opts)], { inYaw: -0.004 }));
      assert.equal(r.yaw, -0.004, `alvo não desenhado freou a mira (${JSON.stringify(Object.keys(opts))})`);
    }
  });

  it('dado um alvo inteiro ABAIXO do topo da grama, então não assiste (grama não é linha de visada)', () => {
    // bicho de 0,9 m: nenhuma esfera passa de 1,33 m acima do chão
    const bicho = o => bonecoEm(20, 0, Object.assign({ partes: [[0.62, 0.55, 'body'], [0.85, 0.24, 'head']] }, o));
    const { aa } = nucleo();
    const r = assenta(aa, quadro([bicho()], { inYaw: -0.004, eye: { x: 0, y: 0.8, z: 0 } }));
    assert.equal(r.yaw, -0.004, 'assistiu alvo que a grama pode esconder');
    // controle: o mesmo bicho sem regra de grama É assistido (o caso exercita a regra)
    const n2 = nucleo({ grassTop: 0 });
    const r2 = assenta(n2.aa, quadro([bicho()], { inYaw: -0.004, eye: { x: 0, y: 0.8, z: 0 } }));
    assert.notEqual(r2.yaw, -0.004, 'cenário inválido: sem a regra de grama o bicho também não era assistido');
  });

  it('dado só a CABEÇA visível (tronco atrás de mureta), então a silhueta é só a cabeça', () => {
    // mureta: bloqueia tudo que está abaixo de 1,4 m no alvo
    const livre = (e, c) => c.y > 1.4;
    const { aa } = nucleo({ livre });
    // cruz 1,3° ABAIXO da cabeça, em cima do tronco escondido: com o tronco a
    // 30 m (raio 0,8°) isso seria zona interna; com só a cabeça (0,6°), a folga
    // é 0,7° — zona externa
    const r = assenta(aa, quadro([bonecoEm(30)], { pitch: -1.3 * DEG, inYaw: -0.002 }));
    assert.equal(r.zone, 1, `a parte escondida contou como silhueta (zona ${r.zone})`);
  });

  it('dado um alvo atrás da câmera ou além do alcance, então nada muda', () => {
    const atras = boneco(0, 30);
    const { aa } = nucleo();
    assert.equal(assenta(aa, quadro([atras], { inYaw: -0.004 })).yaw, -0.004, 'assistiu alvo atrás');
    const n2 = nucleo();
    assert.equal(assenta(n2.aa, quadro([bonecoEm(150)], { inYaw: -0.004 })).yaw, -0.004,
      'assistiu a 150 m no quadril (alcance 100 m)');
    const n3 = nucleo();
    assert.equal(assenta(n3.aa, quadro([bonecoEm(60)], { inYaw: -0.004, maxRange: 50 })).yaw, -0.004,
      'assistiu dentro da neblina');
  });

  it('dados muitos alvos, então o raycast por frame tem teto', () => {
    const n = nucleo();
    const alvos = [];
    for (let i = 0; i < 12; i++) alvos.push(bonecoEm(20 + i, (i % 3) * 0.2));
    n.aa.step(quadro(alvos, { inYaw: -0.001 }));
    assert.ok(n.chamadas() <= AIM.MAX_CANDIDATES * 3,
      `${n.chamadas()} raycasts num frame (teto ${AIM.MAX_CANDIDATES * 3})`);
    assert.ok(n.chamadas() > 0);
  });
});

describe('assistência de mira — arma e histerese', () => {
  it('dada a bazuca ou a faca, então zero assistência e zero raycast', () => {
    for (const weapon of ['launcher', 'melee']) {
      const n = nucleo();
      const t = bonecoEm(20);
      let maior = 0;
      for (let i = 0; i < 30; i++) {
        t.group.position.x += 5 / 60;
        const r = n.aa.step(quadro([t], { inYaw: -0.004, weapon, autoFire: true }));
        maior = Math.max(maior, Math.abs(r.yaw + 0.004));
        assert.equal(r.fire, false, `${weapon} com tiro automático`);
      }
      assert.equal(maior, 0, `${weapon} recebeu assistência`);
      assert.equal(n.chamadas(), 0, `${weapon} pagou raycast`);
    }
  });

  it('dado sniper/DMR, então o slow é metade', () => {
    const { aa } = nucleo();
    const r = assenta(aa, quadro([bonecoEm(30)], { inYaw: -0.01, weapon: 'marksman' }));
    assert.ok(Math.abs(r.yaw - (-0.01 * (1 - 0.15))) < 1e-6, `marksman: ${r.yaw}`);
  });

  it('dado o alvo anterior e um novo LIGEIRAMENTE mais perto da cruz, então o anterior fica', () => {
    const { aa } = nucleo();
    const a = bonecoEm(30, 1.5), b = bonecoEm(30, -1.4);
    const r1 = assenta(aa, quadro([a], { inYaw: 0.0005 }), 5);
    assert.equal(r1.target, a);
    const r2 = assenta(aa, quadro([a, b], { inYaw: 0.0005 }), 5);
    assert.equal(r2.target, a, 'o alvo trocou por 0,1° de diferença (sem histerese)');
    // controle: sem histórico, o mais perto ganha
    const n2 = nucleo();
    assert.equal(assenta(n2.aa, quadro([a, b], { inYaw: 0.0005 }), 1).target, b);
  });
});

describe('tiro automático — só em alvo VISÍVEL, sob a cruz, no alcance da arma', () => {
  const f = (alvos, o) => quadro(alvos, Object.assign({ autoFire: true }, o));

  it('dado o fuzil com o alvo sob a cruz a 30 m, então dispara; a 70 m, não', () => {
    assert.equal(nucleo().aa.step(f([bonecoEm(30)])).fire, true);
    assert.equal(nucleo().aa.step(f([bonecoEm(70)])).fire, false, 'fuzil disparou além de 60 m');
  });

  it('dado a escopeta, então só dispara perto (15 m)', () => {
    assert.equal(nucleo().aa.step(f([bonecoEm(10)], { weapon: 'shotgun' })).fire, true);
    assert.equal(nucleo().aa.step(f([bonecoEm(20)], { weapon: 'shotgun' })).fire, false);
  });

  it('dado o alvo atrás de parede, então NÃO dispara', () => {
    assert.equal(nucleo({ livre: () => false }).aa.step(f([bonecoEm(30)])).fire, false);
  });

  it('dado o alvo AO LADO da cruz (fora da silhueta), então não dispara', () => {
    // 1,2° à esquerda de uma cabeça de 0,53° a 30 m: dentro da zona, fora do corpo
    assert.equal(nucleo().aa.step(f([bonecoEm(30, 1.2)])).fire, false);
  });

  it('dado DMR, sniper, bazuca ou faca, então nunca é automático', () => {
    for (const weapon of ['marksman', 'launcher', 'melee'])
      assert.equal(nucleo().aa.step(f([bonecoEm(30)], { weapon })).fire, false, weapon);
  });

  it('dado o ajuste desligado ou sem munição, então não dispara', () => {
    assert.equal(nucleo().aa.step(quadro([bonecoEm(30)])).fire, false);
    assert.equal(nucleo().aa.step(f([bonecoEm(30)], { canFire: false })).fire, false);
  });

  it('dada a assistência DESLIGADA e o automático ligado, então dispara sem mexer na vista', () => {
    const t = bonecoEm(30);
    const r = nucleo().aa.step(f([t], { assist: false, inYaw: -0.01 }));
    assert.equal(r.fire, true);
    assert.equal(r.yaw, -0.01, 'assistência desligada e o slow agiu');
  });
});

describe('isRendered — o que conta como "na tela"', () => {
  it('dado o grafo, então só vale quem chega na raiz com todos os pais visíveis', () => {
    const a = { visible: true, parent: ROOT };
    const b = { visible: true, parent: a };
    assert.equal(isRendered(b, ROOT), true);
    a.visible = false;
    assert.equal(isRendered(b, ROOT), false, 'pai invisível esconde o filho');
    assert.equal(isRendered({ visible: true, parent: null }, ROOT), false, 'sem pai não é desenhado');
    assert.equal(isRendered(null, ROOT), false);
  });
});
