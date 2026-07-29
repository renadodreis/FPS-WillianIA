/* Cobertura de céu — fonte central e BARATA de "está debaixo de teto?".
   Retângulos de telhado (prédios da cidade, torre, lajes, estruturas do
   campo) num hash espacial + um provider dinâmico (cabine da nave em
   movimento). Consulta O(1); zero raycast. Só APRESENTAÇÃO e áudio:
   nada aqui muda física, dano ou autoridade do servidor. */

export function createCover() {
  const CELL = 16;
  const grid = new Map(); // "gx_gz" -> [{x0,x1,z0,z1,roofY,sourceId}]
  const bySource = new Map();
  let dynamicProvider = null; // (x,y,z) => {covered,sourceId} | null  (nave)

  /* chave NUMÉRICA: `coverAt` roda uma vez por GOTA de chuva e por FLOCO
     de neve (até 800 consultas por frame) — uma string de template literal
     por consulta era lixo de GC na cadência da chuva. Bias de 4096 células
     de 16 m cobre |coordenada| < 65 km sem dois pontos caírem na mesma
     chave. */
  const BIAS = 4096;
  const key = (x, z) => (Math.floor(x / CELL) + BIAS) * 8192 + (Math.floor(z / CELL) + BIAS);

  function addRoofRect(rect) {
    const r = { x0: rect.x0, x1: rect.x1, z0: rect.z0, z1: rect.z1,
      roofY: rect.roofY, sourceId: rect.sourceId || 'roof' };
    const list = bySource.get(r.sourceId) || [];
    list.push(r);
    bySource.set(r.sourceId, list);
    for (let gx = Math.floor(r.x0 / CELL); gx <= Math.floor(r.x1 / CELL); gx++)
      for (let gz = Math.floor(r.z0 / CELL); gz <= Math.floor(r.z1 / CELL); gz++) {
        const k = (gx + BIAS) * 8192 + (gz + BIAS);
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(r);
      }
  }

  /* destruição (cidade caindo) tira o "telhado climático" junto do prédio */
  function removeBySource(sourceId) {
    const list = bySource.get(sourceId);
    if (!list) return;
    bySource.delete(sourceId);
    for (const cell of grid.values()) {
      for (let i = cell.length - 1; i >= 0; i--) if (list.includes(cell[i])) cell.splice(i, 1);
    }
  }

  function setDynamicProvider(fn) { dynamicProvider = fn; }

  /* retângulo que cobre o ponto, ou null — parte comum das duas consultas */
  function roofOver(x, y, z) {
    const cell = grid.get(key(x, z));
    if (cell) {
      for (const r of cell) {
        if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1 && y < r.roofY) return r;
      }
    }
    return null;
  }

  /* consulta COMPLETA: aloca o objeto de retorno de propósito — quem chama
     guarda o resultado (QA compara antes/depois da destruição da cidade). */
  function coverAt(x, y, z) {
    if (dynamicProvider) {
      const d = dynamicProvider(x, y, z);
      if (d && d.covered) return { covered: true, exposure: 0, roofY: Infinity, sourceId: d.sourceId || 'dynamic' };
    }
    const r = roofOver(x, y, z);
    return r
      ? { covered: true, exposure: 0, roofY: r.roofY, sourceId: r.sourceId }
      : { covered: false, exposure: 1, roofY: null, sourceId: null };
  }

  /* mesma decisão, só o booleano: é ESTA que roda por gota de chuva e por
     floco de neve (até 800 por frame). Devolve primitivo — não há objeto
     nem string pra o GC recolher. */
  function isCovered(x, y, z) {
    if (dynamicProvider) {
      const d = dynamicProvider(x, y, z);
      if (d && d.covered) return true;
    }
    return roofOver(x, y, z) !== null;
  }

  return { addRoofRect, removeBySource, setDynamicProvider, coverAt, isCovered,
    get sources() { return [...bySource.keys()]; } };
}
