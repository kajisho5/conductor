import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'conductor',
  slug: 'conductor',
  scheme: 'conductor',
  version: '0.1.0',
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
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  plugins: [
    'expo-router',
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
