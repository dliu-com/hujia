# jh.dliu.com health checks

How [status.dliu.com](https://status.dliu.com) tests https://jh.dliu.com as an anonymous guest, following the dliu.com
health contract (dliu-com/status `HEALTH.md`). The people's version, with a diagram, is the
Testing tab at https://jh.dliu.com/docs#health. This file has every technical detail and is enough on its own to implement the tests.

jh.dliu.com is a private memory site for two people. Guests see only the entrance, the docs and two public scenery
photos; everything else needs a Microsoft sign-in. The checks below prove the public parts work and that the private
parts stay closed, without signing in and without revealing anything about the site's content.

## Functions

| Key | Name | What it does | Critical |
| --- | --- | --- | --- |
| `pages` | Pages | The entrance (`/`) and these docs, served by CloudFront from S3. | yes |
| `scenery` | Public scenery photos | The two scenery photos on the entrance, served and cached by CloudFront. | no |
| `signin` | Microsoft sign-in | `/auth/login` sends people to Microsoft; the Lambda can read its sign-in settings. | yes |
| `private` | Privacy gate | Private memories refuse anyone who is not signed in. | yes |
| `memories` | Memory storage | The DynamoDB table that holds memory text, notes and wishes. | yes |
| `media` | Private media storage | The private S3 bucket that holds original photos, videos and gift pages. | no |

## Guest checks

Rules for every check: method GET or HEAD only; send no cookies, no `Authorization` header and no query string; do not
follow redirects; user agent `dliu-status-bot/1.0 (+https://status.dliu.com/docs)`; timeout 10 s.

| Function | Method | URL | Status | Content type | Body marker, JSON key or `Location` prefix | Slow after |
| --- | --- | --- | --- | --- | --- | --- |
| `pages` | GET | https://jh.dliu.com/ | 200 | `text/html` | contains `class="dl-header"` | 2000 ms |
| `pages` | GET | https://jh.dliu.com/docs | 200 | `text/html` | contains `class="dl-tabs"` | 2000 ms |
| `scenery` | GET | https://jh.dliu.com/api/public | 200 | `application/json` | JSON key `photos` | 2000 ms |
| `scenery` | HEAD | https://jh.dliu.com/api/guest/guestSea | 200 | `image/jpeg` | — | 2000 ms |
| `scenery` | HEAD | https://jh.dliu.com/api/guest/guestHarbour | 200 | `image/jpeg` | — | 2000 ms |
| `signin` | GET | https://jh.dliu.com/auth/login | 302 | — | `Location` starts with `https://login.microsoftonline.com/` | 3000 ms |
| `signin` | GET | https://jh.dliu.com/api/me | 200 | `application/json` | contains `"signedIn":false` | 3000 ms |
| `private` | GET | https://jh.dliu.com/api/story | 401 | `application/json` | JSON key `error` | 3000 ms |

Notes:

- `text/html` from S3 has no charset; match the content type by prefix.
- Use HEAD for the two photos so no image bytes are transferred.
- `/api/me` answers 200 with `{"signedIn":false,…}` for guests, not 401.
- `/api/story` must stay 401. A 200 there would mean private memories are open to guests: report `private` as down.

## Health endpoint

`GET https://jh.dliu.com/health` (HEAD also works).

- No authentication. CloudFront's `health` behavior has no origin request policy, so it forwards no cookies, no
  `Authorization` header and no query string, and the Lambda answers before it looks at any request data.
- Cached at CloudFront for 60 s (`Cache-Control: public, max-age=60`, cache key empty), so it runs at most about once a
  minute per edge.
- Read only. Each function has its own 4 s timeout; a check slower than 2.5 s is `warn` with `output` `slow`. The
  whole reply returns within about 4 s.
- `Content-Type: application/health+json`. HTTP 200 when `status` is `pass` or `warn`, 503 when it is `fail`.
- `output` is only `slow`, `timeout` or `read failed`. No names, counts or content.

```json
{
  "status": "pass",
  "time": "2026-11-03T23:00:00Z",
  "functions": [
    { "key": "memories", "name": "Memory storage", "status": "pass" },
    { "key": "media", "name": "Private media storage", "status": "pass" },
    { "key": "signin", "name": "Microsoft sign-in settings", "status": "pass" }
  ]
}
```

| Function key | What the check reads |
| --- | --- |
| `memories` | One DynamoDB `GetItem` of a fixed key that holds no record. |
| `media` | One S3 `HeadObject` of a fixed, known object in the private bucket (no LIST, no download). |
| `signin` | The sign-in settings the app already loads from SSM Parameter Store (cached 5 minutes). Microsoft is not called. |

`pages`, `scenery` and `private` are covered by the guest checks only.

## Not tested

A guest can't test anything that needs our sign-in:

- signing in at Microsoft and getting a session;
- opening the memory book, the album, the old website, photos and videos;
- saving notes and memories, and uploading photos or videos;
- the five-minute private media links.

## Rules

- Every check is read only and must never change content.
- Never send cookies, credentials or query strings, and never try to sign in.
- Run at most every 15 minutes; `/health` is cached for 60 s anyway.
