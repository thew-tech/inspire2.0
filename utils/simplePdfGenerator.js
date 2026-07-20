/**
 * Simple PDF Generator - Fallback for when all other methods fail
 * Uses basic HTML structure that can be converted to PDF by browsers
 */

/**
 * Generate a simple PDF report as HTML that can be printed to PDF
 */
function generateSimplePDFHTML(inspectionData) {
  const now = new Date();
  const inspectionNo = inspectionData.inspectionNo || inspectionData.inspectionId || `INSP-${Date.now().toString(36).toUpperCase()}`;
  
  // Process deficiencies
  const deficiencies = (inspectionData.findings || inspectionData.deficiencies || []);
  const totalDeficiencies = deficiencies.length;
  
  // Calculate severity counts
  const severityCounts = {
    critical: deficiencies.filter(d => ['critical', 'life-threatening'].includes(d.severity?.toLowerCase())).length,
    major: deficiencies.filter(d => ['major', 'severe'].includes(d.severity?.toLowerCase())).length,
    minor: deficiencies.filter(d => ['minor', 'moderate'].includes(d.severity?.toLowerCase())).length,
    low: deficiencies.filter(d => ['low', 'observation'].includes(d.severity?.toLowerCase())).length
  };

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>INSPIRE Inspection Report - ${inspectionNo}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: Arial, sans-serif;
      font-size: 12px;
      line-height: 1.4;
      color: #333;
      padding: 20px;
      background: white;
    }
    
    .header {
      text-align: center;
      border-bottom: 3px solid #0066cc;
      padding-bottom: 20px;
      margin-bottom: 30px;
    }
    
    .header h1 {
      font-size: 24px;
      color: #0066cc;
      margin-bottom: 10px;
    }
    
    .header p {
      font-size: 14px;
      color: #666;
    }
    
    .info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      margin-bottom: 30px;
    }
    
    .info-section {
      background: #f9f9f9;
      padding: 15px;
      border-radius: 5px;
      border: 1px solid #ddd;
    }
    
    .info-section h3 {
      font-size: 14px;
      color: #0066cc;
      margin-bottom: 10px;
      border-bottom: 1px solid #ddd;
      padding-bottom: 5px;
    }
    
    .info-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 5px;
    }
    
    .info-label {
      font-weight: bold;
      color: #666;
    }
    
    .info-value {
      color: #333;
    }
    
    .summary {
      background: linear-gradient(135deg, #0066cc, #0080ff);
      color: white;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 30px;
      text-align: center;
    }
    
    .summary h2 {
      font-size: 18px;
      margin-bottom: 15px;
    }
    
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 15px;
    }
    
    .summary-item {
      text-align: center;
    }
    
    .summary-count {
      font-size: 24px;
      font-weight: bold;
      margin-bottom: 5px;
    }
    
    .summary-label {
      font-size: 10px;
      text-transform: uppercase;
      opacity: 0.9;
    }
    
    .deficiencies {
      margin-top: 30px;
    }
    
    .deficiencies h2 {
      font-size: 18px;
      color: #0066cc;
      margin-bottom: 20px;
      border-bottom: 2px solid #0066cc;
      padding-bottom: 5px;
    }
    
    .deficiency-item {
      background: #f9f9f9;
      border: 1px solid #ddd;
      border-radius: 5px;
      padding: 15px;
      margin-bottom: 15px;
      page-break-inside: avoid;
    }
    
    .deficiency-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
    }
    
    .deficiency-title {
      font-size: 14px;
      font-weight: bold;
      color: #333;
    }
    
    .severity-badge {
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: bold;
      text-transform: uppercase;
    }
    
    .severity-critical {
      background: #dc3545;
      color: white;
    }
    
    .severity-major {
      background: #fd7e14;
      color: white;
    }
    
    .severity-minor {
      background: #0d6efd;
      color: white;
    }
    
    .severity-low {
      background: #6c757d;
      color: white;
    }
    
    .deficiency-details {
      margin-bottom: 10px;
    }
    
    .deficiency-location {
      font-size: 11px;
      color: #666;
      margin-bottom: 5px;
    }
    
    .deficiency-description {
      color: #333;
      margin-bottom: 10px;
    }
    
    .deficiency-comments {
      font-style: italic;
      color: #666;
      font-size: 11px;
    }
    
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #ddd;
      text-align: center;
      font-size: 10px;
      color: #666;
    }
    
    .no-deficiencies {
      text-align: center;
      padding: 40px;
      background: #d4edda;
      border: 1px solid #c3e6cb;
      border-radius: 5px;
      color: #155724;
      font-size: 16px;
    }
    
    @media print {
      body {
        padding: 10px;
      }
      
      .page-break {
        page-break-after: always;
      }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>INSPIRE INSPECTION REPORT</h1>
    <p>HUD National Standards for Physical Inspection of Real Estate</p>
  </div>
  
  <div class="info-grid">
    <div class="info-section">
      <h3>Inspection Details</h3>
      <div class="info-row">
        <span class="info-label">Inspection No:</span>
        <span class="info-value">${inspectionNo}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Type:</span>
        <span class="info-value">${inspectionData.inspectionType || 'General NSPIRE'}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Inspector:</span>
        <span class="info-value">${inspectionData.inspectorName || inspectionData.inspector?.fullName || 'Inspector'}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Date:</span>
        <span class="info-value">${inspectionData.startDate || now.toLocaleDateString()}</span>
      </div>
    </div>
    
    <div class="info-section">
      <h3>Property Information</h3>
      <div class="info-row">
        <span class="info-label">Property:</span>
        <span class="info-value">${inspectionData.propertyName || inspectionData.property?.name || 'Property Name'}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Address:</span>
        <span class="info-value">${inspectionData.propertyAddress || inspectionData.property?.address || 'Property Address'}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Property ID:</span>
        <span class="info-value">${inspectionData.propertyId || inspectionData.property?._id || 'PROP-001'}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Report Created:</span>
        <span class="info-value">${now.toLocaleDateString()}</span>
      </div>
    </div>
  </div>
  
  <div class="summary">
    <h2>Deficiency Summary</h2>
    <div class="summary-grid">
      <div class="summary-item">
        <div class="summary-count">${severityCounts.critical}</div>
        <div class="summary-label">Critical</div>
      </div>
      <div class="summary-item">
        <div class="summary-count">${severityCounts.major}</div>
        <div class="summary-label">Major</div>
      </div>
      <div class="summary-item">
        <div class="summary-count">${severityCounts.minor}</div>
        <div class="summary-label">Minor</div>
      </div>
      <div class="summary-item">
        <div class="summary-count">${severityCounts.low}</div>
        <div class="summary-label">Low</div>
      </div>
      <div class="summary-item">
        <div class="summary-count">${totalDeficiencies}</div>
        <div class="summary-label">Total</div>
      </div>
    </div>
  </div>
  
  <div class="deficiencies">
    <h2>Detailed Deficiency Report</h2>
    
    ${totalDeficiencies === 0 ? `
      <div class="no-deficiencies">
        ✓ No deficiencies found during this inspection
      </div>
    ` : deficiencies.map((def, index) => `
      <div class="deficiency-item">
        <div class="deficiency-header">
          <div class="deficiency-title">${def.title || def.description || def.deficiencyName || `Deficiency ${index + 1}`}</div>
          <div class="severity-badge severity-${mapSeverityClass(def.severity)}">${def.severity || 'Unknown'}</div>
        </div>
        
        <div class="deficiency-details">
          <div class="deficiency-location">
            <strong>Location:</strong> 
            Building ${def.building || 'A'} | 
            Unit ${def.unit || 'Multiple'} | 
            Room ${def.location || def.room || def.area || 'General'}
          </div>
          
          <div class="deficiency-description">
            ${def.description || def.details || def.deficiencyDetails || 'No description provided'}
          </div>
          
          ${def.notes || def.comments || def.recommendation ? `
            <div class="deficiency-comments">
              <strong>Comments:</strong> ${def.notes || def.comments || def.recommendation}
            </div>
          ` : ''}
        </div>
      </div>
    `).join('')}
  </div>
  
  ${inspectionData.notes || inspectionData.generalComments ? `
    <div class="deficiencies">
      <h2>General Comments</h2>
      <div class="deficiency-item">
        <div style="white-space: pre-wrap;">${inspectionData.notes || inspectionData.generalComments}</div>
      </div>
    </div>
  ` : ''}
  
  <div class="footer">
    <p>Generated by INSPIRE Inspection System</p>
    <p>Report generated on ${now.toLocaleString()}</p>
    <p>This report is confidential and intended for authorized personnel only.</p>
  </div>
</body>
</html>
  `;
}

function mapSeverityClass(severity) {
  const severityLower = (severity || '').toLowerCase();
  if (['critical', 'life-threatening'].includes(severityLower)) return 'critical';
  if (['major', 'severe'].includes(severityLower)) return 'major';
  if (['minor', 'moderate'].includes(severityLower)) return 'minor';
  return 'low';
}

module.exports = {
  generateSimplePDFHTML
};