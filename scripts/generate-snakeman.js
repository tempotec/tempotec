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
  Rota:

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
    Saída inicial do braço.
    Faz uma curva até o primeiro quadrado.
  */

  d += `
    C
    ${armOrigin.x + 35} ${armOrigin.y - 5},
    ${startX - 35} ${topY},
    ${startX} ${topY}
  `;

  for (let row = 0; row < rows; row++) {
    const y =
      topY + row * rowStep;

    const goingRight =
      row % 2 === 0;

    const destinationX =
      goingRight
        ? endX
        : startX;

    /*
      Braço atravessa a linha.
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
  Calcula em qual momento cada célula
  é alcançada pela varredura.
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
  const step = cell + gap;

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
    Ajuste fino:
    ponto onde visualmente o braço
    sai do sprite do Luffy.
  */

  const armOrigin = {
    x: 287,
    y: 158,
  };

  /*
    0%   -> braço recolhido
    75%  -> terminou a varredura
    86%  -> pausa
    100% -> voltou para o Luffy
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

  const luffyBase64 =
    fs
      .readFileSync(LUFFY_FILE)
      .toString("base64");

  /* =======================================================
     CONTRIBUIÇÕES
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
              <title>${escapeXml(day.date)}: ${day.contributionCount} contribuições</title>
            </rect>
          `);

          /*
            Só explode se realmente houve
            contribuição naquele dia.
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

            const impactTime =
              normalized *
              travelEnd;

            const before =
              Math.max(
                0,
                impactTime - 0.009
              );

            const after =
              Math.min(
                1,
                impactTime + 0.014
              );

            hitEffects.push(`
              <!-- HIT: ${day.date} -->

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
     CAMINHO
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

    <!-- =============================
         HAKI GLOW
    ============================== -->

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


    <!-- =============================
         IMPACT
    ============================== -->

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

  <g>

    ${hitEffects.join("\n")}

  </g>


  <!-- ===================================================
       SNAKE-MAN ARM

       IMPORTANTE:

       stroke-dasharray começa zerado.

       Ele cresce DO LUFFY ATÉ O PUNHO.

       Depois recolhe de volta.
  ==================================================== -->


  <!-- AURA EXTERNA -->

  <path
    d="${snakePath}"
    fill="none"
    stroke="#ff1744"
    stroke-width="30"
    stroke-linecap="round"
    stroke-linejoin="round"
    opacity="0.16"
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


  <!-- BORDA MAGENTA -->

  <path
    d="${snakePath}"
    fill="none"
    stroke="#ff1744"
    stroke-width="20"
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


  <!-- CORPO DO BRAÇO -->

  <path
    d="${snakePath}"
    fill="none"
    stroke="#050609"
    stroke-width="14"
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


  <!-- HAKI -->

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


  <!-- REFLEXO -->

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
       LUFFY

       Vem depois do braço propositalmente
       para esconder a origem da linha.
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
       ANIMATED FIST
  ==================================================== -->

  <g filter="url(#redGlow)">

    <!-- aura -->

    <circle
      r="24"
      fill="#ff1744"
      opacity="0.22"
    />


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
    `Impactos animados: ${hitEffects.length}`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
