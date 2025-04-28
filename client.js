class OpenIDFederationAPIClient {
  /**
   * Initialize the client with base URL and API key if required
   * @param {string} baseUrl Base URL of the API
   * @param {object} [options] Optional configurations
   */
  constructor(baseUrl, options = {}) {
    this.baseUrl = baseUrl;
  }

  /**
   * Handle API errors uniformly
   * @param {Error} error Error object
   */
  handleError(error) {
    if (error.response) {
      console.error(`API Error: ${error.response.status} - ${error.response.data}`);
    } else if (error.request) {
      console.error('No response from API:', error.request);
    } else {
      console.error('Error creating request:', error.message);
    }
    throw error;
  }

  /**
   * Generic request handler
   * @param {string} endpoint API endpoint
   * @param {string} method HTTP method
   * @param {object} [data] Request body
   * @returns {Promise<any>} API response
   */
  async request(endpoint, method='GET', data=null) {
    const headers = {
      'Content-Type': 'application/json'
    };

    const options = {
      method,
      headers,
      body: data ? JSON.stringify(data) : null
    };

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, options);
      // console.log(response.status, endpoint, options)
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      return await response.json()
    } catch (error) {
      this.handleError(error);
    }
  }


  /**
   * Generic GET request
   * @param {string} endpoint API endpoint
   * @returns {Promise<any>} API response
   */
  async get(endpoint) {
    try {
      return await this.request(endpoint);
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Generic POST request
   * @param {string} endpoint API endpoint
   * @param {object} data Payload for the request
   * @returns {Promise<any>} API response
   */
  async post(endpoint, data) {
    try {
      return await this.request(endpoint, 'POST', data);
    } catch (error) {
      this.handleError(error);
    }
  }

  async list(criteria={}) {
    const queryString = new URLSearchParams(criteria).toString();
    return await this.get(`/list?${queryString}`);
  }
  
  async fetch(uri) {
    return this.get(`/fetch?sub=${encodeURIComponent(uri)}`);
  }

}

export { OpenIDFederationAPIClient as Client }

