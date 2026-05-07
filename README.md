# OpenID Federation Trust Registry Admin UI

A web-based administration interface for managing an [OpenID Federation](https://openid.net/specs/openid-federation-1_0.html) Trust Registry. It allows federation operators to onboard and manage subordinate entities — issuers, verifiers, relying parties, and other federation participants — by maintaining their metadata, cryptographic keys, roles, and authority hints.

## Architecture

```text
Browser (HTML/CSS/JS)
        │  HTTP
        ▼
Express.js server (index.js)
        │  @findyfi/trustregistry-admin SDK
        ▼
Trust Registry API (API_URL)
        │  OAuth 2.0 client credentials
        ▼
Auth Server (AUTH_URL)
```

**Backend** (`index.js`) — Node.js/Express. Authenticates with the Trust Registry API using OAuth 2.0 client credentials at startup, then exposes a REST API consumed by the frontend. Handles session-based user authentication backed by a local database.

**Frontend** (`public/`) — Vanilla HTML/CSS/JS. No build step. Displays a table of subordinate entities with add/edit/delete actions and auto-populates metadata by fetching each entity's `.well-known` endpoints.

**Database** (`db.js`) — Knex query builder with SQLite (development) or PostgreSQL (production). Stores user accounts only; all federation data lives in the Trust Registry API.

**Tenant model** — The Trust Registry supports multiple tenants (federation operators), each identified by an account username. Users are assigned to a tenant and can only see and manage that tenant's subordinates. Admin users can see all tenants.

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `API_URL` | Yes | Trust Registry admin API base URL |
| `PUBLIC_URL` | Yes | Public URL of this federation's trust anchor |
| `AUTH_URL` | Yes | OAuth 2.0 token endpoint for API authentication |
| `CLIENT_ID` | Yes | OAuth client ID (stored in 1Password) |
| `CLIENT_SECRET` | Yes | OAuth client secret (stored in 1Password) |
| `SESSION_SECRET` | Recommended | Secret for signing session cookies; random per-startup if not set |
| `DB_TYPE` | No | Set to `postgres` to use PostgreSQL; defaults to SQLite |
| `DATABASE_URL` | If Postgres | PostgreSQL connection string |
| `DB_PATH` | No | SQLite file path; defaults to `./users.db` |
| `PORT` | No | HTTP port; defaults to `3000` |

## Installation

```bash
npm install
```

### First-time setup

Create the first admin user:

```bash
node scripts/add-user.js --username admin --password <password> --admin
```

To add a tenant user, first find the tenant's account username from the running server:

```bash
curl http://localhost:3000/api/tenants   # requires a valid session; use after login
```

Then create the user:

```bash
node scripts/add-user.js --username alice --password <password> --tenant <tenant-username>
```

## Running locally

```bash
source federation.dev.findy.fi.env
node index.js
```

## Deployment to an Azure VM

Run the commands one by one instead of copy-pasting everything.

```bash
HOSTNAME=sandbox.trustregistry.eu
APPNAME=${HOSTNAME}
LOCATION=swedencentral
VM_SIZE=Standard_B1ms
VM_IMAGE=Debian11
ADMIN_USERNAME=findy
NODE_PORT=3000

az group create --name $APPNAME --location $LOCATION

az vm create -g $APPNAME -n $APPNAME --size $VM_SIZE --image $VM_IMAGE --admin-username $ADMIN_USERNAME --generate-ssh-keys --public-ip-sku Standard
az vm open-port --port 22,80,443 -g $APPNAME --name $APPNAME

VM_IP=$(az vm show --show-details -g $APPNAME  --name $APPNAME  --query publicIps --output tsv)

ssh $ADMIN_USERNAME@$VM_IP "sudo timedatectl set-timezone Europe/Helsinki"
ssh $ADMIN_USERNAME@$VM_IP "sudo apt update"
ssh $ADMIN_USERNAME@$VM_IP "sudo apt upgrade -y"
ssh $ADMIN_USERNAME@$VM_IP "sudo apt install certbot curl git nginx python3-certbot-nginx -y"
ssh $ADMIN_USERNAME@$VM_IP "sudo curl -sL https://deb.nodesource.com/setup_22.x | sudo bash -"
ssh $ADMIN_USERNAME@$VM_IP "sudo apt install nodejs -y"
ssh $ADMIN_USERNAME@$VM_IP "sudo npm install -g npm@latest"
ssh $ADMIN_USERNAME@$VM_IP "sudo npm install -g pm2"

cat <<EOF > ${HOSTNAME}.conf
server { 
    root /var/www/html;
    server_name ${HOSTNAME};

    location / {
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-For \$remote_addr;
        proxy_pass http://localhost:${NODE_PORT};
        proxy_ssl_server_name on;
    }
}
EOF

scp ${HOSTNAME}.conf $ADMIN_USERNAME@$VM_IP:

ssh $ADMIN_USERNAME@$VM_IP "sudo mv ${HOSTNAME}.conf /etc/nginx/conf.d/"
rm ${HOSTNAME}.conf

ssh $ADMIN_USERNAME@$VM_IP "sudo systemctl reload nginx"
ssh $ADMIN_USERNAME@$VM_IP "sudo certbot run -m "admin@findy.fi" -d $HOSTNAME"

ssh $ADMIN_USERNAME@$HOSTNAME "mkdir -p github && cd github && git clone 'https://github.com/FindyFi/trustregistry-ui.git'"

scp env.sh ${ADMIN_USERNAME}@${HOSTNAME}:github/trustregistry-ui
ssh $ADMIN_USERNAME@$HOSTNAME "cd github/trustregistry-ui && npm install && source env.sh && pm2 start --name ${HOSTNAME} index.js && pm2 save"

ssh $ADMIN_USERNAME@$HOSTNAME "pm2 logs"

ssh $ADMIN_USERNAME@$HOSTNAME "cd github/trustregistry-ui && git stash && git pull && source env.sh && npm update && pm2 restart 0 --update-env"
```

## Updating a running deployment

Log on to the server:

```sh
HOSTNAME=sandbox.trustregistry.eu
ADMIN_USERNAME=findy
ssh $ADMIN_USERNAME@$HOSTNAME
```

Reset environment variables if needed:

```sh
export API_URL='https://admin.findy.trustregistry.eu'
export PUBLIC_URL='https://findy.trustregistry.eu'
export AUTH_URL='https://auth.staging.findy.fi/realms/trustregistry-eu/protocol/openid-connect/token'
export CLIENT_ID='... (stored in 1Password) ...'
export CLIENT_SECRET='... (stored in 1Password) ...'
export SESSION_SECRET='... (stored in 1Password) ...'
```

Update service:

```sh
cd ~/github/trustregistry-ui
git stash
git pull
npm update
pm2 restart 2 --update-env
```
