const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    checkFirstRun: () => ipcRenderer.invoke('check-first-run'),
    setPassword: (password) => ipcRenderer.invoke('set-password', password),
    verifyPassword: (password) => ipcRenderer.invoke('verify-password', password),
    getPosts: () => ipcRenderer.invoke('get-posts'),
    savePost: (data) => ipcRenderer.invoke('save-post', data),
    deletePost: (id) => ipcRenderer.invoke('delete-post', id),
    updatePost: (data) => ipcRenderer.invoke('update-post', data)
});