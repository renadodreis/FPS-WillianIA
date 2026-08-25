/* ================================================================
   CICLO DE SESSÃO XR — camada fina entre o botão e o `renderer.xr`.

   Recebe `renderer` e `navigator` por parâmetro (mesmo padrão do resto
   da casa): dá pra testar o ciclo inteiro sem headset e sem GPU.

   TRÊS COISAS QUE ESTA CAMADA GARANTE, E QUE JÁ QUEBRARAM EM OUTROS
   PORTES:

   1. `setReferenceSpaceType('local-floor')` ANTES de `setSession`. O
      three lê o tipo de referência no momento em que adota a sessão;
      invertendo a ordem o jogo nasce em `local` — origem na CABEÇA, não
      no chão — e o jogador aparece enterrado até a cintura no terreno,
      sem uma linha de erro no console.

   2. `local-floor` entra como REQUERIDO. É ele que traz a altura real do
      headset; sem isso agachar de verdade não existe e a altura do olho
      vira chute.

   3. `renderer.xr.enabled` só liga quando a sessão existe DE FATO. Ligar
      antes (ou deixar ligado depois de uma recusa) troca o caminho de
      render do jogo inteiro sem nada em troca.

   `onVisibility` existe desde já porque é requisito de loja: com o
   headset tirado a sessão vira `visible-blurred`/`hidden` e o app
   precisa continuar vivo. A POLÍTICA (sumir com as mãos, pausar input,
   segurar o socket) é de quem consome — aqui só chega o sinal.
   ================================================================ */

export function createXrSession({ renderer, navigator: nav,
  onEnter = () => {}, onExit = () => {}, onVisibility = () => {} } = {}) {
  let sessao = null;
  let abrindo = null;          // promessa em voo: dois cliques, uma sessão
  let visibilidade = 'visible';

  const xrApi = () => (nav && nav.xr) || null;

  async function isSupported() {
    const xr = xrApi();
    if (!xr || typeof xr.isSessionSupported !== 'function') return false;
    try {
      return (await xr.isSessionSupported('immersive-vr')) === true;
    } catch {
      // alguns navegadores REJEITAM em vez de devolver false (política de
      // permissão, contexto inseguro). Sem suporte é sem suporte.
      return false;
    }
  }

  function aoTerminar() {
    if (!sessao) return;
    sessao.removeEventListener('end', aoTerminar);
    sessao.removeEventListener('visibilitychange', aoMudarVisibilidade);
    sessao = null;
    visibilidade = 'visible';
    renderer.xr.enabled = false;
    onExit();
  }

  function aoMudarVisibilidade(e) {
    const alvo = (e && e.session) || sessao;
    visibilidade = (alvo && alvo.visibilityState) || 'visible';
    onVisibility(visibilidade);
  }

  async function enter() {
    if (sessao) return { ok: true, session: sessao };
    if (abrindo) return abrindo;
    const xr = xrApi();
    if (!xr) return { ok: false, reason: 'navegador sem WebXR' };

    abrindo = (async () => {
      try {
        const s = await xr.requestSession('immersive-vr', {
          requiredFeatures: ['local-floor'],
          optionalFeatures: ['bounded-floor', 'hand-tracking', 'layers'],
        });
        // ORDEM: referência primeiro, sessão depois (ver cabeçalho)
        renderer.xr.setReferenceSpaceType('local-floor');
        renderer.xr.enabled = true;
        await renderer.xr.setSession(s);
        sessao = s;
        visibilidade = s.visibilityState || 'visible';
        s.addEventListener('end', aoTerminar);
        s.addEventListener('visibilitychange', aoMudarVisibilidade);
        onEnter(s);
        return { ok: true, session: s };
      } catch (e) {
        // recusa do jogador, headset ocupado, permissão negada: estado limpo
        renderer.xr.enabled = false;
        sessao = null;
        return { ok: false, reason: (e && e.message) || 'falha ao abrir a sessão' };
      } finally {
        abrindo = null;
      }
    })();
    return abrindo;
  }

  async function exit() {
    if (!sessao) return;
    try { await sessao.end(); } catch { /* já encerrada pelo sistema */ }
  }

  return {
    isSupported, enter, exit,
    get presenting() { return !!sessao; },
    get session() { return sessao; },
    get visibility() { return visibilidade; },
  };
}
