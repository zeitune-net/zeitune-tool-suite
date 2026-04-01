import { contextBridge, ipcRenderer } from 'electron'

const SEND_CHANNELS = ['window:minimize', 'window:maximize', 'window:close']

const ON_CHANNELS = [
  'window:maximized-changed',
  'dev:service:log',
  'dev:service:status',
  'db:snapshot:progress',
  'db:restore:progress'
]

const INVOKE_CHANNELS = [
  'window:isMaximized',
  // Dialog
  'dialog:openDirectory',
  'dialog:openFile',
  // Profiles
  'profile:list',
  'profile:save',
  'profile:delete',
  'profile:getActive',
  'profile:setActive',
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
  'git:diff',
  'git:showFile',
  'git:fileContent',
  'git:merge',
  'git:mergeAbort',
  'git:resolveConflict',
  'git:stashList',
  'git:stashSave',
  'git:stashPop',
  'git:stashDrop',
  'git:log',
  // Repo config & settings
  'git:repoConfig',
  'git:setConfig',
  'git:unsetConfig',
  'git:addRemote',
  'git:removeRemote',
  'git:setRemoteUrl',
  'git:renameRemote',
  'git:setBranchUpstream',
  'git:unsetBranchUpstream',
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
  'dev:detect',
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
  'dev:process:list',
  'dev:runtime:load',
  'dev:runtime:save',
  // DB Explorer
  'db:profile:list',
  'db:profile:save',
  'db:profile:delete',
  'db:test-connection',
  'db:connect',
  'db:disconnect',
  'db:schemas',
  'db:table-details',
  'db:query',
  'db:history:load',
  'db:history:save',
  'db:export',
  'db:snapshot:list',
  'db:snapshot:get',
  'db:snapshot:delete',
  'db:snapshot:create',
  'db:restore:execute',
  // Schema Diff
  'db:schema-diff',
  // Pipelines
  'db:pipeline:list',
  'db:pipeline:get',
  'db:pipeline:save',
  'db:pipeline:delete',
  // Data Sets
  'db:dataset:list',
  'db:dataset:get',
  'db:dataset:save',
  'db:dataset:delete',
  'db:dataset:check-status',
  // Saved Queries
  'db:saved-query:list',
  'db:saved-query:save',
  'db:saved-query:delete',
  // Row Mutations
  'db:row:update',
  'db:row:insert',
  'db:row:delete',
  // Monitoring
  'db:monitor:stats'
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
