# Batch 27 Midtrans Integration Contract

## Locked boundary

- API family: BI-SNAP Core API, QR MPM only.
- Environment: Midtrans sandbox only; runtime host is a constant allowlist.
- Method: dynamic QRIS; Midtrans documents GoPay and ShopeePay acquirers. Initial request uses the configured sandbox acquirer.
- EduSmart truth: B19 invoices/payments; B24 intents/events/reconciliation. B27 stores only provider order/instruction and callback delivery state.
- Production calls and live settlement are disabled in this batch.

## Official documentation reviewed

Official Midtrans documentation was accessed 2026-10-03:

- [BI-SNAP Core API overview](https://docs.midtrans.com/reference/core-api-snap-open-api-overview)
- [BI-SNAP security specification](https://docs.midtrans.com/reference/security-specification)
- [BI-SNAP signature generation](https://docs.midtrans.com/reference/signature-generation)
- [B2B access token API](https://docs.midtrans.com/reference/access-token-api)
- [QRIS MPM API](https://docs.midtrans.com/reference/mpm-api-qris)
- [QRIS status query](https://docs.midtrans.com/reference/get-transaction-status-api)
- [Payment notification API](https://docs.midtrans.com/reference/payment-notification-api)
- [Sandbox QRIS simulator procedure](https://docs.midtrans.com/reference/testing-bi-snap-on-sandbox-environment)

Docs report sandbox transactional host `merchants.sbx.midtrans.com` and production host `merchants.midtrans.com`; B27 hardcodes only sandbox. Endpoints: `POST /v1.0/access-token/b2b`, `POST /v1.0/qr/qr-mpm-generate` (service 47), `POST /v1.0/qr/qr-mpm-query` (service 51), and callback `POST /v1.0/qr/qr-mpm-notify` (service 52). Legacy `/v2/charge` and legacy `SHA512(order_id + status_code + gross_amount + serverKey)` notification verification are not used.

## Authentication and signatures

- Token: OAuth client credentials, `grantType=client_credentials`; `X-CLIENT-KEY`; merchant signs `clientId|timestamp` using SHA256withRSA / PKCS#8 RSA private key. Token lifetime is taken from response (docs default 900 seconds); keep token only in process memory.
- Transactional calls: bearer token; HMAC-SHA512 using client secret over `METHOD:path:token:lowercase(hex(SHA256(minified UTF-8 JSON))):timestamp`; partner ID, external ID, five-digit channel ID and device ID headers.
- QR generation uses the same UUID as `X-EXTERNAL-ID` and `partnerReferenceNo`, per QRIS docs. QR query uses that original external ID and service code `47`.
- Callback signature: Midtrans public key verifies SHA256withRSA over `METHOD:path:lowercase(hex(SHA256(minified UTF-8 request body))):X-TIMESTAMP`. Also verify partner identity and a bounded timestamp skew. Database uniqueness provides replay defense; signature alone is not idempotency.
- QR notification response uses BI-SNAP response body codes (success `2005200`; pending `2025200` where appropriate). No legacy callback protocol.

## Status and ambiguity

Documented QR status values: `00` success, `03` pending, `04` refunded, `05` canceled, `06` failed, `07` not found, `08` expiry, `09` rejected. B27 settles only `00`, and only through B24 reconciliation. `04` is unsupported and must not reverse B19; preserve a safe review outcome. Unknown statuses do not settle.

On create timeout, query using the same `originalExternalId`; never generate a new external ID automatically. If status is not found, leave the attempt ambiguous because the docs establish query recovery but do not establish a race-free second create after not-found. Manual payment remains available.

QR data: use validated `qrContent` and render locally; do not fetch an arbitrary `qrUrl` or retain unbounded base64 `qrImage`. Amount is server-derived IDR, rendered with two decimal digits for BI-SNAP.

## Explicitly unsupported

Production host/credentials, VA, second provider, refund/chargeback automation, raw callback retention, direct B19 settlement, arbitrary base URL, and automatic retry with a new external ID.
