/* ================================================================
   QA — ESCALA DA PORTA DA FACHADA (C4 · docs/vr/criterio-aaa.md).

   A porta da FACHADA (moldura/vão recuado/marquise, `js/structures.js`,
   prédio maciço sem interior) é decoração, diferente da porta de INTERIOR
   (`CityInterior.INT.DOOR_H`, testada em test/city-interior.test.js com
   contrato de traversal real ≥2,2 m) — as duas não têm relação.

   C4 exige altura de porta real entre 2,0 e 2,1 m, com ≤5% de erro contra
   qualquer um dos dois limites. Medido na Rodada 30 (docs/vr/progresso.md):
   o literal antigo (2,3 m) dava +9,5 a +15,0% — fora da tolerância.
   ================================================================ */
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const url = require('node:url');
const path = require('node:path');

const MIN = 2.0, MAX = 2.1, TOL = 0.05;

test('FACADE_DOOR_H fica dentro de 2,0-2,1 m (±5%) — a régua de escala 1:1 do mundo (C4)', async () => {
  const S = await import(url.pathToFileURL(path.join(__dirname, '..', 'js', 'structures.js')).href);
  const h = S.FACADE_DOOR_H;
  assert.ok(typeof h === 'number' && h > 0, `FACADE_DOOR_H não é um número válido: ${h}`);
  const erroMin = (h - MIN) / MIN, erroMax = (h - MAX) / MAX;
  const dentro = h >= MIN * (1 - TOL) && h <= MAX * (1 + TOL);
  assert.ok(dentro,
    `porta da fachada em ${h.toFixed(2)} m — erro de ${(erroMin * 100).toFixed(1)}% contra o piso ` +
    `(${MIN} m) e ${(erroMax * 100).toFixed(1)}% contra o teto (${MAX} m), fora da tolerância de 5%`);
});
