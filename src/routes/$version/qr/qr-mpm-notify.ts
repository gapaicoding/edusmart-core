import { createFileRoute } from "@tanstack/react-router";
import {
  jakartaTimestamp,
  readMidtransSandboxConfig,
  verifyNotificationSignature,
} from "@/lib/midtrans-qris.server";
import {
  receiveVerifiedMidtransNotification,
  recordUnsupportedMidtransNotification,
} from "@/lib/midtrans-qris.functions";

const MAX_BODY_BYTES = 64 * 1024;

function reply(status: number, responseCode: string, responseMessage: string): Response {
  return Response.json(
    { responseCode, responseMessage },
    { status, headers: { "x-timestamp": jakartaTimestamp(), "cache-control": "no-store" } },
  );
}

async function readBoundedBody(request: Request): Promise<Uint8Array | null> {
  if (!request.body) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } catch {
    return null;
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export const Route = createFileRoute("/$version/qr/qr-mpm-notify")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (new URL(request.url).pathname !== "/v1.0/qr/qr-mpm-notify")
          return reply(404, "4045201", "Notification endpoint was not found.");
        if (process.env["NODE_ENV"] === "production")
          return reply(403, "4035200", "Sandbox notifications are disabled.");
        const contentType = request.headers
          .get("content-type")
          ?.split(";")[0]
          ?.trim()
          .toLowerCase();
        if (contentType !== "application/json")
          return reply(400, "4005202", "Invalid content type.");
        const contentLengthHeader = request.headers.get("content-length");
        const contentLength = contentLengthHeader === null ? 0 : Number(contentLengthHeader);
        if (
          contentLengthHeader !== null &&
          (!Number.isSafeInteger(contentLength) ||
            contentLength < 0 ||
            contentLength > MAX_BODY_BYTES)
        ) {
          return reply(400, "4005201", "Invalid request size.");
        }
        const raw = await readBoundedBody(request);
        if (!raw) return reply(400, "4005201", "Invalid request size.");
        if (raw.byteLength === 0) return reply(400, "4005201", "Invalid request size.");

        let body: Record<string, unknown>;
        let rawBody: string;
        try {
          rawBody = new TextDecoder("utf-8", { fatal: true }).decode(raw);
          const parsed: unknown = JSON.parse(rawBody);
          if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
            return reply(400, "4005201", "Invalid request body.");
          body = parsed as Record<string, unknown>;
        } catch {
          return reply(400, "4005200", "Invalid request body.");
        }

        let config;
        try {
          config = readMidtransSandboxConfig(process.env, false);
        } catch {
          return reply(403, "4035200", "Sandbox notifications are disabled.");
        }
        const timestamp = request.headers.get("x-timestamp") ?? "";
        const signature = request.headers.get("x-signature") ?? "";
        const partnerId = request.headers.get("x-partner-id") ?? "";
        const notificationExternalId = request.headers.get("x-external-id") ?? "";
        if (partnerId !== config.partnerId || !/^\d{1,64}$/.test(notificationExternalId)) {
          return reply(401, "4015200", "Unauthorized notification.");
        }
        if (
          !verifyNotificationSignature({
            method: "POST",
            path: "/v1.0/qr/qr-mpm-notify",
            body,
            timestamp,
            signature,
            rawBody,
            publicKey: config.midtransPublicKey,
          })
        )
          return reply(401, "4015200", "Unauthorized notification.");

        const amount = body["amount"];
        const amountValue =
          amount && typeof amount === "object"
            ? (amount as Record<string, unknown>)["value"]
            : undefined;
        const currency =
          amount && typeof amount === "object"
            ? (amount as Record<string, unknown>)["currency"]
            : undefined;
        const originalPartnerReferenceNo = body["originalPartnerReferenceNo"];
        const originalReferenceNo = body["originalReferenceNo"];
        const status = body["latestTransactionStatus"];
        if (
          typeof originalPartnerReferenceNo !== "string" ||
          !/^[0-9a-f-]{36}$/i.test(originalPartnerReferenceNo) ||
          typeof originalReferenceNo !== "string" ||
          originalReferenceNo.length < 1 ||
          originalReferenceNo.length > 120 ||
          typeof status !== "string" ||
          !/^(00|03|04|05|06|08|09)$/.test(status) ||
          typeof amountValue !== "string" ||
          !/^\d{1,14}\.\d{2}$/.test(amountValue) ||
          typeof currency !== "string" ||
          !/^[A-Z]{3}$/.test(currency) ||
          (body["merchantId"] !== undefined && body["merchantId"] !== config.merchantId)
        ) {
          return reply(400, "4005202", "Invalid notification fields.");
        }

        const normalized = {
          external_id: originalPartnerReferenceNo,
          provider_reference: originalReferenceNo,
          status,
          amount_value: amountValue,
          currency,
          occurred_at: typeof body["finishedTime"] === "string" ? body["finishedTime"] : timestamp,
        };
        if (status === "04") {
          try {
            await recordUnsupportedMidtransNotification(normalized);
            return reply(200, "2005200", "Notification has been recorded for operator review.");
          } catch {
            return reply(404, "4045201", "Notification transaction was not found.");
          }
        }
        try {
          const result = await receiveVerifiedMidtransNotification(normalized);
          return result &&
            typeof result === "object" &&
            "status" in result &&
            result["status"] === "pending"
            ? reply(202, "2025200", "Transaction is still pending.")
            : reply(200, "2005200", "Request has been processed successfully.");
        } catch {
          return reply(404, "4045201", "Notification transaction was not found.");
        }
      },
    },
  },
});
