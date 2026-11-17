import { useEffect, useState } from 'react';
import { Pressable, Text } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { authMessage, confirmSignUp, resendCode, signIn, takeAutoSignIn } from '../lib/cognito';
import { useMe } from '../lib/me';
import { colors } from '../lib/theme';
import { Button, Input, s } from '../components/ui';
import AuthScreen from '../components/AuthScreen';

// Enter the 6-digit code Cognito emailed after signup.
export default function Confirm() {
  const { email, resend } = useLocalSearchParams();
  const { refresh } = useMe();
  const [code, setCode] = useState('');
  const [note, setNote] = useState(resend ? '' : `We sent a code to ${email}.`);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  // Coming from login with an unconfirmed account: send a fresh code.
  useEffect(() => {
    if (resend && email)
      resendCode(email)
        .then(() => setNote(`Your email isn't confirmed yet. We sent a new code to ${email}.`))
        .catch((e) => setErr(authMessage(e)));
  }, [resend, email]);

  if (!email) return <Redirect href="/signup" />;

  async function submit() {
    setErr('');
    setBusy(true);
    try {
      await confirmSignUp(email, code.trim());
      const saved = takeAutoSignIn(email);
      if (saved) {
        await signIn(saved.email, saved.password);
        await refresh();
      } else router.replace('/login');
    } catch (e) {
      setErr(authMessage(e));
      setBusy(false);
    }
  }

  async function again() {
    setErr('');
    try {
      await resendCode(email);
      setNote(`New code sent to ${email}.`);
    } catch (e) {
      setErr(authMessage(e));
    }
  }

  return (
    <AuthScreen title="Check your email.">
      {!!note && <Text style={s.muted}>{note}</Text>}
      <Input
        placeholder="123456"
        value={code}
        onChangeText={(v) => setCode(v.replace(/\D/g, ''))}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        maxLength={6}
        style={{ marginTop: 8 }}
      />
      {!!err && <Text style={s.error}>{err}</Text>}
      <Button title={busy ? '…' : 'Confirm'} onPress={submit} disabled={busy || code.length < 6} />
      <Pressable onPress={again} style={{ padding: 12, alignItems: 'center' }}>
        <Text style={{ color: colors.muted }}>Send a new code</Text>
      </Pressable>
    </AuthScreen>
  );
}
