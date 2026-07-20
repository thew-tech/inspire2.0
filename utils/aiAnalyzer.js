const fs = require('fs');
const { GoogleGenerativeAI } = require("@google/generative-ai");

/**
 * Analyzes an image using Google Gemini API
 */
const analyzeImage = async (imageInput, contextData = {}) => {
    try {
        // Use environment variable for API key
        const API_KEY = process.env.GEMINI_API_KEY || "AIzaSyDgcUtepC_UU-SRJnrb96hYO3JyZiuTiUM";

        if (!API_KEY) {
            throw new Error('GEMINI_API_KEY not configured');
        }

        let imageBuffer;

        if (typeof imageInput === 'string' && imageInput.startsWith('http')) {
            console.log('Fetching image from URL for analysis...');
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout
            
            try {
                const response = await fetch(imageInput, { signal: controller.signal });
                clearTimeout(timeoutId);
                if (!response.ok) throw new Error(`Failed to fetch image: ${response.statusText}`);
                const arrayBuffer = await response.arrayBuffer();
                imageBuffer = Buffer.from(arrayBuffer);
            } catch (err) {
                clearTimeout(timeoutId);
                throw err;
            }
        } else {
            imageBuffer = fs.readFileSync(imageInput);
        }

        const contextString = JSON.stringify(contextData, null, 2);

        const prompt = `
      You are a professional HUD NSPIRE inspector. 
      Analyze this image for property defects.
      
      The user has provided the following context about this deficiency:
      ${contextString}
      
      Please verify if the visual evidence supports the user's observation.
      
      Return ONLY a JSON object with these exact fields:
      {
        "item": "The specific building component (e.g., Wall, Window)",
        "defect": "Description of the damage (e.g., Peeling paint)",
        "severity": "minor, moderate, severe, or life-threatening",
        "subCategory": "The category of the item (e.g., Interior, Exterior, Electrical)"
      }
      If no defect is visible, return { "status": "Pass" }.
    `;

        console.log('Using Google Gemini API for analysis...');
        const genAI = new GoogleGenerativeAI(API_KEY);

        // Try different model names in order of preference (updated for 2025)
        // User requested gemini-2.0-flash-001 as priority
        const modelNames = [
            "gemini-2.0-flash-001",
            "gemini-2.0-flash",
            "gemini-1.5-flash",
            "gemini-pro"
        ];

        let model;
        let lastError;

        for (const modelName of modelNames) {
            try {
                model = genAI.getGenerativeModel({ model: modelName });
                console.log(`Using model: ${modelName}`);
                break;
            } catch (error) {
                console.log(`Model ${modelName} not available:`, error.message);
                lastError = error;
                continue;
            }
        }

        if (!model) {
            throw new Error(`No available Gemini models found. Last error: ${lastError?.message}`);
        }

        const imagePart = {
            inlineData: {
                data: imageBuffer.toString("base64"),
                mimeType: "image/jpeg",
            },
        };

        const result = await model.generateContent([prompt, imagePart]);
        const response = await result.response;
        const text = response.text();

        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
        throw new Error("No JSON found in Gemini response");

    } catch (error) {
        console.error("AI Analysis Error:", error);

        const errorMsg = error.message || "";
        
        // Handle specific Google API error cases
        if (errorMsg.includes('suspended') || errorMsg.includes('403') || errorMsg.includes('PERMISSION_DENIED')) {
            return {
                status: "Error",
                error: "API Key Suspended",
                message: "The Google Gemini API key is currently suspended or inactive. Please update the GEMINI_API_KEY in the .env file.",
                details: errorMsg
            };
        }

        if (errorMsg.includes('404') || errorMsg.includes('not found')) {
            return {
                status: "Error",
                error: "AI model not available",
                message: "The AI analysis service is temporarily unavailable. Please try again later."
            };
        }

        if (errorMsg.includes('API key')) {
            return {
                status: "Error",
                error: "Configuration error",
                message: "AI service configuration issue. Please check your GEMINI_API_KEY."
            };
        }

        return {
            status: "Error",
            error: "Analysis failed",
            message: "Unable to analyze image. Please try again or contact support.",
            details: errorMsg
        };
    }
};

module.exports = { analyzeImage };
