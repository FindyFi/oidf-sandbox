# OpenID Federation sandbox UI

To install dependencies:

```bash
npm install
```

To run:

```bash
npm run index.js
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

ssh $ADMIN_USERNAME@$VM_IP "mkdir -p github && cd github && git clone 'https://github.com/FindyFi/oidf-sandbox.git'"

scp env.sh ${ADMIN_USERNAME}@{$VM_IP}:github/oidf-sandbox
ssh $ADMIN_USERNAME@$VM_IP "cd github/oidf-sandbox && npm install && source env.sh && pm2 start --name ${HOSTNAME} index.js && pm2 save"

ssh $ADMIN_USERNAME@$VM_IP "pm2 logs"

ssh $ADMIN_USERNAME@$VM_IP "cd github/oidf-sandbox && git stash && git pull && source env.sh && npm update && pm2 restart 0 --update-env"

```
