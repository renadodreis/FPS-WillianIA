/* ================================================================
   HUD DIEGÉTICO EM VR — a informação sai do DOM e entra no mundo.

   POR QUE ISTO EXISTE. Vida, armadura, munição, arma, inventário, zona e feed
   de abates deste jogo vivem em `#hud` (index.html), e **dentro de uma sessão
   `immersive-vr` o DOM não é desenhado**. Medido no critério H1 do
   docs/vr/criterio-aaa.md: objetos de HUD dentro do mundo = **0 de 17**. Todos
   os testes de HUD do repositório leem `innerHTML` e `style.opacity`, que
   continuam certos e continuam invisíveis — o exemplo mais puro de teste que
   mede o dublê em vez do produto.

   E ISTO NÃO É ESTILO: É A RECOMENDAÇÃO ESCRITA
   ---------------------------------------------
   O Oculus Best Practices Guide diz, com todas as letras, o que fazer no lugar
   de um HUD flutuante:

     "Strive to integrate your interface elements as intuitive and immersive
      parts of the 3D world. For example, AMMO COUNT MIGHT BE VISIBLE ON THE
      USER'S WEAPON RATHER THAN IN A FLOATING HUD."
     "Foregoing the HUD and integrating information into the environment is
      ideal."

   E dá o motivo ÓPTICO, que é mais forte que o argumento de imersão: um HUD
   desenhado num plano de profundidade fixo entra em conflito com a cena —
   "based on occlusion, the HUD is perceived as closer than the scene element
   because it covers everything behind it, yet binocular disparity indicates
   that the HUD is farther away… This can lead to difficulty and/or discomfort
   when trying to fuse the images". Painel colado na vista não é só feio: o
   cérebro não consegue fundir as duas imagens.

   A DIVISÃO É A DO GÊNERO, E ELA TEM MOTIVO
   -----------------------------------------
   Os FPS de VR que funcionam não fazem um "HUD" só: separam o que precisa ser
   lido em meio segundo do que se consulta quando dá.

   · NA ARMA fica o que decide o tiro seguinte — munição no pente, reserva,
     nome da arma, vida e armadura. É a solução do Half-Life: Alyx, cuja
     pistola tem "an LED ammo counter on the grip" e um carregador com "a
     ring-shaped light at the bottom that slowly depletes when being fired".
     A arma já está no campo de visão de quem está atirando: custo de atenção
     zero.
   · NO PULSO ESQUERDO fica o que se consulta — inventário, vivos, fase e
     tempo do BR, e as últimas linhas do feed de abates. É a mesma ideia do
     tablet que o Onward faz o jogador sacar das costas em vez de mostrar num
     HUD. Levantar o pulso é um gesto que o jogador já faz na vida real, e não
     gasta um pixel enquanto ele não faz.

   Nenhum dos dois é filho da CÂMERA. A Meta escreve "Avoid locking HUD style
   content to the user's head movements": conteúdo colado na cara não pode ser
   olhado (o olho persegue e nunca alcança) e é a receita clássica de
   desconforto. Aqui os dois painéis são objetos do mundo pendurados em coisas
   do mundo — a arma e a mão — e ENCARAM o olho (`lookAt` na POSIÇÃO da
   cabeça), que é o que os deixa legíveis sem grudar na vista.

   RETÍCULO: NÃO EXISTE, E ISSO É A RESPOSTA CERTA. O critério H3 aprova duas
   saídas — retículo projetado no ponto de impacto REAL, ou retículo nenhum. E
   a razão de o meio-termo estar proibido é óptica, não estética: o Oculus BP
   manda "draw any crosshair, reticle, or cursor at the same depth as the
   object it is targeting; otherwise, it can appear as a DOUBLED IMAGE when it
   is not at the plane of depth on which the eyes are converged". Retículo a
   profundidade fixa vira imagem dupla.

   Projetar no impacto real custaria um raycast de cena por frame, num
   orçamento que já está 4× estourado (docs/vr/perf-xr.md). Então: não existe,
   e o gênero concorda — o Onward é anunciado pelo próprio estúdio com "limited
   respawns, NO HUDs, and NO CROSSHAIRS", e o Alyx resolve com mira de ferro
   brilhante na arma (mais reflex e laser opcionais), sem ADS assistido. Aqui a
   mira é física, na arma (js/xr/xrweapon.js).

   NADA ATRAVESSA O OLHO. O critério I3 proíbe geometria a menos de 0,15 m do
   olho, e o painel da arma iria parar exatamente lá quando o jogador traz a
   arma ao rosto para mirar. Então: o painel da arma SOME durante o ADS (a
   mira de ferro é o HUD naquele momento) e os dois somem se chegarem a menos
   de 0,22 m da cabeça.

   CUSTO: **duas draw calls por olho** — um plano com uma textura de canvas
   cada. Cada canvas é repintado só quando o TEXTO muda (mesma disciplina do
   rótulo de js/xr/xrinteract.js): repintar a 90 Hz num Snapdragon é queimar o
   frame por nada, e o número da munição muda uma vez por tiro, não por frame.

   NADA É CRIADO NO BOOT. Todo `Object3D` gasta 4 números do `Math.random`
   seedado no UUID, e a ordem de consumo é contrato do worldgen: os painéis
   nascem no primeiro `update()` DENTRO da sessão.

   ESTE MÓDULO NÃO SABE JOGAR. Ele recebe `ler()`, que devolve um objeto chato
   com números e strings, e desenha. Quem sabe onde mora `player.health`,
   `gun.mag` e o feed de abates é o game.js.
   ================================================================ */

/* Tamanhos em metros. O painel da arma é lido a ~0,55 m (arma no quadril) e o
   do pulso a ~0,32 m (pulso levantado). Os dois são dimensionados pelo ÂNGULO
   e não pelo gosto: o alvo é 0,7° de altura de maiúscula — o número em que a
   tipografia em MR da Microsoft e o Android XR convergem —, com piso absoluto
   de 0,35–0,4°. Medido em sessão: 2,52° na arma e 1,57° no pulso, ambos com
   folga larga (ver docs/vr/referencia-ui.md). */
export const ARMA_W = 0.16, ARMA_H = 0.08;
export const PULSO_W = 0.14, PULSO_H = 0.105;
export const ARMA_CV_W = 512, ARMA_CV_H = 256;
export const PULSO_CV_W = 512, PULSO_CV_H = 384;

/* Onde cada painel se pendura, no espaço LOCAL do pai.
   Arma: acima e à esquerda do castelo, fora do cano (que aponta pro −Z).
   Pulso: acima da palma e na direção do cotovelo (+Z do `gripSpace` é a
   direção contrária à da haste segurada). */
export const ARMA_OFF = [-0.085, 0.105, 0.02];
export const PULSO_OFF = [0, 0.05, 0.085];

/* O MAPA. Item 17 de 17 da lista fechada do H1, e o único que não é texto: um
   quad texturizado com o MESMO canvas que o minimapa 2D do monitor desenha —
   nada é redesenhado aqui, o jogo pinta uma vez e os dois consomem.
   Fica no antebraço, logo depois do painel do pulso (que ocupa até
   z = 0,085 + 0,105/2 ≈ 0,138), porque é assim que o gênero resolve mapa em
   VR — Fallout 4 VR (Pip-Boy), Into the Radius (dispositivo de pulso): olhar
   o mapa é um GESTO, levantar o braço, e não uma tecla que cobre a tela.
   Quadrado porque o minimapa é quadrado; esticar deformaria a bússola. */
export const MAPA_W = 0.11, MAPA_H = 0.11;
export const MAPA_OFF = [0, 0.05, 0.20];

/* I3: nada dentro de 0,15 m do olho. 0,22 m dá margem pro painel inteiro. */
export const PERTO_DEMAIS = 0.22;

/* ================================================================
   O PAINEL É PROJETADO NA PROFUNDIDADE DE CONFORTO, NÃO NO PULSO.

   O DEFEITO, MEDIDO POR VALIDAÇÃO INDEPENDENTE (docs/vr/validacao-da3987c.md,
   linha H2): mapa a **0,3777 m** do olho, pulso a **0,3956 m**, arma a
   **0,5520 m**. O critério pede ≥ 0,45 m para qualquer painel e nada mais
   perto que 0,75 m para leitura demorada. Os dois primeiros reprovam há oito
   rodadas, e o motivo é estrutural: o painel morava NA MÃO, então a distância
   era a que o braço do jogador escolhesse — e o braço não alcança 0,75 m.

   POR QUE ISSO É DEFEITO ÓPTICO E NÃO CAPRICHO. O Oculus Best Practices dá a
   faixa e a razão: "The optics of the Rift make it most comfortable to view
   objects that fall within a range of 0.75 to 3.5 meters from the user's
   eyes", e diz o que acontece quando a interface fica mais perto — "the
   proximity necessary to prevent problems will most likely bring the
   interface closer than the recommended minimum comfortable distance, 75 cm".
   Abaixo disso a lente não entrega foco e a disparidade binocular briga com a
   oclusão. A Meta viva afrouxou para "at least 0.5 meters" para o que se olha
   por tempo, e o Android XR fixa profundidade mínima de 0,75 m.

   O QUE MUDA, E O QUE NÃO MUDA. O painel continua PENDURADO na arma e no
   pulso (H2 aceita ancoragem em pulso e proíbe head-locked): quem manda na
   DIREÇÃO dele no campo de visão continua sendo a mão. O que passa a ser
   fixo é só a PROFUNDIDADE: o painel desliza pelo raio olho→âncora até o
   piso de conforto e cresce na MESMA proporção.

   E é por isso que isto não custa legibilidade — que era a armadilha óbvia
   deste conserto. Empurrar `k` vezes mais longe e crescer `k` vezes mantém a
   altura ANGULAR do glifo IDÊNTICA: a imagem em cada olho é a mesma, muda a
   disparidade entre elas. Medido: texto da arma 2,52°, do pulso 1,57°, contra
   alvo de 0,7° e piso de 0,35–0,4° (docs/vr/referencia-ui.md §3.3).

   OS PISOS, UM POR PAINEL, E O TETO QUE OUTRO CONTRATO IMPÔS:
   - ARMA: munição, vida e armadura — olhada de meio segundo no meio do tiro.
     **0,50 m**, acima dos 45 cm da diretriz de MR da Meta e do "at least 0.5
     meters" da página viva de Display.
   - PULSO e MAPA: inventário, feed, zona, mapa. **0,55 m.**

   POR QUE 0,55 E NÃO 0,75, que seria o piso de foco confortável do BP: o mapa
   tem OUTRO contrato escrito, num teste que não é desta posse —
   `test/xr-mapa.test.js` cobra que o painel fique a menos de **0,25 m da
   palma** ("acima de 0,25 m já não é 'no pulso'"). Com a palma a ~0,40 m do
   olho, projetar a 0,75 m põe o painel 0,35 m além da mão e quebra esse
   contrato; 0,55 m deixa 0,15 m e os dois valem.

   0,55 m não é um meio-termo inventado: é o "at least 0.5 meters" que a
   página viva da Meta dá para o que o usuário fixa por tempo, e passa com
   folga o piso de 0,45 m que o critério cobra — que é onde os dois painéis
   reprovavam. O que fica de fora é a cláusula de LEITURA DEMORADA (0,75 m).
   Se o dono quiser essa cláusula fechada, é UMA linha aqui (0,55 → 0,75) e
   uma no `xr-mapa.test.js` (o teto de 0,25 m da palma vira ~0,40 m), e a
   decisão é dele porque muda o que "mapa de pulso" quer dizer.
   ================================================================ */
export const DIST_ARMA = 0.50;
export const DIST_PULSO = 0.55;
export const DIST_MAPA = 0.55;
const PISO = { arma: DIST_ARMA, pulso: DIST_PULSO, mapa: DIST_MAPA };

/* ================================================================
   O AVISO CENTRAL — a mensagem que o headset não recebia.

   O DEFEITO: `centerMsg` (game.js) é DOM, e dentro de uma sessão
   `immersive-vr` sem `dom-overlay` o DOM não chega ao compositor. Medido:
   **"⚠ MÍSSEIS SE APROXIMANDO DA CIDADE" não existe no headset** — os
   mísseis voam, a cidade cai, e quem está de costas não recebe sinal
   nenhum. É H1 no seu caso mais caro: a informação que decide se o jogador
   sai de dentro da cidade a tempo.

   E É O CASO QUE QUEBRA A REGRA DOS OUTROS PAINÉIS DESTE ARQUIVO. Munição
   e inventário podem morar na arma e no pulso porque quem quer saber
   OLHA. Um aviso não: ele existe justamente para quem NÃO está olhando.
   A Meta escreve as duas metades desse conflito na mesma página:

     "Avoid locking HUD style content to the user's head movements."
     "Anchor information and digital content to a space, OR LOOSELY FOLLOW
      THE USER USING SMOOTHING ANIMATION."
     "Display content and text within the users' field-of-view and PREVENT
      THE USERS FROM HAVING TO TURN THEIR HEAD."
   — Meta, MR design guideline (Key considerations)

   Ou seja, a saída não é escolher entre grudar na cara e ficar mudo no
   mundo: é o meio-termo que a própria plataforma nomeia — nasce na
   direção em que o jogador está olhando, fica PARADO enquanto ele só dá
   uma olhada, e ALCANÇA quem virou de vez, amortecido. É a mesma
   disciplina do painel de sessão (js/xr/xrui.js), com os mesmos ângulos:
   solta aos 35°, para aos 8°, constante de tempo 0,22 s. Dois números
   diferentes para a mesma coisa seriam ergonomia inventada.

   A DISTÂNCIA é 1,0 m, e não é chute: "the window can be placed around 1
   meter from the user" (Meta, para tela maior de interação indireta),
   "Many have found that 1 meter is a comfortable distance for menus and
   GUIs" (Meta · Display), e acima do piso óptico de 0,75 m do Oculus Best
   Practices. É onde o painel de sessão desta base já vive (1,004 m).

   A ALTURA vai ACIMA da linha do olho, e isso é uma DECISÃO com custo. A
   diretriz que existe manda o contrário — "roughly 1 meter distance
   slightly below the user's line of sight", e o Android XR dá o ângulo
   (5° abaixo) —, mas ela fala de conteúdo de PERMANÊNCIA. Aqui o critério
   que decide é o outro requisito da mesma página, "Doesn't obstruct the
   user's view": no centro, o aviso cobre exatamente o que o jogador está
   mirando, e ainda cai em cima do painel de sessão (que ocupa de −0,32 m
   a +0,14 m em torno do olho, a 1,0 m). 0,24 m acima do olho (13,5°)
   deixa 2,6 cm de folga sobre o painel e tira o texto da linha de tiro.
   **Diretriz específica para notificação transitória em VR: NÃO
   ENCONTRADO** na documentação da Meta — o que sustenta a escolha é a
   cláusula de não-oclusão, não uma regra de notificação.

   ANDAR PARA A FRENTE TAMBÉM TEM DE SOLTAR O PAINEL, e essa é a armadilha
   estrutural do lazy-follow por ângulo: caminhar em linha reta na direção
   do painel não muda o erro angular em UM grau, então um painel que só
   corrige ângulo fica parado enquanto a cabeça chega nele — 1 m de
   caminhada física contra um painel a 1 m é painel dentro do olho (I3
   proíbe geometria a menos de 0,15 m). Por isso a faixa de distância
   [0,75 m, 1,35 m] dispara o mesmo reposicionamento que o cone.

   CUSTO: **uma draw call por olho**, e só enquanto a mensagem vive. O
   canvas é repintado quando o TEXTO muda, nunca por frame.

   NADA NASCE NO BOOT — nem no primeiro `update()`: o painel só é criado
   na primeira mensagem. Todo `Object3D` gasta 4 números do `Math.random`
   seedado no UUID e a ordem de consumo é contrato do worldgen.
   ================================================================ */
export const AVISO_CV_W = 896, AVISO_CV_H = 256;
export const AVISO_W = 0.50;
export const AVISO_H = AVISO_W * AVISO_CV_H / AVISO_CV_W;   // 0,1429 m
export const DIST_AVISO = 1.0;
export const AVISO_SOBE = 0.24;
/* Histerese do reposicionamento, idêntica à do painel de sessão. */
export const AVISO_CONE_SOLTA = 35 * Math.PI / 180;
export const AVISO_CONE_PARA = 8 * Math.PI / 180;
/* Faixa de distância aceita antes de o painel ser reposicionado. O piso é o
   "minimum comfortable distance, 75 cm" do Oculus BP; o teto é a folga que
   evita ficar repondo o painel a cada passo do jogador. */
export const AVISO_PERTO = 0.75, AVISO_LONGE = 1.35;
const AVISO_TAU = 0.22;      // constante de tempo do amortecimento, em s
const AVISO_FADE = 0.25;     // esmaecimento no fim da mensagem, em s
const AVISO_PX = 60;         // corpo da fonte no canvas
const AVISO_LINHAS = 2;

const GRAU = Math.PI / 180;
const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const pct = v => Math.max(0, Math.min(1, num(v)));
const trava = (v, a, b) => Math.min(b, Math.max(a, v));

export function createXrHud({
  THREE, ler = () => ({}),
  win = typeof window === 'undefined' ? null : window,
} = {}) {
  const _p = new THREE.Vector3(), _alvo = new THREE.Vector3();
  /* rascunhos do aviso, todos reusados: alocar Vector3 por frame num
     Snapdragon é lixo de GC dentro do orçamento de 13,9 ms */
  const _olhoL = new THREE.Vector3(), _fwdL = new THREE.Vector3(),
    _aAlvo = new THREE.Vector3(), _aTmp = new THREE.Vector3(),
    _aDir = new THREE.Vector3(),
    _aQ = new THREE.Quaternion(), _aFwd = new THREE.Vector3();

  const paineis = {
    arma: { obj: null, ctx: null, tex: null, assin: '', pai: null },
    pulso: { obj: null, ctx: null, tex: null, assin: '', pai: null },
    mapa: { obj: null, ctx: null, tex: null, assin: '', pai: null },
  };
  const CHAVES = ['arma', 'pulso', 'mapa'];
  let visto = { arma: false, pulso: false, mapa: false };
  let ultima = {};

  /* ---------------------------------------------------------------- */
  /* AVISO CENTRAL (ver o cabeçalho da seção). Estado próprio: o painel tem
     ciclo de vida de MENSAGEM, não de frame. */
  const aviso = {
    obj: null, ctx: null, tex: null, texto: '', pintado: '',
    fim: 0, dur: 0, emissoes: 0, repondo: false, relogio: 0,
    /* posição em espaço LOCAL DO RIG, e não em mundo: o rig é o corpo do
       jogador, então guardar aqui faz o painel viajar com quem anda de
       analógico e ficar PARADO para quem anda pelo quarto (o rig compensa o
       passo físico — é o desenho de js/xr/xrrig.js). Guardar em mundo faria
       o painel escorregar para trás a cada metro de locomoção artificial. */
    pos: new THREE.Vector3(), temPos: false,
  };
  const agora = () => (win && win.performance && typeof win.performance.now === 'function'
    ? win.performance.now() : Date.now());

  function criarAviso() {
    if (aviso.obj) return aviso;
    const doc = win && win.document;
    const cv = doc ? doc.createElement('canvas') : null;
    if (cv) { cv.width = AVISO_CV_W; cv.height = AVISO_CV_H; aviso.ctx = cv.getContext('2d'); }
    aviso.tex = cv ? new THREE.CanvasTexture(cv) : null;
    if (aviso.tex) aviso.tex.colorSpace = THREE.SRGBColorSpace;
    aviso.obj = new THREE.Mesh(
      new THREE.PlaneGeometry(AVISO_W, AVISO_H),
      new THREE.MeshBasicMaterial({
        map: aviso.tex, transparent: true, opacity: 1, depthWrite: false, depthTest: false,
        toneMapped: false, side: THREE.FrontSide,
      }));
    aviso.obj.name = 'xrHudAviso';
    /* acima dos painéis diegéticos: um aviso atrás da arma é um aviso que
       não existe. `depthTest: false` é deliberado — quem está DENTRO de um
       prédio quando os mísseis chegam precisa ver a mesma coisa que quem
       está no campo. */
    aviso.obj.renderOrder = 9990;
    aviso.obj.frustumCulled = false;
    aviso.obj.visible = false;
    return aviso;
  }

  /* Quebra em até `AVISO_LINHAS` linhas, por PALAVRA. O `centerMsg` carrega
     de "+ munição" a "⚠ MÍSSEIS SE APROXIMANDO DA CIDADE", e cortar no meio
     de uma palavra é o jeito de deixar o aviso ilegível justamente no caso
     longo, que é o urgente. */
  function linhasDe(ctx, texto, maxPx) {
    const palavras = String(texto).split(/\s+/).filter(Boolean);
    const linhas = [];
    let atual = '';
    for (const p of palavras) {
      const t = atual ? atual + ' ' + p : p;
      if (atual && ctx.measureText(t).width > maxPx && linhas.length < AVISO_LINHAS - 1) {
        linhas.push(atual); atual = p;
      } else atual = t;
    }
    if (atual) linhas.push(atual);
    return linhas.slice(0, AVISO_LINHAS);
  }

  function pintarAviso() {
    const ctx = aviso.ctx;
    if (!ctx || aviso.pintado === aviso.texto) return;
    aviso.pintado = aviso.texto;
    ctx.clearRect(0, 0, AVISO_CV_W, AVISO_CV_H);
    ctx.fillStyle = 'rgba(8,12,18,0.86)';
    ctx.fillRect(0, 0, AVISO_CV_W, AVISO_CV_H);
    ctx.strokeStyle = 'rgba(255,190,120,0.55)';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, AVISO_CV_W - 4, AVISO_CV_H - 4);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.font = `bold ${AVISO_PX}px system-ui, sans-serif`;
    ctx.fillStyle = '#ffe6c2';
    const margem = 36;
    const linhas = linhasDe(ctx, aviso.texto, AVISO_CV_W - margem * 2);
    const passo = AVISO_PX * 1.35;
    const y0 = AVISO_CV_H / 2 - (linhas.length - 1) * passo / 2;
    for (let i = 0; i < linhas.length; i++) {
      ctx.fillText(linhas[i], AVISO_CV_W / 2, y0 + i * passo, AVISO_CV_W - margem * 2);
    }
    if (aviso.tex) aviso.tex.needsUpdate = true;
  }

  /* A MENSAGEM. Espelha o `centerMsg` do game.js: mesmo texto, mesma
     duração. Só aqui o painel é criado — nunca no boot, nunca no update. */
  function mensagem(texto, ms = 1800) {
    const t = String(texto == null ? '' : texto);
    if (!t) return false;
    criarAviso();
    aviso.texto = t;
    aviso.dur = Math.max(1, num(ms, 1800));
    aviso.fim = agora() + aviso.dur;
    aviso.emissoes++;
    /* NASCE ONDE O JOGADOR ESTÁ OLHANDO. É a metade do requisito que o
       lazy-follow sozinho não entrega: quem está de costas para a cidade
       não pode depender de o painel vir atrás dele. */
    aviso.temPos = false;
    aviso.repondo = false;
    pintarAviso();
    return true;
  }

  /* Onde o painel deveria estar AGORA, em espaço local do rig. */
  function alvoDoAviso(rig, camera, olho) {
    _olhoL.copy(olho);
    rig.worldToLocal(_olhoL);
    /* a frente do olhar, levada ao espaço do rig por um ponto auxiliar: é
       robusto à rotação do rig (snap turn escreve `rig.rotation.y`) sem
       precisar compor quaternions à mão */
    camera.getWorldQuaternion(_aQ);
    _aFwd.set(0, 0, -1).applyQuaternion(_aQ);
    _aTmp.copy(olho).add(_aFwd);
    rig.worldToLocal(_aTmp);
    _fwdL.copy(_aTmp).sub(_olhoL); _fwdL.y = 0;
    if (_fwdL.lengthSq() < 1e-8) _fwdL.set(0, 0, -1); else _fwdL.normalize();
    _aAlvo.copy(_fwdL).multiplyScalar(DIST_AVISO).add(_olhoL);
    _aAlvo.y = _olhoL.y + AVISO_SOBE;
    return _aAlvo;
  }

  function atualizarAviso(rig, camera, olho, dt) {
    if (!aviso.obj) return false;
    const t = agora();
    if (!aviso.texto || t >= aviso.fim) {
      aviso.obj.visible = false;
      aviso.relogio = t;
      return false;
    }
    /* sem rig, sem câmera ou sem a cabeça não há onde pousar: fora da
       sessão o `centerMsg` do DOM continua sendo quem mostra a mensagem */
    if (!rig || !camera || !olho) { aviso.obj.visible = false; aviso.relogio = t; return false; }
    if (aviso.obj.parent !== rig) rig.add(aviso.obj);

    const passo = typeof dt === 'number' && Number.isFinite(dt) && dt > 0
      ? dt
      /* relógio próprio quando quem chama não passa `dt`. Um dono só do
         tempo: se `dt` vier, ele manda. */
      : Math.min(0.1, Math.max(0, (t - aviso.relogio) / 1000));
    aviso.relogio = t;

    const alvo = alvoDoAviso(rig, camera, olho);
    if (!aviso.temPos) { aviso.pos.copy(alvo); aviso.temPos = true; aviso.repondo = false; }

    /* erro angular no plano horizontal, do painel contra a frente do olhar */
    _aTmp.copy(aviso.pos).sub(_olhoL); _aTmp.y = 0;
    const raio = _aTmp.length();
    const erro = raio < 1e-4 ? Math.PI
      : Math.acos(trava(_aDir.copy(_aTmp).divideScalar(raio).dot(_fwdL), -1, 1));
    /* distância REAL ao olho (3D, com a subida): é ela que I3 cobra */
    const dist = aviso.pos.distanceTo(_olhoL);
    if (!aviso.repondo && (erro > AVISO_CONE_SOLTA || dist < AVISO_PERTO || dist > AVISO_LONGE)) {
      aviso.repondo = true;
    }
    if (aviso.repondo) {
      const k = 1 - Math.exp(-passo / AVISO_TAU);
      aviso.pos.lerp(alvo, k);
      /* A interpolação linear é uma CORDA e corta caminho por dentro do
         arco, parando mais perto que a distância de leitura — o mesmo
         defeito já medido no painel de sessão (chegava a 0,70 m contra um
         piso de 0,75 m). O reposicionamento anda SOBRE o arco. */
      _aTmp.copy(aviso.pos).sub(_olhoL); _aTmp.y = 0;
      const r2 = _aTmp.length();
      if (r2 > 1e-4) {
        _aTmp.multiplyScalar(DIST_AVISO / r2).add(_olhoL);
        aviso.pos.x = _aTmp.x; aviso.pos.z = _aTmp.z;
      }
      aviso.pos.y = _olhoL.y + AVISO_SOBE;
      _aTmp.copy(aviso.pos).sub(_olhoL); _aTmp.y = 0;
      const r3 = _aTmp.length();
      const erro2 = r3 < 1e-4 ? Math.PI
        : Math.acos(trava(_aTmp.divideScalar(r3).dot(_fwdL), -1, 1));
      if (erro2 < AVISO_CONE_PARA
        && aviso.pos.distanceTo(_olhoL) >= AVISO_PERTO
        && aviso.pos.distanceTo(_olhoL) <= AVISO_LONGE) aviso.repondo = false;
    }

    aviso.obj.position.copy(aviso.pos);
    aviso.obj.visible = true;
    /* esmaecer no fim: corte seco em VR lê como falha de render, e o
       movimento residual chama atenção para o que já foi lido */
    const resta = (aviso.fim - t) / 1000;
    aviso.obj.material.opacity = resta >= AVISO_FADE ? 1 : Math.max(0, resta / AVISO_FADE);
    aviso.obj.updateWorldMatrix(true, false);
    /* encara a POSIÇÃO do olho, não a orientação da cabeça: é o que mantém
       o painel como objeto do mundo em vez de coisa colada na vista */
    aviso.obj.lookAt(olho);
    return true;
  }

  /* `cvExterno` é o caso do mapa: o canvas já existe e já é pintado por quem
     sabe jogar (o `MiniMap` do game.js). Aqui ele vira textura e mais nada —
     este módulo não desenha um único blip. */
  function criar(chave, w, h, cvW, cvH, nome, cvExterno = null) {
    const p = paineis[chave];
    if (p.obj) return p;
    const doc = win && win.document;
    const cv = cvExterno || (doc ? doc.createElement('canvas') : null);
    if (cv && !cvExterno) { cv.width = cvW; cv.height = cvH; p.ctx = cv.getContext('2d'); }
    p.tex = cv ? new THREE.CanvasTexture(cv) : null;
    if (p.tex) p.tex.colorSpace = THREE.SRGBColorSpace;
    p.obj = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({
        map: p.tex, transparent: true, depthWrite: false, depthTest: false,
        toneMapped: false, side: THREE.FrontSide,
      }));
      /* FrontSide, e isto vale um comentário: no three r0.185, material
         `transparent` com `side: DoubleSide` e `forceSinglePass` falso é
         desenhado em DOIS passes (BackSide e depois FrontSide), com
         `needsUpdate = true` entre eles — ou seja, DOBRA a draw call e ainda
         força uma verificação de programa por frame. Medido aqui: o custo caiu
         de 8 para 4 em estéreo só trocando o lado. O painel sempre encara o
         olho, então a face de trás nunca seria vista de qualquer forma. */
    p.obj.name = nome;
    p.obj.renderOrder = 9980;    // informação não fica atrás da própria arma
    p.obj.frustumCulled = false;
    return p;
  }

  /* Reanexa por frame porque o pai APARECE E SOME: a mão some quando o
     controle dorme, e `weaponRoot` troca de pai entre a câmera e o punho a
     cada frame (game.js). Anexar é idempotente. */
  function pendurar(chave, pai, off) {
    const p = paineis[chave];
    if (!pai) { if (p.obj) p.obj.visible = false; p.pai = null; return false; }
    if (p.obj.parent !== pai) { pai.add(p.obj); p.pai = pai; }
    p.obj.position.set(off[0], off[1], off[2]);
    return true;
  }

  /* ---------------------------------------------------------------- */
  /* PINTURA — só quando o texto muda (ver o cabeçalho). */
  function barra(ctx, x, y, w, h, frac, cor, fundo) {
    ctx.fillStyle = fundo;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = cor;
    ctx.fillRect(x, y, w * pct(frac), h);
  }

  function pintarArma(d) {
    const p = paineis.arma, ctx = p.ctx;
    if (!ctx) return;
    const pente = d.melee ? '—' : String(num(d.pente));
    const reserva = d.melee ? '' : String(num(d.reserva));
    const assin = [pente, reserva, d.arma || '', Math.round(pct(d.vida) * 100),
      Math.round(pct(d.armadura) * 100), d.recarregando ? 'R' : ''].join('|');
    if (assin === p.assin) return;
    p.assin = assin;

    ctx.clearRect(0, 0, ARMA_CV_W, ARMA_CV_H);
    ctx.fillStyle = 'rgba(8,12,18,0.82)';
    ctx.fillRect(0, 0, ARMA_CV_W, ARMA_CV_H);
    ctx.strokeStyle = 'rgba(157,216,255,0.45)';
    ctx.lineWidth = 3;
    ctx.strokeRect(1.5, 1.5, ARMA_CV_W - 3, ARMA_CV_H - 3);

    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.font = 'bold 108px system-ui, sans-serif';
    ctx.fillStyle = (!d.melee && num(d.pente) === 0) ? '#ff8a8a' : '#ffffff';
    ctx.fillText(pente, 22, 92);
    if (reserva) {
      ctx.font = 'bold 52px system-ui, sans-serif';
      ctx.fillStyle = '#9fb3c8';
      ctx.fillText('| ' + reserva, 26 + ctx.measureText(pente).width + 128, 104);
    }
    ctx.textAlign = 'right';
    ctx.font = 'bold 40px system-ui, sans-serif';
    ctx.fillStyle = d.recarregando ? '#ffd7a0' : '#9dd8ff';
    ctx.fillText(d.recarregando ? 'RECARREGANDO' : String(d.arma || ''), ARMA_CV_W - 22, 44, 300);

    barra(ctx, 22, 168, ARMA_CV_W - 44, 26, d.vida, '#5ce27a', 'rgba(255,255,255,0.12)');
    barra(ctx, 22, 204, ARMA_CV_W - 44, 18, d.armadura, '#6db8ff', 'rgba(255,255,255,0.10)');
    if (p.tex) p.tex.needsUpdate = true;
  }

  function pintarPulso(d) {
    const p = paineis.pulso, ctx = p.ctx;
    if (!ctx) return;
    const br = d.br || null;
    const feed = Array.isArray(d.feed) ? d.feed.slice(-3) : [];
    const assin = [br ? [br.fase, br.vivos, br.tempo, br.zona].join('/') : 'solo',
      num(d.granadas), num(d.medkits), num(d.abates), feed.join('~')].join('|');
    if (assin === p.assin) return;
    p.assin = assin;

    ctx.clearRect(0, 0, PULSO_CV_W, PULSO_CV_H);
    ctx.fillStyle = 'rgba(8,12,18,0.82)';
    ctx.fillRect(0, 0, PULSO_CV_W, PULSO_CV_H);
    ctx.strokeStyle = 'rgba(157,216,255,0.45)';
    ctx.lineWidth = 3;
    ctx.strokeRect(1.5, 1.5, PULSO_CV_W - 3, PULSO_CV_H - 3);

    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.font = 'bold 44px system-ui, sans-serif';
    ctx.fillStyle = '#9dd8ff';
    ctx.fillText(br ? String(br.fase || 'BR') : 'SOLO', 20, 38);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffd7a0';
    ctx.fillText(br ? (num(br.vivos) + ' VIVOS') : (num(d.abates) + ' ABATES'), PULSO_CV_W - 20, 38);

    ctx.textAlign = 'left';
    ctx.font = 'bold 36px system-ui, sans-serif';
    ctx.fillStyle = '#e6eef7';
    if (br) {
      ctx.fillText(String(br.zona || ''), 20, 96, 300);
      ctx.textAlign = 'right';
      ctx.fillText(String(br.tempo || ''), PULSO_CV_W - 20, 96);
      ctx.textAlign = 'left';
    }
    ctx.fillText('GRANADAS  ' + num(d.granadas), 20, 152);
    ctx.fillText('KITS  ' + num(d.medkits), 20, 200);

    ctx.font = '32px system-ui, sans-serif';
    ctx.fillStyle = '#9fb3c8';
    for (let i = 0; i < feed.length; i++) {
      ctx.fillText(String(feed[i]).slice(0, 34), 20, 258 + i * 40, PULSO_CV_W - 40);
    }
    if (p.tex) p.tex.needsUpdate = true;
  }

  /* ---------------------------------------------------------------- */
  /* `arma` é o `weaponRoot`; `pulso` é o `gripSpace` da mão ESQUERDA
     (js/xr/xrhands.js `punho('left')`) — a palma, não o raio de mira;
     `cabeca` é a posição de MUNDO do olho (em XR `camera.position` é local
     ao rig e não serve). */
  function update({ arma = null, pulso = null, cabeca = null,
    rig = null, camera = null, dt = null } = {}) {
    const d = ler() || {};
    ultima = d;
    const olho = cabeca || null;

    /* O AVISO É INDEPENDENTE DO RESTO. Ele não pende da arma nem da mão, não
       some no ADS e não obedece a `oculto` — dirigindo ou voando o jogador
       precisa da mensagem do mesmo jeito, e é dirigindo que ele mais precisa
       (o carro leva para dentro da cidade). Fica ANTES do laço dos painéis
       diegéticos para que uma saída antecipada de lá nunca o cale. */
    atualizarAviso(rig, camera, olho, dt);

    criar('arma', ARMA_W, ARMA_H, ARMA_CV_W, ARMA_CV_H, 'xrHudArma');
    criar('pulso', PULSO_W, PULSO_H, PULSO_CV_W, PULSO_CV_H, 'xrHudPulso');
    /* o mapa só nasce quando o jogo entrega o canvas — antes disso não há
       textura, e um quad sem textura seria um retângulo preto no antebraço */
    const cvMapa = d.mapa && d.mapa.canvas ? d.mapa.canvas : null;
    if (cvMapa) criar('mapa', MAPA_W, MAPA_H, 0, 0, 'xrHudMapa', cvMapa);

    /* ADS: a arma vem ao rosto e o painel entraria dentro do olho (I3). A
       mira de ferro é o HUD naquele momento — é o que o gênero faz. */
    const armaOk = pendurar('arma', arma, ARMA_OFF) &&
      !d.oculto && !d.ads && (!arma || arma.visible !== false);
    const pulsoOk = pendurar('pulso', pulso, PULSO_OFF) && !d.oculto;
    /* o mapa acompanha o painel do pulso: mesma mão, mesma regra de sumiço.
       `oculto` cobre dirigir e voar — no carro o mapa some junto com o resto,
       que é o que o critério H1 pede (a informação existe onde o jogador
       está), não "um mapa flutuando dentro do painel do carro". */
    const mapaOk = paineis.mapa.obj ? (pendurar('mapa', pulso, MAPA_OFF) && !d.oculto) : false;

    visto = { arma: false, pulso: false, mapa: false };
    for (const [chave, ok] of [['arma', armaOk], ['pulso', pulsoOk], ['mapa', mapaOk]]) {
      const p = paineis[chave];
      if (!p.obj) continue;
      if (!ok) { p.obj.visible = false; continue; }
      p.obj.visible = true;
      p.obj.scale.setScalar(1);
      if (olho) {
        p.obj.updateWorldMatrix(true, false);
        p.obj.getWorldPosition(_p);
        const dAncora = _p.distanceTo(olho);
        /* nada dentro de 0,15 m do olho (I3). Aqui o teste é na ÂNCORA, não
           no painel: com a mão encostada no rosto o fator de projeção
           explodiria e o painel encheria a vista. Some, que é o que o gênero
           faz — o painel é a única coisa que dá pra tirar do caminho sem
           tirar a mão do jogador do lugar. */
        if (dAncora < PERTO_DEMAIS) { p.obj.visible = false; continue; }
        /* PROJEÇÃO NA PROFUNDIDADE DE CONFORTO (H2, ver o cabeçalho): desliza
           pelo raio olho→âncora até o piso do painel e cresce na mesma
           proporção. A direção no campo de visão não muda em um grau — o que
           muda é a disparidade entre os dois olhos, que é o defeito. */
        const piso = PISO[chave] || 0;
        if (dAncora < piso) {
          const k = piso / dAncora;
          _alvo.copy(_p).sub(olho).multiplyScalar(k).add(olho);
          if (p.obj.parent) p.obj.parent.worldToLocal(_alvo);
          p.obj.position.copy(_alvo);
          p.obj.scale.setScalar(k);
          p.obj.updateWorldMatrix(true, false);
        }
        /* `Object3D.lookAt` num Mesh vira o +Z (a normal do plano) PARA o
           alvo, e já desconta a rotação do pai — encarar a POSIÇÃO do olho, e
           não a orientação da cabeça, é o que mantém o painel como objeto do
           mundo em vez de coisa colada na vista. */
        p.obj.lookAt(olho);
      }
      visto[chave] = true;
    }

    if (visto.arma) pintarArma(d);
    if (visto.pulso) pintarPulso(d);
    /* O MAPA NÃO É PINTADO AQUI. O jogo já o desenhou uma vez, para o monitor
       e para o headset. O que sobe à GPU é a versão: sem isto a textura
       congelaria no primeiro frame, e um mapa congelado é pior que mapa
       nenhum — mente sobre onde estão os inimigos. */
    if (visto.mapa && paineis.mapa.tex && d.mapa) {
      const v = String(d.mapa.versao);
      if (v !== paineis.mapa.assin) { paineis.mapa.assin = v; paineis.mapa.tex.needsUpdate = true; }
    }
    return { arma: visto.arma, pulso: visto.pulso, mapa: visto.mapa };
  }

  function exit() {
    for (const chave of CHAVES) {
      const p = paineis[chave];
      if (!p.obj) continue;
      p.obj.visible = false;
      if (p.obj.parent) p.obj.parent.remove(p.obj);
      p.pai = null; p.assin = '';
    }
    visto = { arma: false, pulso: false, mapa: false };
    /* O aviso sai da cena junto — mas a MENSAGEM morre com a sessão em vez
       de ficar pendurada esperando a próxima: reentrar no VR e receber na
       cara um alerta de mísseis de dez minutos atrás seria pior que nada. */
    if (aviso.obj) {
      aviso.obj.visible = false;
      if (aviso.obj.parent) aviso.obj.parent.remove(aviso.obj);
    }
    aviso.texto = ''; aviso.fim = 0; aviso.temPos = false; aviso.repondo = false;
  }

  /* Altura angular do glifo, em graus, a partir da distância medida: é o
     número que decide se dá pra LER, e não o tamanho em metros. */
  function graus(alturaM, dist) {
    return 2 * Math.atan((alturaM / 2) / Math.max(1e-6, dist)) / GRAU;
  }

  return {
    update, exit, mensagem,
    get arma() { return paineis.arma.obj; },
    get pulso() { return paineis.pulso.obj; },
    get mapa() { return paineis.mapa.obj; },
    /* `null` até a primeira mensagem, e isso é contrato: um `Object3D`
       criado antes disso gastaria 4 números do `Math.random` seedado. */
    get aviso() { return aviso.obj; },
    /* Quantas mensagens este painel recebeu. Existe para o QA distinguir
       quem alimentou o aviso (a fiação do game.js ou um andaime de teste)
       sem precisar de bandeira de fiação no produto. */
    get avisoEmissoes() { return aviso.emissoes; },
    MAPA_W, MAPA_H,
    /* leitura pura para QA — nada aqui ACIONA nada */
    estado(cabeca = null) {
      const out = { dados: ultima, visivel: { ...visto } };
      if (!aviso.obj) out.aviso = null;
      else {
        aviso.obj.updateWorldMatrix(true, false);
        const pos = aviso.obj.getWorldPosition(new THREE.Vector3());
        const d = cabeca ? pos.distanceTo(cabeca) : null;
        const normal = new THREE.Vector3(0, 0, 1)
          .applyQuaternion(aviso.obj.getWorldQuaternion(new THREE.Quaternion()));
        let encara = null;
        if (cabeca) {
          const paraOlho = new THREE.Vector3().subVectors(cabeca, pos);
          if (paraOlho.lengthSq() > 1e-9) {
            encara = Math.acos(Math.max(-1, Math.min(1, normal.dot(paraOlho.normalize())))) / GRAU;
          }
        }
        /* altura de MAIÚSCULA do glifo, em metros: 0,72 do corpo da fonte,
           a mesma razão usada nos painéis diegéticos deste arquivo */
        const glifoM = AVISO_H * (AVISO_PX * 0.72) / AVISO_CV_H;
        out.aviso = {
          nome: aviso.obj.name,
          texto: aviso.texto,
          visivel: !!(aviso.obj.visible && aviso.obj.parent),
          naCena: !!aviso.obj.parent,
          paiNome: aviso.obj.parent ? aviso.obj.parent.name : null,
          pos: pos.toArray(),
          distancia: d,
          opacidade: aviso.obj.material.opacity,
          repondo: aviso.repondo,
          restaMs: Math.max(0, aviso.fim - agora()),
          anguloEncara: encara,
          grausH: d === null ? null : graus(AVISO_W, d),
          grausV: d === null ? null : graus(AVISO_H, d),
          grausTexto: d === null ? null : graus(glifoM, d),
        };
      }
      for (const chave of CHAVES) {
        const p = paineis[chave];
        if (!p.obj) { out[chave] = null; continue; }
        p.obj.updateWorldMatrix(true, false);
        const pos = p.obj.getWorldPosition(new THREE.Vector3());
        const d = cabeca ? pos.distanceTo(cabeca) : null;
        const normal = new THREE.Vector3(0, 0, 1)
          .applyQuaternion(p.obj.getWorldQuaternion(new THREE.Quaternion()));
        let encara = null;
        if (cabeca) {
          const paraOlho = new THREE.Vector3().subVectors(cabeca, pos);
          if (paraOlho.lengthSq() > 1e-9) {
            encara = Math.acos(Math.max(-1, Math.min(1, normal.dot(paraOlho.normalize())))) / GRAU;
          }
        }
        /* A ESCALA ENTRA NA CONTA. O painel projetado (ver PISO no cabeçalho)
           cresce junto com a distância; ler o tamanho de projeto e ignorar a
           escala do frame devolveria um ângulo que ninguém vê — e o ângulo é
           justamente o número que decide se dá para LER. */
        const k = p.obj.scale.x || 1;
        const w = (chave === 'arma' ? ARMA_W : chave === 'mapa' ? MAPA_W : PULSO_W) * k;
        const h = (chave === 'arma' ? ARMA_H : chave === 'mapa' ? MAPA_H : PULSO_H) * k;
        const cvH = chave === 'arma' ? ARMA_CV_H : PULSO_CV_H;
        /* altura de maiúscula do glifo GRANDE de cada painel, em metros. O
           mapa não tem glifo: o que precisa ser visto ali é o BLIP, e ele mede
           3 px num canvas de 256 — por isso a conta usa esse tamanho. */
        const glifoPx = chave === 'arma' ? 108 * 0.72 : chave === 'mapa' ? 3 * (256 / cvH) : 44 * 0.72;
        out[chave] = {
          nome: p.obj.name,
          /* mesma lição do js/xr/xrinteract.js: `visible` true com o objeto
             fora do grafo é "visível" que ninguém vê */
          visivel: !!(p.obj.visible && p.obj.parent),
          naCena: !!p.obj.parent,
          temPai: !!p.obj.parent,
          paiNome: p.obj.parent ? p.obj.parent.name : null,
          pos: pos.toArray(),
          distancia: d,
          normal: normal.toArray(),
          anguloEncara: encara,
          grausH: d === null ? null : graus(w, d),
          grausV: d === null ? null : graus(h, d),
          grausTexto: d === null ? null : graus(h * glifoPx / cvH, d),
          assinatura: p.assin,
        };
      }
      return out;
    },
  };
}
