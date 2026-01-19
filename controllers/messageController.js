import mongoose from "mongoose";
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

// /messages -> konuşma listesi
export const getInbox = async (req, res) => {
  try {
    const user = requireUser(req, res);
    if (!user) return;

    const me = user._id;

    const last = await Message.find({
      $or: [{ sender: me }, { receiver: me }],
    })
      .sort({ createdAt: -1 })
      .limit(200)
      .populate("sender", "username")
      .populate("receiver", "username");

    const map = new Map();
    for (const m of last) {
      const other = String(m.sender._id) === String(me) ? m.receiver : m.sender;
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

    // kendine mesaj atmayı engelle (opsiyonel ama iyi)
    if (String(me) === String(otherId)) {
      return res.redirect("/messages");
    }

    const otherUser = await User.findById(otherId).select("username");
    if (!otherUser) return res.status(404).send("Kullanıcı bulunamadı");

    const messages = await Message.find({
      $or: [
        { sender: me, receiver: otherId },
        { sender: otherId, receiver: me },
      ],
    })
      .sort({ createdAt: 1 })
      .limit(300);

    // karşıdan gelen okunmamışları okundu yap
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

// POST /messages/:userId -> mesaj gönder
export const sendMessage = async (req, res) => {
  try {
    const user = requireUser(req, res);
    if (!user) return;

    const me = user._id;
    const otherId = req.params.userId;

    if (!mongoose.Types.ObjectId.isValid(otherId)) {
      return res.status(400).send("Geçersiz kullanıcı id");
    }

    if (String(me) === String(otherId)) {
      return res.redirect("/messages");
    }

    const text = (req.body?.text || "").trim();
    if (!text) return res.redirect(`/messages/${otherId}`);

    // alıcı var mı kontrol
    const exists = await User.exists({ _id: otherId });
    if (!exists) return res.status(404).send("Kullanıcı bulunamadı");

    // ✅ asıl istediğin kısım: DB'ye mesajı kaydediyor
    await Message.create({
      sender: me,
      receiver: otherId,
      text,
    });

    return res.redirect(`/messages/${otherId}`);
  } catch (err) {
    console.error("sendMessage error:", err);
    return res.status(500).send("Mesaj gönderilemedi");
  }
};
