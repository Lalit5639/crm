# Phoenix CRM SQL Setup

Ye project MySQL database `phoenix_crm` use karta hai.

## 1. MySQL config

Root folder ke `.env` file mein apne MySQL credentials set karein:

```env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=apna_mysql_password
DB_NAME=phoenix_crm
DB_PORT=3307
```

Agar aapka MySQL port `3306` par hai, to `DB_PORT=3306` kar dein.

## 2. Database create/import

```bash
npm run db:init
```

Is command se `database/schema.sql` import hoga aur tables create ho jayengi.

Default login:

```text
username: admin
password: 1234
```

## 3. Server start

```bash
npm start
```

Backend URL:

```text
http://localhost:5000
```
