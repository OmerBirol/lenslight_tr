import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    receiver: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    type: { type: String, enum: ["text", "image"], default: "text" },

    text: { type: String, trim: true, maxlength: 2000 },
    imageUrl: { type: String, default: null },

    readAt: { type: Date, default: null },
  },
  { timestamps: true }
);

messageSchema.index({ sender: 1, receiver: 1, createdAt: -1 });

export default mongoose.models.Message || mongoose.model("Message", messageSchema);
