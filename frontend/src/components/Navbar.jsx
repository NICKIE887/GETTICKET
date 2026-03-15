import { Link } from "react-router-dom";
import { getToken, setToken } from "../api";

export default function Navbar() {
  const token = getToken();

  const handleLogout = () => {
    setToken(null);
    window.location.href = "/";
  };

  return (
    <header className="nav">
      <div className="nav__brand">
        <Link to="/">Evently</Link>
      </div>
      <nav className="nav__links">
        <Link to="/">Events</Link>
        <Link to="/create-event">Create Event</Link>
        <Link to="/tickets">My Tickets</Link>
        {token ? (
          <button className="btn btn--ghost" type="button" onClick={handleLogout}>
            Logout
          </button>
        ) : (
          <Link to="/login">Login</Link>
        )}
      </nav>
    </header>
  );
}