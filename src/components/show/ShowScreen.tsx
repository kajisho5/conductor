import { useEffect, useMemo, useState } from 'react';
import { AppState, Pressable, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming, cancelAnimation, Easing } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { anyPressing, releaseAll } from '@/engine/press';
import { haptic } from '@/engine/haptics';
import { cellKey, columnBlocks, COMPACT_COLUMNS, fitCellRect } from '@/model/grid';
import type { Show } from '@/model/types';
import { REGULAR_MIN_WIDTH } from '@/hooks/useSizeClass';
import { useRuntimeStore } from '@/stores/runtime';
import { useUiStore } from '@/stores/ui';
import { useShowStore } from '@/stores/show';
import { board, color, MIN_TAP, radius } from '@/theme/tokens';
import { AppText } from '@/components/ui/AppText';
import { Chip, IconButton } from '@/components/ui/Buttons';
import { Segmented } from '@/components/ui/Segmented';
import { Symbol } from '@/components/ui/Symbol';
import { LiveTile } from '@/components/board/LiveTile';
import { currentPage, positionLabel, topBarText } from '@/components/board/boardHelpers';
import { useNow } from '@/components/board/useButtonView';
import { deviceSummary } from './deviceSummary';

/**
 * 本番画面（SPEC 2.1-2・3.4・3.5、docs/design 06・21）。
 * - 上：ページ名・時計・接続状況・ロック。下：ページ切替の帯（高さ 64pt 以上、ここだけ左右スワイプで切替）
 * - ロック中はボタンとページ切替だけ。解除は右上を長押し（設定の時間）
 * - 表示中は画面をスリープさせない
 */

const KEEP_AWAKE_TAG = 'conductor-show';
const BAND_HEIGHT = 76;

export function ShowScreen({ show, onClose }: { show: Show; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { width: winW } = useWindowDimensions();
  const pageNumber = useRuntimeStore((s) => s.pageNumber);
  const locked = useRuntimeStore((s) => s.locked);
  const block = useUiStore((s) => s.columnBlock);
  const status = useRuntimeStore((s) => s.deviceStatus);
  const now = useNow(true);
  const [area, setArea] = useState({ w: 0, h: 0 });

  const page = currentPage(show, pageNumber);
  const { columns, rows } = show.grid;
  const narrow = winW < REGULAR_MIN_WIDTH;
  const blocks = columnBlocks(columns);
  const blockIndex = narrow ? Math.min(block, blocks.length - 1) : 0;
  const colStart = narrow ? (blocks[blockIndex]?.start ?? 0) : 0;
  const colEnd = narrow ? (blocks[blockIndex]?.end ?? columns) : columns;
  const gap = narrow ? board.gapCompact : board.gapShow;
  const cell = area.w > 0 ? fitCellRect(area.w, area.h, narrow ? COMPACT_COLUMNS : columns, rows, gap) : null;
  const summary = deviceSummary(show, status);

  useEffect(() => {
    activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => undefined);
    useUiStore.getState().setInShowMode(true);
    // ショーは本番中も書き換わる（トリガーの有効・無効、Stream Deck のシリアルなど）ので、最新を読む。
    // 依存をショーにすると書き換わるたびに押しているボタンが離れてしまう
    const current = () => useShowStore.getState().show;
    const sub = AppState.addEventListener('change', (s) => {
      const sh = current();
      if (s !== 'active' && sh) releaseAll(sh);
    });
    return () => {
      sub.remove();
      useUiStore.getState().setInShowMode(false);
      const sh = current();
      if (sh) releaseAll(sh);
      deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => undefined);
    };
  }, [show.id]);

  /** 左右の切替：狭い時は列ブロック → ページの順に進む */
  const step = (dir: 1 | -1) => {
    const rt = useRuntimeStore.getState();
    const ui = useUiStore.getState();
    const count = show.pages.length;
    if (narrow && blocks.length > 1) {
      const next = Math.min(ui.columnBlock, blocks.length - 1) + dir;
      if (next >= 0 && next < blocks.length) {
        ui.setColumnBlock(next);
        return;
      }
      const n = ((rt.pageNumber - 1 + dir + count) % count) + 1;
      rt.setPageNumber(n);
      ui.setColumnBlock(dir === 1 ? 0 : blocks.length - 1);
      return;
    }
    rt.setPageNumber(((rt.pageNumber - 1 + dir + count) % count) + 1);
  };

  const swipe = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .activeOffsetX([-20, 20])
        .failOffsetY([-24, 24])
        .onEnd((e) => {
          if (anyPressing()) return;
          if (e.translationX < -40) step(1);
          else if (e.translationX > 40) step(-1);
        }),
    [show, narrow, blocks.length], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

  const grid = cell ? (
    <View style={{ gap }}>
      {Array.from({ length: rows }, (_, r) => (
        <View key={r} style={{ flexDirection: 'row', gap }}>
          {Array.from({ length: colEnd - colStart }, (_, i) => {
            const key = cellKey(r, colStart + i);
            const b = page.buttons[key];
            return (
              <LiveTile
                key={`${page.id}:${key}`}
                button={b}
                show={show}
                width={cell.w}
                height={cell.h}
                radius={narrow ? 10 : radius.showButton}
                topBar={topBarText(show, b, page.number, key)}
                swipeGesture={show.settings.showModeSwipe ? swipe : undefined}
                label={positionLabel(page.number, key)}
              />
            );
          })}
        </View>
      ))}
    </View>
  ) : null;

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: color.bg,
        paddingTop: insets.top + 8,
        paddingLeft: insets.left + 16,
        paddingRight: insets.right + 16,
      }}
    >
      {/* 上の帯 */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: MIN_TAP }}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View
            style={{
              minWidth: 30,
              height: 30,
              borderRadius: 8,
              backgroundColor: color.accent,
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: 6,
            }}
          >
            <AppText weight="700" style={{ color: color.onTint }}>
              {String(page.number)}
            </AppText>
          </View>
          <AppText variant="title2" numberOfLines={1} style={{ flexShrink: 1 }}>
            {page.name}
          </AppText>
        </View>
        {narrow ? null : (
          <AppText variant="title2" mono accessibilityLabel={`時刻 ${time}`}>
            {time}
          </AppText>
        )}
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 10 }}>
          {summary.total > 0 ? (
            <Chip label={`機器 ${summary.ok}/${summary.total}`} tone={summary.ok === summary.total ? 'ok' : 'warn'} />
          ) : null}
          {locked ? (
            <UnlockButton holdMs={show.settings.unlockHoldMs} />
          ) : (
            <>
              <IconButton
                icon="lock.open"
                label="ロックする"
                onPress={() => useRuntimeStore.getState().setLocked(true)}
                tint={color.label}
              />
              <IconButton icon="xmark" label="本番を終わる" onPress={onClose} tint={color.label} />
            </>
          )}
        </View>
      </View>

      {/* ボタン盤（ボタンの上で始まったタッチはボタン操作。SPEC 3.5） */}
      <View
        style={{ flex: 1, marginTop: 12, marginBottom: 12 }}
        onLayout={(e) => setArea({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
      >
        {grid ? show.settings.showModeSwipe ? <GestureDetector gesture={swipe}>{grid}</GestureDetector> : grid : null}
      </View>

      {/* 下の帯：ここだけ左右スワイプでページ・列を切替 */}
      <GestureDetector gesture={swipe}>
        <View
          style={{
            minHeight: BAND_HEIGHT,
            marginBottom: Math.max(insets.bottom, 12),
            borderRadius: radius.showButton,
            backgroundColor: color.fill4,
            paddingHorizontal: 12,
            paddingVertical: 10,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
          }}
          accessibilityHint="左右にスワイプしてページを切り替えます"
        >
          {narrow && blocks.length > 1 ? (
            <Segmented
              items={blocks.map((b, i) => ({ value: String(i), label: b.label }))}
              value={String(blockIndex)}
              onChange={(v) => useUiStore.getState().setColumnBlock(Number(v))}
              style={{ width: 84 * blocks.length }}
              accessibilityLabel="表示する列"
            />
          ) : null}
          <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: narrow ? 'flex-end' : 'center' }}>
            {show.pages.map((p) => {
              const cur = p.number === pageNumber;
              return (
                <Pressable
                  key={p.id}
                  onPress={() => {
                    useRuntimeStore.getState().setPageNumber(p.number);
                    if (show.settings.haptics) haptic('selection');
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: cur }}
                  accessibilityLabel={`ページ ${p.number}、${p.name}`}
                  style={{
                    minHeight: MIN_TAP,
                    minWidth: MIN_TAP,
                    paddingHorizontal: 16,
                    borderRadius: radius.pill,
                    backgroundColor: cur ? color.accent : color.fill,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                  }}
                >
                  <AppText variant="subhead" weight="700" style={cur ? { color: color.onTint } : undefined}>
                    {String(p.number)}
                  </AppText>
                  {narrow ? null : (
                    <AppText variant="subhead" weight="600" style={cur ? { color: color.onTint } : undefined}>
                      {p.name}
                    </AppText>
                  )}
                </Pressable>
              );
            })}
          </View>
        </View>
      </GestureDetector>
    </View>
  );
}

/** 右上のロック解除：設定の時間だけ長押し。進み具合を枠で見せる。VoiceOver は操作で解除 */
function UnlockButton({ holdMs }: { holdMs: number }) {
  const progress = useSharedValue(0);
  const [timer, setTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  const unlock = () => {
    useRuntimeStore.getState().setLocked(false);
    haptic('success');
  };
  const start = () => {
    progress.value = 0;
    progress.value = withTiming(1, { duration: holdMs, easing: Easing.linear });
    setTimer(setTimeout(unlock, holdMs));
  };
  const cancel = () => {
    if (timer) clearTimeout(timer);
    setTimer(null);
    cancelAnimation(progress);
    progress.value = withTiming(0, { duration: 120 });
  };
  const fill = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));

  return (
    <Pressable
      onPressIn={start}
      onPressOut={cancel}
      accessibilityRole="button"
      accessibilityLabel="ロック中"
      accessibilityHint={`${(holdMs / 1000).toFixed(1)} 秒長押しでロックを解除します`}
      accessibilityActions={[{ name: 'activate', label: 'ロックを解除' }]}
      onAccessibilityAction={unlock}
      style={{
        minHeight: MIN_TAP,
        minWidth: 128,
        borderRadius: radius.pill,
        backgroundColor: color.fill,
        overflow: 'hidden',
        justifyContent: 'center',
      }}
    >
      <Animated.View style={[{ position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: color.fill2 }, fill]} />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 16 }}>
        <Symbol name="lock.fill" size={17} />
        <AppText weight="600">ロック中</AppText>
      </View>
    </Pressable>
  );
}
