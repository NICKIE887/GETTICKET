import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../api";

export default function EventsPage() {
  const [events, setEvents] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 6;

  useEffect(() => {
    let active = true;
    apiFetch(`/events?page=${page}&page_size=${pageSize}`)
      .then((data) => {
        if (!active) return;
        setEvents(data.items || []);
        setTotal(data.pagination?.total || 0);
      })
      .catch(() => {
        if (!active) return;
        setEvents([]);
        setTotal(0);
      });
    return () => {
      active = false;
    };
  }, [page]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <section className="page">
      <div className="page__header">
        <div>
          <h1>Upcoming Events</h1>
          <p className="muted">Discover and book tickets instantly.</p>
        </div>
        <Link className="btn" to="/create-event">
          Create Event
        </Link>
      </div>

      <div className="grid">
        {events.map((event) => (
          <article className="card" key={event.id}>
            <div className="card__body">
              <h3>{event.title}</h3>
              <p className="muted">
                {event.location || "Location TBD"} · {new Date(event.start_time).toLocaleString()}
              </p>
              <p className="clamp">{event.description || "No description yet."}</p>
            </div>
            <div className="card__footer">
              <Link className="btn btn--ghost" to={`/events/${event.id}`}>
                View Details
              </Link>
            </div>
          </article>
        ))}
      </div>

      <div className="pagination">
        <button className="btn btn--ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>
          Previous
        </button>
        <span>
          Page {page} of {totalPages}
        </span>
        <button className="btn btn--ghost" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
          Next
        </button>
      </div>
    </section>
  );
}