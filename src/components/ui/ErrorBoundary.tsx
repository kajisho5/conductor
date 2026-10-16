import { Component, type ReactNode } from 'react';
import { View } from 'react-native';
import { AppText } from './AppText';
import { ProminentButton } from './Buttons';

/** 描画中の例外で真っ白にしない。直し方（もう一度表示）を出す */
export class ErrorBoundary extends Component<{ label: string; children: ReactNode }, { error: Error | null }> {
  override state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 }}>
        <AppText variant="title2" align="center">
          表示できませんでした
        </AppText>
        <AppText tone="label2" align="center">
          {`${this.props.label}: ${this.state.error.message}`}
        </AppText>
        <ProminentButton label="もう一度表示" onPress={() => this.setState({ error: null })} />
      </View>
    );
  }
}
