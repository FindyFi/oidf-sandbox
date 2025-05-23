import express from 'express'
import { Admin } from './admin.js'

const apiUrl = process.env.API_URL
const authUrl = process.env.AUTH_URL
const clientId = process.env.CLIENT_ID
const clientSecret = process.env.CLIENT_SECRET
const port = process.env.PORT || 3000

const oidf = new Admin(apiUrl)
const apiKey = await oidf.authenticate(authUrl, clientId, clientSecret)

const app = express();
app.use(express.json())
app.use(express.static('public'))

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
    // console.log('adding a subordinate', JSON.stringify(json, null, 1))
    const results = {}
    const sub = await oidf.addSubordinate(json.identifier)
    results['New subordinate'] = sub
    if (json.roles) {
      let entry = {
        key: 'roles',
        metadata: json.roles
      }
      const meta = await oidf.addSubordinateMetadata(sub.id, entry)
      results[`Subordinate roles set to metadata:`] = meta
    }
    const addResp = await addMetadata(oidf, sub.id, json.metadata)
    results['New subordinate metadata'] = JSON.stringify(addResp, null, 1)
    for (const key of json.jwks) {
      const jwks = await oidf.addSubordinateJWKS(sub.id, key)
      results[`New subordinate JWKS ${key}`] = jwks
    }
    // console.log('Subordinate metadata:', JSON.stringify(results, null, 1))
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
    // console.log(`mofidying the subordinate ${subId}`, JSON.stringify(json, null, 1))
    const results = {}
    const delResp = await deleteMetadata(oidf, subId)
    results['Deleted subordinate metadata'] = delResp
    const delKeyResp = await deleteKeys(oidf, subId)
    results['Deleted subordinate keys'] = delResp
    for (const key of json.jwks) {
      const jwks = await oidf.addSubordinateJWKS(subId, key)
      results[`New subordinate JWKS:`] = jwks
    }
    if (json.roles) {
      let entry = {
        key: 'roles',
        metadata: json.roles
      }
      const meta = await oidf.addSubordinateMetadata(subId, entry)
      results[`Subordinate roles set to metadata:`] = meta
    }
    const addResp = await addMetadata(oidf, subId, json.metadata)
    results['New subordinate metadata'] = JSON.stringify(addResp, null, 1)
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
    res.json(await oidf.deleteSubordinate(req.params.id))
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
    res.json({error: `Could not get ${req.params.uri}`})
  } catch (e) {
    console.error(e)
    res.status(500).json(e)
  }
})

app.get('/api/getMetadata/:metadataKey/:identifier', async (req, res) => {
  // console.log(req.params)
  try {
    const {identifier, metadataKey} = req.params
    const actorMetadata = `${identifier}/.well-known/${metadataKey}`
    // console.log('Fetching metadata from', actorMetadata)
    const resp = await fetch(actorMetadata)
    let metadata = {}
    if (resp.ok) {
      try {
        metadata = await resp.json()
      }
      catch (e) {
        console.warn('Error parsing JSON', e, req.params)
      }
      res.json(metadata)
    }
  } catch (e) {
    console.error(e)
    res.status(500).json(e)
  }
})

app.listen(port, () =>
  console.log(`Server running at port ${port}`),
)

async function addMetadata(oidf, subId, metadata) {
  const results = {}
  for (const key in metadata) {
    const entry = {
      key: key,
      metadata: metadata[key]
    }
    const meta = await oidf.addSubordinateMetadata(subId, entry)
    results[key] = meta
  }
  return results
}

async function deleteMetadata(oidf, subId) {
  const results = {}
  const metadata = await oidf.getSubordinateMetadata(subId)
  for (const md of metadata) {
    results[md.key] = await oidf.deleteSubordinateMetadataEntry(subId, md.id)
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
