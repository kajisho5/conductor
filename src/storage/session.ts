import { Alert } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import type { Show } from '@/model/types';
import { log } from '@/stores/log';
import { useRuntimeStore } from '@/stores/runtime';
import { useShowStore } from '@/stores/show';
import { useUiStore } from '@/stores/ui';
import { asNewShow, describePackage, mergeInto, readPackage, writeExport, writeImages, type ExportScope } from './exchange';
import { listShows } from './shows';
import { loadState, saveShow, ShowFileError } from './showFile';

/**
 * 今のショーを替える・書き出す・読み込む（画面から呼ぶ。SPEC 2.1-7・9 章）。
 */

/** ショーを替える：今のショーを保存し、実行時の状態（機器の値・押下・ページ）を初めに戻す */
export function switchToShow(next: Show): void {
  const cur = useShowStore.getState().show;
  if (cur) saveShow(cur);
  saveShow(next);
  useRuntimeStore.setState({
    deviceStatus: {},
    deviceError: {},
    deviceValues: {},
    press: {},
    stepIndex: {},
    pageNumber: 1,
    locked: false,
    customValues: loadState(next.id),
  });
  useUiStore.getState().select(null);
  useUiStore.getState().clearOp();
  useUiStore.getState().pickPreset(null);
  useShowStore.getState().setShow(next);
  log('info', 'ショー', `「${next.name}」を開きました`);
}

/** 共有シートで書き出す */
export async function exportAndShare(show: Show, scope: ExportScope, label: string): Promise<void> {
  try {
    saveShow(show);
    const file = writeExport(show, scope, label);
    if (!(await Sharing.isAvailableAsync())) {
      Alert.alert('共有できません', 'この端末では共有シートを使えません。');
      return;
    }
    await Sharing.shareAsync(file.uri, {
      dialogTitle: `${label} を書き出す`,
      mimeType: 'application/zip',
      UTI: 'com.seventhwell.conductor.show',
    });
  } catch (e) {
    Alert.alert('書き出せませんでした', e instanceof Error ? e.message : String(e));
  }
}

/** ファイルを選んで読み込む */
export async function pickAndImport(): Promise<void> {
  const r = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false });
  if (r.canceled || !r.assets[0]) return;
  importFromUri(r.assets[0].uri);
}

/** 読み込み：中身の一覧を見せて、新しいショーとして／今のショーに追加 を選ぶ */
export function importFromUri(uri: string): void {
  let parsed: ReturnType<typeof readPackage>;
  try {
    parsed = readPackage(uri);
  } catch (e) {
    Alert.alert(
      '読み込めませんでした',
      e instanceof ShowFileError ? e.message : `ファイルを読めません（${e instanceof Error ? e.message : String(e)}）`,
    );
    return;
  }
  const { pkg, images } = parsed;
  const cur = useShowStore.getState().show;
  Alert.alert('読み込みますか？', describePackage(pkg), [
    {
      text: '新しいショーとして',
      onPress: () => {
        try {
          const show = asNewShow(
            pkg,
            listShows().map((s) => s.name),
          );
          saveShow(show);
          writeImages(show, images, pkg.show, {});
          switchToShow(show);
        } catch (e) {
          Alert.alert('読み込めませんでした', e instanceof Error ? e.message : String(e));
        }
      },
    },
    ...(cur
      ? [
          {
            text: '今のショーに追加',
            onPress: () => {
              try {
                const { show, imageMap } = mergeInto(cur, pkg);
                writeImages(show, images, pkg.show, imageMap);
                useShowStore.getState().mutateShow(() => show);
                log('info', 'ショー', `${describePackage(pkg)} を追加しました`);
              } catch (e) {
                Alert.alert('読み込めませんでした', e instanceof Error ? e.message : String(e));
              }
            },
          },
        ]
      : []),
    { text: 'キャンセル', style: 'cancel' as const },
  ]);
}
