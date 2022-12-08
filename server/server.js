require('dotenv').config();

const mongoose = require('mongoose');
//authentication
const express = require('express');
const app = express();
const cors = require('cors');
const passport = require('passport');
const cookieSession = require('cookie-session');
const passportSetup = require('./passport');
const authRoute = require('./routes/auth');
const Room = require('./models/database');

//express
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const ACTIONS = require('./Actions');

const server = http.createServer(app);
const io = new Server(server);

const jdoodle = require('jdoodle-api');

app.use(
  cookieSession({
    name: 'session',
    keys: ['incsmol'],
    maxAge: 60 * 100, // * a minute maxAge
  })
);

app.use(passport.initialize());

app.use(passport.session());

app.use(
  cors({
    origin: 'http://localhost:3000',
    methods: 'GET,POST,PUT,DELETE',
    credentials: true,
  })
);

app.use('/auth', authRoute);

const userSocketMap = {
  // 'socketId' : 'user'
};

async function createRoom(roomId) {
  console.log(roomId);
  let newRoom;
  const existingRoom = await Room.findById(roomId);
  // console.log(existingRoom);
  if (existingRoom) {
    newRoom = existingRoom;
    // console.log('room found', newRoom);
  } else {
    newRoom = await Room.create({
      _id: roomId,
      code: '',
    });
    // console.log('room created', newRoom.code);
  }
  return newRoom;
}

//function to get all connected clints from that room id
function getAllConnectedClients(roomId) {
  // Map
  return Array.from(io.sockets.adapter.rooms.get(roomId) || []).map(
    (socketId) => {
      return {
        socketId,
        username: userSocketMap[socketId],
      };
    }
  );
}

async function updateRoom(roomId, code) {
  await Room.updateMany({ roomId: { $eq: roomId } }, { $set: { code: code } });
}

io.on('connection', (socket) => {
  console.log('socket connected', socket.id);

  //client is emitting, the server listens
  socket.on(ACTIONS.JOIN, async ({ roomId, username }) => {
    userSocketMap[socket.id] = username;
    socket.join(roomId);
    // ! roomId to database
    const room = await createRoom(roomId);
    const roomCode = room.code;

    //if not the first client, getAllClients
    const clients = getAllConnectedClients(roomId);

    // for each client, notify that another person all that have joined
    clients.forEach(({ socketId }) => {
      io.to(socketId).emit(ACTIONS.JOINED, {
        clients,
        username,
        socketId: socket.id,
        code: roomCode,
      });
    });
  });

  socket.on(ACTIONS.CODE_CHANGE, ({ roomId, code }) => {
    updateRoom(roomId, code);
    socket.in(roomId).emit(ACTIONS.CODE_CHANGE, { code });
  });

  socket.on(ACTIONS.SYNC_CODE, ({ socketId, code }) => {
    io.to(socketId).emit(ACTIONS.CODE_CHANGE, { code });
  });

  socket.on('disconnecting', () => {
    const rooms = [...socket.rooms];
    rooms.forEach((roomId) => {
      socket.in(roomId).emit(ACTIONS.DISCONNECTED, {
        socketId: socket.id,
        username: userSocketMap[socket.id],
      });
    });
    delete userSocketMap[socket.id];
    socket.leave();
  });
});

const PORT = process.env.PORT || 8080;

const mongoConnect = mongoose
  .connect(
    'mongodb+srv://sneha:12345@cluster0.c1fdhzy.mongodb.net/?retryWrites=true&w=majority'
  )
  .then((result) => {
    console.log('Connected to database');
    server.listen(PORT, () => console.log(`Listening on port ${PORT}`));
  });
