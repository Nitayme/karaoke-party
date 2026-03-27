const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// State
let queue = [];
let currentIndex = -1;
let isPlaying = false;

function broadcastState() {
  io.emit('state', { queue, currentIndex, isPlaying });
}

io.on('connection', (socket) => {
  // Send current state to new connection
  socket.emit('state', { queue, currentIndex, isPlaying });

  // Guest adds a song
  socket.on('add_song', (song) => {
    // song: { title, videoId, addedBy }
    queue.push({ ...song, id: Date.now() });
    // If nothing is playing, start from first song
    if (currentIndex === -1) currentIndex = 0;
    broadcastState();
  });

  // DJ controls
  socket.on('play', () => {
    isPlaying = true;
    broadcastState();
  });

  socket.on('pause', () => {
    isPlaying = false;
    broadcastState();
  });

  socket.on('next', () => {
    if (currentIndex < queue.length - 1) {
      currentIndex++;
      isPlaying = true;
    }
    broadcastState();
  });

  socket.on('prev', () => {
    if (currentIndex > 0) {
      currentIndex--;
      isPlaying = true;
    }
    broadcastState();
  });

  socket.on('play_index', (index) => {
    if (index >= 0 && index < queue.length) {
      currentIndex = index;
      isPlaying = true;
    }
    broadcastState();
  });

  socket.on('remove_song', (index) => {
    queue.splice(index, 1);
    if (currentIndex >= queue.length) currentIndex = queue.length - 1;
    broadcastState();
  });

  socket.on('song_ended', () => {
    if (currentIndex < queue.length - 1) {
      currentIndex++;
      isPlaying = true;
    } else {
      isPlaying = false;
    }
    broadcastState();
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Karaoke server running on port ${PORT}`);
});
