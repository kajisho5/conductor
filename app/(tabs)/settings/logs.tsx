import { useState } from 'react';
import { Alert, FlatList, Share, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { filterLogs, formatTime, LEVEL_LABEL, logsToText, useLogStore, type LogLevel } from '@/stores/log';
import { useShowStore } from '@/stores/show';
import { color } from '@/theme/tokens';
import { AppText } from '@/components/ui/AppText';
import { Segmented } from '@/components/ui/Segmented';
import { EmptyState } from '@/components/ui/EmptyState';

/** ログ（SPEC 2.1-7）：レベルで絞り込み、共有シートで書き出し。機器の画面から開くとその機器だけ */

const LEVELS: { value: LogLevel; label: string }[] = [
  { value: 'error', label: 'エラー' },
  { value: 'warn', label: '警告' },
  { value: 'info', label: '情報' },
  { value: 'debug', label: '詳細' },
];

export default function LogsScreen() {
  const { device } = useLocalSearchParams<{ device?: string }>();
  const [level, setLevel] = useState<LogLevel>('info');
  const entries = useLogStore((s) => s.entries);
  const label = useShowStore((s) => s.show?.devices.find((d) => d.id === device)?.label);
  const shown = filterLogs(entries, level, device || undefined)
    .slice()
    .reverse();

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen
        options={{
          title: label ? `${label} のログ` : 'ログ',
        }}
      />
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          icon="square.and.arrow.up"
          accessibilityLabel="ログを書き出す"
          onPress={() => void Share.share({ message: logsToText(shown.slice().reverse()) || 'ログはありません' })}
        />
        <Stack.Toolbar.Button icon="trash" accessibilityLabel="ログを消す" tintColor={color.danger} onPress={() =>
            Alert.alert('ログを消しますか？', '消したログは戻せません。', [
              { text: 'キャンセル', style: 'cancel' },
              { text: '消す', style: 'destructive', onPress: () => useLogStore.getState().clear() },
            ])
          }
        />
      </Stack.Toolbar>
      <View style={{ padding: 16, paddingBottom: 8 }}>
        <Segmented items={LEVELS} value={level} onChange={setLevel} accessibilityLabel="表示するレベル" />
      </View>
      {shown.length === 0 ? (
        <EmptyState
          icon="doc.text.magnifyingglass"
          title="ログはありません"
          message="機器との送受信やエラーがここに残ります。「詳細」にすると送受信の中身も見られます。"
        />
      ) : (
        <FlatList
          data={shown}
          keyExtractor={(e) => String(e.id)}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 48 }}
          renderItem={({ item: e }) => (
            <View style={{ paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: color.sep }}>
              <AppText variant="caption" tone="label2" mono>
                {`${formatTime(e.ts)}  ${LEVEL_LABEL[e.level]}  ${e.source}`}
              </AppText>
              <AppText variant="footnote" tone={e.level === 'error' ? 'danger' : e.level === 'warn' ? 'warn' : 'label'} mono selectable>
                {e.message}
              </AppText>
            </View>
          )}
        />
      )}
    </View>
  );
}
