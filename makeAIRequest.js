// Make AI request with GUARANTEED multi-provider fallback
async function makeAIRequest(messages, res) {
    let groqSucceeded = false;
    let stream = null;

    // TRY GROQ (fast, high quality) with exponential backoff
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            stream = await groq.chat.completions.create({
                model: 'llama-3.3-70b-versatile',
                messages: messages,
                stream: true,
                temperature: 0.7,
                max_tokens: 4000
            });
            groqSucceeded = true;
            console.log(`✅ Groq succeeded on attempt ${attempt + 1}`);
            break;
        } catch (error) {
            console.log(`❌ Groq attempt ${attempt + 1}/3 failed: ${error.message || error.status}`);
            if (attempt < 2) {
                const wait = Math.pow(2, attempt) * 500;
                await new Promise(r => setTimeout(r, wait));
            }
        }
    }

    // If Groq succeeded, stream response
    if (groqSucceeded && stream) {
        try {
            for await (const chunk of stream) {
                const content = chunk.choices[0]?.delta?.content || '';
                if (content) {
                    res.write(`data: ${JSON.stringify({ content })}\n\n`);
                }
            }
            res.write('data: [DONE]\n\n');
            res.end();
            console.log('✅ Groq streaming complete');
            return;
        } catch (streamError) {
            console.error(`❌ Groq stream error: ${streamError.message}`);
            // Fall through to HuggingFace
        }
    }

    // FALLBACK TO HUGGINGFACE (unlimited but slower)
    console.log('🔄 Using Hugging Face fallback...');
    try {
        const hfResponse = await callHuggingFace(messages);
        res.write(`data: ${JSON.stringify({ content: hfResponse })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
        console.log('✅ HuggingFace complete');
    } catch (hfError) {
        console.error(`❌ HuggingFace error: ${hfError.message}`);
        // LAST RESORT: generic message
        res.write(`data: ${JSON.stringify({ content: 'AI временно недоступен. Попробуйте через 30 секунд.' })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
    }
}
