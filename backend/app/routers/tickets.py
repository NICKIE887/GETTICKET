from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload
from ..auth import get_current_user
from ..db import get_db
from ..models import Ticket
from ..schemas import PaginatedTickets, Pagination, TicketOut

router = APIRouter(prefix="/tickets", tags=["tickets"])


@router.get("/me", response_model=PaginatedTickets)
def list_my_tickets(
    page: int = Query(1, ge=1),
    page_size: int = Query(6, ge=1, le=50),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    query = (
        db.query(Ticket)
        .options(joinedload(Ticket.ticket_type), joinedload(Ticket.event))
        .filter(Ticket.user_id == current_user.id)
    )
    total = query.count()
    items = (
        query.order_by(Ticket.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return PaginatedTickets(items=items, pagination=Pagination(page=page, page_size=page_size, total=total))


@router.get("/{ticket_id}", response_model=TicketOut)
def get_ticket(ticket_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    ticket = (
        db.query(Ticket)
        .options(joinedload(Ticket.ticket_type), joinedload(Ticket.event))
        .filter(Ticket.id == ticket_id, Ticket.user_id == current_user.id)
        .first()
    )
    if not ticket:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")
    return ticket