// Simple performance test for health endpoint
const axios = require('axios');

const API_URL = 'http://localhost:3000/health';
const TOTAL_REQUESTS = 1000;
const CONCURRENT_REQUESTS = 50;

let successCount = 0;
let failCount = 0;
const startTime = Date.now();

async function sendRequest(index) {
    try {
        await axios.get(API_URL);
        successCount++;
        if (index % 100 === 0) {
            console.log(`✅ Progress: ${index}/${TOTAL_REQUESTS}`);
        }
    } catch (error) {
        failCount++;
        console.log(`❌ Request ${index} failed: ${error.message}`);
    }
}

async function main() {
    console.log('🚀 Health Endpoint Performance Test');
    console.log('===================================\n');
    console.log(`Total requests: ${TOTAL_REQUESTS}`);
    console.log(`Concurrent: ${CONCURRENT_REQUESTS}\n`);

    const batches = Math.ceil(TOTAL_REQUESTS / CONCURRENT_REQUESTS);

    for (let batch = 0; batch < batches; batch++) {
        const promises = [];
        const batchStart = batch * CONCURRENT_REQUESTS;
        const batchEnd = Math.min(batchStart + CONCURRENT_REQUESTS, TOTAL_REQUESTS);

        for (let i = batchStart; i < batchEnd; i++) {
            promises.push(sendRequest(i + 1));
        }

        await Promise.all(promises);
    }

    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;
    const reqPerSec = (successCount / duration).toFixed(2);
    const reqPerMin = (successCount / duration * 60).toFixed(2);

    console.log('\n\n🏁 Results:');
    console.log('===========');
    console.log(`Total Requests: ${TOTAL_REQUESTS}`);
    console.log(`✅ Success: ${successCount}`);
    console.log(`❌ Failed: ${failCount}`);
    console.log(`⏱️  Duration: ${duration.toFixed(2)}s`);
    console.log(`📈 Requests/sec: ${reqPerSec}`);
    console.log(`📈 Requests/min: ${reqPerMin}`);
    console.log(`📊 Success Rate: ${((successCount / TOTAL_REQUESTS) * 100).toFixed(1)}%`);
}

main().catch(console.error);
