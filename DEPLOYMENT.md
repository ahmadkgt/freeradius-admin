# Deployment guide / دليل النشر

> Deploy the FreeRADIUS admin panel on a public Ubuntu VPS (22.04 / 24.04). The panel will be reachable directly from the internet, protected by a real login page.

## 1. Architecture

```
[Internet]
    │   :80 / :443
    ▼
[ host nginx ]    reverse proxy → 127.0.0.1:8080
    │
    ▼
[ frontend container ]   serves the React SPA
    │   /api/*  →
    ▼
[ backend container ]    FastAPI + JWT auth
    │
    ▼
[ db container ]         MySQL 8.4 (bound to 127.0.0.1:3306 only)
```

- All three containers run on a private Docker network.
- MySQL and the FastAPI backend are bound to `127.0.0.1` on the host — only the host nginx can reach them.
- Authentication: a panel admin (separate from RADIUS users) signs in at `/login`. JWT tokens guard every `/api/*` route except `/api/auth/login`.

## 2. Quick start (one command)

```bash
# 1. Clone the repo
git clone https://github.com/ahmadkgt/freeradius-admin.git
cd freeradius-admin

# 2. Run the bootstrap script (installs Docker, nginx, ufw; generates secrets; starts the stack)
sudo bash deploy/setup-vps.sh
```

The script prints the initial admin password at the end. **Save it.** Then open `http://<your-vps-ip>/` in a browser and sign in.

## 3. Manual setup (step by step)

If you prefer to do it manually instead of running the script:

### 3.1 — Install Docker

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg lsb-release
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
```

### 3.2 — Clone the repo

```bash
git clone https://github.com/ahmadkgt/freeradius-admin.git
cd freeradius-admin
```

### 3.3 — Configure secrets

```bash
cp .env.example .env
# Generate a JWT secret
python3 -c "import secrets; print(secrets.token_urlsafe(48))"
# Edit .env — replace every CHANGE_ME_* with a strong value
nano .env
chmod 600 .env
```

`INITIAL_ADMIN_USERNAME` / `INITIAL_ADMIN_PASSWORD` is used **only on first startup** to create the bootstrap admin in the `admin_users` table. After you log in for the first time, change the password from inside the panel.

### 3.4 — Start the stack

```bash
sudo docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
sudo docker compose ps
sudo docker compose logs -f backend
```

The backend automatically creates the `admin_users` table and seeds the initial admin if there isn't one yet.

### 3.5 — Host nginx + firewall

```bash
sudo apt-get install -y nginx
sudo cp deploy/nginx.conf /etc/nginx/sites-available/freeradius-admin
sudo ln -sf /etc/nginx/sites-available/freeradius-admin /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

Now open `http://<your-vps-ip>/` — you should see the login page.

## 4. Adding a domain + HTTPS

1. Point an A record to the VPS public IP, e.g. `radius.example.com → 1.2.3.4`.
2. Edit `/etc/nginx/sites-available/freeradius-admin` and replace `server_name _;` with `server_name radius.example.com;`. Reload nginx.
3. Issue a Let's Encrypt cert:
   ```bash
   sudo apt-get install -y certbot python3-certbot-nginx
   sudo certbot --nginx -d radius.example.com
   ```
   Certbot patches the nginx config to redirect HTTP → HTTPS and renews automatically via systemd timer.

## 5. Operations

| Task                | Command                                                                                   |
|---------------------|-------------------------------------------------------------------------------------------|
| Tail logs           | `sudo docker compose logs -f backend`                                                     |
| Restart             | `sudo docker compose restart backend`                                                     |
| Pull updates        | `git pull && sudo docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build` |
| Backup DB           | `sudo docker compose exec db sh -c 'exec mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" radius' > radius-$(date +%F).sql` |
| Restore DB          | `cat backup.sql \| sudo docker compose exec -T db sh -c 'exec mysql -uroot -p"$MYSQL_ROOT_PASSWORD" radius'` |
| Stop stack          | `sudo docker compose down`                                                                |
| Wipe everything     | `sudo docker compose down -v` *(deletes the DB volume — data is gone!)*                   |

### Daily DB backup (cron)

```bash
sudo crontab -e
# Add (every day at 03:30):
30 3 * * * cd /root/freeradius-admin && /usr/bin/docker compose exec -T db sh -c 'exec mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" radius' | gzip > /root/backups/radius-$(date +\%F).sql.gz
```

## 6. Security checklist

- [x] All secrets in `.env`, file mode `600`, **never committed**.
- [x] `JWT_SECRET` is unique per deployment (regenerate if you ever leak it — every issued token will be invalidated).
- [x] MySQL bound to `127.0.0.1` — never exposed to the public internet.
- [x] FastAPI backend bound to `127.0.0.1` — only host nginx reaches it.
- [x] `ufw` allows only SSH + 80 + 443.
- [ ] Configured TLS (Let's Encrypt) once you have a domain (§4).
- [ ] Changed the initial admin password from inside the panel.
- [ ] Set up off-VPS DB backups (rsync the `/root/backups/` folder somewhere safe).

## 7. FreeRADIUS server integration

The `radius` MySQL database used by this panel is the **standard FreeRADIUS schema**. You can:

- Run FreeRADIUS *on the same VPS* and point its `mods-config/sql/main/mysql/queries.conf` to `localhost:3306` with the credentials in `.env`.
- Or run FreeRADIUS *elsewhere* and replicate / point both at the same remote DB.

Either way, the panel and the RADIUS daemon share `radcheck`, `radreply`, `radgroupcheck`, `radgroupreply`, `radusergroup`, `radacct`, `radpostauth`, and `nas`. No schema changes required.

---

## دليل النشر (عربي)

> نشر لوحة إدارة FreeRADIUS على VPS بنظام Ubuntu (22.04 أو 24.04) متاح للإنترنت، محميّة بصفحة تسجيل دخول حقيقية.

### 1. البنية

```
[الإنترنت] → :80/:443 → nginx على الخادم → 127.0.0.1:8080
                                          ↳ frontend container (React)
                                              ↳ /api → backend container (FastAPI + JWT)
                                                    ↳ db container (MySQL على 127.0.0.1 بس)
```

- MySQL وFastAPI مربوطين على `127.0.0.1` فقط (مش معرّضين لشبكة الإنترنت).
- المصادقة: مسؤول يدخل من `/login` ويحصل على JWT token. كل `/api/*` يطلب توكن صالح ما عدا `/api/auth/login`.

### 2. التشغيل السريع (أمر واحد)

```bash
git clone https://github.com/ahmadkgt/freeradius-admin.git
cd freeradius-admin
sudo bash deploy/setup-vps.sh
```

السكريبت ده بيعمل:
- يثبّت Docker وnginx وufw.
- يولّد `.env` بكلمات سر قوية عشوائياً.
- يطبع كلمة سر المسؤول الأولية في الآخر — **احفظها فوراً**.
- يشغّل الـ stack بكامله.

افتح المتصفح على `http://<عنوان_VPS>/` وسجّل الدخول بالاسم `admin` وكلمة السر اللي طبعها السكريبت.

### 3. النشر اليدوي

اتبع الأقسام الإنجليزية 3.1 → 3.5 أعلاه. خطوات النشر اليدوي مفصّلة هناك بالأوامر الكاملة.

### 4. إضافة دومين + HTTPS

ارجع للقسم الإنجليزي §4. الخطوات:

1. اربط A record على الدومين بعنوان VPS.
2. عدّل `server_name` في `/etc/nginx/sites-available/freeradius-admin` لاسم الدومين بدل `_`.
3. شغّل `sudo certbot --nginx -d your-domain.example.com` للحصول على شهادة Let's Encrypt مجاناً (بتتجدد تلقائياً).

### 5. التشغيل والصيانة

أهم الأوامر اليومية:

```bash
# مشاهدة الـ logs
sudo docker compose logs -f backend

# تحديث للنسخة الأحدث من GitHub
git pull
sudo docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

# نسخة احتياطية للـ DB
sudo docker compose exec db sh -c 'exec mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" radius' > radius-$(date +%F).sql

# إيقاف الـ stack
sudo docker compose down
```

### 6. تحقق أمني

- ☑ كل الـ secrets في ملف `.env` بصلاحيات `600`، **مش مرفوع على git**.
- ☑ `JWT_SECRET` فريد لكل deployment.
- ☑ MySQL مربوط على `127.0.0.1` بس.
- ☑ FastAPI مربوط على `127.0.0.1` بس.
- ☑ `ufw` يسمح بـ SSH + 80 + 443 فقط.
- ☐ تفعيل TLS (Let's Encrypt) لما يبقى عندك دومين.
- ☐ تغيير كلمة سر المسؤول من داخل اللوحة بعد أول تسجيل دخول.
- ☐ نسخ احتياطية يومية للـ DB إلى مكان خارج الـ VPS.

### 7. الدمج مع FreeRADIUS

قاعدة البيانات اللي اللوحة شغّالة عليها هي **schema الـ FreeRADIUS الرسمي** بحذافيره. تقدر تشغّل FreeRADIUS على نفس الـ VPS ويوصل لـ `localhost:3306` بنفس بيانات الدخول اللي في `.env`، أو تخلّيه على خادم تاني وتربط الاتنين بنفس الـ DB.

---

**مهم**: المنفذ 1812/1813 (RADIUS UDP) لو هتشغّل FreeRADIUS على نفس الـ VPS، اسمحلهم في ufw من شبكتك بس:
```bash
sudo ufw allow from 10.0.0.0/8 to any port 1812 proto udp
sudo ufw allow from 10.0.0.0/8 to any port 1813 proto udp
```
