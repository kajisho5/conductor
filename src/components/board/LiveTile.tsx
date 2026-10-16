import { useEffect, useMemo, useRef } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector, type GestureType } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Rect } from 'react-native-svg';
import { shortestHoldMs } from '@/engine/executor';
import { pressDown, pressUp } from '@/engine/press';
import type { ButtonModel, Show } from '@/model/types';
import { useRuntimeStore } from '@/stores/runtime';
import { color } from '@/theme/tokens';
import { absoluteFill, ButtonFace } from './ButtonFace';
import { useButtonView } from './useButtonView';

/**
 * 本番のボタン（SPEC 3.5・4 章）。
 * - 指が触れた瞬間に送る。ボタンの上で始まったタッチは常にボタン操作（親のスワイプに渡さない）
 * - 設定「ボタンの上でもスワイプで切替」が ON の時だけ 80ms 待ち、その間に 10pt 動いたらスワイプとして扱う
 * - 複数のボタンを同時に押せる（ボタンごとに別のジェスチャ）
 */

export const SWIPE_DELAY_MS = 80;
export const SWIPE_SLOP = 10;

const AnimatedRect = Animated.createAnimatedComponent(Rect);

export function LiveTile({
  button,
  show,
  width,
  height,
  radius,
  topBar,
  swipeGesture,
  label,
}: {
  button: ButtonModel | undefined;
  show: Show;
  width: number;
  height: number;
  radius: number;
  topBar: string | null;
  /** 「ボタンの上でもスワイプ」の時だけ渡す、盤全体のスワイプ */
  swipeGesture?: GestureType;
  label: string;
}) {
  const view = useButtonView(button, show);
  const press = useRuntimeStore((s) => (button ? s.press[button.id] : undefined));
  const reduce = useReducedMotion();

  const scale = useSharedValue(1);
  const shake = useSharedValue(0);
  const overlay = useSharedValue(0);
  const ring = useSharedValue(0); // 内側の白枠（押している）
  const failRing = useSharedValue(0); // 内側の橙枠
  const out = useSharedValue(0); // 外へ広がる枠 0..1
  const hold = useSharedValue(0); // 長押しの進み 0..1
  const run = useSharedValue(0); // 実行中バー

  const holdMs = button ? shortestHoldMs(button) : null;
  const touches = useRef(0);
  const begun = useRef(false);
  const swipeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef({ x: 0, y: 0 });

  // 押下表現の段階が変わったら見た目を動かす
  useEffect(() => {
    if (!press) return;
    const { phase } = press;
    if (phase === 'pressing') {
      scale.value = reduce ? 1 : withTiming(0.94, { duration: 70 });
      overlay.value = withTiming(1, { duration: 70 });
      ring.value = 1;
      failRing.value = 0;
      if (holdMs !== null) {
        hold.value = 0;
        hold.value = withTiming(1, { duration: holdMs, easing: Easing.linear });
      }
      return;
    }
    scale.value = reduce ? 1 : withTiming(1, { duration: 120 });
    overlay.value = withTiming(0, { duration: 120 });
    cancelAnimation(hold);
    hold.value = 0;
    if (phase === 'running') {
      ring.value = 0;
      run.value = 0;
      run.value = reduce ? 1 : withRepeat(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }), -1, true);
      return;
    }
    cancelAnimation(run);
    run.value = 0;
    if (phase === 'sent') {
      if (reduce) {
        ring.value = 1;
        ring.value = withTiming(0, { duration: 250 });
      } else {
        ring.value = 0;
        out.value = 0;
        out.value = withTiming(1, { duration: 250, easing: Easing.out(Easing.quad) });
      }
      return;
    }
    if (phase === 'failed') {
      ring.value = 0;
      failRing.value = 1;
      failRing.value = withSequence(withTiming(1, { duration: 700 }), withTiming(0, { duration: 100 }));
      if (!reduce) {
        shake.value = withSequence(
          withTiming(-6, { duration: 60 }),
          withTiming(6, { duration: 60 }),
          withTiming(-6, { duration: 60 }),
          withTiming(6, { duration: 60 }),
          withTiming(0, { duration: 60 }),
        );
      }
      return;
    }
    ring.value = 0;
  }, [press?.seq]); // eslint-disable-line react-hooks/exhaustive-deps

  // ページ切替などで消える時に押したままにしない
  useEffect(
    () => () => {
      if (swipeTimer.current) clearTimeout(swipeTimer.current);
      if (button && begun.current) {
        begun.current = false;
        void pressUp(button, show);
      }
    },
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const begin = () => {
    if (!button || begun.current) return;
    begun.current = true;
    pressDown(button, show);
  };
  const end = () => {
    if (swipeTimer.current) {
      clearTimeout(swipeTimer.current);
      swipeTimer.current = null;
    }
    if (!button || !begun.current) return;
    begun.current = false;
    void pressUp(button, show);
  };

  const gesture = useMemo(() => {
    const swipeMode = !!swipeGesture;
    let g = Gesture.Manual()
      .runOnJS(true)
      .onTouchesDown((e, manager) => {
        const first = touches.current === 0;
        touches.current += e.changedTouches.length;
        if (!first || !button) {
          if (!button) manager.fail();
          return;
        }
        const t = e.changedTouches[0];
        start.current = { x: t?.absoluteX ?? 0, y: t?.absoluteY ?? 0 };
        if (swipeMode) {
          swipeTimer.current = setTimeout(() => {
            swipeTimer.current = null;
            begin();
            manager.activate();
          }, SWIPE_DELAY_MS);
        } else {
          begin();
          manager.activate();
        }
      })
      .onTouchesMove((e, manager) => {
        if (!swipeMode || begun.current || !swipeTimer.current) return;
        const t = e.allTouches[0];
        if (!t) return;
        const d = Math.hypot(t.absoluteX - start.current.x, t.absoluteY - start.current.y);
        if (d >= SWIPE_SLOP) {
          clearTimeout(swipeTimer.current);
          swipeTimer.current = null;
          manager.fail();
        }
      })
      .onTouchesUp((e, manager) => {
        touches.current = Math.max(0, touches.current - e.changedTouches.length);
        if (touches.current > 0) return;
        // 80ms 待っている間に離した（短いタップ）→ 押して離す
        if (swipeTimer.current) {
          clearTimeout(swipeTimer.current);
          swipeTimer.current = null;
          begin();
        }
        end();
        manager.end();
      })
      .onTouchesCancelled((_e, manager) => {
        touches.current = 0;
        end();
        manager.fail();
      })
      .onFinalize(() => {
        touches.current = 0;
        end();
      });
    if (swipeGesture) g = g.simultaneousWithExternalGesture(swipeGesture);
    return g;
  }, [button, show, swipeGesture]); // eslint-disable-line react-hooks/exhaustive-deps

  const tileStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }, { scale: scale.value }] }));
  const overlayStyle = useAnimatedStyle(() => ({ opacity: overlay.value * 0.18 }));
  const ringStyle = useAnimatedStyle(() => ({ opacity: ring.value }));
  const failStyle = useAnimatedStyle(() => ({ opacity: failRing.value }));
  const outStyle = useAnimatedStyle(() => ({
    opacity: out.value > 0 && out.value < 1 ? 0.55 * (1 - out.value) : 0,
    transform: [{ scale: 1 + out.value * 0.12 }],
  }));
  const runStyle = useAnimatedStyle(() => ({ transform: [{ translateX: (run.value - 0.5) * width * 0.7 }] }));
  const per = 2 * (width - 3 + height - 3);
  const holdProps = useAnimatedProps(() => ({ strokeDasharray: [per * hold.value, per] }));

  if (!button || !view) {
    return <View style={{ width, height, borderRadius: radius, backgroundColor: color.fill4 }} accessibilityElementsHidden />;
  }

  return (
    <GestureDetector gesture={gesture}>
      <View
        style={{ width, height }}
        accessible
        accessibilityRole="button"
        accessibilityLabel={`${button.name || label}${view.text ? `、${view.text.replace(/\n/g, ' ')}` : ''}`}
        accessibilityHint={view.offline ? '機器に接続していません' : undefined}
        accessibilityActions={[{ name: 'activate' }]}
        onAccessibilityAction={() => {
          begin();
          end();
        }}
      >
        <Animated.View style={[{ width, height }, tileStyle]}>
          <ButtonFace
            style={view.style}
            text={view.text}
            imageUri={view.imageUri}
            width={width}
            height={height}
            radius={radius}
            offline={view.offline}
            warn={press?.warn}
            stepCount={view.stepCount}
            stepIndex={view.stepIndex}
            topBar={topBar}
            statusIcons={show.settings.showStatusIcons}
          />
          <Animated.View pointerEvents="none" style={[absoluteFill, { borderRadius: radius, backgroundColor: '#FFFFFF' }, overlayStyle]} />
          <Animated.View
            pointerEvents="none"
            style={[absoluteFill, { borderRadius: radius, borderWidth: 3, borderColor: '#FFFFFF' }, ringStyle]}
          />
          <Animated.View
            pointerEvents="none"
            style={[absoluteFill, { borderRadius: radius, borderWidth: 3, borderColor: color.warn }, failStyle]}
          />
          {holdMs !== null ? (
            <Svg pointerEvents="none" width={width} height={height} style={absoluteFill}>
              <AnimatedRect
                x={1.5}
                y={1.5}
                width={width - 3}
                height={height - 3}
                rx={radius - 1}
                fill="none"
                stroke="#FFFFFF"
                strokeWidth={3}
                strokeDashoffset={-(width / 2)}
                animatedProps={holdProps}
              />
            </Svg>
          ) : null}
          {press?.phase === 'running' ? (
            <View
              pointerEvents="none"
              style={{ position: 'absolute', left: 8, right: 8, bottom: 4, height: 3, borderRadius: 2, overflow: 'hidden' }}
            >
              <Animated.View
                style={[{ width: '30%', height: 3, borderRadius: 2, backgroundColor: '#FFFFFF', alignSelf: 'center' }, runStyle]}
              />
            </View>
          ) : null}
        </Animated.View>
        <Animated.View
          pointerEvents="none"
          style={[absoluteFill, { borderRadius: radius + 4, borderWidth: 3, borderColor: '#FFFFFF' }, outStyle]}
        />
      </View>
    </GestureDetector>
  );
}
