import PDFDocument from 'pdfkit';

export interface ReceiptItem {
  label: string;
  quantity: number;
  unitPrice: number;
  total: number;
  codes?: string[];
}

export interface ReceiptData {
  receiptNumber: string;
  date: string;
  customerName: string;
  customerEmail: string;
  items: ReceiptItem[];
  subtotal: number;
  discounts: Array<{ label: string; amount: number }>;
  total: number;
  paymentMethod: string;
  paymentId: string;
}

/**
 * Generate a PDF receipt buffer
 */
export async function generateReceiptPDF(data: ReceiptData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 50,
        info: {
          Title: `Playfunia Receipt - ${data.receiptNumber}`,
          Author: 'Playfunia',
        },
      });

      const chunks: Buffer[] = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Colors
      const primaryColor = '#7c3aed';
      const textColor = '#1a1a2e';
      const grayColor = '#6b7280';
      const lightGray = '#f3f4f6';

      // Header
      doc
        .fillColor(primaryColor)
        .fontSize(28)
        .font('Helvetica-Bold')
        .text('Playfunia', 50, 50);

      doc
        .fillColor(grayColor)
        .fontSize(10)
        .font('Helvetica')
        .text('Indoor Play & Adventure Club', 50, 82);

      // Receipt title
      doc
        .fillColor(textColor)
        .fontSize(20)
        .font('Helvetica-Bold')
        .text('Receipt', 400, 50, { align: 'right' });

      doc
        .fillColor(grayColor)
        .fontSize(10)
        .font('Helvetica')
        .text(`#${data.receiptNumber}`, 400, 75, { align: 'right' })
        .text(data.date, 400, 88, { align: 'right' });

      // Divider
      doc
        .moveTo(50, 115)
        .lineTo(545, 115)
        .strokeColor('#e5e7eb')
        .stroke();

      // Customer info
      let y = 135;
      doc
        .fillColor(grayColor)
        .fontSize(10)
        .font('Helvetica')
        .text('BILL TO', 50, y);

      y += 15;
      doc
        .fillColor(textColor)
        .fontSize(12)
        .font('Helvetica-Bold')
        .text(data.customerName, 50, y);

      y += 15;
      doc
        .fillColor(grayColor)
        .fontSize(10)
        .font('Helvetica')
        .text(data.customerEmail, 50, y);

      // Items table header
      y = 200;
      doc
        .rect(50, y, 495, 25)
        .fill(lightGray);

      doc
        .fillColor(textColor)
        .fontSize(10)
        .font('Helvetica-Bold')
        .text('Item', 60, y + 8)
        .text('Qty', 320, y + 8, { align: 'center', width: 50 })
        .text('Price', 380, y + 8, { align: 'right', width: 70 })
        .text('Total', 460, y + 8, { align: 'right', width: 75 });

      // Items
      y += 30;
      doc.font('Helvetica').fontSize(10);

      for (const item of data.items) {
        doc
          .fillColor(textColor)
          .text(item.label, 60, y, { width: 250 })
          .text(item.quantity.toString(), 320, y, { align: 'center', width: 50 })
          .text(`$${item.unitPrice.toFixed(2)}`, 380, y, { align: 'right', width: 70 })
          .text(`$${item.total.toFixed(2)}`, 460, y, { align: 'right', width: 75 });

        y += 20;

        // Show entry codes if present
        if (item.codes && item.codes.length > 0) {
          doc
            .fillColor(grayColor)
            .fontSize(9)
            .text(`Entry codes: ${item.codes.join(', ')}`, 70, y, { width: 380 });
          y += 15;
        }

        // Divider between items
        doc
          .moveTo(50, y + 5)
          .lineTo(545, y + 5)
          .strokeColor('#e5e7eb')
          .stroke();

        y += 15;
      }

      // Summary section
      y += 10;
      const summaryX = 380;
      const valueX = 460;

      doc
        .fillColor(grayColor)
        .fontSize(10)
        .font('Helvetica')
        .text('Subtotal', summaryX, y)
        .fillColor(textColor)
        .text(`$${data.subtotal.toFixed(2)}`, valueX, y, { align: 'right', width: 75 });

      // Discounts
      for (const discount of data.discounts) {
        y += 18;
        doc
          .fillColor(grayColor)
          .text(discount.label, summaryX, y)
          .fillColor('#22c55e')
          .text(`-$${discount.amount.toFixed(2)}`, valueX, y, { align: 'right', width: 75 });
      }

      // Total
      y += 25;
      doc
        .rect(summaryX - 10, y - 5, 175, 30)
        .fill(primaryColor);

      doc
        .fillColor('#ffffff')
        .fontSize(12)
        .font('Helvetica-Bold')
        .text('Total Paid', summaryX, y + 3)
        .text(`$${data.total.toFixed(2)}`, valueX, y + 3, { align: 'right', width: 75 });

      // Payment info
      y += 50;
      doc
        .fillColor(grayColor)
        .fontSize(9)
        .font('Helvetica')
        .text('Payment Method: ' + data.paymentMethod, 50, y)
        .text('Transaction ID: ' + data.paymentId, 50, y + 12);

      // Footer
      const footerY = 750;
      doc
        .moveTo(50, footerY)
        .lineTo(545, footerY)
        .strokeColor('#e5e7eb')
        .stroke();

      doc
        .fillColor(grayColor)
        .fontSize(9)
        .font('Helvetica')
        .text('Thank you for choosing Playfunia!', 50, footerY + 15, { align: 'center', width: 495 })
        .text('Questions? Contact us at info@playfunia.com', 50, footerY + 28, { align: 'center', width: 495 })
        .text('www.playfunia.com', 50, footerY + 41, { align: 'center', width: 495 });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}
