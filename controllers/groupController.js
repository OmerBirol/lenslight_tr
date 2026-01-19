import mongoose from "mongoose";
import Conversation from "../models/conversationModel.js";
import Message from "../models/messageModel.js";
import User from "../models/userModel.js";
import GroupInvite from "../models/groupInviteModel.js"

const requireUser = (req, res) => {
  const u = req.user || res.locals?.user || null;
  if (!u) return null;
  req.user = u;
  res.locals.user = u;
  return u;
};

// GET /groups  -> benim gruplarım
export const listGroups = async (req, res) => {
  try {
    const me = requireUser(req, res);
    if (!me) return res.redirect("/login");

    const groups = await Conversation.find({
      type: "group",
      members: me._id,
    })
      .sort({ updatedAt: -1 })
      .select("name owner members updatedAt");

    return res.render("groups", { title: "Gruplar", link: "groups", groups });
  } catch (e) {
    console.error(e);
    return res.status(500).send("Gruplar yüklenemedi");
  }
};

// GET /groups/new -> grup oluşturma sayfası
// (Bu sayfada ileride "davet gönder" UI yapacağız)
export const newGroupForm = async (req, res) => {
  try {
    const me = requireUser(req, res);
    if (!me) return res.redirect("/login");

    // beni takip edenler = following listesinde ben olanlar
    const eligibleUsers = await User.find({
        following: me._id,
        _id: { $ne: me._id }, // ✅ ben görünmem
      }).select("username avatar");

    return res.render("group_new", {
      title: "Grup Oluştur",
      link: "groups",
      eligibleUsers,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).send("Sayfa açılamadı");
  }
};

// POST /groups -> grup oluştur
// ✅ Artık sadece owner üye olur. Diğerleri invite ile katılacak.
export const createGroup = async (req, res) => {
    try {
      const me = requireUser(req, res);
      if (!me) return res.redirect("/login");
  
      const name = String(req.body?.name || "").trim();
      if (!name) return res.status(400).send("Grup adı gerekli");
  
      const group = await Conversation.create({
        type: "group",
        name,
        owner: me._id,
        members: [me._id],
      });
  
      return res.redirect(`/groups/${group._id}`);
    } catch (e) {
      console.error(e);
      return res.status(500).send("Grup oluşturulamadı");
    }
  };

// GET /groups/:id -> grup sohbeti
export const getGroupChat = async (req, res) => {
    try {
      const me = requireUser(req, res);
      if (!me) return res.redirect("/login");
  
      const groupId = req.params.id;
      if (!mongoose.Types.ObjectId.isValid(groupId)) return res.status(400).send("Geçersiz id");
  
      const group = await Conversation.findById(groupId).select("name owner members");
      if (!group) return res.status(404).send("Grup bulunamadı");
  
      const isMember = group.members.some((m) => String(m) === String(me._id));
      if (!isMember) return res.status(403).send("Bu gruba erişimin yok");
  
      const messages = await Message.find({ conversation: groupId })
        .sort({ createdAt: 1 })
        .limit(300)
        .populate("sender", "username");
  
      // ✅ Owner ise davet edebileceği kullanıcı listesi (sadece beni takip edenler)
      let eligibleUsers = [];
      if (String(group.owner) === String(me._id)) {
        const owner = await User.findById(me._id).select("followers");
        const followerIds = (owner?.followers || []).map(String);
      
        if (followerIds.length) {
          eligibleUsers = await User.find({
            _id: { $in: followerIds, $ne: me._id },
          }).select("username avatar");
        }
      }
  
      return res.render("group_chat", {
        title: group.name,
        link: "groups",
        group,
        messages,
        me: String(me._id),
        isOwner: String(group.owner) === String(me._id),
        eligibleUsers, // ✅ render'a gönder
      });
    } catch (e) {
      console.error(e);
      return res.status(500).send("Grup açılamadı");
    }
  };

// POST /groups/:id/messages -> grup mesajı gönder (HTTP)
// (Sonra istersen socket ile yenilemesiz yaparız.)
export const sendGroupMessage = async (req, res) => {
  try {
    const me = requireUser(req, res);
    if (!me) return res.redirect("/login");

    const groupId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(groupId)) return res.status(400).send("Geçersiz id");

    const group = await Conversation.findById(groupId).select("members");
    if (!group) return res.status(404).send("Grup yok");

    const isMember = group.members.some((m) => String(m) === String(me._id));
    if (!isMember) return res.status(403).send("Yetkisiz");

    const text = String(req.body?.text || "").trim();
    if (!text) return res.redirect(`/groups/${groupId}`);

    await Message.create({
      conversation: groupId,
      sender: me._id,
      type: "text",
      text,
    });

    return res.redirect(`/groups/${groupId}`);
  } catch (e) {
    console.error(e);
    return res.status(500).send("Mesaj gönderilemedi");
  }
};
