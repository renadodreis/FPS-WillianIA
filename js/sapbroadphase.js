/* ================================================================
   BROADPHASE SAP — mesma resposta, sem o laço quadrático.

   O `SAPBroadphase.collisionPairs` do cannon-es 0.20 faz assim:

     para cada i:  para cada j > i:
       se !needBroadphaseCollision(i,j) -> continue   // <- NUNCA quebra
       se !checkBounds(i,j)             -> break
       intersectionTest(i,j)

   `needBroadphaseCollision` é falso para todo par estático×estático (e
   dormindo×dormindo). Num mapa com ~1000 colisores de cenário parados,
   quase todo par cai no `continue` e o laço interno percorre a lista
   INTEIRA para cada i: O(N²) por substep, até 3 substeps por frame.
   Medido com o profiler do Chrome sobre 900 frames determinísticos:
   47% de toda a CPU do cliente vivia dentro deste método.

   Aqui a observação que resolve: se `bi` é PASSIVO (estático ou
   dormindo), os únicos `j` que passam por `needBroadphaseCollision` são
   os corpos ATIVOS. Todos os outros o original também descartaria com
   `continue` — sem emitir par e sem quebrar o laço. Então varrer apenas
   os ativos à frente de `i`, na mesma ordem da lista ordenada, produz a
   MESMA sequência de `intersectionTest`: mesmos pares, mesma ordem.
   Quando `bi` é ativo, cai no laço original, sem atalho nenhum.

   Custo: O(N × A) em vez de O(N²), com A = corpos ativos (o carro, o
   helicóptero, uma caixa caindo). Com tudo dormindo, zero pares olhados.
   Equivalência provada par a par em test/sap-broadphase.test.js.

   Fica numa instância (não no protótipo): quem não instalar segue com o
   cannon-es de fábrica.
   ================================================================ */
import * as CANNON from 'cannon-es';

const STATIC = CANNON.Body.STATIC;
const SLEEPING = CANNON.Body.SLEEPING;
const isPassive = b => (b.type & STATIC) !== 0 || b.sleepState === SLEEPING;

export function installFastSAP(broadphase) {
  const active = []; // índices (na lista ordenada) dos corpos ativos deste passo

  broadphase.collisionPairs = function collisionPairs(world, p1, p2) {
    const bodies = this.axisList;
    const N = bodies.length;
    const axisIndex = this.axisIndex;

    if (this.dirty) {
      this.sortList();
      this.dirty = false;
    }

    // a lista de ativos é curta e só muda quando alguém acorda/dorme
    active.length = 0;
    for (let i = 0; i !== N; i++) if (!isPassive(bodies[i])) active.push(i);
    const A = active.length;
    if (A === 0) return; // mundo inteiro parado: o original também não emitiria par

    let cur = 0; // primeiro ativo à frente de `i` (i cresce: o cursor só anda)
    for (let i = 0; i !== N; i++) {
      while (cur !== A && active[cur] <= i) cur++;
      const bi = bodies[i];
      if (isPassive(bi)) {
        // só corpo ATIVO pode formar par com um passivo — o resto o
        // cannon-es descartaria com `continue`, sem quebrar o laço
        for (let a = cur; a !== A; a++) {
          const bj = bodies[active[a]];
          if (!this.needBroadphaseCollision(bi, bj)) continue;
          if (!CANNON.SAPBroadphase.checkBounds(bi, bj, axisIndex)) break;
          this.intersectionTest(bi, bj, p1, p2);
        }
      } else {
        // corpo ativo: laço original, idêntico ao de fábrica
        for (let j = i + 1; j < N; j++) {
          const bj = bodies[j];
          if (!this.needBroadphaseCollision(bi, bj)) continue;
          if (!CANNON.SAPBroadphase.checkBounds(bi, bj, axisIndex)) break;
          this.intersectionTest(bi, bj, p1, p2);
        }
      }
    }
  };
  return broadphase;
}
