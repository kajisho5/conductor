import { INTERNAL_VARIABLES } from '@/variables/resolve';
import { getDefinition } from '@/drivers/registry';
import { useRef } from 'react';
import { ActionSheetIOS, Platform, Pressable, View, findNodeHandle } from 'react-native';
import type { ButtonModel, ButtonStyle, Show } from '@/model/types';
import type { CellRef } from '@/stores/show';
import { useShowStore } from '@/stores/show';
import { useRuntimeStore } from '@/stores/runtime';
import { BUTTON_COLORS, color, TEXT_COLORS } from '@/theme/tokens';
import { AppText } from '@/components/ui/AppText';
import { hitSlopFor } from '@/components/ui/Buttons';
import { Field } from '@/components/ui/Field';
import { Row, Section } from '@/components/ui/Group';
import { Segmented } from '@/components/ui/Segmented';
import { ColorSwatches } from './ColorSwatches';
import { chooseImage } from '@/components/editor/imageChoice';

/** 見た目タブ（SPEC 2.1-1）。変更はすぐに盤と本番へ反映（ストア経由） */

const SIZE_ITEMS = [
  { value: 'auto', label: '自動' },
  { value: 'small', label: '小' },
  { value: 'medium', label: '中' },
  { value: 'large', label: '大' },
] as const;
const H_ITEMS = [
  { value: 'leading', label: '左' },
  { value: 'center', label: '中' },
  { value: 'trailing', label: '右' },
] as const;
const V_ITEMS = [
  { value: 'top', label: '上' },
  { value: 'center', label: '中' },
  { value: 'bottom', label: '下' },
] as const;
const BAR_ITEMS = [
  { value: 'inherit', label: '全体の設定' },
  { value: 'show', label: '表示' },
  { value: 'hide', label: '隠す' },
] as const;

/** 埋め込める変数の候補：内部の値・自分で作る変数・式の変数・機器の値（機器は定義にある変数と、届いた値） */
export function variableCandidates(show: Show, values: Record<string, Record<string, string>>): string[] {
  const out: string[] = INTERNAL_VARIABLES.map((v) => `$(internal:${v.name})`);
  for (const v of show.customVariables) if (v.name) out.push(`$(custom:${v.name})`);
  for (const v of show.expressionVariables) if (v.name) out.push(`$(expression:${v.name})`);
  for (const d of show.devices) {
    const keys = new Set([...(getDefinition(d.driverId)?.variables.map((x) => x.id) ?? []), ...Object.keys(values[d.id] ?? {})]);
    for (const k of [...keys].sort()) out.push(`$(${d.label}:${k})`);
  }
  return [...new Set(out)];
}

function sizeValue(s: ButtonStyle['textSize']): (typeof SIZE_ITEMS)[number]['value'] {
  return typeof s === 'number' ? 'medium' : s;
}

export function StyleEditor({ cell, button, show }: { cell: CellRef; button: ButtonModel; show: Show }) {
  const st = button.style;
  const update = (patch: Partial<ButtonStyle>) => useShowStore.getState().updateStyle(cell, patch);
  const varRef = useRef<View>(null);
  const imageRef = useRef<View>(null);

  const insertVariable = () => {
    if (Platform.OS !== 'ios') return;
    const list = variableCandidates(show, useRuntimeStore.getState().deviceValues);
    const node = varRef.current ? findNodeHandle(varRef.current) : null;
    ActionSheetIOS.showActionSheetWithOptions(
      { title: '変数を入れる', options: [...list, 'キャンセル'], cancelButtonIndex: list.length, anchor: node ?? undefined },
      (i) => {
        const v = list[i];
        if (v) update({ text: st.text ? `${st.text}${v}` : v });
      },
    );
  };

  return (
    <View>
      <Field
        label="ボタン名"
        value={button.name}
        placeholder="一覧で見分ける名前"
        onChangeText={(name) => useShowStore.getState().updateButton(cell, { name })}
        returnKeyType="done"
      />
      <View>
        <Field
          label="表示する文字"
          value={st.text}
          multiline
          placeholder="改行で 2 行に"
          onChangeText={(text) => update({ text })}
          style={{ paddingRight: 104 }}
        />
        <Pressable
          ref={varRef}
          onPress={insertVariable}
          hitSlop={hitSlopFor(86, 28)}
          accessibilityRole="button"
          accessibilityLabel="変数を入れる"
          style={{
            position: 'absolute',
            right: 12,
            bottom: 28,
            height: 28,
            paddingHorizontal: 12,
            borderRadius: 14,
            backgroundColor: color.fill,
            justifyContent: 'center',
          }}
        >
          <AppText variant="footnote" weight="600" tone="accent">
            $ 変数
          </AppText>
        </Pressable>
      </View>

      <Section card={color.card}>
        <SegRow
          title="文字の大きさ"
          items={SIZE_ITEMS}
          value={sizeValue(st.textSize)}
          onChange={(v) => update({ textSize: v })}
          width={176}
        />
        <SegRow title="横の揃え" items={H_ITEMS} value={st.alignH} onChange={(v) => update({ alignH: v })} width={132} />
        <SegRow title="縦の揃え" items={V_ITEMS} value={st.alignV} onChange={(v) => update({ alignV: v })} width={132} last />
      </Section>

      <ColorSwatches title="文字の色" colors={TEXT_COLORS} value={st.textColor} allowAuto onChange={(textColor) => update({ textColor })} />
      <ColorSwatches
        title="背景の色"
        colors={BUTTON_COLORS}
        value={st.backgroundColor}
        onChange={(backgroundColor) => update({ backgroundColor })}
      />

      <Section card={color.card}>
        <View ref={imageRef} collapsable={false}>
          <Row
            title="画像"
            value={show.images.find((i) => i.id === st.imageId)?.name ?? 'なし'}
            chevron
            onPress={() =>
              chooseImage(show, imageRef.current, (imageId) =>
                useShowStore.getState().mutateButton(cell, (b) => {
                  const style = { ...b.style };
                  if (imageId) style.imageId = imageId;
                  else delete style.imageId;
                  return { ...b, style };
                }),
              )
            }
          />
        </View>
        <View style={{ paddingHorizontal: 16, paddingVertical: 10, gap: 8 }}>
          <AppText>上部の帯（位置表示）</AppText>
          <Segmented
            items={BAR_ITEMS}
            value={st.showTopBar}
            onChange={(showTopBar) => update({ showTopBar })}
            accessibilityLabel="上部の帯"
          />
        </View>
      </Section>
    </View>
  );
}

function SegRow<T extends string>({
  title,
  items,
  value,
  onChange,
  width,
  last,
}: {
  title: string;
  items: readonly { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  width: number;
  last?: boolean;
}) {
  return (
    <View
      style={{
        minHeight: 52,
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 8,
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderBottomWidth: last ? 0 : 0.5,
        borderBottomColor: color.sep,
      }}
    >
      <AppText style={{ flex: 1, minWidth: 100 }}>{title}</AppText>
      <Segmented items={items} value={value} onChange={onChange} style={{ width }} accessibilityLabel={title} />
    </View>
  );
}
