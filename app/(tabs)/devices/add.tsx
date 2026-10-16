import { useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { listDefinitions } from '@/drivers/registry';
import { newDevice } from '@/model/devices';
import { useShowStore } from '@/stores/show';
import { useSizeClass } from '@/hooks/useSizeClass';
import { color, MIN_TAP, radius, type as typeStyles } from '@/theme/tokens';
import { Row, Section } from '@/components/ui/Group';
import { Symbol } from '@/components/ui/Symbol';

/** 機器を追加：種類を検索して選ぶ（SPEC 2.1-3）。選ぶとすぐ追加して編集へ */
export default function AddDeviceScreen() {
  const [q, setQ] = useState('');
  const regular = useSizeClass() === 'regular';
  const defs = listDefinitions().filter((d) => {
    const k = q.trim().toLowerCase();
    return !k || d.name.toLowerCase().includes(k) || d.category.toLowerCase().includes(k) || d.id.includes(k);
  });
  const categories = [...new Set(defs.map((d) => d.category))];

  const add = (id: string) => {
    const show = useShowStore.getState().show;
    const def = defs.find((d) => d.id === id);
    if (!show || !def) return;
    const device = newDevice(def, show.devices);
    useShowStore.getState().addDevice(device);
    router.back();
    if (!regular) setTimeout(() => router.push({ pathname: '/devices/[id]', params: { id: device.id } }), 300);
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
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
          placeholder="機種名で検索"
          placeholderTextColor={color.label3}
          autoCorrect={false}
          accessibilityLabel="機種名で検索"
          style={[typeStyles.body, { flex: 1, color: color.label, minHeight: MIN_TAP }]}
        />
      </View>
      {categories.map((cat) => {
        const items = defs.filter((d) => d.category === cat);
        return (
          <Section key={cat} title={cat}>
            {items.map((d, i) => (
              <Row
                key={d.id}
                title={d.name}
                subtitle={transportLabel(d.transport)}
                chevron
                last={i === items.length - 1}
                onPress={() => add(d.id)}
              />
            ))}
          </Section>
        );
      })}
      {defs.length === 0 ? (
        <Section>
          <Row title="見つかりません" last />
        </Section>
      ) : null}
    </ScrollView>
  );
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
    case 'demo':
      return '通信しない（確認用）';
    default:
      return t;
  }
}
