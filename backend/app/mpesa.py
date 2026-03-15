import base64
import os
from datetime import datetime
import httpx
from fastapi import HTTPException, status

MPESA_BASE_URL = os.getenv("MPESA_BASE_URL", "https://sandbox.safaricom.co.ke")
MPESA_CONSUMER_KEY = os.getenv("MPESA_CONSUMER_KEY")
MPESA_CONSUMER_SECRET = os.getenv("MPESA_CONSUMER_SECRET")
MPESA_TILL_NUMBER = os.getenv("MPESA_TILL_NUMBER", "545661")
MPESA_SHORTCODE = os.getenv("MPESA_SHORTCODE", MPESA_TILL_NUMBER)
MPESA_PASSKEY = os.getenv("MPESA_PASSKEY")
MPESA_CALLBACK_URL = os.getenv("MPESA_CALLBACK_URL", "https://example.com/payments/callback")
MPESA_TRANSACTION_TYPE = os.getenv("MPESA_TRANSACTION_TYPE", "CustomerBuyGoodsOnline")


def _require_env(value: str | None, name: str):
    if not value:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Missing {name} environment variable",
        )


def _get_access_token() -> str:
    _require_env(MPESA_CONSUMER_KEY, "MPESA_CONSUMER_KEY")
    _require_env(MPESA_CONSUMER_SECRET, "MPESA_CONSUMER_SECRET")

    token = base64.b64encode(f"{MPESA_CONSUMER_KEY}:{MPESA_CONSUMER_SECRET}".encode()).decode()
    url = f"{MPESA_BASE_URL}/oauth/v1/generate?grant_type=client_credentials"
    headers = {"Authorization": f"Basic {token}"}

    with httpx.Client(timeout=20) as client:
        response = client.get(url, headers=headers)
        response.raise_for_status()
        data = response.json()

    access_token = data.get("access_token")
    if not access_token:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Failed to obtain MPesa token")
    return access_token


def _generate_password(timestamp: str) -> str:
    _require_env(MPESA_PASSKEY, "MPESA_PASSKEY")
    raw = f"{MPESA_SHORTCODE}{MPESA_PASSKEY}{timestamp}"
    return base64.b64encode(raw.encode()).decode()


def initiate_stk_push(amount: int, phone: str, account_reference: str, transaction_desc: str) -> dict:
    token = _get_access_token()
    timestamp = datetime.utcnow().strftime("%Y%m%d%H%M%S")
    password = _generate_password(timestamp)

    payload = {
        "BusinessShortCode": MPESA_SHORTCODE,
        "Password": password,
        "Timestamp": timestamp,
        "TransactionType": MPESA_TRANSACTION_TYPE,
        "Amount": amount,
        "PartyA": phone,
        "PartyB": MPESA_SHORTCODE,
        "PhoneNumber": phone,
        "CallBackURL": MPESA_CALLBACK_URL,
        "AccountReference": account_reference,
        "TransactionDesc": transaction_desc,
    }

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    url = f"{MPESA_BASE_URL}/mpesa/stkpush/v1/processrequest"

    with httpx.Client(timeout=20) as client:
        response = client.post(url, json=payload, headers=headers)
        response.raise_for_status()
        return response.json()