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

/* I3: nada dentro de 0,15 m do olho. 0,22 m dá margem pro painel inteiro. */
export const PERTO_DEMAIS = 0.22;

const GRAU = Math.PI / 180;
const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const pct = v => Math.max(0, Math.min(1, num(v)));

export function createXrHud({
  THREE, ler = () => ({}),
  win = typeof window === 'undefined' ? null : window,
} = {}) {
  const _p = new THREE.Vector3();

  const paineis = {
    arma: { obj: null, ctx: null, tex: null, assin: '', pai: null },
    pulso: { obj: null, ctx: null, tex: null, assin: '', pai: null },
  };
  let visto = { arma: false, pulso: false };
  let ultima = {};

  function criar(chave, w, h, cvW, cvH, nome) {
    const p = paineis[chave];
    if (p.obj) return p;
    const doc = win && win.document;
    const cv = doc ? doc.createElement('canvas') : null;
    if (cv) { cv.width = cvW; cv.height = cvH; p.ctx = cv.getContext('2d'); }
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
  function update({ arma = null, pulso = null, cabeca = null } = {}) {
    const d = ler() || {};
    ultima = d;
    const olho = cabeca || null;

    criar('arma', ARMA_W, ARMA_H, ARMA_CV_W, ARMA_CV_H, 'xrHudArma');
    criar('pulso', PULSO_W, PULSO_H, PULSO_CV_W, PULSO_CV_H, 'xrHudPulso');

    /* ADS: a arma vem ao rosto e o painel entraria dentro do olho (I3). A
       mira de ferro é o HUD naquele momento — é o que o gênero faz. */
    const armaOk = pendurar('arma', arma, ARMA_OFF) &&
      !d.oculto && !d.ads && (!arma || arma.visible !== false);
    const pulsoOk = pendurar('pulso', pulso, PULSO_OFF) && !d.oculto;

    visto = { arma: false, pulso: false };
    for (const [chave, ok] of [['arma', armaOk], ['pulso', pulsoOk]]) {
      const p = paineis[chave];
      if (!p.obj) continue;
      if (!ok) { p.obj.visible = false; continue; }
      p.obj.visible = true;
      if (olho) {
        p.obj.updateWorldMatrix(true, false);
        p.obj.getWorldPosition(_p);
        /* nada dentro de 0,15 m do olho (I3): o painel é a única coisa que dá
           pra tirar do caminho sem tirar a mão do jogador do lugar */
        if (_p.distanceTo(olho) < PERTO_DEMAIS) { p.obj.visible = false; continue; }
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
    return { arma: visto.arma, pulso: visto.pulso };
  }

  function exit() {
    for (const chave of ['arma', 'pulso']) {
      const p = paineis[chave];
      if (!p.obj) continue;
      p.obj.visible = false;
      if (p.obj.parent) p.obj.parent.remove(p.obj);
      p.pai = null; p.assin = '';
    }
    visto = { arma: false, pulso: false };
  }

  /* Altura angular do glifo, em graus, a partir da distância medida: é o
     número que decide se dá pra LER, e não o tamanho em metros. */
  function graus(alturaM, dist) {
    return 2 * Math.atan((alturaM / 2) / Math.max(1e-6, dist)) / GRAU;
  }

  return {
    update, exit,
    get arma() { return paineis.arma.obj; },
    get pulso() { return paineis.pulso.obj; },
    /* leitura pura para QA — nada aqui ACIONA nada */
    estado(cabeca = null) {
      const out = { dados: ultima, visivel: { ...visto } };
      for (const chave of ['arma', 'pulso']) {
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
        const w = chave === 'arma' ? ARMA_W : PULSO_W;
        const h = chave === 'arma' ? ARMA_H : PULSO_H;
        const cvH = chave === 'arma' ? ARMA_CV_H : PULSO_CV_H;
        // altura de maiúscula do glifo GRANDE de cada painel, em metros
        const glifoPx = chave === 'arma' ? 108 * 0.72 : 44 * 0.72;
        out[chave] = {
          nome: p.obj.name,
          visivel: !!p.obj.visible,
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
