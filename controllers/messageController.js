import mongoose from "mongoose";
import { v2 as cloudinary } from "cloudinary";
import Message from "../models/messageModel.js";
import User from "../models/userModel.js";

// login kontrol + req.user/res.locals.user garanti
const requireUser = (req, res) => {
  const u = req.user || res.locals?.user || null;
  if (!u) {
    res.redirect("/login");
    return null;
  }
  res.locals.user = u;
  req.user = u;
  return u;
};

// yardımcı: socket ile anlık gönderim (app.js'te app.set("io", io) ve app.set("onlineUsers", onlineUsers) yaparsan çalışır)
const emitRealtime = (req, toUserId, payload) => {
  try {
    const io = req.app.get("io");
    const onlineUsers = req.app.get("onlineUsers");
    if (!io || !onlineUsers) return;

    const toSocketId = onlineUsers.get(String(toUserId));
    if (!toSocketId) return;

    io.to(toSocketId).emit("dm:new", payload);
  } catch (e) {
    // sessiz geç
  }
};

// /messages -> konuşma listesi (SADECE DM)
export const getInbox = async (req, res) => {
  try {
    const user = requireUser(req, res);
    if (!user) return;

    const me = user._id;

    // ✅ SADECE DM MESAJLARI:
    // receiver null olmayanlar + sender/receiver me olanlar
    const last = await Message.find({
      receiver: { $ne: null },
      $or: [{ sender: me }, { receiver: me }],
    })
      .sort({ createdAt: -1 })
      .limit(200)
      .populate("sender", "username")
      .populate("receiver", "username");

    const map = new Map();

    for (const m of last) {
      // güvenlik: populate gelmezse (user silindiyse) skip
      if (!m.sender || !m.receiver) continue;

      const other = String(m.sender._id) === String(me) ? m.receiver : m.sender;
      if (!other || !other._id) continue;

      if (!map.has(String(other._id))) {
        map.set(String(other._id), { other, lastMessage: m });
      }
    }

    return res.render("inbox", {
      title: "Mesajlar",
      link: "messages",
      chats: Array.from(map.values()),
    });
  } catch (err) {
    console.error("getInbox error:", err);
    return res.status(500).send("Inbox yüklenemedi");
  }
};

// /messages/:userId -> sohbet
export const getChat = async (req, res) => {
  try {
    const user = requireUser(req, res);
    if (!user) return;

    const me = user._id;
    const otherId = req.params.userId;

    if (!mongoose.Types.ObjectId.isValid(otherId)) {
      return res.status(400).send("Geçersiz kullanıcı id");
    }
    if (String(me) === String(otherId)) return res.redirect("/messages");

    const otherUser = await User.findById(otherId).select("username");
    if (!otherUser) return res.status(404).send("Kullanıcı bulunamadı");

    const messages = await Message.find({
      receiver: { $ne: null }, // ✅ DM garantisi
      $or: [
        { sender: me, receiver: otherId },
        { sender: otherId, receiver: me },
      ],
    })
      .sort({ createdAt: 1 })
      .limit(300);

    await Message.updateMany(
      { sender: otherId, receiver: me, readAt: null },
      { $set: { readAt: new Date() } }
    );

    return res.render("chat", {
      title: `${otherUser.username} ile sohbet`,
      link: "messages",
      otherUser,
      messages,
      me: String(me),
    });
  } catch (err) {
    console.error("getChat error:", err);
    return res.status(500).send("Sohbet açılamadı");
  }
};

// POST /messages/:userId -> text mesaj (HTTP fallback)
export const sendMessage = async (req, res) => {
  try {
    const user = requireUser(req, res);
    if (!user) return;

    const me = user._id;
    const otherId = req.params.userId;

    if (!mongoose.Types.ObjectId.isValid(otherId)) {
      return res.status(400).send("Geçersiz kullanıcı id");
    }
    if (String(me) === String(otherId)) return res.redirect("/messages");

    const text = (req.body?.text || "").trim();
    if (!text) return res.redirect(`/messages/${otherId}`);

    const exists = await User.exists({ _id: otherId });
    if (!exists) return res.status(404).send("Kullanıcı bulunamadı");

    const msg = await Message.create({
      sender: me,
      receiver: otherId,
      type: "text",
      text,
    });

    // realtime bildir (opsiyonel)
    emitRealtime(req, otherId, {
      fromUserId: String(me),
      type: "text",
      text: msg.text,
      createdAt: msg.createdAt,
    });

    return res.redirect(`/messages/${otherId}`);
  } catch (err) {
    console.error("sendMessage error:", err);
    return res.status(500).send("Mesaj gönderilemedi");
  }
};

// ✅ POST /messages/:userId/image -> foto gönder
export const sendImage = async (req, res) => {
  try {
    const user = requireUser(req, res);
    if (!user) return;

    const me = user._id;
    const otherId = req.params.userId;

    if (!mongoose.Types.ObjectId.isValid(otherId)) {
      return res.status(400).send("Geçersiz kullanıcı id");
    }
    if (String(me) === String(otherId)) return res.redirect("/messages");

    const exists = await User.exists({ _id: otherId });
    if (!exists) return res.status(404).send("Kullanıcı bulunamadı");

    if (!req.files || !req.files.image) {
      return res.status(400).send("Fotoğraf seçilmedi");
    }

    const file = req.files.image;

    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.mimetype)) {
      return res.status(400).send("Sadece JPG/PNG/WEBP yüklenebilir");
    }

    // ✅ Limit (istersen artır)
    const MAX = 10 * 1024 * 1024; // 10MB
    if (file.size > MAX) {
      return res.status(400).send("Maksimum 10MB");
    }

    // Cloudinary upload
    const upload = await cloudinary.uploader.upload(file.tempFilePath, {
      folder: "lenslight/messages",
      resource_type: "image",
    });

    const msg = await Message.create({
      sender: me,
      receiver: otherId,
      type: "image",
      imageUrl: upload.secure_url,
    });

    // realtime bildir (opsiyonel)
    emitRealtime(req, otherId, {
      fromUserId: String(me),
      type: "image",
      imageUrl: msg.imageUrl,
      createdAt: msg.createdAt,
    });

    return res.redirect(`/messages/${otherId}`);
  } catch (err) {
    console.error("sendImage error:", err);
    return res.status(500).send("Fotoğraf gönderilemedi");
  }
};
