import '../global.css';
import { useEffect, useState } from 'react';
import { Alert, AppState, View, useColorScheme } from 'react-native';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { initDevices } from '@/engine/executor';
import { fetchMissing, loadCached } from '@/drivers/remote';
import { deviceManager } from '@/engine/devices';
import { log } from '@/stores/log';
import { startAutosave, startStateAutosave, saveNow } from '@/storage/autosave';
import { loadInitialShow, loadState } from '@/storage/showFile';
import { triggerEngine } from '@/engine/triggers';
import { panelController } from '@/engine/panel';
import { useRuntimeStore } from '@/stores/runtime';
import { useUiStore } from '@/stores/ui';
import { importFromUri } from '@/storage/session';
import { useShowStore } from '@/stores/show';
import { color } from '@/theme/tokens';
import { AppText } from '@/components/ui/AppText';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';

const KEEP_AWAKE_TAG = 'conductor-always';
const DEVICE_SYNC_DELAY_MS = 600;

function reportSaveError(e: unknown) {
  Alert.alert('保存できませんでした', `空き容量を確認してから、もう一度変更してください。\n${e instanceof Error ? e.message : String(e)}`);
}

/** 起動：最後のショー（無ければデモ）を読み、機器の状態を用意し、自動保存を始める */
function useBootstrap(): string | null {
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    try {
      // 配信から取ってきた機器の定義（保存してあるもの）を先に読む
      loadCached();
      const { show } = loadInitialShow();
      useShowStore.getState().setShow(show);
      useRuntimeStore.getState().setCustomValues(loadState(show.id));
      initDevices(show);
      triggerEngine.start(show);
      // Stream Deck（iPad のみ。SPEC 2.5）
      panelController.start();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return undefined;
    }
    const stop = startAutosave(reportSaveError);
    const stopState = startStateAutosave(reportSaveError);
    // iOS は前面にいる間だけ動く（SPEC 11 章）：裏に回ったら保存して接続を閉じ、戻ったら開き直す
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'background') {
        saveNow(reportSaveError);
        deviceManager.suspend();
        log('info', 'アプリ', '裏に回ったので機器との接続を閉じました');
      } else if (s === 'inactive') {
        saveNow(reportSaveError);
      } else if (s === 'active') {
        const show = useShowStore.getState().show;
        if (show) deviceManager.resume(show);
      }
    });
    return () => {
      sub.remove();
      stop();
      stopState();
      deviceManager.stopAll();
      triggerEngine.stop();
      panelController.stop();
    };
  }, []);
  return error;
}

/** 機器の追加・削除・設定の変更に合わせて接続を開き直す */
function useDeviceStatusSync() {
  const devices = useShowStore((s) => s.show?.devices);
  useEffect(() => {
    // IP アドレスなどを入力している途中で何度も接続し直さないよう、少し待つ
    const t = setTimeout(() => {
      const show = useShowStore.getState().show;
      if (!show) return;
      initDevices(show);
      // 読み込んだショーなどで、定義が手元に無い機器があれば取ってきて接続し直す
      void fetchMissing(show.devices.map((d) => d.driverId)).then((n) => {
        const cur = useShowStore.getState().show;
        if (n > 0 && cur) initDevices(cur);
      });
    }, DEVICE_SYNC_DELAY_MS);
    return () => clearTimeout(t);
  }, [devices]);
}

/** 他のアプリから開いた .conductor の読み込み確認 */
function usePendingImport(ready: boolean) {
  const pending = useUiStore((s) => s.pendingImport);
  useEffect(() => {
    if (!ready || !pending) return;
    useUiStore.getState().setPendingImport(null);
    importFromUri(pending);
  }, [ready, pending]);
}

/** 設定 > 本番 > スリープ防止「いつも」 */
function useKeepAwakeAlways() {
  const always = useShowStore((s) => s.show?.settings.keepAwake === 'always');
  useEffect(() => {
    if (!always) return undefined;
    activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => undefined);
    return () => {
      deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => undefined);
    };
  }, [always]);
}

export default function RootLayout() {
  const error = useBootstrap();
  useDeviceStatusSync();
  useKeepAwakeAlways();
  const ready = useShowStore((s) => s.show !== null);
  usePendingImport(ready);
  const scheme = useColorScheme();
  return (
    <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: color.bg }}>
        <StatusBar style="auto" />
        <ErrorBoundary label="root">
          {error ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 }}>
              <AppText variant="title2" align="center">
                ショーを開けませんでした
              </AppText>
              <AppText tone="label2" align="center">
                {error}
              </AppText>
            </View>
          ) : ready ? (
            <Stack screenOptions={{ contentStyle: { backgroundColor: color.bg } }}>
              <Stack.Screen name="index" options={{ headerShown: false }} />
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="show" options={{ presentation: 'fullScreenModal', headerShown: false, animation: 'fade' }} />
            </Stack>
          ) : (
            // 起動画面と同じ背景色だけ（HIG Launching）
            <View style={{ flex: 1, backgroundColor: color.bg }} />
          )}
        </ErrorBoundary>
      </GestureHandlerRootView>
    </ThemeProvider>
  );
}
