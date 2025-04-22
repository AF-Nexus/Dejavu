const fs = require('fs');
const path = require('path');
const axios = require('axios');

const messagesFile = path.join(__dirname, 'database', 'messages', 'messages.json');

let io;
const users = new Set();
const typingUsers = new Map();

exports.init = (server) => {
  io = require('socket.io')(server);
  
  io.on('connection', (socket) => {
    console.log('A user connected');
    
    socket.on('join', (username) => {
      users.add(username);
      socket.username = username;
      
      // Broadcast join message
      const joinMessage = {
        id: Date.now().toString(),
        type: 'system',
        message: `${username} joined the chat 🥳`,
        username: 'System',
        timestamp: new Date().toISOString()
      };
      
      saveMessage(joinMessage);
      io.emit('message', joinMessage);
      
      // Update online users list
      io.emit('onlineUsers', Array.from(users));
    });
    
    socket.on('message', async (data) => {
      // Add timestamp and ID to message
      const messageData = {
        ...data,
        id: Date.now().toString(),
        timestamp: new Date().toISOString()
      };
      
      if (data.message.startsWith('/niji')) {
        io.emit('message', messageData);
        const prompt = encodeURIComponent(data.message.substring(5).trim());
        try {
          const response = await axios.get(`https://apis-samir.onrender.com/niji?prompt=${prompt}&resolution=1:1`, {
            responseType: 'arraybuffer' 
          });
          
          const imageData = Buffer.from(response.data, 'binary').toString('base64');
          
          const aiResponse = {
            id: Date.now().toString(),
            type: 'image',
            image: imageData,
            username: 'SystemAI',
            timestamp: new Date().toISOString()
          };
          
          saveMessage(aiResponse);
          io.emit('message', aiResponse);
        } catch (error) {
          console.error('Error fetching image from Niji API:', error);
          const errorMsg = {
            id: Date.now().toString(),
            type: 'text',
            message: 'Sorry, an error occurred while processing your request.',
            username: 'SystemAI',
            timestamp: new Date().toISOString()
          };
          saveMessage(errorMsg);
          io.emit('message', errorMsg);
        }
      } else if (data.message.startsWith('/ai')) {
        saveMessage(messageData);
        io.emit('message', messageData);
        
        const query = encodeURIComponent(data.message.substring(4).trim());
        try {
          const response = await axios.get(`https://apis-samir.onrender.com/Gemini?text=${query}`);
          const responseData = response.data;
          const aiResponse = responseData.candidates[0].content.parts[0].text;
          
          const aiMessage = {
            id: Date.now().toString(),
            type: 'text',
            message: aiResponse,
            username: 'SystemAI',
            timestamp: new Date().toISOString()
          };
          
          saveMessage(aiMessage);
          io.emit('message', aiMessage);
        } catch (error) {
          console.error('Error fetching AI response:', error);
          const errorMsg = {
            id: Date.now().toString(),
            type: 'text',
            message: 'Sorry Network error',
            username: 'SystemAI',
            timestamp: new Date().toISOString()
          };
          saveMessage(errorMsg);
          io.emit('message', errorMsg);
        }
      } else {
        // Save and broadcast message
        saveMessage(messageData);
        io.emit('message', messageData);
      }
    });
    
    socket.on('file', (data) => {
      const fileData = {
        ...data,
        id: Date.now().toString(),
        timestamp: new Date().toISOString()
      };
      
      saveMessage(fileData);
      io.emit('file', fileData);
    });
    
    socket.on('typing', (isTyping) => {
      if (isTyping) {
        typingUsers.set(socket.username, true);
      } else {
        typingUsers.delete(socket.username);
      }
      
      // Broadcast typing status to all clients
      io.emit('typingUsers', Array.from(typingUsers.keys()));
    });
    
    socket.on('getOnlineUsers', () => {
      socket.emit('onlineUsers', Array.from(users));
    });
    
    socket.on('disconnect', () => {
      console.log('A user disconnected');
      
      if (socket.username) {
        users.delete(socket.username);
        typingUsers.delete(socket.username);
        
        // Save and broadcast leave message
        const leaveMessage = {
          id: Date.now().toString(),
          type: 'system',
          message: `${socket.username} left the chat 😞`,
          username: 'System',
          timestamp: new Date().toISOString()
        };
        
        saveMessage(leaveMessage);
        io.emit('message', leaveMessage);
        
        // Update online users list
        io.emit('onlineUsers', Array.from(users));
        io.emit('typingUsers', Array.from(typingUsers.keys()));
      }
    });
  });
  
  return io;
};

// Save message to database
function saveMessage(message) {
  try {
    let messages = [];
    
    if (fs.existsSync(messagesFile)) {
      const data = fs.readFileSync(messagesFile);
      messages = JSON.parse(data);
    }
    
    messages.push(message);
    fs.writeFileSync(messagesFile, JSON.stringify(messages, null, 2));
  } catch (error) {
    console.error('Error saving message:', error);
  }
}
