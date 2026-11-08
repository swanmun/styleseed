import { create } from "zustand";

import type { Clothing } from "../types";

// 상품 링크로 코디하기: 링크 입력 → 상품 확인 → TOP 3 화면 사이에서 쓰는 값.
// 저장하지 않는다(새로고침하면 처음부터). 상품 사진은 분석에만 쓰고 옷장에 넣지 않는다.
type LinkProductStore = {
  link: string;
  imageUri: string | null;
  product: Clothing | null;

  setInput: (link: string, imageUri: string | null) => void;
  setProduct: (product: Clothing) => void;
  reset: () => void;
};

export const useLinkProductStore = create<LinkProductStore>()((set) => ({
  link: "",
  imageUri: null,
  product: null,

  setInput: (link, imageUri) => set({ link, imageUri, product: null }),
  setProduct: (product) => set({ product }),
  reset: () => set({ link: "", imageUri: null, product: null }),
}));
