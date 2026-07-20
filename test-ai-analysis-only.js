const { analyzeImage } = require('./utils/aiAnalyzer');
require('dotenv').config();

async function testAIAnalysisOnly() {
    try {
        const testImageUrl = 'https://res.cloudinary.com/dbgus6jkw/image/upload/v1769815293/nspire-inspections/deficiencies/download_1769815293474.jpg';
        
        console.log('Testing AI analysis function directly...');
        console.log('Image URL:', testImageUrl);
        console.log('');
        
        const result = await analyzeImage(testImageUrl);
        
        console.log('✅ AI Analysis Success:');
        console.log('Result:', JSON.stringify(result, null, 2));
        
        if (result.status === 'Pass') {
            console.log('\n🟢 No defects detected in the image');
        } else if (result.status === 'Error') {
            console.log('\n🔴 Analysis failed:', result.message);
        } else {
            console.log('\n🟡 Defect detected:');
            console.log('  Item:', result.item);
            console.log('  Defect:', result.defect);
            console.log('  Severity:', result.severity);
            console.log('  Category:', result.subCategory);
        }
        
    } catch (error) {
        console.error('\n❌ AI Analysis Test Failed:');
        console.error('Error:', error.message);
        console.error('Stack:', error.stack);
    }
}

testAIAnalysisOnly();