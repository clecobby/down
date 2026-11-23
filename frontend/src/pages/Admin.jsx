import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, photoUrl } from '../api.js';

// Admin dashboard. The API refuses anyone outside the Cognito "admins" group, whatever this page shows.
const TABS = ['Overview', 'Users', 'Reports', 'Safety', 'Settings', 'Log'];

const ago = (t) => {
  if (!t) return '—';
  const m = Math.floor((Date.now() - t) / 60000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.floor(m / 60)}h ago`;
  return `${Math.floor(m / 1440)}d ago`;
};
const when = (t) => (t ? new Date(t).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');

export default function Admin() {
  // The open tab lives in the URL (?tab=users), so a refresh keeps your place.
  const [params, setParams] = useSearchParams();
  const tab = TABS.find((t) => t.toLowerCase() === params.get('tab')) || 'Overview';
  const setTab = (t) => setParams(t === 'Overview' ? {} : { tab: t.toLowerCase() });
  const [openUser, setOpenUser] = useState(null);
  const [openTrail, setOpenTrail] = useState(null); // 'report:12' | 'sos:3'

  return (
    <div className="admin">
      <header className="admin-head">
        <div className="logo">down</div>
        <span className="admin-badge">Admin</span>
        <nav className="admin-tabs">
          {TABS.map((t) => (
            <button key={t} className={t === tab ? 'on' : ''} onClick={() => setTab(t)}>
              {t}
            </button>
          ))}
        </nav>
        <Link to="/discover" className="link">Back to app</Link>
      </header>
      <main className="admin-main">
        {tab === 'Overview' && <Overview />}
        {tab === 'Users' && <Users onOpen={setOpenUser} />}
        {tab === 'Reports' && <Reports onOpen={setOpenUser} onTrail={setOpenTrail} />}
        {tab === 'Safety' && <Safety onOpen={setOpenUser} onTrail={setOpenTrail} />}
        {tab === 'Settings' && <Settings />}
        {tab === 'Log' && <Log />}
      </main>
      {openUser && <UserPanel id={openUser} onClose={() => setOpenUser(null)} />}
      {openTrail && <TrailPanel caseRef={openTrail} onClose={() => setOpenTrail(null)} />}
    </div>
  );
}

// ---------- overview ----------

function Tile({ label, value, sub, alert }) {
  return (
    <div className={`tile ${alert ? 'alert' : ''}`}>
      <div className="tile-label">{label}</div>
      <div className="tile-value">{value}</div>
      {sub && <div className="tile-sub">{sub}</div>}
    </div>
  );
}

const delta = (cur, prev) => {
  if (!prev) return cur ? `+${cur} vs previous 7 days` : 'none in previous 7 days';
  const d = cur - prev;
  return `${d >= 0 ? '+' : '−'}${Math.abs(d)} vs previous 7 days`;
};

function Overview() {
  const [s, setS] = useState(null);
  useEffect(() => {
    const load = () => api('/admin/stats').then(setS).catch(() => {});
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);
  if (!s) return <p className="muted">Loading…</p>;

  return (
    <>
      <div className="tiles">
        <Tile label="Real users" value={s.realUsers} sub={`+${s.signups24h} today`} />
        <Tile label="Signups, 7 days" value={s.signups7d} sub={delta(s.signups7d, s.signupsPrev7d)} />
        <Tile label="Active, 24h" value={s.active24h} sub={`of ${s.realUsers} real users`} />
        <Tile label="Swipes, 24h" value={s.swipes24h} sub={`${s.likes24h} likes`} />
        <Tile label="Matches" value={s.matchesTotal} sub={`+${s.matches24h} today`} />
        <Tile label="Messages, 24h" value={s.messages24h} sub={`${s.meetupsAccepted} meetups agreed (all time)`} />
        <Tile
          label="Open reports"
          value={s.openReports}
          sub={s.openReports ? '⚠ Needs review' : '✓ Queue clear'}
          alert={s.openReports > 0}
        />
        <Tile label="Incomplete profiles" value={s.noPhoto} sub={`no photo · ${s.noLocation} without location`} />
      </div>
      <p className="muted small">
        {s.demoProfiles} demo profiles · {s.suspended} suspended. Refreshes every 15 seconds.
      </p>
      <div className="charts">
        <BarChart title="New signups per day" data={s.daily} field="signups" />
        <BarChart title="Swipes per day" data={s.daily} field="swipes" />
      </div>
    </>
  );
}

// One series per chart (signups and swipes differ in scale, so they never share an axis).
function BarChart({ title, data, field }) {
  const [hover, setHover] = useState(null);
  const [table, setTable] = useState(false);
  const W = 560, H = 180, padL = 32, padB = 22, padT = 10;
  const max = Math.max(1, ...data.map((d) => d[field]));
  const step = (W - padL) / data.length;
  const barW = Math.max(4, step - 6);
  const y = (v) => padT + (H - padT - padB) * (1 - v / max);
  const label = (day) => new Date(day + 'T00:00:00Z').toLocaleDateString([], { day: 'numeric', month: 'short', timeZone: 'UTC' });

  return (
    <figure className="chart">
      <figcaption>
        <span>{title} <span className="muted">· last 14 days</span></span>
        <button className="link" onClick={() => setTable(!table)}>{table ? 'Show chart' : 'Show table'}</button>
      </figcaption>
      {table ? (
        <table className="admin-table compact">
          <tbody>
            {data.map((d) => (
              <tr key={d.day}><td>{label(d.day)}</td><td className="num">{d[field]}</td></tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="chart-wrap">
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}, last 14 days`} onMouseLeave={() => setHover(null)}>
            {[0, max].map((v) => (
              <g key={v}>
                <line x1={padL} x2={W} y1={y(v)} y2={y(v)} className="grid" />
                <text x={padL - 6} y={y(v) + 4} className="axis" textAnchor="end">{v}</text>
              </g>
            ))}
            {data.map((d, i) => {
              const x = padL + i * step + (step - barW) / 2;
              const v = d[field];
              return (
                <g key={d.day} onMouseEnter={() => setHover(i)}>
                  {/* Hit target is the whole column, bigger than the bar. */}
                  <rect x={padL + i * step} y={padT} width={step} height={H - padT - padB} fill="transparent" />
                  {v > 0 && (
                    <path
                      className={`bar ${hover === i ? 'on' : ''}`}
                      d={`M${x},${y(0)} V${y(v) + 4} Q${x},${y(v)} ${x + 4},${y(v)} H${x + barW - 4} Q${x + barW},${y(v)} ${x + barW},${y(v) + 4} V${y(0)} Z`}
                    />
                  )}
                </g>
              );
            })}
            <text x={padL} y={H - 4} className="axis">{label(data[0].day)}</text>
            <text x={W} y={H - 4} className="axis" textAnchor="end">{label(data[data.length - 1].day)}</text>
          </svg>
          {hover != null && (
            <div className="tooltip" style={{ left: `${((padL + (hover + 0.5) * step) / W) * 100}%` }}>
              <strong>{data[hover][field]}</strong> {field} · {label(data[hover].day)}
            </div>
          )}
        </div>
      )}
    </figure>
  );
}

// ---------- users ----------

function Users({ onOpen }) {
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('real');
  const [data, setData] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => api(`/admin/users?kind=${kind}&q=${encodeURIComponent(q)}&limit=100`).then(setData).catch(() => {}), 250);
    return () => clearTimeout(t);
  }, [q, kind]);

  return (
    <>
      <div className="admin-filters">
        <input placeholder="Search username, name or email" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="chips">
          {['real', 'demo', 'suspended', 'all'].map((k) => (
            <button key={k} className={`chip ${kind === k ? 'on' : ''}`} onClick={() => setKind(k)}>{k[0].toUpperCase() + k.slice(1)}</button>
          ))}
        </div>
      </div>
      {!data ? (
        <p className="muted">Loading…</p>
      ) : (
        <>
          <p className="muted small">{data.total} {data.total === 1 ? 'person' : 'people'}{data.total > data.users.length ? `, showing ${data.users.length}` : ''}</p>
          <div className="table-scroll">
            <table className="admin-table">
              <thead>
                <tr><th>Person</th><th>Age</th><th>Area</th><th>Status</th><th>Joined</th><th>Last active</th></tr>
              </thead>
              <tbody>
                {data.users.map((u) => (
                  <tr key={u.id} onClick={() => onOpen(u.id)} className="clickable">
                    <td>
                      <div className="person">
                        <div className="avatar sm" style={{ backgroundImage: u.photo ? `url(${photoUrl(u.photo)})` : undefined }} />
                        <div>
                          <div>{u.name} <span className="muted">@{u.username}</span></div>
                          {u.email && <div className="muted small">{u.email}</div>}
                        </div>
                      </div>
                    </td>
                    <td>{u.age} · {u.gender === 'nonbinary' ? 'NB' : u.gender[0].toUpperCase()}</td>
                    <td>{u.county ? `${u.county}${u.country ? `, ${u.country}` : ''}` : <span className="muted">no location</span>}</td>
                    <td><Badges u={u} /></td>
                    <td className="muted">{ago(u.createdAt)}</td>
                    <td className="muted">{ago(u.lastActive)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.users.length === 0 && <p className="muted">Nobody matches.</p>}
        </>
      )}
    </>
  );
}

function Badges({ u }) {
  return (
    <div className="badges">
      {u.banned && <span className="badge danger">⛔ Suspended</span>}
      {u.openReports > 0 && <span className="badge danger">⚑ {u.openReports} report{u.openReports > 1 ? 's' : ''}</span>}
      {u.demo && <span className="badge">Demo</span>}
      {!u.banned && !u.demo && !u.openReports && <span className="badge ok">✓ Active</span>}
    </div>
  );
}

function UserPanel({ id, onClose }) {
  const [u, setU] = useState(null);
  const [msg, setMsg] = useState('');
  const load = useCallback(() => api(`/admin/users/${id}`).then(setU).catch((e) => setMsg(e.message)), [id]);
  useEffect(() => {
    load();
  }, [load]);

  const act = async (path, method = 'POST', body) => {
    try {
      const r = await api(path, { method, body });
      setMsg(r.login && r.login !== 'ok' ? `Done. Note: ${r.login}.` : 'Done.');
      if (method === 'DELETE') return setTimeout(onClose, 800);
      load();
    } catch (e) {
      setMsg(e.message);
    }
  };
  const suspend = () => {
    const reason = prompt(`Why are you suspending @${u.username}?`);
    if (reason !== null) act(`/admin/users/${id}/suspend`, 'POST', { reason });
  };
  const remove = () => confirm(`Delete @${u.username} permanently? Their profile, photos, matches and messages are removed.`) && act(`/admin/users/${id}`, 'DELETE');

  return (
    <div className="panel-backdrop" onClick={onClose}>
      <aside className="panel" onClick={(e) => e.stopPropagation()}>
        <button className="link panel-close" onClick={onClose}>Close ✕</button>
        {!u ? (
          <p className="muted">{msg || 'Loading…'}</p>
        ) : (
          <>
            <div className="panel-photos">
              {u.photos.length ? u.photos.map((p) => <img key={p} src={photoUrl(p)} alt="" />) : <div className="muted">No photos</div>}
            </div>
            <h2>{u.name}, {u.age} <span className="muted">@{u.username}</span></h2>
            <Badges u={{ ...u, openReports: u.reports.filter((r) => r.status === 'open').length }} />
            {u.banned && <p className="muted small">Reason: {u.bannedReason}</p>}
            <dl className="facts">
              {u.email && <><dt>Email</dt><dd>{u.email}</dd></>}
              <dt>Gender</dt><dd>{u.gender} · into {u.interestedIn.join(', ')}</dd>
              <dt>Area</dt><dd>{u.county ? `${u.county}, ${u.region}, ${u.country}` : 'No location'}</dd>
              <dt>Joined</dt><dd>{when(u.createdAt)}</dd>
              <dt>Last active</dt><dd>{ago(u.lastActive)}</dd>
              {u.tags.length > 0 && <><dt>Tags</dt><dd>{u.tags.join(', ')}</dd></>}
              {u.bio && <><dt>Bio</dt><dd>{u.bio}</dd></>}
            </dl>
            <div className="mini-stats">
              {Object.entries({ Swipes: u.activity.swipes, 'Likes given': u.activity.likesGiven, 'Likes received': u.activity.likesReceived, Matches: u.activity.matches, 'Messages sent': u.activity.messagesSent, 'Reports made': u.activity.reportsMade }).map(([k, v]) => (
                <div key={k}><strong>{v}</strong><span className="muted small">{k}</span></div>
              ))}
            </div>
            {u.reports.length > 0 && (
              <>
                <h3>Reports about them</h3>
                {u.reports.map((r) => (
                  <div key={r.id} className="report-line">
                    <span>“{r.reason}”</span>
                    <span className="muted small">by @{r.reporter} · {when(r.created_at)} · {r.status}</span>
                  </div>
                ))}
              </>
            )}
            {msg && <p className="admin-msg">{msg}</p>}
            <div className="panel-actions">
              {u.banned ? (
                <button className="btn ghost sm" onClick={() => act(`/admin/users/${id}/restore`)}>Restore account</button>
              ) : (
                <button className="btn primary sm" onClick={suspend}>Suspend</button>
              )}
              <button className="btn ghost sm danger" onClick={remove}>Delete</button>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}

// ---------- reports ----------

function Reports({ onOpen, onTrail }) {
  const [status, setStatus] = useState('open');
  const [list, setList] = useState(null);
  const load = useCallback(() => api(`/admin/reports?status=${status}`).then(setList).catch(() => setList([])), [status]);
  useEffect(() => {
    load();
  }, [load]);

  const resolve = async (r, action) => {
    if (action === 'suspend' && !confirm(`Suspend @${r.reported}?`)) return;
    await api(`/admin/reports/${r.id}`, { method: 'POST', body: { action } }).catch((e) => alert(e.message));
    load();
  };

  return (
    <>
      <div className="chips admin-filters">
        {['open', 'actioned', 'dismissed'].map((s) => (
          <button key={s} className={`chip ${status === s ? 'on' : ''}`} onClick={() => setStatus(s)}>{s[0].toUpperCase() + s.slice(1)}</button>
        ))}
      </div>
      {!list ? (
        <p className="muted">Loading…</p>
      ) : list.length === 0 ? (
        <p className="muted">{status === 'open' ? '✓ No open reports.' : 'Nothing here.'}</p>
      ) : (
        <div className="report-cards">
          {list.map((r) => (
            <div key={r.id} className="report-card">
              <div>
                <button className="link strong" onClick={() => onOpen(r.reported_id)}>{r.reported_name} @{r.reported}</button>
                {r.reported_banned ? <span className="badge danger">⛔ Suspended</span> : null}
                {r.reported_total > 1 && <span className="badge danger">⚑ {r.reported_total} reports total</span>}
              </div>
              <p>“{r.reason}”</p>
              <p className="muted small">Reported by @{r.reporter} · {when(r.created_at)}{r.resolved_at ? ` · resolved ${when(r.resolved_at)}` : ''}</p>
              {status === 'open' && (
                <div className="panel-actions">
                  <button className="btn primary sm" onClick={() => resolve(r, 'suspend')}>Suspend them</button>
                  <button className="btn ghost sm" onClick={() => resolve(r, 'dismiss')}>Dismiss</button>
                  {r.held_points > 0 && (
                    <button className="btn ghost sm" onClick={() => onTrail(`report:${r.id}`)}>📍 Location trail ({r.held_points})</button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ---------- safety ----------

function Safety({ onOpen, onTrail }) {
  const [list, setList] = useState(null);
  const load = useCallback(() => api('/admin/safety').then((r) => setList(r.sos)).catch(() => setList([])), []);
  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  const resolve = async (a) => {
    if (!confirm(`Resolve SOS #${a.id}? Its location trail goes back to normal 24-hour deletion.`)) return;
    await api(`/admin/sos/${a.id}/resolve`, { method: 'POST' }).catch((e) => alert(e.message));
    load();
  };

  return (
    <>
      <p className="muted small">
        SOS alerts from the app. Location trails are encrypted; opening one is written to the Log. Reports with a held trail show a 📍 button on the Reports tab.
      </p>
      {!list ? (
        <p className="muted">Loading…</p>
      ) : list.length === 0 ? (
        <p className="muted">✓ No open SOS alerts.</p>
      ) : (
        <div className="report-cards">
          {list.map((a) => (
            <div key={a.id} className="report-card">
              <div>
                <span className="badge danger">SOS #{a.id}</span>{' '}
                <button className="link strong" onClick={() => onOpen(a.user.id)}>{a.user.name} @{a.user.username}</button>
                {a.status === 'cancelled' && <span className="badge">Cancelled by user</span>}
              </div>
              <p className="muted small">
                {when(a.createdAt)} ({ago(a.createdAt)})
                {a.other && <> · was meeting <button className="link" onClick={() => onOpen(a.other.id)}>@{a.other.username}</button></>}
              </p>
              <div className="panel-actions">
                <button className="btn primary sm" onClick={() => onTrail(a.ref)}>📍 Location trail ({a.points})</button>
                <button className="btn ghost sm" onClick={() => resolve(a)}>Resolve</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function TrailPanel({ caseRef, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api(`/admin/safety/trail?ref=${encodeURIComponent(caseRef)}`).then(setData).catch((e) => setError(e.message));
  }, [caseRef]);
  const osm = (p) => `https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lng}#map=17/${p.lat}/${p.lng}`;

  return (
    <div className="panel-backdrop" onClick={onClose}>
      <aside className="panel" onClick={(e) => e.stopPropagation()}>
        <button className="link panel-close" onClick={onClose}>Close ✕</button>
        <h2>Location trail · {caseRef}</h2>
        <p className="muted small">This view is recorded in the Log.</p>
        {error ? (
          <p className="muted">{error}</p>
        ) : !data ? (
          <p className="muted">Loading…</p>
        ) : data.people.length === 0 ? (
          <p className="muted">No location points are held for this case.</p>
        ) : (
          data.people.map((p) => (
            <div key={p.userId}>
              <h3>{p.name} @{p.username} · {p.points.length} points</h3>
              <table className="trail-table">
                <thead>
                  <tr><th>Time</th><th>Where</th><th>±</th><th></th></tr>
                </thead>
                <tbody>
                  {[...p.points].reverse().map((pt) => (
                    <tr key={pt.at + pt.kind}>
                      <td>{when(pt.at)}</td>
                      <td><a href={osm(pt)} target="_blank" rel="noreferrer">{pt.lat.toFixed(5)}, {pt.lng.toFixed(5)}</a></td>
                      <td>{pt.acc != null ? `${pt.acc} m` : ''}</td>
                      <td>{pt.kind === 'sos' ? <span className="badge danger">SOS</span> : null}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))
        )}
      </aside>
    </div>
  );
}

// ---------- settings & log ----------

function Settings() {
  const [s, setS] = useState(null);
  useEffect(() => {
    api('/admin/settings').then(setS).catch(() => {});
  }, []);
  if (!s) return <p className="muted">Loading…</p>;
  const toggle = async () => setS(await api('/admin/settings', { method: 'PATCH', body: { demoMode: !s.demoMode } }));

  return (
    <div className="settings">
      <button className={`now-toggle ${s.demoMode ? 'on' : ''}`} onClick={toggle}>
        <span>
          <strong>Demo mode</strong>
          <span className="muted small">
            For testing: demo profiles never run out, ignore distance, and liking one is always a match. Turn off before real users arrive — it changes
            what everyone sees.
          </span>
        </span>
        <i />
      </button>
    </div>
  );
}

function Log() {
  const [list, setList] = useState(null);
  useEffect(() => {
    api('/admin/log').then(setList).catch(() => setList([]));
  }, []);
  if (!list) return <p className="muted">Loading…</p>;
  if (!list.length) return <p className="muted">No admin actions yet.</p>;
  return (
    <div className="table-scroll">
      <table className="admin-table">
        <thead><tr><th>When</th><th>Admin</th><th>Action</th><th>Detail</th></tr></thead>
        <tbody>
          {list.map((l) => (
            <tr key={l.id}><td className="muted">{when(l.created_at)}</td><td>{l.admin}</td><td>{l.action}</td><td className="muted">{l.detail}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
