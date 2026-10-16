import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { getConductorNet, interfaceLabel, lanAddresses, type LocalAddress } from '../../../modules/conductor-net/src';
import { Row, Section } from '@/components/ui/Group';

function read(): LocalAddress[] | null {
  const net = getConductorNet();
  if (!net) return null;
  try {
    return lanAddresses(net.localAddresses());
  } catch {
    return [];
  }
}

/** この端末の IP（3 秒ごと・前面に戻った時に読み直す。Wi-Fi の切り替えに追随） */
export function useLocalAddresses(): LocalAddress[] | null {
  const [list, setList] = useState<LocalAddress[] | null>(read);
  useEffect(() => {
    const t = setInterval(() => setList(read()), 3000);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') setList(read());
    });
    return () => {
      clearInterval(t);
      sub.remove();
    };
  }, []);
  return list;
}

/** 「この端末」の欄：IP を並べる */
export function LocalAddressesSection() {
  const list = useLocalAddresses();
  return (
    <Section
      title="この端末"
      footer="機器の設定で「操作する側の IP」を求められたら、ここのアドレスを入れてください。"
    >
      {list === null ? (
        <Row title="IP アドレス" value="このビルドでは取得できません" last />
      ) : list.length === 0 ? (
        <Row title="IP アドレス" value="ネットワークにつながっていません" last />
      ) : (
        list.map((a, i) => (
          <Row
            key={`${a.interface}-${a.address}`}
            title={`IP アドレス（${interfaceLabel(a.interface)}）`}
            value={a.address}
            icon="network"
            last={i === list.length - 1}
          />
        ))
      )}
    </Section>
  );
}
