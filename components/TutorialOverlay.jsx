// components/TutorialOverlay.jsx

import React, { useEffect, useMemo, useState } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  Platform,
  Dimensions,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import useTutorialStore from "../store/tutorialStore";

const { width, height } = Dimensions.get("window");

const TAB_ORDER = ["profile", "leaves", "payroll", "timekeeping", "settings"];
const TAB_BAR_HEIGHT = Platform.OS === "ios" ? 90 : 70;

function getTabHighlightRect(tabKey) {
  const idx = TAB_ORDER.indexOf(tabKey);
  if (idx < 0) return null;

  const tabCount = TAB_ORDER.length;
  const tabWidth = width / tabCount;

  const left = idx * tabWidth + tabWidth * 0.08;
  const highlightWidth = tabWidth * 0.84;
  const top = height - TAB_BAR_HEIGHT;
  const highlightHeight = TAB_BAR_HEIGHT - 8;

  return {
    left,
    top,
    width: highlightWidth,
    height: highlightHeight,
    placement: "bottom",
    centerX: left + highlightWidth / 2,
  };
}

export default function TutorialOverlay() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [bubbleLayout, setBubbleLayout] = useState(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const { visible, steps, stepIndex, back, next, skip } = useTutorialStore(
    (s) => ({
      visible: s.visible,
      steps: s.steps,
      stepIndex: s.stepIndex,
      back: s.back,
      next: s.next,
      skip: s.skip,
    })
  );

  const step = steps?.[stepIndex];
  const isLast = stepIndex >= (steps?.length || 0) - 1;

  useEffect(() => {
    // Whenever the step changes or the tutorial re-opens, close the "More" panel.
    setDetailsOpen(false);
  }, [stepIndex, visible]);

  const highlightRect = useMemo(() => {
    const h = step?.highlight;
    if (!h) return null;
    if (h.kind === "tab") return getTabHighlightRect(h.tab);
    return null;
  }, [step?.highlight]);

  const progress = useMemo(() => {
    const total = steps?.length || 0;
    return total ? `${stepIndex + 1} / ${total}` : "";
  }, [stepIndex, steps?.length]);

  if (!step) return null;

  const detailsSections = Array.isArray(step?.details) ? step.details : [];
  const hasDetails = detailsSections.length > 0;

  const bottomOffset = TAB_BAR_HEIGHT + (insets?.bottom || 0) + 12;
  const maxDetailsHeight = Math.max(
    220,
    height - (insets?.top || 0) - bottomOffset - 24
  );

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View className="flex-1" style={{ backgroundColor: "rgba(0,0,0,0.55)" }}>
        {/* Skip */}
        <View
          style={{
            paddingTop: Platform.OS === "ios" ? 60 : 30,
            paddingHorizontal: 18,
            alignItems: "flex-end",
          }}
        >
          <TouchableOpacity
            onPress={skip}
            className="bg-white/15 px-4 py-2 rounded-full flex-row items-center"
            activeOpacity={0.85}
          >
            <Text style={{ color: "#fff", fontWeight: "600", marginRight: 8 }}>
              Skip
            </Text>
            <Ionicons name="close" size={18} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Highlight */}
        {!!highlightRect && (
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              left: highlightRect.left,
              top: highlightRect.top,
              width: highlightRect.width,
              height: highlightRect.height,
              borderRadius: 14,
              borderWidth: 2,
              borderColor: "#fb923c",
              backgroundColor: "rgba(251,146,60,0.16)",
            }}
          />
        )}

        {/* Bubble */}
        <View
          style={{
            flex: 1,
            justifyContent: "flex-end",
          }}
        >
          {/* Details sheet (More) - replaces the main bubble on small screens */}
          {detailsOpen && hasDetails ? (
            <View
              className="mx-4 bg-white rounded-2xl border border-slate-200"
              style={{
                padding: 16,
                marginBottom: bottomOffset,
                marginTop: (insets?.top || 0) + 12,
                maxWidth: 520,
                alignSelf: "center",
                width: Math.min(width - 32, 520),
                ...Platform.select({
                  ios: {
                    shadowColor: "#000",
                    shadowOffset: { width: 0, height: 8 },
                    shadowOpacity: 0.18,
                    shadowRadius: 14,
                  },
                  android: { elevation: 12 },
                }),
              }}
            >
              <View className="flex-row items-center justify-between mb-2">
                <Text className="text-slate-900 text-base font-bold">
                  {step.title} — Details
                </Text>
                <TouchableOpacity
                  onPress={() => setDetailsOpen(false)}
                  className="px-2 py-1 rounded-full bg-slate-100"
                  activeOpacity={0.85}
                >
                  <Ionicons name="close" size={18} color="#334155" />
                </TouchableOpacity>
              </View>

              <ScrollView
                style={{ maxHeight: Math.min(520, maxDetailsHeight) }}
                showsVerticalScrollIndicator={false}
              >
                {detailsSections.map((section, sectionIdx) => (
                  <View key={`${sectionIdx}-${section?.title || "section"}`}>
                    {!!section?.title && (
                      <Text className="text-xs font-bold text-slate-500 uppercase mt-3 mb-2">
                        {section.title}
                      </Text>
                    )}
                    {(section?.items || []).map((item, itemIdx) => (
                      <View
                        key={`${sectionIdx}-${itemIdx}-${item?.label || "item"}`}
                        className="flex-row mb-2"
                      >
                        <View
                          className="mt-1 mr-2"
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: 3,
                            backgroundColor: "#fb923c",
                          }}
                        />
                        <View style={{ flex: 1 }}>
                          <Text className="text-slate-800 font-semibold">
                            {item.label}
                          </Text>
                          {!!item.description && (
                            <Text className="text-slate-600 text-xs mt-0.5">
                              {item.description}
                            </Text>
                          )}
                        </View>
                      </View>
                    ))}
                  </View>
                ))}
              </ScrollView>
            </View>
          ) : (
            <View
              className="mx-4 bg-white rounded-2xl border border-slate-200"
              onLayout={(e) => setBubbleLayout(e.nativeEvent.layout)}
              style={{
                padding: 18,
                // Keep the bubble near the bottom navigation bar
                marginBottom:
                  highlightRect?.placement === "bottom" ? bottomOffset : 32,
                ...Platform.select({
                  ios: {
                    shadowColor: "#000",
                    shadowOffset: { width: 0, height: 8 },
                    shadowOpacity: 0.15,
                    shadowRadius: 12,
                  },
                  android: { elevation: 10 },
                }),
                maxWidth: 520,
                alignSelf: "center",
                width: Math.min(width - 32, 520),
              }}
            >
              <View className="flex-row items-center justify-between">
                <Text className="text-slate-900 text-lg font-bold">
                  {step.title}
                </Text>
                <View className="bg-slate-100 px-2 py-1 rounded-full">
                  <Text className="text-slate-600 text-xs font-semibold">
                    {progress}
                  </Text>
                </View>
              </View>

              <Text className="text-slate-600 mt-3" style={{ lineHeight: 20 }}>
                {step.body}
              </Text>

              {!!step.route && (
                <TouchableOpacity
                  onPress={() => router.push(step.route)}
                  className="mt-4 bg-orange-50 border border-orange-100 rounded-xl px-4 py-3 flex-row items-center justify-between"
                  activeOpacity={0.85}
                >
                  <Text className="text-orange-700 font-semibold">
                    {step.routeLabel || "Open"}
                  </Text>
                  <Ionicons name="arrow-forward" size={18} color="#c2410c" />
                </TouchableOpacity>
              )}

              {/* More */}
              {hasDetails && (
                <TouchableOpacity
                  onPress={() => setDetailsOpen(true)}
                  className="mt-3 flex-row items-center justify-center py-2 rounded-xl border border-slate-200 bg-slate-50"
                  activeOpacity={0.85}
                >
                  <Ionicons
                    name="information-circle-outline"
                    size={18}
                    color="#475569"
                  />
                  <Text className="ml-2 text-slate-700 font-semibold">
                    More
                  </Text>
                </TouchableOpacity>
              )}

              {/* Controls */}
              <View className="flex-row items-center justify-between mt-5">
                <TouchableOpacity
                  onPress={back}
                  disabled={stepIndex === 0}
                  className="px-4 py-3 rounded-xl border border-slate-200"
                  style={{ opacity: stepIndex === 0 ? 0.4 : 1 }}
                  activeOpacity={0.85}
                >
                  <Text className="text-slate-800 font-semibold">Back</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={next}
                  className="px-5 py-3 rounded-xl bg-orange-500"
                  activeOpacity={0.9}
                  style={{
                    ...Platform.select({
                      ios: {
                        shadowColor: "#f97316",
                        shadowOffset: { width: 0, height: 3 },
                        shadowOpacity: 0.22,
                        shadowRadius: 6,
                      },
                      android: { elevation: 4 },
                    }),
                  }}
                >
                  <Text className="text-white font-bold">
                    {isLast ? "Done" : "Next"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Arrow pointing to the highlighted area */}
          {!!highlightRect &&
            highlightRect.placement === "bottom" &&
            !!bubbleLayout && (
            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                left:
                  Math.max(24, Math.min(width - 24, highlightRect.centerX)) - 12,
                top: bubbleLayout.y + bubbleLayout.height - 1,
              }}
            >
              {/* Outer (border) triangle */}
              <View
                style={{
                  width: 0,
                  height: 0,
                  borderLeftWidth: 12,
                  borderRightWidth: 12,
                  borderTopWidth: 16,
                  borderLeftColor: "transparent",
                  borderRightColor: "transparent",
                  borderTopColor: "#e2e8f0",
                }}
              />
              {/* Inner (fill) triangle */}
              <View
                style={{
                  position: "absolute",
                  top: 2,
                  left: 2,
                  width: 0,
                  height: 0,
                  borderLeftWidth: 10,
                  borderRightWidth: 10,
                  borderTopWidth: 14,
                  borderLeftColor: "transparent",
                  borderRightColor: "transparent",
                  borderTopColor: "#ffffff",
                }}
              />
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}



