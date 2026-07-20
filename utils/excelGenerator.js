const ExcelJS = require('exceljs');
const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');

/**
 * Generate a fancy, styled Excel report with images
 * @param {Object} data - The report data
 * @returns {Promise<Buffer>} - The generated Excel file buffer
 */
async function generateFancyExcel(data) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Inspection Report');

  // Set column widths
  worksheet.columns = [
    { header: '#', key: 'index', width: 5 },
    { header: 'Image', key: 'image', width: 25 },
    { header: 'Building', key: 'building', width: 15 },
    { header: 'Unit', key: 'unit', width: 12 },
    { header: 'Area/Item', key: 'areaItem', width: 25 },
    { header: 'Deficiency Details', key: 'details', width: 45 },
    { header: 'Severity', key: 'severity', width: 15 },
    { header: 'H&S', key: 'hs', width: 10 },
    { header: 'Pts', key: 'pts', width: 8 },
    { header: 'Status', key: 'status', width: 12 },
  ];

  // 1. Header Section
  const headerRows = [
    ['NSPIRE INSPECTION REPORT', ''],
    ['Property Name:', data.metadata.propertyName],
    ['Property Address:', data.metadata.propertyAddress],
    ['Inspection Date:', data.metadata.startDate],
    ['Inspector:', data.metadata.inspectorName],
    ['Final Score:', data.metadata.finalScore],
    [],
  ];

  headerRows.forEach((row, i) => {
    const r = worksheet.addRow(row);
    if (i === 0) {
      r.font = { bold: true, size: 20, color: { argb: 'FFFFFFFF' } };
      r.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0E7490' } };
      worksheet.mergeCells(`A${r.number}:J${r.number}`);
    } else {
      r.getCell(1).font = { bold: true };
    }
  });

  // 2. Summary Table
  worksheet.addRow(['SUMMARY BY SEVERITY']).font = { bold: true, size: 14 };
  worksheet.addRow(['Life-Threatening', data.summary.lifeThreatening]).getCell(1).font = { color: { argb: 'FFFF0000' }, bold: true };
  worksheet.addRow(['Severe', data.summary.severe]).getCell(1).font = { color: { argb: 'FFFF8C00' }, bold: true };
  worksheet.addRow(['Moderate', data.summary.moderate]).getCell(1).font = { color: { argb: 'FFB8860B' }, bold: true };
  worksheet.addRow(['Low', data.summary.low]).getCell(1).font = { color: { argb: 'FF0000FF' }, bold: true };
  worksheet.addRow([]);

  // 3. Deficiency Table Header
  const defHeaderRow = worksheet.addRow(['#', 'Image', 'Building', 'Unit', 'Area/Item', 'Deficiency Details', 'Severity', 'H&S', 'Pts', 'Status']);
  defHeaderRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0E7490' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });

  // 4. Deficiency Rows
  for (let i = 0; i < data.deficiencies.length; i++) {
    const def = data.deficiencies[i];
    const row = worksheet.addRow([
      i + 1,
      '', // Placeholder for image
      def.building || '-',
      def.unit || '-',
      `${def.area || ''} / ${def.itemName || def.item || ''}`,
      `${def.deficiencyName || ''}\n${def.deficiencyDetails || ''}`,
      def.severity || '-',
      def.healthAndSafety || '-',
      def.deductionPts || '0',
      def.status || 'OD'
    ]);

    row.height = 100; // Set height for images
    row.getCell(6).alignment = { wrapText: true, vertical: 'middle' };
    row.eachCell((cell) => {
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
    });

    // Style severity
    const sevCell = row.getCell(7);
    if (def.severity?.includes('Life-Threatening')) sevCell.font = { color: { argb: 'FFFF0000' }, bold: true };
    else if (def.severity?.includes('Severe')) sevCell.font = { color: { argb: 'FFFF8C00' }, bold: true };

    // Add Image if available
    if (def.imageUri) {
      try {
        const imageUrl = def.imageUri.startsWith('http') ? def.imageUri : null;
        if (imageUrl) {
          const imageRes = await axios.get(imageUrl, { responseType: 'arraybuffer' });
          const imageId = workbook.addImage({
            buffer: Buffer.from(imageRes.data),
            extension: 'jpeg',
          });
          worksheet.addImage(imageId, {
            tl: { col: 1, row: row.number - 1 },
            ext: { width: 120, height: 120 },
            editAs: 'oneCell'
          });
        }
      } catch (err) {
        console.warn('Failed to add image to excel:', err.message);
      }
    }
  }

  // 5. Signature Section
  worksheet.addRow([]);
  const sigRow = worksheet.addRow(['DIGITAL SIGNATURE:', data.metadata.inspectorName]);
  sigRow.getCell(1).font = { bold: true };
  sigRow.getCell(2).font = { italic: true, bold: true, size: 14, family: 4 }; // Fancy font attempt
  
  worksheet.addRow(['DATE:', new Date().toLocaleDateString()]).getCell(1).font = { bold: true };

  return await workbook.xlsx.writeBuffer();
}

module.exports = { generateFancyExcel };
