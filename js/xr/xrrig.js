/* ================================================================
   RIG DE CÂMERA XR.

   Em XR o jogo NÃO move a câmera: quem escreve `camera.position` e
   `camera.quaternion` todo frame é o three
   (`WebXRManager.updateUserCamera`), calculando a pose da cabeça
   RELATIVA AO PAI da câmera. Daí o grafo:

       scene > xrRig (o JOGO move) > camera (o HEADSET move)

   O rig mora nos PÉS do jogador, não nos olhos. A referência espacial é
   `local-floor`: a origem é o chão, e a altura do olho vem do headset.
   É isso que faz agachar virar agachar de verdade — e é por isso que
   `place()` recebe a cota do TERRENO, nunca a altura da câmera.

   POR QUE O RIG NASCE PREGUIÇOSO: durante o boot o `Math.random` global
   vira um mulberry32 seedado (game.js:201) e cada `Object3D` gasta 4
   números desse fluxo só no UUID. A ordem de consumo é contrato — o
   servidor e os bots reconstroem o mesmo mundo da mesma seed. Um Group
   criado no boot deslocaria o mundo de todo mundo. Montar o controlador
   não cria nada; quem cria é `enter()`, que só acontece com o jogador
   apertando o botão, muito depois do worldgen.
   ================================================================ */

export function createXrRig({ THREE, scene, camera }) {
  let rig = null;
  let paiAnterior = null;
  let poseSalva = null;
  let dentro = false;
  /* passo FÍSICO acumulado: o quanto o jogador andou pelo cômodo e o jogo
     ainda não absorveu. Ver o cabeçalho de `place`. */
  let passoX = 0, passoZ = 0;
  let cabecaX = 0, cabecaZ = 0, temBase = false;
  let pedidoRebase = 0;   // frames de carência do reset de referencial (ver rebasear)

  /* transform LOCAL da câmera antes de entrar: em XR ele é sobrescrito
     todo frame, então sem cópia não há como devolver o desktop intacto */
  function salvarPose() {
    poseSalva = {
      position: camera.position.clone(),
      quaternion: camera.quaternion.clone(),
      scale: camera.scale.clone(),
    };
  }

  function enter() {
    if (dentro) return rig;
    if (!rig) {
      rig = new THREE.Group();
      rig.name = 'xrRig';
      scene.add(rig);
    }
    paiAnterior = camera.parent;
    salvarPose();
    rig.add(camera);
    /* zera o local: a pose de desktop (altura do olho, giro do mouse) já
       está descrita pelo rig, e deixá-la aqui somaria duas vezes */
    camera.position.set(0, 0, 0);
    camera.quaternion.identity();
    camera.scale.set(1, 1, 1);
    /* zera o passo físico: a sessão nova começa com o jogador onde ele está,
       e a base é redefinida no primeiro `place` (a pose real da cabeça só
       chega no primeiro frame da sessão — antes disso seria um passo falso). */
    passoX = 0; passoZ = 0; temBase = false; pedidoRebase = 0;
    dentro = true;
    return rig;
  }

  function exit() {
    if (!dentro) return;
    if (paiAnterior) paiAnterior.add(camera);
    else if (camera.parent) camera.parent.remove(camera);
    if (poseSalva) {
      camera.position.copy(poseSalva.position);
      camera.quaternion.copy(poseSalva.quaternion);
      camera.scale.copy(poseSalva.scale);
    }
    dentro = false;
  }

  /* `y` é a cota do CHÃO sob o jogador; `yaw` é o giro artificial, somado ao
     giro real da cabeça pelo próprio headset.

     O GIRO PIVOTA NA CABEÇA, NÃO NA ORIGEM DO RIG — e isto foi um defeito
     medido, não um refinamento. Antes daqui, `place` fazia
     `rig.position.set(x,y,z); rig.rotation.y = yaw`: o rig girava em torno da
     PRÓPRIA ORIGEM. Só que o headset quase nunca está sobre ela — o jogador
     anda pelo cômodo. Com a cabeça 0,71 m fora do centro, um passo de 45°
     TELEPORTAVA a cabeça 55,4 cm de lado (a corda do arco). O mundo girava e
     escorregava embaixo do jogador ao mesmo tempo: é o "viro com o controle e
     move igual PC, esse movimento não existe em VR" do relato. Nenhum jogo de
     VR gira assim; todos giram em torno do eixo vertical que passa pela
     cabeça. Aqui a conta é: coloque o rig de modo que a cabeça caia no ponto
     pedido, seja qual for o yaw.

     O PASSO FÍSICO NÃO PODE SUMIR NESSA CONTA. Se a cabeça é fixada em (x,z)
     todo frame, andar pelo cômodo deixa de mover o jogador — o jogo passaria a
     ARRASTAR a cabeça de volta, que é a coisa proibida. Por isso o
     deslocamento físico é medido aqui e ACUMULADO (`passoX/passoZ`): a cabeça
     vai para `(x,z) + passo`. Sem mais nada, o comportamento é o de sempre
     (andar pelo cômodo anda). Quem chama pode DRENAR esse passo com
     `consumirPasso()` e somá-lo na posição de jogo — aí o colisor passa a
     seguir a cabeça, e a cota do terreno passa a ser amostrada embaixo dela.
     A cabeça não pula na troca: o que entra em `x,z` sai de `passo`. */
  function place(x, y, z, yaw) {
    if (!dentro || !rig) return; // fora do XR não existe rig — e criar um custaria rand
    const hx = camera.position.x, hz = camera.position.z;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    /* Um reset pendente vira base nova AQUI, com a pose já atualizada, e leva
       o acumulado junto: depois de o referencial mudar, o acumulado descreve um
       mundo que não existe mais. */
    /* CARÊNCIA, não um frame só. O evento `reset` chega ANTES de a pose nova
       alcançar a câmera — medido: rebasear no frame do evento pegava a pose
       VELHA, e o salto da origem entrava como passo nos frames seguintes, com
       a trilha do deslocamento subindo em degraus de 0,15 m até completar a
       distância inteira. Alguns frames de carência cobrem a latência sem
       precisar adivinhar a ordem em que o navegador entrega as duas coisas.
       O custo é ignorar até ~4 cm de caminhada real durante a carência, e só
       quando o jogador recentra — que é justamente quando ele está parado. */
    if (pedidoRebase > 0) { pedidoRebase--; temBase = false; passoX = 0; passoZ = 0; }
    if (!temBase) { cabecaX = hx; cabecaZ = hz; temBase = true; }
    // passo do cômodo desde o frame anterior, levado do espaço do rig pro mundo
    const dx = hx - cabecaX, dz = hz - cabecaZ;
    cabecaX = hx; cabecaZ = hz;
    passoX += dx * c + dz * s;
    passoZ += -dx * s + dz * c;
    rig.rotation.y = yaw;
    // rig = alvo da cabeça menos a posição da cabeça já girada pelo yaw
    rig.position.set(
      x + passoX - (hx * c + hz * s),
      y,
      z + passoZ - (-hx * s + hz * c),
    );
  }

  /* Devolve (e zera) o passo físico ainda não absorvido pelo jogo, em MUNDO.
     Quem chama soma isso na posição do jogador ANTES da física do frame: daí
     em diante o colisor está debaixo da cabeça, e não onde o jogador estava
     quando entrou na sessão. Chamar é opcional; não chamar mantém o
     comportamento antigo. */
/* Quanto o jogador pode andar FISICAMENTE em um frame. A 72 Hz, caminhar
   depressa (1,5 m/s) dá ~2 cm por frame — 15 cm é sete vezes essa folga, e
   ainda assim menor que qualquer parede do jogo.

   POR QUE UM TETO, e por que DESCARTAR o excedente em vez de represá-lo:

   - **Salto grande atravessa parede.** A colisão do jogo empurra para fora do
     volume, mas não varre o caminho: um salto de 3 m aparece do outro lado e é
     empurrado pelo lado errado. Medido: 3,000 m atravessando direção que o
     próprio jogo reportava bloqueada.
   - **Recentrar não é andar.** `recenter()` muda a ORIGEM, não move ninguém —
     e o jogador era deslocado no mundo pela distância dele ao centro (medido:
     0,72 m e 0,59 m). O rig não distingue os dois; o teto distingue.
   - **Represar vira teleporte.** Enquanto o jogo não drenava (morto, dirigindo),
     o passo acumulava — 1,200 m morto, 1,005 m dirigindo — e o colisor saltava
     tudo de uma vez no frame em que voltava. Descartar o excedente é a escolha
     certa: o jogador não "tem direito" a metros guardados de quando não estava
     jogando. */
  const PASSO_MAX = 0.15;
  /* Frames de carência depois de um reset de referencial. Três cobrem a
     latência medida entre o evento e a pose nova chegar na câmera. */
  const REBASE_FRAMES = 3;
  function consumirPasso(alvo, limite = PASSO_MAX) {
    const out = alvo || { x: 0, z: 0 };
    const m = Math.hypot(passoX, passoZ);
    if (m > limite) {
      /* Entrega o teto e SUBTRAI só o entregue. O resto CONTINUA no acumulado
         — e isso não é detalhe de implementação, é o desenho: o acumulado É a
         posição da cabeça em relação ao colisor. Mexer nele move a vista.

         As três versões erradas deste mesmo trecho, todas medidas:
           1. represar (não drenar quando o jogo não podia absorver) →
              1,2 m guardados despejados de uma vez, o COLISOR teleportava;
           2. descartar o excedente → a cabeça era ARRASTADA de volta: morto,
              um passo físico de 0,80 m movia a vista 0,000 m;
           3. cortar o acumulado num teto → a VISTA saltava pela diferença,
              com fórmula exata `acumulado − 2,15` (5 m davam 2,85 m de pulo).

         O teto protege só o COLISOR, que é quem atravessa parede se pular. A
         0,15 m por frame ele alcança 2 m de atraso em menos de 0,2 s, sem que
         a cabeça sinta nada — quem se aproxima é o corpo. */
      const k = limite / m;
      out.x = passoX * k; out.z = passoZ * k;
      passoX -= out.x; passoZ -= out.z;
    } else {
      out.x = passoX; out.z = passoZ;
      passoX = 0; passoZ = 0;
    }
    return out;
  }

  /* RECENTRAR NÃO É ANDAR. `recenter()` (ou o `reset` que o sistema dispara ao
     redefinir o piso/origem) muda o REFERENCIAL, não move ninguém no mundo. Sem
     isto, a mudança de origem chega como um passo físico gigante e o jogador é
     teleportado pelo próprio tamanho do deslocamento dele até o centro —
     medido: 0,78 m fora do centro, 0,7778 m de deslocamento; a 1,41 m, 1,4142.
     Rebasear apaga a memória da pose anterior e joga fora o acumulado, porque
     depois de um reset o acumulado descreve um mundo que não existe mais. */
  function rebasear() {
    /* MARCA, não executa. O evento `reset` chega ANTES de o `place()` deste
       frame ler a pose nova: zerar aqui apagaria um acumulado que ainda não
       existe, e logo depois o `place()` mediria o salto da origem como passo
       físico e o jogador seria teleportado do mesmo jeito. Medido: a trilha do
       deslocamento subia em degraus de 0,15 m — o próprio teto de entrega,
       escoando um passo que nunca deveria ter nascido.
       Com a marca, quem consome é o `place()`, na ordem certa, seja qual for
       a ordem em que o navegador entrega as duas coisas. */
    pedidoRebase = REBASE_FRAMES;
  }

  /* A leitura que todo código de jogo deveria usar no lugar de
     `camera.position`: com pai, a posição local não é a do mundo. */
  function headWorldPosition(target) {
    return camera.getWorldPosition(target);
  }

  return {
    enter, exit, place, headWorldPosition, consumirPasso, rebasear,
    get rig() { return rig; },
    get entered() { return dentro; },
    get passoPendente() { return { x: passoX, z: passoZ }; },
  };
}
