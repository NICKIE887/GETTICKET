from datetime import datetime
from pydantic import BaseModel, ConfigDict


class Pagination(BaseModel):
    page: int
    page_size: int
    total: int


class UserCreate(BaseModel):
    email: str
    password: str


class UserOut(BaseModel):
    id: int
    email: str
    model_config = ConfigDict(from_attributes=True)


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


class EventCreate(BaseModel):
    title: str
    description: str | None = None
    image_url: str | None = None
    location: str | None = None
    start_time: datetime
    end_time: datetime


class EventOut(BaseModel):
    id: int
    title: str
    description: str | None
    image_url: str | None
    location: str | None
    start_time: datetime
    end_time: datetime
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class TicketTypeCreate(BaseModel):
    name: str
    price_kes: int
    capacity: int | None = None


class TicketTypeOut(BaseModel):
    id: int
    event_id: int
    name: str
    price_kes: int
    capacity: int | None
    model_config = ConfigDict(from_attributes=True)


class TicketOut(BaseModel):
    id: int
    event_id: int
    ticket_type_id: int
    user_id: int
    code: str
    status: str
    checked_in_at: datetime | None
    created_at: datetime
    ticket_type: TicketTypeOut | None = None
    event: EventOut | None = None
    model_config = ConfigDict(from_attributes=True)


class TicketPublicOut(BaseModel):
    id: int
    event_id: int
    ticket_type_id: int
    code: str
    status: str
    checked_in_at: datetime | None
    created_at: datetime
    ticket_type: TicketTypeOut | None = None
    event: EventOut | None = None
    model_config = ConfigDict(from_attributes=True)


class TicketDeliveryRequest(BaseModel):
    phone: str | None = None
    email: str | None = None


class TicketDeliveryOut(BaseModel):
    status: str


class PaymentOut(BaseModel):
    id: int
    ticket_id: int
    phone: str
    amount_kes: int
    status: str
    mpesa_receipt: str | None
    merchant_request_id: str | None
    checkout_request_id: str | None
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class StkPushRequest(BaseModel):
    event_id: int
    ticket_type_id: int
    phone: str


class CheckInRequest(BaseModel):
    code: str


class AttendanceSummary(BaseModel):
    event_id: int
    tickets_issued: int
    tickets_checked_in: int


class PaginatedEvents(BaseModel):
    items: list[EventOut]
    pagination: Pagination


class PaginatedTickets(BaseModel):
    items: list[TicketOut]
    pagination: Pagination
