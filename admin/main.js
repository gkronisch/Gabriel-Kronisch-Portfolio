const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const PROJECT_ROOT = path.join(__dirname, '..');
const POSTS_FILE = path.join(PROJECT_ROOT, 'data', 'posts.json');
const IMAGES_DIR = path.join(PROJECT_ROOT, 'assets', 'img', 'posts');
const CONFIG_FILE = path.join(__dirname, '.admin-config.json');

function hashPassword(pw) {
    return crypto.createHash('sha256').update(pw).digest('hex');
}

function getConfig() {
    if (fs.existsSync(CONFIG_FILE)) {
        return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    }
    return null;
}

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 850,
        minWidth: 800,
        minHeight: 600,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        },
        titleBarStyle: 'hiddenInset',
        backgroundColor: '#fdfaf6',
        title: 'Curiosity Projects — Admin'
    });

    mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// --- IPC Handlers ---

ipcMain.handle('check-first-run', () => {
    return !fs.existsSync(CONFIG_FILE);
});

ipcMain.handle('set-password', (_event, password) => {
    const config = { passwordHash: hashPassword(password) };
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    return true;
});

ipcMain.handle('verify-password', (_event, password) => {
    const config = getConfig();
    if (!config) return false;
    return config.passwordHash === hashPassword(password);
});

ipcMain.handle('get-posts', () => {
    if (!fs.existsSync(POSTS_FILE)) return { posts: [] };
    return JSON.parse(fs.readFileSync(POSTS_FILE, 'utf8'));
});

ipcMain.handle('save-post', async (_event, { subject, description, imageName, imageData }) => {
    // Ensure directories exist
    const dataDir = path.dirname(POSTS_FILE);
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });

    // Write image
    const imageBuffer = Buffer.from(imageData, 'base64');
    fs.writeFileSync(path.join(IMAGES_DIR, imageName), imageBuffer);

    // Read or create posts data
    let data = { posts: [] };
    if (fs.existsSync(POSTS_FILE)) {
        data = JSON.parse(fs.readFileSync(POSTS_FILE, 'utf8'));
    }

    const newPost = {
        id: Date.now().toString(),
        subject: subject,
        description: description,
        image: imageName,
        date: new Date().toISOString().split('T')[0]
    };

    data.posts.push(newPost);
    fs.writeFileSync(POSTS_FILE, JSON.stringify(data, null, 2));

    return newPost;
});

ipcMain.handle('delete-post', (_event, postId) => {
    if (!fs.existsSync(POSTS_FILE)) return false;

    let data = JSON.parse(fs.readFileSync(POSTS_FILE, 'utf8'));
    const post = data.posts.find(p => p.id === postId);

    if (post) {
        // Delete image
        const imgPath = path.join(IMAGES_DIR, post.image);
        if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);

        // Remove from data
        data.posts = data.posts.filter(p => p.id !== postId);
        fs.writeFileSync(POSTS_FILE, JSON.stringify(data, null, 2));
    }

    return true;
});

ipcMain.handle('update-post', (_event, { id, subject, description }) => {
    if (!fs.existsSync(POSTS_FILE)) return false;

    let data = JSON.parse(fs.readFileSync(POSTS_FILE, 'utf8'));
    const post = data.posts.find(p => p.id === id);

    if (post) {
        if (subject !== undefined) post.subject = subject;
        if (description !== undefined) post.description = description;
        fs.writeFileSync(POSTS_FILE, JSON.stringify(data, null, 2));
        return post;
    }

    return false;
});