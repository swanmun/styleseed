/**
 * 하나의 흐름 규칙이 공식 의류 분류 사전 V1(117개)의 세부분류를 알아듣게 하는 표 (styleseed-team-docs 라운드 26)
 *
 * 원본: src/constants/taxonomy/clothing-taxonomy.v1.json (1.0.0, 2026-11-04 PO 결정) — 팀 문서 04-data/taxonomy 사본과 같은 파일.
 * 사전의 규칙 그대로: weatherAs(날씨 규칙에서 같은 취급)가 있으면 그것, 없으면 3단계는 parent, 2단계는 자기 자신.
 *   예) sandals.slide → sandals, coat.trench → jacket, oxford-shoes.derby → oxford-shoes → loafer
 * 보온(clo)·계절 섞임·피하는 짝처럼 "이 옷이 어떤 종류인가"를 보는 규칙은 이 값으로 비교한다.
 * 표가 사전과 같은지는 __tests__/flow.taxonomy.test.mjs가 사전 JSON을 읽어 확인한다(사전이 바뀌면 시험이 알려 줌).
 * 앱 main(2026-11-09)에는 엔진용 계열 판단 outfitProfile.matchSubCategory가 있다. 합칠 때 이 표와 맞춘다.
 */
export const WEATHER_BASE: Record<string, string> = {
  // top
  "tshirt.sports-jersey": "tshirt",
  "shirt.overshirt": "shirt",
  "shirt.camp-collar": "tshirt",
  "blouse.peasant": "blouse",
  "hoodie.zip-up": "hoodie",
  "sleeveless.tank-top": "sleeveless",
  "sleeveless.camisole": "sleeveless",
  "sleeveless.tube-top": "sleeveless",
  "sleeveless.sports-bra": "sleeveless",
  "polo-shirt": "tshirt",
  "bodysuit": "tshirt",
  "bustier-top": "sleeveless",
  // bottom
  "trousers.cargo": "trousers",
  "trousers.track-pants": "trousers",
  "trousers.sweatpants": "trousers",
  "shorts.athletic": "shorts",
  "shorts.biker": "shorts",
  "skirt.tulle": "skirt",
  "culottes": "skirt",
  "skort": "skirt",
  // outer
  "jacket.biker": "jacket",
  "jacket.bomber": "jacket",
  "jacket.utility": "jacket",
  "jacket.track": "jacket",
  "jacket.varsity": "jacket",
  "coat.trench": "jacket",
  "coat.duffle": "coat",
  "cardigan.bolero-shrug": "cardigan",
  "padding.light-quilted": "jacket",
  "vest.utility": "vest",
  "windbreaker": "jacket",
  "cape-poncho": "jacket",
  "cape-poncho.cape": "jacket",
  "cape-poncho.poncho": "jacket",
  // dress
  "dress.knit": "knit",
  "dress.tshirt": "tshirt",
  "dress.bodycon": "mini-dress",
  "dress.pinafore": "midi-dress",
  "jumpsuit.overalls": "jumpsuit",
  "shirt-dress": "midi-dress",
  "slip-dress": "mini-dress",
  "romper": "mini-dress",
  // shoes
  "sneakers.running": "sneakers",
  "boots.chelsea": "boots",
  "boots.combat": "boots",
  "boots.western": "boots",
  "boots.rain": "boots",
  "boots.shearling": "boots",
  "boots.hiking": "boots",
  "sandals.slide": "sandals",
  "sandals.flip-flop": "sandals",
  "sandals.sport": "sandals",
  "mules": "flats",
  "oxford-shoes": "loafer",
  "oxford-shoes.derby": "loafer",
  "mary-jane": "flats",
  // bag
  "tote-bag.top-handle": "tote-bag",
  // accessory
  "hat.cap": "hat",
  "hat.beanie": "hat",
  "hat.bucket": "hat",
  "hat.beret": "hat",
  "hat.brimmed": "hat",
  "scarf.muffler": "scarf",
  "scarf.square": "scarf",
  "bracelet.watch": "bracelet",
  "glasses.sunglasses": "glasses",
  "hair-accessory.ribbon": "hair-accessory",
};

// 표에 없는 값(예전 41개 값, long-boots 같은 시험용 값)은 그대로 쓴다
export const weatherBase = (subCategory: string) => WEATHER_BASE[subCategory] ?? subCategory;
