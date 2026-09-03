const fs = require("fs");
const path = require("path");
const https = require("https");

const USERNAME = "tempotec";
const TOKEN = process.env.GITHUB_TOKEN;

const OUTPUT_DIR = path.join(process.cwd(), "dist");

const OUTPUT_FILE = path.join(
  OUTPUT_DIR,
  "snakeman-contributions.svg"
);

const LUFFY_FILE = path.join(
  process.cwd(),
  "assets",
  "luffy-snakeman.png"
);

if (!TOKEN) {
  console.error("GITHUB_TOKEN não encontrado.");
  process.exit(1);
}

/* =========================================================
   GITHUB GRAPHQL
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
   UTILS
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
  Cria uma rota de varredura.

  Linha 1:
  Luffy -------------------->

                            ╮
                            │

  Linha 2:
         <------------------╯

  Linha 3:
         ╰------------------>

  Isso cria um movimento realmente
  serpentino sem aquele efeito de ECG.
*/

function buildScanPath({
  startX,
  endX,
  topY,
  rows,
  rowStep,
  armOrigin,
}) {
  let d =
    `M ${armOrigin.x} ${armOrigin.y}`;

  /*
    Entrada suave no grid.
  */

  d += `
    C
    ${armOrigin.x + 25} ${armOrigin.y},
    ${startX - 30} ${topY},
    ${startX} ${topY}
  `;

  for (let row = 0; row < rows; row++) {
    const y =
      topY + row * rowStep;

    const goingRight =
      row % 2 === 0;

    const targetX =
      goingRight
        ? endX
        : startX;

    /*
      Varredura horizontal.
    */

    d += `
      L
      ${targetX}
      ${y}
    `;

    /*
      Curva para a próxima linha.
    */

    if (row < rows - 1) {
      const nextY =
        y + rowStep;

      const curveX =
        goingRight
          ? endX + 18
          : startX - 18;

      d += `
        C
        ${curveX} ${y},
        ${curveX} ${nextY},
        ${targetX} ${nextY}
      `;
    }
  }

  return d;
}

/*
  Ordem usada para saber em que momento
  cada quadrado é atingido.

  linha 0 -> esquerda para direita
  linha 1 -> direita para esquerda
  linha 2 -> esquerda para direita
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

  const calendar =
    result.data.user
      .contributionsCollection
      .contributionCalendar;

  const weeks =
    calendar.weeks;

  const total =
    calendar.totalContributions;

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

  /*
    Centro das células.
  */

  const scanStartX =
    gridX + cell / 2;

  const scanEndX =
    gridEndX - cell / 2;

  const scanTopY =
    gridY + cell / 2;

  /*
    Ponto de saída do braço no sprite.
  */

  const armOrigin = {
    x: 292,
    y: 164,
  };

  /*
    Duração total da animação.
  */

  const animationDuration = 16;

  const levelColors = {
    NONE:
      "#161b22",

    FIRST_QUARTILE:
      "#0e4429",

    SECOND_QUARTILE:
      "#006d32",

    THIRD_QUARTILE:
      "#26a641",

    FOURTH_QUARTILE:
      "#39d353",
  };

  const luffyBase64 =
    fs
      .readFileSync(LUFFY_FILE)
      .toString("base64");

  /* =======================================================
     GRID
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

          const id =
            `cell-${weekIndex}-${day.weekday}`;

          cells.push(`
            <rect
              id="${id}"
              x="${x}"
              y="${y}"
              width="${cell}"
              height="${cell}"
              rx="2"
              fill="${color}"
            >
              <title>${escapeXml(day.date)}: ${day.contributionCount} contribuições</title>
            </rect>
          `);

          /*
            Só os quadrados com atividade
            recebem o efeito de impacto.
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
              O braço usa aproximadamente
              82% do ciclo para atravessar
              o grid.

              Guardamos o restante para
              pausa/recolhimento.
            */

            const impactTime =
              normalized * 0.82;

            const before =
              Math.max(
                0,
                impactTime - 0.012
              );

            const after =
              Math.min(
                1,
                impactTime + 0.018
              );

            hitEffects.push(`
              <!-- impacto ${day.date} -->

              <rect
                x="${x - 2}"
                y="${y - 2}"
                width="${cell + 4}"
                height="${cell + 4}"
                rx="3"
                fill="#b6ff5c"
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
                r="4"
                fill="#ffffff"
                opacity="0"
                filter="url(#impactGlow)"
              >

                <animate
                  attributeName="opacity"
                  values="0;0;0.95;0;0"
                  keyTimes="0;${before};${impactTime};${after};1"
                  dur="${animationDuration}s"
                  repeatCount="indefinite"
                />

                <animate
                  attributeName="r"
                  values="4;4;16;4;4"
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
     ROTA DO SNAKE-MAN
  ======================================================= */

  const snakePath =
    buildScanPath({
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

      armOrigin,
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

    <!-- HAKI -->

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

        <feMergeNode
          in="blur"
        />

        <feMergeNode
          in="SourceGraphic"
        />

      </feMerge>

    </filter>


    <!-- VERDE DAS CONTRIBUIÇÕES -->

    <filter
      id="greenGlow"
      x="-200%"
      y="-200%"
      width="500%"
      height="500%"
    >

      <feGaussianBlur
        stdDeviation="5"
        result="blur"
      />

      <feMerge>

        <feMergeNode
          in="blur"
        />

        <feMergeNode
          in="SourceGraphic"
        />

      </feMerge>

    </filter>


    <!-- IMPACTO -->

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

        <feMergeNode
          in="blur"
        />

        <feMergeNode
          in="SourceGraphic"
        />

      </feMerge>

    </filter>


    <radialGradient id="impactGradient">

      <stop
        offset="0%"
        stop-color="#ffffff"
      />

      <stop
        offset="25%"
        stop-color="#ff8bb5"
      />

      <stop
        offset="55%"
        stop-color="#ff1744"
      />

      <stop
        offset="100%"
        stop-color="#ff1744"
        stop-opacity="0"
      />

    </radialGradient>

  </defs>


  <!-- ===================================================
       FUNDO
  ==================================================== -->

  <rect
    width="100%"
    height="100%"
    rx="14"
    fill="#0d1117"
  />


  <!-- ===================================================
       TITULO
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
       CONTRIBUIÇÕES
  ==================================================== -->

  <g id="contribution-grid">

    ${cells.join("\n")}

  </g>


  <!-- ===================================================
       IMPACTOS NOS QUADRADOS
  ==================================================== -->

  <g>

    ${hitEffects.join("\n")}

  </g>


  <!-- ===================================================
       BRAÇO SNAKE-MAN

       O caminho inteiro existe,
       mas apenas um trecho pequeno
       aparece atrás do punho.
  ==================================================== -->


  <!-- AURA -->

  <path
    d="${snakePath}"
    fill="none"
    stroke="#ff1744"
    stroke-width="24"
    stroke-linecap="round"
    stroke-linejoin="round"
    opacity="0.18"
    filter="url(#redGlow)"
    pathLength="1"
    stroke-dasharray="0.10 0.90"
    stroke-dashoffset="0.10"
  >

    <animate
      attributeName="stroke-dashoffset"
      values="0.10;-0.72;-0.72;0.10"
      keyTimes="0;0.82;0.92;1"
      dur="${animationDuration}s"
      repeatCount="indefinite"
    />

  </path>


  <!-- CORPO PRETO -->

  <path
    d="${snakePath}"
    fill="none"
    stroke="#07080b"
    stroke-width="15"
    stroke-linecap="round"
    stroke-linejoin="round"
    pathLength="1"
    stroke-dasharray="0.10 0.90"
    stroke-dashoffset="0.10"
  >

    <animate
      attributeName="stroke-dashoffset"
      values="0.10;-0.72;-0.72;0.10"
      keyTimes="0;0.82;0.92;1"
      dur="${animationDuration}s"
      repeatCount="indefinite"
    />

  </path>


  <!-- HAKI -->

  <path
    d="${snakePath}"
    fill="none"
    stroke="#ff1744"
    stroke-width="6"
    stroke-linecap="round"
    stroke-linejoin="round"
    filter="url(#redGlow)"
    pathLength="1"
    stroke-dasharray="0.10 0.90"
    stroke-dashoffset="0.10"
  >

    <animate
      attributeName="stroke-dashoffset"
      values="0.10;-0.72;-0.72;0.10"
      keyTimes="0;0.82;0.92;1"
      dur="${animationDuration}s"
      repeatCount="indefinite"
    />

  </path>


  <!-- REFLEXO -->

  <path
    d="${snakePath}"
    fill="none"
    stroke="#ff91bc"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    opacity="0.95"
    pathLength="1"
    stroke-dasharray="0.10 0.90"
    stroke-dashoffset="0.10"
  >

    <animate
      attributeName="stroke-dashoffset"
      values="0.10;-0.72;-0.72;0.10"
      keyTimes="0;0.82;0.92;1"
      dur="${animationDuration}s"
      repeatCount="indefinite"
    />

  </path>


  <!-- ===================================================
       LUFFY
  ==================================================== -->

  <image
    href="data:image/png;base64,${luffyBase64}"
    x="10"
    y="35"
    width="310"
    height="260"
    preserveAspectRatio="xMidYMid meet"
  />


  <!-- ===================================================
       PUNHO
  ==================================================== -->

  <g
    filter="url(#redGlow)"
  >

    <!-- aura -->

    <circle
      r="22"
      fill="#ff1744"
      opacity="0.22"
    />


    <!-- punho -->

    <circle
      r="15"
      fill="#050609"
      stroke="#ff1744"
      stroke-width="5"
    />


    <!-- dedos estilizados -->

    <path
      d="
        M -9 -5
        Q -5 -12 0 -6
        Q 4 -13 8 -5
        Q 13 -8 13 -1
        L 12 7
        Q 6 14 -2 12
        Q -11 11 -13 3
        Z
      "
      fill="#09090d"
      stroke="#ff315f"
      stroke-width="2"
    />


    <!-- brilho -->

    <circle
      cx="4"
      cy="-5"
      r="3"
      fill="#ff9abd"
    />


    <circle
      cx="5"
      cy="-6"
      r="1.2"
      fill="#ffffff"
    />


    <animateMotion
      dur="${animationDuration}s"
      repeatCount="indefinite"
      path="${snakePath}"
      keyPoints="0;1;1;0"
      keyTimes="0;0.82;0.92;1"
      calcMode="linear"
    />

  </g>


  <!-- ===================================================
       AURA DE IMPACTO NO PUNHO
  ==================================================== -->

  <circle
    r="25"
    fill="url(#impactGradient)"
    opacity="0.45"
    filter="url(#impactGlow)"
  >

    <animateMotion
      dur="${animationDuration}s"
      repeatCount="indefinite"
      path="${snakePath}"
      keyPoints="0;1;1;0"
      keyTimes="0;0.82;0.92;1"
      calcMode="linear"
    />


    <animate
      attributeName="r"
      values="15;24;18;28;15"
      dur="0.40s"
      repeatCount="indefinite"
    />


    <animate
      attributeName="opacity"
      values="0.15;0.65;0.20;0.75;0.15"
      dur="0.40s"
      repeatCount="indefinite"
    />

  </circle>


  <!-- ===================================================
       TEXTO
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
    svg
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
    `Impactos ativos: ${hitEffects.length}`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
