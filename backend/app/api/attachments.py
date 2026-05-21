"""File attachments for tasks.

Storage layout: every file lives under `data/attachments/` named
`<id>.<ext>`. The DB row stores the relative storage path so the bytes
can be relocated later without touching uploaded references.
"""
import logging
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.api.deps import get_current_user
from app.database import get_db
from app.models.attachment import Attachment
from app.models.board import Board
from app.models.task import Task
from app.models.user import User
from app.schemas.attachment import AttachmentResponse

log = logging.getLogger(__name__)

router = APIRouter(prefix="", tags=["attachments"])

# Storage root, kept relative so the install can be moved.
STORAGE_DIR = Path("data/attachments")
MAX_BYTES = 15 * 1024 * 1024  # 15 MB per the product cap


async def _owned_task(db: AsyncSession, user_id: int, task_id: int) -> Task:
    result = await db.execute(
        select(Task)
        .join(Board)
        .filter(Task.id == task_id, Board.user_id == user_id)
    )
    task = result.scalars().first()
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Task not found"
        )
    return task


async def _owned_attachment(
    db: AsyncSession, user_id: int, attachment_id: int
) -> Attachment:
    result = await db.execute(
        select(Attachment)
        .join(Task, Attachment.task_id == Task.id)
        .join(Board, Task.board_id == Board.id)
        .filter(Attachment.id == attachment_id, Board.user_id == user_id)
    )
    att = result.scalars().first()
    if not att:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Attachment not found",
        )
    return att


@router.post(
    "/tasks/{task_id}/attachments",
    response_model=AttachmentResponse,
)
async def upload_attachment(
    task_id: int,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    task = await _owned_task(db, current_user.id, task_id)

    # Cap by reading in chunks so we don't load oversize files into RAM
    # before rejecting them.
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    suffix = Path(file.filename or "").suffix.lower()[:16]
    storage_name = f"{uuid.uuid4().hex}{suffix}"
    storage_path = STORAGE_DIR / storage_name

    size = 0
    try:
        with storage_path.open("wb") as out:
            while True:
                chunk = await file.read(64 * 1024)
                if not chunk:
                    break
                size += len(chunk)
                if size > MAX_BYTES:
                    out.close()
                    storage_path.unlink(missing_ok=True)
                    raise HTTPException(
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        detail=f"File exceeds the {MAX_BYTES // (1024 * 1024)} MB limit",
                    )
                out.write(chunk)
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        log.exception("Attachment upload failed for task %s", task.id)
        storage_path.unlink(missing_ok=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Could not store the upload: {exc.__class__.__name__}",
        )

    row = Attachment(
        task_id=task.id,
        filename=file.filename or storage_name,
        content_type=file.content_type or "application/octet-stream",
        size=size,
        storage_path=storage_name,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


@router.get("/attachments/{attachment_id}")
async def download_attachment(
    attachment_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    att = await _owned_attachment(db, current_user.id, attachment_id)
    path = STORAGE_DIR / att.storage_path
    if not path.exists():
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="The underlying file is missing on disk",
        )
    # Images get inline disposition so the browser previews them; any
    # other content type comes back as a download with the original
    # filename preserved.
    disposition = "inline" if att.content_type.startswith("image/") else "attachment"
    return FileResponse(
        str(path),
        media_type=att.content_type,
        filename=att.filename,
        headers={
            "Content-Disposition": (
                f'{disposition}; filename="{att.filename}"'
            ),
        },
    )


@router.delete(
    "/attachments/{attachment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_attachment(
    attachment_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    att = await _owned_attachment(db, current_user.id, attachment_id)
    path = STORAGE_DIR / att.storage_path
    await db.delete(att)
    await db.commit()
    # Best-effort cleanup; if the file is already gone we don't care.
    try:
        path.unlink(missing_ok=True)
    except OSError as exc:
        log.warning("Could not delete attachment file %s: %s", path, exc)
    return None
