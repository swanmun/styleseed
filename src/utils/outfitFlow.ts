import type { WeatherSnapshot } from "../lib/weather";

import type { Clothing, ClothingCategory } from "../types";

import { evaluateOutfit, type OutfitEvaluation } from "./outfitScore";

import { getOutfitRole, isUpperRole, type OutfitRole } from "./taxonomyCompat";

import {
  buildWeatherPool,
  getWeatherRule,
  type WeatherRule,
} from "./weatherRecommendation";

/**
 * 하나의 흐름 (swanmun 상의 결정 14 "나", 2026-11-08)
 *
 * 모든 추천 화면이 같은 순서와 같은 채점표를 쓴다. 화면마다 다른 것은 입력뿐이다.
 *   ① 거르기     날씨에 맞지 않는 옷을 뺀다(지금 오늘의 코디 규칙 buildWeatherPool 재사용)
 *   ② 후보 만들기 상의×하의(또는 원피스) × 신발 × 아우터(없음 포함) 조합을 모두 만든다
 *                 (지금 엔진처럼 신발·아우터를 1:1 궁합으로 미리 하나로 정하지 않는다)
 *   ③ 점수 하나   지금 MATCH(evaluateOutfit) 그대로. 날씨 점수는 섞지 않는다
 *   ④ 고르기     점수 순 TOP N. diverse면 상의·하의가 같은 코디는 하나만(신발·아우터만 다른 코디를 줄임)
 *   ⑤ 빈칸 찾기   코디를 완성하는 데 옷장에 없는 종류
 *
 * 입력
 *   - 옷 하나로 코디·상품 링크 코디: fixed = 그 옷(옷장에 없어도 됨)
 *   - 오늘의 코디: weather
 *
 * 아직 하지 않은 것: 베스트(겹쳐 입는 상의) 레이어드, 날씨 이유 문장, 스타일 코디 입력.
 */

export type FlowOptions = {
  limit?: number;
  // 조합이 이보다 많으면 칸마다 점수 높은 옷만 남겨 줄인다
  maxCandidates?: number;
  // 줄일 때 칸마다 남길 옷 수
  perSlotLimit?: number;
  // 상의·하의(또는 원피스)가 같은 코디는 하나만 고른다
  diverse?: boolean;
  // ③ 점수를 갈아 끼울 때(시험·실험용). 없으면 MATCH(evaluateOutfit의 total)
  score?: (items: Clothing[], evaluation: OutfitEvaluation) => number;
};

export type FlowInput = {
  closet: Clothing[];
  fixed?: Clothing | null;
  weather?: WeatherSnapshot | null;
  options?: FlowOptions;
};

export type FlowLook = OutfitEvaluation & {
  // 코디를 이루는 옷 id (정렬)
  key: string;
  // 상의·하의 또는 원피스 id (정렬)
  core: string;
  // 순위를 정한 점수(기본은 MATCH와 같음)
  rank: number;
};

export type FlowResult = {
  looks: FlowLook[];
  candidateCount: number;
  pruned: boolean;
  rule: WeatherRule | null;
  missing: ClothingCategory[];
};

const DEFAULTS: Required<FlowOptions> = {
  limit: 3,
  maxCandidates: 4000,
  perSlotLimit: 6,
  diverse: true,
  score: (_items, evaluation) => evaluation.total,
};

const idsKey = (items: Clothing[]) =>
  items
    .map((item) => item.id)
    .sort((a, b) => a - b)
    .join("-");

const topBy = <T>(list: T[], score: (value: T) => number, limit: number) =>
  list
    .map((value) => ({ value, score: score(value) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.value);

export const recommendOutfits = ({
  closet,
  fixed = null,
  weather = null,
  options = {},
}: FlowInput): FlowResult => {
  const opts = { ...DEFAULTS, ...options };

  // ① 거르기
  const rule = weather ? getWeatherRule(weather) : null;

  const filtered = rule ? buildWeatherPool(closet, rule).pool : closet;

  const pool = filtered.filter((item) => item.id !== fixed?.id);

  const roleOf = (item: Clothing): OutfitRole => getOutfitRole(item);

  const rankOf = (items: Clothing[]) => opts.score(items, evaluateOutfit(items, closet));

  const tops = pool.filter((item) => isUpperRole(roleOf(item)));
  const bottoms = pool.filter((item) => roleOf(item) === "bottom");
  const dresses = pool.filter((item) => roleOf(item) === "onePiece");
  const outers = pool.filter((item) => roleOf(item) === "outer");
  const shoes = pool.filter((item) => roleOf(item) === "shoes");

  const fixedRole = fixed ? roleOf(fixed) : null;

  const empty = (missing: ClothingCategory[] = []): FlowResult => ({
    looks: [],
    candidateCount: 0,
    pruned: false,
    rule,
    missing,
  });

  if (fixedRole === "unknown") {
    return empty();
  }

  // ② 후보 만들기 — 코디의 뼈대(상의+하의 또는 원피스)
  let cores: Clothing[][] = [];

  if (fixed && isUpperRole(fixedRole!)) {
    cores = bottoms.length > 0 ? bottoms.map((bottom) => [fixed, bottom]) : [[fixed]];
  } else if (fixed && fixedRole === "bottom") {
    cores = tops.length > 0 ? tops.map((top) => [top, fixed]) : [[fixed]];
  } else if (fixed && fixedRole === "onePiece") {
    cores = [[fixed]];
  } else {
    tops.forEach((top) => bottoms.forEach((bottom) => cores.push([top, bottom])));
    dresses.forEach((dress) => cores.push([dress]));
  }

  // 가방·액세서리는 모든 코디에 더한다
  const extras = fixed && (fixedRole === "bag" || fixedRole === "accessory") ? [fixed] : [];

  let shoeOptions: (Clothing | null)[] =
    fixedRole === "shoes" ? [fixed] : shoes.length > 0 ? shoes : [null];

  let outerOptions: (Clothing | null)[] =
    fixedRole === "outer"
      ? [fixed]
      : rule?.needsOuter && outers.length > 0
        ? outers
        : [null, ...outers];

  const missing: ClothingCategory[] = [];

  if (cores.length === 0 || (!fixed && tops.length === 0 && dresses.length === 0)) {
    missing.push("top");
  }

  if (!fixed && bottoms.length === 0 && dresses.length === 0) {
    missing.push("bottom");
  }

  if (shoes.length === 0 && fixedRole !== "shoes") {
    missing.push("shoes");
  }

  if (rule?.needsOuter && outers.length === 0 && fixedRole !== "outer") {
    missing.push("outer");
  }

  if (cores.length === 0) {
    return empty(missing);
  }

  // 조합이 너무 많으면 칸마다 점수 높은 옷만 남긴다(뼈대 → 신발 → 아우터 순서로 평가)
  const total = cores.length * shoeOptions.length * outerOptions.length;

  let pruned = false;

  if (total > opts.maxCandidates) {
    pruned = true;

    cores = topBy(cores, (core) => rankOf([...core, ...extras]), opts.perSlotLimit * 3);

    const sampleCores = cores.slice(0, opts.perSlotLimit);

    const meanWith = (item: Clothing | null) =>
      item === null
        ? -1
        : sampleCores.reduce((sum, core) => sum + rankOf([...core, item]), 0) /
          sampleCores.length;

    if (shoeOptions.length > opts.perSlotLimit) {
      shoeOptions = topBy(shoeOptions, meanWith, opts.perSlotLimit);
    }

    if (outerOptions.length > opts.perSlotLimit) {
      const keepNone = outerOptions.includes(null);

      const best = topBy(
        outerOptions.filter((item) => item !== null),
        meanWith,
        opts.perSlotLimit,
      );

      outerOptions = keepNone ? [null, ...best] : best;
    }
  }

  // ③ 점수 하나
  const seen = new Set<string>();

  const candidates: FlowLook[] = [];

  cores.forEach((core) => {
    shoeOptions.forEach((shoe) => {
      outerOptions.forEach((outer) => {
        const items = [...core];

        if (shoe) items.push(shoe);
        if (outer) items.push(outer);
        items.push(...extras);

        const key = idsKey(items);

        if (seen.has(key)) {
          return;
        }

        seen.add(key);

        const evaluation = evaluateOutfit(items, closet);

        candidates.push({ ...evaluation, key, core: idsKey(core), rank: opts.score(items, evaluation) });
      });
    });
  });

  candidates.sort((a, b) => b.rank - a.rank || a.key.localeCompare(b.key));

  // ④ 고르기
  let looks: FlowLook[];

  if (opts.diverse) {
    const usedCores = new Set<string>();

    looks = [];

    candidates.forEach((look) => {
      if (looks.length < opts.limit && !usedCores.has(look.core)) {
        usedCores.add(look.core);
        looks.push(look);
      }
    });

    // 뼈대가 모자라면 남은 후보로 채운다
    candidates.forEach((look) => {
      if (looks.length < opts.limit && !looks.includes(look)) {
        looks.push(look);
      }
    });
  } else {
    looks = candidates.slice(0, opts.limit);
  }

  return { looks, candidateCount: candidates.length, pruned, rule, missing };
};
