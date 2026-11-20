import { Text, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Logo, s } from '../components/ui';
import { colors } from '../lib/theme';
import { useMe } from '../lib/me';

export default function Welcome() {
  const { status } = useMe();
  if (status === 'in') return <Redirect href="/discover" />;
  if (status === 'setup') return <Redirect href="/setup" />;

  return (
    <SafeAreaView style={[s.screen, { padding: 24, justifyContent: 'center', gap: 32 }]}>
      <Logo size={72} />
      <Text style={[s.muted, { fontSize: 13 }]}>Gogogo</Text>
      <Text style={{ color: colors.text, fontSize: 26, fontWeight: '700', lineHeight: 33, letterSpacing: -0.5 }}>
        Everyone here wants the same thing.{'\n'}
        <Text style={{ color: colors.accent }}>Skip the guessing.</Text>
      </Text>
      <View style={{ gap: 12 }}>
        <Button title="I'm down" onPress={() => router.push('/signup')} />
        <Button title="I have an account" variant="ghost" onPress={() => router.push('/login')} />
      </View>
      <Text style={[s.muted, { textAlign: 'center', fontSize: 13 }]}>18+ only. Consent always. Respect is the only rule.</Text>
    </SafeAreaView>
  );
}
