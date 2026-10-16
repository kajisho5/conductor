import { useRef } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { router, Stack } from 'expo-router';
import { useSizeClass } from '@/hooks/useSizeClass';
import { useRuntimeStore } from '@/stores/runtime';
import { useShowStore } from '@/stores/show';
import { color } from '@/theme/tokens';
import { Chip, IconButton, ProminentButton } from '@/components/ui/Buttons';
import { EditBoard } from '@/components/board/EditBoard';
import { PageSelector } from '@/components/board/PageSelector';
import { Inspector } from '@/components/inspector/Inspector';
import { deviceSummary } from '@/components/show/deviceSummary';
import { openShow } from '@/components/show/openShow';

/**
 * ボタン画面（SPEC 3.1・3.2）
 * - regular：中央にボタン盤、右に設定欄（ボタン／ページ／プリセット）
 * - compact：ボタン盤だけ。タップで編集シート、ページ・プリセットはページ切替のメニューから
 * ツールバー：中央にページ切替、後縁に主要アクション［本番］（HIG Toolbars）
 */
export default function ButtonsScreen() {
  const show = useShowStore((s) => s.show);
  const canUndo = useShowStore((s) => s.past.length > 0);
  const status = useRuntimeStore((s) => s.deviceStatus);
  const regular = useSizeClass() === 'regular';
  const { width } = useWindowDimensions();
  const showRef = useRef<View>(null);
  if (!show) return null;
  const summary = deviceSummary(show, status);
  const inspectorWidth = Math.min(420, Math.max(340, Math.round(width * 0.36)));

  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: color.bg }}>
      <Stack.Screen
        options={{
          title: 'ボタン',
          headerTitle: () => (
            <PageSelector
              show={show}
              compact={!regular}
              onManagePages={regular ? undefined : () => router.push('/buttons/pages')}
              onPresets={regular ? undefined : () => router.push('/buttons/presets')}
            />
          ),
          headerLeft: () => (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              {canUndo ? <IconButton icon="arrow.uturn.backward" label="取り消す" onPress={() => useShowStore.getState().undo()} /> : null}
              {summary.total > 0 ? (
                <Chip
                  label={regular ? `機器 ${summary.ok}/${summary.total}` : `${summary.ok}/${summary.total}`}
                  tone={summary.ok === summary.total ? 'ok' : 'warn'}
                  onPress={() => router.navigate('/devices')}
                />
              ) : null}
            </View>
          ),
          headerRight: () => (
            <View ref={showRef} collapsable={false}>
              <ProminentButton
                label="本番"
                icon="play.fill"
                onPress={() => openShow(showRef.current)}
                accessibilityHint="ボタンだけを大きく表示して押す画面を開きます"
              />
            </View>
          ),
        }}
      />
      <View style={{ flex: 1 }}>
        <EditBoard show={show} onOpenEditor={regular ? undefined : () => router.push('/buttons/edit')} />
      </View>
      {regular ? <Inspector show={show} width={inspectorWidth} /> : null}
    </View>
  );
}
