import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, photoUrl } from '../api.js';
import { useMe } from '../me.js';
import Nav from '../components/Nav.jsx';

const THRESHOLD = 110;

function Card({ user, top, onSwipe, flingRef }) {
  const [drag, setDrag] = useState({ x: 0, y: 0, active: false });
  const start = useRef(null);
  const [leaving, setLeaving] = useState(null);

  const down = (e) => {
    if (!top) return;
    start.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ x: 0, y: 0, active: true });
  };
  const move = (e) => {
    if (!start.current) return;
    setDrag({ x: e.clientX - start.current.x, y: e.clientY - start.current.y, active: true });
  };
  const up = () => {
    if (!start.current) return;
    start.current = null;
    if (Math.abs(drag.x) > THRESHOLD) fling(drag.x > 0 ? 'like' : 'pass');
    else setDrag({ x: 0, y: 0, active: false });
  };
  const fling = (dir) => {
    setLeaving(dir);
    setTimeout(() => onSwipe(dir), 220);
  };

  // Let the action buttons trigger the same exit animation.
  useEffect(() => {
    if (top) flingRef.current = fling;
  });

  const x = leaving ? (leaving === 'like' ? 600 : -600) : drag.x;
  const style = {
    transform: `translate(${x}px, ${leaving ? drag.y : drag.y * 0.3}px) rotate(${x / 18}deg)`,
    transition: drag.active && !leaving ? 'none' : 'transform .22s ease-out',
  };

  return (
    <div className={`card ${top ? 'top' : ''}`} style={top ? style : undefined} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
      <div className="card-photo" style={{ backgroundImage: user.photo ? `url(${photoUrl(user.photo)})` : undefined }}>
        {!user.photo && <span className="initial">{user.name[0]}</span>}
      </div>
      {top && <div className="stamp like" style={{ opacity: Math.max(0, x / THRESHOLD) }}>DOWN</div>}
      {top && <div className="stamp pass" style={{ opacity: Math.max(0, -x / THRESHOLD) }}>NOPE</div>}
      <div className="card-info">
        <div className="card-name">
          {user.name} <span>{user.age}</span>
          {user.availableNow && <em className="now">● now</em>}
        </div>
        <div className="muted">
          {user.sameCounty ? `In ${user.county}` : user.county}
          {user.distanceKm != null && ` · ${user.distanceKm <= 1 ? '< 1' : `~${user.distanceKm}`} km`}
        </div>
        {user.bio && <p>{user.bio}</p>}
      </div>
    </div>
  );
}

export default function Discover() {
  const { me, setMe } = useMe();
  const [locErr, setLocErr] = useState('');
  const nav = useNavigate();
  const [deck, setDeck] = useState(null);
  const [match, setMatch] = useState(null);
  const flingRef = useRef(null);

  const load = () => api('/discover').then(setDeck).catch(() => setDeck([]));
  // Refresh location on open. The server snaps it to ~1 km and only shares county + rough distance.
  const locate = () =>
    navigator.geolocation?.getCurrentPosition(
      async ({ coords }) => {
        try {
          setMe(await api('/me/location', { method: 'POST', body: { lat: coords.latitude, lng: coords.longitude } }));
          setLocErr('');
          load();
        } catch (e) {
          setLocErr(e.message);
        }
      },
      () => setLocErr('Location is off, so you won\'t see people near you.'),
      { enableHighAccuracy: false, maximumAge: 10 * 60 * 1000, timeout: 10000 },
    );

  useEffect(() => {
    load();
    locate();
  }, []);

  async function swipe(dir) {
    const [user, ...rest] = deck;
    setDeck(rest);
    const r = await api('/swipe', { method: 'POST', body: { userId: user.id, dir } }).catch(() => ({}));
    if (r.match?.isNew) setMatch(r.match); // only celebrate the first time
    if (rest.length < 3) api('/discover').then((more) => setDeck((d) => [...d, ...more.filter((m) => !d.some((x) => x.id === m.id) && m.id !== user.id)]));
  }

  return (
    <div className="screen app">
      <header className="top-bar">
        <div className="logo">down</div>
        {me.county ? <span className="pill quiet">📍 {me.county}</span> : null}
      </header>

      {locErr && !me.hasLocation && (
        <button className="banner" onClick={locate}>
          {locErr} <u>Turn on</u>
        </button>
      )}

      <div className="deck">
        {deck === null && <div className="empty">…</div>}
        {deck?.length === 0 && (
          <div className="empty">
            <h2>That's everyone for now.</h2>
            <p className="muted">New people join all the time. Check back soon.</p>
            <button className="btn ghost" onClick={load}>Refresh</button>
          </div>
        )}
        {deck?.slice(0, 2).reverse().map((u, i, arr) => (
          <Card key={u.id} user={u} top={i === arr.length - 1} onSwipe={swipe} flingRef={flingRef} />
        ))}
      </div>

      {deck?.length > 0 && (
        <div className="actions">
          <button className="round pass" onClick={() => flingRef.current?.('pass')} aria-label="Pass">✕</button>
          <button className="round like" onClick={() => flingRef.current?.('like')} aria-label="Down">♥</button>
        </div>
      )}

      {match && (
        <div className="overlay" onClick={() => setMatch(null)}>
          <div className="match-modal" onClick={(e) => e.stopPropagation()}>
            <div className="match-photo" style={{ backgroundImage: `url(${photoUrl(match.user.photo)})` }} />
            <h1>You're both down.</h1>
            <p className="muted">You and {match.user.name} want the same thing. Say hi.</p>
            <button className="btn primary" onClick={() => nav(`/chat/${match.id}`)}>Start talking</button>
            <button className="btn ghost" onClick={() => setMatch(null)}>Keep looking</button>
          </div>
        </div>
      )}

      <Nav />
    </div>
  );
}
