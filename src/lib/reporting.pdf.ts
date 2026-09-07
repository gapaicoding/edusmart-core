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

export function reportCardObjectPath(input: {
  organizationId: string;
  schoolId: string;
  reportCardId: string;
  version: number;
}) {
  return `${input.organizationId}/${input.schoolId}/report-cards/${input.reportCardId}/v${input.version}/report-card.pdf`;
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
      if (font.widthOfTextAtSize(candidate, size) <= width) line = candidate;
      else {
        if (line) lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

export async function generateReportCardPdf(model: ReportCardPdfModel, fontBytes: Uint8Array) {
  const document = await PDFDocument.create();
  document.registerFontkit(fontkit);
  const font = await document.embedFont(fontBytes, { subset: true });
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
    if (y - height < margin + 20) addPage();
  };
  const text = (value: string, x = margin, size = bodySize, color = rgb(0.12, 0.16, 0.22)) => {
    page.drawText(value, { x, y, size, font, color });
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
      page.drawText(line || " ", { x, y, size, font, color: rgb(0.16, 0.2, 0.27) });
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
      `Score: ${reportCardScoreText(subject.finalScore)}${subject.predicate ? `   Predicate: ${subject.predicate}` : ""}`,
      margin + 6,
      9,
    );
    if (subject.narrative)
      paragraph(subject.narrative, margin + 6, pageSize[0] - margin * 2 - 12, 8.5);
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

  pages.forEach((item, index) =>
    item.drawText(`Page ${index + 1} of ${pages.length}`, {
      x: pageSize[0] - margin - 62,
      y: 24,
      size: 8,
      font,
      color: rgb(0.4, 0.44, 0.48),
    }),
  );
  document.setTitle(`${model.studentName} Report Card v${model.version}`);
  document.setSubject("Official published Report Card snapshot");
  document.setProducer("EduSmart Core");
  return document.save();
}
