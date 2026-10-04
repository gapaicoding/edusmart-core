import {
  createHash,
  createHmac,
  createSign,
  timingSafeEqual,
  verify as verifySignature,
} from "node:crypto";

export const MIDTRANS_SANDBOX_ORIGIN = "https://merchants.sbx.midtrans.com";
export const MIDTRANS_QRIS_NOTIFY_PATH = "/v1.0/qr/qr-mpm-notify";
const TOKEN_PATH = "/v1.0/access-token/b2b";
const GENERATE_PATH = "/v1.0/qr/qr-mpm-generate";
const QUERY_PATH = "/v1.0/qr/qr-mpm-query";
const REQUEST_TIMEOUT_MS = 8_000;
const CALLBACK_SKEW_MS = 5 * 60_000;
const MAX_RESPONSE_BYTES = 64 * 1024;

export type MidtransSandboxConfig = {
  clientId: string;
  partnerId: string;
  clientSecret: string;
  merchantPrivateKey: string;
  midtransPublicKey: string;
  merchantId: string;
  channelId: string;
};

export type MidtransQrisStatus = "00" | "03" | "04" | "05" | "06" | "07" | "08" | "09";

export type MidtransQrisResult = {
  responseCode: string;
  referenceNo?: string;
  partnerReferenceNo?: string;
  qrContent?: string;
  qrUrl?: string;
  latestTransactionStatus?: MidtransQrisStatus;
  amount?: { value: string; currency: string };
  originalReferenceNo?: string;
  originalExternalId?: string;
};

export class MidtransError extends Error {
  constructor(
    readonly code:
      | "NOT_CONFIGURED"
      | "PROVIDER_UNAVAILABLE"
      | "PROVIDER_REJECTED"
      | "AMBIGUOUS"
      | "INVALID_RESPONSE",
  ) {
    super(code);
    this.name = "MidtransError";
  }
}

export function readMidtransSandboxConfig(
  env: Record<string, string | undefined> = process.env,
  requireEnabled = true,
): MidtransSandboxConfig {
  if (
    env["NODE_ENV"] === "production" ||
    (requireEnabled && env["MIDTRANS_SANDBOX_ENABLED"] !== "true")
  ) {
    throw new MidtransError("NOT_CONFIGURED");
  }
  const values = {
    clientId: env["MIDTRANS_SANDBOX_CLIENT_ID"],
    partnerId: env["MIDTRANS_SANDBOX_PARTNER_ID"],
    clientSecret: env["MIDTRANS_SANDBOX_CLIENT_SECRET"],
    merchantPrivateKey: env["MIDTRANS_SANDBOX_MERCHANT_PRIVATE_KEY"],
    midtransPublicKey: env["MIDTRANS_SANDBOX_PUBLIC_KEY"],
    merchantId: env["MIDTRANS_SANDBOX_MERCHANT_ID"],
    channelId: env["MIDTRANS_SANDBOX_CHANNEL_ID"],
  };
  if (Object.values(values).some((value) => !value?.trim())) {
    throw new MidtransError("NOT_CONFIGURED");
  }
  if (!/^\d{5}$/.test(values.channelId!)) throw new MidtransError("NOT_CONFIGURED");
  return values as MidtransSandboxConfig;
}

export type MidtransFinanceAvailability = "CONFIGURED" | "NOT_CONFIGURED" | "DISABLED";

export function getMidtransFinanceAvailability(
  env: Record<string, string | undefined> = process.env,
): MidtransFinanceAvailability {
  if (env["NODE_ENV"] === "production") return "DISABLED";
  try {
    readMidtransSandboxConfig(env);
    return "CONFIGURED";
  } catch (error) {
    if (error instanceof MidtransError && error.code === "NOT_CONFIGURED") return "NOT_CONFIGURED";
    throw error;
  }
}

export function jakartaTimestamp(date = new Date()): string {
  return new Date(date.getTime() + 7 * 60 * 60_000).toISOString().replace("Z", "+07:00");
}

function minifiedJson(value: unknown): string {
  return JSON.stringify(value);
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function minifyJsonBody(rawBody: string): string {
  let result = "";
  let inString = false;
  let escaped = false;
  for (const character of rawBody) {
    if (inString) {
      result += character;
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
    } else if (character === '"') {
      inString = true;
      result += character;
    } else if (!/\s/.test(character)) {
      result += character;
    }
  }
  return result;
}

export function accessTokenCanonical(clientId: string, timestamp: string): string {
  return `${clientId}|${timestamp}`;
}

export function signAccessTokenRequest(
  clientId: string,
  timestamp: string,
  privateKey: string,
): string {
  const signer = createSign("RSA-SHA256");
  signer.update(accessTokenCanonical(clientId, timestamp), "utf8");
  return signer.sign(privateKey, "base64");
}

export function transactionalCanonical(input: {
  method: string;
  path: string;
  accessToken: string;
  body: unknown;
  timestamp: string;
}): string {
  const bodyHash = sha256Hex(minifiedJson(input.body));
  return `${input.method.toUpperCase()}:${input.path}:${input.accessToken}:${bodyHash}:${input.timestamp}`;
}

export function signTransactionalRequest(input: {
  method: string;
  path: string;
  accessToken: string;
  body: unknown;
  timestamp: string;
  clientSecret: string;
}): string {
  return createHmac("sha512", input.clientSecret)
    .update(
      transactionalCanonical({
        method: input.method,
        path: input.path,
        accessToken: input.accessToken,
        body: input.body,
        timestamp: input.timestamp,
      }),
      "utf8",
    )
    .digest("base64");
}

export function notificationCanonical(input: {
  method: string;
  path: string;
  body: unknown;
  rawBody?: string;
  timestamp: string;
}): string {
  const body =
    input.rawBody === undefined ? minifiedJson(input.body) : minifyJsonBody(input.rawBody);
  return `${input.method.toUpperCase()}:${input.path}:${sha256Hex(body)}:${input.timestamp}`;
}

export function verifyNotificationSignature(input: {
  method: string;
  path: string;
  body: unknown;
  rawBody?: string;
  timestamp: string;
  signature: string;
  publicKey: string;
  now?: number;
}): boolean {
  const parsed = Date.parse(input.timestamp);
  if (!Number.isFinite(parsed) || Math.abs((input.now ?? Date.now()) - parsed) > CALLBACK_SKEW_MS) {
    return false;
  }
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(input.timestamp)) {
    return false;
  }
  let signature: Buffer;
  try {
    signature = Buffer.from(input.signature, "base64");
    if (!signature.length || signature.toString("base64") !== input.signature) return false;
    return verifySignature(
      "RSA-SHA256",
      Buffer.from(notificationCanonical(input), "utf8"),
      input.publicKey,
      signature,
    );
  } catch {
    return false;
  }
}

function responseError(status: number): MidtransError {
  if (status === 504) return new MidtransError("AMBIGUOUS");
  if (status >= 500 || status === 429) return new MidtransError("PROVIDER_UNAVAILABLE");
  return new MidtransError("PROVIDER_REJECTED");
}

async function fetchJson(
  path: string,
  init: RequestInit,
  fetcher: typeof fetch,
): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetcher(`${MIDTRANS_SANDBOX_ORIGIN}${path}`, {
      ...init,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      redirect: "error",
    });
  } catch (error) {
    if (error instanceof MidtransError) throw error;
    throw new MidtransError("AMBIGUOUS");
  }
  if (!response.ok) throw responseError(response.status);
  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > MAX_RESPONSE_BYTES) {
    throw new MidtransError("INVALID_RESPONSE");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new MidtransError("INVALID_RESPONSE");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new MidtransError("INVALID_RESPONSE");
  }
  return parsed as Record<string, unknown>;
}

function pem(value: string): string {
  return value.replaceAll("\\n", "\n").trim();
}

export function createMidtransSandboxClient(
  config: MidtransSandboxConfig,
  fetcher: typeof fetch = fetch,
  clock: () => Date = () => new Date(),
) {
  let cachedToken: { value: string; expiresAt: number } | undefined;
  let tokenPromise: Promise<string> | undefined;

  const accessToken = async (): Promise<string> => {
    if (cachedToken && cachedToken.expiresAt > clock().getTime() + 30_000) return cachedToken.value;
    if (tokenPromise) return tokenPromise;
    tokenPromise = (async () => {
      const timestamp = jakartaTimestamp(clock());
      const response = await fetchJson(
        TOKEN_PATH,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-timestamp": timestamp,
            "x-signature": signAccessTokenRequest(
              config.clientId,
              timestamp,
              pem(config.merchantPrivateKey),
            ),
            "x-client-key": config.clientId,
          },
          body: JSON.stringify({ grantType: "client_credentials" }),
        },
        fetcher,
      );
      const value = response["accessToken"];
      const expires = Number(response["expiresIn"] ?? 900);
      if (
        response["responseCode"] !== "2007300" ||
        typeof value !== "string" ||
        !value ||
        !Number.isFinite(expires) ||
        expires <= 0
      ) {
        throw new MidtransError("PROVIDER_REJECTED");
      }
      cachedToken = { value, expiresAt: clock().getTime() + expires * 1000 };
      return value;
    })().finally(() => {
      tokenPromise = undefined;
    });
    return tokenPromise;
  };

  const callTransactional = async (
    path: string,
    body: Record<string, unknown>,
    externalId: string,
  ): Promise<Record<string, unknown>> => {
    const token = await accessToken();
    const timestamp = jakartaTimestamp(clock());
    const signature = signTransactionalRequest({
      method: "POST",
      path,
      accessToken: token,
      body,
      timestamp,
      clientSecret: config.clientSecret,
    });
    return fetchJson(
      path,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
          "x-timestamp": timestamp,
          "x-signature": signature,
          "x-partner-id": config.partnerId,
          "x-external-id": externalId,
          "channel-id": config.channelId,
          "x-device-id": "edusmart-web",
        },
        body: JSON.stringify(body),
      },
      fetcher,
    );
  };

  return {
    async createQrisOrder(input: {
      externalId: string;
      amountIdr: number;
      expiresAt: string;
    }): Promise<MidtransQrisResult> {
      const body = {
        partnerReferenceNo: input.externalId,
        amount: { value: `${input.amountIdr.toFixed(2)}`, currency: "IDR" },
        merchantId: config.merchantId,
        validityPeriod: input.expiresAt,
        additionalInfo: { acquirer: "gopay" },
      };
      const response = await callTransactional(GENERATE_PATH, body, input.externalId);
      if (response["responseCode"] !== "2004700") {
        if (response["responseCode"] === "2024700") throw new MidtransError("AMBIGUOUS");
        throw new MidtransError("PROVIDER_REJECTED");
      }
      if (
        response["partnerReferenceNo"] !== input.externalId ||
        typeof response["referenceNo"] !== "string" ||
        typeof response["qrContent"] !== "string" ||
        response["qrContent"].length < 1 ||
        response["qrContent"].length > 512
      ) {
        throw new MidtransError("INVALID_RESPONSE");
      }
      return {
        responseCode: "2004700",
        referenceNo: response["referenceNo"],
        partnerReferenceNo: response["partnerReferenceNo"],
        qrContent: response["qrContent"],
      };
    },
    async queryQrisOrder(input: {
      externalId: string;
      referenceNo?: string;
    }): Promise<MidtransQrisResult> {
      const body = {
        ...(input.referenceNo ? { originalReferenceNo: input.referenceNo } : {}),
        originalPartnerReferenceNo: input.externalId,
        originalExternalId: input.externalId,
        merchantId: config.merchantId,
        serviceCode: "47",
      };
      const response = await callTransactional(QUERY_PATH, body, crypto.randomUUID());
      const status = response["latestTransactionStatus"];
      const allowed = ["00", "03", "04", "05", "06", "07", "08", "09"];
      if (
        response["responseCode"] !== "2005100" ||
        typeof status !== "string" ||
        !allowed.includes(status)
      ) {
        throw new MidtransError("PROVIDER_REJECTED");
      }
      return {
        responseCode: "2005100",
        latestTransactionStatus: status as MidtransQrisStatus,
        ...(typeof response["originalReferenceNo"] === "string"
          ? { originalReferenceNo: response["originalReferenceNo"] }
          : {}),
        ...(typeof response["originalExternalId"] === "string"
          ? { originalExternalId: response["originalExternalId"] }
          : {}),
        ...(response["amount"] && typeof response["amount"] === "object"
          ? { amount: response["amount"] as { value: string; currency: string } }
          : {}),
      };
    },
  };
}
