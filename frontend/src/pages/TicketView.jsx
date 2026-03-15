import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { QRCodeCanvas } from "qrcode.react";
import { apiFetch } from "../api";

export default function TicketView() {
  const { id } = useParams();
  const [ticket, setTicket] = useState(null);

  useEffect(() => {
    apiFetch(`/tickets/${id}`).then(setTicket).catch(() => setTicket(null));
  }, [id]);

  if (!ticket) {
    return (
      <section className="page">
        <p>Loading ticket...</p>
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