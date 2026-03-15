import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiFetch, setToken } from "../api";

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();
    setMessage("");
    try {
      const data = await apiFetch("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password })
      });
      setToken(data.access_token);
      navigate("/");
    } catch (error) {
      setMessage("Login failed. Check your credentials.");
    }
  };

  return (
    <section className="page narrow">
      <h1>Welcome back</h1>
      <form className="form" onSubmit={handleSubmit}>
        <label className="field">
          Email
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <label className="field">
          Password
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
        </label>
        <button className="btn" type="submit">
          Log in
        </button>
        {message ? <p className="muted">{message}</p> : null}
      </form>
      <p className="muted">
        New here? <Link to="/register">Create an account</Link>
      </p>
    </section>
  );
}