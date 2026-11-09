import type { Clothing } from "../types";

import { getOutfitRole, isUpperRole, type OutfitRole } from "./taxonomyCompat";

/**
 * 피하는 짝 (styleseed-team-docs 라운드 22, 질문 76, 찾은 문제 P22)
 *
 * 이미 있는 방법: 부정 연관 규칙(negative association rule).
 *   장바구니 분석의 연관 규칙(Agrawal 외 1993)에서 "같이 나올 만한데 실제로는 거의 같이 안 나오는 짝"을 찾는 방법이다.
 *   배수(lift) = 실제로 같이 나온 횟수 ÷ 우연이라면 같이 나올 횟수. 1보다 많이 작으면 피하는 짝이다.
 *
 * 정답 코디 1,406개에서 기준(우연이면 20번 넘게 나올 짝, 배수 0.3 이하)으로 뽑으면 49개가 나온다.
 * 그중에는 "검정 겉옷 × 갈색 신발"(0번)처럼 일반 규칙이라기보다 팀 데이터의 버릇으로 보이는 것이 많다
 * (라운드 14: 정답 코디대로 색 규칙을 고쳤다가 AI 심판에게 1승 4패).
 * 그래서 **AI 보조 심판이 어색하다고 짚었고, 데이터로도 피하는 짝**만 넣는다(서로 다른 두 근거가 같은 말을 할 때만).
 *
 *   - 네이비 ↔ 검정 (겉옷과 하의): 네이비 겉옷 × 검정 하의 9번 / 우연 48.5번(배수 0.19),
 *                                   검정 겉옷 × 네이비 하의 1번 / 우연 22.1번(0.07)
 *     AI 심판: "네이비 블레이저 + 검정 슬랙스는 색이 애매하게 겹친다"(라운드 15·19·20·20b, 여러 번)
 *   - 티셔츠 × 코트·패딩: 8번 / 우연 36.1번(0.23)
 *     AI 심판: "반팔 티에 카멜 코트는 계절이 섞였다"(라운드 20b)
 *
 *   - 롱부츠 × 긴 바지(슬랙스·면바지·청바지): 1번 / 우연 25.0번(0.06). 반대로 롱부츠 × 치마·원피스는 49번 / 23.1번(2.10배)
 *     AI 심판: "와이드 슬랙스에 롱부츠는 부츠가 가려진다"(라운드 14부터 여러 번, 실루엣 ㉰). 라운드 23
 *     ※ 앱 분류에는 롱부츠·앵클부츠 구분이 없다(신발 세부종류는 boots 하나). 그래서 이 규칙은 세부종류 "long-boots"가
 *       생겨야 작동한다(담당자 상의). 앵클·첼시 부츠 × 와이드 바지는 0.53배로 피하는 짝이 아니다.
 *
 * 넣지 않은 것: 니트 위에 가디건(데이터 배수 0.85, 피한다는 근거 없음),
 *               캐미솔 한 장(정답 코디는 거의 모두 겉옷이 있어 잴 수 없음).
 *
 * MATCH 점수는 바꾸지 않고, 하나의 흐름의 순위 점수에서만 짝마다 PENALTY를 뺀다(날씨 두께 warmth와 같은 방식).
 */

type Side = { roles: OutfitRole[]; colors?: string[]; subCategories?: string[] };

type AvoidRule = { id: string; a: Side; b: Side; evidence: string };

const UPPER: OutfitRole[] = ["top", "topLayer"];

export const AVOID_RULES: AvoidRule[] = [
  {
    id: "navy-outer-black-bottom",
    a: { roles: ["outer"], colors: ["navy"] },
    b: { roles: ["bottom"], colors: ["black"] },
    evidence: "정답 코디 9번 / 우연 48.5번(배수 0.19)",
  },
  {
    id: "black-outer-navy-bottom",
    a: { roles: ["outer"], colors: ["black"] },
    b: { roles: ["bottom"], colors: ["navy"] },
    evidence: "정답 코디 1번 / 우연 22.1번(배수 0.07)",
  },
  {
    id: "tshirt-heavy-outer",
    a: { roles: UPPER, subCategories: ["tshirt"] },
    b: { roles: ["outer"], subCategories: ["coat", "padding"] },
    evidence: "정답 코디 8번 / 우연 36.1번(배수 0.23)",
  },
  {
    id: "long-boots-long-pants",
    a: { roles: ["shoes"], subCategories: ["long-boots"] },
    b: { roles: ["bottom"], subCategories: ["slacks", "trousers", "jeans"] },
    evidence: "정답 코디 1번 / 우연 25.0번(배수 0.06)",
  },
];

// 짝 하나마다 순위 점수에서 뺄 값. 날씨 없을 때 계절 섞임 감점(clothingWarmth.seasonMixPenalty)과 같은 크기
export const AVOID_PENALTY = 10;

const matches = (item: Clothing, side: Side) => {
  const role = getOutfitRole(item);

  if (!side.roles.includes(role) && !(side.roles === UPPER && isUpperRole(role))) return false;
  if (side.colors && !side.colors.includes(item.color)) return false;
  if (side.subCategories && !side.subCategories.includes(item.subCategory)) return false;

  return true;
};

// 코디 안에 있는 피하는 짝의 규칙 id
export const avoidHits = (items: Clothing[]) =>
  AVOID_RULES.filter(
    (rule) =>
      items.some((x) => matches(x, rule.a)) &&
      items.some((y) => matches(y, rule.b)),
  ).map((rule) => rule.id);

export const avoidPenalty = (items: Clothing[]) => AVOID_PENALTY * avoidHits(items).length;
