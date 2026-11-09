import type { WeatherSnapshot } from "../lib/weather";

import type { Clothing, ClothingCategory, Product } from "../types";

import { warmthGap } from "./clothingWarmth";

import { recommendOutfits, type FlowInput, type FlowLook } from "./outfitFlow";

import { buildWeatherPool, getWeatherRule } from "./weatherRecommendation";

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
 * 3) 쓰임새 (versatility, 라운드 18 질문 66)
 *    지금 코디 하나에만 맞는 상품(민소매에만 맞는 슬라이드, 그래픽 티에만 맞는 트랙 팬츠)을 피한다.
 *    옷장의 다른 옷(기준 옷: 신발이면 상의·하의·원피스, 하의면 상의 …)을 하나씩 "이 옷으로 코디"의 고른 옷으로 놓고,
 *    상품을 더한 옷장에서 나오는 가장 좋은 코디의 순위 점수를 평균한다.
 *    = 캡슐 옷장 논문의 궁합 항목 C(옷장 안 코디들의 궁합)가 상품 하나로 늘어나는 양. 상품이 안 쓰인 기준 옷은
 *      상품이 없을 때와 점수가 같아 늘어난 양이 0이다(어느 상품이든 같은 기준이라 평균으로 줄 세워도 된다).
 *    최종 점수 = (1 − w) × 지금 코디 점수 + w × 쓰임새. w 기본 1: 그 종류가 옷장에 하나도 없으면 산 상품은
 *    앞으로 그 종류가 필요한 모든 코디에 들어가므로, 옷장 전체에서 늘어나는 값만 보는 것이 캡슐 옷장 목표와 같다.
 *    (라운드 18: w 0.5는 57개 상황 중 12개만 바뀌어 거의 차이가 없었다. w 1 vs 0 AI 보조 심판 3승 1패 1무.
 *     다만 w 1도 지금 앱의 정해 둔 답과는 5승 6패 — 계절에 따라 못 쓰는 옷(첼시 부츠·슬라이드)과 격식은 아직 못 본다)
 *
 * 4) 사계절 쓰임새 (라운드 19 질문 68)
 *    쓰임새를 오늘 날씨 하나로만 재면 첼시 부츠(가을·겨울용)도 사계절 옷과 다 맞는 것처럼 나온다(라운드 18 P17).
 *    그 종류가 옷장에 하나뿐이면 일 년 내내 그것만 쓴다. 그래서 대표 기온 몇 개(seasonTemps, 기본 5·15·25도 =
 *    겨울 문턱·봄가을·여름, 라운드 16의 한국 기온별 옷차림 표 구간)에서 각각 기준 옷마다 코디를 만들어 본다.
 *    기온마다 평균을 낸 뒤 기온끼리 다시 평균한다(계절마다 같은 무게). 오늘 날씨가 있으면 그 기온도 하나 더 넣는다.
 *    그 기온에 상품을 못 쓰면(날씨에 걸러져 그 자리가 빈 코디가 되면) 그 기준 옷은 0점이다. 겉옷이 필요 없는 기온에
 *    겉옷을 안 입는 것은 실패가 아니다(그 코디 점수를 그대로 쓴다 → 어느 겉옷이든 같은 점수라 순위에 영향 없음).
 *    캡슐 옷장 논문의 V(쓰임새: 여러 상황을 두루 덮는가)를 "여러 계절을 두루 덮는가"로 옮긴 것이다.
 *
 * 아직 하지 않은 것: 가격·예산, 큰 카탈로그용 후보 줄이기(상품 수 × 기준 옷 수만큼 하나의 흐름을 돈다).
 */

export type GapSuggestion = {
  product: Clothing;
  // fill: 옷장에 없는 종류를 채움 / warmth: 종류는 있지만 오늘 기온에 맞게 입을 수 없어 이 상품이 그걸 메움
  kind: "fill" | "warmth";
  // 채우는 빈칸(fill일 때)
  fills: ClothingCategory | null;
  // 이 상품이 들어간 가장 좋은 코디
  look: FlowLook;
  // fill: 줄 세운 점수(score와 같음) / warmth: 지금 가장 좋은 코디보다 오른 순위 점수(음수일 수 있음: 날씨는 안전 규칙이라 취향 점수가 조금 내려가도 권한다)
  value: number;
  // 쓰임새: 기준 옷마다 가장 좋은 코디 순위 점수의 평균(기준 옷이 없으면 null)
  versatility: number | null;
  // 줄 세운 점수 = (1 − w) × look.rank + w × versatility
  score: number;
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
  // 쓰임새 무게 w (0~1, 기본 1). 0이면 지금 코디 하나만 본다(라운드 17 방식)
  versatility?: number;
  // 쓰임새를 잴 대표 기온(°C). 기본 [5, 15, 25]. null이면 오늘 날씨 하나로만 잰다(라운드 18 방식)
  seasonTemps?: number[] | null;
  // 빈칸 채우기에서 오늘 기온을 맞춰 주는 상품을 먼저 세운다(기본 켬). false면 라운드 17·18 방식
  weatherFirst?: boolean;
  // 상품 후보 목록(limit개)을 MMR로 고를 때의 λ(기본 0.7, 라운드 15 코디 TOP 3와 같은 값). null이면 점수 순 그대로(라운드 19까지)
  productLambda?: number | null;
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
  versatility = 1,
  seasonTemps = [5, 15, 25],
  weatherFirst = true,
  productLambda = 0.7,
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

  // 쓰임새를 잴 날씨들: 오늘 날씨(있으면) + 대표 기온. 대표 기온이 없으면 오늘 날씨 하나(없으면 날씨 없음)
  const atTemp = (temperature: number): WeatherSnapshot => ({
    temperature,
    apparentTemperature: temperature,
    kind: "clear",
    label: "맑음",
    isDay: true,
    city: null,
    observedAt: flow.weather?.observedAt ?? "",
  });

  const contexts: (WeatherSnapshot | null)[] =
    seasonTemps && seasonTemps.length > 0
      ? [...(flow.weather ? [flow.weather] : []), ...seasonTemps.map(atTemp)]
      : [flow.weather ?? null];

  // 상품이 채우는 자리
  const slotOf = (product: Clothing): ClothingCategory[] => {
    const role = getOutfitRole(product);

    if (role === "shoes") return ["shoes"];
    if (role === "bottom") return ["bottom"];
    if (isUpperRole(role)) return ["top"];
    if (role === "outer") return ["outer"];
    if (role === "onePiece") return ["top", "bottom"];

    return [];
  };

  // 기준 옷: 상품과 같이 입을 옷 중 그 날씨에 입을 수 있는 것
  const anchorsFor = (product: Clothing, weather: WeatherSnapshot | null) => {
    const role = getOutfitRole(product);

    const wearable = weather ? buildWeatherPool(flow.closet, getWeatherRule(weather)).pool : flow.closet;

    return wearable.filter((item) => {
      const other = getOutfitRole(item);

      if (role === "shoes") return isUpperRole(other) || other === "bottom" || other === "onePiece";
      if (role === "bottom") return isUpperRole(other);
      if (isUpperRole(role)) return other === "bottom";
      if (role === "onePiece") return other === "shoes";
      if (role === "outer") return isUpperRole(other) || other === "onePiece";

      return false;
    });
  };

  const versatilityOf = (product: Clothing) => {
    const slots = slotOf(product);

    const perContext: number[] = [];

    contexts.forEach((weather) => {
      const anchors = anchorsFor(product, weather);

      if (anchors.length === 0) return;

      const ranks = anchors.map((anchor) => {
        const result = recommendOutfits({
          closet: [...flow.closet, product],
          fixed: anchor,
          weather,
          options: { ...flow.options, limit: 1 },
        });

        const look = result.looks[0];

        // 그 날씨에 상품을 못 써서 그 자리가 비면 실패(0점)
        if (!look || result.missing.some((category) => slots.includes(category))) return 0;

        return look.rank;
      });

      perContext.push(ranks.reduce((sum, rank) => sum + rank, 0) / ranks.length);
    });

    return perContext.length > 0
      ? perContext.reduce((sum, value) => sum + value, 0) / perContext.length
      : null;
  };

  const scored = (product: Clothing, look: FlowLook) => {
    const v = versatility > 0 ? versatilityOf(product) : null;

    return { versatility: v, score: v === null ? look.rank : (1 - versatility) * look.rank + versatility * v };
  };

  const todayTemp = flow.weather ? flow.weather.apparentTemperature ?? flow.weather.temperature : null;

  // 상품 후보 목록 고르기(라운드 20 질문 72, 찾은 문제 P20: 흰 스니커즈와 흰 가죽 스니커즈가 같이 나옴)
  // MMR(Carbonell·Goldstein 1998, 라운드 15와 같은 방법): 다음 상품 = λ × 점수/100 − (1−λ) × 이미 고른 상품과 가장 비슷한 정도.
  // 비슷한 정도 = 세부종류와 색이 둘 다 같으면 1(사용자 눈에 거의 같은 상품, 예: 흰 스니커즈 vs 흰 가죽 스니커즈), 아니면 0.
  //   라운드 20에서 두 번 바꿨다: ① 세부종류 0.5 + 색 0.5 → 검정 로퍼와 색이 겹친다며 검정 메리제인을 밀어냄
  //   ② 세부종류만 같아도 0.5 → 상품 목록이 작으면 슬랙스 두 벌 대신 플리츠 스커트, 스니커즈 두 켤레 대신 메리제인이 끼어듦.
  //   그래서 P20이 지적한 "거의 같은 상품"만 겹침으로 본다.
  // 안전 단계(오늘 기온을 맞추는가)는 그대로 먼저 본다. 1위는 늘 점수 1위 그대로다.
  const similarity = (a: Clothing, b: Clothing) =>
    a.subCategory === b.subCategory && a.color === b.color ? 1 : 0;

  const pickProducts = (ranked: GapSuggestion[], tier: (x: GapSuggestion) => number) => {
    if (productLambda === null) return ranked.slice(0, limit);

    const picked: GapSuggestion[] = [];

    const pool = [...ranked];

    while (picked.length < limit && pool.length > 0) {
      let best = 0;

      let bestKey = -Infinity;

      pool.forEach((candidate, index) => {
        const maxSim = picked.reduce((m, x) => Math.max(m, similarity(candidate.product, x.product)), 0);

        const key = tier(candidate) * 10 + productLambda * (candidate.score / 100) - (1 - productLambda) * maxSim;

        if (key > bestKey) {
          bestKey = key;
          best = index;
        }
      });

      picked.push(pool.splice(best, 1)[0]);
    }

    return picked;
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
            const extra = scored(product, look);

            ranked.push({ product, kind: "fill", fills: category, look, value: extra.score, ...extra });
          }
        });

      // 오늘 날씨가 있으면 오늘 기온을 맞춰 주는 상품(산 뒤 코디 보온이 목표에서 needGap 안)을 먼저 세운다.
      // 날씨는 안전 규칙이라 쓰임새보다 앞선다(결정 44). 라운드 19: 사계절 쓰임새만 보면 0도에 숏패딩 대신
      // 바람막이를 골랐다(숏패딩은 15·25도에 못 입어 평균이 깎임)
      const okToday = (x: GapSuggestion) =>
        !weatherFirst || todayTemp === null || Math.abs(warmthGap(x.look.items, todayTemp)) <= needGap ? 1 : 0;

      ranked.sort((a, b) => okToday(b) - okToday(a) || b.value - a.value || a.product.id - b.product.id);

      suggestions.push(...pickProducts(ranked, okToday));
    });

    return { kind: "fill", baseLook, missing: base.missing, suggestions };
  }

  const temperature = todayTemp;

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
      ranked.push({ product, kind: "warmth", fills: null, look, value: gain, warmthGap: { before, after }, ...scored(product, look) });
    }
  });

  // 날씨를 맞춰 주는 상품 먼저, 그 안에서 점수(지금 코디 + 쓰임새) 높은 순
  const fixesWeather = (x: GapSuggestion) => (Math.abs(x.warmthGap!.after) <= needGap ? 1 : 0);

  ranked.sort(
    (a, b) =>
      fixesWeather(b) - fixesWeather(a) || b.score - a.score || a.product.id - b.product.id,
  );

  return {
    kind: ranked.length > 0 ? "warmth" : "none",
    baseLook,
    missing: [],
    suggestions: pickProducts(ranked, fixesWeather),
  };
};
