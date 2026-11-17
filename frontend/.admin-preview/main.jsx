import ReactDOM from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import Admin from '../src/pages/Admin.jsx';
import '../src/styles.css';
ReactDOM.createRoot(document.getElementById('root')).render(<MemoryRouter initialEntries={[location.pathname + location.search]}><Admin /></MemoryRouter>);
setTimeout(() => {
  const vw = document.documentElement.clientWidth;
  const wide = [...document.querySelectorAll('*')].filter((e) => e.getBoundingClientRect().right > vw + 1).slice(0, 8)
    .map((e) => `${e.tagName}.${e.className}:${Math.round(e.getBoundingClientRect().width)}`);
  const pre = document.createElement('pre'); pre.id = 'dbg'; pre.textContent = `vw=${vw} scroll=${document.documentElement.scrollWidth} :: ${wide.join(' | ')}`; document.body.append(pre);
}, 1500);
