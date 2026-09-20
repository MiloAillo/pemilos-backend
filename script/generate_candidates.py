import requests
import time

osis_candidate = [
    "Aliya Bunga Fatima",
    "Galuh Kirana Anindya P",
    "Ravidya Satrio A"
]

mpk_candidate = [
    "Alvino Satrio Widigdo H",
    "Raihan Yusuf Habibi",
    "Kynanti Rizky Syafitri"
]

# Define the endpoint URL
url = 'https://be.aksa8.web.id/api/v1/admin/candidate'

# Create a dictionary of headers
custom_headers = {
    'Authorization': '',
    'Accept': 'application/json'
}

for i, v in enumerate(osis_candidate):
    payload = {
        "name": v,
        "label": "osis",
        "number": i + 1,
        "image": "kandidat3.png"
    }
    
    # Send the GET request with headers
    response = requests.post(url, headers=custom_headers, json=payload)

    # Check the output
    print(f"Status Code: {response.status_code}")
    print(response.json())
    
    time.sleep(2)
    
for i, v in enumerate(mpk_candidate):
    payload = {
        "name": v,
        "label": "mpk",
        "number": i + 1,
        "image": "kandidat3.png"
    }
    
    # Send the GET request with headers
    response = requests.post(url, headers=custom_headers, json=payload)

    # Check the output
    print(f"Status Code: {response.status_code}")
    print(response.json())
    
    time.sleep(2)