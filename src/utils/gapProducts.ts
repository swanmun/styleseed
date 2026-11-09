import type { Clothing, ClothingCategory, Product } from "../types";

import { warmthGap } from "./clothingWarmth";

import { recommendOutfits, type FlowInput, type FlowLook } from "./outfitFlow";

import { getOutfitRole, isUpperRole } from "./taxonomyCompat";

/**
 * 하나의 흐름 ⑤ 빈칸 → 상품 (styleseed-team-docs 라운드 17, 질문 64)
 *
 * 이미 있는 방법 두 가지를 하나의 흐름 채점표 그대로 쓴다(새 규칙을 만들지 않는다).
 *
 * 1) 빈칸 채우기 (complementary item retrieval / Complete the Look)
 *    옷장에 그 종류가 아예 없으면(예: 신발이 없다), 상품 하나하나를 "넣어 본" 코디를 같은 채점표로 매겨
 *    가장 잘 어울리는 상품을 고른다.
 *    - Lin 외, "Fashion Outfit Complementary Item Retrieval", CVPR 2020 (Amazon)
 *    - Kang 외, "Complete the Look", CVPR 2019 / Li 외, KDD 2020 (Pinterest)
 *    - Han 외, Polyvore 빈칸 채우기(FITB) 시험, 2017
 * 2) 날씨 빈칸: 하나 더 사면 얼마나 나아지나 (한계 이득, marginal gain)
 *    종류는 다 있어도 오늘 기온에 맞게 입을 수 없으면(가장 좋은 코디의 보온이 목표에서 벗어남, clothingWarmth.ts)
 *    상품 하나를 더했을 때 보온 차이가 줄고 순위 점수가 오르는 상품을 고른다.
 *    예: 5도인데 얇은 재킷뿐이면 두꺼운 코트.
 *    취향만 더 좋아지는 상품("이 블레이저가 조금 더 어울려요")은 권하지 않는다: 다 있는 옷장에서
 *    그렇게 하면 상황 절반 넘게(57%) "사세요"가 나왔다(라운드 17). 상품은 빈칸에만(서비스 개념).
 *    - Hsiao·Grauman, "Creating Capsule Wardrobes from Fashion Images", CVPR 2018
 *      (옷을 하나씩 더할 때 늘어나는 궁합·쓰임새를 보고 고르는 욕심쟁이(greedy) 방식)
 *    - 앱의 CORE SHOP(prototypeCore.getCoreUpgradeSuggestions)도 "바꾸면 점수가 얼마 오르나"로 고른다
 *
 * 지금 앱의 빈칸 상품(recommendation.getMissingItemSuggestion + shop.tsx)은
 * "신발이 없으면 흰 스니커즈나 갈색 로퍼"처럼 정해 둔 답을 먼저 고르고 상품을 그 이름·색에 맞춘다.
 *
 * 주의: 채점표는 비어 있는 칸(계절·TPO)을 감점하지 않는다. 상품 속성이 비어 있으면 점수가 부풀려지므로
 *      상품도 옷장 옷과 같은 속성 분석(POST /analyze-clothing)을 거쳐 칸을 채운 뒤 넣어야 한다(라운드 17에서 찾음).
 *
 * 아직 하지 않은 것: 쓰임새(이 상품이 옷장의 옷 몇 벌과 어울리나)를 점수에 넣기, 가격·예산, 큰 카탈로그용 후보 줄이기.
 */

export type GapSuggestion = {
  product: Clothing;
  // fill: 옷장에 없는 종류를 채움 / warmth: 종류는 있지만 오늘 기온에 맞게 입을 수 없어 이 상품이 그걸 메움
  kind: "fill" | "warmth";
  // 채우는 빈칸(fill일 때)
  fills: ClothingCategory | null;
  // 이 상품이 들어간 가장 좋은 코디
  look: FlowLook;
  // fill: 그 코디의 순위 점수 / warmth: 지금 가장 좋은 코디보다 오른 순위 점수(음수일 수 있음: 날씨는 안전 규칙이라 취향 점수가 조금 내려가도 권한다)
  value: number;
  // warmth일 때 보온 차이(clo, +덥게 −춥게): 지금 → 산 뒤
  warmthGap?: { before: number; after: number };
};

export type GapInput = FlowInput & {
  // 상품을 옷 형태로 바꾼 목록. id가 옷장 옷과 겹치면 안 된다(productToClothing은 음수 id를 쓴다)
  catalog: Clothing[];
  // 빈칸마다(fill) 또는 전체(warmth)에서 몇 개까지
  limit?: number;
  // 날씨 빈칸으로 볼 보온 차이(clo). 가장 좋은 코디가 이보다 더 벗어나야 상품을 권한다.
  // 0.3: 라운드 16에서 "기온에 안 맞는 코디"로 센 기준. 0.15(점수 감점 시작)로 하면 25도에 티셔츠를 권하는 등 경보가 잦았다
  needGap?: number;
  // 상품으로 인정할 최소 보온 개선(clo)
  minCloGain?: number;
};

export type GapResult = {
  kind: "fill" | "warmth" | "none";
  // 지금 옷장만으로 만든 가장 좋은 코디(없으면 null)
  baseLook: FlowLook | null;
  missing: ClothingCategory[];
  suggestions: GapSuggestion[];
};

/**
 * 상품을 옷과 같은 모양으로 바꾼다(prototypeCore.toScorableClothing과 같은 방식).
 * 상품에 없는 값(톤·핏·TPO)은 점수에 영향이 적은 기본값.
 */
export const productToClothing = (product: Product): Clothing & { name: string } => ({
  id: -product.id,
  name: product.name,
  category: product.category,
  subCategory: product.subCategory,
  color: product.color,
  colorTone: "muted",
  fit: "regular",
  material: product.material,
  season: product.season ?? [],
  tpo: [],
  style: [product.style],
});

// 빈칸 종류에 들어갈 수 있는 상품인가(상의·하의 빈칸은 원피스로도 채울 수 있다)
const canFill = (product: Clothing, category: ClothingCategory) => {
  const role = getOutfitRole(product);

  if (category === "top") return isUpperRole(role) || role === "onePiece";
  if (category === "bottom") return role === "bottom" || role === "onePiece";
  if (category === "shoes") return role === "shoes";
  if (category === "outer") return role === "outer";

  return product.category === category;
};

export const suggestGapProducts = ({
  catalog,
  limit = 3,
  needGap = 0.3,
  minCloGain = 0.1,
  ...flow
}: GapInput): GapResult => {
  const closetIds = new Set(flow.closet.map((item) => item.id));

  const products = catalog.filter((product) => !closetIds.has(product.id));

  const base = recommendOutfits(flow);

  const baseLook = base.looks[0] ?? null;

  // 상품 하나를 옷장에 더했을 때 그 상품이 들어간 가장 좋은 코디
  const bestWith = (product: Clothing) => {
    const result = recommendOutfits({
      ...flow,
      closet: [...flow.closet, product],
      options: { ...flow.options, limit: 1 },
    });

    const look = result.looks[0];

    return look && look.items.some((item) => item.id === product.id) ? look : null;
  };

  if (base.missing.length > 0) {
    const suggestions: GapSuggestion[] = [];

    base.missing.forEach((category) => {
      const ranked: GapSuggestion[] = [];

      products
        .filter((product) => canFill(product, category))
        .forEach((product) => {
          const look = bestWith(product);

          if (look) {
            ranked.push({ product, kind: "fill", fills: category, look, value: look.rank });
          }
        });

      ranked.sort((a, b) => b.value - a.value || a.product.id - b.product.id);

      suggestions.push(...ranked.slice(0, limit));
    });

    return { kind: "fill", baseLook, missing: base.missing, suggestions };
  }

  const temperature = flow.weather ? flow.weather.apparentTemperature ?? flow.weather.temperature : null;

  if (!baseLook || temperature === null) {
    return { kind: "none", baseLook, missing: base.missing, suggestions: [] };
  }

  const before = warmthGap(baseLook.items, temperature);

  if (Math.abs(before) <= needGap) {
    return { kind: "none", baseLook, missing: [], suggestions: [] };
  }

  const ranked: GapSuggestion[] = [];

  products.forEach((product) => {
    const look = bestWith(product);

    if (!look) return;

    const after = warmthGap(look.items, temperature);

    const gain = look.rank - baseLook.rank;

    if (Math.abs(before) - Math.abs(after) >= minCloGain) {
      ranked.push({ product, kind: "warmth", fills: null, look, value: gain, warmthGap: { before, after } });
    }
  });

  // 날씨를 맞춰 주는 상품 먼저, 그 안에서 순위 점수(MATCH − 두께 감점) 높은 순
  const fixesWeather = (x: GapSuggestion) => (Math.abs(x.warmthGap!.after) <= needGap ? 1 : 0);

  ranked.sort(
    (a, b) =>
      fixesWeather(b) - fixesWeather(a) || b.look.rank - a.look.rank || a.product.id - b.product.id,
  );

  return {
    kind: ranked.length > 0 ? "warmth" : "none",
    baseLook,
    missing: [],
    suggestions: ranked.slice(0, limit),
  };
};
