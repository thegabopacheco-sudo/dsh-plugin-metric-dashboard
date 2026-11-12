// Test end-to-end de metric-dashboard.
import path from 'node:path';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const packageDir = path.resolve(import.meta.dirname, '..');
const tmpDir = path.join(packageDir, 'test', 'tmp');
rmSync(tmpDir, { recursive: true, force: true });
const home = path.join(tmpDir, 'dsh-home');
mkdirSync(path.join(home, 'metric-dashboard'), { recursive: true });
writeFileSync(path.join(home, 'metric-dashboard', 'config.json'), JSON.stringify({ allowedPaths: [tmpDir] }), 'utf8');
const csvFile = path.join(tmpDir, 'metricas.csv');
writeFileSync(csvFile, 'label,value\nEne,10\nFeb,20\nMar,15\n', 'utf8');

function makeClient(extraEnv = {}) {
  const entry = process.env.DASHBOARD_SERVER ? path.resolve(process.env.DASHBOARD_SERVER) : path.join(packageDir, 'server.mjs');
  const transport = new StdioClientTransport({ command: process.execPath, args: [entry], env: { SystemRoot: process.env.SystemRoot || 'C:\\Windows', PATH: process.env.PATH, USERPROFILE: process.env.USERPROFILE, HOME: process.env.HOME || process.env.USERPROFILE, TEMP: process.env.TEMP, TMP: process.env.TMP, DSH_HOME: home, ...extraEnv }, stderr: 'pipe' });
  transport.stderr?.on('data', (c) => process.stderr.write(`[server] ${c}`));
  const client = new Client({ name: 'dashboard-test', version: '1.0.0' }, { capabilities: {}, versionNegotiation: { mode: 'auto' } });
  return client.connect(transport).then(() => ({ client, transport }));
}
const textOf = (r) => (r.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');

const { client, transport } = await makeClient();
console.log('tools:', (await client.listTools()).tools.map((t) => t.name).join(', '));
console.log('--- status ---'); console.log(textOf(await client.callTool({ name: 'status', arguments: {} })));
const dashboard = textOf(await client.callTool({ name: 'dashboard', arguments: { title: 'Producción', input: JSON.stringify({ ventas: 120, errores: 3, uptime: 99.9 }) } }));
console.log('--- dashboard ---'); console.log(dashboard.slice(0, 300));
console.log('es SVG:', dashboard.startsWith('<svg') && dashboard.includes('</svg>'));
console.log('tarjetas KPI:', dashboard.includes('ventas') && dashboard.includes('errores') && dashboard.includes('uptime'));
console.log('valores:', dashboard.includes('120') && dashboard.includes('99.9'));
console.log('título:', dashboard.includes('Producción'));
const arrayInput = textOf(await client.callTool({ name: 'dashboard', arguments: { input: JSON.stringify([{ label: 'A', value: 5 }, { label: 'B', value: 8 }]) } }));
console.log('array input:', arrayInput.includes('A') && arrayInput.includes('B'));
const csv = textOf(await client.callTool({ name: 'dashboard', arguments: { path: csvFile } }));
console.log('csv path:', csv.includes('Ene') && csv.includes('Mar'));
const invalid = await client.callTool({ name: 'dashboard', arguments: { input: '{ roto' } });
console.log('input inválido isError:', invalid.isError === true);
const empty = await client.callTool({ name: 'dashboard', arguments: { input: '{}' } });
console.log('sin métricas isError:', empty.isError === true);
const noConfirm = await client.callTool({ name: 'dashboard', arguments: { input: '{"a":1}', output: path.join(tmpDir, 'dash.svg') } });
console.log('guardar sin confirm isError:', noConfirm.isError === true);
const saved = await client.callTool({ name: 'dashboard', arguments: { input: '{"a":1}', output: path.join(tmpDir, 'dash.svg'), confirm: true } });
const savedText = textOf(saved);
const file = savedText.replace('Guardado: ', '').split(' (')[0];
console.log('archivo escrito:', existsSync(file) && readFileSync(file, 'utf8').includes('<svg'));
await client.close(); try { await transport.close?.(); } catch {}
const { client: roClient, transport: roTransport } = await makeClient({ DSH_DASHBOARD_MODE: 'read-only' });
const roSave = await roClient.callTool({ name: 'dashboard', arguments: { input: '{"a":1}', output: path.join(tmpDir, 'ro.svg'), confirm: true } });
console.log('read-only guardar isError:', roSave.isError === true);
await roClient.close(); try { await roTransport.close?.(); } catch {}
console.log('OK');
