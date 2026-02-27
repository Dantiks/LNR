// ================================================================
// AI REQUEST FUNCTIONS - Clean Architecture
// Each function has single responsibility
// DUAL PRIMARY: Groq ↔ OpenRouter (round-robin) → Gemini → HuggingFace
// ================================================================

const Groq = require('groq-sdk');
const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Groq - lazy init
let groq = null;
function getGroq() {
    if (!groq && process.env.GROQ_API_KEY) {
        groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    }
    return groq;
}

// Gemini - lazy init
let genAI = null;
function getGemini() {
    if (!genAI && process.env.GEMINI_API_KEY) {
        genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    }
    return genAI;
}

// Round-robin counter for dual primary
let requestCounter = 0;

// ================================================================
// 1. GROQ REQUEST
// LLaMA 3.3 70B - fast, high quality, streaming
// Limits: 30 req/min, 14400/day
// Возвращает: { success: boolean, content: string|null, stream: object|null }
// ================================================================
async function tryGroqRequest(messages, maxRetries = 3) {
    const client = getGroq();
    if (!client) {
        console.log('⚠️ GROQ_API_KEY not set - Groq unavailable');
        return { success: false, content: null, stream: null };
    }

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const stream = await client.chat.completions.create({
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

            if (attempt < maxRetries - 1) {
                const wait = Math.pow(2, attempt) * 500;
                await new Promise(r => setTimeout(r, wait));
            }
        }
    }

    return { success: false, stream: null, content: null };
}

// ================================================================
// 2. OPENROUTER REQUEST
// Free models: Gemma 3 4B, Llama 3.2 3B
// Возвращает: { success: boolean, content: string|null }
// ================================================================
async function tryOpenRouterRequest(messages, maxRetries = 2) {
    if (!process.env.OPENROUTER_API_KEY) {
        console.log('⚠️ OPENROUTER_API_KEY not set - OpenRouter unavailable');
        return { success: false, content: null };
    }

    const freeModels = [
        'google/gemma-3-4b-it:free',
        'meta-llama/llama-3.2-3b-instruct:free'
    ];

    for (const model of freeModels) {
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                // Gemma doesn't support system role — merge into user msg
                let formattedMessages = [];
                let systemContent = '';
                for (const msg of messages) {
                    if (msg.role === 'system') {
                        systemContent = msg.content;
                    } else {
                        formattedMessages.push({ ...msg });
                    }
                }
                if (systemContent && formattedMessages.length > 0) {
                    const firstUserIdx = formattedMessages.findIndex(m => m.role === 'user');
                    if (firstUserIdx !== -1) {
                        formattedMessages[firstUserIdx] = {
                            ...formattedMessages[firstUserIdx],
                            content: `[Instructions: ${systemContent}]\n\n${formattedMessages[firstUserIdx].content}`
                        };
                    }
                }

                const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
                    model: model,
                    messages: formattedMessages,
                    max_tokens: 4000,
                    temperature: 0.7
                }, {
                    headers: {
                        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
                        'Content-Type': 'application/json',
                        'HTTP-Referer': 'https://lnr-igvi.onrender.com',
                        'X-Title': 'LNR AI Chat'
                    },
                    timeout: 30000
                });

                const content = response.data?.choices?.[0]?.message?.content;
                if (content) {
                    console.log(`✅ OpenRouter (${model}) succeeded on attempt ${attempt + 1}`);
                    return { success: true, content };
                }

            } catch (error) {
                const status = error.response?.status;
                const errorMsg = error.response?.data?.error?.message || error.message;
                console.log(`❌ OpenRouter (${model}) attempt ${attempt + 1}/${maxRetries} failed: ${status} ${errorMsg}`);

                if (status === 429 || status === 400 || status === 404) break;

                if (attempt < maxRetries - 1) {
                    const wait = Math.pow(2, attempt) * 500;
                    await new Promise(r => setTimeout(r, wait));
                }
            }
        }
    }

    return { success: false, content: null };
}

// ================================================================
// 3. GEMINI REQUEST (FALLBACK)
// Google Gemini 2.0 Flash - free tier
// ================================================================
async function tryGeminiRequest(messages, maxRetries = 2) {
    const ai = getGemini();
    if (!ai) {
        console.log('⚠️ GEMINI_API_KEY not set - Gemini unavailable');
        return { success: false, content: null };
    }

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const model = ai.getGenerativeModel({ model: 'gemini-2.0-flash' });

            const systemMsg = messages.find(m => m.role === 'system')?.content || '';
            const chatMessages = messages.filter(m => m.role !== 'system');
            const history = [];

            for (let i = 0; i < chatMessages.length - 1; i++) {
                const msg = chatMessages[i];
                history.push({
                    role: msg.role === 'assistant' ? 'model' : 'user',
                    parts: [{ text: msg.content }]
                });
            }

            const lastMessage = chatMessages[chatMessages.length - 1]?.content || 'Привет';

            const chatConfig = {
                history: history,
                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 4000,
                }
            };
            if (systemMsg) {
                chatConfig.systemInstruction = { parts: [{ text: systemMsg }] };
            }

            const chat = model.startChat(chatConfig);
            const result = await chat.sendMessage(lastMessage);
            const text = result.response.text();

            if (text) {
                console.log(`✅ Gemini succeeded on attempt ${attempt + 1}`);
                return { success: true, content: text };
            }

        } catch (error) {
            console.log(`❌ Gemini attempt ${attempt + 1}/${maxRetries} failed: ${error.message}`);
            if (attempt < maxRetries - 1) {
                await new Promise(r => setTimeout(r, 1000));
            }
        }
    }

    return { success: false, content: null };
}

// ================================================================
// 4. HUGGINGFACE REQUEST (LAST RESORT)
// ================================================================
async function tryHuggingFaceRequest(messages) {
    if (!process.env.HUGGINGFACE_TOKEN) {
        console.log('⚠️ HUGGINGFACE_TOKEN not set - HF fallback unavailable');
        return { success: false, content: null };
    }

    const HF_API_URL = 'https://api-inference.huggingface.co/models/meta-llama/Llama-3.2-3B-Instruct';
    const systemMsg = messages.find(m => m.role === 'system')?.content || 'You are a helpful AI assistant.';
    const userMessage = messages[messages.length - 1]?.content || 'Привет';
    const prompt = `<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n${systemMsg}<|eot_id|><|start_header_id|>user<|end_header_id|>\n${userMessage}<|eot_id|><|start_header_id|>assistant<|end_header_id|>`;

    try {
        const response = await axios.post(HF_API_URL, {
            inputs: prompt,
            parameters: { max_new_tokens: 500, temperature: 0.7, top_p: 0.9, return_full_text: false },
            options: { wait_for_model: true, use_cache: false }
        }, {
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.HUGGINGFACE_TOKEN}` },
            timeout: 60000
        });

        if (response.data) {
            let text = '';
            if (Array.isArray(response.data) && response.data[0]?.generated_text) text = response.data[0].generated_text.trim();
            else if (typeof response.data === 'string') text = response.data.trim();
            else if (response.data.generated_text) text = response.data.generated_text.trim();

            if (text) {
                console.log('✅ HuggingFace success');
                return { success: true, content: text };
            }
        }
        return { success: false, content: null };
    } catch (error) {
        console.error(`❌ HuggingFace error: ${error.response?.status || error.message}`);
        return { success: false, content: null };
    }
}

// ================================================================
// 5. STREAM RESPONSE (for Groq)
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
// 6. SEND SIMPLE RESPONSE (for OpenRouter/Gemini/HF)
// ================================================================
function sendSimpleResponse(content, res) {
    res.write(`data: ${JSON.stringify({ content })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
}

// ================================================================
// 7. MAIN AI REQUEST (Orchestrator) — DUAL PRIMARY
// Round-robin: чётные → Groq, нечётные → OpenRouter
// Если основной упал → пробуем второй основной
// Если оба упали → Gemini → HuggingFace → graceful
// ================================================================
async function makeAIRequest(messages, res) {
    requestCounter++;
    const useGroqFirst = (requestCounter % 2 === 0);

    // ---- PRIMARY 1: Try first primary ----
    if (useGroqFirst) {
        console.log(`🔄 [#${requestCounter}] Trying Groq first...`);
        const groqResult = await tryGroqRequest(messages, 2);
        if (groqResult.success) {
            try { await streamResponse(groqResult.stream, res); return; }
            catch (e) { console.error('Groq stream failed'); }
        }

        // Groq failed → try OpenRouter
        console.log('🔄 Groq failed, trying OpenRouter...');
        const orResult = await tryOpenRouterRequest(messages, 2);
        if (orResult.success) { sendSimpleResponse(orResult.content, res); return; }

    } else {
        console.log(`🔄 [#${requestCounter}] Trying OpenRouter first...`);
        const orResult = await tryOpenRouterRequest(messages, 2);
        if (orResult.success) { sendSimpleResponse(orResult.content, res); return; }

        // OpenRouter failed → try Groq
        console.log('🔄 OpenRouter failed, trying Groq...');
        const groqResult = await tryGroqRequest(messages, 2);
        if (groqResult.success) {
            try { await streamResponse(groqResult.stream, res); return; }
            catch (e) { console.error('Groq stream failed'); }
        }
    }

    // ---- Both primaries failed → fallbacks ----
    console.log('🔄 Both primaries failed, trying Gemini...');
    const geminiResult = await tryGeminiRequest(messages, 2);
    if (geminiResult.success) { sendSimpleResponse(geminiResult.content, res); return; }

    console.log('🔄 Trying HuggingFace...');
    const hfResult = await tryHuggingFaceRequest(messages);
    if (hfResult.success) { sendSimpleResponse(hfResult.content, res); return; }

    // All failed
    console.log('⚠️ All 4 providers failed');
    sendSimpleResponse('😊 AI сейчас очень загружен. Попробуйте через минуту!', res);
}

module.exports = {
    tryGroqRequest,
    tryOpenRouterRequest,
    tryGeminiRequest,
    tryHuggingFaceRequest,
    streamResponse,
    sendSimpleResponse,
    makeAIRequest
};
