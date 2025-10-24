const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    chatRoomId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ChatRoom',
        required: true,
    },
    senderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    text: {
        type: String,
        required: true,
    },
    imageUrl: {
        type: String,
        required: false,
    },
}, { timestamps: true });

const Message = mongoose.model('Message', messageSchema);
module.exports = Message;