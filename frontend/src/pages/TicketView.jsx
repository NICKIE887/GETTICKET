import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { QRCodeCanvas } from "qrcode.react";
import { apiFetch, getToken } from "../api";

export default function TicketView() {
  const { id } = useParams();
  const [ticket, setTicket] = useState(null);
  const [message, setMessage] = useState("");
  const [publicCode, setPublicCode] = useState(() => localStorage.getItem(`ticket_code_${id}`) || "");

  const loadTicket = async (codeOverride) => {
    const token = getToken();
    setMessage("");
    try {
      if (token) {
        const data = await apiFetch(`/tickets/${id}`);
        setTicket(data);
        return;
      }
      const code = codeOverride || publicCode;
      if (!code) {
        setMessage("Enter your ticket code to view the ticket.");
        return;
      }
      const data = await apiFetch(`/tickets/public/${id}?code=${encodeURIComponent(code)}`);
      setTicket(data);
    } catch (error) {
      setMessage("Unable to load ticket. Check the code and try again.");
    }
  };

  useEffect(() => {
    loadTicket();
  }, [id]);

  if (!ticket) {
    return (
      <section className="page">
        <p>{message || "Loading ticket..."}</p>
        {!getToken() ? (
          <div className="form">
            <label className="field">
              Ticket code
              <input value={publicCode} onChange={(event) => setPublicCode(event.target.value)} />
            </label>
            <button className="btn" type="button" onClick={() => loadTicket(publicCode)}>
              Load ticket
            </button>
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <section className="page">
      <div className="page__header">
        <div>
          <h1>Ticket #{ticket.id}</h1>
          <p className="muted">Status: {ticket.status}</p>
        </div>
        <button className="btn" type="button" onClick={() => window.print()}>
          Print ticket
        </button>
      </div>

      <div className="ticket">
        <div className="ticket__qr">
          <QRCodeCanvas value={ticket.code} size={180} />
          <p className="muted">Scan at entry</p>
        </div>
        <div className="ticket__info">
          <h2>{ticket.event?.title || "Event"}</h2>
          <p className="muted">{ticket.event?.location || "Location TBD"}</p>
          <div className="info-grid">
            <div>
              <span className="label">Ticket type</span>
              <span>{ticket.ticket_type?.name || ""}</span>
            </div>
            <div>
              <span className="label">Code</span>
              <span>{ticket.code}</span>
            </div>
          </div>
        </div>
      </div>

      {ticket.status !== "paid" ? (
        <p className="muted">
          Ticket is not marked as paid yet. Refresh after approving M-Pesa STK push.
        </p>
      ) : null}
    </section>
  );
}