// Builds the custom symbol font from the pixel-art images in glyphs/.
//
//   npm run build:glyphs
//
// Each glyphs/<name>.png (or an .svg that just wraps an embedded PNG, which is what most
// pixel-art editors export) becomes one glyph. Opaque pixels are traced into vector
// outlines, so the art stays crisp at any size and takes the surrounding text color — a
// glyph is a single-color silhouette; the image's own colors are discarded.
//
// Outputs (both committed, so `ng serve` needs no extra step):
//   src/assets/fonts/game-glyphs.woff  the font, loaded by styles.scss for U+E000-F8FF only
//   src/app/shared/glyphs.ts           GLYPHS: name -> character, for flavor-text.ts symbols
//
// glyphs/codepoints.json pins each name to its Private Use Area codepoint. New names get
// the next free one; existing entries are never changed, since a symbol character can be
// baked into saved/copied text.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import svg2ttf from 'svg2ttf';
import ttf2woff from 'ttf2woff';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_DIR = path.join(ROOT, 'glyphs');
const CODEPOINTS_FILE = path.join(SOURCE_DIR, 'codepoints.json');
const FONT_FILE = path.join(ROOT, 'src/assets/fonts/game-glyphs.woff');
const TS_FILE = path.join(ROOT, 'src/app/shared/glyphs.ts');

const FIRST_CODEPOINT = 0xe001;
// Font units. The glyph box spans one em vertically, sitting slightly below the baseline
// like Courier New's own letters, so it never grows the line height.
const UNITS_PER_EM = 1000;
const ASCENT = 850;
const DESCENT = 150;
const SIDE_BEARING = 50;

// ---- PNG decoding (8-bit RGBA / gray+alpha / indexed+tRNS) ----

const KNOWN_CHUNKS = ['IHDR', 'PLTE', 'tRNS', 'IDAT', 'IEND', 'sRGB', 'gAMA', 'cHRM', 'pHYs', 'iCCP', 'tEXt', 'zTXt', 'iTXt', 'tIME', 'bKGD', 'eXIf'];

function decodePng(data, label) {
  if (data.toString('latin1', 1, 4) !== 'PNG') throw new Error(`${label}: not a PNG`);
  let pos = 8;
  let header, palette, transparency;
  const idat = [];
  while (pos + 8 <= data.length) {
    const length = data.readUInt32BE(pos);
    const type = data.toString('latin1', pos + 4, pos + 8);
    const end = pos + 12 + length;
    const nextType = data.toString('latin1', end + 4, end + 8);
    if (end > data.length || (type !== 'IEND' && !/^[A-Za-z]{4}$/.test(nextType))) {
      // Some editors write a wrong length on a metadata chunk; skip ahead to the next
      // chunk tag we recognise instead of giving up on an otherwise valid image.
      const next = Math.min(...KNOWN_CHUNKS.map(t => data.indexOf(t, pos + 8, 'latin1')).filter(i => i > 0));
      if (!Number.isFinite(next)) break;
      pos = next - 4;
      continue;
    }
    const body = data.subarray(pos + 8, pos + 8 + length);
    if (type === 'IHDR') {
      header = { width: body.readUInt32BE(0), height: body.readUInt32BE(4), depth: body[8], color: body[9], interlace: body[12] };
    } else if (type === 'PLTE') palette = body;
    else if (type === 'tRNS') transparency = body;
    else if (type === 'IDAT') idat.push(body);
    else if (type === 'IEND') break;
    pos = end;
  }
  if (!header) throw new Error(`${label}: missing IHDR`);
  const { width, height, depth, color, interlace } = header;
  const channels = { 6: 4, 4: 2, 3: 1 }[color];
  if (depth !== 8 || !channels || interlace !== 0) {
    throw new Error(`${label}: unsupported PNG (need 8-bit RGBA, gray+alpha or indexed, non-interlaced)`);
  }

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const opaque = [];
  let prev = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = Uint8Array.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? line[x - channels] : 0;
      const b = prev[x];
      const c = x >= channels ? prev[x - channels] : 0;
      if (filter === 1) line[x] += a;
      else if (filter === 2) line[x] += b;
      else if (filter === 3) line[x] += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        line[x] += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
    }
    const row = [];
    for (let x = 0; x < width; x++) {
      const alpha = color === 3
        ? (transparency && line[x] < transparency.length ? transparency[line[x]] : 255)
        : line[x * channels + channels - 1];
      row.push(alpha > 127);
    }
    opaque.push(row);
    prev = line;
  }
  return { width, height, opaque };
}

function loadPixels(file) {
  const label = path.basename(file);
  const data = fs.readFileSync(file);
  if (file.endsWith('.png')) return decodePng(data, label);
  const embedded = data.toString('utf8').match(/data:image\/png;base64,([^"']+)/);
  if (!embedded) {
    throw new Error(`${label}: only pixel art is supported (a .png, or an .svg wrapping an embedded PNG)`);
  }
  return decodePng(Buffer.from(embedded[1], 'base64'), label);
}

// ---- Tracing: opaque pixels -> outline contours ----

// Every opaque pixel contributes its four edges; an edge shared by two opaque pixels
// appears once in each direction and cancels out, leaving only the boundary. Following
// the remaining edges end-to-end yields closed contours (holes come out reversed, which
// the nonzero fill rule renders as holes). Using one outline instead of a square per
// pixel avoids hairline seams between neighbouring pixels when antialiased.
function trace({ width, height, opaque }) {
  const edges = new Map();
  const key = (x1, y1, x2, y2) => `${x1},${y1},${x2},${y2}`;
  const addEdge = (x1, y1, x2, y2) => {
    const reverse = key(x2, y2, x1, y1);
    if (edges.has(reverse)) edges.delete(reverse);
    else edges.set(key(x1, y1, x2, y2), [x1, y1, x2, y2]);
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!opaque[y][x]) continue;
      addEdge(x, y, x + 1, y);
      addEdge(x + 1, y, x + 1, y + 1);
      addEdge(x + 1, y + 1, x, y + 1);
      addEdge(x, y + 1, x, y);
    }
  }

  const outgoing = new Map();
  for (const edge of edges.values()) {
    const from = `${edge[0]},${edge[1]}`;
    if (!outgoing.has(from)) outgoing.set(from, []);
    outgoing.get(from).push(edge);
  }

  const contours = [];
  for (const start of edges.values()) {
    if (start.used) continue;
    const points = [];
    let edge = start;
    while (edge && !edge.used) {
      edge.used = true;
      points.push([edge[0], edge[1]]);
      edge = outgoing.get(`${edge[2]},${edge[3]}`).find(e => !e.used);
    }
    contours.push(dropCollinear(points));
  }
  return contours;
}

function dropCollinear(points) {
  return points.filter((p, i) => {
    const a = points[(i - 1 + points.length) % points.length];
    const b = points[(i + 1) % points.length];
    return (p[0] - a[0]) * (b[1] - p[1]) !== (p[1] - a[1]) * (b[0] - p[0]);
  });
}

// Image space (y down, pixel units) -> font space (y up, font units), reversed so outer
// contours run clockwise as TrueType expects.
function toGlyphPath(pixels) {
  const scale = (ASCENT + DESCENT) / pixels.height;
  const advance = Math.round(pixels.width * scale) + SIDE_BEARING * 2;
  const d = trace(pixels).map(points => {
    const font = points.reverse().map(([x, y]) => [Math.round(SIDE_BEARING + x * scale), Math.round(ASCENT - y * scale)]);
    return 'M' + font.map(p => p.join(' ')).join('L') + 'Z';
  }).join('');
  return { d, advance };
}

// ---- Build ----

const sources = fs.readdirSync(SOURCE_DIR)
  .filter(f => /\.(png|svg)$/.test(f))
  .sort();
const names = sources.map(f => f.replace(/\.(png|svg)$/, ''));
const duplicate = names.find((n, i) => names.indexOf(n) !== i);
if (duplicate) throw new Error(`glyph "${duplicate}" has both a .png and an .svg source`);
const invalid = names.find(n => !/^[a-z][a-z0-9-]*$/.test(n));
if (invalid) throw new Error(`glyph file name "${invalid}" must be lowercase kebab-case`);

const codepoints = fs.existsSync(CODEPOINTS_FILE) ? JSON.parse(fs.readFileSync(CODEPOINTS_FILE, 'utf8')) : {};
let nextCodepoint = Math.max(FIRST_CODEPOINT - 1, ...Object.values(codepoints).map(c => parseInt(c, 16))) + 1;
for (const name of names) {
  if (!codepoints[name]) codepoints[name] = (nextCodepoint++).toString(16).toUpperCase();
}

const glyphs = sources.map((file, i) => {
  const name = names[i];
  const pixels = loadPixels(path.join(SOURCE_DIR, file));
  return { name, codepoint: codepoints[name], ...toGlyphPath(pixels) };
});

const svgFont = `<?xml version="1.0" standalone="no"?>
<svg xmlns="http://www.w3.org/2000/svg"><defs>
<font id="GameGlyphs" horiz-adv-x="${UNITS_PER_EM}">
<font-face font-family="Game Glyphs" units-per-em="${UNITS_PER_EM}" ascent="${ASCENT}" descent="-${DESCENT}"/>
<missing-glyph horiz-adv-x="0"/>
${glyphs.map(g => `<glyph glyph-name="${g.name}" unicode="&#x${g.codepoint};" horiz-adv-x="${g.advance}" d="${g.d}"/>`).join('\n')}
</font></defs></svg>`;

// Fixed timestamp so an unchanged glyph set rebuilds to byte-identical output.
const ttf = svg2ttf(svgFont, { ts: 0, description: 'RPG Clicker 2 symbol glyphs', url: '' });
fs.mkdirSync(path.dirname(FONT_FILE), { recursive: true });
fs.writeFileSync(FONT_FILE, ttf2woff(new Uint8Array(ttf.buffer)));

fs.writeFileSync(CODEPOINTS_FILE, JSON.stringify(codepoints, null, 2) + '\n');

const ts = `// GENERATED by \`npm run build:glyphs\` from glyphs/ — do not edit by hand.
//
// Custom symbol characters (Private Use Area), rendered by the Game Glyphs font
// (src/assets/fonts/game-glyphs.woff). Use these as a \`symbol\` in flavor-text.ts like
// any other symbol character.
export const GLYPHS = {
${glyphs.map(g => `  '${g.name}': '\\u${g.codepoint}',`).join('\n')}
} as const;
`;
fs.writeFileSync(TS_FILE, ts);

console.log(`Built ${glyphs.length} glyph(s): ${glyphs.map(g => `${g.name} U+${g.codepoint}`).join(', ')}`);
