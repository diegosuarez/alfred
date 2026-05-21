from typing import Optional

from pydantic import BaseModel, ConfigDict, computed_field

from app.core.time import UtcDatetime


class AttachmentResponse(BaseModel):
    """Slim view of an Attachment for the SPA. `url` is the relative API
    path the browser hits to download / preview the file."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    task_id: int
    filename: str
    content_type: str
    size: int
    created_at: UtcDatetime

    @computed_field
    @property
    def is_image(self) -> bool:
        return (self.content_type or "").lower().startswith("image/")

    @computed_field
    @property
    def url(self) -> str:
        return f"/api/attachments/{self.id}"


class AttachmentBrief(BaseModel):
    """Identical to AttachmentResponse but kept as a separate class so we
    can evolve the two independently if needed (e.g. add thumbnails)."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    filename: str
    content_type: str
    size: int

    @computed_field
    @property
    def is_image(self) -> bool:
        return (self.content_type or "").lower().startswith("image/")

    @computed_field
    @property
    def url(self) -> str:
        return f"/api/attachments/{self.id}"

    # Optional thumbnail URL (same endpoint with a size hint). Reserved
    # for a future image-resizing pipeline; currently None.
    thumbnail_url: Optional[str] = None
