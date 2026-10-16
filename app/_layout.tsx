import '../global.css';
import { useEffect, useState } from 'react';
import { Alert, AppState, View, useColorScheme } from 'react-native';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { initDevices } from '@/engine/executor';
import { startAutosave, saveNow } from '@/storage/autosave';
import { loadInitialShow } from '@/storage/showFile';
import { useShowStore } from '@/stores/show';
import { color } from '@/theme/tokens';
import { AppText } from '@/components/ui/AppText';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';

const KEEP_AWAKE_TAG = 'conductor-always';

function reportSaveError(e: unknown) {
  Alert.alert('保存できませんでした', `空き容量を確認してから、もう一度変更してください。\n${e instanceof Error ? e.message : String(e)}`);
}

/** 起動：最後のショー（無ければデモ）を読み、機器の状態を用意し、自動保存を始める */
function useBootstrap(): string | null {
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    try {
      const { show } = loadInitialShow();
      useShowStore.getState().setShow(show);
      initDevices(show);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return undefined;
    }
    const stop = startAutosave(reportSaveError);
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') saveNow(reportSaveError);
    });
    return () => {
      sub.remove();
      stop();
    };
  }, []);
  return error;
}

/** 機器の有効/無効が変わったら状態を作り直す（M1：デモドライバ） */
function useDeviceStatusSync() {
  const devices = useShowStore((s) => s.show?.devices);
  useEffect(() => {
    const show = useShowStore.getState().show;
    if (show) initDevices(show);
  }, [devices]);
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
