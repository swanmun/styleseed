import type { WeatherSnapshot } from "../lib/weather";

import type {
  Clothing,
  ClothingCategory,
  ClothingMaterial,
  ClothingSeason,
} from "../types";

import { getClothingName } from "./format";

import { evaluateOutfit, type OutfitEvaluation } from "./outfitScore";

import {
  findBestMatch,
  getRecommendedOutfit,
  type OutfitRecommendation,
} from "./recommendation";

import { getEngineCategory, getOutfitRole } from "./taxonomyCompat";

/**
 * 날씨 기반 오늘의 코디 (TODAY'S LOOK) — 규칙 기반(AI 추천 아님)
 *
 * 새로운 추천 모델을 만들지 않고 기존 추천 로직에 weather context만 더한다.
 *
 * 1. 기온(체감온도 우선)/날씨 → WeatherRule (계절, 선호/회피/차단 아이템·소재, 아우터 필요 여부)
 * 2. 옷마다 weather fit(0~100) 계산
 *    - 차단 아이템(추위의 반바지·샌들, 더위의 패딩 등)은 어떤 경우에도 후보에서 제외
 *    - 날씨에 맞지 않는 옷은 제외하되, 같은 카테고리에 맞는 옷이 하나도 없으면 남기고 안내(notes)
 *    - 하의·신발·아우터는 날씨에 가장 잘 맞는 옷들만 남김(비·눈이면 신발·아우터는 가장 잘 맞는 것만)
 * 3. 남은 옷으로 기존 getRecommendedOutfit 실행
 * 4. 최종 점수 = 기존 코디 점수 70% + weather fit 평균 30%
 */

export type TemperatureBand =
  | "freezing"
  | "cold"
  | "cool"
  | "mild"
  | "warm"
  | "hot";

export type WetKind = "rain" | "snow";

export type WeatherRule = {
  band: TemperatureBand;
  label: string;

  // "-5°C (체감 -9°C) · 눈"
  summary: string;
  wet: WetKind | null;
  seasons: ClothingSeason[];
  preferredItems: string[];
  avoidedItems: string[];

  // 날씨에 명백히 맞지 않아 대체할 옷이 없어도 추천하지 않는 아이템
  blockedItems: string[];
  preferredMaterials: ClothingMaterial[];
  avoidedMaterials: ClothingMaterial[];
  needsOuter: boolean;
};

type BandRule = Omit<WeatherRule, "band" | "label" | "summary" | "wet"> & {
  labelPrefix: string;
};

const BAND_RULES: Record<TemperatureBand, BandRule> = {
  // 0°C 이하: 두꺼운 아우터(패딩·코트) 필수, 얇은 겉옷은 회피
  freezing: {
    labelPrefix: "두꺼운 아우터와 보온 레이어드",
    seasons: ["winter"],
    preferredItems: [
      "padding",
      "coat",
      // Lab 세부분류(앱 목록 밖, taxonomyCompat): 보온 신호를 원래 값으로 유지
      "padded-vest",
      "knit",
      "knit-vest",
      "sweatshirt",
      "hoodie",
      "boots",
      "scarf",
      "trousers",
      "jeans",
    ],
    // 반팔 티는 맞는 상의(니트·맨투맨 등)가 없을 때만 안에 입는 옷으로 쓴다
    avoidedItems: [
      "tshirt",
      "jacket",
      "blazer",
      "cardigan",
      "vest",
      "skirt",
      "mini-dress",
      "loafer",
      "flats",
      "heels",
    ],
    blockedItems: ["sleeveless", "shorts", "sandals"],
    preferredMaterials: ["wool", "knit", "nylon"],
    avoidedMaterials: ["linen", "silk"],
    needsOuter: true,
  },

  // 1 ~ 5°C: 코트·니트 우선, 패딩은 보통, 얇은 겉옷(가디건·블레이저)은 회피
  cold: {
    labelPrefix: "따뜻한 레이어드",
    seasons: ["winter"],
    preferredItems: [
      "coat",
      "padded-vest",
      "knit",
      "knit-vest",
      "sweatshirt",
      "hoodie",
      "boots",
      "scarf",
      "trousers",
      "jeans",
    ],
    avoidedItems: ["tshirt", "cardigan", "blazer", "vest", "mini-dress", "flats"],
    blockedItems: ["sleeveless", "shorts", "sandals"],
    preferredMaterials: ["wool", "knit", "leather"],
    avoidedMaterials: ["linen"],
    needsOuter: true,
  },

  // 6 ~ 15°C: jacket / knit / layering 우선
  cool: {
    labelPrefix: "레이어링",
    seasons: ["fall", "spring"],
    preferredItems: [
      "jacket",
      "blazer",
      "cardigan",
      "coat",
      "knit",
      "knit-vest",
      "sweatshirt",
      "hoodie",
      "shirt",
      "jeans",
      "slacks",
      "trousers",
      "boots",
      "loafer",
    ],
    avoidedItems: ["sleeveless", "shorts", "sandals", "padding"],
    blockedItems: [],
    preferredMaterials: ["wool", "knit", "denim"],
    avoidedMaterials: ["linen"],
    needsOuter: true,
  },

  // 16 ~ 22°C: light outer / shirt / long sleeve
  mild: {
    labelPrefix: "가벼운 겉옷",
    seasons: ["spring", "fall"],
    preferredItems: [
      "shirt",
      "blouse",
      "cardigan",
      "jacket",
      "blazer",
      "sweatshirt",
      "jeans",
      "slacks",
      "trousers",
      "skirt",
      "loafer",
      "sneakers",
    ],
    avoidedItems: ["padding", "coat"],
    blockedItems: [],
    preferredMaterials: ["cotton", "denim"],
    avoidedMaterials: [],
    needsOuter: false,
  },

  // 23 ~ 27°C: shirt / tee / light bottom
  warm: {
    labelPrefix: "통기성 좋은 옷차림",
    seasons: ["spring", "summer"],
    preferredItems: [
      "tshirt",
      "shirt",
      "blouse",
      "skirt",
      "shorts",
      "slacks",
      "sneakers",
      "loafer",
      "sandals",
      "flats",
    ],
    avoidedItems: ["knit", "knit-vest", "hoodie", "sweatshirt", "boots"],
    blockedItems: ["padding", "padded-vest", "coat"],
    preferredMaterials: ["cotton", "linen"],
    avoidedMaterials: ["wool"],
    needsOuter: false,
  },

  // 28°C 이상: summer / lightweight material 우선
  hot: {
    labelPrefix: "가벼운 옷차림",
    seasons: ["summer"],
    preferredItems: [
      "tshirt",
      "sleeveless",
      "shorts",
      "skirt",
      "mini-dress",
      "sandals",
      "sneakers",
    ],
    avoidedItems: [
      "knit",
      "knit-vest",
      "hoodie",
      "sweatshirt",
      "boots",
      "jacket",
      "blazer",
      "cardigan",
    ],
    blockedItems: ["padding", "padded-vest", "coat"],
    preferredMaterials: ["linen", "cotton"],
    avoidedMaterials: ["wool", "leather", "knit"],
    needsOuter: false,
  },
};

const COLD_BANDS: TemperatureBand[] = ["freezing", "cold", "cool", "mild"];

// 비/눈: 젖으면 곤란한 소재와 아이템의 우선순위를 낮추고, 부츠·방수 소재를 올림
const WET_AVOIDED_MATERIALS: ClothingMaterial[] = ["silk", "linen"];

const WET_PREFERRED_MATERIALS: ClothingMaterial[] = ["nylon", "polyester"];

// 가디건(니트)은 비를 막지 못해 비·눈이 오는 쌀쌀한 날 아우터 자리에서 뒤로 미룬다
const RAIN_AVOIDED_ITEMS = ["sandals", "heels", "cardigan"];

// 비 오는 날 로퍼·플랫은 회피까지는 아니지만 선호에서 빼 부츠·운동화가 먼저 오게 한다
const RAIN_DEMOTED_ITEMS = ["loafer", "flats"];

const SNOW_AVOIDED_ITEMS = ["heels", "flats", "loafer", "cardigan"];

const SNOW_BLOCKED_ITEMS = ["sandals"];

const WEATHER_WEIGHT = 0.3;

const MIN_WEATHER_FIT = 40;

// 회피 아이템은 계절·소재 점수가 높아도 기준점 아래로 (맞는 옷이 없을 때만 대체로 사용)
const AVOIDED_ITEM_CAP = MIN_WEATHER_FIT - 5;

// 하의·신발·아우터는 같은 카테고리 최고 적합도에서 이 점수 안쪽의 옷만 후보로 둔다
const TIER_MARGIN = 15;

const TIERED_CATEGORIES: ClothingCategory[] = ["bottom", "shoes", "outer"];

const ANCHOR_CATEGORIES: ClothingCategory[] = ["top", "dress"];

const ALL_SEASONS: ClothingSeason[] = ["spring", "summer", "fall", "winter"];

// 체감온도가 있으면 체감온도로 구간을 정한다(바람·습도 반영)
const getEffectiveTemperature = (weather: WeatherSnapshot) =>
  weather.apparentTemperature ?? weather.temperature;

export const getTemperatureBand = (temperature: number): TemperatureBand => {
  const rounded = Math.round(temperature);

  if (rounded <= 0) {
    return "freezing";
  }

  if (rounded <= 5) {
    return "cold";
  }

  if (rounded <= 15) {
    return "cool";
  }

  if (rounded <= 22) {
    return "mild";
  }

  if (rounded <= 27) {
    return "warm";
  }

  return "hot";
};

const getWetKind = (weather: WeatherSnapshot): WetKind | null => {
  if (weather.kind === "snow") {
    return "snow";
  }

  return weather.kind === "rain" || weather.kind === "storm" ? "rain" : null;
};

const getWeatherSummary = (weather: WeatherSnapshot) => {
  const temperature = Math.round(weather.temperature);

  const apparent =
    weather.apparentTemperature === null
      ? null
      : Math.round(weather.apparentTemperature);

  // 체감온도는 실제 기온과 2°C 이상 다를 때만 함께 보여준다
  const apparentText =
    apparent !== null && Math.abs(apparent - temperature) >= 2
      ? ` (체감 ${apparent}°C)`
      : "";

  return `${temperature}°C${apparentText} · ${weather.label}`;
};

const unique = <T,>(values: T[]) => Array.from(new Set(values));

export const getWeatherRule = (weather: WeatherSnapshot): WeatherRule => {
  const band = getTemperatureBand(getEffectiveTemperature(weather));

  const { labelPrefix, ...rule } = BAND_RULES[band];

  const wet = getWetKind(weather);

  const summary = getWeatherSummary(weather);

  const base: WeatherRule = {
    ...rule,
    band,
    wet,
    summary,
    label: `${summary} — ${labelPrefix}`,
  };

  if (!wet) {
    return base;
  }

  const wetAvoidedItems = wet === "snow" ? SNOW_AVOIDED_ITEMS : RAIN_AVOIDED_ITEMS;

  const wetBlockedItems = wet === "snow" ? SNOW_BLOCKED_ITEMS : [];

  // 비·눈이 오는 쌀쌀한 날에는 부츠와 겉옷을 우선한다(더운 날 비에는 부츠를 올리지 않음)
  const isColdWet = COLD_BANDS.includes(band);

  const avoidedItems = unique([
    ...rule.avoidedItems,
    ...wetAvoidedItems.filter((item) => isColdWet || item !== "cardigan"),
  ]);

  return {
    ...base,
    label: `${summary} — ${labelPrefix}, ${wet === "snow" ? "눈길" : "비"} 대비`,
    preferredItems: unique([
      ...rule.preferredItems.filter(
        (item) =>
          !avoidedItems.includes(item) &&
          !(wet === "rain" && RAIN_DEMOTED_ITEMS.includes(item)),
      ),
      ...(isColdWet ? ["boots"] : []),
    ]),
    avoidedItems: isColdWet
      ? avoidedItems.filter((item) => item !== "boots")
      : avoidedItems,
    blockedItems: unique([...rule.blockedItems, ...wetBlockedItems]),
    preferredMaterials: unique([
      ...rule.preferredMaterials.filter(
        (material) => !WET_AVOIDED_MATERIALS.includes(material),
      ),
      ...WET_PREFERRED_MATERIALS,
    ]),
    avoidedMaterials: unique([...rule.avoidedMaterials, ...WET_AVOIDED_MATERIALS]),
    needsOuter: rule.needsOuter || isColdWet,
  };
};

const isBlocked = (clothing: Clothing, rule: WeatherRule) =>
  rule.blockedItems.includes(clothing.subCategory);

/**
 * 옷 한 벌이 오늘 날씨에 얼마나 맞는지 (0~100)
 *
 * ITEM     40: 선호 아이템 40 / 보통 20 / 회피 0 — 세부 종류(반팔 tshirt·민소매 sleeveless·패딩 등)로 소매 길이·두께를 대신 판단
 * MATERIAL 30: 선호 소재 30 / 보통 15 / 회피 0
 * SEASON   30: 날씨 계절과 겹침 30 / 안 겹침 0 / 계절 정보 없음·사계절 15 (사계절 태그만으로 통과하지 않게)
 *
 * 회피 아이템은 최대 35점(기준 40 미만), 차단 아이템은 0점.
 * 가방·액세서리는 날씨 영향이 적어 계산하지 않는다(null).
 */
export const getWeatherFitScore = (
  clothing: Clothing,
  rule: WeatherRule,
): number | null => {
  const category = getEngineCategory(clothing);

  if (category === "bag" || category === "accessory") {
    return null;
  }

  if (isBlocked(clothing, rule)) {
    return 0;
  }

  const seasons = clothing.season ?? [];

  const isSeasonUnspecified =
    seasons.length === 0 || ALL_SEASONS.every((season) => seasons.includes(season));

  const seasonPoints = isSeasonUnspecified
    ? 15
    : seasons.some((season) => rule.seasons.includes(season))
      ? 30
      : 0;

  const materialPoints = rule.avoidedMaterials.includes(clothing.material)
    ? 0
    : rule.preferredMaterials.includes(clothing.material)
      ? 30
      : 15;

  const isAvoidedItem = rule.avoidedItems.includes(clothing.subCategory);

  const itemPoints = isAvoidedItem
    ? 0
    : rule.preferredItems.includes(clothing.subCategory)
      ? 40
      : 20;

  const total = seasonPoints + materialPoints + itemPoints;

  return isAvoidedItem ? Math.min(total, AVOIDED_ITEM_CAP) : total;
};

/** 날씨 때문에 옷장에서 부족한 옷 안내 */
export type WeatherClosetNote = {
  category: "top" | "bottom" | "shoes" | "outer";

  // blocked: 맞지 않는 옷만 있어 뺐음 / fallback: 딱 맞는 옷이 없어 가장 가까운 옷 사용 / missing: 필요한데 없음
  kind: "blocked" | "fallback" | "missing";

  message: string;
};

const NOTE_CATEGORIES: WeatherClosetNote["category"][] = [
  "top",
  "bottom",
  "shoes",
  "outer",
];

const CATEGORY_LABEL: Record<WeatherClosetNote["category"], string> = {
  top: "상의",
  bottom: "하의",
  shoes: "신발",
  outer: "아우터",
};

// "딱 맞는 신발이 없어"처럼 받침에 맞춘 주격 조사
const CATEGORY_SUBJECT: Record<WeatherClosetNote["category"], string> = {
  top: "상의가",
  bottom: "하의가",
  shoes: "신발이",
  outer: "아우터가",
};

const NEED_HINT: Record<
  TemperatureBand,
  Record<WeatherClosetNote["category"], string>
> = {
  freezing: {
    top: "니트·맨투맨·후드",
    bottom: "긴 바지(울 바지·청바지)",
    shoes: "부츠",
    outer: "패딩·코트",
  },
  cold: {
    top: "니트·맨투맨",
    bottom: "긴 바지",
    shoes: "부츠·운동화",
    outer: "코트·패딩",
  },
  cool: {
    top: "셔츠·니트·맨투맨",
    bottom: "청바지·슬랙스",
    shoes: "운동화·로퍼",
    outer: "재킷·가디건",
  },
  mild: {
    top: "셔츠·블라우스·티셔츠",
    bottom: "청바지·슬랙스·스커트",
    shoes: "운동화·로퍼",
    outer: "가디건·가벼운 재킷",
  },
  warm: {
    top: "반팔 티·셔츠",
    bottom: "얇은 바지·반바지·스커트",
    shoes: "운동화·샌들",
    outer: "가디건",
  },
  hot: {
    top: "반팔 티·민소매",
    bottom: "반바지·스커트",
    shoes: "샌들·운동화",
    outer: "얇은 가디건",
  },
};

const getNeedHint = (
  category: WeatherClosetNote["category"],
  rule: WeatherRule,
) => {
  if (category === "shoes" && rule.wet && COLD_BANDS.includes(rule.band)) {
    return rule.wet === "snow" ? "미끄럽지 않은 부츠" : "젖어도 괜찮은 부츠·운동화";
  }

  return NEED_HINT[rule.band][category];
};

const buildNote = (
  category: WeatherClosetNote["category"],
  kind: WeatherClosetNote["kind"],
  rule: WeatherRule,
  excluded: Clothing[] = [],
): WeatherClosetNote => {
  const label = CATEGORY_LABEL[category];

  const hint = getNeedHint(category, rule);

  const today = `오늘 날씨(${rule.summary})`;

  const message =
    kind === "missing"
      ? `${label} — ${today}에는 겉옷이 필요한데 옷장에 없어요. 있으면 좋은 옷: ${hint}`
      : kind === "blocked"
        ? `${label} — ${today}에 맞지 않는 옷만 있어 코디에서 뺐어요(제외: ${excluded
            .map(getClothingName)
            .join(", ")}). 있으면 좋은 옷: ${hint}`
        : `${label} — ${today}에 딱 맞는 ${CATEGORY_SUBJECT[category]} 없어 가장 가까운 옷으로 골랐어요. 있으면 좋은 옷: ${hint}`;

  return { category, kind, message };
};

export type WeatherPool = {
  pool: Clothing[];
  notes: WeatherClosetNote[];
};

export const buildWeatherPool = (clothes: Clothing[], rule: WeatherRule): WeatherPool => {
  const notes: WeatherClosetNote[] = [];

  const fitOf = (clothing: Clothing) => getWeatherFitScore(clothing, rule);

  const isSuitable = (clothing: Clothing) => {
    const fit = fitOf(clothing);

    return fit === null || fit >= MIN_WEATHER_FIT;
  };

  const usable = clothes.filter((clothing) => !isBlocked(clothing, rule));

  const byCategory = new Map<ClothingCategory | null, Clothing[]>();

  usable.forEach((clothing) => {
    const category = getEngineCategory(clothing);

    byCategory.set(category, [...(byCategory.get(category) ?? []), clothing]);
  });

  const pool: Clothing[] = [];

  // 상의와 원피스는 둘 다 코디의 기준이 되므로, 한쪽에 맞는 옷이 있으면 다른 쪽은 대체로 남기지 않는다
  const hasSuitableAnchor = usable.some(
    (clothing) =>
      ANCHOR_CATEGORIES.includes(getEngineCategory(clothing) as ClothingCategory) &&
      isSuitable(clothing),
  );

  byCategory.forEach((items, category) => {
    const suitable = items.filter(isSuitable);

    if (suitable.length === 0) {
      if (category && ANCHOR_CATEGORIES.includes(category) && hasSuitableAnchor) {
        return;
      }

      // 맞는 옷이 하나도 없으면 가장 가까운 옷을 남기고 안내한다
      pool.push(...items);

      return;
    }

    if (category && TIERED_CATEGORIES.includes(category)) {
      // 비·눈이 오는 날 신발·아우터는 가장 잘 맞는 옷만 남긴다
      const margin =
        rule.wet && (category === "shoes" || category === "outer")
          ? 0
          : TIER_MARGIN;

      const best = Math.max(...suitable.map((clothing) => fitOf(clothing) ?? 0));

      pool.push(
        ...suitable.filter((clothing) => (fitOf(clothing) ?? 0) >= best - margin),
      );

      return;
    }

    pool.push(...suitable);
  });

  const hasSuitableDress = usable.some(
    (clothing) => getEngineCategory(clothing) === "dress" && isSuitable(clothing),
  );
  NOTE_CATEGORIES.forEach((category) => {
    const all = clothes.filter((clothing) => getEngineCategory(clothing) === category);

    const items = byCategory.get(category) ?? [];

    if (category === "outer" && rule.needsOuter && all.length === 0) {
      notes.push(buildNote(category, "missing", rule));

      return;
    }

    // 원피스가 날씨에 맞으면 상의가 없어도 코디가 된다
    if (category === "top" && hasSuitableDress) {
      return;
    }

    // 더운 날에는 아우터가 맞지 않아도 코디에 넣지 않으므로 안내하지 않는다
    if (category === "outer" && !rule.needsOuter) {
      return;
    }

    if (all.length > 0 && items.length === 0) {
      notes.push(buildNote(category, "blocked", rule, all));
    } else if (items.length > 0 && !items.some(isSuitable)) {
      notes.push(buildNote(category, "fallback", rule));
    }
  });

  return { pool, notes };
};

const averageScore = (values: number[]) => {
  if (values.length === 0) {
    return 0;
  }

  return Math.round(
    values.reduce((sum, value) => sum + value, 0) / values.length,
  );
};

const BAND_WORD: Record<TemperatureBand, string> = {
  freezing: "영하 추위",
  cold: "추운 날씨",
  cool: "쌀쌀한 날씨",
  mild: "선선한 날씨",
  warm: "따뜻한 날씨",
  hot: "더운 날씨",
};

const OUTER_REASON: Record<TemperatureBand, string> = {
  freezing: "영하 추위를 막는 두꺼운 아우터",
  cold: "찬 바람을 막는 아우터",
  cool: "쌀쌀한 날 걸치기 좋은 겉옷",
  mild: "선선할 때 가볍게 걸치는 겉옷",
  warm: "가볍게 걸치는 겉옷",
  hot: "가볍게 걸치는 겉옷",
};

// 오늘 날씨를 반영한 추천 이유 (첫 줄은 실제 기온·날씨, 이후 아우터 → 신발 → 상의 → 하의 순서로 최대 3개)
const buildWeatherReasons = (items: Clothing[], rule: WeatherRule) => {
  const reasons = [`오늘 ${rule.summary} 기준으로 골랐어요.`];

  const isPreferred = (clothing: Clothing) =>
    rule.preferredItems.includes(clothing.subCategory) ||
    rule.preferredMaterials.includes(clothing.material);

  const order: ClothingCategory[] = ["outer", "shoes", "top", "dress", "bottom"];

  const itemReasons = order.flatMap((category) =>
    items
      .filter((clothing) => getEngineCategory(clothing) === category)
      .filter((clothing) => (getWeatherFitScore(clothing, rule) ?? 0) >= MIN_WEATHER_FIT)
      .map((clothing) => {
        const name = getClothingName(clothing);

        if (category === "outer") {
          return rule.wet && rule.needsOuter
            ? `${name}: ${rule.wet === "snow" ? "눈과" : "비와"} ${BAND_WORD[rule.band]}를 막는 겉옷`
            : `${name}: ${OUTER_REASON[rule.band]}`;
        }

        if (category === "shoes" && rule.wet) {
          return `${name}: ${rule.wet === "snow" ? "눈길에 맞는 신발" : "비 오는 날 신기 좋은 신발"}`;
        }

        if (!isPreferred(clothing)) {
          return null;
        }

        return `${name}: ${BAND_WORD[rule.band]}에 맞는 ${
          category === "shoes"
            ? "신발"
            : category === "bottom"
              ? "하의"
              : category === "dress"
                ? "원피스"
                : "상의"
        }`;
      })
      .filter((reason): reason is string => reason !== null),
  );

  return [...reasons, ...itemReasons.slice(0, 3)];
};

export type TodayLook = {
  base: Clothing;

  recommendation: OutfitRecommendation;

  // 기존 코디 궁합 점수 (0~100)
  styleScore: number;

  // 날씨 적합도 평균 (날씨 정보가 없으면 null)
  weatherScore: number | null;

  // 화면에 표시하는 MATCH 점수
  score: number;

  weatherLabel: string | null;

  // 실제 기온·날씨를 반영한 추천 이유 (날씨 정보가 없으면 빈 배열)
  weatherReasons: string[];

  // Color / Fit·Silhouette / Material / Season / TPO / Preference 평가
  evaluation: OutfitEvaluation;
};

/** 오늘 날씨에 맞는 옷이 부족한 카테고리 안내 (날씨 정보가 없거나 옷장이 비면 빈 배열) */
export const getTodaysWeatherNotes = (
  clothes: Clothing[],
  weather: WeatherSnapshot | null,
): WeatherClosetNote[] => {
  if (!weather || clothes.length === 0) {
    return [];
  }

  return buildWeatherPool(clothes, getWeatherRule(weather)).notes;
};

export const getTodaysLooks = (
  clothes: Clothing[],
  weather: WeatherSnapshot | null,
  limit = 3,
): TodayLook[] => {
  if (clothes.length === 0) {
    return [];
  }

  const rule = weather ? getWeatherRule(weather) : null;

  const pool = rule ? buildWeatherPool(clothes, rule).pool : clothes;

  // 상의(베스트 포함)/원피스(점프수트·롬퍼 포함)를 기준으로 코디를 만들고, 없으면 다른 의류를 기준으로 사용
  const anchors = pool.filter((clothing) => {
    const role = getOutfitRole(clothing);
    return role === "top" || role === "topLayer" || role === "onePiece";
  });

  const wearables = pool.filter((clothing) => {
    const role = getOutfitRole(clothing);
    return role !== "bag" && role !== "accessory" && role !== "unknown";
  });

  const bases =
    anchors.length > 0 ? anchors : wearables.length > 0 ? wearables : pool;

  const looks = bases.map((base): TodayLook => {
    const outfit = getRecommendedOutfit(base, pool);

    let items = outfit.items;

    let matches = outfit.matches;

    // 쌀쌀한 날씨(또는 비·눈)에는 옷장에 아우터가 있을 때 코디에 추가
    if (
      rule?.needsOuter &&
      getEngineCategory(base) !== "outer" &&
      !items.some((item) => getEngineCategory(item) === "outer")
    ) {
      const outerMatch = findBestMatch(base, pool, "outer");

      if (outerMatch) {
        items = [...items, outerMatch.clothing];

        matches = [...matches, outerMatch];
      }
    }

    // 코디 자체 점수는 6개 지표 평가(MATCH SCORE)를 사용한다.
    const evaluation = evaluateOutfit(items, clothes);

    const styleScore = evaluation.total;

    const recommendation: OutfitRecommendation = {
      ...outfit,
      items,
      matches,
      score: styleScore,
    };

    const weatherFits = rule
      ? items
          .map((item) => getWeatherFitScore(item, rule))
          .filter((fit): fit is number => fit !== null)
      : [];

    const weatherScore =
      rule && weatherFits.length > 0 ? averageScore(weatherFits) : null;

    const score =
      weatherScore === null
        ? styleScore
        : Math.round(
            styleScore * (1 - WEATHER_WEIGHT) + weatherScore * WEATHER_WEIGHT,
          );

    return {
      base,
      recommendation,
      styleScore,
      weatherScore,
      score,
      weatherLabel: rule ? rule.label : null,
      weatherReasons: rule ? buildWeatherReasons(items, rule) : [],
      evaluation,
    };
  });

  const seenOutfits = new Set<string>();

  return looks
    .sort((a, b) => {
      const aHasMatches = a.recommendation.matches.length > 0 ? 1 : 0;

      const bHasMatches = b.recommendation.matches.length > 0 ? 1 : 0;

      return bHasMatches - aHasMatches || b.score - a.score;
    })
    .filter((look) => {
      const outfitKey = look.recommendation.items
        .map((item) => item.id)
        .sort((a, b) => a - b)
        .join("-");

      if (seenOutfits.has(outfitKey)) {
        return false;
      }

      seenOutfits.add(outfitKey);

      return true;
    })
    .slice(0, limit);
};
