import { Pressable, ScrollView, View } from 'react-native';
import { color, radius } from '@/theme/tokens';
import { AppText } from '@/components/ui/AppText';
import { hitSlopFor } from '@/components/ui/Buttons';

/**
 * 色見本（ボタンの文字色・背景色）。見た目 28pt・当たり判定 44pt（SPEC 15.5）。
 * 色だけで区別しないよう、VoiceOver には色の名前を読ませ、選択中は外側の輪で示す。
 */

const NAMES: Record<string, string> = {
  auto: '自動',
  '#FFFFFF': '白',
  '#000000': '黒',
  '#F2C200': '黄',
  '#E0302B': '赤',
  '#1F9E48': '緑',
  '#1F5FD6': '青',
  '#8E8E93': '灰',
  '#2A2A2E': '濃い灰',
  '#151517': '黒に近い灰',
  '#050505': '黒',
  '#E9E9EC': '白に近い灰',
  '#E07800': '橙',
  '#7A3FD0': '紫',
  '#0F8A9E': '青緑',
  '#3F3FB8': '藍',
  '#6E1616': 'えんじ',
};

export function colorName(hex: string): string {
  return NAMES[hex.toUpperCase()] ?? NAMES[hex] ?? hex;
}

export function ColorSwatches({
  title,
  colors,
  value,
  onChange,
  allowAuto,
}: {
  title: string;
  colors: readonly string[];
  value: string;
  onChange: (v: string) => void;
  allowAuto?: boolean;
}) {
  const items = allowAuto ? ['auto', ...colors] : [...colors];
  return (
    <View style={{ marginBottom: 16 }}>
      <AppText variant="footnote" tone="label2" style={{ marginLeft: 4, marginBottom: 6 }}>
        {title}
      </AppText>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ backgroundColor: color.card, borderRadius: radius.field }}
        contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 12, gap: 16, alignItems: 'center' }}
        accessibilityRole="radiogroup"
        accessibilityLabel={title}
      >
        {items.map((c) => {
          const sel = c.toUpperCase() === value.toUpperCase();
          return (
            <Pressable
              key={c}
              onPress={() => onChange(c)}
              hitSlop={hitSlopFor(37, 37)}
              accessibilityRole="radio"
              accessibilityLabel={colorName(c)}
              accessibilityState={{ selected: sel }}
              style={{
                width: 37,
                height: 37,
                borderRadius: 19,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: sel ? 2.5 : 0,
                borderColor: color.label,
              }}
            >
              {c === 'auto' ? (
                <View
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    backgroundColor: color.fill,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <AppText variant="caption2" weight="700">
                    自動
                  </AppText>
                </View>
              ) : (
                <View
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    backgroundColor: c,
                    borderWidth: 1,
                    borderColor: 'rgba(255,255,255,0.18)',
                  }}
                />
              )}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
