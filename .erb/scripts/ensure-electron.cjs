const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

function resolveElectronBinary() {
  const electronPath = require('electron');
  return typeof electronPath === 'string' ? electronPath : '';
}

function installElectronBinary() {
  const installScript = require.resolve('electron/install.js');
  execFileSync(process.execPath, [installScript], {
    cwd: path.resolve(__dirname, '../..'),
    stdio: 'inherit',
  });
}

function ensureElectronBinary() {
  let electronPath = resolveElectronBinary();
  if (electronPath && fs.existsSync(electronPath)) {
    return;
  }

  console.log('Electron binary is missing. Running electron/install.js...');
  installElectronBinary();

  electronPath = resolveElectronBinary();
  if (!electronPath || !fs.existsSync(electronPath)) {
    throw new Error(
      `Electron binary is still missing after install: ${electronPath || 'unknown path'}`,
    );
  }
}

ensureElectronBinary();
