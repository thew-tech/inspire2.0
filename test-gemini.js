const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

async function testGeminiAPI() {
    try {
        const API_KEY = process.env.GEMINI_API_KEY;
        console.log('Testing Gemini API with key:', API_KEY ? `${API_KEY.substring(0, 10)}...` : 'NOT SET');
        
        if (!API_KEY) {
            throw new Error('GEMINI_API_KEY not configured');
        }

        const genAI = new GoogleGenerativeAI(API_KEY);
        
        // Test different models
        const modelNames = [
            "gemini-2.5-flash",
            "gemini-2.0-flash", 
            "gemini-flash-latest",
            "gemini-pro-latest",
            "gemini-2.5-pro"
        ];
        
        console.log('\nTesting available models...\n');
        
        for (const modelName of modelNames) {
            try {
                console.log(`Testing ${modelName}...`);
                const model = genAI.getGenerativeModel({ model: modelName });
                
                const result = await model.generateContent("Hello, can you respond with just 'OK'?");
                const response = await result.response;
                const text = response.text();
                
                console.log(`✅ ${modelName}: ${text.trim()}`);
                break; // Stop at first working model
                
            } catch (error) {
                console.log(`❌ ${modelName}: ${error.message}`);
            }
        }
        
    } catch (error) {
        console.error('❌ Gemini API Test Failed:', error.message);
    }
}

testGeminiAPI();