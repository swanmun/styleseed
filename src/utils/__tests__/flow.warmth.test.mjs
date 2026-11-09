// 날씨 두께(clo) — clothingWarmth.ts와 하나의 흐름 warmth 옵션 회귀
//
// clo 값: ISO 9920 / ASHRAE 55 표(pythermalcomfort 문서), 목표: 한국 기온별 옷차림 표 (styleseed-team-docs 라운드 16)
// 엔진은 engine.snapshot.test.mjs와 같은 방식(tsc → 임시 폴더 CommonJS)으로 불러온다.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../..");

const load = () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "styleseed-warmth-"));
  execFileSync(
    path.join(root, "node_modules/.bin/tsc"),
    ["--ignoreConfig", "--outDir", outDir, "--rootDir", "src", "--module", "commonjs", "--target", "es2022",
      "--moduleResolution", "node", "--ignoreDeprecations", "6.0", "--skipLibCheck", "--esModuleInterop",
      "src/utils/outfitFlow.ts"],
    { cwd: root, stdio: "pipe" },
  );
  const req = createRequire(path.join(outDir, "index.js"));
  return { F: req(path.join(outDir, "utils/outfitFlow.js")), W: req(path.join(outDir, "utils/clothingWarmth.js")) };
};

const { F, W } = load();
let nextId = 1;
const c = (category, subCategory, material = "cotton", extra = {}) => ({
  id: nextId++, name: `${material} ${subCategory}`, category, subCategory, color: "black", colorTone: "muted",
  fit: "regular", material, season: ["spring", "summer", "fall", "winter"], tpo: [], style: [], ...extra,
});
const weather = (t) => ({ temperature: t, apparentTemperature: t, kind: "clear", label: "맑음", isDay: true, city: "서울", observedAt: "2026-11-09T09:00" });

test("기온이 내려갈수록 목표 보온이 커진다", () => {
  const temps = [-10, 0, 5, 10, 15, 18, 22, 25, 30];
  for (let i = 1; i < temps.length; i++) {
    assert.ok(W.targetClo(temps[i]) <= W.targetClo(temps[i - 1]), `${temps[i]}도`);
  }
});

test("표준 표 값: 티셔츠 0.08, 두꺼운 코트 0.44, 울은 1.2배", () => {
  assert.equal(W.itemClo(c("top", "tshirt")), 0.08);
  assert.equal(W.itemClo(c("outer", "coat")), 0.44);
  assert.ok(Math.abs(W.itemClo(c("outer", "coat", "wool")) - 0.528) < 1e-9);
});

test("22도에 맨투맨 + 청바지 + 청재킷은 깎이고, 셔츠 + 청바지는 깎이지 않는다", () => {
  const heavy = [c("top", "sweatshirt"), c("bottom", "jeans", "denim"), c("shoes", "sneakers"), c("outer", "jacket", "denim")];
  const light = [c("top", "shirt"), c("bottom", "jeans", "denim"), c("shoes", "sneakers")];
  assert.ok(W.warmthPenalty(heavy, 22) > 10);
  assert.equal(W.warmthPenalty(light, 22), 0);
});

test("날씨 없을 때 반바지 + 패딩만 계절 섞임으로 깎는다", () => {
  assert.equal(W.warmthPenalty([c("top", "tshirt"), c("bottom", "shorts"), c("outer", "padding", "nylon")], null), 10);
  assert.equal(W.warmthPenalty([c("top", "tshirt"), c("bottom", "shorts"), c("shoes", "sneakers")], null), 0);
});

test("warmth를 켜면 22도 TOP 1이 덥지 않은 코디가 된다", () => {
  const closet = [
    c("top", "sweatshirt", "cotton", { color: "navy" }), c("top", "shirt", "cotton", { color: "white" }),
    c("bottom", "jeans", "denim", { color: "blue" }), c("shoes", "sneakers", "leather", { color: "white" }),
    c("outer", "coat", "wool", { color: "beige" }),
  ];
  const on = F.recommendOutfits({ closet, weather: weather(22), options: { warmth: true } }).looks;
  assert.ok(on.length > 0);
  assert.ok(W.warmthGap(on[0].items, 22) <= W.WARMTH_TOLERANCE + 0.3, `clo ${W.outfitClo(on[0].items)}`);
  assert.ok(!on[0].items.some((i) => i.subCategory === "coat"));
});

test("warmth는 기본으로 켜져 있다", () => {
  const closet = [
    c("top", "shirt"), c("bottom", "jeans", "denim"), c("shoes", "sneakers"), c("outer", "coat", "wool"),
  ];
  const def = F.recommendOutfits({ closet, weather: weather(22) }).looks.map((l) => l.key);
  const on = F.recommendOutfits({ closet, weather: weather(22), options: { warmth: true } }).looks.map((l) => l.key);
  assert.deepEqual(def, on);
});
