import {randomUUID} from 'node:crypto';
import express from 'express'
import { Admin } from './admin.js'

const apiUrl = process.env.API_URL
const publicUrl = process.env.PUBLIC_URL
const authUrl = process.env.AUTH_URL
const clientId = process.env.CLIENT_ID
const clientSecret = process.env.CLIENT_SECRET
const port = process.env.PORT || 3000

if (!apiUrl || !authUrl || !clientId || !clientSecret) {
  console.error('Missing one of the required environment variables: API_URL, AUTH_URL, CLIENT_ID, CLIENT_SECRET')
  process.exit(1)
}

const oidf = new Admin(apiUrl)
const apiKey = await oidf.authenticate(authUrl, clientId, clientSecret)

const app = express();
app.use(express.json())
app.use(express.static('public'))

app.get('/api/accounts', async (req, res) => {
  try {
    const accs = await oidf.accounts()
    res.json(accs)
  } catch (e) {
    console.error(e)
    res.status(500).json(e)
  }
})

app.get('/api/configuration/:id', async (req, res) => {
  const subId = req.params.id
  const acc = await getAccountByIdentifier(oidf, subId)
  if (!acc) {
    res.status(404).json({error: `Account with identifier ${subId} not found`})
    return
  }
  try {
    let key = null
    const keys = await oidf.getKeys(acc.username)
    console.log(JSON.stringify(keys, null, 1))
    for (const k of keys) {
      if (k.kmsKeyRef && k.kid && k.use == 'sig' && k.alg == 'ES256') {
        key = k
        break
      }
    }
    if (!key) {
      key = await oidf.createKey(randomUUID(), 'ES256', acc.username)
      console.log(JSON.stringify(key, null, 1))
      console.log('New key:', key)
    }
    // const config = await oidf.getEntityConfiguration(subId)
    const config = await oidf.getEntityConfiguration(acc.username)
    console.log('Entity configuration:', JSON.stringify(config, null, 1))
    const result = await oidf.publishEntityConfiguration(key.kmsKeyRef, key.kid, false, acc.username)
    console.log('Published entity configuration:', result)
    res.header('Content-Type', 'application/entity-statement+jwt')
    res.send(result)
  } catch (e) {
    console.error(e)
    res.status(500).json(e)
  }
})

app.get('/api/subordinates', async (req, res) => {
  try {
    const results = await oidf.getSubordinates()
    for (const sub of results) {
      const metadata = await oidf.getSubordinateMetadata(sub.id)
      sub.metadata = {}
      for (const entry of metadata) {
        sub.metadata[entry.key] = entry.metadata
      }
      const jwks = await oidf.getSubordinateJWKS(sub.id)
      sub.jwks = []
      for (const entry of jwks) {
        sub.jwks.push(entry.key)
      }
    }
    res.json(results)
  } catch (e) {
    console.error(e)
    res.status(500).json(e)
  }
})

app.get('/api/subordinates/:id', async (req, res) => {
  try {
    res.json(await oidf.getSubordinateStatement(req.params.id))
  } catch (e) {
    console.error(e)
    res.status(500).json(e)
  }
})

app.post('/api/subordinates', async (req, res) => {
  try {
    const json = req.body
    console.log('adding a subordinate', JSON.stringify(json, null, 1))
    const results = {}

    const identifier = json.identifier
    if (!identifier) {
      results.identifierError = 'identifier is required in the request body'
    }
    const name = json.metadata?.federation_entity?.organization_name
    if (!name) {
      results.nameError = 'metadata.federation_entity.organization_name is required in the request body'
    }
    if (results.identifierError || results.nameError) {
      throw new Error(JSON.stringify(results))
    }

    let acc = await getAccountByIdentifier(oidf, identifier)
    if (acc && acc.username == name) {
      results['Existing account'] = acc
      results['Deleted entity metadata'] = await deleteMetadata(oidf, acc.username, null)
    }
    else if (acc) {
      results[`Deleted existing account with different name ${acc.username}`] = await oidf.deleteAccount(acc.username)
      acc = null
    }
    if (!acc) {
      acc = await oidf.createAccount(name, identifier)
      results['New account'] = acc
    }

    const key = await oidf.createKey(randomUUID(), 'ES256', name)
    results['New key'] = key

    const hint = await oidf.addAuthorityHint(publicUrl, name)
    results['Added authority hint'] = hint

    const sub = await oidf.addSubordinate(identifier)
    results['New subordinate'] = sub
    if (json.roles) {
      results['Added subordinate roles'] = await addRoles(oidf, sub.id, json.roles)
    }
    const addResp = await addMetadata(oidf, json.metadata, name, sub.id)
    results['New subordinate metadata'] = JSON.stringify(addResp, null, 1)
    results[`Subordinate key sets:`] = await addSubordinateJWKS(oidf, sub.id, json.jwks)
    results['Published subordinate metadata'] = await oidf.publishSubordinateStatement(sub.id)
    res.json(results)
  } catch (e) {
    console.error(e)
    res.status(500).json(e)
  }
})

app.put('/api/subordinates/:id', async (req, res) => {
  try {
    const subId = req.params.id
    const json = req.body
    console.log(`mofidying the subordinate ${subId}`, JSON.stringify(json, null, 1))
    const results = {}
    const currentAccounts = await oidf.accounts()
    let acc = await getAccountByIdentifier(oidf, json.identifier)
    if (!acc) {
      const name = json.name || json.metadata?.federation_entity?.organization_name
      if (!name) {
        throw new Error('name is required in the request body to create a new account')
      }
      acc = await oidf.createAccount(json.name, json.identifier)
      results['Created new account'] = acc
    }
    results['Deleted entity metadata'] = await deleteMetadata(oidf, acc.username, subId)
    results['Deleted entity keys'] = await deleteKeys(oidf, subId)
    results[`Key sets:`] = await addSubordinateJWKS(oidf, subId, json.jwks)
    if (json.roles) {
      results['Added roles'] = await addRoles(oidf, subId, json.roles)
    }
    const addResp = await addMetadata(oidf, json.metadata, acc.username, subId)
    results['New subordinate metadata'] = JSON.stringify(addResp, null, 1)
    const existingHints = await oidf.getAuthorityHints(acc.username)
    for (const hint of existingHints) {
      results['Deleted existing authority hint'] = await oidf.deleteAuthorityHint(hint.id, acc.username)
    }
    results['Added authority hint'] = await oidf.addAuthorityHint(publicUrl, acc.username)
    results['Published subordinate metadata'] = await oidf.publishSubordinateStatement(subId)
    res.json(results)
  } catch (e) {
    console.error(e)
    res.status(500).json(e)
  }
})

app.delete('/api/subordinates/:id', async (req, res) => {
  console.log('DELETING', req.params.id)
  try {
    const results = {}
    const acc = await getAccountByIdentifier(oidf, req.params.id)
    if (acc) {
      results['Deleted account'] = await oidf.deleteAccount(acc.username)
    }
    results['Deleted subordinate'] = await oidf.deleteSubordinate(req.params.id)
    res.json(results)
  } catch (e) {
    console.error(e)
    res.status(500).json(e)
  }
})

app.get('/api/proxy/:uri', async (req, res) => {
  try {
    const resp = await fetch(req.params.uri)
    if (resp.ok) {
      if (resp.headers['Content-Type'] == 'application/json') {
        res.json(await resp.json())
        return
      }
      else {
        res.send(await resp.text())
        return
      }
    }
    res.status(404).json({error: `${req.params.uri} not found`})
  } catch (e) {
    console.error(e)
    res.status(500).json(e)
  }
})

app.get('/api/getMetadata/:metadataKey/:identifier', async (req, res) => {
  console.log(req.params)
  try {
    const {identifier, metadataKey} = req.params

    let actorMetadata
    // first, try the "modern" .well-known location
    const url1 = new URL(identifier)
    const path1 = `/.well-known/${metadataKey}${url1.pathname}`
    url1.pathname = path1
    actorMetadata = url1.toString()
    console.log('Fetching metadata from', actorMetadata)
    let resp = await fetch(actorMetadata)
    if (resp.status == 404) {
      // if not found, try the legacy location without .well-known
      const url2 = new URL(identifier)
      const path2 = `${url2.pathname.replace(/\/$/, '')}/.well-known/${metadataKey}`
      url2.pathname = path2
      actorMetadata = url2.toString()
      console.log('Fetching metadata from', actorMetadata)
      resp = await fetch(actorMetadata)
    }
    if (resp.ok) {
      try {
        const metadata = await resp.json()
        res.json(metadata)
        return
      }
      catch (e) {
        console.warn('Error parsing JSON', e, req.params)
      }
    }
    console.warn(resp.status, actorMetadata)
    res.status(404).json({error: `Could not get ${actorMetadata}`})
  } catch (e) {
    console.error(e)
    res.status(500).json(e)
  }
})

app.listen(port, () =>
  console.log(`Server running at port ${port}`),
)

async function getAccountByIdentifier(oidf, identifier) {
  const accounts = await oidf.accounts()
  for (const acc of accounts) {
    if (acc.identifier == identifier) {
      return acc
    }
  }
  return null
}

async function addSubordinateJWKS(oidf, subId, jwks) {
  const results = {}
  for (const key of jwks) {
    // hack to make the federation server accept the key
    key.alg = key.alg || 'ES256'
    const jwks = await oidf.addSubordinateJWKS(subId, key)
    results[`New subordinate JWKS:`] = jwks
  }
  return results
}

async function addRoles(oidf, subId, roles) {
  let entry = {
    key: 'roles',
    metadata: roles
  }
  return await oidf.addSubordinateMetadata(subId, entry)
 }

async function addPolicy(oidf) {
  let entry = {
    key: 'metadata_policy',
    policy: {
      "openid_credential_issuer": {
        "credential_configurations_supported": {
          "credential_signing_alg_values_supported": {
            "default": ["ES256"]
          }
        }
      }
    }
  }
  return await oidf.createMetadataPolicy(entry)
}

async function addMetadata(oidf, metadata, name, subId) {
  const results = {}
  for (const key in metadata) {
    const entry = {
      key: key,
      metadata: metadata[key]
    }
    results[key] = await oidf.createMetadata(entry, name)
    if (subId) {
      results[`Sub ${key}`] = await oidf.addSubordinateMetadata(subId, entry)
    }
  }
  return results
}

async function deleteMetadata(oidf, name, subId=null) {
  const results = {}
  const metadata = await oidf.getMetadata(name)
  for (const md of metadata) {
    results[md.key] = await oidf.deleteMetadataEntry(md.id, name)
  }
  if (subId) {
    const subMetadata = await oidf.getSubordinateMetadata(subId)
    for (const md of subMetadata) {
      results[`Sub ${md.key}`] = await oidf.deleteSubordinateMetadataEntry(subId, md.id)
    }
  }
  return results
}

async function addMetadataPolicy(oidf, metadataPolicy) {
  const results = {}
  for (const key in metadata) {
    const entry = {
      key: key,
      policy: metadataPolicy[key]
    }
    const mp = await oidf.addMetadataPolicy(entry)
    results[key] = mp
  }
  return results
}

async function deleteMetadataPolicy(oidf) {
  const results = {}
  const metadataPolicy = await oidf.getMetadataPolicy()
  for (const md of metadataPolicy) {
    results[md.key] = await oidf.deleteMetadataPolicyEntry(md.id)
  }
  return results
}

async function deleteKeys(oidf, subId) {
  const results = {}
  const keys = await oidf.getSubordinateJWKS(subId)
  for (const key of keys) {
    results[key.id] = await oidf.deleteSubordinateJWKS(subId, key.id)
  }
  return results
}
