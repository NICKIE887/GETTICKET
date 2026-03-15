import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../api";

export default function MyTickets() {
  const [tickets, setTickets] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 6;

  useEffect(() => {
    let active = true;
    apiFetch(`/tickets/me?page=${page}&page_size=${pageSize}`)
      .then((data) => {
        if (!active) return;
        setTickets(data.items || []);
        setTotal(data.pagination?.total || 0);
      })
      .catch(() => {
        if (!active) return;
        setTickets([]);
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
          <h1>My tickets</h1>
          <p className="muted">Check payment status and print your QR ticket.</p>
        </div>
      </div>

      <div className="grid">
        {tickets.map((ticket) => (
          <article className="card" key={ticket.id}>
            <div className="card__body">
              <h3>Ticket #{ticket.id}</h3>
              <p className="muted">Status: {ticket.status}</p>
              <p className="muted">Type: {ticket.ticket_type?.name || ""}</p>
            </div>
            <div className="card__footer">
              <Link className="btn btn--ghost" to={`/tickets/${ticket.id}`}>
                View ticket
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