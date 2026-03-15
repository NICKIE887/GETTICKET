from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from ..auth import get_current_user
from ..db import get_db
from ..models import Ticket
from ..schemas import AttendanceSummary, CheckInRequest, TicketOut

router = APIRouter(prefix="/attendance", tags=["attendance"])


@router.post("/check-in", response_model=TicketOut)
def check_in(
    payload: CheckInRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    ticket = db.query(Ticket).filter(Ticket.code == payload.code).first()
    if not ticket:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")
    if ticket.status != "paid":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Ticket not paid")
    if ticket.checked_in_at:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Already checked in")

    ticket.checked_in_at = datetime.utcnow()
    db.commit()
    db.refresh(ticket)
    return ticket


@router.get("/summary", response_model=AttendanceSummary)
def attendance_summary(
    event_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    issued = db.query(Ticket).filter(Ticket.event_id == event_id).count()
    checked_in = db.query(Ticket).filter(Ticket.event_id == event_id, Ticket.checked_in_at.isnot(None)).count()
    return AttendanceSummary(event_id=event_id, tickets_issued=issued, tickets_checked_in=checked_in)