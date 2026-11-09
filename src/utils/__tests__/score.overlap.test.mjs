// 시험용 채점표 overlapScore.ts — 계절·상황 점수를 겹침 계수로 (styleseed-team-docs 라운드 20, 찾은 문제 P19)
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
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "styleseed-overlap-"));
  execFileSync(
    path.join(root, "node_modules/.bin/tsc"),
    ["--ignoreConfig", "--outDir", outDir, "--rootDir", "src", "--module", "commonjs", "--target", "es2022",
      "--moduleResolution", "node", "--ignoreDeprecations", "6.0", "--skipLibCheck", "--esModuleInterop",
      "src/utils/overlapScore.ts"],
    { cwd: root, stdio: "pipe" },
  );
  const req = createRequire(path.join(outDir, "index.js"));
  return { O: req(path.join(outDir, "utils/overlapScore.js")), S: req(path.join(outDir, "utils/outfitScore.js")) };
};

const { O, S } = load();
const c = (id, category, subCategory, season, tpo = ["casual"]) => ({
  id, name: subCategory, category, subCategory, color: "black", colorTone: "muted", fit: "regular",
  material: "cotton", season, tpo, style: [],
});
const ALL = ["spring", "summer", "fall", "winter"];

test("겹침 계수: 한쪽이 다른 쪽을 다 포함하면 1, 공통이 없으면 0, 빈 목록은 빼고 하나만 남으면 0.5", () => {
  assert.equal(O.overlapCoefficient([ALL, ["fall", "winter"]]), 1);
  assert.equal(O.overlapCoefficient([["summer"], ["winter"]]), 0);
  assert.equal(O.overlapCoefficient([["fall", "winter"], ["spring", "fall"]]), 0.5);
  assert.equal(O.overlapCoefficient([["fall"], []]), 0.5);
});

test("사계절 로퍼는 지금 채점표에서 가을·겨울 부츠보다 계절 점수가 낮지만, 겹침 계수에서는 같다", () => {
  const knit = c(1, "top", "knit", ["fall", "winter"]);
  const slacks = c(2, "bottom", "slacks", ["fall", "winter"]);
  const loafer = c(3, "shoes", "loafer", ALL);
  const boots = c(4, "shoes", "boots", ["fall", "winter"]);
  const season = (items) => S.evaluateOutfit(items, items).details.find((d) => d.key === "season").score;
  assert.ok(season([knit, slacks, loafer]) < season([knit, slacks, boots]));
  const e1 = S.evaluateOutfit([knit, slacks, loafer], []);
  const e2 = S.evaluateOutfit([knit, slacks, boots], []);
  // 다른 지표가 같은 코디라 겹침 계수 총점도 같아야 한다
  assert.equal(O.overlapRescore(e1.items, e1), O.overlapRescore(e2.items, e2));
});

test("계절·상황 말고는 지금 채점표와 같은 식: 계절·상황이 이미 똑같은 코디는 총점이 그대로", () => {
  const items = [c(1, "top", "tshirt", ["summer"]), c(2, "bottom", "shorts", ["summer"]), c(3, "shoes", "sandals", ["summer"])];
  const e = S.evaluateOutfit(items, items);
  assert.equal(O.overlapRescore(items, e), e.total);
});
