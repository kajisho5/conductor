// jest-expo の既定モックに加え、ネイティブ依存のモジュールを置き換える。
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy', Rigid: 'rigid', Soft: 'soft' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

// ファイル保存はメモリ上の偽物に置き換える（src/storage/showFile.ts が使う最小限）
jest.mock('expo-file-system', () => {
  const files = new Map<string, string | Uint8Array>();
  const dirs = new Set<string>();
  const join = (...parts: unknown[]) =>
    parts
      .map((p) => (typeof p === 'string' ? p : (p as { uri: string }).uri))
      .join('/')
      .replace(/\/+/g, '/');
  const base = (uri: string) => uri.split('/').filter(Boolean).pop() ?? '';
  class Directory {
    uri: string;
    constructor(...parts: unknown[]) {
      this.uri = join(...parts);
    }
    get name() {
      return base(this.uri);
    }
    get exists() {
      return dirs.has(this.uri) || [...files.keys()].some((k) => k.startsWith(this.uri + '/'));
    }
    create() {
      dirs.add(this.uri);
    }
    delete() {
      for (const k of [...files.keys()]) if (k.startsWith(this.uri + '/')) files.delete(k);
      for (const d of [...dirs]) if (d === this.uri || d.startsWith(this.uri + '/')) dirs.delete(d);
    }
    list() {
      const prefix = this.uri + '/';
      const names = new Map<string, 'file' | 'dir'>();
      for (const k of files.keys()) {
        if (!k.startsWith(prefix)) continue;
        const rest = k.slice(prefix.length).split('/');
        names.set(rest[0]!, rest.length > 1 ? 'dir' : 'file');
      }
      for (const d of dirs) {
        if (!d.startsWith(prefix)) continue;
        const rest = d.slice(prefix.length).split('/');
        if (!names.has(rest[0]!)) names.set(rest[0]!, 'dir');
      }
      return [...names].map(([n, kind]) => (kind === 'dir' ? new Directory(prefix + n) : new File(prefix + n)));
    }
    copySync(dest: { uri: string }) {
      const target = dest.uri + '/' + this.name;
      for (const [k, v] of [...files]) if (k.startsWith(this.uri + '/')) files.set(target + k.slice(this.uri.length), v);
      dirs.add(target);
    }
  }
  class File {
    uri: string;
    constructor(...parts: unknown[]) {
      this.uri = join(...parts);
    }
    get name() {
      return base(this.uri);
    }
    get exists() {
      return files.has(this.uri);
    }
    textSync() {
      const v = files.get(this.uri);
      if (v === undefined) throw new Error('not found ' + this.uri);
      return typeof v === 'string' ? v : new TextDecoder().decode(v);
    }
    bytesSync() {
      const v = files.get(this.uri);
      if (v === undefined) throw new Error('not found ' + this.uri);
      return typeof v === 'string' ? new TextEncoder().encode(v) : v;
    }
    write(content: string | Uint8Array) {
      files.set(this.uri, content);
    }
    create() {
      if (!files.has(this.uri)) files.set(this.uri, '');
    }
    delete() {
      files.delete(this.uri);
    }
    copySync(dest: { uri: string }) {
      const v = files.get(this.uri);
      if (v === undefined) throw new Error('not found ' + this.uri);
      files.set(dest.uri, v);
    }
    moveSync(dest: { uri: string }) {
      const v = files.get(this.uri);
      if (v !== undefined) files.set(dest.uri, v);
      files.delete(this.uri);
      this.uri = dest.uri;
    }
  }
  return {
    File,
    Directory,
    Paths: { document: new Directory('/doc'), cache: new Directory('/cache') },
    __files: files,
  };
});

require('react-native-gesture-handler/jestSetup');
jest.mock('react-native-worklets', () => require('./node_modules/react-native-worklets/lib/module/mock.js'));
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
