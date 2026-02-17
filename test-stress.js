// Stress test for multi-provider AI system
const axios = require('axios');

const API_URL = 'http://localhost:3000/api/chat';
const BATCH_SIZE = 40;
const DELAY_BETWEEN_BATCHES = 30000; // 30 seconds

// Test questions
const questions = [
    "Что такое JavaScript?",
    "Объясни Promise",
    "Как работает async/await?",
    "Что такое React?",
    "Расскажи про Node.js",
    "Что такое API?",
    "Объясни REST",
    "Что такое JSON?",
    "Как работает HTTP?",
    "Что такое CSS?"
];

let successCount = 0;
let failCount = 0;
let groqCount = 0;
let hfCount = 0;

async function sendRequest(question, index) {
    try {
        const response = await axios.post(API_URL, {
            message: question,
            chatHistory: []
        }, {
            responseType: 'stream',
            timeout: 60000 // 60 sec timeout
        });

        let fullResponse = '';

        response.data.on('data', (chunk) => {
            const lines = chunk.toString().split('\n');
            for (const line of lines) {
                if (line.startsWith('data: ') && !line.includes('[DONE]')) {
                    try {
                        const json = JSON.parse(line.substring(6));
                        fullResponse += json.content || '';
                    } catch (e) { }
                }
            }
        });

        await new Promise((resolve, reject) => {
            response.data.on('end', resolve);
            response.data.on('error', reject);
        });

        successCount++;

        // Detect which provider was used (simple heuristic)
        if (fullResponse.length > 100) {
            groqCount++;
            console.log(`✅ Request ${index}: SUCCESS (likely Groq) - ${fullResponse.substring(0, 50)}...`);
        } else {
            hfCount++;
            console.log(`✅ Request ${index}: SUCCESS (likely HuggingFace) - ${fullResponse.substring(0, 50)}...`);
        }
    } catch (error) {
        failCount++;
        console.log(`❌ Request ${index}: FAILED - ${error.message}`);
    }
}

async function runBatch(batchNumber) {
    console.log(`\n🚀 Starting Batch ${batchNumber} (${BATCH_SIZE} requests)...\n`);

    const promises = [];
    for (let i = 0; i < BATCH_SIZE; i++) {
        const question = questions[i % questions.length];
        const index = (batchNumber - 1) * BATCH_SIZE + i + 1;
        promises.push(sendRequest(question, index));

        // Small delay between requests to avoid overwhelming
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    await Promise.all(promises);

    console.log(`\n📊 Batch ${batchNumber} Stats:`);
    console.log(`   Success: ${successCount - failCount}`);
    console.log(`   Failed: ${failCount}`);
    console.log(`   Groq: ~${groqCount}`);
    console.log(`   HuggingFace: ~${hfCount}`);
}

async function main() {
    console.log('🧪 AI Multi-Provider Stress Test');
    console.log('=================================\n');

    // Batch 1
    await runBatch(1);

    // Wait 30 seconds
    console.log(`\n⏳ Waiting 30 seconds before batch 2...\n`);
    await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));

    // Batch 2
    await runBatch(2);

    // Final stats
    console.log('\n\n🏁 Final Results:');
    console.log('==================');
    console.log(`Total Requests: ${BATCH_SIZE * 2}`);
    console.log(`✅ Success: ${successCount}`);
    console.log(`❌ Failed: ${failCount}`);
    console.log(`🚀 Groq (approx): ${groqCount}`);
    console.log(`🤗 HuggingFace (approx): ${hfCount}`);
    console.log(`📈 Success Rate: ${((successCount / (BATCH_SIZE * 2)) * 100).toFixed(1)}%`);
}

main().catch(console.error);
