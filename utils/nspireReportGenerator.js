const puppeteer = require('puppeteer');
const fs = require('fs-extra');
const path = require('path');
const htmlPdf = require('html-pdf');
const https = require('https');
const http = require('http');

/**
 * Download an image from a URL and return it as a base64 data URI
 */
async function fetchImageAsBase64(url, timeoutMs = 10000) {
  if (!url || url.trim() === '') return '';
  if (url.startsWith('data:')) return url;
  
  if (url.startsWith('file://') || (!url.startsWith('http://') && !url.startsWith('https://') && !url.includes('://'))) {
    try {
      const filePath = url.replace('file://', '');
      if (fs.existsSync(filePath)) {
        const buffer = fs.readFileSync(filePath);
        const ext = path.extname(filePath).toLowerCase();
        const mimeType = ext === '.png' ? 'image/png' : ext === '.gif' ? 'image/gif' : 'image/jpeg';
        return `data:${mimeType};base64,${buffer.toString('base64')}`;
      }
    } catch (e) { /* ignore */ }
    return '';
  }

  return new Promise((resolve) => {
    const protocol = url.startsWith('https') ? https : http;
    const request = protocol.get(url, { timeout: timeoutMs }, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        fetchImageAsBase64(response.headers.location, timeoutMs).then(resolve);
        return;
      }
      if (response.statusCode !== 200) { resolve(''); return; }
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => {
        try {
          const buffer = Buffer.concat(chunks);
          const contentType = response.headers['content-type'] || 'image/jpeg';
          const mimeType = contentType.split(';')[0].trim();
          resolve(`data:${mimeType};base64,${buffer.toString('base64')}`);
        } catch (e) { resolve(''); }
      });
      response.on('error', () => resolve(''));
    });
    request.on('error', () => resolve(''));
    request.on('timeout', () => { request.destroy(); resolve(''); });
  });
}

/**
 * NSPIRE PDF Report Generator for Backend
 * Generates the INSPIRE Inspection Report to match the strict visual template
 */

/**
 * Generate comprehensive NSPIRE inspection report
 */
async function generateNSPIREReport(inspectionData, options = {}) {
  console.log('Starting NSPIRE report generation...');

  try {
    return await generateWithPuppeteer(inspectionData, options);
  } catch (puppeteerError) {
    console.log('Puppeteer failed, falling back to html-pdf:', puppeteerError.message);
    return await generateWithHtmlPdf(inspectionData, options);
  }
}

/**
 * Generate PDF as buffer (for serverless environments)
 */
async function generateNSPIREReportBuffer(inspectionData, options = {}) {
  console.log('Starting NSPIRE report generation as buffer...');

  try {
    const { generateNSPIREPDFBuffer } = require('./pdfkitGenerator');
    return await generateNSPIREPDFBuffer(inspectionData, options);
  } catch (pdfkitError) {
    console.log('PDFKit failed, falling back to Puppeteer:', pdfkitError.message);

    try {
      return await generateWithPuppeteerBuffer(inspectionData, options);
    } catch (puppeteerError) {
      console.log('Puppeteer failed, falling back to html-pdf:', puppeteerError.message);

      try {
        return await generateWithHtmlPdfBuffer(inspectionData, options);
      } catch (htmlPdfError) {
        console.log('html-pdf failed, falling back to simple HTML:', htmlPdfError.message);
        const htmlBuffer = await generateSimplePDFBuffer(inspectionData, options);
        return htmlBuffer;
      }
    }
  }
}

async function generateWithPuppeteerBuffer(inspectionData, options = {}) {
  const puppeteerConfig = {
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-accelerated-2d-canvas', '--no-first-run', '--no-zygote', '--single-process', '--disable-gpu', '--disable-web-security', '--disable-features=VizDisplayCompositor']
  };

  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    try {
      const chromium = require('@sparticuz/chromium');
      puppeteerConfig.executablePath = await chromium.executablePath();
      puppeteerConfig.args = [...puppeteerConfig.args, ...chromium.args];
    } catch (error) {
      console.log('Chromium not available, falling back to system Chrome');
      puppeteerConfig.executablePath = process.env.CHROME_EXECUTABLE_PATH || undefined;
    }
  }

  const browser = await puppeteer.launch(puppeteerConfig);

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 1600 });

    const nspireReport = await convertToNSPIREFormat(inspectionData);
    const htmlContent = generateNSPIREHTML(nspireReport, options);

    await page.setContent(htmlContent, { waitUntil: 'networkidle0', timeout: 30000 });

    // Use header/footer template for pagination if needed, but for now we rely on content layout
    const pdfBuffer = await page.pdf({
      width: '148mm',
      height: '210mm',
      printBackground: true,
      margin: { top: '15mm', right: '12mm', bottom: '15mm', left: '12mm' }
    });

    console.log(`NSPIRE report generated successfully with Puppeteer as buffer`);
    return pdfBuffer;

  } catch (error) {
    console.error('Error generating NSPIRE report with Puppeteer:', error);
    throw error;
  } finally {
    await browser.close();
  }
}

async function generateWithHtmlPdfBuffer(inspectionData, options = {}) {
  return new Promise(async (resolve, reject) => {
    try {
      const nspireReport = await convertToNSPIREFormat(inspectionData);
      const htmlContent = generateNSPIREHTML(nspireReport, options);

      const pdfOptions = {
        width: '148mm',
        height: '210mm',
        orientation: 'portrait',
        border: { top: '15mm', right: '12mm', bottom: '15mm', left: '12mm' },
        type: 'pdf',
        quality: '75',
        renderDelay: 1000,
        zoomFactor: 1
      };

      htmlPdf.create(htmlContent, pdfOptions).toBuffer((err, buffer) => {
        if (err) {
          console.error('Error generating PDF with html-pdf:', err);
          reject(err);
        } else {
          console.log(`NSPIRE report generated successfully with html-pdf as buffer`);
          resolve(buffer);
        }
      });

    } catch (error) {
      console.error('Error in generateWithHtmlPdfBuffer:', error);
      reject(error);
    }
  });
}

async function generateSimplePDFBuffer(inspectionData, options = {}) {
  try {
    const { generateSimplePDFHTML } = require('./simplePdfGenerator');
    const htmlContent = generateSimplePDFHTML(inspectionData);
    return Buffer.from(htmlContent, 'utf8');
  } catch (error) {
    console.error('Error in generateSimplePDFBuffer:', error);
    throw error;
  }
}

async function generateWithPuppeteer(inspectionData, options = {}) {
  const puppeteerConfig = {
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-accelerated-2d-canvas', '--no-first-run', '--no-zygote', '--single-process', '--disable-gpu', '--disable-web-security', '--disable-features=VizDisplayCompositor']
  };

  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    try {
      const chromium = require('@sparticuz/chromium');
      puppeteerConfig.executablePath = await chromium.executablePath();
      puppeteerConfig.args = [...puppeteerConfig.args, ...chromium.args];
    } catch (error) {
      console.log('Chromium not available, falling back to system Chrome');
      puppeteerConfig.executablePath = process.env.CHROME_EXECUTABLE_PATH || undefined;
    }
  }

  const browser = await puppeteer.launch(puppeteerConfig);

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 1600 });

    const nspireReport = await convertToNSPIREFormat(inspectionData);
    const htmlContent = generateNSPIREHTML(nspireReport, options);

    await page.setContent(htmlContent, { waitUntil: 'networkidle0', timeout: 30000 });

    const reportDir = process.env.VERCEL ? '/tmp' : path.join(__dirname, '../reports');
    if (!process.env.VERCEL) {
      await fs.ensureDir(reportDir);
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportPath = path.join(reportDir, `INSPIRE_Report_${nspireReport.metadata.inspectionNo}_${timestamp}.pdf`);

    await page.pdf({
      path: reportPath,
      width: '148mm',
      height: '210mm',
      printBackground: true,
      margin: { top: '15mm', right: '12mm', bottom: '15mm', left: '12mm' }
    });

    console.log(`NSPIRE report generated successfully with Puppeteer: ${reportPath}`);
    return reportPath;

  } catch (error) {
    console.error('Error generating NSPIRE report with Puppeteer:', error);
    throw error;
  } finally {
    await browser.close();
  }
}

async function generateWithHtmlPdf(inspectionData, options = {}) {
  return new Promise(async (resolve, reject) => {
    try {
      const nspireReport = await convertToNSPIREFormat(inspectionData);
      const htmlContent = generateNSPIREHTML(nspireReport, options);

      const reportDir = process.env.VERCEL ? '/tmp' : path.join(__dirname, '../reports');
      if (!process.env.VERCEL) {
        fs.ensureDirSync(reportDir);
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const reportPath = path.join(reportDir, `INSPIRE_Report_${nspireReport.metadata.inspectionNo}_${timestamp}.pdf`);

      const pdfOptions = {
        width: '148mm',
        height: '210mm',
        orientation: 'portrait',
        border: { top: '15mm', right: '12mm', bottom: '15mm', left: '12mm' },
        type: 'pdf',
        quality: '75',
        renderDelay: 1000,
        zoomFactor: 1
      };

      htmlPdf.create(htmlContent, pdfOptions).toFile(reportPath, (err, res) => {
        if (err) {
          console.error('Error generating PDF with html-pdf:', err);
          reject(err);
        } else {
          console.log(`NSPIRE report generated successfully with html-pdf: ${reportPath}`);
          resolve(reportPath);
        }
      });

    } catch (error) {
      console.error('Error in generateWithHtmlPdf:', error);
      reject(error);
    }
  });
}

/**
 * Load the HUD logo and return as base64 string
 */
async function loadHudLogo() {
  try {
    // Try to find the logo - adjusting for typical directory structure
    // We are in backend/utils, so ../../frontend/public/logo.png
    let logoPath = path.resolve(__dirname, '../../frontend/public/logo.png');

    // Check if file exists, if not try absolute (during dev) or other common locations
    if (!await fs.pathExists(logoPath)) {
      console.warn(`Logo not found at ${logoPath}, trying alternative locations...`);
      // Fallback for different deployment structures? 
      // For now, if local fails, return empty
      return '';
    }

    const logoBuffer = await fs.readFile(logoPath);
    const base64Logo = logoBuffer.toString('base64');
    return `data:image/png;base64,${base64Logo}`;
  } catch (error) {
    console.error('Error loading HUD logo:', error);
    return '';
  }
}

/**
 * Convert inspection data to NSPIRE format
 */
async function convertToNSPIREFormat(data) {
  const now = new Date();

  // Load Logo
  const logoBase64 = await loadHudLogo();

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

  // Convert findings/deficiencies
  const rawDeficiencies = uniqueFindings.map((item, index) => ({
    id: item.id || item._id || `DEF-${index + 1}`,
    rawImageUri: item.imageUrl || item.imageUri || item.photos?.[0]?.url || '',
    building: item.building || data.building || 'A',
    unit: item.unit || data.unit || 'Multiple',
    room: item.location || item.room || item.area || 'General',
    area: item.subCategory || item.category || 'Property',
    deficiencyName: item.title || item.description || item.deficiencyName || 'Unnamed Issue',
    nspireCode: item.nspireCode || mapCategoryToNSPIRECode(item.category || item.area),
    deficiencyDetails: item.description || item.details || item.deficiencyDetails || '',
    comments: item.notes || item.comments || item.recommendation || '',
    deductionPts: calculateDeductionPoints(item.severity),
    repeatIndicator: item.repeat || false,
    severity: mapSeverityToNSPIRE(item.severity),
    inspectedDate: now.toLocaleDateString(),
    inspectedTime: now.toLocaleTimeString(),
    status: item.status || 'Open'
  }));

  // Convert all image URLs to base64 data URIs in parallel
  console.log(`[nspireReportGenerator] Converting ${rawDeficiencies.length} deficiency images to base64...`);
  const deficiencies = await Promise.all(
    rawDeficiencies.map(async (def) => {
      let imageUri = '';
      if (def.rawImageUri) {
        try {
          imageUri = await fetchImageAsBase64(def.rawImageUri);
        } catch (e) {
          console.warn(`Error converting image for deficiency ${def.id}:`, e.message);
        }
      }
      const { rawImageUri, ...rest } = def;
      return { ...rest, imageUri };
    })
  );
  console.log(`[nspireReportGenerator] Image conversion complete. ${deficiencies.filter(d => d.imageUri).length}/${deficiencies.length} converted.`);

  // Deficiency Summary Matrix Calculation
  const deficiencyMatrix = {
    inside: { lifeThreatening: 0, severe: 0, moderate: 0, low: 0 },
    outside: { lifeThreatening: 0, severe: 0, moderate: 0, low: 0 },
    units: { lifeThreatening: 0, severe: 0, moderate: 0, low: 0 }
  };

  deficiencies.forEach(d => {
    // Map area/category to Inside/Outside/Units
    // This is a heuristic mapping, adjust as needed based on actual data values
    let matrixRow = 'units'; // Default
    const area = (d.area || '').toLowerCase();
    const subCat = (d.room || '').toLowerCase(); // sometimes room has subcategory info

    if (area.includes('outside') || area.includes('site') || area.includes('exterior') || area.includes('building')) {
      matrixRow = 'outside';
    } else if (area.includes('inside') || area.includes('common') || area.includes('office')) {
      matrixRow = 'inside';
    } else {
      matrixRow = 'units';
    }

    const sev = d.severity.toLowerCase().replace('-', '');
    const severityKey = sev === 'lifethreatening' ? 'lifeThreatening' :
      sev === 'severe' ? 'severe' :
        sev === 'moderate' ? 'moderate' : 'low';

    if (deficiencyMatrix[matrixRow]) {
      deficiencyMatrix[matrixRow][severityKey]++;
    }
  });

  // Calculate score
  const totalDeductions = deficiencies.reduce((sum, d) => sum + d.deductionPts, 0);
  const finalScore = Math.max(0, 100 - totalDeductions);

  return {
    reportId: `RPT-${Date.now()}`,
    logoBase64: logoBase64,
    metadata: {
      inspectionNo: data.inspectionNo || data.inspectionId || `INSP-${Date.now().toString(36).toUpperCase()}`,
      inspectionType: data.inspectionType || 'General NSPIRE Inspection',
      escortName: data.escortName || data.property?.contactName || 'TBD',
      propertyType: data.propertyType || 'Multifamily',
      propertyAddress: data.propertyAddress || data.property?.address || '1234 Address Ln',
      propertyName: data.propertyName || data.property?.name || 'pink avenue karachi', // Default per user request
      inspectionStartDate: data.startDate || now.toLocaleDateString(),
      inspectionEndDate: data.endDate || now.toLocaleDateString(),
      reportCreatedDate: now.toLocaleDateString(),

      preliminaryScore: data.preliminaryScore || finalScore,
      calculatedScore: data.calculatedScore || finalScore,
      unitsThreshold: data.unitsThreshold || 0, // Placeholder
      propertyThreshold: data.propertyThreshold || 0, // Placeholder

      inspectorName: data.inspectorName || data.inspector?.fullName || 'Inspector',
      finalScore: data.finalScore || finalScore
    },
    inspectionData: [
      { type: 'Buildings', propertyTotal: data.property?.buildings || 2, sampleSize: 2, totalUnitsInspected: 2 }, // Using user provided sample values or defaults
      { type: 'Units', propertyTotal: data.property?.units || 92, sampleSize: 30, totalUnitsInspected: 24 }
    ],
    deficiencyMatrix,
    deficiencies,
    certificates: [
      { name: 'Elevator Certificate', status: 'Yes - This certificate is provided.', comment: '' },
      { name: 'Boiler Certificate', status: 'N/A - This certificate is not applicable for this property.', comment: '' },
      { name: 'Lead-Based Paint Inspection Report', status: 'N/A - This certificate is not applicable for this property.', comment: '' },
      { name: 'Fire Alarm Inspection Report', status: 'N/A - This certificate cannot be provided or is expired.', comment: '' },
      { name: 'Sprinkler System Certificate', status: 'N/A - This certificate cannot be provided or is expired.', comment: '' },
      { name: 'Lead-Based Paint Disclosure Form', status: 'N/A - This certificate is not applicable for this property.', comment: '' }
    ]
  };
}

/**
 * Generate NSPIRE HTML matching the reference template (test-report-a5.html)
 * Now uses the same format as the enhanced generator for consistency
 */
function generateNSPIREHTML(report, options = {}) {
  const { includeImages = true } = options;

  // Group deficiencies by building/unit for yellow header rows
  const groups = {};
  (report.deficiencies || []).forEach(def => {
    const groupKey = def.unit && def.unit !== 'Multiple' ? `Unit - ${def.unit}` : `Building - ${def.building}`;
    if (!groups[groupKey]) groups[groupKey] = [];
    groups[groupKey].push(def);
  });

  let deficiencyRows = '';
  if (report.deficiencies.length === 0) {
    deficiencyRows = '<tr><td colspan="7" style="text-align:center; padding:20px; font-size:7pt;">No deficiencies found during this inspection.</td></tr>';
  } else {
    Object.keys(groups).forEach(groupName => {
      deficiencyRows += `<tr class="group-header-row"><td colspan="7">${groupName}</td></tr>`;
      groups[groupName].forEach(def => {
        deficiencyRows += `
          <tr class="avoid-break">
            <td class="left-align">${def.deficiencyDetails}</td>
            <td class="left-align"><div class="deficiency-name">${def.deficiencyName || def.nspireCode}</div></td>
            <td class="left-align">${def.comments}</td>
            <td>${includeImages && def.imageUri
              ? `<img src="${def.imageUri}" alt="Deficiency" class="deficiency-image" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" /><div class="image-placeholder" style="display: none;">Photo</div>`
              : `<div class="image-placeholder">Photo</div>`}</td>
            <td>${def.deductionPts}</td>
            <td>${def.repeatIndicator === true || def.repeatIndicator === 'Repeat' ? 'Repeat' : 'Not Repeat'}</td>
            <td>${def.severity}</td>
          </tr>`;
      });
    });
  }

  // Use deficiencyMatrix if available, or build from summary-like structure
  const matrix = report.deficiencyMatrix || {
    inside: { lifeThreatening: 0, severe: 0, moderate: 0, low: 0 },
    outside: { lifeThreatening: 0, severe: 0, moderate: 0, low: 0 },
    units: { lifeThreatening: 0, severe: 0, moderate: 0, low: 0 }
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>NSPIRE - NATIONAL STANDARDS FOR THE PHYSICAL INSPECTION OF REAL ESTATE</title>
  <style>
    @page { size: A5; margin: 15mm 12mm; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: Arial, Helvetica, sans-serif; font-size: 8pt; line-height: 1.3;
      color: #000000; width: 148mm; padding: 12mm 10mm; background: #FFFFFF; margin: 0 auto;
    }
    .report-header { text-align: center; margin-bottom: 15px; }
    .inspire-logo { width: 120px; height: auto; margin: 0 auto 6px; display: block; }
    .header-title {
      font-size: 12pt; font-weight: bold; color: #000000; text-align: center;
      margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.5px;
    }
    .header-metadata { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px; font-size: 7pt; }
    .header-left, .header-right { text-align: left; }
    .header-row { margin-bottom: 2px; display: flex; }
    .header-label { font-weight: bold; display: inline-block; width: 110px; flex-shrink: 0; }
    .header-value { color: #000000; flex: 1; }
    .scores-section { margin: 12px 0; border: 2px solid #000000; padding: 10px; }
    .preliminary-scores { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .score-block { text-align: left; }
    .score-block h3 { font-size: 9pt; font-weight: bold; margin-bottom: 6px; text-decoration: underline; }
    .score-row { display: flex; justify-content: space-between; margin-bottom: 2px; font-size: 7pt; }
    .score-row.bold { font-weight: bold; }
    .score-label { flex: 1; }
    .score-value { font-weight: bold; min-width: 40px; text-align: right; }
    table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 7pt; }
    th { background: #D3D3D3; color: #000000; font-weight: bold; padding: 5px 4px; text-align: center; border: 1px solid #000000; }
    td { padding: 4px; border: 1px solid #000000; vertical-align: top; text-align: center; }
    td.left-align { text-align: left; }
    .section-title { font-size: 9pt; font-weight: bold; margin: 12px 0 6px 0; text-decoration: underline; }
    .group-header-row td {
      background: #FFFF00; font-weight: bold; font-size: 8pt;
      text-align: left; padding: 6px 4px; border: 1px solid #000000;
    }
    .deficiency-image { width: 80px; height: 60px; object-fit: cover; border: 1px solid #000000; display: block; margin: 0 auto; }
    .image-placeholder {
      width: 80px; height: 60px; background: #F5F5F5; border: 1px solid #000000;
      display: flex; align-items: center; justify-content: center; font-size: 7pt; color: #666666; text-align: center; margin: 0 auto;
    }
    .deficiency-name { font-weight: bold; margin-bottom: 2px; }
    .certification-section { margin: 20px 0; padding: 12px; border: 1px solid #000000; }
    .signature-area { display: flex; justify-content: space-between; margin-top: 20px; }
    .signature-line { border-bottom: 1px solid #000000; width: 140px; margin-bottom: 4px; }
    .signature-label { font-size: 7pt; color: #666666; }
    .signature-name { font-size: 8pt; font-weight: bold; margin-top: 4px; }
    .report-footer { margin-top: 20px; text-align: center; font-size: 7pt; color: #666666; border-top: 1px solid #000000; padding-top: 8px; }
    .page-number { text-align: center; font-size: 7pt; margin: 12px 0; font-weight: bold; }
    .avoid-break { page-break-inside: avoid; }
    @media print { body { padding: 0; width: 148mm; } }
  </style>
</head>
<body>
  <div class="report-container">
    <!-- HEADER -->
    <div class="report-header">
      ${report.logoBase64 ? `<img src="${report.logoBase64}" class="inspire-logo" alt="INSPIRE" />` : ''}
      <p style="font-size: 7pt; color: #666; margin-bottom: 10px; text-align: center;">NATIONAL STANDARDS FOR THE PHYSICAL INSPECTION OF REAL ESTATE</p>
      <h1 class="header-title">INSPIRE INSPECTION REPORT</h1>
      <div class="header-metadata">
        <div class="header-left">
          <div class="header-row"><span class="header-label">Inspection No:</span><span class="header-value">${report.metadata.inspectionNo}</span></div>
          <div class="header-row"><span class="header-label">Inspection Type:</span><span class="header-value">${report.metadata.inspectionType}</span></div>
          <div class="header-row"><span class="header-label">Escort Name:</span><span class="header-value">${report.metadata.escortName}</span></div>
          <div class="header-row"><span class="header-label">Property Type:</span><span class="header-value">${report.metadata.propertyType}</span></div>
        </div>
        <div class="header-right">
          <div class="header-row"><span class="header-label">Inspection Start Date:</span><span class="header-value">${report.metadata.inspectionStartDate}</span></div>
          <div class="header-row"><span class="header-label">Inspection End Date:</span><span class="header-value">${report.metadata.inspectionEndDate}</span></div>
          <div class="header-row"><span class="header-label">Report Created Date:</span><span class="header-value">${report.metadata.reportCreatedDate}</span></div>
          <div class="header-row"><span class="header-label">Building:</span><span class="header-value">${report.metadata.building || ''}</span></div>
        </div>
      </div>
    </div>

    <!-- SCORES -->
    <div class="scores-section avoid-break">
      <div class="preliminary-scores">
        <div class="score-block">
          <h3>Preliminary Scores</h3>
          <div class="score-row"><span class="score-label">Preliminary Inspection Score:</span><span class="score-value">${report.metadata.preliminaryScore}</span></div>
          <div class="score-row"><span class="score-label">Calculated Score:</span><span class="score-value">${report.metadata.calculatedScore}</span></div>
          <div class="score-row"><span class="score-label">Units Threshold:</span><span class="score-value">${report.metadata.unitsThreshold}</span></div>
          <div class="score-row"><span class="score-label">Property Threshold:</span><span class="score-value">${report.metadata.propertyThreshold}</span></div>
        </div>
        <div class="score-block">
          <h3>Final Scores</h3>
          <div class="score-row bold"><span class="score-label">Final Inspection Score:</span><span class="score-value">${report.metadata.finalScore}</span></div>
          <div class="score-row"><span class="score-label">Calculated Score:</span><span class="score-value">${report.metadata.calculatedScore}</span></div>
          <div class="score-row"><span class="score-label">Units Threshold:</span><span class="score-value">${report.metadata.unitsThreshold}</span></div>
          <div class="score-row"><span class="score-label">Property Threshold:</span><span class="score-value">${report.metadata.propertyThreshold}</span></div>
        </div>
      </div>
    </div>

    <!-- BUILDING/UNIT INSPECTION DATA -->
    <div class="avoid-break">
      <h3 class="section-title">Building/Unit Inspection Data</h3>
      <table>
        <thead>
          <tr>
            <th rowspan="2" class="left-align">Type</th>
            <th rowspan="2">Property Total</th>
            <th rowspan="2">Sample Size</th>
            <th colspan="1">Inspection</th>
          </tr>
          <tr><th>Total Units Inspected</th></tr>
        </thead>
        <tbody>
          ${report.inspectionData.map(row => `
          <tr>
            <td class="left-align">${row.type}</td>
            <td>${row.propertyTotal}</td>
            <td>${row.sampleSize}</td>
            <td>${row.totalUnitsInspected}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>

    <!-- DEFICIENCY SUMMARY -->
    <div class="avoid-break">
      <h3 class="section-title">Deficiency Summary</h3>
      <table>
        <thead>
          <tr>
            <th class="left-align">Inspectable Area</th>
            <th>Life-Threatening</th>
            <th>Severe</th>
            <th>Moderate</th>
            <th>Low</th>
          </tr>
        </thead>
        <tbody>
          <tr><td class="left-align">Inside</td><td>${matrix.inside.lifeThreatening}</td><td>${matrix.inside.severe}</td><td>${matrix.inside.moderate}</td><td>${matrix.inside.low}</td></tr>
          <tr><td class="left-align">Outside</td><td>${matrix.outside.lifeThreatening}</td><td>${matrix.outside.severe}</td><td>${matrix.outside.moderate}</td><td>${matrix.outside.low}</td></tr>
          <tr><td class="left-align">Units</td><td>${matrix.units.lifeThreatening}</td><td>${matrix.units.severe}</td><td>${matrix.units.moderate}</td><td>${matrix.units.low}</td></tr>
        </tbody>
      </table>
    </div>

    <!-- DEFICIENCY DETAILS -->
    <div>
      <h3 class="section-title">Inspectable Areas Deficiencies</h3>
      <table>
        <thead>
          <tr>
            <th style="width: 18%;">Deficiency Details</th>
            <th style="width: 10%;">Deficiency Name</th>
            <th style="width: 18%;">Comments</th>
            <th style="width: 14%;">Deficiency Picture</th>
            <th style="width: 8%;">Deduction Pts.</th>
            <th style="width: 10%;">Repeat Indicator</th>
            <th style="width: 8%;">Severity</th>
          </tr>
        </thead>
        <tbody>
          ${deficiencyRows}
        </tbody>
      </table>
    </div>

    <!-- CERTIFICATES -->
    <div class="avoid-break">
      <h3 class="section-title">Certificates</h3>
      <table>
        <thead>
          <tr>
            <th class="left-align">Certificate Type</th>
            <th>Status</th>
            <th class="left-align">Comment</th>
          </tr>
        </thead>
        <tbody>
          ${report.certificates.map(cert => `
          <tr>
            <td class="left-align">${cert.name}</td>
            <td>${cert.status}</td>
            <td class="left-align">${cert.comment}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>

    <!-- CERTIFICATION -->
    <div class="certification-section avoid-break">
      <h3 class="section-title">Inspector Certification</h3>
      <p style="margin-bottom: 12px; font-size: 7pt; line-height: 1.4;">I certify this inspection was conducted per INSPIRE standards.</p>
      <div class="signature-area">
        <div>
          <div class="signature-line"></div>
          <div class="signature-label">Inspector Signature</div>
          <div class="signature-name">${report.metadata.inspectorName}</div>
        </div>
        <div>
          <div class="signature-line" style="width: 100px;"></div>
          <div class="signature-label">Date</div>
          <div class="signature-name">${report.metadata.reportCreatedDate}</div>
        </div>
      </div>
    </div>

    <!-- FOOTER -->
    <div class="page-number">--- PAGE 1 ---</div>
    <div class="report-footer">
      <p>Generated by NSPIRE Inspection System</p>
      <p>Report generated on ${new Date().toLocaleDateString()}, ${new Date().toLocaleTimeString()}</p>
      <p style="margin-top: 4px;">This document is confidential and intended for authorized use only.</p>
    </div>
  </div>
</body>
</html>`;
}

// Helpers
function mapCategoryToNSPIRECode(category) {
  // Simple mapping placeholder - expand as needed
  if (!category) return 'GEN-1';
  const c = category.toLowerCase();

  if (c.includes('fire')) return 'HS-12';
  if (c.includes('plumb')) return 'BS-1';
  if (c.includes('elec')) return 'BS-2';
  if (c.includes('safe')) return 'HS-1';

  return 'HS-12';
}

function mapSeverityToNSPIRE(severity) {
  if (!severity) return 'Moderate';
  const s = severity.toLowerCase();
  if (s.includes('life') || s.includes('threatening')) return 'Life-Threatening';
  if (s.includes('severe') || s === 'high') return 'Severe';
  if (s === 'low' || s === 'minor' || s.includes('observation')) return 'Low';
  if (s.includes('mod') || s === 'medium') return 'Moderate';
  return 'Moderate';
}

function calculateDeductionPoints(severity) {
  if (!severity) return 0.0;
  const s = severity.toLowerCase();
  if (s.includes('life') || s.includes('threatening')) return 10.0;
  if (s.includes('severe') || s === 'high') return 6.0;
  if (s.includes('moderate') || s === 'medium') return 3.0;
  if (s === 'low' || s === 'minor' || s.includes('observation')) return 1.0;
  return 0.0;
}

module.exports = {
  generateNSPIREReport,
  generateNSPIREReportBuffer,
  convertToNSPIREFormat,
  generateNSPIREHTML
};