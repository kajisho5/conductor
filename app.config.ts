import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'conductor',
  slug: 'conductor',
  scheme: 'conductor',
  version: '0.6.0',
  // アプリアイコン（HIG「App icons」：1024×1024・角丸なし。dark は透過背景、tinted はグレースケール。元 SVG は docs/brand/）
  icon: './assets/images/icon.png',
  // 向きは固定しない（サイズクラスで構成を変える。HIG Layout / iPhone Duo）
  orientation: 'default',
  userInterfaceStyle: 'automatic',
  ios: {
    bundleIdentifier: 'com.seventhwell.conductor',
    icon: {
      light: './assets/images/icon.png',
      dark: './assets/images/icon-dark.png',
      tinted: './assets/images/icon-tinted.png',
    },
    supportsTablet: true,
    // Split View・Slide Over に対応（狭い幅では compact の構成になる）
    requireFullScreen: false,
    infoPlist: {
      NSLocalNetworkUsageDescription: 'LAN 上の映像・音響機器と通信するために使います。',
      // Roland の機器を Bluetooth MIDI で追加する時だけ使う（「Bluetooth MIDI の機器を追加」を押した時に聞かれる）
      NSBluetoothAlwaysUsageDescription: '映像スイッチャーと Bluetooth MIDI で通信するために使います。',
      ITSAppUsesNonExemptEncryption: false,
      // LAN 上の機器へ http:// で送る（汎用 HTTP）。ローカルネットワークだけ平文を許す
      NSAppTransportSecurity: { NSAllowsLocalNetworking: true },
      // .conductor（書き出したショー）を他のアプリから開けるようにする（SPEC 9 章）
      UTExportedTypeDeclarations: [
        {
          UTTypeIdentifier: 'com.seventhwell.conductor.show',
          UTTypeDescription: 'conductor ショー',
          UTTypeConformsTo: ['public.data', 'public.zip-archive'],
          UTTypeTagSpecification: { 'public.filename-extension': ['conductor'] },
        },
      ],
      CFBundleDocumentTypes: [
        {
          CFBundleTypeName: 'conductor ショー',
          CFBundleTypeRole: 'Editor',
          LSHandlerRank: 'Owner',
          LSItemContentTypes: ['com.seventhwell.conductor.show'],
        },
      ],
      LSSupportsOpeningDocumentsInPlace: false,
    },
  },
  plugins: [
    'expo-router',
    // 写真はシステムのピッカーで選ぶだけなので、写真ライブラリ・カメラ・マイクの許可は求めない（HIG Privacy）
    ['expo-image-picker', { photosPermission: false, cameraPermission: false, microphonePermission: false }],
    [
      'expo-build-properties',
      {
        ios: { deploymentTarget: '17.0' },
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
  },
};

export default config;
