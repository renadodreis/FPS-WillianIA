/* ================================================================
   TAXA DE QUADROS DECLARADA DA SESSÃO XR.

   O DEFEITO QUE ISTO FECHA: a sessão nascia a **90 Hz por herança** e
   `updateTargetFrameRate` nunca era chamado — medido pelo validador em
   `98b114f` e reconferido no HEAD (`grep` por `updateTargetFrameRate` no repo
   inteiro: zero). A Meta é explícita: "A WebXR session on the Browser runs by
   default at 90 frames per second on Meta Quest 2 and 72 frames per second on
   Meta Quest headsets" — ou seja, o padrão é herdado, e a única forma de ficar
   em 72 é PEDIR.

   POR QUE 72, E A CONTA QUE DECIDE:

     120 Hz →  8,33 ms/frame
      90 Hz → 11,11 ms/frame   ← o que a sessão herdava
      80 Hz → 12,50 ms/frame   (+12,5 %)
      72 Hz → 13,89 ms/frame   (+25,0 %)

   Contra o que o jogo pede hoje, de `docs/vr/perf-xr.md`, em sessão imersiva
   estéreo COM o preset de qualidade aplicado: **775 draw calls e 1,88 M
   triângulos** na pose de castelo, contra teto interno de 180 e 500 k. É
   **4,3×** o orçamento de draw calls, e a conclusão escrita lá é "é preciso
   cortar 78 %, e o preset entrega 4–9 %". Um quadro nesse estado não cabe em
   11,11 ms. Declarar 72 devolve **2,78 ms por frame — 25 % de orçamento — numa
   linha**, sem tocar em conteúdo, em `Math.random` seedado nem em arquitetura
   de render. Não substitui o corte de 78 %; compra a margem enquanto ele não
   vem. E é requisito de loja declarar a taxa: VRC.Quest.Performance.1 aceita
   72/80/90/96/100/120 Hz e cobra "at least 60 fps" sem quedas prolongadas.

   Revisar quando: `npm run vr:censo` mostrar a pose de castelo dentro de 180
   draw calls E o `adb logcat -s VrApi` mostrar App < 13,89 ms com margem em
   30 minutos. Antes disso, 80 Hz é otimismo sem dado.

   TRÊS ARMADILHAS DA API, TODAS SILENCIOSAS:

   1. **`supportedFrameRates` é um `Float32Array`, não um `Array`.**
      `Array.isArray(new Float32Array([72]))` devolve **false**. Um guarda com
      `Array.isArray` faz o jogo nunca declarar taxa nenhuma, sem erro e sem
      console — a MESMA armadilha do `inputSources`, que já custou cinco relatos
      de "os controles não funcionam" nesta base.
   2. **Pedir taxa fora da lista REJEITA a promessa** ("If rate is not in
      supportedFrameRates, reject promise with a TypeError" — W3C), e a sessão
      pode terminar por fora entre o frame e a promessa (`InvalidStateError`).
      Promise rejeitada sem `catch` é erro de console, e o critério I2 é zero.
   3. **A taxa pode mudar por fora**: "If XRSession's nominal frame rate is
      changed FOR ANY REASON, it MUST apply the nominal frame rate […]". Quem
      presume que o valor pedido é o valor em vigor mente no relatório — por
      isso o módulo ouve `frameratechange` e lê a sessão, em vez de guardar um
      espelho do que pediu.

   NADA AQUI ALOCA `Object3D` (o UUID de cada um consome 4 números do
   `Math.random` seedado, e a ordem é contrato do worldgen): pode nascer no boot.

   Fontes: docs/vr/referencia-tato-sessao.md
   ================================================================ */

/* O alvo declarado do projeto. É taxa válida de loja e o degrau mais barato
   por frame que o Quest 3 oferece. */
export const TAXA_ALVO = 72;

/* Quantas tentativas de pedir a taxa antes de desistir naquela sessão. Sem
   isto, um sistema que recusa (térmica, política) receberia um pedido POR
   FRAME, para sempre. */
const MAX_PEDIDOS = 4;

/* Orçamento por frame, em ms. Null para taxa inválida — não existe orçamento
   de uma taxa que não existe, e devolver Infinity ou 0 mentiria no relatório. */
export function msPorFrame(taxa) {
  return Number.isFinite(taxa) && taxa > 0 ? 1000 / taxa : null;
}

/* `supportedFrameRates` é `Float32Array`; `Array.isArray` reprova nele. Aceite
   qualquer coisa iterável ou com `length` (ver a armadilha 1 do cabeçalho). */
function comoLista(v) {
  if (Array.isArray(v)) return v;
  if (!v || typeof v !== 'object') return [];
  if (typeof v[Symbol.iterator] === 'function') return Array.from(v);
  if (typeof v.length === 'number') return Array.prototype.slice.call(v);
  return [];
}

/* ================================================================
   POLÍTICA PURA: dada a lista da sessão e a taxa em vigor, o que pedir.
   Devolve `taxa: null` quando não há nada a fazer — e o `motivo` diz qual dos
   casos é, porque "não pedi" e "não deu" precisam ser distinguíveis no
   relatório.
   ================================================================ */
export function escolherTaxa({ suportadas, alvo = TAXA_ALVO, atual = null } = {}) {
  const lista = comoLista(suportadas)
    .map(Number)
    .filter(n => Number.isFinite(n) && n > 0);
  if (!lista.length) return { taxa: null, motivo: 'sem-lista' };

  const jaEsta = t => (t === atual ? { taxa: null, motivo: 'ja-esta' } : null);

  if (lista.includes(alvo)) return jaEsta(alvo) || { taxa: alvo, motivo: 'alvo' };

  /* Alvo fora da lista: cai no maior valor ABAIXO dele. Nunca acima — pedir
     mais Hz do que o projeto decidiu é pedir MENOS milissegundos por frame, que
     é o oposto do motivo de existir deste módulo. */
  const abaixo = lista.filter(t => t < alvo);
  if (abaixo.length) {
    const t = Math.max(...abaixo);
    return jaEsta(t) || { taxa: t, motivo: 'maior-abaixo' };
  }
  // tudo é mais rápido que o alvo: o mais lento que existe é o mais barato
  const t = Math.min(...lista);
  return jaEsta(t) || { taxa: t, motivo: 'menor-acima' };
}

/* ================================================================
   APLICAÇÃO: pede a taxa à sessão de verdade e acompanha o que ela faz.
   `aplicar` é seguro de chamar TODO FRAME — o wiring do game.js chama dentro
   do laço, porque a sessão só existe depois do `XR.sync()`.
   ================================================================ */
export function createXrFrameRate({ alvo = TAXA_ALVO } = {}) {
  let sessao = null;         // a sessão que este módulo está acompanhando
  let taxaAtual = null;      // último valor ANUNCIADO pelo runtime
  let pedidos = 0;           // tentativas nesta sessão (ver MAX_PEDIDOS)
  let emVoo = null;          // promessa em voo: chamada por frame não empilha
  const mudancas = [];       // tudo o que o runtime anunciou, na ordem

  const aoMudar = () => {
    if (!sessao) return;
    taxaAtual = sessao.frameRate;
    mudancas.push(taxaAtual);
    // o sistema pode ter entregado o alvo por conta própria
    if (taxaAtual === alvo) pedidos = 0;
  };

  function acompanhar(s) {
    if (sessao === s) return;
    soltar();
    sessao = s || null;
    if (sessao && typeof sessao.addEventListener === 'function') {
      sessao.addEventListener('frameratechange', aoMudar);
    }
    taxaAtual = sessao ? sessao.frameRate : null;
    pedidos = 0;
  }

  async function aplicar(s) {
    if (!s) return { ok: false, motivo: 'sem-sessao', pedida: null, taxa: null, erro: null };
    acompanhar(s);
    if (emVoo) return emVoo;                     // chamada por frame não empilha

    const atual = s.frameRate;
    const r = escolherTaxa({ suportadas: s.supportedFrameRates, alvo, atual });
    if (r.taxa === null) {
      return { ok: true, motivo: r.motivo, pedida: null, taxa: atual, erro: null };
    }
    if (typeof s.updateTargetFrameRate !== 'function') {
      return { ok: true, motivo: 'sem-api', pedida: null, taxa: atual, erro: null };
    }
    if (pedidos >= MAX_PEDIDOS) {
      return { ok: false, motivo: 'desistiu', pedida: r.taxa, taxa: atual, erro: null };
    }

    pedidos++;
    emVoo = (async () => {
      try {
        /* A rejeição é ESPERADA em dois casos reais (taxa fora da lista, sessão
           encerrada por fora). Engolir aqui é o que mantém o console limpo — o
           motivo volta no retorno, não no console. */
        await s.updateTargetFrameRate(r.taxa);
        taxaAtual = s.frameRate;
        if (taxaAtual === alvo) pedidos = 0;
        return { ok: true, motivo: r.motivo, pedida: r.taxa, taxa: taxaAtual, erro: null };
      } catch (e) {
        return {
          ok: false, motivo: 'recusado', pedida: r.taxa, taxa: s.frameRate,
          erro: (e && e.message) || String(e),
        };
      } finally {
        emVoo = null;
      }
    })();
    return emVoo;
  }

  /* Sair da sessão solta o ouvinte: sessão nova não pode herdar o ouvinte da
     anterior nem o contador de tentativas dela. Sai na primeira linha quando
     não há sessão — o wiring do game.js chama isto TODO FRAME fora de XR, e a
     versão de PC não pode regredir. */
  function soltar() {
    if (!sessao) return false;
    if (typeof sessao.removeEventListener === 'function') {
      sessao.removeEventListener('frameratechange', aoMudar);
    }
    sessao = null;
    pedidos = 0;
    return true;
  }

  return {
    aplicar, soltar,
    get alvo() { return alvo; },
    /* LÊ A SESSÃO, não o que foi pedido (armadilha 3 do cabeçalho). */
    get taxa() { return sessao ? sessao.frameRate : taxaAtual; },
    get orcamentoMs() { return msPorFrame(sessao ? sessao.frameRate : taxaAtual); },
    get mudancas() { return mudancas.slice(); },
  };
}
