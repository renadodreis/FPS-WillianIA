/* ================================================================
   ALTURA, POSTURA E CORPO VIRTUAL EM VR.

   Resolve três relatos do dono do projeto, que são o mesmo defeito visto
   de ângulos diferentes: "o boneco parece às vezes enterrado no chão" e
   "o corpo onde segura a arma parece deslocado do centro".

   O DIAGNÓSTICO, MEDIDO DENTRO DE UMA SESSÃO IMERSIVA
   ---------------------------------------------------
   O corpo em primeira pessoa (js/fpbody.js) foi desenhado para câmera de
   MOUSE: é FILHO DA CÂMERA, com o topo da cabeça 0,20 m acima do olho e
   altura fixa de 1,78 × 1,18 = 2,10 m. Isso amarra os pés a
   "altura do olho − 1,90 m". No desktop o olho está SEMPRE a 1,62 m, e a
   conta fecha em −0,28 m — que ninguém via, porque no desktop não se olha
   direto para baixo. Em VR a altura do olho é a do JOGADOR. Medido:

       cabeça a 1,90 m → pés a  −0,00 m do chão   (o boneco é um gigante
       cabeça a 1,60 m → pés a  −0,30 m            de 1,90 m de olho: só um
       cabeça a 1,25 m → pés a  −0,65 m            jogador dessa altura fecha)

   O "às vezes" do relato é isto: quanto mais baixo o jogador, mais fundo
   o boneco afunda. E, sendo filho da câmera, o tronco herda o PITCH:
   olhando 55° para baixo o eixo vertical do corpo cai para 0,574 — o
   corpo inteiro tomba para a frente e cruza o campo de visão. É o
   "deslocado do centro".

   O QUE ESTE MÓDULO FAZ, E DE ONDE VEM CADA REGRA
   -----------------------------------------------
   1. TIRA O CORPO DA CÂMERA e pendura no RIG. A câmera é a cabeça: só a
      cabeça pode herdar a pose dela. O tronco fica EM PÉ, sempre.
   2. DIMENSIONA O BONECO PELO JOGADOR. A escala sai da altura calibrada
      do headset, de forma que o olho do modelo caia na altura do olho
      real — é a mesma correção que Population: ONE publicou em patch
      ("Eye position is now lower & better matches eye height on
      characters"). Escalar o AVATAR é o caminho certo; escalar o mundo é
      anti-padrão documentado.
   3. PÉS PRESOS NO CHÃO. A origem do corpo acompanha a cabeça, mas nunca
      abaixo do ponto que deixaria o pé furar o piso. É o "floating
      stand-off" do Immersive Web SDK ("keeps you slightly above ground")
      e o `minHeadHeight` do VRIK: altura mínima da cabeça em relação à
      raiz, para a câmera não sair pelo chão.
   4. ÂNCORA NO CENTRO DA CABEÇA, NÃO NO HEADSET. A pose do visor fica à
      frente dos olhos; ancorar o tronco nela empurra o peito para dentro
      do campo de visão. Population: ONE consertou exatamente isso ("Set
      height at center of head instead of headset").
   5. PESCOÇO COM FOLGA. O quadril só começa a acompanhar a guinada da
      cabeça depois de 25° — o `maxRootAngle` do VRIK (o solver que a
      Oculus Studios criou para "Dead and Buried"), que é o número que a
      indústria calibrou para isso. Sem folga, o tronco cola na cabeça e
      olhar de lado torce os ombros junto com a arma.
   6. AGACHAR DE VERDADE. Baixar a cabeça agacha o jogador NO JOGO: a
      queda de altura vira a mesma tecla que o teclado escreveria, então
      colisão, velocidade e deslize continuam sendo o código já testado.
      Em Onward a altura do headset é entrada de gameplay — o jogo deriva
      dela se você está em pé, agachado ou deitado.

   Fontes e links: docs/vr/referencia-locomocao.md.

   NADA AQUI CRIA `Object3D`. É contrato do worldgen: todo `Object3D`
   gasta 4 números do `Math.random` seedado no UUID, e a ordem de consumo
   é o que faz servidor e bots reconstruírem o mesmo mundo. Este módulo só
   MOVE um objeto que já existe.
   ================================================================ */

/* graus */
const PESCOCO = 25 * Math.PI / 180;   // folga do quadril (VRIK maxRootAngle)
const QUADRIL = 8;                    // rapidez com que o quadril come o excesso
const RECUO = 0.08;                   // centro da cabeça atrás da pose do visor (m)
const RECUO_AGACHADO = 0.06;          // e mais um tanto agachado (VRIK moveBodyBackWhenCrouching)
const AFUNDA_MAX = 0.02;              // tolerância do pé abaixo do piso (m)
const AGACHA_ENTRA = 0.28;            // queda de cabeça que conta como agachar (m)
const AGACHA_SAI = 0.20;              // e a que devolve o "em pé" (histerese)
const AGACHA_CHEIO = 0.55;            // queda que conta como agachamento total
const DE_PE = [1.10, 2.10];           // faixa plausível de altura de olho (m)
const ESCALA = [0.70, 1.15];          // trava da escala do boneco
const CABECA_MIN = 0.15;              // abaixo disso a leitura não é de cabeça de gente

const trava = (v, [a, b]) => Math.min(b, Math.max(a, v));

export function criarCorpoXR({ THREE, camera }) {
  let corpo = null, rig = null;
  let salvo = null;                 // como o corpo estava antes do VR (desktop)
  let olhoModelo = 0;               // distância pés → origem do corpo, no modelo
  let alturaModelo = 0;
  let alturaCabeca = 0, alturaDePe = 0;
  let agachado = false, agacharFrac = 0;
  let yawCorpo = 0, escala = 1;
  let suspeita = false;

  const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4();
  const _cx = new THREE.Box3(), _cx2 = new THREE.Box3();
  const _f = new THREE.Vector3(), _u = new THREE.Vector3();

  /* Mede o modelo NO ESPAÇO DO PRÓPRIO CORPO. Traversar filho a filho (em vez
     de `Box3.setFromObject` seguido de uma inversão) evita inflar a caixa: uma
     AABB de mundo desrotacionada cresce, e o número que interessa aqui — onde
     ficam os PÉS em relação à origem — é justamente o que a inflação estraga. */
  function medirModelo() {
    if (!corpo) return false;
    corpo.updateWorldMatrix(true, true);
    _m.copy(corpo.matrixWorld).invert();
    _cx.makeEmpty();
    corpo.traverse(o => {
      const g = o.geometry;
      if (!g) return;
      if (!g.boundingBox) g.computeBoundingBox();
      if (!g.boundingBox) return;
      _cx2.copy(g.boundingBox).applyMatrix4(_m2.multiplyMatrices(_m, o.matrixWorld));
      _cx.union(_cx2);
    });
    const h = _cx.max.y - _cx.min.y;
    if (!Number.isFinite(h) || h < 0.5) return false;   // GLB ainda baixando
    alturaModelo = h;
    olhoModelo = -_cx.min.y;
    return olhoModelo > 0.5;
  }

  /* `rigObj` é o Group do js/xr/xrrig.js; `corpoObj` é a raiz do boneco em
     primeira pessoa (FpBody.bodyRoot). Guarda como estava para devolver o
     desktop intacto — a versão de mouse não pode regredir em nada. */
  function anexar(rigObj, corpoObj) {
    if (!rigObj || !corpoObj) return false;
    if (corpo === corpoObj && rig === rigObj) return true;
    corpo = corpoObj;
    rig = rigObj;
    salvo = {
      pai: corpo.parent,
      position: corpo.position.clone(),
      quaternion: corpo.quaternion.clone(),
      scale: corpo.scale.clone(),
    };
    medirModelo();
    rig.add(corpo);
    corpo.rotation.set(0, yawCorpo, 0);
    return true;
  }

  function soltar() {
    if (!corpo || !salvo) return;
    if (salvo.pai) salvo.pai.add(corpo);
    else if (corpo.parent) corpo.parent.remove(corpo);
    corpo.position.copy(salvo.position);
    corpo.quaternion.copy(salvo.quaternion);
    corpo.scale.copy(salvo.scale);
    corpo = null; rig = null; salvo = null;
  }

  /* Adota a altura atual como "em pé". O jogador que entra sentado e depois
     levanta (ou o contrário) recalibra por aqui em vez de ficar preso. */
  function calibrar() {
    alturaDePe = trava(alturaCabeca, DE_PE);
  }

  /* Guinada da CABEÇA relativa ao rig. Perto do zênite/nadir o "para frente"
     da cabeça vira vertical e a guinada fica indefinida — olhar direto para
     baixo é comum em VR (é como se olha para a própria arma e para o chão).
     Aí quem dá a direção é o "para cima" do capacete. */
  function guinadaDaCabeca() {
    _f.set(0, 0, -1).applyQuaternion(camera.quaternion);
    if (_f.x * _f.x + _f.z * _f.z < 0.0225) {
      _u.set(0, 1, 0).applyQuaternion(camera.quaternion);
      const s = _f.y < 0 ? 1 : -1;
      _f.set(s * _u.x, 0, s * _u.z);
      if (_f.x * _f.x + _f.z * _f.z < 1e-6) return yawCorpo;
    }
    return Math.atan2(-_f.x, -_f.z);
  }

  function update(dt) {
    const passo = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.1) : 0;
    const y = camera.position.y;

    /* LEITURA DE ALTURA IMPLAUSÍVEL = REFERÊNCIA ERRADA, não jogador agachado.
       Sessão que nasce em `local` (origem na CABEÇA, não no chão) devolve ~0
       aqui, sem uma linha de erro no console — é o defeito que a ordem de
       `setReferenceSpaceType` previne em js/xr/xrsession.js. Tratar isso como
       agachamento deixaria o jogador agachado para sempre. */
    suspeita = !(Number.isFinite(y) && y > CABECA_MIN);
    if (!suspeita) {
      alturaCabeca = y;
      // "em pé" é o mais alto que a cabeça já esteve: em XR o pulo do JOGO
      // move o rig, não a cabeça, então esta leitura só sobe se o jogador
      // subir de verdade.
      if (alturaCabeca > alturaDePe) alturaDePe = trava(alturaCabeca, DE_PE);
      else if (alturaDePe === 0) alturaDePe = trava(alturaCabeca, DE_PE);
    }

    const queda = suspeita ? 0 : Math.max(0, alturaDePe - alturaCabeca);
    agacharFrac = Math.min(1, queda / AGACHA_CHEIO);
    if (suspeita) agachado = false;
    else if (queda >= AGACHA_ENTRA) agachado = true;
    else if (queda <= AGACHA_SAI) agachado = false;

    if (!corpo || !rig) return;
    if (olhoModelo <= 0 && !medirModelo()) return;   // GLB ainda não chegou

    escala = trava(alturaDePe / olhoModelo, ESCALA);
    const olho = olhoModelo * escala;      // distância pé → origem, já escalada

    // guinada: o quadril só come o que passar da folga do pescoço
    const alvo = guinadaDaCabeca();
    let d = alvo - yawCorpo;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    const excesso = Math.abs(d) - PESCOCO;
    if (excesso > 0) {
      const k = passo > 0 ? 1 - Math.exp(-QUADRIL * passo) : 1;
      yawCorpo += Math.sign(d) * excesso * k;
    }

    /* Origem do corpo: debaixo da cabeça, recuada para o CENTRO da cabeça, e
       nunca tão baixa que o pé fure o piso. Agachando, a origem para de
       descer — quem desce é o joelho (js/fpbody.js dobra a perna por
       `player.crouchT`, que este agachamento alimenta). */
    const recuo = RECUO + RECUO_AGACHADO * agacharFrac;
    corpo.position.set(
      camera.position.x + Math.sin(yawCorpo) * recuo,
      Math.max(alturaCabeca, olho - AFUNDA_MAX),
      camera.position.z + Math.cos(yawCorpo) * recuo,
    );
    corpo.rotation.set(0, yawCorpo, 0);   // EM PÉ: nada de pitch nem roll da cabeça
    corpo.scale.setScalar(escala);
  }

  return {
    anexar, soltar, update, calibrar,
    get agachado() { return agachado; },
    get agacharFrac() { return agacharFrac; },
    get alturaCabeca() { return alturaCabeca; },
    get alturaDePe() { return alturaDePe; },
    get escala() { return escala; },
    get olhoModelo() { return olhoModelo; },
    get alturaModelo() { return alturaModelo; },
    get referenciaSuspeita() { return suspeita; },
    get anexado() { return !!corpo; },
    get guinada() { return yawCorpo; },
  };
}
