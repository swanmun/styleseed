/**
 * 옷의 보온(clo)과 기온별 적당한 보온 범위 — 하나의 흐름의 날씨 두께 판단(시험 옵션)
 *
 * 1) 옷 한 벌의 보온 = 세부종류별 clo 값 × 소재 보정
 *    clo 값은 국제 표준 표(ISO 9920, ASHRAE 55 표 5.2.2.2B)를 pythermalcomfort 문서
 *    (clo_individual_garments)에서 옮겼다. 표에 없는 종류는 가장 가까운 항목으로 맞췄다(≈ 표시).
 * 2) 코디의 보온 = 옷 clo의 합(표준의 합산법. 가방·액세서리는 뺌, 목도리만 조금 더함)
 * 3) 기온별 목표 = 한국 "기온별 옷차림" 표의 대표 차림을 위 clo 값으로 더한 값을 이은 선
 *    28°C 반팔+반바지+샌들 0.20 / 25°C 반팔·얇은 셔츠+면바지 0.30 / 21°C 긴팔+면바지(+얇은 가디건) 0.50 /
 *    18°C 니트·맨투맨+청바지 0.65 / 14°C 재킷·가디건+니트+청바지 0.95 / 10°C 트렌치·재킷+니트 1.05 /
 *    6°C 코트+니트 1.20 / 2°C 두꺼운 코트·패딩+니트 1.40 / −5°C 이하 1.60
 *
 * 두께 정보(얇음/두꺼움)가 옷 속성에 생기면 소재 보정 대신 그것을 쓴다(styleseed-team-docs 칸 B).
 */
import type { Clothing } from "../types";

// 세부종류별 기본 clo (≈ 는 표에 같은 이름이 없어 가까운 항목으로 맞춘 값)
const BASE_CLO: Record<string, number> = {
  // 상의
  tshirt: 0.08, // T-shirt
  sleeveless: 0.12, // Sleeveless scoop-neck blouse
  blouse: 0.2, // ≈ Short-sleeve dress shirt 0.19 ~ Long sleeve shirt (thin) 0.25
  shirt: 0.25, // Long sleeve shirt (thin) / Long-sleeve dress shirt
  sweatshirt: 0.34, // Long-sleeve sweat shirt
  hoodie: 0.34, // ≈ Long-sleeve sweat shirt
  knit: 0.36, // ≈ Long sleeve shirt (thick)
  // 하의
  shorts: 0.08, // Walking shorts
  skirt: 0.14, // Thin skirt
  slacks: 0.15, // Thin trousers
  leggings: 0.15, // ≈ Thin trousers
  trousers: 0.2, // ≈ Thin 0.15 ~ Thick trousers 0.24
  jeans: 0.24, // ≈ Thick trousers
  // 원피스
  "mini-dress": 0.29, // ≈ Short-sleeve shirt dress
  "midi-dress": 0.33, // ≈ Long-sleeve shirt dress (thin)
  "maxi-dress": 0.33, // ≈ Long-sleeve shirt dress (thin)
  jumpsuit: 0.33, // ≈ Long-sleeve shirt dress (thin)
  // 아우터
  vest: 0.17, // Sleeveless vest (thick)
  "padded-vest": 0.25, // ≈ 패딩 조끼(표에 없음)
  cardigan: 0.25, // ≈ Long sleeve shirt (thin)
  jacket: 0.36, // ≈ Single-breasted coat (thin)
  blazer: 0.36, // ≈ Single-breasted coat (thin)
  coat: 0.44, // Single-breasted coat (thick)
  padding: 0.6, // ≈ 패딩(표에 없음, 두꺼운 코트 0.48보다 따뜻하게)
  // 신발
  boots: 0.1, // Boots
  "long-boots": 0.1, // ≈ Boots (롱부츠. 앱 분류에는 아직 없음, 라운드 23)
  sneakers: 0.02, // Shoes or sandals
  loafer: 0.02,
  heels: 0.02,
  flats: 0.02,
  sandals: 0.02,
  // 액세서리
  scarf: 0.05, // ≈ 목도리(표에 없음)
};

// 소재 보정(두께 정보가 없을 때의 대신)
const MATERIAL_FACTOR: Record<string, number> = {
  wool: 1.2,
  knit: 1.2,
  leather: 1.1,
  linen: 0.8,
  silk: 0.8,
};

export const itemClo = (item: Clothing) => {
  const base = BASE_CLO[item.subCategory] ?? 0;
  return base * (MATERIAL_FACTOR[item.material] ?? 1);
};

export const outfitClo = (items: Clothing[]) =>
  items.reduce((sum, item) => sum + itemClo(item), 0);

// 기온(°C) → 적당한 코디 보온의 가운데 값 (한국 기온별 옷차림 표 기준, 위 머리말)
const TARGET_POINTS: [number, number][] = [
  [-5, 1.6],
  [2, 1.4],
  [6, 1.2],
  [10, 1.05],
  [14, 0.95],
  [18, 0.65],
  [21, 0.5],
  [25, 0.3],
  [28, 0.2],
];

export const targetClo = (temperature: number) => {
  const pts = TARGET_POINTS;
  if (temperature <= pts[0][0]) return pts[0][1];
  if (temperature >= pts[pts.length - 1][0]) return pts[pts.length - 1][1];
  for (let i = 1; i < pts.length; i += 1) {
    const [t1, c1] = pts[i];
    if (temperature <= t1) {
      const [t0, c0] = pts[i - 1];
      return c0 + ((c1 - c0) * (temperature - t0)) / (t1 - t0);
    }
  }
  return pts[pts.length - 1][1];
};

// 이 차이까지는 같은 날씨에도 사람마다 다르게 입는 범위로 보고 깎지 않는다
export const WARMTH_TOLERANCE = 0.15;

// 날씨가 있을 때: 코디 보온이 목표에서 얼마나 벗어났나(+면 덥게, −면 춥게)
export const warmthGap = (items: Clothing[], temperature: number) =>
  outfitClo(items) - targetClo(temperature);

// 점수에서 뺄 값. 벗어난 0.1 clo마다 4점
export const warmthPenalty = (items: Clothing[], temperature: number | null) => {
  if (temperature === null) {
    return seasonMixPenalty(items);
  }
  const gap = Math.abs(warmthGap(items, temperature));
  return 40 * Math.max(0, gap - WARMTH_TOLERANCE);
};

// 날씨가 없을 때(이 옷으로 코디): 반바지·민소매에 따뜻한 겉옷(얇은 코트 이상)처럼 계절이 섞인 코디만 깎는다
export const seasonMixPenalty = (items: Clothing[]) => {
  const summerPiece = items.some((item) => item.subCategory === "shorts" || item.subCategory === "sleeveless");
  const warmOuter = items.some((item) => item.category === "outer" && itemClo(item) >= 0.36);
  return summerPiece && warmOuter ? 10 : 0;
};
