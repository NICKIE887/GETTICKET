from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload
from ..auth import get_current_user, get_optional_user
from ..db import get_db
from ..models import Ticket
from ..schemas import (
    PaginatedTickets,
    Pagination,
    TicketDeliveryOut,
    TicketDeliveryRequest,
    TicketOut,
    TicketPublicOut,
)

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


@router.get("/public/{ticket_id}", response_model=TicketPublicOut)
def get_public_ticket(
    ticket_id: int,
    code: str = Query(..., min_length=6),
    db: Session = Depends(get_db),
):
    ticket = (
        db.query(Ticket)
        .options(joinedload(Ticket.ticket_type), joinedload(Ticket.event))
        .filter(Ticket.id == ticket_id)
        .first()
    )
    if not ticket or ticket.code != code:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")
    return ticket


@router.post("/{ticket_id}/deliver", response_model=TicketDeliveryOut)
def deliver_ticket(
    ticket_id: int,
    payload: TicketDeliveryRequest,
    code: str | None = Query(default=None, min_length=6),
    db: Session = Depends(get_db),
    current_user=Depends(get_optional_user),
):
    ticket = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")

    if current_user:
        if ticket.user_id != current_user.id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")
    else:
        if not code or ticket.code != code:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")

    if payload.phone:
        ticket.contact_phone = payload.phone
    if payload.email:
        ticket.contact_email = payload.email
    db.commit()

    return TicketDeliveryOut(status="queued")