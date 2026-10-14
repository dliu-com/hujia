# Private memory media

The public repository contains application code and shared DL branding icons. Personal photos, videos, document scans and research notes are excluded from Git. Local preparation takes place under the ignored `.local/` directory.

Store personal media in a separate private S3 bucket with S3 Block Public Access enabled and bucket-owner-enforced ownership. The public static website bucket must not contain private memories. Microsoft sign-in grants access through the API, which returns short-lived signed media URLs. Private documents must never be included in guest previews.

The original first-gift website is preserved locally under `.local/original-site/`, including its original portrait favicon. The publishable `src/` and `archive/first-gift/` copies use the shared DL icon from DL Travel Plan. The original portrait is a separate private memory asset. It was taken in 2020 before the couple met, and Hujia liked it; the precise photo date is unknown.

## Identity documents

Never upload the unredacted source PDF, page renders or an intermediate PDF containing covered image layers. Export only a reviewed, flattened RGB raster whose sensitive pixels have been replaced. Remove EXIF, XMP, text metadata and hidden payloads before upload. Keep the retained fields and the output SHA-256 in an ignored local manifest.

The prepared provisional-licence image retains the portrait, name, issue date and address, as requested. Birth date, birthplace, driver number, signature, expiry dates and reverse-side serials are excluded. The issue date is a memory milestone, rather than evidence of the exact first driving lesson.

The published branch history excludes the portrait raster. Original authors, dates and the rest of the historic code are preserved; a complete original-history backup is kept privately. This does not erase older third-party clones or GitHub caches. The release audit checks every media object reachable from published HEAD.
