// ================================================================
// AI REQUEST FUNCTIONS - Clean Architecture
// Each function has single responsibility
// Priority: 1. OpenRouter (free models) → 2. Gemini → 3. HuggingFace
// ================================================================

const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Gemini - lazy init
let genAI = null;
function getGemini() {
    if (!genAI && process.env.GEMINI_API_KEY) {
        genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    }
    return genAI;
}

// ================================================================
// 1. OPENROUTER REQUEST (PRIMARY)
// OpenRouter - free models aggregator (Gemma 3, Llama 3.3, etc.)
// Uses OpenAI-compatible API format
// Возвращает: { success: boolean, content: string|null }
// ================================================================
async function tryOpenRouterRequest(messages, maxRetries = 3) {
    if (!process.env.OPENROUTER_API_KEY) {
        console.log('⚠️ OPENROUTER_API_KEY not set - OpenRouter unavailable');
        return { success: false, content: null };
    }

    // Free models to try in order (best quality first)
    const freeModels = [
        'google/gemma-3-4b-it:free',
        'meta-llama/llama-3.2-3b-instruct:free'
    ];

    for (const model of freeModels) {
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                // Some free models (Gemma) don't support system role
                // Merge system message into first user message
                let formattedMessages = [];
                let systemContent = '';
                for (const msg of messages) {
                    if (msg.role === 'system') {
                        systemContent = msg.content;
                    } else {
                        formattedMessages.push({ ...msg });
                    }
                }
                // Prepend system instructions to first user message
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

                // If 429/400/404, try next model
                if (status === 429 || status === 400 || status === 404) break;

                // Otherwise retry with backoff
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
// 2. GEMINI REQUEST (FALLBACK 1)
// Google Gemini 2.0 Flash - free tier
// Возвращает: { success: boolean, content: string|null }
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

            // Convert messages to Gemini format
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
// 3. HUGGINGFACE REQUEST (FALLBACK 2)
// Meta Llama 3.2 3B
// Возвращает: { success: boolean, content: string }
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
            parameters: {
                max_new_tokens: 500,
                temperature: 0.7,
                top_p: 0.9,
                return_full_text: false
            },
            options: { wait_for_model: true, use_cache: false }
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.HUGGINGFACE_TOKEN}`
            },
            timeout: 60000
        });

        if (response.data) {
            let text = '';
            if (Array.isArray(response.data) && response.data[0]?.generated_text) {
                text = response.data[0].generated_text.trim();
            } else if (typeof response.data === 'string') {
                text = response.data.trim();
            } else if (response.data.generated_text) {
                text = response.data.generated_text.trim();
            }

            if (text) {
                console.log('✅ HuggingFace (Llama 3.2) success');
                return { success: true, content: text };
            }
        }

        console.log('❌ HuggingFace: Invalid response format');
        return { success: false, content: null };

    } catch (error) {
        const status = error.response?.status;
        console.error(`❌ HuggingFace error: ${status || error.message}`);
        return { success: false, content: null };
    }
}

// ================================================================
// 4. SEND SIMPLE RESPONSE
// Отправляет ответ через SSE
// ================================================================
function sendSimpleResponse(content, res) {
    res.write(`data: ${JSON.stringify({ content })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
}

// ================================================================
// 5. MAIN AI REQUEST (Orchestrator)
// 1. OpenRouter (бесплатные модели, надёжно)
// 2. Gemini (бесплатно, но квота может закончиться)
// 3. HuggingFace (медленно, бесплатно)
// 4. Если все fail → graceful message
// ================================================================
async function makeAIRequest(messages, res) {
    // Try OpenRouter first (free models, reliable)
    console.log('🔄 Trying OpenRouter...');
    const openRouterResult = await tryOpenRouterRequest(messages, 2);

    if (openRouterResult.success) {
        sendSimpleResponse(openRouterResult.content, res);
        return;
    }

    // OpenRouter failed - try Gemini
    console.log('🔄 Switching to Gemini fallback...');
    const geminiResult = await tryGeminiRequest(messages, 2);

    if (geminiResult.success) {
        sendSimpleResponse(geminiResult.content, res);
        return;
    }

    // Gemini failed - try HuggingFace
    console.log('🔄 Switching to HuggingFace fallback...');
    const hfResult = await tryHuggingFaceRequest(messages);

    if (hfResult.success) {
        sendSimpleResponse(hfResult.content, res);
        return;
    }

    // All providers failed
    console.log('⚠️ All providers failed - graceful degradation');
    const gracefulMessage = '😊 AI сейчас очень загружен. Попробуйте через минуту!';
    sendSimpleResponse(gracefulMessage, res);
}

module.exports = {
    tryOpenRouterRequest,
    tryGeminiRequest,
    tryHuggingFaceRequest,
    sendSimpleResponse,
    makeAIRequest
};
