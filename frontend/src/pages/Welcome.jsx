import { Link } from 'react-router-dom';

export default function Welcome() {
  return (
    <div className="screen welcome">
      <div className="logo big">down</div>
      <p className="tagline">
        Everyone here wants the same thing.
        <br />
        <span className="accent">Skip the guessing.</span>
      </p>
      <div className="stack">
        <Link className="btn primary" to="/signup">I'm down</Link>
        <Link className="btn ghost" to="/login">I have an account</Link>
      </div>
      <p className="fine">18+ only. Consent always. Respect is the only rule.</p>
    </div>
  );
}
