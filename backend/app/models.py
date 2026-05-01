from datetime import datetime

from sqlalchemy import BigInteger, Boolean, DateTime, Integer, String, func
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


class AdminUser(Base):
    """Panel administrator. Separate from RADIUS users — these are operators who log into the UI."""

    __tablename__ = "admin_users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.current_timestamp(), default=func.current_timestamp()
    )
