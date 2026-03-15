import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiFetch } from "../api";

export default function Register() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();
    setMessage("");
    try {
      await apiFetch("/auth/register", {
        method: "POST",
        body: JSON.stringify({ email, password })
      });
      navigate("/login");
    } catch (error) {
      setMessage("Registration failed. Try a different email.");
    }
  };

  return (
    <section className="page narrow">
      <h1>Create your account</h1>
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
          Register
        </button>
        {message ? <p className="muted">{message}</p> : null}
      </form>
      <p className="muted">
        Already have an account? <Link to="/login">Log in</Link>
      </p>
    </section>
  );
}