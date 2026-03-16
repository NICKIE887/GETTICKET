import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiFetch, getToken } from "../api";

const DEFAULT_TYPES = ["Regular", "VIP", "VVIP", "Early Bird"];

export default function EventDetail() {
  const { id } = useParams();
  const [event, setEvent] = useState(null);
  const [ticketTypes, setTicketTypes] = useState([]);
  const [selectedType, setSelectedType] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [ticketId, setTicketId] = useState(null);
  const [ticketCode, setTicketCode] = useState("");
  const [deliveryMessage, setDeliveryMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    apiFetch(`/events/${id}`)
      .then(setEvent)
      .catch(() => setEvent(null));
    apiFetch(`/events/${id}/ticket-types`)
      .then((data) => {
        setTicketTypes(data || []);
        if (data?.length) {
          setSelectedType(String(data[0].id));
        }
      })
      .catch(() => setTicketTypes([]));
  }, [id]);

  const handlePurchase = async () => {
    if (!selectedType || !phone) {
      setMessage("Select a ticket type and enter your phone number.");
      return;
    }
    setLoading(true);
    setMessage("Initiating STK push. Check your phone to approve payment.");

    try {
      const response = await apiFetch("/payments/stk-push", {
        method: "POST",
        body: JSON.stringify({
          event_id: Number(id),
          ticket_type_id: Number(selectedType),
          phone
        })
      });
      const ticket = response.ticket;
      if (ticket?.id && ticket?.code) {
        localStorage.setItem(`ticket_code_${ticket.id}`, ticket.code);
        setTicketId(ticket.id);
        setTicketCode(ticket.code);
      }
      setMessage("Payment request sent. Save your ticket code to retrieve it later.");
    } catch (error) {
      setMessage("Payment failed. Try again shortly.");
    } finally {
      setLoading(false);
    }
  };

  const handleDeliver = async () => {
    if (!ticketId) return;
    if (!phone && !email) {
      setDeliveryMessage("Add a phone or email to receive your ticket.");
      return;
    }
    setSending(true);
    setDeliveryMessage("");
    try {
      const token = getToken();
      const query = token || !ticketCode ? "" : `?code=${encodeURIComponent(ticketCode)}`;
      await apiFetch(`/tickets/${ticketId}/deliver${query}`, {
        method: "POST",
        body: JSON.stringify({
          phone: phone || null,
          email: email || null
        })
      });
      setDeliveryMessage("Ticket delivery queued. We'll send it after payment confirmation.");
    } catch (error) {
      setDeliveryMessage("Unable to send ticket. Check the details and try again.");
    } finally {
      setSending(false);
    }
  };

  if (!event) {
    return (
      <section className="page">
        <p>Loading event...</p>
      </section>
    );
  }

  return (
    <section className="page">
      <div className="page__header">
        <div>
          <h1>{event.title}</h1>
          <p className="muted">
            {event.location || "Location TBD"} · {new Date(event.start_time).toLocaleString()}
          </p>
        </div>
        <Link className="btn btn--ghost" to={`/attendance/${event.id}`}>
          Attendance Dashboard
        </Link>
      </div>

      <div className="detail">
        <div className="detail__info">
          <div className="detail__media">
            <img src={event.image_url || "/event-placeholder.svg"} alt={event.title} />
          </div>
          <h3>About the event</h3>
          <p>{event.description || "No description provided."}</p>

          <div className="info-grid">
            <div>
              <span className="label">Starts</span>
              <span>{new Date(event.start_time).toLocaleString()}</span>
            </div>
            <div>
              <span className="label">Ends</span>
              <span>{new Date(event.end_time).toLocaleString()}</span>
            </div>
          </div>
        </div>

        <div className="detail__purchase">
          <h3>Get your ticket</h3>
          {!getToken() ? (
            <div className="disclaimer">
              Guest checkout: we only use your phone/email to deliver tickets and attendance verification.
              We retain guest purchase data for 30 days.
            </div>
          ) : null}
          <label className="field">
            Ticket type
            <select value={selectedType} onChange={(eventValue) => setSelectedType(eventValue.target.value)}>
              {ticketTypes.length ? (
                ticketTypes.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name} · KES {type.price_kes}
                  </option>
                ))
              ) : (
                DEFAULT_TYPES.map((label) => (
                  <option key={label} value="">
                    {label}
                  </option>
                ))
              )}
            </select>
          </label>
          {ticketTypes.length === 0 ? (
            <p className="muted">Ticket types have not been configured for this event yet.</p>
          ) : null}
          <label className="field">
            M-Pesa phone number
            <input
              type="tel"
              placeholder="2547XXXXXXXX"
              value={phone}
              onChange={(eventValue) => setPhone(eventValue.target.value)}
            />
          </label>
          <label className="field">
            Email (optional)
            <input type="email" placeholder="you@example.com" value={email} onChange={(eventValue) => setEmail(eventValue.target.value)} />
          </label>
          <button className="btn" type="button" onClick={handlePurchase} disabled={loading}>
            {loading ? "Processing..." : "Pay with M-Pesa (STK Push)"}
          </button>
          {ticketId ? (
            <Link className="btn btn--ghost" to={`/tickets/${ticketId}`}>
              View Ticket
            </Link>
          ) : null}
          <p className="muted">{message}</p>

          {ticketId ? (
            <div className="delivery">
              <h4>Send ticket to phone/email</h4>
              <p className="muted">We'll deliver the ticket after payment is confirmed.</p>
              <button className="btn btn--ghost" type="button" onClick={handleDeliver} disabled={sending}>
                {sending ? "Sending..." : "Send ticket"}
              </button>
              {deliveryMessage ? <p className="muted">{deliveryMessage}</p> : null}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}