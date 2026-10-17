import { Text, View } from 'react-native';
import { Image } from 'expo-image';
import { color, luminance } from '@/theme/tokens';
import type { ButtonStyle } from '@/model/types';
import { Symbol } from '@/components/ui/Symbol';

/**
 * ボタンの見た目（内容）。色はユーザーが選ぶ内容の色なので hex をそのまま使う（CLAUDE.md の例外）。
 * 寸法は docs/design 00-parts の比率（文字 0.17×短辺、角丸 10〜14）。
 */

export function autoTextColor(bg: string): string {
  return luminance(bg) > 0.55 ? '#000000' : '#FFFFFF';
}

export function textColorOf(style: ButtonStyle): string {
  return style.textColor === 'auto' ? autoTextColor(style.backgroundColor) : style.textColor;
}

export function fontSizeFor(size: ButtonStyle['textSize'], w: number, h: number): number {
  const unit = Math.min(w, h * 1.05);
  if (typeof size === 'number') return Math.max(11, size);
  const k = size === 'small' ? 0.13 : size === 'large' ? 0.22 : 0.17;
  return Math.max(11, Math.round(unit * k));
}

const JUSTIFY = { top: 'flex-start', center: 'center', bottom: 'flex-end' } as const;
const ALIGN = { leading: 'left', center: 'center', trailing: 'right' } as const;

export function ButtonFace({
  style,
  text,
  width,
  height,
  radius,
  offline,
  warn,
  stepCount,
  stepIndex,
  topBar,
  statusIcons = true,
  imageUri,
}: {
  style: ButtonStyle;
  text: string;
  width: number;
  height: number;
  radius: number;
  offline?: boolean;
  warn?: boolean;
  stepCount?: number;
  stepIndex?: number;
  /** 上部の帯に出す位置（null なら出さない） */
  topBar?: string | null;
  /** 設定 > ボタン > 状態アイコン（未接続の ⚠）。送れなかった ⚠ は常に出す */
  statusIcons?: boolean;
  /** 見た目の画像（文字の下に、縦横比を保って収める） */
  imageUri?: string | null;
}) {
  const fg = textColorOf(style);
  const dim = fg === '#000000' ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.35)';
  const fs = fontSizeFor(style.textSize, width, height);
  const lines = text.split('\n');
  // 背景にとけ込む色（真っ黒・真っ白に近い）だけ縁を付ける。縁の色はライト／ダークに合わせる
  const lum = luminance(style.backgroundColor);
  const edge = lum < 0.06 || lum > 0.85;
  const iconSize = Math.max(16, Math.min(width, height) * 0.16);
  const bar = topBar ? Math.max(14, Math.round(height * 0.16)) : 0;
  return (
    <View
      style={{
        width,
        height,
        borderRadius: radius,
        backgroundColor: style.backgroundColor,
        borderWidth: edge ? 1 : 0,
        borderColor: color.sep,
        overflow: 'hidden',
      }}
    >
      {imageUri ? (
        <Image source={{ uri: imageUri }} style={absoluteFill} contentFit="contain" accessibilityIgnoresInvertColors transition={0} />
      ) : null}
      {topBar ? (
        <View style={{ height: bar, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', paddingHorizontal: 6 }}>
          <Text style={{ color: '#FFFFFF', fontSize: Math.max(11, bar * 0.62), fontWeight: '600' }} numberOfLines={1}>
            {topBar}
          </Text>
        </View>
      ) : null}
      <View style={{ flex: 1, padding: 6, justifyContent: JUSTIFY[style.alignV] }}>
        <Text
          style={{ color: fg, fontSize: fs, lineHeight: fs * 1.14, fontWeight: '700', textAlign: ALIGN[style.alignH] }}
          numberOfLines={Math.max(1, lines.length)}
          adjustsFontSizeToFit
          minimumFontScale={0.5}
          allowFontScaling={false}
        >
          {text}
        </Text>
      </View>
      {stepCount && stepCount > 1 ? (
        <View style={{ position: 'absolute', bottom: 8, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 5 }}>
          {Array.from({ length: stepCount }, (_, i) => (
            <View key={i} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: i === stepIndex ? fg : dim }} />
          ))}
        </View>
      ) : null}
      {offline ? <View style={{ ...absoluteFill, backgroundColor: 'rgba(0,0,0,0.55)' }} /> : null}
      {(offline && statusIcons) || warn ? (
        <View style={{ position: 'absolute', top: 7 + bar, right: 7 }}>
          <Symbol name="exclamationmark.triangle.fill" size={iconSize} tint={color.warn} />
        </View>
      ) : null}
    </View>
  );
}

export const absoluteFill = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } as const;
