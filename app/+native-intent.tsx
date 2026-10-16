import { useUiStore } from '@/stores/ui';

/**
 * 他のアプリ（ファイル・メール・AirDrop など）から .conductor を開いた時（SPEC 9 章「共有から受け取る」）。
 * 画面の移動はせず、読み込みの確認を出すために覚えておく。
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  if (/^file:\/\//i.test(path) && /\.conductor$/i.test(decodeURIComponent(path))) {
    useUiStore.getState().setPendingImport(path);
    return '/settings';
  }
  return path;
}
