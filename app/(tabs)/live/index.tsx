import { useRef } from 'react';
import { View } from 'react-native';
import { useShowStore } from '@/stores/show';
import { AppText } from '@/components/ui/AppText';
import { ProminentButton } from '@/components/ui/Buttons';
import { Symbol } from '@/components/ui/Symbol';
import { color } from '@/theme/tokens';
import { openShow } from '@/components/show/openShow';

/**
 * サイドバーの「本番」（regular のみ）。本番そのものは全画面で開く（SPEC 3.1）。
 * ［本番を始める］からロック確認（ボタンを指すポップオーバー）→ 全画面。
 */
export default function LiveTab() {
  const show = useShowStore((s) => s.show);
  const ref = useRef<View>(null);
  if (!show) return null;
  const buttons = show.pages.reduce((n, p) => n + Object.keys(p.buttons).length, 0);
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 }}>
      <Symbol name="play.rectangle.fill" size={48} tint={color.label3} />
      <AppText variant="title2" align="center">
        {show.name}
      </AppText>
      <AppText tone="label2" align="center">
        {`${show.pages.length} ページ・${buttons} ボタン`}
      </AppText>
      <View ref={ref} collapsable={false} style={{ marginTop: 8 }}>
        <ProminentButton label="本番を始める" icon="play.fill" onPress={() => openShow(ref.current)} />
      </View>
    </View>
  );
}
