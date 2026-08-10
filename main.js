const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { open } = require('./db');

let db = null;
let win = null;

const userData = () => app.getPath('userData');
const dbPath = () => path.join(userData(), 'workers-diary.db');
const backupsDir = () => path.join(userData(), 'backups');
const statePath = () => path.join(userData(), 'window-state.json');

if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => {
  if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
});

function latestBackup() {
  try {
    const files = fs.readdirSync(backupsDir()).filter(f => f.endsWith('.json')).sort();
    return files.length ? path.join(backupsDir(), files[files.length - 1]) : null;
  } catch { return null; }
}

function openDbOrRecover() {
  try {
    fs.mkdirSync(userData(), { recursive: true });
    db = open(dbPath());
    return true;
  } catch (e) {
    const bak = latestBackup();
    const msg = 'تعذر فتح قاعدة البيانات.\n\n' + e.message;
    if (bak) {
      const r = dialog.showMessageBoxSync({
        type: 'error', title: 'يوميات العمال', message: msg,
        detail: 'هل تريد الاستعادة من آخر نسخة احتياطية تلقائية؟',
        buttons: ['استعادة من النسخة الاحتياطية', 'إغلاق'], defaultId: 0, cancelId: 1
      });
      if (r === 0) {
        try {
          for (const suf of ['', '-wal', '-shm']) { try { fs.rmSync(dbPath() + suf); } catch {} }
          db = open(dbPath());
          db.importAll(JSON.parse(fs.readFileSync(bak, 'utf8')));
          return true;
        } catch (e2) {
          dialog.showErrorBox('يوميات العمال', 'فشلت الاستعادة: ' + e2.message);
        }
      }
    } else {
      dialog.showErrorBox('يوميات العمال', msg);
    }
    return false;
  }
}

function writeAutoBackup() {
  try {
    if (!db) return;
    const data = db.getAll();
    if (!data.workers.length && !data.projects.length && !data.logs.length && !data.payments.length) return;
    fs.mkdirSync(backupsDir(), { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    fs.writeFileSync(path.join(backupsDir(), `backup-${ts}.json`), JSON.stringify(data, null, 2));
    const files = fs.readdirSync(backupsDir()).filter(f => f.endsWith('.json')).sort();
    for (const f of files.slice(0, Math.max(0, files.length - 30))) fs.rmSync(path.join(backupsDir(), f));
  } catch {}
}

function loadState() {
  try { return JSON.parse(fs.readFileSync(statePath(), 'utf8')); } catch { return {}; }
}
function saveState() {
  try {
    if (!win) return;
    const b = win.getBounds();
    fs.writeFileSync(statePath(), JSON.stringify(b));
  } catch {}
}

function createWindow() {
  const s = loadState();
  win = new BrowserWindow({
    width: s.width || 1200, height: s.height || 820,
    x: s.x, y: s.y,
    minWidth: 420, minHeight: 700,
    title: 'يوميات العمال',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  win.once('ready-to-show', () => win.show());
  win.on('close', saveState);
  win.loadFile('app.html');
}

function setMenu() {
  const template = [
    { role: 'appMenu' },
    {
      label: 'File',
      submenu: [
        { label: 'Print', accelerator: 'CmdOrCtrl+P', click: () => win && win.webContents.executeJavaScript('window.print()') },
        { role: 'close' }
      ]
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' }
  ];
  if (process.platform !== 'darwin') template.shift();
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

process.on('uncaughtException', e => {
  try { fs.writeFileSync(path.join(userData(), 'error.log'), String(e.stack || e)); } catch {}
  dialog.showErrorBox('يوميات العمال', 'حدث خطأ غير متوقع:\n' + (e.message || e));
});

app.whenReady().then(() => {
  if (!openDbOrRecover()) { app.quit(); return; }

  ipcMain.handle('getAll', () => db.getAll());
  ipcMain.handle('addWorker', (e, w) => db.addWorker(w));
  ipcMain.handle('addProject', (e, p) => db.addProject(p));
  ipcMain.handle('addLog', (e, l) => db.addLog(l));
  ipcMain.handle('addPayment', (e, p) => db.addPayment(p));
  ipcMain.handle('updateWorker', (e, w) => db.updateWorker(w));
  ipcMain.handle('updateProject', (e, p) => db.updateProject(p));
  ipcMain.handle('updateLog', (e, l) => db.updateLog(l));
  ipcMain.handle('updatePayment', (e, p) => db.updatePayment(p));
  ipcMain.handle('deleteWorker', (e, id) => db.deleteWorker(id));
  ipcMain.handle('deleteProject', (e, id) => db.deleteProject(id));
  ipcMain.handle('deleteLog', (e, id) => db.deleteLog(id));
  ipcMain.handle('deletePayment', (e, id) => db.deletePayment(id));
  ipcMain.handle('addProjectPayment', (e, p) => db.addProjectPayment(p));
  ipcMain.handle('updateProjectPayment', (e, p) => db.updateProjectPayment(p));
  ipcMain.handle('deleteProjectPayment', (e, id) => db.deleteProjectPayment(id));

  const photosDir = () => path.join(userData(), 'photos');
  const photoFile = name => path.join(photosDir(), path.basename(name));
  const photoUrl = name => 'file:///' + photoFile(name).replace(/\\/g, '/');
  ipcMain.handle('pickPhoto', async () => {
    const r = await dialog.showOpenDialog(win, {
      filters: [{ name: 'صور', extensions: ['jpg', 'jpeg', 'png', 'heic', 'webp', 'gif'] }],
      properties: ['openFile']
    });
    if (r.canceled || !r.filePaths.length) return null;
    fs.mkdirSync(photosDir(), { recursive: true });
    const name = crypto.randomUUID() + path.extname(r.filePaths[0]).toLowerCase();
    fs.copyFileSync(r.filePaths[0], photoFile(name));
    return { name, url: photoUrl(name) };
  });
  ipcMain.handle('photoUrl', (e, name) => name && fs.existsSync(photoFile(name)) ? photoUrl(name) : null);
  ipcMain.handle('openPhoto', (e, name) => { if (name && fs.existsSync(photoFile(name))) shell.openPath(photoFile(name)); });
  ipcMain.handle('resetAll', () => db.resetAll());
  ipcMain.handle('importAll', (e, data) => db.importAll(data));

  ipcMain.handle('exportBackup', async () => {
    const r = await dialog.showSaveDialog(win, {
      defaultPath: 'يوميات-العمال.json',
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });
    if (r.canceled || !r.filePath) return false;
    fs.writeFileSync(r.filePath, JSON.stringify(db.getAll(), null, 2));
    return true;
  });

  ipcMain.handle('importBackup', async () => {
    const r = await dialog.showOpenDialog(win, {
      filters: [{ name: 'JSON', extensions: ['json'] }], properties: ['openFile']
    });
    if (r.canceled || !r.filePaths.length) return null;
    try {
      const data = JSON.parse(fs.readFileSync(r.filePaths[0], 'utf8'));
      if (!data || typeof data !== 'object' || !Array.isArray(data.workers)) throw new Error('bad shape');
      db.importAll(data);
      return db.getAll();
    } catch {
      dialog.showErrorBox('يوميات العمال', 'ملف غير صالح. اختر ملف نسخة احتياطية صحيح.');
      return null;
    }
  });

  setMenu();
  createWindow();

  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('before-quit', writeAutoBackup);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
