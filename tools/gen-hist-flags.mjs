// Historical flags (1976–2026), drawn as simplified SVGs, 640x480 like flag-icons.
import fs from "fs";
const FI = (c) => fs.readFileSync(`node_modules/flag-icons/flags/4x3/${c}.svg`, "utf8");
const inner = (c) => FI(c).replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "").replace(/id="/g, `id="${c}n-`).replace(/#(\w+)-/g, (m) => m).replace(/href="#/g, `href="#${c}n-`);
const nest = (c, x, y, w, h, keep) => `<svg x="${x}" y="${y}" width="${w}" height="${h}" viewBox="0 0 640 480" preserveAspectRatio="${keep ? "xMidYMid meet" : "none"}">${inner(c)}</svg>`;
const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 640 480">${body}</svg>`;
const H = (...cols) => cols.map((c, i) => `<rect y="${(480 / cols.length) * i}" width="640" height="${480 / cols.length + 0.5}" fill="${c}"/>`).join("");
const V = (...cols) => cols.map((c, i) => `<rect x="${(640 / cols.length) * i}" width="${640 / cols.length + 0.5}" height="480" fill="${c}"/>`).join("");
const star = (cx, cy, r, fill, extra = "", rot = 0) => {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = (Math.PI / 5) * i - Math.PI / 2 + rot;
    const rr = i % 2 ? r * 0.382 : r;
    pts.push((cx + rr * Math.cos(a)).toFixed(1) + "," + (cy + rr * Math.sin(a)).toFixed(1));
  }
  return `<polygon points="${pts.join(" ")}" fill="${fill}" ${extra}/>`;
};
const rays = (cx, cy, r0, r1, n, fill) => {
  const pts = [];
  for (let i = 0; i < n * 2; i++) {
    const a = (Math.PI / n) * i - Math.PI / 2;
    const rr = i % 2 ? r0 : r1;
    pts.push((cx + rr * Math.cos(a)).toFixed(1) + "," + (cy + rr * Math.sin(a)).toFixed(1));
  }
  return `<polygon points="${pts.join(" ")}" fill="${fill}"/>`;
};
const blueEnsign = (badge) => svg(`<rect width="640" height="480" fill="#012169"/>${nest("gb", 0, 0, 320, 240)}${badge}`);
const angkor = (cx, cy, s, n, fill) => {
  // simplified temple: n towers on a base
  const w = 300 * s, base = `<rect x="${cx - w / 2}" y="${cy + 40 * s}" width="${w}" height="${30 * s}" fill="${fill}"/>`;
  let t = base;
  const xs = n === 3 ? [-0.3, 0, 0.3] : [-0.4, -0.2, 0, 0.2, 0.4];
  xs.forEach((f) => {
    const h = f === 0 ? 150 : Math.abs(f) < 0.25 ? 120 : 95;
    const x = cx + f * w, bw = 34 * s;
    t += `<polygon points="${x - bw},${cy + 40 * s} ${x - bw * 0.6},${cy + 40 * s - h * s * 0.6} ${x},${cy + 40 * s - h * s} ${x + bw * 0.6},${cy + 40 * s - h * s * 0.6} ${x + bw},${cy + 40 * s}" fill="${fill}"/>`;
  });
  return t;
};
const hammerSickle = (x, y, s, c) => `<g transform="translate(${x} ${y}) scale(${s})" fill="${c}">
  <path d="M10 46c8 10 26 12 38 4l6 6 6-6-6-6c10-14 6-34-10-44 8 12 8 26-2 36L22 16l-8 8 20 20c-10 8-20 6-24 2z"/>
  <path d="M2 56l26-26 4 4-26 26z"/></g>`;

const F = {};
// --- dissolved states ---
F.su = svg(`<rect width="640" height="480" fill="#CC0000"/>${hammerSickle(70, 70, 1.5, "#FFD700")}${star(118, 52, 16, "none", 'stroke="#FFD700" stroke-width="4"')}`);
// RSS da Ásia Central (usadas até 1992): vermelho com foice e martelo e faixas
const ssr = (stripes) => svg(`<rect width="640" height="480" fill="#CC0000"/>${stripes}${hammerSickle(70, 70, 1.5, "#FFD700")}${star(118, 52, 16, "none", 'stroke="#FFD700" stroke-width="4"')}`);
F.kz_ssr = ssr(`<rect y="330" width="640" height="55" fill="#2FA4DC"/>`);
F.tm_ssr = ssr(`<rect y="195" width="640" height="30" fill="#1E4E9C"/><rect y="255" width="640" height="30" fill="#1E4E9C"/>`);
F.kg_ssr = ssr(`<rect y="190" width="640" height="100" fill="#1E3A8C"/><rect y="220" width="640" height="40" fill="#fff"/>`);
F.tj_ssr = ssr(`<rect y="200" width="640" height="90" fill="#fff"/><rect y="290" width="640" height="45" fill="#00A651"/>`);
F.ddr = svg(H("#000", "#D00", "#FFCE00") + `<circle cx="320" cy="240" r="92" fill="none" stroke="#E8B200" stroke-width="22" stroke-dasharray="10 6"/>
  <circle cx="320" cy="240" r="70" fill="#D00"/>
  <path d="M290 280l30-90 30 90" fill="none" stroke="#FFCE00" stroke-width="10"/>
  <rect x="304" y="196" width="32" height="14" fill="#FFCE00"/><rect x="316" y="205" width="8" height="70" fill="#FFCE00"/>`);
F.yu_sfr = svg(H("#0C4076", "#fff", "#C6363C") + star(320, 240, 120, "#C6363C", 'stroke="#FCD116" stroke-width="10"'));
F.yu_fr = svg(H("#0C4076", "#fff", "#C6363C"));
F.yem_n = svg(H("#CE1126", "#fff", "#000") + star(320, 240, 52, "#009A44"));
F.yem_s = svg(H("#CE1126", "#fff", "#000") + `<polygon points="0,0 260,240 0,480" fill="#4D9BDB"/>` + star(90, 240, 44, "#CE1126"));
F.an6 = svg(`<rect width="640" height="480" fill="#fff"/><rect x="290" width="60" height="480" fill="#CF142B"/><rect y="160" width="640" height="160" fill="#00247D"/>` +
  [[-110, 0], [-55, -40], [55, -40], [110, 0], [55, 40], [-55, 40]].map(([dx, dy]) => star(320 + dx, 240 + dy, 18, "#fff")).join(""));
F.an5 = svg(`<rect width="640" height="480" fill="#fff"/><rect x="290" width="60" height="480" fill="#CF142B"/><rect y="160" width="640" height="160" fill="#00247D"/>` +
  [[-90, -20], [-40, 30], [0, -35], [40, 30], [90, -20]].map(([dx, dy]) => star(320 + dx, 240 + dy, 18, "#fff")).join(""));
F.ttpi = svg(`<rect width="640" height="480" fill="#5A9BD5"/>` + [0, 1, 2, 3, 4, 5].map((i) => { const a = (Math.PI / 3) * i - Math.PI / 2; return star(320 + 110 * Math.cos(a), 240 + 110 * Math.sin(a), 30, "#fff"); }).join(""));
F.kna_old = svg(V("#007A3D", "#FCD116", "#00529B") + `<rect x="314" y="150" width="12" height="210" fill="#000"/><path d="M320 155c-40-30-80-20-110 10 30-10 70-12 110-2zm0 0c40-30 80-20 110 10-30-10-70-12-110-2zm0 0c-20-40-50-55-80-60 30 15 55 35 80 62zm0 0c20-40 50-55 80-60-30 15-55 35-80 62z" fill="#000"/>`);
// --- colonies / dependencies ---
F.brit_blue = blueEnsign(`<circle cx="480" cy="240" r="70" fill="#fff"/><circle cx="480" cy="240" r="52" fill="#3B7A3B"/>`);
F.hk_brit = blueEnsign(`<circle cx="480" cy="240" r="78" fill="#fff"/><rect x="440" y="200" width="80" height="80" fill="#2B6CB0"/><path d="M445 255q35-30 70 0" stroke="#fff" stroke-width="8" fill="none"/>`);
F.nh = svg(`<rect width="320" height="480" fill="#fff"/><rect width="107" height="480" fill="#002395"/><rect x="213" width="107" height="480" fill="#ED2939"/>${nest("gb", 320, 0, 320, 480)}`);
F.rhodesia = svg(V("#1EB53A", "#fff", "#1EB53A") + `<path d="M290 180h60v70q0 40-30 55-30-15-30-55z" fill="#1EB53A" stroke="#333" stroke-width="3"/><rect x="290" y="180" width="60" height="22" fill="#C8102E"/><circle cx="320" cy="250" r="10" fill="#FFD100"/>`);
F.za_old = svg(H("#FF7F00", "#fff", "#00247D") + nest("gb", 228, 205, 66, 50) +
  `<g>${[0, 1, 2, 3, 4, 5, 6].map((i) => `<rect x="${300 + i * 6}" y="205" width="6" height="50" fill="${i % 2 ? "#fff" : "#FF7F00"}"/>`).join("")}<rect x="318" y="205" width="6" height="16" fill="#AE1C28"/><rect x="324" y="205" width="6" height="16" fill="#fff"/><rect x="330" y="205" width="6" height="16" fill="#21468B"/></g>` +
  `<g><rect x="348" y="205" width="16" height="50" fill="#007749"/><rect x="364" y="205" width="48" height="17" fill="#AE1C28"/><rect x="364" y="222" width="48" height="16" fill="#fff"/><rect x="364" y="238" width="48" height="17" fill="#21468B"/></g>`);
F.un = svg(`<rect width="640" height="480" fill="#4B92DB"/><g fill="none" stroke="#fff" stroke-width="7"><circle cx="320" cy="225" r="85"/><circle cx="320" cy="225" r="55"/><circle cx="320" cy="225" r="25"/><path d="M320 140v170M235 225h170"/></g><path d="M230 300q-50-80 0-170M410 300q50-80 0-170" stroke="#fff" stroke-width="10" fill="none"/>`);
// --- Arab Republics federation hawk (Egypt, Libya, Syria in the 1970s) ---
F.far = svg(H("#CE1126", "#fff", "#000") + `<path d="M320 175l22 18 30-6-14 30 14 40-30-12-22 22-22-22-30 12 14-40-14-30 30 6z" fill="#C09300"/><rect x="300" y="272" width="40" height="10" fill="#C09300"/>`);
F.ly_green = svg(`<rect width="640" height="480" fill="#239E46"/>`);
// --- Africa ---
F.bj_old = svg(`<rect width="640" height="480" fill="#008751"/>` + star(110, 90, 60, "#E8112D"));
F.cg_old = svg(`<rect width="640" height="480" fill="#CE1126"/><path d="M60 150q50 50 100 0" stroke="#009543" stroke-width="12" fill="none"/>` + star(110, 55, 26, "#FCD116") + `<path d="M80 120l60-40M140 120l-60-40" stroke="#FCD116" stroke-width="9"/>`);
F.eth_plain = svg(H("#078930", "#FCDD09", "#DA121A"));
F.eth_87 = svg(H("#078930", "#FCDD09", "#DA121A") + `<circle cx="320" cy="240" r="62" fill="#FCDD09" stroke="#078930" stroke-width="8"/>` + rays(320, 240, 30, 52, 12, "#DA121A") + star(320, 240, 26, "#FCDD09"));
F.rw_old = svg(V("#E20000", "#FAD201", "#00A100") + `<path d="M285 165h48q38 0 38 38 0 28-26 35l32 77h-32l-28-72h-6v72h-26zm26 26v44h20q12 0 12-22 0-22-12-22z" fill="#000"/>`);
F.mw10 = svg(H("#CE1126", "#000", "#339E35") + `<circle cx="320" cy="240" r="58" fill="#fff"/>` + rays(320, 240, 58, 90, 45, "#fff"));
F.ls66 = svg(`<rect width="640" height="480" fill="#00209F"/><rect x="480" width="80" height="480" fill="#009543"/><rect x="560" width="80" height="480" fill="#CE1126"/><path d="M180 300l60-130 60 130zM220 210q20-30 40 0" fill="#fff"/><rect x="170" y="296" width="140" height="14" rx="7" fill="#fff"/>`);
F.ls87 = svg(`<rect width="640" height="480" fill="#009543"/><polygon points="0,0 640,0 0,480" fill="#00209F"/><polygon points="0,0 470,0 0,352" fill="#fff"/><path d="M110 110q40-30 80 0v40q-40 40-80 0z" fill="#8B4513"/><path d="M100 80l110 110M210 80L100 190" stroke="#8B4513" stroke-width="6"/>`);
// Comores 1978–2001: verde, crescente no centro com as 4 estrelas em linha entre as pontas (d = para onde abre o crescente)
const kmMoon = (dx, dy) => {
  const L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L;
  return `<circle cx="320" cy="240" r="120" fill="#fff"/><circle cx="${320 + ux * 45}" cy="${240 + uy * 45}" r="108" fill="#009A44"/>` +
    [-1.5, -0.5, 0.5, 1.5].map((k) => star(320 + ux * 70 - uy * k * 42, 240 + uy * 70 + ux * k * 42, 16, "#fff")).join("");
};
F.km78 = svg(`<rect width="640" height="480" fill="#009A44"/>` + kmMoon(1, 1));
F.km92 = svg(`<rect width="640" height="480" fill="#009A44"/>` + kmMoon(0, -1));
F.km96 = svg(`<rect width="640" height="480" fill="#009A44"/>` + kmMoon(1, 0) + `<g font-family="DejaVu Sans" font-weight="bold" fill="#fff" font-size="54" text-anchor="middle"><text x="110" y="430">محمد</text><text x="540" y="90">الله</text></g>`);
// Afeganistão 1996–1997: bandeira branca lisa do Talibã
F.af96 = svg(`<rect width="640" height="480" fill="#fff"/>`);
F.mr_old = svg(`<rect width="640" height="480" fill="#006233"/><path d="M200 220a120 120 0 0 0 240 0 132 132 0 0 1-240 0" fill="#FFC400"/>` + star(320, 170, 48, "#FFC400"));
F.cv_old = svg(`<rect width="640" height="480" fill="#009E49"/><rect width="640" height="240" fill="#F7D116"/><rect width="220" height="480" fill="#CE1126"/><path d="M50 250q60 90 120 0" stroke="#F7D116" stroke-width="12" fill="none"/>` + star(110, 230, 46, "#000"));
F.zaire = svg(`<rect width="640" height="480" fill="#00A651"/><circle cx="320" cy="240" r="130" fill="#FDD100"/><path d="M265 330l60-120 22 12-60 120z" fill="#7B4A12"/><path d="M325 205q-25-40 10-80 10 40 30 50-10 25-40 30z" fill="#ED1C24"/>`);
F.cd97 = svg(`<rect width="640" height="480" fill="#007FFF"/>` + star(320, 240, 120, "#F7D618") + [0, 1, 2, 3, 4, 5].map((i) => star(60, 50 + i * 76, 26, "#F7D618")).join(""));
F.hv = svg(H("#000", "#fff", "#CE1126"));
// Seychelles 1976–1977: aspa branca, triângulos vermelhos em cima e embaixo, azuis nas laterais
F.syc76 = svg(`<rect width="640" height="480" fill="#0033A0"/><path d="M0 0H640L320 240zM0 480H640L320 240z" fill="#D62828"/><path d="M0 0L640 480M640 0L0 480" stroke="#fff" stroke-width="40"/>`);
F.syc77 = svg(`<rect width="640" height="480" fill="#007A3D"/><rect width="640" height="230" fill="#D62828"/><path d="M0 240q160-55 320 0t320 0" stroke="#fff" stroke-width="40" fill="none"/>`);
F.ht_old = svg(V("#000", "#D21034") + `<rect x="245" y="165" width="150" height="150" fill="#fff"/><rect x="316" y="205" width="8" height="80" fill="#016A16"/><circle cx="320" cy="200" r="28" fill="#016A16"/>`);
F.vct_old = svg(`<rect width="640" height="480" fill="#0072C6"/><rect x="160" width="320" height="480" fill="#FCD116"/><rect x="480" width="160" height="480" fill="#009E60"/><path d="M320 140q90 60 0 200q-90-140 0-200z" fill="#009E60"/><rect x="295" y="215" width="50" height="60" rx="8" fill="#fff" stroke="#0072C6" stroke-width="5"/>`);
// --- Americas ---
F.ve7 = svg(H("#FFCC00", "#00247D", "#CF142B") + [0, 1, 2, 3, 4, 5, 6].map((i) => { const a = Math.PI * (0.18 + (0.64 * i) / 6); return star(320 - 120 * Math.cos(a), 300 - 120 * Math.sin(a), 18, "#fff"); }).join(""));
// --- Europe ---
F.gr_cross = svg(`<rect width="640" height="480" fill="#0D5EAF"/><rect x="270" width="100" height="480" fill="#fff"/><rect y="190" width="640" height="100" fill="#fff"/>`);
F.ro_old = svg(V("#002B7F", "#FCD116", "#CE1126") + `<circle cx="320" cy="235" r="62" fill="#3C9" stroke="#C49A2C" stroke-width="12"/><path d="M270 240l50-40 50 40v20h-100z" fill="#2266AA"/>` + star(320, 180, 14, "#CE1126"));
F.bg_old = svg(H("#fff", "#00966E", "#D62612") + `<circle cx="110" cy="110" r="62" fill="none" stroke="#C49A2C" stroke-width="12"/><circle cx="110" cy="115" r="42" fill="#D62612"/><path d="M90 130l15-35 15 10 10-8-5 33z" fill="#FFD700"/>` + star(110, 52, 14, "#D62612"));
F.al_old = svg(nest("al", 0, 0, 640, 480) + star(320, 58, 30, "#E41E20", 'stroke="#FFD700" stroke-width="5"'));
F.by91 = svg(H("#fff", "#C8313E", "#fff"));
F.ge90 = svg(`<rect width="640" height="480" fill="#8B0000"/><rect width="213" height="80" fill="#000"/><rect y="80" width="213" height="80" fill="#fff"/>`);
F.ba92 = svg(`<rect width="640" height="480" fill="#fff"/><path d="M230 120h180v140q0 80-90 110-90-30-90-110z" fill="#1F4E9B"/><path d="M240 140l160 200" stroke="#fff" stroke-width="22"/>` + [[270, 175], [305, 175], [270, 220], [365, 250], [365, 295], [330, 295]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="12" fill="#FCD116"/>`).join(""));
F.mk92 = svg(`<rect width="640" height="480" fill="#D20000"/>` + rays(320, 240, 40, 170, 16, "#FFE600") + `<circle cx="320" cy="240" r="48" fill="#FFE600"/>`);
// --- Asia ---
F.ir_old = svg(H("#239F40", "#fff", "#DA0000") + rays(345, 225, 22, 40, 14, "#E0A100") + `<circle cx="345" cy="225" r="22" fill="#E0A100"/><path d="M262 276l10-30q30-8 60 0l14 30h-10l-8-14h-46l-8 14zM300 246l-4-30 14 0" fill="#C49A2C"/><path d="M250 290l60-110" stroke="#777" stroke-width="5"/>`);
F.iq63 = svg(H("#CE1126", "#fff", "#000") + [180, 320, 460].map((x) => star(x, 240, 42, "#007A3D")).join(""));
F.iq91 = svg(H("#CE1126", "#fff", "#000") + [170, 320, 470].map((x) => star(x, 240, 36, "#007A3D")).join("") +
  `<path d="M210 250q10-30 25 0t25-5M370 250q10-30 25 0t25-5" stroke="#007A3D" stroke-width="7" fill="none"/>`);
F.af74 = svg(H("#000", "#D32011", "#007A36") + `<circle cx="90" cy="80" r="44" fill="none" stroke="#FFD700" stroke-width="8"/><path d="M70 95q20-40 40 0" stroke="#FFD700" stroke-width="7" fill="none"/>`);
F.af78 = svg(`<rect width="640" height="480" fill="#C8102E"/><circle cx="110" cy="100" r="52" fill="none" stroke="#FFD700" stroke-width="10"/>` + star(110, 55, 16, "#FFD700") + `<path d="M85 115h50" stroke="#FFD700" stroke-width="8"/>`);
F.af80 = svg(H("#000", "#D32011", "#007A36") + `<circle cx="100" cy="80" r="48" fill="none" stroke="#FFD700" stroke-width="9"/>` + star(100, 42, 12, "#D32011") + `<path d="M75 95q25-35 50 0" stroke="#FFD700" stroke-width="7" fill="none"/>`);
// Afeganistão 1987–1992 (Najibullah): como a de 1980, sem a estrela vermelha
F.af87 = svg(H("#000", "#D32011", "#007A36") + `<circle cx="100" cy="80" r="48" fill="none" stroke="#FFD700" stroke-width="9"/><path d="M75 95q25-35 50 0" stroke="#FFD700" stroke-width="7" fill="none"/><rect x="85" y="105" width="30" height="10" fill="#FFD700"/>`);
F.af92 = svg(H("#007A36", "#fff", "#000") + `<circle cx="320" cy="240" r="46" fill="none" stroke="#007A36" stroke-width="7"/><path d="M296 255q24-40 48 0" stroke="#007A36" stroke-width="6" fill="none"/>`);
F.bh_old = svg(`<rect width="640" height="480" fill="#CE1126"/><path d="M0 0h170l70 30-70 30 70 30-70 30 70 30-70 30 70 30-70 30 70 30-70 30 70 30-70 30 70 30-70 30 70 30-70 30H0z" fill="#fff"/>`);
F.mm_old = svg(`<rect width="640" height="480" fill="#CE1126"/><rect width="320" height="240" fill="#00247D"/>` + rays(160, 125, 48, 60, 14, "#fff") + `<circle cx="160" cy="125" r="34" fill="#00247D"/><path d="M160 150v-45m-14 25l14-10 14 10m-14-25l-10-10" stroke="#fff" stroke-width="5" fill="none"/>` +
  Array.from({ length: 14 }, (_, i) => { const a = (2 * Math.PI * i) / 14 - Math.PI / 2; return star(160 + 92 * Math.cos(a), 125 + 92 * Math.sin(a), 11, "#fff"); }).join(""));
F.mn_old = svg(nest("mn", 0, 0, 640, 480) + star(106.7, 45, 18, "#FFD900"));
F.kh76 = svg(`<rect width="640" height="480" fill="#DA121A"/>` + angkor(320, 230, 1, 3, "#FFD700"));
F.kh79 = svg(`<rect width="640" height="480" fill="#DA121A"/>` + angkor(320, 230, 1, 5, "#FFD700"));
F.kh89 = svg(`<rect width="640" height="480" fill="#032EA1"/><rect width="640" height="240" fill="#E00025"/>` + angkor(320, 225, 0.95, 5, "#FFD700"));
// --- 1800–1975 additions ---
const elephant = (cx, cy, s, c) => `<g fill="${c}" transform="translate(${cx} ${cy}) scale(${s})"><ellipse cx="0" cy="0" rx="70" ry="42"/><rect x="-55" y="20" width="18" height="50"/><rect x="-20" y="20" width="18" height="50"/><rect x="15" y="20" width="18" height="50"/><rect x="45" y="20" width="18" height="50"/><path d="M60-20q40 0 45 30t-10 60h-14q14-30 6-55t-30-15z"/></g>`;
const crescent = (cx, cy, r, c, bg) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${c}"/><circle cx="${cx + r * 0.3}" cy="${cy}" r="${r * 0.82}" fill="${bg}"/>`;
const shield = (cx, cy, s, fill, cross) => `<g transform="translate(${cx} ${cy}) scale(${s})"><path d="M-40-50h80v55q0 40-40 55-40-15-40-55z" fill="${fill}" stroke="#244" stroke-width="4"/>${cross ? '<path d="M-8-50h16v110h-16zM-40-8h80v16h-80z" fill="#fff"/>' : ""}</g>`;
F.mm48 = svg(`<rect width="640" height="480" fill="#CE1126"/><rect width="320" height="240" fill="#00247D"/>` + star(160, 120, 48, "#fff") + [0, 1, 2, 3, 4].map((i) => { const a = (2 * Math.PI * i) / 5 - Math.PI / 2; return star(160 + 85 * Math.cos(a), 120 + 85 * Math.sin(a), 18, "#fff"); }).join(""));
F.vn_s = svg(`<rect width="640" height="480" fill="#FFDD00"/><rect y="170" width="640" height="30" fill="#DA251D"/><rect y="225" width="640" height="30" fill="#DA251D"/><rect y="280" width="640" height="30" fill="#DA251D"/>`);
F.prg = svg(`<rect width="640" height="480" fill="#0072BC"/><rect width="640" height="240" fill="#DA251D"/>` + star(320, 240, 110, "#FFDD00"));
F.lao_k = svg(`<rect width="640" height="480" fill="#CE1126"/>` + elephant(310, 250, 1.4, "#fff") + `<rect x="300" y="110" width="20" height="60" fill="#fff"/><path d="M250 120h120l-20-30h-80z" fill="#fff"/>`);
F.kh70 = svg(`<rect width="640" height="480" fill="#032EA1"/><rect width="320" height="240" fill="#E00025"/>` + angkor(160, 110, 0.5, 3, "#fff") + star(470, 60, 24, "#fff") + star(520, 60, 24, "#fff") + star(570, 60, 24, "#fff"));
// Emirado Islâmico (desde 2021): chahada em preto sobre branco
F.af21 = svg(`<rect width="640" height="480" fill="#fff"/><g font-family="DejaVu Sans" font-weight="bold" font-size="70" text-anchor="middle" direction="rtl"><text x="320" y="225">لا إله إلا الله</text><text x="320" y="305">محمد رسول الله</text></g>`);
F.af_old = svg(V("#000", "#D32011", "#007A36") + `<circle cx="320" cy="240" r="80" fill="none" stroke="#fff" stroke-width="12"/><path d="M280 260h80v20h-80zM300 200h40v60h-40z" fill="#fff"/>`);
F.iq_k = svg(H("#000", "#fff", "#007A3D") + `<polygon points="0,0 200,160 200,320 0,480" fill="#CE1126"/>` + star(70, 205, 26, "#fff") + star(70, 275, 26, "#fff"));
F.iq59 = svg(V("#000", "#fff", "#007A3D") + rays(320, 240, 60, 130, 8, "#CE1126") + `<circle cx="320" cy="240" r="46" fill="#FCD116"/>`);
F.uar = svg(H("#CE1126", "#fff", "#000") + star(230, 240, 46, "#007A3D") + star(410, 240, 46, "#007A3D"));
F.yem_k = svg(`<rect width="640" height="480" fill="#CE1126"/><path d="M180 300h280l20-12-20-12H180z" fill="#fff"/>` + [0, 1, 2, 3, 4].map((i) => { const a = Math.PI * (1.15 + 0.175 * i); return star(320 + 120 * Math.cos(a), 280 + 120 * Math.sin(a), 22, "#fff"); }).join(""));
F.om_red = svg(`<rect width="640" height="480" fill="#C8102E"/>`);
F.zanzibar = svg(`<rect width="640" height="480" fill="#C8102E"/>`);
F.ma_red = svg(`<rect width="640" height="480" fill="#C1272D"/>`);
F.eg_k = svg(`<rect width="640" height="480" fill="#0B8A3C"/>` + crescent(290, 240, 110, "#fff", "#0B8A3C") + star(330, 170, 22, "#fff") + star(360, 240, 22, "#fff") + star(330, 310, 22, "#fff"));
F.ly_k = svg(`<rect width="640" height="480" fill="#239E46"/><rect width="640" height="360" fill="#000"/><rect width="640" height="120" fill="#E70013"/>` + crescent(300, 240, 50, "#fff", "#000") + star(345, 240, 22, "#fff"));
F.ly69 = svg(H("#CE1126", "#fff", "#000"));
F.tg61 = svg(`<rect width="640" height="480" fill="#1EB53A"/><rect y="170" width="640" height="140" fill="#FCD116"/><rect y="185" width="640" height="110" fill="#000"/>`);
F.eth_emp = svg(H("#078930", "#FCDD09", "#DA121A") + `<circle cx="320" cy="240" r="58" fill="#FCDD09" stroke="#DA121A" stroke-width="6"/><path d="M290 270q10-50 40-55l12-20 6 20q16 10 14 55z" fill="#DA121A"/>`);
F.sd56 = svg(H("#0033A0", "#FCD116", "#007A3D"));
F.ca_red = svg(`<rect width="640" height="480" fill="#D52B1E"/>${nest("gb", 0, 0, 320, 240)}` + shield(470, 240, 1.2, "#fff") + `<rect x="440" y="200" width="60" height="22" fill="#D52B1E"/><path d="M445 250h50l-25 40z" fill="#2E7D32"/>`);
F.gb1707 = svg(`<rect width="640" height="480" fill="#012169"/><path d="M0 0l640 480M640 0L0 480" stroke="#fff" stroke-width="80"/><path d="M320 0v480M0 240h640" stroke="#fff" stroke-width="140"/><path d="M320 0v480M0 240h640" stroke="#C8102E" stroke-width="84"/>`);
F.at_hab = svg(H("#000", "#FCD116"));
F.pt_mon = svg(`<rect width="640" height="480" fill="#fff"/><rect width="320" height="480" fill="#1D4F9C"/>` + shield(320, 240, 1.3, "#fff") + `<path d="M285 200h70v60q0 30-35 42-35-12-35-42z" fill="#1D4F9C"/><path d="M285 150h70l-10-25h-50z" fill="#FCD116"/>`);
F.th_el = svg(`<rect width="640" height="480" fill="#C8102E"/>` + elephant(320, 240, 1.6, "#fff"));
F.two_sicilies = svg(`<rect width="640" height="480" fill="#fff"/>` + shield(320, 240, 1.4, "#E9C46A") + `<circle cx="320" cy="235" r="26" fill="#1D4F9C"/>`);
F.hanover = svg(H("#FCD116", "#fff"));
F.prussia = svg(H("#000", "#fff"));
F.papal = svg(V("#FCD116", "#fff"));
F.tuscany = svg(H("#CE1126", "#fff", "#CE1126"));
F.bavaria = svg(`<rect width="640" height="480" fill="#fff"/>` + Array.from({ length: 48 }, (_, i) => { const c = i % 8, r = Math.floor(i / 8); return (c + r) % 2 ? "" : `<polygon points="${c * 80 + 40},${r * 80} ${c * 80 + 80},${r * 80 + 40} ${c * 80 + 40},${r * 80 + 80} ${c * 80},${r * 80 + 40}" fill="#0098D4"/>`; }).join(""));
F.saxony = svg(H("#fff", "#009639"));
F.baden = svg(H("#CE1126", "#FCD116", "#CE1126"));
F.wurttemberg = svg(H("#000", "#CE1126"));
F.cn_qing = svg(`<rect width="640" height="480" fill="#FCD116"/><path d="M120 300q60-120 140-40t140-30 120 40" fill="none" stroke="#1D4F9C" stroke-width="34" stroke-linecap="round"/><circle cx="110" cy="130" r="40" fill="#CE1126"/>`);
F.fr_bourbon = svg(`<rect width="640" height="480" fill="#fff"/>`);
F.savoy = svg(`<rect width="640" height="480" fill="#CE1126"/><rect x="270" width="100" height="480" fill="#fff"/><rect y="190" width="640" height="100" fill="#fff"/>`);
F.hawaii = svg([0, 1, 2, 3, 4, 5, 6, 7].map((i) => `<rect y="${i * 60}" width="640" height="61" fill="${["#fff", "#CE1126", "#002868"][i % 3]}"/>`).join("") + nest("gb", 0, 0, 300, 240));
F.krakow = svg(H("#fff", "#1D4F9C"));
F.br_emp = svg(`<rect width="640" height="480" fill="#009B3A"/><polygon points="320,50 590,240 320,430 50,240" fill="#FEDF00"/><circle cx="320" cy="240" r="90" fill="#1D4F9C"/><circle cx="320" cy="240" r="90" fill="none" stroke="#009B3A" stroke-width="10"/><path d="M280 150h80l-10-30h-60z" fill="#C8102E"/>`);
F.it_sav = svg(V("#009246", "#fff", "#CE2B37") + `<path d="M280 170h80v70q0 40-40 55-40-15-40-55z" fill="#CE2B37" stroke="#1D4F9C" stroke-width="8"/><path d="M312 170h16v125h-16zM280 220h80v16h-80z" fill="#fff"/>`);
F.de_emp = svg(H("#000", "#fff", "#DD0000"));
F.ofs = svg([0, 1, 2, 3, 4, 5, 6].map((i) => `<rect y="${(480 / 7) * i}" width="640" height="${480 / 7 + 1}" fill="${i % 2 ? "#F7941D" : "#fff"}"/>`).join("") + `<rect width="200" height="206" fill="#fff"/><rect width="200" height="69" fill="#AE1C28"/><rect y="137" width="200" height="69" fill="#21468B"/>`);
F.transvaal = svg(`<rect width="640" height="160" fill="#AE1C28"/><rect y="160" width="640" height="160" fill="#fff"/><rect y="320" width="640" height="160" fill="#21468B"/><rect width="170" height="480" fill="#007749"/>`);
F.cn_5 = svg(H("#CE1126", "#FCD116", "#1D4F9C", "#fff", "#000"));
F.tibet = svg(`<rect width="640" height="480" fill="#1D4F9C"/>` + Array.from({ length: 12 }, (_, i) => { const a1 = Math.PI + (Math.PI / 12) * i, a2 = a1 + Math.PI / 24; return `<polygon points="320,300 ${320 + 700 * Math.cos(a1)},${300 + 700 * Math.sin(a1)} ${320 + 700 * Math.cos(a2)},${300 + 700 * Math.sin(a2)}" fill="#CE1126"/>`; }).join("") + `<polygon points="120,480 320,250 520,480" fill="#fff"/><circle cx="320" cy="250" r="55" fill="#FCD116"/>`);
F.manchukuo = svg(`<rect width="640" height="480" fill="#FCD116"/><rect width="210" height="40" fill="#CE1126"/><rect y="40" width="210" height="40" fill="#1D4F9C"/><rect y="80" width="210" height="40" fill="#fff"/><rect y="120" width="210" height="40" fill="#000"/>`);
F.es_rep = svg(H("#C8102E", "#FCD116", "#5E2B7E"));
// 1600–1800
F.england = svg(`<rect width="640" height="480" fill="#fff"/><path d="M320 0v480M0 240h640" stroke="#CE1126" stroke-width="96"/>`);
F.scotland = svg(`<rect width="640" height="480" fill="#005EB8"/><path d="M0 0l640 480M640 0L0 480" stroke="#fff" stroke-width="90"/>`);
F.es_burgundy = svg(`<rect width="640" height="480" fill="#fff"/><path d="M90 40l460 400M550 40L90 440" stroke="#C8102E" stroke-width="56" stroke-linecap="round" stroke-dasharray="70 18"/>`);
const eagle = (cx, cy, s, fill, heads = 2) => `<g transform="translate(${cx} ${cy}) scale(${s})" fill="${fill}">` +
  `<path d="M0 -40c-12 0-20 10-20 22v70l20 26 20-26v-70c0-12-8-22-20-22z"/>` +
  `<path d="M-14 -10l-110 -40 18 26-34-4 22 24-30 2 30 22-20 10 40 4 20 20 10-30zM14 -10l110 -40-18 26 34-4-22 24 30 2-30 22 20 10-40 4-20 20-10-30z"/>` +
  (heads === 2 ? `<circle cx="-22" cy="-56" r="15"/><circle cx="22" cy="-56" r="15"/><path d="M-36 -58l-14 6 14 4zM36 -58l14 6-14 4z"/>` : `<circle cx="0" cy="-58" r="17"/><path d="M14 -60l16 6-16 5z"/>`) +
  `<path d="M-30 70l-14 30h16l8-16zM30 70l14 30h-16l-8-16z"/></g>`;
F.hre = svg(`<rect width="640" height="480" fill="#FCD116"/>` + eagle(320, 240, 1.6, "#000"));
F.pl_lt = svg(`<rect width="640" height="480" fill="#DC143C"/>` + eagle(320, 245, 1.6, "#fff", 1));
F.venice = svg(`<rect width="640" height="480" fill="#B0161E"/><path d="M220 330q-10-90 60-120 10-50 60-55 50 5 50 50-10 30-40 40 60 20 80 85zM250 150l40-30 20 25z" fill="#FCD116"/><path d="M470 0h170v480h-170l60-80-60-80 60-80-60-80 60-80z" fill="#B0161E" stroke="#FCD116" stroke-width="10"/>`);
F.mughal = svg(`<rect width="640" height="480" fill="#1E7B34"/><circle cx="320" cy="240" r="110" fill="#FCD116"/><circle cx="355" cy="225" r="100" fill="#1E7B34"/>`);
F.ottoman_old = svg(`<rect width="640" height="480" fill="#C8102E"/>` + [[200, 150], [440, 150], [320, 330]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="62" fill="#fff"/><circle cx="${x + 18}" cy="${y}" r="52" fill="#C8102E"/>`).join(""));
F.nl_prince = svg(H("#F68B1F", "#fff", "#21468B"));
F.ru_tsar = svg(H("#fff", "#0039A6", "#D52B1E"));
F.sweden_old = svg(`<rect width="640" height="480" fill="#006AA7"/><rect x="180" width="90" height="480" fill="#FECC00"/><rect y="195" width="640" height="90" fill="#FECC00"/>`);
F.maratha = svg(`<rect width="640" height="480" fill="#F28C28"/>`);
F.safavid = svg(`<rect width="640" height="480" fill="#1E7B34"/><circle cx="430" cy="190" r="80" fill="#FCD116"/><path d="M140 360q40-90 140-80 60-40 120 10 40 0 60 40l-30 30q-40-30-60-20 10 40-20 60h-40q20-30 0-50-60 20-100 0l-20 50h-40z" fill="#FCD116"/>`);
F.morocco_old = svg(`<rect width="640" height="480" fill="#C1272D"/>`);
F.dk_norway = svg(`<rect width="640" height="480" fill="#C8102E"/><rect x="180" width="70" height="480" fill="#fff"/><rect y="205" width="640" height="70" fill="#fff"/>`);

// write
for (const [k, v] of Object.entries(F)) if (!v.startsWith("<svg")) throw new Error(k);
// ---- revisão 1946–1991 (conferida no Wikipedia)
// Moçambique 1975–1983: faixas diagonais verde, vermelha, preta e amarela (bordas brancas) a partir do canto superior, roda dentada branca
F.mz75 = svg(`<rect width="640" height="480" fill="#FCE100"/><path d="M0 0H640V160L0 640z" fill="#000"/><path d="M0 0H640L0 400z" fill="#fff"/><path d="M0 0H560L0 340z" fill="#D21034"/><path d="M0 0H440L0 260z" fill="#fff"/><path d="M0 0H400L0 230z" fill="#007168"/><path d="M640 200V230L0 640V610z" fill="#fff"/><circle cx="90" cy="80" r="50" fill="#fff"/>` + star(90, 80, 22, "#D21034"));
// Bangladesh 1971: verde, disco vermelho com o mapa do país em amarelo
F.bd71 = svg(`<rect width="640" height="480" fill="#006A4E"/><circle cx="290" cy="240" r="130" fill="#F42A41"/><path d="M265 150l40 10 15 40 25 20-10 50 15 45-35-10-20 30-20-50-25-20 5-60z" fill="#FFCC00"/>`);
// Ceilão 1948–1951: leão dourado em campo grená com borda dourada
F.lk48 = svg(`<rect width="640" height="480" fill="#FFB700"/><rect x="25" y="25" width="590" height="430" fill="#8D153A"/><path d="M230 330l20-90 40-40 70 0 30 40-10 50 40 40h-40l-20-30h-60l-20 30z" fill="#FFB700"/>`);
// Congo-Léopoldville 1963–1971: azul, estrela amarela no canto e faixa diagonal vermelha com bordas amarelas
F.cd63 = svg(`<rect width="640" height="480" fill="#007FFF"/><path d="M0 480L560 0H640V0L80 480z" fill="#F7D618"/><path d="M20 480L580 0H620L60 480z" fill="#CE1021"/>` + star(110, 100, 60, "#F7D618"));
// Hungria: tricolor com o brasão de Kossuth (1946–1949, 1956–1957) e com o brasão de Rákosi (1949–1956)
F.hu_k = svg(H("#CE2939", "#fff", "#477050") + `<path d="M290 190h60v50q0 35-30 45-30-10-30-45z" fill="#CE2939" stroke="#477050" stroke-width="5"/>`);
F.hu49 = svg(H("#CE2939", "#fff", "#477050") + `<circle cx="320" cy="240" r="45" fill="#477050" stroke="#E8B200" stroke-width="6"/>` + star(320, 205, 16, "#CE2939"));
// Rodésia 1964–1968: bandeira azul-clara com a Union Jack e o escudo
F.rh64 = svg(`<rect width="640" height="480" fill="#5D9BD5"/>${nest("gb", 0, 0, 320, 240)}<path d="M450 170h60v70q0 40-30 55-30-15-30-55z" fill="#1EB53A" stroke="#333" stroke-width="3"/><rect x="450" y="170" width="60" height="22" fill="#C8102E"/>`);
// Estados Unidos: 48 estrelas (1912–1959), 49 (4/jul/1959–3/jul/1960)
const usFlag = (rows, cols) => {
  let b = `<rect width="640" height="480" fill="#fff"/>`;
  for (let i = 0; i < 13; i += 2) b += `<rect y="${(480 / 13) * i}" width="640" height="${480 / 13 + 0.5}" fill="#B22234"/>`;
  b += `<rect width="290" height="${(480 / 13) * 7}" fill="#3C3B6E"/>`;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) b += star(22 + c * (250 / (cols - 1)), 20 + r * (220 / (rows - 1)), 9, "#fff");
  return svg(b);
};
F.us48 = usFlag(6, 8);
F.us49 = usFlag(7, 7);
// Brasil: 21 estrelas (1889–1960), 22 (1960–1968), 23 (1968–1992)
const brFlag = (n) => {
  let b = `<rect width="640" height="480" fill="#009B3A"/><polygon points="320,44 600,240 320,436 40,240" fill="#FEDF00"/><circle cx="320" cy="240" r="125" fill="#1D4F9C"/><path d="M198 215q130-30 245 45l-4 18q-115-70-238-40z" fill="#fff"/>`;
  for (let i = 0; i < n; i++) { const a = Math.PI * (0.15 + 0.7 * ((i * 0.618) % 1)), rr = 40 + ((i * 37) % 70); b += `<circle cx="${320 + Math.cos(a) * rr * (i % 2 ? 1 : -1)}" cy="${255 + Math.sin(a) * rr * 0.8}" r="5" fill="#fff"/>`; }
  return svg(b);
};
F.br21 = brFlag(21);
F.br22 = brFlag(22);
F.br23 = brFlag(23);
// Espanha franquista (1938–1981): vermelho-amarelo-vermelho com a águia de São João
F.es45 = svg(`<rect width="640" height="480" fill="#AA151B"/><rect y="120" width="640" height="240" fill="#F1BF00"/><path d="M220 150l-75 40 20 10-25 25 25 5-15 25 70-20zM220 150l75 40-20 10 25 25-25 5 15 25-70-20z" fill="#000"/><circle cx="220" cy="148" r="14" fill="#000"/><path d="M185 185h70v60q0 30-35 42-35-12-35-42z" fill="#000"/><path d="M193 192h54v52q0 24-27 34-27-10-27-34z" fill="#AA151B"/><path d="M193 218h54v26q0 24-27 34-27-10-27-34z" fill="#F1BF00"/>`);
// ---- bandeiras que mudaram depois de 1946 (Wikipedia)
F.gh64 = svg(H("#CE1126", "#fff", "#006B3F") + star(320, 240, 75, "#000")); // Gana 1964–1966
F.ml59 = svg(V("#14B53A", "#FCD116", "#CE1126") + `<g fill="#000"><circle cx="320" cy="170" r="22"/><rect x="305" y="195" width="30" height="80"/><path d="M270 120h14v90h-14zM356 120h14v90h-14zM270 200h100v14h-100zM290 270h14v80h-14zM336 270h14v80h-14z"/></g>`); // Mali 1959–1961 (kanaga)
F.my50 = svg([...Array(11)].map((_, i) => `<rect y="${(480 / 11) * i}" width="640" height="${480 / 11 + 0.5}" fill="${i % 2 ? "#fff" : "#CC0001"}"/>`).join("") + `<rect width="320" height="${(480 / 11) * 6}" fill="#010066"/><circle cx="125" cy="130" r="80" fill="#FC0"/><circle cx="148" cy="130" r="70" fill="#010066"/>` + star(225, 130, 50, "#FC0")); // Malaia 1950–1963 (11 listras)
F.cm60 = svg(V("#007A5E", "#CE1126", "#FCD116")); // Camarões 1957–1961
F.cm61 = svg(V("#007A5E", "#CE1126", "#FCD116") + star(106, 110, 40, "#E8B000") + star(106, 220, 40, "#E8B000")); // Camarões 1961–1975 (duas estrelas)
F.tv95 = svg(`<rect width="640" height="480" fill="#C8102E"/><rect y="150" width="640" height="180" fill="#fff"/><rect y="165" width="640" height="150" fill="#5B97D1"/><path d="M0 120L180 240 0 360z" fill="#fff"/>` + [0, 1, 2, 3, 4, 5, 6, 7].map((i) => star(300 + (i % 4) * 95, i < 4 ? 70 : 410, 22, "#fff")).join("")); // Tuvalu 1995–1997
F.bn06 = svg(`<rect width="640" height="480" fill="#F7E017"/><path d="M0 70L640 300V400L0 170z" fill="#fff"/><path d="M0 150L640 380V450L0 220z" fill="#000"/>`); // Brunei 1906–1959
F.ck73 = svg(`<rect width="640" height="480" fill="#007A3D"/>` + [...Array(15)].map((_, i) => { const a = (2 * Math.PI * i) / 15; return star(320 + 150 * Math.sin(a), 240 - 150 * Math.cos(a), 22, "#FCD116"); }).join("")); // Ilhas Cook 1974–1979
F.kg92 = svg(`<rect width="640" height="480" fill="#E8112D"/>` + [...Array(40)].map((_, i) => { const a = (2 * Math.PI * i) / 40; return `<path d="M${320 + 70 * Math.sin(a)} ${240 - 70 * Math.cos(a)}Q${320 + 115 * Math.sin(a + 0.08)} ${240 - 115 * Math.cos(a + 0.08)} ${320 + 150 * Math.sin(a)} ${240 - 150 * Math.cos(a)}" stroke="#FFEF00" stroke-width="7" fill="none"/>`; }).join("") + `<circle cx="320" cy="240" r="75" fill="#FFEF00"/><circle cx="320" cy="240" r="52" fill="#E8112D"/><path d="M272 225q48-30 96 0M272 255q48-30 96 0M300 195v90M340 195v90" stroke="#FFEF00" stroke-width="8" fill="none"/>`); // Quirguistão 1992–2023 (raios ondulados)
F.hn26 = svg(H("#0F2D69", "#fff", "#0F2D69") + [[320, 240], [220, 195], [420, 195], [220, 285], [420, 285]].map(([x, y]) => star(x, y, 26, "#0F2D69")).join("")); // Honduras: azul-marinho desde 27/jan/2026
// 1900–1934 (revisão de 1934 a 1900)
const usRows = (rows) => {
  let b = `<rect width="640" height="480" fill="#fff"/>`;
  for (let i = 0; i < 13; i += 2) b += `<rect y="${(480 / 13) * i}" width="640" height="${480 / 13 + 0.5}" fill="#B22234"/>`;
  b += `<rect width="290" height="${(480 / 13) * 7}" fill="#3C3B6E"/>`;
  rows.forEach((n, r) => { const dx = 250 / 7, x0 = 22 + (8 - n) * dx / 2; for (let c = 0; c < n; c++) b += star(x0 + c * dx, 20 + r * (220 / (rows.length - 1)), 9, "#fff"); });
  return svg(b);
};
F.us45 = usRows([8, 7, 8, 7, 8, 7]); // 4/jul/1896 a 3/jul/1908
F.us46 = usRows([8, 8, 7, 8, 7, 8]); // 4/jul/1908 a 3/jul/1912
// RSFSR 1918–1937: vermelha com "РСФСР" dourado no canto superior
F.rsfsr = svg(`<rect width="640" height="480" fill="#CC0000"/><text x="30" y="110" font-family="DejaVu Serif, serif" font-size="92" font-weight="bold" fill="#FFD700">РСФСР</text>`);
// Quedivato (1826–1914) e Sultanato do Egito (1914–1922): vermelha com três crescentes e estrelas brancos
{
  const cs = [[230, 150], [410, 150], [320, 320]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="62" fill="#fff"/><circle cx="${x + 22}" cy="${y}" r="52" fill="#E8112D"/>` + star(x + 30, y, 26, "#fff")).join("");
  F.eg_khed = svg(`<rect width="640" height="480" fill="#E8112D"/>` + cs);
}
// Sérvia (reino 1882–1918) e Montenegro 1905–1918 (bandeira civil): vermelho, azul, branco
F.rs_old = svg(H("#C6363C", "#0C4076", "#fff"));
// Tchecoslováquia 1918–1920: branco sobre vermelho
F.cz18 = svg(H("#fff", "#D7141A"));
// Hejaz 1916–1925 (bandeira da Revolta Árabe): faixas preta, verde e branca com triângulo vermelho
F.hejaz = svg(H("#000", "#007A3D", "#fff") + `<polygon points="0,0 250,240 0,480" fill="#CE1126"/>`);
// Afeganistão 1897–1927: preta com emblema branco (mesquita), simplificado
F.af_black = svg(`<rect width="640" height="480" fill="#000"/><g fill="#fff"><circle cx="320" cy="240" r="105" fill="none" stroke="#fff" stroke-width="10"/><rect x="270" y="230" width="100" height="60"/><path d="M285 230q35-60 70 0z"/><rect x="250" y="200" width="12" height="90"/><rect x="378" y="200" width="12" height="90"/></g>`);
// União Sul-Africana 1910–1928: Red Ensign com o escudo sul-africano num disco branco (simplificado)
F.za_red = svg(`<rect width="640" height="480" fill="#C8102E"/>${nest("gb", 0, 0, 320, 240)}<circle cx="470" cy="300" r="80" fill="#fff"/>` + shield(470, 300, 1.1, "#7A9A3A"));
// Espanha nacionalista 1936–1938: bicolor vermelho-amarelo-vermelho (decreto de 29/ago/1936)
F.es36 = svg(`<rect width="640" height="480" fill="#AA151B"/><rect y="120" width="640" height="240" fill="#F1BF00"/>`);
// Alemanha 1935–1945: vermelha com disco branco e suástica preta inclinada 45°
{
  const c = 40, o = (x, y, w, h) => `<rect x="${320 + (x - 2.5) * c}" y="${240 + (y - 2.5) * c}" width="${w * c}" height="${h * c}"/>`;
  F.de_nazi = svg(`<rect width="640" height="480" fill="#DD0000"/><circle cx="320" cy="240" r="170" fill="#fff"/><g fill="#000" transform="rotate(45 320 240)">` +
    o(2, 0, 1, 5) + o(0, 2, 5, 1) + o(3, 0, 2, 1) + o(4, 3, 1, 2) + o(0, 4, 2, 1) + o(0, 0, 1, 2) + `</g>`);
}
// Comores 1975–1978 (Ali Soilih): 2/3 vermelho sobre 1/3 verde, crescente branco com quatro estrelas em losango junto à tralha (Wikipedia + FOTW km_1975)
F.km75 = svg(`<rect width="640" height="480" fill="#C8102E"/><rect y="320" width="640" height="160" fill="#00A651"/><circle cx="150" cy="150" r="95" fill="#fff"/><circle cx="185" cy="120" r="88" fill="#C8102E"/>` +
  star(215, 115, 17, "#fff") + star(250, 150, 17, "#fff") + star(215, 185, 17, "#fff") + star(180, 150, 17, "#fff"));
// Estado Livre do Congo 1885–1908: azul com estrela amarela de cinco pontas
F.cfs = svg(`<rect width="640" height="480" fill="#0B4EA2"/>` + star(320, 240, 120, "#FFD100"));
// Kuwait: 1914–1920 vermelha com "Kuwait" em árabe; 1921–1961 com a shahada acima (garra de 1940 não desenhada)
F.kw14 = svg(`<rect width="640" height="480" fill="#CE1126"/><text x="320" y="300" font-family="DejaVu Sans" font-size="170" fill="#fff" text-anchor="middle">كويت</text>`);
F.kw21 = svg(`<rect width="640" height="480" fill="#CE1126"/><text x="320" y="190" font-family="DejaVu Sans" font-size="46" fill="#fff" text-anchor="middle">لا إله إلا الله محمد رسول الله</text><text x="320" y="370" font-family="DejaVu Sans" font-size="140" fill="#fff" text-anchor="middle">كويت</text>`);
// Estados da Trégua: bandeira do tratado de 1820 (vermelho com borda branca)
F.trucial = svg(`<rect width="640" height="480" fill="#fff"/><rect x="110" y="100" width="420" height="280" fill="#CE1126"/>`);
// Brunei até 1906: amarela lisa
F.bn_y = svg(`<rect width="640" height="480" fill="#F7E017"/>`);
// Butão 1949–1968: amarelo e vermelho na diagonal com o dragão (verde até 1955, branco depois); dragão do desenho atual
const btDragon = (red, dragon) => FI("bt").replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "").replace(/id="/g, 'id="bt' + dragon.slice(1) + '-').replace(/href="#/g, 'href="#bt' + dragon.slice(1) + '-')
  .replace(/#ff4e12/gi, red).replace(/#fff(fff)?\b/gi, dragon);
F.bt49 = svg(btDragon("#D2232A", "#2E8B3A"));
F.bt56 = svg(btDragon("#D2232A", "#fff"));
// Mongólia 1924–1939: vermelha com o soyombo no centro (soyombo do desenho atual)
F.mn24 = svg(`<rect width="640" height="480" fill="#DA2032"/><svg x="213.3" y="0" width="213.3" height="480" viewBox="0 0 213.3 480" preserveAspectRatio="none"><g fill="#FFD900">${inner("mn")}</g></svg>`);
// Etiópia 1897–1913: tricolor vermelho, amarelo e verde (a letra de Menelik no amarelo não é desenhada)
F.eth97 = svg(H("#DA121A", "#FCDD09", "#078930"));
// Eslováquia 1939–45: tricolor branca, azul e vermelha
F.sk39 = svg(H("#fff", "#0B4EA2", "#EE1C25"));
// Croácia NDH 1941–45: tricolor com o escudo xadrez no centro e o "U" no canto
F.hr41 = svg(H("#FF0000", "#fff", "#171796") + `<rect x="283" y="168" width="74" height="74" fill="#fff" stroke="#171796" stroke-width="4"/><rect x="285" y="170" width="14" height="14" fill="#E30A17"/><rect x="299" y="170" width="14" height="14" fill="#fff"/><rect x="313" y="170" width="14" height="14" fill="#E30A17"/><rect x="327" y="170" width="14" height="14" fill="#fff"/><rect x="341" y="170" width="14" height="14" fill="#E30A17"/><rect x="285" y="184" width="14" height="14" fill="#fff"/><rect x="299" y="184" width="14" height="14" fill="#E30A17"/><rect x="313" y="184" width="14" height="14" fill="#fff"/><rect x="327" y="184" width="14" height="14" fill="#E30A17"/><rect x="341" y="184" width="14" height="14" fill="#fff"/><rect x="285" y="198" width="14" height="14" fill="#E30A17"/><rect x="299" y="198" width="14" height="14" fill="#fff"/><rect x="313" y="198" width="14" height="14" fill="#E30A17"/><rect x="327" y="198" width="14" height="14" fill="#fff"/><rect x="341" y="198" width="14" height="14" fill="#E30A17"/><rect x="285" y="212" width="14" height="14" fill="#fff"/><rect x="299" y="212" width="14" height="14" fill="#E30A17"/><rect x="313" y="212" width="14" height="14" fill="#fff"/><rect x="327" y="212" width="14" height="14" fill="#E30A17"/><rect x="341" y="212" width="14" height="14" fill="#fff"/><rect x="285" y="226" width="14" height="14" fill="#E30A17"/><rect x="299" y="226" width="14" height="14" fill="#fff"/><rect x="313" y="226" width="14" height="14" fill="#E30A17"/><rect x="327" y="226" width="14" height="14" fill="#fff"/><rect x="341" y="226" width="14" height="14" fill="#E30A17"/><rect x="30" y="20" width="110" height="120" fill="#fff"/><text x="85" y="128" font-family="DejaVu Sans" font-weight="bold" font-size="130" fill="#171796" text-anchor="middle">U</text>`);
// Hatay 1938: bandeira turca com estrela vermelha dentro da branca
F.hatay = svg(`<rect width="640" height="480" fill="#E30A17"/><circle cx="240" cy="240" r="120" fill="#fff"/><circle cx="270" cy="240" r="96" fill="#E30A17"/>${star(390, 240, 75, "#fff")}${star(390, 240, 50, "#E30A17")}`);
// Estado da Birmânia 1943–45: amarela, verde e vermelha com pavão num disco branco (simplificado)
F.mm43 = svg(H("#FECB00", "#34B233", "#EA2839") + `<circle cx="320" cy="240" r="110" fill="#fff"/><ellipse cx="320" cy="285" rx="70" ry="35" fill="#34B233"/><ellipse cx="320" cy="250" rx="28" ry="45" fill="#1E4FA0"/><circle cx="320" cy="190" r="18" fill="#1E4FA0"/>`);
// Tuva 1941–43: vermelha com "TAR" (1941–42) e "ТАР" (1943) em dourado no canto
F.tuva41 = svg(`<rect width="640" height="480" fill="#D52B1E"/><text x="40" y="130" font-family="DejaVu Sans" font-weight="bold" font-size="110" fill="#FFD700">TAR</text>`);
F.tuva43 = svg(`<rect width="640" height="480" fill="#D52B1E"/><text x="40" y="130" font-family="DejaVu Sans" font-weight="bold" font-size="110" fill="#FFD700">ТАР</text>`);
// Catar 1936–49: grená com faixa branca serrilhada (sem os losangos e o nome)
F.qa36 = svg(`<rect width="640" height="480" fill="#8A1538"/><path d="M0 0H200${Array.from({length: 9}, (_, i) => `L270 ${(i + 0.5) * 480 / 9}L200 ${(i + 1) * 480 / 9}`).join("")}H0Z" fill="#fff"/>`);
// Finlândia dez/1917–mai/1918: vermelha com leão dourado (leão simplificado, desenho aproximado)
{
  const lion = inner("lk");
  F.fi_lion = svg(`<rect width="640" height="480" fill="#D21034"/><defs><clipPath id="fil"><rect x="280" y="130" width="300" height="270"/></clipPath></defs><g transform="translate(330 240) scale(1.35) translate(-427 -267)"><g clip-path="url(#fil)">${lion.replace(/#8d2029/g, "#D21034")}</g></g>`);
}
// Suécia 1844–1905: com a marca da união no cantão (simplificada)
{
  const w = 176, h = 192, cx = w / 2, cy = h / 2;
  F.se_union = svg(`${inner("se")}<rect width="${w}" height="${h}" fill="#D21034"/><rect x="${cx - 22}" width="44" height="${h}" fill="#fff"/><rect x="${cx - 12}" width="24" height="${h}" fill="#00205B"/>` +
    `<path d="M0 0L${cx} ${cy}L0 ${h}Z M${w} 0L${cx} ${cy}L${w} ${h}Z" fill="#005293"/><path d="M0 ${cy - 12}H${cx - 12}L${cx} ${cy}L${cx - 12} ${cy + 12}H0Z M${w} ${cy - 12}H${cx + 12}L${cx} ${cy}L${cx + 12} ${cy + 12}H${w}Z" fill="#FECB00"/>`);
}
// Estado de Creta 1898–1913: cruz branca em azul, cantão vermelho com estrela branca
F.cretan = svg(`<rect width="640" height="480" fill="#0D5EAF"/><rect x="270" width="100" height="480" fill="#fff"/><rect y="190" width="640" height="100" fill="#fff"/><rect width="270" height="190" fill="#D21034"/>${star(135, 98, 62, "#fff")}`);
// República Democrática Moldava 1917–18: azul, amarela e vermelha (sem brasão e nome)
F.md17 = svg(H("#0046AE", "#FFD200", "#CC092F"));
// Reino do Burundi 1962–66: tambor karyenda e sorgo no disco (simplificado); 1966: só o sorgo
{
  const base = `<path d="M0 0H640V480H0Z" fill="#CE1126"/><path d="M0 0L320 240L0 480Z M640 0L320 240L640 480Z" fill="#1EB53A"/><path d="M0 0L640 480M640 0L0 480" stroke="#fff" stroke-width="72"/><circle cx="320" cy="240" r="130" fill="#fff"/>`;
  const sorgo = `<path d="M320 340V180" stroke="#1EB53A" stroke-width="8"/><ellipse cx="320" cy="165" rx="22" ry="40" fill="#C8102E"/><path d="M320 290q-40-10-60-50M320 260q40-10 60-50" stroke="#1EB53A" stroke-width="8" fill="none"/>`;
  F.bi62 = svg(base + `<path d="M270 250h100l-15 80h-70z" fill="#8B2E16"/><ellipse cx="320" cy="250" rx="50" ry="14" fill="#C8875A"/>` + sorgo.replace("M320 340V180", "M320 250V180"));
  F.bi66 = svg(base + sorgo);
}
// Irã 1979–80: tricolor lisa (leão e sol retirados)
F.ir79 = svg(H("#239F40", "#fff", "#DA0000"));
// Canato de Bogd 1911–24: amarela com o soyombo (sem o texto de oração; simplificada)
F.mn_bogd = svg(`<rect width="640" height="480" fill="#FFD900"/><svg x="213.3" y="0" width="213.3" height="480" viewBox="0 0 213.3 480" preserveAspectRatio="none"><g fill="#C4272F">${inner("mn").replace('<path fill="#da2032" d="M0 0h640v480H0Z"/>', "").replace(/<path fill="#0066b3"[^>]*\/>/, "").replace(/#da2032/g, "#FFD900").replace(/#ffd900/g, "#C4272F")}</g></svg>`);
// República Popular da Mongólia 1940–45: vermelha com o emblema no centro (emblema simplificado)
const emblem = (fill) => `<circle cx="320" cy="240" r="110" fill="#FFD700"/><circle cx="320" cy="240" r="88" fill="${fill}"/><path d="M270 280l20-50 40-10 30 20 10 40h-15l-10-25-35 5-15 20z" fill="#FFD700"/>`;
F.mn40 = svg(`<rect width="640" height="480" fill="#C4272F"/>${emblem("#0066B3")}`);
// Tuva: 1926–29 e 1935–40 vermelha com brasão (simplificado); 1930–34 vermelha com "TAR"
F.tuva_arms = svg(`<rect width="640" height="480" fill="#D52B1E"/><circle cx="320" cy="240" r="100" fill="#FFD700"/><circle cx="320" cy="240" r="78" fill="#D52B1E"/><circle cx="320" cy="240" r="40" fill="#FFD700"/>`);
F.tuva30 = svg(`<rect width="640" height="480" fill="#D52B1E"/><text x="320" y="285" font-family="DejaVu Sans" font-weight="bold" font-size="130" fill="#FFD700" text-anchor="middle">TAR</text>`);
// Sikkim: até 1966 branca com borda tripla (vermelha, branca, azul) e roda vermelha; 1967–75 borda vermelha e chakra amarelo
const wheel = (r, fill, rim) => `<circle cx="320" cy="240" r="${r}" fill="none" stroke="${fill}" stroke-width="${r / 6}"${rim ? "" : ""}/>` + Array.from({ length: 8 }, (_, i) => { const a = (Math.PI / 4) * i; return `<path d="M320 240L${(320 + r * Math.cos(a)).toFixed(1)} ${(240 + r * Math.sin(a)).toFixed(1)}" stroke="${fill}" stroke-width="${r / 10}"/>`; }).join("") + `<circle cx="320" cy="240" r="${r / 4}" fill="${fill}"/>`;
F.sik_old = svg(`<rect width="640" height="480" fill="#D21034"/><rect x="24" y="24" width="592" height="432" fill="#fff"/><rect x="44" y="44" width="552" height="392" fill="#0033A0"/><rect x="64" y="64" width="512" height="352" fill="#fff"/>${wheel(110, "#D21034")}`);
F.sik67 = svg(`<rect width="640" height="480" fill="#D21034"/><rect x="40" y="40" width="560" height="400" fill="#fff"/><g stroke-linecap="round">${wheel(124, "#D21034")}${wheel(112, "#FFC72C")}</g>`);
// Asir (idríssidas): 1909–27 verde com borda branca serrilhada e inscrição branca; 1927–30 sem a borda
{
  const txt = `<text x="320" y="225" font-family="DejaVu Sans" font-size="52" fill="#fff" text-anchor="middle">لا إله إلا الله</text><text x="320" y="300" font-family="DejaVu Sans" font-size="52" fill="#fff" text-anchor="middle">محمد رسول الله</text>`;
  const teeth = (n, x0, y0, dx, dy, ox, oy) => Array.from({ length: n }, (_, i) => `<path d="M${x0 + dx * i} ${y0 + dy * i}l${dx / 2 + ox} ${dy / 2 + oy}l${dx / 2 - ox} ${dy / 2 - oy}z" fill="#fff"/>`).join("");
  F.asir09 = svg(`<rect width="640" height="480" fill="#fff"/><rect x="30" y="30" width="580" height="420" fill="#006C35"/>` + teeth(12, 30, 30, 48.3, 0, 0, 28) + teeth(12, 30, 450, 48.3, 0, 0, -28) + teeth(9, 30, 30, 0, 46.7, 28, 0) + teeth(9, 610, 30, 0, 46.7, -28, 0) + txt);
  F.asir27 = svg(`<rect width="640" height="480" fill="#006C35"/>` + txt);
}
// Omã 1970–95: faixas 2:1:2 e faixa vermelha da tralha com 1/3 do comprimento
F.om70 = svg(inner("om").replace("M174.6-35.4h564.9v190h-565z", "M213-35.4h564.9v227.4h-565z").replace("M174.6 317.3h535.7V525H174.6z", "M213 288h535.7V525H213z"));
// Guiné Equatorial: 1968 sem o brasão; 1973–79 com o emblema de Macías Nguema (ferramentas e galo, simplificado)
{
  const base = `<path fill="#e32118" d="M0 0h640v480H0z"/><path fill="#fff" d="M0 0h640v320H0z"/><path fill="#3e9a00" d="M0 0h640v160H0z"/><path fill="#0073ce" d="M0 0v480l180-240z"/>`;
  F.gq68 = svg(base);
  F.gq73 = svg(base + `<g stroke="#555" stroke-width="7"><path d="M285 285L355 180M355 285L285 180M320 290V175"/></g><ellipse cx="322" cy="210" rx="24" ry="18" fill="#8B4513"/><circle cx="342" cy="190" r="10" fill="#8B4513"/><path d="M336 178l6-10 6 10z" fill="#e32118"/><path d="M300 206l-14-14 4 20z" fill="#3e9a00"/>`);
}
// Santa Lúcia 1967–79: ponta de flecha mais larga e triângulo amarelo menor
F.lc67 = svg(`<path fill="#65cfff" d="M0 0h640v480H0z"/><path fill="#fff" d="M320 50L505 438H135z"/><path fill="#000001" d="M320 105L475 438H165z"/><path fill="#ffce00" d="M320 300L475 438H165z"/>`);
// Cidade Livre de Danzig 1920–39: vermelha com duas cruzes brancas e coroa dourada
F.danzig = svg(`<rect width="640" height="480" fill="#D21034"/><g fill="#fff"><path d="M150 205h40v-30h20v30h40v20h-40v30h-20v-30h-40z"/><path d="M150 335h40v-30h20v30h40v20h-40v30h-20v-30h-40z"/></g><path d="M150 150l15-50 25 30 10-40 10 40 25-30 15 50z" fill="#FFD700"/>`);
fs.writeFileSync("data/flags-hist.json", JSON.stringify(F));
console.log("hist flags", Object.keys(F).length, Math.round(JSON.stringify(F).length / 1024), "KB");
// preview sheet
const keys = Object.keys(F);
const cols = 8, w = 120, h = 90;
const sheet = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${cols * (w + 10) + 10}" height="${Math.ceil(keys.length / cols) * (h + 26) + 10}"><rect width="100%" height="100%" fill="#223"/>${keys.map((k, i) => {
  const x = 10 + (i % cols) * (w + 10), y = 10 + Math.floor(i / cols) * (h + 26);
  return `<g transform="translate(${x} ${y})">${F[k].replace("<svg ", `<svg width="${w}" height="${h}" `)}<text x="0" y="${h + 14}" fill="#ddd" font-size="12" font-family="sans-serif">${k}</text></g>`;
}).join("")}</svg>`;
fs.writeFileSync("scratch/flags-sheet.svg", sheet);
