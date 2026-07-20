const { generateNSPIREReport } = require('./utils/nspireReportGenerator');
const path = require('path');
const fs = require('fs');

async function testGeneration() {
    const dummyData = {
        inspectionNo: 'INSP-TEST-001',
        inspectionType: 'NSPIRE Standard',
        escortName: 'John Doe',
        propertyType: 'Multifamily',
        propertyAddress: '123 Test St, Testing Type, CA 90210',
        propertyName: 'pink avenue karachi',
        startDate: '10/25/2023',
        endDate: '10/25/2023',
        preliminaryScore: 85,
        calculatedScore: 85,
        unitsThreshold: 60,
        propertyThreshold: 60,
        inspectorName: 'Inspector Gadget',
        property: {
            buildings: 5,
            units: 100,
            address: '123 Test St',
            name: 'pink avenue karachi'
        },
        deficiencies: [
            {
                id: 'DEF-1',
                building: 'Building A',
                unit: '101',
                room: 'Kitchen',
                area: 'Inside',
                deficiencyName: 'Broken Window',
                nspireCode: 'WIN-1',
                description: 'Window pane is cracked',
                notes: 'Needs repair ASAP',
                severity: 'Moderate',
                deductionPts: 3.0,
                repeat: false,
                imageUri: 'https://via.placeholder.com/150' // Use a placeholder image URL
            },
            {
                id: 'DEF-2',
                building: 'Building B',
                unit: 'Multiple',
                room: 'Exterior',
                area: 'Outside',
                deficiencyName: 'Graffiti',
                nspireCode: 'EXT-5',
                description: 'Graffiti on west wall',
                notes: 'Remove',
                severity: 'Low',
                deductionPts: 1.0,
                repeat: true,
                imageUri: ''
            },
            {
                id: 'DEF-3',
                building: 'Building C',
                unit: '205',
                room: 'Bedroom',
                area: 'Inside',
                deficiencyName: 'Exposed Wire',
                nspireCode: 'ELEC-3',
                description: 'Exposed wiring near outlet',
                notes: 'Safety hazard',
                severity: 'Life-Threatening',
                deductionPts: 10.0,
                repeat: false,
                imageUri: 'https://via.placeholder.com/150'
            }
        ]
    };

    console.log('Generating PDF...');
    try {
        const reportPath = await generateNSPIREReport(dummyData, { includeImages: true });
        console.log('PDF Generated at:', reportPath);
    } catch (error) {
        console.error('Error:', error);
    }
}

testGeneration();
