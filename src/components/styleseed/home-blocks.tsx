import { Ionicons } from "@expo/vector-icons";

import type { ComponentProps } from "react";

import { Pressable, StyleSheet, Text, View } from "react-native";

import { useSafeAreaInsets } from "react-native-safe-area-context";

import { color } from "../../constants/tokens";

import { fonts, palette } from "../../constants/ui";

import { formatTemperature, type WeatherState } from "../../lib/weather";

import { getWeatherRule } from "../../utils/weatherRecommendation";

import { getWeatherIcon, WeatherSummary } from "./weather-summary";

import { Badge } from "./ui";

// 홈 화면 조각들. Figma 07 Prototype `PROTO FULL · H · HOME_QUICK_ACTIONS_WITH_TABBAR_V1 · main` (262:12473)

type IoniconName = ComponentProps<typeof Ionicons>["name"];

type HomeWeatherProps = {
  state: WeatherState;
  onRetry?: () => void;
};

// WeatherSummary · Coral × Green. 날씨를 못 불러온 경우는 기존 안내 문구를 면 위에 그대로 보여준다
export function HomeWeather({ state, onRetry }: HomeWeatherProps) {
  if (state.status !== "ready") {
    return (
      <View style={styles.fallback}>
        <WeatherSummary state={state} onRetry={onRetry} />
      </View>
    );
  }

  const { weather } = state;

  // "… — 가벼운 겉옷" 에서 입을 옷 안내만 꺼낸다
  const wear = getWeatherRule(weather).label.split(" — ").pop() ?? "";

  return (
    <View style={styles.weatherRow}>
      <View style={[styles.block, styles.coral]}>
        <Text style={styles.eyebrow}>
          {(weather.city ?? "현재 위치").toUpperCase()}
        </Text>

        <View style={styles.temp}>
          <Text
            style={styles.temperature}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {formatTemperature(weather.temperature).replace("°C", "")}
          </Text>

          <Text style={styles.condition} numberOfLines={1}>
            {weather.label}
            {weather.apparentTemperature !== null
              ? ` · 체감 ${formatTemperature(weather.apparentTemperature)}`
              : ""}
          </Text>
        </View>
      </View>

      <View style={[styles.block, styles.green]}>
        <Ionicons
          name={getWeatherIcon(weather.kind, weather.isDay)}
          size={28}
          color={palette.onVivid}
        />

        <View style={styles.rec}>
          <Text style={styles.eyebrow}>WEAR</Text>

          <Text style={styles.wear}>{wear}</Text>
        </View>
      </View>
    </View>
  );
}

type QuickActionCardProps = {
  icon: IoniconName;
  label: string;
  description: string;
  onPress?: () => void;

  // 아직 만들지 않은 기능 표시
  comingSoon?: boolean;
};

function QuickActionCard({
  icon,
  label,
  description,
  onPress,
  comingSoon = false,
}: QuickActionCardProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label.replace("\n", " ")}
      accessibilityState={{ disabled: comingSoon }}
      disabled={comingSoon}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        comingSoon && styles.cardSoon,
        pressed && styles.cardPressed,
      ]}
    >
      <Ionicons name={icon} size={24} color={color.icon.default} />

      <View style={styles.cardText}>
        <Text style={styles.cardLabel}>{label}</Text>

        <Text style={styles.cardDescription}>{description}</Text>
      </View>

      {comingSoon ? <Badge label="준비 중" /> : null}
    </Pressable>
  );
}

type HomeQuickActionsProps = {
  onAddItem: () => void;
  onLinkStyle: () => void;
};

// Quick Actions. "상품 링크로 코디하기"는 화면 흐름만 연결했다(사진 분석·링크 읽기는 TODO: src/lib/linkProduct.ts)
export function HomeQuickActions({ onAddItem, onLinkStyle }: HomeQuickActionsProps) {
  return (
    <View style={styles.cards}>
      <QuickActionCard
        icon="camera-outline"
        label={"내 옷 등록하기"}
        description={"사진을 등록해\n디지털 옷장에 추가"}
        onPress={onAddItem}
      />

      <QuickActionCard
        icon="link-outline"
        label={"상품 링크로\n코디하기"}
        description="쇼핑 전 코디 TOP 3 확인"
        onPress={onLinkStyle}
      />
    </View>
  );
}

export type HomeTab = "today" | "closet" | "styling" | "my";

const TABS: { key: HomeTab; label: string; icon: IoniconName }[] = [
  { key: "today", label: "오늘", icon: "home-outline" },
  { key: "closet", label: "옷장", icon: "shirt-outline" },
  { key: "styling", label: "코디", icon: "sparkles-outline" },
  { key: "my", label: "마이", icon: "person-outline" },
];

type BottomTabBarProps = {
  active: HomeTab;
  onSelect: (tab: HomeTab) => void;
};

// BottomNavigation (4탭). 현재는 홈에서만 보인다 — 다른 화면에 공통으로 둘지는 탭 구조 결정 후
export function BottomTabBar({ active, onSelect }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.tabBar, { paddingBottom: insets.bottom }]}>
      {TABS.map((tab) => {
        const selected = tab.key === active;

        return (
          <Pressable
            key={tab.key}
            accessibilityRole="tab"
            accessibilityLabel={tab.label}
            accessibilityState={{ selected }}
            onPress={() => onSelect(tab.key)}
            style={styles.tab}
          >
            {selected ? <View style={styles.indicator} /> : null}

            <Ionicons name={tab.icon} size={24} color={color.icon.default} />

            <Text style={[styles.tabLabel, selected && styles.tabLabelActive]}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    padding: 20,
    backgroundColor: palette.surface,
  },

  weatherRow: {
    flexDirection: "row",
    gap: 8,
  },

  block: {
    minHeight: 220,
    justifyContent: "space-between",
  },

  coral: {
    flex: 7,
    padding: 20,
    backgroundColor: palette.coralBlock,
  },

  green: {
    flex: 3,
    padding: 16,
    backgroundColor: palette.greenBlock,
  },

  eyebrow: {
    fontFamily: fonts.sans,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "600",
    letterSpacing: 1.5,
    color: palette.onVivid,
  },

  temp: {
    gap: 4,
  },

  // Figma: Bricolage Grotesque Bold 88/88, 자간 -4. 폰트 적용 전까지 시스템 폰트
  temperature: {
    fontFamily: fonts.sans,
    fontSize: 88,
    lineHeight: 88,
    fontWeight: "700",
    letterSpacing: -4,
    color: palette.onVivid,
  },

  condition: {
    fontFamily: fonts.sans,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: "500",
    color: palette.onVivid,
  },

  rec: {
    gap: 4,
  },

  wear: {
    fontFamily: fonts.sans,
    fontSize: 20,
    lineHeight: 28,
    fontWeight: "700",
    color: palette.onVivid,
  },

  cards: {
    flexDirection: "row",
    gap: 8,
  },

  card: {
    flex: 1,
    minHeight: 140,
    padding: 16,
    gap: 12,
    alignItems: "flex-start",
    backgroundColor: palette.surface,
  },

  cardSoon: {
    opacity: 0.6,
  },

  cardPressed: {
    opacity: 0.8,
  },

  cardText: {
    gap: 4,
  },

  cardLabel: {
    fontFamily: fonts.sans,
    fontSize: 17,
    lineHeight: 24,
    fontWeight: "600",
    letterSpacing: -0.2,
    color: palette.ink,
  },

  cardDescription: {
    fontFamily: fonts.sans,
    fontSize: 12,
    lineHeight: 18,
    color: palette.body,
  },

  tabBar: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: palette.line,
    backgroundColor: palette.background,
  },

  tab: {
    flex: 1,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },

  indicator: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: color.bg.inverse,
  },

  tabLabel: {
    fontFamily: fonts.sans,
    fontSize: 12,
    lineHeight: 18,
    color: palette.body,
  },

  tabLabelActive: {
    fontWeight: "600",
    color: palette.ink,
  },
});
