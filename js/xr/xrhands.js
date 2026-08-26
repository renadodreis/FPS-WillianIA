/* ================================================================
   AS MÃOS DO JOGADOR EM XR.

   POR QUE ISTO EXISTE: no desktop a arma é filha da CÂMERA, e mirar é
   girar a câmera com o mouse. Levar isso pra VR sem pensar produz a pior
   experiência possível — a arma cola na cabeça, e o jogador precisa
   APONTAR O ROSTO para o inimigo pra acertar. A recomendação da Meta é
   direta: ancore a ação de entrada no CONTROLE, não na cabeça, senão o
   conflito visual-vestibular só cresce. Em VR a cabeça olha; a mão mira.

   O ESPAÇO É O DO RAIO DE MIRA (`targetRaySpace`, o que o three devolve
   em `getController(i)`), não o da empunhadura. Motivo: o raio de mira é
   definido pela PLATAFORMA como "para onde este controle aponta", já com
   a correção de ângulo do Touch embutida. Pendurar a arma nele faz o cano
   e o tiro concordarem por construção, em vez de por um ajuste de ângulo
   escrito à mão que quebra no próximo controle.

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
  const objs = [null, null];
  let montado = false;

  /* ANTES de `setSession` — ver o cabeçalho. `getController` é idempotente:
     o three guarda o objeto e devolve o mesmo nas chamadas seguintes. */
  function criar() {
    if (!renderer.xr || !renderer.xr.getController) return;
    for (let i = 0; i < 2; i++) if (!objs[i]) objs[i] = renderer.xr.getController(i);
  }

  /* Depois, quando o rig existe. O pai é o RIG, não a cena: a pose do controle
     vem no espaço de referência, e o rig é esse espaço colocado no mundo.
     Pendurado na cena, a mão ficaria plantada na origem do mapa. */
  function anexar(rig) {
    if (montado || !rig) return;
    criar();
    for (const c of objs) if (c) rig.add(c);
    montado = true;
  }

  function exit() {
    for (const c of objs) if (c && c.parent) c.parent.remove(c);
    montado = false;
  }

  /* O objeto three da mão pedida, ou null se aquele controle não está na
     sessão (desligou, dormiu, nunca pareou). Null é resposta legítima: quem
     chama tem que ter um caminho sem mão, não um crash. */
  function mao(qual) {
    if (!montado) return null;
    const s = renderer.xr.getSession && renderer.xr.getSession();
    if (!s || !s.inputSources) return null;
    // `inputSources` não é Array no navegador nativo — Array.from serve nos dois
    const fontes = Array.from(s.inputSources);
    for (let i = 0; i < fontes.length; i++) {
      if (fontes[i] && fontes[i].handedness === qual) return objs[i] || null;
    }
    return null;
  }

  return { criar, anexar, exit, mao, get montado() { return montado; } };
}
