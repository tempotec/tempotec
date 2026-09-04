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
  Spritesheet atual:

  FRAME 1 | FRAME 2
  --------+--------
  FRAME 3 | FRAME 4

  O frame 4 sera usado como pose congelada do soco.
*/
const SPRITE_COLUMNS = 2;
const SPRITE_ROWS = 2;
const PUNCH_FRAME_INDEX = 3;

if (!TOKEN) {
  console.error("GITHUB_TOKEN nao encontrado.");
  process.exit(1);
}

if (!fs.existsSync(LUFFY_SPRITESHEET_FILE)) {
  console.error(
    `Spritesheet nao encontrado: ${LUFFY_SPRITESHEET_FILE}`
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

/* =========================================================
   HELPERS
========================================================= */

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function getPngSize(buffer) {
  if (!buffer || buffer.length < 24) {
    throw new Error("PNG invalido ou incompleto.");
  }

  const signature = buffer.subarray(0, 8).toString("hex");

  if (signature !== "89504e470d0a1a0a") {
    throw new Error("O arquivo do Luffy nao parece ser um PNG valido.");
  }

  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function buildSnakePath({
  armOrigin,
  startX,
  endX,
  topY,
  rows,
  rowStep,
}) {
  let d = `M ${armOrigin.x} ${armOrigin.y}`;

  d += `
    C
      ${armOrigin.x + 35} ${armOrigin.y - 5},
      ${startX - 35} ${topY},
      ${startX} ${topY}
  `;

  for (let row = 0; row < rows; row++) {
    const y = topY + row * rowStep;
    const goingRight = row % 2 === 0;
    const destinationX = goingRight ? endX : startX;

    d += ` L ${destinationX} ${y} `;

    if (row < rows - 1) {
      const nextY = y + rowStep;
      const outsideX = goingRight ? endX + 24 : startX - 24;

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

function getSnakeOrder(weekIndex, weekday, weekCount) {
  if (weekday % 2 === 0) {
    return weekday * weekCount + weekIndex;
  }

  return weekday * weekCount + (weekCount - 1 - weekIndex);
}

function frameOpacityAnimation(frameIndex, animationDuration) {
  /*
    Timeline:

    0.00 - 0.05  frame 1
    0.05 - 0.10  frame 2
    0.10 - 0.15  frame 3
    0.15 - 0.85  frame 4 congelado durante todo o golpe
    0.85 - 0.90  frame 3
    0.90 - 0.95  frame 2
    0.95 - 1.00  frame 1
  */

  const rangesByFrame = {
    0: [
      [0.0, 0.05],
      [0.95, 1.0],
    ],
    1: [
      [0.05, 0.1],
      [0.9, 0.95],
    ],
    2: [
      [0.1, 0.15],
      [0.85, 0.9],
    ],
    3: [[0.15, 0.85]],
  };

  const ranges = rangesByFrame[frameIndex] || [];
  const epsilon = 0.0001;
  const points = [{ time: 0, value: 0 }];

  for (const [start, end] of ranges) {
    if (start > 0) {
      points.push({ time: Math.max(0, start - epsilon), value: 0 });
    }

    points.push({ time: start, value: 1 });
    points.push({ time: end, value: 1 });

    if (end < 1) {
      points.push({ time: Math.min(1, end + epsilon), value: 0 });
    }
  }

  points.push({ time: 1, value: 0 });
  points.sort((a, b) => a.time - b.time);

  const cleaned = [];

  for (const point of points) {
    const last = cleaned[cleaned.length - 1];

    if (last && Math.abs(last.time - point.time) < 0.000001) {
      last.value = point.value;
    } else {
      cleaned.push({ ...point });
    }
  }

  return `
    <animate
      attributeName="opacity"
      values="${cleaned.map((item) => item.value).join(";")}"
      keyTimes="${cleaned.map((item) => item.time.toFixed(4)).join(";")}"
      dur="${animationDuration}s"
      calcMode="discrete"
      repeatCount="indefinite"
    />
  `;
}

function buildLuffyFrames({
  spriteWidth,
  spriteHeight,
  animationDuration,
}) {
  const frameWidth = spriteWidth / SPRITE_COLUMNS;
  const frameHeight = spriteHeight / SPRITE_ROWS;

  const displayX = 10;
  const displayY = 35;
  const displayWidth = 300;
  const displayHeight = 250;

  const frames = [];

  for (
    let frameIndex = 0;
    frameIndex < SPRITE_COLUMNS * SPRITE_ROWS;
    frameIndex++
  ) {
    const column = frameIndex % SPRITE_COLUMNS;
    const row = Math.floor(frameIndex / SPRITE_COLUMNS);

    const sourceX = column * frameWidth;
    const sourceY = row * frameHeight;

    frames.push(`
      <!-- LUFFY FRAME ${frameIndex + 1} -->
      <svg
        x="${displayX}"
        y="${displayY}"
        width="${displayWidth}"
        height="${displayHeight}"
        viewBox="${sourceX} ${sourceY} ${frameWidth} ${frameHeight}"
        preserveAspectRatio="xMidYMid meet"
        overflow="hidden"
        opacity="0"
      >
        <use href="#luffySpriteSheet"/>
        ${frameOpacityAnimation(frameIndex, animationDuration)}
      </svg>
    `);
  }

  return frames.join("\n");
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

  const result = await graphqlRequest(query);

  if (!result.data || !result.data.user) {
    throw new Error(`Usuario do GitHub nao encontrado: ${USERNAME}`);
  }

  const calendar =
    result.data.user.contributionsCollection.contributionCalendar;

  const weeks = calendar.weeks;
  const total = calendar.totalContributions;

  /* =======================================================
     SPRITESHEET
  ======================================================= */

  const luffyBuffer = fs.readFileSync(LUFFY_SPRITESHEET_FILE);
  const luffyBase64 = luffyBuffer.toString("base64");
  const spriteSize = getPngSize(luffyBuffer);

  const frameWidth = spriteSize.width / SPRITE_COLUMNS;
  const frameHeight = spriteSize.height / SPRITE_ROWS;

  console.log(`Spritesheet: ${spriteSize.width}x${spriteSize.height}`);
  console.log(`Grade do spritesheet: ${SPRITE_COLUMNS}x${SPRITE_ROWS}`);
  console.log(`Cada frame: ${frameWidth}x${frameHeight}`);
  console.log(`Frame congelado do soco: ${PUNCH_FRAME_INDEX + 1}`);

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

  const weekCount = weeks.length;
  const gridWidth = (weekCount - 1) * step + cell;
  const gridEndX = gridX + gridWidth;

  const scanStartX = gridX + cell / 2;
  const scanEndX = gridEndX - cell / 2;
  const scanTopY = gridY + cell / 2;

  const armOrigin = {
    x: 286,
    y: 157,
  };

  /* =======================================================
     TIMELINE
  ======================================================= */

  const animationDuration = 20;

  const punchStart = 0.15;
  const travelEnd = 0.72;
  const holdEnd = 0.75;
  const returnEnd = 0.85;

  const levelColors = {
    NONE: "#161b22",
    FIRST_QUARTILE: "#0e4429",
    SECOND_QUARTILE: "#006d32",
    THIRD_QUARTILE: "#26a641",
    FOURTH_QUARTILE: "#39d353",
  };

  /* =======================================================
     CONTRIBUTIONS
  ======================================================= */

  const cells = [];
  const hitEffects = [];
  const totalScanSlots = weekCount * 7;

  weeks.forEach((week, weekIndex) => {
    week.contributionDays.forEach((day) => {
      const x = gridX + weekIndex * step;
      const y = gridY + day.weekday * step;
      const centerX = x + cell / 2;
      const centerY = y + cell / 2;

      const color =
        levelColors[day.contributionLevel] || levelColors.NONE;

      cells.push(`
        <rect
          x="${x}"
          y="${y}"
          width="${cell}"
          height="${cell}"
          rx="2"
          fill="${color}"
        >
          <title>${escapeXml(day.date)}: ${day.contributionCount} contribuicoes</title>
        </rect>
      `);

      if (day.contributionCount > 0) {
        const order = getSnakeOrder(
          weekIndex,
          day.weekday,
          weekCount
        );

        const normalized =
          order / Math.max(1, totalScanSlots - 1);

        const impactTime =
          punchStart + normalized * (travelEnd - punchStart);

        const before = Math.max(0, impactTime - 0.006);
        const after = Math.min(1, impactTime + 0.012);

        hitEffects.push(`
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
    });
  });

  /* =======================================================
     PATH
  ======================================================= */

  const snakePath = buildSnakePath({
    armOrigin,
    startX: scanStartX,
    endX: scanEndX,
    topY: scanTopY,
    rows: 7,
    rowStep: step,
  });

  const luffyFramesSvg = buildLuffyFrames({
    spriteWidth: spriteSize.width,
    spriteHeight: spriteSize.height,
    animationDuration,
  });

  const armAnimation = `
    <animate
      attributeName="stroke-dasharray"
      values="0 1;0 1;1 0;1 0;0 1;0 1"
      keyTimes="0;${punchStart};${travelEnd};${holdEnd};${returnEnd};1"
      dur="${animationDuration}s"
      repeatCount="indefinite"
    />
  `;

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
    <!--
      A imagem pesada existe UMA unica vez no SVG.
      Os quatro frames abaixo apenas reutilizam essa imagem com <use>.
    -->
    <image
      id="luffySpriteSheet"
      href="data:image/png;base64,${luffyBase64}"
      x="0"
      y="0"
      width="${spriteSize.width}"
      height="${spriteSize.height}"
      preserveAspectRatio="none"
    />

    <filter
      id="redGlow"
      x="-100%"
      y="-100%"
      width="300%"
      height="300%"
    >
      <feGaussianBlur stdDeviation="5" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>

    <filter
      id="impactGlow"
      x="-300%"
      y="-300%"
      width="700%"
      height="700%"
    >
      <feGaussianBlur stdDeviation="7" result="blur"/>
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
      <feGaussianBlur stdDeviation="5" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>

    <radialGradient id="fistAura">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="20%" stop-color="#ff9abd"/>
      <stop offset="55%" stop-color="#ff1744"/>
      <stop offset="100%" stop-color="#ff1744" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <!-- BACKGROUND -->
  <rect
    width="100%"
    height="100%"
    rx="14"
    fill="#0d1117"
  />

  <!-- HEADER -->
  <text
    x="330"
    y="35"
    fill="#f0f6fc"
    font-family="monospace"
    font-size="19"
    font-weight="bold"
  >TEMPOTEC</text>

  <text
    x="330"
    y="55"
    fill="#8b949e"
    font-family="monospace"
    font-size="11"
  >${total} contributions • Gear 4 Snake-Man</text>

  <!-- GRID -->
  <g id="contribution-grid">
    ${cells.join("\n")}
  </g>

  <!-- IMPACTS -->
  <g id="hit-effects">
    ${hitEffects.join("\n")}
  </g>

  <!-- BRACO: fica atras do Luffy para esconder a origem -->
  <path
    d="${snakePath}"
    fill="none"
    stroke="#ff1744"
    stroke-width="30"
    stroke-linecap="round"
    stroke-linejoin="round"
    opacity="0.15"
    filter="url(#redGlow)"
    pathLength="1"
  >${armAnimation}</path>

  <path
    d="${snakePath}"
    fill="none"
    stroke="#ff1744"
    stroke-width="20"
    stroke-linecap="round"
    stroke-linejoin="round"
    filter="url(#redGlow)"
    pathLength="1"
  >${armAnimation}</path>

  <path
    d="${snakePath}"
    fill="none"
    stroke="#050609"
    stroke-width="14"
    stroke-linecap="round"
    stroke-linejoin="round"
    pathLength="1"
  >${armAnimation}</path>

  <path
    d="${snakePath}"
    fill="none"
    stroke="#ff8fb7"
    stroke-width="3"
    stroke-linecap="round"
    stroke-linejoin="round"
    opacity="0.9"
    pathLength="1"
  >${armAnimation}</path>

  <!-- LUFFY: somente UM frame aparece por vez -->
  <g id="luffy-frame-animation">
    ${luffyFramesSvg}
  </g>

  <!-- PUNHO -->
  <g
    id="snake-fist"
    opacity="0"
    filter="url(#redGlow)"
  >
    <circle r="27" fill="#ff1744" opacity="0.24"/>

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

    <path
      d="
        M -9 -5 Q -7 -11 -3 -7
        M -2 -8 Q 0 -14 4 -8
        M 5 -8 Q 8 -13 10 -6
      "
      fill="none"
      stroke="#ff8fb7"
      stroke-width="2.2"
      stroke-linecap="round"
    />

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

    <animate
      attributeName="opacity"
      values="0;0;1;1;0;0"
      keyTimes="0;${punchStart};${punchStart + 0.002};${returnEnd - 0.002};${returnEnd};1"
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

  <!-- AURA DO PUNHO -->
  <circle
    r="30"
    fill="url(#fistAura)"
    opacity="0"
    filter="url(#impactGlow)"
  >
    <animate
      attributeName="opacity"
      values="0;0;0.45;0.45;0;0"
      keyTimes="0;${punchStart};${punchStart + 0.01};${returnEnd - 0.01};${returnEnd};1"
      dur="${animationDuration}s"
      repeatCount="indefinite"
    />

    <animate
      attributeName="r"
      values="24;31;25;34;24"
      dur="0.45s"
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
  </circle>

  <!-- FOOTER -->
  <text
    x="330"
    y="260"
    fill="#39d353"
    font-family="monospace"
    font-size="13"
  >$ git commit -m "keep going"</text>

  <text
    x="330"
    y="285"
    fill="#8b949e"
    font-family="monospace"
    font-size="11"
  >Snake-Man is hunting every contribution...</text>
</svg>
`;

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, svg, "utf8");

  console.log("");
  console.log("========================================");
  console.log(" SNAKE-MAN FRAME-BY-FRAME");
  console.log("========================================");
  console.log(`SVG criado: ${OUTPUT_FILE}`);
  console.log(`Contribuicoes: ${total}`);
  console.log(`Semanas: ${weekCount}`);
  console.log(`Impactos: ${hitEffects.length}`);
  console.log(`Spritesheet: ${spriteSize.width}x${spriteSize.height}`);
  console.log(`Frame congelado: ${PUNCH_FRAME_INDEX + 1}`);
  console.log("Spritesheet embutido apenas uma vez no SVG.");
  console.log("========================================");
}

main().catch((error) => {
  console.error("");
  console.error("Erro ao gerar animacao:");
  console.error(error);
  process.exit(1);
});
