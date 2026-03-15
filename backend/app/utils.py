import secrets


def generate_ticket_code() -> str:
    return secrets.token_urlsafe(16)