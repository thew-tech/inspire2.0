/**
 * Enhanced NSPIRE PDF Report Generator
 * Generates NSPIRE inspection reports matching the exact format
 * of the reference HTML template (test-report-a5.html)
 */

const puppeteer = require('puppeteer');
const fs = require('fs-extra');
const path = require('path');
const https = require('https');
const http = require('http');

/**
 * Build a clickable data URI link showing the short NSPIRE code;
 * clicking opens a clean HTML page with the full codeReference text.
 */
function makeCodeRefLink(nspireCode, codeReference) {
  const shortCode = (nspireCode || '-').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  if (!codeReference) return shortCode;
  const baseUrl = process.env.BACKEND_URL || 'http://localhost:5005';
  const url = `${baseUrl}/api/code-ref?code=${encodeURIComponent(nspireCode)}&ref=${encodeURIComponent(String(codeReference))}`;
  return `<a href="${url}" style="color:#0E7490;font-weight:600;text-decoration:underline;">${shortCode}</a>`;
}

/**
 * Download an image from a URL and return it as a base64 data URI
 */
async function fetchImageAsBase64(url, timeoutMs = 10000) {
  if (!url || url.trim() === '') return '';
  
  // Already a data URI
  if (url.startsWith('data:')) return url;
  
  // Local file path
  if (url.startsWith('file://') || (!url.startsWith('http://') && !url.startsWith('https://') && !url.includes('://'))) {
    try {
      const filePath = url.replace('file://', '');
      if (fs.existsSync(filePath)) {
        const buffer = fs.readFileSync(filePath);
        const ext = path.extname(filePath).toLowerCase();
        const mimeType = ext === '.png' ? 'image/png' : ext === '.gif' ? 'image/gif' : 'image/jpeg';
        return `data:${mimeType};base64,${buffer.toString('base64')}`;
      }
    } catch (e) {
      console.warn('Failed to read local image:', e.message);
    }
    return '';
  }

  // Remote URL - download and convert to base64
  const maxRetries = 3;
  let attempt = 0;

  const attemptFetch = () => new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const options = { 
      timeout: timeoutMs,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
      }
    };
    
    const request = protocol.get(url, options, (response) => {
      // Follow redirects
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        fetchImageAsBase64(response.headers.location, timeoutMs).then(resolve);
        return;
      }
      
      if (response.statusCode !== 200) {
        reject(new Error(`Image fetch failed with status ${response.statusCode}`));
        return;
      }

      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        try {
          const buffer = Buffer.concat(chunks);
          const contentType = response.headers['content-type'] || 'image/jpeg';
          const mimeType = contentType.split(';')[0].trim();
          resolve(`data:${mimeType};base64,${buffer.toString('base64')}`);
        } catch (e) {
          reject(new Error('Failed to encode image as base64'));
        }
      });
      response.on('error', reject);
    });
    
    request.on('error', reject);
    
    request.on('timeout', () => {
      request.destroy();
      reject(new Error('Image fetch timed out'));
    });
  });

  while (attempt < maxRetries) {
    try {
      return await attemptFetch();
    } catch (err) {
      attempt++;
      console.warn(`Image fetch attempt ${attempt} failed for ${url}: ${err.message}`);
      if (attempt >= maxRetries) return '';
      // Wait before retry
      await new Promise(r => setTimeout(r, 1000 * attempt));
    }
  }
  return '';
}

/**
 * Generate enhanced NSPIRE report matching reference template exactly
 */
async function generateEnhancedNSPIREReport(inspectionData, options = {}) {
  console.log('Starting Enhanced NSPIRE report generation...');

  try {
    // Try Puppeteer first (better quality)
    return await generateWithPuppeteerEnhanced(inspectionData, options);
  } catch (puppeteerError) {
    console.log('Puppeteer failed, falling back to HTML buffer:', puppeteerError.message);
    // Fallback to HTML buffer
    return await generateHTMLBuffer(inspectionData, options);
  }
}

/**
 * Generate PDF using Puppeteer matching reference HTML template
 */
async function generateWithPuppeteerEnhanced(inspectionData, options = {}) {
  const puppeteerConfig = {
    headless: true, // Use the more stable headless mode
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
      '--disable-web-security'
    ]
  };

  // For Vercel/serverless environments
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
    await page.setViewport({ width: 800, height: 1200 });

    // Process the inspection data into enhanced NSPIRE format
    const nspireReport = await convertToEnhancedNSPIREFormat(inspectionData);

    // Generate the enhanced HTML content
    const htmlContent = await generateEnhancedNSPIREHTML(nspireReport, options);

    page.setDefaultNavigationTimeout(120000);
    page.setDefaultTimeout(120000);

    await page.setContent(htmlContent, {
      waitUntil: 'networkidle0', 
      timeout: 90000 
    });

    // Generate PDF as buffer - A5 size to match reference template
    const pdfBuffer = await page.pdf({
      width: '148mm',
      height: '210mm',
      printBackground: true,
      margin: {
        top: '15mm',
        right: '12mm',
        bottom: '15mm',
        left: '12mm'
      }
    });

    console.log(`Enhanced NSPIRE report generated successfully with Puppeteer`);
    return pdfBuffer;

  } catch (error) {
    console.error('Error generating Enhanced NSPIRE report with Puppeteer:', error);
    throw error;
  } finally {
    await browser.close();
  }
}

/**
 * Generate HTML buffer as fallback
 */
async function generateHTMLBuffer(inspectionData, options = {}) {
  try {
    const nspireReport = await convertToEnhancedNSPIREFormat(inspectionData);
    const htmlContent = await generateEnhancedNSPIREHTML(nspireReport, options);
    return Buffer.from(htmlContent, 'utf8');
  } catch (error) {
    console.error('Error in generateHTMLBuffer:', error);
    throw error;
  }
}

const normalizeLabelToken = (value) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '');

const PLACEHOLDER_LABEL_TOKENS = new Set([
  '',
  '-',
  'allunits',
  'allunit',
  'property',
  'building',
  'unknown',
  'null',
  'undefined',
]);

const isPlaceholderLabel = (value) => PLACEHOLDER_LABEL_TOKENS.has(normalizeLabelToken(value));

const firstValidLabel = (values = []) => {
  for (const value of values) {
    const candidate = String(value ?? '').trim();
    if (candidate && !isPlaceholderLabel(candidate)) {
      return candidate;
    }
  }

  return '';
};

const normalizeAreaLabel = (value, fallbackIsUnit = false) => {
  const token = normalizeLabelToken(value);

  if (token.includes('outside') || token.includes('site') || token.includes('exterior')) {
    return 'Outside';
  }
  if (token.includes('inside') || token.includes('interior') || token.includes('common')) {
    return 'Inside';
  }
  if (token.includes('unit')) {
    return 'Units';
  }

  return fallbackIsUnit ? 'Units' : 'Inside';
};

/**
 * Convert inspection data to enhanced NSPIRE format
 */
async function convertToEnhancedNSPIREFormat(data) {
  const now = new Date();

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

  // Convert findings/deficiencies to enhanced NSPIRE format
  const rawDeficiencies = uniqueFindings.map((item, index) => {
    const unitCandidate = firstValidLabel([item.unit, item.unitId, item.unitNumber, item._unit]);
    const area = normalizeAreaLabel(
      item.area || item.inspectionArea || item._area || item.subCategory || item.category || '',
      !!unitCandidate
    );

    const building = firstValidLabel([
      item.buildingInspectionId,
      item.buildingId,
      item.buildingName,
      item.building,
      (area === 'Inside' || area === 'Outside') ? item._unit : '',
      data.buildingInspectionId,
      data.buildingId,
      data.buildingName,
      data.building,
    ]) || 'UNKNOWN-BUILDING';

    const unit = area === 'Units'
      ? (unitCandidate || 'UNSPECIFIED-UNIT')
      : '';

    return {
      id: item.id || item._id || `DEF-${index + 1}`,
      rawImageUri: (function() {
        // DEEP SCAN: Look for anything that looks like a URL in any field
        const possibleFields = ['imageUri', 'imageUrl', 'photo', 'image', 'photos'];
        for (const field of possibleFields) {
          const val = item[field];
          if (typeof val === 'string' && val.startsWith('http')) return val;
          if (Array.isArray(val) && val.length > 0) {
            const first = val[0];
            const url = typeof first === 'string' ? first : (first?.url || first?.uri || '');
            if (url && url.startsWith('http')) return url;
          }
        }
        
        // ULTIMATE FALLBACK: Scan all keys for any string starting with http
        for (const key in item) {
          if (typeof item[key] === 'string' && item[key].startsWith('http')) {
            console.log(`[PDF] Found URL in unexpected field: ${key}`);
            return item[key];
          }
        }
        return '';
      })(),
      building,
      unit,
      room: item.location || item.room || item.area || 'General Area',
      area,
      deficiencyName: item.title || item.deficiencyName || `DEF-${index + 1}`,
      isGeneralComment: !!(item.isGeneralComment),
      nspireCode: item.isGeneralComment ? '-' : (item.nspireCode || mapCategoryToEnhancedNSPIRECode(item.category || item.area)),
      codeReference: item.isGeneralComment ? '' : (item.codeReference || ''),
      deficiencyDetails: item.isGeneralComment ? '-' : (item.description || item.details || item.deficiencyDetails || 'Deficiency observed during inspection'),
      comments: item.notes || item.comments || item.recommendation || '',
      note: item.note || item.notes || '',
      deductionPts: item.isGeneralComment ? '-' : (item.deductionPts || calculateEnhancedDeductionPoints(item.severity)),
      repeatIndicator: item.isGeneralComment ? '-' : (item.repeat ? 'Repeat' : 'Not Repeat'),
      severity: item.isGeneralComment ? '-' : mapSeverityToEnhancedNSPIRE(item.severity),
      inspectedDate: now.toLocaleDateString(),
      inspectedTime: now.toLocaleTimeString(),
      status: item.status || 'Open'
    };
  });

  // Convert all image URLs to base64 data URIs in parallel
  console.log(`[PDF] Processing ${rawDeficiencies.length} deficiency images...`);
  const deficiencies = await Promise.all(
    rawDeficiencies.map(async (def, idx) => {
      let imageUri = '';
      if (def.rawImageUri) {
        console.log(`[PDF] [${idx}] Fetching image: ${def.rawImageUri.substring(0, 100)}${def.rawImageUri.length > 100 ? '...' : ''}`);
        try {
          imageUri = await fetchImageAsBase64(def.rawImageUri);
          if (imageUri && imageUri.startsWith('data:')) {
            console.log(`[PDF] [${idx}] ✅ Successfully converted to base64`);
          } else {
            console.warn(`[PDF] [${idx}] ⚠️ Base64 conversion failed, using fallback URL`);
          }
        } catch (e) {
          console.warn(`[PDF] [${idx}] ❌ Error: ${e.message}`);
        }
      } else {
        console.log(`[PDF] [${idx}] ℹ️ No image URI found for this deficiency`);
      }
      const { rawImageUri, ...rest } = def;
      // If base64 conversion failed, fallback to original URL so Puppeteer can try loading it directly
      return { ...rest, imageUri: imageUri || rawImageUri };
    })
  );
  console.log(`[PDF] Image processing complete. Found images for ${deficiencies.filter(d => d.imageUri).length}/${deficiencies.length} items.`);

  // Calculate enhanced summary statistics
  const summary = {
    lifeThreatening: deficiencies.filter(d => d.severity === 'Life-Threatening').length,
    severe: deficiencies.filter(d => d.severity === 'Severe').length,
    moderate: deficiencies.filter(d => d.severity === 'Moderate').length,
    low: deficiencies.filter(d => d.severity === 'Low').length,
    total: deficiencies.length,
    inside: {
      lifeThreatening: deficiencies.filter(d => d.area === 'Inside' && d.severity === 'Life-Threatening').length,
      severe: deficiencies.filter(d => d.area === 'Inside' && d.severity === 'Severe').length,
      moderate: deficiencies.filter(d => d.area === 'Inside' && d.severity === 'Moderate').length,
      low: deficiencies.filter(d => d.area === 'Inside' && d.severity === 'Low').length,
    },
    outside: {
      lifeThreatening: deficiencies.filter(d => d.area === 'Outside' && d.severity === 'Life-Threatening').length,
      severe: deficiencies.filter(d => d.area === 'Outside' && d.severity === 'Severe').length,
      moderate: deficiencies.filter(d => d.area === 'Outside' && d.severity === 'Moderate').length,
      low: deficiencies.filter(d => d.area === 'Outside' && d.severity === 'Low').length,
    },
    units: {
      lifeThreatening: deficiencies.filter(d => d.area === 'Units' && d.severity === 'Life-Threatening').length,
      severe: deficiencies.filter(d => d.area === 'Units' && d.severity === 'Severe').length,
      moderate: deficiencies.filter(d => d.area === 'Units' && d.severity === 'Moderate').length,
      low: deficiencies.filter(d => d.area === 'Units' && d.severity === 'Low').length,
    }
  };

  // Calculate final score
  const totalDeductions = deficiencies.reduce((sum, def) => sum + (Number(def.deductionPts) || 0), 0);
  const finalScore = Math.max(0, 100 - totalDeductions);

  // Get unique buildings inspected
  const buildings = [...new Set(deficiencies.map(d => d.building).filter(Boolean))];
  const units = [...new Set(deficiencies.map(d => d.unit).filter(Boolean))];
  const buildingName =
    data.buildingInspectionId ||
    data.buildingId ||
    data.building ||
    data.property?.buildingName ||
    buildings[0] ||
    'UNKNOWN-BUILDING';
  const inspectedUnits = data.inspectedUnits || units.join(', ') || 'Unit 001';

  return {
    reportId: `RPT-${Date.now()}`,
    version: '1.0',
    generatedAt: now.toISOString(),

    metadata: {
      inspectionNo: data.inspectionNo || data.inspectionId || data._id || `INSP-${Date.now().toString(36).toUpperCase()}`,
      inspectionType: data.inspectionType || 'General NSPIRE',
      escortName: data.escortName || data.property?.contactName || 'Property Manager',
      propertyType: data.propertyType || 'Multifamily',
      propertyAddress: data.propertyAddress || data.property?.address || '',
      propertyName: data.propertyName || data.property?.name || 'Property Name',
      propertyId: data.propertyId || data.property?._id || 'PROP-001',
      startDate: data.startDate || now.toLocaleDateString(),
      endDate: data.endDate || now.toLocaleDateString(),
      reportCreatedDate: now.toLocaleDateString(),
      building: buildingName,
      inspectedUnits: inspectedUnits,
      preliminaryScore: data.preliminaryScore || finalScore,
      finalScore: data.finalScore || finalScore,
      calculatedScore: data.calculatedScore || finalScore,
      unitsThreshold: data.unitsThreshold || 10.79,
      propertyThreshold: data.propertyThreshold || 60,
      inspectorName: data.inspectorName || data.inspector?.fullName || 'Inspector',
      inspectorId: data.inspectorId || data.inspector?._id || 'INS-001'
    },

    inspectionData: [
      { type: 'Building', propertyTotal: data.property?.buildings || data.buildingCount || 2, sampleSize: data.buildingSampleSize || 1, totalUnitsInspected: data.buildingsInspected || 1 },
      { type: 'Unit', propertyTotal: data.property?.units || data.unitCount || 10, sampleSize: data.unitSampleSize || 1, totalUnitsInspected: data.unitsInspected || 1 }
    ],

    summary,
    deficiencies,

    generalComments: data.notes || data.generalComments || '',
    recommendations: data.recommendations || [],

    certificates: data.certificates || [
      { name: 'Elevator', status: 'N/A', comment: 'No elevator present' },
      { name: 'Boiler', status: 'Current', comment: 'Valid until 2026' },
      { name: 'Lead-Based Paint', status: 'Current', comment: 'Compliant' },
      { name: 'Fire Alarm', status: 'Current', comment: 'Tested monthly' },
      { name: 'Sprinkler', status: 'N/A', comment: 'Not required' }
    ],

    certification: {
      certifiedBy: data.inspectorName || data.inspector?.fullName || 'Inspector',
      certificationDate: now.toLocaleDateString(),
      certificationStatement: 'I certify this inspection was conducted per INSPIRE standards.'
    }
  };
}

/**
 * Generate enhanced NSPIRE HTML matching reference template exactly
 */
async function generateEnhancedNSPIREHTML(report, options = {}) {
  const {
    includeImages = true,
    includeSummaryPage = true,
    includeDetailedDeficiencies = true,
    includeCertification = true
  } = options;

  // Read and convert logo to base64
  let logoBase64 = '';
  try {
    const possiblePaths = [
      path.join(__dirname, '../../frontend/public/logo.png'),
      path.join(__dirname, '../../app/public/logo.png'),
      path.join(__dirname, '../../admin-portal/public/logo.png'),
      path.join(__dirname, '../public/logo.png')
    ];
    for (const logoPath of possiblePaths) {
      if (fs.existsSync(logoPath)) {
        const logoBuffer = fs.readFileSync(logoPath);
        logoBase64 = `data:image/png;base64,${logoBuffer.toString('base64')}`;
        break;
      }
    }
  } catch (error) {
    console.warn('Could not load logo.png:', error.message);
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>NSPIRE - NATIONAL STANDARDS FOR THE PHYSICAL INSPECTION OF REAL ESTATE</title>
  <style>
    @page {
      size: A5;
      margin: 15mm 12mm;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 8pt;
      line-height: 1.3;
      color: #000000;
      width: 148mm;
      padding: 12mm 10mm;
      background: #FFFFFF;
      margin: 0 auto;
    }
    .report-header { text-align: center; margin-bottom: 15px; }
    .inspire-logo { width: 120px; height: auto; margin: 0 auto 6px; display: block; }
    .header-subtitle { font-size: 7pt; color: #666; margin-bottom: 10px; text-align: center; }
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
    th {
      background: #D3D3D3; color: #000000; font-weight: bold;
      padding: 5px 4px; text-align: center; border: 1px solid #000000;
    }
    td { padding: 4px; border: 1px solid #000000; vertical-align: top; text-align: center; }
    td.left-align { text-align: left; }
    .section-title { font-size: 9pt; font-weight: bold; margin: 12px 0 6px 0; text-decoration: underline; }
    .inspection-data-section { margin: 12px 0; }
    .inspection-data-table th { background: #D3D3D3; }
    .inspection-data-table th.multi-row { vertical-align: middle; }
    .deficiency-summary-section { margin: 12px 0; }
    .deficiency-details-section { margin: 12px 0; }
    .deficiency-details-table { font-size: 7pt; }
    .deficiency-details-table th { background: #D3D3D3; font-size: 7pt; padding: 4px 3px; font-weight: bold; }
    .deficiency-details-table td { font-size: 7pt; padding: 3px; vertical-align: top; }
    .building-header-row td {
      background: #111827; color: #FFFFFF; font-weight: bold; font-size: 8pt;
      text-align: left; padding: 7px 5px; border: 1px solid #000000;
    }
    .group-header-row td {
      background: #FFFF00; font-weight: bold; font-size: 8pt;
      text-align: left; padding: 6px 4px; border: 1px solid #000000;
    }
    .unit-header-row td {
      background: #F3F4F6; font-weight: bold; font-size: 7pt;
      text-align: left; padding: 5px 4px; border: 1px solid #000000;
    }
    .deficiency-image {
      width: 80px; height: 60px; object-fit: cover;
      border: 1px solid #000000; display: block; margin: 0 auto;
    }
    .image-placeholder {
      width: 80px; height: 60px; background: #F5F5F5; border: 1px solid #000000;
      display: flex; align-items: center; justify-content: center;
      font-size: 7pt; color: #666666; text-align: center; margin: 0 auto;
    }
    .deficiency-name { font-weight: bold; margin-bottom: 2px; }
    .location-info { font-size: 7pt; line-height: 1.2; }
    .certificates-section { margin: 12px 0; }
    .certificates-table th { background: #D3D3D3; }
    .certification-section { margin: 20px 0; padding: 12px; border: 1px solid #000000; }
    .signature-area { display: flex; justify-content: space-between; margin-top: 20px; }
    .signature-line { border-bottom: 1px solid #000000; width: 140px; margin-bottom: 4px; }
    .signature-label { font-size: 7pt; color: #666666; }
    .signature-name { font-size: 8pt; font-weight: bold; margin-top: 4px; }
    .report-footer {
      margin-top: 20px; text-align: center; font-size: 7pt; color: #666666;
      border-top: 1px solid #000000; padding-top: 8px;
    }
    .page-number { text-align: center; font-size: 7pt; margin: 12px 0; font-weight: bold; }
    .page-break { page-break-after: always; }
    .avoid-break { page-break-inside: avoid; }
    @media print {
      body { padding: 0; width: 148mm; }
      .page-break { page-break-after: always; }
    }
  </style>
</head>
<body>
  <div class="report-container">
    ${generateEnhancedHeader(report.metadata, logoBase64)}
    ${includeSummaryPage ? generateEnhancedSummaryPage(report) : ''}
    ${includeDetailedDeficiencies ? generateEnhancedDeficiencyTable(report.deficiencies, includeImages, report?.metadata?.propertyName || '') : ''}
    ${generateCertificatesTable(report.certificates)}
    ${includeCertification && report.certification ? generateEnhancedCertificationSection(report.certification) : ''}
    ${generateEnhancedFooter()}
  </div>
</body>
</html>`;
}

/**
 * Generate header matching reference template
 */
function generateEnhancedHeader(metadata, logoBase64) {
  return `
    <div class="report-header">
      ${logoBase64 ? `<img src="${logoBase64}" class="inspire-logo" alt="INSPIRE" />` : ''}
      <p class="header-subtitle">NATIONAL STANDARDS FOR THE PHYSICAL INSPECTION OF REAL ESTATE</p>
      <h1 class="header-title">INSPIRE INSPECTION REPORT</h1>

      <div class="header-metadata">
        <div class="header-left">
          <div class="header-row">
            <span class="header-label">Inspection No:</span>
            <span class="header-value">${metadata.inspectionNo}</span>
          </div>
          <div class="header-row">
            <span class="header-label">Inspection Type:</span>
            <span class="header-value">${metadata.inspectionType}</span>
          </div>
          <div class="header-row">
            <span class="header-label">Escort Name:</span>
            <span class="header-value">${metadata.escortName}</span>
          </div>
          <div class="header-row">
            <span class="header-label">Property Type:</span>
            <span class="header-value">${metadata.propertyType}</span>
          </div>
        </div>

        <div class="header-right">
          <div class="header-row">
            <span class="header-label">Inspection Start Date:</span>
            <span class="header-value">${metadata.startDate}</span>
          </div>
          <div class="header-row">
            <span class="header-label">Inspection End Date:</span>
            <span class="header-value">${metadata.endDate}</span>
          </div>
          <div class="header-row">
            <span class="header-label">Report Created Date:</span>
            <span class="header-value">${metadata.reportCreatedDate}</span>
          </div>
          <div class="header-row">
            <span class="header-label">Building:</span>
            <span class="header-value">${metadata.building || ''}</span>
          </div>
          <div class="header-row">
            <span class="header-label">Inspected Units:</span>
            <span class="header-value">${metadata.inspectedUnits || ''}</span>
          </div>
        </div>
      </div>
    </div>`;
}

/**
 * Generate summary page matching reference template
 */
function generateEnhancedSummaryPage(report) {
  return `
    <!-- SCORES SECTION -->
    <div class="scores-section avoid-break">
      <div class="preliminary-scores">
        <div class="score-block">
          <h3>Preliminary Scores</h3>
          <div class="score-row">
            <span class="score-label">Preliminary Inspection Score:</span>
            <span class="score-value">${report.metadata.preliminaryScore}</span>
          </div>
          <div class="score-row">
            <span class="score-label">Calculated Score:</span>
            <span class="score-value">${report.metadata.calculatedScore}</span>
          </div>
          <div class="score-row">
            <span class="score-label">Units Threshold:</span>
            <span class="score-value">${report.metadata.unitsThreshold}</span>
          </div>
          <div class="score-row">
            <span class="score-label">Property Threshold:</span>
            <span class="score-value">${report.metadata.propertyThreshold}</span>
          </div>
        </div>
        <div class="score-block">
          <h3>Final Scores</h3>
          <div class="score-row bold">
            <span class="score-label">Final Inspection Score:</span>
            <span class="score-value">${report.metadata.finalScore}</span>
          </div>
          <div class="score-row">
            <span class="score-label">Calculated Score:</span>
            <span class="score-value">${report.metadata.calculatedScore}</span>
          </div>
          <div class="score-row">
            <span class="score-label">Units Threshold:</span>
            <span class="score-value">${report.metadata.unitsThreshold}</span>
          </div>
          <div class="score-row">
            <span class="score-label">Property Threshold:</span>
            <span class="score-value">${report.metadata.propertyThreshold}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- BUILDING/UNIT INSPECTION DATA -->
    <div class="inspection-data-section avoid-break">
      <h3 class="section-title">Building/Unit Inspection Data</h3>
      <table class="inspection-data-table">
        <thead>
          <tr>
            <th rowspan="2" class="left-align multi-row">Type</th>
            <th rowspan="2" class="multi-row">Property Total</th>
            <th rowspan="2" class="multi-row">Sample Size</th>
            <th colspan="1">Inspection</th>
          </tr>
          <tr>
            <th>Total Units Inspected</th>
          </tr>
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
    <div class="deficiency-summary-section avoid-break">
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
          <tr>
            <td class="left-align">Inside</td>
            <td>${report.summary.inside.lifeThreatening}</td>
            <td>${report.summary.inside.severe}</td>
            <td>${report.summary.inside.moderate}</td>
            <td>${report.summary.inside.low}</td>
          </tr>
          <tr>
            <td class="left-align">Outside</td>
            <td>${report.summary.outside.lifeThreatening}</td>
            <td>${report.summary.outside.severe}</td>
            <td>${report.summary.outside.moderate}</td>
            <td>${report.summary.outside.low}</td>
          </tr>
          <tr>
            <td class="left-align">Units</td>
            <td>${report.summary.units.lifeThreatening}</td>
            <td>${report.summary.units.severe}</td>
            <td>${report.summary.units.moderate}</td>
            <td>${report.summary.units.low}</td>
          </tr>
        </tbody>
      </table>
    </div>`;
}

/**
 * Generate deficiency table grouped by building first,
 * then section headings (Outside / Inside / Units / General Comment).
 */
function generateEnhancedDeficiencyTable(deficiencies, includeImages, propertyName = '') {
  if (deficiencies.length === 0) {
    return `
      <div class="deficiency-details-section">
        <h3 class="section-title">Inspectable Areas Deficiencies</h3>
        <p style="text-align: center; padding: 20px; font-size: 7pt;">No deficiencies found during this inspection.</p>
      </div>`;
  }

  const normalizeUnitLabel = (value) =>
    String(value ?? '')
      .trim()
      .replace(/\s*\/\s*building\s*-\s*[^/]+/gi, '')
      .replace(/\s*\(\s*building\s*-\s*[^)]+\)/gi, '')
      .replace(/^\s*building\s*-\s*/i, '')
      .trim();

  const formatUnitHeading = (value) => {
    const normalized = normalizeUnitLabel(value);
    if (!normalized || isPlaceholderLabel(normalized)) return 'Unit 001';
    return /^unit[\s_-]*/i.test(normalized) ? normalized : `Unit ${normalized}`;
  };

  const resolveAreaBucket = (def) => {
    if (def.isGeneralComment) return 'GeneralComment';

    const areaToken = normalizeLabelToken(def.area);
    if (areaToken.includes('outside') || areaToken.includes('site') || areaToken.includes('exterior')) return 'Outside';
    if (areaToken.includes('inside') || areaToken.includes('interior') || areaToken.includes('common')) return 'Inside';
    if (areaToken.includes('unit')) return 'Units';

    const unitLabel = normalizeUnitLabel(def.unit);
    if (unitLabel && !isPlaceholderLabel(unitLabel) && normalizeLabelToken(unitLabel) !== normalizeLabelToken(def.building)) {
      return 'Units';
    }

    return 'Inside';
  };

  const renderDeficiencyRow = (def) => {
    const isGC = !!def.isGeneralComment;

    return `
          <tr class="avoid-break">
            <td class="left-align">${isGC ? '-' : def.deficiencyDetails}</td>
            <td class="left-align" style="text-align:center;vertical-align:middle;">${isGC ? '-' : makeCodeRefLink(def.nspireCode, def.codeReference)}</td>
            <td>${includeImages && def.imageUri
              ? `<img src="${def.imageUri}" alt="Deficiency" class="deficiency-image" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" /><div class="image-placeholder" style="display: none;">Photo</div>`
              : `<div class="image-placeholder">Photo</div>`}</td>
            <td>${isGC ? '-' : def.deductionPts}</td>
            <td>${isGC ? '-' : def.repeatIndicator}</td>
            <td>${isGC ? '-' : def.severity}</td>
            <td class="left-align">${def.note || '-'}</td>
          </tr>`;
  };

  const normalizedPropertyName = String(propertyName || '').trim();
  const propertySuffix = normalizedPropertyName ? ` / ${normalizedPropertyName}` : '';

  const buildingMap = new Map();
  deficiencies.forEach((def) => {
    const buildingLabel = firstValidLabel([def.buildingInspectionId, def.buildingId, def.building]) || 'B1';
    const areaBucket = resolveAreaBucket(def);

    if (!buildingMap.has(buildingLabel)) {
      buildingMap.set(buildingLabel, {
        Outside: [],
        Inside: [],
        Units: [],
        GeneralComment: [],
      });
    }

    buildingMap.get(buildingLabel)[areaBucket].push(def);
  });

  const buildingOrder = Array.from(buildingMap.keys()).sort((a, b) => a.localeCompare(b));
  const sectionOrder = ['Outside', 'Inside', 'Units', 'GeneralComment'];

  let rows = '';
  buildingOrder.forEach((buildingLabel) => {
    const sections = buildingMap.get(buildingLabel);
    sectionOrder.forEach((sectionName) => {
      const sectionItems = sections[sectionName] || [];
      if (sectionItems.length === 0) return;

      if (sectionName === 'Units') {
        const unitMap = new Map();
        sectionItems.forEach((def) => {
          const unitLabel = normalizeUnitLabel(def.unit);
          const unitKey = firstValidLabel([unitLabel]) || '001';
          if (!unitMap.has(unitKey)) {
            unitMap.set(unitKey, []);
          }
          unitMap.get(unitKey).push(def);
        });

        Array.from(unitMap.keys()).sort((a, b) => a.localeCompare(b)).forEach((unitKey) => {
          rows += `
          <tr class="group-header-row">
            <td colspan="7">${formatUnitHeading(unitKey)} - ${buildingLabel}${propertySuffix}</td>
          </tr>`;

          unitMap.get(unitKey).forEach((def) => {
            rows += renderDeficiencyRow(def);
          });
        });

        return;
      }

      const sectionLabel = sectionName === 'GeneralComment'
        ? `General Comment - ${buildingLabel}${propertySuffix}`
        : `${sectionName} - ${buildingLabel}${propertySuffix}`;
      rows += `
          <tr class="group-header-row">
            <td colspan="7">${sectionLabel}</td>
          </tr>`;

      sectionItems.forEach((def) => {
        rows += renderDeficiencyRow(def);
      });
    });
  });

  return `
    <div class="deficiency-details-section">
      <h3 class="section-title">Inspectable Areas Deficiencies</h3>
      <table class="deficiency-details-table">
        <thead>
          <tr>
            <th style="width: 22%;">Deficiency Details</th>
            <th style="width: 10%;">Code of Reference</th>
            <th style="width: 15%;">Deficiency Picture</th>
            <th style="width: 9%;">Deduction Pts.</th>
            <th style="width: 10%;">Repeat Indicator</th>
            <th style="width: 8%;">Severity</th>
            <th style="width: 12%;">Note</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>`;
}

/**
 * Generate certificates table
 */
function generateCertificatesTable(certificates) {
  return `
    <div class="certificates-section avoid-break">
      <h3 class="section-title">Certificates</h3>
      <table class="certificates-table">
        <thead>
          <tr>
            <th class="left-align">Certificate Type</th>
            <th>Status</th>
            <th class="left-align">Comment</th>
          </tr>
        </thead>
        <tbody>
          ${certificates.map(cert => `
          <tr>
            <td class="left-align">${cert.name}</td>
            <td>${cert.status}</td>
            <td class="left-align">${cert.comment}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

/**
 * Generate certification section
 */
function generateEnhancedCertificationSection(certification) {
  return `
    <div class="certification-section avoid-break">
      <h3 class="section-title">Inspector Certification</h3>
      <p style="margin-bottom: 12px; font-size: 7pt; line-height: 1.4;">
        ${certification.certificationStatement}
      </p>
      <div class="signature-area">
        <div>
          <div class="signature-line"></div>
          <div class="signature-label">Inspector Signature</div>
          <div class="signature-name">${certification.certifiedBy}</div>
        </div>
        <div>
          <div class="signature-line" style="width: 100px;"></div>
          <div class="signature-label">Date</div>
          <div class="signature-name">${certification.certificationDate}</div>
        </div>
      </div>
    </div>`;
}

/**
 * Generate footer
 */
function generateEnhancedFooter() {
  const now = new Date();
  return `
    <div class="page-number">--- PAGE 1 ---</div>
    <div class="report-footer">
      <p>Generated by NSPIRE Inspection System</p>
      <p>Report generated on ${now.toLocaleDateString()}, ${now.toLocaleTimeString()}</p>
      <p style="margin-top: 4px;">This document is confidential and intended for authorized use only.</p>
    </div>`;
}

// Helper functions
function mapCategoryToEnhancedNSPIRECode(category) {
  const mapping = {
    'structural': 'BE-3',
    'electrical': 'BS-2',
    'plumbing': 'BS-1',
    'safety': 'HS-12',
    'hvac': 'BS-5',
    'exterior': 'BE-6',
    'interior': 'U-16',
    'appliances': 'U-10',
    'site': 'S-2',
    'building': 'BE-6',
    'unit': 'U-16',
    'common': 'CA-5'
  };
  return mapping[category?.toLowerCase()] || 'HS-12';
}

function mapSeverityToEnhancedNSPIRE(severity) {
  const mapping = {
    'critical': 'Life-Threatening',
    'life-threatening': 'Life-Threatening',
    'life threatening': 'Life-Threatening',
    'lifethreatening': 'Life-Threatening',
    'major': 'Severe',
    'severe': 'Severe',
    'high': 'Severe',
    'medium': 'Moderate',
    'moderate': 'Moderate',
    'minor': 'Low',
    'low': 'Low',
    'observation': 'Low'
  };
  return mapping[severity?.toLowerCase()] || 'Moderate';
}

function calculateEnhancedDeductionPoints(severity) {
  const points = {
    'critical': 10,
    'life-threatening': 10,
    'life threatening': 10,
    'lifethreatening': 10,
    'major': 6,
    'severe': 6,
    'high': 6,
    'medium': 3,
    'moderate': 3,
    'minor': 1,
    'low': 1,
    'observation': 1
  };
  return points[severity?.toLowerCase()] || 3;
}

module.exports = {
  generateEnhancedNSPIREReport,
  convertToEnhancedNSPIREFormat,
  generateEnhancedNSPIREHTML
};