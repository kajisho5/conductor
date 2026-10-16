import { ActionSheetIOS, Platform, findNodeHandle, type View } from 'react-native';

/** 選択肢のシート（iPhone はアクションシート、iPad は anchor を指すポップオーバー）。キャンセルは最下部 */
export function sheet(
  title: string | undefined,
  items: { label: string; run: () => void; destructive?: boolean }[],
  anchor: View | null,
): void {
  if (Platform.OS !== 'ios') return;
  const options = [...items.map((i) => i.label), 'キャンセル'];
  ActionSheetIOS.showActionSheetWithOptions(
    {
      title,
      options,
      cancelButtonIndex: options.length - 1,
      destructiveButtonIndex: items.findIndex((i) => i.destructive),
      anchor: anchor ? (findNodeHandle(anchor) ?? undefined) : undefined,
    },
    (i) => items[i]?.run(),
  );
}
