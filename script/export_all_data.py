import requests
import urllib.parse
import time
import pandas as pd
import os

# Define the endpoint URL
url = 'https://be.aksa8.web.id/api/v1/admin/user?class='

# Create a dictionary of headers
custom_headers = {
    'Authorization': '',
    'Accept': 'application/json'
}

classOptions = [
  "10 LK 1", "10 LK 2",
  "10 PS 1", "10 PS 2",
  "10 DKV 1", "10 DKV 2", "10 DKV 3",
  "10 PPLG 1", "10 PPLG 2", "10 PPLG 3",
  "10 TJKT 1", "10 TJKT 2",

  "11 LK 1", "11 LK 2",
  "11 PS 1", "11 PS 2",
  "11 DKV 1", "11 DKV 2", "11 DKV 3",
  "11 PPLG 1", "11 PPLG 2", "11 PPLG 3",
  "11 TJKT 1", "11 TJKT 2",

  "12 LK 1", "12 LK 2",
  "12 PS 1", "12 PS 2",
  "12 DKV 1", "12 DKV 2", "12 DKV 3",
  "12 PPLG 1", "12 PPLG 2", "12 PPLG 3",
  "12 TJKT 1", "12 TJKT 2",

  "STAFF",
  "GURU",
  "ADMIN",
]

data = []

for i, v in enumerate(classOptions):
    full_url = url + urllib.parse.quote(v)
    print(full_url)
    
    # Send the GET request with headers
    response = requests.get(full_url, headers=custom_headers)

    # Check the output
    print(f"Status Code: {response.status_code}")
    
    res = response.json()
    
    res_data = res['data']
    
    for person in res_data:
        data.append(person)
    
    time.sleep(1)
    
    os.system('cls' if os.name == 'nt' else 'clear')

df = pd.DataFrame(data)

df = df[['name', 'username', 'class', 'password']]

df.to_excel('voters.xlsx', index=False)
df.to_csv('voters.csv', index=False)

print("Saved to voters.xlsx and voters.csv successfully!")