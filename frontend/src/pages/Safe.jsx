import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { API } from '../api.js';

// Public page a down user sends a friend: follow their location during a meetup. No login.
// Shows their first name and where they last were; refreshes every 10 seconds.
const ago = (t) => {
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return `${s} seconds ago`;
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min ago` : `${Math.floor(m / 60)} h ${m % 60} min ago`;
};

function mapUrl({ lat, lng }) {
  const d = 0.006;
  const bbox = [lng - d, lat - d, lng + d, lat + d].map((n) => n.toFixed(5)).join(',');
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat.toFixed(6)},${lng.toFixed(6)}`;
}

export default function Safe() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch(`${API}/api/safe/${encodeURIComponent(token)}`, { cache: 'no-store' });
        const body = await r.json().catch(() => ({}));
        if (!alive) return;
        if (!r.ok) return setError(body.error || 'This link has ended');
        setError('');
        setData(body);
      } catch {
        if (alive) setError("Can't reach down right now. Retrying…");
      }
    };
    load();
    const t = setInterval(load, 10_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [token]);

  if (error && !data)
    return (
      <div className="screen form-screen">
        <div className="logo">down</div>
        <h1>{error}</h1>
        <p className="muted">Location links stop working when the person turns them off or after 6 hours.</p>
      </div>
    );
  if (!data) return <div className="screen center"><div className="logo">down</div></div>;

  const last = data.last;
  return (
    <div className="screen safe-screen">
      <div className="logo">down</div>
      <h1>{data.name}'s location</h1>
      {data.sos && (
        <div className="safe-sos">
          ⚠️ {data.name} sent an SOS {ago(data.sos)}. If you think they're in danger, call 911 and give them this location.
        </div>
      )}
      {last ? (
        <>
          <p className="muted">
            Updated {ago(last.at)}
            {last.acc ? ` · accurate to about ${Math.round(last.acc * 3.28)} ft` : ''}
          </p>
          <iframe className="safe-map" title={`${data.name}'s location`} src={mapUrl(last)} />
          <p>
            <a className="btn primary" href={`https://maps.apple.com/?q=${last.lat},${last.lng}`} target="_blank" rel="noreferrer">
              Open in Maps
            </a>
          </p>
        </>
      ) : (
        <p className="muted">No location yet. It appears once {data.name}'s phone sends it (the app needs to be open).</p>
      )}
      {error && <p className="muted small">{error}</p>}
      <p className="muted small">
        {data.name} chose to share this with you. It stops when they turn it off, or at{' '}
        {new Date(data.expiresAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.
      </p>
    </div>
  );
}
