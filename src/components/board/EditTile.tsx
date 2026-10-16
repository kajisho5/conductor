import { useRef } from 'react';
import { Pressable, View } from 'react-native';
import type { ButtonModel, Show } from '@/model/types';
import { color } from '@/theme/tokens';
import { Symbol } from '@/components/ui/Symbol';
import { ButtonFace } from './ButtonFace';
import { useButtonView } from './useButtonView';

/**
 * 編集画面のボタン（SPEC 3.3）：タップは選択だけで動作は送らない。長押しでコピー／移動／入れ替え／削除のメニュー。
 * 選択中は外側に青い 3pt の枠（docs/design 00-parts）。
 */
export function EditTile({
  button,
  show,
  width,
  height,
  radius,
  selected,
  target,
  topBar,
  label,
  onPress,
  onLongPress,
}: {
  button: ButtonModel | undefined;
  show: Show;
  width: number;
  height: number;
  radius: number;
  selected: boolean;
  /** コピー／移動／入れ替えの置き先を選んでいる最中 */
  target: boolean;
  topBar: string | null;
  label: string;
  onPress: () => void;
  onLongPress: (anchor: View | null) => void;
}) {
  const view = useButtonView(button, show);
  const ref = useRef<View>(null);
  const empty = !button || !view;
  return (
    <Pressable
      ref={ref}
      onPress={onPress}
      onLongPress={() => onLongPress(ref.current)}
      delayLongPress={400}
      accessibilityRole="button"
      accessibilityLabel={empty ? `${label}、空き` : `${label}、${button.name || view.text.replace(/\n/g, ' ') || 'ボタン'}`}
      accessibilityState={{ selected }}
      accessibilityHint={empty ? 'タップでボタンを作ります' : 'タップで設定、長押しでコピーや移動'}
      style={{ width, height }}
    >
      {empty ? (
        <View
          style={{
            width,
            height,
            borderRadius: radius,
            backgroundColor: selected || target ? 'transparent' : color.fill4,
            borderWidth: selected || target ? 1.5 : 0,
            borderStyle: 'dashed',
            borderColor: target ? color.accent : color.label3,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {selected || target ? (
            <Symbol name="plus" size={Math.min(width, height) * 0.22} tint={target ? color.accent : color.label3} />
          ) : null}
        </View>
      ) : (
        <ButtonFace
          style={view.style}
          text={view.text}
          imageUri={view.imageUri}
          width={width}
          height={height}
          radius={radius}
          offline={view.offline}
          stepCount={view.stepCount}
          stepIndex={view.stepIndex}
          topBar={topBar}
          statusIcons={show.settings.showStatusIcons}
        />
      )}
      {selected && !empty ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: -5,
            left: -5,
            right: -5,
            bottom: -5,
            borderRadius: radius + 5,
            borderWidth: 3,
            borderColor: color.accent,
          }}
        />
      ) : null}
      {target && !empty ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            borderRadius: radius,
            borderWidth: 2,
            borderStyle: 'dashed',
            borderColor: color.accent,
          }}
        />
      ) : null}
    </Pressable>
  );
}
