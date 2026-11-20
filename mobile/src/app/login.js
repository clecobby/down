import { useState } from 'react';
import { Pressable, Text } from 'react-native';
import { Link, router } from 'expo-router';
import { authMessage, rememberForAutoSignIn, signIn } from '../lib/cognito';
import { api } from '../lib/api';
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
    let id = email.trim().toLowerCase();
    setErr('');
    setBusy(true);
    try {
      // Allow logging in with a username: resolve it to the account's email (server checks the password first).
      if (!id.includes('@')) {
        const r = await api('/login-email', { method: 'POST', body: { login: email.trim(), password } });
        id = r.email;
      }
      const step = await signIn(id, password);
      if (step === 'CONFIRM_SIGN_UP') {
        rememberForAutoSignIn(id, password);
        setBusy(false);
        return router.push({ pathname: '/confirm', params: { email: id, resend: '1' } });
      }
      await refresh();
    } catch (x) {
      setErr(authMessage(x));
      setBusy(false);
    }
  }

  return (
    <AuthScreen title="Welcome back.">
      <Input placeholder="Username or email" value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} autoComplete="username" />
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
