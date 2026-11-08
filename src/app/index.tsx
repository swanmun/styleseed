import { Redirect, router, useFocusEffect, useLocalSearchParams } from "expo-router";

import { useCallback, useEffect, useMemo, useState } from "react";

import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { SplashIntro } from "../components/SplashIntro";

import { useIntroStore } from "../components/styleseed/app-tab-bar";

import {
  HomeQuickActions,
  HomeWeather,
} from "../components/styleseed/home-blocks";

import { Button, Screen } from "../components/styleseed/ui";

import { fonts, palette } from "../constants/ui";

import { useClosetLoader, type ClosetLoadStatus } from "../hooks/use-closet-loader";

import { useWeather } from "../hooks/use-weather";

import { FIGMA_ONBOARDING_START, FIGMA_START } from "../data/figma07";

import { FIGMA_PREVIEW, RESEARCH_MODE } from "../lib/featureFlags";

import { takeOnboardingTurn } from "../lib/onboarding";

import { getResearchSession } from "../lib/researchEvents";

import { useClosetStore } from "../store/useClosetStore";

import { getClothingName } from "../utils/format";

import {
  getTodaysLooks,
  getTodaysWeatherNotes,
} from "../utils/weatherRecommendation";

// 앱 실행 후 한 번만 인트로를 보여준다.
// (로그아웃 등으로 HOME이 다시 마운트될 때는 재생하지 않음)
let hasPlayedIntro = false;

// 미리보기 온보딩은 이 브라우저에서 처음 열 때만 보여 준다(저장이 막혀 있으면 매번 보여 준다)
const FIGMA_SEEN_KEY = "styleseed.figma07.seen";

const takeFigmaStart = () => {
  try {
    if (globalThis.localStorage?.getItem(FIGMA_SEEN_KEY)) {
      return FIGMA_START;
    }

    globalThis.localStorage?.setItem(FIGMA_SEEN_KEY, "1");
  } catch {
    // 저장소를 쓸 수 없으면 온보딩부터 시작한다
  }

  return FIGMA_ONBOARDING_START;
};

export default function IndexScreen() {
  const [showIntro, setShowIntro] = useState(!hasPlayedIntro);

  // 인트로가 재생되는 동안 앱 하단 탭바를 숨긴다
  const setIntroActive = useIntroStore((state) => state.setIntroActive);

  useEffect(() => {
    setIntroActive(showIntro);
  }, [showIntro, setIntroActive]);

  const handleIntroFinish = useCallback(() => {
    hasPlayedIntro = true;

    setShowIntro(false);
  }, []);

  const { app } = useLocalSearchParams<{ app?: string }>();

  if (showIntro) {
    return <SplashIntro onFinish={handleIntroFinish} />;
  }

  // Figma 미리보기 빌드: 인트로 뒤에 온보딩(처음 한 번) 또는 홈 프레임으로 간다
  if (FIGMA_PREVIEW && app !== "1") {
    return (
      <Redirect
        href={{
          pathname: "/prototype",
          params: { s: takeFigmaStart() },
        }}
      />
    );
  }

  return <HomeScreen />;
}

function HomeScreen() {
  const clothes = useClosetStore((state) => state.clothes);

  const { status: closetStatus } = useClosetLoader();

  const { weather, reload: reloadWeather } = useWeather();

  // 연구 모드에서 참가 코드를 아직 정하지 않았으면 진행자에게 안내한다
  const [needsResearchSetup, setNeedsResearchSetup] = useState(false);

  // 첫 실행 안내: 연구 모드에서는 진행자가 참가 코드를 정한 뒤(참가자에게 기기를 건넨 뒤)에만 띄운다
  useFocusEffect(
    useCallback(() => {
      let active = true;

      (async () => {
        const session = RESEARCH_MODE ? await getResearchSession() : null;

        if (!active) {
          return;
        }

        if (RESEARCH_MODE) {
          setNeedsResearchSetup(!session);
        }

        if ((!RESEARCH_MODE || session) && (await takeOnboardingTurn()) && active) {
          router.push("/onboarding");
        }
      })();

      return () => {
        active = false;
      };
    }, []),
  );

  // 현재 날씨 + 내 Digital Closet + 기존 코디 추천 로직
  const todaysLooks = useMemo(
    () =>
      getTodaysLooks(
        clothes,
        weather.status === "ready" ? weather.weather : null,
      ),
    [clothes, weather],
  );

  const weatherNotes = useMemo(
    () =>
      getTodaysWeatherNotes(
        clothes,
        weather.status === "ready" ? weather.weather : null,
      ),
    [clothes, weather],
  );

  const look = todaysLooks[0] ?? null;

  return (
    <Screen showBack={false}>
      <View style={styles.brand}>
        {/* 연구 모드: 진행자가 로고를 길게 눌러 조사 세션 화면을 연다 */}
        <Pressable
          disabled={!RESEARCH_MODE}
          onLongPress={() => router.push("/research")}
          delayLongPress={800}
        >
          <Text style={styles.logo}>STYLESEED</Text>
        </Pressable>

        {needsResearchSetup ? (
          <Text style={styles.researchHint}>
            진행자: 로고를 길게 눌러 참가 코드를 설정하세요
          </Text>
        ) : null}
      </View>

      <View style={styles.section}>
        <HomeWeather state={weather} onRetry={reloadWeather} />

        <View style={styles.recommendation}>
          {look ? (
            <>
              <Text style={styles.eyebrow}>
                {weather.status === "ready"
                  ? "오늘 날씨에 맞춘 추천 코디"
                  : "내 옷장에서 고른 추천 코디"}
              </Text>

              <Text style={styles.names} numberOfLines={2}>
                {look.recommendation.items.map(getClothingName).join("  ·  ")}
              </Text>

              {weatherNotes.slice(0, 2).map((note) => (
                <Text key={note.category} style={styles.note}>
                  {note.message}
                </Text>
              ))}

              <Button
                label="오늘의 코디 보기"
                variant="secondary"
                onPress={() => router.push("/today")}
              />
            </>
          ) : (
            <RecommendationEmpty
              closetStatus={closetStatus}
              onAddItem={() => router.push("/upload")}
              onSignIn={() => router.push("/login")}
            />
          )}
        </View>

        <HomeQuickActions
          onAddItem={() => router.push("/upload")}
          onLinkStyle={() => router.push("/link-style")}
        />
      </View>
    </Screen>
  );
}

type RecommendationEmptyProps = {
  closetStatus: ClosetLoadStatus;
  onAddItem: () => void;
  onSignIn: () => void;
};

// 추천 코디를 보여줄 수 없을 때(불러오는 중·로그인 전·오류·옷 부족)
function RecommendationEmpty({
  closetStatus,
  onAddItem,
  onSignIn,
}: RecommendationEmptyProps) {
  if (closetStatus === "loading") {
    return (
      <View style={styles.emptyRow}>
        <ActivityIndicator size="small" color={palette.ink} />

        <Text style={styles.emptyText}>옷장을 불러오고 있어요...</Text>
      </View>
    );
  }

  if (closetStatus === "signed-out") {
    return (
      <>
        <Text style={styles.emptyText}>
          로그인하면 내 옷장으로 오늘의 코디를 추천해드려요.
        </Text>

        <Button label="로그인" variant="secondary" onPress={onSignIn} />
      </>
    );
  }

  if (closetStatus === "error") {
    return (
      <Text style={styles.emptyText}>지금은 옷장을 불러오지 못했어요.</Text>
    );
  }

  return (
    <>
      <Text style={styles.emptyText}>
        옷을 몇 벌 등록하면 오늘의 코디를 추천해드려요.
      </Text>

      <Button label="옷 등록하기" variant="secondary" onPress={onAddItem} />
    </>
  );
}

const styles = StyleSheet.create({
  brand: {
    alignItems: "center",
    marginBottom: 16,
  },

  // Figma: Bricolage Grotesque ExtraBold 20. 폰트 적용 전까지 시스템 폰트
  logo: {
    fontFamily: fonts.sans,
    fontSize: 20,
    lineHeight: 24,
    fontWeight: "800",
    letterSpacing: -0.4,
    color: palette.ink,
  },

  researchHint: {
    marginTop: 10,
    fontFamily: fonts.sans,
    fontSize: 12,
    color: palette.danger,
  },

  section: {
    gap: 20,
  },

  recommendation: {
    gap: 8,
  },

  eyebrow: {
    fontFamily: fonts.sans,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "600",
    letterSpacing: 1.5,
    color: palette.body,
  },

  names: {
    marginBottom: 8,
    fontFamily: fonts.sans,
    fontSize: 17,
    lineHeight: 24,
    fontWeight: "600",
    letterSpacing: -0.2,
    color: palette.ink,
  },

  note: {
    fontFamily: fonts.sans,
    fontSize: 12,
    lineHeight: 17,
    color: palette.danger,
  },

  emptyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  emptyText: {
    marginBottom: 8,
    fontSize: 14,
    lineHeight: 22,
    color: palette.body,
  },
});
