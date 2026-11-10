import type { WeatherSnapshot } from "../lib/weather";

import type { Clothing, ClothingCategory } from "../types";

import { avoidPenalty } from "./avoidPairs";

import { type CloTable, type SeasonMixMode, warmthPenalty } from "./clothingWarmth";

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
 *   ⑤ 빈칸 찾기   코디를 완성하는 데 옷장에 없는 종류 (상품 고르기는 gapProducts.ts)
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
  // ④ 고르기를 MMR(Maximal Marginal Relevance, Carbonell·Goldstein 1998)로 할 때의 λ (0~1).
  // 다음 코디 = λ × 점수/100 − (1−λ) × (이미 고른 코디와 가장 많이 겹치는 정도) 가 가장 큰 것.
  // 겹치는 정도 = 두 코디 옷의 자카드 유사도(같은 옷 수 ÷ 두 코디 옷 전체 수). 신발·아우터가 겹쳐도 깎인다.
  // null이면 예전 방식(뼈대만 겹치지 않게). diverse가 false면 쓰지 않는다
  // 기본 0.7: 테스트 옷장 66개 상황에서 "옷 하나로 코디" 같은 신발 반복 98% → 44%, TOP 3 평균 점수 −1.8,
  // AI 보조 심판 3명(가림) 13문제 MMR 11승 2패 (styleseed-team-docs 라운드 15)
  mmrLambda?: number | null;
  // 날씨 두께(clo, clothingWarmth.ts): 코디 보온이 기온별 목표에서 벗어난 만큼 순위 점수에서 뺀다.
  // 날씨가 없으면 반바지·민소매 + 따뜻한 겉옷처럼 계절이 섞인 코디만 뺀다.
  // 기본 켬: 기온 대비 0.3 clo 넘게 벗어난 TOP 3 코디 21% → 7%(MATCH 75.6 → 75.5),
  // AI 보조 심판 3명(가림) 6문제 5승 1패, 전원 일치 (styleseed-team-docs 라운드 16)
  warmth?: boolean;
  // 날씨가 없을 때 계절 섞임을 무엇으로 볼지(clothingWarmth.SeasonMixMode, 시험 옵션). warmth가 켜져 있을 때만 쓴다.
  // 기본 "basic"(반바지·민소매 + 따뜻한 겉옷, 라운드 16). "sandals"·"tags"는 라운드 24(P24: 숏패딩 + 슬라이드)에서 비교
  seasonMix?: SeasonMixMode;
  // 보온표(clothingWarmth.CloTable, 시험 옵션). warmth가 켜져 있고 날씨가 있을 때만 쓴다.
  // 기본 "ashrae"(라운드 16). "outdoor"는 코트를 바깥 겉옷 값(ISO 7730 표 C.2 Coat 0.60)으로 본다(라운드 32, P28·P21)
  cloTable?: CloTable;
  // 피하는 짝(avoidPairs.ts): AI 보조 심판이 짚고 정답 코디도 피하는 짝(네이비 ↔ 검정 겉옷·하의, 티셔츠 × 코트·패딩)이면
  // 짝마다 순위 점수 10점을 뺀다(styleseed-team-docs 라운드 22)
  avoid?: boolean;
  // 피하는 짝 감점을 어디에 붙일지(avoid가 켜져 있을 때만, 시험 옵션. styleseed-team-docs 라운드 25)
  //   pair      피하는 짝이 든 코디에만(라운드 22, 기본)
  //   noRemoval 겉옷을 빼서 피하는 것은 득이 없게 한다: 같은 뼈대·신발에 겉옷을 더한 코디 중 가장 좋은 것(감점 전 점수)이
  //             피하는 짝이면, 겉옷 없는 코디도 같은 감점을 받는다. 그래서 엔진은 겉옷을 빼기보다 하의·상의를 바꿔 피한다.
  //             (라운드 23: 블레이저를 빼서 피한 코디가 AI 심판에게 짐)
  avoidMode?: "pair" | "noRemoval";
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
  mmrLambda: 0.7,
  warmth: true,
  seasonMix: "basic",
  cloTable: "ashrae",
  avoid: false,
  avoidMode: "pair",
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

// 두 코디가 옷을 얼마나 같이 쓰나(자카드 유사도, 0~1)
export const outfitOverlap = (a: FlowLook, b: FlowLook) => {
  const ida = new Set(a.items.map((item) => item.id));
  const idb = new Set(b.items.map((item) => item.id));
  let shared = 0;
  ida.forEach((id) => {
    if (idb.has(id)) shared += 1;
  });
  return shared / (ida.size + idb.size - shared);
};

// ④ MMR 고르기. 뼈대(상의·하의 또는 원피스)가 같은 코디는 예전처럼 피하고, 모자랄 때만 허용한다
const pickMmr = (candidates: FlowLook[], limit: number, lambda: number) => {
  const pool = candidates.slice(0, 200); // 점수 순 상위 200개 안에서 고른다(속도)
  const picked: FlowLook[] = [];
  const usedCores = new Set<string>();
  while (picked.length < limit && picked.length < pool.length) {
    let best: FlowLook | null = null;
    let bestValue = -Infinity;
    const allowSameCore = pool.every((look) => picked.includes(look) || usedCores.has(look.core));
    for (const look of pool) {
      if (picked.includes(look)) continue;
      if (!allowSameCore && usedCores.has(look.core)) continue;
      const overlap = picked.length ? Math.max(...picked.map((p) => outfitOverlap(look, p))) : 0;
      const value = lambda * (look.rank / 100) - (1 - lambda) * overlap;
      if (value > bestValue) {
        bestValue = value;
        best = look;
      }
    }
    if (!best) break;
    picked.push(best);
    usedCores.add(best.core);
  }
  return picked;
};

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

  const temperature = weather ? weather.apparentTemperature ?? weather.temperature : null;

  const adjust = (items: Clothing[], rank: number) =>
    rank -
    (opts.warmth ? warmthPenalty(items, temperature, opts.seasonMix, opts.cloTable) : 0) -
    (opts.avoid ? avoidPenalty(items) : 0);

  const rankOf = (items: Clothing[]) => adjust(items, opts.score(items, evaluateOutfit(items, closet)));

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

  // 고른 옷이 상의인데 하의가 없거나, 하의인데 상의가 없으면 그것도 빈칸이다(라운드 17에서 찾음)
  if (fixed && isUpperRole(fixedRole!) && bottoms.length === 0) {
    missing.push("bottom");
  }

  if (fixed && fixedRole === "bottom" && tops.length === 0) {
    missing.push("top");
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

  const frames: { look: FlowLook; frame: string; hasOuter: boolean; base: number; penalty: number }[] = [];

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

        const look: FlowLook = { ...evaluation, key, core: idsKey(core), rank: adjust(items, opts.score(items, evaluation)) };

        candidates.push(look);

        if (opts.avoid && opts.avoidMode === "noRemoval") {
          const base = opts.score(items, evaluation) - (opts.warmth ? warmthPenalty(items, temperature, opts.seasonMix, opts.cloTable) : 0);
          frames.push({ look, frame: `${idsKey(core)}|${shoe?.id ?? ""}`, hasOuter: outer !== null, base, penalty: avoidPenalty(items) });
        }
      });
    });
  });

  // noRemoval: 겉옷 없는 코디는 같은 뼈대·신발의 가장 좋은 겉옷 코디(감점 전 점수)가 받은 피하는 짝 감점을 함께 받는다
  if (frames.length > 0) {
    const bestWithOuter = new Map<string, (typeof frames)[number]>();
    frames.forEach((f) => {
      if (!f.hasOuter) return;
      const best = bestWithOuter.get(f.frame);
      if (!best || f.base > best.base) bestWithOuter.set(f.frame, f);
    });
    frames.forEach((f) => {
      const best = bestWithOuter.get(f.frame);
      if (!f.hasOuter && best && best.penalty > f.penalty) {
        f.look.rank = f.base - best.penalty;
      }
    });
  }

  candidates.sort((a, b) => b.rank - a.rank || a.key.localeCompare(b.key));

  // ④ 고르기
  let looks: FlowLook[];

  if (opts.diverse && opts.mmrLambda !== null) {
    looks = pickMmr(candidates, opts.limit, opts.mmrLambda);
  } else if (opts.diverse) {
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
