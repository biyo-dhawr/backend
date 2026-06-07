# Ogaal Backend API Guide

## Quick Start

Local base URL:

```text
http://localhost:4000
```

API base URL:

```text
http://localhost:4000/api
```

All request and response bodies use JSON. For requests with a body, send:

```http
Content-Type: application/json
```

Protected endpoints require the JWT returned by login:

```http
Authorization: Bearer YOUR_JWT_TOKEN
```

The JWT expires after 24 hours.

## Roles

| Role               | Description                      |
| ------------------ | -------------------------------- |
| `ADMIN`            | Full staff access                |
| `GOVERNMENT`       | Staff access                     |
| `VILLAGE_LEADER`   | Staff access                     |
| `COMMUNITY_MEMBER` | Can submit authenticated reports |

In this guide, **staff** means `ADMIN`, `GOVERNMENT`, or `VILLAGE_LEADER`.

## Endpoint Summary

| Method   | Endpoint                        | Access        |
| -------- | ------------------------------- | ------------- |
| `GET`    | `/`                             | Public        |
| `POST`   | `/api/auth/register`            | Public        |
| `POST`   | `/api/auth/login`               | Public        |
| `GET`    | `/api/regions`                  | Public        |
| `GET`    | `/api/districts`                | Public        |
| `GET`    | `/api/villages`                 | Public        |
| `GET`    | `/api/alerts`                   | Public        |
| `POST`   | `/api/alerts`                   | Staff         |
| `GET`    | `/api/water-sources`            | Public        |
| `POST`   | `/api/water-sources`            | Staff         |
| `PATCH`  | `/api/water-sources/:id/status` | Staff         |
| `DELETE` | `/api/water-sources/:id`        | Staff         |
| `POST`   | `/api/reports/submit/public`    | Public        |
| `POST`   | `/api/reports/submit/secure`    | Authenticated |
| `GET`    | `/api/reports`                  | Staff         |
| `PATCH`  | `/api/reports/:id/verify`       | Staff         |
| `DELETE` | `/api/reports/:id`              | Staff         |
| `GET`    | `/api/dashboard/stats`          | Staff         |
| `GET`    | `/api/admin/water-sources`      | Staff         |
| `GET`    | `/api/analytics`                | Staff         |
| `POST`   | `/api/sms`                      | Staff         |
| `POST`   | `/api/simulation/risk`          | Staff         |

## Authentication

### Register

```http
POST /api/auth/register
```

Body:

```json
{
  "email": "user@example.com",
  "password": "password123",
  "fullName": "Example User",
  "role": "COMMUNITY_MEMBER",
  "ngoId": null
}
```

Required:

- `email`
- `password` with at least 8 characters
- `fullName`

`role` defaults to `COMMUNITY_MEMBER`. Role input is converted to uppercase.

Success (`201`):

```json
{
  "message": "User registered successfully",
  "user": {
    "id": "7a681c0e-6d16-4201-8093-d1cab2274567",
    "email": "user@example.com",
    "fullName": "Example User",
    "role": "COMMUNITY_MEMBER",
    "ngoId": null
  }
}
```

Errors:

- `400`: invalid or missing fields
- `409`: email already registered

### Login

```http
POST /api/auth/login
```

Body:

```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

Success (`200`):

```json
{
  "message": "Login successful",
  "token": "JWT_TOKEN",
  "user": {
    "id": "7a681c0e-6d16-4201-8093-d1cab2274567",
    "email": "user@example.com",
    "fullName": "Example User",
    "role": "COMMUNITY_MEMBER",
    "ngoId": null
  }
}
```

Store `token` and `user` in the frontend authentication state.

## Geographic Data

### Regions

```http
GET /api/regions
```

Returns all regions alphabetically:

```json
[
  {
    "id": 1,
    "name": "Awdal"
  }
]
```

### Districts

Get every district:

```http
GET /api/districts
```

Filter by region:

```http
GET /api/districts?regionId=1
```

Response:

```json
[
  {
    "id": 1,
    "name": "Borama",
    "regionId": 1
  }
]
```

### Villages

Get every village:

```http
GET /api/villages
```

Filter by district:

```http
GET /api/villages?districtId=1
```

Response:

```json
[
  {
    "id": 59,
    "name": "Example Village",
    "districtId": 1,
    "latitude": 9.94,
    "longitude": 43.19,
    "droughtRiskLevel": "Low"
  }
]
```

## Water Sources

### List Water Sources

```http
GET /api/water-sources
```

Query parameters:

| Parameter  | Default | Description                             |
| ---------- | ------- | --------------------------------------- |
| `page`     | `1`     | Page number                             |
| `limit`    | `20`    | Page size, maximum `100`                |
| `search`   | Empty   | Searches source name, type, and village |
| `region`   | Empty   | Exact region name                       |
| `district` | Empty   | Exact district name                     |
| `status`   | Empty   | Exact database status                   |

Examples:

```text
/api/water-sources?page=1&limit=20
/api/water-sources?search=borehole
/api/water-sources?region=Awdal&district=Borama
/api/water-sources?status=Working&page=1&limit=50
```

Success:

```json
{
  "data": [
    {
      "id": 1000,
      "villageId": 59,
      "name": "Example Borehole",
      "type": "Borehole",
      "status": "Working",
      "waterLevel": 100,
      "latitude": 9.94,
      "longitude": 43.19,
      "lastMaintained": null,
      "village": {
        "id": 59,
        "name": "Example Village",
        "districtId": 1,
        "latitude": 9.94,
        "longitude": 43.19,
        "droughtRiskLevel": "Low",
        "district": {
          "id": 1,
          "name": "Borama",
          "regionId": 1,
          "region": {
            "id": 1,
            "name": "Awdal"
          }
        }
      },
      "sensorReadings": []
    }
  ],
  "meta": {
    "total": 1000,
    "page": 1,
    "limit": 20,
    "totalPages": 50
  }
}
```

`sensorReadings` contains at most the newest reading.

### Create Water Source

Staff only:

```http
POST /api/water-sources
```

Body:

```json
{
  "villageId": 59,
  "name": "New Borehole",
  "type": "Borehole",
  "status": "Working",
  "waterLevel": 85,
  "latitude": 9.95,
  "longitude": 43.2
}
```

Only `villageId` and `name` are required. Success returns the created record
with status `201`.

### Update Status or Water Level

Staff only:

```http
PATCH /api/water-sources/1000/status
```

Body:

```json
{
  "status": "Broken",
  "waterLevel": 20
}
```

At least one of `status` or `waterLevel` is required. `lastMaintained` is
updated automatically.

### Delete Water Source

Staff only:

```http
DELETE /api/water-sources/1000
```

Success:

```json
{
  "message": "Water source deleted"
}
```

The API returns `409` if dependent records prevent deletion.

## Reports

### Submit Public Report

No token required:

```http
POST /api/reports/submit/public
```

Body:

```json
{
  "villageId": 59,
  "waterSourceId": 1000,
  "content": "The pump is not working.",
  "reporterType": "Web"
}
```

### Submit Authenticated Report

Any logged-in user:

```http
POST /api/reports/submit/secure
```

Use the same body as a public report. The report is linked to the JWT user.

For both endpoints:

- `villageId`, `waterSourceId`, and non-empty `content` are required.
- `reporterType` defaults to `App`.
- The water source must belong to the supplied village.

Success (`201`):

```json
{
  "id": 1,
  "userId": null,
  "villageId": 59,
  "waterSourceId": 1000,
  "reporterType": "Web",
  "content": "The pump is not working.",
  "isVerified": false,
  "createdAt": "2026-06-07T12:00:00.000Z"
}
```

### List Reports

Staff only:

```http
GET /api/reports
```

Returns reports newest first with:

- `waterSource`
- `village`
- Safe `user` details, or `null` for public reports

### Verify Report

Staff only:

```http
PATCH /api/reports/1/verify
```

No body is required. The returned report has `isVerified: true`.

### Delete Report

Staff only:

```http
DELETE /api/reports/1
```

Success:

```json
{
  "message": "Report deleted"
}
```

## Alerts

### List Alerts

Public:

```http
GET /api/alerts
```

Only active alerts:

```http
GET /api/alerts?active=true
```

Each alert includes its related `village`.

### Create Alert

Staff only:

```http
POST /api/alerts
```

Body:

```json
{
  "villageId": 59,
  "message": "Critical drought conditions detected.",
  "severity": "Critical"
}
```

Success returns the alert with status `201`.

## Dashboard

### Dashboard Statistics

Staff only:

```http
GET /api/dashboard/stats
```

Response:

```json
{
  "totalSources": 1000,
  "pendingReports": 4,
  "criticalZones": 8,
  "recentReports": []
}
```

`recentReports` contains up to five reports with their village and water source.

### Administrative Water-Source Hierarchy

Staff only:

```http
GET /api/admin/water-sources
```

Optional filters:

| Parameter | Values                                                     |
| --------- | ---------------------------------------------------------- |
| `status`  | `Working`, `Needed Maintenance`, `Broken`                  |
| `type`    | Exact source type such as `Borehole`, `Dam`, or `Dug Well` |

Examples:

```text
/api/admin/water-sources?status=Working
/api/admin/water-sources?type=Borehole
/api/admin/water-sources?status=Broken&type=Borehole
```

Response:

```json
[
  {
    "region": "Awdal",
    "totalSources": 100,
    "avgStatus": 80,
    "districts": [
      {
        "name": "Borama",
        "totalSources": 60,
        "avgStatus": 75,
        "villages": [
          {
            "name": "Example Village",
            "totalSources": 5,
            "avgStatus": 80,
            "functional": 4,
            "needsRepair": 0,
            "nonFunctional": 1,
            "sources": [
              {
                "id": 1000,
                "source_name": "Example Borehole",
                "water_source_type": "Borehole",
                "status": "Working",
                "water_level": 100,
                "lat": 9.94,
                "lng": 43.19
              }
            ]
          }
        ]
      }
    ]
  }
]
```

The response is cached and automatically invalidated after water-source changes.

## Analytics

Staff only:

```http
GET /api/analytics
```

Response:

```json
{
  "statusData": [
    {
      "status": "Working",
      "count": 700,
      "color": "#22c55e",
      "description": "Working"
    }
  ],
  "villageData": [
    {
      "village": "Example Village",
      "count": 20,
      "functional": 16,
      "nonFunctional": 4
    }
  ],
  "sourceTypeData": [
    {
      "type": "Borehole",
      "count": 500,
      "functional": 400
    }
  ],
  "trendData": [
    {
      "month": "Jan",
      "functional": 150,
      "nonFunctional": 50,
      "repairs": 20
    }
  ]
}
```

`villageData` is limited to the ten villages with the most sources.
`trendData` is currently placeholder data.

## Utility and Simulation

### Send Mock SMS

Staff only:

```http
POST /api/sms
```

Body:

```json
{
  "to": "+252631234567",
  "message": "Water rationing is required in your area."
}
```

This endpoint logs the SMS; it does not contact an SMS provider.

### Run Risk Simulation

Staff only:

```http
POST /api/simulation/risk
```

No body is required.

This endpoint modifies a random village drought risk and a random source water
level. It may also create an alert. Use it only for demos and testing.

## Frontend Request Helper

```js
const API_URL = "http://localhost:4000/api";

export async function apiRequest(path, options = {}) {
  const token = localStorage.getItem("token");

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    if (response.status === 401) {
      localStorage.removeItem("token");
    }

    throw new Error(data.message || "Request failed");
  }

  return data;
}
```

Examples:

```js
const waterSources = await apiRequest(
  "/water-sources?status=Working&page=1&limit=20",
);

const report = await apiRequest("/reports/submit/secure", {
  method: "POST",
  body: JSON.stringify({
    villageId: 59,
    waterSourceId: 1000,
    content: "The pump is not working.",
    reporterType: "Web",
  }),
});
```

## HTTP Status Codes

| Status | Meaning                            |
| ------ | ---------------------------------- |
| `200`  | Request succeeded                  |
| `201`  | Record created                     |
| `400`  | Invalid or missing request data    |
| `401`  | Missing, invalid, or expired token |
| `403`  | User lacks the required role       |
| `404`  | Record not found                   |
| `409`  | Duplicate or conflicting record    |
| `500`  | Unexpected server error            |

Most errors use this response:

```json
{
  "message": "Description of the error"
}
```
