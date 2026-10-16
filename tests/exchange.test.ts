import { Directory, File, Paths } from 'expo-file-system';
import { demoShow, newShow } from '@/model/defaults';
import { cellKey } from '@/model/grid';
import { addTrigger, newTrigger } from '@/model/triggers';
import { addCustomVariable, updateCustomVariable } from '@/model/variables';
import type { Show } from '@/model/types';
import { asNewShow, describePackage, mergeInto, narrow, packShow, readPackage, unpack, writeExport, writeImages } from '@/storage/exchange';
import { importImage, imageUri, usedImageIds } from '@/storage/images';
import { createShow, deleteShowFiles, duplicateShowFiles, listShows } from '@/storage/shows';
import { loadState, saveShow, saveState, ShowFileError } from '@/storage/showFile';
import { startStateAutosave } from '@/storage/autosave';
import { useRuntimeStore } from '@/stores/runtime';
import { useShowStore } from '@/stores/show';

function withImage(): Show {
  const s = demoShow();
  saveShow(s);
  new File(Paths.cache, 'pick.png').write(Uint8Array.from([137, 80, 78, 71]));
  const img = importImage(s.id, { uri: new File(Paths.cache, 'pick.png').uri, width: 10, height: 20, fileName: 'logo.png' });
  const page = s.pages[0]!;
  const key = cellKey(0, 0);
  return {
    ...s,
    images: [img],
    pages: [
      { ...page, buttons: { ...page.buttons, [key]: { ...page.buttons[key]!, style: { ...page.buttons[key]!.style, imageId: img.id } } } },
      ...s.pages.slice(1),
    ],
  };
}

describe('画像', () => {
  it('取り込み・URI・使っている画像', () => {
    const s = withImage();
    const img = s.images[0]!;
    expect(img).toMatchObject({ name: 'logo', width: 10, height: 20 });
    expect(img.file).toMatch(/^images\/.+\.png$/);
    expect(imageUri(s, img.id)).toContain(img.file);
    expect(imageUri(s, 'none')).toBeNull();
    expect(usedImageIds(s).has(img.id)).toBe(true);
  });
});

describe('書き出し・読み込み', () => {
  it('ショー全体：zip の往復（画像も）', () => {
    const s = withImage();
    const bytes = packShow(s, { kind: 'show' }, (file) => new File(Paths.document, 'shows', s.id, file).bytesSync());
    const { pkg, images } = unpack(bytes);
    expect(pkg.kind).toBe('show');
    expect(pkg.show.pages).toHaveLength(3);
    expect(Object.values(images)[0]).toEqual(Uint8Array.from([137, 80, 78, 71]));
    expect(describePackage(pkg)).toBe('ショー「DEMO-SHOW」：ページ 3・機器 5・トリガー 0・画像 1');
  });

  it('ページ単位：そのページで使う機器・画像だけ', () => {
    const s = withImage();
    const part = narrow(s, { kind: 'page', pageId: s.pages[1]!.id });
    expect(part.pages).toHaveLength(1);
    expect(part.pages[0]!.number).toBe(1);
    expect(part.devices.map((d) => d.label)).toEqual(['DEMO-SW-A']);
    expect(part.images).toHaveLength(0);
    expect(part.triggers).toHaveLength(0);
    expect(() => narrow(s, { kind: 'page', pageId: 'x' })).toThrow(ShowFileError);
  });

  it('トリガー単位', () => {
    let s = demoShow();
    const t = newTrigger(s);
    t.events = [{ type: 'deviceDisconnected', deviceId: s.devices[2]!.id }];
    s = addTrigger(s, t);
    const part = narrow(s, { kind: 'trigger', triggerId: t.id });
    expect(part.pages).toHaveLength(0);
    expect(part.triggers).toHaveLength(1);
    expect(part.devices.map((d) => d.label)).toEqual(['DEMO-MIXER']);
  });

  it('壊れたファイル', () => {
    expect(() => unpack(Uint8Array.from([1, 2, 3]))).toThrow('.conductor');
  });

  it('新しいショーとして：ID と重なる名前を変える', () => {
    const s = demoShow();
    const n = asNewShow({ kind: 'show', show: s }, ['DEMO-SHOW']);
    expect(n.id).not.toBe(s.id);
    expect(n.name).toBe('DEMO-SHOW（読み込み）');
  });

  it('今のショーに追加：同じ機器は使い回し、無い機器は名前を重ねずに足す、ページは後ろへ、画像の ID は振り直す', () => {
    const target = demoShow();
    let src = withImage();
    src = { ...src, devices: [...src.devices, { ...src.devices[0]!, id: 'other', label: 'DEMO-SW-A' }] };
    src.pages[0]!.buttons[cellKey(3, 3)] = {
      ...src.pages[0]!.buttons[cellKey(0, 0)]!,
      steps: [
        {
          id: 's',
          press: {
            mode: 'sequential',
            actions: [{ id: 'a', deviceId: 'other', definitionId: 'demo.set', options: {}, delayMs: 0, enabled: true }],
          },
          release: { mode: 'sequential', actions: [] },
          holds: [],
        },
      ],
    };
    src = addCustomVariable(src);
    src = updateCustomVariable(src, src.customVariables[0]!.id, { name: 'fromSrc' });
    const { show, imageMap } = mergeInto(target, { kind: 'show', show: src });
    expect(show.pages.map((p) => p.number)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(show.devices).toHaveLength(6);
    const added = show.devices[5]!;
    expect(added.label).toBe('DEMO-SW-A-1');
    const moved = show.pages[3]!.buttons[cellKey(3, 3)]!;
    expect(moved.steps[0]!.press.actions[0]!.deviceId).toBe(added.id);
    const img = show.images[0]!;
    expect(imageMap[src.images[0]!.id]).toBe(img.id);
    expect(show.pages[3]!.buttons[cellKey(0, 0)]!.style.imageId).toBe(img.id);
    expect(show.customVariables.map((v) => v.name)).toEqual(['fromSrc']);
  });

  it('端末上のファイル：書き出し → 読み込み → 画像を書く', () => {
    const s = withImage();
    const f = writeExport(s, { kind: 'show' }, 'A/B:show');
    expect(f.name).toBe('A_B_show.conductor');
    const { pkg, images } = readPackage(f.uri);
    const n = asNewShow(pkg, []);
    saveShow(n);
    writeImages(n, images, pkg.show, {});
    expect(imageUri(n, n.images[0]!.id)).not.toBeNull();
  });
});

describe('ショーの一覧・保持する変数', () => {
  it('作成・複製・削除・一覧', () => {
    for (const x of listShows()) deleteShowFiles(x.id);
    const a = createShow('A');
    const b = duplicateShowFiles(a);
    expect(
      listShows()
        .map((x) => x.name)
        .sort(),
    ).toEqual(['A', 'A のコピー']);
    deleteShowFiles(b.id);
    expect(listShows().map((x) => x.id)).toEqual([a.id]);
    expect(new Directory(Paths.document, 'shows', b.id).exists).toBe(false);
  });
  it('state.json', () => {
    const s = newShow('S');
    saveShow(s);
    expect(loadState(s.id)).toEqual({});
    saveState(s.id, { count: '3' });
    expect(loadState(s.id)).toEqual({ count: '3' });
  });
  it('「再起動後も保持」の変数だけ自動で保存', () => {
    jest.useFakeTimers();
    let s = newShow('S');
    s = addCustomVariable(s);
    s = updateCustomVariable(s, s.customVariables[0]!.id, { name: 'keep', persist: true });
    s = addCustomVariable(s);
    useShowStore.getState().setShow(s);
    const saved: Record<string, string>[] = [];
    const stop = startStateAutosave(
      () => undefined,
      (_id, v) => saved.push(v),
    );
    useRuntimeStore.getState().setCustomValues({ keep: '1', var: 'x' });
    jest.advanceTimersByTime(600);
    expect(saved).toEqual([{ keep: '1' }]);
    stop();
    jest.useRealTimers();
  });
});
