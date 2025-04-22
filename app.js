const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const bodyParser = require('body-parser');
const session = require('express-session');
const multer = require('multer');
const socketIo = require('./socket');

// Initialize Express app
const app = express();
const server = http.createServer(app);

// Create database directories if they don't exist
const dbPath = path.join(__dirname, 'database');
const messagesPath = path.join(dbPath, 'messages');

if (!fs.existsSync(dbPath)) {
  fs.mkdirSync(dbPath);
}
if (!fs.existsSync(messagesPath)) {
  fs.mkdirSync(messagesPath);
}

// Initialize databases if they don't exist
const usersFile = path.join(dbPath, 'users.json');
const messagesFile = path.join(messagesPath, 'messages.json');

if (!fs.existsSync(usersFile)) {
  fs.writeFileSync(usersFile, JSON.stringify([]));
}
if (!fs.existsSync(messagesFile)) {
  fs.writeFileSync(messagesFile, JSON.stringify([]));
}

// Set up file storage for uploads
const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    const uploadPath = path.join(__dirname, 'public', 'uploads');
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: function(req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ storage: storage });

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));

// Session setup
app.use(session({
  secret: 'chatapp-secret-key',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false } // Set to true in production with HTTPS
}));

// Authentication middleware
const isAuthenticated = (req, res, next) => {
  if (req.session.user) {
    return next();
  }
  res.redirect('/login');
};

// Routes
app.get('/', isAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/register', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

// Auth routes
app.post('/api/register', (req, res) => {
  const { username, email, password } = req.body;
  
  if (!username || !email || !password) {
    return res.status(400).json({ message: 'All fields are required' });
  }
  
  // Validate email as Gmail
  if (!email.endsWith('@gmail.com')) {
    return res.status(400).json({ message: 'Only Gmail accounts are allowed' });
  }
  
  try {
    const users = JSON.parse(fs.readFileSync(usersFile));
    
    // Check if user already exists
    if (users.some(user => user.username === username || user.email === email)) {
      return res.status(400).json({ message: 'Username or email already exists' });
    }
    
    // Add user
    users.push({
      id: Date.now().toString(),
      username,
      email,
      password, // In a real app, this should be hashed
      createdAt: new Date().toISOString()
    });
    
    fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
    
    return res.status(201).json({ message: 'User registered successfully' });
  } catch (error) {
    console.error('Registration error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  
  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }
  
  try {
    const users = JSON.parse(fs.readFileSync(usersFile));
    const user = users.find(user => user.email === email && user.password === password);
    
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    
    // Set session
    req.session.user = {
      id: user.id,
      username: user.username,
      email: user.email
    };
    
    return res.status(200).json({
      message: 'Login successful',
      user: {
        id: user.id,
        username: user.username,
        email: user.email
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
});

app.get('/api/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

// Message routes
app.get('/api/messages', isAuthenticated, (req, res) => {
  try {
    const messages = JSON.parse(fs.readFileSync(messagesFile));
    res.status(200).json(messages);
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// File upload route
app.post('/api/upload', isAuthenticated, upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded' });
  }
  
  const fileUrl = `/uploads/${req.file.filename}`;
  const fileType = req.file.mimetype.split('/')[0]; // 'image', 'audio', etc.
  
  try {
    const messages = JSON.parse(fs.readFileSync(messagesFile));
    
    const newMessage = {
      id: Date.now().toString(),
      type: fileType,
      url: fileUrl,
      username: req.session.user.username,
      userId: req.session.user.id,
      timestamp: new Date().toISOString()
    };
    
    messages.push(newMessage);
    fs.writeFileSync(messagesFile, JSON.stringify(messages, null, 2));
    
    res.status(201).json({
      message: 'File uploaded successfully',
      file: newMessage
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get user info
app.get('/api/user', isAuthenticated, (req, res) => {
  res.status(200).json(req.session.user);
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Initialize Socket.io
socketIo.init(server);
