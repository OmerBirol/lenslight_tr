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

import { checkUser } from "./middlewares/authMiddleware.js";

import fileUpload from "express-fileupload";
import { v2 as cloudinary } from "cloudinary";

// ✅ Mesajı socket üzerinden DB'ye kaydetmek için:
import Message from "./models/messageModel.js";

dotenv.config();

cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUD_API_KEY,
  api_secret: process.env.CLOUD_API_SECRET,
});

// connection to the db
conn();

const app = express();
const port = process.env.PORT || 3000;

// ✅ Express yerine HTTP server oluştur (Socket.IO için şart)
const server = http.createServer(app);

// ✅ Socket.IO kurulumu
const io = new Server(server, {
  cors: { origin: true, credentials: true },
});

// Online kullanıcılar: userId -> socketId
const onlineUsers = new Map();

io.on("connection", (socket) => {
  // Kullanıcı kimliğini tanıt
  socket.on("auth", (userId) => {
    if (!userId) return;
    onlineUsers.set(String(userId), socket.id);
  });

  // DM mesaj gönder
  socket.on("dm:send", async ({ toUserId, text, fromUserId }) => {
    try {
      if (!toUserId || !fromUserId || !text) return;

      const clean = String(text).trim();
      if (!clean) return;

      // ✅ DB'ye kaydet
      await Message.create({
        sender: fromUserId,
        receiver: toUserId,
        text: clean,
      });

      // ✅ Alıcı online ise anında ilet
      const toSocketId = onlineUsers.get(String(toUserId));
      if (toSocketId) {
        io.to(toSocketId).emit("dm:new", {
          fromUserId,
          text: clean,
          createdAt: new Date().toISOString(),
        });
      }
    } catch (err) {
      console.error("dm:send error:", err);
    }
  });

  socket.on("disconnect", () => {
    // socket'i map'ten kaldır
    for (const [uid, sid] of onlineUsers.entries()) {
      if (sid === socket.id) onlineUsers.delete(uid);
    }
  });
});

app.set("view engine", "ejs");
app.set("io", io);
app.set("onlineUsers", onlineUsers);
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

// ✅ app.listen yerine server.listen
server.listen(port, () => {
  console.log(`Application running on port: ${port}`);
});
