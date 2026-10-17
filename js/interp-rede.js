/* ================================================================
   INTERPOLAÇÃO DE SNAPSHOTS — jogadores remotos. Núcleo PURO (sem DOM,
   sem THREE, sem rede): roda igual no navegador e no `node --test`.

   O defeito (auditoria MP 338d153, MQ-6): o boneco dos outros perseguia
   o ÚLTIMO pacote de `state` (10 Hz) por lerp exponencial. A cada pacote
   ele acelerava e depois freava — 19,9 % dos quadros com a velocidade
   desenhada fora de ±50 % da real. É o "pulsa/lagado" do PvP.

   A regra do gênero: desenhar um pouco no PASSADO, entre os dois pacotes
   que cercam esse instante.
   - Valve, "Source Multiplayer Networking": o cliente desenha 100 ms
     atrás (cl_interp), cobrindo um intervalo de snapshot perdido; sem
     snapshot, extrapola por no máximo 0,25 s.
   - Glenn Fiedler, "Snapshot Interpolation" (2014): o atraso tem de
     cobrir o intervalo de envio MAIS o tremor da rede, senão o buffer
     esvazia e o boneco engasga.

   Como fica aqui:
   - cada pacote traz `t`, o relógio do REMETENTE (performance.now dele,
     repassado pelo servidor). O espaçamento entre pacotes é o do envio,
     não o da chegada — o tremor da rede sai da conta;
   - `offset` = menor (chegada − t) da janela: o caminho mais rápido que
     a rede já entregou. O tremor de cada pacote é o quanto ele chegou
     depois disso;
   - atraso = intervalo de envio + tremor medido + folga, entre 100 e
     300 ms, ajustado devagar: mudar o atraso é tocar o tempo do boneco
     mais lento ou mais rápido, e até ~8 % isso não se vê (a 25 % ele
     visivelmente freia a cada vez que o tremor muda);
   - sem pacote novo, segue a última velocidade por até 120 ms e segura;
   - correção pequena (o que a extrapolação errou numa curva, o offset
     que mudou) some em ~100 ms; correção GRANDE (rede parada, pacotes
     perdidos) encaixa: alcançar correndo mentiria a posição por meio
     segundo para quem está mirando;
   - distância impossível entre dois pacotes (nave → chão, respawn) é
     teleporte: encaixa.
   Pacote sem `t` (servidor ou bot antigo) usa a hora de chegada.
   ================================================================ */

export const INTERP = Object.freeze({
  ATRASO_MIN_MS: 50,     // um intervalo de envio (br-game.js manda `state` a 20 Hz; bots a 10)
  ATRASO_MAX_MS: 300,    // teto: relógio forjado ou rede ruim não empurram o boneco para o passado
  FOLGA_MS: 15,
  JANELA: 20,            // pacotes considerados no offset e no tremor (~2 s)
  EXTRAPOLA_MS: 120,     // sem pacote: segue a última velocidade por no máx. isto
  SALTO_M: 10,           // teleporte: mais que SALTO_M + SALTO_MPS × intervalo entre dois pacotes
  SALTO_MPS: 150,        //   (carro ~42 m/s, queda ~46 m/s, helicóptero ~27 m/s)
  VOLTA_MS: 1000,        // relógio do remetente voltou mais que isto: ele recomeçou
  SOBE: 0.08,            // ajuste do atraso, em ms por ms de relógio, quando o alvo sobe (8 % mais lento não se vê)...
  DESCE: 0.05,           // ...e quando desce
  SUAVE_MS: 100,         // constante de tempo da correção pequena
  ENCAIXA_M: 2,          // correção maior que isto encaixa
});

export function criarInterpolador() {
  return {
    amostras: [],        // { t, x, y, z, yaw } em ordem de t (só o necessário para o desenho)
    chegadas: [],        // (chegada − t) dos últimos pacotes: offset e tremor
    ts: [],              // t dos últimos pacotes: intervalo de envio
    offset: 0,
    alvo: INTERP.ATRASO_MIN_MS,
    atraso: INTERP.ATRASO_MIN_MS,
    tUlt: null,          // último relógio local em que o boneco foi desenhado
    ex: 0, ey: 0, ez: 0, // correção pequena em curso (some com SUAVE_MS)
  };
}

function reiniciar(it) {
  it.amostras.length = 0;
  it.chegadas.length = 0;
  it.ts.length = 0;
  it.ex = it.ey = it.ez = 0;
}

const _cru = { x: 0, y: 0, z: 0, yaw: 0 };

/* posição SEM a correção suave, no instante de desenho `rt` (relógio do remetente) */
function cru(it, rt, out) {
  const a = it.amostras;
  const p = a[0];
  if (a.length === 1 || rt <= p.t) {
    out.x = p.x; out.y = p.y; out.z = p.z; out.yaw = p.yaw;
    return;
  }
  let i = 0;
  while (i < a.length - 2 && a[i + 1].t <= rt) i++;
  const A = a[i], B = a[i + 1];
  const f = rt < B.t
    ? (rt - A.t) / (B.t - A.t)
    : 1 + Math.min(rt - B.t, INTERP.EXTRAPOLA_MS) / (B.t - A.t); // além do mais novo: extrapola com teto
  out.x = A.x + (B.x - A.x) * f;
  out.y = A.y + (B.y - A.y) * f;
  out.z = A.z + (B.z - A.z) * f;
  const dy = Math.atan2(Math.sin(B.yaw - A.yaw), Math.cos(B.yaw - A.yaw));
  out.yaw = A.yaw + dy * Math.min(f, 1);
}

function recalcular(it) {
  const c = it.chegadas;
  let min = Infinity, max = -Infinity;
  for (const o of c) { if (o < min) min = o; if (o > max) max = o; }
  it.offset = min;
  // intervalo de envio: a mediana dos espaçamentos (pacote perdido não infla)
  const gaps = [];
  for (let i = 1; i < it.ts.length; i++) gaps.push(it.ts[i] - it.ts[i - 1]);
  gaps.sort((a, b) => a - b);
  const intervalo = gaps.length ? gaps[gaps.length >> 1] : INTERP.ATRASO_MIN_MS;
  it.alvo = Math.max(INTERP.ATRASO_MIN_MS,
    Math.min(INTERP.ATRASO_MAX_MS, intervalo + (max - min) + INTERP.FOLGA_MS));
}

/* chegada de um pacote. tRem = relógio do remetente (null/NaN = não veio);
   tLocal = relógio local na chegada. Devolve false se o pacote foi ignorado. */
export function receber(it, tRem, tLocal, x, y, z, yaw) {
  const t = Number.isFinite(tRem) ? tRem : tLocal;
  const a = it.amostras;
  const ult = a[a.length - 1];
  if (ult) {
    if (t <= ult.t) {
      if (ult.t - t <= INTERP.VOLTA_MS) return false; // atrasado ou repetido
      reiniciar(it);                                   // o remetente recomeçou o relógio
    } else if (Math.hypot(x - ult.x, y - ult.y, z - ult.z) >
      INTERP.SALTO_M + INTERP.SALTO_MPS * (t - ult.t) / 1000) {
      reiniciar(it);                                   // teleporte: encaixa
    }
  }
  /* o desenho tem de ser CONTÍNUO através da chegada: o que muda com o pacote
     (offset novo, extrapolação que errou) vira correção que some devagar */
  const continuar = a.length > 0 && it.tUlt !== null;
  if (continuar) {
    cru(it, it.tUlt - it.offset - it.atraso, _cru);
    it.ex += _cru.x; it.ey += _cru.y; it.ez += _cru.z;
  }
  a.push({ t, x, y, z, yaw });
  it.chegadas.push(tLocal - t);
  it.ts.push(t);
  if (it.chegadas.length > INTERP.JANELA) { it.chegadas.shift(); it.ts.shift(); }
  recalcular(it);
  if (continuar) {
    cru(it, it.tUlt - it.offset - it.atraso, _cru);
    it.ex -= _cru.x; it.ey -= _cru.y; it.ez -= _cru.z;
    if (Math.hypot(it.ex, it.ey, it.ez) > INTERP.ENCAIXA_M) it.ex = it.ey = it.ez = 0;
  } else if (a.length === 1) it.atraso = it.alvo;
  return true;
}

/* posição desenhada no relógio local `tLocal` (um quadro). false = sem pacote ainda */
export function amostrar(it, tLocal, out) {
  const a = it.amostras;
  if (!a.length) return false;
  const dt = it.tUlt === null ? 0 : Math.max(0, Math.min(100, tLocal - it.tUlt));
  it.tUlt = tLocal;
  const d = it.alvo - it.atraso;
  it.atraso += d > 0 ? Math.min(d, dt * INTERP.SOBE) : Math.max(d, -dt * INTERP.DESCE);
  const rt = tLocal - it.offset - it.atraso;
  // o que ficou para trás do instante de desenho sai (fica o par que o cerca)
  while (a.length > 2 && a[1].t <= rt) a.shift();
  cru(it, rt, out);
  const k = Math.exp(-dt / INTERP.SUAVE_MS);
  it.ex *= k; it.ey *= k; it.ez *= k;
  out.x += it.ex; out.y += it.ey; out.z += it.ez;
  return true;
}
