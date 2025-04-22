document.addEventListener('DOMContentLoaded', () => {
  const socket = io();
  
  const messagesEl = document.getElementById('messages');
  const messageForm = document.getElementById('message-form');
  const messageInput = document.getElementById('message-input');
  const fileInput = document.getElementById('file-input');
  const usersList = document.getElementById('users-list');
  const typingIndicator = document.getElementById('typing-indicator');
  const typingText = document.getElementById('typing-text');
  const usernameEl = document.getElementById('username');
  
  let currentUser = null;
  let typingTimeout = null;
  
  // Get current user
  async function getCurrentUser() {
    try {
      const response = await fetch('/api/user');
      if (response.ok) {
        currentUser = await response.json();
        usernameEl.textContent = currentUser.username;
        
        // Join the chat
        socket.emit('join', currentUser.username);
        
        // Load messages
        loadMessages();
      } else {
        window.location.href = '/login';
      }
    } catch (error) {
      console.error('Error fetching user:', error);
      window.location.href = '/login';
    }
  }
  
  // Load messages
  async function loadMessages() {
    try {
      const response = await fetch('/api/messages');
      if (response.ok) {
        const messages = await response.json();
        messages.forEach(message => displayMessage(message));
        
        // Scroll to bottom
        scrollToBottom();
      }
    } catch (error) {
      console.error('Error loading messages:', error);
    }
  }
  
  // Display message
  function displayMessage(data) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message');
    
    // Check if it's the current user's message
    if (data.username === currentUser.username) {
      messageDiv.classList.add('own-message');
    } else {
      messageDiv.classList.add('other-message');
    }
    
    // Check if it's a system message
    if (data.type === 'system') {
      messageDiv.classList.add('system-message');
    }
    
    const usernameEl = document.createElement('div');
    usernameEl.classList.add('message-username');
    usernameEl.textContent = data.username;
    
    const timestamp = new Date(data.timestamp).toLocaleTimeString();
    const timeEl = document.createElement('div');
    timeEl.classList.add('message-time');
    timeEl.textContent = timestamp;
    
    const contentEl = document.createElement('div');
    contentEl.classList.add('message-content');
    
    // Handle different content types
    if (data.type === 'image' || (data.url && data.url.match(/\.(jpeg|jpg|gif|png)$/i))) {
      const img = document.createElement('img');
      img.src = data.image ? `data:image/jpeg;base64,${data.image}` : data.url;
      img.alt = 'Image';
      img.classList.add('message-image');
      contentEl.appendChild(img);
    } else if (data.type === 'audio' || (data.url && data.url.match(/\.(mp3|ogg|wav)$/i))) {
      const audio = document.createElement('audio');
      audio.src = data.url;
      audio.controls = true;
      contentEl.appendChild(audio);
    } else if (data.type === 'video' || (data.url && data.url.match(/\.(mp4|webm|ogg)$/i))) {
      const video = document.createElement('video');
      video.src = data.url;
      video.controls = true;
      video.classList.add('message-video');
      contentEl.appendChild(video);
    } else {
      contentEl.textContent = data.message;
    }
    
    const headerEl = document.createElement('div');
    headerEl.classList.add('message-header');
    headerEl.appendChild(usernameEl);
    headerEl.appendChild(timeEl);
    
    messageDiv.appendChild(headerEl);
    messageDiv.appendChild(contentEl);
    
    messagesEl.appendChild(messageDiv);
    scrollToBottom();
  }
  
  // Scroll to bottom of messages
  function scrollToBottom() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }
  
  // Update online users list
  function updateOnlineUsers(users) {
    usersList.innerHTML = '';
    users.forEach(username => {
      const li = document.createElement('li');
      const statusDot = document.createElement('span');
      statusDot.classList.add('status-dot');
      
      const nameSpan = document.createElement('span');
      nameSpan.textContent = username;
      
      li.appendChild(statusDot);
      li.appendChild(nameSpan);
      usersList.appendChild(li);
    });
  }
  
  // Update typing indicator
  function updateTypingIndicator(typingUsers) {
    if (typingUsers.length === 0) {
      typingIndicator.classList.add('hidden');
    } else {
      typingIndicator.classList.remove('hidden');
      
      if (typingUsers.length === 1) {
        typingText.textContent = `${typingUsers[0]} is typing...`;
      } else if (typingUsers.length === 2) {
        typingText.textContent = `${typingUsers[0]} and ${typingUsers[1]} are typing...`;
      } else {
        typingText.textContent = 'Multiple people are typing...';
      }
    }
  }
  
  // Send typing status
  function sendTypingStatus(isTyping) {
    socket.emit('typing', isTyping);
  }
  
  // Handle message submission
  messageForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const messageText = messageInput.value.trim();
    if (messageText) {
      const messageData = {
        message: messageText,
        username: currentUser.username,
        userId: currentUser.id,
        type: 'text'
      };
      
      socket.emit('message', messageData);
      messageInput.value = '';
      
      // Clear typing status
      clearTimeout(typingTimeout);
      sendTypingStatus(false);
    }
  });
  
  // Handle file upload
  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const formData = new FormData();
    formData.append('file', file);
    
    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });
      
      if (response.ok) {
        // File uploaded successfully
        // The socket will handle the message
      } else {
        const error = await response.json();
        alert(error.message || 'Failed to upload file');
      }
    } catch (error) {
      console.error('Upload error:', error);
      alert('An error occurred during upload');
    }
    
    // Clear the input
    fileInput.value = '';
  });
  
  // Handle typing events
  messageInput.addEventListener('input', () => {
    clearTimeout(typingTimeout);
    sendTypingStatus(true);
    
    typingTimeout = setTimeout(() => {
      sendTypingStatus(false);
    }, 2000);
  });
  
  messageInput.addEventListener('blur', () => {
    clearTimeout(typingTimeout);
    sendTypingStatus(false);
  });
  
  // Socket events
  socket.on('message', (data) => {
    displayMessage(data);
  });
  
  socket.on('file', (data) => {
    displayMessage(data);
  });
  
  socket.on('onlineUsers', (users) => {
    updateOnlineUsers(users);
  });
  
  socket.on('typingUsers', (users) => {
    // Filter out current user
    const filteredUsers = users.filter(username => username !== currentUser.username);
    updateTypingIndicator(filteredUsers);
  });
  
  // Get online users on page load
  socket.on('connect', () => {
    socket.emit('getOnlineUsers');
  });
  
  // Initialize
  getCurrentUser();
});
