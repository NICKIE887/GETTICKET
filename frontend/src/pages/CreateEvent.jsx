import { useState } from "react";
import { apiFetch } from "../api";

export default function CreateEvent() {
  const [form, setForm] = useState({
    title: "",
    description: "",
    image_url: "",
    location: "",
    start_time: "",
    end_time: ""
  });
  const [eventId, setEventId] = useState(null);
  const [message, setMessage] = useState("");
  const [ticketType, setTicketType] = useState({
    name: "Regular",
    price_kes: "",
    capacity: ""
  });

  const handleChange = (field) => (event) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const handleCreateEvent = async (event) => {
    event.preventDefault();
    setMessage("");
    try {
      const payload = {
        ...form,
        start_time: new Date(form.start_time).toISOString(),
        end_time: new Date(form.end_time).toISOString()
      };
      const created = await apiFetch("/events", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      setEventId(created.id);
      setMessage("Event created. Add ticket types below.");
    } catch (error) {
      setMessage("Event creation failed. Make sure you are logged in.");
    }
  };

  const handleTicketTypeChange = (field) => (event) => {
    setTicketType((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const handleAddTicketType = async (event) => {
    event.preventDefault();
    if (!eventId) return;
    setMessage("");
    try {
      await apiFetch(`/events/${eventId}/ticket-types`, {
        method: "POST",
        body: JSON.stringify({
          name: ticketType.name,
          price_kes: Number(ticketType.price_kes),
          capacity: ticketType.capacity ? Number(ticketType.capacity) : null
        })
      });
      setMessage("Ticket type added.");
      setTicketType((prev) => ({ ...prev, price_kes: "", capacity: "" }));
    } catch (error) {
      setMessage("Ticket type creation failed.");
    }
  };

  return (
    <section className="page narrow">
      <h1>Create Event</h1>
      <form className="form" onSubmit={handleCreateEvent}>
        <label className="field">
          Title
          <input value={form.title} onChange={handleChange("title")} required />
        </label>
        <label className="field">
          Description
          <textarea value={form.description} onChange={handleChange("description")} rows="4" />
        </label>
        <label className="field">
          Image URL
          <input value={form.image_url} onChange={handleChange("image_url")} placeholder="https://..." />
        </label>
        <label className="field">
          Location
          <input value={form.location} onChange={handleChange("location")} />
        </label>
        <label className="field">
          Start time
          <input type="datetime-local" value={form.start_time} onChange={handleChange("start_time")} required />
        </label>
        <label className="field">
          End time
          <input type="datetime-local" value={form.end_time} onChange={handleChange("end_time")} required />
        </label>
        <button className="btn" type="submit">
          Create event
        </button>
      </form>

      {eventId ? (
        <form className="form" onSubmit={handleAddTicketType}>
          <h2>Ticket types</h2>
          <div className="pill-group">
            {["Regular", "VIP", "VVIP", "Early Bird"].map((label) => (
              <button
                key={label}
                type="button"
                className={`pill ${ticketType.name === label ? "pill--active" : ""}`}
                onClick={() => setTicketType((prev) => ({ ...prev, name: label }))}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="field">
            Price (KES)
            <input type="number" value={ticketType.price_kes} onChange={handleTicketTypeChange("price_kes")} required />
          </label>
          <label className="field">
            Capacity (optional)
            <input type="number" value={ticketType.capacity} onChange={handleTicketTypeChange("capacity")} />
          </label>
          <button className="btn" type="submit">
            Add ticket type
          </button>
        </form>
      ) : null}

      {message ? <p className="muted">{message}</p> : null}
    </section>
  );
}