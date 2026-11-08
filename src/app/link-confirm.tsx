import { router } from "expo-router";

import { useState } from "react";

import { Image, Pressable, StyleSheet, Text, View } from "react-native";

import {
  Badge,
  Button,
  Label,
  Screen,
  ScreenHeader,
} from "../components/styleseed/ui";

import { fonts, palette } from "../constants/ui";

import {
  LINK_PRODUCT_CATEGORIES,
  LINK_PRODUCT_COLORS,
  buildPlaceholderProduct,
  getLinkStoreName,
} from "../lib/linkProduct";

import { useLinkProductStore } from "../store/useLinkProductStore";

import type { ClothingCategory, ClothingColor } from "../types";

import { getClothingName, toUpperLabel } from "../utils/format";

// 상품 링크로 코디하기 2 — 상품 확인 (Figma 07 L2)
// TODO(사진 분석 API): 분석 결과로 종류·색을 채운다. 지금은 사용자가 고른 값으로 임시 옷을 만든다.
export default function LinkConfirmScreen() {
  const link = useLinkProductStore((state) => state.link);

  const imageUri = useLinkProductStore((state) => state.imageUri);

  const setProduct = useLinkProductStore((state) => state.setProduct);

  const [category, setCategory] = useState<ClothingCategory>("top");

  const [color, setColor] = useState<ClothingColor>("black");

  const store = link ? getLinkStoreName(link) : null;

  // 결과 화면과 같은 이름을 보여주려고 같은 임시 옷을 미리 만든다
  const placeholder = buildPlaceholderProduct({ imageUri, category, color });

  const onMakeLooks = () => {
    setProduct(placeholder);

    router.push("/link-looks");
  };

  return (
    <Screen
      footer={
        <View style={styles.footer}>
          <Button
            label="다른 링크 입력하기"
            variant="secondary"
            onPress={() => router.back()}
          />

          <Button label="이 상품으로 코디 만들기" onPress={onMakeLooks} />
        </View>
      }
    >
      <ScreenHeader
        eyebrow="CHECK PRODUCT"
        title="이 상품이 맞나요?"
        description="확인한 상품을 내 옷장 속 옷과 조합해 드릴게요."
      />

      <View style={styles.photoBox}>
        <View style={styles.newBadge}>
          <Badge label="NEW ITEM" inverted />
        </View>

        {imageUri ? (
          <Image source={{ uri: imageUri }} style={styles.photo} resizeMode="contain" />
        ) : (
          <Text style={styles.noPhoto}>사진 없음</Text>
        )}
      </View>

      <View style={styles.info}>
        <Label>{store ? `SOURCE · ${store.toUpperCase()}` : "SOURCE · 링크 없음"}</Label>

        <Text style={styles.name}>{getClothingName(placeholder).toUpperCase()}</Text>

        <View style={styles.notice}>
          <Text style={styles.noticeText}>
            임시: 사진 분석이 아직 연결되지 않아 종류와 색을 직접 골라요. 연결되면 자동으로 채워져요.
          </Text>
        </View>

        <Label style={styles.pickLabel}>CATEGORY</Label>

        <ChipRow
          values={LINK_PRODUCT_CATEGORIES}
          selected={category}
          onSelect={(value) => setCategory(value as ClothingCategory)}
        />

        <Label style={styles.pickLabel}>COLOR</Label>

        <ChipRow
          values={LINK_PRODUCT_COLORS}
          selected={color}
          onSelect={(value) => setColor(value as ClothingColor)}
        />
      </View>
    </Screen>
  );
}

type ChipRowProps = {
  values: readonly string[];
  selected: string;
  onSelect: (value: string) => void;
};

function ChipRow({ values, selected, onSelect }: ChipRowProps) {
  return (
    <View style={styles.chips}>
      {values.map((value) => {
        const active = value === selected;

        return (
          <Pressable
            key={value}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onSelect(value)}
            style={[styles.chip, active && styles.chipActive]}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>
              {toUpperLabel(value)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  photoBox: {
    marginTop: 16,
    height: 220,
    backgroundColor: palette.surface,
    justifyContent: "center",
    alignItems: "center",
  },

  newBadge: {
    position: "absolute",
    top: 12,
    left: 12,
    zIndex: 1,
  },

  photo: {
    width: "100%",
    height: "100%",
  },

  noPhoto: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: palette.muted,
  },

  info: {
    marginTop: 12,
    padding: 16,
    backgroundColor: palette.mintSurface,
  },

  name: {
    marginTop: 6,
    fontFamily: fonts.sans,
    fontSize: 22,
    fontWeight: "700",
    color: palette.ink,
  },

  notice: {
    marginTop: 12,
    padding: 10,
    backgroundColor: palette.background,
  },

  noticeText: {
    fontFamily: fonts.sans,
    fontSize: 12,
    lineHeight: 17,
    color: palette.body,
  },

  pickLabel: {
    marginTop: 14,
    marginBottom: 8,
    color: palette.ink,
  },

  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },

  chip: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.background,
  },

  chipActive: {
    borderColor: palette.ink,
    backgroundColor: palette.ink,
  },

  chipText: {
    fontFamily: fonts.sans,
    fontSize: 12,
    fontWeight: "600",
    color: palette.ink,
  },

  chipTextActive: {
    color: palette.onPrimary,
  },

  footer: {
    gap: 10,
  },
});
