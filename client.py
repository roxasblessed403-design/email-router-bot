import requests
from typing import Dict
from urllib.parse import urljoin

class EmailRouterClient:
    def __init__(self, api_url: str, token: str):
        self.api_url = api_url.rstrip('/')
        self.token = token
        self.headers = {
            'Authorization': f'Bearer {token}',
            'Content-Type': 'application/json'
        }

    def create_email(self, username: str) -> Dict:
        url = urljoin(self.api_url, '/api/emails/create')
        response = requests.post(
            url,
            headers=self.headers,
            json={'username': username.lower().strip()}
        )
        return self._handle_response(response)

    def bulk_create_emails(self, basename: str, start: int, end: int) -> Dict:
        url = urljoin(self.api_url, '/api/emails/bulk')
        response = requests.post(
            url,
            headers=self.headers,
            json={
                'basename': basename.lower().strip(),
                'start': start,
                'end': end
            }
        )
        return self._handle_response(response)

    def delete_email(self, email: str) -> Dict:
        url = urljoin(self.api_url, f'/api/emails/{email}')
        response = requests.delete(url, headers=self.headers)
        return self._handle_response(response)

    @staticmethod
    def _handle_response(response: requests.Response) -> Dict:
        try:
            data = response.json()
        except ValueError:
            response.raise_for_status()
            raise ValueError('Invalid JSON response')

        if not response.ok:
            error_msg = data.get('error', f'HTTP {response.status_code}')
            raise requests.HTTPError(error_msg)

        if not data.get('success'):
            error_msg = data.get('error', 'Unknown error')
            raise ValueError(error_msg)

        return data