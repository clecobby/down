import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, photoUrl } from '../api.js';
import Nav from '../components/Nav.jsx';

const ago = (t) => {
  const m = Math.floor((Date.now() - t) / 60000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  if (m < 1440) return `${Math.floor(m / 60)}h`;
  return `${Math.floor(m / 1440)}d`;
};

export default function Matches() {
  const [list, setList] = useState(null);

  useEffect(() => {
    const load = () => api('/matches').then(setList).catch(() => setList([]));
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);

  const fresh = list?.filter((m) => !m.lastMessage) || [];
  const talking = list?.filter((m) => m.lastMessage) || [];

  return (
    <div className="screen app">
      <header className="top-bar"><div className="logo">down</div></header>
      <div className="scroll">
        {list?.length === 0 && (
          <div className="empty">
            <h2>No matches yet.</h2>
            <p className="muted">Swipe right on people you're down with.</p>
          </div>
        )}

        {fresh.length > 0 && (
          <>
            <h3 className="section">New</h3>
            <div className="fresh-row">
              {fresh.map((m) => (
                <Link key={m.id} to={`/chat/${m.id}`} className="fresh">
                  <div className="avatar lg" style={{ backgroundImage: `url(${photoUrl(m.user.photo)})` }} />
                  <span>{m.user.name}</span>
                </Link>
              ))}
            </div>
          </>
        )}

        {talking.length > 0 && <h3 className="section">Talking</h3>}
        {talking.map((m) => (
          <Link key={m.id} to={`/chat/${m.id}`} className="row">
            <div className="avatar" style={{ backgroundImage: `url(${photoUrl(m.user.photo)})` }} />
            <div className="row-main">
              <div className="row-title">
                {m.user.name}
                {m.user.availableNow && <em className="now">●</em>}
              </div>
              <div className="muted ellipsis">{m.lastMessage}</div>
            </div>
            <div className="muted small">{ago(m.lastAt)}</div>
          </Link>
        ))}
      </div>
      <Nav />
    </div>
  );
}
