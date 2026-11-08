import * as ImagePicker from "expo-image-picker";

import { router } from "expo-router";

import { useState } from "react";

import {
  Alert,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { Button, Label, Screen, ScreenHeader } from "../components/styleseed/ui";

import { fonts, palette } from "../constants/ui";

import { getLinkStoreName, isProductLink } from "../lib/linkProduct";

import { useLinkProductStore } from "../store/useLinkProductStore";

// 상품 링크로 코디하기 1 — 링크·상품 사진 넣기 (Figma 07 L1)
// 링크는 지금 읽지 않고 "원래 판매처에서 보기"에만 쓴다(TODO 링크 읽기: src/lib/linkProduct.ts).
// 상품 사진(캡처 가능)은 나중에 사진 분석 API에 넣는다. 지금은 상품 확인 화면에 보여주기만 한다.
export default function LinkStyleScreen() {
  const savedLink = useLinkProductStore((state) => state.link);

  const savedImage = useLinkProductStore((state) => state.imageUri);

  const setInput = useLinkProductStore((state) => state.setInput);

  const [link, setLink] = useState(savedLink);

  const [imageUri, setImageUri] = useState<string | null>(savedImage);

  const trimmed = link.trim();

  const linkError = trimmed !== "" && !isProductLink(trimmed);

  const canContinue = !linkError && (trimmed !== "" || imageUri !== null);

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        quality: 1,
      });

      if (!result.canceled) {
        setImageUri(result.assets[0].uri);
      }
    } catch (error) {
      console.warn("상품 사진 불러오기 실패:", error);

      Alert.alert("사진을 불러오지 못했어요", "다른 사진을 선택해주세요.");
    }
  };

  const onContinue = () => {
    setInput(trimmed, imageUri);

    router.push("/link-confirm");
  };

  return (
    <Screen
      footer={
        <Button label="코디 만들기" disabled={!canContinue} onPress={onContinue} />
      }
    >
      <ScreenHeader
        eyebrow="PRODUCT LINK"
        title={"사고 싶은 옷,\n내 옷과 어울릴까요?"}
        description="쇼핑몰 상품 링크와 상품 사진을 넣으면 내 옷장에 있는 옷과 조합한 코디 TOP 3를 보여드려요."
      />

      <View style={styles.box}>
        <Label style={styles.boxLabel}>PRODUCT LINK</Label>

        <TextInput
          value={link}
          onChangeText={setLink}
          placeholder="https://www.example-store.com/…"
          placeholderTextColor={palette.muted}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          style={styles.input}
        />

        {linkError ? (
          <Text style={styles.error}>https://로 시작하는 상품 링크를 넣어주세요.</Text>
        ) : (
          <Text style={styles.hint}>
            {trimmed && getLinkStoreName(trimmed)
              ? `${getLinkStoreName(trimmed)} · 구매는 원래 판매처에서 진행돼요.`
              : "구매는 원래 판매처에서 진행돼요."}
          </Text>
        )}
      </View>

      <View style={styles.box}>
        <Label style={styles.boxLabel}>PRODUCT PHOTO</Label>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="상품 사진 고르기"
          onPress={pickImage}
          style={({ pressed }) => [styles.photo, pressed && styles.photoPressed]}
        >
          {imageUri ? (
            <Image source={{ uri: imageUri }} style={styles.photoImage} resizeMode="contain" />
          ) : (
            <Text style={styles.photoText}>+ 상품 사진 고르기{"\n"}(상품 화면 캡처도 돼요)</Text>
          )}
        </Pressable>

        <Text style={styles.hint}>
          사진은 상품 종류와 색을 알아내는 데만 쓰고 옷장에 저장하지 않아요.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  box: {
    marginTop: 16,
    padding: 16,
    backgroundColor: palette.surface,
  },

  boxLabel: {
    marginBottom: 10,
    color: palette.ink,
  },

  input: {
    height: 48,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.background,
    color: palette.ink,
    paddingHorizontal: 14,
    fontFamily: fonts.sans,
    fontSize: 15,
  },

  hint: {
    marginTop: 8,
    fontFamily: fonts.sans,
    fontSize: 12,
    lineHeight: 17,
    color: palette.subtle,
  },

  error: {
    marginTop: 8,
    fontFamily: fonts.sans,
    fontSize: 12,
    color: palette.danger,
  },

  photo: {
    height: 180,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: palette.line,
    backgroundColor: palette.background,
    justifyContent: "center",
    alignItems: "center",
  },

  photoPressed: {
    opacity: 0.7,
  },

  photoImage: {
    width: "100%",
    height: "100%",
  },

  photoText: {
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    color: palette.body,
  },
});
