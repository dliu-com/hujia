# Hujia anniversary app

Chinese memory book and shared photo album at **https://jh.dliu.com**. The public entrance shows only two reviewed landscapes. Microsoft Entra controls who can sign in; personal memories require authentication.

## Architecture

- S3 and CloudFront serve public application code.
- A separate private S3 bucket stores original photos, videos, redacted documents and the curated gift pages.
- Lambda validates Microsoft sign-in and issues short-lived media links.
- DynamoDB saves memories and shared notes with version checks to protect simultaneous edits.
- Personal media, research, private page content, secrets and deployment outputs stay under ignored `.local/` paths or private AWS storage.

The gift opens with a rose, the original handwritten card and a full-screen anniversary reveal. The first memory links to the original animated website. The replay types at twice the original speed and then draws the heart. Its clock follows the Spain anniversary calendar, independent of the device time zone: in Spain, 19 October 2026 at midnight is six years and one month.

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

The script reads the tenant ID, app ID and secret interactively, without printing them or placing them in shell history. It saves them in SSM Parameter Store under `/hujia/`. Register `https://jh.dliu.com/auth/callback` in Microsoft Entra. Manage account assignments and consent in Microsoft. No application-side list of the two email addresses is needed. Root credentials are prohibited by the maintenance scripts.

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

## Privacy and recovery

See [media privacy](docs/media-privacy.md). S3 versioning, retained storage resources and DynamoDB point-in-time recovery protect stored content. Media links expire after five minutes. Unsaved text remains in the browser until it is saved successfully.

The published `master` history excludes the original portrait favicon. A complete pre-release history backup is retained locally outside Git. Removing it from the branch cannot erase existing third-party clones or GitHub caches. Run `node scripts/check-public-media.js --history` to audit the published history.
