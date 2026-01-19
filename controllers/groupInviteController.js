import mongoose from "mongoose";
import Conversation from "../models/conversationModel.js";
import GroupInvite from "../models/groupInviteModel.js";
import User from "../models/userModel.js";

const requireUser = (req, res) => {
  const u = req.user || res.locals?.user || null;
  if (!u) return null;
  req.user = u;
  res.locals.user = u;
  return u;
};

// POST /groups/:id/invite  body: { userId }
export const sendInvite = async (req, res) => {
  try {
    const me = requireUser(req, res);
    if (!me) return res.redirect("/login");

    const groupId = req.params.id;
    const userId = req.body.userId;

    if (!mongoose.Types.ObjectId.isValid(groupId) || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).send("Geçersiz id");
    }

    // ✅ kendini davet etme
    if (String(userId) === String(me._id)) {
      return res.redirect(`/groups/${groupId}`);
    }

    const group = await Conversation.findById(groupId).select("owner members name");
    if (!group) return res.status(404).send("Grup yok");

    // ✅ sadece owner davet atabilir
    if (String(group.owner) !== String(me._id)) {
      return res.status(403).send("Yetkisiz");
    }

    // ✅ zaten üyeyse davet yok
    const alreadyMember = group.members.some((m) => String(m) === String(userId));
    if (alreadyMember) return res.redirect(`/groups/${groupId}`);

    // ✅ follow kuralı: davet edilecek kişi owner'ı takip ediyor olmalı
    const owner = await User.findById(me._id).select("followers");
    if (!owner) return res.status(404).send("Owner bulunamadı");
    
    const followsOwner = (owner.followers || []).some(
      (x) => String(x) === String(userId)
    );
    
    if (!followsOwner) {
      return res.status(403).send("Bu kullanıcı seni takip etmiyor (davet gönderemezsin)");
    }

    // ✅ aynı gruba aynı kişiye pending davet var mı?
    const existsPending = await GroupInvite.exists({
      group: groupId,
      to: userId,
      status: "pending",
    });
    if (existsPending) return res.redirect(`/groups/${groupId}`);

    // ✅ pending davet oluştur
    await GroupInvite.create({
      group: groupId,
      from: me._id,
      to: userId,
      status: "pending",
    });

    // Socket ile bildirim (opsiyonel)
    const io = req.app.get("io");
    const onlineUsers = req.app.get("onlineUsers");
    if (io && onlineUsers) {
      const toSocketId = onlineUsers.get(String(userId));
      if (toSocketId) {
        io.to(toSocketId).emit("invite:new", {
          groupId: String(groupId),
          groupName: group.name,
          fromUserId: String(me._id),
        });
      }
    }

    return res.redirect(`/groups/${groupId}`);
  } catch (err) {
    console.error("sendInvite error:", err.message);
    return res.redirect(`/groups/${req.params.id}`);
  }
};

// GET /invites -> benim bekleyen davetlerim
export const myInvites = async (req, res) => {
  try {
    const me = requireUser(req, res);
    if (!me) return res.redirect("/login");

    const invites = await GroupInvite.find({ to: me._id, status: "pending" })
      .sort({ createdAt: -1 })
      .populate("group", "name")
      .populate("from", "username");

    return res.render("invites", { title: "Davetler", link: "groups", invites });
  } catch (err) {
    console.error("myInvites error:", err);
    return res.status(500).send("Davetler yüklenemedi");
  }
};

// POST /invites/:inviteId/accept
export const acceptInvite = async (req, res) => {
  try {
    const me = requireUser(req, res);
    if (!me) return res.redirect("/login");

    const inviteId = req.params.inviteId;
    if (!mongoose.Types.ObjectId.isValid(inviteId)) return res.status(400).send("Geçersiz id");

    const invite = await GroupInvite.findById(inviteId);
    if (!invite) return res.status(404).send("Davet yok");
    if (String(invite.to) !== String(me._id)) return res.status(403).send("Yetkisiz");
    if (invite.status !== "pending") return res.redirect("/invites");

    // ✅ gruba ekle
    await Conversation.updateOne(
      { _id: invite.group },
      { $addToSet: { members: me._id } }
    );

    invite.status = "accepted";
    await invite.save();

    return res.redirect(`/groups/${invite.group}`);
  } catch (err) {
    console.error("acceptInvite error:", err);
    return res.status(500).send("Kabul edilemedi");
  }
};

// POST /invites/:inviteId/decline
export const declineInvite = async (req, res) => {
  try {
    const me = requireUser(req, res);
    if (!me) return res.redirect("/login");

    const inviteId = req.params.inviteId;
    if (!mongoose.Types.ObjectId.isValid(inviteId)) return res.status(400).send("Geçersiz id");

    const invite = await GroupInvite.findById(inviteId);
    if (!invite) return res.status(404).send("Davet yok");
    if (String(invite.to) !== String(me._id)) return res.status(403).send("Yetkisiz");
    if (invite.status !== "pending") return res.redirect("/invites");

    invite.status = "declined";
    await invite.save();

    return res.redirect("/invites");
  } catch (err) {
    console.error("declineInvite error:", err);
    return res.status(500).send("Reddedilemedi");
  }
};
