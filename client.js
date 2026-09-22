class EmailRouterClient {
  constructor(apiUrl, token) {
    this.apiUrl = apiUrl.replace(/\/$/, '');
    this.token = token;
    this.headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
  }

  async createEmail(username) {
    const response = await fetch(`${this.apiUrl}/api/emails/create`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ username: username.toLowerCase().trim() })
    });
    return this._handleResponse(response);
  }

  async bulkCreateEmails(basename, start, end) {
    const response = await fetch(`${this.apiUrl}/api/emails/bulk`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        basename: basename.toLowerCase().trim(),
        start,
        end
      })
    });
    return this._handleResponse(response);
  }

  async deleteEmail(email) {
    const response = await fetch(`${this.apiUrl}/api/emails/${encodeURIComponent(email)}`, {
      method: 'DELETE',
      headers: this.headers
    });
    return this._handleResponse(response);
  }

  async _handleResponse(response) {
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || `HTTP ${response.status}`);
    }
    if (!data.success) {
      throw new Error(data.error || 'Unknown error');
    }
    return data;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = EmailRouterClient;
}