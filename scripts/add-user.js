#!/usr/bin/env node
import {parseArgs} from 'node:util'
import bcrypt from 'bcryptjs'
import {db, initDb} from '../db.js'

const {values} = parseArgs({
  options: {
    username: {type: 'string'},
    password: {type: 'string'},
    tenant:   {type: 'string'},
    admin:    {type: 'boolean', default: false},
  },
  strict: false,
})

if (!values.username || !values.password) {
  console.error('Usage: node scripts/add-user.js --username <u> --password <p> [--tenant <tenant-username>] [--admin]')
  console.error('  Use GET /api/tenants to find tenant usernames.')
  console.error('  --admin grants super-admin access (all tenants); --tenant is not required for admins.')
  process.exit(1)
}
if (!values.admin && !values.tenant) {
  console.error('Error: --tenant is required for non-admin users')
  process.exit(1)
}

await initDb()

const existing = await db('users').where({username: values.username}).first()
if (existing) {
  console.error(`Error: user "${values.username}" already exists`)
  await db.destroy()
  process.exit(1)
}

const password_hash = await bcrypt.hash(values.password, 10)
await db('users').insert({
  username:        values.username,
  password_hash,
  tenant_username: values.admin ? null : values.tenant,
  is_admin:        values.admin,
})

console.log(`Created user: ${values.username}${values.admin ? ' (admin)' : ` → tenant ${values.tenant}`}`)
await db.destroy()
