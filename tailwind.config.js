/**
 * NativeWind はレイアウト（余白・並び・角丸）専用。
 * 色は src/theme/tokens.ts の PlatformColor（semantic system color）を style で渡す（SPEC 15.5）。
 * @type {import('tailwindcss').Config}
 */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {},
  },
  plugins: [],
};
