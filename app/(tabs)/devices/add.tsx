import { useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, TextInput, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { listDefinitions } from '@/drivers/registry';
import { ensureDefinition, refreshCatalog, useCatalogStore, type CatalogEntry } from '@/drivers/remote';
import type { DriverDefinition } from '@/drivers/types';
import { newDevice } from '@/model/devices';
import { useShowStore } from '@/stores/show';
import { useSizeClass } from '@/hooks/useSizeClass';
import { color, MIN_TAP, radius, type as typeStyles } from '@/theme/tokens';
import { Row, Section } from '@/components/ui/Group';
import { Symbol } from '@/components/ui/Symbol';

/** 検索した時に並べる数の上限（多すぎると重くなるため） */
const SEARCH_LIMIT = 80;

/**
 * 機器を追加（SPEC 2.1-3）：アプリに入っている機器と、配信の一覧（メーカーごと）から選ぶ。
 * 配信の機器は選んだ時に定義を取ってきて保存し、すぐ追加して編集へ。
 */
export default function AddDeviceScreen() {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const regular = useSizeClass() === 'regular';
  const catalog = useCatalogStore();
  const key = q.trim().toLowerCase();

  useEffect(() => {
    // 一覧は開くたびに取り直す（通信できなければ保存してある一覧のまま）
    refreshCatalog().catch(() => undefined);
  }, []);

  const bundled = listDefinitions().filter(
    (d) => !key || d.name.toLowerCase().includes(key) || d.category.toLowerCase().includes(key) || d.id.includes(key),
  );
  const bundledCategories = [...new Set(bundled.map((d) => d.category))];

  const makers = useMemo(() => {
    const m = new Map<string, CatalogEntry[]>();
    for (const e of catalog.entries) {
      const list = m.get(e.category) ?? [];
      list.push(e);
      m.set(e.category, list);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [catalog.entries]);

  const found = useMemo(() => {
    if (!key) return [];
    return catalog.entries
      .filter((e) => e.name.toLowerCase().includes(key) || e.category.toLowerCase().includes(key))
      .slice(0, SEARCH_LIMIT);
  }, [catalog.entries, key]);

  const addDef = (def: DriverDefinition) => {
    const show = useShowStore.getState().show;
    if (!show) return;
    const device = newDevice(def, show.devices);
    useShowStore.getState().addDevice(device);
    router.back();
    if (!regular) setTimeout(() => router.push({ pathname: '/devices/[id]', params: { id: device.id } }), 300);
  };

  const addRemote = async (e: CatalogEntry) => {
    try {
      addDef(await ensureDefinition(e.id));
    } catch (err) {
      Alert.alert('機器の定義を取得できませんでした', err instanceof Error ? err.message : String(err));
    }
  };

  const remoteRow = (e: CatalogEntry, last: boolean, showMaker: boolean) => (
    <Row
      key={e.id}
      title={e.name}
      subtitle={[showMaker ? e.category : null, transportLabel(e.transport), actionCount(e)].filter(Boolean).join('・')}
      value={catalog.downloading[e.id] ? '取得中…' : undefined}
      chevron
      last={last}
      onPress={() => void addRemote(e)}
    />
  );

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      automaticallyAdjustKeyboardInsets
    >
      {/* 閉じる手段を常に出す（HIG Sheets） */}
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button onPress={() => router.back()}>キャンセル</Stack.Toolbar.Button>
      </Stack.Toolbar>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          minHeight: MIN_TAP,
          paddingHorizontal: 12,
          borderRadius: radius.field,
          backgroundColor: color.fill,
          marginBottom: 20,
        }}
      >
        <Symbol name="magnifyingglass" size={16} tint={color.label2} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="メーカー名・機種名で検索"
          placeholderTextColor={color.label3}
          autoCorrect={false}
          autoCapitalize="none"
          clearButtonMode="while-editing"
          accessibilityLabel="メーカー名・機種名で検索"
          style={[typeStyles.body, { flex: 1, color: color.label, minHeight: MIN_TAP }]}
        />
      </View>

      {bundledCategories.map((cat) => {
        const items = bundled.filter((d) => d.category === cat);
        return (
          <Section key={cat} title={cat}>
            {items.map((d, i) => (
              <Row
                key={d.id}
                title={d.name}
                subtitle={transportLabel(d.transport)}
                chevron
                last={i === items.length - 1}
                onPress={() => addDef(d)}
              />
            ))}
          </Section>
        );
      })}

      {key ? (
        found.length > 0 ? (
          <Section
            title="配信の機器"
            footer={`${found.length >= SEARCH_LIMIT ? `先頭の ${SEARCH_LIMIT} 件だけ出しています。` : ''}公開されている操作の仕組みから自動で作った定義です。実機では確かめていません。`}
          >
            {found.map((e, i) => remoteRow(e, i === found.length - 1, true))}
          </Section>
        ) : bundled.length === 0 ? (
          <Section>
            <Row title="見つかりません" last />
          </Section>
        ) : null
      ) : (
        <Section
          title={`配信の機器（${catalog.entries.length} 種類）`}
          footer="公開されている操作の仕組みから自動で作った定義です。実機では確かめていません。選ぶと定義を取ってきて、この iPhone / iPad に保存します。"
        >
          {catalog.status === 'loading' && catalog.entries.length === 0 ? <Row title="一覧を取得しています…" last /> : null}
          {catalog.status === 'error' && catalog.entries.length === 0 ? (
            <Row
              title="一覧を取得できませんでした"
              subtitle={catalog.error}
              value="もう一度"
              tone="accent"
              last
              onPress={() => refreshCatalog().catch(() => undefined)}
            />
          ) : null}
          {makers.map(([maker, items], i) => {
            const expanded = open === maker;
            const lastMaker = i === makers.length - 1;
            return (
              <View key={maker}>
                <Row
                  title={maker}
                  value={`${items.length}`}
                  chevron
                  last={lastMaker && !expanded}
                  onPress={() => setOpen(expanded ? null : maker)}
                />
                {expanded ? (
                  <View style={{ backgroundColor: color.fill4 }}>
                    {items.map((e, j) => remoteRow(e, lastMaker && j === items.length - 1, false))}
                  </View>
                ) : null}
              </View>
            );
          })}
        </Section>
      )}
    </ScrollView>
  );
}

function actionCount(e: CatalogEntry): string {
  if (e.allActions !== undefined && e.allActions !== e.actions) return `動作 ${e.actions}／${e.allActions}`;
  return `動作 ${e.actions}`;
}

function transportLabel(t: string): string {
  switch (t) {
    case 'tcp':
      return 'LAN（TCP）';
    case 'udp':
      return 'LAN（UDP）';
    case 'osc':
      return 'LAN（OSC / UDP）';
    case 'http':
      return 'LAN（HTTP）';
    case 'ws':
      return 'LAN（WebSocket）';
    case 'demo':
      return '通信しない（確認用）';
    default:
      return t;
  }
}
