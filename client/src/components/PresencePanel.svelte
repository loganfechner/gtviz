<script>
  import { presence, updateUserView, setUsername } from '../lib/websocket.js';
  import { createEventDispatcher } from 'svelte';

  export let currentRig = null;
  export let currentAgent = null;

  const dispatch = createEventDispatcher();

  let editingUsername = false;
  let newUsername = '';

  $: currentUser = $presence.users.find(u => u.id === $presence.sessionId);
  $: otherUsers = $presence.users.filter(u => u.id !== $presence.sessionId);
  $: userCount = $presence.users.length;

  // Update server when view changes
  $: if (currentRig !== undefined || currentAgent !== undefined) {
    updateUserView({
      rig: currentRig,
      agent: currentAgent?.name || null
    });
  }

  function startEditUsername() {
    newUsername = currentUser?.username || '';
    editingUsername = true;
  }

  function saveUsername() {
    if (newUsername.trim()) {
      setUsername(newUsername.trim());
    }
    editingUsername = false;
  }

  function handleUsernameKeydown(e) {
    if (e.key === 'Enter') {
      saveUsername();
    } else if (e.key === 'Escape') {
      editingUsername = false;
    }
  }

  function formatLastActivity(timestamp) {
    if (!timestamp) return 'Unknown';
    const diff = Date.now() - new Date(timestamp).getTime();
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    return `${Math.floor(diff / 3600000)}h ago`;
  }

  function navigateToUser(user) {
    if (user.currentView?.rig) {
      dispatch('navigate', {
        rig: user.currentView.rig,
        agent: user.currentView.agent
      });
    }
  }
</script>

<div class="presence-panel">
  <div class="panel-header">
    <span class="online-count">
      <span class="dot"></span>
      {userCount} online
    </span>
  </div>

  {#if currentUser}
    <div class="current-user">
      <div class="user-badge" style="--color: {currentUser.color}">
        {#if editingUsername}
          <input
            type="text"
            bind:value={newUsername}
            on:keydown={handleUsernameKeydown}
            on:blur={saveUsername}
            placeholder="Your name"
            class="username-input"
          />
        {:else}
          <span class="username" on:click={startEditUsername} title="Click to edit">
            {currentUser.username}
          </span>
          <span class="you-tag">(you)</span>
        {/if}
      </div>
    </div>
  {/if}

  {#if otherUsers.length > 0}
    <div class="other-users">
      {#each otherUsers as user (user.id)}
        <div
          class="user-item"
          on:click={() => navigateToUser(user)}
          class:clickable={user.currentView?.rig}
        >
          <div class="user-badge" style="--color: {user.color}">
            <span class="username">{user.username}</span>
          </div>
          {#if user.currentView?.rig}
            <div class="viewing">
              <span class="viewing-label">viewing</span>
              <span class="viewing-target">
                {user.currentView.rig}
                {#if user.currentView.agent}
                  / {user.currentView.agent}
                {/if}
              </span>
            </div>
          {/if}
          <div class="activity">{formatLastActivity(user.lastActivity)}</div>
        </div>
      {/each}
    </div>
  {:else}
    <div class="no-others">No other users online</div>
  {/if}
</div>

<style>
  .presence-panel {
    padding: 12px;
    border-bottom: 1px solid #30363d;
  }

  .panel-header {
    display: flex;
    align-items: center;
    margin-bottom: 12px;
  }

  .online-count {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: #8b949e;
    font-weight: 500;
  }

  .dot {
    width: 8px;
    height: 8px;
    background: #3fb950;
    border-radius: 50%;
    animation: pulse 2s infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  .current-user {
    margin-bottom: 12px;
    padding-bottom: 12px;
    border-bottom: 1px solid #21262d;
  }

  .user-badge {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .user-badge::before {
    content: '';
    width: 10px;
    height: 10px;
    background: var(--color);
    border-radius: 50%;
    flex-shrink: 0;
  }

  .username {
    font-size: 13px;
    color: #c9d1d9;
  }

  .current-user .username {
    cursor: pointer;
  }

  .current-user .username:hover {
    text-decoration: underline;
  }

  .username-input {
    background: #21262d;
    border: 1px solid #30363d;
    border-radius: 4px;
    padding: 2px 6px;
    font-size: 13px;
    color: #c9d1d9;
    width: 120px;
  }

  .username-input:focus {
    outline: none;
    border-color: #58a6ff;
  }

  .you-tag {
    font-size: 11px;
    color: #8b949e;
  }

  .other-users {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .user-item {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 8px;
    background: #161b22;
    border-radius: 6px;
    border: 1px solid #21262d;
  }

  .user-item.clickable {
    cursor: pointer;
  }

  .user-item.clickable:hover {
    background: #21262d;
    border-color: #30363d;
  }

  .viewing {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-left: 16px;
  }

  .viewing-label {
    font-size: 11px;
    color: #8b949e;
  }

  .viewing-target {
    font-size: 11px;
    color: #58a6ff;
    font-family: monospace;
  }

  .activity {
    font-size: 10px;
    color: #6e7681;
    margin-left: 16px;
  }

  .no-others {
    font-size: 12px;
    color: #6e7681;
    text-align: center;
    padding: 8px;
  }
</style>
