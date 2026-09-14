import yauzl, { type Entry, type ZipFile } from "yauzl";
import { SIS_MAX_COMPRESSED_BYTES } from "./sis-import.constants";

export const SIS_IMPORT_BUCKET = "sis-imports";
export const SIS_XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const SIS_ZIP_MAX_ENTRIES = 256;
export const SIS_ZIP_MAX_SINGLE_UNCOMPRESSED = 32 * 1024 * 1024;
export const SIS_ZIP_MAX_TOTAL_UNCOMPRESSED = 96 * 1024 * 1024;

export class SisFileError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}

export function newSisImportObjectPath(input: {
  organizationId: string;
  schoolId: string;
  jobId: string;
}) {
  if (![input.organizationId, input.schoolId, input.jobId].every((x) => /^[0-9a-f-]{36}$/i.test(x)))
    throw new SisFileError("B10_FILE_INVALID");
  return `${input.organizationId}/${input.schoolId}/sis-imports/${input.jobId}/source.xlsx`;
}

export function assertSisUploadEnvelope(file: { name: string; type?: string; size: number }) {
  if (!file.name.toLowerCase().endsWith(".xlsx") || file.name.toLowerCase().endsWith(".xls"))
    throw new SisFileError("B10_FILE_INVALID");
  if (file.size < 1 || file.size > SIS_MAX_COMPRESSED_BYTES)
    throw new SisFileError("B10_FILE_TOO_LARGE");
  if (file.type && file.type !== SIS_XLSX_MIME && file.type !== "application/zip")
    throw new SisFileError("B10_FILE_INVALID");
}

export interface SisZipLimits {
  maxEntries: number;
  maxSingleUncompressed: number;
  maxTotalUncompressed: number;
}

const DEFAULT_ZIP_LIMITS: SisZipLimits = {
  maxEntries: SIS_ZIP_MAX_ENTRIES,
  maxSingleUncompressed: SIS_ZIP_MAX_SINGLE_UNCOMPRESSED,
  maxTotalUncompressed: SIS_ZIP_MAX_TOTAL_UNCOMPRESSED,
};

const unsafeZip = (): never => { throw new SisFileError("B10_FILE_CORRUPT_OR_UNSAFE"); };
const openZip = (bytes: Uint8Array) => new Promise<ZipFile>((resolve, reject) => {
  yauzl.fromBuffer(Buffer.from(bytes), { lazyEntries: true, autoClose: false, decodeStrings: true, validateEntrySizes: false }, (error, zip) => {
    if (error || !zip) reject(new SisFileError("B10_FILE_CORRUPT_OR_UNSAFE")); else resolve(zip);
  });
});
const openEntry = (zip: ZipFile, entry: Entry) => new Promise<NodeJS.ReadableStream>((resolve, reject) => {
  zip.openReadStream(entry, (error, stream) => error || !stream ? reject(new SisFileError("B10_FILE_CORRUPT_OR_UNSAFE")) : resolve(stream));
});

/** Inflates every entry lazily and aborts on actual emitted-byte limits before ExcelJS runs. */
export async function inspectXlsxZip(bytes: Uint8Array, limits: SisZipLimits = DEFAULT_ZIP_LIMITS) {
  if (bytes.length < 22 || bytes.length > SIS_MAX_COMPRESSED_BYTES || bytes[0] !== 0x50 || bytes[1] !== 0x4b) unsafeZip();
  let zip: ZipFile | undefined;
  try {
    zip = await openZip(bytes);
    let count = 0, total = 0;
    let hasContentTypes = false, hasWorkbook = false;
    const names = new Set<string>();
    const result = await new Promise<{ entryCount: number; totalUncompressedBytes: number }>((resolve, reject) => {
      const fail = () => { zip?.close(); reject(new SisFileError("B10_FILE_CORRUPT_OR_UNSAFE")); };
      zip!.on("error", fail);
      zip!.on("end", () => hasContentTypes && hasWorkbook ? resolve({ entryCount: count, totalUncompressedBytes: total }) : fail());
      zip!.on("entry", async (entry: Entry) => {
        try {
          count++;
          const name = entry.fileName;
          const normalized = name.replaceAll("\\", "/");
          if (count > limits.maxEntries || !name || name.includes("\0") || name.startsWith("/") || name.startsWith("\\") || name.includes("\\") || /^[a-z]:/i.test(name) || normalized.split("/").includes("..") || names.has(normalized)) unsafeZip();
          names.add(normalized);
          if ((entry.generalPurposeBitFlag & 1) !== 0 || !Number.isSafeInteger(entry.compressedSize) || !Number.isSafeInteger(entry.uncompressedSize) || entry.compressedSize < 0 || entry.uncompressedSize < 0) unsafeZip();
          hasContentTypes ||= normalized === "[Content_Types].xml";
          hasWorkbook ||= normalized === "xl/workbook.xml";
          const stream = await openEntry(zip!, entry);
          let actual = 0;
          for await (const chunk of stream as AsyncIterable<Buffer>) {
            actual += chunk.length;
            total += chunk.length;
            if (actual > limits.maxSingleUncompressed || total > limits.maxTotalUncompressed) unsafeZip();
          }
          if (actual !== entry.uncompressedSize) unsafeZip();
          zip!.readEntry();
        } catch { fail(); }
      });
      zip!.readEntry();
    });
    zip.close();
    return result;
  } catch (error) {
    zip?.close();
    if (error instanceof SisFileError) throw error;
    return unsafeZip();
  }
}
