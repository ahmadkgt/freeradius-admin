from datetime import datetime, time
from decimal import Decimal

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    Time,
    func,
)
from sqlalchemy import (
    Enum as SqlEnum,
)
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base


class RadCheck(Base):
    __tablename__ = "radcheck"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(64), default="", index=True)
    attribute: Mapped[str] = mapped_column(String(64), default="")
    op: Mapped[str] = mapped_column(String(2), default="==")
    value: Mapped[str] = mapped_column(String(253), default="")


class RadReply(Base):
    __tablename__ = "radreply"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(64), default="", index=True)
    attribute: Mapped[str] = mapped_column(String(64), default="")
    op: Mapped[str] = mapped_column(String(2), default="=")
    value: Mapped[str] = mapped_column(String(253), default="")


class RadGroupCheck(Base):
    __tablename__ = "radgroupcheck"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    groupname: Mapped[str] = mapped_column(String(64), default="", index=True)
    attribute: Mapped[str] = mapped_column(String(64), default="")
    op: Mapped[str] = mapped_column(String(2), default="==")
    value: Mapped[str] = mapped_column(String(253), default="")


class RadGroupReply(Base):
    __tablename__ = "radgroupreply"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    groupname: Mapped[str] = mapped_column(String(64), default="", index=True)
    attribute: Mapped[str] = mapped_column(String(64), default="")
    op: Mapped[str] = mapped_column(String(2), default="=")
    value: Mapped[str] = mapped_column(String(253), default="")


class RadUserGroup(Base):
    __tablename__ = "radusergroup"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(64), default="", index=True)
    groupname: Mapped[str] = mapped_column(String(64), default="")
    priority: Mapped[int] = mapped_column(Integer, default=1)


class RadAcct(Base):
    __tablename__ = "radacct"

    radacctid: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    acctsessionid: Mapped[str] = mapped_column(String(64), default="")
    acctuniqueid: Mapped[str] = mapped_column(String(32), default="", unique=True)
    username: Mapped[str] = mapped_column(String(64), default="", index=True)
    groupname: Mapped[str] = mapped_column(String(64), default="")
    realm: Mapped[str | None] = mapped_column(String(64), default="")
    nasipaddress: Mapped[str] = mapped_column(String(15), default="")
    nasportid: Mapped[str | None] = mapped_column(String(15), nullable=True)
    nasporttype: Mapped[str | None] = mapped_column(String(32), nullable=True)
    acctstarttime: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    acctupdatetime: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    acctstoptime: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    acctinterval: Mapped[int | None] = mapped_column(Integer, nullable=True)
    acctsessiontime: Mapped[int | None] = mapped_column(Integer, nullable=True)
    acctauthentic: Mapped[str | None] = mapped_column(String(32), nullable=True)
    connectinfo_start: Mapped[str | None] = mapped_column(String(50), nullable=True)
    connectinfo_stop: Mapped[str | None] = mapped_column(String(50), nullable=True)
    acctinputoctets: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    acctoutputoctets: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    calledstationid: Mapped[str] = mapped_column(String(50), default="")
    callingstationid: Mapped[str] = mapped_column(String(50), default="")
    acctterminatecause: Mapped[str] = mapped_column(String(32), default="")
    servicetype: Mapped[str | None] = mapped_column(String(32), nullable=True)
    framedprotocol: Mapped[str | None] = mapped_column(String(32), nullable=True)
    framedipaddress: Mapped[str] = mapped_column(String(15), default="")
    framedipv6address: Mapped[str] = mapped_column(String(45), default="")
    framedipv6prefix: Mapped[str] = mapped_column(String(45), default="")
    framedinterfaceid: Mapped[str] = mapped_column(String(44), default="")
    delegatedipv6prefix: Mapped[str] = mapped_column(String(45), default="")


class RadPostAuth(Base):
    __tablename__ = "radpostauth"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(64), default="", index=True)
    pass_: Mapped[str] = mapped_column("pass", String(64), default="")
    reply: Mapped[str] = mapped_column(String(32), default="")
    authdate: Mapped[datetime] = mapped_column(DateTime)
    class_: Mapped[str | None] = mapped_column("class", String(64), nullable=True)


class Nas(Base):
    __tablename__ = "nas"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    nasname: Mapped[str] = mapped_column(String(128))
    shortname: Mapped[str | None] = mapped_column(String(32), nullable=True)
    type: Mapped[str | None] = mapped_column(String(30), default="other")
    ports: Mapped[int | None] = mapped_column(Integer, nullable=True)
    secret: Mapped[str | None] = mapped_column(String(60), default="secret")
    server: Mapped[str | None] = mapped_column(String(64), nullable=True)
    community: Mapped[str | None] = mapped_column(String(50), nullable=True)
    description: Mapped[str | None] = mapped_column(String(200), default="RADIUS Client")


class Manager(Base):
    """Panel operator. Hierarchy of managers/resellers — each one logs into the UI.

    Replaces the legacy `admin_users` table. The root manager has `is_root=True`
    and implicitly carries every permission. Sub-managers carry an explicit
    `permissions` list (see `app.permissions.PERMISSIONS`).
    """

    __tablename__ = "managers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    parent_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("managers.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    full_name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    email: Mapped[str | None] = mapped_column(String(128), nullable=True)
    address: Mapped[str | None] = mapped_column(Text, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
    is_root: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")
    balance: Mapped[Decimal] = mapped_column(
        Numeric(15, 2), default=Decimal("0"), server_default="0"
    )
    profit_share_percent: Mapped[Decimal] = mapped_column(
        Numeric(5, 2), default=Decimal("0"), server_default="0"
    )
    max_users_quota: Mapped[int | None] = mapped_column(Integer, nullable=True)
    permissions: Mapped[list[str]] = mapped_column(JSON, default=list)
    allowed_profile_ids: Mapped[list[int]] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.current_timestamp(), default=func.current_timestamp()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        server_default=func.current_timestamp(),
        default=func.current_timestamp(),
        onupdate=func.current_timestamp(),
    )


# ===================================================================
# Phase 1 — ISP / subscription model
# ===================================================================


class Profile(Base):
    """A service plan (package) — speed, price, duration."""

    __tablename__ = "profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    type: Mapped[str] = mapped_column(
        SqlEnum("prepaid", "postpaid", "expired", name="profile_type"),
        default="prepaid",
        server_default="prepaid",
    )
    short_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    unit_price: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), default=Decimal("0"), server_default="0"
    )
    vat_percent: Mapped[Decimal] = mapped_column(
        Numeric(5, 2), default=Decimal("0"), server_default="0"
    )
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
    duration_value: Mapped[int] = mapped_column(Integer, default=30, server_default="30")
    duration_unit: Mapped[str] = mapped_column(
        SqlEnum("days", "months", "years", name="duration_unit"),
        default="days",
        server_default="days",
    )
    use_fixed_time: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="0"
    )
    fixed_expiration_time: Mapped[time | None] = mapped_column(Time, nullable=True)
    download_rate_kbps: Mapped[int | None] = mapped_column(Integer, nullable=True)
    upload_rate_kbps: Mapped[int | None] = mapped_column(Integer, nullable=True)
    pool_name: Mapped[str | None] = mapped_column(String(64), nullable=True)
    expired_next_profile_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("profiles.id", ondelete="SET NULL"), nullable=True
    )
    awarded_reward_points: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), default=Decimal("0"), server_default="0"
    )
    available_in_user_panel: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="0"
    )
    is_public: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
    enable_sub_managers: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="0"
    )
    owner_manager_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("managers.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.current_timestamp(), default=func.current_timestamp()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        server_default=func.current_timestamp(),
        default=func.current_timestamp(),
        onupdate=func.current_timestamp(),
    )


class SubscriberProfile(Base):
    """Per-user subscription metadata. The username links to RadCheck.username."""

    __tablename__ = "subscriber_profiles"

    username: Mapped[str] = mapped_column(String(64), primary_key=True)
    profile_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("profiles.id", ondelete="SET NULL"), nullable=True
    )
    manager_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("managers.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
    expiration_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    balance: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), default=Decimal("0"), server_default="0"
    )
    debt: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), default=Decimal("0"), server_default="0"
    )
    first_name: Mapped[str | None] = mapped_column(String(64), nullable=True)
    last_name: Mapped[str | None] = mapped_column(String(64), nullable=True)
    email: Mapped[str | None] = mapped_column(String(128), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    address: Mapped[str | None] = mapped_column(String(255), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.current_timestamp(), default=func.current_timestamp()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        server_default=func.current_timestamp(),
        default=func.current_timestamp(),
        onupdate=func.current_timestamp(),
    )


# ===================================================================
# Phase 3 — Invoicing + ledger
# ===================================================================


class Invoice(Base):
    """An invoice issued to a subscriber."""

    __tablename__ = "invoices"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    invoice_number: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    subscriber_username: Mapped[str] = mapped_column(String(64), index=True)
    manager_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("managers.id", ondelete="RESTRICT"),
        index=True,
    )
    issued_by_manager_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("managers.id", ondelete="SET NULL"),
        nullable=True,
    )
    profile_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("profiles.id", ondelete="SET NULL"), nullable=True
    )
    description: Mapped[str | None] = mapped_column(String(255), nullable=True)
    amount: Mapped[Decimal] = mapped_column(
        Numeric(15, 2), default=Decimal("0"), server_default="0"
    )
    vat_percent: Mapped[Decimal] = mapped_column(
        Numeric(5, 2), default=Decimal("0"), server_default="0"
    )
    vat_amount: Mapped[Decimal] = mapped_column(
        Numeric(15, 2), default=Decimal("0"), server_default="0"
    )
    total_amount: Mapped[Decimal] = mapped_column(
        Numeric(15, 2), default=Decimal("0"), server_default="0"
    )
    paid_amount: Mapped[Decimal] = mapped_column(
        Numeric(15, 2), default=Decimal("0"), server_default="0"
    )
    status: Mapped[str] = mapped_column(
        SqlEnum(
            "pending",
            "partially_paid",
            "paid",
            "voided",
            "written_off",
            name="invoice_status",
        ),
        default="pending",
        server_default="pending",
        index=True,
    )
    issue_date: Mapped[datetime] = mapped_column(DateTime)
    due_date: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    period_start: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    period_end: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.current_timestamp(), default=func.current_timestamp()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        server_default=func.current_timestamp(),
        default=func.current_timestamp(),
        onupdate=func.current_timestamp(),
    )


class InvoicePayment(Base):
    """A payment recorded against an invoice."""

    __tablename__ = "invoice_payments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    invoice_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("invoices.id", ondelete="CASCADE"), index=True
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(15, 2))
    method: Mapped[str] = mapped_column(
        SqlEnum("cash", "transfer", "balance", "other", name="payment_method"),
        default="cash",
        server_default="cash",
    )
    paid_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.current_timestamp(), default=func.current_timestamp()
    )
    recorded_by_manager_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("managers.id", ondelete="SET NULL"), nullable=True
    )
    reference: Mapped[str | None] = mapped_column(String(128), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.current_timestamp(), default=func.current_timestamp()
    )


class ManagerLedger(Base):
    """Append-only ledger of every balance change for a manager."""

    __tablename__ = "manager_ledger"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    manager_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("managers.id", ondelete="CASCADE"), index=True
    )
    entry_type: Mapped[str] = mapped_column(
        SqlEnum(
            "credit",
            "debit",
            "invoice_payment",
            "profit_share",
            "manual_adjustment",
            "opening_balance",
            name="ledger_entry_type",
        ),
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(15, 2))
    balance_after: Mapped[Decimal] = mapped_column(Numeric(15, 2))
    related_invoice_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("invoices.id", ondelete="SET NULL"), nullable=True
    )
    recorded_by_manager_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("managers.id", ondelete="SET NULL"), nullable=True
    )
    description: Mapped[str | None] = mapped_column(String(255), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.current_timestamp(), default=func.current_timestamp()
    )


# --- Phase 4: WhatsApp + notifications ----------------------------------


class WhatsAppSession(Base):
    """Connection state of the per-deployment WhatsApp gateway."""

    __tablename__ = "whatsapp_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    label: Mapped[str] = mapped_column(String(64), default="default", unique=True)
    connected: Mapped[bool] = mapped_column(Boolean, default=False)
    jid: Mapped[str | None] = mapped_column(String(128), nullable=True)
    last_error: Mapped[str | None] = mapped_column(String(512), nullable=True)
    last_status_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.current_timestamp(), default=func.current_timestamp()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        server_default=func.current_timestamp(),
        default=func.current_timestamp(),
        onupdate=func.current_timestamp(),
    )


class NotificationTemplate(Base):
    """Manager-authored WhatsApp message template."""

    __tablename__ = "notification_templates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(128))
    event: Mapped[str] = mapped_column(
        SqlEnum(
            "custom",
            "renewal_reminder",
            "expired",
            "debt_warning",
            "invoice_issued",
            "welcome",
            name="notification_event",
        ),
        default="custom",
    )
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    body_ar: Mapped[str | None] = mapped_column(Text, nullable=True)
    body_en: Mapped[str | None] = mapped_column(Text, nullable=True)
    config: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.current_timestamp(), default=func.current_timestamp()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        server_default=func.current_timestamp(),
        default=func.current_timestamp(),
        onupdate=func.current_timestamp(),
    )


class Notification(Base):
    """Append-only delivery log for WhatsApp / future channels."""

    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    subscriber_username: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    manager_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("managers.id", ondelete="CASCADE"), index=True
    )
    template_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("notification_templates.id", ondelete="SET NULL"), nullable=True
    )
    channel: Mapped[str] = mapped_column(
        SqlEnum("whatsapp", name="notification_channel"), default="whatsapp"
    )
    event: Mapped[str] = mapped_column(
        SqlEnum(
            "custom",
            "renewal_reminder",
            "expired",
            "debt_warning",
            "invoice_issued",
            "welcome",
            name="notification_event_log",
        ),
        default="custom",
    )
    phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    body: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(
        SqlEnum("pending", "sent", "failed", name="notification_status"),
        default="pending",
        index=True,
    )
    error: Mapped[str | None] = mapped_column(String(512), nullable=True)
    provider_message_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.current_timestamp(), default=func.current_timestamp()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        server_default=func.current_timestamp(),
        default=func.current_timestamp(),
        onupdate=func.current_timestamp(),
    )
