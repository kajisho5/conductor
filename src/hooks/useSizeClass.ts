import { useWindowDimensions } from 'react-native';

/**
 * レイアウトの切替はサイズクラスで行う（HIG Layout：機種や向きで分岐しない）。
 * React Native はサイズクラスを直接返さないため、ウインドウの大きさで近似する【推測：しきい値は実機で調整】。
 * - 幅 600pt 以上かつ高さ 500pt 以上 → regular（iPad 全画面・Split View の広い側、iPhone Duo の内側画面）
 * - それ以外 → compact（iPhone、iPad の狭い Split View・Slide Over、iPhone Duo の外側画面）
 * iPhone の横向きは高さが 500pt 未満のため compact のまま（ボタン盤とシートの構成）。
 */

export type SizeClass = 'compact' | 'regular';

export const REGULAR_MIN_WIDTH = 600;
export const REGULAR_MIN_HEIGHT = 500;

export function sizeClassFor(width: number, height: number): SizeClass {
  return width >= REGULAR_MIN_WIDTH && height >= REGULAR_MIN_HEIGHT ? 'regular' : 'compact';
}

export function useSizeClass(): SizeClass {
  const { width, height } = useWindowDimensions();
  return sizeClassFor(width, height);
}
