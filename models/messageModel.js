import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    // Grup mesajları için
    conversation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      default: null,
    },

    // DM mesajları için
    receiver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    type: { type: String, enum: ["text", "image"], default: "text" },
    text: { type: String, trim: true, maxlength: 2000, default: "" },
    imageUrl: { type: String, default: null },

    readAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// ✅ KURAL: Ya receiver olacak (DM) ya conversation olacak (Group)
messageSchema.pre("validate", function (next) {
  const hasReceiver = !!this.receiver;
  const hasConversation = !!this.conversation;

  if (hasReceiver === hasConversation) {
    // ikisi birden dolu veya ikisi birden boş -> hata
    return next(
      new Error("Message must have exactly one of: receiver (DM) or conversation (Group)")
    );
  }

  // text mesaj ise text boş olmasın (isteğe bağlı)
  if (this.type === "text" && !String(this.text || "").trim()) {
    return next(new Error("Text message cannot be empty"));
  }

  // image mesaj ise imageUrl olsun
  if (this.type === "image" && !this.imageUrl) {
    return next(new Error("Image message must have imageUrl"));
  }

  next();
});

messageSchema.index({ sender: 1, receiver: 1, createdAt: -1 });
messageSchema.index({ conversation: 1, createdAt: 1 });

export default mongoose.models.Message || mongoose.model("Message", messageSchema);
