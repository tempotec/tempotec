const fs = require("fs");
const path = require("path");
const https = require("https");

/* =========================================================
   CONFIG
========================================================= */

const USERNAME = "tempotec";
const TOKEN = process.env.GITHUB_TOKEN;

const OUTPUT_DIR = path.join(process.cwd(), "dist");

const OUTPUT_FILE = path.join(
  OUTPUT_DIR,
  "snakeman-contributions.svg"
);

const LUFFY_SPRITESHEET_FILE = path.join(
  process.cwd(),
  "assets",
  "luffy-snakeman-spritesheet.png"
);

/*
  O código tenta descobrir automaticamente quantos frames
  existem caso o spritesheet seja uma faixa horizontal.

  Exemplo:

  [FRAME 1][FRAME 2][FRAME 3][FRAME 4]

  Se precisar forçar manualmente:

  Windows PowerShell:
  $env:LUFFY_FRAME_COUNT="6"

  Linux / GitHub Actions:
  LUFFY_FRAME_COUNT=6
*/

const FORCED_LUFFY_FRAME_COUNT =
  Number(process.env.LUFFY_FRAME_COUNT || 0);

if (!TOKEN) {
  console.error("GITHUB_TOKEN não encontrado.");
  process.exit(1);
}

if (!fs.existsSync(LUFFY_SPRITESHEET_FILE)) {
  console.error(
    `Spritesheet do Luffy não encontrado: ${LUFFY_SPRITESHEET_FILE}`
  );

  process.exit(1);
}

/* =========================================================
   GITHUB
========================================================= */

function graphqlRequest(query) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query });

    const req = https.request(
      {
        hostname: "api.github.com",
        path: "/graphql",
        method: "POST",
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          "User-Agent": "tempotec-snakeman-animation",
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = "";

        res.on("data", (chunk) => {
          data += chunk;
        });

        res.on("end", () => {
          try {
            const parsed = JSON.parse(data);

            if (parsed.errors) {
              console.error(parsed.errors);

              reject(
                new Error(
                  "Erro na API GraphQL do GitHub."
                )
              );

              return;
            }

            resolve(parsed);
          } catch (error) {
            reject(error);
          }
        });
      }
    );

    req.on("error", reject);

    req.write(body);
    req.end();
  });
}

/* =========================================================
   HELPERS
========================================================= */

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/*
  Lê somente o cabeçalho do PNG.

  PNG guarda:
  width  -> bytes 16 até 19
  height -> bytes 20 até 23
*/

function getPngSize(buffer) {
  if (!buffer || buffer.length < 24) {
    throw new Error(
      "Arquivo PNG inválido ou incompleto."
    );
  }

  const signature = buffer
    .subarray(0, 8)
    .toString("hex");

  if (signature !== "89504e470d0a1a0a") {
    throw new Error(
      "O spritesheet informado não parece ser um PNG válido."
    );
  }

  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

/*
  Detecta quantos frames existem.

  Estratégia padrão:

      larguraSpritesheet / alturaSpritesheet

  Isso funciona quando cada frame é aproximadamente
  quadrado e todos estão na mesma linha.

  Exemplo:

      4096 x 1024
      = 4 frames

  Caso os frames não sejam quadrados, use
  LUFFY_FRAME_COUNT manualmente.
*/

function detectFrameCount({
  width,
  height,
}) {
  if (
    Number.isFinite(FORCED_LUFFY_FRAME_COUNT) &&
    FORCED_LUFFY_FRAME_COUNT > 0
  ) {
    return Math.floor(
      FORCED_LUFFY_FRAME_COUNT
    );
  }

  if (
    width > height &&
    width % height === 0
  ) {
    return Math.max(
      1,
      Math.round(width / height)
    );
  }

  return 1;
}

/*
  Gera os valores de X usados para deslocar
  o spritesheet dentro da máscara.

  Se tivermos 4 frames:

      frame 0 -> x
      frame 1 -> x - width
      frame 2 -> x - width*2
      frame 3 -> x - width*3
*/

function buildSpriteXValues({
  startX,
  frameWidth,
  frameCount,
}) {
  const values = [];

  for (
    let frame = 0;
    frame < frameCount;
    frame++
  ) {
    values.push(
      startX - frame * frameWidth
    );
  }

  return values.join(";");
}

/*
  Rota Snake-Man:

  LUFFY ━━━━━━━━━━━━━━━━━━━👊
                             ╮
  👊━━━━━━━━━━━━━━━━━━━━━━━━━╯
  ╰━━━━━━━━━━━━━━━━━━━━━━━━━👊
                             ╮
  👊━━━━━━━━━━━━━━━━━━━━━━━━━╯

  O braço permanece conectado ao Luffy.
*/

function buildSnakePath({
  armOrigin,
  startX,
  endX,
  topY,
  rows,
  rowStep,
}) {
  let d =
    `M ${armOrigin.x} ${armOrigin.y}`;

  /*
    Saída do braço do corpo.
  */

  d += `
    C
      ${armOrigin.x + 35} ${armOrigin.y - 5},
      ${startX - 35} ${topY},
      ${startX} ${topY}
  `;

  for (
    let row = 0;
    row < rows;
    row++
  ) {
    const y =
      topY + row * rowStep;

    const goingRight =
      row % 2 === 0;

    const destinationX =
      goingRight
        ? endX
        : startX;

    /*
      Atravessa a linha.
    */

    d += `
      L
        ${destinationX}
        ${y}
    `;

    /*
      Curva Snake-Man na lateral.
    */

    if (row < rows - 1) {
      const nextY =
        y + rowStep;

      const outsideX =
        goingRight
          ? endX + 24
          : startX - 24;

      d += `
        C
          ${outsideX} ${y},
          ${outsideX} ${nextY},
          ${destinationX} ${nextY}
      `;
    }
  }

  return d;
}

/*
  Ordem de cada quadrado durante
  o movimento Snake-Man.
*/

function getSnakeOrder(
  weekIndex,
  weekday,
  weekCount
) {
  if (weekday % 2 === 0) {
    return (
      weekday * weekCount +
      weekIndex
    );
  }

  return (
    weekday * weekCount +
    (weekCount - 1 - weekIndex)
  );
}

/* =========================================================
   MAIN
========================================================= */

async function main() {
  const query = `
    query {
      user(login: "${USERNAME}") {
        contributionsCollection {
          contributionCalendar {
            totalContributions

            weeks {
              contributionDays {
                contributionCount
                contributionLevel
                date
                weekday
              }
            }
          }
        }
      }
    }
  `;

  const result =
    await graphqlRequest(query);

  if (
    !result.data ||
    !result.data.user
  ) {
    throw new Error(
      `Usuário do GitHub não encontrado: ${USERNAME}`
    );
  }

  const calendar =
    result.data.user
      .contributionsCollection
      .contributionCalendar;

  const weeks =
    calendar.weeks;

  const total =
    calendar.totalContributions;

  /* =======================================================
     SPRITESHEET
  ======================================================= */

  const luffyBuffer =
    fs.readFileSync(
      LUFFY_SPRITESHEET_FILE
    );

  const luffyBase64 =
    luffyBuffer.toString("base64");

  const spriteSize =
    getPngSize(luffyBuffer);

  const luffyFrameCount =
    detectFrameCount(spriteSize);

  console.log(
    `Spritesheet: ${spriteSize.width}x${spriteSize.height}`
  );

  console.log(
    `Frames detectados: ${luffyFrameCount}`
  );

  /* =======================================================
     LAYOUT
  ======================================================= */

  const cell = 11;
  const gap = 3;

  const step =
    cell + gap;

  const gridX = 330;
  const gridY = 82;

  const width = 1200;
  const height = 320;

  const weekCount =
    weeks.length;

  const gridWidth =
    (weekCount - 1) * step +
    cell;

  const gridEndX =
    gridX + gridWidth;

  const scanStartX =
    gridX + cell / 2;

  const scanEndX =
    gridEndX - cell / 2;

  const scanTopY =
    gridY + cell / 2;

  /*
    Janela onde UM frame do Luffy
    será exibido.
  */

  const luffyX = 10;
  const luffyY = 35;

  const luffyFrameWidth = 310;
  const luffyFrameHeight = 260;

  /*
    A imagem inteira precisa possuir uma largura
    equivalente a todos os frames juntos.

    Exemplo:

    4 frames x 310 px
    = 1240 px
  */

  const renderedSpriteWidth =
    luffyFrameWidth *
    luffyFrameCount;

  /*
    Velocidade da animação DO CORPO.

    0.16s por frame deixa o movimento rápido
    sem virar uma tremedeira absurda.
  */

  const spriteFrameDuration =
    0.16;

  const spriteAnimationDuration =
    Math.max(
      0.16,
      luffyFrameCount *
        spriteFrameDuration
    );

  const spriteXValues =
    buildSpriteXValues({
      startX: luffyX,
      frameWidth:
        luffyFrameWidth,
      frameCount:
        luffyFrameCount,
    });

  /*
    Ponto de nascimento do braço.

    Continua praticamente no punho/ombro
    direito do Luffy.
  */

  const armOrigin = {
    x: 287,
    y: 158,
  };

  /*
    Timeline principal:

    0%   braço começa
    75%  chegou ao fim
    86%  permanece esticado
    100% recolheu
  */

  const animationDuration = 18;

  const travelEnd = 0.75;
  const holdEnd = 0.86;

  const levelColors = {
    NONE: "#161b22",
    FIRST_QUARTILE: "#0e4429",
    SECOND_QUARTILE: "#006d32",
    THIRD_QUARTILE: "#26a641",
    FOURTH_QUARTILE: "#39d353",
  };

  /* =======================================================
     CONTRIBUTION CELLS
  ======================================================= */

  const cells = [];
  const hitEffects = [];

  const totalScanSlots =
    weekCount * 7;

  weeks.forEach(
    (week, weekIndex) => {
      week.contributionDays.forEach(
        (day) => {
          const x =
            gridX +
            weekIndex * step;

          const y =
            gridY +
            day.weekday * step;

          const centerX =
            x + cell / 2;

          const centerY =
            y + cell / 2;

          const color =
            levelColors[
              day.contributionLevel
            ] ||
            levelColors.NONE;

          cells.push(`
            <rect
              x="${x}"
              y="${y}"
              width="${cell}"
              height="${cell}"
              rx="2"
              fill="${color}"
            >
              <title>${escapeXml(
                day.date
              )}: ${day.contributionCount} contribuições</title>
            </rect>
          `);

          /*
            Só gera impacto visual
            quando realmente existiu contribuição.
          */

          if (
            day.contributionCount > 0
          ) {
            const order =
              getSnakeOrder(
                weekIndex,
                day.weekday,
                weekCount
              );

            const normalized =
              order /
              Math.max(
                1,
                totalScanSlots - 1
              );

            /*
              Pequeno offset porque o punho primeiro
              precisa sair do Luffy até alcançar a grade.
            */

            const gridTravelStart =
              0.055;

            const usableTravel =
              travelEnd -
              gridTravelStart;

            const impactTime =
              gridTravelStart +
              normalized *
                usableTravel;

            const before =
              Math.max(
                0,
                impactTime - 0.008
              );

            const after =
              Math.min(
                1,
                impactTime + 0.014
              );

            hitEffects.push(`
              <!-- HIT: ${escapeXml(
                day.date
              )} -->

              <rect
                x="${x - 3}"
                y="${y - 3}"
                width="${cell + 6}"
                height="${cell + 6}"
                rx="4"
                fill="#8cff66"
                opacity="0"
                filter="url(#greenGlow)"
              >
                <animate
                  attributeName="opacity"
                  values="0;0;1;0;0"
                  keyTimes="0;${before};${impactTime};${after};1"
                  dur="${animationDuration}s"
                  repeatCount="indefinite"
                />
              </rect>

              <circle
                cx="${centerX}"
                cy="${centerY}"
                r="3"
                fill="#ffffff"
                opacity="0"
                filter="url(#impactGlow)"
              >
                <animate
                  attributeName="opacity"
                  values="0;0;1;0;0"
                  keyTimes="0;${before};${impactTime};${after};1"
                  dur="${animationDuration}s"
                  repeatCount="indefinite"
                />

                <animate
                  attributeName="r"
                  values="3;3;18;5;3"
                  keyTimes="0;${before};${impactTime};${after};1"
                  dur="${animationDuration}s"
                  repeatCount="indefinite"
                />
              </circle>
            `);
          }
        }
      );
    }
  );

  /* =======================================================
     SNAKE PATH
  ======================================================= */

  const snakePath =
    buildSnakePath({
      armOrigin,

      startX:
        scanStartX,

      endX:
        scanEndX,

      topY:
        scanTopY,

      rows:
        7,

      rowStep:
        step,
    });

  /* =======================================================
     SVG
  ======================================================= */

  const svg = `
<svg
  xmlns="http://www.w3.org/2000/svg"
  xmlns:xlink="http://www.w3.org/1999/xlink"
  width="${width}"
  height="${height}"
  viewBox="0 0 ${width} ${height}"
>

  <defs>

    <!-- =================================================
         CLIP DO SPRITESHEET
    ================================================== -->

    <clipPath id="luffyFrameClip">
      <rect
        x="${luffyX}"
        y="${luffyY}"
        width="${luffyFrameWidth}"
        height="${luffyFrameHeight}"
      />
    </clipPath>


    <!-- =================================================
         HAKI GLOW
    ================================================== -->

    <filter
      id="redGlow"
      x="-100%"
      y="-100%"
      width="300%"
      height="300%"
    >
      <feGaussianBlur
        stdDeviation="5"
        result="blur"
      />

      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>


    <!-- =================================================
         IMPACT GLOW
    ================================================== -->

    <filter
      id="impactGlow"
      x="-300%"
      y="-300%"
      width="700%"
      height="700%"
    >
      <feGaussianBlur
        stdDeviation="7"
        result="blur"
      />

      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>


    <!-- =================================================
         CONTRIBUTION GLOW
    ================================================== -->

    <filter
      id="greenGlow"
      x="-300%"
      y="-300%"
      width="700%"
      height="700%"
    >
      <feGaussianBlur
        stdDeviation="5"
        result="blur"
      />

      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>


    <!-- =================================================
         LUFFY BODY GLOW
    ================================================== -->

    <filter
      id="luffyGlow"
      x="-50%"
      y="-50%"
      width="200%"
      height="200%"
    >
      <feGaussianBlur
        stdDeviation="3"
        result="blur"
      />

      <feColorMatrix
        in="blur"
        type="matrix"
        values="
          1 0 0 0 0.25
          0 0.25 0 0 0
          0 0 0.25 0 0
          0 0 0 1 0
        "
        result="redBlur"
      />

      <feMerge>
        <feMergeNode in="redBlur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>


    <!-- =================================================
         FIST AURA
    ================================================== -->

    <radialGradient id="fistAura">

      <stop
        offset="0%"
        stop-color="#ffffff"
      />

      <stop
        offset="20%"
        stop-color="#ff9abd"
      />

      <stop
        offset="50%"
        stop-color="#ff1744"
      />

      <stop
        offset="100%"
        stop-color="#ff1744"
        stop-opacity="0"
      />

    </radialGradient>


    <!-- =================================================
         BODY AURA
    ================================================== -->

    <radialGradient id="bodyAura">

      <stop
        offset="0%"
        stop-color="#ff1744"
        stop-opacity="0.22"
      />

      <stop
        offset="60%"
        stop-color="#e91e63"
        stop-opacity="0.08"
      />

      <stop
        offset="100%"
        stop-color="#ff1744"
        stop-opacity="0"
      />

    </radialGradient>

  </defs>


  <!-- ===================================================
       BACKGROUND
  ==================================================== -->

  <rect
    width="100%"
    height="100%"
    rx="14"
    fill="#0d1117"
  />


  <!-- ===================================================
       HEADER
  ==================================================== -->

  <text
    x="330"
    y="35"
    fill="#f0f6fc"
    font-family="monospace"
    font-size="19"
    font-weight="bold"
  >
    TEMPOTEC
  </text>


  <text
    x="330"
    y="55"
    fill="#8b949e"
    font-family="monospace"
    font-size="11"
  >
    ${total} contributions • Gear 4 Snake-Man
  </text>


  <!-- ===================================================
       CONTRIBUTION GRID
  ==================================================== -->

  <g id="contribution-grid">

    ${cells.join("\n")}

  </g>


  <!-- ===================================================
       HIT EFFECTS
  ==================================================== -->

  <g id="hit-effects">

    ${hitEffects.join("\n")}

  </g>


  <!-- ===================================================
       SNAKE-MAN ARM

       As camadas são desenhadas antes do Luffy.

       Assim o corpo do Luffy cobre a origem do braço
       e a conexão parece sair de dentro do personagem.
  ==================================================== -->


  <!-- AURA EXTERNA -->

  <path
    d="${snakePath}"
    fill="none"
    stroke="#ff1744"
    stroke-width="32"
    stroke-linecap="round"
    stroke-linejoin="round"
    opacity="0.14"
    filter="url(#redGlow)"
    pathLength="1"
  >

    <animate
      attributeName="stroke-dasharray"
      values="
        0 1;
        1 0;
        1 0;
        0 1
      "
      keyTimes="
        0;
        ${travelEnd};
        ${holdEnd};
        1
      "
      dur="${animationDuration}s"
      repeatCount="indefinite"
    />

  </path>


  <!-- BORDA EXTERNA -->

  <path
    d="${snakePath}"
    fill="none"
    stroke="#ff1744"
    stroke-width="21"
    stroke-linecap="round"
    stroke-linejoin="round"
    filter="url(#redGlow)"
    pathLength="1"
  >

    <animate
      attributeName="stroke-dasharray"
      values="
        0 1;
        1 0;
        1 0;
        0 1
      "
      keyTimes="
        0;
        ${travelEnd};
        ${holdEnd};
        1
      "
      dur="${animationDuration}s"
      repeatCount="indefinite"
    />

  </path>


  <!-- CORPO PRETO DO BRAÇO / HAKI -->

  <path
    d="${snakePath}"
    fill="none"
    stroke="#050609"
    stroke-width="15"
    stroke-linecap="round"
    stroke-linejoin="round"
    pathLength="1"
  >

    <animate
      attributeName="stroke-dasharray"
      values="
        0 1;
        1 0;
        1 0;
        0 1
      "
      keyTimes="
        0;
        ${travelEnd};
        ${holdEnd};
        1
      "
      dur="${animationDuration}s"
      repeatCount="indefinite"
    />

  </path>


  <!-- HAKI MAGENTA -->

  <path
    d="${snakePath}"
    fill="none"
    stroke="#e91e63"
    stroke-width="5"
    stroke-linecap="round"
    stroke-linejoin="round"
    filter="url(#redGlow)"
    pathLength="1"
  >

    <animate
      attributeName="stroke-dasharray"
      values="
        0 1;
        1 0;
        1 0;
        0 1
      "
      keyTimes="
        0;
        ${travelEnd};
        ${holdEnd};
        1
      "
      dur="${animationDuration}s"
      repeatCount="indefinite"
    />

  </path>


  <!-- REFLEXO DO BRAÇO -->

  <path
    d="${snakePath}"
    fill="none"
    stroke="#ff98bf"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    opacity="0.85"
    pathLength="1"
  >

    <animate
      attributeName="stroke-dasharray"
      values="
        0 1;
        1 0;
        1 0;
        0 1
      "
      keyTimes="
        0;
        ${travelEnd};
        ${holdEnd};
        1
      "
      dur="${animationDuration}s"
      repeatCount="indefinite"
    />

  </path>


  <!-- ===================================================
       AURA ATRÁS DO LUFFY
  ==================================================== -->

  <ellipse
    cx="160"
    cy="170"
    rx="145"
    ry="125"
    fill="url(#bodyAura)"
    opacity="0.35"
  >

    <animate
      attributeName="opacity"
      values="0.18;0.4;0.22;0.48;0.18"
      dur="1.2s"
      repeatCount="indefinite"
    />

    <animate
      attributeName="rx"
      values="138;150;141;155;138"
      dur="1.2s"
      repeatCount="indefinite"
    />

    <animate
      attributeName="ry"
      values="118;128;121;132;118"
      dur="1.2s"
      repeatCount="indefinite"
    />

  </ellipse>


  <!-- ===================================================
       LUFFY SPRITESHEET

       IMPORTANTE:

       A máscara mostra somente 310x260.

       A imagem inteira se move da direita para esquerda
       dentro dessa janela.

       Isso cria a animação frame-a-frame.
  ==================================================== -->

  <g
    id="luffy"
    clip-path="url(#luffyFrameClip)"
    filter="url(#luffyGlow)"
  >

    <image
      href="data:image/png;base64,${luffyBase64}"
      x="${luffyX}"
      y="${luffyY}"
      width="${renderedSpriteWidth}"
      height="${luffyFrameHeight}"
      preserveAspectRatio="none"
    >

      ${
        luffyFrameCount > 1
          ? `
      <animate
        attributeName="x"
        values="${spriteXValues}"
        dur="${spriteAnimationDuration}s"
        calcMode="discrete"
        repeatCount="indefinite"
      />
      `
          : ""
      }

    </image>

  </g>


  <!-- ===================================================
       ANIMATED FIST
  ==================================================== -->

  <g
    id="snake-fist"
    filter="url(#redGlow)"
  >

    <!-- aura -->

    <circle
      r="25"
      fill="#ff1744"
      opacity="0.22"
    >
      <animate
        attributeName="r"
        values="22;27;23;29;22"
        dur="0.42s"
        repeatCount="indefinite"
      />

      <animate
        attributeName="opacity"
        values="0.14;0.35;0.18;0.42;0.14"
        dur="0.42s"
        repeatCount="indefinite"
      />
    </circle>


    <!-- palma -->

    <path
      d="
        M -14 -6
        Q -12 -16 -5 -12
        Q -1 -19 4 -12
        Q 10 -17 12 -9
        Q 18 -11 17 -3
        L 16 7
        Q 10 17 -1 17
        Q -12 17 -17 8
        Q -20 0 -14 -6
        Z
      "
      fill="#050609"
      stroke="#ff1744"
      stroke-width="4"
    />


    <!-- dedos -->

    <path
      d="
        M -9 -5
        Q -7 -11 -3 -7

        M -2 -8
        Q 0 -14 4 -8

        M 5 -8
        Q 8 -13 10 -6
      "
      fill="none"
      stroke="#ff6f9f"
      stroke-width="2.2"
      stroke-linecap="round"
    />


    <!-- brilho -->

    <ellipse
      cx="6"
      cy="-8"
      rx="4"
      ry="2.5"
      fill="#ff9abd"
    />

    <circle
      cx="7"
      cy="-9"
      r="1.2"
      fill="#ffffff"
    />


    <!-- movimento pela Snake Path -->

    <animateMotion
      dur="${animationDuration}s"
      repeatCount="indefinite"
      path="${snakePath}"
      keyPoints="0;1;1;0"
      keyTimes="0;${travelEnd};${holdEnd};1"
      calcMode="linear"
    />

  </g>


  <!-- ===================================================
       PUNCH AURA
  ==================================================== -->

  <circle
    r="28"
    fill="url(#fistAura)"
    opacity="0.28"
    filter="url(#impactGlow)"
  >

    <animateMotion
      dur="${animationDuration}s"
      repeatCount="indefinite"
      path="${snakePath}"
      keyPoints="0;1;1;0"
      keyTimes="0;${travelEnd};${holdEnd};1"
      calcMode="linear"
    />


    <animate
      attributeName="r"
      values="20;30;22;34;20"
      dur="0.42s"
      repeatCount="indefinite"
    />


    <animate
      attributeName="opacity"
      values="0.18;0.55;0.22;0.65;0.18"
      dur="0.42s"
      repeatCount="indefinite"
    />

  </circle>


  <!-- ===================================================
       FOOTER
  ==================================================== -->

  <text
    x="330"
    y="260"
    fill="#39d353"
    font-family="monospace"
    font-size="13"
  >
    $ git commit -m "keep going"
  </text>


  <text
    x="330"
    y="285"
    fill="#8b949e"
    font-family="monospace"
    font-size="11"
  >
    Snake-Man is hunting every contribution...
  </text>

</svg>
`;

  /* =======================================================
     OUTPUT
  ======================================================= */

  fs.mkdirSync(
    OUTPUT_DIR,
    {
      recursive: true,
    }
  );

  fs.writeFileSync(
    OUTPUT_FILE,
    svg,
    "utf8"
  );

  console.log("");
  console.log(
    "========================================"
  );

  console.log(
    " SNAKE-MAN CONTRIBUTION ANIMATION"
  );

  console.log(
    "========================================"
  );

  console.log(
    `SVG criado: ${OUTPUT_FILE}`
  );

  console.log(
    `Contribuições: ${total}`
  );

  console.log(
    `Semanas: ${weekCount}`
  );

  console.log(
    `Impactos animados: ${hitEffects.length}`
  );

  console.log(
    `Spritesheet: ${spriteSize.width}x${spriteSize.height}`
  );

  console.log(
    `Frames do Luffy: ${luffyFrameCount}`
  );

  console.log(
    `Duração corpo: ${spriteAnimationDuration.toFixed(
      2
    )}s`
  );

  console.log(
    `Duração Snake-Man: ${animationDuration}s`
  );

  console.log(
    "========================================"
  );
}

main().catch((error) => {
  console.error("");
  console.error(
    "Falha ao gerar Snake-Man:"
  );

  console.error(error);

  process.exit(1);
});
