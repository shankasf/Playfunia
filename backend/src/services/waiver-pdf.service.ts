import PDFDocument from 'pdfkit';
import { DateTime } from 'luxon';
import https from 'https';
import http from 'http';

export interface WaiverPdfData {
  guardianName: string;
  guardianEmail?: string;
  guardianPhone?: string;
  guardianDob?: string;
  relationshipToChildren?: string;
  children: Array<{ name: string; birthDate?: string; gender?: string }>;
  signature: string;
  signedAt: string;
  ipAddress: string;
  waiverCode: string;
  acceptedPolicies: string[];
  signatureImageUrl?: string;
}

// ── Brand palette ──
const PURPLE = '#7c3aed';
const PURPLE_DARK = '#5b21b6';
const PURPLE_LIGHT = '#ede9fe';
const TEXT_PRIMARY = '#1f2937';
const TEXT_SECONDARY = '#4b5563';
const TEXT_MUTED = '#9ca3af';
const BORDER = '#e5e7eb';
const BG_LIGHT = '#f9fafb';
const RED_ACCENT = '#dc2626';
const GREEN_CHECK = '#16a34a';
const SIGNATURE_BLUE = '#1e3a8a';

// ── Page constants ──
const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 54;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const USABLE_BOTTOM = PAGE_HEIGHT - 50;

const POLICY_DISPLAY_NAMES: Record<string, string> = {
  terms_conditions: 'Terms and Conditions',
  privacy_policy: 'Privacy Policy',
  waiver_policy: 'Waiver Policy',
  refund_policy: 'Refund Policy',
};

const SECTIONS: Array<{ heading: string; body: string }> = [
  {
    heading: '1. General Release',
    body: 'I acknowledge and agree that this Release is intended to release and provide legal protections and consideration to Releasees for any claims that arise at the Playfunia facility or from the attractions at the Playfunia Facility. I agree to accept and assume all risks existing in the Playfunia Attractions and Facilities, both known and unknown, including those caused by negligent acts or omissions of Releasees. I voluntarily release, forever discharge, indemnify, and hold harmless Releasees from any and all damages, claims, actions, liabilities, or demands arising from participation in Playfunia activities, except in cases of gross negligence or intentional misconduct. I further agree that I am solely responsible for my personal property while at the Playfunia Facility.',
  },
  {
    heading: '2. Release of Potential Injuries for Attractions',
    body: 'I acknowledge and agree that the attractions at Playfunia include designated infant (0-2), toddler (2-7), and big kid (3-13) play areas. Participants of all ages may be present within the Playfunia Facility. Playfunia attractions include, but are not limited to bridges, tunnels, igloos, honeycomb play structures, slides, balloon house, light-up wall, swings, monkey bars, zip lines, ball pits, revolving doors, foam pits, LED dance floor, battery-operated toy cars, castle structures, climbing nets, and other similar equipment. I acknowledge that the children in my care are physically, mentally, and emotionally capable of participating. I understand that these activities involve inherent risks including serious injury, illness, infection, paralysis, death, and property damage.',
  },
  {
    heading: '3. Release of Potential Infection of Disease and Viruses',
    body: 'I acknowledge that Playfunia is a public environment where guests interact daily. Despite reasonable cleaning practices, I understand that exposure to illness or viruses including COVID-19 may occur. I release Playfunia and the Releasees from any claim related to illness or infection resulting from participation in or presence at Playfunia.',
  },
  {
    heading: '4. Voluntary Assumption of Risk',
    body: 'I acknowledge that participation in Playfunia activities is voluntary and involves inherent risks. These risks may include: paralysis or death; cuts, bruises, sprains, fractures or other injuries; injuries caused by falls or contact with equipment or participants; illness, allergic reactions, dehydration, or exertion-related events; and injuries occurring while observing activities. I voluntarily assume all such risks.',
  },
  {
    heading: '5. Agreement to Pay My Own Medical Expenses',
    body: 'I acknowledge and accept responsibility for any medical conditions affecting participation. If medical assistance is required as a result of participation, I agree that all medical expenses are my responsibility.',
  },
  {
    heading: '6. Photo / Video / Social Media Waiver',
    body: 'I consent to the recording of my or the Child\'s likeness and voice through photographs, video, or other digital recordings. I grant Playfunia permission to use such recordings for social media, promotional materials, and non-commercial advertising. Separate written consent is required for commercial advertising campaigns.',
  },
  {
    heading: '7. Parent or Guardian Consent',
    body: 'If signing on behalf of a minor, I certify that I am the parent or legal guardian and have authority to execute this Agreement. I acknowledge that I am giving up legal rights on behalf of both myself and the child.',
  },
  {
    heading: '8. Parent or Guardian Indemnification',
    body: 'By signing this Agreement on behalf of a minor, I agree to indemnify and hold harmless Playfunia and Releasees for any claims arising from the child\'s participation.',
  },
  {
    heading: '9. Marketing Communications Consent',
    body: 'By signing this waiver, I agree to receive occasional marketing communications via text message or email from Playfunia regarding promotions, offers, and events. Message and data rates may apply. I may unsubscribe at any time by replying STOP or using the unsubscribe link. Consent is not a condition of participation.',
  },
  {
    heading: '10. Governing Law and Venue',
    body: 'This Agreement shall be governed by the laws of the State of New York. Any legal action must be brought exclusively in courts located in Albany County, New York.',
  },
  {
    heading: '11. Arbitration Agreement',
    body: 'Any dispute relating to this Agreement shall be resolved through binding arbitration conducted in Albany County, New York in accordance with the rules of the American Arbitration Association.',
  },
  {
    heading: '12. Waiver of Jury Trial',
    body: 'Participant and Parent or Guardian knowingly waive the right to a trial by jury in any legal action relating to this Agreement.',
  },
  {
    heading: '13. Severability',
    body: 'If any provision of this Agreement is determined to be invalid or unenforceable, the remaining provisions shall remain in full force and effect.',
  },
  {
    heading: '14. Entire Agreement',
    body: 'This Agreement constitutes the entire agreement between Participant and Playfunia regarding participation in Playfunia activities.',
  },
  {
    heading: '15. Limitation Period for Claims',
    body: 'Any claim relating to participation at Playfunia must be filed within one (1) year of the incident. Claims filed after this period are permanently barred.',
  },
  {
    heading: '16. Class Action Waiver',
    body: 'Participant agrees that any claim must be brought only in an individual capacity and not as part of a class action or collective proceeding.',
  },
  {
    heading: '17. Acknowledgment of Understanding',
    body: 'I acknowledge that I have carefully read and fully understand this Agreement. I understand that by signing this document I am releasing Playfunia from liability and giving up important legal rights, including the right to sue. I am signing this Agreement voluntarily and intend it to be a complete and unconditional release of liability to the fullest extent permitted by law. If signing on behalf of a minor, I certify that I have legal authority to do so.',
  },
];

// ── Drawing helpers ──

function roundedRect(
  doc: PDFKit.PDFDocument,
  x: number, y: number, w: number, h: number,
  opts: { fill?: string; stroke?: string; radius?: number; lineWidth?: number },
) {
  const r = opts.radius ?? 6;
  doc.save();
  if (opts.lineWidth) doc.lineWidth(opts.lineWidth);
  doc.roundedRect(x, y, w, h, r);
  if (opts.fill && opts.stroke) {
    doc.fillAndStroke(opts.fill, opts.stroke);
  } else if (opts.fill) {
    doc.fill(opts.fill);
  } else if (opts.stroke) {
    doc.strokeColor(opts.stroke).stroke();
  }
  doc.restore();
}

function ensureSpace(doc: PDFKit.PDFDocument, needed: number): void {
  if (doc.y + needed > USABLE_BOTTOM) {
    doc.addPage();
    doc.y = 44;
  }
}

function divider(doc: PDFKit.PDFDocument, color = BORDER, thickness = 0.5) {
  doc.save()
    .moveTo(MARGIN, doc.y).lineTo(PAGE_WIDTH - MARGIN, doc.y)
    .lineWidth(thickness).strokeColor(color).stroke()
    .restore();
  doc.y += 8;
}

/**
 * Generate a professionally styled signed waiver PDF.
 */
export async function generateWaiverPdf(data: WaiverPdfData): Promise<Buffer> {
  let signatureImageBuffer: Buffer | null = null;
  if (data.signatureImageUrl) {
    try {
      signatureImageBuffer = await fetchImageBuffer(data.signatureImageUrl);
    } catch {
      // Fallback to typed signature
    }
  }

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({
      size: 'LETTER',
      margins: { top: 44, bottom: 50, left: MARGIN, right: MARGIN },
      bufferPages: true,
    });

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // ═══════════════════════════════════════════════
    //  HEADER
    // ═══════════════════════════════════════════════
    // Top purple accent bar
    doc.save();
    doc.rect(0, 0, PAGE_WIDTH, 5).fill(PURPLE);
    doc.restore();

    doc.y = 22;
    doc.font('Helvetica-Bold').fontSize(24).fillColor(PURPLE)
      .text('PLAYFUNIA', MARGIN, doc.y, { align: 'center' });
    doc.moveDown(0.15);
    doc.font('Helvetica-Bold').fontSize(12).fillColor(TEXT_PRIMARY)
      .text('Digital Waiver Form', { align: 'center' });
    doc.moveDown(0.1);
    doc.font('Helvetica').fontSize(8.5).fillColor(TEXT_MUTED)
      .text('Where Fun Happens!  |  Crossgates Mall, Albany, NY  |  playfunia.com', { align: 'center' });
    doc.moveDown(0.6);

    divider(doc, PURPLE, 1.5);
    doc.moveDown(0.15);

    // ═══════════════════════════════════════════════
    //  WARNING BANNER
    // ═══════════════════════════════════════════════
    const bannerY = doc.y;
    const bannerH = 40;
    roundedRect(doc, MARGIN, bannerY, CONTENT_WIDTH, bannerH, {
      fill: '#fef2f2', stroke: '#fca5a5', radius: 8, lineWidth: 0.75,
    });
    doc.font('Helvetica-Bold').fontSize(9).fillColor(RED_ACCENT)
      .text('IMPORTANT — READ CAREFULLY', MARGIN + 12, bannerY + 8, {
        width: CONTENT_WIDTH - 24, align: 'center',
      });
    doc.font('Helvetica').fontSize(7.5).fillColor('#991b1b')
      .text(
        'THIS IS A RELEASE OF LIABILITY AND WAIVER OF CERTAIN LEGAL RIGHTS. BY SIGNING, YOU MAY BE WAIVING THE RIGHT TO SUE.',
        MARGIN + 12, bannerY + 22,
        { width: CONTENT_WIDTH - 24, align: 'center' },
      );
    doc.y = bannerY + bannerH + 14;

    // ═══════════════════════════════════════════════
    //  DOCUMENT TITLE
    // ═══════════════════════════════════════════════
    const titleY = doc.y;
    const titleH = 28;
    roundedRect(doc, MARGIN, titleY, CONTENT_WIDTH, titleH, {
      fill: PURPLE_LIGHT, radius: 6,
    });
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(PURPLE_DARK)
      .text(
        'PLAYFUNIA PARTICIPANT WAIVER, RELEASE, ASSUMPTION OF RISK, AND INDEMNIFICATION AGREEMENT',
        MARGIN + 10, titleY + 8,
        { width: CONTENT_WIDTH - 20, align: 'center' },
      );
    doc.y = titleY + titleH + 12;

    // ═══════════════════════════════════════════════
    //  INTRO PARAGRAPH
    // ═══════════════════════════════════════════════
    doc.font('Helvetica').fontSize(9).fillColor(TEXT_PRIMARY)
      .text('This Waiver, Release, Assumption of Risk, and Indemnification Agreement ("Release") is voluntarily executed by ', {
        continued: true, lineGap: 3,
      });
    doc.font('Helvetica-Bold').text(data.guardianName, { continued: true });
    doc.font('Helvetica').text(' ("Participant") on ', { continued: true });
    doc.font('Helvetica-Bold').text(formatDateET(data.signedAt), { continued: true });
    doc.font('Helvetica').text(' ("Effective Date").', { lineGap: 3 });
    doc.moveDown(0.25);

    doc.font('Helvetica').fontSize(8.5).fillColor(TEXT_SECONDARY)
      .text('This Release pertains to the use of the facilities at Playfunia and its affiliates, agents, owners, officers, managers, shareholders, volunteers, participants, employees, assigns, and all other persons or entities acting in any capacity on its respective or collective behalf (collectively referred to herein as "Releasees").', {
        lineGap: 3,
      });
    doc.moveDown(0.6);

    // ═══════════════════════════════════════════════
    //  SECTIONS 1–17
    // ═══════════════════════════════════════════════
    for (const section of SECTIONS) {
      ensureSpace(doc, 45);

      // Purple left accent bar + heading
      const headY = doc.y;
      doc.save();
      doc.roundedRect(MARGIN, headY, 3, 14, 1.5).fill(PURPLE);
      doc.restore();

      doc.font('Helvetica-Bold').fontSize(9.5).fillColor(PURPLE_DARK)
        .text(section.heading, MARGIN + 10, headY + 1);
      doc.moveDown(0.25);

      // Body text with comfortable line spacing
      doc.font('Helvetica').fontSize(8.5).fillColor(TEXT_PRIMARY)
        .text(section.body, MARGIN + 10, doc.y, { width: CONTENT_WIDTH - 10, lineGap: 3 });
      doc.moveDown(0.5);
    }

    // ═══════════════════════════════════════════════
    //  SIGNATURE & EXECUTION
    // ═══════════════════════════════════════════════
    doc.moveDown(0.3);
    // Ensure header + guardian card stay together (~190px)
    ensureSpace(doc, 190);
    divider(doc, PURPLE, 1.5);

    // Purple header bar
    const sigHeaderY = doc.y;
    const sigHeaderH = 26;
    roundedRect(doc, MARGIN, sigHeaderY, CONTENT_WIDTH, sigHeaderH, {
      fill: PURPLE, radius: 6,
    });
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#ffffff')
      .text('SIGNATURE & EXECUTION', MARGIN, sigHeaderY + 7, {
        width: CONTENT_WIDTH, align: 'center',
      });
    doc.y = sigHeaderY + sigHeaderH + 16;

    // ── Guardian details card ──
    const detailCardY = doc.y;
    const labelW = 160;
    const details: Array<[string, string]> = [
      ['Guardian / Parent Name:', data.guardianName],
      ['Email:', data.guardianEmail || 'N/A'],
      ['Phone:', data.guardianPhone || 'N/A'],
      ['Date of Birth:', data.guardianDob ? formatDobDisplay(data.guardianDob) : 'N/A'],
      ['Relationship to Children:', data.relationshipToChildren || 'N/A'],
    ];
    const detailRowH = 20;
    const detailCardH = details.length * detailRowH + 20;

    roundedRect(doc, MARGIN, detailCardY, CONTENT_WIDTH, detailCardH, {
      fill: BG_LIGHT, stroke: BORDER, radius: 8, lineWidth: 0.75,
    });

    let rowY = detailCardY + 12;
    for (const [label, value] of details) {
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(TEXT_SECONDARY)
        .text(label, MARGIN + 14, rowY, { width: labelW });
      doc.font('Helvetica').fontSize(8.5).fillColor(TEXT_PRIMARY)
        .text(value, MARGIN + 14 + labelW, rowY, { width: CONTENT_WIDTH - labelW - 28 });
      rowY += detailRowH;
    }
    doc.y = detailCardY + detailCardH + 14;

    // ── Children table ──
    ensureSpace(doc, 60);
    doc.font('Helvetica-Bold').fontSize(10).fillColor(PURPLE_DARK)
      .text('Children Covered by This Waiver', MARGIN, doc.y, { width: CONTENT_WIDTH });
    doc.moveDown(0.35);

    const tableX = MARGIN;
    const colWidths = [30, 200, 130, 144];
    const tableHeaderY = doc.y;
    const headerH = 22;

    roundedRect(doc, tableX, tableHeaderY, CONTENT_WIDTH, headerH, {
      fill: PURPLE_LIGHT, radius: 5,
    });

    const headers = ['#', 'Name', 'Date of Birth', 'Gender'];
    let colX = tableX + 8;
    for (let i = 0; i < headers.length; i++) {
      doc.font('Helvetica-Bold').fontSize(8).fillColor(PURPLE_DARK)
        .text(headers[i]!, colX, tableHeaderY + 6, { width: colWidths[i]! - 8 });
      colX += colWidths[i]!;
    }

    let tableRowY = tableHeaderY + headerH;
    for (let i = 0; i < data.children.length; i++) {
      ensureSpace(doc, 20);
      if (doc.y > tableRowY) tableRowY = doc.y;

      const child = data.children[i]!;
      const dob = child.birthDate ? formatDobDisplay(child.birthDate) : 'N/A';
      const gender = child.gender || '--';
      const rowBg = i % 2 === 0 ? '#ffffff' : BG_LIGHT;
      const tblRowH = 22;

      doc.save();
      doc.rect(tableX, tableRowY, CONTENT_WIDTH, tblRowH).fill(rowBg);
      doc.restore();

      colX = tableX + 8;
      const vals = [`${i + 1}`, child.name, dob, gender];
      for (let j = 0; j < vals.length; j++) {
        doc.font('Helvetica').fontSize(8.5).fillColor(TEXT_PRIMARY)
          .text(vals[j]!, colX, tableRowY + 5, { width: colWidths[j]! - 8 });
        colX += colWidths[j]!;
      }
      tableRowY += tblRowH;
    }

    // Table bottom border
    doc.save()
      .moveTo(tableX, tableRowY).lineTo(tableX + CONTENT_WIDTH, tableRowY)
      .lineWidth(0.5).strokeColor(BORDER).stroke()
      .restore();
    doc.y = tableRowY + 14;

    // ── Accepted policies ──
    if (data.acceptedPolicies.length > 0) {
      ensureSpace(doc, 30);
      doc.font('Helvetica-Bold').fontSize(9).fillColor(PURPLE_DARK)
        .text('Acknowledged Policies:', MARGIN, doc.y, { width: CONTENT_WIDTH });
      doc.moveDown(0.2);
      for (const policy of data.acceptedPolicies) {
        const displayName = POLICY_DISPLAY_NAMES[policy] ?? policy;
        doc.font('Helvetica').fontSize(8.5).fillColor(TEXT_PRIMARY)
          .text(`\u2022  ${displayName}`, MARGIN + 10, doc.y, { width: CONTENT_WIDTH - 10 });
      }
      doc.moveDown(0.5);
    }

    // ── Digital signature ──
    ensureSpace(doc, 100);
    divider(doc, BORDER);

    doc.font('Helvetica-Bold').fontSize(10).fillColor(PURPLE_DARK)
      .text('Digital Signature', MARGIN, doc.y, { width: CONTENT_WIDTH });
    doc.moveDown(0.3);

    const sigBoxY = doc.y;
    const sigBoxW = CONTENT_WIDTH;
    const sigBoxH = signatureImageBuffer ? 65 : 40;

    roundedRect(doc, MARGIN, sigBoxY, sigBoxW, sigBoxH, {
      fill: '#ffffff', stroke: PURPLE, radius: 8, lineWidth: 1,
    });

    doc.font('Helvetica').fontSize(6.5).fillColor(TEXT_MUTED)
      .text('Signed by:', MARGIN + 10, sigBoxY + 5);

    if (signatureImageBuffer) {
      doc.image(signatureImageBuffer, MARGIN + 10, sigBoxY + 16, {
        fit: [sigBoxW - 24, sigBoxH - 22],
      });
    } else {
      doc.font('Courier-Bold').fontSize(16).fillColor(SIGNATURE_BLUE)
        .text(data.signature, MARGIN + 10, sigBoxY + 16, { width: sigBoxW - 24 });
    }

    // Verification info — below signature box
    doc.y = sigBoxY + sigBoxH + 6;
    doc.font('Helvetica-Bold').fontSize(8).fillColor(GREEN_CHECK)
      .text('\u2022 Digitally Signed', MARGIN + 10, doc.y);
    doc.font('Helvetica').fontSize(7.5).fillColor(TEXT_SECONDARY)
      .text(`${formatDateTimeET(data.signedAt)}    |    IP: ${data.ipAddress}`, MARGIN + 10, doc.y);
    doc.moveDown(0.5);

    // ── Waiver reference footer card ──
    ensureSpace(doc, 50);
    const refCardY = doc.y;
    const refCardH = 38;
    roundedRect(doc, MARGIN, refCardY, CONTENT_WIDTH, refCardH, {
      fill: PURPLE_LIGHT, stroke: PURPLE, radius: 8, lineWidth: 0.75,
    });

    doc.font('Helvetica').fontSize(7.5).fillColor(TEXT_SECONDARY)
      .text('Waiver Reference Code:', MARGIN + 14, refCardY + 7);
    doc.font('Helvetica-Bold').fontSize(15).fillColor(PURPLE)
      .text(data.waiverCode, MARGIN + 14, refCardY + 19, { characterSpacing: 3 });

    doc.font('Helvetica').fontSize(7.5).fillColor(TEXT_SECONDARY)
      .text('Date Signed:', MARGIN + CONTENT_WIDTH - 170, refCardY + 7, { width: 156, align: 'right' });
    doc.font('Helvetica-Bold').fontSize(9).fillColor(PURPLE_DARK)
      .text(formatDateET(data.signedAt), MARGIN + CONTENT_WIDTH - 170, refCardY + 21, { width: 156, align: 'right' });

    doc.y = refCardY + refCardH + 14;

    // ── Footer (only if space available) ──
    if (doc.y + 40 < USABLE_BOTTOM) {
      divider(doc, BORDER);
      doc.font('Helvetica').fontSize(7).fillColor(TEXT_MUTED)
        .text(
          'This document was digitally signed and is legally binding. Records retained for a minimum of 7 years.',
          MARGIN, doc.y, { width: CONTENT_WIDTH, align: 'center', lineBreak: false },
        );
      doc.moveDown(0.3);
      doc.font('Helvetica').fontSize(7).fillColor(TEXT_MUTED)
        .text('Playfunia  |  Crossgates Mall, Albany, NY  |  playfunia.com',
          MARGIN, doc.y, { width: CONTENT_WIDTH, align: 'center', lineBreak: false });
    }

    // ═══════════════════════════════════════════════
    //  PAGE NUMBERS + BOTTOM BARS
    // ═══════════════════════════════════════════════
    const range = doc.bufferedPageRange();
    const totalPages = range.count;
    for (let i = 0; i < totalPages; i++) {
      doc.switchToPage(i);

      // Bottom purple accent bar
      doc.save();
      doc.rect(0, PAGE_HEIGHT - 5, PAGE_WIDTH, 5).fill(PURPLE);
      doc.restore();

      // Page number — use absolute y and lineBreak:false to prevent auto-pagination
      doc.save();
      doc.font('Helvetica').fontSize(7).fillColor(TEXT_MUTED);
      doc.text(
        `Page ${i + 1} of ${totalPages}`,
        MARGIN, PAGE_HEIGHT - 18,
        { width: CONTENT_WIDTH, align: 'center', lineBreak: false, height: 10 },
      );
      doc.restore();
    }

    doc.end();
  });
}

function formatDateET(iso: string): string {
  return DateTime.fromISO(iso).setZone('America/New_York').toFormat('MMMM d, yyyy');
}

function formatDateTimeET(iso: string): string {
  return DateTime.fromISO(iso).setZone('America/New_York').toFormat('MM/dd/yyyy h:mm:ss a') + ' ET';
}

function formatDobDisplay(dob: string): string {
  const dateStr = dob.split('T')[0] ?? dob;
  const dt = DateTime.fromISO(dateStr);
  return dt.isValid ? dt.toFormat('MM/dd/yyyy') : dob;
}

function fetchImageBuffer(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, { timeout: 10000 }, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}
