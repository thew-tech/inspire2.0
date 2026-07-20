const { analyzeImage } = require('./utils/aiAnalyzer');
require('dotenv').config();

async function testWithDefectImage() {
    try {
        // Test with a sample image that might have defects
        // You can replace this with any image URL that has visible defects
        const testImages = [
            'https://res.cloudinary.com/dbgus6jkw/image/upload/v1769815293/nspire-inspections/deficiencies/download_1769815293474.jpg',
            // Add more test images here if available
        ];
        
        for (let i = 0; i < testImages.length; i++) {
            const imageUrl = testImages[i];
            console.log(`\n=== Testing Image ${i + 1} ===`);
            console.log('Image URL:', imageUrl);
            console.log('');
            
            const result = await analyzeImage(imageUrl);
            
            console.log('Analysis Result:', JSON.stringify(result, null, 2));
            
            if (result.status === 'Pass') {
                console.log('✅ No defects detected');
            } else if (result.status === 'Error') {
                console.log('❌ Analysis failed:', result.message);
            } else {
                console.log('⚠️ Defect detected:');
                console.log('  Item:', result.item || 'N/A');
                console.log('  Defect:', result.defect || 'N/A');
                console.log('  Severity:', result.severity || 'N/A');
                console.log('  Category:', result.subCategory || 'N/A');
            }
        }
        
        console.log('\n🎉 All tests completed successfully!');
        
    } catch (error) {
        console.error('\n❌ Test Failed:');
        console.error('Error:', error.message);
    }
}

testWithDefectImage();