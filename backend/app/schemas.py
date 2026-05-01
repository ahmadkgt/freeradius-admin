from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class AttrBase(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    attribute: str
    op: str
    value: str


class CheckAttr(AttrBase):
    username: str


class ReplyAttr(AttrBase):
    username: str


class GroupCheckAttr(AttrBase):
    groupname: str


class GroupReplyAttr(AttrBase):
    groupname: str


class AttrCreate(BaseModel):
    attribute: str
    op: str = "="
    value: str


# ---- Users ----
class UserSummary(BaseModel):
    username: str
    password: str | None = None
    groups: list[str] = []
    framed_ip: str | None = None


class UserCreate(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=253)
    groups: list[str] = []
    framed_ip: str | None = None


class UserUpdate(BaseModel):
    password: str | None = None
    groups: list[str] | None = None
    framed_ip: str | None = None


class UserDetail(BaseModel):
    username: str
    password: str | None = None
    groups: list[str] = []
    check_attrs: list[CheckAttr] = []
    reply_attrs: list[ReplyAttr] = []


# ---- Groups ----
class GroupSummary(BaseModel):
    groupname: str
    user_count: int = 0


class GroupCreate(BaseModel):
    groupname: str = Field(min_length=1, max_length=64)


class GroupDetail(BaseModel):
    groupname: str
    check_attrs: list[GroupCheckAttr] = []
    reply_attrs: list[GroupReplyAttr] = []
    members: list[str] = []


# ---- NAS ----
class NasBase(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    nasname: str
    shortname: str | None = None
    type: str | None = "other"
    ports: int | None = None
    secret: str | None = "secret"
    server: str | None = None
    community: str | None = None
    description: str | None = "RADIUS Client"


class NasOut(NasBase):
    id: int


class NasCreate(NasBase):
    pass


class NasUpdate(BaseModel):
    nasname: str | None = None
    shortname: str | None = None
    type: str | None = None
    ports: int | None = None
    secret: str | None = None
    server: str | None = None
    community: str | None = None
    description: str | None = None


# ---- Accounting ----
class AccountingRow(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    radacctid: int
    acctsessionid: str
    username: str
    groupname: str | None = None
    nasipaddress: str
    framedipaddress: str | None = None
    callingstationid: str | None = None
    acctstarttime: datetime | None = None
    acctstoptime: datetime | None = None
    acctsessiontime: int | None = None
    acctinputoctets: int | None = None
    acctoutputoctets: int | None = None
    acctterminatecause: str | None = None


class PostAuthRow(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    username: str
    reply: str
    authdate: datetime


# ---- Dashboard ----
class DashboardStats(BaseModel):
    total_users: int
    total_groups: int
    total_nas: int
    active_sessions: int
    sessions_today: int
    auth_accepts_today: int
    auth_rejects_today: int
    total_input_bytes: int
    total_output_bytes: int


class TimeSeriesPoint(BaseModel):
    label: str
    accepts: int
    rejects: int


class TopUser(BaseModel):
    username: str
    sessions: int
    total_bytes: int


# ---- Generic ----
class Paginated[T](BaseModel):
    items: list[T]
    total: int
    page: int
    page_size: int
