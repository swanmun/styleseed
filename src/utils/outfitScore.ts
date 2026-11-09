import type {
  Clothing,
  ClothingCategory,
  ClothingColor,
  ClothingFit,
  ClothingMaterial,
} from "../types";

import { joinTitles, toTitle } from "./format";

import {
  findBestMatch,
  findInnerTopForLayer,
  findTopLayerFor,
} from "./recommendation";

import { getEngineCategory, getOutfitRole, isUpperRole } from "./taxonomyCompat";

/**
 * OUTFIT EVALUATION
 *
 * 코디 한 벌을 6개 지표(각 0~100)로 평가하고 가중 합으로 MATCH SCORE를 만든다.
 * 모든 값은 옷장에 저장된 실제 속성(색상·핏·소재·계절·TPO·스타일)에서 계산한다.
 *
 * 어울리지 않는 조합이 높은 점수를 받지 않도록
 * - 겹치는 계절/상황이 적으면 크게 감점하고
 * - 상의·하의·신발이 갖춰지지 않은 코디에는 완성도 계수를 곱한다.
 */

export type OutfitScoreKey =
  | "color"
  | "fit"
  | "material"
  | "season"
  | "tpo"
  | "preference";

export type OutfitScoreDetail = {
  key: OutfitScoreKey;
  label: string;
  score: number;
  note: string;
};

export type OutfitEvaluation = {
  items: Clothing[];
  total: number;
  details: OutfitScoreDetail[];
  reasons: string[];
  tags: string[];

  // 상의·하의·신발이 얼마나 갖춰졌는지 (0~1)
  completeness: number;
};

// 지표별 가중치 (합 1.0)
const WEIGHTS: Record<OutfitScoreKey, number> = {
  color: 0.22,
  fit: 0.16,
  material: 0.14,
  season: 0.2,
  tpo: 0.18,
  preference: 0.1,
};

const NEUTRAL_COLORS: ClothingColor[] = [
  "black",
  "white",
  "gray",
  "beige",
  "brown",
  "navy",
];

// 핏을 실루엣 볼륨(1: 슬림 ~ 4: 오버사이즈)으로 환산
const FIT_VOLUME: Record<ClothingFit, number> = {
  slim: 1,
  regular: 2,
  straight: 2,
  relaxed: 3,
  wide: 3,
  oversized: 4,
};

// 소재 조합 점수 (키는 알파벳순으로 정렬해 사용)
const MATERIAL_PAIRS: Record<string, number> = {
  "knit|wool": 92,
  "cotton|denim": 88,
  "cotton|linen": 86,
  "denim|leather": 86,
  "cotton|wool": 84,
  "leather|wool": 84,
  "denim|knit": 82,
  "silk|wool": 82,
  "cotton|cotton": 78,
  "linen|silk": 78,
  "denim|denim": 70,
  "denim|silk": 64,
  "leather|linen": 58,
  "linen|wool": 56,
};

const DEFAULT_MATERIAL_SCORE = 72;

const average = (values: number[]) => {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const getPairs = <T>(items: T[]) => {
  const pairs: [T, T][] = [];

  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      pairs.push([items[i], items[j]]);
    }
  }

  return pairs;
};

const getSharedValues = <T extends string>(lists: T[][]) => {
  const nonEmpty = lists.filter((list) => list.length > 0);

  if (nonEmpty.length === 0) {
    return [];
  }

  return nonEmpty.reduce((shared, list) =>
    shared.filter((value) => list.includes(value)),
  );
};

// 겹치는 값의 비율 (교집합 / 합집합)
const getOverlapRatio = <T extends string>(lists: T[][]) => {
  const nonEmpty = lists.filter((list) => list.length > 0);

  if (nonEmpty.length < 2) {
    return 0.5;
  }

  const shared = getSharedValues(nonEmpty);

  const union = new Set(nonEmpty.flat());

  return shared.length / union.size;
};

const scoreColor = (items: Clothing[]) => {
  const pairs = getPairs(items.map((item) => item.color));

  if (pairs.length === 0) {
    return { score: 70, note: "단일 아이템" };
  }

  const scores = pairs.map(([first, second]) => {
    const firstIsNeutral = NEUTRAL_COLORS.includes(first);

    const secondIsNeutral = NEUTRAL_COLORS.includes(second);

    if (first === "multi" || second === "multi") {
      return 70;
    }

    if (first === second) {
      return 74;
    }

    if (firstIsNeutral && secondIsNeutral) {
      return 86;
    }

    if (firstIsNeutral || secondIsNeutral) {
      return 80;
    }

    // 무채색 없이 강한 색끼리 부딪히는 조합
    return 52;
  });

  const score = Math.round(average(scores));

  const note =
    score >= 84
      ? "톤이 자연스럽게 연결돼요"
      : score >= 76
        ? "안정적인 색 조합이에요"
        : score >= 66
          ? "포인트 컬러가 들어간 조합이에요"
          : "색 대비가 강한 편이에요";

  return { score, note };
};

const scoreFit = (items: Clothing[]) => {
  // 상·하의(또는 아우터) 사이의 실루엣 균형을 본다.
  // 역할 기준(taxonomyCompat): 베스트(상의 겸 레이어)는 상체, 원피스·점프수트·롬퍼는 하체 쪽으로 본다
  const upper = items.filter((item) => {
    const role = getOutfitRole(item);
    return isUpperRole(role) || role === "outer";
  });

  const lower = items.filter((item) => {
    const role = getOutfitRole(item);
    return role === "bottom" || role === "onePiece";
  });

  const differences: number[] = [];

  upper.forEach((upperItem) => {
    lower.forEach((lowerItem) => {
      differences.push(
        Math.abs(FIT_VOLUME[upperItem.fit] - FIT_VOLUME[lowerItem.fit]),
      );
    });
  });

  if (differences.length === 0) {
    return { score: 68, note: "상·하의 조합이 아직 없어요" };
  }

  const scores = differences.map((difference) => {
    if (difference === 1) {
      return 92;
    }

    if (difference === 2) {
      return 84;
    }

    if (difference === 0) {
      return 74;
    }

    return 58;
  });

  const score = Math.round(average(scores));

  const note =
    score >= 88
      ? "상·하의 실루엣 균형이 좋아요"
      : score >= 78
        ? "실루엣이 무난하게 맞아요"
        : score >= 70
          ? "비슷한 실루엣으로 정돈돼요"
          : "볼륨 차이가 큰 편이에요";

  return { score, note };
};

const getMaterialPairScore = (
  first: ClothingMaterial,
  second: ClothingMaterial,
) => {
  const key = [first, second].sort().join("|");

  return MATERIAL_PAIRS[key] ?? DEFAULT_MATERIAL_SCORE;
};

const scoreMaterial = (items: Clothing[]) => {
  const pairs = getPairs(items.map((item) => item.material));

  if (pairs.length === 0) {
    return { score: 70, note: "단일 아이템" };
  }

  const score = Math.round(
    average(pairs.map(([first, second]) => getMaterialPairScore(first, second))),
  );

  const note =
    score >= 84
      ? "소재 질감이 잘 어울려요"
      : score >= 74
        ? "무난하게 어울리는 소재예요"
        : "질감 차이가 있는 조합이에요";

  return { score, note };
};

const scoreSeason = (items: Clothing[]) => {
  const ratio = getOverlapRatio(items.map((item) => item.season));

  const score = Math.round(30 + 70 * ratio);

  const shared = getSharedValues(items.map((item) => item.season));

  const note =
    shared.length > 0
      ? `${joinTitles(shared)}에 함께 입기 좋아요`
      : "계절대가 서로 달라요";

  return { score, note };
};

const scoreTpo = (items: Clothing[]) => {
  const ratio = getOverlapRatio(items.map((item) => item.tpo));

  const score = Math.round(30 + 70 * ratio);

  const shared = getSharedValues(items.map((item) => item.tpo));

  const note =
    shared.length > 0
      ? `${joinTitles(shared)} 상황에 어울려요`
      : "활용 상황이 서로 달라요";

  return { score, note };
};

/**
 * Preference: 사용자의 취향을 별도로 입력받지 않으므로
 * "내 옷장에 많은 스타일·색"과 이 코디가 얼마나 가까운지로 계산한다.
 */
const scorePreference = (items: Clothing[], closet: Clothing[]) => {
  if (closet.length === 0) {
    return { score: 55, note: "옷장 데이터가 더 필요해요" };
  }

  const styleCount = new Map<string, number>();

  const colorCount = new Map<string, number>();

  closet.forEach((clothing) => {
    clothing.style.forEach((style) => {
      styleCount.set(style, (styleCount.get(style) ?? 0) + 1);
    });

    colorCount.set(clothing.color, (colorCount.get(clothing.color) ?? 0) + 1);
  });

  const maxStyle = Math.max(1, ...styleCount.values());

  const maxColor = Math.max(1, ...colorCount.values());

  const styleShares = items.map((item) => {
    const best = Math.max(
      0,
      ...item.style.map((style) => styleCount.get(style) ?? 0),
    );

    return best / maxStyle;
  });

  const colorShares = items.map(
    (item) => (colorCount.get(item.color) ?? 0) / maxColor,
  );

  // 코디 안에서 스타일이 하나로 모이는지도 함께 본다.
  const sharedStyles = getSharedValues(items.map((item) => item.style));

  const consistency = sharedStyles.length > 0 ? 1 : 0.55;

  const score = Math.round(
    40 +
      60 *
        (average(styleShares) * 0.5 +
          average(colorShares) * 0.2 +
          consistency * 0.3),
  );

  const topStyle = [...styleCount.entries()].sort((a, b) => b[1] - a[1])[0];

  const note =
    score >= 80
      ? `평소 입는 ${topStyle ? toTitle(topStyle[0]) : "스타일"} 취향과 가까워요`
      : score >= 65
        ? "평소 취향과 어느 정도 맞아요"
        : "평소 옷장과는 다른 시도예요";

  return { score, note };
};

// 상의(또는 원피스) · 하의 · 신발이 갖춰졌는지
const getCompleteness = (items: Clothing[]) => {
  const roles = items.map(getOutfitRole);

  const hasDress = roles.includes("onePiece");

  const hasTop = roles.some(isUpperRole);

  const hasBottom = roles.includes("bottom");

  const hasShoes = roles.includes("shoes");

  const upperOk = hasDress || hasTop;

  const lowerOk = hasDress || hasBottom;

  const filled = [upperOk, lowerOk, hasShoes].filter(Boolean).length;

  return filled / 3;
};

const getTags = (items: Clothing[]) => {
  const tags: string[] = [];

  const sharedTpo = getSharedValues(items.map((item) => item.tpo));

  const sharedSeason = getSharedValues(items.map((item) => item.season));

  const sharedStyle = getSharedValues(items.map((item) => item.style));

  const tpoTagMap: Record<string, string> = {
    casual: "#데일리룩",
    office: "#오피스룩",
    date: "#데이트룩",
    formal: "#포멀",
    travel: "#트래블",
    party: "#파티룩",
  };

  const styleTagMap: Record<string, string> = {
    minimal: "#미니멀",
    classic: "#클래식",
    casual: "#캐주얼",
    street: "#스트릿",
    sporty: "#스포티",
    feminine: "#페미닌",
    vintage: "#빈티지",
  };

  if (sharedTpo[0]) {
    tags.push(tpoTagMap[sharedTpo[0]] ?? `#${sharedTpo[0]}`);
  }

  if (sharedStyle[0]) {
    tags.push(styleTagMap[sharedStyle[0]] ?? `#${sharedStyle[0]}`);
  }

  if (sharedSeason.length > 0) {
    const isCold =
      sharedSeason.includes("fall") || sharedSeason.includes("winter");

    tags.push(isCold ? "#F/W 코디" : "#S/S 코디");
  }

  return tags;
};

/**
 * 지표 6개 점수를 총점으로 합친다(가중합 × 완성도 × 약점 감점).
 * evaluateOutfit과 시험용 채점표(overlapScore.ts)가 같은 식을 쓰도록 밖으로 꺼냈다(동작은 그대로).
 */
export const combineOutfitScore = (
  details: Pick<OutfitScoreDetail, "key" | "score">[],
  completeness: number,
) => {
  const weighted = details.reduce(
    (sum, detail) => sum + detail.score * WEIGHTS[detail.key],
    0,
  );

  // 한 지표라도 크게 어긋나면(계절대가 겹치지 않는 등) 총점을 더 깎는다.
  const weakestScore = Math.min(...details.map((detail) => detail.score));

  const weakestPenalty =
    weakestScore < 40 ? 0.88 : weakestScore < 55 ? 0.94 : 1;

  // 구성이 빠진 코디는 최대 18%까지 감점
  return Math.round(weighted * (0.82 + 0.18 * completeness) * weakestPenalty);
};

export const evaluateOutfit = (
  items: Clothing[],
  closet: Clothing[],
): OutfitEvaluation => {
  const color = scoreColor(items);

  const fit = scoreFit(items);

  const material = scoreMaterial(items);

  const season = scoreSeason(items);

  const tpo = scoreTpo(items);

  const preference = scorePreference(items, closet);

  const details: OutfitScoreDetail[] = [
    { key: "color", label: "Color", ...color },
    { key: "fit", label: "Fit · Silhouette", ...fit },
    { key: "material", label: "Material", ...material },
    { key: "season", label: "Season", ...season },
    { key: "tpo", label: "TPO", ...tpo },
    { key: "preference", label: "Preference", ...preference },
  ];

  const completeness = getCompleteness(items);

  const total = combineOutfitScore(details, completeness);

  // 점수가 높은 지표 3개를 추천 이유로 보여준다.
  const reasons = [...details]
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((detail) => detail.note);

  return {
    items,
    total,
    details,
    reasons,
    tags: getTags(items),
    completeness,
  };
};

export type RankedLook = OutfitEvaluation & {
  base: Clothing;
};

const OUTFIT_PLAN: Partial<Record<ClothingCategory, ClothingCategory[]>> = {
  top: ["bottom", "shoes"],
  bottom: ["top", "shoes"],
  dress: ["shoes"],
};

/**
 * 선택한 옷을 반드시 포함하는 코디 후보를 만들고 MATCH SCORE 순으로 정렬한다.
 * (옷장에서 "이 옷을 활용한 코디"를 볼 때 사용)
 */
export const getRankedLooksForItem = (
  item: Clothing,
  clothes: Clothing[],
  limit = 3,
): RankedLook[] => {
  const others = clothes.filter((clothing) => clothing.id !== item.id);

  const itemCategory = getEngineCategory(item);

  const itemRole = getOutfitRole(item);

  const seen = new Set<string>();

  const looks: RankedLook[] = [];

  // 대분류를 정할 수 없는 옷(알 수 없는 값)은 코디를 만들지 않는다
  if (itemRole === "unknown") {
    return looks;
  }

  const addLook = (items: Clothing[]) => {
    if (items.length < 2) {
      return;
    }

    const key = items
      .map((entry) => entry.id)
      .sort((a, b) => a - b)
      .join("-");

    if (seen.has(key)) {
      return;
    }

    seen.add(key);

    looks.push({ base: item, ...evaluateOutfit(items, clothes) });
  };

  // 베스트(상의 겸 레이어)가 있으면 안에 입을 상의를 더한 코디, 일반 상의만 있으면 베스트를 겹친 코디도 후보로 본다
  // (앱 41개 값만 쓰는 옷장에서는 추가 후보가 생기지 않는다)
  const addLayered = (items: Clothing[]) => {
    addLook(items);

    const innerTop = findInnerTopForLayer(items, clothes);

    if (innerTop) {
      addLook([...items, innerTop.clothing]);
    }

    const topLayer = findTopLayerFor(items, clothes);

    if (topLayer) {
      addLook([...items, topLayer.clothing]);
    }
  };

  const partnersOf = (category: ClothingCategory) =>
    others.filter((clothing) => getEngineCategory(clothing) === category);

  // 선택한 옷 + 짝이 되는 옷 + 신발, 그리고 아우터를 더한 버전까지 후보로 만든다.
  const buildWith = (partner: Clothing | null) => {
    const items = [item];

    if (partner) {
      items.push(partner);
    }

    const shoes = findBestMatch(item, others, "shoes");

    if (shoes && itemCategory !== "shoes") {
      items.push(shoes.clothing);
    }

    addLayered(items);

    if (itemCategory !== "outer") {
      const outer = findBestMatch(item, others, "outer");

      if (outer) {
        addLayered([...items, outer.clothing]);
      }
    }
  };

  if (itemRole === "top" || itemRole === "topLayer") {
    partnersOf("bottom").forEach((bottom) => buildWith(bottom));
  } else if (itemRole === "bottom") {
    partnersOf("top").forEach((top) => buildWith(top));
  } else if (itemRole === "onePiece") {
    // 원피스·점프수트·롬퍼는 상의·하의를 대신한다(신발·아우터만 더함)
    buildWith(null);
  } else {
    // 아우터·신발·가방 등은 상의 + 하의 조합에 더한다.
    partnersOf("top").forEach((top) => {
      const bottom = findBestMatch(top, others, "bottom");

      const items = [item, top];

      if (bottom) {
        items.push(bottom.clothing);
      }

      addLayered(items);
    });
  }

  if (looks.length === 0) {
    buildWith(null);
  }

  return looks.sort((a, b) => b.total - a.total).slice(0, limit);
};

/**
 * 옷장에서 만들 수 있는 코디 후보를 만들고 MATCH SCORE 순으로 정렬한다.
 * 상의·하의·원피스를 각각 기준으로 잡고, 아우터를 더한 조합까지 후보로 만든다.
 */
export const getRankedLooks = (
  clothes: Clothing[],
  limit = 3,
  pool: Clothing[] = clothes,
): RankedLook[] => {
  const bases = pool.filter((clothing) =>
    ["top", "bottom", "dress"].includes(getEngineCategory(clothing) ?? ""),
  );

  // 알 수 없는 값(대분류를 정할 수 없는 옷)은 기준 옷으로 쓰지 않는다
  const candidates =
    bases.length > 0
      ? bases
      : pool.filter((clothing) => getOutfitRole(clothing) !== "unknown");

  const seen = new Set<string>();

  const looks: RankedLook[] = [];

  const addLook = (base: Clothing, items: Clothing[]) => {
    if (items.length < 2) {
      return;
    }

    const key = items
      .map((item) => item.id)
      .sort((a, b) => a - b)
      .join("-");

    if (seen.has(key)) {
      return;
    }

    seen.add(key);

    looks.push({ base, ...evaluateOutfit(items, clothes) });
  };

  const addLayered = (base: Clothing, items: Clothing[]) => {
    addLook(base, items);

    const innerTop = findInnerTopForLayer(items, pool);

    if (innerTop) {
      addLook(base, [...items, innerTop.clothing]);
    }

    const topLayer = findTopLayerFor(items, pool);

    if (topLayer) {
      addLook(base, [...items, topLayer.clothing]);
    }
  };

  candidates.forEach((base) => {
    const baseCategory = getEngineCategory(base);

    const targets = (baseCategory && OUTFIT_PLAN[baseCategory]) ?? [
      "top",
      "bottom",
      "shoes",
    ];

    const items = [base];

    targets.forEach((category) => {
      const match = findBestMatch(base, pool, category);

      if (match) {
        items.push(match.clothing);
      }
    });

    // 아우터 없는 조합과 있는 조합을 각각 후보로 본다.
    addLayered(base, items);

    if (baseCategory !== "outer") {
      const outerMatch = findBestMatch(base, pool, "outer");

      if (outerMatch) {
        addLayered(base, [...items, outerMatch.clothing]);
      }
    }
  });

  return looks.sort((a, b) => b.total - a.total).slice(0, limit);
};
