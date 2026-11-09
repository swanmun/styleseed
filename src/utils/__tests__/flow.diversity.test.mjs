// 하나의 흐름 ④ 고르기 — MMR 다양성 회귀
//
// TOP 3가 신발·아우터만 같고 상의/하의만 바뀐 비슷한 코디로 채워지지 않는지 본다
// (styleseed-team-docs 라운드 15: AI 보조 심판 13문제 MMR 11승 2패).
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
const fixture = JSON.parse(fs.readFileSync(path.join(here, "fixtures/engine-closet.json"), "utf8"));
const closet = Array.isArray(fixture) ? fixture : fixture.closet;

const loadFlow = () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "styleseed-flow-"));
  execFileSync(
    path.join(root, "node_modules/.bin/tsc"),
    [
      "--ignoreConfig",
      "--outDir", outDir,
      "--rootDir", "src",
      "--module", "commonjs",
      "--target", "es2022",
      "--moduleResolution", "node",
      "--ignoreDeprecations", "6.0",
      "--skipLibCheck",
      "--esModuleInterop",
      "src/utils/outfitFlow.ts",
    ],
    { cwd: root, stdio: "pipe" },
  );
  return createRequire(path.join(outDir, "index.js"))(path.join(outDir, "utils/outfitFlow.js"));
};

const F = loadFlow();
const meanOverlap = (looks) => {
  const pairs = [];
  for (let i = 0; i < looks.length; i++) for (let j = i + 1; j < looks.length; j++) pairs.push(F.outfitOverlap(looks[i], looks[j]));
  return pairs.reduce((a, b) => a + b, 0) / pairs.length;
};

test("MMR이 기본값이고, 1위는 점수 1위 그대로다", () => {
  const mmr = F.recommendOutfits({ closet }).looks;
  const old = F.recommendOutfits({ closet, options: { mmrLambda: null } }).looks;
  assert.equal(mmr.length, 3);
  assert.equal(mmr[0].key, old[0].key);
});

test("옷 하나로 코디: MMR TOP 3는 예전 방식보다 덜 겹친다(전체 평균)", () => {
  let mmrSum = 0;
  let oldSum = 0;
  let n = 0;
  for (const item of closet.filter((c) => ["top", "bottom"].includes(c.category))) {
    const mmr = F.recommendOutfits({ closet, fixed: item }).looks;
    const old = F.recommendOutfits({ closet, fixed: item, options: { mmrLambda: null } }).looks;
    if (mmr.length < 3 || old.length < 3) continue;
    mmrSum += meanOverlap(mmr);
    oldSum += meanOverlap(old);
    n += 1;
  }
  assert.ok(n > 0);
  assert.ok(mmrSum / n < oldSum / n, `MMR ${mmrSum / n} vs 예전 ${oldSum / n}`);
});

test("뼈대(상의+하의)가 같은 코디는 후보가 모자랄 때만 다시 나온다", () => {
  const looks = F.recommendOutfits({ closet }).looks;
  assert.equal(new Set(looks.map((l) => l.core)).size, looks.length);
});
