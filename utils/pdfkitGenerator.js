/**
 * PDFKit-based PDF Generator - Works reliably in serverless environments
 * Pure JavaScript implementation matching the INSPIRE reference template
 */

const PDFDocument = require('pdfkit');
const https = require('https');
const http = require('http');

/**
 * Fetch image from URL and return as Buffer for PDFKit embedding
 */
async function fetchImageBuffer(url, timeoutMs = 10000) {
  if (!url || url.trim() === '') return null;
  
  // Handle base64 data URIs
  if (url.startsWith('data:')) {
    try {
      const base64Data = url.split(',')[1];
      return Buffer.from(base64Data, 'base64');
    } catch (e) {
      return null;
    }
  }
  
  // Handle local files
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    try {
      const fs = require('fs');
      const filePath = url.replace('file://', '');
      if (fs.existsSync(filePath)) return fs.readFileSync(filePath);
    } catch (e) { /* ignore */ }
    return null;
  }

  return new Promise((resolve) => {
    const protocol = url.startsWith('https') ? https : http;
    const request = protocol.get(url, { timeout: timeoutMs }, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        fetchImageBuffer(response.headers.location, timeoutMs).then(resolve);
        return;
      }
      if (response.statusCode !== 200) { resolve(null); return; }
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve(Buffer.concat(chunks)));
      response.on('error', () => resolve(null));
    });
    request.on('error', () => resolve(null));
    request.on('timeout', () => { request.destroy(); resolve(null); });
  });
}

/**
 * Generate NSPIRE PDF report using PDFKit - matching reference template format
 */
async function generateNSPIREPDFBuffer(inspectionData, options = {}) {
  return new Promise(async (resolve, reject) => {
    try {
      console.log('Generating PDF with PDFKit...');
      
      // A5 page size: 419.53 x 595.28 points (148mm x 210mm)
      const doc = new PDFDocument({
        size: [419.53, 595.28],
        margins: {
          top: 42,   // ~15mm
          bottom: 42,
          left: 34,  // ~12mm
          right: 34
        }
      });

      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => {
        const pdfBuffer = Buffer.concat(chunks);
        console.log(`PDFKit PDF generated successfully, size: ${pdfBuffer.length} bytes`);
        resolve(pdfBuffer);
      });
      doc.on('error', reject);

      const processedData = processInspectionData(inspectionData);

      // Pre-fetch all deficiency images as buffers for embedding
      console.log(`Fetching ${processedData.deficiencies.length} deficiency images for PDFKit...`);
      await Promise.all(
        processedData.deficiencies.map(async (def) => {
          if (def.imageUrl) {
            try {
              def.imageBuffer = await fetchImageBuffer(def.imageUrl);
              if (def.imageBuffer) console.log(`Fetched image for deficiency ${def.id}`);
            } catch (e) {
              console.warn(`Failed to fetch image for deficiency ${def.id}:`, e.message);
            }
          }
        })
      );

      generatePDFContent(doc, processedData, options);
      doc.end();

    } catch (error) {
      console.error('Error generating PDF with PDFKit:', error);
      reject(error);
    }
  });
}

function processInspectionData(data) {
  const now = new Date();
  const inspectionNo = data.inspectionNo || data.inspectionId || data._id || `INSP-${Date.now().toString(36).toUpperCase()}`;
  
  // Extract raw findings and deduplicate them to prevent "duplicate ODs"
  const rawDataFindings = (data.findings && data.findings.length > 0) 
    ? data.findings 
    : (data.deficiencies || []);
    
  const uniqueFindings = [];
  const seenFindingKeys = new Set();
  
  rawDataFindings.forEach(item => {
    const areaStr = String(item.area || item.inspectionArea || item._area || item.subCategory || item.category || '').toLowerCase();
    const titleStr = String(item.title || item.deficiencyName || item.name || '').toLowerCase();
    const descStr = String(item.description || item.details || item.deficiencyDetails || '').toLowerCase();
    const bldgStr = String(item.buildingInspectionId || item.buildingId || item.buildingName || item.building || '').toLowerCase();
    const unitStr = String(item.unit || item.unitId || item.unitNumber || item._unit || '').toLowerCase();
    
    // Fallback stable deduplication key
    const stableId = item.dedupeKey || item.deficiencyQRId || item.findingId;
    
    const dedupKey = stableId ? `id-${stableId}` : `${areaStr}|${bldgStr}|${unitStr}|${titleStr}|${descStr}`;
    
    if (!seenFindingKeys.has(dedupKey)) {
      seenFindingKeys.add(dedupKey);
      uniqueFindings.push(item);
    }
  });

  const deficiencies = uniqueFindings.map((item, index) => ({
    id: item.id || item._id || `DEF-${index + 1}`,
    title: item.title || item.deficiencyName || item.nspireCode || `QR-${(10000000 + Math.floor(Math.random() * 89999999))}`,
    description: item.description || item.details || item.deficiencyDetails || 'Deficiency observed during inspection',
    severity: mapSeverity(item.severity),
    location: item.location || item.room || item.area || 'General',
    building: item.building || data.building || 'B1',
    unit: item.unit || data.unit || '',
    category: item.category || item.area || 'Inside',
    notes: item.notes || item.comments || item.recommendation || '',
    deductionPts: item.deductionPts || calcDeduction(item.severity),
    repeat: item.repeat ? 'Repeat' : 'Not Repeat',
    status: item.status || 'Open',
    imageUrl: item.imageUrl || item.imageUri || item.photos?.[0]?.url || ''
  }));

  // Deficiency summary matrix
  const matrix = { inside: { lt: 0, s: 0, m: 0, l: 0 }, outside: { lt: 0, s: 0, m: 0, l: 0 }, units: { lt: 0, s: 0, m: 0, l: 0 } };
  deficiencies.forEach(d => {
    const cat = (d.category || '').toLowerCase();
    let row = 'units';
    if (cat.includes('outside') || cat.includes('site') || cat.includes('exterior') || cat.includes('building')) row = 'outside';
    else if (cat.includes('inside') || cat.includes('common') || cat.includes('office')) row = 'inside';
    const sev = d.severity.toLowerCase();
    const key = sev === 'life-threatening' ? 'lt' : sev === 'severe' ? 's' : sev === 'moderate' ? 'm' : 'l';
    matrix[row][key]++;
  });

  const totalDeductions = deficiencies.reduce((sum, d) => sum + d.deductionPts, 0);
  const finalScore = Math.max(0, 100 - totalDeductions);

  return {
    inspectionNo,
    inspectionType: data.inspectionType || 'General NSPIRE',
    escortName: data.escortName || data.property?.contactName || 'Property Manager',
    propertyType: data.propertyType || 'Multifamily',
    propertyName: data.propertyName || data.property?.name || 'Property Name',
    building: data.building || data.property?.buildingName || 'B1',
    inspectedUnits: data.inspectedUnits || 'Unit 001',
    inspectorName: data.inspectorName || data.inspector?.fullName || 'Inspector',
    startDate: data.startDate || now.toLocaleDateString(),
    endDate: data.endDate || now.toLocaleDateString(),
    reportCreatedDate: now.toLocaleDateString(),
    preliminaryScore: data.preliminaryScore || finalScore,
    finalScore: data.finalScore || finalScore,
    calculatedScore: data.calculatedScore || finalScore,
    unitsThreshold: data.unitsThreshold || 10.79,
    propertyThreshold: data.propertyThreshold || 60,
    inspectionData: [
      { type: 'Building', total: data.property?.buildings || data.buildingCount || 2, sample: data.buildingSampleSize || 1, inspected: data.buildingsInspected || 1 },
      { type: 'Unit', total: data.property?.units || data.unitCount || 10, sample: data.unitSampleSize || 1, inspected: data.unitsInspected || 1 }
    ],
    matrix,
    deficiencies,
    totalDeficiencies: deficiencies.length
  };
}

function generatePDFContent(doc, data, options) {
  const m = doc.page.margins;
  const w = doc.page.width - m.left - m.right;
  let y = m.top;

  // --- HEADER ---
  doc.fontSize(6).fillColor('#666666').text('NATIONAL STANDARDS FOR THE PHYSICAL INSPECTION OF REAL ESTATE', m.left, y, { align: 'center', width: w });
  y += 14;
  doc.fontSize(10).fillColor('#000000').font('Helvetica-Bold').text('INSPIRE INSPECTION REPORT', m.left, y, { align: 'center', width: w });
  y += 18;

  // Metadata - two columns
  const colW = w / 2;
  const labelW = 75;
  doc.fontSize(6).font('Helvetica');
  
  const leftFields = [
    ['Inspection No:', data.inspectionNo],
    ['Inspection Type:', data.inspectionType],
    ['Escort Name:', data.escortName],
    ['Property Type:', data.propertyType]
  ];
  const rightFields = [
    ['Inspection Start Date:', data.startDate],
    ['Inspection End Date:', data.endDate],
    ['Report Created Date:', data.reportCreatedDate],
    ['Building:', data.building],
    ['Inspected Units:', data.inspectedUnits]
  ];

  const metaStartY = y;
  leftFields.forEach(([label, val]) => {
    doc.font('Helvetica-Bold').text(label, m.left, y, { width: labelW, continued: false });
    doc.font('Helvetica').text(val, m.left + labelW, y);
    y += 10;
  });
  
  let ry = metaStartY;
  rightFields.forEach(([label, val]) => {
    doc.font('Helvetica-Bold').text(label, m.left + colW, ry, { width: 90, continued: false });
    doc.font('Helvetica').text(val, m.left + colW + 90, ry);
    ry += 10;
  });
  y = Math.max(y, ry) + 8;

  // --- SCORES SECTION ---
  const scoreBoxH = 60;
  doc.rect(m.left, y, w, scoreBoxH).lineWidth(1.5).stroke('#000000');
  
  // Preliminary Scores (left half)
  const halfW = w / 2 - 8;
  doc.fontSize(7).font('Helvetica-Bold');
  doc.text('Preliminary Scores', m.left + 6, y + 4);
  doc.moveTo(m.left + 6, y + 13).lineTo(m.left + 6 + 85, y + 13).stroke('#000000');
  
  const preScores = [
    ['Preliminary Inspection Score:', data.preliminaryScore],
    ['Calculated Score:', data.calculatedScore],
    ['Units Threshold:', data.unitsThreshold],
    ['Property Threshold:', data.propertyThreshold]
  ];
  let sy = y + 16;
  doc.fontSize(5.5).font('Helvetica');
  preScores.forEach(([label, val]) => {
    doc.text(label, m.left + 6, sy);
    doc.font('Helvetica-Bold').text(String(val), m.left + 6 + halfW - 30, sy, { width: 30, align: 'right' });
    doc.font('Helvetica');
    sy += 9;
  });
  
  // Final Scores (right half)
  doc.fontSize(7).font('Helvetica-Bold');
  doc.text('Final Scores', m.left + w / 2 + 6, y + 4);
  doc.moveTo(m.left + w / 2 + 6, y + 13).lineTo(m.left + w / 2 + 6 + 55, y + 13).stroke('#000000');
  
  const finalScores = [
    ['Final Inspection Score:', data.finalScore],
    ['Calculated Score:', data.calculatedScore],
    ['Units Threshold:', data.unitsThreshold],
    ['Property Threshold:', data.propertyThreshold]
  ];
  sy = y + 16;
  doc.fontSize(5.5).font('Helvetica');
  finalScores.forEach(([label, val], i) => {
    if (i === 0) doc.font('Helvetica-Bold');
    doc.text(label, m.left + w / 2 + 6, sy);
    doc.font('Helvetica-Bold').text(String(val), m.left + w - 36, sy, { width: 30, align: 'right' });
    doc.font('Helvetica');
    sy += 9;
  });
  
  y += scoreBoxH + 10;

  // --- BUILDING/UNIT INSPECTION DATA ---
  doc.fontSize(7).font('Helvetica-Bold').fillColor('#000000');
  doc.text('Building/Unit Inspection Data', m.left, y);
  doc.moveTo(m.left, y + 9).lineTo(m.left + 155, y + 9).stroke('#000000');
  y += 14;

  // Table header
  const cols = [{ w: w * 0.25, label: 'Type' }, { w: w * 0.25, label: 'Property Total' }, { w: w * 0.25, label: 'Sample Size' }, { w: w * 0.25, label: 'Total Units Inspected' }];
  let cx = m.left;
  const rowH = 14;
  
  // Header row
  cols.forEach(col => {
    doc.rect(cx, y, col.w, rowH).fillAndStroke('#D3D3D3', '#000000');
    doc.fontSize(5.5).fillColor('#000000').font('Helvetica-Bold').text(col.label, cx + 2, y + 4, { width: col.w - 4, align: 'center' });
    cx += col.w;
  });
  y += rowH;

  // Data rows
  data.inspectionData.forEach(row => {
    cx = m.left;
    const vals = [row.type, String(row.total), String(row.sample), String(row.inspected)];
    vals.forEach((val, i) => {
      doc.rect(cx, y, cols[i].w, rowH).stroke('#000000');
      doc.fontSize(5.5).fillColor('#000000').font('Helvetica').text(val, cx + 2, y + 4, { width: cols[i].w - 4, align: i === 0 ? 'left' : 'center' });
      cx += cols[i].w;
    });
    y += rowH;
  });
  y += 10;

  // --- DEFICIENCY SUMMARY ---
  doc.fontSize(7).font('Helvetica-Bold');
  doc.text('Deficiency Summary', m.left, y);
  doc.moveTo(m.left, y + 9).lineTo(m.left + 105, y + 9).stroke('#000000');
  y += 14;

  const sumCols = [{ w: w * 0.25, label: 'Inspectable Area' }, { w: w * 0.19, label: 'Life-Threatening' }, { w: w * 0.19, label: 'Severe' }, { w: w * 0.19, label: 'Moderate' }, { w: w * 0.18, label: 'Low' }];
  cx = m.left;
  sumCols.forEach(col => {
    doc.rect(cx, y, col.w, rowH).fillAndStroke('#D3D3D3', '#000000');
    doc.fontSize(5).fillColor('#000000').font('Helvetica-Bold').text(col.label, cx + 2, y + 4, { width: col.w - 4, align: 'center' });
    cx += col.w;
  });
  y += rowH;

  const matrixRows = [
    ['Inside', data.matrix.inside.lt, data.matrix.inside.s, data.matrix.inside.m, data.matrix.inside.l],
    ['Outside', data.matrix.outside.lt, data.matrix.outside.s, data.matrix.outside.m, data.matrix.outside.l],
    ['Units', data.matrix.units.lt, data.matrix.units.s, data.matrix.units.m, data.matrix.units.l]
  ];
  matrixRows.forEach(row => {
    cx = m.left;
    row.forEach((val, i) => {
      doc.rect(cx, y, sumCols[i].w, rowH).stroke('#000000');
      doc.fontSize(5.5).fillColor('#000000').font('Helvetica').text(String(val), cx + 2, y + 4, { width: sumCols[i].w - 4, align: i === 0 ? 'left' : 'center' });
      cx += sumCols[i].w;
    });
    y += rowH;
  });
  y += 10;

  // --- DEFICIENCY DETAILS ---
  if (y > doc.page.height - 100) { doc.addPage(); y = m.top; }

  doc.fontSize(7).font('Helvetica-Bold');
  doc.text('Inspectable Areas Deficiencies', m.left, y);
  doc.moveTo(m.left, y + 9).lineTo(m.left + 155, y + 9).stroke('#000000');
  y += 14;

  if (data.deficiencies.length === 0) {
    doc.fontSize(6).font('Helvetica').text('No deficiencies found during this inspection.', m.left, y, { align: 'center', width: w });
    y += 20;
  } else {
    // Table headers
    const defCols = [
      { w: w * 0.20, label: 'Deficiency Details' },
      { w: w * 0.12, label: 'Deficiency Name' },
      { w: w * 0.18, label: 'Comments' },
      { w: w * 0.14, label: 'Picture' },
      { w: w * 0.10, label: 'Deduction Pts.' },
      { w: w * 0.13, label: 'Repeat' },
      { w: w * 0.13, label: 'Severity' }
    ];
    cx = m.left;
    defCols.forEach(col => {
      doc.rect(cx, y, col.w, rowH).fillAndStroke('#D3D3D3', '#000000');
      doc.fontSize(4.5).fillColor('#000000').font('Helvetica-Bold').text(col.label, cx + 1, y + 4, { width: col.w - 2, align: 'center' });
      cx += col.w;
    });
    y += rowH;

    // Group by building/unit
    const groups = {};
    data.deficiencies.forEach(def => {
      const key = def.unit ? `Unit - ${def.unit}` : `Building - ${def.building}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(def);
    });

    Object.keys(groups).forEach(groupName => {
      // Yellow group header
      if (y > doc.page.height - 50) { doc.addPage(); y = m.top; }
      doc.rect(m.left, y, w, rowH).fillAndStroke('#FFFF00', '#000000');
      doc.fontSize(5.5).fillColor('#000000').font('Helvetica-Bold').text(groupName, m.left + 3, y + 4);
      y += rowH;

      groups[groupName].forEach(def => {
        if (y > doc.page.height - 50) { doc.addPage(); y = m.top; }
        // Use taller row if image exists
        const hasImage = def.imageBuffer && def.imageBuffer.length > 0;
        const defRowH = hasImage ? 50 : 22;
        cx = m.left;
        const vals = [
          def.description, def.title, def.notes, null, /* image handled separately */
          String(def.deductionPts), def.repeat, def.severity
        ];
        vals.forEach((val, i) => {
          doc.rect(cx, y, defCols[i].w, defRowH).stroke('#000000');
          if (i === 3) {
            // Picture column - embed actual image or show placeholder text
            if (hasImage) {
              try {
                const imgW = defCols[i].w - 4;
                const imgH = defRowH - 6;
                doc.image(def.imageBuffer, cx + 2, y + 3, { fit: [imgW, imgH], align: 'center', valign: 'center' });
              } catch (imgErr) {
                doc.fontSize(4.5).fillColor('#000000').font('Helvetica').text('Photo', cx + 1, y + 3, { width: defCols[i].w - 2, align: 'center', height: defRowH - 4 });
              }
            } else {
              doc.fontSize(4.5).fillColor('#000000').font('Helvetica').text('No Photo', cx + 1, y + 3, { width: defCols[i].w - 2, align: 'center', height: defRowH - 4 });
            }
          } else {
            doc.fontSize(4.5).fillColor('#000000').font('Helvetica').text(val || '', cx + 1, y + 3, { width: defCols[i].w - 2, align: i === 0 || i === 1 || i === 2 ? 'left' : 'center', height: defRowH - 4 });
          }
          cx += defCols[i].w;
        });
        y += defRowH;
      });
    });
  }
  y += 10;

  // --- CERTIFICATES ---
  if (y > doc.page.height - 80) { doc.addPage(); y = m.top; }
  doc.fontSize(7).font('Helvetica-Bold');
  doc.text('Certificates', m.left, y);
  doc.moveTo(m.left, y + 9).lineTo(m.left + 60, y + 9).stroke('#000000');
  y += 14;

  const certCols = [{ w: w * 0.35, label: 'Certificate Type' }, { w: w * 0.30, label: 'Status' }, { w: w * 0.35, label: 'Comment' }];
  cx = m.left;
  certCols.forEach(col => {
    doc.rect(cx, y, col.w, rowH).fillAndStroke('#D3D3D3', '#000000');
    doc.fontSize(5.5).fillColor('#000000').font('Helvetica-Bold').text(col.label, cx + 2, y + 4, { width: col.w - 4, align: 'center' });
    cx += col.w;
  });
  y += rowH;

  const certs = [
    ['Elevator', 'N/A', 'No elevator present'], ['Boiler', 'Current', 'Valid until 2026'],
    ['Lead-Based Paint', 'Current', 'Compliant'], ['Fire Alarm', 'Current', 'Tested monthly'],
    ['Sprinkler', 'N/A', 'Not required']
  ];
  certs.forEach(row => {
    cx = m.left;
    row.forEach((val, i) => {
      doc.rect(cx, y, certCols[i].w, rowH).stroke('#000000');
      doc.fontSize(5.5).fillColor('#000000').font('Helvetica').text(val, cx + 2, y + 4, { width: certCols[i].w - 4, align: i === 1 ? 'center' : 'left' });
      cx += certCols[i].w;
    });
    y += rowH;
  });
  y += 12;

  // --- CERTIFICATION ---
  if (y > doc.page.height - 70) { doc.addPage(); y = m.top; }
  doc.rect(m.left, y, w, 50).stroke('#000000');
  doc.fontSize(7).font('Helvetica-Bold').text('Inspector Certification', m.left + 6, y + 4);
  doc.moveTo(m.left + 6, y + 13).lineTo(m.left + 6 + 100, y + 13).stroke('#000000');
  doc.fontSize(5).font('Helvetica').text('I certify this inspection was conducted per INSPIRE standards.', m.left + 6, y + 18);
  
  doc.moveTo(m.left + 6, y + 38).lineTo(m.left + 100, y + 38).stroke('#000000');
  doc.fontSize(4.5).fillColor('#666666').text('Inspector Signature', m.left + 6, y + 40);
  doc.font('Helvetica-Bold').fillColor('#000000').text(data.inspectorName, m.left + 6, y + 46);
  
  doc.moveTo(m.left + w - 80, y + 38).lineTo(m.left + w - 10, y + 38).stroke('#000000');
  doc.fontSize(4.5).fillColor('#666666').font('Helvetica').text('Date', m.left + w - 80, y + 40);
  doc.font('Helvetica-Bold').fillColor('#000000').text(data.reportCreatedDate, m.left + w - 80, y + 46);
  
  y += 58;

  // --- FOOTER ---
  doc.fontSize(5.5).font('Helvetica-Bold').fillColor('#000000')
     .text('--- PAGE 1 ---', m.left, y, { align: 'center', width: w });
  y += 10;
  doc.moveTo(m.left, y).lineTo(m.left + w, y).stroke('#000000');
  y += 4;
  doc.fontSize(5).font('Helvetica').fillColor('#666666')
     .text('Generated by NSPIRE Inspection System', m.left, y, { align: 'center', width: w });
  y += 8;
  doc.text(`Report generated on ${new Date().toLocaleDateString()}, ${new Date().toLocaleTimeString()}`, m.left, y, { align: 'center', width: w });
  y += 8;
  doc.text('This document is confidential and intended for authorized use only.', m.left, y, { align: 'center', width: w });
}

function mapSeverity(severity) {
  if (!severity) return 'Moderate';
  const s = severity.toLowerCase();
  if (s.includes('life') || s.includes('critical') || s.includes('threatening')) return 'Life-Threatening';
  if (s.includes('severe') || s.includes('major') || s === 'high') return 'Severe';
  if (s.includes('moderate') || s === 'medium') return 'Moderate';
  if (s === 'low' || s === 'minor' || s.includes('observation')) return 'Low';
  return 'Moderate';
}

function calcDeduction(severity) {
  if (!severity) return 3;
  const s = severity.toLowerCase();
  if (s.includes('life') || s.includes('critical') || s.includes('threatening')) return 10;
  if (s.includes('severe') || s.includes('major') || s === 'high') return 6;
  if (s.includes('moderate') || s === 'medium') return 3;
  if (s === 'low' || s === 'minor' || s.includes('observation')) return 1;
  return 3;
}

module.exports = {
  generateNSPIREPDFBuffer
};