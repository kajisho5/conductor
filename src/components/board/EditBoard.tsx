import { SafeAreaView } from "react-native-safe-area-context";
import { useMemo, useState } from "react";
import { ScrollView, View, useWindowDimensions } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import {
  cellKey,
  columnBlocks,
  COMPACT_COLUMNS,
  fitCellSize,
} from "@/model/grid";
import type { Show } from "@/model/types";
import { REGULAR_MIN_WIDTH } from "@/hooks/useSizeClass";
import { useRuntimeStore } from "@/stores/runtime";
import { useShowStore } from "@/stores/show";
import { OP_LABEL, useUiStore } from "@/stores/ui";
import { board, color } from "@/theme/tokens";
import { AppText } from "@/components/ui/AppText";
import { PillButton } from "@/components/ui/Buttons";
import { Segmented } from "@/components/ui/Segmented";
import {
  completeOp,
  currentPage,
  deleteCell,
  openCellMenu,
  placePreset,
  positionLabel,
  topBarText,
} from "./boardHelpers";
import { EditTile } from "./EditTile";

/**
 * 編集画面のボタン盤（SPEC 3.1・3.2・3.3）。
 * - 幅が狭い時（iPhone 縦・iPhone Duo 外側）は 4 列ずつ表示し、下のセグメントか盤の左右スワイプで切り替える
 * - タップで選択（空きマスはボタンを作る）。iPhone は onOpenEditor で編集シートを開く
 * - 盤の下に、長押しメニューと同じ操作（コピー／移動／入れ替え／削除）
 */
export function EditBoard({
  show,
  onOpenEditor,
}: {
  show: Show;
  onOpenEditor?: () => void;
}) {
  const { width: winW } = useWindowDimensions();
  const [area, setArea] = useState({ w: 0, h: 0 });
  const pageNumber = useRuntimeStore((s) => s.pageNumber);
  const selected = useUiStore((s) => s.selected);
  const pending = useUiStore((s) => s.pending);
  const pendingPreset = useUiStore((s) => s.pendingPreset);
  const block = useUiStore((s) => s.columnBlock);
  const page = currentPage(show, pageNumber);
  const { columns, rows } = show.grid;

  const narrow = winW < REGULAR_MIN_WIDTH;
  const blocks = columnBlocks(columns);
  const blockIndex = narrow ? Math.min(block, blocks.length - 1) : 0;
  const colStart = narrow ? (blocks[blockIndex]?.start ?? 0) : 0;
  const colEnd = narrow ? (blocks[blockIndex]?.end ?? columns) : columns;
  const visibleCols = colEnd - colStart;
  const gap = narrow ? board.gapCompact : board.gapRegular;
  const cell =
    area.w > 0
      ? fitCellSize(
          area.w,
          area.h,
          narrow ? COMPACT_COLUMNS : columns,
          rows,
          gap,
        )
      : 0;

  const swipe = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .activeOffsetX([-24, 24])
        .failOffsetY([-16, 16])
        .onEnd((e) => {
          if (!narrow || blocks.length < 2) return;
          const ui = useUiStore.getState();
          const cur = Math.min(ui.columnBlock, blocks.length - 1);
          if (e.translationX < -40 && cur < blocks.length - 1)
            ui.setColumnBlock(cur + 1);
          if (e.translationX > 40 && cur > 0) ui.setColumnBlock(cur - 1);
        }),
    [narrow, blocks.length],
  );

  const onCell = (key: string) => {
    const ref = { pageId: page.id, key };
    if (pendingPreset) {
      if (placePreset(show, pendingPreset, ref))
        useUiStore.getState().select(ref);
      return;
    }
    if (pending) {
      completeOp(pending.op, pending.from, ref);
      return;
    }
    if (onOpenEditor)
      useUiStore.getState().setSheetSnapshot(useShowStore.getState().show);
    if (!page.buttons[key]) useShowStore.getState().createButton(ref);
    useUiStore.getState().select(ref);
    onOpenEditor?.();
  };

  const sel = selected && selected.pageId === page.id ? selected : null;
  const selButton = sel ? page.buttons[sel.key] : undefined;

  const grid = (
    <View style={{ gap }}>
      {Array.from({ length: rows }, (_, r) => (
        <View key={r} style={{ flexDirection: "row", gap }}>
          {Array.from({ length: visibleCols }, (_, i) => {
            const c = colStart + i;
            const key = cellKey(r, c);
            const b = page.buttons[key];
            return (
              <EditTile
                key={key}
                button={b}
                show={show}
                width={cell}
                height={cell}
                radius={narrow ? 10 : 12}
                selected={sel?.key === key}
                target={
                  (!!pending &&
                    !(
                      pending.from.pageId === page.id &&
                      pending.from.key === key
                    )) ||
                  (!!pendingPreset && !b)
                }
                topBar={topBarText(show, b, page.number, key)}
                label={positionLabel(page.number, key)}
                onPress={() => onCell(key)}
                onLongPress={(anchor) => {
                  if (b) openCellMenu({ pageId: page.id, key }, anchor);
                }}
              />
            );
          })}
        </View>
      ))}
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      <View
        style={{
          flex: 1,
          paddingHorizontal: narrow ? board.sideCompact : board.sideRegular,
          paddingTop: 12,
        }}
        onLayout={(e) =>
          setArea({
            w:
              e.nativeEvent.layout.width -
              (narrow ? 2 * board.sideCompact : 2 * board.sideRegular),
            h: e.nativeEvent.layout.height - 12,
          })
        }
      >
        {cell > 0 ? (
          <GestureDetector gesture={swipe}>{grid}</GestureDetector>
        ) : null}
      </View>
      {/* 下のタブバー（iOS 26 は浮いている）・ホームインジケーターに隠れないよう、その分だけ上げる */}
      <SafeAreaView edges={["bottom"]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: narrow ? 16 : 20,
            paddingVertical: 10,
            gap: 10,
            alignItems: "center",
          }}
        >
          {narrow && blocks.length > 1 ? (
            <Segmented
              items={blocks.map((b, i) => ({
                value: String(i),
                label: b.label,
              }))}
              value={String(blockIndex)}
              onChange={(v) => useUiStore.getState().setColumnBlock(Number(v))}
              style={{ width: 90 * blocks.length }}
              accessibilityLabel="表示する列"
            />
          ) : null}
          {pendingPreset ? (
            <>
              <AppText variant="subhead" tone="label2">
                置く空きマスをタップ
              </AppText>
              <PillButton
                label="終わる"
                onPress={() => useUiStore.getState().pickPreset(null)}
              />
            </>
          ) : pending ? (
            <>
              <AppText variant="subhead" tone="label2">
                {`${OP_LABEL[pending.op]}先のマスをタップ`}
              </AppText>
              <PillButton
                label="キャンセル"
                onPress={() => useUiStore.getState().clearOp()}
              />
            </>
          ) : sel && selButton ? (
            <>
              <PillButton
                label="コピー"
                icon="plus.square.on.square"
                onPress={() => useUiStore.getState().startOp("copy", sel)}
              />
              <PillButton
                label="移動"
                icon="arrow.up.and.down.and.arrow.left.and.right"
                onPress={() => useUiStore.getState().startOp("move", sel)}
              />
              <PillButton
                label="入れ替え"
                icon="arrow.left.arrow.right"
                onPress={() => useUiStore.getState().startOp("swap", sel)}
              />
              <PillButton
                label="削除"
                icon="trash"
                tint={color.danger}
                onPress={() => deleteCell(sel)}
              />
            </>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
