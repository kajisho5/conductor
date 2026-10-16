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
  const files = new Map<string, string>();
  const dirs = new Set<string>();
  const join = (...parts: unknown[]) =>
    parts
      .map((p) => (typeof p === 'string' ? p : (p as { uri: string }).uri))
      .join('/')
      .replace(/\/+/g, '/');
  class Directory {
    uri: string;
    constructor(...parts: unknown[]) {
      this.uri = join(...parts);
    }
    get exists() {
      return dirs.has(this.uri);
    }
    create() {
      dirs.add(this.uri);
    }
    list() {
      return [...files.keys()].filter((k) => k.startsWith(this.uri + '/')).map((k) => new File(k));
    }
  }
  class File {
    uri: string;
    constructor(...parts: unknown[]) {
      this.uri = join(...parts);
    }
    get exists() {
      return files.has(this.uri);
    }
    textSync() {
      const v = files.get(this.uri);
      if (v === undefined) throw new Error('not found ' + this.uri);
      return v;
    }
    write(content: string) {
      files.set(this.uri, content);
    }
    create() {
      if (!files.has(this.uri)) files.set(this.uri, '');
    }
    delete() {
      files.delete(this.uri);
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
    Paths: { document: new Directory('/doc') },
    __files: files,
  };
});

require('react-native-gesture-handler/jestSetup');
jest.mock('react-native-worklets', () => require('./node_modules/react-native-worklets/lib/module/mock.js'));
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
