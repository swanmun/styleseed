// ⑤ 빈칸 → 상품 — gapProducts.ts 회귀 (styleseed-team-docs 라운드 17)
//
// 빈칸 채우기: 옷장에 없는 종류는 상품을 넣어 본 코디를 같은 채점표로 매겨 고른다(Complete the Look).
// 날씨 빈칸: 오늘 기온에 맞게 입을 수 없을 때만(0.3 clo 넘게 벗어남) 보온을 메우는 상품을 권한다.
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
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "styleseed-gap-"));
  execFileSync(
    path.join(root, "node_modules/.bin/tsc"),
    ["--ignoreConfig", "--outDir", outDir, "--rootDir", "src", "--module", "commonjs", "--target", "es2022",
      "--moduleResolution", "node", "--ignoreDeprecations", "6.0", "--skipLibCheck", "--esModuleInterop",
      "src/utils/gapProducts.ts"],
    { cwd: root, stdio: "pipe" },
  );
  const req = createRequire(path.join(outDir, "index.js"));
  return { G: req(path.join(outDir, "utils/gapProducts.js")), F: req(path.join(outDir, "utils/outfitFlow.js")) };
};

const { G, F } = load();
const ALL = ["spring", "summer", "fall", "winter"];
const c = (id, category, subCategory, color, material = "cotton", extra = {}) => ({
  id, name: `${color} ${subCategory}`, category, subCategory, color, colorTone: "muted", fit: "regular",
  material, season: ALL, tpo: ["casual"], style: ["casual"], ...extra,
});
const weather = (t) => ({ temperature: t, apparentTemperature: t, kind: "clear", label: "맑음", isDay: true, city: "서울", observedAt: "2026-11-09T09:00" });

const closetNoShoes = [
  c(1, "top", "tshirt", "white"),
  c(2, "top", "shirt", "navy"),
  c(3, "bottom", "jeans", "blue", "denim"),
  c(4, "bottom", "slacks", "black"),
];
const shoeProducts = [
  c(-1, "shoes", "sneakers", "white", "leather"),
  c(-2, "shoes", "loafer", "brown", "leather"),
  c(-3, "shoes", "sneakers", "red", "nylon"),
];

test("신발이 없으면 신발 상품을 넣어 본 코디 점수 순으로 고른다", () => {
  const r = G.suggestGapProducts({ closet: closetNoShoes, catalog: [...shoeProducts, c(-9, "outer", "jacket", "black")] });
  assert.equal(r.kind, "fill");
  assert.deepEqual(r.missing, ["shoes"]);
  assert.ok(r.suggestions.length > 0);
  r.suggestions.forEach((s) => {
    assert.equal(s.fills, "shoes");
    assert.equal(s.product.category, "shoes");
    assert.ok(s.look.items.some((x) => x.id === s.product.id), "추천 코디에 그 상품이 들어 있다");
  });
  for (let i = 1; i < r.suggestions.length; i++) assert.ok(r.suggestions[i - 1].value >= r.suggestions[i].value);
});

test("옷장에 이미 있는 id는 상품으로 쓰지 않는다", () => {
  const r = G.suggestGapProducts({ closet: closetNoShoes, catalog: [c(1, "shoes", "sneakers", "white")] });
  assert.equal(r.suggestions.length, 0);
});

test("상의를 골랐는데 하의가 없으면 하의가 빈칸이다(라운드 17에서 고침)", () => {
  const closet = [c(1, "top", "tshirt", "white"), c(5, "shoes", "sneakers", "white", "leather")];
  assert.deepEqual(F.recommendOutfits({ closet, fixed: closet[0] }).missing, ["bottom"]);
  const r = G.suggestGapProducts({ closet, fixed: closet[0], catalog: [c(-4, "bottom", "jeans", "blue", "denim")] });
  assert.equal(r.kind, "fill");
  assert.equal(r.suggestions[0].fills, "bottom");
});

test("다 있는 옷장, 15도면 아무것도 권하지 않는다", () => {
  const closet = [...closetNoShoes, c(5, "shoes", "sneakers", "white", "leather"), c(6, "outer", "jacket", "black")];
  const r = G.suggestGapProducts({ closet, weather: weather(15), catalog: [...shoeProducts, c(-5, "outer", "coat", "camel", "wool")] });
  assert.equal(r.kind, "none");
  assert.equal(r.suggestions.length, 0);
});

test("0도에 얇은 겉옷뿐이면 보온을 메우는 겉옷을 권한다", () => {
  const closet = [
    c(1, "top", "knit", "beige", "knit"), c(3, "bottom", "jeans", "blue", "denim"),
    c(5, "shoes", "boots", "brown", "leather"), c(6, "outer", "cardigan", "gray", "knit"),
  ];
  const coat = c(-5, "outer", "padding", "black", "nylon");
  const r = G.suggestGapProducts({ closet, weather: weather(0), catalog: [coat, c(-6, "top", "tshirt", "white")] });
  assert.equal(r.kind, "warmth");
  assert.equal(r.suggestions[0].product.id, coat.id);
  assert.ok(Math.abs(r.suggestions[0].warmthGap.after) < Math.abs(r.suggestions[0].warmthGap.before));
});

test("날씨가 없으면(옷 하나로 코디) 날씨 빈칸 상품은 없다", () => {
  const closet = [...closetNoShoes, c(5, "shoes", "sneakers", "white", "leather")];
  const r = G.suggestGapProducts({ closet, fixed: closet[0], catalog: [c(-5, "outer", "padding", "black", "nylon")] });
  assert.equal(r.kind, "none");
});

test("쓰임새: 옷장 여러 옷과 맞는 신발이 고른 옷 하나에만 맞는 신발보다 쓰임새 점수가 높다", () => {
  const SUMMER = ["summer"], COLD = ["fall", "winter"];
  const closet = [
    c(1, "top", "sleeveless", "white", "cotton", { season: SUMMER }),
    c(2, "bottom", "shorts", "gray", "cotton", { season: SUMMER }),
    c(3, "top", "hoodie", "gray", "cotton", { season: COLD }),
    c(4, "top", "sweatshirt", "navy", "cotton", { season: COLD }),
    c(5, "bottom", "jeans", "blue", "denim", { season: COLD }),
  ];
  const sandals = c(-1, "shoes", "sandals", "black", "other", { season: SUMMER });
  const sneakers = c(-2, "shoes", "sneakers", "white", "leather", { season: ALL });
  const r = G.suggestGapProducts({ closet, fixed: closet[1], catalog: [sandals, sneakers], versatility: 1 });
  const v = Object.fromEntries(r.suggestions.map((s) => [s.product.id, s.versatility]));
  assert.ok(v[sneakers.id] > v[sandals.id], JSON.stringify(v));
  assert.equal(r.suggestions[0].product.id, sneakers.id);
  // 쓰임새 0이면 예전처럼 지금 코디 점수만 본다
  const r0 = G.suggestGapProducts({ closet, fixed: closet[1], catalog: [sandals, sneakers], versatility: 0 });
  r0.suggestions.forEach((s) => {
    assert.equal(s.versatility, null);
    assert.equal(s.score, s.look.rank);
  });
});

test("사계절 쓰임새: 날씨에 걸러지는 기온이 있으면 그 기온의 기준 옷은 0점이라 쓰임새가 낮다", () => {
  const closet = [
    c(1, "top", "tshirt", "white"), c(2, "top", "knit", "beige", "knit"),
    c(3, "bottom", "jeans", "blue", "denim"), c(4, "bottom", "slacks", "black"),
  ];
  const padding = c(-1, "outer", "padding", "black", "nylon", { season: ["winter"] });
  const both = G.suggestGapProducts({ closet, catalog: [padding], weather: weather(0) });
  const one = G.suggestGapProducts({ closet, catalog: [padding], weather: weather(0), seasonTemps: null });
  // 사계절로 재면 15·25도 몫까지 평균하므로 오늘(0도) 하나로 잰 쓰임새와 다르다
  assert.notEqual(both.suggestions[0].versatility, one.suggestions[0].versatility);
});

test("오늘 날씨 먼저: 0도에 겉옷이 없으면 쓰임새가 넓어도 얇은 겉옷보다 기온을 맞추는 겉옷이 먼저", () => {
  const closet = [
    c(1, "top", "knit", "beige", "knit"), c(2, "top", "shirt", "white"),
    c(3, "bottom", "jeans", "blue", "denim"), c(4, "bottom", "slacks", "black"),
    c(5, "shoes", "boots", "brown", "leather"),
  ];
  const padding = c(-1, "outer", "padding", "black", "nylon");
  const cardigan = c(-2, "outer", "cardigan", "gray", "cotton");
  const r = G.suggestGapProducts({ closet, catalog: [cardigan, padding], weather: weather(0) });
  assert.equal(r.kind, "fill");
  assert.equal(r.suggestions[0].product.id, padding.id);
  const off = G.suggestGapProducts({ closet, catalog: [cardigan, padding], weather: weather(0), weatherFirst: false });
  assert.equal(off.suggestions.length, 2);
});

test("상품 목록 MMR: 거의 같은 상품(세부종류·색 같음)은 목록에 같이 넣지 않고, 1위는 그대로", () => {
  const sneakerA = c(-1, "shoes", "sneakers", "white", "leather");
  const sneakerB = c(-2, "shoes", "sneakers", "white", "cotton");
  const loafer = c(-3, "shoes", "loafer", "black", "leather");
  const catalog = [sneakerA, sneakerB, loafer];
  const on = G.suggestGapProducts({ closet: closetNoShoes, catalog, limit: 2 });
  const off = G.suggestGapProducts({ closet: closetNoShoes, catalog, limit: 2, productLambda: null });
  assert.equal(on.suggestions[0].product.id, off.suggestions[0].product.id);
  const sameish = (list) => list[0].product.subCategory === list[1].product.subCategory && list[0].product.color === list[1].product.color;
  assert.equal(sameish(on.suggestions), false);
});

test("날씨 빈칸 두 갈래(라운드 28): 기본은 없음, 켜면 스타일 갈래는 코디 점수가 안 떨어지는 상품만, 따뜻함 갈래 = suggestions", () => {
  const closet = [
    c(1, "top", "knit", "beige", "knit"), c(3, "bottom", "jeans", "blue", "denim"),
    c(5, "shoes", "boots", "brown", "leather"), c(6, "outer", "cardigan", "gray", "knit"),
  ];
  const catalog = [c(-5, "outer", "padding", "black", "nylon"), c(-7, "outer", "coat", "camel", "wool"), c(-8, "outer", "padding", "pink", "nylon", { style: ["street"] })];
  const off = G.suggestGapProducts({ closet, weather: weather(0), catalog });
  assert.equal(off.kind, "warmth");
  assert.equal(off.tracks, undefined);
  const on = G.suggestGapProducts({ closet, weather: weather(0), catalog, warmthTracks: true });
  assert.deepEqual(on.suggestions.map((s) => s.product.id), off.suggestions.map((s) => s.product.id), "켜도 suggestions는 그대로");
  assert.deepEqual(on.tracks.warm.map((s) => s.product.id), on.suggestions.map((s) => s.product.id));
  on.tracks.style.forEach((s) => {
    assert.ok(s.look.rank >= on.baseLook.rank, "스타일 갈래는 코디 점수가 지금보다 낮지 않다");
    assert.ok(Math.abs(s.warmthGap.after) < Math.abs(s.warmthGap.before), "스타일 갈래도 지금보다 따뜻하다");
  });
});

test("상품 → 옷 모양: id는 음수, 빈 계절은 빈 목록", () => {
  const x = G.productToClothing({ id: 7, name: "P", brand: "B", category: "shoes", subCategory: "loafer", color: "brown", material: "leather", style: "classic", price: 1 });
  assert.equal(x.id, -7);
  assert.deepEqual(x.season, []);
  assert.deepEqual(x.style, ["classic"]);
});
