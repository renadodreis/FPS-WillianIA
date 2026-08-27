/* ================================================================
   QA — OS JULGADORES DO KIT DE SESSÃO HUMANA.

   POR QUE ESTE ARQUIVO EXISTE. `npm run vr:sessao` é o único caminho para os
   oito critérios que não podem ser fechados sem o aparelho e sem um humano de
   headset. Validação independente leu o código e encontrou QUATRO vereditos
   imprimindo VERDE sobre dado que reprovava:

     · E5 comparava `GPU%` — que o VrApi publica como FRAÇÃO 0–1 — com o
       número 90. `0.81 > 90` é falso, então o teto NUNCA disparava, nem com a
       GPU a 81 %.
     · E4 usava `appMs <= 2`, e em JavaScript `null <= 2` é `true`: sem uma
       única amostra do campo `App=`, o critério fechava VERDE.
     · E1 calculava `abaixoDaTaxa` e nunca lia, e comparava `stale` pela
       MEDIANA — que esconde zero: com 300 amostras e um frame repetido a
       mediana é 0 e o veredito sai verde.

   Nenhum teste pegou porque o arquivo não exportava nada. Um kit de medição
   que mente é pior que kit nenhum: ele fecha um critério que ninguém mediu.
   ================================================================ */
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { vereditoE1, gpuEmPct } = require('../scripts/vr-sessao.js');

const vrapiBom = {
  amostras: 300, fps: 72, piorFps: 72, abaixoDe60: 0, abaixoDaTaxa: 0,
  stale: 0, staleMax: 0, staleSoma: 0,
};

describe('os julgadores do kit de sessão humana', () => {
  it('E1 aprova só quando TODAS as grandezas passam', () => {
    const r = vereditoE1(vrapiBom, 72);
    assert.equal(r.verde, true, `deveria aprovar: ${r.txt}`);
  });

  it('E1 reprova um frame repetido, que a MEDIANA escondia', () => {
    /* uma repetição em 300 amostras: mediana 0, e o critério pede zero */
    const r = vereditoE1({ ...vrapiBom, stale: 0, staleMax: 1, staleSoma: 1 }, 72);
    assert.equal(r.verde, false, 'passou com um frame repetido — é o defeito da mediana de volta');
    assert.match(r.txt, /stale/, `o motivo não cita o stale: ${r.txt}`);
  });

  it('E1 reprova queda abaixo da taxa do MODO DE TELA, não só abaixo de 60', () => {
    /* 71 fps num modo de 72 não cai abaixo de 60 e mesmo assim é frame perdido */
    const r = vereditoE1({ ...vrapiBom, abaixoDe60: 0, abaixoDaTaxa: 12 }, 72);
    assert.equal(r.verde, false, '`abaixoDaTaxa` voltou a ser calculado e não lido');
  });

  it('E1 não julga com campo AUSENTE — campo faltando não é campo zerado', () => {
    /* `undefined > 0` é false: uma leitura sem os contadores passava por todas
       as comparações e saía VERDE. É o mesmo `null <= 2` que fechava o E4 sem
       amostra nenhuma, sobrevivendo dentro do E1. */
    for (const k of ['abaixoDe60', 'abaixoDaTaxa', 'staleMax', 'staleSoma']) {
      const sem = { ...vrapiBom };
      delete sem[k];
      const r = vereditoE1(sem, 72);
      assert.equal(r.verde, null,
        `sem \`${k}\` o veredito saiu ${r.verde === true ? 'VERDE' : 'VERMELHO'} — sem o número não há veredito: ${r.txt}`);
    }
  });

  it('E1 nunca inventa: sem amostra, aguarda o aparelho', () => {
    const r = vereditoE1({ amostras: 0 }, 72);
    assert.equal(r.verde, null, 'sem amostra o veredito tem que ficar em aberto, não verde nem vermelho');
  });

  it('E1 declara o que NÃO mediu', () => {
    assert.match(vereditoE1(vrapiBom, 72).txt, /swap/i,
      'o veredito precisa dizer que o intervalo de swap não foi colhido — senão alguém lê "VERDE" como "tudo medido"');
  });

  it('GPU% do VrApi é fração: 0,81 é 81 %, e 81 % NÃO passa de 90', () => {
    assert.equal(gpuEmPct(0.81), 81, 'a fração do VrApi não está sendo convertida — era assim que o teto nunca disparava');
    assert.equal(gpuEmPct(0.95) > 90, true, 'GPU a 95 % tem que estourar o teto de 90');
    assert.equal(gpuEmPct(0.5) > 90, false, 'GPU a 50 % não pode estourar o teto');
  });

  it('GPU% aceita também a convenção em porcentagem, sem dobrar o número', () => {
    assert.equal(gpuEmPct(81), 81, 'um runtime que publique 81 não pode virar 8100');
  });

  it('GPU% sem dado devolve nada — não devolve zero', () => {
    assert.equal(gpuEmPct(null), null, 'zero passaria no teto e fecharia E5 sem medida nenhuma');
    assert.equal(gpuEmPct(undefined), null);
  });
});
