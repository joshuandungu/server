// LOAD ENV VARIABLES
require('dotenv').config();

// IMPORT FROM PACKAGES
const cors = require('cors');
const express = require("express");
const mongoose = require("mongoose");
const http = require('http');
const socketIo = require('socket.io');
const Message = require('./models/message');
const ChatRoom = require('./models/chatRoom');

// IMPORT FROM OTHER FILES
const authRouter = require("./routes/auth");
const adminRouter = require("./routes/admin");
const productRouter = require("./routes/product");
const userRouter = require("./routes/user");
const sellerRouter = require("./routes/seller");
const chatRouter = require("./routes/chat.js");
const mpesaRouter = require("./routes/mpesa.js");
const orderRouter = require("./routes/order");

// INIT
const PORT = process.env.PORT || 3000;
const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const DB = process.env.MONGODB_URL;
//console.log('MongoDB URL:', DB);
// middleware
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-auth-token'], // Add x-auth-token
    credentials: true
}));

app.use(express.json());
app.use(authRouter);
app.use('/seller', sellerRouter);
app.use(adminRouter);
app.use(productRouter);
app.use(userRouter);
app.use(orderRouter);
app.use(chatRouter);
app.use(mpesaRouter);


// Connection
if (!DB) {
    console.error("MongoDB URL is not defined. Please check your .env file.");
    process.exit(1);
}
mongoose.connect(DB).then(() => {
    console.log("Connection Mongodb Successful");
}).catch((e) => {
    console.log(e);
    console.log("Failed to connect Mongodb");
});

app.get('/', (req, res) => {
    res.send('Hello from Express!');
});


io.on('connection', (socket) => {
    console.log('a user connected');
    socket.on('joinRoom', (chatRoomId) => {
        socket.join(chatRoomId);
        console.log(`User joined room: ${chatRoomId}`);
    });

    socket.on('sendMessage', async (data) => {
        try {
            const { chatRoomId, senderId, receiverId, text, tempId, imageUrl } = data;

            // 1. Create and save the message
            const newMessage = new Message({
                chatRoomId,
                senderId,
                text,
                imageUrl,
            });
            const savedMessage = await newMessage.save();

            // 2. Update the chat room with the last message
            await ChatRoom.updateOne(
                { _id: chatRoomId },
                {
                    $set: {
                        lastMessage: savedMessage.text,
                        lastMessageAt: new Date(),
                    },
                    // Increment unread count for the receiver
                    $inc: { 'unreadCounts.$[elem].count': 1 }
                },
                {
                    arrayFilters: [{ 'elem.userId': receiverId }]
                }
            );

            // 3. Emit the message to the room so both users receive it
            const messageObject = savedMessage.toObject();
            messageObject.tempId = tempId; // Echo back the tempId

            io.to(chatRoomId).emit('receiveMessage', messageObject);

            // 4. Emit an event to the room to notify clients to update their chat lists
            io.to(chatRoomId).emit('newChatUpdate');

        } catch (e) {
            console.error('Error handling message:', e);
            // Notify the sender of the failure
            socket.emit('sendMessageError', { tempId: data.tempId, error: 'Failed to send message.' });
        }
    });
});
server.listen(PORT, () => {
    console.log(`connected at port ${PORT}`);
});