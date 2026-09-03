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

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/*
  Constrói um caminho curvo.

  Em vez de:

  --------/\----\/-----

  teremos algo mais parecido com:

  ~~~~~~~╲____╱~~~~~~~

  As curvas Bézier deixam o ataque
  mais parecido com o Snake-Man.
*/
function buildSnakePath(points, startPoint) {
  if (!points.length) {
    return `M ${startPoint.x} ${startPoint.y}`;
  }

  const route = [
    startPoint,
    ...points,
  ];

  let d = `M ${route[0].x} ${route[0].y}`;

  for (let i = 1; i < route.length; i++) {
    const previous = route[i - 1];
    const current = route[i];

    const dx = current.x - previous.x;
    const dy = current.y - previous.y;

    /*
      Alternamos a curvatura para o braço
      serpentear de verdade.
    */
    const direction =
      i % 2 === 0 ? 1 : -1;

    const wave =
      Math.min(
        24,
        Math.max(
          8,
          Math.abs(dx) * 0.35 +
            Math.abs(dy) * 0.15
        )
      ) * direction;

    const control1X =
      previous.x + dx * 0.35;

    const control1Y =
      previous.y + wave;

    const control2X =
      previous.x + dx * 0.65;

    const control2Y =
      current.y - wave;

    d += `
      C
      ${control1X} ${control1Y},
      ${control2X} ${control2Y},
      ${current.x} ${current.y}
    `;
  }

  return d;
}

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

  const weeks = calendar.weeks;
  const total =
    calendar.totalContributions;

  /*
    GRID
  */

  const cell = 11;
  const gap = 3;
  const step = cell + gap;

  const gridX = 330;
  const gridY = 82;

  /*
    CANVAS
  */

  const width = 1200;
  const height = 320;

  const levelColors = {
    NONE: "#161b22",

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

  const cells = [];

  /*
    Guardamos os pontos separados
    por semana.

    Isso permite montar o trajeto:

    semana 1 ↓
    semana 2 ↑
    semana 3 ↓
    semana 4 ↑

    criando um caminho serpentino.
  */

  const pointsByWeek = [];

  weeks.forEach(
    (week, weekIndex) => {
      const weekPoints = [];

      week.contributionDays.forEach(
        (day) => {
          const x =
            gridX +
            weekIndex * step;

          const y =
            gridY +
            day.weekday * step;

          const color =
            levelColors[
              day.contributionLevel
            ] || levelColors.NONE;

          cells.push(`
            <rect
              x="${x}"
              y="${y}"
              width="${cell}"
              height="${cell}"
              rx="2"
              fill="${color}"
            >
              <title>
                ${escapeXml(day.date)}:
                ${day.contributionCount}
                contribuições
              </title>
            </rect>
          `);

          if (
            day.contributionCount > 0
          ) {
            weekPoints.push({
              x:
                x +
                cell / 2,

              y:
                y +
                cell / 2,

              date:
                day.date,

              count:
                day.contributionCount,
            });
          }
        }
      );

      pointsByWeek.push(
        weekPoints
      );
    }
  );

  /*
    SNAKE ROUTE

    A ordem alternada evita aquele
    zig-zag agressivo que parecia
    gráfico financeiro.
  */

  const attackPoints = [];

  pointsByWeek.forEach(
    (weekPoints, index) => {
      if (!weekPoints.length) {
        return;
      }

      const ordered =
        index % 2 === 0
          ? [...weekPoints]
          : [...weekPoints].reverse();

      attackPoints.push(
        ...ordered
      );
    }
  );

  /*
    Ponto onde o braço "nasce".

    Fica próximo do punho direito
    do sprite.
  */

  const armOrigin = {
    x: 285,
    y: 165,
  };

  const snakePath =
    buildSnakePath(
      attackPoints,
      armOrigin
    );

  const svg = `
<svg
  xmlns="http://www.w3.org/2000/svg"
  xmlns:xlink="http://www.w3.org/1999/xlink"
  width="${width}"
  height="${height}"
  viewBox="0 0 ${width} ${height}"
>

  <defs>

    <!-- BRILHO DO HAKI -->

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


    <!-- BRILHO FORTE -->

    <filter
      id="impactGlow"
      x="-200%"
      y="-200%"
      width="500%"
      height="500%"
    >

      <feGaussianBlur
        stdDeviation="8"
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

    <radialGradient id="impact">

      <stop
        offset="0%"
        stop-color="#ffffff"
      />

      <stop
        offset="20%"
        stop-color="#ff87b7"
      />

      <stop
        offset="45%"
        stop-color="#ff1744"
      />

      <stop
        offset="100%"
        stop-color="#ff1744"
        stop-opacity="0"
      />

    </radialGradient>

  </defs>


  <!-- ====================================== -->
  <!-- FUNDO -->
  <!-- ====================================== -->

  <rect
    width="100%"
    height="100%"
    rx="14"
    fill="#0d1117"
  />


  <!-- ====================================== -->
  <!-- TITULO -->
  <!-- ====================================== -->

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


  <!-- ====================================== -->
  <!-- GRID DE CONTRIBUIÇÕES -->
  <!-- ====================================== -->

  <g id="contribution-grid">

    ${cells.join("\n")}

  </g>


  <!-- ====================================== -->
  <!-- BRAÇO SNAKE-MAN -->
  <!-- ====================================== -->

  <!-- aura vermelha -->

  <path
    d="${snakePath}"
    fill="none"
    stroke="#ff1744"
    stroke-width="22"
    stroke-linecap="round"
    stroke-linejoin="round"
    opacity="0.20"
    filter="url(#redGlow)"
    pathLength="1"
    stroke-dasharray="1"
    stroke-dashoffset="1"
  >

    <animate
      attributeName="stroke-dashoffset"
      values="1;0;0;1"
      keyTimes="0;0.80;0.94;1"
      dur="14s"
      repeatCount="indefinite"
    />

  </path>


  <!-- corpo preto do braço -->

  <path
    d="${snakePath}"
    fill="none"
    stroke="#08090c"
    stroke-width="14"
    stroke-linecap="round"
    stroke-linejoin="round"
    pathLength="1"
    stroke-dasharray="1"
    stroke-dashoffset="1"
  >

    <animate
      attributeName="stroke-dashoffset"
      values="1;0;0;1"
      keyTimes="0;0.80;0.94;1"
      dur="14s"
      repeatCount="indefinite"
    />

  </path>


  <!-- acabamento vermelho do Haki -->

  <path
    d="${snakePath}"
    fill="none"
    stroke="#ff1744"
    stroke-width="5"
    stroke-linecap="round"
    stroke-linejoin="round"
    filter="url(#redGlow)"
    pathLength="1"
    stroke-dasharray="1"
    stroke-dashoffset="1"
  >

    <animate
      attributeName="stroke-dashoffset"
      values="1;0;0;1"
      keyTimes="0;0.80;0.94;1"
      dur="14s"
      repeatCount="indefinite"
    />

  </path>


  <!-- highlight magenta -->

  <path
    d="${snakePath}"
    fill="none"
    stroke="#ff70a6"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    opacity="0.85"
    pathLength="1"
    stroke-dasharray="1"
    stroke-dashoffset="1"
  >

    <animate
      attributeName="stroke-dashoffset"
      values="1;0;0;1"
      keyTimes="0;0.80;0.94;1"
      dur="14s"
      repeatCount="indefinite"
    />

  </path>


  <!-- ====================================== -->
  <!-- LUFFY -->
  <!-- ====================================== -->

  <image
    href="data:image/png;base64,${luffyBase64}"
    x="10"
    y="35"
    width="310"
    height="260"
    preserveAspectRatio="xMidYMid meet"
  />


  <!-- ====================================== -->
  <!-- PUNHO ANIMADO -->
  <!-- ====================================== -->

  ${
    attackPoints.length
      ? `

  <g
    filter="url(#redGlow)"
  >

    <!-- aura -->

    <circle
      r="19"
      fill="#ff1744"
      opacity="0.25"
    />


    <!-- punho abstrato -->

    <circle
      r="14"
      fill="#08090c"
      stroke="#ff1744"
      stroke-width="5"
    />


    <!-- reflexo -->

    <circle
      r="5"
      fill="#ff8fbd"
    />


    <circle
      r="2"
      fill="#ffffff"
    />


    <animateMotion
      dur="14s"
      repeatCount="indefinite"
      path="${snakePath}"
      keyPoints="0;1;1;0"
      keyTimes="0;0.80;0.94;1"
      calcMode="linear"
    />

  </g>

  `
      : ""
  }


  <!-- ====================================== -->
  <!-- EXPLOSÃO / IMPACTO -->
  <!-- ====================================== -->

  ${
    attackPoints.length
      ? `

  <circle
    r="22"
    fill="url(#impact)"
    filter="url(#impactGlow)"
    opacity="0"
  >

    <animateMotion
      dur="14s"
      repeatCount="indefinite"
      path="${snakePath}"
      keyPoints="0;1;1;0"
      keyTimes="0;0.80;0.94;1"
      calcMode="linear"
    />


    <animate
      attributeName="opacity"
      values="
        0;
        0.85;
        0.15;
        0.9;
        0
      "
      dur="0.45s"
      repeatCount="indefinite"
    />


    <animate
      attributeName="r"
      values="
        8;
        26;
        14
      "
      dur="0.45s"
      repeatCount="indefinite"
    />

  </circle>

  `
      : ""
  }


  <!-- ====================================== -->
  <!-- TEXTO INFERIOR -->
  <!-- ====================================== -->

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
    `Quadrados ativos: ${attackPoints.length}`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
