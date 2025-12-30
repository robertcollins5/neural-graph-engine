# Neural Graph Engine - API Reference

## Overview

The Neural Graph Engine exposes three main REST API endpoints for company analysis and relationship discovery. This document provides detailed specifications for integrating with the API.

---

## Base URL

**Development:** `http://localhost:3000`  
**Production:** `https://demo.signal6.com.au`

---

## Authentication

Currently, the API does not require authentication. All endpoints are publicly accessible.

**Future Enhancement:** API key authentication will be added for production deployments.

---

## Endpoints

### 1. POST /api/parse-companies

Extracts company names and tickers from unstructured text.

#### Request

```http
POST /api/parse-companies
Content-Type: application/json

{
  "text": "Monash IVF ASX:MVF -10.37%\nTerracom Ltd (TER) -26.67%"
}
```

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `text` | string | Yes | Unstructured text containing company names and tickers |

#### Response (Success)

```json
{
  "companies": [
    {
      "name": "Monash IVF",
      "ticker": "MVF",
      "stress_signal": -10.37
    },
    {
      "name": "Terracom Ltd",
      "ticker": "TER",
      "stress_signal": -26.67
    }
  ],
  "parsing_status": "success"
}
```

#### Response (No Companies Found)

```json
{
  "companies": [],
  "parsing_status": "no_companies_found",
  "message": "No companies found. Try including ticker codes like (TER) or (BBN)"
}
```

#### Supported Formats

The parser recognizes these company formats:

- `Company Name (TICKER)` - e.g., "Terracom Ltd (TER)"
- `Company Name ASX:TICKER` - e.g., "Monash IVF ASX:MVF"
- `TICKER Company Name` - e.g., "TER Terracom Ltd"
- Optional stress signal: `-10.37%` or `+5.2%`

#### Example cURL

```bash
curl -X POST http://localhost:3000/api/parse-companies \
  -H "Content-Type: application/json" \
  -d '{"text":"Monash IVF ASX:MVF -10.37%"}'
```

---

### 2. POST /api/discover-batch

Discovers relationships for a batch of companies and identifies multi-company exposure entities.

#### Request

```http
POST /api/discover-batch
Content-Type: application/json

{
  "companies": [
    {
      "name": "Monash IVF",
      "ticker": "MVF",
      "stress_signal": -10.37
    },
    {
      "name": "Terracom Ltd",
      "ticker": "TER",
      "stress_signal": -26.67
    }
  ]
}
```

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `companies` | array | Yes | Array of company objects to analyze |
| `companies[].name` | string | Yes | Company name |
| `companies[].ticker` | string | Yes | Stock ticker symbol |
| `companies[].stress_signal` | number | No | Stress signal (e.g., -10.37 for -10.37%) |

#### Response (Success)

```json
{
  "companies": [
    {
      "name": "Monash IVF",
      "ticker": "MVF",
      "stress_signal": -10.37,
      "relationships": [
        {
          "entity_name": "BDO Australia",
          "entity_type": "firm",
          "category": "auditor",
          "details": "External auditor for MVF"
        },
        {
          "entity_name": "Soul Pattinson",
          "entity_type": "individual",
          "category": "shareholder",
          "details": "9.7% shareholder"
        },
        {
          "entity_name": "Healius Limited",
          "entity_type": "company",
          "category": "competitor",
          "details": "Parallel stress company in healthcare sector"
        }
      ],
      "processing_status": "completed"
    }
  ],
  "who_cares": [
    {
      "entity_name": "BDO Australia",
      "entity_type": "firm",
      "category": "auditor",
      "exposure_count": 2,
      "exposed_companies": ["MVF", "TER"],
      "exposure_details": [
        {
          "ticker": "MVF",
          "relationship_type": "auditor"
        },
        {
          "ticker": "TER",
          "relationship_type": "auditor"
        }
      ]
    }
  ],
  "processing_stats": {
    "total_companies": 2,
    "total_relationships": 24,
    "multi_exposure_entities": 3,
    "api_calls_used": 45,
    "processing_time_ms": 5200
  }
}
```

#### Response Fields

**companies[].relationships[]:**

| Field | Type | Description |
|-------|------|-------------|
| `entity_name` | string | Name of the related entity |
| `entity_type` | string | Type: "individual", "firm", "company" |
| `category` | string | Relationship type: "shareholder", "auditor", "broker", "executive", "competitor", "pe_firm", "advisor" |
| `details` | string | Additional context about the relationship |

**who_cares[]:**

| Field | Type | Description |
|-------|------|-------------|
| `entity_name` | string | Name of the multi-exposure entity |
| `entity_type` | string | Type: "individual", "firm", "company" |
| `category` | string | Primary relationship type |
| `exposure_count` | number | Number of companies this entity is connected to |
| `exposed_companies` | array | List of ticker symbols |
| `exposure_details` | array | Details of each connection |

**processing_stats:**

| Field | Type | Description |
|-------|------|-------------|
| `total_companies` | number | Number of companies analyzed |
| `total_relationships` | number | Total relationships discovered |
| `multi_exposure_entities` | number | Entities connected to 2+ companies |
| `api_calls_used` | number | Total API calls made (for cost tracking) |
| `processing_time_ms` | number | Total processing time in milliseconds |

#### Example cURL

```bash
curl -X POST http://localhost:3000/api/discover-batch \
  -H "Content-Type: application/json" \
  -d '{
    "companies": [
      {
        "name": "Monash IVF",
        "ticker": "MVF",
        "stress_signal": -10.37
      }
    ]
  }'
```

#### Processing Time

- **Small batch (1-3 companies):** 2-5 seconds
- **Medium batch (4-8 companies):** 5-15 seconds
- **Large batch (9+ companies):** 15-60 seconds

Times depend on API availability and network conditions.

---

### 3. POST /api/who-cares

Analyzes multi-company exposure from pre-discovered relationships.

#### Request

```http
POST /api/who-cares
Content-Type: application/json

{
  "companies": [
    {
      "name": "Monash IVF",
      "ticker": "MVF",
      "relationships": [
        {
          "entity_name": "BDO Australia",
          "entity_type": "firm",
          "category": "auditor"
        }
      ]
    },
    {
      "name": "Terracom Ltd",
      "ticker": "TER",
      "relationships": [
        {
          "entity_name": "BDO Australia",
          "entity_type": "firm",
          "category": "auditor"
        }
      ]
    }
  ]
}
```

#### Response

```json
{
  "multi_exposure_entities": [
    {
      "entity_name": "BDO Australia",
      "entity_type": "firm",
      "category": "auditor",
      "exposure_count": 2,
      "exposed_companies": ["MVF", "TER"],
      "exposure_details": [
        {
          "ticker": "MVF",
          "relationship_type": "auditor"
        },
        {
          "ticker": "TER",
          "relationship_type": "auditor"
        }
      ]
    }
  ]
}
```

#### Example cURL

```bash
curl -X POST http://localhost:3000/api/who-cares \
  -H "Content-Type: application/json" \
  -d '{
    "companies": [
      {
        "name": "Monash IVF",
        "ticker": "MVF",
        "relationships": [
          {
            "entity_name": "BDO Australia",
            "entity_type": "firm",
            "category": "auditor"
          }
        ]
      }
    ]
  }'
```

---

## Error Handling

### Error Response Format

```json
{
  "error": "Error message describing what went wrong",
  "status": 400
}
```

### Common Errors

| Status | Error | Cause |
|--------|-------|-------|
| 400 | "No companies provided" | Empty companies array in request |
| 400 | "Invalid company format" | Missing required fields in company object |
| 500 | "API processing error" | Temporary API failure (retry recommended) |
| 503 | "Service unavailable" | Server temporarily down |

### Retry Strategy

For failed requests:
1. Wait 1-2 seconds
2. Retry the request
3. If still failing, check server status

---

## Rate Limiting

Currently, there are no rate limits on the API. However, be mindful of:

- **API costs:** Each relationship discovery call uses Google Search API credits
- **Processing time:** Large batches take longer to process
- **Concurrent requests:** Limit to 5-10 simultaneous requests

---

## Integration Examples

### JavaScript/Node.js

```javascript
async function analyzeCompanies(text) {
  // Step 1: Parse companies
  const parseResponse = await fetch('/api/parse-companies', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text })
  });
  
  const { companies } = await parseResponse.json();
  
  // Step 2: Discover relationships
  const discoverResponse = await fetch('/api/discover-batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ companies })
  });
  
  const results = await discoverResponse.json();
  return results;
}

// Usage
analyzeCompanies('Monash IVF ASX:MVF -10.37%').then(results => {
  console.log('Multi-exposure entities:', results.who_cares);
});
```

### Python

```python
import requests
import json

def analyze_companies(text):
    base_url = "https://demo.signal6.com.au"
    
    # Step 1: Parse companies
    parse_response = requests.post(
        f"{base_url}/api/parse-companies",
        json={"text": text}
    )
    companies = parse_response.json()["companies"]
    
    # Step 2: Discover relationships
    discover_response = requests.post(
        f"{base_url}/api/discover-batch",
        json={"companies": companies}
    )
    
    results = discover_response.json()
    return results

# Usage
results = analyze_companies("Monash IVF ASX:MVF -10.37%")
print("Multi-exposure leads:", results["who_cares"])
```

### cURL

```bash
# Parse companies
curl -X POST https://demo.signal6.com.au/api/parse-companies \
  -H "Content-Type: application/json" \
  -d '{"text":"Monash IVF ASX:MVF -10.37%"}'

# Discover relationships
curl -X POST https://demo.signal6.com.au/api/discover-batch \
  -H "Content-Type: application/json" \
  -d '{
    "companies": [
      {"name":"Monash IVF","ticker":"MVF","stress_signal":-10.37}
    ]
  }'
```

---

## Data Models

### Company Object

```typescript
interface Company {
  name: string;           // Company name
  ticker: string;         // Stock ticker symbol
  stress_signal?: number; // Optional stress signal (e.g., -10.37)
}
```

### Relationship Object

```typescript
interface Relationship {
  entity_name: string;    // Name of related entity
  entity_type: string;    // "individual" | "firm" | "company"
  category: string;       // Relationship type
  details: string;        // Additional context
}
```

### MultiExposureEntity Object

```typescript
interface MultiExposureEntity {
  entity_name: string;
  entity_type: string;
  category: string;
  exposure_count: number;
  exposed_companies: string[];
  exposure_details: Array<{
    ticker: string;
    relationship_type: string;
  }>;
}
```

---

## Relationship Categories

The API recognizes these relationship types:

| Category | Description | Example |
|----------|-------------|---------|
| `shareholder` | Owns equity in the company | "9.7% shareholder" |
| `auditor` | External auditor | "BDO Australia" |
| `broker` | Broker or underwriter | "Canaccord Genuity" |
| `executive` | Board member or key personnel | "CEO, CFO, Director" |
| `competitor` | Industry competitor or peer | "Healius Limited" |
| `pe_firm` | Private equity or investment group | "Genesis Capital" |
| `advisor` | Financial or strategic advisor | "Investment bank" |
| `customer` | Major customer | "B2B relationship" |
| `supplier` | Major supplier | "B2B relationship" |

---

## Performance Optimization

### Batch Processing

For analyzing multiple companies efficiently:

1. **Combine into single request** - Send all companies in one `/api/discover-batch` call
2. **Avoid sequential calls** - Don't call the API for each company individually
3. **Monitor processing time** - Check `processing_stats.processing_time_ms` in response

### Caching

To reduce API costs:

1. **Cache relationship data** - Store results for companies you've already analyzed
2. **Reuse results** - If analyzing the same company batch again, use cached data
3. **Implement TTL** - Refresh cache every 30 days for updated information

---

## Webhooks (Future)

Future versions will support webhooks for long-running batch analysis:

```json
{
  "webhook_url": "https://your-domain.com/webhook",
  "webhook_events": ["analysis_complete", "error"]
}
```

---

## API Changelog

### Version 1.0 (Current)

- Initial release
- Three main endpoints: parse-companies, discover-batch, who-cares
- Mock relationship data
- Claude and Google Search API integration ready

### Planned Improvements

- API key authentication
- Webhook support for async processing
- Batch job queuing
- Relationship confidence scoring
- Historical analysis tracking

---

## Support

For API issues or questions:

1. Check error messages and status codes
2. Review this documentation
3. Check server logs for detailed errors
4. Contact Manus AI for assistance

---

**API Version:** 1.0  
**Last Updated:** December 30, 2025  
**Status:** Production Ready
