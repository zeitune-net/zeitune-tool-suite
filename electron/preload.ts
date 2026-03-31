import { contextBridge, ipcRenderer } from 'electron'

const SEND_CHANNELS = ['window:minimize', 'window:maximize', 'window:close']

const ON_CHANNELS = [
  'window:maximized-changed',
  'dev:service:log',
  'dev:service:status'
]

const INVOKE_CHANNELS = [
  'window:isMaximized',
  // Dialog
  'dialog:openDirectory',
  // Profiles
  'profile:list',
  'profile:save',
  'profile:delete',
  // Git operations
  'git:scanRepos',
  'git:status',
  'git:branches',
  'git:checkout',
  'git:createBranch',
  'git:deleteBranch',
  'git:fetch',
  'git:pull',
  'git:push',
  'git:stage',
  'git:unstage',
  'git:stageAll',
  'git:discardChanges',
  'git:discardStagedChanges',
  'git:commit',
  'git:merge',
  'git:mergeAbort',
  'git:resolveConflict',
  'git:stashList',
  'git:stashSave',
  'git:stashPop',
  'git:stashDrop',
  'git:log',
  'git:diff',
  'git:fileContent',
  // Shell actions
  'shell:openInTerminal',
  'shell:openInExplorer',
  // Dev Manager
  'dev:profile:list',
  'dev:profile:save',
  'dev:profile:delete',
  'dev:profile:export',
  'dev:profile:import',
  'dev:scan',
  'dev:service:start',
  'dev:service:stop',
  'dev:service:restart',
  'dev:service:build',
  'dev:service:startBatch',
  'dev:service:stopBatch',
  'dev:service:restartBatch',
  'dev:port:check',
  'dev:port:checkBatch',
  'dev:docker:health',
  'dev:service:probe',
  'dev:process:list'
]

contextBridge.exposeInMainWorld('electron', {
  ipcRenderer: {
    send(channel: string, ...args: unknown[]) {
      if (SEND_CHANNELS.includes(channel)) {
        ipcRenderer.send(channel, ...args)
      }
    },
    on(channel: string, func: (...args: unknown[]) => void) {
      if (ON_CHANNELS.includes(channel)) {
        const subscription = (_event: Electron.IpcRendererEvent, ...args: unknown[]) =>
          func(...args)
        ipcRenderer.on(channel, subscription)
        return () => ipcRenderer.removeListener(channel, subscription)
      }
      return () => {}
    },
    invoke(channel: string, ...args: unknown[]) {
      if (INVOKE_CHANNELS.includes(channel)) {
        return ipcRenderer.invoke(channel, ...args)
      }
      return Promise.reject(new Error(`Channel not allowed: ${channel}`))
    }
  },
  platform: process.platform
})
