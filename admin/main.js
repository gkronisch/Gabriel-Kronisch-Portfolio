const { app, BrowserWindow, ipcMain, dialog } = require('electron');
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

function ensureDirs() {
    const dataDir = path.dirname(POSTS_FILE);
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });
}

function readPosts() {
    if (!fs.existsSync(POSTS_FILE)) return { posts: [] };
    var data = JSON.parse(fs.readFileSync(POSTS_FILE, 'utf8'));
    // Migrate legacy single-image posts
    data.posts.forEach(function(p) {
        if (p.image && !p.images) {
            p.images = [p.image];
            delete p.image;
        }
        if (!p.images) p.images = [];
    });
    return data;
}

function writePosts(data) {
    fs.writeFileSync(POSTS_FILE, JSON.stringify(data, null, 2));
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
        backgroundColor: '#1a202c',
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
    return readPosts();
});

// Open native file picker for images
ipcMain.handle('pick-images', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile', 'multiSelections'],
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'] }]
    });
    if (result.canceled || !result.filePaths.length) return [];

    return result.filePaths.map(function(fp) {
        var fileData = fs.readFileSync(fp);
        return {
            name: Date.now() + '_' + path.basename(fp).replace(/\s+/g, '_'),
            data: fileData.toString('base64')
        };
    });
});

// Create new post (multi-image)
ipcMain.handle('save-post', async (_event, { subject, description, images }) => {
    ensureDirs();

    // images = array of { name, data (base64) }
    images.forEach(function(img) {
        var buf = Buffer.from(img.data, 'base64');
        fs.writeFileSync(path.join(IMAGES_DIR, img.name), buf);
    });

    var data = readPosts();

    var newPost = {
        id: Date.now().toString(),
        subject: subject,
        description: description,
        images: images.map(function(i) { return i.name; }),
        date: new Date().toISOString().split('T')[0]
    };

    data.posts.push(newPost);
    writePosts(data);
    return newPost;
});

// Update post (subject, description, images with add/remove/reorder)
ipcMain.handle('update-post', (_event, { id, subject, description, existingImages, newImages }) => {
    ensureDirs();
    var data = readPosts();
    var post = data.posts.find(function(p) { return p.id === id; });
    if (!post) return false;

    // Save new image files
    if (newImages && newImages.length) {
        newImages.forEach(function(img) {
            var buf = Buffer.from(img.data, 'base64');
            fs.writeFileSync(path.join(IMAGES_DIR, img.name), buf);
        });
    }

    // Determine final image list (existingImages in order + newImages appended)
    var finalImages = (existingImages || []).slice();
    if (newImages && newImages.length) {
        newImages.forEach(function(img) { finalImages.push(img.name); });
    }

    // Delete removed images from disk
    var oldImages = post.images || [];
    oldImages.forEach(function(name) {
        if (finalImages.indexOf(name) === -1) {
            var fp = path.join(IMAGES_DIR, name);
            if (fs.existsSync(fp)) fs.unlinkSync(fp);
        }
    });

    // Update post
    if (subject !== undefined) post.subject = subject;
    if (description !== undefined) post.description = description;
    post.images = finalImages;

    writePosts(data);
    return post;
});

ipcMain.handle('delete-post', (_event, postId) => {
    var data = readPosts();
    var post = data.posts.find(function(p) { return p.id === postId; });

    if (post) {
        (post.images || []).forEach(function(name) {
            var fp = path.join(IMAGES_DIR, name);
            if (fs.existsSync(fp)) fs.unlinkSync(fp);
        });
        data.posts = data.posts.filter(function(p) { return p.id !== postId; });
        writePosts(data);
    }

    return true;
});