/* ================================================================
   A ARMA NA MÃO EM VR — empunhadura, linha de mira e ADS físico.

   POR QUE ISTO EXISTE. Pendurar a arma no controle e reaproveitar o ADS de
   mouse produz exatamente a experiência que o dono do projeto reprovou: "a
   mira e a forma de mirar estão horríveis... não consigo ver o buraco da mira
   da arma, de forma real" e "o corpo onde segura a arma parece deslocado do
   centro". São QUATRO defeitos distintos, e este módulo resolve os quatro.
   O estudo completo, com fontes, está em docs/vr/referencia-arma-mira.md.

   1. O ESPAÇO ERRADO. A spec do WebXR define dois espaços por controle:
      `targetRaySpace` ("para onde este controle aponta") e `gripSpace`
      ("if the user was holding a straight rod in their hand, it would be
      aligned with the negative Z axis and the origin rests at their palm").
      A recomendação é literal: "The gripSpace should be used instead to place
      the renderable model of a 'tracked-pointer'". E a diferença NÃO é
      cosmética — decodificando a `gripOffsetMatrix` do config oficial da Meta
      (o mesmo do Quest 3), os dois espaços diferem de **45,4° de inclinação e
      ~5 cm de deslocamento**. Arma no raio de mira = punho 45° torto.

   2. OFFSET DE PC APLICADO NA MÃO. No desktop a arma é filha da CÂMERA e a
      pose é escrita todo frame em coordenadas relativas ao OLHO (hip do fuzil
      = 0.26, −0.185, −0.44). Trocando só o PAI, esse mesmo offset passou a
      significar "meio metro à frente do punho". Por isso este módulo REESCREVE
      a pose depois do `applyFpsCamera`: a pose de VR é da mão, não da tela.
      A âncora usada é a `gripR` do perfil da arma (js/weaponrig.js), que já é
      calibrada contra os GLBs reais.

   3. A MIRA NÃO ERA A DA ARMA. O tiro saía do raio do controle, sem nenhuma
      relação com o desenho das miras. Aqui nasce um objeto — a LINHA DE MIRA —
      posicionado na ocular e orientado pelo eixo óptico `eye → front` do
      perfil ativo, que é a MESMA fonte que o ADS de PC usa. O game.js aponta
      `fonteDaMira()` para ele e o tiro passa a sair pelas miras: alinhar o
      ferro vira a mecânica, não a decoração.

   4. ADS DE BOTÃO. Em VR não existe "aim down sights" animado: o jogador
      ENCOSTA a arma no olho (é para isso que existe a indústria de gunstock).
      Aqui `adsT` deixa de vir do botão e passa a ser MEDIDO — o quanto o olho
      está perto da linha de mira e a que distância da ocular. O que ele
      controla continua sendo o mesmo (espalhamento, recuo, retículo); o que
      sai é mover a arma na frente do jogador, que é enjoo e não game feel.

   DUAS MÃOS (Onward/Pavlov): quando a mão de apoio chega perto da âncora
   `supportHand`, a direção do cano passa a ser a LINHA ENTRE AS MÃOS. A
   transição é SUAVE de propósito: com controles, "a direção que cada mão
   aponta" e "a linha entre as mãos" não coincidem como no mundo real, e o
   engate seco faz a mira SALTAR — é a reclamação clássica do gênero. Engate e
   solta têm histerese, como o "break distance" do Pavlov.

   NADA AQUI É CRIADO NO BOOT: o objeto da linha de mira nasce no primeiro
   frame DENTRO da sessão. Todo `Object3D` gasta 4 números do `Math.random`
   seedado no UUID, e a ordem de consumo é contrato do worldgen.

   ARMADILHA DO THREE: `getWorldDirection` devolve o +Z do objeto — só
   `Camera` sobrescreve para -Z. Toda direção aqui sai do quaternion de mundo
   (`set(0,0,-1).applyQuaternion(q)`), que vale para os dois.
   ================================================================ */

/* Janela de mira: o olho precisa estar ATRÁS da ocular, entre estes limites,
   e perto do eixo. Os números são a "sight picture" possível com o Touch na
   mão — folgados o bastante para não exigir precisão de milímetro, apertados
   o bastante para que a arma no quadril não conte como mirada. */
/* MAIOR QUE `CABECA_RAIO`, e isso é INVARIANTE, não gosto. Enquanto valeu 0,06
   as duas janelas se sobrepunham em 6 cm: medido, recuo de 0,1004 m dava
   `mirando: true` E `naCara: true` — o jogador fazia exatamente o gesto de
   mirar que pediu e a arma DESAPARECIA. Mirar e sumir não podem coexistir; a
   asserção logo abaixo trava isso. */
export const RECUO_MIN = 0.14;   // colado demais: a ocular estaria na pupila
export const RECUO_MAX = 0.45;   // além disso a arma está no quadril
export const PERP_MAX = 0.085;   // desvio lateral do olho até o eixo óptico

/* Guarda-mão: engata perto, solta longe. A histerese impede o liga-desliga
   quando a mão de apoio fica na fronteira. */
export const APOIO_PEGA = 0.20;
export const APOIO_SOLTA = 0.32;

/* A CULATRA NA CARA: a arma SOME, ela não é empurrada. Empurrar seria a
   correção intuitiva e é a errada — ela desgruda a arma da mão, que é
   justamente o defeito que este módulo veio consertar, e o jogador sente a
   arma "escorregando" do punho. O que os jogos do gênero fazem é não deixar o
   jogador ver o interior do modelo; o plano próximo da câmera (0,08 m) já corta
   quase tudo, e este raio é a margem em cima dele. É rede de segurança, não
   mecânica: com o controle na bochecha a ocular fica a ~20 cm do olho, bem
   fora daqui. */
export const CABECA_RAIO = 0.12;

/* O invariante que amarra os dois números acima: NENHUM recuo pode estar ao
   mesmo tempo dentro da janela de mira e dentro do raio que esconde a arma.
   Deixado implícito, isso já produziu o defeito de a arma sumir no gesto
   principal do jogo — e nenhum teste de unidade pegava, porque cada constante
   estava "certa" sozinha. */
export const JANELAS_SEPARADAS = RECUO_MIN > CABECA_RAIO;

const SUAVIZA_ADS = 14;    // 1/s — sobe rápido, mas não pisca com tremor de mão
const SUAVIZA_MAOS = 12;   // 1/s — transição de uma para duas mãos

const damp = (a, b, lambda, dt) => a + (b - a) * (1 - Math.exp(-lambda * Math.max(0, dt || 0)));
const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);

export function createXrWeapon({ THREE, WeaponRig, arsenal }) {
  /* temporários: nada de alocar por frame dentro do loop de render */
  const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
  const _f = new THREE.Vector3(), _u = new THREE.Vector3(), _r = new THREE.Vector3();
  const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
  const _m = new THREE.Matrix4(), _mInv = new THREE.Matrix4();
  const _ocular = new THREE.Vector3(), _eixo = new THREE.Vector3();
  const _apoioMundo = new THREE.Vector3();
  const _punhoMundo = new THREE.Vector3(), _apoioMao = new THREE.Vector3();

  let miraNo = null;          // o objeto que o game.js usa como fonte da mira
  let armaDoNo = null;        // de qual arma ele é filho hoje
  let cache = null;           // geometria da mira/empunhadura da arma atual
  let chaveCache = '';

  let adsT = 0;
  let mistura = 0;            // 0 = uma mão, 1 = duas mãos
  let engatado = false;
  let temApoio = false;
  let medida = { recuo: 0, desvio: 1 };
  let naCara = false;
  let vivo = false;

  /* Coordenadas efetivas da mira: o perfil traz um conjunto calibrado contra o
     GLB e outro de fallback pro modelo procedural. Mesma regra do
     `sightCoords` de js/weaponrig.js — repetida aqui, e não importada, porque
     lá ela é interna; se um dia virar exportada, esta some. */
  function coordsDaMira(gun, sight) {
    if (!sight) return null;
    return (gun.modelStatus === 'fallback' && sight.fb) ? sight.fb : sight;
  }

  /* Geometria da arma em espaço LOCAL do `gun.group`:
       eye  — a ocular (onde o olho encosta)
       bore — o eixo óptico, normalizado (eye → front)
       grip — o punho, que vai coincidir com a palma
       apoio— o guarda-mão, alvo da mão de apoio
       qAlinha — leva `bore` para o -Z: é a mesma conta do `computePose` do
                 rig de PC, e é o que faz o eixo óptico e o -Z concordarem. */
  function geometria(gun) {
    const idx = arsenal ? arsenal.indexOf(gun) : -1;
    const perfil = idx >= 0 && WeaponRig.inspect ? WeaponRig.inspect(idx) : null;
    const anchors = (perfil && perfil.anchors) || {};
    const sight = WeaponRig.activeSight ? WeaponRig.activeSight(gun) : null;
    const c = coordsDaMira(gun, sight);

    const eye = new THREE.Vector3();
    const bore = new THREE.Vector3();
    if (c) {
      eye.fromArray(c.eye);
      bore.fromArray(c.front).sub(eye);
    } else {
      /* faca e qualquer arma sem perfil de mira: o eixo é punho → boca. Pior
         referência que a mira, mas infinitamente melhor que o -Z do controle. */
      eye.fromArray(anchors.gripR || [0, 0, 0]);
      bore.fromArray(anchors.muzzle || [0, 0, -1]).sub(eye);
    }
    if (bore.lengthSq() < 1e-10) bore.set(0, 0, -1);
    bore.normalize();

    _r.crossVectors(bore, _u.set(0, 1, 0));
    if (_r.lengthSq() < 1e-8) _r.set(1, 0, 0); else _r.normalize();
    _u.crossVectors(_r, bore).normalize();
    _m.makeBasis(_r, _u, _v1.copy(bore).negate());
    const qAlinha = new THREE.Quaternion().setFromRotationMatrix(_m).invert();

    return {
      eye, bore, qAlinha,
      grip: new THREE.Vector3().fromArray(anchors.gripR || [0, 0, 0]),
      apoio: anchors.supportHand ? new THREE.Vector3().fromArray(anchors.supportHand) : null,
      temMira: !!c,
    };
  }

  function geometriaDe(gun) {
    const sight = WeaponRig.activeSight ? WeaponRig.activeSight(gun) : null;
    const chave = `${arsenal ? arsenal.indexOf(gun) : -1}:${gun.modelStatus || 'procedural'}:${sight ? sight.id : '-'}`;
    if (chave !== chaveCache || !cache) { cache = geometria(gun); chaveCache = chave; }
    return cache;
  }

  /* O objeto da LINHA DE MIRA vive dentro do `gun.group`, então herda recuo,
     troca de arma e animação de mecanismo de graça. Reconciliado por frame
     porque a arma troca — e porque o modelo GLB pode chegar depois. */
  function ajustarMiraNo(gun, geo) {
    if (!miraNo) {
      miraNo = new THREE.Object3D();
      miraNo.name = 'xrLinhaDeMira';
      miraNo.matrixAutoUpdate = true;
    }
    if (armaDoNo !== gun || miraNo.parent !== gun.group) {
      gun.group.add(miraNo);
      armaDoNo = gun;
    }
    miraNo.position.copy(geo.eye);
    miraNo.quaternion.copy(geo.qAlinha).invert();
  }

  /* ---------------------------------------------------------------- */
  /* Uma passada por frame, DEPOIS do applyFpsCamera (que escreve a pose de
     desktop no mesmo objeto). Tudo é calculado em mundo e convertido para o
     espaço do PAI no fim — assim funciona com a arma pendurada no punho ou,
     se o gripSpace não existir, no raio de mira, sem mudar uma linha. */
  function aplicar({ gun, weaponRoot, punho, raio, apoio, cabeca, dt = 0, oculto = false } = {}) {
    const mao = punho || raio;
    if (!gun || !gun.group || !weaponRoot || !weaponRoot.parent || !mao || !raio) return null;

    vivo = true;
    const geo = geometriaDe(gun);
    ajustarMiraNo(gun, geo);

    mao.updateWorldMatrix(true, false);
    raio.updateWorldMatrix(true, false);
    weaponRoot.parent.updateWorldMatrix(true, false);
    mao.getWorldPosition(_punhoMundo);

    /* ---- direção do cano ---- */
    raio.getWorldQuaternion(_q1);
    _f.set(0, 0, -1).applyQuaternion(_q1);            // para onde o controle aponta
    _u.set(0, 1, 0).applyQuaternion(_q1);             // o "em cima" do punho: o roll segue o pulso

    temApoio = false;
    if (apoio && geo.apoio) {
      apoio.updateWorldMatrix(true, false);
      apoio.getWorldPosition(_apoioMao);
      const d = _apoioMao.distanceTo(_apoioMundo);
      if (!engatado && d <= APOIO_PEGA) engatado = true;
      else if (engatado && d >= APOIO_SOLTA) engatado = false;
      temApoio = engatado;
      if (engatado) {
        _v2.copy(_apoioMao).sub(_punhoMundo);
        if (_v2.lengthSq() > 0.0025) {                // < 5 cm entre as mãos não define direção
          _v2.normalize();
          mistura = damp(mistura, 1, SUAVIZA_MAOS, dt);
          _f.lerp(_v2, mistura).normalize();
        }
      }
    }
    if (!temApoio) mistura = damp(mistura, 0, SUAVIZA_MAOS, dt);

    /* ---- rotação de mundo do quadro óptico (-Z = cano, +Y ≈ topo da mão) ---- */
    _r.crossVectors(_f, _u);
    if (_r.lengthSq() < 1e-8) _r.crossVectors(_f, _v3.set(0, 1, 0));
    if (_r.lengthSq() < 1e-8) _r.set(1, 0, 0);
    _r.normalize();
    _v3.crossVectors(_r, _f).normalize();
    _m.makeBasis(_r, _v3, _v1.copy(_f).negate());
    _q2.setFromRotationMatrix(_m);                    // rotação de MUNDO do quadro óptico

    /* ---- para o espaço do pai (o punho, ou o raio se não houver grip) ---- */
    weaponRoot.parent.getWorldQuaternion(_q1);
    _q1.invert();
    weaponRoot.quaternion.copy(_q1).multiply(_q2).multiply(geo.qAlinha);

    _mInv.copy(weaponRoot.parent.matrixWorld).invert();
    _v1.copy(_punhoMundo).applyMatrix4(_mInv);        // a palma, no espaço do pai
    _v2.copy(geo.grip).applyQuaternion(weaponRoot.quaternion);
    weaponRoot.position.copy(_v1).sub(_v2);           // gripR EM CIMA da palma

    /* ---- a culatra na cara: a arma some, não é empurrada (ver CABECA_RAIO) ---- */
    _ocular.copy(geo.eye).applyQuaternion(weaponRoot.quaternion).add(weaponRoot.position)
      .applyMatrix4(weaponRoot.parent.matrixWorld);
    naCara = !!cabeca && _ocular.distanceTo(cabeca) < CABECA_RAIO;
    weaponRoot.visible = !oculto && !naCara;

    /* ---- guarda-mão no MUNDO, para o engate da próxima passada ---- */
    if (geo.apoio) {
      _apoioMundo.copy(geo.apoio).applyQuaternion(weaponRoot.quaternion).add(weaponRoot.position)
        .applyMatrix4(weaponRoot.parent.matrixWorld);
    }

    /* ---- ADS FÍSICO: o olho está atrás da ocular e perto do eixo? ---- */
    _eixo.copy(_f);
    let alvo = 0;
    if (cabeca && geo.temMira) {
      _v1.copy(cabeca).sub(_ocular);
      const proj = _v1.dot(_eixo);
      const recuo = -proj;                            // positivo = olho ATRÁS da ocular
      _v2.copy(_v1).addScaledVector(_eixo, -proj);
      const desvio = _v2.length();
      medida = { recuo, desvio };
      if (recuo >= RECUO_MIN && recuo <= RECUO_MAX) {
        /* borda suave nas duas pontas da janela: nada de ADS piscando quando o
           jogador segura a arma bem na fronteira */
        const janela = Math.min(1, (recuo - RECUO_MIN) / 0.05, (RECUO_MAX - recuo) / 0.10);
        alvo = clamp01(janela) * clamp01(1 - desvio / PERP_MAX);
      }
    } else if (cabeca) {
      medida = { recuo: 0, desvio: cabeca.distanceTo(_ocular) };
    }
    adsT = damp(adsT, alvo, SUAVIZA_ADS, dt);

    return { ads: adsT, mirando: adsT > 0.5, duasMaos: temApoio, naCara };
  }

  /* Sessão acabou (headset tirado, botão do sistema, bateria): o desktop tem
     que voltar intacto, incluindo o objeto da mira saindo do caminho. */
  function exit() {
    if (miraNo && miraNo.parent) miraNo.parent.remove(miraNo);
    armaDoNo = null;
    vivo = false;
    adsT = 0; mistura = 0; engatado = false; temApoio = false; naCara = false;
  }

  return {
    aplicar, exit,
    /* O objeto que o game.js usa como `fonteDaMira()`: `getWorldPosition` dá a
       ocular e o -Z do quaternion de mundo dá o eixo óptico — exatamente o que
       `miraOrigem`/`miraDirecao` já fazem, sem mudar uma linha da conta. */
    miraNode: () => (vivo ? miraNo : null),
    mirando: () => vivo && adsT > 0.5,
    ads: () => (vivo ? adsT : 0),
    duasMaos: () => temApoio,
    estado: () => ({
      ativo: vivo,
      ads: adsT,
      mirando: vivo && adsT > 0.5,
      duasMaos: temApoio,
      naCara,
      mistura,
      recuo: medida.recuo,
      desvio: medida.desvio,
      ocular: _ocular.toArray(),
      eixo: _eixo.toArray(),
      apoioAlvo: _apoioMundo.toArray(),
    }),
  };
}
