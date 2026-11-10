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
  // 쓰임새를 잴 때, 상품이 그 기온에 맞지 않는데 같은 자리에 다른 옷이 없어서 "대신 쓰는 옷"으로 남은 경우도 못 쓰는 것(0점)으로 센다
  // (시험용, 기본 꺼짐. styleseed-team-docs 라운드 37, 찾은 문제 P30).
  //   날씨 거르기(buildWeatherPool)는 그 자리에 맞는 옷이 하나도 없으면 가장 가까운 옷을 남긴다. 그래서 신발이 하나도 없는 옷장에
  //   가을·겨울 부츠를 더하면 25도에도 그 부츠가 남아 "그 날씨에 못 쓰면 0점"(라운드 19)이 걸리지 않았다.
  //   판단은 상품 하나만 날씨 거르기에 넣었을 때 그 자리에 안내(대신 씀·막힘)가 붙는지로 한다(지금 화면 코드는 건드리지 않는다).
  strictUse?: boolean;
  // 상품 후보 목록(limit개)을 MMR로 고를 때의 λ(기본 0.7, 라운드 15 코디 TOP 3와 같은 값). null이면 점수 순 그대로(라운드 19까지)
  productLambda?: number | null;
  // 날씨 빈칸을 두 갈래로도 돌려준다(시험용, 기본 꺼짐. 라운드 28 질문 86, 찾은 문제 P25). 켜도 suggestions는 그대로다.
  //   style: 지금보다 따뜻해지면서(minCloGain 이상) 코디 점수(rank)가 지금 가장 좋은 코디보다 떨어지지 않는 상품 = 파레토 개선
  //          (Ribeiro 외 RecSys 2012 파레토 효율). 비어 있으면 옷장과 어울리면서 더 따뜻한 상품이 없다는 뜻(지금 옷장 코디 baseLook을 보여 줌. 추운 건 그대로일 수 있음).
  //   warm:  지금과 같은 순서(오늘 기온을 맞추는 상품 먼저) = suggestions.
  //   화면은 줄마다 이름을 붙인 여러 줄(carousel, Ferrari Dacrema 외 2021·2022)로 보여 주는 것을 생각했다.
  //   라운드 27 설문 3번: 페미닌 옷장 −5도에 숏패딩은 기온을 다 못 맞추면서(−0.48 → −0.31) 점수를 낮춤(55.9 → 48.7), 사람은 "안 권함".
  // "pareto"(라운드 29): 두 논문을 원문대로 더 적용한 판. true(라운드 28)는 그대로 둔다.
  //   - Ribeiro 외 2013(ACM TIST, RecSys 2012의 확장) "Pareto-efficient ranking": 상품마다 두 목표
  //     (따뜻함 = −|산 뒤 보온 차이|, 어울림 = 산 뒤 코디 점수 rank)를 좌표로 놓고, 어느 상품에게도 두 목표 모두 지지 않는
  //     상품들 = 1번 앞줄. 앞줄에서 하나를 뽑고 다시 앞줄을 만드는 것을 되풀이해 순서를 정한다(Algorithm 1).
  //     front = 상품이 몇 번째 앞줄인가(1이 가장 좋음).
  //   - 줄(row) 3개, 줄마다 이름(title)과 상품마다 이유(reason)를 붙인다. 줄 사이 같은 상품은 지우지 않는다
  //     (Felicioni·Ferrari Dacrema·Cremonesi UMAP 2021: 여러 줄 화면은 줄마다 다른 기준으로 만들고, 줄 사이 겹침은 그대로 둔다).
  //       style:    파레토 개선(지금 옷장 코디보다 어울림이 안 떨어지면서 더 따뜻함)만, 어울림 높은 순
  //       warm:     suggestions와 같음(오늘 기온을 맞추는 상품 먼저, 그 안에서 점수 순)
  //       balanced: Ribeiro 3.2.1 "가장 많이 이기는 상품 먼저"(앞줄에서 지배하는 상품 수 dom이 가장 큰 것)
  //   두 목표 하나만 보는 줄(style·warm)은 앞줄에서 그 목표가 가장 큰 상품을 뽑는 것과 같아서 보통 정렬과 결과가 같다.
  //   앞줄이 새로 보태는 것은 front 표시(다른 상품에 둘 다 지는 상품을 알아봄)와 balanced 줄이다.
  //   점 하나 = (상품, 그 상품이 들어간 코디) 묶음. 상품마다 상위 코디 paretoLooks개를 본다(1위 코디만 보면 놓치는 묶음이 있음, 아래 설명).
  warmthTracks?: boolean | "pareto";
  // "pareto"에서 상품마다 볼 코디 수(그 상품이 들어간 상위 코디). 기본 5
  paretoLooks?: number;
  // "pareto"에서 세 번째 목표 "옷장 분위기"를 더한다(시험용, 기본 꺼짐. 라운드 30 질문 90, 찾은 문제 P25).
  //   라운드 30에서 찾음: 코디 점수(rank)에서 스타일은 취향(preference, 무게 0.1) 안에만 있어서, 페미닌 옷장에 스트릿 패딩을 넣어도
  //   총점이 그대로(69 → 69)다. 그래서 어울림만 보는 스타일 줄이 스트릿 패딩을 1위로 냈다(라운드 29).
  //   방법(이미 있는 것 두 개가 같은 말):
  //   - Hsiao·Grauman CVPR 2018 "Creating Capsule Wardrobes" 식 (5)와 3.2절 끝: 사용자 취향 = 그 사람 코디들의 스타일 비율 평균(θ_user),
  //     스타일 i의 무게 w_i = θ_user_i, 코디가 스타일 i를 덮는 정도 = P(z_i | 코디). 여기서는 옷장에 코디 기록이 없어서 옷 한 벌씩의 평균으로 대신한다.
  //   - Pazzani·Billsus 2007 "Content-Based Recommendation Systems"(The Adaptive Web): 사용자 프로필 = 가진 물건 특징의 평균, 후보와 닮은 정도로 점수.
  //   옷장 분위기 = Σ_i θ_user_i × θ_x_i (θ = 옷마다 스타일 태그를 1/개수로 나눈 값의 평균, styleProfile·styleFit).
  //   x는 **상품 한 벌**이다(Pazzani·Billsus: 추천하는 물건과 사용자 프로필을 비교). 처음에는 Hsiao 원문대로 코디 전체(x = 코디)로 쟀는데,
  //   페미닌 −5도에서 패딩과 함께 입는 나머지 3벌을 더 페미닌하게 바꿔 코디 평균을 지금과 같게(0.34) 맞춰 버려 스트릿 패딩이 그대로 1위였다.
  //   사는 것은 상품 한 벌이라 상품 단위로 바꿨다(swanmun 2026-11-10 "상품 단위"). 상품 단위면 스트릿 패딩 0.00 → 스타일 줄에서 빠짐.
  //   켜면: 앞줄을 목표 3개(따뜻함·어울림·상품의 옷장 분위기)로 만들고, 스타일 줄은 어울림이 지금 코디 이상이면서
  //   상품의 옷장 분위기가 지금 코디의 옷장 분위기(= 옷마다 분위기의 평균) 이상인 묶음만.
  styleFit?: boolean;
};

/**
 * 스타일 비율(라운드 30, Hsiao·Grauman 2018 θ). 옷마다 스타일 태그를 1/개수로 나누고 옷 수로 평균한다.
 * 태그가 없는 옷은 0으로 센다(평균의 분모에는 들어간다).
 */
export const styleProfile = (items: Clothing[]) => {
  const profile = new Map<string, number>();

  if (items.length === 0) return profile;

  items.forEach((item) => {
    const styles = item.style ?? [];

    styles.forEach((style) => profile.set(style, (profile.get(style) ?? 0) + 1 / styles.length / items.length));
  });

  return profile;
};

/**
 * 옷장 분위기(라운드 30): 옷장 스타일 비율과 옷들(상품 한 벌이면 [상품])의 스타일 비율의 곱의 합(Hsiao·Grauman 2018 식 5의 w_i × P(z_i|x)). 0~1.
 * 비율이 옷마다의 평균이라, 여러 벌의 옷장 분위기 = 옷 한 벌씩의 옷장 분위기의 평균이다.
 */
export const styleFit = (lookItems: Clothing[], closetProfile: Map<string, number>) => {
  let sum = 0;

  styleProfile(lookItems).forEach((share, style) => (sum += share * (closetProfile.get(style) ?? 0)));

  return sum;
};

export type GapRow = {
  key: "style" | "warm" | "balanced";
  title: string;
  items: (GapSuggestion & { front: number; reason: string })[];
};

export type GapResult = {
  kind: "fill" | "warmth" | "none";
  // 지금 옷장만으로 만든 가장 좋은 코디(없으면 null)
  baseLook: FlowLook | null;
  missing: ClothingCategory[];
  suggestions: GapSuggestion[];
  // warmthTracks를 켜고 날씨 빈칸일 때만
  tracks?: { style: GapSuggestion[]; warm: GapSuggestion[] };
  // warmthTracks: "pareto"이고 날씨 빈칸일 때만. 화면의 줄 순서대로(스타일 → 따뜻함 → 균형)
  rows?: GapRow[];
};

/**
 * 파레토 앞줄 나누기(Ribeiro 외 2013 Algorithm 1의 앞줄). 점이 모든 목표에서 다른 점 이상이고 하나라도 크면 그 점을 지배한다.
 * 목표 수는 몇 개든 된다(라운드 29는 2개, 라운드 30 styleFit은 3개).
 * 돌려주는 값: 점마다 앞줄 번호(1부터)와 지배하는 점 수(dom).
 */
export const paretoFronts = (points: number[][]) => {
  const dominates = (p: number[], q: number[]) =>
    p.every((v, k) => v >= q[k]) && p.some((v, k) => v > q[k]);

  const dom = points.map((p) => points.filter((q) => dominates(p, q)).length);

  const front = points.map(() => 0);

  let left = points.map((_, i) => i);

  for (let level = 1; left.length > 0; level++) {
    const now = left.filter((i) => !left.some((j) => j !== i && dominates(points[j], points[i])));

    now.forEach((i) => (front[i] = level));

    left = left.filter((i) => !now.includes(i));
  }

  return { front, dom };
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
  strictUse = false,
  productLambda = 0.7,
  warmthTracks = false,
  paretoLooks = 5,
  styleFit: useStyleFit = false,
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

      // 시험 옵션 strictUse: 혼자서는 그 날씨에 맞지 않는 상품은 그 기온에서 0점
      if (
        strictUse &&
        weather &&
        buildWeatherPool([product], getWeatherRule(weather)).notes.some((note) => slots.includes(note.category))
      ) {
        perContext.push(0);

        return;
      }

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
  // 보온표(시험 옵션 cloTable, 라운드 32). 하나의 흐름과 같은 표로 보온 차이를 잰다
  const cloTable = flow.options?.cloTable ?? "ashrae";

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
        !weatherFirst || todayTemp === null || Math.abs(warmthGap(x.look.items, todayTemp, cloTable)) <= needGap ? 1 : 0;

      ranked.sort((a, b) => okToday(b) - okToday(a) || b.value - a.value || a.product.id - b.product.id);

      suggestions.push(...pickProducts(ranked, okToday));
    });

    return { kind: "fill", baseLook, missing: base.missing, suggestions };
  }

  const temperature = todayTemp;

  if (!baseLook || temperature === null) {
    return { kind: "none", baseLook, missing: base.missing, suggestions: [] };
  }

  const before = warmthGap(baseLook.items, temperature, cloTable);

  if (Math.abs(before) <= needGap) {
    return { kind: "none", baseLook, missing: [], suggestions: [] };
  }

  const ranked: GapSuggestion[] = [];

  products.forEach((product) => {
    const look = bestWith(product);

    if (!look) return;

    const after = warmthGap(look.items, temperature, cloTable);

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

  const suggestions = pickProducts(ranked, fixesWeather);

  if (!warmthTracks) {
    return { kind: ranked.length > 0 ? "warmth" : "none", baseLook, missing: [], suggestions };
  }

  // 스타일 갈래: 코디 점수가 떨어지지 않는 상품만, 점수(지금 코디 + 쓰임새) 높은 순
  const styleRanked = ranked
    .filter((x) => x.look.rank >= baseLook.rank)
    .sort((a, b) => b.score - a.score || a.product.id - b.product.id);

  const tracks = { style: pickProducts(styleRanked, () => 0), warm: suggestions };

  if (warmthTracks !== "pareto") {
    return { kind: ranked.length > 0 ? "warmth" : "none", baseLook, missing: [], suggestions, tracks };
  }

  // 비교하는 것 = (상품, 그 상품이 들어간 코디) 묶음. 사용자에게 보이는 추천이 이 묶음이기 때문이다.
  // 라운드 29에서 찾음: 상품마다 1위 코디 하나만 보면, 페미닌 옷장 −5도에 패딩을 더했을 때 1위가 "니트 원피스 + 패딩"(−0.49, 더 따뜻해지지 않음)이라
  // 상품이 빠진다. 같은 패딩의 2위 코디 "슬림 니트 + 플리츠 스커트 + 패딩"은 −0.32로 따뜻하고 점수도 지금보다 높다(62.3 > 55.9).
  const pairs: GapSuggestion[] = [];

  const versatilityCache = new Map<number, number | null>();

  products.forEach((product) => {
    const result = recommendOutfits({ ...flow, closet: [...flow.closet, product], options: { ...flow.options, limit: paretoLooks } });

    result.looks
      .filter((look) => look.items.some((item) => item.id === product.id))
      .forEach((look) => {
        const after = warmthGap(look.items, temperature, cloTable);

        if (Math.abs(before) - Math.abs(after) < minCloGain) return;

        if (!versatilityCache.has(product.id)) versatilityCache.set(product.id, versatility > 0 ? versatilityOf(product) : null);

        const v = versatilityCache.get(product.id)!;

        const score = v === null ? look.rank : (1 - versatility) * look.rank + versatility * v;

        pairs.push({ product, kind: "warmth", fills: null, look, value: look.rank - baseLook.rank, versatility: v, score, warmthGap: { before, after } });
      });
  });

  // 옷장 분위기(styleFit을 켰을 때만, 라운드 30): 옷장 스타일 비율은 상품을 더하기 전 옷장으로 잰다
  const closetProfile = styleProfile(flow.closet);

  // 상품 한 벌의 옷장 분위기
  const fitOf = (x: GapSuggestion) => styleFit([x.product], closetProfile);

  // 지금 코디의 옷장 분위기(옷마다 분위기의 평균)
  const baseFit = styleFit(baseLook.items, closetProfile);

  // 목표 좌표: 따뜻함 = −|산 뒤 보온 차이|(기온에 가까울수록 큼), 어울림 = 산 뒤 코디 점수 (+ styleFit이면 상품의 옷장 분위기)
  const points = pairs.map((x) =>
    useStyleFit ? [-Math.abs(x.warmthGap!.after), x.look.rank, fitOf(x)] : [-Math.abs(x.warmthGap!.after), x.look.rank],
  );

  const { front, dom } = paretoFronts(points);

  const info = new Map(pairs.map((x, i) => [x, { front: front[i], dom: dom[i] }]));

  // 한 줄에 같은 상품은 한 번만(그 줄 기준으로 가장 앞에 온 코디)
  const onePerProduct = (list: GapSuggestion[]) => {
    const seen = new Set<number>();

    return list.filter((x) => (seen.has(x.product.id) ? false : (seen.add(x.product.id), true)));
  };

  const f2 = (n: number) => (n >= 0 ? "+" : "") + n.toFixed(2);

  const withReason = (x: GapSuggestion) => ({
    ...x,
    front: info.get(x)!.front,
    reason:
      `보온 차이 ${f2(x.warmthGap!.before)} → ${f2(x.warmthGap!.after)}${fixesWeather(x) ? "(기온 맞춤)" : "(아직 추움)"}, 코디 점수 ${baseLook.rank.toFixed(1)} → ${x.look.rank.toFixed(1)}` +
      (useStyleFit ? `, 옷장 분위기 상품 ${fitOf(x).toFixed(2)}(지금 코디 ${baseFit.toFixed(2)})` : ""),
  });

  // 스타일: 파레토 개선(어울림이 지금 옷장 코디 이상, styleFit이면 상품의 옷장 분위기도 지금 코디 이상)만, 점수(코디 + 쓰임새) 높은 순
  // 옷장 분위기는 소수점 아래 아주 작은 차이(계산 오차)를 같다고 본다
  const notWorseFit = (x: GapSuggestion) => !useStyleFit || fitOf(x) >= baseFit - 1e-9;

  const styleRow = pickProducts(
    onePerProduct(
      pairs.filter((x) => x.look.rank >= baseLook.rank && notWorseFit(x)).sort((a, b) => b.score - a.score || a.product.id - b.product.id),
    ),
    () => 0,
  );

  // 따뜻함: 오늘 기온을 맞추는 묶음 먼저, 그 안에서 점수 순(suggestions와 같은 기준, 대상만 묶음)
  const warmRow = pickProducts(
    onePerProduct([...pairs].sort((a, b) => fixesWeather(b) - fixesWeather(a) || b.score - a.score || a.product.id - b.product.id)),
    fixesWeather,
  );

  // 균형: 남은 묶음의 앞줄에서 dom이 가장 큰 것을 뽑고 빼기를 되풀이(Ribeiro 3.2.1). dom은 처음 전체에서 센 값을 그대로 쓴다.
  // 뽑은 상품의 다른 코디 묶음도 함께 뺀다(한 줄에 같은 상품 한 번)
  const balanced: GapSuggestion[] = [];

  let left = [...pairs];

  while (balanced.length < limit && left.length > 0) {
    const pts = left.map((x) => points[pairs.indexOf(x)]);

    const leftFronts = paretoFronts(pts).front;

    const firstFront = left.filter((_, i) => leftFronts[i] === 1);

    firstFront.sort((a, b) => info.get(b)!.dom - info.get(a)!.dom || b.score - a.score || a.product.id - b.product.id);

    balanced.push(firstFront[0]);

    left = left.filter((x) => x.product.id !== firstFront[0].product.id);
  }

  const rows: GapRow[] = [
    { key: "style", title: "옷장과 어울리면서 더 따뜻하게", items: styleRow.map(withReason) },
    { key: "warm", title: "오늘 추위를 확실히 막는 겉옷", items: warmRow.map(withReason) },
    { key: "balanced", title: "따뜻함과 어울림을 고르게", items: balanced.map(withReason) },
  ];

  // pareto에서는 묶음이 하나라도 있으면 날씨 빈칸으로 본다(suggestions는 그대로 1위 코디 방식이라 비어 있을 수 있음)
  return { kind: pairs.length > 0 || ranked.length > 0 ? "warmth" : "none", baseLook, missing: [], suggestions, tracks, rows };
};
