/**
 * Socket.io Real-time Chat Handler
 * Namespaced per-course chat rooms
 */

const jwt = require('jsonwebtoken');
const Message = require('../models/Message');
const User = require('../models/User');

const chatHandler = (io) => {
  // Auth middleware for socket connections
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Authentication required'));

    try {
      const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
      const user = await User.findById(decoded.id).select('name avatar role');
      if (!user) return next(new Error('User not found'));
      socket.user = user;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`🔌 Socket connected: ${socket.user.name} (${socket.id})`);

    // ── Join a course chat room ──────────────────────────────────────────────
    socket.on('join_course', async ({ courseId }) => {
      socket.join(`course:${courseId}`);
      console.log(`${socket.user.name} joined room: course:${courseId}`);

      // Send last 50 messages as history
      try {
        const messages = await Message.find({ course: courseId, isDeleted: false })
          .populate('sender', 'name avatar role')
          .sort('-createdAt')
          .limit(50);

        socket.emit('message_history', messages.reverse());
      } catch (err) {
        console.error('Error fetching message history:', err);
      }
    });

    // ── Leave course room ────────────────────────────────────────────────────
    socket.on('leave_course', ({ courseId }) => {
      socket.leave(`course:${courseId}`);
    });

    // ── Send a message ───────────────────────────────────────────────────────
    socket.on('send_message', async ({ courseId, text, replyTo }) => {
      if (!text?.trim()) return;

      try {
        const message = await Message.create({
          course: courseId,
          sender: socket.user._id,
          text: text.trim(),
          replyTo: replyTo || null,
        });

        const populated = await message.populate('sender', 'name avatar role');
        if (replyTo) await populated.populate('replyTo');

        // Broadcast to everyone in the room (including sender)
        io.to(`course:${courseId}`).emit('new_message', populated);
      } catch (err) {
        socket.emit('error', { message: 'Failed to send message.' });
      }
    });

    // ── Delete message (sender or instructor/admin) ───────────────────────────
    socket.on('delete_message', async ({ messageId, courseId }) => {
      try {
        const message = await Message.findById(messageId);
        if (!message) return;

        const isOwner = message.sender.toString() === socket.user._id.toString();
        const isModerator = ['instructor', 'admin'].includes(socket.user.role);

        if (!isOwner && !isModerator) return;

        message.isDeleted = true;
        await message.save();

        io.to(`course:${courseId}`).emit('message_deleted', { messageId });
      } catch (err) {
        socket.emit('error', { message: 'Failed to delete message.' });
      }
    });

    // ── Typing indicators ────────────────────────────────────────────────────
    socket.on('typing_start', ({ courseId }) => {
      socket.to(`course:${courseId}`).emit('user_typing', {
        userId: socket.user._id,
        name: socket.user.name,
      });
    });

    socket.on('typing_stop', ({ courseId }) => {
      socket.to(`course:${courseId}`).emit('user_stopped_typing', {
        userId: socket.user._id,
      });
    });

    // ── Disconnect ───────────────────────────────────────────────────────────
    socket.on('disconnect', () => {
      console.log(`🔌 Socket disconnected: ${socket.user.name}`);
    });
  });
};

module.exports = chatHandler;
