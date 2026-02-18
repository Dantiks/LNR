// ================================================================
// AI REQUEST FUNCTIONS - Clean Architecture
// Each function has single responsibility
// ================================================================

const Groq = require('groq-sdk');
const axios = require('axios');
const OpenAI = require('openai');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// OpenAI - lazy init (only when API key exists, prevents crash)
let openai = null;
function getOpenAI() {
    if (!openai && process.env.OPENAI_API_KEY) {
        openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
    return openai;
}

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
    // Check if HF token is available
    if (!process.env.HUGGINGFACE_TOKEN) {
        console.log('⚠️ HUGGINGFACE_TOKEN not set - HF fallback unavailable');
        return { success: false, content: null };
    }

    // Meta Llama 3.2 3B - free, fast, and currently available
    const HF_API_URL = 'https://api-inference.huggingface.co/models/meta-llama/Llama-3.2-3B-Instruct';

    // Format messages for Llama (system + user messages)
    const systemMsg = messages.find(m => m.role === 'system')?.content || 'You are a helpful AI assistant.';
    const userMessage = messages[messages.length - 1]?.content || 'Привет';

    // Llama instruction format
    const prompt = `<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n${systemMsg}<|eot_id|><|start_header_id|>user<|end_header_id|>\n${userMessage}<|eot_id|><|start_header_id|>assistant<|end_header_id|>`;

    try {
        const response = await axios.post(HF_API_URL, {
            inputs: prompt,
            parameters: {
                max_new_tokens: 500,
                temperature: 0.7,
                top_p: 0.9,
                return_full_text: false
            },
            options: {
                wait_for_model: true,  // Wait if model is loading
                use_cache: false
            }
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.HUGGINGFACE_TOKEN}`
            },
            timeout: 60000 // 60 sec (Llama может быть медленнее)
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
                console.log('✅ HuggingFace (Llama 3.2) success');
                return { success: true, content: text };
            }
        }

        // No valid response
        console.log('❌ HuggingFace: Invalid response format');
        return { success: false, content: null };

    } catch (error) {
        const status = error.response?.status;
        const errorMsg = error.response?.data?.error || error.message;

        console.error(`❌ HuggingFace error: ${status || errorMsg}`);

        // If model is loading, provide helpful message
        if (status === 503) {
            console.log('⏳ Model is loading, this may take a moment...');
        }

        return { success: false, content: null };
    }
}

// ================================================================
// 3. OPENAI REQUEST  
// Попытка запроса к OpenAI GPT-5-mini
// Возвращает: { success: boolean, content: string, stream: object|null }
// ================================================================
async function tryOpenAIRequest(messages) {
    const client = getOpenAI();
    if (!client) {
        console.log('⚠️ OPENAI_API_KEY not set - OpenAI fallback unavailable');
        return { success: false, content: null, stream: null };
    }

    try {
        const stream = await client.chat.completions.create({
            model: 'gpt-5-mini',
            messages: messages,
            stream: true,
            temperature: 0.7,
            max_tokens: 2000
        });

        console.log('✅ OpenAI (GPT-5-mini) succeeded');
        return { success: true, stream, content: null };

    } catch (error) {
        const errorMsg = error.message || 'Unknown error';
        console.error(`❌ OpenAI error: ${errorMsg}`);
        return { success: false, content: null, stream: null };
    }
}

// ================================================================
// 4. STREAM RESPONSE
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
// 1. Пробует Groq (быстро, бесплатно, streaming)
// 2. Если fail → OpenAI (надежно, платно, streaming)
// 3. Если fail → HuggingFace (медленно, бесплатно)
// 4. Если все fail → graceful message
// ================================================================
async function makeAIRequest(messages, res) {
    // Try Groq first (fast, high quality, free with limits)
    const groqResult = await tryGroqRequest(messages, 3);

    if (groqResult.success) {
        try {
            await streamResponse(groqResult.stream, res);
            return;
        } catch (streamError) {
            console.error('Groq streaming failed, trying OpenAI...');
            // Fall through to OpenAI
        }
    }

    // Groq failed - try OpenAI (reliable, paid)
    console.log('🔄 Switching to OpenAI fallback...');
    const openaiResult = await tryOpenAIRequest(messages);

    if (openaiResult.success) {
        try {
            await streamResponse(openaiResult.stream, res);
            return;
        } catch (streamError) {
            console.error('OpenAI streaming failed, trying HuggingFace...');
            // Fall through to HuggingFace
        }
    }

    // Both Groq and OpenAI failed - try HuggingFace (free, slow)
    console.log('🔄 Switching to HuggingFace fallback...');
    const hfResult = await tryHuggingFaceRequest(messages);

    if (hfResult.success) {
        sendSimpleResponse(hfResult.content, res);
        return;
    }

    // All providers failed - send graceful message
    console.log('⚠️ All providers failed - graceful degradation');
    const gracefulMessage = '😊 AI сейчас очень загружен. Попробуйте через минуту!';
    sendSimpleResponse(gracefulMessage, res);
}

module.exports = {
    tryGroqRequest,
    tryOpenAIRequest,
    tryHuggingFaceRequest,
    streamResponse,
    sendSimpleResponse,
    makeAIRequest
};
