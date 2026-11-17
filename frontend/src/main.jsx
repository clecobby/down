import React, { useCallback, useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { getCurrentUser, signOut } from 'aws-amplify/auth';
import './cognito.js';
import { api } from './api.js';
import { MeContext } from './me.js';
import Welcome from './pages/Welcome.jsx';
import Auth from './pages/Auth.jsx';
import Confirm from './pages/Confirm.jsx';
import Reset from './pages/Reset.jsx';
import Setup from './pages/Setup.jsx';
import Discover from './pages/Discover.jsx';
import Matches from './pages/Matches.jsx';
import Chat from './pages/Chat.jsx';
import Profile from './pages/Profile.jsx';
import './styles.css';

function App() {
  // loading → out (no Cognito session) | setup (signed in, no profile yet) | in
  const [status, setStatus] = useState('loading');
  const [me, setMeState] = useState(null);

  const setMe = (u) => {
    setMeState(u);
    setStatus(u ? 'in' : 'out');
  };

  const refresh = useCallback(async () => {
    try {
      await getCurrentUser();
    } catch {
      return setMe(null);
    }
    try {
      setMe(await api('/me'));
    } catch (e) {
      if (e.data?.needsProfile) setStatus('setup');
      else {
        await signOut().catch(() => {});
        setMe(null);
      }
    }
  }, []);

  const logout = async () => {
    await signOut().catch(() => {});
    setMe(null);
  };

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (status === 'loading') return <div className="screen center"><div className="logo">down</div></div>;

  const only = (s, el, fallback) => (status === s ? el : <Navigate to={fallback} replace />);
  const home = status === 'in' ? '/discover' : status === 'setup' ? '/setup' : '/';

  return (
    <MeContext.Provider value={{ me, setMe, refresh, logout }}>
      <Routes>
        <Route path="/" element={only('out', <Welcome />, home)} />
        <Route path="/signup" element={only('out', <Auth mode="signup" />, home)} />
        <Route path="/login" element={only('out', <Auth mode="login" />, home)} />
        <Route path="/confirm" element={only('out', <Confirm />, home)} />
        <Route path="/reset" element={only('out', <Reset />, home)} />
        <Route path="/setup" element={only('setup', <Setup />, home)} />
        <Route path="/discover" element={only('in', <Discover />, home)} />
        <Route path="/matches" element={only('in', <Matches />, home)} />
        <Route path="/chat/:id" element={only('in', <Chat />, home)} />
        <Route path="/profile" element={only('in', <Profile />, home)} />
        <Route path="*" element={<Navigate to={home} replace />} />
      </Routes>
    </MeContext.Provider>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>,
);
