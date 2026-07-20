// Puppeteer moved to local scope in generateNSPIREReport for Vercel compatibility
const fs = require('fs-extra');
const path = require('path');
const https = require('https');
const http = require('http');

// Inline base64 logo - always available regardless of deployment
let LOGO_BASE64_FALLBACK = '';
try { LOGO_BASE64_FALLBACK = require('./logoBase64'); } catch (e) { /* logo file not found */ }

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
 * Generate comprehensive NSPIRE inspection report
 * Creates a professional, HUD-compliant PDF report with all required sections
 */
async function generateNSPIREReport(inspectionData, options = {}) {
    console.log('Starting NSPIRE report generation...');

    let browser;
    try {
        const chromium = require("@sparticuz/chromium");
        const puppeteer = require("puppeteer");

        // Enhanced Chromium configuration for serverless environments
        const chromiumArgs = [
            ...chromium.args,
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu',
            '--disable-web-security',
            '--disable-features=VizDisplayCompositor',
            '--disable-extensions',
            '--disable-plugins',
            '--virtual-time-budget=30000'
        ];

        browser = await puppeteer.launch({
            args: chromiumArgs,
            defaultViewport: chromium.defaultViewport,
            executablePath: await chromium.executablePath(),
            headless: chromium.headless,
            ignoreHTTPSErrors: true,
            timeout: 30000
        });

        const page = await browser.newPage();

        // Set page format for professional report
        await page.setViewport({ width: 1200, height: 1600 });

        // Generate the complete HTML content
        const htmlContent = await generateNSPIREHTML(inspectionData, options);

        await page.setContent(htmlContent, {
            waitUntil: 'networkidle0',
            timeout: 30000
        });

        // Ensure reports directory exists
        const reportDir = path.join(__dirname, '../reports');
        await fs.ensureDir(reportDir);

        // Generate filename with inspection details
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const reportPath = path.join(reportDir, `INSPIRE_Report_${inspectionData.inspectionNo || inspectionData._id}_${timestamp}.pdf`);

        // Generate PDF
        await page.pdf({
            path: reportPath,
            format: 'Letter',
            printBackground: true,
            margin: { top: '0.5in', right: '0.5in', bottom: '0.5in', left: '0.5in' }
        });

        console.log(`NSPIRE report generated successfully: ${reportPath}`);
        return reportPath;

    } catch (error) {
        console.error('Error generating NSPIRE report:', error);
        
        // Fallback to html-pdf if Puppeteer fails
        try {
            console.log('Attempting fallback to html-pdf...');
            const pdf = require('html-pdf');
            const htmlContent = await generateNSPIREHTML(inspectionData, options);
            
            const reportDir = path.join(__dirname, '../reports');
            await fs.ensureDir(reportDir);
            
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const reportPath = path.join(reportDir, `INSPIRE_Report_${inspectionData.inspectionNo || inspectionData._id}_${timestamp}.pdf`);
            
            return new Promise((resolve, reject) => {
                pdf.create(htmlContent, { 
                    format: 'Letter',
                    border: {
                        top: "0.5in",
                        right: "0.5in", 
                        bottom: "0.5in",
                        left: "0.5in"
                    }
                }).toFile(reportPath, (err, res) => {
                    if (err) {
                        console.error('html-pdf fallback failed:', err);
                        resolve(null);
                    } else {
                        console.log(`Fallback report generated: ${reportPath}`);
                        resolve(reportPath);
                    }
                });
            });
            
        } catch (fallbackError) {
            console.error('Fallback pdf generation failed:', fallbackError);
            return null;
        }
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

/**
 * Generate complete NSPIRE HTML report
 */
async function generateNSPIREHTML(data, options = {}) {
    const {
        includeImages = true,
        includeSummary = true,
        includeDeficiencies = true,
        includeCertification = true
    } = options;

    // Process and structure the data
    const reportData = await processInspectionData(data);

    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>INSPIRE Inspection Report - ${reportData.inspectionNo}</title>
    <style>${getNSPIREStyles()}</style>
</head>
<body>
    <div class="report-container">
        ${generateReportHeader(reportData)}
        ${generateScoresSummary(reportData)}
        ${includeSummary ? generateDeficiencySummary(reportData) : ''}
        ${generateInspectionDataTable(reportData)}
        ${generateOccupancySection(reportData)}
        ${includeDeficiencies ? generateDeficiencyDetailTable(reportData, includeImages) : ''}
        ${reportData.generalComments ? generateCommentsSection(reportData.generalComments) : ''}
        ${reportData.recommendations?.length ? generateRecommendationsSection(reportData.recommendations) : ''}
        ${includeCertification ? generateCertificationSection(reportData) : ''}
        ${generateReportFooter()}
    </div>
</body>
</html>`;
}

/**
 * Process raw inspection data into NSPIRE format
 */
async function processInspectionData(data) {
    const now = new Date();

    // Load logo as base64
    let logoBase64 = '';
    try {
        // Try local file paths first
        const localPaths = [
            path.resolve(__dirname, '../public/logo.png'),
            path.resolve(__dirname, '../../frontend/public/logo.png'),
            path.resolve(__dirname, '../../app/public/logo.png'),
        ];
        for (const lp of localPaths) {
            if (fs.existsSync(lp)) {
                const buf = fs.readFileSync(lp);
                logoBase64 = `data:image/png;base64,${buf.toString('base64')}`;
                console.log('[reportGenerator] Logo loaded from local path:', lp);
                break;
            }
        }
        // If no local file found, try fetching from deployed frontend
        if (!logoBase64) {
            try {
                const fetched = await fetchImageAsBase64('https://nspire-five.vercel.app/logo.png', 8000);
                if (fetched && fetched.startsWith('data:')) {
                    logoBase64 = fetched;
                    console.log('[reportGenerator] Logo fetched from frontend URL');
                }
            } catch (e) { /* ignore */ }
        }
        // Final fallback: use the inline base64 module
        if (!logoBase64 && LOGO_BASE64_FALLBACK) {
            logoBase64 = LOGO_BASE64_FALLBACK;
            console.log('[reportGenerator] Logo loaded from inline base64 fallback');
        }
    } catch (e) {
        console.warn('Could not load logo for report:', e.message);
        if (LOGO_BASE64_FALLBACK) logoBase64 = LOGO_BASE64_FALLBACK;
    }

    // Convert findings/deficiencies to NSPIRE format
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

    const rawDeficiencies = uniqueFindings.map((item, index) => ({
        id: item.id || `DEF-${index + 1}`,
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

    // Convert all image URLs to base64 data URIs
    console.log(`[reportGenerator] Converting ${rawDeficiencies.length} deficiency images to base64...`);
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
    console.log(`[reportGenerator] Image conversion complete. ${deficiencies.filter(d => d.imageUri).length}/${deficiencies.length} converted.`);

    // Calculate summary statistics
    const summary = {
        lifeThreatening: deficiencies.filter(d => d.severity === 'Life-Threatening').length,
        severe: deficiencies.filter(d => d.severity === 'Severe').length,
        moderate: deficiencies.filter(d => d.severity === 'Moderate').length,
        low: deficiencies.filter(d => d.severity === 'Low').length,
        total: deficiencies.length,
        repeatDeficiencies: deficiencies.filter(d => d.repeatIndicator).length,
        newDeficiencies: deficiencies.filter(d => !d.repeatIndicator).length
    };

    // Calculate final score
    const totalDeductions = deficiencies.reduce((sum, def) => sum + def.deductionPts, 0);
    const finalScore = Math.max(0, 100 - totalDeductions);

    return {
        // Report metadata
        inspectionNo: data.inspectionNo || data.inspectionId || `INSP-${Date.now().toString(36).toUpperCase()}`,
        inspectionType: data.inspectionType || 'General NSPIRE',

        // Property information
        propertyName: data.propertyName || data.property?.name || 'Property Name',
        propertyAddress: data.propertyAddress || data.property?.address || 'Property Address',
        propertyId: data.propertyId || data.property?._id || 'PROP-001',

        // Inspector information
        inspectorName: data.inspectorName || data.inspector?.fullName || 'Inspector',
        inspectorId: data.inspectorId || data.inspector?._id || 'INS-001',
        escortName: data.escortName || data.property?.contactName || 'Property Manager',

        // Building/Unit names (from inspector edits)
        buildingName: data.building || data.buildingName || 'A',
        unitNames: data.unitNames || {},

        // Logo
        logoBase64,

        // Timeline
        startDate: data.startDate || now.toLocaleDateString(),
        startTime: data.startTime || '09:00 AM',
        endDate: data.endDate || now.toLocaleDateString(),
        endTime: data.endTime || now.toLocaleTimeString(),
        reportCreatedDate: now.toLocaleDateString(),

        // Scores
        preliminaryScore: data.preliminaryScore || finalScore,
        calculatedScore: data.calculatedScore || finalScore,
        finalScore: data.finalScore || finalScore,
        complianceScore: data.complianceScore || finalScore,

        // Thresholds
        healthSafetyThreshold: 60,
        physicalConditionThreshold: 60,

        // Inspection data
        inspectionData: [
            { type: 'Building', propertyTotal: data.property?.buildings || 1, sampleSize: 1, totalUnitsInspected: 1 },
            { type: 'Unit', propertyTotal: data.property?.units || 1, sampleSize: 1, totalUnitsInspected: 1 },
            { type: 'Site', propertyTotal: 1, sampleSize: 1, totalUnitsInspected: 1 },
            { type: 'Common Area', propertyTotal: 1, sampleSize: 1, totalUnitsInspected: 1 }
        ],

        // Occupancy
        occupancyInfo: {
            totalUnits: data.property?.units || 1,
            occupiedUnits: data.property?.occupiedUnits || data.property?.units || 1,
            vacantUnits: data.property?.vacantUnits || 0,
            occupancyRate: data.property?.occupancyRate || 100
        },

        // Deficiencies and summary
        deficiencies,
        summary,

        // Additional information
        generalComments: data.notes || data.generalComments || '',
        recommendations: data.recommendations || [],

        // Certification
        certification: {
            certifiedBy: data.inspectorName || 'Inspector',
            certificationDate: now.toLocaleDateString(),
            certificationStatement: 'I certify that this inspection was conducted in accordance with HUD NSPIRE protocols and that the findings documented in this report accurately reflect the conditions observed during the inspection.'
        }
    };
}

/**
 * Map category to NSPIRE code
 */
function mapCategoryToNSPIRECode(category) {
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

/**
 * Map severity to NSPIRE standard
 */
function mapSeverityToNSPIRE(severity) {
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

/**
 * Calculate deduction points based on severity
 */
function calculateDeductionPoints(severity) {
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

/**
 * Generate NSPIRE CSS Styles
 */
function getNSPIREStyles() {
    return `
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Helvetica Neue', Arial, sans-serif;
            font-size: 10pt;
            line-height: 1.4;
            color: #1F2937;
            background: #FFFFFF;
        }
        
        .report-container {
            max-width: 100%;
            margin: 0 auto;
            padding: 20px;
        }
        
        .report-header {
            border-bottom: 3px solid #0E7490;
            padding-bottom: 15px;
            margin-bottom: 20px;
        }
        
        .header-title {
            font-size: 18pt;
            font-weight: bold;
            color: #0E7490;
            text-align: center;
            margin-bottom: 10px;
        }
        
        .section-title {
            font-size: 14pt;
            font-weight: bold;
            color: #0E7490;
            margin: 20px 0 10px 0;
            border-bottom: 2px solid #0E7490;
            padding-bottom: 5px;
        }
        
        table {
            width: 100%;
            border-collapse: collapse;
            margin: 15px 0;
        }
        
        th, td {
            border: 1px solid #ddd;
            padding: 8px;
            text-align: left;
        }
        
        th {
            background-color: #0E7490;
            color: white;
            font-weight: bold;
        }
        
        tr:nth-child(even) {
            background-color: #f9f9f9;
        }
        
        .deficiency-image {
            max-width: 100px;
            max-height: 75px;
            object-fit: cover;
        }
        
        .severity-critical {
            background-color: #dc2626;
            color: white;
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 8pt;
        }
        
        .severity-major {
            background-color: #f59e0b;
            color: white;
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 8pt;
        }
        
        .severity-minor {
            background-color: #3b82f6;
            color: white;
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 8pt;
        }
        
        .severity-low {
            background-color: #6b7280;
            color: white;
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 8pt;
        }
        
        .comments-section {
            background: #f9fafb;
            padding: 15px;
            border-radius: 8px;
            margin: 20px 0;
            border-left: 4px solid #0E7490;
        }
        
        .footer {
            margin-top: 30px;
            padding-top: 15px;
            border-top: 1px solid #e5e7eb;
            text-align: center;
            font-size: 8pt;
            color: #9ca3af;
        }
    `;
}

// Placeholder functions for HTML generation
function generateReportHeader(data) {
    return `
        <div class="report-header">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;">
                ${data.logoBase64 ? `<img src="${data.logoBase64}" style="height: 60px; object-fit: contain;" alt="Logo" />` : ''}
                <h1 class="header-title" style="flex: 1; text-align: center; margin: 0;">INSPIRE INSPECTION REPORT</h1>
                ${data.logoBase64 ? '<div style="width: 60px;"></div>' : ''}
            </div>
            <table style="width: 100%; border: none; margin-top: 10px;">
                <tr style="border: none;">
                    <td style="border: none; padding: 4px 8px;"><strong>Property:</strong> ${data.propertyName}</td>
                    <td style="border: none; padding: 4px 8px;"><strong>Inspector:</strong> ${data.inspectorName}</td>
                </tr>
                <tr style="border: none;">
                    <td style="border: none; padding: 4px 8px;"><strong>Address:</strong> ${data.propertyAddress}</td>
                    <td style="border: none; padding: 4px 8px;"><strong>Date:</strong> ${data.reportCreatedDate}</td>
                </tr>
                <tr style="border: none;">
                    <td style="border: none; padding: 4px 8px;"><strong>Building:</strong> ${data.buildingName}</td>
                    <td style="border: none; padding: 4px 8px;"><strong>Inspection ID:</strong> ${data.inspectionNo}</td>
                </tr>
            </table>
        </div>
    `;
}

function generateScoresSummary(data) {
    return `
        <div class="section">
            <h2 class="section-title">Inspection Scores</h2>
            <p><strong>Final Score:</strong> ${data.finalScore}%</p>
            <p><strong>Status:</strong> ${data.finalScore >= 60 ? 'PASS' : 'FAIL'}</p>
        </div>
    `;
}

function generateDeficiencySummary(data) {
    return `
        <div class="section">
            <h2 class="section-title">Deficiency Summary</h2>
            <p><strong>Total Deficiencies:</strong> ${data.summary.total}</p>
            <p><strong>Life-Threatening:</strong> ${data.summary.lifeThreatening}</p>
            <p><strong>Severe:</strong> ${data.summary.severe}</p>
            <p><strong>Moderate:</strong> ${data.summary.moderate}</p>
            <p><strong>Low:</strong> ${data.summary.low}</p>
        </div>
    `;
}

function generateInspectionDataTable(data) {
    return `
        <div class="section">
            <h2 class="section-title">Inspection Data</h2>
            <table>
                <thead>
                    <tr>
                        <th>Type</th>
                        <th>Property Total</th>
                        <th>Sample Size</th>
                        <th>Units Inspected</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.inspectionData.map(row => `
                        <tr>
                            <td>${row.type}</td>
                            <td>${row.propertyTotal}</td>
                            <td>${row.sampleSize}</td>
                            <td>${row.totalUnitsInspected}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

function generateOccupancySection(data) {
    return `
        <div class="section">
            <h2 class="section-title">Occupancy Information</h2>
            <p><strong>Total Units:</strong> ${data.occupancyInfo.totalUnits}</p>
            <p><strong>Occupied Units:</strong> ${data.occupancyInfo.occupiedUnits}</p>
            <p><strong>Vacant Units:</strong> ${data.occupancyInfo.vacantUnits}</p>
            <p><strong>Occupancy Rate:</strong> ${data.occupancyInfo.occupancyRate}%</p>
        </div>
    `;
}

function generateDeficiencyDetailTable(data, includeImages) {
    if (data.deficiencies.length === 0) {
        return `
            <div class="section">
                <h2 class="section-title">Deficiency Details</h2>
                <p style="text-align: center; color: #10b981; font-weight: bold;">✓ No deficiencies found</p>
            </div>
        `;
    }

    return `
        <div class="section">
            <h2 class="section-title">Deficiency Details</h2>
            ${data.deficiencies.map((def, idx) => `
                <div style="border: 1px solid #ddd; border-radius: 8px; margin-bottom: 16px; overflow: hidden; page-break-inside: avoid;">
                    <div style="background: #0E7490; color: white; padding: 8px 12px; font-weight: bold; font-size: 10pt;">
                        #${idx + 1} — ${def.deficiencyName} <span style="float: right; font-size: 9pt;">${def.nspireCode}</span>
                    </div>
                    <div style="display: flex; padding: 12px; gap: 16px;">
                        ${includeImages && def.imageUri ? `
                            <div style="flex-shrink: 0;">
                                <img src="${def.imageUri}" style="width: 180px; height: 135px; object-fit: cover; border-radius: 6px; border: 1px solid #e5e7eb;" alt="Deficiency" />
                            </div>
                        ` : ''}
                        <div style="flex: 1;">
                            <table style="width: 100%; border: none; font-size: 9pt;">
                                <tr style="border: none;">
                                    <td style="border: none; padding: 3px 6px; width: 120px; font-weight: bold; color: #6b7280;">Building</td>
                                    <td style="border: none; padding: 3px 6px;">${def.building}</td>
                                    <td style="border: none; padding: 3px 6px; width: 120px; font-weight: bold; color: #6b7280;">Unit</td>
                                    <td style="border: none; padding: 3px 6px;">${def.unit}</td>
                                </tr>
                                <tr style="border: none;">
                                    <td style="border: none; padding: 3px 6px; font-weight: bold; color: #6b7280;">Location</td>
                                    <td style="border: none; padding: 3px 6px;">${def.room}</td>
                                    <td style="border: none; padding: 3px 6px; font-weight: bold; color: #6b7280;">Severity</td>
                                    <td style="border: none; padding: 3px 6px;"><span class="severity-${def.severity.toLowerCase().replace('-', '').replace(' ', '')}" style="background-color: ${def.severity === 'Life-Threatening' ? '#dc2626' : def.severity === 'Severe' ? '#f59e0b' : def.severity === 'Moderate' ? '#3b82f6' : '#6b7280'}; color: white; padding: 2px 8px; border-radius: 3px; font-size: 8pt;">${def.severity}</span></td>
                                </tr>
                                <tr style="border: none;">
                                    <td style="border: none; padding: 3px 6px; font-weight: bold; color: #6b7280;">Deduction</td>
                                    <td style="border: none; padding: 3px 6px; color: #dc2626; font-weight: bold;">-${def.deductionPts} pts</td>
                                    <td style="border: none; padding: 3px 6px; font-weight: bold; color: #6b7280;">Status</td>
                                    <td style="border: none; padding: 3px 6px;">${def.status}</td>
                                </tr>
                            </table>
                            ${def.deficiencyDetails ? `<div style="margin-top: 8px; padding: 8px; background: #f9fafb; border-radius: 4px; font-size: 9pt;"><strong>Details:</strong> ${def.deficiencyDetails}</div>` : ''}
                            ${def.comments ? `<div style="margin-top: 4px; padding: 8px; background: #f9fafb; border-radius: 4px; font-size: 9pt;"><strong>Notes:</strong> ${def.comments}</div>` : ''}
                        </div>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

function generateCommentsSection(comments) {
    return `
        <div class="comments-section">
            <h2 class="section-title">General Comments</h2>
            <p>${comments}</p>
        </div>
    `;
}

function generateRecommendationsSection(recommendations) {
    return `
        <div class="section">
            <h2 class="section-title">Recommendations</h2>
            <ul>
                ${recommendations.map(rec => `<li>${rec}</li>`).join('')}
            </ul>
        </div>
    `;
}

function generateCertificationSection(data) {
    return `
        <div class="section">
            <h2 class="section-title">Certification</h2>
            <p>${data.certification.certificationStatement}</p>
            <p><strong>Certified By:</strong> ${data.certification.certifiedBy}</p>
            <p><strong>Date:</strong> ${data.certification.certificationDate}</p>
        </div>
    `;
}

function generateReportFooter() {
    return `
        <div class="footer">
            <p>Generated by INSPIRE Inspection System</p>
            <p>Report generated on ${new Date().toLocaleString()}</p>
        </div>
    `;
}

module.exports = {
    generateNSPIREReport,
    generateNSPIREHTML,
    processInspectionData
};