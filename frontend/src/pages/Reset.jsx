import { useState } from 'react';
import { Link } from 'react-router-dom';
import { confirmResetPassword, resetPassword } from 'aws-amplify/auth';
import { authMessage } from '../cognito.js';

// Forgot password: email → code + new password.
export default function Reset() {
  const [step, setStep] = useState('email'); // email | code | done
  const [f, setF] = useState({ email: '', code: '', password: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    const email = f.email.trim().toLowerCase();
    try {
      if (step === 'email') {
        await resetPassword({ username: email });
        setStep('code');
      } else {
        await confirmResetPassword({ username: email, confirmationCode: f.code.trim(), newPassword: f.password });
        setStep('done');
      }
    } catch (e) {
      setErr(authMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="screen form-screen">
      <Link to="/" className="logo">down</Link>
      <h1>{step === 'done' ? 'All set.' : 'New password.'}</h1>
      {step === 'done' ? (
        <>
          <p className="muted">Your password has been changed.</p>
          <Link className="btn primary" to="/login">Log in</Link>
        </>
      ) : (
        <form onSubmit={submit} className="form">
          <input type="email" placeholder="Email" value={f.email} onChange={set('email')} disabled={step === 'code'} autoComplete="email" required />
          {step === 'code' && (
            <>
              <p className="muted">If that email has an account, we sent it a code.</p>
              <input className="code-input" inputMode="numeric" autoComplete="one-time-code" placeholder="123456" maxLength={6} value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.replace(/\D/g, '') })} required />
              <input type="password" placeholder="New password (10+ chars, Aa, 1)" value={f.password} onChange={set('password')} autoComplete="new-password" minLength={10} required />
            </>
          )}
          {err && <div className="error">{err}</div>}
          <button className="btn primary" disabled={busy}>{busy ? '…' : step === 'email' ? 'Send code' : 'Set password'}</button>
        </form>
      )}
      <p className="fine"><Link to="/login">Back to log in</Link></p>
    </div>
  );
}
