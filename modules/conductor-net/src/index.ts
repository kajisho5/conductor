import { requireOptionalNativeModule, type EventSubscription, type NativeModule } from 'expo-modules-core';

/**
 * conductor-net の JS インターフェース（SPEC 7 章）。ネイティブ（Swift / Network.framework）は ios/ 配下。
 * jest・Expo Go・Android ではモジュールが無いので getConductorNet() は null を返す。
 */

export type NetState = 'connecting' | 'ready' | 'waiting' | 'failed' | 'closed';

export type ConductorNetEvents = {
  onState: (ev: { id: string; state: NetState; error?: string }) => void;
  onData: (ev: { id: string; base64: string }) => void;
};

export interface LocalAddress {
  /** en0 = Wi-Fi、bridge100 = インターネット共有、en2 など = 有線 LAN アダプタ（推測：機種や構成で変わる） */
  interface: string;
  address: string;
}

/** 表示用の名前（インターフェース名からの推測） */
export function interfaceLabel(name: string): string {
  if (name === 'en0') return 'Wi-Fi';
  if (name.startsWith('bridge')) return 'インターネット共有';
  if (name.startsWith('pdp_ip')) return 'モバイル通信';
  if (name.startsWith('utun') || name.startsWith('ipsec')) return 'VPN';
  if (/^en\d+$/.test(name)) return '有線 LAN';
  return name;
}

/** LAN で使うアドレスだけ（モバイル通信・VPN は機器から届かないので出さない） */
export function lanAddresses(list: LocalAddress[]): LocalAddress[] {
  return list.filter((a) => !a.interface.startsWith('pdp_ip') && !a.interface.startsWith('utun') && !a.interface.startsWith('ipsec'));
}

export interface ConductorNet {
  /** proto: 'tcp' | 'udp'。localPort は 0 で自動 */
  open(id: string, proto: 'tcp' | 'udp', host: string, port: number, localPort: number): Promise<void>;
  /** 送信の完了で解決（TCP は書き込み完了、UDP は送信完了） */
  send(id: string, base64: string): Promise<void>;
  close(id: string): Promise<void>;
  closeAll(): Promise<void>;
  /** この端末の IPv4 アドレス（ループバック・169.254 を除く） */
  localAddresses(): LocalAddress[];
  addListener<K extends keyof ConductorNetEvents>(event: K, listener: ConductorNetEvents[K]): EventSubscription;
}

type NativeShape = NativeModule<ConductorNetEvents> & Omit<ConductorNet, 'addListener'>;

let cached: ConductorNet | null | undefined;

export function getConductorNet(): ConductorNet | null {
  if (cached !== undefined) return cached;
  const native = requireOptionalNativeModule<NativeShape>('ConductorNet');
  cached = native ? (native as unknown as ConductorNet) : null;
  return cached;
}

/** テスト用：実装を差し替える */
export function setConductorNetForTesting(impl: ConductorNet | null | undefined): void {
  cached = impl;
}
