const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

async function listGeminiModels() {
    try {
        const API_KEY = process.env.GEMINI_API_KEY;
        console.log('Checking Gemini API with key:', API_KEY ? `${API_KEY.substring(0, 10)}...` : 'NOT SET');
        
        if (!API_KEY) {
            throw new Error('GEMINI_API_KEY not configured');
        }

        const genAI = new GoogleGenerativeAI(API_KEY);
        
        console.log('\nAttempting to list available models...\n');
        
        // Try to list models using the REST API directly
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (data.models && data.models.length > 0) {
            console.log('✅ Available models:');
            data.models.forEach(model => {
                console.log(`  - ${model.name} (${model.displayName})`);
                if (model.supportedGenerationMethods) {
                    console.log(`    Methods: ${model.supportedGenerationMethods.join(', ')}`);
                }
            });
        } else {
            console.log('❌ No models found or API key invalid');
        }
        
    } catch (error) {
        console.error('❌ Error listing models:', error.message);
        
        if (error.message.includes('403')) {
            console.log('\n💡 This suggests the API key is invalid or doesn\'t have proper permissions.');
            console.log('   Please check your Google AI Studio API key at: https://aistudio.google.com/app/apikey');
        } else if (error.message.includes('404')) {
            console.log('\n💡 This suggests the API endpoint or version is incorrect.');
        }
    }
}

listGeminiModels();