import { router } from "expo-router";

import { useMemo } from "react";

import {
  ActivityIndicator,
  Alert,
  Linking,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { ClothingImage } from "../components/styleseed/clothing-image";

import {
  Badge,
  Button,
  EmptyState,
  Label,
  Screen,
  ScreenHeader,
  ScoreDisplay,
} from "../components/styleseed/ui";

import { fonts, palette } from "../constants/ui";

import { useClosetLoader } from "../hooks/use-closet-loader";

import { LINK_PRODUCT_ID, getLinkStoreName } from "../lib/linkProduct";

import { useClosetStore } from "../store/useClosetStore";

import { useLinkProductStore } from "../store/useLinkProductStore";

import { getClothingName } from "../utils/format";

import { getRankedLooksForItem } from "../utils/outfitScore";

// 상품 링크로 코디하기 3 — 새 상품 + 내 옷장으로 만든 코디 TOP 3 (Figma 07 L4) → 판매처 이동 (L5)
// 추천은 옷장의 "이 옷으로 코디하기"와 같은 엔진(getRankedLooksForItem)에 새 상품을 기준 옷으로 넣는다.
// 엔진이 바뀌면 이 화면도 그대로 새 엔진을 쓴다.
export default function LinkLooksScreen() {
  const link = useLinkProductStore((state) => state.link);

  const product = useLinkProductStore((state) => state.product);

  const reset = useLinkProductStore((state) => state.reset);

  const clothes = useClosetStore((state) => state.clothes);

  const { status } = useClosetLoader();

  const looks = useMemo(
    () => (product ? getRankedLooksForItem(product, clothes, 3) : []),
    [product, clothes],
  );

  const store = link ? getLinkStoreName(link) : null;

  const openStore = () => {
    if (!link) {
      return;
    }

    Alert.alert(
      "판매처로 이동할까요?",
      `${store ?? "판매처"} 상품 페이지로 이동해요. 구매는 판매처에서 진행돼요.`,
      [
        { text: "취소", style: "cancel" },
        { text: "이동", onPress: () => void Linking.openURL(link) },
      ],
    );
  };

  const startOver = () => {
    reset();

    router.replace("/link-style");
  };

  if (!product) {
    return (
      <Screen>
        <ScreenHeader eyebrow="PRODUCT LINK" title="코디 TOP 3" />

        <EmptyState
          title="상품 정보가 없어요."
          description="링크와 상품 사진을 다시 넣어주세요."
          action={<Button label="상품 넣기" onPress={startOver} />}
        />
      </Screen>
    );
  }

  return (
    <Screen
      footer={
        <View style={styles.footer}>
          <Button label="다른 상품으로 코디하기" variant="secondary" onPress={startOver} />

          <Button label="원래 판매처에서 보기" disabled={!link} onPress={openStore} />
        </View>
      }
    >
      <ScreenHeader
        eyebrow="YOUR WARDROBE × NEW ITEM"
        title={"이 옷으로 완성한\n코디 TOP 3"}
        description="내 옷장 속 아이템과 조합한 추천 코디예요."
      />

      <View style={styles.productCard}>
        <ClothingImage clothing={product} style={styles.productImage} />

        <View style={styles.productInfo}>
          <Badge label="NEW ITEM" inverted />

          <Text style={styles.productName}>{getClothingName(product).toUpperCase()}</Text>

          <Text style={styles.productMeta}>
            {store ? `${store} · 외부 구매 후보` : "외부 구매 후보"}
          </Text>
        </View>
      </View>

      {status === "loading" && looks.length === 0 ? (
        <ActivityIndicator color={palette.ink} />
      ) : looks.length === 0 ? (
        <EmptyState
          title="이 상품과 조합할 옷이 부족해요."
          description="옷장에 옷을 더 등록하면 코디를 만들 수 있어요."
          action={
            <Button
              label="내 옷 등록하기"
              variant="secondary"
              onPress={() => router.push("/upload")}
            />
          }
        />
      ) : (
        looks.map((look, index) => (
          <View key={look.items.map((item) => item.id).join("-")} style={styles.look}>
            <View style={styles.lookHead}>
              <Label style={styles.lookLabel}>{`LOOK 0${index + 1}`}</Label>

              <ScoreDisplay value={look.total} caption="MATCH" size="medium" />
            </View>

            <View style={styles.itemRow}>
              {look.items.map((item) => (
                <View key={item.id} style={styles.item}>
                  <ClothingImage clothing={item} style={styles.itemImage} />

                  <Badge
                    label={item.id === LINK_PRODUCT_ID ? "NEW ITEM" : "MY CLOSET"}
                    inverted={item.id !== LINK_PRODUCT_ID}
                  />

                  <Text style={styles.itemName} numberOfLines={2}>
                    {getClothingName(item)}
                  </Text>
                </View>
              ))}
            </View>

            {look.reasons[0] ? <Text style={styles.reason}>{look.reasons[0]}</Text> : null}

            {look.tags.length > 0 ? (
              <Text style={styles.tags}>{look.tags.slice(0, 3).join(" / ")}</Text>
            ) : null}
          </View>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  productCard: {
    marginTop: 16,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: palette.surface,
  },

  productImage: {
    width: 72,
    height: 88,
  },

  productInfo: {
    flex: 1,
    alignItems: "flex-start",
    gap: 6,
  },

  productName: {
    fontFamily: fonts.sans,
    fontSize: 17,
    fontWeight: "700",
    color: palette.ink,
  },

  productMeta: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: palette.subtle,
  },

  look: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: palette.line,
  },

  lookHead: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: palette.indigoDeep,
  },

  lookLabel: {
    color: palette.onVivid,
  },

  itemRow: {
    padding: 14,
    flexDirection: "row",
    gap: 8,
  },

  item: {
    flex: 1,
    alignItems: "flex-start",
    gap: 6,
  },

  itemImage: {
    width: "100%",
    height: 110,
  },

  itemName: {
    fontFamily: fonts.sans,
    fontSize: 11,
    lineHeight: 15,
    color: palette.body,
  },

  reason: {
    paddingHorizontal: 14,
    fontFamily: fonts.sans,
    fontSize: 13,
    lineHeight: 19,
    color: palette.ink,
  },

  tags: {
    paddingHorizontal: 14,
    paddingTop: 6,
    paddingBottom: 14,
    fontFamily: fonts.sans,
    fontSize: 12,
    color: palette.subtle,
  },

  footer: {
    gap: 10,
  },
});
