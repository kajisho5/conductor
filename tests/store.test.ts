import { demoShow, newButton, newShow } from '@/model/defaults';
import { cellKey } from '@/model/grid';
import { useShowStore, visibleButtonCount } from '@/stores/show';

const s = () => useShowStore.getState();

function setup() {
  const show = newShow('T');
  s().setShow(show);
  return show.pages[0]!.id;
}

describe('ショーのストア', () => {
  it('ボタンを作る・見た目を変える・消す', () => {
    const pageId = setup();
    const ref = { pageId, key: cellKey(0, 0) };
    const b = s().createButton(ref);
    expect(b).not.toBeNull();
    s().updateStyle(ref, { backgroundColor: '#E0302B', text: 'CAM' });
    expect(s().show!.pages[0]!.buttons[ref.key]!.style.backgroundColor).toBe('#E0302B');
    s().deleteButton(ref);
    expect(s().show!.pages[0]!.buttons[ref.key]).toBeUndefined();
  });

  it('コピーは ID を振り直し、移動・入れ替えは同じボタン', () => {
    const pageId = setup();
    const a = { pageId, key: cellKey(0, 0) };
    const b = { pageId, key: cellKey(0, 1) };
    const c = { pageId, key: cellKey(0, 2) };
    const orig = s().createButton(a)!;
    s().copyButton(a, b);
    const copy = s().show!.pages[0]!.buttons[b.key]!;
    expect(copy.id).not.toBe(orig.id);
    expect(copy.steps[0]!.id).not.toBe(orig.steps[0]!.id);
    s().moveButton(a, c);
    expect(s().show!.pages[0]!.buttons[a.key]).toBeUndefined();
    expect(s().show!.pages[0]!.buttons[c.key]!.id).toBe(orig.id);
    s().swapButtons(b, c);
    expect(s().show!.pages[0]!.buttons[b.key]!.id).toBe(orig.id);
    expect(s().show!.pages[0]!.buttons[c.key]!.id).toBe(copy.id);
  });

  it('ページの追加・複製・並べ替え・削除（最低 1 ページ）', () => {
    setup();
    s().addPage();
    expect(s().show!.pages.map((p) => p.number)).toEqual([1, 2]);
    const first = s().show!.pages[0]!;
    s().duplicatePage(first.id);
    expect(s().show!.pages[1]!.name).toBe(`${first.name} のコピー`);
    s().movePage(first.id, 1);
    expect(s().show!.pages[1]!.id).toBe(first.id);
    expect(s().show!.pages.map((p) => p.number)).toEqual([1, 2, 3]);
    for (const p of [...s().show!.pages]) s().deletePage(p.id);
    expect(s().show!.pages).toHaveLength(1);
  });

  it('グリッドを小さくしてもボタンは残る', () => {
    const pageId = setup();
    s().createButton({ pageId, key: cellKey(3, 7) });
    s().setGrid(4, 2);
    const page = s().show!.pages[0]!;
    expect(page.buttons[cellKey(3, 7)]).toBeDefined();
    expect(visibleButtonCount(page, 4, 2)).toBe(0);
    s().setGrid(8, 4);
    expect(visibleButtonCount(s().show!.pages[0]!, 8, 4)).toBe(1);
  });

  it('取り消し・やり直し', () => {
    const pageId = setup();
    const ref = { pageId, key: cellKey(1, 1) };
    s().createButton(ref);
    expect(s().past).toHaveLength(1);
    s().undo();
    expect(s().show!.pages[0]!.buttons[ref.key]).toBeUndefined();
    s().redo();
    expect(s().show!.pages[0]!.buttons[ref.key]).toBeDefined();
  });

  it('同じ項目への続けての文字入力は 1 手にまとめる', () => {
    const pageId = setup();
    const ref = { pageId, key: cellKey(0, 0) };
    s().createButton(ref);
    const before = s().past.length;
    s().updateStyle(ref, { text: 'C' });
    s().updateStyle(ref, { text: 'CA' });
    s().updateStyle(ref, { text: 'CAM' });
    expect(s().past.length).toBe(before + 1);
    s().undo();
    expect(s().show!.pages[0]!.buttons[ref.key]!.style.text).toBe('');
  });

  it('restore は取り消せる 1 手', () => {
    const pageId = setup();
    const snap = s().show!;
    s().createButton({ pageId, key: cellKey(0, 0) });
    s().restore(snap);
    expect(Object.keys(s().show!.pages[0]!.buttons)).toHaveLength(0);
    s().undo();
    expect(Object.keys(s().show!.pages[0]!.buttons)).toHaveLength(1);
  });

  it('機器の有効/無効', () => {
    s().setShow(demoShow());
    const id = s().show!.devices[0]!.id;
    s().setDeviceEnabled(id, false);
    expect(s().show!.devices[0]!.enabled).toBe(false);
  });

  it('newButton の既定', () => {
    const b = newButton();
    expect(b.style.textColor).toBe('auto');
    expect(b.steps).toHaveLength(1);
  });
});
