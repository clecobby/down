import { useState } from 'react';
import { Pressable, Text } from 'react-native';
import { Link, router } from 'expo-router';
import { authMessage, rememberForAutoSignIn, signIn } from '../lib/cognito';
import { useMe } from '../lib/me';
import { colors } from '../lib/theme';
import { Button, Input, s } from '../components/ui';
import AuthScreen from '../components/AuthScreen';

export default function Login() {
  const { refresh } = useMe();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    const e = email.trim().toLowerCase();
    setErr('');
    setBusy(true);
    try {
      const step = await signIn(e, password);
      if (step === 'CONFIRM_SIGN_UP') {
        rememberForAutoSignIn(e, password);
        setBusy(false);
        return router.push({ pathname: '/confirm', params: { email: e, resend: '1' } });
      }
      await refresh();
    } catch (x) {
      setErr(authMessage(x));
      setBusy(false);
    }
  }

  return (
    <AuthScreen title="Welcome back.">
      <Input placeholder="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoCorrect={false} autoComplete="email" />
      <Input placeholder="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" onSubmitEditing={submit} />
      {!!err && <Text style={s.error}>{err}</Text>}
      <Button title={busy ? '…' : 'Log in'} onPress={submit} disabled={busy} />
      <Pressable onPress={() => router.push('/reset')} style={{ padding: 12, alignItems: 'center' }}>
        <Text style={{ color: colors.muted }}>Forgot password?</Text>
      </Pressable>
      <Text style={[s.muted, { textAlign: 'center' }]}>
        New here?{' '}
        <Link href="/signup" replace style={s.text}>
          Sign up
        </Link>
      </Text>
    </AuthScreen>
  );
}
