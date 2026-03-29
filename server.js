const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// YouTube Search API endpoint
app.get('/api/search', async (req, res) => {
  const query = req.query.q;
  const apiKey = process.env.YOUTUBE_API_KEY;

  if (!apiKey) return res.status(500).json({ error: 'Missing YouTube API key' });

  try {
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoEmbeddable=true&q=${encodeURIComponent(query + ' karaoke')}&key=${apiKey}&maxResults=8`;
    const response = await fetch(url);
    const data = await response.json();

    if (!data.items) return res.json({ results: [] });

    const results = data.items.map(item => ({
      videoId: item.id.videoId,
      title: item.snippet.title,
      channel: item.snippet.channelTitle,
      thumbnail: item.snippet.thumbnails.medium.url
    }));

    res.json({ results });
  } catch (err) {
    console.error('YouTube search error:', err);
    res.status(500).json({ error: 'Search failed' });
  }
});

// State
let queue = [];
let currentIndex = -1;
let isPlaying = false;

function broadcastState() {
  io.emit('state', { queue, currentIndex, isPlaying });
}

io.on('connection', (socket) => {
  socket.emit('state', { queue, currentIndex, isPlaying });

  socket.on('add_song', (song) => {
    queue.push({ ...song, id: Date.now() });
    if (currentIndex === -1) currentIndex = 0;
    broadcastState();
  });

  socket.on('play', () => { isPlaying = true; broadcastState(); });
  socket.on('pause', () => { isPlaying = false; broadcastState(); });

  socket.on('next', () => {
    if (currentIndex < queue.length - 1) { currentIndex++; isPlaying = true; }
    broadcastState();
  });

  socket.on('prev', () => {
    if (currentIndex > 0) { currentIndex--; isPlaying = true; }
    broadcastState();
  });

  socket.on('play_index', (index) => {
    if (index >= 0 && index < queue.length) { currentIndex = index; isPlaying = true; }
    broadcastState();
  });

  socket.on('remove_song', (index) => {
    queue.splice(index, 1);
    if (currentIndex >= queue.length) currentIndex = queue.length - 1;
    broadcastState();
  });

  socket.on('reorder', ({ from, to }) => {
    // Don't allow moving the currently playing song
    if (from === currentIndex) return;
    const song = queue.splice(from, 1)[0];
    queue.splice(to, 0, song);
    // Fix currentIndex after reorder
    if (from < currentIndex && to >= currentIndex) currentIndex--;
    else if (from > currentIndex && to <= currentIndex) currentIndex++;
    broadcastState();
  });

  socket.on('shuffle', () => {
    // Only shuffle songs after the current one
    if (currentIndex >= queue.length - 1) return;
    const played = queue.slice(0, currentIndex + 1);
    const upcoming = queue.slice(currentIndex + 1);
    for (let i = upcoming.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [upcoming[i], upcoming[j]] = [upcoming[j], upcoming[i]];
    }
    queue = [...played, ...upcoming];
    broadcastState();
  });

  socket.on('song_ended', () => {
    if (currentIndex < queue.length - 1) { currentIndex++; isPlaying = true; }
    else { isPlaying = false; }
    broadcastState();
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Karaoke server running on port ${PORT}`);
});
