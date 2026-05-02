from datetime import datetime, time
from decimal import Decimal
from typing import Literal

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
UserStatus = Literal[
    "active_online",
    "active_offline",
    "expiring_soon",
    "expired",
    "expired_online",
    "disabled",
]


class SubscriptionInfo(BaseModel):
    """Per-user subscription metadata (extended profile)."""

    model_config = ConfigDict(from_attributes=True)
    profile_id: int | None = None
    profile_name: str | None = None
    enabled: bool = True
    expiration_at: datetime | None = None
    balance: Decimal = Decimal("0")
    debt: Decimal = Decimal("0")
    first_name: str | None = None
    last_name: str | None = None
    email: str | None = None
    phone: str | None = None
    address: str | None = None
    notes: str | None = None


class SubscriptionUpdate(BaseModel):
    """Mutable fields on a subscriber's metadata."""

    profile_id: int | None = None
    enabled: bool | None = None
    expiration_at: datetime | None = None
    balance: Decimal | None = None
    debt: Decimal | None = None
    first_name: str | None = None
    last_name: str | None = None
    email: str | None = None
    phone: str | None = None
    address: str | None = None
    notes: str | None = None


class UserSummary(BaseModel):
    username: str
    password: str | None = None
    groups: list[str] = []
    framed_ip: str | None = None
    status: UserStatus = "active_offline"
    profile_name: str | None = None
    expiration_at: datetime | None = None
    online: bool = False
    first_name: str | None = None
    last_name: str | None = None
    phone: str | None = None
    balance: Decimal = Decimal("0")


class UserCreate(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=253)
    groups: list[str] = []
    framed_ip: str | None = None
    # Optional subscription fields — may be supplied at create time.
    profile_id: int | None = None
    enabled: bool = True
    expiration_at: datetime | None = None
    first_name: str | None = None
    last_name: str | None = None
    email: str | None = None
    phone: str | None = None
    address: str | None = None
    notes: str | None = None


class UserUpdate(BaseModel):
    password: str | None = None
    groups: list[str] | None = None
    framed_ip: str | None = None
    # Subscription fields — when present, will be patched onto the subscriber row.
    profile_id: int | None = None
    enabled: bool | None = None
    expiration_at: datetime | None = None
    first_name: str | None = None
    last_name: str | None = None
    email: str | None = None
    phone: str | None = None
    address: str | None = None
    notes: str | None = None


class UserDetail(BaseModel):
    username: str
    password: str | None = None
    groups: list[str] = []
    check_attrs: list[CheckAttr] = []
    reply_attrs: list[ReplyAttr] = []
    subscription: SubscriptionInfo | None = None
    status: UserStatus = "active_offline"
    online: bool = False


class OnlineUser(BaseModel):
    """A currently-connected RADIUS user (open radacct row)."""

    model_config = ConfigDict(from_attributes=True)
    username: str
    nasipaddress: str
    framedipaddress: str | None = None
    callingstationid: str | None = None
    acctstarttime: datetime | None = None
    acctsessiontime: int | None = None
    acctinputoctets: int | None = None
    acctoutputoctets: int | None = None
    profile_name: str | None = None


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


# ---- Profiles (service plans / packages) ----
ProfileType = Literal["prepaid", "postpaid", "expired"]
DurationUnit = Literal["days", "months", "years"]


class ProfileBase(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    name: str = Field(min_length=1, max_length=64)
    type: ProfileType = "prepaid"
    short_description: str | None = None
    unit_price: Decimal = Decimal("0")
    vat_percent: Decimal = Decimal("0")
    enabled: bool = True
    duration_value: int = Field(ge=0, default=30)
    duration_unit: DurationUnit = "days"
    use_fixed_time: bool = False
    fixed_expiration_time: time | None = None
    download_rate_kbps: int | None = Field(ge=0, default=None)
    upload_rate_kbps: int | None = Field(ge=0, default=None)
    pool_name: str | None = None
    expired_next_profile_id: int | None = None
    awarded_reward_points: Decimal = Decimal("0")
    available_in_user_panel: bool = False
    is_public: bool = True
    enable_sub_managers: bool = False


class ProfileOut(ProfileBase):
    id: int
    user_count: int = 0
    created_at: datetime
    updated_at: datetime


class ProfileCreate(ProfileBase):
    pass


class ProfileUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=64)
    type: ProfileType | None = None
    short_description: str | None = None
    unit_price: Decimal | None = None
    vat_percent: Decimal | None = None
    enabled: bool | None = None
    duration_value: int | None = Field(default=None, ge=0)
    duration_unit: DurationUnit | None = None
    use_fixed_time: bool | None = None
    fixed_expiration_time: time | None = None
    download_rate_kbps: int | None = Field(default=None, ge=0)
    upload_rate_kbps: int | None = Field(default=None, ge=0)
    pool_name: str | None = None
    expired_next_profile_id: int | None = None
    awarded_reward_points: Decimal | None = None
    available_in_user_panel: bool | None = None
    is_public: bool | None = None
    enable_sub_managers: bool | None = None


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
    # Phase 1 — user lifecycle stats
    active_users: int = 0
    online_users: int = 0
    offline_users: int = 0
    expired_users: int = 0
    expired_online_users: int = 0
    expiring_today: int = 0
    expiring_soon: int = 0
    disabled_users: int = 0


# ---- System info ----
class SystemInfo(BaseModel):
    version: str
    server_time: datetime
    timezone: str
    uptime_seconds: int
    cpu_percent: float | None = None
    load_avg: list[float] = []
    memory_total_bytes: int | None = None
    memory_available_bytes: int | None = None
    memory_used_percent: float | None = None
    disk_total_bytes: int | None = None
    disk_free_bytes: int | None = None
    disk_used_percent: float | None = None
    db_size_bytes: int | None = None
    active_connections: int = 0
    user_count: int = 0
    profile_count: int = 0


class TimeSeriesPoint(BaseModel):
    label: str
    accepts: int
    rejects: int


class TopUser(BaseModel):
    username: str
    sessions: int
    total_bytes: int


# ---- Auth ----
class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=255)


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_at: datetime
    username: str


class AdminMe(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    username: str
    is_active: bool


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=255)
    new_password: str = Field(min_length=8, max_length=255)


# ---- Generic ----
class Paginated[T](BaseModel):
    items: list[T]
    total: int
    page: int
    page_size: int
