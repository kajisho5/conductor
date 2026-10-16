import { Redirect } from 'expo-router';

/** 起動時はボタン画面 */
export default function Index() {
  return <Redirect href="/buttons" />;
}
