import express from "express";
import dotenv from "dotenv";
import http from "http";
import { Server } from "socket.io";

import conn from "./db.js";
import cookieParser from "cookie-parser";
import methodOverride from "method-override";

import pageRoute from "./routes/pageRoutes.js";
import photoRoutes from "./routes/photoRoutes.js";
import userRoute from "./routes/userRoute.js";
import messageRoutes from "./routes/messageRoutes.js";
import groupRoutes from "./routes/groupRoutes.js";
import inviteRoutes from "./routes/inviteRoutes.js";

import { checkUser } from "./middlewares/authMiddleware.js";

import fileUpload from "express-fileupload";
import { v2 as cloudinary } from "cloudinary";

// ✅ Socket tarafında DB işlemleri için
import Message from "./models/messageModel.js";
import Conversation from "./models/conversationModel.js";
import User from "./models/userModel.js";

dotenv.config();

cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUD_API_KEY,
  api_secret: process.env.CLOUD_API_SECRET,
});

// DB bağlantısı
conn();

const app = express();
const port = process.env.PORT || 3000;

// ✅ Socket.IO için http server
const server = http.createServer(app);

// ✅ Socket.IO
const io = new Server(server, {
  cors: { origin: true, credentials: true },
  maxHttpBufferSize: 20 * 1024 * 1024, // ✅ 20MB (base64 şişmesi için pay bıraktık)
});


// ✅ online user map: userId -> socketId
const onlineUsers = new Map();

// ✅ express içinden controller'larda kullanabilelim
app.set("io", io);
app.set("onlineUsers", onlineUsers);

io.on("connection", (socket) => {
  // Kullanıcı kimliğini tanıt
  socket.on("auth", (userId) => {
    if (!userId) return;
    onlineUsers.set(String(userId), socket.id);
  });

  // =========================
  // ✅ DM (Özel Mesaj)
  // =========================
  socket.on("dm:send", async ({ toUserId, text, fromUserId }) => {
    try {
      if (!toUserId || !fromUserId || !text) return;

      const clean = String(text).trim();
      if (!clean) return;

      // DB'ye kaydet
      await Message.create({
        sender: fromUserId,
        receiver: toUserId,
        type: "text",
        text: clean,
      });

      // Alıcı online ise anında ilet
      const toSocketId = onlineUsers.get(String(toUserId));
      if (toSocketId) {
        io.to(toSocketId).emit("dm:new", {
          fromUserId,
          text: clean,
          createdAt: new Date().toISOString(),
          type: "text",
        });
      }
    } catch (err) {
      console.error("dm:send error:", err);
    }
  });

  // =========================
  // ✅ GROUP (Grup Mesajları)
  // =========================

  // odaya gir
  socket.on("group:join", ({ groupId }) => {
    if (!groupId) return;
    socket.join(String(groupId));
  });

  // ✅ grup TEXT mesajı gönder (DB + yay)  <-- (SENDE EKSİKTİ, GERİ GELDİ)
  socket.on("group:send", async ({ groupId, fromUserId, text }) => {
    try {
      if (!groupId || !fromUserId || !text) return;

      const clean = String(text).trim();
      if (!clean) return;

      // güvenlik: grup var mı + üye mi?
      const conv = await Conversation.findById(groupId).select("members");
      if (!conv) {
        socket.emit("group:error", { message: "Grup bulunamadı." });
        return;
      }

      const isMember = (conv.members || []).some(
        (m) => String(m) === String(fromUserId)
      );
      if (!isMember) {
        socket.emit("group:error", { message: "Bu gruba mesaj atma yetkin yok." });
        return;
      }

      // mesajı DB'ye kaydet
      const msg = await Message.create({
        conversation: groupId,
        sender: fromUserId,
        type: "text",
        text: clean,
      });

      // sender username
      const senderUser = await User.findById(fromUserId).select("username");

      // odadaki herkese yayınla
      io.to(String(groupId)).emit("group:new", {
        _id: String(msg._id),
        conversation: String(groupId),
        text: msg.text,
        createdAt: msg.createdAt,
        sender: {
          _id: String(fromUserId),
          username: senderUser?.username || "user",
        },
        type: "text",
      });
    } catch (err) {
      console.error("group:send error:", err);
      socket.emit("group:error", { message: "Mesaj gönderilemedi." });
    }
  });

  // ✅ grup FOTO gönder (Cloudinary + DB + yay)
  socket.on("group:sendImage", async ({ groupId, fromUserId, dataUrl }) => {
    try {
      if (!groupId || !fromUserId || !dataUrl) return;

      // sadece image dataUrl kabul et
      if (!String(dataUrl).startsWith("data:image/")) {
        socket.emit("group:error", { message: "Sadece resim dosyası gönderebilirsin." });
        return;
      }

      // ✅ FOTO BOYUT LİMİTİ (10MB)
      const base64Part = String(dataUrl).split(",")[1] || "";
      const approxBytes = Math.ceil((base64Part.length * 3) / 4);
      const MAX = 10 * 1024 * 1024; // 👈 burayı 5/10/20 yapabilirsin

      if (approxBytes > MAX) {
        socket.emit("group:error", { message: "Fotoğraf çok büyük (max 10MB)." });
        return;
      }

      // güvenlik: grup var mı + üye mi?
      const conv = await Conversation.findById(groupId).select("members");
      if (!conv) {
        socket.emit("group:error", { message: "Grup bulunamadı." });
        return;
      }

      const isMember = (conv.members || []).some(
        (m) => String(m) === String(fromUserId)
      );
      if (!isMember) {
        socket.emit("group:error", { message: "Bu gruba foto gönderme yetkin yok." });
        return;
      }

      // Cloudinary upload
      const uploadRes = await cloudinary.uploader.upload(dataUrl, {
        folder: "lenslight/groups",
        resource_type: "image",
      });

      const imageUrl = uploadRes.secure_url;

      // mesajı DB'ye kaydet
      const msg = await Message.create({
        conversation: groupId,
        sender: fromUserId,
        type: "image",
        imageUrl,
        text: "",
      });

      // sender username
      const senderUser = await User.findById(fromUserId).select("username");

      // odadaki herkese yayınla
      io.to(String(groupId)).emit("group:new", {
        _id: String(msg._id),
        conversation: String(groupId),
        createdAt: msg.createdAt,
        sender: {
          _id: String(fromUserId),
          username: senderUser?.username || "user",
        },
        type: "image",
        imageUrl,
        text: "",
      });
    } catch (err) {
      console.error("group:sendImage error:", err);
      socket.emit("group:error", { message: "Foto gönderilemedi." });
    }
  });

  socket.on("disconnect", () => {
    // socket'i map'ten kaldır
    for (const [uid, sid] of onlineUsers.entries()) {
      if (sid === socket.id) onlineUsers.delete(uid);
    }
  });
});


// express ayarları
app.set("view engine", "ejs");

app.use(express.static("public"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(fileUpload({ useTempFiles: true }));

app.use(
  methodOverride("_method", {
    methods: ["POST", "GET"],
  })
);

// routes
app.use(checkUser);
app.use("/", pageRoute);
app.use("/photos", photoRoutes);
app.use("/users", userRoute);
app.use(messageRoutes);
app.use(groupRoutes);
app.use(inviteRoutes);

// ✅ app.listen yerine server.listen
server.listen(port, () => {
  console.log(`Application running on port: ${port}`);
});
