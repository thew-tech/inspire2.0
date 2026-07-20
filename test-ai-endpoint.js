const axios = require('axios');

async function testAIEndpoint() {
    try {
        const testImageUrl = 'https://res.cloudinary.com/dbgus6jkw/image/upload/v1769815293/nspire-inspections/deficiencies/download_1769815293474.jpg';
        
        console.log('Testing AI inspection endpoint...');
        console.log('Image URL:', testImageUrl);
        
        const response = await axios.post('http://localhost:5000/api/ai/inspect', {
            imageUrl: testImageUrl,
            inspectionId: null,
            propertyId: 'test-property',
            inspectorId: 'test-inspector'
        }, {
            timeout: 30000,
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        console.log('\n✅ AI Endpoint Test Success:');
        console.log('Status:', response.status);
        console.log('Response:', JSON.stringify(response.data, null, 2));
        
    } catch (error) {
        console.error('\n❌ AI Endpoint Test Failed:');
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Response:', error.response.data);
        } else {
            console.error('Error:', error.message);
        }
    }
}

// Only run if this file is executed directly
if (require.main === module) {
    testAIEndpoint();
}

module.exports = { testAIEndpoint };