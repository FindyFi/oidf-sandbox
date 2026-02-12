import {randomUUID} from 'node:crypto';

class OpenIDFederationAPIAdmin {
  /**
   * Initialize the client with base URL and API key if required
   * @param {string} baseUrl Base URL of the API
   * @param {object} [options] Optional configurations
   */
  constructor(baseUrl, options = {}) {
    this.baseUrl = baseUrl
    this.apiKey = options.apiKey || null
    this.username = options.username || null
    this.refreshTimeout = null
    this.severityLevels = ['Verbose', 'Debug', 'Info', 'Warn', 'Error', 'Assert']
  }

  /**
   * Handle API errors uniformly
   * @param {Error} error Error object
   */
  async handleError(error) {
    if (error.response) {
      console.error(`API Error: ${error.response.status} - ${error.response.data}`)
    } else if (error.request) {
      console.error('No response from API:', error.request)
    } else {
      console.error('Request error:', error.message)
    }
    throw error
  }

  setUsername(username) {
    this.username = username
  }

  /**
   * Authenticate and get an API key using OAuth2
   * @param {string} authUrl OAuth2 token endpoint
   * @param {string} clientId OAuth2 client ID
   * @param {string} clientSecret OAuth2 client secret
   * @param {string} scope Requested OAuth2 scope
   * @returns {Promise<void>} Sets the API key for the client
   */
  async authenticate(authUrl, clientId, clientSecret, scope='email') {
    const params = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        response_type: 'code',
        grant_type: 'client_credentials',
        scope: scope
      })
    }
    try {
      const response = await fetch(authUrl, params)
      if (!response.ok) {
        throw new Error(`Authentication failed! status: ${response.status}`)
      }
      const result = await response.json()
      // console.log(result)
      this.apiKey = result.access_token
      const TTL = result.expires_in * 1000
      this.refreshTimeout = setTimeout(() => {
        this.authenticate(authUrl, clientId, clientSecret, scope)
      }, TTL)
    } catch (error) {
      await this.handleError(error)
    }
    return this.apiKey
  }

  quit() {
    this.apiKey = null
    clearTimeout(this.refreshTimeout)
  }

  /**
   * Generic request handler
   * @param {string} endpoint API endpoint
   * @param {string} method HTTP method
   * @param {object} [data] Request body
   * @returns {Promise<any>} API response
   */
  async request(endpoint, method='GET', data=null, username=null) {
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`
    }
    const useraccount = username || this.username
    if (useraccount) {
      headers['X-Account-Username'] = useraccount
    }

    const options = {
      method,
      headers,
      body: data ? JSON.stringify(data) : null
    }

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, options)
      // console.log(response.status, endpoint, options)
/*
      let curl = `curl -X ${method} ${this.baseUrl}${endpoint}`
      for (let key in headers) {
        curl += ` -H "${key}: ${headers[key]}"`
      }
      if (data) {
        curl += ` -d '${JSON.stringify(data)}'`
      }
      console.log(curl)
*/
      if (!response.ok) {
        console.error(response.status, endpoint, options, await response.text())
        throw new Error(`HTTP error! Status code: ${response.status}`)
      }
      if (response.headers.get('Content-Type') === 'application/json') {
        return await response.json()
      }
      else {
        return await response.text()
      }
    } catch (error) {
      await this.handleError(error)
    }
  }


  /**
   * Generic GET request
   * @param {string} endpoint API endpoint
   * @returns {Promise<any>} API response
   */
  async get(endpoint, username=null) {
    try {
      return await this.request(endpoint, 'GET', null, username)
    } catch (error) {
      await this.handleError(error)
    }
  }

  /**
   * Generic POST request
   * @param {string} endpoint API endpoint
   * @param {object} data Payload for the request
   * @returns {Promise<any>} API response
   */
  async post(endpoint, data, username=null) {
    try {
      return await this.request(endpoint, 'POST', data, username)
    } catch (error) {
      await this.handleError(error)
    }
  }

  /**
   * Generic DELETE request
   * @param {string} endpoint API endpoint
   * @returns {Promise<any>} API response
   */
  async delete(endpoint, username=null) {
    try {
      return await this.request(endpoint, 'DELETE', null, username)
    } catch (error) {
      await this.handleError(error)
    }
  }


  async status() {
    return this.get(`/status`)
  }

  async logs(limit=100, filter={}) {
    let max = parseInt(limit)
    if (max > 1000) max = 1000
    if (!max || (max < 0)) max = 100
    let path = '/logs'
    // filtering either by severity or tag, not both simultaneously
    // only filter by known severity levels
    if (filter.severity && filter.severity in this.severityLevels) {
      path += `/severity/${filter.severity}`
    }
    else if (filter.tag) {
      path += `/tag/${filter.tag}`
    }
    return this.get(`${path}?limit=${limit}`)
  }

  async accounts() {
    const response = await this.get('/accounts')
    return response.accounts
  }

  async createAccount(username, identifier) {
    return this.post('/accounts', {username, identifier})
  }

  async deleteAccount(username) {
    return this.delete('/accounts', username)
  }

  async createKey(kmsKeyRef, signatureAlgorithm='ES256', username=null) {
    const params = {
      kmsKeyRef,
      signatureAlgorithm
    }
    return this.post('/keys', params, username)
  }

  async getKeys(username=null) {
    const response = await this.get(`/keys`, username)
    return response.jwks
  }

  async deleteKey(keyId, reason=null, username=null) {
    return this.delete(`/keys/${keyId}?reason=${encodeURIComponent(reason)}`, username)
  }

  async createMetadata(json, username=null) {
    return this.post(`/metadata`, json, username)
  }

  async getMetadata(username=null) {
    const response = await this.get(`/metadata`, username)
    return response.metadata
  }

  async deleteMetadataEntry(entryId, username=null) {
    return this.delete(`/metadata/${entryId}`, username)
  }

  async createMetadataPolicy(json, username=null) {
    return this.post(`/metadata-policy`, json, username)
  }

  async getMetadataPolicy(username=null) {
    const response = await this.get(`/metadata-policy`, username)
    return response.metadata
  }

  async deleteMetadataPolicyEntry(entryId, username=null) {
    return this.delete(`/metadata-policy/${entryId}`, username)
  }

  async addAuthorityHint(authorityId, username=null) {
    const json = {identifier: authorityId}
    return this.post(`/authority-hints`, json, username)
  }

  async getAuthorityHints(username=null) {
    const response = await this.get(`/authority-hints`, username)
    return response.authorityHints
  }

  async deleteAuthorityHint(authorityId, username=null) {
    return this.delete(`/authority-hints/${encodeURIComponent(authorityId)}`, username)
  }

  async getEntityConfiguration(username=null) {
    return this.get(`/entity-statement`, username)
  }

  async publishEntityConfiguration(kmsKeyRef, kid, dryRun=false, username=null) {
    return this.post(`/entity-statement`, {kmsKeyRef, kid, dryRun}, username)
  }

  async addSubordinate(subordinateId, username=null) {
    const json = {identifier: subordinateId}
    return this.post(`/subordinates`, json, username)
  }

  async getSubordinates(username=null) {
    const response = await this.get(`/subordinates`, username)
    return response.subordinates
  }

  async deleteSubordinate(subordinateId, username=null) {
    return this.delete(`/subordinates/${encodeURIComponent(subordinateId)}`, username)
  }

  async addSubordinateMetadata(subordinateId, json, username=null) {
    return this.post(`/subordinates/${encodeURIComponent(subordinateId)}/metadata`, json, username)
  }

  async getSubordinateMetadata(subordinateId, username=null) {
    const response = await this.get(`/subordinates/${encodeURIComponent(subordinateId)}/metadata`, username)
    return response.subordinateMetadata
  }

  async deleteSubordinateMetadataEntry(subordinateId, entryId, username=null) {
    return this.delete(`/subordinates/${encodeURIComponent(subordinateId)}/metadata/${encodeURIComponent(entryId)}`, username)
  }

  async addSubordinateJWKS(subordinateId, json, username=null) {
    return this.post(`/subordinates/${encodeURIComponent(subordinateId)}/keys`, json, username)
  }

  async getSubordinateJWKS(subordinateId, username=null) {
    const response = await this.get(`/subordinates/${encodeURIComponent(subordinateId)}/keys`, username)
    return response.jwks
  }

  async deleteSubordinateJWKS(subordinateId, jwkId, username=null) {
    return this.delete(`/subordinates/${encodeURIComponent(subordinateId)}/keys/${encodeURIComponent(jwkId)}`, username)
  }

  async getSubordinateStatement(subordinateId, username=null) {
    return this.get(`/subordinates/${encodeURIComponent(subordinateId)}/statement`, username)
  }

  async publishSubordinateStatement(subordinateId, kmsKeyRef, kid, dryRun=false, username=null) {
    return this.post(`/subordinates/${encodeURIComponent(subordinateId)}/statement`, {kmsKeyRef, kid, dryRun}, username)
  }

  async getTrustMarkTypes(username=null) {
    const response = await this.get(`/trust-mark-types`, username)
    return response.trustMarkTypes
  }

  async getTrustMarkType(identifier, username=null) {
    return this.get(`/trust-mark-types/${encodeURIComponent(identifier)}`, username)
  }

  async createTrustMarkType(identifier, username=null) {
    return this.post(`/trust-mark-types`, {identifier}, username)
  }

  async deleteTrustMarkType(identifier, username=null) {
    return this.delete(`/trust-mark-types/${encodeURIComponent(identifier)}`, username)
  }
  
  async getTrustMarkTypeIssuers(identifier, username=null) {
    const response = await this.get(`/trust-mark-types/${encodeURIComponent(identifier)}/issuers`, username)
    return response.issuers
  }

  async addTrustMarkIssuer(identifier, issuerId, username=null) {
    return this.post(`/trust-mark-types/${encodeURIComponent(identifier)}/issuers`, {identifier: issuerId}, username)
  }

  async removeTrustMarkIssuer(identifier, issuerId, username=null) {
    return this.delete(`/trust-mark-types/${encodeURIComponent(identifier)}/issuers/${encodeURIComponent(issuerId)}`, username)
  }
  
  async issueTrustMark(trustMark, dryRun=false, username=null) {
    if (dryRun) { 
      trustMark.dryRun = true
    }
    return this.post(`/trust-marks`, trustMark, username)
  }

  async getTrustMarks(username=null) {
    const response = await this.get(`/trust-marks`, username)
    return response.trustMarks
  }

  async deleteTrustMark(trust_mark_id, username=null) {
    return this.delete(`/trust-marks/${encodeURIComponent(trust_mark_id)}`, username)
  }

  async getReceivedTrustMarks(username=null) {
    const response = await this.get(`/received-trust-marks`, username)
    return response.receivedTrustMarks
  }

  async addTrustMark(trust_mark_id, jwt, username=null) {
    return this.post(`/received-trust-marks`, {trust_mark_id, jwt}, username)
  }

  async deleteReceivedTrustMark(trust_mark_id, username=null) {
    return this.delete(`/received-trust-marks/${encodeURIComponent(trust_mark_id)}`, username)
  }

}

export { OpenIDFederationAPIAdmin as Admin }

