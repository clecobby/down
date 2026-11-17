import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { autoSignIn, confirmSignUp, resendSignUpCode } from 'aws-amplify/auth';
import { authMessage } from '../cognito.js';
import { useMe } from '../me.js';

// Enter the 6-digit code Cognito emailed after signup.
export default function Confirm() {
  const { state } = useLocation();
  const { refresh } = useMe();
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [note, setNote] = useState(state?.resend ? '' : `We sent a code to ${state?.email}.`);
  const [busy, setBusy] = useState(false);
  const [needLogin, setNeedLogin] = useState(false);

  // Coming from login with an unconfirmed account: send a fresh code.
  useEffect(() => {
    if (state?.resend && state.email)
      resendSignUpCode({ username: state.email })
        .then(() => setNote(`Your email isn't confirmed yet. We sent a new code to ${state.email}.`))
        .catch((e) => setErr(authMessage(e)));
  }, [state]);

  if (!state?.email) return <Navigate to="/signup" replace />;

  async function submit(e) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      const { nextStep } = await confirmSignUp({ username: state.email, confirmationCode: code.trim() });
      if (nextStep.signUpStep === 'COMPLETE_AUTO_SIGN_IN') {
        await autoSignIn();
        await refresh();
      } else setNeedLogin(true);
    } catch (e) {
      setErr(authMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setErr('');
    try {
      await resendSignUpCode({ username: state.email });
      setNote(`New code sent to ${state.email}.`);
    } catch (e) {
      setErr(authMessage(e));
    }
  }

  if (needLogin)
    return (
      <div className="screen form-screen">
        <Link to="/" className="logo">down</Link>
        <h1>You're in.</h1>
        <p className="muted">Email confirmed. Log in to set up your profile.</p>
        <Link className="btn primary" to="/login">Log in</Link>
      </div>
    );

  return (
    <div className="screen form-screen">
      <Link to="/" className="logo">down</Link>
      <h1>Check your email.</h1>
      {note && <p className="muted">{note}</p>}
      <form onSubmit={submit} className="form">
        <input
          className="code-input"
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="123456"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          required
        />
        {err && <div className="error">{err}</div>}
        <button className="btn primary" disabled={busy || code.length < 6}>{busy ? '…' : 'Confirm'}</button>
        <button type="button" className="link center-link" onClick={resend}>Send a new code</button>
      </form>
    </div>
  );
}
