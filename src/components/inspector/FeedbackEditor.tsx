import { useRef } from 'react';
import { Switch, TextInput, View } from 'react-native';
import { Tap as Pressable } from '@/components/ui/Tap';
import { describeFeedback, deviceLabel, driverIdOf } from '@/engine/describe';
import { getFeedbackDef } from '@/drivers/registry';
import {
  addFeedback,
  moveFeedback,
  newFeedback,
  removeFeedback,
  setFeedbackOption,
  setFeedbackImage,
  setFeedbackStyle,
  updateFeedback,
} from '@/model/buttonEdits';
import { chooseImage } from '@/components/editor/imageChoice';
import { imageUri } from '@/storage/images';
import type { ButtonModel, FeedbackRule, Show } from '@/model/types';
import type { CellRef } from '@/stores/show';
import { useShowStore } from '@/stores/show';
import { BUTTON_COLORS, color, MIN_TAP, radius, TEXT_COLORS, type as typeStyles } from '@/theme/tokens';
import { AppText } from '@/components/ui/AppText';
import { IconButton } from '@/components/ui/Buttons';
import { ButtonFace } from '@/components/board/ButtonFace';
import { OptionField } from '@/components/editor/OptionField';
import { pickFeedback } from '@/components/editor/pickers';
import { ColorSwatches } from './ColorSwatches';

/**
 * 状態表示タブ（SPEC 2.1-1、docs/design 03）：条件 → 上書きする見た目。上から順に評価し、成り立ったものを重ねる。
 */
export function FeedbackEditor({ cell, button, show }: { cell: CellRef; button: ButtonModel; show: Show }) {
  const mutate = (fn: (b: ButtonModel) => ButtonModel, key?: string) => useShowStore.getState().mutateButton(cell, fn, key);
  const addRef = useRef<View>(null);

  return (
    <View style={{ gap: 12 }}>
      {button.feedbacks.length > 1 ? (
        <AppText variant="footnote" tone="label2" style={{ marginLeft: 4 }}>
          上から順に確かめ、当てはまるものを重ねます
        </AppText>
      ) : null}
      {button.feedbacks.map((f, i) => (
        <FeedbackCard key={f.id} fb={f} index={i} count={button.feedbacks.length} button={button} show={show} mutate={mutate} />
      ))}
      <Pressable
        ref={addRef}
        accessibilityRole="button"
        onPress={() =>
          pickFeedback(show, addRef.current, (deviceId, def, options) => {
            mutate((b) => addFeedback(b, newFeedback(deviceId, def.id, options)));
          })
        }
        style={({ pressed }) => ({
          minHeight: MIN_TAP,
          justifyContent: 'center',
          paddingHorizontal: 16,
          borderRadius: radius.card,
          backgroundColor: pressed ? color.fill : color.card,
        })}
      >
        <AppText tone="accent">＋ 状態表示を追加</AppText>
      </Pressable>
    </View>
  );
}

type Mutate = (fn: (b: ButtonModel) => ButtonModel, key?: string) => void;

function FeedbackCard({
  fb,
  index,
  count,
  button,
  show,
  mutate,
}: {
  fb: FeedbackRule;
  index: number;
  count: number;
  button: ButtonModel;
  show: Show;
  mutate: Mutate;
}) {
  const def = getFeedbackDef(driverIdOf(show, fb.deviceId), fb.definitionId);
  const d = describeFeedback(fb, show);
  const preview = { ...button.style, ...fb.style };
  const textOn = fb.style.text !== undefined;
  const imageRef = useRef<View>(null);
  return (
    <View style={{ backgroundColor: color.card, borderRadius: radius.card, padding: 14, opacity: fb.enabled ? 1 : 0.6 }}>
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center', marginBottom: 12 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="footnote" tone="label2">
            {`${deviceLabel(show, fb.deviceId)}・${def?.name ?? fb.definitionId}`}
          </AppText>
          <AppText weight="600">{d.condition}</AppText>
        </View>
        <ButtonFace style={preview} text={preview.text} imageUri={imageUri(show, preview.imageId)} width={56} height={56} radius={9} />
      </View>
      {(def?.options ?? []).map((f) => (
        <OptionField
          key={f.id}
          field={f}
          value={fb.options[f.id]}
          card={color.fill4}
          onChange={(v) => mutate((b) => setFeedbackOption(b, fb.id, f.id, v), `${fb.id}:${f.id}`)}
        />
      ))}
      <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: MIN_TAP }}>
        <AppText style={{ flex: 1 }}>当てはまらない時に変える</AppText>
        <Switch
          value={fb.invert}
          onValueChange={(invert) => mutate((b) => updateFeedback(b, fb.id, { invert }))}
          accessibilityLabel="当てはまらない時に変える"
        />
      </View>

      <ColorSwatches
        title="背景の色"
        colors={BUTTON_COLORS}
        value={fb.style.backgroundColor ?? ''}
        allowNone
        onChange={(v) => mutate((b) => setFeedbackStyle(b, fb.id, 'backgroundColor', v === '' ? undefined : v))}
      />
      <ColorSwatches
        title="文字の色"
        colors={TEXT_COLORS}
        value={fb.style.textColor ?? ''}
        allowNone
        allowAuto
        onChange={(v) => mutate((b) => setFeedbackStyle(b, fb.id, 'textColor', v === '' ? undefined : v))}
      />
      <Pressable
        ref={imageRef}
        accessibilityRole="button"
        onPress={() => chooseImage(show, imageRef.current, (imageId) => mutate((b) => setFeedbackImage(b, fb.id, imageId)), '変えない')}
        style={{ flexDirection: 'row', alignItems: 'center', minHeight: MIN_TAP, marginBottom: 4 }}
      >
        <AppText style={{ flex: 1 }}>画像</AppText>
        <AppText tone="label2">{show.images.find((i) => i.id === fb.style.imageId)?.name ?? '変えない'}</AppText>
      </Pressable>
      <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: MIN_TAP }}>
        <AppText style={{ flex: 1 }}>文字を変える</AppText>
        <Switch
          value={textOn}
          onValueChange={(on) => mutate((b) => setFeedbackStyle(b, fb.id, 'text', on ? button.style.text : undefined))}
          accessibilityLabel="文字を変える"
        />
      </View>
      {textOn ? (
        <TextInput
          value={fb.style.text}
          onChangeText={(t) => mutate((b) => setFeedbackStyle(b, fb.id, 'text', t), `${fb.id}:text`)}
          multiline
          accessibilityLabel="状態表示の時の文字"
          placeholderTextColor={color.label3}
          style={[
            typeStyles.body,
            {
              minHeight: 66,
              borderRadius: radius.field,
              backgroundColor: color.fill4,
              color: color.label,
              paddingHorizontal: 14,
              paddingVertical: 11,
              textAlignVertical: 'top',
              marginBottom: 12,
            },
          ]}
        />
      ) : null}

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 }}>
        <Switch
          value={fb.enabled}
          onValueChange={(enabled) => mutate((b) => updateFeedback(b, fb.id, { enabled }))}
          accessibilityLabel="この状態表示を有効にする"
        />
        <AppText variant="subhead" tone="label2">
          有効
        </AppText>
        <View style={{ flex: 1 }} />
        {index > 0 ? <IconButton icon="arrow.up" label="上へ" onPress={() => mutate((b) => moveFeedback(b, fb.id, -1))} /> : null}
        {index < count - 1 ? <IconButton icon="arrow.down" label="下へ" onPress={() => mutate((b) => moveFeedback(b, fb.id, 1))} /> : null}
        <IconButton icon="trash" label="この状態表示を削除" tint={color.danger} onPress={() => mutate((b) => removeFeedback(b, fb.id))} />
      </View>
    </View>
  );
}
