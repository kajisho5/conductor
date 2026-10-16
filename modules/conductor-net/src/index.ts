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

export interface ConductorNet {
  /** proto: 'tcp' | 'udp'。localPort は 0 で自動 */
  open(id: string, proto: 'tcp' | 'udp', host: string, port: number, localPort: number): Promise<void>;
  /** 送信の完了で解決（TCP は書き込み完了、UDP は送信完了） */
  send(id: string, base64: string): Promise<void>;
  close(id: string): Promise<void>;
  closeAll(): Promise<void>;
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
