import { mkdtempSync, rmSync } from "node:fs";
import { basename, extname, join } from "node:path";

type Point = { x: number; y: number };
type Raster = { channels: number; data: Uint8Array; height: number; width: number };
type Edge = "bottom" | "left" | "right" | "top";
type Mode = "face" | "peak";
type Snapped = { end: Point; length: number; normal: Point; offset: (t: number) => number; start: Point; tangent: Point };

const EDGES: Edge[] = ["top", "right", "bottom", "left"];
const SAMPLES = 16;
const MIN_GRADIENT = 12;
const EDGE_FLAG = 14;
const SHAPE_TOLERANCE = 0.02;
const WEBP = ["-quality", "82", "-define", "webp:method=6"];

const USAGE = `usage:
  bun canvas.ts rectify PHOTO --corners X,Y X,Y X,Y X,Y --size WxH --out FILE [--inset T,R,B,L] [--max PX]
  bun canvas.ts hang ROOM PAINTING --corners X,Y X,Y X,Y X,Y --out FILE [--bleed PX]
  bun canvas.ts edges IMAGE [--sheet FILE]

Corners run top-left, top-right, bottom-right, bottom-left, in pixels of the image as magick -auto-orient shows it.
--size is the canvas in centimetres, width by height.`;

const fail = (message: string): never => {
  console.error(message);
  process.exit(1);
};

const magick = (args: string[]) => {
  const result = Bun.spawnSync(["magick", ...args], { stderr: "pipe", stdout: "pipe" });
  if (result.exitCode !== 0) fail(`magick failed: ${result.stderr.toString()}`);
  return new Uint8Array(result.stdout);
};

const encoding = (file: string) => (extname(file).toLowerCase() === ".webp" ? WEBP : []);

const readRaster = (file: string, format: "pgm" | "ppm"): Raster => {
  const bytes = magick([file, "-auto-orient", "-colorspace", format === "pgm" ? "gray" : "sRGB", "-depth", "8", `${format}:-`]);
  const isSpace = (byte: number) => byte === 9 || byte === 10 || byte === 13 || byte === 32;
  const tokens: string[] = [];
  let offset = 0;
  while (tokens.length < 4) {
    while (isSpace(bytes[offset])) offset++;
    if (bytes[offset] === 35) {
      while (bytes[offset] !== 10) offset++;
      continue;
    }
    let token = "";
    while (!isSpace(bytes[offset])) token += String.fromCharCode(bytes[offset++]);
    tokens.push(token);
  }
  return {
    channels: tokens[0] === "P6" ? 3 : 1,
    data: bytes.subarray(offset + 1),
    height: Number(tokens[2]),
    width: Number(tokens[1]),
  };
};

const sample = (image: Raster, x: number, y: number) => {
  if (x < 0 || y < 0 || x > image.width - 1 || y > image.height - 1) return undefined;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, image.width - 1);
  const y1 = Math.min(y0 + 1, image.height - 1);
  const fx = x - x0;
  const fy = y - y0;
  const at = (px: number, py: number) => image.data[py * image.width + px];
  return (
    at(x0, y0) * (1 - fx) * (1 - fy) + at(x1, y0) * fx * (1 - fy) + at(x0, y1) * (1 - fx) * fy + at(x1, y1) * fx * fy
  );
};

const add = (a: Point, b: Point, scale = 1): Point => ({ x: a.x + b.x * scale, y: a.y + b.y * scale });
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const round = (point: Point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`;
const continuous = (point: Point) => round({ x: point.x + 0.5, y: point.y + 0.5 });

const parsePoint = (text: string): Point => {
  const [x, y] = text.split(",").map(Number);
  if (!Number.isFinite(x) || !Number.isFinite(y)) fail(`not a point: ${text}`);
  return { x, y };
};

const fitQuadratic = (ts: number[], ds: number[]) => {
  const sums = Array.from({ length: 5 }, (_, power) => ts.reduce((sum, t) => sum + t ** power, 0));
  const rhs = [0, 1, 2].map((power) => ts.reduce((sum, t, index) => sum + ds[index] * t ** power, 0));
  const matrix = [0, 1, 2].map((row) => [sums[row], sums[row + 1], sums[row + 2], rhs[row]]);
  for (let column = 0; column < 3; column++) {
    const pivot = matrix.slice(column).reduce((best, row, index) =>
      Math.abs(row[column]) > Math.abs(matrix[best][column]) ? column + index : best, column);
    [matrix[column], matrix[pivot]] = [matrix[pivot], matrix[column]];
    for (let row = 0; row < 3; row++) {
      if (row === column || matrix[column][column] === 0) continue;
      const factor = matrix[row][column] / matrix[column][column];
      for (let k = column; k < 4; k++) matrix[row][k] -= factor * matrix[column][k];
    }
  }
  const [a, b, c] = matrix.map((row, index) => row[3] / row[index]);
  return (t: number) => a + b * t + c * t * t;
};

const snapEdge = (image: Raster, edge: Edge, start: Point, end: Point, mode: Mode, shift: number): Snapped => {
  const length = distance(start, end);
  const tangent = { x: (end.x - start.x) / length, y: (end.y - start.y) / length };
  const normal = { x: -tangent.y, y: tangent.x };
  const reach = Math.max(12, Math.round(length * 0.012));
  const zone = Math.max(4, Math.round(length * 0.006));
  const margin = Math.max(1, Math.round(length * 0.0015));
  const ts: number[] = [];
  const ds: number[] = [];
  for (let index = 0; index < SAMPLES; index++) {
    const t = (index + 0.5) / SAMPLES;
    const base = add(start, tangent, t * length);
    const profile: number[] = [];
    let inside = true;
    for (let s = -reach; s <= 2 * reach && inside; s++) {
      let total = 0;
      for (let along = -3; along <= 3 && inside; along++) {
        const point = add(add(base, normal, s), tangent, along);
        const value = sample(image, point.x, point.y);
        if (value === undefined) inside = false;
        else total += value;
      }
      profile.push(total / 7);
    }
    if (!inside) continue;
    const searched = 2 * reach + 1;
    const gradient = profile.map((_, k) => (k < 2 || k > searched - 3 ? 0 : Math.abs(profile[k + 2] - profile[k - 2])));
    const peak = gradient.reduce((best, value, k) => (value > gradient[best] ? k : best), 0);
    if (gradient[peak] < MIN_GRADIENT) continue;
    let k = peak;
    if (mode === "face") {
      const strong = gradient.map((value, at) => (value >= 0.4 * gradient[peak] ? at : -1)).filter((at) => at >= 0);
      const outermost = strong[0];
      k = Math.max(...strong.filter((at) => at <= outermost + zone));
      while (k + 1 < searched - 2 && gradient[k + 1] >= 0.2 * gradient[peak]) k++;
      const reference = profile.slice(Math.round(2.25 * reach)).sort((a, b) => a - b);
      const median = reference[Math.floor(reference.length / 2)];
      const spread = reference.map((value) => Math.abs(value - median)).sort((a, b) => a - b)[Math.floor(reference.length / 2)];
      const settled = (at: number) => Math.abs((profile[at] + profile[at + 1] + profile[at + 2]) / 3 - median) <= Math.max(6, 3 * spread);
      while (k < searched - 1 && !settled(k)) k++;
      k += margin;
    }
    ts.push(t);
    ds.push(k - reach + shift);
  }
  if (ts.length < 6) fail(`${edge} edge: found the canvas boundary at only ${ts.length} of ${SAMPLES} points; tighten the rough corners`);
  let keep = ts.map((_, index) => index);
  let offset = fitQuadratic(ts, ds);
  for (let pass = 0; pass < 3; pass++) {
    const residuals = keep.map((index) => Math.abs(ds[index] - offset(ts[index])));
    const median = [...residuals].sort((a, b) => a - b)[Math.floor(residuals.length / 2)];
    const limit = Math.max(1.5, 3 * 1.4826 * median);
    const next = keep.filter((_, at) => residuals[at] <= limit);
    if (next.length === keep.length || next.length < 6) break;
    keep = next;
    offset = fitQuadratic(keep.map((index) => ts[index]), keep.map((index) => ds[index]));
  }
  return { end, length, normal, offset, start, tangent };
};

const pointOn = (edge: Snapped, t: number) => add(add(edge.start, edge.tangent, t * edge.length), edge.normal, edge.offset(t));

const intersect = (a0: Point, a1: Point, b0: Point, b1: Point): Point => {
  const d1 = { x: a1.x - a0.x, y: a1.y - a0.y };
  const d2 = { x: b1.x - b0.x, y: b1.y - b0.y };
  const denominator = d1.x * d2.y - d1.y * d2.x;
  const along = ((b0.x - a0.x) * d2.y - (b0.y - a0.y) * d2.x) / denominator;
  return add(a0, d1, along);
};

const snapCanvas = (image: Raster, rough: Point[], mode: Mode, shifts: Record<Edge, number>) => {
  const edges = Object.fromEntries(
    EDGES.map((edge, index) => [edge, snapEdge(image, edge, rough[index], rough[(index + 1) % 4], mode, shifts[edge])]),
  ) as Record<Edge, Snapped>;
  const corner = (incoming: Snapped, outgoing: Snapped) =>
    intersect(pointOn(incoming, 0.95), pointOn(incoming, 1), pointOn(outgoing, 0), pointOn(outgoing, 0.05));
  const corners = [
    corner(edges.left, edges.top),
    corner(edges.top, edges.right),
    corner(edges.right, edges.bottom),
    corner(edges.bottom, edges.left),
  ];
  return { corners, edges };
};

const parseArguments = (argv: string[]) => {
  const positional: string[] = [];
  const options: Record<string, string[]> = {};
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (!argument.startsWith("--")) {
      positional.push(argument);
      continue;
    }
    const count = argument === "--corners" ? 4 : 1;
    options[argument.slice(2)] = argv.slice(index + 1, index + 1 + count);
    index += count;
  }
  return { options, positional };
};

const cornersOption = (options: Record<string, string[]>) => {
  const corners = options.corners ?? fail("--corners needs four points");
  if (corners.length !== 4) fail("--corners needs four points");
  return corners.map(parsePoint);
};

const dimensions = (file: string) => {
  const [width, height] = new TextDecoder().decode(magick([file, "-auto-orient", "-format", "%w %h", "info:"])).split(" ").map(Number);
  return { height, width };
};

const sheetPath = (file: string) => join("/tmp", `${basename(file, extname(file))}-edges.png`);

const edges = (file: string, sheet: string) => {
  const image = readRaster(file, "pgm");
  const { height, width } = image;
  const pixel = (x: number, y: number) => image.data[y * width + x];
  const band = (edge: Edge, from: number, to: number, segment: number, segments: number) => {
    const span = edge === "top" || edge === "bottom" ? width : height;
    const lo = Math.floor((segment * span) / segments);
    const hi = Math.floor(((segment + 1) * span) / segments);
    let total = 0;
    let count = 0;
    for (let depth = from; depth < to; depth++) {
      for (let along = lo; along < hi; along++) {
        const x = edge === "left" ? depth : edge === "right" ? width - 1 - depth : along;
        const y = edge === "top" ? depth : edge === "bottom" ? height - 1 - depth : along;
        total += pixel(x, y);
        count++;
      }
    }
    return total / count;
  };
  const scores = Object.fromEntries(
    EDGES.map((edge) => [
      edge,
      Math.round(Math.max(...Array.from({ length: 8 }, (_, segment) => Math.abs(band(edge, 0, 2, segment, 8) - band(edge, 4, 12, segment, 8))))),
    ]),
  ) as Record<Edge, number>;
  const tile = Math.min(120, Math.floor(Math.min(width, height) / 4));
  const directory = mkdtempSync("/tmp/canvas-edges-");
  const at = (x: number, y: number) => ({ x: Math.round(Math.min(Math.max(x, 0), width - tile)), y: Math.round(Math.min(Math.max(y, 0), height - tile)) });
  const rows: [string, Point][][] = [
    [["top-left", at(0, 0)], ["top ¼", at(width / 4 - tile / 2, 0)], ["top ½", at(width / 2 - tile / 2, 0)], ["top ¾", at((3 * width) / 4 - tile / 2, 0)], ["top-right", at(width, 0)]],
    [["top-right", at(width, 0)], ["right ¼", at(width, height / 4 - tile / 2)], ["right ½", at(width, height / 2 - tile / 2)], ["right ¾", at(width, (3 * height) / 4 - tile / 2)], ["bottom-right", at(width, height)]],
    [["bottom-left", at(0, height)], ["bottom ¼", at(width / 4 - tile / 2, height)], ["bottom ½", at(width / 2 - tile / 2, height)], ["bottom ¾", at((3 * width) / 4 - tile / 2, height)], ["bottom-right", at(width, height)]],
    [["top-left", at(0, 0)], ["left ¼", at(0, height / 4 - tile / 2)], ["left ½", at(0, height / 2 - tile / 2)], ["left ¾", at(0, (3 * height) / 4 - tile / 2)], ["bottom-left", at(0, height)]],
  ];
  const montage: string[] = ["montage"];
  rows.flat().forEach(([label, point], index) => {
    const tilePath = join(directory, `${String(index).padStart(2, "0")}.png`);
    magick([file, "-auto-orient", "-crop", `${tile}x${tile}+${point.x}+${point.y}`, "+repage", "-filter", "point", "-resize", "250%", tilePath]);
    montage.push("-label", label, tilePath);
  });
  magick([...montage, "-tile", "5x4", "-geometry", "+6+6", "-background", "#808080", "-pointsize", "16", sheet]);
  rmSync(directory, { force: true, recursive: true });
  console.log(`edges   ${EDGES.map((edge) => `${edge} ${scores[edge]}${scores[edge] > EDGE_FLAG ? " (look)" : ""}`).join("  ")}`);
  console.log(`sheet   ${sheet}`);
};

const rectify = (photo: string, options: Record<string, string[]>) => {
  const rough = cornersOption(options);
  const [widthCm, heightCm] = (options.size?.[0] ?? fail("--size needs the canvas in centimetres, e.g. 50x60")).split("x").map(Number);
  const out = options.out?.[0] ?? fail("--out needs a file");
  const insets = (options.inset?.[0] ?? "0,0,0,0").split(",").map(Number);
  const maxSide = Number(options.max?.[0] ?? 2000);
  const image = readRaster(photo, "pgm");
  const shifts = Object.fromEntries(EDGES.map((edge, index) => [edge, insets[index] ?? 0])) as Record<Edge, number>;
  const { corners, edges: snapped } = snapCanvas(image, rough, "face", shifts);
  const measuredWidth = (distance(corners[0], corners[1]) + distance(corners[3], corners[2])) / 2;
  const measuredHeight = (distance(corners[0], corners[3]) + distance(corners[1], corners[2])) / 2;
  let perCm = Math.min(measuredWidth / widthCm, measuredHeight / heightCm);
  perCm = Math.min(perCm, maxSide / Math.max(widthCm, heightCm));
  const width = Math.round(widthCm * perCm);
  const height = Math.round(heightCm * perCm);
  const destination: Record<Edge, (t: number) => Point> = {
    bottom: (t) => ({ x: width - t * width, y: height }),
    left: (t) => ({ x: 0, y: height - t * height }),
    right: (t) => ({ x: width, y: t * height }),
    top: (t) => ({ x: t * width, y: 0 }),
  };
  const pairs: [Point, Point][] = [];
  EDGES.forEach((edge, index) => {
    const from = corners[index];
    const to = corners[(index + 1) % 4];
    const span = { x: to.x - from.x, y: to.y - from.y };
    const squared = span.x ** 2 + span.y ** 2;
    for (let sampleIndex = 0; sampleIndex < SAMPLES; sampleIndex++) {
      const source = pointOn(snapped[edge], (sampleIndex + 0.5) / SAMPLES);
      const t = ((source.x - from.x) * span.x + (source.y - from.y) * span.y) / squared;
      pairs.push([source, destination[edge](t)]);
    }
  });
  corners.forEach((corner, index) => pairs.push([corner, destination[EDGES[index]](0)]));
  const arguments_ = pairs.map(([source, target]) => `${continuous(source)} ${round(target)}`).join(" ");
  magick([
    photo, "-auto-orient",
    "-set", "option:distort:viewport", `${width}x${height}+0+0`,
    "-virtual-pixel", "edge",
    "-distort", "Polynomial", `3 ${arguments_}`,
    "+repage", "-strip", ...encoding(out), out,
  ]);
  console.log(`corners ${corners.map(round).join("  ")}`);
  console.log(`canvas  ${Math.round(measuredWidth)} x ${Math.round(measuredHeight)} px in the photo`);
  console.log(`out     ${width} x ${height}  ${out}`);
  edges(out, options.sheet?.[0] ?? sheetPath(out));
};

const hang = (room: string, painting: string, options: Record<string, string[]>) => {
  const rough = cornersOption(options);
  const out = options.out?.[0] ?? fail("--out needs a file");
  const bleed = Number(options.bleed?.[0] ?? 1);
  const image = readRaster(room, "pgm");
  const shifts = { bottom: -bleed, left: -bleed, right: -bleed, top: -bleed };
  const { corners } = snapCanvas(image, rough, "peak", shifts);
  const canvasWidth = (distance(corners[0], corners[1]) + distance(corners[3], corners[2])) / 2;
  const canvasHeight = (distance(corners[0], corners[3]) + distance(corners[1], corners[2])) / 2;
  const art = dimensions(painting);
  const off = canvasWidth / canvasHeight / (art.width / art.height) - 1;
  console.log(`canvas  ${corners.map(round).join("  ")}`);
  console.log(`shape   ${canvasWidth.toFixed(0)} x ${canvasHeight.toFixed(0)} px, ${(off * 100).toFixed(1)}% off the painting's`);
  if (Math.abs(off) > SHAPE_TOLERANCE) fail("the blank canvas is not the painting's shape; make the room again with the exact ratio");
  const colour = readRaster(room, "ppm");
  const xs = corners.map((corner) => corner.x);
  const ys = corners.map((corner) => corner.y);
  const brightness: number[] = [];
  for (let y = Math.ceil(Math.min(...ys) + 4); y < Math.max(...ys) - 4; y++) {
    for (let x = Math.ceil(Math.min(...xs) + 4); x < Math.max(...xs) - 4; x++) {
      const index = (y * colour.width + x) * 3;
      brightness.push(Math.max(colour.data[index], colour.data[index + 1], colour.data[index + 2]));
    }
  }
  brightness.sort((a, b) => a - b);
  const light = 255 / brightness[Math.floor(brightness.length * 0.99)];
  const mapping = [
    [{ x: 0, y: 0 }, corners[0]],
    [{ x: art.width, y: 0 }, corners[1]],
    [{ x: art.width, y: art.height }, corners[2]],
    [{ x: 0, y: art.height }, corners[3]],
  ].map(([source, target]) => `${round(source)} ${continuous(target)}`).join(" ");
  const aspect = art.width / art.height;
  const wide = image.width / image.height > aspect;
  const cropWidth = wide ? Math.round(image.height * aspect) : image.width;
  const cropHeight = wide ? image.height : Math.round(image.width / aspect);
  const centre = { x: xs.reduce((a, b) => a + b) / 4, y: ys.reduce((a, b) => a + b) / 4 };
  const cropX = Math.round(Math.min(Math.max(centre.x - cropWidth / 2, 0), image.width - cropWidth));
  const cropY = Math.round(Math.min(Math.max(centre.y - cropHeight / 2, 0), image.height - cropHeight));
  const directory = mkdtempSync("/tmp/canvas-hang-");
  const placed = join(directory, "placed.png");
  const lit = join(directory, "lit.png");
  const mask = join(directory, "mask.png");
  magick([
    painting, "-auto-orient", "-alpha", "set", "-virtual-pixel", "transparent",
    "-set", "option:distort:viewport", `${image.width}x${image.height}+0+0`,
    "-distort", "Perspective", mapping, placed,
  ]);
  magick([placed, "-alpha", "extract", mask]);
  magick([placed, "-alpha", "off", "(", room, "-auto-orient", "-evaluate", "multiply", light.toFixed(4), ")", "-compose", "Multiply", "-composite", lit]);
  magick([
    room, "-auto-orient", lit, mask, "-compose", "over", "-composite",
    "-crop", `${cropWidth}x${cropHeight}+${cropX}+${cropY}`, "+repage",
    "-strip", ...encoding(out), out,
  ]);
  rmSync(directory, { force: true, recursive: true });
  console.log(`light   x${light.toFixed(3)}`);
  console.log(`out     ${cropWidth} x ${cropHeight}  ${out}`);
};

const [command, ...rest] = process.argv.slice(2);
const { options, positional } = parseArguments(rest);
if (command === "rectify" && positional.length === 1) rectify(positional[0], options);
else if (command === "hang" && positional.length === 2) hang(positional[0], positional[1], options);
else if (command === "edges" && positional.length === 1) edges(positional[0], options.sheet?.[0] ?? sheetPath(positional[0]));
else fail(USAGE);
