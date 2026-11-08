import { CLOTHING_SUBCATEGORIES } from "../constants/clothingOptions";

import type { Clothing, ClothingCategory, ClothingColor } from "../types";

// 상품 링크로 코디하기 (Figma 07 L0~L5)
//
// 지금은 화면 흐름만 동작한다. 아래 두 곳은 나중에 채운다.
// - TODO(사진 분석 API): 올린 상품 사진을 "내 옷 등록하기"와 같은 AI 분석에 넣어 종류·색·소재·핏을 채운다.
//   지금은 상품 확인 화면에서 고른 종류·색 + 기본값으로 만든 임시 옷이다(isPlaceholder).
// - TODO(링크 읽기): 허용된 쇼핑몰(시험 통과: 29CM)의 상세 페이지에서 상품명·브랜드·대표 사진을 읽는다.
//   무신사·W컨셉은 robots.txt가 허락 목록 밖의 봇을 막으므로 읽지 않는다(사용자가 사진을 올리는 길만).

// 옷장 옷(Supabase id, 양수)과 겹치지 않는 id
export const LINK_PRODUCT_ID = -1;

// 상품 확인 화면에서 고를 수 있는 종류(코디 추천에 쓰는 것만)
export const LINK_PRODUCT_CATEGORIES: ClothingCategory[] = [
  "top",
  "bottom",
  "outer",
  "dress",
  "shoes",
];

export const LINK_PRODUCT_COLORS: ClothingColor[] = [
  "black",
  "white",
  "gray",
  "beige",
  "brown",
  "navy",
  "blue",
  "red",
  "pink",
  "green",
];

export const isProductLink = (text: string) => {
  try {
    const url = new URL(text.trim());

    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
};

// "www.29cm.co.kr" → "29cm.co.kr"
export const getLinkStoreName = (link: string) => {
  try {
    return new URL(link.trim()).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
};

type LinkProductInput = {
  imageUri: string | null;
  category: ClothingCategory;
  color: ClothingColor;
};

// TODO(사진 분석 API): 지금은 고른 종류·색에 무난한 기본값을 붙인 임시 옷을 만든다
export const buildPlaceholderProduct = ({
  imageUri,
  category,
  color,
}: LinkProductInput): Clothing => {
  const subCategories = CLOTHING_SUBCATEGORIES[category] as readonly string[];

  return {
    id: LINK_PRODUCT_ID,
    category,
    subCategory: subCategories[0] ?? category,
    color,
    colorTone: "muted",
    fit: "regular",
    material: "cotton",
    season: ["spring", "summer", "fall", "winter"],
    tpo: ["casual"],
    style: ["casual"],
    imageUri: imageUri ?? undefined,
    originalImageUri: imageUri ?? undefined,
  };
};
