import test from 'node:test';import assert from 'node:assert/strict';import{retryable}from'../lib/ingestion/worker.js';
test('网络和并发失败可重试，证据校验失败保留待核验',()=>{
 for(const code of ['SOURCE_HTTP_429','SOURCE_HTTP_503','TimeoutError','ECONNRESET','EVENT_VERSION_CHANGED'])assert.equal(retryable(code),true);
 for(const code of ['INVALID_QUOTE','CORRECTION_TARGET_UNVERIFIED','SOURCE_URL_NOT_ALLOWED','SOURCE_HTTP_404','MODEL_OUTPUT_TRUNCATED'])assert.equal(retryable(code),false);
});
