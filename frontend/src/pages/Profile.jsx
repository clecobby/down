import { useState } from 'react';
import { Link } from 'react-router-dom';
import { deleteUser } from 'aws-amplify/auth';
import { api, photoUrl } from '../api.js';
import { useMe } from '../me.js';
import Nav from '../components/Nav.jsx';

const GENDERS = [
  ['woman', 'Women'],
  ['man', 'Men'],
  ['nonbinary', 'Non-binary'],
];

export default function Profile() {
  const { me, setMe, logout } = useMe();
  const [f, setF] = useState({ username: me.username || '', name: me.name, bio: me.bio, city: me.city, interestedIn: me.interestedIn });
  const [msg, setMsg] = useState('');

  const save = async (patch) => {
    try {
      setMe(await api('/me', { method: 'PATCH', body: patch }));
      setMsg('Saved');
    } catch (e) {
      setMsg(e.message);
    }
    setTimeout(() => setMsg(''), 1500);
  };

  const upload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const form = new FormData();
    form.append('photo', file);
    try {
      setMe(await api('/me/photo', { method: 'POST', form }));
    } catch (err) {
      setMsg(err.message);
    }
  };

  const toggle = (g) =>
    setF({ ...f, interestedIn: f.interestedIn.includes(g) ? f.interestedIn.filter((x) => x !== g) : [...f.interestedIn, g] });

  const remove = async () => {
    if (!confirm('Delete your account and everything in it? This cannot be undone.')) return;
    await api('/me', { method: 'DELETE' });
    await deleteUser(); // removes the Cognito account too
    setMe(null);
  };

  return (
    <div className="screen app">
      <header className="top-bar">
        <div className="logo">down</div>
        {msg && <span className="pill">{msg}</span>}
      </header>
      <div className="scroll form">
        <label className="photo-pick" style={{ backgroundImage: me.photo ? `url(${photoUrl(me.photo)})` : undefined }}>
          {!me.photo && <span>+ Add photo</span>}
          <input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={upload} />
        </label>

        <button className={`now-toggle ${me.availableNow ? 'on' : ''}`} onClick={() => save({ availableNow: !me.availableNow })}>
          <span>
            <strong>Available now</strong>
            <span className="muted small">Show up first for people looking tonight</span>
          </span>
          <i />
        </button>

        <label className="label">Username</label>
        <div className="at-input">
          <span>@</span>
          <input value={f.username} maxLength={20} autoCapitalize="none" onChange={(e) => setF({ ...f, username: e.target.value.toLowerCase().replace(/\s/g, '') })} />
        </div>
        <label className="label">Area</label>
        <div className="muted">{me.county ? `${me.county}${me.region && me.region !== me.county ? `, ${me.region}` : ''}` : 'Location off — enable it from Discover'}</div>
        <label className="label">Name</label>
        <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <label className="label">City</label>
        <input value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} placeholder="Where you are" />
        <label className="label">About ({300 - f.bio.length})</label>
        <textarea rows={3} maxLength={300} value={f.bio} onChange={(e) => setF({ ...f, bio: e.target.value })} placeholder="Keep it short. Hint, don't spell it out." />
        <label className="label">Show me</label>
        <div className="chips">
          {GENDERS.map(([v, l]) => (
            <button type="button" key={v} className={`chip ${f.interestedIn.includes(v) ? 'on' : ''}`} onClick={() => toggle(v)}>
              {l}
            </button>
          ))}
        </div>
        <button className="btn primary" onClick={() => save(f)}>Save</button>
        {me.isAdmin && <Link className="btn ghost" to="/admin">Admin dashboard</Link>}
        <button className="btn ghost" onClick={logout}>Log out</button>
        <button className="link danger" onClick={remove}>Delete account</button>
      </div>
      <Nav />
    </div>
  );
}
