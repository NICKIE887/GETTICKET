import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../api";

const DEMO_EVENTS = [
  {
    id: 101,
    title: "Nairobi Night Live",
    description: "Live performances and DJ sets under the city lights.",
    location: "KICC Rooftop",
    start_time: "2026-06-20T18:00:00Z",
    end_time: "2026-06-20T23:00:00Z",
    created_at: "2026-03-10T12:00:00Z"
  },
  {
    id: 102,
    title: "Tech & Tastes Expo",
    description: "A showcase of local startups, demos, and tasting booths.",
    location: "Sarit Expo Centre",
    start_time: "2026-07-05T08:00:00Z",
    end_time: "2026-07-05T16:00:00Z",
    created_at: "2026-03-11T12:00:00Z"
  },
  {
    id: 103,
    title: "Coastal Sunset Festival",
    description: "Beachfront music, food trucks, and artisan markets.",
    location: "Nyali Beach",
    start_time: "2026-08-02T14:00:00Z",
    end_time: "2026-08-02T22:30:00Z",
    created_at: "2026-03-12T12:00:00Z"
  }
];

export default function EventsPage() {
  const [events, setEvents] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [demoMode, setDemoMode] = useState(false);
  const pageSize = 6;

  useEffect(() => {
    let active = true;
    apiFetch(`/events?page=${page}&page_size=${pageSize}`)
      .then((data) => {
        if (!active) return;
        setEvents(data.items || []);
        setTotal(data.pagination?.total || 0);
        setDemoMode(false);
      })
      .catch(() => {
        if (!active) return;
        setEvents(DEMO_EVENTS);
        setTotal(DEMO_EVENTS.length);
        setDemoMode(true);
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

      {demoMode ? (
        <div className="demo-banner">
          <span>Demo mode: showing sample events (API offline).</span>
        </div>
      ) : null}

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