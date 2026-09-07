from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field


class ApiResponse(BaseModel):
    code: int = 0
    data: Any = None
    msg: str = ""


class ImportRequest(BaseModel):
    paths: list[str] = Field(default_factory=list)


class ImagePatch(BaseModel):
    camera_angle: Optional[str] = None
    notes: Optional[str] = None
    primary_family: Optional[str] = None
    secondary_family: Optional[str] = None
    extra_families: Optional[list[str]] = None


class TagCreate(BaseModel):
    name: str
    color: Optional[str] = None
    parent_id: Optional[int] = None
    kind: Optional[str] = None


class TagPatch(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None
    parent_id: Optional[int] = None
    kind: Optional[str] = None


class TagReorder(BaseModel):
    ids: list[int] = Field(default_factory=list)


class ImageTagsPut(BaseModel):
    tag_ids: list[int] = Field(default_factory=list)


class BatchTagsRequest(BaseModel):
    image_ids: list[int]
    add: list[int] = Field(default_factory=list)
    remove: list[int] = Field(default_factory=list)


class ReprocessRequest(BaseModel):
    pose: bool = True
    color: bool = True


class PoseSearchRequest(BaseModel):
    image_id: Optional[int] = None


class BoardCreate(BaseModel):
    name: str


class BoardPatch(BaseModel):
    name: Optional[str] = None
    pan_x: Optional[float] = None
    pan_y: Optional[float] = None
    zoom: Optional[float] = None


class BoardItemIn(BaseModel):
    id: Optional[int] = None
    image_id: int
    x: float
    y: float
    width: float
    height: float
    z_index: int = 0
    rotation: float = 0
    crop_x: float = 0
    crop_y: float = 0
    crop_w: float = 1
    crop_h: float = 1


class BoardLayout(BaseModel):
    pan_x: float
    pan_y: float
    zoom: float
    items: list[BoardItemIn] = Field(default_factory=list)


class BoardItemCreate(BaseModel):
    image_id: int
    x: float = 0
    y: float = 0
    width: float = 240
    height: float = 240


class BoardTrayAdd(BaseModel):
    image_ids: list[int] = Field(default_factory=list)


class BoardPreviewIn(BaseModel):
    image: str


class BackupCreate(BaseModel):
    note: Optional[str] = None


class SettingsPut(BaseModel):
    last_opened_board_id: Optional[str] = None
    backup_remind_days: Optional[str] = None
    color_mode: Optional[str] = None
