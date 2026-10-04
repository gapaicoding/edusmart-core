import { describe, expect, test } from "bun:test";
import { generateKeyPairSync, sign } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  MIDTRANS_QRIS_NOTIFY_PATH,
  MIDTRANS_SANDBOX_ORIGIN,
  accessTokenCanonical,
  createMidtransSandboxClient,
  getMidtransFinanceAvailability,
  minifyJsonBody,
  notificationCanonical,
  readMidtransSandboxConfig,
  signAccessTokenRequest,
  signTransactionalRequest,
  transactionalCanonical,
  verifyNotificationSignature,
} from "./midtrans-qris.server.ts";

describe("Midtrans BI-SNAP sandbox contract", () => {
  const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const privateKey = keys.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const publicKey = keys.publicKey.export({ type: "spki", format: "pem" }).toString();

  test("is pinned to the official sandbox host and fails closed in production", () => {
    expect(MIDTRANS_SANDBOX_ORIGIN).toBe("https://merchants.sbx.midtrans.com");
    expect(() =>
      readMidtransSandboxConfig({ NODE_ENV: "production", MIDTRANS_SANDBOX_ENABLED: "true" }),
    ).toThrow();
    expect(() =>
      readMidtransSandboxConfig({ NODE_ENV: "development", MIDTRANS_SANDBOX_ENABLED: "true" }),
    ).toThrow();
  });

  test("projects only safe finance availability without exposing configuration", () => {
    expect(
      getMidtransFinanceAvailability({ NODE_ENV: "development", MIDTRANS_SANDBOX_ENABLED: "true" }),
    ).toBe("NOT_CONFIGURED");
    expect(
      getMidtransFinanceAvailability({ NODE_ENV: "production", MIDTRANS_SANDBOX_ENABLED: "true" }),
    ).toBe("DISABLED");
    expect(
      getMidtransFinanceAvailability({
        NODE_ENV: "development",
        MIDTRANS_SANDBOX_ENABLED: "true",
        MIDTRANS_SANDBOX_CLIENT_ID: "client",
        MIDTRANS_SANDBOX_PARTNER_ID: "partner",
        MIDTRANS_SANDBOX_CLIENT_SECRET: "secret",
        MIDTRANS_SANDBOX_MERCHANT_PRIVATE_KEY: "key",
        MIDTRANS_SANDBOX_PUBLIC_KEY: "public",
        MIDTRANS_SANDBOX_MERCHANT_ID: "merchant",
        MIDTRANS_SANDBOX_CHANNEL_ID: "12345",
      }),
    ).toBe("CONFIGURED");
  });

  test("generates the documented B2B access-token canonical string and RSA signature", () => {
    const canonical = accessTokenCanonical("client", "2026-10-03T10:00:00+07:00");
    expect(canonical).toBe("client|2026-10-03T10:00:00+07:00");
    expect(signAccessTokenRequest("client", "2026-10-03T10:00:00+07:00", privateKey)).toMatch(
      /^[A-Za-z0-9+/]+=*$/,
    );
  });

  test("signs transactional requests over the minified body digest", () => {
    const body = { partnerReferenceNo: "opaque", amount: { value: "12500.00", currency: "IDR" } };
    const canonical = transactionalCanonical({
      method: "post",
      path: "/v1.0/qr/qr-mpm-generate",
      accessToken: "token",
      body,
      timestamp: "t",
    });
    expect(canonical).toMatch(/^POST:\/v1\.0\/qr\/qr-mpm-generate:token:[a-f0-9]{64}:t$/);
    expect(
      signTransactionalRequest({
        method: "POST",
        path: "/v1.0/qr/qr-mpm-generate",
        accessToken: "token",
        body,
        timestamp: "t",
        clientSecret: "secret",
      }),
    ).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });

  test("verifies signed notification canonicalization and rejects body/key/timestamp changes", () => {
    const body = { originalReferenceNo: "ref", latestTransactionStatus: "00" };
    const timestamp = "2026-10-03T10:00:00+07:00";
    const now = Date.parse(timestamp);
    const wrongKeys = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const canonical = notificationCanonical({
      method: "POST",
      path: MIDTRANS_QRIS_NOTIFY_PATH,
      body,
      timestamp,
    });
    const signature = sign("RSA-SHA256", Buffer.from(canonical), privateKey).toString("base64");
    const input = {
      method: "POST",
      path: MIDTRANS_QRIS_NOTIFY_PATH,
      body,
      timestamp,
      signature,
      publicKey,
      now,
    };
    expect(verifyNotificationSignature(input)).toBe(true);
    expect(
      verifyNotificationSignature({ ...input, body: { ...body, latestTransactionStatus: "03" } }),
    ).toBe(false);
    expect(
      verifyNotificationSignature({
        ...input,
        publicKey: wrongKeys.publicKey.export({ type: "spki", format: "pem" }).toString(),
      }),
    ).toBe(false);
    expect(verifyNotificationSignature({ ...input, timestamp: "2026-10-04T10:00:00+07:00" })).toBe(
      false,
    );
    expect(verifyNotificationSignature({ ...input, timestamp: "bad" })).toBe(false);
    expect(minifyJsonBody('{ "a" : "value with spaces", "b": [ 1, 2 ] }')).toBe(
      '{"a":"value with spaces","b":[1,2]}',
    );
  });

  test("uses a fixed sandbox URL, validates QR output and never retries ambiguous creation", async () => {
    const requests = [];
    const fetcher = async (url, init) => {
      requests.push({ url: String(url), init });
      if (String(url).endsWith("/v1.0/access-token/b2b")) {
        return Response.json({
          responseCode: "2007300",
          accessToken: "opaque-token",
          expiresIn: 900,
        });
      }
      return Response.json({
        responseCode: "2004700",
        partnerReferenceNo: "opaque-id",
        referenceNo: "r1",
        qrContent: "000201",
      });
    };
    const config = {
      clientId: "client",
      partnerId: "partner",
      clientSecret: "secret",
      merchantPrivateKey: privateKey,
      midtransPublicKey: publicKey,
      merchantId: "merchant",
      channelId: "12345",
    };
    const client = createMidtransSandboxClient(
      config,
      fetcher,
      () => new Date("2026-10-03T03:00:00Z"),
    );
    const result = await client.createQrisOrder({
      externalId: "opaque-id",
      amountIdr: 1500,
      expiresAt: "2026-10-03T10:00:00+07:00",
    });
    expect(result.qrContent).toBe("000201");
    expect(requests).toHaveLength(2);
    expect(requests.every((request) => request.url.startsWith(MIDTRANS_SANDBOX_ORIGIN))).toBe(true);
    expect(requests[1].init.body).toContain('"value":"1500.00"');
  });

  test("marks create timeout ambiguous and makes no second remote attempt", async () => {
    let transactionAttempts = 0;
    const fetcher = async (url) => {
      if (String(url).endsWith("/v1.0/access-token/b2b")) {
        return Response.json({
          responseCode: "2007300",
          accessToken: "opaque-token",
          expiresIn: 900,
        });
      }
      transactionAttempts += 1;
      return Response.json({ responseCode: "5044700" }, { status: 504 });
    };
    const config = {
      clientId: "client",
      partnerId: "partner",
      clientSecret: "secret",
      merchantPrivateKey: privateKey,
      midtransPublicKey: publicKey,
      merchantId: "merchant",
      channelId: "12345",
    };
    const client = createMidtransSandboxClient(
      config,
      fetcher,
      () => new Date("2026-10-03T03:00:00Z"),
    );
    await expect(
      client.createQrisOrder({
        externalId: "opaque-id",
        amountIdr: 1500,
        expiresAt: "2026-10-03T10:00:00+07:00",
      }),
    ).rejects.toMatchObject({ code: "AMBIGUOUS" });
    expect(transactionAttempts).toBe(1);
  });

  test("keeps Midtrans orders sandbox-only and settlement behind the B24 reconciliation function", () => {
    const migration = readFileSync(
      resolve(process.cwd(), "supabase/migrations/20261004100000_b27_midtrans_qris_sandbox.sql"),
      "utf8",
    ).toLowerCase();
    const b24Migration = readFileSync(
      resolve(
        process.cwd(),
        "supabase/migrations/20260929110000_b24_online_payment_reconciliation.sql",
      ),
      "utf8",
    ).toLowerCase();
    const validator = readFileSync(
      resolve(process.cwd(), "supabase/validation/validate_b27_midtrans_qris_sandbox.sql"),
      "utf8",
    ).toLowerCase();
    expect(migration).toContain("check (environment = 'sandbox')");
    expect(migration).toContain("b24_reconcile_midtrans_qris_event");
    expect(migration).toContain("insert into public.finance_payment_allocations");
    expect(migration).toContain("where a.invoice_id=i.id");
    expect(b24Migration).toContain("unique (provider_key, provider_event_id)");
    expect(migration).not.toMatch(/midtrans_[a-z_]*(secret|private_key)/);
    expect(migration).not.toMatch(/raw_webhook|raw_payload/);
    expect(validator).toContain("b27_midtrans_qris_sandbox_validation_pass");
  });
});
