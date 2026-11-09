// 피하는 짝(avoidPairs.ts) — 하나의 흐름 avoid 옵션 (styleseed-team-docs 라운드 22, 찾은 문제 P22)
// AI 보조 심판이 짚고 정답 코디도 피하는 짝만: 네이비 ↔ 검정(겉옷·하의), 티셔츠 × 코트·패딩
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
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "styleseed-avoid-"));
  execFileSync(
    path.join(root, "node_modules/.bin/tsc"),
    ["--ignoreConfig", "--outDir", outDir, "--rootDir", "src", "--module", "commonjs", "--target", "es2022",
      "--moduleResolution", "node", "--ignoreDeprecations", "6.0", "--skipLibCheck", "--esModuleInterop",
      "src/utils/outfitFlow.ts", "src/utils/avoidPairs.ts"],
    { cwd: root, stdio: "pipe" },
  );
  const req = createRequire(path.join(outDir, "index.js"));
  return { F: req(path.join(outDir, "utils/outfitFlow.js")), A: req(path.join(outDir, "utils/avoidPairs.js")) };
};

const { F, A } = load();
const ALL = ["spring", "summer", "fall", "winter"];
const c = (id, category, subCategory, color, material = "cotton") => ({
  id, name: `${color} ${subCategory}`, category, subCategory, color, colorTone: "muted", fit: "regular",
  material, season: ALL, tpo: ["office"], style: ["classic"],
});

test("피하는 짝 찾기: 네이비 겉옷 + 검정 하의, 티셔츠 + 코트", () => {
  assert.deepEqual(A.avoidHits([c(1, "top", "shirt", "white"), c(2, "bottom", "slacks", "black"), c(3, "outer", "blazer", "navy")]), ["navy-outer-black-bottom"]);
  assert.deepEqual(A.avoidHits([c(1, "top", "tshirt", "white"), c(2, "bottom", "jeans", "blue", "denim"), c(3, "outer", "coat", "brown", "wool")]), ["tshirt-heavy-outer"]);
  assert.deepEqual(A.avoidHits([c(1, "top", "shirt", "white"), c(2, "bottom", "slacks", "gray"), c(3, "outer", "blazer", "navy")]), []);
  assert.equal(A.avoidPenalty([c(1, "top", "tshirt", "white"), c(2, "bottom", "slacks", "black"), c(3, "outer", "coat", "navy", "wool")]), 2 * A.AVOID_PENALTY);
});

test("롱부츠(long-boots) × 긴 바지는 피하는 짝, 롱부츠 × 치마와 일반 부츠(boots) × 바지는 아니다", () => {
  const longBoots = c(5, "shoes", "long-boots", "brown", "leather");
  assert.deepEqual(A.avoidHits([c(1, "top", "knit", "pink"), c(2, "bottom", "slacks", "white"), longBoots]), ["long-boots-long-pants"]);
  assert.deepEqual(A.avoidHits([c(1, "top", "knit", "pink"), c(2, "bottom", "skirt", "beige"), longBoots]), []);
  assert.deepEqual(A.avoidHits([c(1, "top", "knit", "pink"), c(2, "bottom", "slacks", "white"), c(6, "shoes", "boots", "brown", "leather")]), []);
});

test("avoid는 기본으로 꺼져 있고, 켜면 피하는 짝이 든 코디가 1위에서 밀린다", () => {
  const blazer = c(10, "outer", "blazer", "navy", "wool");
  const closet = [c(1, "top", "shirt", "white"), c(2, "bottom", "slacks", "black"), c(3, "bottom", "slacks", "gray"), c(4, "shoes", "loafer", "black", "leather"), blazer];
  const on = F.recommendOutfits({ closet, fixed: blazer, options: { avoid: true } }).looks;
  assert.equal(A.avoidHits(on[0].items).length, 0);
  const off = F.recommendOutfits({ closet, fixed: blazer }).looks;
  const offOpt = F.recommendOutfits({ closet, fixed: blazer, options: { avoid: false } }).looks;
  assert.deepEqual(off.map((l) => l.key), offOpt.map((l) => l.key));
});
