import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useMe } from '../me.js';

const GENDERS = [
  ['woman', 'Woman'],
  ['man', 'Man'],
  ['nonbinary', 'Non-binary'],
];
const LOOKING = ['Tonight', 'Casual', 'Ongoing', 'Dates', 'Not sure'];

// First run after confirming the account: create the dating profile.
export default function Setup() {
  const { setMe, logout } = useMe();
  const [f, setF] = useState({ name: '', username: '', birthdate: '', gender: '', interestedIn: [], lookingFor: '', heightCm: '', bio: '' });
  const [uCheck, setUCheck] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const toggle = (g) => setF({ ...f, interestedIn: f.interestedIn.includes(g) ? f.interestedIn.filter((x) => x !== g) : [...f.interestedIn, g] });

  // Live username check, debounced.
  useEffect(() => {
    if (!f.username) return;
    const t = setTimeout(() => api(`/username-available?u=${encodeURIComponent(f.username)}`).then(setUCheck).catch(() => {}), 350);
    return () => clearTimeout(t);
  }, [f.username]);
  const check = uCheck?.username === f.username ? uCheck : null;

  // Location: idle | asking | ok | denied. Matching is by county, so we ask up front and explain why.
  const [loc, setLoc] = useState({ state: 'idle' });
  const askLocation = () => {
    if (!navigator.geolocation) return setLoc({ state: 'denied' });
    setLoc({ state: 'asking' });
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => setLoc({ state: 'ok', lat: coords.latitude, lng: coords.longitude }),
      () => setLoc({ state: 'denied' }),
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 10 * 60 * 1000 },
    );
  };

  async function submit(e) {
    e.preventDefault();
    if (!f.gender) return setErr('Pick how you identify');
    if (!f.interestedIn.length) return setErr('Pick who you want to meet');
    if (!f.lookingFor) return setErr("Pick what you're looking for");
    if (loc.state === 'idle' || loc.state === 'asking') return setErr('Share your location so we can show people near you');
    setErr('');
    setBusy(true);
    try {
      let me = await api('/profile', { method: 'POST', body: f });
      if (loc.state === 'ok') me = await api('/me/location', { method: 'POST', body: { lat: loc.lat, lng: loc.lng } }).catch(() => me);
      setMe(me);
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  }

  return (
    <div className="screen form-screen">
      <div className="logo">down</div>
      <h1>About you.</h1>
      <form onSubmit={submit} className="form">
        <input placeholder="First name" value={f.name} onChange={set('name')} maxLength={40} required />
        <div className="at-input">
          <span>@</span>
          <input
            placeholder="username"
            value={f.username}
            onChange={(e) => setF({ ...f, username: e.target.value.toLowerCase().replace(/\s/g, '') })}
            autoCapitalize="none"
            autoCorrect="off"
            maxLength={20}
            required
          />
        </div>
        {check ? (
          <div className={`hint ${check.available ? 'ok' : 'error'}`}>{check.available ? `@${check.username} is yours` : check.error}</div>
        ) : (
          <div className="hint muted">3–20 characters: letters, numbers, . and _</div>
        )}

        <label className="label">Birthday</label>
        <input type="date" value={f.birthdate} onChange={set('birthdate')} required />

        <label className="label">I am</label>
        <div className="chips">
          {GENDERS.map(([v, l]) => (
            <button type="button" key={v} className={`chip ${f.gender === v ? 'on' : ''}`} onClick={() => setF({ ...f, gender: v })}>{l}</button>
          ))}
        </div>

        <label className="label">Into</label>
        <div className="chips">
          {GENDERS.map(([v, l]) => (
            <button type="button" key={v} className={`chip ${f.interestedIn.includes(v) ? 'on' : ''}`} onClick={() => toggle(v)}>{l}</button>
          ))}
        </div>

        <label className="label">Looking for</label>
        <div className="chips">
          {LOOKING.map((v) => (
            <button type="button" key={v} className={`chip ${f.lookingFor === v ? 'on' : ''}`} onClick={() => setF({ ...f, lookingFor: v })}>{v}</button>
          ))}
        </div>

        <label className="label">Height (cm) <span className="muted small">optional</span></label>
        <input type="number" min="120" max="230" placeholder="e.g. 175" value={f.heightCm} onChange={set('heightCm')} />

        <label className="label">About you <span className="muted small">optional</span></label>
        <textarea placeholder="A line about what you're into" value={f.bio} onChange={set('bio')} maxLength={300} rows={3} />

        <label className="label">Where you are</label>
        <button type="button" className={`now-toggle ${loc.state === 'ok' ? 'on' : ''}`} onClick={askLocation} disabled={loc.state === 'asking'}>
          <span>
            <strong>{loc.state === 'ok' ? '📍 Location on' : loc.state === 'asking' ? 'Finding you…' : '📍 Share my location'}</strong>
            <span className="muted small">
              {loc.state === 'denied'
                ? "Location is blocked. Allow it in your browser settings to see people near you — or continue without it."
                : 'We match you with people in your county. Others only see your county and a rough distance — never your exact spot.'}
            </span>
          </span>
          <i />
        </button>

        {err && <div className="error">{err}</div>}
        <button className="btn primary" disabled={busy}>{busy ? '…' : "Let's go"}</button>
        <button type="button" className="link center-link" onClick={logout}>Log out</button>
      </form>
    </div>
  );
}
