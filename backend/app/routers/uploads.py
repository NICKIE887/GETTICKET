import os
from uuid import uuid4
from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from ..auth import get_current_user
from ..storage import get_upload_dir

router = APIRouter(prefix="/uploads", tags=["uploads"])


@router.post("/event-image")
async def upload_event_image(
    request: Request,
    file: UploadFile = File(...),
    current_user=Depends(get_current_user),
):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only image uploads are allowed")

    contents = await file.read()
    if len(contents) > 5 * 1024 * 1024:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="File too large")

    extension = os.path.splitext(file.filename or "")[1].lower() or ".png"
    filename = f"{uuid4().hex}{extension}"
    upload_dir = get_upload_dir()
    file_path = upload_dir / filename
    file_path.write_bytes(contents)

    base_url = str(request.base_url).rstrip("/")
    return {"url": f"{base_url}/uploads/{filename}"}