const { app, BrowserWindow, ipcMain, screen, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const isDev = !app.isPackaged;
let mainWindow;
let customerWindow;

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1500,
    height: 950,
    minWidth: 1180,
    minHeight: 720,
    backgroundColor: '#080b12',
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false }
  });
  mainWindow.loadURL(isDev ? 'http://localhost:5173' : `file://${path.join(__dirname, '../dist/index.html')}`);
}

function createCustomerDisplay(displayId) {
  if (customerWindow && !customerWindow.isDestroyed()) { customerWindow.focus(); return; }
  const target = screen.getAllDisplays().find(d => d.id === Number(displayId)) || screen.getPrimaryDisplay();
  customerWindow = new BrowserWindow({ x: target.bounds.x, y: target.bounds.y, width: target.bounds.width, height: target.bounds.height, fullscreen: true, frame: false, backgroundColor: '#080b12', webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false } });
  customerWindow.loadURL(isDev ? 'http://localhost:5173?display=customer' : `file://${path.join(__dirname, '../dist/index.html')}?display=customer`);
  customerWindow.on('closed', () => { customerWindow = null; });
}

function printerList() {
  return mainWindow?.webContents?.getPrintersAsync().then(printers => printers.map(p => ({ name: p.name, displayName: p.displayName, description: p.description || '', status: p.status, isDefault: p.isDefault }))) || Promise.resolve([]);
}

function printHtml({ html, deviceName, silent = true, pageSize }) {
  const win = new BrowserWindow({ show: false, width: 800, height: 1000, webPreferences: { contextIsolation: true, nodeIntegration: false } });
  return new Promise((resolve, reject) => {
    win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    win.webContents.once('did-finish-load', () => {
      win.webContents.print({ silent, deviceName: deviceName || undefined, printBackground: true, pageSize: pageSize || undefined }, success => {
        win.close();
        if (success) resolve(true); else reject(new Error('Printer did not accept the job.'));
      });
    });
    win.webContents.once('did-fail-load', () => { win.close(); reject(new Error('Could not prepare print job.')); });
  });
}

const keyFile = () => path.join(app.getPath('userData'), 'pos-ai-key.bin');
function getAIKey() {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
  try {
    if (!safeStorage.isEncryptionAvailable()) return '';
    const b = fs.readFileSync(keyFile());
    return safeStorage.decryptString(b);
  } catch { return ''; }
}
function setAIKey(value) {
  if (!value) return false;
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows secure storage is unavailable.');
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  fs.writeFileSync(keyFile(), safeStorage.encryptString(value.trim()));
  return true;
}

async function aiCommand({ message, context }) {
  const apiKey = getAIKey();
  if (!apiKey) throw new Error('AI is not configured. Add your OpenAI API key in POS AI settings.');
  const tools = [{ type: 'function', name: 'pos_action', description: 'Perform one safe POS action. Never invent product/customer names or prices. Use read actions for questions. Destructive or financial actions must be confirmed by the app before execution.', parameters: { type: 'object', properties: {
    action: { type: 'string', enum: ['snapshot','low_stock','list_products','add_customer','add_product','adjust_stock','create_combo','add_expense','add_rider','add_staff','create_purchase','delete_customer','delete_product','add_to_order','checkout','print_receipt','help'] },
    name: { type: 'string' }, phone: { type: 'string' }, price: { type: 'number' }, quantity: { type: 'number' }, amount: { type: 'number' }, category: { type: 'string' }, item: { type: 'string' }, note: { type: 'string' }, method: { type: 'string' }, description: { type: 'string' }
  }, required: ['action'], additionalProperties: false } }];
  const system = `You are the intelligent voice operator for MK Pizza & Ice Bar POS. Understand natural speech, Urdu-English mixed speech, accents, incomplete sentences and normal restaurant shorthand. Decide the user's intent and return exactly one pos_action tool call. You can manage products, customers, inventory, combos, expenses, riders, staff, purchases and the current order. For checkout/payment, deleting records, changing prices, or other irreversible/high-value actions, choose the action but the local app will require confirmation. Never claim an action happened unless the tool result confirms it. Keep spoken replies short and natural. Current POS context: ${JSON.stringify(context).slice(0,18000)}`;
  const response = await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` }, body: JSON.stringify({ model: 'gpt-5', instructions: system, input: message, tools, tool_choice: 'required' }) });
  if (!response.ok) throw new Error(`AI service error ${response.status}: ${await response.text()}`);
  const body = await response.json();
  const call = (body.output || []).find(x => x.type === 'function_call' && x.name === 'pos_action');
  if (!call) return { action: 'help', args: {}, text: body.output_text || 'I could not determine the POS action.' };
  let args = {}; try { args = JSON.parse(call.arguments || '{}'); } catch {}
  return { action: args.action || 'help', args, text: body.output_text || '' };
}

app.whenReady().then(() => {
  createMainWindow();
  ipcMain.handle('system:displays', () => screen.getAllDisplays().map(d => ({ id: d.id, bounds: d.bounds, scaleFactor: d.scaleFactor })));
  ipcMain.handle('display:open', (_, id) => { createCustomerDisplay(id); return true; });
  ipcMain.handle('display:close', () => { if (customerWindow && !customerWindow.isDestroyed()) customerWindow.close(); return true; });
  ipcMain.handle('app:version', () => app.getVersion());
  ipcMain.handle('printers:list', () => printerList());
  ipcMain.handle('printer:print', (_, payload) => printHtml(payload));
  ipcMain.handle('ai:key:status', () => Boolean(getAIKey()));
  ipcMain.handle('ai:key:set', (_, key) => setAIKey(key));
  ipcMain.handle('ai:command', (_, payload) => aiCommand(payload));
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createMainWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
