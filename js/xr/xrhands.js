/* ================================================================
   AS MÃOS DO JOGADOR EM XR.

   POR QUE ISTO EXISTE: no desktop a arma é filha da CÂMERA, e mirar é
   girar a câmera com o mouse. Levar isso pra VR sem pensar produz a pior
   experiência possível — a arma cola na cabeça, e o jogador precisa
   APONTAR O ROSTO para o inimigo pra acertar. A recomendação da Meta é
   direta: ancore a ação de entrada no CONTROLE, não na cabeça, senão o
   conflito visual-vestibular só cresce. Em VR a cabeça olha; a mão mira.

   SÃO DOIS ESPAÇOS POR CONTROLE, E ELES NÃO SÃO INTERCAMBIÁVEIS. A spec do
   WebXR define:

     `targetRaySpace` (three: `getController(i)`) — "para onde este controle
        APONTA". É a mira: hit-test, cursor, direção de tiro.
     `gripSpace` (three: `getControllerGrip(i)`) — "if the user was holding a
        straight rod in their hand, it would be aligned with the negative Z
        axis and the origin rests at their palm". É a MÃO.

   E a recomendação é literal: "The `gripSpace` should be used instead to place
   the renderable model of a 'tracked-pointer'". A doc do próprio three repete
   ("attach the handheld object to the group returned by `getControllerGrip()`
   and the ray to the group returned by `getController()`").

   A diferença não é cosmética: decodificando a `gripOffsetMatrix` do config
   oficial da Meta, os dois espaços diferem de **45,4° de inclinação e ~5 cm de
   deslocamento** no Touch. Arma pendurada no raio de mira = punho 45° torto,
   5 cm fora da mão — que foi exatamente a queixa "o corpo onde segura a arma
   parece deslocado do centro". Por isso este módulo entrega os DOIS: o raio
   para apontar, o punho para segurar (ver js/xr/xrweapon.js e
   docs/vr/referencia-arma-mira.md).

   COMO SE SABE QUAL É A DIREITA: o three associa `getController(i)` a
   `session.inputSources[i]` por ÍNDICE, e o índice não tem lado fixo — o
   controle que ligar primeiro é o 0. Quem diz o lado é
   `inputSources[i].handedness`, lido a cada consulta. Depender do evento
   `connected` falharia justamente no caso comum de a sessão já ter os
   controles quando o jogo pergunta.

   ORDEM QUE NÃO PODE SER INVERTIDA, e ela não é óbvia. Os objetos têm que
   existir ANTES de `setSession`. O three associa entrada a controle dentro do
   `inputsourceschange`, e o laço que faz isso é
   (`WebXRManager.js`, "Assign input source a controller that currently has no
   input source"):

       for ( let i = 0; i < controllers.length; i ++ ) { ... }

   Com `controllers` ainda vazio, o laço não roda, o índice fica -1 e a fonte
   de entrada é DESCARTADA — e o evento não se repete. Resultado: os objetos do
   controle ficam para sempre em `visible:false`, pose identidade, e a mão nunca
   se mexe na tela. Nada falha, nada avisa. Por isso `criar()` é separado de
   `anexar()`: criar acontece antes de pedir a sessão, anexar depois, quando o
   rig existe.

   NADA AQUI É CRIADO NO BOOT: `getController` instancia `Object3D`, e todo
   `Object3D` gasta 4 números do `Math.random` seedado no UUID — a ordem de
   consumo é contrato do worldgen. Quem cria é `criar()`, no clique do jogador,
   muito depois do mundo estar pronto.
   ================================================================ */

export function createXrHands({ renderer }) {
  const raios = [null, null];    // targetRaySpace — para onde o controle aponta
  const punhos = [null, null];   // gripSpace — a palma da mão
  let montado = false;

  /* ANTES de `setSession` — ver o cabeçalho. `getController`/`getControllerGrip`
     são idempotentes: o three guarda o objeto e devolve o mesmo nas chamadas
     seguintes. Os dois saem do MESMO `WebXRController` de índice `i`, então
     criar o punho aqui não custa um segundo par de fontes de entrada — só o
     segundo Group, que o three preenche por frame. */
  function criar() {
    if (!renderer.xr || !renderer.xr.getController) return;
    for (let i = 0; i < 2; i++) {
      if (!raios[i]) raios[i] = renderer.xr.getController(i);
      if (!punhos[i] && renderer.xr.getControllerGrip) punhos[i] = renderer.xr.getControllerGrip(i);
    }
  }

  /* Depois, quando o rig existe. O pai é o RIG, não a cena: a pose do controle
     vem no espaço de referência, e o rig é esse espaço colocado no mundo.
     Pendurado na cena, a mão ficaria plantada na origem do mapa. */
  function anexar(rig) {
    if (montado || !rig) return;
    criar();
    for (const c of raios) if (c) rig.add(c);
    for (const c of punhos) if (c) rig.add(c);
    montado = true;
  }

  function exit() {
    for (const c of raios) if (c && c.parent) c.parent.remove(c);
    for (const c of punhos) if (c && c.parent) c.parent.remove(c);
    montado = false;
  }

  /* O ÍNDICE NÃO TEM LADO FIXO: quem diz o lado é `handedness`, lido a cada
     consulta (ver o cabeçalho). `inputSources` não é Array no navegador nativo
     — `Array.from` serve nos dois. */
  function indiceDe(qual) {
    if (!montado) return -1;
    const s = renderer.xr.getSession && renderer.xr.getSession();
    if (!s || !s.inputSources) return -1;
    const fontes = Array.from(s.inputSources);
    for (let i = 0; i < fontes.length; i++) {
      if (fontes[i] && fontes[i].handedness === qual) return i;
    }
    return -1;
  }

  /* O RAIO DE MIRA da mão pedida, ou null se aquele controle não está na
     sessão (desligou, dormiu, nunca pareou). Null é resposta legítima: quem
     chama tem que ter um caminho sem mão, não um crash. */
  function mao(qual) {
    const i = indiceDe(qual);
    return i < 0 ? null : (raios[i] || null);
  }

  /* A PALMA da mão pedida (`gripSpace`) — é aqui que se pendura o que está na
     mão. Pode ser null mesmo com o controle presente: `gripSpace` só existe
     em fontes `tracked-pointer`, e quem chama precisa cair no `mao()`. */
  function punho(qual) {
    const i = indiceDe(qual);
    return i < 0 ? null : (punhos[i] || null);
  }

  return { criar, anexar, exit, mao, punho, get montado() { return montado; } };
}
