#!/usr/bin/env node
// dsh-plugin-metric-dashboard — dashboard SVG de métricas.
// Tools: status, dashboard.

import path from 'node:path';
import os from 'node:os';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { z } from 'zod';

const VERSION = '0.1.0';
const DSH_HOME = (() => {
  const v = process.env.DSH_HOME && process.env.DSH_HOME.trim();
  return v || path.join(process.env.USERPROFILE || process.env.HOME || os.homedir(), '.dsh');
})();
const CONFIG_FILE = path.join(DSH_HOME, 'metric-dashboard', 'config.json');
const CACHE_DIR = path.join(DSH_HOME, 'cache', 'metric-dashboard');
const READ_ONLY = String(process.env.DSH_DASHBOARD_MODE || '').toLowerCase() === 'read-only';
const MAX_METRICS = 60;
const log = (m) => process.stderr.write(`[dashboard] ${m}\n`);

function loadConfig() { try { if (existsSync(CONFIG_FILE)) return { allowedPaths: [], ...(JSON.parse(readFileSync(CONFIG_FILE, 'utf8')) || {}) }; } catch { /* defaults */ } return { allowedPaths: [] }; }
function allowedRoots() { const configured = loadConfig().allowedPaths; return (Array.isArray(configured) && configured.length ? configured : [process.env.USERPROFILE || process.env.HOME || os.homedir()]).map((item) => path.resolve(item)); }
function isAllowed(target) { const resolved = path.resolve(target); return resolved === CACHE_DIR || resolved.startsWith(CACHE_DIR + path.sep) || allowedRoots().some((root) => resolved === root || resolved.startsWith(root + path.sep)); }
function escapeXml(text) { return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;'); }
function parseMetrics(args) {
  if (args.path) {
    const resolved = path.resolve(args.path);
    if (!existsSync(resolved)) throw new Error(`archivo no existe: ${resolved}`);
    if (!isAllowed(resolved)) throw new Error(`ruta no permitida (revisa allowedPaths): ${resolved}`);
    const text = readFileSync(resolved, 'utf8').replace(/^\uFEFF/, '');
    if (/\.csv$/i.test(resolved)) {
      const lines = text.split('\n').filter((line) => line.trim());
      if (lines.length < 2) throw new Error('CSV sin datos');
      const headers = lines[0].split(',').map((header) => header.trim());
      return lines.slice(1).map((line) => { const values = line.split(',').map((value) => value.trim()); return { label: values[0] || '', value: Number(values[1]) }; });
    }
    try { return normalize(JSON.parse(text), 'respuesta'); } catch (error) { throw new Error(`JSON inválido: ${error.message}`); }
  }
  if (typeof args.input !== 'string') throw new Error('pasa input (JSON) o path (JSON/CSV)');
  try { return normalize(JSON.parse(args.input), 'entrada'); } catch (error) { throw new Error(`JSON inválido: ${error.message}`); }
}
function normalize(data) {
  const metrics = [];
  if (Array.isArray(data)) {
    for (const item of data) {
      if (item && typeof item === 'object') metrics.push({ label: String(item.label || item.name || item.metric || ''), value: Number(item.value ?? item.valor ?? item.count ?? NaN) });
      else metrics.push({ label: String(item), value: NaN });
    }
  } else if (data && typeof data === 'object') {
    for (const [label, value] of Object.entries(data)) if (typeof value === 'number') metrics.push({ label, value });
  }
  const valid = metrics.filter((metric) => metric.label && Number.isFinite(metric.value)).slice(0, MAX_METRICS);
  if (valid.length === 0) throw new Error('sin métricas numéricas válidas');
  return valid;
}
function metricValue(metric) { return Math.abs(metric.value) >= 1e6 ? `${(metric.value / 1e6).toFixed(2)}M` : Math.abs(metric.value) >= 1e3 ? `${(metric.value / 1e3).toFixed(1)}k` : String(metric.value); }
function renderDashboard(title, metrics) {
  const width = 640;
  const cardWidth = 190;
  const cardHeight = 84;
  const columns = Math.min(3, metrics.length);
  const rows = Math.ceil(metrics.length / columns);
  const height = 90 + rows * (cardHeight + 14) + 220;
  const parts = ['<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height + '" viewBox="0 0 ' + width + ' ' + height + '" font-family="Segoe UI, Arial, sans-serif">', '<rect width="100%" height="100%" fill="#f8fafc"/>'];
  parts.push(`<text x="24" y="40" font-size="20" font-weight="700" fill="#0f172a">${escapeXml(title || 'Dashboard de métricas')}</text>`);
  const colors = ['#e11d48', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6'];
  metrics.forEach((metric, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = 24 + column * (cardWidth + 14);
    const y = 60 + row * (cardHeight + 14);
    parts.push(`<rect x="${x}" y="${y}" width="${cardWidth}" height="${cardHeight}" rx="10" fill="#ffffff" stroke="#e2e8f0"/>`);
    parts.push(`<rect x="${x}" y="${y}" width="4" height="${cardHeight}" rx="2" fill="${colors[index % colors.length]}"/>`);
    parts.push(`<text x="${x + 16}" y="${y + 30}" font-size="11" fill="#64748b">${escapeXml(metric.label.slice(0, 26))}</text>`);
    parts.push(`<text x="${x + 16}" y="${y + 62}" font-size="26" font-weight="700" fill="#0f172a">${escapeXml(metricValue(metric))}</text>`);
  });
  const chartTop = 60 + rows * (cardHeight + 14) + 26;
  const chartHeight = 150;
  const maxAbs = Math.max(...metrics.map((metric) => Math.abs(metric.value)), 1);
  const slot = (640 - 48) / metrics.length;
  parts.push(`<text x="24" y="${chartTop - 10}" font-size="13" font-weight="600" fill="#334155">Comparativa</text>`);
  metrics.forEach((metric, index) => {
    const height = (Math.abs(metric.value) / maxAbs) * chartHeight;
    const x = 24 + slot * index + slot * 0.2;
    const y = chartTop + chartHeight - height;
    parts.push(`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(slot * 0.6).toFixed(1)}" height="${height.toFixed(1)}" fill="${colors[index % colors.length]}" rx="2"/>`);
    parts.push(`<text x="${(x + slot * 0.3).toFixed(1)}" y="${(chartTop + chartHeight + 14)}" font-size="9" fill="#64748b" text-anchor="middle">${escapeXml(metric.label.slice(0, 12))}</text>`);
  });
  parts.push('</svg>');
  return parts.join('\n') + '\n';
}
function textResult(text) { return { content: [{ type: 'text', text }] }; }
function uniquePath(target) { if (!existsSync(target)) return target; const parsed = path.parse(target); for (let index = 1; index < 1000; index++) { const candidate = path.join(parsed.dir, `${parsed.name}-${index}${parsed.ext}`); if (!existsSync(candidate)) return candidate; } throw new Error('no se pudo generar nombre único'); }

function buildInstructions() {
  return [
    'Metric Dashboard: genera un dashboard SVG de métricas.',
    '',
    `Salida: ${CACHE_DIR}`,
    '',
    'Herramientas: status, dashboard.',
    '',
    'Reglas:',
    '- Acepta JSON (objeto nombre→valor o array {label,value}) o CSV (label,value).',
    '- Devuelve el SVG; con output escribir requiere confirm:true.',
    '- Respeta allowedPaths y no sobrescribe.',
  ].join('\n');
}

function buildServer() {
  const server = new McpServer({ name: 'dsh-plugin-metric-dashboard', version: VERSION }, { capabilities: { tools: {} }, instructions: buildInstructions() });
  server.registerTool('status', { title: 'Estado', description: 'Rutas permitidas y modo.', inputSchema: z.object({}) }, async () => textResult([`Rutas permitidas: ${allowedRoots().join(', ')}`, `Salida: ${CACHE_DIR}`, `Modo: ${READ_ONLY ? 'read-only' : 'normal'}`].join('\n')));
  server.registerTool('dashboard', { title: 'Generar dashboard', description: 'Renderiza tarjetas + barras desde métricas.', inputSchema: z.object({ title: z.string().max(120).optional(), input: z.string().optional(), path: z.string().optional(), output: z.string().optional(), confirm: z.boolean().optional() }) }, async (args) => {
    const metrics = parseMetrics(args);
    const svg = renderDashboard(args.title, metrics);
    if (!args.output) return textResult(svg);
    if (READ_ONLY) throw new Error('modo read-only: guardar deshabilitado');
    if (args.confirm !== true) throw new Error('guardar dashboard requiere confirm:true y pedido explícito');
    const target = path.resolve(args.output);
    if (!isAllowed(target)) throw new Error(`ruta de salida no permitida: ${target}`);
    mkdirSync(path.dirname(target), { recursive: true });
    const file = uniquePath(target);
    writeFileSync(file, svg, 'utf8');
    return textResult(`Guardado: ${file} (${metrics.length} métricas)`);
  });
  return server;
}

try { mkdirSync(CACHE_DIR, { recursive: true }); } catch { /* ignora */ }
log(`modo: ${READ_ONLY ? 'read-only' : 'normal'}`);
serveStdio(buildServer, { onerror: (e) => log(`serveStdio: ${e.message}`) });
process.on('uncaughtException', (e) => log(`excepción: ${e.message}`));
process.on('unhandledRejection', (e) => log(`rechazo: ${e && e.message ? e.message : String(e)}`));
