import type { Clothing } from "../types";

import { combineOutfitScore, type OutfitEvaluation } from "./outfitScore";

/**
 * 시험용 채점표: 계절·상황(TPO) 점수를 겹침 계수로 (styleseed-team-docs 라운드 20, 질문 71, 찾은 문제 P19)
 *
 * 지금 채점표(outfitScore.ts getOverlapRatio)는 코디 안 옷들의 계절 목록이 얼마나 "똑같은가"를
 * 자카드 유사도(모두 겹치는 값 수 ÷ 합친 값 수)로 잰다. 그래서 봄·여름·가을·겨울이 다 적힌 로퍼가
 * 가을·겨울만 적힌 부츠보다 니트와 "덜 똑같다"며 점수를 잃는다. 사계절에 두루 쓰는 옷이 손해를 본다.
 *
 * 이미 있는 방법: 겹침 계수(Szymkiewicz–Simpson overlap coefficient) = 겹치는 수 ÷ 작은 쪽 수.
 *   한쪽이 다른 쪽에 다 들어가면 1이다. "같이 입을 수 있는 계절이 얼마나 되나"를 가장 좁은 옷 기준으로 잰다.
 *   여러 벌일 때: 모든 옷에 공통인 값 수 ÷ 가장 짧은 목록의 길이.
 *
 * 점수로 바꾸는 식(30 + 70 × 비율), 빈 목록을 빼는 방식(P15), 나머지 4개 지표, 총점 식은 지금 채점표와 같다.
 * 지금 화면 점수는 바꾸지 않는다. 하나의 흐름에 options.score로만 끼운다.
 */

const shared = (lists: string[][]) =>
  lists.reduce((acc, list) => acc.filter((value) => list.includes(value)));

// 지금 채점표의 getOverlapRatio와 같은 자리, 분모만 "합친 수" → "가장 짧은 목록의 길이"
export const overlapCoefficient = (lists: string[][]) => {
  const nonEmpty = lists.filter((list) => list.length > 0);

  if (nonEmpty.length < 2) return 0.5;

  const smallest = Math.min(...nonEmpty.map((list) => new Set(list).size));

  return new Set(shared(nonEmpty)).size / smallest;
};

const listScore = (lists: string[][]) => Math.round(30 + 70 * overlapCoefficient(lists));

// 바꿀 지표를 골라 총점을 다시 계산한다
const rescore = (keys: ("season" | "tpo")[]) => (items: Clothing[], evaluation: OutfitEvaluation) => {
  const season = keys.includes("season") ? listScore(items.map((item) => item.season)) : null;

  const tpo = keys.includes("tpo") ? listScore(items.map((item) => item.tpo)) : null;

  const details = evaluation.details.map((detail) =>
    detail.key === "season" && season !== null
      ? { ...detail, score: season }
      : detail.key === "tpo" && tpo !== null
        ? { ...detail, score: tpo }
        : detail,
  );

  return combineOutfitScore(details, evaluation.completeness);
};

// options.score에 끼우는 함수
// 계절·상황 둘 다 겹침 계수(라운드 20 첫 시험: AI 심판 7승 7패 2무 — 직장인 신발은 이기고 페미닌 신발·하의는 짐)
export const overlapRescore = rescore(["season", "tpo"]);

// 계절만 겹침 계수(찾은 문제 P19는 주로 계절. 상황 점수는 지금 채점표 그대로)
export const seasonOverlapRescore = rescore(["season"]);

// 상황(TPO)만 겹침 계수(계절 점수는 지금 채점표 그대로). 라운드 35: 직장인 첫 신발의 순위를 가른 것이 상황 꼬리표
// (로퍼 office/formal의 formal이 자카드 분모만 키움)라서, 라운드 20에서 안 해 본 "상황만"을 따로 시험한다(라운드 36, 질문 96)
export const tpoOverlapRescore = rescore(["tpo"]);
