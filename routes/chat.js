const express = require('express');
const chatRouter = express.Router();
const auth = require('../middlewares/auth');
const ChatRoom = require('../models/chatRoom');
const Message = require('../models/message');
const User = require('../models/user');

// POST /api/chat/get-or-create
// Body: { receiverId: '...' }
// Finds or creates a chat room between the current user and a receiver (vendor).
chatRouter.post('/api/chat/get-or-create', auth, async (req, res) => {
    try {
        const { receiverId } = req.body;
        const senderId = req.user; // from auth middleware

        if (!receiverId) {
            return res.status(400).json({ msg: 'Receiver ID is required.' });
        }

        // Generate a consistent chat room ID string for querying or creating
        const ids = [senderId, receiverId];
        ids.sort();
        const chatRoomIdString = ids.join('_');

        // Find a chat room using the custom ID string
        let chatRoom = await ChatRoom.findOne({
            chatRoomIdString: chatRoomIdString,
        });

        if (!chatRoom) {
            // If no chat room exists, create a new one
            chatRoom = new ChatRoom({
                chatRoomIdString: chatRoomIdString,
                participants: [senderId, receiverId],
                // Initialize unread counts for both participants
                unreadCounts: [
                    { userId: senderId, count: 0 },
                    { userId: receiverId, count: 0 }
                ]
            });
            await chatRoom.save();
        }

        // Defensive check: If an old chatroom is found without unreadCounts, add it.
        if (!chatRoom.unreadCounts || chatRoom.unreadCounts.length === 0) {
            chatRoom.unreadCounts = [
                { userId: senderId, count: 0 },
                { userId: receiverId, count: 0 }
            ];
            await chatRoom.save();
        }


        // Populate participant details before sending back
        await chatRoom.populate({
            path: 'participants',
            select: 'name shopName type shopAvatar' // select fields you need
        });

        // When a user enters a chat, reset their unread count for that room
        await ChatRoom.updateOne(
            { _id: chatRoom._id, 'unreadCounts.userId': senderId },
            { $set: { 'unreadCounts.$.count': 0 } }
        );

        // Emit an event to update the chat list for the user
        // This helps in updating the UI in real-time when a count is reset.
        // You would listen for this in your chat list screen.
        res.json(chatRoom);

    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/chat/my-chats
// Fetches all chat rooms for the currently logged-in user.
chatRouter.get('/api/chat/my-chats', auth, async (req, res) => {
    try {
        const chatRooms = await ChatRoom.find({
            participants: req.user,
            deletedBy: { $ne: req.user } // Exclude chats deleted by the user
        })
            .populate({
                path: 'participants',
                select: 'name shopName type shopAvatar'
            })
            .sort({ lastMessageAt: -1 }); // Show most recent chats first

        res.json(chatRooms);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/chat/total-unread
// Fetches the total number of unread messages for the current user.
chatRouter.get('/api/chat/total-unread', auth, async (req, res) => {
    try {
        const chatRooms = await ChatRoom.find({
            'unreadCounts.userId': req.user
        });

        let totalUnread = 0;
        chatRooms.forEach(room => {
            const unreadInfo = room.unreadCounts.find(uc => uc.userId.toString() === req.user);
            if (unreadInfo) totalUnread += unreadInfo.count;
        });
        res.json({ totalUnread });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/chat/messages/:chatRoomId
// Fetches all messages for a given chat room.
chatRouter.get('/api/chat/messages/:chatRoomId', auth, async (req, res) => {
    try {
        const messages = await Message.find({ chatRoomId: req.params.chatRoomId })
            .sort({ createdAt: 'asc' }); // Oldest messages first

        res.json(messages);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// DELETE /api/chat/delete/:chatRoomId
// Soft deletes a chat for the current user.
chatRouter.delete('/api/chat/delete/:chatRoomId', auth, async (req, res) => {
    try {
        const { chatRoomId } = req.params;
        const userId = req.user;

        await ChatRoom.findByIdAndUpdate(chatRoomId, {
            $addToSet: { deletedBy: userId } // Use $addToSet to avoid duplicate entries
        });

        res.json({ msg: 'Conversation deleted successfully.' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = chatRouter;