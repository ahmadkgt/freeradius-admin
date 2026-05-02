# FreeRADIUS integration / دمج FreeRADIUS

> Install FreeRADIUS 3.x on the same Ubuntu VPS as the panel and wire it into the panel's MySQL database, so the data you manage in the UI is the data the RADIUS daemon authenticates against.

---

## What this gives you

| You do this in the panel UI | The RADIUS daemon picks it up… |
|---|---|
| Add a user under **Users**, with `Cleartext-Password` | …on the next `Access-Request` (no restart) |
| Edit a user's reply attributes (Framed-IP, etc.) | …on the next `Access-Request` (no restart) |
| Change a group's `Session-Timeout` / rate-limit / etc. | …on the next `Access-Request` (no restart) |
| Add or remove a NAS / RADIUS client in **NAS / Clients** | …after `sudo systemctl reload freeradius` (cached in memory) |
| Watch live login attempts | The **Auth log** page reads `radpostauth`, written by FreeRADIUS post-auth |
| Watch live sessions and bandwidth | The **Accounting** page reads `radacct`, written by FreeRADIUS accounting |

This is real, two-way integration — not a dashboard sitting on top of a separate dataset.

## Architecture

```
[Internet] :80/:443 ──► host nginx ──► panel frontend ──► panel backend ──► MySQL :3306
                                                                          ▲
[NAS / AP / Router] :1812/:1813 (UDP) ─────► FreeRADIUS daemon ───────────┘
                                                (same MySQL, same tables)
```

Everything runs on the same VPS:
- The panel + MySQL run inside Docker (compose).
- FreeRADIUS runs natively (apt-installed) and connects to MySQL on `127.0.0.1:3306` using the same credentials in `.env`.

## Prerequisites

- The panel is already deployed and `http://<vps-ip>/` shows the login page (see `DEPLOYMENT.md`).
- Project root contains `.env` (created by `deploy/setup-vps.sh`).
- You have `sudo` on the VPS.

## 1. Install + configure FreeRADIUS

From the repo root on the VPS:

```bash
sudo bash deploy/freeradius/install-freeradius.sh
```

The script:

1. Installs `freeradius`, `freeradius-mysql`, and `freeradius-utils` from apt.
2. Reads `MYSQL_USER` / `MYSQL_PASSWORD` / `MYSQL_DATABASE` from `.env` and patches `/etc/freeradius/3.0/mods-available/sql`:
   - `dialect = "mysql"`, `driver = "rlm_sql_mysql"`
   - `server = "127.0.0.1"`, `port = 3306`
   - `login` / `password` / `radius_db` from `.env`
   - **`read_clients = yes`** — so FreeRADIUS reads NAS clients from the panel's `nas` table on every reload.
   - Comments out the unused `tls {}` sub-block (it would otherwise fail the parser by referring to `/etc/ssl/certs/my_ca.crt`).
3. `chmod 640` + `chown root:freerad` the sql config (it now contains the DB password).
4. Symlinks `mods-enabled/sql` → `../mods-available/sql`. The default Ubuntu/Debian `sites-enabled/default` and `sites-enabled/inner-tunnel` already reference `-sql` in `authorize`, `accounting`, and `post-auth`, so enabling the module is enough.
5. Restarts and enables `freeradius.service`.
6. Smoke-tests with `radtest alice alice123 127.0.0.1 0 testing123` and aborts if it doesn't get an `Access-Accept`.

After it finishes, FreeRADIUS is up and bound to **UDP 1812 (auth)** + **UDP 1813 (accounting)**.

> **Re-running the script is safe.** It keeps a one-time backup at `/etc/freeradius/3.0/mods-available/sql.dist` and re-derives the configured file from that backup every run, so it converges to the same state.

## 2. Open the firewall for your NAS

By default, the script does **not** open the RADIUS UDP ports — only your NAS devices should be able to talk to FreeRADIUS, not the public internet.

Set `RADIUS_ALLOW_FROM` to your NAS subnet and re-run, or do it manually:

```bash
sudo ufw allow from 10.0.0.0/8 to any port 1812 proto udp
sudo ufw allow from 10.0.0.0/8 to any port 1813 proto udp
```

(Adjust `10.0.0.0/8` to match where your routers / APs / hotspots actually sit.)

## 3. Add your NAS devices in the panel

Go to **NAS / Clients** in the panel and add an entry for each router / AP / hotspot that will send RADIUS requests:

| Field        | Example                |
|--------------|------------------------|
| `nasname`    | `192.168.1.1` (the device's IP) |
| `shortname`  | `router-main`          |
| `type`       | `mikrotik` / `cisco` / `other` |
| `secret`     | a random shared secret |
| `description`| free-text              |

Then reload FreeRADIUS so it re-reads the `nas` table:

```bash
sudo systemctl reload freeradius
```

You can confirm it picked up your new client:

```bash
sudo journalctl -u freeradius -n 30 --no-pager | grep "Adding client"
```

## 4. Verify the round-trip

From the VPS itself, you can test against the seeded `alice` user with the default `localhost` client (secret `testing123`, baked into `/etc/freeradius/3.0/clients.conf`):

```bash
radtest alice alice123 127.0.0.1 0 testing123
```

You should see something like:

```
Sent Access-Request Id ... to 127.0.0.1:1812 ...
Received Access-Accept Id ...
        Framed-IP-Address = 10.10.0.10
        Session-Timeout = 86400
        Idle-Timeout = 600
```

The reply attributes confirm:
- `radcheck` was read (the password matched).
- `radreply` was read (the per-user `Framed-IP-Address`).
- `radusergroup` + `radgroupreply` were read (the `admins` group's `Session-Timeout` and `Idle-Timeout`).

Now refresh the panel:
- The **Auth log** page shows the new `Access-Accept` row for `alice`.
- The **Dashboard** "Accepts today" counter increments.

To test accounting (sessions on the Accounting page):

```bash
cat > /tmp/acct-start.txt <<'EOF'
Acct-Status-Type = Start
Acct-Session-Id = "MYSESSION-001"
User-Name = "alice"
NAS-IP-Address = 127.0.0.1
NAS-Port = 0
Framed-IP-Address = 10.10.0.10
Acct-Authentic = "RADIUS"
EOF
radclient -r 1 -t 3 127.0.0.1:1813 acct testing123 < /tmp/acct-start.txt
```

The session should show up immediately as **Active** in the panel's Accounting page.

## 5. Operations

| Task                                  | Command                                    |
|---------------------------------------|--------------------------------------------|
| Tail live RADIUS log                  | `sudo journalctl -u freeradius -f`         |
| Reload after editing NAS clients in panel | `sudo systemctl reload freeradius`     |
| Run in foreground for debugging       | `sudo systemctl stop freeradius && sudo freeradius -X` |
| Check config syntax                   | `sudo freeradius -CX`                      |
| Restart                               | `sudo systemctl restart freeradius`        |

When something is wrong, `sudo freeradius -X` is your best friend — it runs in the foreground with full debug output and shows you every SQL query and every attribute decision.

## 6. Production checklist

- [ ] `RADIUS_ALLOW_FROM` is **not** `0.0.0.0/0`. RADIUS UDP must only be reachable from your NAS subnet.
- [ ] The shared secrets in your `nas` table are long random strings, not `testing123`. (`testing123` is fine for the local `clients.conf` test, but never reuse it for real devices.)
- [ ] You've removed the seeded test users (`alice`, `bob`, `charlie`, `ahmad`, `fatima`, `omar`, `layla`) before going live. Delete them from the panel under **Users**.
- [ ] You've stored real passwords as `Crypt-Password` or `SHA2-Password` instead of `Cleartext-Password`. (FreeRADIUS supports both — pick a hash that matches what the rest of your auth chain expects.)
- [ ] `/etc/freeradius/3.0/mods-available/sql` is `mode 640`, `root:freerad` (the install script does this). Verify with `ls -l /etc/freeradius/3.0/mods-available/sql`.
- [ ] You're backing up the `radius` database daily (see `DEPLOYMENT.md` §5).

---

## دليل دمج FreeRADIUS (عربي)

> تثبيت FreeRADIUS 3.x على نفس VPS اللوحة وربطه بـ MySQL بتاع اللوحة، عشان أي بيانات تديرها من الـ UI تكون هي اللي بيوثّق عليها سيرفر RADIUS مباشرة.

### الفائدة باختصار

| اللي بتعمله من اللوحة | RADIUS بيلتقطها… |
|---|---|
| تضيف مستخدم في **Users** بكلمة مرور | في أول `Access-Request` (بدون إعادة تشغيل) |
| تعدّل reply attributes (مثل Framed-IP) | في أول `Access-Request` (بدون إعادة تشغيل) |
| تغيّر Session-Timeout أو rate-limit للمجموعة | في أول `Access-Request` (بدون إعادة تشغيل) |
| تضيف/تشيل NAS من **NAS / Clients** | بعد `sudo systemctl reload freeradius` |
| تشاهد محاولات الدخول لحظة بلحظة | صفحة **Auth log** بتقرا `radpostauth` (FreeRADIUS بيكتب فيها) |
| تشاهد الجلسات والـ bandwidth | صفحة **Accounting** بتقرا `radacct` (FreeRADIUS بيكتب فيها) |

ده تكامل ثنائي الاتجاه حقيقي — مش لوحة ساكنة على بيانات منفصلة.

### المعمارية

```
[الإنترنت] :80/:443 ──► nginx ──► واجهة اللوحة ──► backend ──► MySQL :3306
                                                              ▲
[NAS / Router / Hotspot] :1812/:1813 (UDP) ──► FreeRADIUS ────┘
                                                  (نفس DB، نفس الجداول)
```

كل حاجة على نفس الـ VPS:
- اللوحة + MySQL داخل Docker.
- FreeRADIUS على النظام (apt) ومتصل بـ MySQL على `127.0.0.1:3306` بنفس بيانات الدخول من `.env`.

### المتطلبات

- اللوحة متنشّرة فعلاً (راجع `DEPLOYMENT.md`).
- `.env` موجود في جذر المشروع.
- صلاحيات `sudo`.

### 1. التثبيت والإعداد

من جذر المشروع على الـ VPS:

```bash
sudo bash deploy/freeradius/install-freeradius.sh
```

السكريبت:

1. يثبّت `freeradius` + `freeradius-mysql` + `freeradius-utils`.
2. يقرا بيانات MySQL من `.env` ويعدّل `/etc/freeradius/3.0/mods-available/sql`:
   - `dialect = "mysql"` و`driver = "rlm_sql_mysql"`
   - `server = "127.0.0.1"`، `port = 3306`
   - `login` / `password` / `radius_db` من `.env`
   - **`read_clients = yes`** — يعني FreeRADIUS يقرا الـ NAS من جدول `nas` بتاع اللوحة.
   - بيعطّل بلوك `tls {}` الافتراضي (لإنه بيشاور على شهادات غير موجودة وبيمنع التشغيل).
3. يضبط الصلاحيات: `chmod 640` + `chown root:freerad` (الملف فيه كلمة سر الـ DB).
4. يفعّل موديول `sql` بـ symlink. الإعداد الافتراضي لـ Ubuntu/Debian فيه `-sql` في `authorize` و`accounting` و`post-auth` أصلاً، فمجرد تفعيل الموديول بيكفي.
5. يشغّل ويفعّل خدمة `freeradius`.
6. يعمل smoke test: `radtest alice alice123 127.0.0.1 0 testing123` ويفشل لو ما رجّعش `Access-Accept`.

بعد ما يخلص، FreeRADIUS شغّال على UDP 1812 (auth) + UDP 1813 (accounting).

> **إعادة تشغيل السكريبت آمنة** — بيحفظ نسخة من الـ config الأصلية في `mods-available/sql.dist` وبيرجعها قبل ما يطبّق التعديلات تاني، فالنتيجة دايماً نفسها.

### 2. فتح الـ firewall لأجهزة الـ NAS

السكريبت بيسيب بورتات RADIUS مقفولة افتراضياً — أجهزة الـ NAS بتاعتك بس هي اللي المفروض توصل لـ FreeRADIUS مش العالم كله.

```bash
sudo ufw allow from 10.0.0.0/8 to any port 1812 proto udp
sudo ufw allow from 10.0.0.0/8 to any port 1813 proto udp
```

(غيّر `10.0.0.0/8` للـ subnet الفعلي بتاع أجهزتك.)

### 3. إضافة أجهزة الـ NAS من اللوحة

روح لصفحة **NAS / Clients** في اللوحة وضيف entry لكل جهاز (راوتر / AP / hotspot):

| الحقل      | مثال                 |
|------------|----------------------|
| `nasname`  | `192.168.1.1`        |
| `shortname`| `router-main`        |
| `type`     | `mikrotik`/`cisco`   |
| `secret`   | string عشوائي طويل   |

بعدين reload FreeRADIUS عشان يعيد قراءة جدول `nas`:

```bash
sudo systemctl reload freeradius
sudo journalctl -u freeradius -n 30 --no-pager | grep "Adding client"
```

### 4. اختبار الدورة الكاملة

من الـ VPS نفسه (الـ client `localhost` افتراضي بـ secret `testing123`):

```bash
radtest alice alice123 127.0.0.1 0 testing123
```

المفروض يطلع:
```
Received Access-Accept ...
        Framed-IP-Address = 10.10.0.10
        Session-Timeout = 86400
        Idle-Timeout = 600
```

ده بيثبّت إن:
- `radcheck` اتقري (كلمة المرور صح)
- `radreply` اتقري (Framed-IP-Address)
- `radusergroup` + `radgroupreply` اتقروا (Session/Idle Timeout من المجموعة)

افتح اللوحة:
- **Auth log** فيه entry جديد لـ `alice` Accept.
- **Dashboard** عدّاد "Accepts today" زاد.

### 5. أوامر التشغيل اليومية

| المهمة | الأمر |
|---|---|
| متابعة الـ log | `sudo journalctl -u freeradius -f` |
| إعادة تحميل بعد تعديل NAS من اللوحة | `sudo systemctl reload freeradius` |
| تشغيل debug في الـ foreground | `sudo systemctl stop freeradius && sudo freeradius -X` |
| فحص الـ syntax | `sudo freeradius -CX` |

### 6. تحقّق ما قبل الإنتاج

- [ ] بورتات 1812/1813 مش مفتوحة لـ `0.0.0.0/0` — للـ NAS subnet بس.
- [ ] الـ shared secrets في جدول `nas` strings عشوائية طويلة (مش `testing123`).
- [ ] حذفت المستخدمين الافتراضيين (`alice`, `bob`, `charlie`, `ahmad`, `fatima`, `omar`, `layla`) من اللوحة.
- [ ] خزّنت كلمات المرور كـ `Crypt-Password` أو `SHA2-Password` (مش `Cleartext-Password`).
- [ ] `/etc/freeradius/3.0/mods-available/sql` صلاحياته `640 root:freerad`.
- [ ] في نسخ احتياطية يومية للـ DB.
