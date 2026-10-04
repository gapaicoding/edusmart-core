# Batch 27 Midtrans QRIS Sandbox Runbook

## Boundary

Sandbox only. No real money, live Midtrans endpoint, Production credential, or real QR scan. A PR is not sandbox verification; sandbox verification is not Production authorization.

## Prerequisites

Obtain a Midtrans BI-SNAP sandbox merchant/account and credential exchange through the product owner. The merchant's PKCS#8 private key stays in the server secret store; Midtrans provides client ID, client secret, partner ID and callback public key; merchant/channel identifiers and five-digit channel ID are configured by onboarding. Configure the notification URL domain so Midtrans can append `/v1.0/qr/qr-mpm-notify`. Do not put values in source, DB, browser, logs or reports. This repository's existing local env did not contain Midtrans key names during B27 bootstrap; no sandbox request was made.

Development variable names are documented in code/runbook as `MIDTRANS_SANDBOX_CLIENT_ID`, `MIDTRANS_SANDBOX_PARTNER_ID`, `MIDTRANS_SANDBOX_CLIENT_SECRET`, `MIDTRANS_SANDBOX_MERCHANT_PRIVATE_KEY`, `MIDTRANS_SANDBOX_PUBLIC_KEY`, `MIDTRANS_SANDBOX_MERCHANT_ID`, `MIDTRANS_SANDBOX_CHANNEL_ID`, and explicit `MIDTRANS_SANDBOX_ENABLED`. They are server-only. Runtime host is not configurable.

## Flow

1. Parent opens a linked, issued invoice and selects the clearly labeled sandbox QRIS option.
2. Server validates relationship and canonical outstanding amount; DB reserves one B24 intent/order with one stable external UUID.
3. Server obtains a short-lived BI-SNAP token and creates QR MPM. QR creation alone is pending, not paid.
4. Parent sees QR, IDR amount, expiry, pending state, sandbox warning and B19 manual-payment fallback.
5. Midtrans callback is size/content-type bounded, signature/freshness/partner checked, correlated to the stored order, amount/currency checked, deduped, normalized and passed to B24.
6. B24 reconciliation alone may create B19 settlement. Finance reviews safe exception codes; no manual override exists.

## Sandbox lifecycle

When credentials and an authorized public HTTPS callback environment exist, use one synthetic Development invoice and the official Midtrans QRIS sandbox simulator documented at https://simulator.sandbox.midtrans.com/openapi/qris/index. Do not use a banking/e-wallet app or real funds. Record only safe internal/provider references. Confirm one settlement and repeat notification idempotency. Report QR creation, simulator payment and remote callback receipt as separate evidence. Do not install a tunnel or expose a workstation.

## Ambiguity and outage

For create timeout, keep the original external ID and query `/v1.0/qr/qr-mpm-query` with `originalExternalId` and service code `47`. Do not automatically issue another QR after not-found; current docs do not establish a race-free second creation. Show safe pending/ambiguous/unavailable guidance and retain B19 manual payment. Status refresh is server-side and rate-bounded.

## Disable and operations

Set the explicit sandbox-enabled switch off to block new orders. Existing orders remain inspectable; signed callback processing remains available for existing sandbox orders. Rotate credentials through the owner-managed secret store. Troubleshoot only normalized codes and correlation IDs; never log bearer tokens, signatures, QR raw payloads or callback bodies.

## Future Production prerequisites

Separate approved release: live merchant onboarding and credentials, TLS/callback IP allowlisting as supported by hosting, secret rotation, monitoring/on-call owner, reconciliation exception/refund policy, controlled rollout and product-owner approval. B27 does not provide these and must fail closed in Production.
