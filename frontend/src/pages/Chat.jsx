import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, photoUrl } from '../api.js';
import { useMe } from '../me.js';

const OPENERS = ['Hey 👋', 'So… tonight?', 'Drink first?', 'Your place or mine?', 'What are you up to later?'];

const fmt = (iso) =>
  new Date(iso).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export default function Chat() {
  const { id } = useParams();
  const { me } = useMe();
  const nav = useNavigate();
  const [chat, setChat] = useState(null);
  const [text, setText] = useState('');
  const [planning, setPlanning] = useState(false);
  const [menu, setMenu] = useState(false);
  const [plan, setPlan] = useState({ place: '', time: '' });
  const bottom = useRef(null);

  const load = () =>
    api(`/matches/${id}`)
      .then(setChat)
      .catch(() => nav('/matches'));

  useEffect(() => {
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [id]);

  // Merge messages and meetup invites into one timeline.
  const timeline = useMemo(() => {
    if (!chat) return [];
    return [...chat.messages.map((m) => ({ ...m, kind: 'msg' })), ...chat.meetups.map((m) => ({ ...m, kind: 'meet' }))].sort(
      (a, b) => a.createdAt - b.createdAt,
    );
  }, [chat]);

  useEffect(() => bottom.current?.scrollIntoView({ behavior: 'smooth' }), [timeline.length]);

  async function send(body) {
    if (!body.trim()) return;
    setText('');
    await api(`/matches/${id}/messages`, { method: 'POST', body: { body } });
    load();
  }

  async function propose(e) {
    e.preventDefault();
    await api(`/matches/${id}/meetups`, { method: 'POST', body: { place: plan.place, time: new Date(plan.time).toISOString() } });
    setPlanning(false);
    setPlan({ place: '', time: '' });
    load();
  }

  async function respond(mid, status) {
    await api(`/matches/${id}/meetups/${mid}`, { method: 'POST', body: { status } });
    load();
  }

  async function safety(action) {
    setMenu(false);
    const u = chat.user;
    if (action === 'unmatch' && confirm(`Unmatch ${u.name}?`)) await api(`/matches/${id}`, { method: 'DELETE' });
    else if (action === 'block' && confirm(`Block ${u.name}? They won't see you again.`)) await api('/block', { method: 'POST', body: { userId: u.id } });
    else if (action === 'report') {
      const reason = prompt(`Why are you reporting ${u.name}?`);
      if (!reason) return;
      await api('/report', { method: 'POST', body: { userId: u.id, reason } });
    } else return;
    nav('/matches');
  }

  if (!chat) return <div className="screen center"><div className="logo">down</div></div>;
  const u = chat.user;

  return (
    <div className="screen chat">
      <header className="chat-head">
        <Link to="/matches" className="back">‹</Link>
        <div className="avatar sm" style={{ backgroundImage: `url(${photoUrl(u.photo)})` }} />
        <div className="row-main">
          <div className="row-title">{u.name}, {u.age} <span className="muted small">@{u.username}</span></div>
          <div className="muted small">
            {u.availableNow ? '● available now · ' : ''}
            {u.county}{u.distanceMi != null && ` · ~${u.distanceMi} mi away`}
          </div>
        </div>
        <button className="icon" onClick={() => setMenu(!menu)}>⋯</button>
        {menu && (
          <div className="menu">
            <button onClick={() => safety('unmatch')}>Unmatch</button>
            <button onClick={() => safety('block')}>Block</button>
            <button className="danger" onClick={() => safety('report')}>Report</button>
          </div>
        )}
      </header>

      <div className="messages">
        {timeline.length === 0 && (
          <div className="empty">
            <p className="muted">You already know why you're both here. Keep it easy.</p>
            <div className="chips center">
              {OPENERS.map((o) => (
                <button key={o} className="chip" onClick={() => send(o)}>{o}</button>
              ))}
            </div>
          </div>
        )}
        {timeline.map((t) =>
          t.kind === 'msg' ? (
            <div key={'m' + t.id} className={`bubble ${t.senderId === me.id ? 'mine' : ''}`}>{t.body}</div>
          ) : (
            <div key={'p' + t.id} className={`meet ${t.status}`}>
              <div className="meet-label">{t.proposerId === me.id ? 'You suggested' : `${u.name} suggested`}</div>
              <div className="meet-place">{t.place}</div>
              <div className="muted">{fmt(t.time)}</div>
              {t.status === 'pending' && t.proposerId !== me.id && (
                <div className="meet-actions">
                  <button className="btn primary sm" onClick={() => respond(t.id, 'accepted')}>I'm down</button>
                  <button className="btn ghost sm" onClick={() => respond(t.id, 'declined')}>Not this time</button>
                </div>
              )}
              {t.status === 'pending' && t.proposerId === me.id && <div className="muted small">Waiting for {u.name}…</div>}
              {t.status === 'accepted' && <div className="meet-ok">It's on ✓ <span className="muted small">Meet in public first & tell a friend.</span></div>}
              {t.status === 'declined' && <div className="muted small">Declined</div>}
            </div>
          ),
        )}
        <div ref={bottom} />
      </div>

      {planning && (
        <form className="plan" onSubmit={propose}>
          <input placeholder="Where? (bar, café, …)" value={plan.place} onChange={(e) => setPlan({ ...plan, place: e.target.value })} required />
          <input type="datetime-local" value={plan.time} onChange={(e) => setPlan({ ...plan, time: e.target.value })} required />
          <div className="meet-actions">
            <button className="btn primary sm">Send invite</button>
            <button type="button" className="btn ghost sm" onClick={() => setPlanning(false)}>Cancel</button>
          </div>
        </form>
      )}

      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
      >
        <button type="button" className="icon meet-btn" onClick={() => setPlanning(!planning)} title="Suggest a meetup">📍</button>
        <input placeholder="Message" value={text} onChange={(e) => setText(e.target.value)} />
        <button className="icon send" disabled={!text.trim()}>↑</button>
      </form>
    </div>
  );
}
