import Knex from 'knex'

const isPostgres = process.env.DB_TYPE === 'postgres' || !!process.env.DATABASE_URL

export const db = Knex(isPostgres ? {
  client: 'pg',
  connection: process.env.DATABASE_URL,
} : {
  client: 'better-sqlite3',
  connection: { filename: process.env.DB_PATH || 'users.db' },
  useNullAsDefault: true,
})

export async function initDb() {
  if (!await db.schema.hasTable('users')) {
    await db.schema.createTable('users', t => {
      t.increments('id')
      t.text('username').notNullable().unique()
      t.text('password_hash').notNullable()
      t.text('tenant_username').nullable()   // null = super-admin (all tenants)
      t.boolean('is_admin').notNullable().defaultTo(false)
      t.timestamp('created_at').defaultTo(db.fn.now())
    })
    console.log('Created users table')
  }
}
