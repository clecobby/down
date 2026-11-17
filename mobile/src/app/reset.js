import { useState } from 'react';
import { Text } from 'react-native';
import { router } from 'expo-router';
import { authMessage, confirmForgotPassword, forgotPassword } from '../lib/cognito';
import { Button, Input, s } from '../components/ui';
import AuthScreen from '../components/AuthScreen';

// Forgot password: email → code + new password.
export default function Reset() {
  const [step, setStep] = useState('email'); // email | code | done
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    const e = email.trim().toLowerCase();
    setErr('');
    setBusy(true);
    try {
      if (step === 'email') {
        await forgotPassword(e);
        setStep('code');
      } else {
        await confirmForgotPassword(e, code.trim(), password);
        setStep('done');
      }
    } catch (x) {
      setErr(authMessage(x));
    } finally {
      setBusy(false);
    }
  }

  if (step === 'done')
    return (
      <AuthScreen title="All set.">
        <Text style={s.muted}>Your password has been changed.</Text>
        <Button title="Log in" onPress={() => router.replace('/login')} />
      </AuthScreen>
    );

  return (
    <AuthScreen title="New password.">
      <Input placeholder="Email" value={email} onChangeText={setEmail} editable={step === 'email'} autoCapitalize="none" keyboardType="email-address" autoCorrect={false} />
      {step === 'code' && (
        <>
          <Text style={s.muted}>If that email has an account, we sent it a code.</Text>
          <Input placeholder="123456" value={code} onChangeText={(v) => setCode(v.replace(/\D/g, ''))} keyboardType="number-pad" textContentType="oneTimeCode" maxLength={6} />
          <Input placeholder="New password (10+ chars, Aa, 1)" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" />
        </>
      )}
      {!!err && <Text style={s.error}>{err}</Text>}
      <Button title={busy ? '…' : step === 'email' ? 'Send code' : 'Set password'} onPress={submit} disabled={busy} />
    </AuthScreen>
  );
}
