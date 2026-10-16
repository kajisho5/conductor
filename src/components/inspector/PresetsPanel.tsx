import { useRef } from 'react';
import { ActionSheetIOS, Platform, Pressable, ScrollView, View, findNodeHandle } from 'react-native';
import { router } from 'expo-router';
import { getDefinition } from '@/drivers/registry';
import { DEFAULT_STYLE } from '@/model/defaults';
import { devicesWithPresets } from '@/model/presets';
import type { Show } from '@/model/types';
import { useShowStore } from '@/stores/show';
import { useUiStore } from '@/stores/ui';
import { color, MIN_TAP, radius } from '@/theme/tokens';
import { AppText } from '@/components/ui/AppText';
import { EmptyState } from '@/components/ui/EmptyState';
import { Symbol } from '@/components/ui/Symbol';
import { ButtonFace } from '@/components/board/ButtonFace';

/**
 * プリセット（SPEC 2.1-1、docs/design 05）：機器ごと・分類ごとのできあいのボタン。
 * 選んでから、盤の空きマスをタップして置く（続けて何個でも置ける）。
 */
export function PresetsPanel({ compact }: { compact?: boolean }) {
  const show = useShowStore((s) => s.show);
  const deviceId = useUiStore((s) => s.presetDeviceId);
  const picked = useUiStore((s) => s.pendingPreset);
  const ref = useRef<View>(null);
  if (!show) return null;
  const sources = devicesWithPresets(show.devices, getDefinition);
  if (sources.length === 0) {
    return (
      <EmptyState
        icon="square.stack.3d.up"
        title="プリセットのある機器がありません"
        message="プリセットは機器のドライバが用意する、できあいのボタンです。対応する機器を追加すると、ここに並びます。"
        actionLabel="機器を追加"
        onAction={() => router.navigate('/devices/add')}
      />
    );
  }
  const current = sources.find((s) => s.device.id === deviceId) ?? sources[0]!;
  const presets = current.def.presets ?? [];
  const categories = [...new Set(presets.map((p) => p.category))];

  const chooseDevice = () => {
    if (Platform.OS !== 'ios') return;
    const options = [...sources.map((s) => `${s.device.label}（${s.def.name}）`), 'キャンセル'];
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: '機器',
        options,
        cancelButtonIndex: options.length - 1,
        anchor: ref.current ? (findNodeHandle(ref.current) ?? undefined) : undefined,
      },
      (i) => {
        const s = sources[i];
        if (s) useUiStore.getState().setPresetDevice(s.device.id);
      },
    );
  };

  return (
    <ScrollView contentContainerStyle={{ padding: compact ? 16 : 20, paddingBottom: 48 }}>
      <AppText variant="footnote" tone="label2" style={{ marginLeft: 4, marginBottom: 6 }}>
        機器
      </AppText>
      <Pressable
        ref={ref}
        onPress={chooseDevice}
        accessibilityRole="button"
        accessibilityLabel={`機器、${current.device.label}`}
        style={{
          minHeight: MIN_TAP,
          borderRadius: radius.field,
          backgroundColor: color.card,
          paddingHorizontal: 14,
          flexDirection: 'row',
          alignItems: 'center',
          marginBottom: 12,
        }}
      >
        <AppText style={{ flex: 1 }} numberOfLines={1}>{`${current.device.label}（${current.def.name}）`}</AppText>
        <Symbol name="chevron.up.chevron.down" size={14} tint={color.label2} />
      </Pressable>
      <AppText variant="footnote" tone="label2" style={{ marginLeft: 4, marginBottom: 12 }}>
        {picked ? '盤の空きマスをタップして置きます' : 'ボタンを選んでから、盤の空きマスをタップ'}
      </AppText>
      {categories.map((cat) => (
        <View key={cat} style={{ backgroundColor: color.card, borderRadius: radius.card, padding: 14, marginBottom: 12 }}>
          <AppText weight="600" style={{ marginBottom: 10 }}>
            {cat}
          </AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {presets
              .filter((p) => p.category === cat)
              .map((p) => {
                const sel = picked?.deviceId === current.device.id && picked.presetId === p.id;
                return (
                  <Pressable
                    key={p.id}
                    onPress={() => {
                      useUiStore.getState().pickPreset(sel ? null : { deviceId: current.device.id, presetId: p.id });
                      if (!sel && compact) router.back();
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: sel }}
                    accessibilityLabel={p.name}
                    style={{ borderRadius: 12, borderWidth: 3, borderColor: sel ? color.accent : 'transparent', padding: 2 }}
                  >
                    <ButtonFace
                      style={{ ...DEFAULT_STYLE, text: p.text, backgroundColor: p.backgroundColor ?? DEFAULT_STYLE.backgroundColor }}
                      text={p.text}
                      width={64}
                      height={58}
                      radius={9}
                    />
                  </Pressable>
                );
              })}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}
