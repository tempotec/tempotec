const fs = require("fs");
const path = require("path");
const https = require("https");

const USERNAME = "tempotec";
const TOKEN = process.env.GITHUB_TOKEN;

const OUTPUT_DIR = path.join(process.cwd(), "dist");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "snakeman-contributions.svg");

const LUFFY_FILE = path.join(
  process.cwd(),
  "assets",
  "luffy-snakeman.png"
);

if (!TOKEN) {
  console.error("GITHUB_TOKEN nao encontrado.");
  process.exit(1);
}

if (!fs.existsSync(LUFFY_FILE)) {
  console.error(`Imagem do Luffy nao encontrada: ${LUFFY_FILE}`);
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
              reject(new Error("Erro na API GraphQL do GitHub."));
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
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildSnakePath({ armOrigin, startX, endX, topY, rows, rowStep }) {
  let d = `M ${armOrigin.x} ${armOrigin.y}`;

  d += ` C ${armOrigin.x + 42} ${armOrigin.y - 6}, ${startX - 34} ${topY}, ${startX} ${topY}`;

  for (let row = 0; row < rows; row++) {
    const y = topY + row * rowStep;
    const goingRight = row % 2 === 0;
    const destinationX = goingRight ? endX : startX;

    d += ` L ${destinationX} ${y}`;

    if (row < rows - 1) {
      const nextY = y + rowStep;
      const outsideX = goingRight ? endX + 15 : startX - 15;

      d += ` C ${outsideX} ${y}, ${outsideX} ${nextY}, ${destinationX} ${nextY}`;
    }
  }

  return d;
}

function getSnakeOrder(weekIndex, weekday, weekCount) {
  if (weekday % 2 === 0) {
    return weekday * weekCount + weekIndex;
  }

  return weekday * weekCount + (weekCount - 1 - weekIndex);
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

  const result = await graphqlRequest(query);

  if (!result.data || !result.data.user) {
    throw new Error(`Usuario do GitHub nao encontrado: ${USERNAME}`);
  }

  const calendar = result.data.user.contributionsCollection.contributionCalendar;
  const weeks = calendar.weeks;
  const total = calendar.totalContributions;

  const luffyBase64 = fs.readFileSync(LUFFY_FILE).toString("base64");

  const cell = 11;
  const gap = 3;
  const step = cell + gap;

  const width = 1200;
  const height = 320;

  const luffyX = 22;
  const luffyY = 42;
  const luffyWidth = 260;
  const luffyHeight = 220;

  const gridX = 340;
  const gridY = 88;

  const weekCount = weeks.length;
  const gridWidth = (weekCount - 1) * step + cell;
  const gridEndX = gridX + gridWidth;

  const scanStartX = gridX + cell / 2;
  const scanEndX = gridEndX - cell / 2;
  const scanTopY = gridY + cell / 2;

  const armOrigin = {
    x: 272,
    y: 153,
  };

  const animationDuration = 16;
  const punchStart = 0.20;
  const travelEnd = 0.70;
  const holdEnd = 0.74;
  const returnEnd = 0.86;

  const levelColors = {
    NONE: "#161b22",
    FIRST_QUARTILE: "#0e4429",
    SECOND_QUARTILE: "#006d32",
    THIRD_QUARTILE: "#26a641",
    FOURTH_QUARTILE: "#39d353",
  };

  const cells = [];
  const hitEffects = [];
  const totalScanSlots = weekCount * 7;

  weeks.forEach((week, weekIndex) => {
    week.contributionDays.forEach((day) => {
      const x = gridX + weekIndex * step;
      const y = gridY + day.weekday * step;
      const centerX = x + cell / 2;
      const centerY = y + cell / 2;
      const color = levelColors[day.contributionLevel] || levelColors.NONE;

      cells.push(`
        <rect
          x="${x}"
          y="${y}"
          width="${cell}"
          height="${cell}"
          rx="2.2"
          fill="${color}"
        >
          <title>${escapeXml(day.date)}: ${day.contributionCount} contribuicoes</title>
        </rect>
      `);

      if (day.contributionCount > 0) {
        const order = getSnakeOrder(weekIndex, day.weekday, weekCount);
        const normalized = order / Math.max(1, totalScanSlots - 1);
        const impactTime = punchStart + normalized * (travelEnd - punchStart);
        const before = Math.max(0, impactTime - 0.005);
        const after = Math.min(1, impactTime + 0.012);

        hitEffects.push(`
          <circle
            cx="${centerX}"
            cy="${centerY}"
            r="4"
            fill="#8cff66"
            opacity="0"
            filter="url(#greenGlow)"
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
              values="4;4;12;4;4"
              keyTimes="0;${before};${impactTime};${after};1"
              dur="${animationDuration}s"
              repeatCount="indefinite"
            />
          </circle>
        `);
      }
    });
  });

  const snakePath = buildSnakePath({
    armOrigin,
    startX: scanStartX,
    endX: scanEndX,
    topY: scanTopY,
    rows: 7,
    rowStep: step,
  });

  const svg = `
<svg
  xmlns="http://www.w3.org/2000/svg"
  width="${width}"
  height="${height}"
  viewBox="0 0 ${width} ${height}"
>
  <defs>
    <filter id="softRedGlow" x="-100%" y="-100%" width="300%" height="300%">
      <feGaussianBlur stdDeviation="3.2" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>

    <filter id="greenGlow" x="-300%" y="-300%" width="700%" height="700%">
      <feGaussianBlur stdDeviation="4" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>

    <radialGradient id="fistAura">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.9"/>
      <stop offset="25%" stop-color="#ff9abc" stop-opacity="0.75"/>
      <stop offset="60%" stop-color="#ff1744" stop-opacity="0.42"/>
      <stop offset="100%" stop-color="#ff1744" stop-opacity="0"/>
    </radialGradient>

    <linearGradient id="cardEdge" x1="0" x2="1">
      <stop offset="0%" stop-color="#30363d"/>
      <stop offset="100%" stop-color="#21262d"/>
    </linearGradient>
  </defs>

  <rect width="100%" height="100%" rx="16" fill="#0d1117"/>
  <rect
    x="1"
    y="1"
    width="1198"
    height="318"
    rx="15"
    fill="none"
    stroke="url(#cardEdge)"
    stroke-width="1.5"
  />

  <text
    x="340"
    y="37"
    fill="#f0f6fc"
    font-family="monospace"
    font-size="18"
    font-weight="700"
  >TEMPOTEC</text>

  <text
    x="340"
    y="57"
    fill="#8b949e"
    font-family="monospace"
    font-size="11"
  >${total} contributions • Gear 4 Snake-Man</text>

  <g id="contribution-grid">
    ${cells.join("\n")}
  </g>

  <g id="hit-effects">
    ${hitEffects.join("\n")}
  </g>

  <!-- Trail curto: acompanha o punho sem desenhar varios trilhos pelo grafico -->
  <path
    d="${snakePath}"
    fill="none"
    stroke="#ff1744"
    stroke-width="8"
    stroke-linecap="round"
    stroke-linejoin="round"
    opacity="0.72"
    filter="url(#softRedGlow)"
    pathLength="1"
    stroke-dasharray="0.075 0.925"
  >
    <animate
      attributeName="stroke-dashoffset"
      values="1;1;0.08;0.08;-0.92;-0.92"
      keyTimes="0;${punchStart};${travelEnd};${holdEnd};${returnEnd};1"
      dur="${animationDuration}s"
      calcMode="linear"
      repeatCount="indefinite"
    />
    <animate
      attributeName="opacity"
      values="0;0;0.72;0.72;0;0"
      keyTimes="0;${punchStart};${punchStart + 0.01};${returnEnd - 0.01};${returnEnd};1"
      dur="${animationDuration}s"
      repeatCount="indefinite"
    />
  </path>

  <!-- Luffy: movimento sutil no idle, congelado durante o ataque -->
  <g id="luffy">
    <animateTransform
      attributeName="transform"
      type="translate"
      values="0 0;0 -3;0 1;0 1;0 1;0 -2;0 0"
      keyTimes="0;0.07;${punchStart};${travelEnd};${returnEnd};0.94;1"
      dur="${animationDuration}s"
      calcMode="spline"
      keySplines="0.4 0 0.2 1;0.4 0 0.2 1;0 0 1 1;0 0 1 1;0.4 0 0.2 1;0.4 0 0.2 1"
      repeatCount="indefinite"
    />

    <image
      href="data:image/png;base64,${luffyBase64}"
      x="${luffyX}"
      y="${luffyY}"
      width="${luffyWidth}"
      height="${luffyHeight}"
      preserveAspectRatio="xMidYMid meet"
    />
  </g>

  <!-- Punho compacto -->
  <g id="snake-fist" opacity="0" filter="url(#softRedGlow)">
    <circle r="18" fill="url(#fistAura)"/>
    <circle r="9" fill="#08090c" stroke="#ff1744" stroke-width="3"/>
    <circle cx="3" cy="-3" r="2.2" fill="#ffb2ca"/>

    <animate
      attributeName="opacity"
      values="0;0;1;1;0;0"
      keyTimes="0;${punchStart};${punchStart + 0.006};${returnEnd - 0.006};${returnEnd};1"
      dur="${animationDuration}s"
      calcMode="discrete"
      repeatCount="indefinite"
    />

    <animateMotion
      dur="${animationDuration}s"
      repeatCount="indefinite"
      path="${snakePath}"
      keyPoints="0;0;1;1;0;0"
      keyTimes="0;${punchStart};${travelEnd};${holdEnd};${returnEnd};1"
      calcMode="linear"
    />
  </g>

  <text
    x="340"
    y="263"
    fill="#39d353"
    font-family="monospace"
    font-size="13"
  >$ git commit -m "keep going"</text>

  <text
    x="340"
    y="286"
    fill="#8b949e"
    font-family="monospace"
    font-size="11"
  >building, learning, shipping.</text>
</svg>
`;

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, svg, "utf8");

  console.log(`SVG criado: ${OUTPUT_FILE}`);
  console.log(`Contribuicoes: ${total}`);
  console.log(`Semanas: ${weekCount}`);
  console.log("Modo visual: clean single-character animation");
}

main().catch((error) => {
  console.error("Erro ao gerar animacao:");
  console.error(error);
  process.exit(1);
});
