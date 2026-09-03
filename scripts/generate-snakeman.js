const fs = require("fs");
const path = require("path");
const https = require("https");

const USERNAME = "tempotec";
const TOKEN = process.env.GITHUB_TOKEN;

const OUTPUT_DIR = path.join(process.cwd(), "dist");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "snakeman-contributions.svg");
const LUFFY_FILE = path.join(process.cwd(), "assets", "luffy-snakeman.png");

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
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
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

  const calendar =
    result.data.user.contributionsCollection.contributionCalendar;

  const weeks = calendar.weeks;
  const total = calendar.totalContributions;

  const cell = 11;
  const gap = 3;
  const step = cell + gap;

  /*
    Mais espaço à esquerda para o Luffy.
  */
  const gridX = 330;
  const gridY = 82;

  /*
    Canvas maior para ocupar melhor o README.
  */
  const width = 1200;
  const height = 320;

  const levelColors = {
    NONE: "#161b22",
    FIRST_QUARTILE: "#0e4429",
    SECOND_QUARTILE: "#006d32",
    THIRD_QUARTILE: "#26a641",
    FOURTH_QUARTILE: "#39d353",
  };

  const luffyBase64 = fs.readFileSync(LUFFY_FILE).toString("base64");

  const cells = [];
  const activePoints = [];

  weeks.forEach((week, weekIndex) => {
    week.contributionDays.forEach((day) => {
      const x = gridX + weekIndex * step;
      const y = gridY + day.weekday * step;

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
          <title>${escapeXml(day.date)}: ${day.contributionCount} contribuições</title>
        </rect>
      `);

      if (day.contributionCount > 0) {
        activePoints.push({
          x: x + cell / 2,
          y: y + cell / 2,
          date: day.date,
        });
      }
    });
  });

  /*
    O Snakeman percorre os quadrados com contribuição.
    A ordem segue o calendário do GitHub.
  */
  const pathPoints = activePoints
    .map((point) => `${point.x},${point.y}`)
    .join(" ");

  const svg = `
<svg
  xmlns="http://www.w3.org/2000/svg"
  xmlns:xlink="http://www.w3.org/1999/xlink"
  width="${width}"
  height="${height}"
  viewBox="0 0 ${width} ${height}"
>

  <defs>
    <filter
      id="redGlow"
      x="-50%"
      y="-50%"
      width="200%"
      height="200%"
    >
      <feGaussianBlur
        stdDeviation="4"
        result="blur"
      />

      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>

    <filter
      id="greenGlow"
      x="-100%"
      y="-100%"
      width="300%"
      height="300%"
    >
      <feGaussianBlur
        stdDeviation="4"
        result="blur"
      />

      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>

    <radialGradient id="impact">
      <stop
        offset="0%"
        stop-color="#ffffff"
      />

      <stop
        offset="35%"
        stop-color="#ff1744"
      />

      <stop
        offset="100%"
        stop-color="#ff1744"
        stop-opacity="0"
      />
    </radialGradient>
  </defs>

  <!-- FUNDO -->

  <rect
    width="100%"
    height="100%"
    rx="14"
    fill="#0d1117"
  />

  <!-- TITULO -->

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

  <!-- GRID -->

  <g>
    ${cells.join("\n")}
  </g>

  <!-- CAMINHO DO BRAÇO -->

  <polyline
    points="${pathPoints}"
    fill="none"
    stroke="#ff1744"
    stroke-width="7"
    stroke-linecap="round"
    stroke-linejoin="round"
    opacity="0.22"
    filter="url(#redGlow)"
  />

  <polyline
    points="${pathPoints}"
    fill="none"
    stroke="#111111"
    stroke-width="4"
    stroke-linecap="round"
    stroke-linejoin="round"
    stroke-dasharray="1 10000"
    filter="url(#redGlow)"
  >
    <animate
      attributeName="stroke-dasharray"
      values="1 10000;10000 0"
      dur="14s"
      repeatCount="indefinite"
    />
  </polyline>

  <!-- LUFFY GEAR 4 SNAKE-MAN -->

  <image
    href="data:image/png;base64,${luffyBase64}"
    x="10"
    y="35"
    width="310"
    height="260"
    preserveAspectRatio="xMidYMid meet"
  />

  <!-- PUNHO / IMPACTO -->

  ${
    activePoints.length
      ? `
  <g filter="url(#redGlow)">

    <circle
      r="13"
      fill="#090909"
      stroke="#ff1744"
      stroke-width="4"
    />

    <circle
      r="4"
      fill="#ffffff"
    />

    <animateMotion
      dur="14s"
      repeatCount="indefinite"
      path="M ${activePoints
        .map((p) => `${p.x} ${p.y}`)
        .join(" L ")}"
    />

  </g>
  `
      : ""
  }

  <!-- EXPLOSÃO -->

  ${
    activePoints.length
      ? `
  <circle
    r="18"
    fill="url(#impact)"
    opacity="0"
  >

    <animateMotion
      dur="14s"
      repeatCount="indefinite"
      path="M ${activePoints
        .map((p) => `${p.x} ${p.y}`)
        .join(" L ")}"
    />

    <animate
      attributeName="opacity"
      values="0;0.9;0"
      dur="0.35s"
      repeatCount="indefinite"
    />

    <animate
      attributeName="r"
      values="7;24;7"
      dur="0.35s"
      repeatCount="indefinite"
    />

  </circle>
  `
      : ""
  }

  <!-- TEXTO INFERIOR -->

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

  fs.mkdirSync(OUTPUT_DIR, {
    recursive: true,
  });

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
    `Quadrados ativos: ${activePoints.length}`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
