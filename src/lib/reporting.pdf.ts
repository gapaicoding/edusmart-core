import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";

export type ReportCardPdfModel = {
  reportCardId: string;
  version: number;
  schoolName: string;
  studentName: string;
  academicYearName: string;
  termName: string;
  publishedAt: string;
  subjects: Array<{
    subjectName: string;
    finalScore: number | null;
    predicate: string | null;
    narrative: string | null;
  }>;
  attendance: {
    finalizedSessionCount: number;
    counts: {
      present: number;
      late: number;
      excused: number;
      sick: number;
      absent: number;
      other: number;
    };
  };
  homeroomComment: string | null;
  narratives: Array<{ title: string; content: string }>;
};

export type ReportCardPdfFontFormat = "ttf" | "otf";

export function reportCardObjectPath(input: {
  organizationId: string;
  schoolId: string;
  reportCardId: string;
  version: number;
  generationId: string;
}) {
  return `${input.organizationId}/${input.schoolId}/report-cards/${input.reportCardId}/v${input.version}/${input.generationId}/report-card.pdf`;
}

export function reportCardScoreText(score: number | null) {
  return score === null ? "No published result" : String(score);
}

export async function sha256Hex(bytes: Uint8Array) {
  const input = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;

  const digest = await crypto.subtle.digest("SHA-256", input);

  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function reportCardPdfFontFormat(fontBytes: Uint8Array): ReportCardPdfFontFormat | null {
  if (fontBytes.length < 4) return null;

  const b0 = fontBytes[0]!;
  const b1 = fontBytes[1]!;
  const b2 = fontBytes[2]!;
  const b3 = fontBytes[3]!;

  const signature = String.fromCharCode(b0, b1, b2, b3);

  if (b0 === 0x00 && b1 === 0x01 && b2 === 0x00 && b3 === 0x00) {
    return "ttf";
  }

  if (signature === "true") return "ttf";
  if (signature === "OTTO") return "otf";

  return null;
}

export function assertReportCardPdfFontBytes(fontBytes: Uint8Array) {
  const format = reportCardPdfFontFormat(fontBytes);

  if (!format) {
    throw new Error(
      "Report Card PDF font must be a TrueType/OpenType TTF or OTF file. WOFF/WOFF2 is not accepted for official PDF generation.",
    );
  }

  return format;
}

function wrapText(text: string, font: PDFFont, size: number, width: number) {
  const paragraphs = text.replace(/\r/g, "").split("\n");
  const lines: string[] = [];

  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);

    if (!words.length) {
      lines.push("");
      continue;
    }

    let line = "";

    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;

      if (font.widthOfTextAtSize(candidate, size) <= width) {
        line = candidate;
      } else {
        if (line) lines.push(line);
        line = word;
      }
    }

    if (line) lines.push(line);
  }

  return lines;
}

function reportCardPdfTextValues(model: ReportCardPdfModel) {
  const values = [
    model.schoolName,
    "Official Report Card",
    `Student: ${model.studentName}`,
    `Academic Year: ${model.academicYearName}`,
    `Term: ${model.termName}`,
    `Version: ${model.version}`,
    `Published: ${new Date(model.publishedAt).toLocaleDateString("en-GB")}`,
    "Subject Results",
    "Attendance Summary",
    `Finalized sessions: ${model.attendance.finalizedSessionCount}`,
    `Present ${model.attendance.counts.present}   Late ${model.attendance.counts.late}   Excused ${model.attendance.counts.excused}   Sick ${model.attendance.counts.sick}   Absent ${model.attendance.counts.absent}   Other ${model.attendance.counts.other}`,
    "Homeroom Comment",
    model.homeroomComment ?? "No homeroom comment.",
    "No published result",
    "—",
  ];

  for (const subject of model.subjects) {
    values.push(subject.subjectName);

    values.push(
      `Score: ${reportCardScoreText(subject.finalScore)}${
        subject.predicate ? `   Predicate: ${subject.predicate}` : ""
      }`,
    );

    if (subject.narrative) {
      values.push(subject.narrative);
    }
  }

  for (const narrative of model.narratives) {
    values.push(narrative.title);
    values.push(narrative.content || "—");
  }

  return values;
}

function assertFontSupportsReportCard(font: PDFFont, model: ReportCardPdfModel) {
  const supported = new Set(font.getCharacterSet());
  const missing = new Set<number>();

  for (const value of reportCardPdfTextValues(model)) {
    for (const character of value) {
      if (/\s/u.test(character)) continue;

      const codePoint = character.codePointAt(0);

      if (codePoint !== undefined && !supported.has(codePoint)) {
        missing.add(codePoint);
      }
    }
  }

  if (!missing.size) return;

  const formatted = [...missing]
    .sort((a, b) => a - b)
    .slice(0, 12)
    .map((codePoint) => `U+${codePoint.toString(16).toUpperCase().padStart(4, "0")}`)
    .join(", ");

  throw new Error(
    `Report Card PDF font does not contain every required glyph (${formatted}${
      missing.size > 12 ? ", …" : ""
    }).`,
  );
}

export async function generateReportCardPdf(model: ReportCardPdfModel, fontBytes: Uint8Array) {
  assertReportCardPdfFontBytes(fontBytes);

  const document = await PDFDocument.create();

  document.registerFontkit(fontkit);

  /*
   * Full embedding is intentional.
   *
   * Previous implementation:
   *   WOFF + subset:true
   *
   * produced unreadable missing-glyph boxes in Chromium's PDF viewer.
   *
   * Official Report Cards prioritize rendering correctness and portability
   * over the smaller file size produced by font subsetting.
   */
  const font = await document.embedFont(fontBytes, {
    subset: false,
  });

  assertFontSupportsReportCard(font, model);

  const pageSize: [number, number] = [595.28, 841.89];
  const margin = 46;
  const bodySize = 9.5;

  let page!: PDFPage;
  let y = 0;

  const pages: PDFPage[] = [];

  const addPage = () => {
    page = document.addPage(pageSize);
    pages.push(page);
    y = pageSize[1] - margin;
  };

  const ensure = (height: number) => {
    if (y - height < margin + 20) {
      addPage();
    }
  };

  const text = (value: string, x = margin, size = bodySize, color = rgb(0.12, 0.16, 0.22)) => {
    page.drawText(value, {
      x,
      y,
      size,
      font,
      color,
    });

    y -= size + 5;
  };

  const paragraph = (
    value: string,
    x = margin,
    width = pageSize[0] - margin * 2,
    size = bodySize,
  ) => {
    const lines = wrapText(value || "—", font, size, width);

    ensure(lines.length * (size + 4) + 4);

    for (const line of lines) {
      page.drawText(line || " ", {
        x,
        y,
        size,
        font,
        color: rgb(0.16, 0.2, 0.27),
      });

      y -= size + 4;
    }

    y -= 3;
  };

  const heading = (value: string) => {
    ensure(28);

    y -= 5;

    text(value, margin, 13, rgb(0.05, 0.25, 0.32));

    y -= 3;
  };

  addPage();

  text(model.schoolName, margin, 17, rgb(0.04, 0.22, 0.28));

  text("Official Report Card", margin, 12, rgb(0.32, 0.38, 0.43));

  y -= 8;

  text(`Student: ${model.studentName}`);
  text(`Academic Year: ${model.academicYearName}`);
  text(`Term: ${model.termName}`);
  text(`Version: ${model.version}`);

  text(`Published: ${new Date(model.publishedAt).toLocaleDateString("en-GB")}`);

  heading("Subject Results");

  for (const subject of model.subjects) {
    const narrativeLines = wrapText(
      subject.narrative ?? "",
      font,
      8.5,
      pageSize[0] - margin * 2 - 12,
    );

    ensure(42 + narrativeLines.length * 12);

    page.drawRectangle({
      x: margin,
      y: y - 28 - narrativeLines.length * 12,
      width: pageSize[0] - margin * 2,
      height: 34 + narrativeLines.length * 12,
      color: rgb(0.95, 0.97, 0.97),
    });

    text(subject.subjectName, margin + 6, 10);

    text(
      `Score: ${reportCardScoreText(subject.finalScore)}${
        subject.predicate ? `   Predicate: ${subject.predicate}` : ""
      }`,
      margin + 6,
      9,
    );

    if (subject.narrative) {
      paragraph(subject.narrative, margin + 6, pageSize[0] - margin * 2 - 12, 8.5);
    }

    y -= 6;
  }

  heading("Attendance Summary");

  text(`Finalized sessions: ${model.attendance.finalizedSessionCount}`);

  text(
    `Present ${model.attendance.counts.present}   Late ${model.attendance.counts.late}   Excused ${model.attendance.counts.excused}   Sick ${model.attendance.counts.sick}   Absent ${model.attendance.counts.absent}   Other ${model.attendance.counts.other}`,
  );

  heading("Homeroom Comment");

  paragraph(model.homeroomComment ?? "No homeroom comment.");

  for (const narrative of model.narratives) {
    heading(narrative.title);

    paragraph(narrative.content || "—");
  }

  pages.forEach((item, index) => {
    item.drawText(`Page ${index + 1} of ${pages.length}`, {
      x: pageSize[0] - margin - 62,
      y: 24,
      size: 8,
      font,
      color: rgb(0.4, 0.44, 0.48),
    });
  });

  document.setTitle(`${model.studentName} Report Card v${model.version}`);

  document.setSubject("Official published Report Card snapshot");

  document.setProducer("EduSmart Core");

  /*
   * Object streams are disabled intentionally.
   *
   * This makes the PDF font dictionaries easier to inspect in regression
   * tests and avoids another compatibility variable while this document is
   * an official school artifact.
   */
  return document.save({
    useObjectStreams: false,
  });
}
