import sys, os
sys.path.insert(0, os.path.abspath('backend-python/app'))
from main import app
from fastapi.testclient import TestClient

client = TestClient(app)
resp = client.get('/py/chart?ticker=9020.T&period=3mo&interval=1d')
print('STATUS', resp.status_code)
print('HEADERS')
for k,v in resp.headers.items():
    print(k+':', v)
print('\nTEXT')
print(resp.text)
