import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { signIn, signUp } from 'aws-amplify/auth';
import { authMessage } from '../cognito.js';
import { useMe } from '../me.js';

export default function Auth({ mode }) {
  const { refresh } = useMe();
  const nav = useNavigate();
  const signup = mode === 'signup';
  const [f, setF] = useState({ email: '', password: '', agree: false });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    if (signup && !f.agree) return setErr('Please confirm you are 18+ and agree to the rules');
    setErr('');
    setBusy(true);
    const email = f.email.trim().toLowerCase();
    try {
      if (signup) {
        await signUp({ username: email, password: f.password, options: { userAttributes: { email }, autoSignIn: true } });
        return nav('/confirm', { state: { email } });
      }
      const { nextStep } = await signIn({ username: email, password: f.password });
      if (nextStep.signInStep === 'CONFIRM_SIGN_UP') return nav('/confirm', { state: { email, resend: true } });
      await refresh();
    } catch (e) {
      setErr(authMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="screen form-screen">
      <Link to="/" className="logo">down</Link>
      <h1>{signup ? 'Get in.' : 'Welcome back.'}</h1>
      <form onSubmit={submit} className="form">
        <input type="email" placeholder="Email" value={f.email} onChange={set('email')} autoCapitalize="none" autoComplete="email" required />
        <input
          type="password"
          placeholder={signup ? 'Password (10+ chars, Aa, 1)' : 'Password'}
          value={f.password}
          onChange={set('password')}
          autoComplete={signup ? 'new-password' : 'current-password'}
          required
          minLength={signup ? 10 : undefined}
        />
        {signup && (
          <label className="check">
            <input type="checkbox" checked={f.agree} onChange={(e) => setF({ ...f, agree: e.target.checked })} />
            <span>I'm 18+, I'll respect people's boundaries, and I know a match is an invitation — not a promise.</span>
          </label>
        )}
        {err && <div className="error">{err}</div>}
        <button className="btn primary" disabled={busy}>{busy ? '…' : signup ? 'Create account' : 'Log in'}</button>
        {!signup && <Link to="/reset" className="link center-link">Forgot password?</Link>}
      </form>
      <p className="fine">
        {signup ? <>Already in? <Link to="/login">Log in</Link></> : <>New here? <Link to="/signup">Sign up</Link></>}
      </p>
    </div>
  );
}
