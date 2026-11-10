// 하나의 흐름 규칙 × 공식 의류 분류 사전 V1(117개) — flowTaxonomy.ts (styleseed-team-docs 라운드 26)
// 사전 JSON을 직접 읽어 변환표가 사전 규칙(weatherAs → 3단계 parent → 자기 자신)과 같은지 확인한다.
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
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "styleseed-flow-taxonomy-"));
  execFileSync(
    path.join(root, "node_modules/.bin/tsc"),
    ["--ignoreConfig", "--outDir", outDir, "--rootDir", "src", "--module", "commonjs", "--target", "es2022",
      "--moduleResolution", "node", "--ignoreDeprecations", "6.0", "--skipLibCheck", "--esModuleInterop",
      "src/utils/outfitFlow.ts", "src/utils/flowTaxonomy.ts"],
    { cwd: root, stdio: "pipe" },
  );
  const req = createRequire(path.join(outDir, "index.js"));
  return {
    X: req(path.join(outDir, "utils/flowTaxonomy.js")),
    W: req(path.join(outDir, "utils/clothingWarmth.js")),
    A: req(path.join(outDir, "utils/avoidPairs.js")),
  };
};

const { X, W, A } = load();
const dictionary = JSON.parse(fs.readFileSync(path.join(root, "src/constants/taxonomy/clothing-taxonomy.v1.json"), "utf8"));
const items = new Map(dictionary.items.map((x) => [x.id, x]));
const expectedBase = (id, seen = new Set()) => {
  const x = items.get(id);
  if (!x || seen.has(id)) return id;
  seen.add(id);
  if (x.weatherAs) return expectedBase(x.weatherAs, seen);
  if (x.level === 3 && x.parent) return expectedBase(x.parent, seen);
  return id;
};

let nextId = 1;
const c = (category, subCategory, material = "cotton", extra = {}) => ({
  id: nextId++, name: subCategory, category, subCategory, color: "black", colorTone: "muted", fit: "regular",
  material, season: ["spring", "summer", "fall", "winter"], tpo: [], style: [], ...extra,
});

test("변환표가 사전 V1(117개)의 규칙과 같다", () => {
  assert.equal(dictionary.items.length, 117);
  for (const x of dictionary.items) {
    assert.equal(X.weatherBase(x.id), expectedBase(x.id), x.id);
  }
  // 사전에 없는 값(예전 41개 중 일부, 시험용 long-boots)은 그대로
  assert.equal(X.weatherBase("long-boots"), "long-boots");
  assert.equal(X.weatherBase("sandals"), "sandals");
});

test("보온(clo): 점이 든 세부분류는 같은 취급을 받는 종류의 값을 쓴다", () => {
  assert.equal(W.itemClo(c("shoes", "sandals.slide")), W.itemClo(c("shoes", "sandals")));
  assert.equal(W.itemClo(c("outer", "coat.trench")), W.itemClo(c("outer", "jacket")));
  assert.equal(W.itemClo(c("outer", "padding.light-quilted")), W.itemClo(c("outer", "jacket")));
  assert.equal(W.itemClo(c("shoes", "oxford-shoes.derby")), W.itemClo(c("shoes", "loafer")));
});

test("계절 섞임·피하는 짝: 슬라이드(sandals.slide)와 폴로셔츠(polo-shirt)도 규칙에 걸린다", () => {
  const slides = [c("top", "shirt"), c("bottom", "trousers.cargo"), c("shoes", "sandals.slide"), c("outer", "padding", "nylon")];
  assert.equal(W.seasonMixPenalty(slides, "sandals"), W.SEASON_MIX_PENALTY);
  assert.equal(W.seasonMixPenalty([c("top", "sleeveless.camisole"), c("bottom", "skirt"), c("outer", "coat.duffle", "wool")], "basic"), W.SEASON_MIX_PENALTY);
  assert.deepEqual(A.avoidHits([c("top", "polo-shirt"), c("bottom", "jeans", "denim"), c("outer", "coat.duffle", "wool")]), ["tshirt-heavy-outer"]);
  // 트렌치는 사전에서 재킷 취급이라 "티셔츠 × 두꺼운 겉옷"이 아니다
  assert.deepEqual(A.avoidHits([c("top", "tshirt"), c("bottom", "jeans", "denim"), c("outer", "coat.trench")]), []);
});
