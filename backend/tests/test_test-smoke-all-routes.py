import pytest
import httpx

BASE_URL = "http://localhost:3000"

# List of routes to smoke test with method and optional path params
routes = [
    ("POST", "/signup"),
    ("POST", "/signin"),
    ("GET", "/balance"),
    ("GET", "/stocks"),
    ("POST", "/order"),
    ("GET", "/orders"),
    ("DELETE", "/order/anyorderid"),
    ("GET", "/orderbook/anysymbol"),
    ("GET", "/fills/anysymbol")
]

@pytest.mark.asyncio
@pytest.mark.parametrize("method, path", routes)
async def test_smoke_all_routes(method, path):
    async with httpx.AsyncClient(base_url=BASE_URL) as client:
        # Prepare minimal valid payloads for POST routes
        json = None
        headers = {}
        if path == "/signup":
            json = {"username": "testuser", "password": "testpass"}
        elif path == "/signin":
            json = {"username": "testuser", "password": "testpass"}
        elif path == "/order":
            # Minimal valid order data
            json = {
                "stockId": "anystockid",
                "side": "BUY",
                "type": "LIMIT",
                "price": 1.0,
                "quantity": 1
            }
        # For routes requiring auth, we skip auth token since this is a smoke test
        # We expect 401 or 403 for unauthorized but no server error
        response = await client.request(method, path, json=json, headers=headers)
        # Assert no server error
        assert response.status_code < 500, f"Server error on {method} {path}: {response.status_code}"
