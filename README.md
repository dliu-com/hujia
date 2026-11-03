# Hujia anniversary app

Chinese memory book and shared photo album at **https://jh.dliu.com**. The public entrance shows only two reviewed landscapes. Microsoft Entra controls who can sign in; personal memories require authentication.

## Architecture

- S3 and CloudFront serve public application code.
- A separate private S3 bucket stores original photos, videos, redacted documents and the curated gift pages.
- Lambda validates Microsoft sign-in and issues short-lived media links.
- DynamoDB saves memories and shared notes with version checks to protect simultaneous edits.
- Personal media, research, private page content, secrets and deployment outputs stay under ignored `.local/` paths or private AWS storage.

The gift opens with a rose, the original handwritten card and a full-screen anniversary reveal. The first memory links to the original animated website. The replay types at twice the original speed and then draws the heart. Its clock follows the Spain anniversary calendar, independent of the device time zone: in Spain, 19 October 2026 at midnight is six years and one month.

## Look and feel

The site uses the shared dliu.com look ([kit and spec](https://files.dliu.com/dliu.com/README.md)):

- Each page loads `https://files.dliu.com/dliu.com/ui/v1/dl.css` first. It uses the shared `dl-header`, `dl-nav`, `dl-button` and `dl-footer` markup and the shared `dl-language` switcher.
- Top left, the app's logo (`web/icon.png`, also the favicon) and name form one `dl-brand` link home. jh's logo has always been the DL mark; the original portrait favicon stays out of the published code for privacy.
- Every footer starts with the shared DL logo (`dl-footer-logo`), linking to dliu.com.
- The header ends its links with a `文档`/`Docs` button, and every footer reads `dliu.com · 文档`.
- `/docs` (`web/docs.html`) has three `dl-tabs` and loads `dl-docs.css`: Architecture (`/docs`), Cost (`/docs/cost`), Security (`/docs/security`) and Testing (`/docs#health`). The old `/about`, `/security` and `/docs/health` addresses 301-redirect there. There is no API tab: `/api/*` serves only this site's pages and needs our sign-in.
- `web/style.css`, `library.css` and `edit-conflict.css` hold only app-specific rules: the home hero, the album layout and the edit-conflict dialog. They use the shared `--dl-*` variables.
- The CSP allows only the kit's paths: `style-src https://files.dliu.com/dliu.com/ui/` and `img-src https://files.dliu.com/dliu.com/`.
- `test/shared-ui.test.js` guards these rules.

The album page (`/api/library`) is Chinese-only, so it has no language switcher. The private gift and old-website pages keep their own design as memory content.

## Local preview

```sh
npm ci
npm run dev
```

Open the displayed loopback URL. The preview uses `.local/live-assets/` and optional `.local/book-content.json`. Its edits are saved separately to `.local/dev-state.json`; it never uses Microsoft secrets or writes to production. These private preparation files are intentionally absent from Git. The public landing page and application code remain available without them.

## Sign-in settings

```sh
./scripts/set-secrets.sh
node scripts/check-auth.js
```

The script reads the app (client) ID and secret interactively, without printing them or placing them in shell history. It saves them in SSM Parameter Store under `/hujia/`. The tenant ID is shared by every dliu.com app: it lives in `/dliu/entra-tenant-id`, managed by the [dliu-com/audit](https://github.com/dliu-com/audit) stack. The deploy reads it (and fails if it is missing) and passes its value to the Lambda as a fallback; the Lambda reads the parameter itself, with `ssm:GetParameter` on exactly that parameter. Register `https://jh.dliu.com/auth/callback` in Microsoft Entra. Manage account assignments and consent in Microsoft. No application-side list of the two email addresses is needed.

Accepted by the owner: Microsoft Entra is the sign-in gate (single tenant, user assignment required). After sign-in, `isAllowed` in `lambda/api/auth.js` accepts any `@dliu.com` account from the tenant; the app keeps no per-person allow-list, so Entra assignment alone decides who gets in. Who is assigned is not published. Root credentials are prohibited by the maintenance scripts.

## Check and deploy

```sh
npm test
npm run check
node scripts/check-clock.js
node scripts/check-public-media.js
npm run deploy -- HujiaMemory --outputs-file .local/deploy-outputs.json
```

The historical Jenkins build and deployment entry points are retired; pushing code cannot launch the old ECS deployment or recreate the old domain. GitHub checks validate the application without AWS credentials.

Use the existing Dewei IAM identity or an explicitly authorized role. The stack creates only `jh.dliu.com`, with no `hujia.dliu.com` redirect.

To publish reviewed private pages and originals, prepare `.local/live-assets/manifest.json`, media files, `current.html`, `old-website.html` and the redaction audit manifest. Then run:

```sh
node scripts/upload-preview.js --assets=asset-one,asset-two
node scripts/upload-preview.js --pages-only
node scripts/import-memories.js .local/book-content.json
```

The uploader checks private-bucket controls and asset checksums. The importer creates missing records without overwriting shared edits. Videos are played with their original sound. Uploaded files are never resized or reencoded. Video excerpts use codec stream copies.

## Edge caching and clearing

CloudFront uses every edge location (`PriceClass_All`) and serves HTTP/2 and HTTP/3.

- **Application code** (`web/` JS and CSS): `public, max-age=300, s-maxage=86400, stale-while-revalidate=86400`. Browsers keep these files for 5 minutes, and the edge keeps them for 1 day.
- **HTML shells** (`index.html` for `/`, `docs.html` for `/docs`, `/docs/cost` and `/docs/security`): `no-cache`, so they are revalidated on every request.
- **The two public scenery photos** (`/api/guest/guestSea`, `/api/guest/guestHarbour`): CloudFront reads them from the private bucket with origin access control and keeps them for 1 day. The bucket policy lets CloudFront read only those two objects.
- **API, sign-in, old website, private pages and media**: not cached (`CachingDisabled`, responses `no-store`). Media requests are redirected to short-lived presigned S3 URLs, so CloudFront never caches photos or videos.

Clearing: each `npm run deploy` uploads `web/` and invalidates `/*`.

The CloudFront viewer function (`lib/routes.cjs`, tested in `test/routes.test.js`) answers only on `jh.dliu.com`, maps the docs and guest addresses, and redirects the old ones.

Automatic S3-event clearing (EventBridge → Lambda → CloudFront invalidation) is **not used here, by design**. Only the deployment writes to the public site bucket, and that deployment already clears the edge. Uploads and curated media go to the private bucket, which CloudFront doesn't cache. Leaving it out also saves the shared free allowance of 1,000 invalidation paths a month. Add automatic clearing only if something starts changing edge-cached files outside a deploy.

## Health checks

[status.dliu.com](https://status.dliu.com) tests the site every 15 minutes as an anonymous guest (contract: dliu-com/status `HEALTH.md`).

- The Testing tab, `/docs#health`, explains it for people: a diagram, one line per function and what a guest can't test, with the technical details folded. `/docs/health.md` (served as `text/markdown; charset=utf-8`) is the full technical version: functions, guest checks, the `/health` format and rules.
- `GET /health` (`lambda/api/health.js`) reports `memories` (DynamoDB `GetItem` of a fixed empty key), `media` (S3 `HeadObject` of one known object) and `signin` (the SSM settings sign-in already loads) as `application/health+json`: 200 for pass or warn, 503 for fail. CloudFront's `health` behavior forwards no cookies, `Authorization` header or query string, and caches the reply for 60 s; the handler answers before it reads any request data.
- `test/health.test.js` keeps the endpoint, the page and the Markdown file in sync.

## Security review

The threat model, live penetration test results and code review are on [/docs/security](https://jh.dliu.com/docs/security). To rerun the checks:

```sh
npm test                                   # includes the IAM, bucket policy, routing and auth regression tests
node scripts/pentest-live.mjs              # live, read-only, anonymous tests
node scripts/pentest-live.mjs --aws --mint # + direct-origin and signed-in tests (owner's AWS access)
npm audit --omit=dev && npm audit
gitleaks git --log-opts="--all" --redact .
```

`--mint` reads the Microsoft secret from SSM to sign 5-minute test sessions in memory; it never prints them and none of its requests change stored data. Use `--html` to print the results as table rows for the docs page.

## Privacy and recovery

See [media privacy](docs/media-privacy.md). S3 versioning, retained storage resources and DynamoDB point-in-time recovery protect stored content. Media links expire after five minutes. Unsaved text remains in the browser until it is saved successfully.

The published `master` history excludes the original portrait favicon. A complete pre-release history backup is retained locally outside Git. Removing it from the branch cannot erase existing third-party clones or GitHub caches. Run `node scripts/check-public-media.js --history` to audit the published history.
