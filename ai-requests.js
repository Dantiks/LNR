// ================================================================
// AI REQUEST FUNCTIONS - Clean Architecture
// Each function has single responsibility
// ================================================================

const Groq = require('groq-sdk');
const axios = require('axios');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ================================================================
// 1. GROQ REQUEST
// Попытка запроса к Groq API с retry логикой
// Возвращает: { success: boolean, content: string|null, stream: object|null }
// ================================================================
async function tryGroqRequest(messages, maxRetries = 3) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const stream = await groq.chat.completions.create({
                model: 'llama-3.3-70b-versatile',
                messages: messages,
                stream: true,
                temperature: 0.7,
                max_tokens: 4000
            });

            console.log(`✅ Groq succeeded on attempt ${attempt + 1}`);
            return { success: true, stream, content: null };

        } catch (error) {
            console.log(`❌ Groq attempt ${attempt + 1}/${maxRetries} failed: ${error.message}`);

            // Wait before retry (exponential backoff)
            if (attempt < maxRetries - 1) {
                const wait = Math.pow(2, attempt) * 500; // 500ms, 1s, 2s
                await new Promise(r => setTimeout(r, wait));
            }
        }
    }

    // All retries failed
    return { success: false, stream: null, content: null };
}

// ================================================================
// 2. HUGGINGFACE REQUEST  
// Попытка запроса к HuggingFace (С API ключом)
// Использует Google Flan-T5-Base (ПРОВЕРЕНО - работает с ключом)
// Возвращает: { success: boolean, content: string }
// ================================================================
async function tryHuggingFaceRequest(messages) {
    const userMessage = messages[messages.length - 1]?.content || 'Привет';

    // Google Flan-T5-Base - FREE with API token
    const HF_API_URL = 'https://router.huggingface.co/models/google/flan-t5-base';

    // Check if HF token is available
    if (!process.env.HUGGINGFACE_TOKEN) {
        console.log('⚠️ HUGGINGFACE_TOKEN not set - HF fallback unavailable');
        return { success: false, content: null };
    }

    try {
        const response = await axios.post(HF_API_URL, {
            inputs: userMessage,
            parameters: {
                max_new_tokens: 200,
                temperature: 0.7
            },
            options: {
                wait_for_model: true  // Wait if model is loading
            }
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.HUGGINGFACE_TOKEN}`
            },
            timeout: 30000 // 30 sec
        });

        // Check response format
        if (response.data) {
            let text = '';

            // Handle array response
            if (Array.isArray(response.data) && response.data[0]?.generated_text) {
                text = response.data[0].generated_text.trim();
            }
            // Handle direct text
            else if (typeof response.data === 'string') {
                text = response.data.trim();
            }
            // Handle object with text
            else if (response.data.generated_text) {
                text = response.data.generated_text.trim();
            }

            if (text) {
                console.log('✅ HuggingFace (Flan-T5) success');
                return { success: true, content: text };
            }
        }

        // No valid response
        console.log('❌ HuggingFace: Invalid response format');
        return { success: false, content: null };

    } catch (error) {
        console.error(`❌ HuggingFace error: ${error.response?.status || error.message}`);
        return { success: false, content: null };
    }
}

// ================================================================
// 3. STREAM RESPONSE
// Отправляет streaming ответ клиенту через SSE
// Не знает про AI провайдеров - просто streaming
// ================================================================
async function streamResponse(stream, res) {
    try {
        for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content || '';
            if (content) {
                res.write(`data: ${JSON.stringify({ content })}\n\n`);
            }
        }

        res.write('data: [DONE]\n\n');
        res.end();
        console.log('✅ Streaming complete');

    } catch (error) {
        console.error(`❌ Stream error: ${error.message}`);
        throw error;
    }
}

// ================================================================
// 4. SEND SIMPLE RESPONSE
// Отправляет простой (non-streaming) ответ
// ================================================================
function sendSimpleResponse(content, res) {
    res.write(`data: ${JSON.stringify({ content })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
}

// ================================================================
// 5. MAIN AI REQUEST (Orchestrator)
// Главная функция - управляет попытками AI
// 1. Пробует Groq (быстро, streaming)
// 2. Если fail → HuggingFace (медленно, безлимит)
// 3. Если оба fail → graceful message
// ================================================================
async function makeAIRequest(messages, res) {
    // Try Groq first (fast, high quality)
    const groqResult = await tryGroqRequest(messages, 3);

    if (groqResult.success) {
        // Stream Groq response
        try {
            await streamResponse(groqResult.stream, res);
            return;
        } catch (streamError) {
            console.error('Groq streaming failed, trying HuggingFace...');
            // Fall through to HuggingFace
        }
    }

    // Groq failed or stream error - try HuggingFace
    console.log('🔄 Switching to HuggingFace fallback...');
    const hfResult = await tryHuggingFaceRequest(messages);

    if (hfResult.success) {
        sendSimpleResponse(hfResult.content, res);
        return;
    }

    // Both failed - send graceful message
    console.log('⚠️ Both providers failed - graceful degradation');
    const gracefulMessage = '😊 AI сейчас очень загружен. Попробуйте через минуту!';
    sendSimpleResponse(gracefulMessage, res);
}

module.exports = {
    tryGroqRequest,
    tryHuggingFaceRequest,
    streamResponse,
    sendSimpleResponse,
    makeAIRequest
};
