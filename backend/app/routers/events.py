from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from ..auth import get_current_user
from ..db import get_db
from ..models import Event, TicketType
from ..schemas import EventCreate, EventOut, PaginatedEvents, Pagination, TicketTypeCreate, TicketTypeOut

router = APIRouter(prefix="/events", tags=["events"])


@router.get("", response_model=PaginatedEvents)
def list_events(
    page: int = Query(1, ge=1),
    page_size: int = Query(6, ge=1, le=50),
    db: Session = Depends(get_db),
):
    total = db.query(Event).count()
    items = (
        db.query(Event)
        .order_by(Event.start_time.asc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return PaginatedEvents(items=items, pagination=Pagination(page=page, page_size=page_size, total=total))


@router.post("", response_model=EventOut)
def create_event(
    payload: EventCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    event = Event(
        title=payload.title,
        description=payload.description,
        image_url=payload.image_url,
        location=payload.location,
        start_time=payload.start_time,
        end_time=payload.end_time,
        created_by=current_user.id,
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return event


@router.get("/{event_id}", response_model=EventOut)
def get_event(event_id: int, db: Session = Depends(get_db)):
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")
    return event


@router.get("/{event_id}/ticket-types", response_model=list[TicketTypeOut])
def list_ticket_types(event_id: int, db: Session = Depends(get_db)):
    return db.query(TicketType).filter(TicketType.event_id == event_id).all()


@router.post("/{event_id}/ticket-types", response_model=TicketTypeOut)
def create_ticket_type(
    event_id: int,
    payload: TicketTypeCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

    ticket_type = TicketType(
        event_id=event_id,
        name=payload.name,
        price_kes=payload.price_kes,
        capacity=payload.capacity,
    )
    db.add(ticket_type)
    db.commit()
    db.refresh(ticket_type)
    return ticket_type
