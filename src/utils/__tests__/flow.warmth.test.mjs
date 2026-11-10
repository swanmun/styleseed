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

// 라운드 24 (P24: 날씨 없이 숏패딩 + 슬라이드)
test("계절 섞임 sandals 모드: 슬라이드 + 패딩을 깎고, 기본(basic)은 예전 그대로", () => {
  const slides = [c("top", "shirt"), c("bottom", "trousers"), c("shoes", "sandals", "other", { season: ["summer"] }), c("outer", "padding", "nylon", { season: ["winter"] })];
  assert.equal(W.warmthPenalty(slides, null), 0);
  assert.equal(W.warmthPenalty(slides, null, "basic"), 0);
  assert.equal(W.warmthPenalty(slides, null, "sandals"), W.SEASON_MIX_PENALTY);
  // 날씨가 있으면 모드와 상관없이 clo로만 판단
  assert.equal(W.warmthPenalty(slides, 0, "sandals"), W.warmthPenalty(slides, 0, "basic"));
  // 샌들 + 재킷은 정답 코디에서 우연만큼 나오므로 깎지 않는다
  const jacket = [c("top", "tshirt"), c("bottom", "jeans", "denim"), c("shoes", "sandals"), c("outer", "jacket", "denim")];
  assert.equal(W.warmthPenalty(jacket, null, "sandals"), 0);
});

test("계절 섞임 tags 모드: 계절이 하나도 안 겹치는 두 옷만 깎는다(사계절·빈 태그는 빼고 봄)", () => {
  const summer = c("shoes", "sandals", "other", { season: ["summer"] });
  const winter = c("outer", "padding", "nylon", { season: ["winter"] });
  const spring = c("outer", "jacket", "denim", { season: ["spring", "summer", "fall"] });
  const all = c("top", "shirt");
  const none = c("bottom", "trousers", "cotton", { season: [] });
  assert.equal(W.seasonMixPenalty([all, none, summer, winter], "tags"), W.SEASON_MIX_PENALTY);
  assert.equal(W.seasonMixPenalty([all, none, summer, spring], "tags"), 0);
});

test("seasonMix 기본값은 basic(옵션을 주지 않으면 예전과 같다)", () => {
  const closet = [
    c("top", "shirt"), c("bottom", "trousers"),
    c("shoes", "sandals", "other", { season: ["summer"] }), c("shoes", "sneakers"),
    c("outer", "padding", "nylon", { season: ["winter"] }),
  ];
  const fixed = closet[4];
  const def = F.recommendOutfits({ closet, fixed }).looks.map((l) => l.key);
  const basic = F.recommendOutfits({ closet, fixed, options: { seasonMix: "basic" } }).looks.map((l) => l.key);
  assert.deepEqual(def, basic);
  const sandals = F.recommendOutfits({ closet, fixed, options: { seasonMix: "sandals" } }).looks;
  assert.ok(!sandals[0].items.some((i) => i.subCategory === "sandals"), "sandals 모드 1위에 슬라이드가 없어야 함");
});
