from datetime import datetime
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import relationship
from .db import Base


def utcnow():
    return datetime.utcnow()


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=utcnow, nullable=False)

    events = relationship("Event", back_populates="creator")
    tickets = relationship("Ticket", back_populates="user")


class Event(Base):
    __tablename__ = "events"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(200), nullable=False)
    description = Column(String(2000), nullable=True)
    image_url = Column(String(500), nullable=True)
    location = Column(String(200), nullable=True)
    start_time = Column(DateTime, nullable=False)
    end_time = Column(DateTime, nullable=False)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=utcnow, nullable=False)

    creator = relationship("User", back_populates="events")
    ticket_types = relationship("TicketType", back_populates="event")
    tickets = relationship("Ticket", back_populates="event")


class TicketType(Base):
    __tablename__ = "ticket_types"

    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(Integer, ForeignKey("events.id"), nullable=False)
    name = Column(String(50), nullable=False)
    price_kes = Column(Integer, nullable=False)
    capacity = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)

    event = relationship("Event", back_populates="ticket_types")
    tickets = relationship("Ticket", back_populates="ticket_type")


class Ticket(Base):
    __tablename__ = "tickets"

    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(Integer, ForeignKey("events.id"), nullable=False)
    ticket_type_id = Column(Integer, ForeignKey("ticket_types.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    code = Column(String(64), unique=True, index=True, nullable=False)
    status = Column(String(20), nullable=False, default="pending")
    checked_in_at = Column(DateTime, nullable=True)
    contact_phone = Column(String(20), nullable=True)
    contact_email = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)

    event = relationship("Event", back_populates="tickets")
    ticket_type = relationship("TicketType", back_populates="tickets")
    user = relationship("User", back_populates="tickets")
    payment = relationship("Payment", back_populates="ticket", uselist=False)


class Payment(Base):
    __tablename__ = "payments"

    id = Column(Integer, primary_key=True, index=True)
    ticket_id = Column(Integer, ForeignKey("tickets.id"), nullable=False)
    phone = Column(String(20), nullable=False)
    amount_kes = Column(Integer, nullable=False)
    status = Column(String(20), nullable=False, default="pending")
    mpesa_receipt = Column(String(64), nullable=True)
    merchant_request_id = Column(String(64), nullable=True)
    checkout_request_id = Column(String(64), nullable=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)

    ticket = relationship("Ticket", back_populates="payment")
