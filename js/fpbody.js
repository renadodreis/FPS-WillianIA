/* Corpo do jogador em primeira pessoa — helldiver rigado (51 ossos).
   Substitui as mãos-caixa: o corpo inteiro fica pendurado na câmera e os
   braços são resolvidos por IK de 2 ossos mirando as MESMAS âncoras
   (gun.parts.handR/handL) que a coreografia de recarga do game.js já move —
   ou seja: pente saindo, tapa no carregador, bombeada da escopeta e sway
   continuam com o timing original, agora com mãos e dedos de verdade.
   Se o GLB falhar, as mãos procedurais antigas continuam no lugar. */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { prepRiggedMesh } from './meshutils.js';

export function createFpBody(deps) {
  const { camera, player, getGun, weaponRoot } = deps;

  const bodyRoot = new THREE.Group();
  bodyRoot.visible = false;
  camera.add(bodyRoot);

  /* calibração (ajustada por screenshot no playtest) */
  const TUNE = {
    scale: 1.18,           // braços do modelo são curtos: corpo maior alcança o grip
    height: 1.78,          // altura alvo do modelo (m)
    eyeDrop: 0.2,          // topo da cabeça fica este tanto ACIMA do olho
    back: 0.05,            // centro do tronco recuado atrás da câmera (m)
    yaw: Math.PI,          // modelo olha pra -Z da câmera
    rollR: 1.4,            // rolagem do punho direito em volta do eixo dos dedos
    rollL: -1.6,           // idem esquerdo (palma abraça o guarda-mão por baixo)
    // direção dos DEDOS no espaço da arma: direita envolve o grip do gatilho,
    // esquerda cruza por baixo do guarda-mão
    fingersR: [-0.8, -0.25, -0.45],
    fingersL: [0.8, 0.3, -0.4],
    elbowOut: 0.34,        // quão aberto o cotovelo fica (direção do pole)
    elbowDown: 0.5,
    /* Fração do alcance onde a mão chega: sobra dobra de cotovelo. É uma
       RAZÃO, então atravessou o conserto de escala do braço sem recalibração —
       e a prova é que a pose de VR passou a ser a MESMA do desktop: cotovelo
       direito 145,51° → 143,07°, que é o número que o desktop já dava com a
       clavícula estendida. Era um ângulo diferente porque o triângulo estava
       inconsistente, não porque a calibração pedisse outro valor. */
    reachBend: 0.95,
    /* Extensão máxima da clavícula rumo à âncora, em metros de MUNDO — e
       DELIBERADAMENTE fora da escala do avatar, ao contrário do resto da
       calibração do corpo. Medido: escalá-la junto com o boneco (0,45 × 0,89 =
       0,4025 m em VR) não muda NADA no braço direito, que nunca encosta neste
       teto (ele para em `alcance × reachBend`), e afasta a mão ESQUERDA da
       âncora em mais 0,048 m — 0,2992 → 0,3472 m na empunhadura de perto e
       0,4428 → 0,4914 m na de longe. O braço esquerdo já não alcança o
       guarda-mão em VR (ver o relatório da rodada: a âncora fica a 0,89–1,03 m
       do ombro, contra 0,59 m de braço), e encurtar o único recurso que
       compra alcance só piora o que já está no limite. */
    clavMax: 0.45,
    /* AGACHAR ENCURTA A PERNA. O jogo baixa o olho de 1,62 m para 1,04 m
       (game.js, `eyeH`): 0,58 m é o tanto que a perna tem de encurtar para o
       pé continuar no chão quando o corpo desce junto com a câmera. Em VR
       quem manda é a queda MEDIDA da cabeça, que js/xr/xrbody.js escreve em
       `bodyRoot.userData.encurtar` (metros de mundo). */
    crouchDrop: 0.58,
    /* Flexão máxima de joelho humano ≈ 150°, ou seja 30° de ângulo INTERNO
       entre coxa e canela. É esse limite que define quanto a perna consegue
       encurtar (`pernaDobra`); passar dele deixa a canela deitada em cima da
       coxa e o boneco vira uma cadeira dobrável. */
    kneeMin: 30 * Math.PI / 180,
    /* NO AGACHAMENTO O QUADRIL VAI PARA TRÁS — e como aqui o quadril está
       preso debaixo da cabeça (que é quem manda), quem anda é o PÉ, para a
       frente. Não é enfeite: na pose de descanso o tornozelo já fica 0,107 m
       ATRÁS do quadril, e com o pé atrás não existe solução de IK com o joelho
       para a frente E para cima — o joelho mergulha. Medido com este valor em
       zero: joelho a 0,047 m do chão e a malha da perna 0,373 m ENTERRADA,
       com o tornozelo certinho no lugar. É o `moveBodyBackWhenCrouching` do
       VRIK visto do outro lado do mesmo osso. */
    footFwd: 0.22,
    stepLen: 0.75,         // passada: fração do balanço que vira avanço do pé (m/rad)
    stepLift: 0.30,        // e quanto o pé sobe na perna que vai à frente
    airTuck: 0.30,         // no ar os dois pés encolhem em direção ao corpo
    /* A CAPA VAI ATÉ O TORNOZELO (bainha a 0,089 m do chão em pé) e pendura no
       PEITO: com o corpo ancorado na cabeça, agachar levava a bainha 0,373 m
       PARA DENTRO DO CHÃO — o pé no lugar certo e o casaco atravessando o
       piso. São 3 tiras de 4 ossos, então o ângulo se acumula ao longo da
       tira; 0,38 rad por osso recolhe ~0,46 m de bainha no agachamento cheio,
       que é o casaco se juntando no chão em vez de furá-lo.

       O ângulo entra por RAIZ QUADRADA da dobra porque a bainha sobe com o
       cosseno do ângulo (quadrático perto de zero) enquanto o corpo desce
       LINEAR: com o ângulo proporcional, o meio do agachamento ficava com a
       bainha 0,045 m dentro do chão. */
    cloakLift: 0.38,
    kneeOut: 0.25,         // joelhos abrem um pouco para fora ao dobrar
  };

  const B = {};            // ossos por apelido
  const bind = new Map();  // pose de descanso (pos+quat locais) de cada osso tocado
  let armLen = null;       // { r: {a, b}, l: {a, b} } comprimentos braço/antebraço
  let readyFlag = false, failed = false;

  const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
  const _tp = new THREE.Vector3(), _pole = new THREE.Vector3(), _n = new THREE.Vector3();
  const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _tq = new THREE.Quaternion();
  const fingerAxis = { r: new THREE.Vector3(0, 0, -1), l: new THREE.Vector3(0, 0, -1) };
  /* buffers DEDICADOS do rig (não podem ser _v/_v2/_v3: esses são
     consumidos entre a escrita e a leitura). update() roda todo frame —
     tudo aqui era `new THREE.Vector3()` ou `.clone()` por frame. */
  const _sPos = new THREE.Vector3(), _ePos = new THREE.Vector3();
  const _camPos = new THREE.Vector3();
  const _rp = new THREE.Vector3(), _lp = new THREE.Vector3();
  const _dirR = new THREE.Vector3(), _dirL = new THREE.Vector3();
  /* buffers da perna (não podem dividir com o braço: o alvo do pé é montado
     antes do solver e lido depois de aimBone mexer nos registradores) */
  const _alvo = new THREE.Vector3(), _poloP = new THREE.Vector3(), _poloA = new THREE.Vector3();
  const _qf = new THREE.Quaternion(), _qf2 = new THREE.Quaternion();
  const _lenP = { a: 0, b: 0 };   // coxa/canela já na ESCALA DO MUNDO deste frame
  /* BRAÇO E ANTEBRAÇO NA ESCALA DO MUNDO DESTE FRAME — e, ao mesmo tempo, a
     única forma de medir de fora QUAL comprimento o solver alimentou na lei
     dos cossenos. Sem esta leitura, "o IK pede um braço maior do que existe"
     só dá para inferir; com ela o teste compara o número que entrou no solver
     com a distância que os ossos realmente vencem no mundo. */
  const alcanceUsado = { r: { a: 0, b: 0 }, l: { a: 0, b: 0 } };
  let legPairs = null; // montado uma vez, quando o rig fica pronto
  let legLen = null;   // { r: {a, b}, l: {a, b} } coxa/canela
  let pernaDobra = 0;  // quanto a perna encurta até o joelho chegar no limite (m)

  /* dedos: [curl base, curl ponta] por estado; indicador direito no gatilho */
  const GRIP = {
    default: { r: [0.85, 0.9], l: [0.8, 0.85], trigR: 0.35 },
    knife:   { r: [1.0, 1.05], l: [0.35, 0.4], trigR: 1.0 },
    pump:    { r: [0.85, 0.9], l: [0.95, 1.0], trigR: 0.35 },
    bazooka: { r: [0.9, 0.95], l: [0.9, 0.95], trigR: 0.6 },
    open:    { r: [0.12, 0.15], l: [0.12, 0.15], trigR: 0.12 },
    straps:  { r: [1.05, 1.1], l: [1.05, 1.1], trigR: 1.05 },
  };
  function gripFor(gun) {
    if (window.__FP_pose === 'chute') return GRIP.straps;
    if (window.__FP_pose === 'fall') return GRIP.open;
    if (!gun) return GRIP.default;
    if (gun.melee) return GRIP.knife;
    if (gun.parts && gun.parts.pump) return GRIP.pump;
    if (gun.rocket) return GRIP.bazooka;
    return GRIP.default;
  }

  new GLTFLoader().loadAsync('/assets/models/Personagens/low_poly_helldiver_rig.glb')
    .then(gltf => {
      const model = gltf.scene;
      prepRiggedMesh(model);
      /* normaliza a altura e pendura na câmera, ancorando pelo BOUNDING BOX
         (o pivô do GLB não é o pescoço — sem isto a câmera nasce dentro do peito)

         E ESTA LINHA É A ORIGEM MATERIAL DE UM DEFEITO QUE CUSTOU CARO, então
         fica escrito: `setFromObject` num `SkinnedMesh` GRAVA o resultado em
         `mesh.boundingBox`, e o three NUNCA invalida esse campo. Daqui em
         diante, qualquer `Box3.setFromObject` sobre este corpo devolve a caixa
         da pose que existia AGORA — a pose de bind —, por mais que os ossos se
         mexam depois. `computeBoundingBox` do `SkinnedMesh` é ciente da pose
         (passa por `applyBoneTransform`); quem congela é o cache, não o cálculo.

         Aqui isso é CORRETO e proposital: o que se quer é a altura em repouso,
         uma vez, para calcular a escala. O que não se pode é medir pose animada
         por caixa depois disto — mede-se por OSSO (`bone.getWorldPosition`), e
         foi por ignorar isso que três arquivos de teste desta base passaram a
         medir a RAIZ acreditando medir os pés. */
      const box = new THREE.Box3().setFromObject(model);
      const h = box.max.y - box.min.y;
      const s = (TUNE.height / Math.max(h, 1e-3)) * TUNE.scale;
      const orient = new THREE.Group();
      orient.rotation.y = TUNE.yaw;
      orient.scale.setScalar(s);
      orient.add(model);
      orient.updateMatrixWorld(true);
      const sBox = new THREE.Box3().setFromObject(orient);
      orient.position.set(
        -(sBox.min.x + sBox.max.x) * 0.5,
        TUNE.eyeDrop - sBox.max.y,          // topo da cabeça logo acima do olho
        -(sBox.min.z + sBox.max.z) * 0.5 + TUNE.back,
      );
      bodyRoot.add(orient);

      // o GLTFLoader remove pontos/espaços dos nomes ("Arm_1.L_13" → "Arm_1L_13"):
      // compara tudo normalizado pra não depender do sanitizador do three
      const norm = s => String(s).replace(/[.\s]/g, '');
      const find = frag => {
        const f = norm(frag);
        let hit = null;
        model.traverse(o => { if (!hit && o.isBone && norm(o.name).includes(f)) hit = o; });
        return hit;
      };
      B.head = find('Head_');
      B.chest = find('Chest');
      B.torso = find('Torso');
      B.shR = find('Sholder.R'); B.upR = find('Arm_1.R'); B.foR = find('Arm_2.R'); B.haR = find('Hand.R');
      B.shL = find('Sholder.L'); B.upL = find('Arm_1.L'); B.foL = find('Arm_2.L'); B.haL = find('Hand.L');
      B.pelR = find('Pelvis.R'); B.leg1R = find('Leg_1.R'); B.leg2R = find('Leg_2.R'); B.footR = find('Boot.R');
      B.pelL = find('Pelvis.L'); B.leg1L = find('Leg_1.L'); B.leg2L = find('Leg_2.L'); B.footL = find('Boot.L');
      B.cloak = [];
      model.traverse(o => { if (o.isBone && norm(o.name).startsWith('Cloak')) B.cloak.push(o); });
      B.fingersR = []; B.fingersL = [];
      model.traverse(o => {
        if (!o.isBone || !/^Finger/.test(o.name)) return;
        const n = norm(o.name);
        if (/R_\d+$/.test(n)) B.fingersR.push(o);
        else if (/L_\d+$/.test(n) || n === 'Finger_6_5') B.fingersL.push(o); // 6 = polegar esquerdo (sem sufixo no rig)
      });
      if (!B.upR || !B.foR || !B.haR || !B.upL || !B.foL || !B.haL)
        throw new Error('ossos dos braços não encontrados no helldiver');

      // cabeça some (câmera mora dentro dela)
      if (B.head) B.head.scale.setScalar(0.0001);

      // guarda a pose de descanso de tudo que vamos mexer
      const track = [B.chest, B.torso, B.shR, B.upR, B.foR, B.haR, B.shL, B.upL, B.foL, B.haL,
        B.pelR, B.leg1R, B.leg2R, B.footR, B.pelL, B.leg1L, B.leg2L, B.footL,
        ...B.cloak, ...B.fingersR, ...B.fingersL];
      for (const b of track) if (b) bind.set(b, { p: b.position.clone(), q: b.quaternion.clone() });

      // comprimentos dos segmentos em unidades de MUNDO (com escala aplicada)
      bodyRoot.visible = true;
      bodyRoot.updateWorldMatrix(true, true);
      const dist = (x, y) => x.getWorldPosition(_v).distanceTo(y.getWorldPosition(_v2));
      armLen = {
        r: { a: dist(B.upR, B.foR), b: dist(B.foR, B.haR) },
        l: { a: dist(B.upL, B.foL), b: dist(B.foL, B.haL) },
      };
      medirPernas();
      // eixo real dos dedos no espaço LOCAL da mão (média das falanges base):
      // é ele que a gente alinha com a direção da empunhadura da arma
      for (const [key, hand, fingers] of [['r', B.haR, B.fingersR], ['l', B.haL, B.fingersL]]) {
        const acc = new THREE.Vector3();
        for (const f of fingers) if (f.parent === hand) acc.add(f.position);
        if (acc.lengthSq() > 1e-8) fingerAxis[key].copy(acc.normalize());
      }
      readyFlag = true;
      // com o rig no lugar, as mãos-caixa procedurais somem de todas as armas
      for (const gun of deps.arsenal) {
        for (const k of ['handR', 'handL']) {
          if (gun.parts && gun.parts[k]) gun.parts[k].traverse(o => { if (o.isMesh) o.visible = false; });
        }
      }
    })
    .catch(err => {
      failed = true;
      console.error('FP body falhou — mantendo mãos procedurais:', err);
    });

  /* gira um osso no MUNDO de forma que a direção atual `from` aponte pra `to`.
     Escratch PRÓPRIO (_af/_at): fromDir/toDir chegam nos registradores
     compartilhados (_v/_v2/_v3) — usar _v aqui já engoliu o toDir do cotovelo
     e deixou o antebraço inerte (mão a ~0,65 m da âncora, item 6 do backlog) */
  const _af = new THREE.Vector3(), _at = new THREE.Vector3();
  function aimBone(bone, fromDir, toDir) {
    _q.setFromUnitVectors(_af.copy(fromDir).normalize(), _at.copy(toDir).normalize());
    bone.getWorldQuaternion(_q2);
    _q.multiply(_q2); // quat mundial desejado
    bone.parent.getWorldQuaternion(_q2).invert();
    bone.quaternion.copy(_q2.multiply(_q));
    bone.updateWorldMatrix(true, true);
  }
  /* punho: alinha o eixo dos dedos com a direção da empunhadura + rolagem */
  function alignHand(hand, axisLocal, worldDir, roll) {
    hand.updateWorldMatrix(true, false);
    _v.copy(axisLocal).transformDirection(hand.matrixWorld).normalize(); // dedos hoje
    _v2.copy(worldDir).normalize();
    _q.setFromUnitVectors(_v, _v2);
    hand.getWorldQuaternion(_q2);
    _q.multiply(_q2);                                   // quat mundial alinhado
    _tq.setFromAxisAngle(_v2, roll).multiply(_q);       // rolagem em volta dos dedos
    hand.parent.getWorldQuaternion(_q2).invert();
    hand.quaternion.copy(_q2.multiply(_tq));
    hand.updateWorldMatrix(true, true);
  }

  /* IK analítico de 2 ossos com dobra guiada por "pole" (cotovelo) */
  function solveArm(sh, up, fore, hand, len, targetPos, sideSign) {
    /* O COMPRIMENTO QUE ENTRA NO SOLVER É O DESTE FRAME, não o do
       carregamento. `armLen` foi medido com a raiz em escala 1; em VR a raiz
       carrega a escala do avatar (js/xr/xrbody.js dimensiona o boneco pelo
       jogador) e o solver trabalha em MUNDO. Ver `resolverPernas`: é o mesmo
       defeito que deixava o joelho dobrado com o jogador de pé. */
    const escala = bodyRoot.scale.x || 1;
    const L = alcanceUsado[sideSign > 0 ? 'r' : 'l'];
    L.a = len.a * escala;
    L.b = len.b * escala;
    // clavícula: âncora além do alcance → o OMBRO estende rumo ao alvo até
    // sobrar dobra de cotovelo (o clamp sozinho deixava o braço reto e a mão
    // curta — a âncora de apoio fica a até ~1 m do ombro em várias armas)
    if (sh) {
      _v.copy(targetPos).sub(up.getWorldPosition(_v2));
      const need = Math.min(
        Math.max(_v.length() - (L.a + L.b) * TUNE.reachBend, 0), TUNE.clavMax);
      if (need > 1e-4) {
        _v.normalize().multiplyScalar(need);                 // delta em mundo
        sh.parent.getWorldQuaternion(_q).invert();
        _v.applyQuaternion(_q).divide(sh.parent.getWorldScale(_v3));
        sh.position.add(_v);
      }
    }
    // pole: cotovelo pra fora/baixo em relação à câmera
    camera.getWorldQuaternion(_tq);
    _poloA.set(sideSign * TUNE.elbowOut, -TUNE.elbowDown, 0.05).applyQuaternion(_tq);
    dobrar2Ossos(up, fore, hand, L, targetPos, _poloA);
    // (o punho é alinhado depois por alignHand — eixo dos dedos + rolagem)
  }

  /* IK ANALÍTICO DE 2 OSSOS (lei dos cossenos), compartilhado por braço e
     perna: gira `up` e `fore` até `end` alcançar o alvo, com a junta do meio
     dobrando na direção de `poloDir`. Sem iteração — uma passada, resultado
     determinístico, mesmo número em todo frame com a mesma entrada. */
  function dobrar2Ossos(up, fore, end, len, targetPos, poloDir) {
    const sPos = up.getWorldPosition(_sPos);
    _tp.copy(targetPos).sub(sPos);
    const reach = len.a + len.b;
    let d = _tp.length();
    if (d < 1e-4) return;
    if (d > reach * 0.999) { _tp.multiplyScalar((reach * 0.999) / d); d = reach * 0.999; }
    else {
      /* ALVO DENTRO DO BURACO INTERNO. Com d < |a−b| não existe triângulo: o
         cosseno passa de 1 e a junta desanda. Perna dobrada ao máximo é o mais
         perto que a ponta chega — empurra o alvo até lá em vez de estourar. */
      const minR = Math.abs(len.a - len.b) * 1.001 + 1e-4;
      if (d < minR) { _tp.multiplyScalar(minR / d); d = minR; }
    }
    _n.copy(_tp).normalize();
    _pole.copy(poloDir);
    _pole.addScaledVector(_n, -_pole.dot(_n)); // perpendicular à linha raiz→alvo
    if (_pole.lengthSq() < 1e-6) _pole.set(0, -1, 0).addScaledVector(_n, _n.y);
    _pole.normalize();

    const cosA = Math.min(1, Math.max(-1, (len.a * len.a + d * d - len.b * len.b) / (2 * len.a * d)));
    const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
    // posição desejada da junta do meio
    _v.copy(sPos).addScaledVector(_n, len.a * cosA).addScaledVector(_pole, len.a * sinA);

    // 1) osso de cima mira a junta desejada
    fore.getWorldPosition(_v2).sub(sPos);
    aimBone(up, _v2, _v3.copy(_v).sub(sPos));
    // 2) junta mira o alvo
    const ePos = fore.getWorldPosition(_ePos);
    end.getWorldPosition(_v3).sub(ePos);
    aimBone(fore, _v3, _v.copy(targetPos).sub(ePos));
  }

  /* ================================================================
     A PERNA QUE ENCURTA — a causa raiz do corpo "enterrado" em VR.

     O QUE HAVIA AQUI, E POR QUE NÃO FUNCIONAVA. O agachamento girava a
     bacia num sentido e o joelho no outro; a perna mudava de FORMA e o pé
     ficava no mesmo lugar. Medido: `crouchT` de 0 a 1 movia o osso do pé
     0,0559 m, com a perna encurtando 0,0884 m de 0,58 m necessários. No
     desktop ninguém via, porque a câmera desce junto e ninguém olha para
     o próprio pé. Em VR isso é o defeito inteiro: com a perna rígida,
     ancorar o corpo na CABEÇA (o que o critério C5 pede) enterra o pé
     exatamente o tanto que o jogador agachou, e ancorar nos PÉS põe o
     peito do boneco na altura dos olhos — medido, ombro 0,190 m ACIMA do
     olho e topo do boneco 0,709 m acima. É o mesmo cobertor curto: o
     VRIK, que a Oculus Studios criou para "Dead and Buried" e que virou
     o padrão do gênero, nomeia o trade-off pelo nome (`plantFeet` "can
     cause the camera to exit the head").

     O QUE ESTÁ AQUI AGORA. IK ANALÍTICO DE 2 OSSOS (coxa + canela), a
     mesma lei dos cossenos do braço, com o PÉ como alvo e o joelho
     dobrando na direção de um polo. O alvo do pé é a posição de descanso
     dele SUBIDA de `encurtar` metros: como a raiz do corpo desce esse
     mesmo tanto (a cabeça é quem manda), o pé fica parado no MUNDO.

     De onde vem `encurtar`:
       - em VR, de `bodyRoot.userData.encurtar` (metros de MUNDO), que
         js/xr/xrbody.js escreve com a queda MEDIDA da cabeça do jogador;
       - no desktop, do agachamento do teclado — o jogo baixa o olho
         0,58 m e a perna encurta esse tanto.

     O TETO É ANATÔMICO, não arbitrário: `pernaDobra` é o quanto a perna
     encurta até o joelho chegar em 30° de ângulo interno (150° de flexão,
     o máximo humano). Pedir mais que isso não dobra mais — o corpo é que
     para de descer, e quem agacha fundo demais vê o ombro subir alguns
     centímetros em vez de ver o próprio pé furar o chão.
     ================================================================ */
  const pernaRepouso = { r: null, l: null };  // pé, polo e orientação, no espaço da RAIZ

  function medirPernas() {
    const pares = [['r', B.leg1R, B.leg2R, B.footR], ['l', B.leg1L, B.leg2L, B.footL]];
    if (pares.some(([, q, j, p]) => !q || !j || !p)) return;
    bodyRoot.updateWorldMatrix(true, true);
    const dist = (x, y) => x.getWorldPosition(_v).distanceTo(y.getWorldPosition(_v2));
    legLen = {
      r: { a: dist(B.leg1R, B.leg2R), b: dist(B.leg2R, B.footR) },
      l: { a: dist(B.leg1L, B.leg2L), b: dist(B.leg2L, B.footL) },
    };
    /* Uma vez só, no carregamento: alocar Vector3/Quaternion aqui não mexe no
       `Math.random` seedado (só Object3D e BufferGeometry gastam número no
       UUID), e nada disso roda por frame. */
    const inv = new THREE.Matrix4().copy(bodyRoot.matrixWorld).invert();
    const qRaiz = bodyRoot.getWorldQuaternion(new THREE.Quaternion()).invert();
    let dobra = Infinity;
    for (const [k, quadril, joelho, pe] of pares) {
      const hip = quadril.getWorldPosition(new THREE.Vector3());
      const joe = joelho.getWorldPosition(new THREE.Vector3());
      const tor = pe.getWorldPosition(new THREE.Vector3());
      const eixo = tor.clone().sub(hip);
      const L0 = eixo.length();
      if (L0 < 1e-4) return;
      eixo.multiplyScalar(1 / L0);
      /* POLO DO JOELHO LIDO DO PRÓPRIO RIG: é a componente de (joelho −
         quadril) perpendicular à linha quadril→pé, ou seja, o lado para onde
         esta perna já dobra na pose de descanso. Ler do modelo em vez de
         cravar "para frente" mantém o solver honesto se o rig mudar. */
      const polo = joe.clone().sub(hip);
      polo.addScaledVector(eixo, -polo.dot(eixo));
      if (polo.lengthSq() < 1e-8) polo.set(0, 0, -1);   // rig reto: joelho pra frente
      polo.normalize();
      const peRaiz = tor.clone().applyMatrix4(inv);
      pernaRepouso[k] = {
        pe: peRaiz,
        polo: polo.clone().transformDirection(inv),
        quat: qRaiz.clone().multiply(pe.getWorldQuaternion(new THREE.Quaternion())),
        lado: Math.sign(peRaiz.x) || 1,
        L0,
      };
      const { a, b } = legLen[k];
      const dMin = Math.sqrt(Math.max(0, a * a + b * b - 2 * a * b * Math.cos(TUNE.kneeMin)));
      dobra = Math.min(dobra, Math.max(0, L0 - dMin));
    }
    pernaDobra = Number.isFinite(dobra) ? dobra : 0;
    /* CONTRATO COM O MÓDULO DE VR, sem passar pelo game.js: quem ancora o
       corpo precisa saber até onde a perna dobra antes de mandar descer. */
    bodyRoot.userData.pernaDobra = pernaDobra;
  }

  function resolverPernas(stride, air) {
    if (!legLen || !pernaRepouso.r || !pernaRepouso.l) return 0;
    /* A RAIZ CARREGA A ESCALA DO AVATAR em VR (o boneco é dimensionado pelo
       jogador). `userData.encurtar` chega em metros de MUNDO; tudo aqui é no
       espaço da raiz, então divide. */
    const escala = bodyRoot.scale.x || 1;
    const pedido = Number.isFinite(bodyRoot.userData.encurtar)
      ? bodyRoot.userData.encurtar / escala
      : TUNE.crouchDrop * player.crouchT;
    const enc = Math.min(Math.max(pedido, 0), pernaDobra);
    const k = pernaDobra > 1e-4 ? enc / pernaDobra : 0;
    if (!legPairs) {
      legPairs = [['l', B.leg1L, B.leg2L, B.footL, 1], ['r', B.leg1R, B.leg2R, B.footR, -1]];
    }
    for (const [lado, quadril, joelho, pe, s] of legPairs) {
      const rep = pernaRepouso[lado];
      const sw = Math.sin(walkPh) * s * stride;
      _alvo.copy(rep.pe);
      _alvo.y += enc;                                     // encurta: o pé sobe NA RAIZ
      _alvo.z -= TUNE.footFwd * k;                        // agachou: o pé vai à frente do quadril
      _alvo.z -= sw * TUNE.stepLen;                       // passada (−Z é a frente do corpo)
      _alvo.y += Math.max(0, sw) * TUNE.stepLift + air * TUNE.airTuck;
      bodyRoot.localToWorld(_alvo);
      _poloP.copy(rep.polo);
      _poloP.x += rep.lado * TUNE.kneeOut * k;            // joelhos abrem ao dobrar
      _poloP.transformDirection(bodyRoot.matrixWorld);
      /* O SOLVER TRABALHA EM MUNDO, e em VR o boneco é dimensionado pelo
         jogador: `legLen` foi medido com a raiz em escala 1, então a coxa e a
         canela precisam entrar na escala DESTE frame. Sem isto o IK pede uma
         perna 12 % mais longa do que existe e dobra o joelho parado em pé —
         medido: joelho a 130,9° e pé 0,0618 m no ar, com o jogador de pé. */
      _lenP.a = legLen[lado].a * escala;
      _lenP.b = legLen[lado].b * escala;
      dobrar2Ossos(quadril, joelho, pe, _lenP, _alvo, _poloP);
      /* PÉ CHAPADO. Sem isto a canela deitada do agachamento fundo gira a bota
         junto e a ponta fura o piso. A bota volta à MESMA orientação que tem
         em pé, que é onde ela já estava certa. */
      bodyRoot.getWorldQuaternion(_qf).multiply(rep.quat);
      pe.parent.getWorldQuaternion(_qf2).invert();
      pe.quaternion.copy(_qf2.multiply(_qf));
      pe.updateWorldMatrix(false, true);
    }
    return k;
  }

  /* curl dos dedos: cada dedo tem 2 falanges (Finger_1..10 = 5 dedos × 2) */
  function curlFingers(bones, base, tip, trig, isRight, k) {
    for (const b of bones) {
      const bd = bind.get(b);
      if (!bd) continue;
      // o índice do dedo vem do NOME do osso e nunca muda: a regex rodava
      // ~40 vezes por frame (e cada match aloca um array)
      let idx = b.userData.fingerIdx;
      if (idx === undefined) idx = b.userData.fingerIdx = parseInt(b.name.match(/^Finger_(\d+)/)[1], 10);
      const isTip = idx % 2 === 0;       // pares = segunda falange
      const digit = Math.ceil(idx / 2);  // 1..5
      let amt = isTip ? tip : base;
      if (isRight && digit === 1) amt = trig;      // indicador no gatilho
      if (digit === 5) amt *= 0.75;                // polegar fecha menos
      _q.setFromAxisAngle(_v.set(1, 0, 0), amt); // + fecha a mão neste rig
      b.quaternion.copy(bd.q).multiply(_q);
      // suaviza: mistura com a pose anterior pra não "teleportar" o dedo
      if (b.userData.prevQ) b.quaternion.slerp(b.userData.prevQ, Math.max(0, 1 - k));
      b.userData.prevQ = (b.userData.prevQ || new THREE.Quaternion()).copy(b.quaternion);
    }
  }

  let walkPh = 0, gunHiddenByPose = null;
  function update(dt, t) {
    if (!readyFlag || failed) return;
    const gun = getGun();
    bodyRoot.visible = weaponRoot.visible;
    // na queda/paraquedas a arma some (as mãos estão nas alças, não no gatilho)
    const poseNow = window.__FP_pose;
    if (poseNow && gun && gun.group.visible) { gun.group.visible = false; gunHiddenByPose = gun; }
    else if (!poseNow && gunHiddenByPose) { gunHiddenByPose.group.visible = gunHiddenByPose === gun; gunHiddenByPose = null; }
    if (!bodyRoot.visible) return;

    // reset pra pose de descanso (deltas de IK não podem acumular)
    for (const [b, bd] of bind) { b.position.copy(bd.p); b.quaternion.copy(bd.q); }
    bodyRoot.updateWorldMatrix(true, true);

    /* pernas: o PÉ é que tem alvo — passada proporcional à velocidade, no ar
       encolhe, e agachar ENCURTA a perna (IK de 2 ossos, ver resolverPernas) */
    const spd = Math.hypot(player.vel.x, player.vel.z);
    walkPh += dt * Math.min(spd, 9) * 1.35;
    const stride = Math.min(spd / 5.2, 1) * (player.onGround ? 0.55 : 0.1);
    const air = player.onGround ? 0 : 1;
    const agacharK = resolverPernas(stride, air);
    /* respiração + capa balançando. O tronco inclina com a DOBRA REAL da perna
       e não com a tecla: em VR quem agacha é a cabeça do jogador, e usar
       `crouchT` deixaria o tronco fora de fase com a perna. */
    if (B.chest) {
      _q.setFromAxisAngle(_v.set(1, 0, 0), Math.sin(t * 1.6) * 0.014 + agacharK * 0.25);
      B.chest.quaternion.multiply(_q);
    }
    for (let i = 0; i < B.cloak.length; i++) {
      const c = B.cloak[i];
      _q.setFromAxisAngle(_v.set(1, 0, 0),
        Math.sin(t * 1.9 + i) * 0.05 + Math.min(spd / 8, 1) * 0.3
        + Math.sqrt(agacharK) * TUNE.cloakLift);
      c.quaternion.multiply(_q);
    }

    /* alvos das mãos (posição) + direção dos dedos (empunhadura) */
    const pose = window.__FP_pose;
    camera.getWorldQuaternion(_tq);
    const camPos = camera.getWorldPosition(_camPos);
    const rp = _rp, lp = _lp;
    const dirR = _dirR, dirL = _dirL;
    if (pose === 'chute' || pose === 'fall') { // paraquedas: mãos nas alças / caindo: braços abertos
      const up = pose === 'chute';
      rp.set(up ? 0.26 : 0.55, up ? 0.38 : -0.12, up ? -0.16 : -0.3).applyQuaternion(_tq).add(camPos);
      lp.set(up ? -0.26 : -0.55, up ? 0.38 : -0.12, up ? -0.16 : -0.3).applyQuaternion(_tq).add(camPos);
      dirR.set(0.15, up ? 0.9 : 0.1, up ? 0.25 : -0.95).applyQuaternion(_tq);
      dirL.set(-0.15, up ? 0.9 : 0.1, up ? 0.25 : -0.95).applyQuaternion(_tq);
    } else if (gun && gun.parts && gun.parts.handR) {
      gun.parts.handR.getWorldPosition(rp);
      gun.group.getWorldQuaternion(_q2);
      dirR.set(TUNE.fingersR[0], TUNE.fingersR[1], TUNE.fingersR[2]).applyQuaternion(_q2);
      if (gun.melee) { // faca: mão esquerda relaxada ao lado do corpo
        lp.set(-0.28, -0.52, -0.02).applyQuaternion(_tq).add(camPos);
        dirL.set(-0.1, -0.65, -0.75).applyQuaternion(_tq);
      } else {
        gun.parts.handL.getWorldPosition(lp);
        dirL.set(TUNE.fingersL[0], TUNE.fingersL[1], TUNE.fingersL[2]).applyQuaternion(_q2);
      }
    } else return;

    solveArm(B.shR, B.upR, B.foR, B.haR, armLen.r, rp, 1);
    solveArm(B.shL, B.upL, B.foL, B.haL, armLen.l, lp, -1);
    alignHand(B.haR, fingerAxis.r, dirR, TUNE.rollR);
    alignHand(B.haL, fingerAxis.l, dirL, TUNE.rollL);

    /* dedos: preset da arma; na recarga a mão que viaja abre um pouco */
    const g = gripFor(gun);
    let reachK = 0;
    if (gun && gun.reloading) {
      const k = Math.min(Math.max(1 - (gun.reloadEnd - t) / gun.reloadTime, 0), 1);
      reachK = Math.sin(Math.min(k / 0.2, 1) * Math.PI) * 0.5 + (k > 0.4 && k < 0.7 ? 0.4 : 0);
    }
    curlFingers(B.fingersR, g.r[0], g.r[1], g.trigR, true, 0.65);
    curlFingers(B.fingersL, Math.max(0.15, g.l[0] - reachK), Math.max(0.2, g.l[1] - reachK), g.l[0], false, 0.65);
  }

  const api = {
    update,
    get ready() { return readyFlag; },
    get failed() { return failed; },
    /* quanto a perna consegue encurtar antes de o joelho passar do limite
       humano (metros, no espaço da raiz — em VR multiplique pela escala) */
    get pernaDobra() { return pernaDobra; },
    /* QA: braço e antebraço que o solver ALIMENTOU na lei dos cossenos no
       último frame, em metros de MUNDO. É o número que decide onde o cotovelo
       e a mão param; comparar com a distância real entre os ossos é o que
       separa "o IK acertou" de "o IK pediu um braço que não existe". */
    get alcanceDoIK() { return alcanceUsado; },
    bones: B, TUNE, bodyRoot,
    /* inspeção: solta o corpo no mundo pra fotografar de fora (calibração) */
    debugDetach(x, y, z) {
      deps.camera.remove(bodyRoot);
      deps.camera.parent.add(bodyRoot);
      bodyRoot.position.set(x, y, z);
      bodyRoot.visible = true;
    },
    debugAttach() {
      bodyRoot.parent && bodyRoot.parent.remove(bodyRoot);
      deps.camera.add(bodyRoot);
      bodyRoot.position.set(0, 0, 0);
    },
    debugBindPose() { // volta o rig pra pose de descanso (foto de calibração)
      for (const [b, bd] of bind) { b.position.copy(bd.p); b.quaternion.copy(bd.q); }
      bodyRoot.updateWorldMatrix(true, true);
    },
  };
  window.__FP = api; // depuração/calibração nos testes
  return api;
}
