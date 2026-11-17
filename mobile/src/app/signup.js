import { useState } from 'react';
import { Switch, Text, View } from 'react-native';
import { Link, router } from 'expo-router';
import { authMessage, rememberForAutoSignIn, signUp } from '../lib/cognito';
import { colors } from '../lib/theme';
import { Button, Input, s } from '../components/ui';
import AuthScreen from '../components/AuthScreen';

export default function Signup() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [agree, setAgree] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!agree) return setErr('Please confirm you are 18+ and agree to the rules');
    const e = email.trim().toLowerCase();
    setErr('');
    setBusy(true);
    try {
      await signUp(e, password);
      rememberForAutoSignIn(e, password);
      router.push({ pathname: '/confirm', params: { email: e } });
    } catch (x) {
      setErr(authMessage(x));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthScreen title="Get in.">
      <Input placeholder="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoCorrect={false} autoComplete="email" />
      <Input placeholder="Password (10+ chars, Aa, 1)" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" />
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center', marginVertical: 8 }}>
        <Switch value={agree} onValueChange={setAgree} trackColor={{ true: colors.accent }} />
        <Text style={[s.muted, { flex: 1, fontSize: 13 }]}>
          I'm 18+, I'll respect people's boundaries, and I know a match is an invitation — not a promise.
        </Text>
      </View>
      {!!err && <Text style={s.error}>{err}</Text>}
      <Button title={busy ? '…' : 'Create account'} onPress={submit} disabled={busy} />
      <Text style={[s.muted, { textAlign: 'center', marginTop: 8 }]}>
        Already in?{' '}
        <Link href="/login" replace style={s.text}>
          Log in
        </Link>
      </Text>
    </AuthScreen>
  );
}
