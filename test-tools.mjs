import { spawn } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_PATH = resolve(__dirname, 'build/index.js');

const TESTS = [
  { name: 'export_reg_get_law', args: { law_id: '324CO0000000378', elm: 'AppdxTable[1]' } },
  { name: 'export_reg_search_law', args: { keyword: '輸出貿易管理' } },
  { name: 'export_reg_get_annex', args: { table_number: '1' } },
  { name: 'export_reg_get_ministerial_ordinance', args: {} },
  { name: 'export_reg_get_parameter_thresholds', args: { item_number: '4' } },
  { name: 'export_reg_get_white_countries', args: {} },
  { name: 'export_reg_check_country', args: { country_name: 'ベトナム' } },
  { name: 'export_reg_check_user_list', args: { organization: 'テスト' } },
  { name: 'export_reg_get_annex3_2', args: {} },
  { name: 'export_reg_get_fear_ordinance', args: {} },
  { name: 'export_reg_get_tariff_items', args: { category: '25' } },
];

const TIMEOUT_MS = 120000; // 120s per tool call (large law texts take time)

function send(proc, msg) {
  const line = JSON.stringify(msg) + '\n';
  proc.stdin.write(line);
}

/**
 * Waits for a JSON-RPC response with the given id.
 * Handles chunked stdout data by buffering partial lines.
 */
function waitForResponse(proc, id, timeoutMs) {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const timer = setTimeout(() => {
      proc.stdout.off('data', onData);
      reject(new Error(`Timeout waiting for response id=${id}`));
    }, timeoutMs);

    function onData(chunk) {
      buffer += chunk.toString();
      // Try to parse complete lines (newline-delimited JSON)
      const lines = buffer.split('\n');
      // Keep the last element (may be incomplete)
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const parsed = JSON.parse(trimmed);
          if (parsed.id === id) {
            clearTimeout(timer);
            proc.stdout.off('data', onData);
            resolve(parsed);
            return;
          }
        } catch {
          // Not valid JSON yet, skip
        }
      }
    }
    proc.stdout.on('data', onData);
  });
}

async function main() {
  console.log('Starting MCP server...');
  const proc = spawn('node', [SERVER_PATH], {
    stdio: ['pipe', 'pipe', 'pipe'],
    cwd: __dirname,
  });

  // Collect stderr for debugging
  let stderrBuf = '';
  proc.stderr.on('data', (chunk) => {
    stderrBuf += chunk.toString();
  });

  proc.on('error', (err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });

  let nextId = 1;

  // Step 1: Initialize
  const initId = nextId++;
  send(proc, {
    jsonrpc: '2.0',
    id: initId,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test', version: '1.0.0' },
    },
  });

  try {
    const initResp = await waitForResponse(proc, initId, 15000);
    if (initResp.error) {
      console.error('Initialize failed:', initResp.error);
      proc.kill();
      process.exit(1);
    }
    console.log('Initialize OK. Server:', initResp.result?.serverInfo?.name || 'unknown');
  } catch (e) {
    console.error('Initialize error:', e.message);
    if (stderrBuf) console.error('stderr:', stderrBuf);
    proc.kill();
    process.exit(1);
  }

  // Step 2: Send initialized notification
  send(proc, { jsonrpc: '2.0', method: 'notifications/initialized' });

  // Step 3: Run each tool test sequentially
  const results = [];

  for (const test of TESTS) {
    const id = nextId++;
    console.log(`\nTesting [${test.name}]...`);
    send(proc, {
      jsonrpc: '2.0',
      id,
      method: 'tools/call',
      params: { name: test.name, arguments: test.args },
    });

    try {
      const resp = await waitForResponse(proc, id, TIMEOUT_MS);

      if (resp.error) {
        console.log(`  ERROR (JSON-RPC): code=${resp.error.code} message=${resp.error.message}`);
        results.push({ tool: test.name, status: 'FAIL', detail: `JSON-RPC error: ${resp.error.message}` });
        continue;
      }

      const content = resp.result?.content;
      if (!content || !Array.isArray(content)) {
        console.log('  ERROR: No content array in result');
        results.push({ tool: test.name, status: 'FAIL', detail: 'No content array' });
        continue;
      }

      // Check for isError flag
      const hasIsError = resp.result.isError === true;
      const textContent = content.map(c => c.text || '').join('\n');
      const hasUndefinedError = textContent.includes('Cannot read properties of undefined');

      if (hasIsError || hasUndefinedError) {
        const snippet = textContent.substring(0, 200);
        console.log(`  FAIL (isError or undefined error): ${snippet}`);
        results.push({ tool: test.name, status: 'FAIL', detail: snippet });
      } else {
        const preview = textContent.substring(0, 100).replace(/\n/g, ' ');
        console.log(`  OK (${textContent.length} chars): ${preview}...`);
        results.push({ tool: test.name, status: 'PASS', detail: preview });
      }
    } catch (e) {
      console.log(`  TIMEOUT/ERROR: ${e.message}`);
      results.push({ tool: test.name, status: 'FAIL', detail: e.message });
    }
  }

  // Step 4: Summary
  console.log('\n' + '='.repeat(80));
  console.log('TEST RESULTS SUMMARY');
  console.log('='.repeat(80));
  console.log(`${'Tool'.padEnd(45)} | ${'Status'.padEnd(6)} | Detail`);
  console.log('-'.repeat(80));

  let passCount = 0;
  let failCount = 0;
  for (const r of results) {
    if (r.status === 'PASS') passCount++;
    else failCount++;
    console.log(`${r.tool.padEnd(45)} | ${r.status.padEnd(6)} | ${r.detail.substring(0, 60)}`);
  }

  console.log('-'.repeat(80));
  console.log(`Total: ${results.length} | PASS: ${passCount} | FAIL: ${failCount}`);
  console.log('='.repeat(80));

  if (stderrBuf.trim()) {
    console.log('\nServer stderr output (last 2000 chars):');
    console.log(stderrBuf.substring(stderrBuf.length - 2000));
  }

  proc.kill();
  process.exit(failCount > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('Unhandled error:', e);
  process.exit(1);
});
