from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from ..auth import get_current_user
from ..db import get_db
from ..models import Event, Payment, Ticket, TicketType
from ..mpesa import initiate_stk_push
from ..schemas import PaymentOut, StkPushRequest, TicketOut
from ..utils import generate_ticket_code

router = APIRouter(prefix="/payments", tags=["payments"])


def _capacity_available(db: Session, ticket_type: TicketType) -> bool:
    if ticket_type.capacity is None:
        return True
    issued = db.query(Ticket).filter(Ticket.ticket_type_id == ticket_type.id).count()
    return issued < ticket_type.capacity


@router.post("/stk-push")
def stk_push(
    payload: StkPushRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    event = db.query(Event).filter(Event.id == payload.event_id).first()
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

    ticket_type = (
        db.query(TicketType)
        .filter(TicketType.id == payload.ticket_type_id, TicketType.event_id == payload.event_id)
        .first()
    )
    if not ticket_type:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket type not found")

    if not _capacity_available(db, ticket_type):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Ticket type is sold out")

    ticket = Ticket(
        event_id=event.id,
        ticket_type_id=ticket_type.id,
        user_id=current_user.id,
        code=generate_ticket_code(),
        status="pending",
    )
    db.add(ticket)
    db.commit()
    db.refresh(ticket)

    payment = Payment(
        ticket_id=ticket.id,
        phone=payload.phone,
        amount_kes=ticket_type.price_kes,
        status="pending",
    )
    db.add(payment)
    db.commit()
    db.refresh(payment)

    mpesa_response = initiate_stk_push(
        amount=ticket_type.price_kes,
        phone=payload.phone,
        account_reference=f"TICKET-{ticket.id}",
        transaction_desc=event.title,
    )

    payment.merchant_request_id = mpesa_response.get("MerchantRequestID")
    payment.checkout_request_id = mpesa_response.get("CheckoutRequestID")
    db.commit()
    db.refresh(payment)

    return {
        "ticket": TicketOut.model_validate(ticket).model_dump(),
        "payment": PaymentOut.model_validate(payment).model_dump(),
        "mpesa": mpesa_response,
    }


@router.post("/callback")
def mpesa_callback(payload: dict, db: Session = Depends(get_db)):
    callback = payload.get("Body", {}).get("stkCallback", {})
    checkout_id = callback.get("CheckoutRequestID")
    result_code = callback.get("ResultCode")

    if not checkout_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing CheckoutRequestID")

    payment = db.query(Payment).filter(Payment.checkout_request_id == checkout_id).first()
    if not payment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payment not found")

    if result_code == 0:
        metadata = callback.get("CallbackMetadata", {}).get("Item", [])
        receipt = None
        for item in metadata:
            if item.get("Name") == "MpesaReceiptNumber":
                receipt = item.get("Value")
                break

        payment.status = "paid"
        payment.mpesa_receipt = receipt
        payment.ticket.status = "paid"
    else:
        payment.status = "failed"
        payment.ticket.status = "failed"

    db.commit()
    return {"status": "ok"}