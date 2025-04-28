import express from 'express'
import { Admin } from './admin.js'

const apiUrl = process.env.API_URL
const authUrl = process.env.AUTH_URL
const clientId = process.env.CLIENT_ID
const clientSecret = process.env.CLIENT_SECRET
const port = process.env.PORT || 3000

const metadataMap = {
  openid_provider: 'openid-configuration',
}
metadataMap['openid-credential-issuer'] = 'openid-credential-issuer'
metadataMap['openid-credential-verifier'] = 'openid-credential-verifier'

const oidf = new Admin(apiUrl)
const apiKey = await oidf.authenticate(authUrl, clientId, clientSecret)

const app = express();
app.use(express.json())
app.use(express.static('public'))

app.get('/api/subordinates', async (req, res) => {
  res.json(await oidf.getSubordinates())
})

app.get('/api/subordinates/:id', async (req, res) => {
  res.json(await oidf.getSubordinateMetadata(req.params.id))
})

app.post('/api/subordinates', async (req, res) => {
  const json = req.body
  console.log(json)
  const results = {}
  const sub = await oidf.addSubordinate(json.identifier)
  results['New subordinate'] = sub
  for (const key in json.metadata) {
    let entry = {
      key: key,
      metadata: json.metadata[key]
    }
    const meta = await oidf.addSubordinateMetadata(sub.id, entry)
    results[`New subordinate metadata ${entry}`] = meta
  }
  for (const key in json.jwks) {
    let entry = {
      key: key,
      metadata: json.jwks[key]
    }
    const meta = await oidf.addSubordinateMetadata(sub.id, entry)
    results[`New subordinate metadata ${entry}`] = meta
  }
  results['Published subordinate metadata'] = await oidf.publishSubordinateStatement(sub.id)
  res.json(results)
})

app.put('/api/subordinates/:id', async (req, res) => {
  const subId = req.params.id
  const json = req.body
  const results = {}
  const delResp = await deleteMetadata(oidf, subId)
  results['Deleted subordinate metadata'] = delResp
  const addResp = addMetadata(oidf, subId, json.metadata)
  results['New subordinate metadata'] = JSON.stringify(addResp, null, 1)
  results['Published subordinate metadata'] = await oidf.publishSubordinateStatement(subId)
  res.json(results)
})

app.delete('/api/subordinates/:id', async (req, res) => {
  console.log('DELETING', req.params.id)
  res.json(await oidf.deleteSubordinate(req.params.id))
})

app.get('/api/proxy/:uri', async (req, res) => {
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
})

app.get('/api/getMetadata/:metadataKey/:identifier', async (req, res) => {
  const {identifier, metadataKey} = req.params
  const actorMetadata = `${identifier}/.well-known/${metadataMap[metadataKey]}`
  const resp = await fetch(actorMetadata)
  let metadata = {}
  if (resp.ok) {
    try {
      metadata = await resp.json()
    }
    catch (e) {
      console.warn('Error parsing JSON', e, req.params)
    }
    res.json(await resp.json())
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
