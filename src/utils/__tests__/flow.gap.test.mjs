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

test("파레토 앞줄(라운드 29, Ribeiro 외 2013): 두 목표 모두 지지 않는 점이 1번 앞줄, dom = 지배하는 점 수", () => {
  // A(3,1) B(1,3) C(2,2)는 서로 지배하지 않음 → 1번 앞줄. D(1,1)은 셋 모두에게 짐 → 2번 앞줄. E(0,0)은 3번
  const { front, dom } = G.paretoFronts([[3, 1], [1, 3], [2, 2], [1, 1], [0, 0]]);
  assert.deepEqual(front, [1, 1, 1, 2, 3]);
  assert.deepEqual(dom, [2, 2, 2, 1, 0]);
});

test("날씨 빈칸 줄 3개(warmthTracks: \"pareto\"): 줄 이름·이유·앞줄 번호, 따뜻함 줄 = suggestions, true일 때는 rows 없음", () => {
  const closet = [
    c(1, "top", "knit", "beige", "knit"), c(3, "bottom", "jeans", "blue", "denim"),
    c(5, "shoes", "boots", "brown", "leather"), c(6, "outer", "cardigan", "gray", "knit"),
  ];
  const catalog = [c(-5, "outer", "padding", "black", "nylon"), c(-7, "outer", "coat", "camel", "wool"), c(-8, "outer", "padding", "pink", "nylon", { style: ["street"] })];
  const v1 = G.suggestGapProducts({ closet, weather: weather(0), catalog, warmthTracks: true });
  assert.equal(v1.rows, undefined);
  const r = G.suggestGapProducts({ closet, weather: weather(0), catalog, warmthTracks: "pareto" });
  assert.deepEqual(r.rows.map((x) => x.key), ["style", "warm", "balanced"]);
  assert.deepEqual(r.suggestions.map((s) => s.product.id), v1.suggestions.map((s) => s.product.id), "켜도 suggestions는 그대로");
  r.rows.forEach((row) => {
    assert.ok(row.title.length > 0);
    assert.equal(new Set(row.items.map((s) => s.product.id)).size, row.items.length, "한 줄에 같은 상품은 한 번");
    row.items.forEach((s) => {
      assert.ok(s.front >= 1);
      assert.match(s.reason, /보온 차이 .* 코디 점수/);
      assert.ok(Math.abs(s.warmthGap.after) < Math.abs(s.warmthGap.before), "모든 줄의 상품은 지금보다 기온에 가깝다");
      assert.ok(s.look.items.some((x) => x.id === s.product.id), "보여 주는 코디에 그 상품이 들어 있다");
    });
  });
  r.rows[0].items.forEach((s) => assert.ok(s.look.rank >= r.baseLook.rank, "스타일 줄은 코디 점수가 지금 이상"));
  // 균형 줄 첫 상품은 1번 앞줄
  if (r.rows[2].items.length > 0) assert.equal(r.rows[2].items[0].front, 1);
});

test("옷장 분위기(라운드 30, Hsiao·Grauman 2018 θ): 스타일 비율과 곱의 합, 앞줄은 목표 3개도 된다", () => {
  const p = G.styleProfile([{ style: ["feminine"] }, { style: ["feminine", "classic"] }, { style: [] }, { style: ["street"] }]);
  assert.equal(p.get("feminine"), 1 / 4 + 1 / 8);
  assert.equal(p.get("classic"), 1 / 8);
  assert.equal(p.get("street"), 1 / 4);
  // 코디 [페미닌, 스트릿] = 페미닌 0.5·스트릿 0.5 → 0.5 × 0.375 + 0.5 × 0.25
  assert.equal(G.styleFit([{ style: ["feminine"] }, { style: ["street"] }], p), 0.5 * 0.375 + 0.5 * 0.25);
  const { front } = G.paretoFronts([[1, 1, 0], [1, 1, 1], [0, 2, 0]]);
  assert.deepEqual(front, [2, 1, 1]);
});

test("styleFit(라운드 30): 기본 꺼짐이면 라운드 29와 같고, 켜면 스타일 줄은 상품 한 벌의 옷장 분위기가 지금 코디보다 낮은 상품을 빼고 이유에 분위기를 적는다", () => {
  const fem = { style: ["feminine"] };
  const closet = [
    c(1, "top", "knit", "beige", "knit", fem), c(3, "bottom", "skirt", "beige", "wool", fem),
    c(5, "shoes", "boots", "brown", "leather", fem), c(6, "outer", "cardigan", "gray", "knit", fem),
  ];
  const catalog = [
    c(-8, "outer", "padding", "black", "nylon", { style: ["street"] }),
    c(-9, "outer", "padding", "pink", "nylon", fem),
    c(-7, "outer", "coat", "camel", "wool", { style: ["street"] }),
  ];
  const base = { closet, weather: weather(0), catalog, warmthTracks: "pareto" };
  const r29 = G.suggestGapProducts(base);
  const off = G.suggestGapProducts({ ...base, styleFit: false });
  assert.deepEqual(JSON.stringify(off.rows), JSON.stringify(r29.rows), "꺼 두면 라운드 29와 같다");
  const on = G.suggestGapProducts({ ...base, styleFit: true });
  const baseFit = G.styleFit(on.baseLook.items, G.styleProfile(closet));
  assert.ok(off.rows[0].items.some((s) => s.product.id === -8 || s.product.id === -7), "꺼 두면 스트릿 상품도 스타일 줄에 들어온다(이 시험이 뜻이 있는지 확인)");
  assert.ok(on.rows[0].items.length > 0);
  on.rows[0].items.forEach((s) => {
    assert.ok(G.styleFit([s.product], G.styleProfile(closet)) >= baseFit - 1e-9, "스타일 줄은 상품의 옷장 분위기가 지금 코디 이상");
    assert.ok(s.product.style.includes("feminine"), "페미닌 옷장의 스타일 줄에 스트릿 상품이 없다");
    assert.match(s.reason, /옷장 분위기 상품 \d\.\d\d\(지금 코디 \d\.\d\d\)/);
  });
  assert.deepEqual(on.rows[1].items.map((s) => s.product.id), off.rows[1].items.map((s) => s.product.id), "따뜻함 줄은 그대로");
});

test("상품 → 옷 모양: id는 음수, 빈 계절은 빈 목록", () => {
  const x = G.productToClothing({ id: 7, name: "P", brand: "B", category: "shoes", subCategory: "loafer", color: "brown", material: "leather", style: "classic", price: 1 });
  assert.equal(x.id, -7);
  assert.deepEqual(x.season, []);
  assert.deepEqual(x.style, ["classic"]);
});

test("strictUse(라운드 37, 기본 꺼짐): 신발이 하나도 없는 옷장에서 가을·겨울 부츠는 25도 몫이 0점이 되어 쓰임새가 내려가고, 끄면 그대로", () => {
  const closet = [
    c(1, "top", "tshirt", "white"), c(2, "top", "knit", "beige", "knit"),
    c(3, "bottom", "jeans", "blue", "denim"), c(4, "bottom", "slacks", "black"),
  ];
  const boots = c(-1, "shoes", "boots", "brown", "leather", { season: ["fall", "winter"] });
  const loafer = c(-2, "shoes", "loafer", "black", "leather");
  const v = (options) => Object.fromEntries(G.suggestGapProducts({ closet, catalog: [boots, loafer], productLambda: null, ...options })
    .suggestions.map((s) => [s.product.id, s.versatility]));
  const off = v({}), offExplicit = v({ strictUse: false }), on = v({ strictUse: true });
  assert.deepEqual(off, offExplicit);
  assert.ok(on[boots.id] < off[boots.id]);
  assert.equal(on[loafer.id], off[loafer.id]);
});
