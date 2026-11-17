import { NavLink } from 'react-router-dom';

export default function Nav() {
  return (
    <nav className="nav">
      <NavLink to="/discover">Discover</NavLink>
      <NavLink to="/matches">Matches</NavLink>
      <NavLink to="/profile">Me</NavLink>
    </nav>
  );
}
